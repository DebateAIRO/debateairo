/**
 * Live run events (2026-10-11), on a real (embedded) PostgreSQL through the
 * real `GET /v1/runs/:id/events` route on a real socket: a stream opened
 * mid-run receives the events appended after it opened, in order, without
 * reconnecting; it sends heartbeats while idle; it ends on the terminal
 * event; a client abort stops its polling; and one stream is charged to the
 * `publicReads` admission budget once, however many events it carries; and a
 * process that begins its drain ends the open stream with a clean close at its
 * next poll (side-by-side spec §6, plan C6).
 *
 * Before the fix the route answered a snapshot and ended, and the debate page
 * reconnected about once a second until the budget ran out (design:
 * docs/superpowers/specs/2026-10-11-live-run-events-design.md).
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApi, PostgresAskApplication } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, migrate } from "@debateai/db";
import { ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue } from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { ReleaseWatcher, type ReleaseStateReader } from "../../apps/api/src/release-state.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import {
  TEST_APP_ORIGIN,
  persistLiveSession,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { apiTestPools, provisionRlsLogins, type ApiTestPools } from "../support/rls-logins.js";

const POLL_MS = 25;
const HEARTBEAT_MS = 150;

let database: TestDatabase;
let pools: ApiTestPools | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // R21 (PLAN S5.3): the API's pools are the mode's (the product's logins in API-login mode); seeding stays on the
  // harness superuser.
  pools = await apiTestPools(database, import.meta.url);
});
afterAll(async () => {
  if (database !== undefined && pools !== undefined && pools.runtime !== database.pool) await (await provisionRlsLogins(database)).end();
  await database?.stop();
});

/**
 * The two ask-admission pools main.ts hands PostgresAskApplication. Superuser mode hands one pool in every field, which
 * the constructor refuses in two places, so it gets the harness's two facades over it, as at base.
 */
function askAdmissionPools(api: ApiTestPools): Readonly<{ server: ApiTestPools["runtime"]; legacy: ApiTestPools["runtime"] }> {
  return api.serverAskAdmission === api.runtime
    ? createTestAskAdmissionPoolFacades(api.runtime)
    : Object.freeze({ server: api.serverAskAdmission, legacy: api.legacyAskAdmission });
}

async function ownedRunningRun(identity: TestHttpIdentity, label: string): Promise<string> {
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,$6,'active',now(),now())
  `, [
    identity.authenticated.userId,
    createHash("sha256").update(`live-run-events:${label}:${identity.authenticated.userId}`).digest(),
    "integration-password-not-login-capable",
    `live-run-events-${label}-${identity.authenticated.userId}`,
    randomUUID(), identity.authenticated.ownerRef
  ]);
  // D55: the identity's live session row, so the database accepts the token the session application accepts.
  await persistLiveSession(database.pool, identity);
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: `Does the live stream follow the ${label} debate?`,
    principal: { kind: "legacy", legacyAskerId: `asker:live-run-events:${label}` },
    sessionId: `session:live-run-events:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-10-11T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:live-run-events:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1,
    batteryVersion: "live-run-events-test-layer", batteryRows: []
  });
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, identity.authenticated.ownerRef]);
  // A claimed work item: the run is RUNNING, not settled, so the stream stays open.
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `live-run-events:${runId}:Q1`
  });
  await database.pool.query(
    `UPDATE core.work_item SET state='CLAIMED', claimed_by='worker:live-run-events',
     claim_deadline=clock_timestamp() + interval '1 hour' WHERE work_item_id=$1`,
    [workItemId]
  );
  return runId;
}

async function appendProgress(runId: string, kind: "node.retrying" | "TERMINAL", value: unknown): Promise<string> {
  const inserted = await database.pool.query<{ event_id: string }>(
    `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
     VALUES ($1, ledger.allocate_sequence(), $2, $3::jsonb) RETURNING event_id`,
    [runId, kind, JSON.stringify(value)]
  );
  return inserted.rows[0]!.event_id;
}

