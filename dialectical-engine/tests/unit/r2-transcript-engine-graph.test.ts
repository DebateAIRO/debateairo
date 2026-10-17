// tests/unit/r2-transcript-engine-graph.test.ts
// R2 (E12; INTERFACE §15.3): the transcript keeps the whole graph both engines argued, so `rescore` can recompute it with
// no AI call: hidden nodes, every edge with its measured bearing, every review, every grader's own assessment (found by
// the panel's call-site keys, read as the gateway accepted it), the investigations and the served base and final strengths.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PromptPacket } from "@debateai/providers";
import { engineVersionPolicyStartValues } from "@debateai/register";
import { buildTranscriptEngineGraph, panelKeyPrefixOf, rootIndexOfAuthorKey, type EngineGraphLanguage, type EngineGraphSource }
  from "../../tools/preview-practice/practice-engine-graph.js";
import { practiceJudgeReadingOf } from "../../tools/preview-practice/practice-lanes.js";
import { buildPracticeTranscript, type TranscriptRunFacts } from "../../tools/preview-practice/practice-transcript.js";
// R2a final wave A7 (Ruling (A15 Minors) 1).
import { TypedDomainError } from "@debateai/kernel";
import { practiceUnavailableName } from "../../tools/preview-practice/practice-transcript.js";
import { KEYLESS, PATCH_REPLY, SM, WRAPPED_ECHO, panelFramed } from "../support/structure-salvage-shapes.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1); const B = id(2); const P1 = id(3); const P2 = id(4); const X = id(5);
const art = (n: number) => id(100 + n);
const REFS = ["preview:m1", "preview:m2", "preview:m3"];
/** Engine 2's start scoring (R1d): a disputed point's base strength × 0.7. */
const START_SCORING = engineVersionPolicyStartValues().scoring;
/** MiMo's real replies of 2026-10-12 (the reply-language suites' fixture): the English question, a panel reply with Chinese flags. */
const PRACTICE = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/practice-2026-10-12-replies.json", import.meta.url), "utf8")) as {
  readonly question: string; readonly replies: readonly Readonly<{ source: string; content: string }>[];
};
const QUESTION = PRACTICE.question;
const CHINESE_FLAGS = PRACTICE.replies.find((entry) => entry.source === "debate-3c#116")!.content;
/** X's panel key for member m2 (the cross-reply's grader). */
const X_PANEL_M2 = "PANEL:JUDGE:cross-root:0->1:preview:m2";

/** Every measure at g (equal weights give 0.142857 × (6g + 1)). */
const assessment = (g: number) => ({
  steelman: { summary: "Restated.", fidelity: g },
  critic: { summary: "Countered.", counterargumentStrength: 1 - g, basis: "REAL_ATTACK" },
  evidence: { quality: g, relevance: g }, context: { fit: g, ambiguityFlags: [] }, fallacy: { severity: 1 - g, fatalFlags: [] }
});
const authored = (statement: string, g: number) => JSON.stringify({ statement, way_of_knowing: "REASONING", locator: null,
  restatement_text: `${statement} (restated)`, restatement_status: "PASS", value_laden: false, ...assessment(g) });
const graded = (g: number) => JSON.stringify(assessment(g));

const arrow = (arrowId: string, sourceNodeId: string, targetNodeId: string, polarity: "support" | "attack", strength: number | null) => ({
  arrowId, sourceNodeId, targetKind: "NODE" as const, targetNodeId, targetEdgeId: null, polarity, kind: null,
  strength, magnitudeStatus: strength === null ? "UNKNOWN" as const : "MEASURED" as const, strengthSource: "REVIEWER" as const, clusterKey: null
});
// Pre-flight PF-R2a9.1: each call carries its attempt id and its prompt's messages (null: not read, today's rebuild).
const call = (sequence: number, callSiteKey: string, actorRef: string, rawArtifactRef: string, outcome = "OK",
  messages: PromptPacket["messages"] | null = null) =>
  ({ sequence, callSiteKey, actorRef, outcome, rawArtifactRef, attemptId: null, messages });
const artifact = (maker: string, content: string | null) => ({ maker, recorded: { content, reply: { finishReason: "stop" } } });

