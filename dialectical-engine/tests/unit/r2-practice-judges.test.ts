// tests/unit/r2-practice-judges.test.ts
// Engine redesign R2, Task B11 (INTERFACE §15.4; owner D1): the practice report's comparing-judges block — each vote,
// the label with its trigger, what today's ladder would say over the same final strengths, the judging step's wall
// time, and whether a conditional answer won (D1). Counts and codes only; engine 1 keeps today's report keys. Which votes
// count is recounted from the stored rows (controller ruling R2b-B5.1), never read from the stored `counted` hint.
import { describe, expect, it } from "vitest";
import { comparingJudgeCallSiteKey, pointInvestigationCallSiteKey } from "@debateai/kernel";
import {
  computeStructuralCeilingBasis, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  resolveLengthGuidance
} from "@debateai/register";
import { engine1LadderOf } from "../../apps/runner/src/index.js";
import {
  PRACTICE_JUDGE_ROOTS_SQL, PRACTICE_JUDGE_VOTES_SQL, PRACTICE_JUDGE_WINDOW_SQL, PRACTICE_JUDGES_RECEIPT_SQL,
  practiceConditionalWinner, practiceJudgesBlocks, practiceJudgesLines, readPracticeJudges, type PracticeJudgesFacts
} from "../../tools/preview-practice/practice-judges.js";
import { recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import { debateReport, reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import type { PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const LENGTH = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const ENGINE_BASIS = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 1, length: LENGTH,
  engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: 4, mapOpening: false }) });
const TODAY_BASIS = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 1 });
const CONTROLS = Object.freeze({ gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 });
/** The served answer's root (letter B, the plan's second place). */
const SERVED = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
/** The run's two answers: A argued by zhipu (the first position's call, `JUDGE`), B by moonshot (`JUDGE:root:secondary`). */
const ROOTS: PracticeJudgesFacts["roots"] = Object.freeze([
  { node_id: OTHER, maker: "zhipu", call_site_key: "JUDGE" },
  { node_id: SERVED, maker: "moonshot", call_site_key: "JUDGE:root:secondary" }
]);