function countingApplication() {
  if (pools === undefined) throw new Error("LIVE_RUN_EVENTS_POOLS_UNBUILT");
  const application = new PostgresAskApplication(
    pools.runtime, {} as never, { releaseKey: TEST_RELEASE_KEY, registerVersion: 1 } as never, undefined,
    pools.contentProvision, askAdmissionPools(pools)
  );
  const calls = { snapshot: 0, mark: 0 };
  // The signal the stream hands to each mark read. It aborts when the server sees the client leave.
  const streamSignal: { current: AbortSignal | undefined } = { current: undefined };
  const events = application.events.bind(application);
  application.events = (...args: Parameters<typeof events>) => { calls.snapshot += 1; return events(...args); };
  const mark = application.eventMark.bind(application);
  application.eventMark = (...args: Parameters<typeof mark>) => {
    calls.mark += 1;
    streamSignal.current = args[3];
    return mark(...args);
  };
  return { application, calls, streamSignal };
}

async function startApi(identity: TestHttpIdentity, readiness?: ReleaseWatcher) {
  const { application, calls, streamSignal } = countingApplication();
  const limiter = new AdmissionLimiter(admissionPolicyFromValue(
    ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
  ));
  const decide = vi.spyOn(limiter, "decide");
  const api = buildApi({
    application,
    sessions: testSessionApplication([identity]),
    allowedOrigin: TEST_APP_ORIGIN,
    admission: limiter,
    runEventTail: { pollMs: POLL_MS, heartbeatMs: HEARTBEAT_MS, maxLifeMs: 60_000 },
    ...(readiness === undefined ? {} : { readiness })
  });
  const base = await api.listen({ port: 0, host: "127.0.0.1" });
  const publicReadCharges = () => decide.mock.calls.filter(([scope]) => scope === "publicReads").length;
  return { api, base, calls, streamSignal, publicReadCharges };
}

/** Reads a streaming body chunk by chunk, so a test can wait for what has arrived SO FAR. */
function streamReader(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let done = false;
  let failure: unknown = null;
  let pending: Promise<void> | null = null;
  const pump = () => {
    pending ??= reader.read().then((chunk) => {
      pending = null;
      if (chunk.done) done = true;
      else text += decoder.decode(chunk.value, { stream: true });
    }, (error: unknown) => { pending = null; done = true; failure = error; });
    return pending;
  };
  return {
    get text() { return text; },
    get done() { return done; },
    async until(predicate: (text: string, done: boolean) => boolean, timeoutMs = 10_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (!predicate(text, done)) {
        if (done) throw new Error(`stream ended before the expected content (${String(failure)}); got:\n${text}`);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`timed out waiting on the stream; got:\n${text}`);
        await Promise.race([pump(), new Promise((resolve) => setTimeout(resolve, remaining))]);
      }
    }
  };
}

const heartbeats = (text: string) => text.split(": keep-alive\n\n").length - 1;

