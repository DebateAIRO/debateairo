// Preview retry fix, option B (spec docs/superpowers/specs/2026-10-11-preview-retry-and-opener-rotation-design.md,
// owner rulings R1, R4, R8, R9; plan task 1). On 2026-10-11 the owner's first five-AI preview debate died: DeepInfra
// answered an unbilled 429 to root position 0, the gate turned it into PROVIDER_REFUSED_UNBILLED, the preview policy's
// one 60-second resend went back into the COUNTING gateway, whose ledger count already held that attempt's FAILED row
// against an allowance the preview had lowered to 1, and the resend died as CALL_BUDGET_EXHAUSTED before a byte left.
// The unit tests missed it because they wrapped a bare OpenAICompatibleProviderGateway. This file builds the gateway
// exactly as apps/runner/src/main.ts does (createPostgresProviderGateway over the guarded fetch, then
// withPreviewProviderCallPolicy, with the policy from previewRunnerPolicy over the sealed bounds) on a migrated
// embedded PostgreSQL, so the ledger count, the counting gateway and the runner's own cooldown are all the real ones.
// The gate's refusals come over its real local socket protocol (createPreviewBudgetRpcPort), so the 409 mapping is the
// shipped one too. Integration suites are skipped by the CI gate: run this file by hand before merging.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInitialBatteryRows, WorkItemRepository } from "@debateai/battery";
import { BudgetRepository } from "@debateai/budget";
import { RunRepository, migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import {
  createPreviewBudgetRpcPort,
  createPreviewGuardedFetch,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_TARGET,
  previewRunnerPolicy,
  previewRunResilience,
  previewTargetGatewayControls,
  providerTargetGatewayControls,
  withPreviewProviderCallPolicy,
  type PreviewBudgetPort,
  type PreviewProviderTestConfig,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { createPostgresProviderGateway, withCooldownRetry, type HoldProgressEvent } from "@debateai/runner";
import { DEVELOPMENT_ORGAN_COST_BOUNDS, DEVELOPMENT_RUN_DEATH_POLICY } from "../../apps/runner/src/dev-deployment-register.js";
import { createRunSitOutBook } from "../../apps/runner/src/run-sit-out.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { framedFixturePacket } from "../support/framed-packet.js";

let database: TestDatabase;
const servers: Server[] = [];
const directories: string[] = [];
const batteryRows = createInitialBatteryRows({ settlementWatchHandle: "settlement-watch:preview-unbilled-retry" });

/** Owner ruling 5 (2026-10-10): the preview's wait before its one resend of a call the gate proved unbilled. */
const UNBILLED_RESEND_MS = 60_000;
const MODEL = PREVIEW_GLM_TARGET.model;
const REF = PREVIEW_GLM_TARGET.provider_ref;
const CONTRACT = "contract:preview-unbilled-retry";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-unbilled-retry-fixture"
}))!;
const TARGET = parseProviderDiscoveryTargets(JSON.stringify([PREVIEW_GLM_TARGET]), [{ providerRef: REF, maker: "Z.AI" }])[0]!;
/** The sealed organ bounds (JUDGE 3), seen through the preview's runner policy exactly as main.ts reads them. */
const POLICY = previewRunnerPolicy({
  bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
  synthesisRolePolicy: {
    synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER,
    evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE
  }
}, PREVIEW);
const DEATH = Object.freeze({
  cooldownMs: DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms,
  finalRetryAttempts: DEVELOPMENT_RUN_DEATH_POLICY.final_retry_attempts,
  maxCooldownHoldsPerRun: DEVELOPMENT_RUN_DEATH_POLICY.max_cooldown_holds_per_run
});

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await database?.stop();
});

async function createRunWork(label: string): Promise<{ runId: string; workItemId: string }> {
  const questionLine = `preview-unbilled-retry-${label}-${randomUUID()}`;
  const runId = await new RunRepository(database.pool).startRun({
    questionLine, principal: { kind: "legacy", legacyAskerId: `asker:${questionLine}` },
    sessionId: `session:${questionLine}`, callerScope: "ASKER",
    asOf: new Date("2026-10-11T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker-declaration:${questionLine}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(100, 1, 1),
    registerVersion: 1, batteryVersion: "s00", batteryRows
  });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `runner-test:${questionLine}`
  });
  return { runId, workItemId };
}

