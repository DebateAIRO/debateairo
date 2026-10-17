// tests/unit/r2-rescore.test.ts
// R2 (E12; INTERFACE §15.3): the `rescore` practice mode. It first gives back exactly what the engine served (|Δ| ≤ 1e-9,
// else PRACTICE_RESCORE_ENGINE1_MISMATCH); then it sweeps the cannot-assess weight over 0.5 / 0.66 / 0.75 / 1.0, with the
// investigations' outcomes applied and not, through the runner's own pure functions; an older transcript is rebuilt from
// its answer and its calls, or listed with what it lacks; no AI call, no money, no database.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reviewPromptContract } from "@debateai/judgement";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import { buildFramedPrompt } from "@debateai/providers";
import { engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import { selectServedRootByStrength } from "@debateai/runner";
import { runPractice } from "../../tools/preview-practice/practice.js";
import type { TranscriptEngineGraph } from "../../tools/preview-practice/practice-engine-graph.js";
import {
  PRACTICE_RESCORE_START_POLICY_FILE,
  PRACTICE_RESCORE_SWEEP,
  engineGraphFromOlderTranscript,
  reproduceServedPropagation,
  rescoreTranscripts,
  runPracticeRescore,
  type PracticeRescoreRow
} from "../../tools/preview-practice/practice-rescore.js";

const SETTINGS = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 5, mapOpening: false });
const A = "node-a"; const B = "node-b"; const P1 = "node-p1"; const P2 = "node-p2";
const CLAIM: Readonly<Record<string, string>> = { [A]: "Answer A.", [B]: "Answer B.", [P1]: "B fails here.", [P2]: "A fails there." };
const AUTHOR: Readonly<Record<string, string>> = { [A]: "m1", [B]: "m2", [P1]: "m1", [P2]: "m2" };
/** Another maker's grade per point (its honest score); every author grades its own point 0.1 (left out, E10). */
const GRADE: Readonly<Record<string, number>> = { [A]: 0.8, [B]: 0.8, [P1]: 0.6, [P2]: 0.9 };
/** The engine-1 taus the fixture served (any numbers: the honest scores come from the voices). */
const ENGINE1_BASE: Readonly<Record<string, number>> = { [A]: 0.9, [B]: 0.75, [P1]: 0.5, [P2]: 0.95 };

/** Every measure at g (equal weights give 0.142857 × (6g + 1); no flag; fidelity ≥ 0.5). */
const assessment = (g: number) => ({
  steelman: { summary: "Restated.", fidelity: g },
  critic: { summary: "Countered.", counterargumentStrength: 1 - g, basis: "REAL_ATTACK" as const },
  evidence: { quality: g, relevance: g }, context: { fit: g, ambiguityFlags: [] as string[] },
  fallacy: { severity: 1 - g, fatalFlags: [] as { type: string; severity: number; description: string }[] }
});
const authored = (statement: string, g: number) => JSON.stringify({ statement, way_of_knowing: "REASONING", locator: null,
  restatement_text: `${statement} (restated)`, restatement_status: "PASS", value_laden: false, ...assessment(g) });
const graded = (g: number) => JSON.stringify(assessment(g));

/** Engine 1 as served: P2 hidden; P1's attack on B measured at 1. The final strengths come from propagation itself. */
function servedEngineOne(): Readonly<{ finals: Record<string, number>; root: string }> {
  const snapshot: EvaluationSnapshot = {
    nodes: [A, B, P1].map((nodeId) => ({ nodeId, baseStrength: ENGINE1_BASE[nodeId]!, parentNodeId: nodeId === P1 ? B : null })),
    arrows: [{ arrowId: "e1", sourceNodeId: P1, targetKind: "NODE", targetNodeId: B, targetEdgeId: null, polarity: "attack", kind: null,
      strength: 1, magnitudeStatus: "MEASURED", strengthSource: "REVIEWER" }],
    arrowOrder: ["e1"],
    operatorResolutions: [{ parentNodeId: B, operator: "accumulate", suppliedBy: "deployment" }],
    clusterRecords: []
  };
  const strengths = evaluate(snapshot).strengths;
  return { finals: Object.fromEntries(strengths.map((row) => [row.nodeId, row.strength])),
    root: selectServedRootByStrength([{ nodeId: A }, { nodeId: B }], strengths).root.nodeId };
}