const VOTES: PracticeJudgesFacts["votes"] = Object.freeze([
  { judge_seat: 1, maker: "deepseek", model_id: "deepseek-ai/DeepSeek-V4.1-Flash", chosen_letter: "B", chosen_root_node_id: SERVED,
    conditional: false, question_kind: "factual", same_as: [] },
  { judge_seat: 2, maker: "xiaomi", model_id: "XiaomiMiMo/MiMo-V2.6-Pro", chosen_letter: "B", chosen_root_node_id: SERVED,
    conditional: true, question_kind: "factual", same_as: [] },
  { judge_seat: 3, maker: "anthropic", model_id: "claude-haiku-5-5", chosen_letter: null, chosen_root_node_id: null,
    conditional: null, question_kind: null, same_as: [] }
]);
const FACTS: PracticeJudgesFacts = Object.freeze({
  votes: VOTES,
  roots: ROOTS,
  servedRootSelection: Object.freeze({
    rule: "comparing-judges-votes-honest-strength-tiebreak", servedNodeId: SERVED,
    verdictLabel: { label: "CONTESTED", rung: 5, trigger: "JUDGES_MAJORITY", basisAbsence: [] },
    engine1Ladder: { label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT" },
    judgesGroups: []
  }),
  judgeWindow: Object.freeze({ firstStarted: new Date("2026-10-16T10:00:00.000Z"), lastFinished: new Date("2026-10-16T10:01:14.240Z") })
});

/** A pool that answers the reader's five statements by their text, and fails on any other. */
function poolOf(basis: unknown) {
  const asked: string[] = [];
  const pool = {
    query: async (sql: string, params: readonly unknown[]) => {
      asked.push(sql);
      expect(params).toEqual(["run-1"]);
      if (sql === "SELECT envelope_basis FROM core.run WHERE run_id=$1") return { rows: [{ envelope_basis: basis }] };
      if (sql === PRACTICE_JUDGE_VOTES_SQL) return { rows: VOTES };
      if (sql === PRACTICE_JUDGE_ROOTS_SQL) return { rows: ROOTS };
      if (sql === PRACTICE_JUDGES_RECEIPT_SQL) return { rows: [{ served_root_selection: FACTS.servedRootSelection }] };
      if (sql === PRACTICE_JUDGE_WINDOW_SQL) {
        return { rows: [{ first_started: FACTS.judgeWindow!.firstStarted, last_finished: FACTS.judgeWindow!.lastFinished }] };
      }
      throw new Error(`unexpected statement: ${sql}`);
    }
  };
  return { pool: pool as never, asked };
}

describe("R2 B11: the comparing judges' block of the practice report", () => {
  it("reads an engine-2 run's votes, answers, receipt and judging window; an engine-1 run reads nothing more", async () => {
    const engine2 = poolOf(ENGINE_BASIS);
    expect(await readPracticeJudges(engine2.pool, "run-1")).toEqual(FACTS);
    const engine1 = poolOf(TODAY_BASIS);
    expect(await readPracticeJudges(engine1.pool, "run-1")).toBeNull();
    expect(engine1.asked).toEqual(["SELECT envelope_basis FROM core.run WHERE run_id=$1"]);
  });

  it("never selects the stored counted hint or the reasons; skips a set-aside copy's answers", () => {
    expect(PRACTICE_JUDGE_VOTES_SQL).not.toMatch(/counted|content|reasons/u);
    // R2b final wave P11 (B11 Minor 2): votes are read whole, one row per seat: never joined to the nodes, never
    // stale-filtered (a reused vote names a dead copy's root, lettered by plan place).
    expect(PRACTICE_JUDGE_VOTES_SQL).not.toMatch(/core\.node|stale/u);
    expect(PRACTICE_JUDGE_ROOTS_SQL).toContain("root.generation_status IS DISTINCT FROM 'stale'");
    expect(PRACTICE_JUDGE_ROOTS_SQL).toContain("root.parent_node_id IS NULL");
  });

  it("each vote, the label with its trigger, today's ladder's label, the judging time to a tenth of a second, D1's count", () => {
    expect(practiceJudgesBlocks(FACTS)).toEqual({
      judgeVotes: [
        { model: "deepseek-ai/DeepSeek-V4.1-Flash", maker: "deepseek", letter: "B", conditional: false, counted: true,
          notCountedReason: null, questionKind: "factual" },
        { model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "xiaomi", letter: "B", conditional: true, counted: true,
          notCountedReason: null, questionKind: "factual" },
        { model: "claude-haiku-5-5", maker: "anthropic", letter: null, conditional: null, counted: false,
          notCountedReason: "JUDGE_FAILED", questionKind: null }
      ],
      labels: { label: "CONTESTED", trigger: "JUDGES_MAJORITY", engine1LadderLabel: "SUPPORTED" },
      judgesSeconds: 74.2,
      // D1: 1 of the 2 counted voters for B (the winning group, no grouping) said conditional: no majority.
      conditionalWinner: false
    });
    // No judge called (one maker, or every judge refused before the vendor): no window, no time.
    expect(practiceJudgesBlocks({ ...FACTS, judgeWindow: null }).judgesSeconds).toBeNull();
    // A receipt without the ladder's record (or no receipt) says so, never guesses.
    expect(practiceJudgesBlocks({ ...FACTS, servedRootSelection: { verdictLabel: { label: "SPLIT", trigger: "JUDGES_NO_MAJORITY" } } }).labels)
      .toEqual({ label: "SPLIT", trigger: "JUDGES_NO_MAJORITY", engine1LadderLabel: null });
    expect(practiceJudgesBlocks({ ...FACTS, servedRootSelection: null }).labels).toBeNull();
  });

  // Pre-flight PF-R2b6.10 (owner D1), counted by the recount (controller ruling R2b-B5.1).
  it("D1: a conditional winner counts the judges who chose the winning group, grouped letters included", () => {
    const row = (seat: number, letter: string, root: string, conditional: boolean, sameAs: readonly (readonly string[])[] = []) =>
      Object.freeze({ judge_seat: seat, maker: `maker-${String(seat)}`, model_id: `model-${String(seat)}`, chosen_letter: letter,
        chosen_root_node_id: root, conditional, question_kind: "general", same_as: sameAs });
    const served = (votes: PracticeJudgesFacts["votes"]): PracticeJudgesFacts => ({ ...FACTS, votes,
      servedRootSelection: { servedNodeId: SERVED, verdictLabel: { label: "CONTESTED", trigger: "JUDGES_MAJORITY" } } });
    // Two of the three seated judges name A and B as one answer: the count groups them. Three voters for the winning
    // group, two conditional: a conditional winner.
    const grouped = [row(1, "A", OTHER, true, [["A", "B"]]), row(2, "B", SERVED, true, [["A", "B"]]), row(3, "B", SERVED, false)];
    expect(practiceConditionalWinner(served(grouped))).toBe(true);
    expect(practiceJudgesBlocks(served(grouped)).conditionalWinner).toBe(true);
    // Only one judge groups them (no majority of the seated): B's two voters, one conditional: no majority.
    const single = [row(1, "A", OTHER, true, [["A", "B"]]), row(2, "B", SERVED, true), row(3, "B", SERVED, false)];
    expect(practiceJudgesBlocks(served(single)).conditionalWinner).toBe(false);
    // No receipt: not recorded.
    expect(practiceJudgesBlocks({ ...served(grouped), servedRootSelection: null }).conditionalWinner).toBeNull();
    // Every vote ignored (each judge chose its own maker's answer): no counted voter, so no conditional winner. Two
    // judges, one per arguing maker: never two judges of one maker (ruling W2).
    const ownMaker = served(single.slice(0, 2).map((vote) => ({ ...vote, maker: vote.chosen_letter === "A" ? "zhipu" : "moonshot" })));
    expect(practiceJudgesBlocks(ownMaker).judgeVotes.map((vote) => [vote.counted, vote.notCountedReason]))
      .toEqual([[false, "OWN_MAKER"], [false, "OWN_MAKER"]]);
    expect(practiceJudgesBlocks(ownMaker).conditionalWinner).toBe(false);
  });

  // R2b final wave P11 (B11 Minor 3): the answers A and C (B sat out); the join also finds another call for A's artifact.
  // Only a root author call's key is read as a plan place, so A stays letter A and C letter C, and the votes count.
  it("reads only root author calls' keys as plan places, so another call for a root's artifact cannot hide the count", () => {
    const votes = VOTES.map((vote) => vote.chosen_letter === null ? vote : { ...vote, chosen_letter: "C" });
    const facts = { ...FACTS, votes, roots: Object.freeze([
      { node_id: OTHER, maker: "zhipu", call_site_key: "JUDGE" },
      { node_id: OTHER, maker: "zhipu", call_site_key: "JUDGE:critic:0:seat:main" },
      { node_id: SERVED, maker: "moonshot", call_site_key: "JUDGE:root:2" }
    ]) };
    expect(practiceJudgesBlocks(facts).judgeVotes.map((vote) => [vote.letter, vote.counted]))
      .toEqual([["C", true], ["C", true], [null, false]]);
  });

  it("follows the recount, never a stored counted hint that drifted after a resume", () => {
    // The stored rows claim seat 1 was ignored and seat 3 (B's own maker, moonshot) counted: the hint drifted. The
    // reader never selects it; even handed it, the block reports the recount.
    const drifted = Object.freeze({ ...FACTS, votes: Object.freeze([
      { ...VOTES[0]!, counted: false, not_counted_reason: "OWN_MAKER" },
      { ...VOTES[1]!, counted: true, not_counted_reason: null },
      { ...VOTES[1]!, judge_seat: 3, maker: "moonshot", conditional: true, counted: true, not_counted_reason: null }
    ]) }) as unknown as PracticeJudgesFacts;
    const blocks = practiceJudgesBlocks(drifted);
    expect(blocks.judgeVotes.map((vote) => [vote.counted, vote.notCountedReason]))
      .toEqual([[true, null], [true, null], [false, "OWN_MAKER"]]);
    // Read from the hint, seats 2 and 3 (both conditional) would make a conditional winner; recounted, seats 1 and 2
    // (one conditional) do not.
    expect(blocks.conditionalWinner).toBe(false);
  });

  it("letters each answer by its plan place: a root that sat out leaves a gap, a reused vote's letter names its answer", () => {
    // Plan places 0 and 2 (A and C; B sat out). Seat 1's row was reused after a re-claim: its root is the dead copy's
    // (set aside, not read), its letter C names the served answer.
    const C = SERVED;
    const roots = [{ node_id: OTHER, maker: "zhipu", call_site_key: "JUDGE" }, { node_id: C, maker: "moonshot", call_site_key: "JUDGE:root:2" }];
    const dead = "00000000-0000-4000-8000-0000000000dd";
    const votes = [
      { ...VOTES[0]!, chosen_letter: "C", chosen_root_node_id: dead, conditional: true },
      { ...VOTES[1]!, chosen_letter: "C", chosen_root_node_id: C, conditional: true },
      { ...VOTES[2]!, judge_seat: 3, maker: "anthropic", chosen_letter: "A", chosen_root_node_id: OTHER, conditional: false,
        question_kind: "factual" }
    ];
    const blocks = practiceJudgesBlocks({ ...FACTS, roots, votes });
    expect(blocks.judgeVotes.map((vote) => vote.counted)).toEqual([true, true, true]);
    expect(blocks.conditionalWinner).toBe(true);
    // Without any author call's key nothing shows the plan places, and letter C sits past the two saved answers: no
    // honest letters, so nothing is counted rather than counted wrong.
    const unplaced = practiceJudgesBlocks({ ...FACTS, roots: roots.map((root) => ({ ...root, call_site_key: null })), votes });
    expect(unplaced.judgeVotes.map((vote) => vote.counted)).toEqual([null, null, null]);
    expect(unplaced.conditionalWinner).toBeNull();
    expect(practiceJudgesLines(unplaced).join("\n")).toContain("| not recounted |");
  });

  it("report.md says it in counts and codes, never a judge's reasons", () => {
    const text = practiceJudgesLines(practiceJudgesBlocks(FACTS)).join("\n");
    expect(text).toContain("- label: CONTESTED (JUDGES_MAJORITY); today's ladder over the same final strengths would say: SUPPORTED");
    expect(text).toContain("- judging took 74.2 s");
    expect(text).toContain("- conditional winner: no (a majority of the counted judges who chose the winning answer called it conditional)");
    expect(text).toContain("| XiaomiMiMo/MiMo-V2.6-Pro | xiaomi | B | yes | yes | factual |");
    expect(text).toContain("| claude-haiku-5-5 | anthropic | - | - | no (JUDGE_FAILED) | - |");
  });

  it("the debate report carries the four members for engine 2 only; engine 1 keeps today's keys", () => {
    const none = { before: null, after: null };
    const base = {
      register: null, questionId: "en-nuclear", depth: 1,
      admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
      run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null,
        answer: { served: true, terminal: "SERVED", serveState: null, verdictState: "CONTESTED", conditionMarks: [] },
        story: { outcome: "READY", failureCode: null } },
      byModelAndSite: [], probes: [], failures: [], formatFailures: 0, callsByModel: {}, answersByModel: {}, jsonRepairs: [],
      failedCalls: 0, refusedCalls: 0, remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 }
    };
    const reportOf = (result: unknown) => debateReport({ result: result as PracticeDebateResult, observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1000) });
    const today = reportOf(base);
    for (const key of ["judgeVotes", "labels", "judgesSeconds", "conditionalWinner"]) expect(Object.hasOwn(today, key), key).toBe(false);
    expect(reportMarkdown(today)).not.toContain("Comparing judges");
    const engine2 = reportOf({ ...base, judges: practiceJudgesBlocks(FACTS) });
    expect(engine2).toMatchObject({ labels: { label: "CONTESTED", trigger: "JUDGES_MAJORITY", engine1LadderLabel: "SUPPORTED" },
      judgesSeconds: 74.2, conditionalWinner: false });
    expect(engine2.judgeVotes).toHaveLength(3);
    expect(reportMarkdown(engine2)).toContain("Comparing judges (engine 2: the label comes from their votes; counts and codes only):");
    expect(reportMarkdown(engine2)).toContain("- conditional winner: no");
  });
});