/** The real gate RPC port over a unix socket that refuses every call with 409 {"error": code}. */
async function refusingGate(code: string): Promise<PreviewBudgetPort> {
  const directory = await mkdtemp(join(tmpdir(), "pur-"));
  directories.push(directory);
  const socket = join(directory, "gate.sock");
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(409, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: code }));
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(socket, done));
  // The env parser pins the production socket path; this fixture port is built on its own socket.
  return createPreviewBudgetRpcPort({ ...PREVIEW, budget_socket: socket } as PreviewProviderTestConfig);
}

type Step = Readonly<{ refuse: string }> | Readonly<{ throws: () => unknown }> | Readonly<{ answer: string }>;
const unbilled: Step = { refuse: "PROVIDER_REFUSED_UNBILLED" };
const busyGate: Step = { refuse: "CONCURRENCY_LIMIT_REACHED" };
const notReached: Step = { refuse: "PROVIDER_NOT_REACHED" };
const answer: Step = { answer: "{\"statement\":\"Synthetic answer.\"}" };
/** The fetch's own deadline firing: a billed transport failure (TIMED_OUT), never an unbilled refusal. */
const timeout: Step = { throws: () => new DOMException("The operation was aborted due to timeout", "TimeoutError") };

/** A gate port answering each execution from `script`; every execution is one request that reached the gate. */
async function scriptedGate(script: readonly Step[]): Promise<Readonly<{ port: PreviewBudgetPort; sent: string[] }>> {
  const steps = [...script];
  const refusals = new Map<string, PreviewBudgetPort>();
  for (const step of steps) {
    if ("refuse" in step && !refusals.has(step.refuse)) refusals.set(step.refuse, await refusingGate(step.refuse));
  }
  const sent: string[] = [];
  const port: PreviewBudgetPort = { execute: async (input, signal) => {
    sent.push(input.requestBody);
    const step = steps.shift();
    if (step === undefined) throw new Error("test: the gate script is exhausted");
    if ("refuse" in step) return refusals.get(step.refuse)!.execute(input, signal);
    if ("throws" in step) throw step.throws();
    return { status: 200, body: JSON.stringify({
      id: `synthetic-${String(sent.length)}`, model: MODEL,
      choices: [{ message: { content: step.answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    }) };
  } };
  return { port, sent };
}

/** apps/runner/src/main.ts's provider topology factory, for the preview: the same composition, in the same order. */
function previewGateway(port: PreviewBudgetPort, waits: number[]): ProviderGateway {
  const gateway = createPostgresProviderGateway(database.pool, {
    fetchImplementation: createPreviewGuardedFetch(port),
    endpoint: TARGET.baseUrl,
    model: TARGET.model,
    maker: TARGET.maker,
    ...providerTargetGatewayControls(TARGET),
    ...previewTargetGatewayControls(PREVIEW, TARGET)
  });
  return withPreviewProviderCallPolicy(gateway, PREVIEW, TARGET, { sleep: async (milliseconds) => { waits.push(milliseconds); } });
}

function rootRequest(work: Readonly<{ runId: string; workItemId: string }>, maxAttempts: number = POLICY.bounds.JUDGE.maxAttempts): ProviderCallRequest {
  return {
    runId: work.runId, subjectItemId: work.workItemId, callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { ...POLICY.bounds.JUDGE, maxAttempts }, contractHash: CONTRACT, providerRef: REF,
    packet: framedFixturePacket("Synthetic school phone policy; no personal data.")
  };
}

async function outcomes(runId: string): Promise<string[]> {
  return (await database.pool.query<{ outcome: string }>(
    `SELECT outcome FROM ledger.ledger_entry
     WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key = 'JUDGE' ORDER BY sequence`,
    [runId]
  )).rows.map((row) => row.outcome);
}

function billedAttempts(work: Readonly<{ runId: string; workItemId: string }>): Promise<number> {
  return new LedgerRepository(database.pool).countModelAttempts({
    runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, callSiteKey: "JUDGE"
  });
}

/** withCooldownRetry's hold, with the 10-minute wait recorded on the same timeline as the wrapper's resend waits. */
function recordingHold(waits: number[]) {
  const events: HoldProgressEvent[] = [];
  return { events, hold: {
    countCooldownHolds: async () => events.filter((event) => event.state === "COOLDOWN_HOLD").length,
    record: async (event: HoldProgressEvent) => { events.push(event); },
    wait: async (cooldownMs: number) => { waits.push(cooldownMs); }
  } };
}

describe("the preview's unbilled resend through the real counting gateway (owner rulings R1, R4)", () => {
  it("the sealed JUDGE bound reaches the preview's root call unlowered", () => {
    expect(POLICY.bounds.JUDGE.maxAttempts).toBe(DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.maxAttempts);
  });

  it("(a) an unbilled refusal then an answer: the resend is sent and answered, and the refusal is not counted", async () => {
    const work = await createRunWork("a");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([unbilled, answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).resolves.toMatchObject({ model: MODEL });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    expect(waits).toEqual([UNBILLED_RESEND_MS]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "OK"]);
    expect(await billedAttempts(work)).toBe(1);
    expect(await new BudgetRepository(database.pool).countRunModelAttempts(work.runId)).toBe(1);
  });

  it("(e) R4: the gate's own 'too many calls at once' refusal is unbilled too: REFUSED, not counted, one resend", async () => {
    const work = await createRunWork("e");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([busyGate, answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).resolves.toMatchObject({ model: MODEL });
    expect(sent).toHaveLength(2);
    expect(waits).toEqual([UNBILLED_RESEND_MS]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "OK"]);
    expect(await billedAttempts(work)).toBe(1);
  });

  it("never more than one resend inside one call, and one POST per send", async () => {
    const work = await createRunWork("one-resend");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([unbilled, unbilled, answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED" });
    expect(sent).toHaveLength(2);
    expect(waits).toEqual([UNBILLED_RESEND_MS]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "REFUSED"]);
    expect(await billedAttempts(work)).toBe(0);
  });

  it("(b) the runner's cooldown after two free refusals: hold, final retry, and its own resend authors the root", async () => {
    const work = await createRunWork("b");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([unbilled, unbilled, unbilled, answer]);
    const gateway = previewGateway(port, waits);
    const { events, hold } = recordingHold(waits);
    const result = await withCooldownRetry({
      runId: work.runId, callSiteKey: "JUDGE", parentNodeId: null, plannedLegCount: 1,
      baseMaxAttempts: POLICY.bounds.JUDGE.maxAttempts, failureScope: "MAKER_POSITION", policy: DEATH, hold,
      attempt: (maxAttempts) => gateway.call(rootRequest(work, maxAttempts))
    });
    expect(result.kind).toBe("AUTHORED");
    expect(sent).toHaveLength(4);
    expect(waits).toEqual([UNBILLED_RESEND_MS, DEATH.cooldownMs, UNBILLED_RESEND_MS]);
    expect(events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "REFUSED", "REFUSED", "OK"]);
    expect(await billedAttempts(work)).toBe(1);
  });

  it("(c) a billed timeout: the cooldown's final retry is sent and answered (never CALL_BUDGET_EXHAUSTED)", async () => {
    const work = await createRunWork("c");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([timeout, answer]);
    const gateway = previewGateway(port, waits);
    const { events, hold } = recordingHold(waits);
    const result = await withCooldownRetry({
      runId: work.runId, callSiteKey: "JUDGE", parentNodeId: null, plannedLegCount: 1,
      baseMaxAttempts: POLICY.bounds.JUDGE.maxAttempts, failureScope: "MAKER_POSITION", policy: DEATH, hold,
      attempt: (maxAttempts) => gateway.call(rootRequest(work, maxAttempts))
    });
    expect(result.kind).toBe("AUTHORED");
    expect(sent).toHaveLength(2);
    // No free resend after a billed failure: only the runner's own hold.
    expect(waits).toEqual([DEATH.cooldownMs]);
    expect(events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    expect(await outcomes(work.runId)).toEqual(["TIMED_OUT", "OK"]);
    expect(await billedAttempts(work)).toBe(2);
  });

  it("(d) R8: REFUSED rows insert on the migrated database, and four of them never exhaust the site", async () => {
    const work = await createRunWork("d");
    const ledger = new LedgerRepository(database.pool);
    for (let index = 0; index < 4; index += 1) {
      await ledger.append({
        runId: work.runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
        subjectItemId: work.workItemId, stanceAtAction: "UNASSIGNED", outcome: "REFUSED", actorRef: REF,
        inputHash: "input:preview-unbilled-retry", contractHash: CONTRACT, rawArtifactRef: null,
        startedAt: new Date(), finishedAt: new Date()
      });
    }
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "REFUSED", "REFUSED", "REFUSED"]);
    // The re-claim check's threshold: the sealed JUDGE bound plus the one final retry.
    await expect(ledger.findExhaustedModelAttempt({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT,
      maxAttempts: POLICY.bounds.JUDGE.maxAttempts + DEATH.finalRetryAttempts
    })).resolves.toBeNull();
    expect(await billedAttempts(work)).toBe(0);
    expect(await new BudgetRepository(database.pool).countRunModelAttempts(work.runId)).toBe(0);
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).resolves.toMatchObject({ model: MODEL });
    expect(sent).toHaveLength(1);
    expect(await billedAttempts(work)).toBe(1);
  });
});

/**
 * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (b), test T3). On
 * 2026-10-11 the serve fallback walked GLM, MiMo and Qwen at ONE call site, each hop writing one FAILED row under
 * `COMPOSER:SYNTHESIZER:INITIAL:1`; the count was per call-site key, so the fourth maker (whose gate was open) was
 * refused CALL_BUDGET_EXHAUSTED before it sent a byte. On the preview the step's allowance is now each MAKER's: the
 * preview call policy asks for `attemptScope: "actor"`, the counting gateway counts the asking maker's rows only, and
 * the re-claim check groups by maker (`byActor`).
 */
const OTHER_MAKERS = Object.freeze(["preview:deepseek-v4-1-flash", "preview:mimo-v2-6-pro", "preview:qwen-3-8-flash"]);

/** One counted FAILED attempt by `actorRef` at the root site, as a hop of the incident wrote it. */
async function failedRowBy(work: Readonly<{ runId: string; workItemId: string }>, actorRef: string): Promise<void> {
  await new LedgerRepository(database.pool).append({
    runId: work.runId, attemptId: randomUUID(), actionKind: "MODEL_CALL", callSiteKey: "JUDGE",
    subjectItemId: work.workItemId, stanceAtAction: "UNASSIGNED", outcome: "FAILED", actorRef,
    inputHash: "input:preview-run-resilience", contractHash: CONTRACT, rawArtifactRef: null,
    startedAt: new Date(), finishedAt: new Date()
  });
}

describe("run resilience (b): on the preview a step's allowance is each maker's own (T3)", () => {
  it("three FAILED rows by three other makers at one key: a fourth maker still sends, and its count is its own", async () => {
    const work = await createRunWork("t3-send");
    for (const actorRef of OTHER_MAKERS) await failedRowBy(work, actorRef);
    // The site holds the sealed JUDGE bound's worth of counted rows: the incident's state.
    expect(await billedAttempts(work)).toBe(POLICY.bounds.JUDGE.maxAttempts);
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).resolves.toMatchObject({ model: MODEL });
    expect(sent).toHaveLength(1);
    expect(await outcomes(work.runId)).toEqual(["FAILED", "FAILED", "FAILED", "OK"]);
    const ledger = new LedgerRepository(database.pool);
    expect(await ledger.countModelAttempts({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, callSiteKey: "JUDGE", actorRef: REF
    })).toBe(1);
    expect(await ledger.countModelAttempts({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, callSiteKey: "JUDGE", actorRef: OTHER_MAKERS[0]!
    })).toBe(1);
  });

  it("the re-claim check reads per maker: three makers with one FAILED row each never exhaust the site", async () => {
    const work = await createRunWork("t3-reclaim");
    for (const actorRef of OTHER_MAKERS) await failedRowBy(work, actorRef);
    const ledger = new LedgerRepository(database.pool);
    const maxAttempts = POLICY.bounds.JUDGE.maxAttempts;
    await expect(ledger.findExhaustedModelAttempt({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, maxAttempts, byActor: true
    })).resolves.toBeNull();
    // One maker at its own bound is still found, per maker.
    for (let index = 1; index < maxAttempts; index += 1) await failedRowBy(work, OTHER_MAKERS[1]!);
    await expect(ledger.findExhaustedModelAttempt({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, maxAttempts, byActor: true
    })).resolves.toMatchObject({ callSiteKey: "JUDGE", outcome: "FAILED" });
  });

  it("the SENDING maker's own rows at its bound: refused CALL_BUDGET_EXHAUSTED before a byte is sent", async () => {
    // Review 2026-10-12, test gap (d): the per-maker count still bounds the maker that asks. Its own FAILED rows, as
    // many as the sealed JUDGE bound, spend its allowance at this step even though no other maker wrote any.
    const work = await createRunWork("t3-own");
    for (let index = 0; index < POLICY.bounds.JUDGE.maxAttempts; index += 1) await failedRowBy(work, REF);
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([answer]);
    await expect(previewGateway(port, waits).call(rootRequest(work))).rejects.toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
    expect(sent).toHaveLength(0);
    expect(waits).toEqual([]);
    expect(await outcomes(work.runId)).toEqual(["FAILED", "FAILED", "FAILED"]);
  });

  it("T5: without the per-maker read (hosted and local), the same rows exhaust the site exactly as before", async () => {
    const work = await createRunWork("t3-hosted");
    for (const actorRef of OTHER_MAKERS) await failedRowBy(work, actorRef);
    const ledger = new LedgerRepository(database.pool);
    await expect(ledger.findExhaustedModelAttempt({
      runId: work.runId, workItemId: work.workItemId, contractHash: CONTRACT, maxAttempts: POLICY.bounds.JUDGE.maxAttempts
    })).resolves.toMatchObject({ callSiteKey: "JUDGE", outcome: "FAILED" });
    // The counting gateway with no preview policy counts the whole site and refuses before sending.
    let posts = 0;
    const hosted = createPostgresProviderGateway(database.pool, {
      fetchImplementation: async () => { posts += 1; throw new Error("test: nothing may be sent"); },
      endpoint: "http://127.0.0.1:9", model: "test-layer/model", maker: "test-layer", sleepImplementation: async () => undefined
    });
    await expect(hosted.call({ ...rootRequest(work), providerRef: "provider:test-layer" }))
      .rejects.toMatchObject({ code: "CALL_BUDGET_EXHAUSTED" });
    expect(posts).toBe(0);
  });
});

