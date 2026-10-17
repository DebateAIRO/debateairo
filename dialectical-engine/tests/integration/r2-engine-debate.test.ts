// Engine redesign R2, plan Task B12 (spec §14.2): engine 2 end to end. The REAL WalkingSkeletonRunner, composed as
// apps/runner/src/main.ts composes it on the preview (tests/support/preview-debate-harness.ts), booted with the engine
// settings (this code's engine hash), argues runs admitted with the receipt's length and engine members against the
// scripted gates, on a migrated embedded PostgreSQL. Cases: each shape ends with an answer, a label from the judges
// (rung 5, the judges' served-root rule) and a story; one maker and a money stop at judging still give an answer at
// most "Close call"; a split is stored and served as SPLIT, and so is its floor; the review catch-up keeps the judges'
// floor; a "cannot assess" point gets one investigation and stays at reduced weight, is resolved, or is read as
// disputed; a debate whose middle answer sat out shows the owner the same counted votes the served verdict counted.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate, ServeDisclosureRepository } from "@debateai/db";
// (pre-flight PF-R2b7.20) B3's rule name, imported, never restated.
import { ENGINE2_REDUCER_VERSION, SERVED_ROOT_SELECTION_RULE_JUDGES } from "@debateai/kernel";
import { mapPromptContractHash } from "@debateai/map";
import {
  ENGINE_VERSION_POLICY_ROW_KEY, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  resolveLengthGuidance
} from "@debateai/register";
import { catchUpFloorWouldMove, createPostgresReviewCatchUpDependencies } from "@debateai/runner";
import type { RotatedRoles } from "@debateai/scorecard";
import { ServeRepository } from "@debateai/serve";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import {
  DEEPSEEK, FIVE_MAKER_REFS, GLM, HAIKU, INCIDENT_PIN, MIMO, OWNER_CALL_CONCURRENCY, PANEL_REFS, QWEN, RUN_RESILIENCE, configured,
  previewDebateHarness
} from "../support/preview-debate-harness.js";
import {
  comparingJudgeLettersShown, stubComparingJudgeVote, stubPointInvestigation, type GateOverride, type GateRequest
} from "../support/preview-gate-stubs.js";
import { requestedReviewEdges, reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
const LENGTH = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const RUNNER_ENGINE = Object.freeze({ engineContractHash: engineContractHash() });
/**
 * Spec §4.7 "one maker": the Free panel (GLM and DeepSeek) with DeepSeek refusing every call after its claim probe, so
 * DeepSeek sits out and GLM is the one maker left arguing: one answer, and no judge to seat. (A panel of GLM's two refs
 * alone cannot be argued at all, engine 1 included: every review needs a reviewer of another maker on the panel,
 * DIFFERENT_MAKER_REVIEWER_UNAVAILABLE; and the runner refuses a rotation pin naming a role off the panel.)
 */
const ONE_MAKER_LEFT_REFS = Object.freeze(["preview:fixture-a", "preview:deepseek-v4-1-flash"]);
/**
 * B6 carry (ruling R2b-B6.1): the incident's five makers with GLM seated SECOND, so GLM's root is root 1 (letter B).
 * GLM refuses every call after its claim probe, sits out, and its root is dropped: the judges see A, C, D and E.
 */
const MIDDLE_SITS_OUT_PIN: RotatedRoles = Object.freeze({
  ...INCIDENT_PIN, eligibleModelIds: Object.freeze([DEEPSEEK, GLM, MIMO, QWEN, HAIKU])
});

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 10 * 60 * 1000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await database?.stop(); });

