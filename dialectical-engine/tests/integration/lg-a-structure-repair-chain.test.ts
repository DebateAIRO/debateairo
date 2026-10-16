// LG-A final review C-1 and I-1: the whole structure-repair chain on a real database. The REAL WalkingSkeletonRunner,
// composed as apps/runner/src/main.ts composes it on the preview WITH the structure-repair route
// (tests/support/preview-debate-harness.ts, `structureRepair: true`), argues a debate over the two preview gates'
// unix-socket doubles (tests/support/preview-gate-stubs.ts) on a migrated embedded PostgreSQL. One step's first reply is
// broken in a way the code fixer cannot mend (a missing comma: STRUCTURE), the stand-in Haiku sends it back copied word for
// word, and the debate must finish: the fixer -> Haiku's repair -> the stored step -> the terminal facts -> serve.
//
// By design (contract deviation 7) the repaired result keeps the ORIGINAL attempt's artifact, whose ledger row stays FAILED
// (Task 11: one OK row per call), and Haiku's own row is OK under REPAIR:STRUCTURE:<original key>. Every reader that ties a
// step's artifact to an OK row must read that pair as answered (C-1); a FAILED row without such a repair stays refused.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readTerminalRecordedFacts } from "@debateai/battery";
import {
  BoundedReferenceQueue,
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  installCaptureEmitter,
  type CaptureQueueEntry
} from "@debateai/obs-capture";
import { migrate, RunRepository, type Pool } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { STRUCTURE_REPAIR_CONTRACT_HASH, STRUCTURE_REPAIR_CONTRACT_ID } from "@debateai/providers";
import { PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import {
  STUB_EVALUATOR_SATISFIED,
  stubComposition,
  stubJudgement,
  stubReplyLanguage,
  type GateOverride,
  type GateRequest,
  type GateRequestKind
} from "../support/preview-gate-stubs.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterEach(async () => {
  await Promise.all(stubClosers.splice(0).map((close) => close()));
  // As tests/integration/obs-l3-s06-runner-binding.test.ts: the emitter a case installed is replaced by a quiet one.
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({ queue: new BoundedReferenceQueue(1), health, gaps: createCaptureGapCounter({ health }) }));
});

/** Every obs capture the process emits from now on (tests/integration/obs-l3-s06-runner-binding.test.ts's recorder). */
function recordCaptures(): CaptureQueueEntry[] {
  const captured: CaptureQueueEntry[] = [];
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: { offer(entry) { captured.push(entry); return true; } }, health, gaps: createCaptureGapCounter({ health })
  }));
  return captured;
}
afterAll(async () => { await database?.stop(); });

/* ------------------------------------------------------------------ the ledger's readers (direct rows) */

async function bareRun(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does the repair pairing hold?", principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: "asker:test", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1), strangerSampleRate: 0, envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1,
    batteryVersion: "test", askContract: {}, batteryRows: []
  });
}
const STEP_CONTRACT = "c".repeat(64);
const ITEM = "item:lg-a-pairing";
/** One MODEL_CALL row with its own artifact (the repair rows under the repair contract, as the gateway writes them). */
async function call(pool: Pool, runId: string, callSiteKey: string, outcome: "OK" | "FAILED"): Promise<{ artifact: string; entry: string }> {
  const ledger = new LedgerRepository(pool);
  const attemptId = randomUUID();
  const contractHash = callSiteKey.startsWith("REPAIR:STRUCTURE:") ? STRUCTURE_REPAIR_CONTRACT_HASH : STEP_CONTRACT;
  const artifact = await ledger.appendRawArtifact({
    artifactId: randomUUID(), attemptId, runId, providerRef: "provider:lg-a", provider: "openai-compatible-http",
    model: "model:lg-a", maker: "maker:lg-a", modelVersion: "v1", rawText: "{}", metadata: {},
    parseStatus: outcome === "OK" ? "PARSED" : "SCHEMA_FAILED", inputHash: "4".repeat(64), contractHash, contentHash: "6".repeat(64)
  });
  const now = new Date();
  const entry = await ledger.append({
    runId, attemptId, actionKind: "MODEL_CALL", callSiteKey, subjectItemId: ITEM, stanceAtAction: "UNASSIGNED", outcome,
    actorRef: callSiteKey.startsWith("REPAIR:STRUCTURE:") ? "preview:claude-haiku-5-5" : "provider:lg-a",
    inputHash: "7".repeat(64), contractHash, rawArtifactRef: artifact, startedAt: now, finishedAt: now
  });
  return { artifact, entry: entry.ledgerEntryId };
}
const SEAT = "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main";