/**
 * Review amendment R-d (orchestrator, 2026-10-12), through the real counting gateway, the real gate protocol and the
 * runner's sit-out book composed as the runner composes it (the book wraps the maker's gateway; `withCooldownRetry`
 * reads the book's `haltsAtOnce`). Only the VENDOR's gate-proven unbilled refusal makes a model sit out; the gate's
 * own — its slots full, the vendor never reached — keep the ten-minute hold and the final retry.
 */
describe("run resilience R-d: only a vendor's unbilled refusal makes a model sit out", () => {
  const RESILIENCE = previewRunResilience(PREVIEW)!;

  it.each([
    ["CONCURRENCY_LIMIT_REACHED", busyGate],
    ["PROVIDER_NOT_REACHED", notReached]
  ] as const)("a call ending in two %s refusals: REFUSED rows, no sit-out, the hold happens and the final retry sends", async (_code, step) => {
    const work = await createRunWork(`rd-${_code}`);
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([step, step, answer]);
    const book = createRunSitOutBook(RESILIENCE);
    const gateway = book.gateway(REF, previewGateway(port, waits));
    const { events, hold } = recordingHold(waits);
    const result = await withCooldownRetry({
      runId: work.runId, callSiteKey: "JUDGE", parentNodeId: null, plannedLegCount: 1,
      baseMaxAttempts: POLICY.bounds.JUDGE.maxAttempts, failureScope: "MAKER_POSITION", policy: DEATH, hold,
      haltsAtOnce: book.haltsAtOnce,
      attempt: (maxAttempts) => gateway.call(rootRequest(work, maxAttempts))
    });
    expect(result.kind).toBe("AUTHORED");
    expect(sent).toHaveLength(3);
    expect(waits).toEqual([UNBILLED_RESEND_MS, DEATH.cooldownMs]);
    expect(events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "REFUSED", "OK"]);
    expect(book.sitsOut(REF)).toBe(false);
    expect(book.reasonOf(REF)).toBeNull();
  });

  it("a call ending in two PROVIDER_REFUSED_UNBILLED refusals: the model sits out at once, no hold, no final retry", async () => {
    const work = await createRunWork("rd-vendor");
    const waits: number[] = [];
    const { port, sent } = await scriptedGate([unbilled, unbilled, answer]);
    const book = createRunSitOutBook(RESILIENCE);
    const gateway = book.gateway(REF, previewGateway(port, waits));
    const { events, hold } = recordingHold(waits);
    const result = await withCooldownRetry({
      runId: work.runId, callSiteKey: "JUDGE", parentNodeId: null, plannedLegCount: 1,
      baseMaxAttempts: POLICY.bounds.JUDGE.maxAttempts, failureScope: "MAKER_POSITION", policy: DEATH, hold,
      haltsAtOnce: book.haltsAtOnce,
      attempt: (maxAttempts) => gateway.call(rootRequest(work, maxAttempts))
    });
    expect(result.kind).toBe("HALTED");
    expect(sent).toHaveLength(2);
    expect(waits).toEqual([UNBILLED_RESEND_MS]);
    expect(events.map((event) => event.state)).toEqual(["MAKER_POSITION_HALTED"]);
    expect(await outcomes(work.runId)).toEqual(["REFUSED", "REFUSED"]);
    expect(book.sitsOut(REF)).toBe(true);
    expect(book.reasonOf(REF)).toBe("PROVIDER_BUSY");
  });
});

