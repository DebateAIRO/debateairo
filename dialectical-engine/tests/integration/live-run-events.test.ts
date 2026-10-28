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
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const POLL_MS = 25;
const HEARTBEAT_MS = 150;

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => database?.stop());

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
  const application = new PostgresAskApplication(
    database.pool, {} as never, { releaseKey: TEST_RELEASE_KEY, registerVersion: 1 } as never, undefined, database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
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

const REFUSED_LINE = (reason: "SESSION_STREAMS" | "OWNER_STREAMS") => JSON.stringify({
  event: "api.run_events.refused", route: "GET /v1/runs/{id}/events", reason, windowMs: 30_000
});

/**
 * Security fixes run 3 (NV-20): `startApi` with the sessions of several identities, a slower poll (ten concurrent
 * streams stay near 40 mark reads a second), a movable admission clock, a count of the response closes the server has
 * seen, the refusal journal lines, and, when asked, a `readRun` that counts its call and then waits on a gate.
 */
async function startCappedApi(identities: readonly TestHttpIdentity[], gated: { gateReadRun?: boolean } = {}) {
  const { application, calls } = countingApplication();
  let readRunCalls = 0;
  let openGate: () => void = () => {};
  if (gated.gateReadRun === true) {
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    const readRun = application.readRun.bind(application);
    application.readRun = async (...args: Parameters<typeof readRun>) => {
      readRunCalls += 1;
      await gate;
      return readRun(...args);
    };
  }
  const limiter = new AdmissionLimiter(admissionPolicyFromValue(
    ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
  ));
  const decide = vi.spyOn(limiter, "decide");
  let now = Date.now();
  const errors = vi.spyOn(console, "error");
  const api = buildApi({
    application,
    sessions: testSessionApplication(identities),
    allowedOrigin: TEST_APP_ORIGIN,
    admission: limiter,
    admissionClock: () => new Date(now),
    runEventTail: { pollMs: 250, heartbeatMs: 1_000, maxLifeMs: 60_000 }
  });
  let closes = 0;
  api.addHook("onRequest", async (_request, reply) => { reply.raw.on("close", () => { closes += 1; }); });
  const base = await api.listen({ port: 0, host: "127.0.0.1" });
  const controllers: AbortController[] = [];
  const attempt = (identity: TestHttpIdentity, runId: string) => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = fetch(`${base}/v1/runs/${runId}/events`, {
      headers: testSessionHeaders(identity), signal: controller.signal
    });
    return { controller, response };
  };
  return {
    calls,
    attempt,
    /** Opens one stream and waits for its replay; returns the controller that ends it. */
    async open(identity: TestHttpIdentity, runId: string): Promise<AbortController> {
      const { controller, response } = attempt(identity, runId);
      const opened = await response;
      expect(opened.status).toBe(200);
      expect(opened.headers.get("content-type")).toContain("text/event-stream");
      await streamReader(opened).until((text) => text.includes("event: run.running"));
      return controller;
    },
    /** The next open of this identity is refused by the stream cap, with nothing streamed. */
    async expectRefused(identity: TestHttpIdentity, runId: string): Promise<void> {
      const refused = await attempt(identity, runId).response;
      expect(refused.status).toBe(429);
      expect(refused.headers.get("retry-after")).toBe("30");
      expect(refused.headers.get("content-type") ?? "").not.toContain("text/event-stream");
      expect(await refused.json()).toEqual({ error: "RUN_EVENT_STREAMS_LIMITED", message: "RUN_EVENT_STREAMS_LIMITED" });
    },
    /** Retries an open until it answers 200 (each refusal's body is cancelled), then waits for its replay. */
    async openWhenFree(identity: TestHttpIdentity, runId: string): Promise<void> {
      await vi.waitFor(async () => {
        const opened = await attempt(identity, runId).response;
        if (opened.status !== 200) {
          await opened.body?.cancel();
          throw new Error(`still refused: ${opened.status}`);
        }
        await streamReader(opened).until((text) => text.includes("event: run.running"));
      }, { timeout: 5_000, interval: 100 });
    },
    advance(ms: number) { now += ms; },
    openGate: () => openGate(),
    readRunCalls: () => readRunCalls,
    closes: () => closes,
    publicReadCharges: () => decide.mock.calls.filter(([scope]) => scope === "publicReads").length,
    refusals: () => errors.mock.calls.map(([line]) => line)
      .filter((line): line is string => typeof line === "string" && line.includes("\"api.run_events.refused\"")),
    async close(): Promise<void> {
      for (const controller of controllers) controller.abort();
      try {
        await api.close();
      } finally {
        errors.mockRestore();
      }
    }
  };
}