type Before = (request: GateRequest, chat: string) => GateOverride | null;
/** One engine-2 debate, admitted with the receipt's length and engine members, argued to a completed answer. */
async function argueEngine2(input: Readonly<{
  label: string; shaped?: boolean; panelRefs?: readonly string[]; pin?: RotatedRoles; before?: Before; noDigest?: boolean;

  /** Models the gates refuse unbilled after their claim probe (the run-resilience script); absent: none. */
  unbilled?: readonly string[];
}>) {
  const panelRefs = input.panelRefs ?? PANEL_REFS;
  const makers = new Set(panelRefs.map((ref) => configured(ref).maker)).size;
  const shape = input.shaped === true ? shapeForTest({ plan: "free", makers, settings: STANDARD }) : undefined;
  const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers, mapOpening: shape !== undefined });
  const debate = await harness.admittedRun(input.label, {
    panelRefs, depth: 1, length: LENGTH, engine,
    ...(shape === undefined ? {} : { shape, settings: STANDARD }),
    ...(input.pin === undefined ? {} : { pin: input.pin })
  });
  const scripted = shape === undefined ? scriptedAnswers(debate.question) : scriptedShapeAnswers(debate.question);
  const before = input.before;
  // A panel named by the case (the one-maker case: GLM's two refs) gets a debate script, so the gates answer GLM; without
  // one the harness refuses every GLM call (its busy-GLM default, preview-debate-harness.ts startGates) (pre-flight PF-R2b7.1).
  const gates = await harness.startGates({}, input.panelRefs === undefined ? undefined : { unbilled: [...(input.unbilled ?? [])] },
    before === undefined ? scripted : (request, chat) => before(request, chat) ?? scripted(request, chat));
  const composed = await harness.previewRunner(gates, "resend", {
    callConcurrency: OWNER_CALL_CONCURRENCY, engine: RUNNER_ENGINE,
    ...(input.unbilled === undefined ? {} : { resilience: RUN_RESILIENCE }),
    ...(shape === undefined ? {} : { debateShape: { mapContractHash: mapPromptContractHash() } }),
    ...(input.noDigest === true ? { noDigest: true } : {})
  });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, engine, shape, result };
}

const rows = async <T extends Record<string, unknown>>(sql: string, id: string): Promise<T[]> => (await database.pool.query<T>(sql, [id])).rows;
type VoteRow = Readonly<{ judge_seat: number; maker: string; model_id: string; chosen_letter: string | null;
  chosen_root_node_id: string | null; conditional: boolean | null; counted: boolean; not_counted_reason: string | null;
  question_kind: string | null }>;
const votesOf = (runId: string) => rows<VoteRow>(`SELECT judge_seat, maker, model_id, chosen_letter,
    chosen_root_node_id::text AS chosen_root_node_id, conditional, counted, not_counted_reason, question_kind
  FROM ledger.verdict_vote WHERE run_id=$1 ORDER BY judge_seat`, runId);
type Receipt = Readonly<{ rule: string; servedNodeId: string;
  verdictLabel: Readonly<{ label: string; rung: number; trigger: string; basisAbsence: readonly string[] }> }>
  & Readonly<Record<string, unknown>>;
async function receiptOf(runId: string): Promise<Receipt> {
  const found = await rows<{ served_root_selection: Receipt }>(`SELECT served_root_selection FROM ledger.propagation_run
    WHERE run_id=$1 AND served_root_selection IS NOT NULL ORDER BY at_seq DESC LIMIT 1`, runId);
  return found[0]!.served_root_selection;
}
const callKeys = async (runId: string, outcome?: "OK") => (await harness.modelCalls(runId))
  .filter((call) => outcome === undefined || call.outcome === outcome).map((call) => call.call_site_key);
const marksOf = (answer: { condition_mark_records: readonly { mark: string }[] }) => answer.condition_mark_records.map((record) => record.mark);
/** Every judge votes for the answer it was shown FIRST: the rotation shows each judge a different first answer. */
const firstShown: Before = (request, chat) => request.kind === "VERDICT_JUDGE"
  ? { content: stubComparingJudgeVote(comparingJudgeLettersShown(chat)[0]!) } : null;