function graph(investigations: TranscriptEngineGraph["investigations"] = []): TranscriptEngineGraph {
  const served = servedEngineOne();
  const node = (nodeId: string, parentNodeId: string | null, rootIndex: number, kind: "ROOT" | "POINT", hidden: boolean) =>
    // pre-flight consistency: A15's node carries `disputeFactorApplied` (false on engine 1, PF-R2a2.9).
    ({ nodeId, parentNodeId, rootIndex, authorMaker: AUTHOR[nodeId]!, kind, hidden, isFolder: false, disputeFactorApplied: false });
  const edge = (edgeId: string, from: string, to: string, bearing: number | null) => ({ edgeId, from, to, polarity: "attack" as const,
    bearing, ownReply: false, targetKind: "NODE" as const, targetEdgeId: null, kind: null, strengthSource: "REVIEWER" as const, clusterKey: null });
  return {
    engine: 1, engineReceipt: null,
    nodes: [node(A, null, 0, "ROOT", false), node(B, null, 1, "ROOT", false), node(P1, B, 1, "POINT", false), node(P2, A, 0, "POINT", true)],
    edges: [edge("e1", P1, B, 1), edge("e2", P2, A, null)],
    reviews: [{ nodeId: A, outcome: "agree", reviewerMaker: "m3" }, { nodeId: B, outcome: "agree", reviewerMaker: "m3" },
      { nodeId: P1, outcome: "agree", reviewerMaker: "m2" }, { nodeId: P2, outcome: "cannot-assess", reviewerMaker: "m3" }],
    voices: [A, B, P1, P2].flatMap((nodeId) => [
      { nodeId, judgementRef: `${nodeId}:author`, maker: AUTHOR[nodeId]!, isAuthor: true, assessment: assessment(0.1) },
      { nodeId, judgementRef: `${nodeId}:panel`, maker: "m3", isAuthor: false, assessment: assessment(GRADE[nodeId]!) }
    ]),
    investigations, unreadVoices: [],
    served: { baseStrength: { ...ENGINE1_BASE }, finalStrength: served.finals, servedRootNodeId: served.root }
  };
}
const transcriptText = (engineGraph: TranscriptEngineGraph | null, answer: unknown = null) => JSON.stringify({
  schema: "preview-practice-transcript-v1", writtenAt: "2026-10-16T00:00:00.000Z",
  run: { runId: "run-1", question: { id: "ro", text: "Which answer?" }, panel: REFS }, totals: {}, attempts: [],
  structure: { answer, inspection: null, story: null, ...(engineGraph === null ? {} : { engineGraph }) }, unavailable: []
});
const REFS = ["m1", "m2", "m3"].map((maker) => ({ providerRef: `ref-${maker}`, modelId: `model-${maker}`, maker }));

/** The same debate as an older transcript (before R2): no engine graph, only the answer and the calls. */
function older(): unknown {
  const served = servedEngineOne();
  let sequence = 0;
  const attempt = (callSiteKey: string, family: string, maker: string, content: string, messages: readonly unknown[] | null = null) => {
    sequence += 1;
    return { sequence, ledgerEntryId: `entry-${String(sequence)}`, callSiteKey, family, outcome: "OK", maker, providerRef: `ref-${maker}`,
      prompt: messages === null ? null : { fingerprint: "f", messages, text: null },
      reply: { content, vendorBody: null, vendorUsage: null }, parse: { status: "PARSED", finishReason: "stop" } };
  };
  const reviewPrompt = buildFramedPrompt({ contract: reviewPromptContract(1), material: [
    { name: "question_line", content: "Which answer?" }, { name: "statement", content: CLAIM[P2]! },
    { name: "edges_sourced_by_this_node", content: JSON.stringify([{ ordinal: 0, relation: "attack", target_statement: CLAIM[A] }]) }
  ] }).packet.messages;
  const answerNode = (nodeId: string) => ({ node_id: nodeId, claim: CLAIM[nodeId], base_score: { value: ENGINE1_BASE[nodeId] },
    final_strength: { value: served.finals[nodeId] }, review: { outcome: "agree", reasons: ["It holds."] } });
  return {
    schema: "preview-practice-transcript-v1", writtenAt: "2026-10-14T00:00:00.000Z",
    run: { runId: "run-old", question: { id: "ro", text: "Which answer?" }, panel: REFS }, totals: {},
    attempts: [
      attempt("JUDGE", "JUDGE", "m1", authored(CLAIM[A]!, 0.1)), attempt("JUDGE:root:secondary", "JUDGE", "m2", authored(CLAIM[B]!, 0.1)),
      attempt("JUDGE:critic:root1:r1:p0", "JUDGE", "m1", authored(CLAIM[P1]!, 0.1)),
      attempt("JUDGE:critic:root0:r1:p1", "JUDGE", "m2", authored(CLAIM[P2]!, 0.1)),
      attempt("PANEL:root:ref-m3", "PANEL", "m3", graded(GRADE[A]!)), attempt("PANEL:JUDGE:root:secondary:ref-m3", "PANEL", "m3", graded(GRADE[B]!)),
      attempt("PANEL:JUDGE:critic:root1:r1:p0:ref-m3", "PANEL", "m3", graded(GRADE[P1]!)),
      attempt("PANEL:JUDGE:critic:root0:r1:p1:ref-m3", "PANEL", "m3", graded(GRADE[P2]!)),
      attempt(`JUDGE:review:${P2}`, "REVIEW", "m3",
        JSON.stringify({ outcome: "cannot-assess", reasons: ["No source is given."], edge_bearings: [null] }), reviewPrompt)
    ],
    structure: { answer: { nodes: [A, B, P1].map(answerNode), edges: [{ edge_id: "e1", from_node_ref: P1, target_kind: "NODE", target_ref: B,
      relation: "attack", strength: { status: "PRESENT", number: { value: 1 } }, provenance_ref: "entry-3", placeholder: false }] },
      inspection: null, story: null },
    unavailable: []
  };
}