describe("C-1: the ledger reads a structure-repaired call as answered, and nothing else", () => {
  it("a seat key's FAILED try followed by its OK repair reads OK; an unanswered try, a refused repair and an earlier try stay FAILED", async () => {
    const runId = await bareRun();
    const ledger = new LedgerRepository(database.pool);
    const earlier = await call(database.pool, runId, SEAT, "FAILED");
    const repaired = await call(database.pool, runId, SEAT, "FAILED");
    await call(database.pool, runId, `REPAIR:STRUCTURE:${SEAT}`, "OK");
    const lone = await call(database.pool, runId, "JUDGE:seat:main", "FAILED");
    const refusedRepair = await call(database.pool, runId, "JUDGE:seat:runnerUp", "FAILED");
    await call(database.pool, runId, "REPAIR:STRUCTURE:JUDGE:seat:runnerUp", "FAILED");
    // Another key's repair (the bare JUDGE) answers nothing at JUDGE:seat:main.
    await call(database.pool, runId, "REPAIR:STRUCTURE:JUDGE", "OK");
    const rows = await ledger.readSeatMarkedModelCalls({ runId, workItemId: ITEM, contractHash: STEP_CONTRACT });
    expect(rows.map((row) => [row.artifactRef, row.outcome])).toEqual([
      [earlier.artifact, "FAILED"], [repaired.artifact, "OK"], [lone.artifact, "FAILED"], [refusedRepair.artifact, "FAILED"]
    ]);
    // The repair rows are the repair contract's, never read as a seat key of the step.
    expect(rows.every((row) => !row.callSiteKey.startsWith("REPAIR:"))).toBe(true);
  });

  it("an exhausted site whose last try was repaired is answered; one whose last try was not stays exhausted", async () => {
    const answered = await bareRun();
    await call(database.pool, answered, "COMPOSER:SYNTHESIZER:INITIAL:1", "FAILED");
    const last = await call(database.pool, answered, "COMPOSER:SYNTHESIZER:INITIAL:1", "FAILED");
    await call(database.pool, answered, "REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER:INITIAL:1", "OK");
    const ledger = new LedgerRepository(database.pool);
    expect(await ledger.findExhaustedModelAttempt({ runId: answered, workItemId: ITEM, contractHash: STEP_CONTRACT, maxAttempts: 2 }))
      .toMatchObject({ artifactRef: last.artifact, ledgerEntryRef: last.entry, outcome: "OK" });

    const unanswered = await bareRun();
    await call(database.pool, unanswered, "COMPOSER:SYNTHESIZER:INITIAL:1", "FAILED");
    await call(database.pool, unanswered, "REPAIR:STRUCTURE:COMPOSER:SYNTHESIZER:INITIAL:1", "OK");
    // A later try at the key after the repair: the repair answered the FIRST try, never the last one.
    const after = await call(database.pool, unanswered, "COMPOSER:SYNTHESIZER:INITIAL:1", "FAILED");
    expect(await ledger.findExhaustedModelAttempt({ runId: unanswered, workItemId: ITEM, contractHash: STEP_CONTRACT, maxAttempts: 2 }))
      .toMatchObject({ artifactRef: after.artifact, outcome: "FAILED" });
  });
});

/* ------------------------------------------------------------------ the whole chain (a debate) */

/**
 * The first key's colon doubled (`"segments"::[`): no decode repair mends it and the tolerant reader cannot read it (a
 * missing comma, by contrast, is read as a quote inside a text and refused as CONTENT), so the reply holds no readable
 * JSON and is STRUCTURE (pre-flight PF-A14); every word, number and true/false value is still there to copy.
 */