describe("R2 B11: the investigator's and the judges' refused replies re-check with their own step's reading", () => {
  const judgeReply = { best: "A", conditional: false, same_as: [], reasons: "r", question_kind: "general" };
  const investigatorReply = { missing: "m", found: "f", basis: "established", outcome: "holds", reason: "r" };
  it("a comparing judge's reply", () => {
    expect(recheckReply(comparingJudgeCallSiteKey(1), JSON.stringify(judgeReply))).toEqual({ family: "VERDICT_JUDGE", issues: [] });
    const refused = recheckReply(comparingJudgeCallSiteKey(2), JSON.stringify({ ...judgeReply, best: "Z" }));
    expect(refused.family).toBe("VERDICT_JUDGE");
    expect(refused.issues.length).toBeGreaterThan(0);
    expect(refused.issues).not.toContain("UNMAPPED");
    // A structure repair of a judge's call is checked as the judge's step; its own family stays STRUCTURE_REPAIR.
    const repaired = recheckReply(`REPAIR:STRUCTURE:${comparingJudgeCallSiteKey(2)}`, JSON.stringify({ ...judgeReply, conditional: "no" }));
    expect(repaired.family).toBe("STRUCTURE_REPAIR");
    expect(repaired.issues.length).toBeGreaterThan(0);
    expect(repaired.issues).not.toContain("UNMAPPED");
  });
  it("an investigator's reply, its one content rule included", () => {
    expect(recheckReply(pointInvestigationCallSiteKey(1), JSON.stringify(investigatorReply))).toEqual({ family: "INVESTIGATOR", issues: [] });
    const mismatch = recheckReply(pointInvestigationCallSiteKey(1), JSON.stringify({ ...investigatorReply, basis: "none" }));
    expect(mismatch).toEqual({ family: "INVESTIGATOR", issues: ["POINT_INVESTIGATION_BASIS_MISMATCH@basis"] });
    const refused = recheckReply(pointInvestigationCallSiteKey(2), JSON.stringify({ ...investigatorReply, outcome: "maybe" }));
    expect(refused.issues.length).toBeGreaterThan(0);
    expect(refused.issues).not.toContain("UNMAPPED");
  });
});