const leaders = (rows: readonly PracticeRescoreRow[], debate: string, applied: boolean) =>
  PRACTICE_RESCORE_SWEEP.cannotAssessWeights.map((weight) =>
    rows.find((row) => row.debate === debate && row.cannotAssessWeight === weight && row.investigationsApplied === applied)!);

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const tempFolder = () => { const folder = mkdtempSync(join(tmpdir(), "r2-rescore-")); folders.push(folder); return folder; };

describe("R2 rescore: engine 1 first, exactly", () => {
  it("gives back the served final strengths from the recorded base strengths and bearings", () => {
    expect(servedEngineOne().root).toBe(A);
    const check = reproduceServedPropagation(graph());
    expect(check.ok).toBe(true);
    expect(check.worstDelta).toBeLessThanOrEqual(1e-9);
  });

  it("lists a debate whose served numbers it cannot give back, and never rescores it", () => {
    const tampered = graph();
    const moved = { ...tampered, served: { ...tampered.served, finalStrength: { ...tampered.served.finalStrength, [B]: tampered.served.finalStrength[B]! + 1e-6 } } };
    expect(reproduceServedPropagation(moved).ok).toBe(false);
    const result = rescoreTranscripts([{ debate: "d3", text: transcriptText(moved) }], SETTINGS);
    expect(result.notRescored).toEqual([expect.objectContaining({ debate: "d3", code: "PRACTICE_RESCORE_ENGINE1_MISMATCH" })]);
    expect(result.rows).toEqual([]);
    expect(result.verdict).toBe("FAIL");
    expect(result.exitCode).toBe(20);
  });
});

