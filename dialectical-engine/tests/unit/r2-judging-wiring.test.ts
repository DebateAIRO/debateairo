import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Engine redesign R2b, Task B5: the judging step's wiring in the run body, pinned on the SOURCE (no pool-free harness
 * for `WalkingSkeletonRunner.execute` exists; the whole run is driven on embedded Postgres by B12's integration suite,
 * which the CI gate does not run). Each pin fails on deletion or reordering.
 */
const RUNNER = new URL("../../apps/runner/src/index.ts", import.meta.url);
const SERVE_DISCLOSURE = new URL("../../packages/db/src/serve-disclosure.ts", import.meta.url);

const judgesBlock = (source: string): string => {
  const start = source.indexOf("const comparingJudges = engineTwo === null ? null : await (async () => {");
  return source.slice(start, source.indexOf("const makerPositionServe = decideMakerPositionServe({", start));
};

describe("R2b: the comparing judges in the run body", () => {
  it("run after the final propagation and before the label, guarded by engine 2", async () => {
    const source = await readFile(RUNNER, "utf8");
    const anchors = [
      "const serveDecisionInput = Object.freeze({",
      "const engineTwo = engine.engine === 2 ? engine : null;",
      "const comparingJudges = engineTwo === null ? null : await (async () => {",
      "const strengthDecision = decideMakerPositionServe(serveDecisionInput);",
      "const makerPositionServe = decideMakerPositionServe({",
      // A14's investigation rows are written only after the serve decision (Ruling PF-R2a8.10), so the judges read
      // this copy's outcomes from memory (pre-flight PF-R2b3.6).
      "await recordPointInvestigationRows({",
      "const ladderLabel = deriveVerdictLabel(verdictLabelBasis);",
      "const verdictLabel = comparingJudges === null ? ladderLabel : verdictDerivationOfJudges(comparingJudges.verdict);"
    ].map((anchor) => [anchor, source.indexOf(anchor)] as const);
    for (const [anchor, index] of anchors) expect([anchor, index >= 0]).toEqual([anchor, true]);
    const indices = anchors.map(([, index]) => index);
    expect(indices).toEqual([...indices].sort((left, right) => left - right));
    expect(source.split("decideMakerPositionServe(serveDecisionInput)")).toHaveLength(2);
  });

  it("call each judge through its own maker's lane gateway, sealed and bounded as the step's", async () => {
    const source = await readFile(RUNNER, "utf8");
    const body = judgesBlock(source);
    for (const needle of [
      "askComparingJudge(member.provider, {",
      "callSiteKey: comparingJudgeCallSiteKey(judge.seat)",
      "contractHash: engineSeal",
      // pre-flight PF-R2b3.15: the run body's one engine seal, A14's (equal to `engineContractHash()` on any runner R1d boots).
      "const engineSeal = settings.engine?.engineContractHash;",
      "guidedCallBound(settings.judgeBound, \"comparing_judge\", lengthGuidance)",
      "moneyStopped: runBodyBudgetStop !== null",
      "readVerdictVotesForRun(run.runId)",
      "eligible: sameMaker",
      // pre-flight PF-R2b3.6, PF-R2b3.7: this copy's investigations from memory, and never an empty facts map.
      "engineMaterialInvestigationsOf(engineInvestigation?.rows ?? [])",
      "facts: engineServeLinked.facts,",
      // R4 pre-flight consistency (Ruling PF-R43.1): the block exposes the servable source and the honest strengths R4's
      // final writers read, so their bundle is built from the judges' own source.
      "const material = engineMaterialOf(servableSource);",
      "return Object.freeze({ ...judged, materialSource: servableSource, honestFinalStrength: strengthOf });"
    ]) expect([needle, body.includes(needle)]).toEqual([needle, true]);
    expect(body.includes("readEngineMaterialSource(")).toBe(false);
    expect(body.includes("new Map()")).toBe(false);
    // Never the arguing-phase judge, whose gateway may move a call to a cheaper maker (B9 cost fallback).
    expect(body.includes("member.judge")).toBe(false);
    // Through the debate's call lane (pre-flight PF-R2a5.6, PF-R2b3.12): the members' gateways are lane-wrapped where they
    // are built, and the step never takes the cooldown book.
    expect(body).not.toMatch(/cooldownAttempt\(|withCooldownRetry\(/u);
    const sitOutAt = source.indexOf("const sitOutMaker = <T extends ConfiguredSeatMaker>(maker: T): T => {");
    expect(sitOutAt).toBeGreaterThan(0);
    expect(source.slice(sitOutAt, sitOutAt + 400)).toContain("throughCallLane(maker.providerRef, sittingOut)");
    expect(source).toContain("const provider = throughCallLane(ref, maker.provider);");
  });

  it("put the judges' records on the answer and their label on the persisted answer", async () => {
    const source = await readFile(RUNNER, "utf8");
    expect(source).toContain("...new Set((comparingJudges?.records ?? []).map((record) => record.mark))");
    expect(source).toContain("...(comparingJudges?.records ?? []),");
    // Controller carry 12 (B5): with the judges' derivation the ladder basis is null, or serve stops with
    // VERDICT_LABEL_BASIS_AMBIGUOUS.
    expect(source).toContain("verdictLabelBasis: answerCarriesLabel && comparingJudges === null ? verdictLabelBasis : null,");
    expect(source).toContain("...(answerCarriesLabel && comparingJudges !== null ? { judgesDerivation: verdictLabel } : {})");
  });

  // Ruling PF-R2b7.2 option (a): the judges' floor stands as stored and reads no ladder controls (pre-flight PF-R2b7.2).
  it("keep the judges' floor in the review catch-up, before any label control is read", async () => {
    const source = await readFile(RUNNER, "utf8");
    const floorAfterAt = source.indexOf("const floorAfter = floorReceipt === null ? null : await (async () => {");
    const shortCircuitAt = source.indexOf("if (floorDecidedByJudges(floorReceipt.servedRootRule)) {");
    const controlsAt = source.indexOf("const controls = await readVerdictLabelControls(input.pool, floorReceipt.registerVersion);");
    expect([floorAfterAt > 0, shortCircuitAt > floorAfterAt, controlsAt > shortCircuitAt]).toEqual([true, true, true]);
    expect(source.slice(shortCircuitAt, controlsAt)).toContain(
      "return Object.freeze({ leadingNodeId: floorReceipt.floor.leadingNodeId, verdictState: floorReceipt.floor.verdictState });");
    // The ladder's call stays today's: no judges' member reaches `rederiveCatchUpFloor`.
    expect(source.includes("judgesDecided")).toBe(false);
  });
});

/*
 * Controller carries for B5 (the R2b controller's dispatch), on the source the step test cannot reach.
 */
describe("R2b: the controller's carries in the run body", () => {
  it("never sets the practice-only answer order on the runner's judge call (carry 7)", async () => {
    const body = judgesBlock(await readFile(RUNNER, "utf8"));
    const callAt = body.indexOf("askComparingJudge(member.provider, {");
    const call = body.slice(callAt, body.indexOf("})", callAt));
    expect(call).toContain("material,");
    expect(call).not.toMatch(/\border\b/u);
  });

  it("builds the material from this pass's strengths, refusing a missing one only where the point should have propagated (carry 7)", async () => {
    const body = judgesBlock(await readFile(RUNNER, "utf8"));
    expect(body).toContain("const servableSource = comparingJudgesSourceOf({");
    // B5 fix 1 (Important 1): only a node of the standing snapshot with a base that did not abstain must have propagated.
    expect(body).toContain("propagatableNodeIds: new Set(strengthDecision.standing.snapshot.nodes\n"
      + "          .filter((node) => node.baseStrength !== null && node.abstained !== true).map((node) => node.nodeId))");
  });

  it("reads back the stored vote on ALREADY_PRESENT and hands it to the step (carry 6)", async () => {
    const body = judgesBlock(await readFile(RUNNER, "utf8"));
    const recordAt = body.indexOf("record: async (vote) => {");
    expect(recordAt).toBeGreaterThan(0);
    const record = body.slice(recordAt);
    expect(record).toContain("return storedVoteOnConflict(outcome, vote.judgeSeat, readRecordedVotes);");
    // Controller ruling R2b-B5.1: the rows are read again after the judges answered, before any fresh row is written.
    expect(body).toContain("readRecorded: readRecordedVotes,");
    expect(body).toContain("(await verdictVotes.readVerdictVotesForRun(run.runId)).map(recordedVoteOf);");
  });

  it("leaves one content-free line for a judge whose call failed, never its message (carry 10)", async () => {
    const source = await readFile(RUNNER, "utf8");
    const body = judgesBlock(source);
    expect(body).toContain(
      "logComparingJudge(\"JUDGE_FAILED\", { runId: run.runId, callSiteKey: judgeKey, code: pointInvestigationFailureCode(error) });");
    expect(source).toContain("console.warn(JSON.stringify({ ...detail, kind: \"DEBATEAI_COMPARING_JUDGE\", event }));");
    expect(body).not.toMatch(/error\.message|String\(error\)/u);
  });

  it("reads the floor's rule where it was recorded: the propagation receipt's selection (carry 14)", async () => {
    const source = await readFile(SERVE_DISCLOSURE, "utf8");
    const start = source.indexOf("async readLatestFloorReceipt(answerId: string)");
    const body = source.slice(start, source.indexOf("\n  }\n", start));
    expect(body).toContain("SELECT receipt.served_root_selection\n");
    expect(body).toContain("FROM ledger.propagation_run AS receipt");
    expect(body).toContain("servedRootRule: typeof selection?.rule === \"string\" ? selection.rule : null");
    // Never a condition-mark record's rule (a money-stopped single-lineage record carries none).
    expect(body).not.toMatch(/condition_mark|served_root_rule/u);
  });
});