describe("R9: hosted and local wiring (no preview config) are unchanged", () => {
  it("(f) maxAttempts 3 and three transport failures: three POSTs inside one call, three counted FAILED rows", async () => {
    const work = await createRunWork("f");
    let posts = 0;
    const vendor = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        posts += 1;
        response.writeHead(503, { "content-type": "application/json" });
        response.end("{\"error\":\"unavailable\"}");
      });
    });
    servers.push(vendor);
    await new Promise<void>((done) => vendor.listen(0, "127.0.0.1", done));
    const address = vendor.address();
    if (address === null || typeof address === "string") throw new Error("test: the vendor double has no port");
    const hosted = createPostgresProviderGateway(database.pool, {
      endpoint: `http://127.0.0.1:${String(address.port)}`, model: "test-layer/model", maker: "test-layer",
      sleepImplementation: async () => undefined
    });
    await expect(hosted.call({
      ...rootRequest(work), providerRef: "provider:test-layer",
      bound: { ...DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE, deadlineMs: 5_000 }
    })).rejects.toMatchObject({ code: "PROVIDER_CALL_FAILED", attempts: 3 });
    expect(posts).toBe(3);
    expect(await outcomes(work.runId)).toEqual(["FAILED", "FAILED", "FAILED"]);
    expect(await billedAttempts(work)).toBe(3);
  });
});