describe("R2 rescore: the sweep (E12)", () => {
  it("scores every weight with the honest scores and the link rules, the author left out", () => {
    const result = rescoreTranscripts([{ debate: "d1", text: transcriptText(graph()) }], SETTINGS);
    expect(result.notRescored).toEqual([]);
    expect(result.rows).toHaveLength(8);
    for (const applied of [true, false]) {
      const rows = leaders(result.rows, "d1", applied);
      expect(rows.map((row) => row.leaderRootNodeId)).toEqual([A, A, B, B]);
      expect(rows.map((row) => row.leaderLetter)).toEqual(["A", "A", "B", "B"]);
      expect(rows.map((row) => row.leadChangedFromEngine1)).toEqual([false, false, true, true]);
      expect(rows.map((row) => row.leadChangedFromStart)).toEqual([false, false, true, true]);
      for (const row of rows) {
        expect(row.engine).toBe(1);
        expect(row.gaps).toHaveLength(1);
        expect(row.gaps[0]!).toBeGreaterThan(0);
      }
    }
    expect(result.start).toEqual({ cannotAssessWeight: 0.66, investigationsApplied: true });
    expect(result.verdict).toBe("PASS");
  });

  it("applies an investigation's outcome only in its own arm", () => {
    const result = rescoreTranscripts([{ debate: "d2", text: transcriptText(graph([{ nodeId: P2, result: "FAILS" }])) }], SETTINGS);
    expect(leaders(result.rows, "d2", true).map((row) => row.leaderRootNodeId)).toEqual([A, A, A, A]);
    expect(leaders(result.rows, "d2", false).map((row) => row.leaderRootNodeId)).toEqual([A, A, B, B]);
    expect(leaders(result.rows, "d2", false).map((row) => row.leadChangedFromStart)).toEqual([false, false, true, true]);
  });

  // (pre-flight PF-R2a10.3, PF-R2a10.4) The controller-corrected investigation weight, told apart from the old rule.
  it("weighs the three outcomes as ruled: holds > dead end > fails (a failed point is disputed AND stays at the swept weight)", () => {
    // P2's grader at 1.0 (honest 0.999999): not applied, its attack on A counts at w, so A leads only while w < 0.657.
    const strong = (investigations: TranscriptEngineGraph["investigations"]): TranscriptEngineGraph => {
      const base = graph(investigations);
      return { ...base, voices: base.voices.map((voice) => voice.nodeId === P2 && !voice.isAuthor ? { ...voice, assessment: assessment(1) } : voice) };
    };
    const rescored = (debate: string, investigations: TranscriptEngineGraph["investigations"]) =>
      rescoreTranscripts([{ debate, text: transcriptText(strong(investigations)) }], SETTINGS);
    const arm = (debate: string, investigations: TranscriptEngineGraph["investigations"], applied: boolean) =>
      leaders(rescored(debate, investigations).rows, debate, applied).map((row) => row.leaderRootNodeId);
    expect(arm("none", [], false)).toEqual([A, B, B, B]);
    expect(arm("holds", [{ nodeId: P2, result: "HOLDS" }], true)).toEqual([B, B, B, B]);    // full weight: 1.0 > 0.657
    expect(arm("dead", [{ nodeId: P2, result: "DEAD_END" }], true)).toEqual([A, B, B, B]);  // stays at w
    expect(arm("fails", [{ nodeId: P2, result: "FAILS" }], true)).toEqual([A, A, A, B]);    // 0.7 w: 0.35 / 0.462 / 0.525 / 0.7
    // The outcome counts each row carries (the same in both arms; PF-R2a10.4).
    expect(rescored("none", []).rows.map((row) => row.investigated)).toEqual(Array(8).fill({ holds: 0, fails: 0, deadEnd: 0 }));
    expect(rescored("holds", [{ nodeId: P2, result: "HOLDS" }]).rows[0]!.investigated).toEqual({ holds: 1, fails: 0, deadEnd: 0 });
    expect(rescored("dead", [{ nodeId: P2, result: "DEAD_END" }]).rows[0]!.investigated).toEqual({ holds: 0, fails: 0, deadEnd: 1 });
    expect(rescored("fails", [{ nodeId: P2, result: "FAILS" }]).rows.map((row) => row.investigated))
      .toEqual(Array(8).fill({ holds: 0, fails: 1, deadEnd: 0 }));
  });

  it("sums each setting up: debates, leads changed, the median gap", () => {
    const result = rescoreTranscripts([
      { debate: "d1", text: transcriptText(graph()) },
      { debate: "d2", text: transcriptText(graph([{ nodeId: P2, result: "FAILS" }])) }
    ], SETTINGS);
    expect(result.summary.map((row) => [row.cannotAssessWeight, row.investigationsApplied])).toEqual(
      [[0.5, true], [0.5, false], [0.66, true], [0.66, false], [0.75, true], [0.75, false], [1, true], [1, false]]);
    expect(result.summary.find((row) => row.cannotAssessWeight === 0.75 && !row.investigationsApplied)).toMatchObject(
      { debates: 2, leadsChangedFromEngine1: 2, leadsChangedFromStart: 2 });
    expect(result.summary.find((row) => row.cannotAssessWeight === 0.75 && row.investigationsApplied)).toMatchObject(
      { debates: 2, leadsChangedFromEngine1: 1, leadsChangedFromStart: 1 });
    for (const row of result.summary) expect(row.medianGap).toBeGreaterThan(0);
  });
});