const breakStructure = (valid: string): string => {
  const broken = valid.replace("\":", "\"::");
  if (broken === valid) throw new Error("test: no key to break");
  return broken;
};
/** The valid reply the stand-in sends for `kind`, as the gate double writes it (stubReplyLanguage for the prose). */
const validReplyFor = (kind: GateRequestKind, chat: string): string => kind === "COMPOSE" ? stubComposition(stubReplyLanguage(chat))
  : kind === "EVALUATOR" ? STUB_EVALUATOR_SATISFIED : stubJudgement("Practice debate point 1.", stubReplyLanguage(chat));

/**
 * The gate override: the FIRST request of `kind` (from DeepInfra when `deepInfraOnly`) is answered broken; Haiku's
 * structure-repair request is answered with that reply's valid form, copied word for word. Every other request gets the
 * contract's valid reply.
 */
function breakFirst(kind: GateRequestKind, deepInfraOnly = false) {
  const seen: { broken: string | null; valid: string | null; repairs: number } = { broken: null, valid: null, repairs: 0 };
  const override = (request: GateRequest, chat: string): GateOverride | null => {
    let contractId: string | null = null;
    try { contractId = readFramedMaterial(wirePacket(chat)).contractId; } catch { contractId = null; }
    if (contractId === STRUCTURE_REPAIR_CONTRACT_ID) {
      seen.repairs += 1;
      if (seen.valid === null) throw new Error("test: a repair asked before any reply was broken");
      return { content: seen.valid };
    }
    if (seen.broken !== null || request.kind !== kind || (deepInfraOnly && request.provider !== "deepinfra")) return null;
    seen.valid = validReplyFor(kind, chat);
    seen.broken = breakStructure(seen.valid);
    return { content: seen.broken };
  };
  return { seen, override };
}

/** The repaired call's two rows: the original's FAILED try (its artifact the step keeps) and Haiku's OK repair. */
async function repairedPair(runId: string) {
  const rows = (await database.pool.query<{
    call_site_key: string; outcome: string; actor_ref: string; raw_artifact_ref: string; model_id: string; maker: string; reply_form: string | null;
    reply_failure_class: string | null;
  }>(
    `SELECT entry.call_site_key, entry.outcome, entry.actor_ref, entry.raw_artifact_ref::text, artifact.model_id, artifact.maker,
            artifact.reply_form, artifact.reply_failure_class
       FROM ledger.ledger_entry AS entry
       JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = entry.raw_artifact_ref
      WHERE entry.run_id=$1 AND entry.action_kind='MODEL_CALL' ORDER BY entry.sequence`, [runId])).rows;
  const repairIndex = rows.findIndex((row) => row.call_site_key.startsWith("REPAIR:STRUCTURE:"));
  expect(repairIndex).toBeGreaterThan(0);
  const repair = rows[repairIndex]!;
  const original = rows.slice(0, repairIndex).findLast((row) => `REPAIR:STRUCTURE:${row.call_site_key}` === repair.call_site_key)!;
  expect(rows.filter((row) => row.call_site_key.startsWith("REPAIR:STRUCTURE:"))).toHaveLength(1);
  return { original, repair };
}