describe("R2 B11: today's ladder over the same final strengths (runner, record only)", () => {
  const root = (nodeId: string, panelDispersion: number | null) => Object.freeze({ nodeId, panelDispersion });
  it("labels the strength leader exactly as engine 1 would", () => {
    // Leader 0.8, runner-up 0.5, a low dispersion: rung 3.
    expect(engine1LadderOf([root("a", 0.1), root("b", 0.1)], [{ nodeId: "a", strength: 0.8 }, { nodeId: "b", strength: 0.5 }], CONTROLS))
      .toEqual({ label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT" });
    // A tie: margin 0 is within gamma (rung 2).
    expect(engine1LadderOf([root("a", 0.1), root("b", 0.1)], [{ nodeId: "a", strength: 0.6 }, { nodeId: "b", strength: 0.6 }], CONTROLS))
      .toEqual({ label: "CONTESTED", rung: 2, trigger: "MARGIN_WITHIN_GAMMA" });
    // One root: no margin (rung 0); the leader's missing dispersion is ABSENT, never a number.
    expect(engine1LadderOf([root("a", null)], [{ nodeId: "a", strength: 0.9 }], CONTROLS))
      .toEqual({ label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE" });
    // Below the low cut.
    expect(engine1LadderOf([root("a", 0.1), root("b", 0.1)], [{ nodeId: "a", strength: 0.3 }, { nodeId: "b", strength: 0.1 }], CONTROLS))
      .toEqual({ label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT" });
  });
});