describe("R2 rescore: what it reads", () => {
  it("rebuilds an older transcript from its answer and its calls, the hidden point included", () => {
    const rebuilt = engineGraphFromOlderTranscript(older());
    expect(rebuilt.nodes.map(({ nodeId, kind, rootIndex, hidden, parentNodeId }) => ({ nodeId, kind, rootIndex, hidden, parentNodeId }))).toEqual([
      { nodeId: A, kind: "ROOT", rootIndex: 0, hidden: false, parentNodeId: null },
      { nodeId: B, kind: "ROOT", rootIndex: 1, hidden: false, parentNodeId: null },
      { nodeId: P1, kind: "POINT", rootIndex: 1, hidden: false, parentNodeId: B },
      { nodeId: P2, kind: "POINT", rootIndex: 0, hidden: true, parentNodeId: A }
    ]);
    expect(rebuilt.voices.filter((voice) => !voice.isAuthor).map((voice) => voice.nodeId)).toEqual([A, B, P1, P2]);
    expect(rebuilt.reviews.find((review) => review.nodeId === P2)).toEqual({ nodeId: P2, outcome: "cannot-assess", reviewerMaker: "m3" });
    expect(rebuilt.served.servedRootNodeId).toBe(A);
    const result = rescoreTranscripts([{ debate: "old", text: JSON.stringify(older()) }, { debate: "d1", text: transcriptText(graph()) }], SETTINGS);
    expect(result.notRescored).toEqual([]);
    expect(leaders(result.rows, "old", false).map((row) => row.leaderRootNodeId)).toEqual(leaders(result.rows, "d1", false).map((row) => row.leaderRootNodeId));
  });

  it("lists what an input lacks, never skipped silently", () => {
    const unread = { ...graph(), unreadVoices: [{ nodeId: P2, judgementRef: "x" }] };
    const result = rescoreTranscripts([
      { debate: "broken", text: "{" },
      { debate: "no-answer", text: transcriptText(null) },
      { debate: "unread", text: transcriptText(unread) },
      { debate: "d1", text: transcriptText(graph()) }
    ], SETTINGS);
    expect(result.notRescored).toEqual([
      { debate: "broken", code: "PRACTICE_RESCORE_INPUT_INCOMPLETE", what: "json" },
      { debate: "no-answer", code: "PRACTICE_RESCORE_INPUT_INCOMPLETE", what: "structure.answer" },
      { debate: "unread", code: "PRACTICE_RESCORE_INPUT_INCOMPLETE", what: `voices ${P2}` }
    ]);
    expect(result.rows.every((row) => row.debate === "d1")).toBe(true);
    expect(result.verdict).toBe("PASS_WITH_WARNINGS");
  });

  it("refuses a folder with no transcript", () => {
    const policy = readFileSync(PRACTICE_RESCORE_START_POLICY_FILE, "utf8");
    expect(() => runPracticeRescore({ transcripts: tempFolder(), out: tempFolder(), enginePolicyText: policy }))
      .toThrow(expect.objectContaining({ code: "PRACTICE_RESCORE_NO_INPUT" }));
  });

  it("writes rescore.json and rescore.md, and calls nothing", () => {
    const transcripts = tempFolder();
    mkdirSync(join(transcripts, "ro", "today"), { recursive: true });
    writeFileSync(join(transcripts, "ro", "today", "transcript.json"), transcriptText(graph()));
    const out = tempFolder();
    const result = runPracticeRescore({ transcripts, out, enginePolicyText: readFileSync(PRACTICE_RESCORE_START_POLICY_FILE, "utf8") });
    expect(result.rows.every((row) => row.debate === "ro/today")).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "rescore.json"), "utf8"))).toMatchObject({ schema: "preview-practice-rescore-v1", transcripts: 1 });
    const markdown = readFileSync(join(out, "rescore.md"), "utf8");
    expect(markdown).toContain("| cannot-assess weight | investigations applied | debates |");
    expect(markdown).toContain("ro/today");
    expect(markdown).toContain("| investigations (holds/fails/dead end) |");   // (pre-flight PF-R2a10.4)
    expect(markdown).toContain("| 0/0/0 |");
    expect(existsSync(join(out, "report.json"))).toBe(false);
    const source = readFileSync(new URL("../../tools/preview-practice/practice-rescore.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/createPreviewBudgetRpcPort|practiceSocketsFromEnvironment|readPracticeSettings|@debateai\/db|ProviderGateway/u);
  });

  it("runs as a practice mode and refuses a flag it does not read", async () => {
    const transcripts = tempFolder();
    writeFileSync(join(transcripts, "transcript.json"), transcriptText(graph()));
    const quiet = { log: () => undefined };
    const ran = await runPractice(["rescore", "--transcripts", transcripts, "--out", tempFolder()], {}, quiet);
    expect(ran.exitCode).toBe(0);
    expect(ran.report).toMatchObject({ mode: "rescore", verdict: "PASS" });
    const refused = await runPractice(["rescore", "--transcripts", transcripts, "--out", tempFolder(), "--depth", "1"], {}, quiet);
    expect(refused.exitCode).toBe(40);
    expect(refused.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
  });
});
