import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError
} from "@debateai/providers";
import {
  projectJudgedStanding,
  remainingProviderAttempts,
  reservingHoldRecorder,
  withCooldownRetry,
  type HoldProgressEvent,
  type HoldRecorder
} from "@debateai/runner";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { CONDITION_MARKS } from "@debateai/kernel";
import { isLowStrengthNode } from "../../apps/ui/lib/debateTreeUtils.js";
import {
  debateDetailFromAnswer,
  hiddenNodeScoreThresholdFromDeployment
} from "../../apps/ui/lib/v3/adapter.js";

const policy = Object.freeze({
  cooldownMs: 600_000,
  finalRetryAttempts: 1,
  maxCooldownHoldsPerRun: 2
});

const transportFailure = () => new ProviderCallFailedError(
  new Error("test-layer transport down"),
  3,
  "FAILED",
  "ledger:test:3"
);

function recorder(holds: number) {
  const events: HoldProgressEvent[] = [];
  return {
    events,
    countCooldownHolds: vi.fn(async () => holds),
    record: vi.fn(async (event: HoldProgressEvent) => { events.push(event); }),
    wait: vi.fn(async () => undefined)
  };
}

describe("RESIL-01 / DR-174 lifecycle mutation ledger", () => {
  it("RESIL-01 rev2 H1/H2/H7 pins both maker roots to the cooldown seam and the effective preflight bound", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toMatch(/const primaryAttempt = await cooldownAttempt\(\{\s*callSiteKey: FIRST_POSITION_CALL_SITE_KEY,[\s\S]*?failureScope: "MAKER_POSITION"/);
    expect(source).toContain('export const FIRST_POSITION_CALL_SITE_KEY = "JUDGE" as const;');
    // V-28 (task 11) changed the DECLARATION, not the routing: the secondary
    // root is authored inside a try/catch that turns a spend refusal into a
    // clean stop instead of discarding an already-minted root 0. Parallel calls
    // (Task 10, 2026-10-12) changed it again: every root after the first is one
    // chain (`rootChain`), all started together, so the secondary root is root
    // index 1 of that chain rather than a statement of its own. What this row is
    // about — that the secondary root goes through the leg's author call
    // (`authorAndPanel`), and so through the cooldown seam, under that call-site
    // key with a null parent — is unchanged and is still pinned. Task 11: the
    // chain is told the root's statement as soon as its author call returned
    // (its replies start from it), and the roots' chains are started together
    // with the replies' and cross-exchanges' (`chains`).
    expect(source).toMatch(/const rootCallSiteKey = \(rootIndex: number\): string =>\s*rootIndex === 1 \? "JUDGE:root:secondary" : `JUDGE:root:\$\{String\(rootIndex\)\}`;/);
    expect(source).toMatch(/const ROOT_SAVE: Omit<SaveInput, "authorIndex"> = Object\.freeze\(\{\s*parentNodeId: null,/);
    expect(source).toMatch(/const input: AuthorPositionInput = \{[\s\S]*?callSiteKey: rootCallSiteKey\(rootIndex\),[\s\S]*?\.\.\.ROOT_SAVE,[\s\S]*?authoredRoot = await authorAndPanel\(input, \(statement, maker\) => \{\s*answeredMakers\[rootIndex\] = maker;\s*statements\[rootIndex\]!\.resolve\(statement\);\s*\}\);/);
    // Debate shape (plan Task 13): one chain per ROOT — the shape's P, or today's one per maker (`rootCount`).
    expect(source).toMatch(/for \(let rootIndex = 1; rootIndex < rootCount; rootIndex \+= 1\) \{\s*chains\.push\(runChain\(\(stage\) => rootChain\(rootIndex, stage\)/);
    expect(source).toMatch(/const childAttempt = await cooldownAttempt\(\{[\s\S]*?failureScope: input\.parentNodeId === null \? "MAKER_POSITION" : "EXPANSION"/);
    expect(source).toContain("maxAttempts: settings.judgeBound.maxAttempts + (settings.runDeathPolicy?.finalRetryAttempts ?? 0)");
  });

  it("T10 computes exactly one wrapper attempt after three consumed attempts", () => {
    expect(remainingProviderAttempts(4, 3)).toBe(1);
    expect(remainingProviderAttempts(3, 3)).toBe(0);
  });

  it("T13 schema exhaustion never enters the cooldown path", async () => {
    const hold = recorder(0);
    const schemaFailure = new ProviderContentUnacceptedError(3, "SCHEMA_FAILED", "bad schema", "artifact:3", "ledger:3");
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:test",
      parentNodeId: "node:parent",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      failureScope: "REVIEW",
      policy,
      hold,
      attempt: async () => { throw schemaFailure; }
    })).rejects.toBe(schemaFailure);
    expect(hold.countCooldownHolds).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("T25/T26 recovers the per-run cap while preserving the final attempt without a third wait", async () => {
    const hold = recorder(2);
    const attempt = vi.fn(async () => { throw transportFailure(); });
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:third-site",
      parentNodeId: "node:parent",
      plannedLegCount: 3,
      baseMaxAttempts: 3,
      failureScope: "EXPANSION",
      policy,
      hold,
      attempt
    })).resolves.toMatchObject({ kind: "HALTED", record: { callSiteKey: "JUDGE:third-site" } });
    expect(hold.countCooldownHolds).toHaveBeenCalledWith("run:test");
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt.mock.calls).toEqual([[3], [4]]);
    expect(hold.wait).not.toHaveBeenCalled();
  });

  it("T25 holds 1 and 2 record, wait, and issue exactly one final same-key retry", async () => {
    const hold = recorder(1);
    const attempt = vi.fn()
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValueOnce("authored");
    await expect(withCooldownRetry({
      runId: "run:test",
      callSiteKey: "JUDGE:same-key",
      parentNodeId: "node:parent",
      plannedLegCount: 1,
      baseMaxAttempts: 3,
      failureScope: "EXPANSION",
      policy,
      hold,
      attempt
    })).resolves.toEqual({ kind: "AUTHORED", value: "authored" });
    expect(attempt.mock.calls).toEqual([[3], [4]]);
    expect(hold.wait).toHaveBeenCalledOnce();
    expect(hold.wait).toHaveBeenCalledWith(600_000);
    expect(hold.events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
    expect(hold.events.every((event) => event.callSiteKey === "JUDGE:same-key")).toBe(true);
  });
});

/**
 * Parallel AI calls (spec 2026-10-12 §2.3), Task 8 — THE RUN-WIDE HOLD CAP UNDER CONCURRENT FAILURES. Today the cap
 * reads the run's recorded holds and then holds: two sites failing together both read the same count and both hold.
 * The runner's recorder now reserves a hold in memory before it reads the count, and releases the reservation once
 * the hold's COOLDOWN_HOLD record has committed (or on refusal), so concurrent failures cannot pass the cap.
 */
describe("Parallel calls · the hold cap counts holds being started in this process", () => {
  const cooldownSite = (hold: HoldRecorder, callSiteKey: string, attempt = vi.fn(async (): Promise<string> => {
    throw transportFailure();
  })) => withCooldownRetry({
    runId: "run:test",
    callSiteKey,
    parentNodeId: "node:parent",
    plannedLegCount: 1,
    baseMaxAttempts: 3,
    failureScope: "EXPANSION",
    policy,
    hold,
    attempt
  });

  /** A recorder whose count answers only when told, so two failures can read it at the same time. */
  function gatedRecorder(recorded: number) {
    const events: HoldProgressEvent[] = [];
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const base = {
      countCooldownHolds: vi.fn(async () => { await gate; return recorded + events.filter((event) => event.state === "COOLDOWN_HOLD").length; }),
      record: vi.fn(async (event: HoldProgressEvent) => { events.push(event); }),
      wait: vi.fn(async () => undefined)
    };
    return { base, events, open: () => open() };
  }

  it("uses the recorder's reservation instead of reading and comparing the count", async () => {
    const hold = {
      ...recorder(0),
      reserveHold: vi.fn(async () => false)
    };
    const attempt = vi.fn(async (): Promise<string> => { throw transportFailure(); });
    await expect(cooldownSite(hold, "JUDGE:reserved", attempt)).resolves.toMatchObject({ kind: "HALTED" });
    expect(hold.reserveHold).toHaveBeenCalledWith("run:test", 2);
    expect(hold.countCooldownHolds).not.toHaveBeenCalled();
    expect(hold.wait).not.toHaveBeenCalled();
    // The refused hold still keeps the site's final attempt.
    expect(attempt.mock.calls).toEqual([[3], [4]]);
  });

  it("holds when the reservation admits it, exactly as the count did", async () => {
    const hold = { ...recorder(0), reserveHold: vi.fn(async () => true) };
    const attempt = vi.fn()
      .mockRejectedValueOnce(transportFailure())
      .mockResolvedValueOnce("authored");
    await expect(cooldownSite(hold, "JUDGE:admitted", attempt)).resolves.toEqual({ kind: "AUTHORED", value: "authored" });
    expect(hold.wait).toHaveBeenCalledOnce();
    expect(hold.events.map((event) => event.state)).toEqual(["COOLDOWN_HOLD", "COOLDOWN_RETRY"]);
  });

  it("lets only one of two sites failing together take the run's last hold", async () => {
    const gated = gatedRecorder(1);
    const hold = reservingHoldRecorder(gated.base);
    const first = cooldownSite(hold, "JUDGE:site-a");
    const second = cooldownSite(hold, "JUDGE:site-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    gated.open();
    await Promise.all([first, second]);
    expect(gated.events.filter((event) => event.state === "COOLDOWN_HOLD")).toHaveLength(1);
    expect(gated.base.wait).toHaveBeenCalledOnce();
  });

  it("without the reservation, the same two failures would both have held (the race it closes)", async () => {
    const gated = gatedRecorder(1);
    const first = cooldownSite(gated.base, "JUDGE:site-a");
    const second = cooldownSite(gated.base, "JUDGE:site-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    gated.open();
    await Promise.all([first, second]);
    expect(gated.events.filter((event) => event.state === "COOLDOWN_HOLD")).toHaveLength(2);
  });

  it("admits iff recorded + reserved <= cap, and releases on refusal", async () => {
    const hold = reservingHoldRecorder({ ...recorder(1) });
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(true);
    // The first reservation is live until its COOLDOWN_HOLD record commits: a second one would be the third hold.
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(false);
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(false);
    // Another run is never counted.
    await expect(hold.reserveHold!("run:other", 2)).resolves.toBe(true);
  });

  it("releases a reservation once its hold's record has committed, so the database count takes over", async () => {
    let recorded = 0;
    const base = {
      countCooldownHolds: vi.fn(async () => recorded),
      record: vi.fn(async (event: HoldProgressEvent) => { if (event.state === "COOLDOWN_HOLD") recorded += 1; }),
      wait: vi.fn(async () => undefined)
    };
    const hold = reservingHoldRecorder(base);
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(true);
    await hold.record({ ...holdEvent(), state: "COOLDOWN_HOLD" });
    // recorded 1 + this reservation 1 <= 2.
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(true);
    await hold.record({ ...holdEvent(), state: "COOLDOWN_HOLD" });
    await expect(hold.reserveHold!("run:test", 2)).resolves.toBe(false);
  });

  it("releases a reservation whose record fails, and one whose count fails", async () => {
    let failRecord = true;
    let failCount = false;
    const base = {
      countCooldownHolds: vi.fn(async () => { if (failCount) throw new Error("count down"); return 0; }),
      record: vi.fn(async () => { if (failRecord) throw new Error("record down"); }),
      wait: vi.fn(async () => undefined)
    };
    const hold = reservingHoldRecorder(base);
    await expect(hold.reserveHold!("run:test", 1)).resolves.toBe(true);
    await expect(hold.record({ ...holdEvent(), state: "COOLDOWN_HOLD" })).rejects.toThrow("record down");
    failRecord = false;
    failCount = true;
    await expect(hold.reserveHold!("run:test", 1)).rejects.toThrow("count down");
    failCount = false;
    // Neither failure left a reservation behind: cap 1 with 0 recorded admits one.
    await expect(hold.reserveHold!("run:test", 1)).resolves.toBe(true);
  });

  it("counts a reservation that commits and releases while another one is still reading the count", async () => {
    // The race the brief's "reserved read after the await" would miss: site A's hold commits and releases between
    // site B's count read (which did not see A's row) and B's decision. B must still see A.
    let recorded = 0;
    let releaseRead: (count: number) => void = () => undefined;
    let reads = 0;
    const base = {
      countCooldownHolds: vi.fn(async () => {
        reads += 1;
        if (reads === 2) return new Promise<number>((resolve) => { releaseRead = resolve; });
        return recorded;
      }),
      record: vi.fn(async (event: HoldProgressEvent) => { if (event.state === "COOLDOWN_HOLD") recorded += 1; }),
      wait: vi.fn(async () => undefined)
    };
    const hold = reservingHoldRecorder(base);
    await expect(hold.reserveHold!("run:test", 1)).resolves.toBe(true);
    const second = hold.reserveHold!("run:test", 1);
    await hold.record({ ...holdEvent(), state: "COOLDOWN_HOLD" });
    releaseRead(0);
    await expect(second).resolves.toBe(false);
  });

  it("passes every other record and the wait straight through", async () => {
    const base = recorder(0);
    const hold = reservingHoldRecorder(base);
    await hold.record({ ...holdEvent(), state: "COOLDOWN_RETRY" });
    await hold.wait(5);
    await expect(hold.countCooldownHolds("run:test")).resolves.toBe(0);
    expect(base.events.map((event) => event.state)).toEqual(["COOLDOWN_RETRY"]);
    expect(base.wait).toHaveBeenCalledWith(5);
  });
});

function holdEvent(): HoldProgressEvent {
  return {
    kind: "node.retrying",
    state: "COOLDOWN_HOLD",
    runId: "run:test",
    callSiteKey: "JUDGE:test",
    parentNodeId: null,
    holdMs: 600_000,
    holdUntil: null,
    attemptsSpent: 3,
    transportOutcome: "FAILED",
    plannedLegCount: 1
  };
}

const fullSnapshot: EvaluationSnapshot = {
  nodes: [
    { nodeId: "root", baseStrength: 0.5, parentNodeId: null },
    { nodeId: "hidden", baseStrength: 0.9, parentNodeId: "root" },
    { nodeId: "hidden-child", baseStrength: 0.8, parentNodeId: "hidden" },
    { nodeId: "sibling", baseStrength: 0.4, parentNodeId: "root" }
  ],
  arrows: [
    { arrowId: "a:hidden", sourceNodeId: "hidden", targetKind: "NODE", targetNodeId: "root", targetEdgeId: null, polarity: "attack", kind: "rebutting", strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" },
    { arrowId: "a:hidden-child", sourceNodeId: "hidden-child", targetKind: "NODE", targetNodeId: "hidden", targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" },
    { arrowId: "a:sibling", sourceNodeId: "sibling", targetKind: "NODE", targetNodeId: "root", targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER" }
  ],
  arrowOrder: ["a:hidden-child", "a:hidden", "a:sibling"],
  operatorResolutions: [{ parentNodeId: "root", operator: "accumulate", suppliedBy: "deployment" }],
  clusterRecords: []
};

describe("RESIL-01 / DR-174-A hidden-frame mutation ledger", () => {
  it("T27/T28 excludes a class-H whole subtree from scoring without deleting or re-parenting it", () => {
    const judged = projectJudgedStanding(fullSnapshot, ["root", "sibling"]).snapshot;
    expect(judged.nodes.map((node) => node.nodeId)).toEqual(["root", "sibling"]);
    expect(judged.arrows.map((arrow) => arrow.arrowId)).toEqual(["a:sibling"]);
    expect(judged.arrowOrder).toEqual(["a:sibling"]);
    expect(judged.nodes.find((node) => node.nodeId === "hidden-child")?.parentNodeId).not.toBe("root");
    expect(fullSnapshot.nodes.map((node) => node.nodeId)).toContain("hidden");
    const outcome = evaluate(judged);
    expect(outcome.strengths.map((row) => row.nodeId)).toEqual(expect.arrayContaining(["root", "sibling"]));
    expect(outcome.strengths.map((row) => row.nodeId)).not.toContain("hidden");
    expect(outcome.arrowOrder).not.toContain("a:hidden");
    expect(outcome.graphFingerprintMaterial).not.toContain("hidden-child");
  });

  it("T29 maps class H onto the existing set-aside affordance with disclosed-as-unjudged copy", () => {
    const detail = debateDetailFromAnswer({
      answer_id: "answer:test", answer_version: 1, run_ref: "run:test", question_line: "Question?",
      terminal: "SERVED", verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: "FULL", band_ceiling: null,
      answer_form: {}, serve_state: "COMPOSED", composed_text: [], number_slots: [], abstention: null,
      shadow_suppressions: [], badges: [], residual_objections: [], value_hinges: [],
      condition_marks: ["HIDDEN-UNJUDGEABLE"], reversal_point: "test", builds_on_previous: { value: false, answer_ref: null },
      memory_disclosure: null, risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "test",
      cost_envelope: { basis: {}, state: "WITHIN", consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE" },
      composition_budget_tier: "low", conformance_outcome: "PASS", ledger_digest_handle: "ledger:test", inspection_handle: "inspection:test",
      as_of: "2026-08-14T00:00:00.000Z", staleness_state: "FRESH", relevant_as_of: "2026-08-14T00:00:00.000Z",
      edges: [],
      nodes: [{
        node_id: "node:hidden", claim: "Unjudged material", way_of_knowing: "REASONING",
        base_score: { value: 0.8, kind: "tau", source: "test", producer: "test", provenance_ref: "p", replay_handle: "r" },
        final_strength: null, provenance_ref: "artifact:test", maker_lineage: null, review: null, locator: null,
        stranger_restatement: { check_status: "PASS" }, defeater_refs: [], defeater_exhaustion_marked: false,
        disagreement: null, condition_marks: ["HIDDEN-UNJUDGEABLE"], abstention: null, staleness_state: "FRESH",
        relevant_as_of: "2026-08-14T00:00:00.000Z"
      }],
      condition_mark_records: [{
        mark: "HIDDEN-UNJUDGEABLE", scope: "node", subject_ref: "node:hidden",
        reason: "Cross-maker review transport exhausted", lift_path: null, served_root_rule: null,
        call_site_key: "JUDGE:review:node:hidden", planned_leg_count: null,
        terminal_transport_outcome: "FAILED", hidden_strength: null, hidden_score_threshold: null,
        hidden_score_threshold_source_ref: null, excluded_from_served_number: true,
        affected_node_ids: ["node:hidden"]
      }]
    } as never);
    const hidden = detail.tree!.children[0]!;
    expect(hidden.path_status).toBe("abandoned");
    expect(hidden.stopping_reason_human).toContain("Disclosed as unjudged");
    expect(hidden.stopping_reason_human).not.toContain("served opinion");
  });

  it("T30/T31 keeps missing score distinct from low and resolves 0.35 with register provenance", () => {
    expect(isLowStrengthNode(null, 0.35)).toBe(false);
    expect(isLowStrengthNode(undefined, 0.35)).toBe(false);
    expect(isLowStrengthNode(0.35, 0.35)).toBe(true);
    expect(isLowStrengthNode.length).toBe(2);
    expect(hiddenNodeScoreThresholdFromDeployment({
      register: { register_version: 1, rows: [{ row_key: "hiddenNodeScoreThreshold", value: 0.35, source_ref: "acceptance:DR-176:V-approved" }] },
      scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    })).toEqual({ value: 0.35, sourceRef: "acceptance:DR-176:V-approved", registerVersion: 1 });
  });

  it("T32 mints exactly H/L/N and enforces typed required records without pretending class N is revealable", () => {
    // J13(b) 29 -> 31, T7 31 -> 32 (BRANCH-FROZEN-LOW-LEVERAGE), T11 32 -> 33
    // (LABEL-BASIS-INCOMPLETE), T9 33 -> 37 (SYNTHESIS-OBJECTION-STANDING,
    // DIGEST-COMPRESSED, DIGEST-CANNOT-EXIST, PROTECTED-CORE-GUARD-RETIRED).
    // MERGE T9B: lane/s07 pinned 36 (32 + T9's four) and integration 19bbb4c4
    // pinned 33 (32 + T7's one); BOTH mints survive the merge, so the exact
    // count at this tree is 37 — counted from the shipped array, not summed
    // from these comments. Every new mark was minted MID-LIST, so the DR-176
    // positional tail `CONDITION_MARKS.slice(-4)` is unchanged.
    // Model scorecard A16: 37 -> 38 (BACKUP-MODEL-USED, minted mid-list beside
    // DEGRADED-DIVERSITY); the tail below is still read and still unchanged.
    // R2 (engine redesign, INTERFACE §13) minted four engine marks mid-list: 46 -> 50.
    // R3 (engine redesign, spec §5.5) minted four answer-check marks mid-list: 50 -> 54.
    expect(CONDITION_MARKS).toHaveLength(54); // + R3's four answer-check marks (engine redesign spec §5.5)
    expect(CONDITION_MARKS).toEqual(expect.arrayContaining([
      "HIDDEN-UNJUDGEABLE", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
    ]));
    const records: ConditionMarkRecord[] = [
      {
        mark: "HIDDEN-UNJUDGEABLE", scope: "node", subjectRef: "node:h", reason: "test-layer",
        liftPath: null, servedRootRule: null, callSiteKey: "JUDGE:review:node:h", plannedLegCount: null,
        terminalTransportOutcome: "FAILED", hiddenStrength: null, hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null, affectedNodeIds: ["node:h"], excludedFromServedNumber: true
      },
      {
        mark: "DERIVED-STANDING-UNREVIEWED", scope: "node", subjectRef: "node:d", reason: "test-layer",
        liftPath: null, servedRootRule: null, callSiteKey: "JUDGE:review:node:d", plannedLegCount: null,
        terminalTransportOutcome: "FAILED", hiddenStrength: null, hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null, affectedNodeIds: ["node:d"], excludedFromServedNumber: false,
        judgedBasisCount: 1
      },
      {
        mark: "HIDDEN-LOW-SCORE", scope: "node", subjectRef: "node:l", reason: "test-layer",
        liftPath: null, servedRootRule: null, callSiteKey: null, plannedLegCount: null,
        terminalTransportOutcome: null, hiddenStrength: 0.2, hiddenScoreThreshold: 0.35,
        hiddenScoreThresholdSourceRef: "acceptance:DR-176:V-approved", affectedNodeIds: ["node:l"], excludedFromServedNumber: false
      },
      {
        mark: "UNAUTHORED-BRANCH-HALTED", scope: "node", subjectRef: "node:surviving-parent", reason: "test-layer",
        liftPath: null, servedRootRule: null, callSiteKey: "JUDGE:child", plannedLegCount: 1,
        terminalTransportOutcome: "FAILED", hiddenStrength: null, hiddenScoreThreshold: null,
        hiddenScoreThresholdSourceRef: null, affectedNodeIds: ["node:surviving-parent"], excludedFromServedNumber: null
      }
    ];
    expect(() => assertRequiredConditionMarkRecords(CONDITION_MARKS.slice(-4), records)).not.toThrow();
    expect(() => assertRequiredConditionMarkRecords(["HIDDEN-UNJUDGEABLE"], [])).toThrowError(
      expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" })
    );
  });

  it("RESIL-01 rev2 H3 never presents class N as a revealable hidden node", () => {
    const detail = debateDetailFromAnswer({
      answer_id: "answer:n", answer_version: 1, run_ref: "run:n", question_line: "Question?",
      terminal: "SERVED", verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: "FULL", band_ceiling: null,
      answer_form: {}, serve_state: "COMPOSED", composed_text: [], number_slots: [], abstention: null,
      shadow_suppressions: [], badges: [], residual_objections: [], value_hinges: [],
      condition_marks: ["UNAUTHORED-BRANCH-HALTED"], reversal_point: "test", builds_on_previous: { value: false, answer_ref: null },
      memory_disclosure: null, risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "test",
      cost_envelope: { basis: {}, state: "WITHIN", consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE" },
      composition_budget_tier: "low", conformance_outcome: "PASS", ledger_digest_handle: "ledger:n", inspection_handle: "inspection:n",
      as_of: "2026-08-14T00:00:00.000Z", staleness_state: "FRESH", relevant_as_of: "2026-08-14T00:00:00.000Z",
      edges: [],
      nodes: [{
        node_id: "node:surviving-parent", claim: "The surviving parent", way_of_knowing: "REASONING",
        base_score: { value: 0.8, kind: "tau", source: "test", producer: "test", provenance_ref: "p", replay_handle: "r" },
        final_strength: { value: 0.8, kind: "strength", source: "test", producer: "test", provenance_ref: "p2", replay_handle: "r2" },
        provenance_ref: "artifact:test", maker_lineage: null, review: null, locator: null,
        stranger_restatement: { check_status: "PASS" }, defeater_refs: [], defeater_exhaustion_marked: false,
        disagreement: null, condition_marks: ["UNAUTHORED-BRANCH-HALTED"], abstention: null, staleness_state: "FRESH",
        relevant_as_of: "2026-08-14T00:00:00.000Z"
      }],
      condition_mark_records: [{
        mark: "UNAUTHORED-BRANCH-HALTED", scope: "node", subject_ref: "node:surviving-parent",
        reason: "Expansion halted; no child node exists", lift_path: null, served_root_rule: null,
        call_site_key: "JUDGE:defender:root0:r1:p0", planned_leg_count: 3,
        terminal_transport_outcome: "FAILED", hidden_strength: null, hidden_score_threshold: null,
        hidden_score_threshold_source_ref: null, excluded_from_served_number: null,
        affected_node_ids: ["node:surviving-parent"]
      }]
    } as never);

    const parent = detail.tree!.children[0]!;
    expect(parent.path_status).toBeUndefined();
    expect(parent.stopping_status).toBeUndefined();
    expect(parent.stopping_reason_human).toBeUndefined();
  });

  it("T33 computes the served root from the judged graph, not the merely-labelled full graph", () => {
    const judged = evaluate(projectJudgedStanding(fullSnapshot, ["root", "sibling"]).snapshot);
    const expected = evaluate({
      ...fullSnapshot,
      nodes: fullSnapshot.nodes.filter((node) => ["root", "sibling"].includes(node.nodeId)),
      arrows: fullSnapshot.arrows.filter((arrow) => arrow.arrowId === "a:sibling"),
      arrowOrder: ["a:sibling"]
    });
    expect(judged.strengths.find((row) => row.nodeId === "root")?.strength)
      .toBe(expected.strengths.find((row) => row.nodeId === "root")?.strength);
    expect(judged.strengths.map((row) => row.nodeId)).not.toContain("hidden");
  });
});