describe("live run events: one long-lived stream per page open", () => {
  it("sends events appended after it opened, in order, on the same stream, then ends on the terminal event, charged once", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "follow");
    const { api, base, publicReadCharges } = await startApi(identity);
    try {
      const fetched = vi.fn(fetch);
      const response = await fetched(`${base}/v1/runs/${runId}/events`, { headers: testSessionHeaders(identity) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const stream = streamReader(response);
      // The replay: startRun's stored PHASE row reads as run.running.
      await stream.until((text) => text.includes("event: run.running"));

      const first = await appendProgress(runId, "node.retrying", { attempts_spent: 1 });
      await stream.until((text) => text.includes(`id: ${first}`));
      const second = await appendProgress(runId, "node.retrying", { attempts_spent: 2 });
      const third = await appendProgress(runId, "node.retrying", { attempts_spent: 3 });
      await stream.until((text) => text.includes(`id: ${third}`));
      const terminal = await appendProgress(runId, "TERMINAL", "SERVED");
      await stream.until((_text, done) => done);

      const text = stream.text;
      const order = [first, second, third, terminal].map((id) => text.indexOf(`id: ${id}`));
      expect(order.every((index) => index > text.indexOf("event: run.running"))).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(text).toContain("event: run.terminal");
      for (const id of [first, second, third, terminal]) expect(text.split(`id: ${id}\n`).length - 1).toBe(1);
      expect(fetched).toHaveBeenCalledTimes(1);
      expect(publicReadCharges()).toBe(1);
    } finally {
      await api.close();
    }
  });

  it("sends heartbeats while the run is idle and keeps the stream open", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "idle");
    const { api, base, publicReadCharges } = await startApi(identity);
    const controller = new AbortController();
    try {
      const response = await fetch(`${base}/v1/runs/${runId}/events`, {
        headers: testSessionHeaders(identity), signal: controller.signal
      });
      const stream = streamReader(response);
      await stream.until((text) => heartbeats(text) >= 3);
      expect(stream.done).toBe(false);
      expect(publicReadCharges()).toBe(1);
    } finally {
      controller.abort();
      await api.close();
    }
  });

  it("stops polling the database once the client aborts", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "abort");
    const { api, base, calls, streamSignal } = await startApi(identity);
    try {
      const controller = new AbortController();
      const response = await fetch(`${base}/v1/runs/${runId}/events`, {
        headers: testSessionHeaders(identity), signal: controller.signal
      });
      const stream = streamReader(response);
      await stream.until((text) => heartbeats(text) >= 1);
      await vi.waitFor(() => expect(calls.mark).toBeGreaterThan(1), { timeout: 5_000, interval: POLL_MS });
      controller.abort();
      // The server learns of the abort only when it sees the socket close, a little after the client
      // aborted. Wait until the stream's own signal reports it; from then on no mark or snapshot may start.
      await vi.waitFor(() => expect(streamSignal.current?.aborted).toBe(true), { timeout: 5_000, interval: POLL_MS });
      const settled = { ...calls };
      // Ten poll intervals of silence, measured after the abort was observed: no new mark or snapshot.
      await new Promise((resolve) => setTimeout(resolve, POLL_MS * 10));
      expect(calls).toEqual(settled);
    } finally {
      await api.close();
    }
  });

  it("ends right after the replay for a settled run (the settled page's one-shot read still completes)", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "settled");
    await database.pool.query(
      `UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE run_id=$1`, [runId]
    );
    const { api, base } = await startApi(identity);
    try {
      const response = await fetch(`${base}/v1/runs/${runId}/events`, { headers: testSessionHeaders(identity) });
      const body = await response.text();
      expect(body).toContain("event: run.running");
      expect(heartbeats(body)).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("a drain that begins while the stream is open ends it with a clean close at its next poll", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "drain");
    // The real watcher, never started: no release recorded and not hosted, so it is not draining until beginDrain().
    const reader: ReleaseStateReader = { readCurrent: async () => null, readState: async () => null };
    const watcher = new ReleaseWatcher({ releaseKey: TEST_RELEASE_KEY, hosted: false, reader, log: () => {} });
    const { api, base, calls } = await startApi(identity, watcher);
    try {
      const response = await fetch(`${base}/v1/runs/${runId}/events`, { headers: testSessionHeaders(identity) });
      const stream = streamReader(response);
      await stream.until((text) => text.includes("event: run.running"));
      await vi.waitFor(() => expect(calls.mark).toBeGreaterThan(1), { timeout: 5_000, interval: POLL_MS });
      watcher.beginDrain();
      const marksAtDrain = calls.mark;
      await stream.until((_text, done) => done, 5_000);
      // A clean close: no new event type on the wire, at most the one poll already under way.
      expect(stream.text).not.toContain("event: run.terminal");
      expect([...stream.text.matchAll(/^event: (.+)$/gmu)].map((match) => match[1])).toEqual(["run.running"]);
      expect(calls.mark - marksAtDrain).toBeLessThanOrEqual(1);
    } finally {
      await api.close();
    }
  });
});