/** The catch-up's own dependencies, built from the harness's fixture (no reviewer: nothing is left to review). */
function catchUpDependencies() {
  const fixture = harness.fixtureSettings();
  return createPostgresReviewCatchUpDependencies({
    pool: database.pool, reviewers: [], scoringOperator: fixture.scoringOperator!,
    propagationContractHash: fixture.propagationContractHash, propagationNumberKind: fixture.propagationNumberKind,
    propagationProducer: fixture.propagationProducer, judgementSelectionRule: { ...fixture.judgementPolicy!.selectionRule },
    compositionBudget: fixture.servePolicy!.compositionBudgets.low
  });
}

describe("engine 2 end to end (spec §14.2)", () => {
  it.each([["today's shape", false], ["the new shape", true]] as const)(
    "%s: an answer, a label from the judges (rung 5, the judges' rule), every vote stored, a story", async (_name, shaped) => {
      const run = await argueEngine2({
        label: shaped ? "e2-shape" : "e2-today", shaped,
        // The new shape: every judge names the kind "factual", so the story's one shape is the judges' (B9).
        ...(shaped ? { before: (request: GateRequest) => request.kind === "VERDICT_JUDGE"
          ? { content: stubComparingJudgeVote("A", { questionKind: "factual" }) } : null } : {})
      });
      const runId = run.debate.runId;
      const { answer, story } = await harness.servedAnswer(run.debate, run.result.answerId);
      expect(["SERVED", "DOWNGRADED"]).toContain(answer!.terminal);
      // Four makers: three judges, each called once, under its own seat key.
      expect(run.engine.sites.comparingJudges).toBe(3);
      expect((await callKeys(runId, "OK")).filter((key) => key.startsWith("VERDICT:judge:")).sort())
        .toEqual(["VERDICT:judge:1", "VERDICT:judge:2", "VERDICT:judge:3"]);
      const votes = await votesOf(runId);
      expect(votes).toHaveLength(3);
      expect(new Set(votes.map((vote) => vote.maker)).size).toBe(3);
      for (const vote of votes) {
        expect(vote).toMatchObject({ chosen_letter: "A", conditional: false, question_kind: shaped ? "factual" : "general" });
        // A vote is counted unless the judge's own maker argued answer A (then it is recorded, not counted).
        expect(vote.counted ? null : vote.not_counted_reason).toBe(vote.counted ? null : "OWN_MAKER");
      }
      const counted = votes.filter((vote) => vote.counted).length;
      // At most one judge's maker argued A, so at least two votes count: A wins, Clear only with all three.
      expect(counted).toBeGreaterThanOrEqual(2);
      const label = counted === 3 ? "SUPPORTED" : "CONTESTED";
      expect(answer!.verdict_state).toBe(label);
      const receipt = await receiptOf(runId);
      expect(receipt.rule).toBe(SERVED_ROOT_SELECTION_RULE_JUDGES);
      expect(receipt.verdictLabel).toMatchObject({ label, rung: 5, trigger: counted === 3 ? "JUDGES_UNANIMOUS" : "JUDGES_MAJORITY" });
      expect(receipt.servedNodeId).toBe(votes[0]!.chosen_root_node_id);
      // B11's record-only members, on a real engine-2 receipt: today's ladder over the same strengths, and the groups.
      expect(receipt.engine1Ladder).toMatchObject({ label: expect.stringMatching(/^(SUPPORTED|CONTESTED|UNSUPPORTED)$/u) });
      expect(receipt.judgesGroups).toEqual([]);
      expect(answer!.judges_comparison).toMatchObject({ judges_seated: 3, judges_counted: counted });
      expect(answer!.judges_comparison!.answers.find((entry) => entry.root_node_id === receipt.servedNodeId)?.judges_chose).toBe(counted);
      // A4's records, proven end to end: every reduced judgement is engine 2's, with its honest record.
      const reduced = await rows<{ reducer_version: string; source: string | null }>(`SELECT reducer_version,
        disagreement -> 'honest' ->> 'source' AS source FROM ledger.reduced_judgement WHERE run_id = $1`, runId);
      expect(reduced.length).toBeGreaterThan(0);
      for (const row of reduced) {
        expect(row.reducer_version).toBe(ENGINE2_REDUCER_VERSION);
        expect(["OTHER_MAKERS", "AUTHOR_LAST_RESORT"]).toContain(row.source);
      }
      // A4: every propagation version of the run names engine 2's selection rule, the engine row's key.
      const ruleKeys = await rows<{ rule_key: string | null }>(`SELECT judgement_selection_rule_key AS rule_key
        FROM ledger.propagation_run WHERE run_id=$1`, runId);
      expect(ruleKeys.length).toBeGreaterThan(0);
      for (const row of ruleKeys) expect(row.rule_key).toBe(ENGINE_VERSION_POLICY_ROW_KEY);
      expect(story).toMatchObject({ outcome: "READY" });
      expect(story!.verdictBasis).toMatchObject({ label, rung: 5, winner_node_id: receipt.servedNodeId });
      if (shaped) {
        // Ruling W4 (B12 Minor 1, whole-branch review): the judges' winner is NOT the strength leader here (its strongest
        // rival finished above it, so the receipt's margin is negative), and the served answer, the label and the story's
        // material all follow the judges' winner, never the leader.
        const margin = receipt.margin as Readonly<{ kind: string; value?: number }>;
        const runnerUp = receipt.runnerUp as Readonly<{ nodeId: string; strength: number }> | null;
        expect(margin.kind).toBe("MEASURED");
        expect(margin.value!).toBeLessThan(0);
        expect(runnerUp!.strength).toBeGreaterThan(receipt.servedStrength as number);
        expect(answer!.judges_comparison!.answers[0]!.root_node_id).toBe(receipt.servedNodeId);
        expect(story!.verdictBasis).toMatchObject({ winner_node_id: receipt.servedNodeId, label: answer!.verdict_state,
          runner_up_node_id: runnerUp!.nodeId });
        expect(story!.verdictBasis!.margin!).toBeLessThan(0);
        expect(story!.shapeId).toBe("factual");
        // The ring (A5): one cross-reply per answer, as before.
        expect((await callKeys(runId, "OK")).filter((key) => key.startsWith("JUDGE:cross-root:"))).toHaveLength(run.shape!.answers);
      }
    }, 15 * 60 * 1000);

  it("one maker: no judge is called; the winner by honest strength, labelled at most Close call", async () => {
    const run = await argueEngine2({ label: "e2-one-maker", panelRefs: ONE_MAKER_LEFT_REFS, unbilled: [DEEPSEEK] });
    const runId = run.debate.runId;
    // DeepSeek answered nothing after its claim probe: GLM argued alone.
    expect(run.gates.requests.filter((request) => request.model === DEEPSEEK && request.kind !== "PROBE")
      .every((request) => request.answer === "UNBILLED")).toBe(true);
    const { answer } = await harness.servedAnswer(run.debate, run.result.answerId);
    expect(["SERVED", "DOWNGRADED"]).toContain(answer!.terminal);
    expect((await callKeys(runId)).filter((key) => key.startsWith("VERDICT:judge:"))).toEqual([]);
    expect(await votesOf(runId)).toEqual([]);
    expect(answer!.verdict_state).toBe("CONTESTED");
    expect(answer!.condition_mark_records.filter((record) => record.mark === "VERDICT-JUDGES-UNAVAILABLE").map((record) => record.reason))
      .toEqual(["VERDICT_JUDGES_UNAVAILABLE:ONE_ANSWER"]);
    expect((await receiptOf(runId)).verdictLabel).toMatchObject({ label: "CONTESTED", rung: 5, trigger: "JUDGES_UNAVAILABLE" });
  }, 15 * 60 * 1000);

  it("a money stop at judging: an answer, labelled at most Close call, every judge recorded as failed", async () => {
    const run = await argueEngine2({ label: "e2-money-stop",
      before: (request) => request.kind === "VERDICT_JUDGE" ? { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" } : null });
    const runId = run.debate.runId;
    const judgeRequests = run.gates.requests.filter((request) => request.kind === "VERDICT_JUDGE");
    expect(judgeRequests.length).toBeGreaterThan(0);
    expect(judgeRequests.every((request) => request.answer === "STOPPED")).toBe(true);
    const { answer } = await harness.servedAnswer(run.debate, run.result.answerId);
    expect(["SERVED", "DOWNGRADED"]).toContain(answer!.terminal);
    expect(answer!.verdict_state).toBe("CONTESTED");
    expect(marksOf(answer!)).toContain("VERDICT-JUDGES-UNAVAILABLE");
    expect((await receiptOf(runId)).verdictLabel).toMatchObject({ label: "CONTESTED", rung: 5, trigger: "JUDGES_UNAVAILABLE" });
    const votes = await votesOf(runId);
    expect(votes).toHaveLength(3);
    for (const vote of votes) expect(vote).toMatchObject({ chosen_letter: null, counted: false, not_counted_reason: "JUDGE_FAILED" });
  }, 15 * 60 * 1000);

  it("a split: stored and served as SPLIT, with the story's basis saying so; a review catch-up's version keeps SPLIT", async () => {
    const run = await argueEngine2({ label: "e2-split", before: firstShown });
    const runId = run.debate.runId;
    const votes = await votesOf(runId);
    expect(new Set(votes.map((vote) => vote.chosen_letter)).size).toBe(3);
    // B3 carry (Minor 3): the runner's persist of a SPLIT answer, through the real database.
    expect(await rows<{ verdict_state: string | null }>("SELECT verdict_state FROM serve.answer WHERE answer_id=$1", run.result.answerId))
      .toEqual([{ verdict_state: "SPLIT" }]);
    const { answer, story } = await harness.servedAnswer(run.debate, run.result.answerId);
    expect(answer!.verdict_state).toBe("SPLIT");
    const receipt = await receiptOf(runId);
    expect(receipt.verdictLabel.label).toBe("SPLIT");
    expect(["JUDGES_NO_MAJORITY", "JUDGES_VOTES_IGNORED"]).toContain(receipt.verdictLabel.trigger);
    if (receipt.verdictLabel.trigger === "JUDGES_VOTES_IGNORED") expect(marksOf(answer!)).toContain("VERDICT-VOTES-IGNORED");
    expect(story!.verdictBasis).toMatchObject({ label: "SPLIT", rung: 5 });
    // The catch-up's version of the served SPLIT answer: the judges' winner and label stand (the persist accepts SPLIT).
    const source = await new ServeRepository(database.pool).readReviewCatchUpSource(runId);
    const candidate = await catchUpDependencies().prepareVersion({ runId, answerId: source.answerId, fromVersion: source.answerVersion });
    const persisted = await candidate.persist();
    expect(persisted.answerVersion).toBe(2);
    expect(await rows<{ answer_version: number; verdict_state: string | null }>(
      "SELECT answer_version, verdict_state FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version", run.result.answerId))
      .toEqual([{ answer_version: 1, verdict_state: "SPLIT" }, { answer_version: 2, verdict_state: "SPLIT" }]);
    expect((await receiptOf(runId)).verdictLabel).toMatchObject({ label: "SPLIT", rung: 5 });
  }, 15 * 60 * 1000);

  it("a split floor: the owner's record keeps SPLIT, and the review catch-up keeps the judges' floor", async () => {
    const run = await argueEngine2({ label: "e2-split-floor", before: firstShown, noDigest: true });
    const runId = run.debate.runId;
    // The sealed answer is components-only and carries no label; the label lives on its floor.
    expect(await rows<{ answer_version: number; verdict_state: string | null }>(
      "SELECT answer_version, verdict_state FROM serve.answer WHERE answer_id=$1", run.result.answerId))
      .toEqual([{ answer_version: 1, verdict_state: null }]);
    const receipt = await receiptOf(runId);
    expect(receipt.verdictLabel.label).toBe("SPLIT");
    const disclosure = new ServeDisclosureRepository(database.pool);
    const ownership = { ownerRef: null, legacyAskerId: run.debate.askerId };
    expect((await disclosure.readLatestForAnswer({ answerId: run.result.answerId, ownership }))?.row).toMatchObject({
      answerVersion: 1, floorVerdictState: "SPLIT", floorLeadingNodeId: receipt.servedNodeId, floorBasisIncomplete: false
    });
    // The catch-up re-reads standing; under engine 2 the judges' winner and label stand as stored, and no label controls
    // are read (B5's short-circuit, Ruling PF-R2b7.2 (a)): this database has no register rows (pre-flight PF-R2b7.2).
    const source = await new ServeRepository(database.pool).readReviewCatchUpSource(runId);
    const candidate = await catchUpDependencies().prepareVersion({ runId, answerId: source.answerId, fromVersion: source.answerVersion });
    expect(candidate.floorBefore).toEqual({ leadingNodeId: receipt.servedNodeId, verdictState: "SPLIT" });
    expect(candidate.floorAfter).toEqual(candidate.floorBefore);
    expect(catchUpFloorWouldMove(candidate.floorBefore, candidate.floorAfter)).toBe(false);
    await candidate.persist();
    expect((await disclosure.readLatestForAnswer({ answerId: run.result.answerId, ownership }))?.row)
      .toMatchObject({ answerVersion: 1, floorVerdictState: "SPLIT", floorLeadingNodeId: receipt.servedNodeId });
  }, 15 * 60 * 1000);

  // B6 carry (ruling R2b-B6.1): the owner's panel letters each answer by its plan place, so a root that sat out in the
  // MIDDLE (B) never shifts the letters of the answers after it. Every judge votes for the last letter it was shown (E):
  // a panel that lettered the saved roots in order would know no E and count no vote.
  it("a middle answer sat out: the judges see A, C, D, E, and the owner's panel counts the votes the served verdict counted", async () => {
    const shown: string[][] = [];
    const lastShown: Before = (request, chat) => {
      if (request.kind !== "VERDICT_JUDGE") return null;
      const letters = [...comparingJudgeLettersShown(chat)].sort();
      shown.push(letters);
      return { content: stubComparingJudgeVote(letters.at(-1)!) };
    };
    const run = await argueEngine2({ label: "e2-middle-sat-out", panelRefs: FIVE_MAKER_REFS, pin: MIDDLE_SITS_OUT_PIN,
      unbilled: [GLM], before: lastShown });
    const runId = run.debate.runId;
    // GLM's root (B) was never authored: four answers, and every judge was shown the same four letters.
    expect((await callKeys(runId, "OK")).filter((key) => key === "JUDGE:root:1")).toEqual([]);
    expect(shown.length).toBeGreaterThan(0);
    for (const letters of shown) expect(letters).toEqual(["A", "C", "D", "E"]);
    const votes = await votesOf(runId);
    expect(votes.length).toBeGreaterThan(0);
    const counted = votes.filter((vote) => vote.counted);
    const { answer } = await harness.servedAnswer(run.debate, run.result.answerId);
    expect(["SERVED", "DOWNGRADED"]).toContain(answer!.terminal);
    const receipt = await receiptOf(runId);
    expect(receipt.rule).toBe(SERVED_ROOT_SELECTION_RULE_JUDGES);
    expect(answer!.verdict_state).toBe(receipt.verdictLabel.label);
    // The panel's numbers are the served verdict's: as many seated and counted judges, the counted votes on E's answer.
    expect(answer!.judges_comparison).toMatchObject({ judges_seated: votes.length, judges_counted: counted.length });
    const answeredE = votes.filter((vote) => vote.chosen_letter === "E");
    expect(answeredE.length).toBeGreaterThan(0);
    const rootE = answeredE[0]!.chosen_root_node_id!;
    expect(answer!.judges_comparison!.answers.find((entry) => entry.root_node_id === rootE)?.judges_chose).toBe(counted.length);
    expect(answer!.judges_comparison!.answers).toHaveLength(4);
    if (counted.length > 0) expect(receipt.servedNodeId).toBe(rootE);
  }, 15 * 60 * 1000);

  // (pre-flight PF-R2b7.7) "fails" too: the controller-corrected weighting (holds 1 > dead end 0.66 > fails about 0.46,
  // spec §4.2b and §17; a ruling supersedes the INTERFACE's investigation weight here) reads a failed point as disputed:
  // stored FAILS, basis established, the point kept, and no reduced-weight record (its links stay at 0.66 by A6's rule).
  it.each([["dead_end", "DEAD_END"], ["holds", "HOLDS"], ["fails", "FAILS"]] as const)(
    "a cannot-assess point is investigated once (%s): kept at reduced weight, resolved, or read as disputed", async (outcome, result) => {
      let sent = false;
      const before: Before = (request, chat) => {
        // A point (it sources an edge), never a root: the first such review the gates see cannot assess it.
        if (request.kind === "REVIEW" && !sent && requestedReviewEdges(chat).length > 0) {
          sent = true;
          return { content: withRequestDerivedBearings(reviewArtifact("cannot-assess", ["The reviewer could not tell whether this point holds."]), chat) };
        }
        return request.kind === "INVESTIGATE" ? { content: stubPointInvestigation(outcome) } : null;
      };
      const run = await argueEngine2({ label: `e2-investigate-${outcome}`, before });
      const runId = run.debate.runId;
      const unassessed = await rows<{ node_id: string; author_maker: string; reviewer_maker: string }>(`SELECT review.node_id::text AS node_id,
          author.maker AS author_maker, reviewer.maker AS reviewer_maker
        FROM ledger.node_review AS review
        JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
        JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
        WHERE review.run_id=$1 AND review.outcome='cannot-assess'`, runId);
      expect(unassessed).toHaveLength(1);
      const point = unassessed[0]!;
      const investigations = await rows<{ node_id: string; investigation_order: number; result: string; basis: string | null;
        maker: string | null; standings_moved: boolean | null }>(`SELECT node_id::text AS node_id, investigation_order, result, basis,
          maker, standings_moved FROM ledger.point_investigation WHERE run_id=$1`, runId);
      expect(investigations).toHaveLength(1);
      expect(investigations[0]).toMatchObject({ node_id: point.node_id, investigation_order: 1, result,
        basis: outcome === "dead_end" ? "none" : "established" });
      expect(typeof investigations[0]!.standings_moved).toBe("boolean");
      expect([point.author_maker, point.reviewer_maker]).not.toContain(investigations[0]!.maker);
      expect((await callKeys(runId, "OK")).filter((key) => key.startsWith("VERDICT:investigate:"))).toEqual(["VERDICT:investigate:1"]);
      // The point is kept in the debate (engine 1 would hide it when nothing judged feeds it).
      const { answer } = await harness.servedAnswer(run.debate, run.result.answerId);
      expect(answer!.nodes.map((node) => node.node_id)).toContain(point.node_id);
      const records = answer!.condition_mark_records as readonly { mark: string; subject_ref: string | null }[];
      expect(records.filter((record) => record.mark === "HIDDEN-UNJUDGEABLE" && record.subject_ref === point.node_id)).toEqual([]);
      const reduced = records.filter((record) => record.mark === "UNASSESSED-AT-REDUCED-WEIGHT" && record.subject_ref === point.node_id);
      expect(reduced).toHaveLength(outcome === "dead_end" ? 1 : 0);
    }, 15 * 60 * 1000);
});