/** A second sign-in session of `owner`'s account: its own session id and tokens, the owner's user and owner ref. */
function sameAccountSession(owner: TestHttpIdentity, label: string): TestHttpIdentity {
  const own = testHttpIdentity(label);
  return Object.freeze({
    ...own,
    authenticated: Object.freeze({
      ...own.authenticated,
      userId: owner.authenticated.userId,
      ownerRef: owner.authenticated.ownerRef,
      session: Object.freeze({ ...own.authenticated.session, asker_id: owner.authenticated.session.asker_id })
    })
  });
}

describe("run-event streams are capped per session and per account (NV-20)", () => {
  it("refuses a fifth stream on one session with 429 before any admission charge, and journals once per window", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "cap-session");
    const capped = await startCappedApi([identity]);
    try {
      for (let index = 0; index < 4; index += 1) await capped.open(identity, runId);
      await capped.expectRefused(identity, runId);
      await capped.expectRefused(identity, runId);
      // The refusals spent none of the address's publicReads budget.
      expect(capped.publicReadCharges()).toBe(4);
      expect(capped.refusals()).toEqual([REFUSED_LINE("SESSION_STREAMS")]);
      capped.advance(31_000);
      await capped.expectRefused(identity, runId);
      expect(capped.refusals()).toEqual([REFUSED_LINE("SESSION_STREAMS"), REFUSED_LINE("SESSION_STREAMS")]);
      expect(capped.publicReadCharges()).toBe(4);
    } finally {
      await capped.close();
    }
  });

  it("a stream whose client left frees its slot", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "cap-free");
    const capped = await startCappedApi([identity]);
    try {
      const streams: AbortController[] = [];
      for (let index = 0; index < 4; index += 1) streams.push(await capped.open(identity, runId));
      await capped.expectRefused(identity, runId);
      streams[0]!.abort();
      await capped.openWhenFree(identity, runId);
    } finally {
      await capped.close();
    }
  });

  it("caps an account at 8 across its sessions, reached from a third session; another account is unaffected", async () => {
    const a = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const b = sameAccountSession(a, `live-run-events-${randomUUID()}`);
    const c = sameAccountSession(a, `live-run-events-${randomUUID()}`);
    const other = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(a, "cap-account");
    const otherRunId = await ownedRunningRun(other, "cap-other");
    const capped = await startCappedApi([a, b, c, other]);
    try {
      const onA: AbortController[] = [];
      for (let index = 0; index < 4; index += 1) onA.push(await capped.open(a, runId));
      for (let index = 0; index < 4; index += 1) await capped.open(b, runId);
      await capped.expectRefused(c, runId);
      expect(capped.refusals()).toEqual([REFUSED_LINE("OWNER_STREAMS")]);
      await capped.open(other, otherRunId);
      onA[0]!.abort();
      await capped.openWhenFree(c, runId);
    } finally {
      await capped.close();
    }
  });

  it("a client that leaves before its stream starts holds no slot and never streams", async () => {
    const identity = testHttpIdentity(`live-run-events-${randomUUID()}`);
    const runId = await ownedRunningRun(identity, "cap-ghost");
    const capped = await startCappedApi([identity], { gateReadRun: true });
    try {
      // An aborted fetch rejects with AbortError: caught as it is created, so it never surfaces unhandled.
      const early = [0, 1, 2, 3].map(() => {
        const { controller, response } = capped.attempt(identity, runId);
        return { controller, settled: response.catch(() => undefined) };
      });
      await vi.waitFor(() => expect(capped.readRunCalls()).toBe(4), { timeout: 5_000, interval: 25 });
      for (const { controller } of early) controller.abort();
      await vi.waitFor(() => expect(capped.closes()).toBeGreaterThanOrEqual(4), { timeout: 5_000, interval: 25 });
      await Promise.all(early.map(({ settled }) => settled));
      const settled = { ...capped.calls };
      capped.openGate();
      await new Promise((resolve) => setTimeout(resolve, 600));
      // No ghost stream replayed or polled once its run read finished.
      expect(capped.calls).toEqual(settled);
      for (let index = 0; index < 4; index += 1) await capped.open(identity, runId);
    } finally {
      await capped.close();
    }
  });
});