describe("I-1: a structure-repaired step on the preview, end to end (fixer -> Haiku -> stored step -> terminal facts -> serve)", () => {
  it("(a) the answer writer's broken reply is repaired: the answer is stored on the original artifact, composer_calls = 1", async () => {
    const debate = await harness.admittedRun("lg-a-writer", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = breakFirst("COMPOSE");
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true });
    const captured = recordCaptures();
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.broken).not.toBeNull();
    expect(seen.repairs).toBe(1);
    // Final review M-2: the writer's call ended for the repair, not exhausted: nothing is captured as a provider failure.
    expect(captured.filter((entry) => JSON.stringify(entry).includes("PROVIDER_EXHAUSTED"))).toEqual([]);

    const { original, repair } = await repairedPair(debate.runId);
    expect(original.call_site_key).toMatch(/^COMPOSER:SYNTHESIZER:/u);
    expect(original).toMatchObject({ outcome: "FAILED", reply_failure_class: "STRUCTURE" });
    expect(repair).toMatchObject({ outcome: "OK", model_id: "claude-haiku-5-5", reply_form: "STRUCTURE" });
    const rounds = (await database.pool.query<{ candidate_artifact_ref: string; candidate_call_site_key: string }>(
      `SELECT candidate_artifact_ref::text, candidate_call_site_key FROM serve.synthesis_round WHERE run_id=$1 ORDER BY round`,
      [debate.runId])).rows;
    // The round names the ORIGINAL writer's artifact at its own key (deviation 7), never Haiku's.
    expect(rounds[0]).toEqual({ candidate_artifact_ref: original.raw_artifact_ref, candidate_call_site_key: original.call_site_key });
    const { answer } = await harness.servedAnswer(debate, result.answerId);
    expect(answer).not.toBeNull();
    expect((await readTerminalRecordedFacts(database.pool, debate.runId)).ledger.composerCallCount).toBe(1);
  }, 600_000);

  it("(b) the answer checker's broken verdict is repaired: the verdict is stored and the round completes", async () => {
    const debate = await harness.admittedRun("lg-a-checker", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = breakFirst("EVALUATOR");
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true });
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.repairs).toBe(1);

    const { original, repair } = await repairedPair(debate.runId);
    expect(original.call_site_key).toMatch(/^POST_COMPOSE_R9:EVALUATOR:/u);
    expect(original).toMatchObject({ outcome: "FAILED", reply_failure_class: "STRUCTURE" });
    expect(repair).toMatchObject({ outcome: "OK", model_id: "claude-haiku-5-5", reply_form: "STRUCTURE" });
    const rounds = (await database.pool.query<{ evaluator_artifact_ref: string; evaluator_call_site_key: string; evaluator_satisfied: boolean }>(
      `SELECT evaluator_artifact_ref::text, evaluator_call_site_key, evaluator_satisfied FROM serve.synthesis_round WHERE run_id=$1 ORDER BY round`,
      [debate.runId])).rows;
    expect(rounds[0]).toEqual({ evaluator_artifact_ref: original.raw_artifact_ref, evaluator_call_site_key: original.call_site_key,
      evaluator_satisfied: true });
    expect((await harness.servedAnswer(debate, result.answerId)).answer).not.toBeNull();
    expect((await readTerminalRecordedFacts(database.pool, debate.runId)).ledger.postComposeR9CallCount).toBeGreaterThanOrEqual(1);
  }, 600_000);

  it("(c) a judge leg's broken reply is repaired: the original AI stays the node's author, and the debate completes", async () => {
    const debate = await harness.admittedRun("lg-a-judge", { panelRefs: PANEL_REFS, depth: 1 });
    const { seen, override } = breakFirst("JUDGE", true);
    const gates = await harness.startGates({}, undefined, override);
    const composed = await harness.previewRunner(gates, "resend", { structureRepair: true });
    const result = await harness.completedRun(composed, debate, gates);
    expect(seen.repairs).toBe(1);

    const { original, repair } = await repairedPair(debate.runId);
    expect(original.call_site_key).toMatch(/^JUDGE/u);
    expect(original).toMatchObject({ outcome: "FAILED", reply_failure_class: "STRUCTURE" });
    expect(original.model_id).not.toBe("claude-haiku-5-5");
    expect(repair).toMatchObject({ outcome: "OK", model_id: "claude-haiku-5-5", reply_form: "STRUCTURE" });
    // Review Focus 3: the node and its reduced judgement name the original AI's artifact, and the author maker is its maker.
    const authored = (await database.pool.query<{ provenance_ref: string; raw_artifact_ref: string; author_maker: string | null }>(
      `SELECT node.provenance_ref::text, judgement.raw_artifact_ref::text, judgement.disagreement->'panel'->>'authorMaker' AS author_maker
         FROM core.node AS node JOIN ledger.reduced_judgement AS judgement ON judgement.node_id = node.node_id
        WHERE node.run_id=$1 AND node.provenance_ref = $2::uuid`, [debate.runId, original.raw_artifact_ref])).rows;
    expect(authored.length).toBeGreaterThanOrEqual(1);
    for (const row of authored) {
      expect(row.raw_artifact_ref).toBe(original.raw_artifact_ref);
      expect(row.author_maker).toBe(original.maker);
    }
    expect((await database.pool.query(`SELECT 1 FROM core.node WHERE run_id=$1 AND provenance_ref=$2::uuid`,
      [debate.runId, repair.raw_artifact_ref])).rows).toEqual([]);
    expect((await harness.servedAnswer(debate, result.answerId)).answer).not.toBeNull();
  }, 600_000);
});