function source(overrides: Partial<EngineGraphSource> = {}): EngineGraphSource {
  return {
    engine: 1, engineReceipt: null,
    // Pre-flight PF-R2a2.9: engine 1 has no dispute factor; PF-R2a9.2: the step's language check, no lock (today's check).
    scoring: null, language: { questionLine: QUESTION, lock: null },
    snapshot: {
      nodes: [
        { nodeId: A, baseStrength: 0.8, parentNodeId: null, provenanceRef: art(1), isFolder: false },
        { nodeId: B, baseStrength: 0.7, parentNodeId: null, provenanceRef: art(2), isFolder: false },
        { nodeId: P1, baseStrength: 0.6, parentNodeId: B, provenanceRef: art(3), isFolder: false },
        { nodeId: P2, baseStrength: 0.9, parentNodeId: A, provenanceRef: art(4), isFolder: false },
        { nodeId: X, baseStrength: 0.55, parentNodeId: A, provenanceRef: art(5), isFolder: false }
      ],
      arrows: [arrow("e1", P1, B, "attack", 0.8), arrow("e2", P2, A, "attack", null), arrow("e3", X, A, "support", 0.9), arrow("e4", X, B, "attack", 0.7)]
    },
    calls: [
      call(1, "JUDGE", "preview:m1", art(1)), call(2, "JUDGE:root:secondary:seat:main", "preview:m2", art(2)),
      call(3, "JUDGE:critic:root1:r1:p0", "preview:m1", art(3)), call(4, "JUDGE:critic:root0:r1:p1", "preview:m2", art(4)),
      call(5, "JUDGE:cross-root:0->1", "preview:m1", art(5)),
      call(6, "PANEL:root:preview:m2", "preview:m2", art(6)), call(7, "PANEL:JUDGE:root:secondary:preview:m1:seat:main", "preview:m1", art(7)),
      call(8, "PANEL:JUDGE:critic:root1:r1:p0:preview:m3", "preview:m3", art(8), "FAILED"),
      call(9, "PANEL:JUDGE:critic:root1:r1:p0:preview:m3", "preview:m3", art(9)),
      call(10, "PANEL:JUDGE:critic:root0:r1:p1:preview:m3", "preview:m3", art(10)),
      // Another node's panel whose key starts with P1's key text: never one of P1's voices.
      call(11, "PANEL:JUDGE:critic:root1:r1:p01:preview:m2", "preview:m2", art(11)),
      // LG-A: X's grader slipped on structure; the structure-repair call (Haiku) put its words back into the form.
      call(12, X_PANEL_M2, "preview:m2", art(12), "FAILED"),
      call(13, `REPAIR:STRUCTURE:${X_PANEL_M2}`, "preview:haiku", art(13))
    ],
    artifacts: new Map([
      [art(1), artifact("m1", authored("Answer A.", 0.1))], [art(2), artifact("m2", authored("Answer B.", 0.1))],
      [art(3), artifact("m1", authored("B fails here.", 0.1))], [art(4), artifact("m2", authored("A fails there.", 0.1))],
      [art(5), artifact("m1", authored("A answers B.", 0.1))],
      [art(6), artifact("m2", graded(0.8))], [art(7), artifact("m1", graded(0.8))], [art(8), artifact("m3", null)],
      [art(9), artifact("m3", graded(0.6))], [art(10), artifact("m3", "not a reply")], [art(11), artifact("m2", graded(0.2))],
      [art(12), artifact("m2", "steelman: restated, fidelity 0.7 …")], [art(13), artifact("anthropic", graded(0.7))]
    ]),
    panelRefs: REFS,
    reviews: [
      { nodeId: A, outcome: "agree", reviewerMaker: "m3" }, { nodeId: B, outcome: "agree", reviewerMaker: "m3" },
      { nodeId: P1, outcome: "agree", reviewerMaker: "m2" }, { nodeId: P2, outcome: "cannot-assess", reviewerMaker: "m3" },
      { nodeId: X, outcome: "dispute", reviewerMaker: "m3" }
    ],
    investigations: [{ nodeId: P2, result: "DEAD_END" }],
    served: { servedRootNodeId: A, finalStrength: { [A]: 0.7, [B]: 0.5, [P1]: 0.6, [X]: 0.55 } },
    ...overrides
  };
}

describe("R2 transcript: the engine graph (INTERFACE §15.3)", () => {
  it("reads root indexes and panel keys as the runner writes them", () => {
    expect(rootIndexOfAuthorKey("JUDGE")).toBe(0);
    expect(rootIndexOfAuthorKey("JUDGE:root:secondary")).toBe(1);
    expect(rootIndexOfAuthorKey("JUDGE:root:3")).toBe(3);
    expect(rootIndexOfAuthorKey("JUDGE:critic:root1:r1:p0")).toBeNull();
    expect(panelKeyPrefixOf("JUDGE")).toBe("PANEL:root:");
    expect(panelKeyPrefixOf("JUDGE:cross-root:0->1")).toBe("PANEL:JUDGE:cross-root:0->1:");
  });

  it("re-reads an author's and a grader's reply with the step's own reader", () => {
    expect(practiceJudgeReadingOf("JUDGE", authored("Answer A.", 0.8), "stop")).toEqual({ statement: "Answer A.", assessment: assessment(0.8) });
    expect(practiceJudgeReadingOf("PANEL:root:preview:m2", graded(0.6), "stop")).toEqual({ statement: null, assessment: assessment(0.6) });
    expect(practiceJudgeReadingOf("PANEL:root:preview:m2", "not a reply", "stop")).toBeNull();
    expect(practiceJudgeReadingOf("JUDGE:review:abc", graded(0.6), "stop")).toBeNull();
  });

  it("keeps every node, the hidden one included, with its root, kind and author", () => {
    const graph = buildTranscriptEngineGraph(source())!;
    // Pre-flight PF-R2a2.9: engine 1 never applies the dispute factor (X's review disputed it).
    expect(graph.nodes).toEqual([
      { nodeId: A, parentNodeId: null, rootIndex: 0, authorMaker: "m1", kind: "ROOT", hidden: false, isFolder: false, disputeFactorApplied: false },
      { nodeId: B, parentNodeId: null, rootIndex: 1, authorMaker: "m2", kind: "ROOT", hidden: false, isFolder: false, disputeFactorApplied: false },
      { nodeId: P1, parentNodeId: B, rootIndex: 1, authorMaker: "m1", kind: "POINT", hidden: false, isFolder: false, disputeFactorApplied: false },
      { nodeId: P2, parentNodeId: A, rootIndex: 0, authorMaker: "m2", kind: "POINT", hidden: true, isFolder: false, disputeFactorApplied: false },
      { nodeId: X, parentNodeId: A, rootIndex: 0, authorMaker: "m1", kind: "CROSS", hidden: false, isFolder: false, disputeFactorApplied: false }
    ]);
  });

  it("keeps every edge in order, its measured bearing (null when unmeasured) and the cross-reply's own-reply support", () => {
    const graph = buildTranscriptEngineGraph(source())!;
    expect(graph.edges.map(({ edgeId, from, to, polarity, bearing, ownReply }) => ({ edgeId, from, to, polarity, bearing, ownReply }))).toEqual([
      { edgeId: "e1", from: P1, to: B, polarity: "attack", bearing: 0.8, ownReply: false },
      { edgeId: "e2", from: P2, to: A, polarity: "attack", bearing: null, ownReply: false },
      { edgeId: "e3", from: X, to: A, polarity: "support", bearing: 0.9, ownReply: true },
      { edgeId: "e4", from: X, to: B, polarity: "attack", bearing: 0.7, ownReply: false }
    ]);
  });

  it("keeps each grader's own assessment as the gateway accepted it, the author marked, and lists what it could not read", () => {
    const graph = buildTranscriptEngineGraph(source())!;
    expect(graph.voices.map(({ nodeId, judgementRef, maker, isAuthor }) => ({ nodeId, judgementRef, maker, isAuthor }))).toEqual([
      { nodeId: A, judgementRef: art(1), maker: "m1", isAuthor: true }, { nodeId: A, judgementRef: art(6), maker: "m2", isAuthor: false },
      { nodeId: B, judgementRef: art(2), maker: "m2", isAuthor: true }, { nodeId: B, judgementRef: art(7), maker: "m1", isAuthor: false },
      { nodeId: P1, judgementRef: art(3), maker: "m1", isAuthor: true }, { nodeId: P1, judgementRef: art(9), maker: "m3", isAuthor: false },
      { nodeId: P2, judgementRef: art(4), maker: "m2", isAuthor: true },
      // The structure-repaired grader keeps its own reply as provenance and its maker (LG-A deviation 7); the words are Haiku's copy.
      { nodeId: X, judgementRef: art(5), maker: "m1", isAuthor: true }, { nodeId: X, judgementRef: art(12), maker: "m2", isAuthor: false }
    ]);
    expect(graph.voices.find((voice) => voice.judgementRef === art(9))!.assessment).toEqual(assessment(0.6));
    expect(graph.voices.find((voice) => voice.judgementRef === art(12))!.assessment).toEqual(assessment(0.7));
    expect(graph.unreadVoices).toEqual([{ nodeId: P2, judgementRef: art(10) }]);
  });

  // Pre-flight PF-R2a9.1: the refused-repair salvage's two kinds of accepted reply (the stand-in integration run cannot show them).
  it("reads a grader reply A1 rescued in code from its own OK row, with the step's prompt", () => {
    const rescued = (messages: PromptPacket["messages"] | null) => source({
      calls: [...source().calls.filter((entry) => entry.sequence < 12), call(12, X_PANEL_M2, "preview:m2", art(12), "OK", messages)],
      artifacts: new Map([...source().artifacts, [art(12), artifact("m2", KEYLESS)]])
    });
    const graph = buildTranscriptEngineGraph(rescued(panelFramed.packet.messages))!;
    expect(graph.voices.find((voice) => voice.judgementRef === art(12))).toMatchObject({ nodeId: X, maker: "m2", isAuthor: false,
      assessment: { steelman: { summary: SM, fidelity: 0.8 }, evidence: { quality: 0.5, relevance: 0.7 } } });
    expect(graph.unreadVoices).toEqual([{ nodeId: P2, judgementRef: art(10) }]);
    // Without the step's prompt (no answer form for A1): today's rebuild refuses the raw reply, so the voice is unread.
    expect(buildTranscriptEngineGraph(rescued(null))!.unreadVoices).toContainEqual({ nodeId: X, judgementRef: art(12) });
  });

  it("reads a grader reply B's follow-up answered, merged into A's base, with the first try's prompt", () => {
    const followedUp = (messages: PromptPacket["messages"] | null) => source({
      calls: [...source().calls.filter((entry) => entry.sequence < 12),
        call(12, X_PANEL_M2, "preview:m2", art(12), "FAILED", messages), call(13, X_PANEL_M2, "preview:m2", art(13))],
      artifacts: new Map([...source().artifacts, [art(12), artifact("m2", WRAPPED_ECHO)], [art(13), artifact("m2", PATCH_REPLY)]])
    });
    const graph = buildTranscriptEngineGraph(followedUp(panelFramed.packet.messages))!;
    expect(graph.voices.filter((voice) => voice.nodeId === X).map(({ judgementRef, maker, isAuthor }) => ({ judgementRef, maker, isAuthor })))
      .toEqual([{ judgementRef: art(5), maker: "m1", isAuthor: true }, { judgementRef: art(13), maker: "m2", isAuthor: false }]);
    expect(graph.voices.find((voice) => voice.judgementRef === art(13))!.assessment)
      .toMatchObject({ steelman: { summary: SM }, evidence: { quality: 0.5, relevance: 0.7 }, fallacy: { severity: 0.35 } });
    // Without the prompt: today's patch plan keeps the echo, the merge is refused and the patch alone is no answer.
    expect(buildTranscriptEngineGraph(followedUp(null))!.unreadVoices).toContainEqual({ nodeId: X, judgementRef: art(13) });
  });

  // Pre-flight PF-R2a9.2: a reply the step's language check refused, then patched (MiMo's real slip, PR #154 / #158).
  it("reads a grader reply refused for its language and then patched, with the step's language check", () => {
    const flags = ["The population and budget of a 'mid-sized city' are not defined.", "The extent of the 'central bus lines' is not defined."];
    const patched = (language: EngineGraphLanguage | null) => source({ language,
      calls: [...source().calls.map((entry) => entry.sequence === 6 ? { ...entry, outcome: "FAILED" } : entry),
        call(14, "PANEL:root:preview:m2", "preview:m2", art(14))],
      artifacts: new Map([...source().artifacts, [art(6), artifact("m2", CHINESE_FLAGS)],
        [art(14), artifact("m2", JSON.stringify({ "context.ambiguityFlags": flags }))]])
    });
    const voice = buildTranscriptEngineGraph(patched({ questionLine: QUESTION, lock: null }))!.voices.find((entry) => entry.judgementRef === art(14))!;
    expect(voice).toMatchObject({ nodeId: A, maker: "m2", isAuthor: false });
    expect(voice.assessment.context.ambiguityFlags).toEqual(flags);
    // Without the check the first reply reads as accepted, no patch is planned, and the patch alone is no answer.
    expect(buildTranscriptEngineGraph(patched(null))!.unreadVoices).toContainEqual({ nodeId: A, judgementRef: art(14) });
  });

  it("keeps the reviews, the investigations, the engine and the served numbers", () => {
    const graph = buildTranscriptEngineGraph(source())!;
    expect(graph.engine).toBe(1);
    expect(graph.engineReceipt).toBeNull();
    expect(graph.reviews).toEqual(source().reviews);
    expect(graph.investigations).toEqual([{ nodeId: P2, result: "DEAD_END" }]);
    expect(graph.served).toEqual({ baseStrength: { [A]: 0.8, [B]: 0.7, [P1]: 0.6, [P2]: 0.9, [X]: 0.55 },
      finalStrength: { [A]: 0.7, [B]: 0.5, [P1]: 0.6, [X]: 0.55 }, servedRootNodeId: A });
    const engineTwo = buildTranscriptEngineGraph(source({ engine: 2, engineReceipt: { version: 1, engine: 2 }, scoring: START_SCORING }))!;
    expect(engineTwo.engine).toBe(2);
    expect(engineTwo.engineReceipt).toEqual({ version: 1, engine: 2 });
  });

  // Pre-flight PF-R2a2.9 (spec §4.2 "What is recorded": the dispute factor when applied), by A6's rule on the recorded reviews.
  it("records on each node whether engine 2's dispute factor applied: a disputed review, or an investigation that found it fails", () => {
    const applied = (overrides: Partial<EngineGraphSource>) => Object.fromEntries(buildTranscriptEngineGraph(source({ engine: 2,
      engineReceipt: { version: 1, engine: 2 }, scoring: START_SCORING, ...overrides }))!.nodes.map((node) => [node.nodeId, node.disputeFactorApplied] as const));
    // P2's investigation was a dead end: it stays cannot-assess (factor 1); X's review disputed it (factor 0.7).
    expect(applied({})).toEqual({ [A]: false, [B]: false, [P1]: false, [P2]: false, [X]: true });
    expect(applied({ investigations: [{ nodeId: P2, result: "FAILS" }] })).toEqual({ [A]: false, [B]: false, [P1]: false, [P2]: true, [X]: true });
    expect(applied({ investigations: [{ nodeId: P2, result: "HOLDS" }] })).toEqual({ [A]: false, [B]: false, [P1]: false, [P2]: false, [X]: true });
    // Engine 1 has no dispute factor, whatever the reviews say.
    expect(buildTranscriptEngineGraph(source({ investigations: [{ nodeId: P2, result: "FAILS" }] }))!.nodes
      .some((node) => node.disputeFactorApplied)).toBe(false);
  });

  it("is absent for a run that served no propagation", () => {
    expect(buildTranscriptEngineGraph(source({ served: null }))).toBeNull();
  });

  it("joins structure.engineGraph only when there is one (today's keys otherwise)", () => {
    const run = { runId: id(9) } as unknown as TranscriptRunFacts;
    const without = buildPracticeTranscript({ run, attempts: [], answer: null, inspection: null, story: null, unavailable: [] });
    expect(Object.keys(without.structure)).toEqual(["answer", "inspection", "story"]);
    const graph = buildTranscriptEngineGraph(source())!;
    const withGraph = buildPracticeTranscript({ run, attempts: [], answer: null, inspection: null, story: null, unavailable: [], engineGraph: graph });
    expect(Object.keys(withGraph.structure)).toEqual(["answer", "inspection", "story", "engineGraph"]);
    expect(withGraph.structure.engineGraph).toBe(graph);
  });
});

// R2a final wave, Ruling (A15 Minors) 1: an `unavailable` line names a typed refusal by its code, so ENGINE_FACTS_INVALID
// is not lost as "TypedDomainError"; any other error by its class; never its message.
describe("the transcript's unavailable lines (R2a final wave A7)", () => {
  it("names a typed refusal by its code, another error by its class, never its message", () => {
    expect(practiceUnavailableName(new TypedDomainError("ENGINE_FACTS_INVALID", "node-1 has two review outcomes"))).toBe("ENGINE_FACTS_INVALID");
    expect(practiceUnavailableName(new TypeError("the AI wrote this"))).toBe("TypeError");
    expect(practiceUnavailableName("a thrown string")).toBe("UNKNOWN");
  });

  it("is what the engine graph's and the map's lines write", () => {
    const source = readFileSync(new URL("../../tools/preview-practice/practice-transcript.ts", import.meta.url), "utf8");
    expect(source).toContain("unavailable.push(`structure.engineGraph: ${practiceUnavailableName(error)}`);");
    expect(source).toContain("unavailable.push(`structure.map: ${practiceUnavailableName(error)}`);");
    expect(source).not.toMatch(/structure\.(?:engineGraph|map): \$\{error instanceof Error \? error\.name/u);
  });
});
