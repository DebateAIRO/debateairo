/**
 * Preview practice: the steps ("lanes") a model is asked to do, and how a wrong-format reply is diagnosed.
 *
 * Plain words: in a debate each model is asked to do different jobs, each with its own prompt and its own answer
 * format: write a position, attack or defend one, judge a statement as a panel member, review a node, write the
 * answer, check the answer, tell the story, check the story. This file
 *  - drives each job through the engine's REAL prompt builders and REAL format checks (the Judge class, the runner's
 *    synthesis prompt builder and classifiers, the real StoryWriter), with synthetic material from
 *    practice-questions.ts, for the "formats" mode;
 *  - maps a debate's call-site key back to the format check that job uses, so a reply that failed its format can be
 *    re-checked from its stored text and the exact problem recovered as `code@path` entries.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { StoryBodySchema } from "@debateai/contract";
import {
  Judge,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nodeReviewArtifactSchema,
  parseStructuredArtifact,
  type JudgeLeg
} from "@debateai/judgement";
import {
  promptContractFingerprintText,
  type CallBound,
  type ContentClassification,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { buildStoryRegisterRows, readStoryPolicy, type StoryPolicy } from "@debateai/register";
import {
  EVALUATOR_PROMPT_CONTRACT,
  buildDigestFollowingServeNodes,
  buildSynthesisRolePrompt,
  classifyComposedContent,
  classifyEvaluatorContent,
  classifySynthesisRoleContent,
  composedNodeIdOf,
  parseComposerOutput,
  parseEvaluatorOutput
} from "@debateai/runner";
import {
  SYNTHESIZER_PROMPT_CONTRACT,
  assertEvaluatorVerdict,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  idShapedTokensIn,
  synthesisCallSiteKey,
  type DigestSourceNode,
  type SynthesisDigest
} from "@debateai/serve";
import {
  STORY_CHECKER_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  StoryWriter,
  classifyCheckerContent,
  type StoryPack,
  type StoryRecordInput,
  type StoryWriteInput
} from "@debateai/story";
import { TypedDomainError, exhaustive, type WayOfKnowing } from "@debateai/kernel";
// The runner's own story snapshot builder (not on the runner package's export list; practice.ts reads the runner's
// dev register module the same way).
import { buildStoryRunSnapshot } from "../../apps/runner/src/story-snapshot.js";
import { readPromptFrame } from "@debateai/providers";
import type { PracticeQuestion } from "./practice-questions.js";

export const PRACTICE_LANES = [
  "JUDGE_POSITION", "JUDGE_ATTACK", "JUDGE_CROSS", "PANEL", "REVIEW", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER"
] as const;
export type PracticeLane = typeof PRACTICE_LANES[number];

/* ------------------------------------------------------------------ diagnosis */

/**
 * A format check's error text as `code@path` entries. Two forms exist in the engine: the judge's tolerant parser
 * already writes `code@path,code@path` ($ for the root); the runner's and the story's checks write zod's issue list
 * as JSON (`[{"code":..,"path":[..],..}]`). Anything else (a plain parse error) is returned as one entry.
 */
export function issueListFromParseError(parseError: string | null | undefined): readonly string[] {
  if (parseError === null || parseError === undefined || parseError.trim() === "") return Object.freeze([]);
  const text = parseError.trim();
  if (text.startsWith("[")) {
    try {
      const issues = JSON.parse(text) as unknown;
      if (Array.isArray(issues)) {
        return Object.freeze(issues.map((issue) => {
          const row = (typeof issue === "object" && issue !== null ? issue : {}) as Record<string, unknown>;
          const code = typeof row.code === "string" ? row.code : typeof row.message === "string" ? row.message : "issue";
          const path = Array.isArray(row.path) && row.path.length > 0 ? row.path.map(String).join(".") : "$";
          return `${code}@${path}`;
        }));
      }
    } catch { /* fall through: not the JSON form */ }
  }
  if (/^[A-Za-z_]+@[^,\s]*(?:,[A-Za-z_]+@[^,\s]*)*$/u.test(text)) return Object.freeze(text.split(","));
  return Object.freeze([text.length > 300 ? `${text.slice(0, 300)}...` : text]);
}

/** The text a model wrote, from the stored body (the gateway stores the vendor's whole HTTP reply). */
export function replyContentOf(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const choices = parsed.choices;
    if (Array.isArray(choices)) {
      const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
      if (typeof content === "string") return content;
    }
    const blocks = parsed.content;
    if (Array.isArray(blocks)) {
      const text = blocks.map((block) => (typeof block === "object" && block !== null
        && (block as { type?: unknown }).type === "text" ? String((block as { text?: unknown }).text ?? "") : "")).join("");
      if (text !== "") return text;
    }
  } catch { /* not a vendor body: the text itself */ }
  return rawText;
}

export type PracticeCallFamily = "JUDGE" | "PANEL" | "REVIEW" | "SYNTHESIZER" | "EVALUATOR" | "STORYTELLER" | "STORY_CHECKER" | "UNMAPPED";

/** Which job a debate call was, from its call-site key (apps/runner/src/index.ts and packages/story naming). */
export function callFamilyOf(callSiteKey: string): PracticeCallFamily {
  if (callSiteKey.startsWith("STORY:STORYTELLER:")) return "STORYTELLER";
  if (callSiteKey.startsWith("STORY:CHECKER:")) return "STORY_CHECKER";
  if (callSiteKey.startsWith("COMPOSER:SYNTHESIZER:")) return "SYNTHESIZER";
  if (callSiteKey.startsWith("POST_COMPOSE_R9:EVALUATOR:")) return "EVALUATOR";
  if (callSiteKey.startsWith("PANEL:")) return "PANEL";
  if (callSiteKey.startsWith("JUDGE:review:")) return "REVIEW";
  if (callSiteKey === "JUDGE" || callSiteKey.startsWith("JUDGE:")) return "JUDGE";
  return "UNMAPPED";
}

function fromZod(result: { success: true } | { success: false; error: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } }): readonly string[] {
  if (result.success) return Object.freeze([]);
  return Object.freeze(result.error.issues.map((issue) => `${issue.code}@${issue.path.length === 0 ? "$" : issue.path.map(String).join(".")}`));
}

function fromClassification(classified: ContentClassification): readonly string[] {
  return classified.parseStatus === "PARSED" ? Object.freeze([]) : issueListFromParseError(classified.parseError);
}

function fromStructured(result: ReturnType<typeof parseStructuredArtifact>): readonly string[] {
  if (result.kind === "PARSED") return Object.freeze([]);
  return issueListFromParseError(result.message);
}

/**
 * Re-runs the job's own format check on a stored reply. The story's storyteller check needs the run's material
 * index (which refs exist), which is not stored: the reply is checked against the story's schema only. The review
 * check's length rule needs the number of edges: the reply's own `edge_bearings` length is used, so only a length
 * mismatch is not re-detected (the stored detail still names it).
 */
export function recheckReply(callSiteKey: string, content: string): Readonly<{ family: PracticeCallFamily; issues: readonly string[] }> {
  const family = callFamilyOf(callSiteKey);
  switch (family) {
    case "JUDGE": return { family, issues: fromStructured(parseStructuredArtifact(content, judgeArtifactSchema)) };
    case "PANEL": return { family, issues: fromStructured(parseStructuredArtifact(content, judgeAssessmentSchema)) };
    case "REVIEW": {
      let edges = 0;
      try {
        const bearings = (JSON.parse(content) as { edge_bearings?: unknown }).edge_bearings;
        if (Array.isArray(bearings)) edges = bearings.length;
      } catch { /* the parser below reports it */ }
      return { family, issues: fromStructured(parseStructuredArtifact(content, nodeReviewArtifactSchema(edges))) };
    }
    case "SYNTHESIZER": return { family, issues: fromClassification(classifySynthesisRoleContent("SYNTHESIZER", content)) };
    case "EVALUATOR": return { family, issues: fromClassification(classifyEvaluatorContent(content)) };
    case "STORY_CHECKER": return { family, issues: fromClassification(classifyCheckerContent(content)) };
    case "STORYTELLER": {
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch (error) {
        return { family, issues: Object.freeze([`invalid_json@$:${error instanceof Error ? error.message.slice(0, 120) : "parse"}`]) };
      }
      return { family, issues: fromZod(StoryBodySchema.safeParse(parsed)) };
    }
    default: return { family, issues: Object.freeze(["UNMAPPED"]) };
  }
}

/* ------------------------------------------------------------------ the formats mode's jobs */

const digestHex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The sealed contract hashes, derived exactly as the register's builder derives them (dev-deployment-register.ts). */
export const PRACTICE_CONTRACT_HASHES = Object.freeze({
  judge: digestHex(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT),
  composer: digestHex(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)),
  conformance: digestHex(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT))
});

export type PracticeLaneBounds = Readonly<{ judge: CallBound; synthesizer: CallBound; evaluator: CallBound }>;

export type PracticeLaneContext = Readonly<{
  lane: PracticeLane;
  question: PracticeQuestion;
  /** The gateway under test (the real one, watched). */
  gateway: ProviderGateway;
  providerRef: string;
  maker: string;
  bounds: PracticeLaneBounds;
  pack: StoryPack;
  /** A run id for the request's fields; the formats mode keeps everything in memory. */
  runId: string;
  /** Which sample of the job this is (1-based): the review job varies its edges by sample. Default 1. */
  sample?: number;
  workItemId: string;
}>;

/** What one job reports beyond the gateway's own record: a failure of the check that runs AFTER the gateway accepted. */
export type PracticeLaneOutcome = Readonly<{ postCheckError: string | null; detail: string | null }>;

const STORY_WRITER_REF = "practice:storyteller";
const STORY_CHECKER_REF = "practice:story-checker";

/** The story rows exactly as the register's builder seals them, read by the register's own reader. */
export function practiceStoryPolicy(): StoryPolicy {
  const policy = readStoryPolicy(buildStoryRegisterRows({
    synthesizerRoleRef: STORY_WRITER_REF, evaluatorRoleRef: STORY_CHECKER_REF, sourceRef: "preview-practice:formats", hosted: false
  }), 1);
  if (policy === null) throw new TypeError("PRACTICE_STORY_POLICY_UNRESOLVED");
  return policy;
}

/*
 * The practice's one small debate, shared by the answer jobs and the story jobs, built so each job sees the SAME kind
 * of context the runner hands it in production (the false fail of 2026-10-11: the writer's citation check was handed
 * only the served root, while the runner lets it cite every argued point):
 *  - node ids are UUIDs like every real node id, so the writer's "names a node id in its prose" check fires as in
 *    production;
 *  - two maker positions (the first debate has five), so a story must give each position its own path, and the
 *    runner-up and fairness-to-losers material exist;
 *  - one surviving objection that attacks the served position: it carries a number AND an attack arrow, the
 *    runner's own rule for "surviving objection" (apps/runner/src/index.ts, the digest nodes);
 *  - the citable set built by the runner's own function (buildDigestFollowingServeNodes);
 *  - the story snapshot built by the runner's own builder (buildStoryRunSnapshot);
 *  - the answer checked and told is a written draft (segment texts joined with a line break, as serve reads a
 *    candidate), never a bare position.
 */
const NODE_POSITION = "11111111-1111-4111-8111-111111111111";
const NODE_OBJECTION = "22222222-2222-4222-8222-222222222222";
const NODE_OTHER_POSITION = "33333333-3333-4333-8333-333333333333";

/** The sealed composition bundle budget of the "high" tier (register row compositionBundleBudget; pinned by a unit test). */
export const PRACTICE_COMPOSITION_BUDGET_HIGH = 30_000;

export type PracticeDebateGraph = Readonly<{
  authored: readonly Readonly<{ nodeId: string; statement: string; provenanceRef: string; wayOfKnowing: WayOfKnowing;
    reversalPoint: string; maker: string; panelDispersion: number | null }>[];
  positionNodeIds: ReadonlySet<string>;
  baseStrengths: readonly Readonly<{ nodeId: string; baseStrength: number | null }>[];
  finalStrengths: readonly Readonly<{ nodeId: string; strength: number }>[];
  arrows: readonly Readonly<{ arrowId: string; sourceNodeId: string; targetKind: string; targetNodeId: string | null; polarity: string }>[];
  sensitivity: readonly Readonly<{ removedNodeId: string; leverage: number }>[];
  servedRootNodeId: string;
  runnerUp: Readonly<{ nodeId: string; strength: number }>;
  margin: number;
}>;

export function practiceDebateGraph(question: PracticeQuestion): PracticeDebateGraph {
  const node = (nodeId: string, statement: string, maker: string, reversalPoint: string) => Object.freeze({
    nodeId, statement, provenanceRef: randomUUID(), wayOfKnowing: "REASONING" as WayOfKnowing, reversalPoint, maker, panelDispersion: null });
  return Object.freeze({
    authored: Object.freeze([
      node(NODE_POSITION, question.position, "maker-a", question.objection),
      node(NODE_OTHER_POSITION, question.otherPosition, "maker-b", "No figures compare the two options."),
      node(NODE_OBJECTION, question.objection, "maker-b", "No budget figures given.")
    ]),
    positionNodeIds: new Set([NODE_POSITION, NODE_OTHER_POSITION]),
    baseStrengths: Object.freeze([{ nodeId: NODE_POSITION, baseStrength: 0.7 }, { nodeId: NODE_OTHER_POSITION, baseStrength: 0.55 },
      { nodeId: NODE_OBJECTION, baseStrength: 0.4 }]),
    finalStrengths: Object.freeze([{ nodeId: NODE_POSITION, strength: 0.61 }, { nodeId: NODE_OTHER_POSITION, strength: 0.48 },
      { nodeId: NODE_OBJECTION, strength: 0.4 }]),
    arrows: Object.freeze([{ arrowId: "44444444-4444-4444-8444-444444444444", sourceNodeId: NODE_OBJECTION, targetKind: "NODE",
      targetNodeId: NODE_POSITION, polarity: "attack" }]),
    sensitivity: Object.freeze([{ removedNodeId: NODE_POSITION, leverage: 0.61 }, { removedNodeId: NODE_OTHER_POSITION, leverage: 0.2 },
      { removedNodeId: NODE_OBJECTION, leverage: 0.09 }]),
    servedRootNodeId: NODE_POSITION,
    runnerUp: Object.freeze({ nodeId: NODE_OTHER_POSITION, strength: 0.48 }),
    margin: 0.13
  });
}

/**
 * The digest's source nodes, by the runner's own rules (apps/runner/src/index.ts, `digestNodes`): polarity relations
 * from the node's own arrows to a node, a position by the maker-position set, and a surviving objection = it carries a
 * propagated number AND sources an attack arrow.
 */
export function practiceDigestNodes(graph: PracticeDebateGraph): readonly DigestSourceNode[] {
  const strengthByNodeId = new Map(graph.finalStrengths.map((row) => [row.nodeId, row.strength] as const));
  const leverage = new Map(graph.sensitivity.map((row) => [row.removedNodeId, row.leverage] as const));
  return Object.freeze(graph.authored.map((node) => Object.freeze({
    nodeId: node.nodeId,
    statement: node.statement,
    finalStrength: strengthByNodeId.get(node.nodeId) ?? null,
    wayOfKnowing: node.wayOfKnowing,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze(graph.arrows
      .filter((arrow) => arrow.sourceNodeId === node.nodeId && arrow.targetKind === "NODE" && arrow.targetNodeId !== null)
      .map((arrow) => Object.freeze({ polarity: arrow.polarity === "attack" ? "attack" as const : "support" as const,
        targetNodeId: arrow.targetNodeId! }))),
    isPosition: graph.positionNodeIds.has(node.nodeId),
    isSurvivingObjection: strengthByNodeId.has(node.nodeId)
      && graph.arrows.some((arrow) => arrow.sourceNodeId === node.nodeId && arrow.polarity === "attack"),
    leverage: leverage.get(node.nodeId) ?? null
  })));
}

/** The citable set exactly as the runner builds it: every authored node, only the served root load-bearing. */
export function practiceServedNodes(graph: PracticeDebateGraph) {
  return buildDigestFollowingServeNodes({
    authored: graph.authored.map((node) => Object.freeze({ nodeId: node.nodeId, statement: node.statement,
      wayOfKnowing: node.wayOfKnowing, provenanceRef: node.provenanceRef, locator: null, restatementStatus: "PASS" as const })),
    servedRootNodeId: graph.servedRootNodeId
  });
}

/** A written answer for the material (what the checker checks and the story tells), as the writer's segments. */
export function practiceDraftSegments(question: PracticeQuestion): readonly Readonly<{ text: string }>[] {
  return Object.freeze([
    Object.freeze({ text: question.position }),
    Object.freeze({ text: `${question.otherPosition} The cost objection stays open: ${question.objection}` })
  ]);
}

/** The candidate statement serve hands the checker: the draft's segment texts joined with a line break. */
export function practiceCandidateStatement(question: PracticeQuestion): string {
  return practiceDraftSegments(question).map((segment) => segment.text).join("\n");
}

/** The story's snapshot, projected by the runner's own builder from the practice debate (no provider, no lease). */
export function practiceStorySnapshot(input: Readonly<{ question: PracticeQuestion; runId: string; workItemId: string }>): StoryWriteInput {
  const q = input.question;
  const graph = practiceDebateGraph(q);
  const built = buildStoryRunSnapshot({
    runId: input.runId, workItemId: input.workItemId, answerId: randomUUID(), answerVersion: 1,
    questionLine: q.questionLine, argumentLanguage: { tag: q.languageTag, name: q.languageName },
    compositionBudgetTier: "high",
    verdict: { label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE" },
    servedRootNodeId: graph.servedRootNodeId, servedStrength: 0.61, runnerUp: graph.runnerUp,
    margin: { kind: "MEASURED", value: graph.margin },
    disagreement: { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "FULL", answerMarks: ["LABEL-BASIS-INCOMPLETE"],
    servedSegments: practiceDraftSegments(q),
    authored: graph.authored, positionNodeIds: graph.positionNodeIds,
    baseStrengths: graph.baseStrengths, finalStrengths: graph.finalStrengths,
    arrows: graph.arrows, arrowOrder: graph.arrows.map((arrow) => arrow.arrowId),
    sensitivity: graph.sensitivity, conditionMarkRecords: [],
    // Never used: taken off below, so the writer's own resolver, and no lease, apply.
    resolveProvider: () => null, stepLease: undefined as never, costFallback: undefined as never
  });
  const { resolveProvider: _resolver, stepLease: _lease, costFallback: _fallback, ...material } = built;
  return Object.freeze(material);
}

/**
 * A story that is valid for the practice snapshot's material: one path per position (P1 the served position, P2 the
 * other; positions are numbered strongest first) and the objection (P3) cited.
 */
export function practiceCannedStory(pack: StoryPack, question: PracticeQuestion): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: pack.defaultShape,
    short: {
      headline: "The position held up, with one open question.",
      summary: `You asked: ${question.questionLine} The debate says yes, with the cost unresolved.`,
      confidence: "Fairly sure, as long as the budget holds.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "HELD_UP", line: "The other position was argued too.", node_refs: ["P2"] }
      ],
      change: paragraph("Budget figures showing a shortfall would change the answer.")
    },
    why: { reasons: [{ text: "The cost objection (P3) gave no figures.", node_refs: ["P3"] }] },
    long: { sections: ["Our reading", "The verdict", "What would change it"].map((title) => ({ title, paragraphs: [paragraph(`${title}.`)] })) },
    reviewer_note: null
  });
}

const CANNED_CHECKER = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

/** A local stand-in for the OTHER story job, so each story job is tested on its own and costs one call. No network. */
function cannedStoryGateway(pack: StoryPack, question: PracticeQuestion): ProviderGateway {
  let calls = 0;
  return Object.freeze({
    async call(request: ProviderCallRequest) {
      calls += 1;
      const contractId = readPromptFrame(request.packet).contractId;
      const content = contractId === STORYTELLER_CONTRACT_ID ? practiceCannedStory(pack, question)
        : contractId === STORY_CHECKER_CONTRACT_ID ? CANNED_CHECKER : "{}";
      return { rawArtifactRef: `practice:canned:${String(calls)}`, ledgerEntryRef: `practice:canned:${String(calls)}`, content,
        provider: "openai-compatible-http" as const, model: "practice/canned", maker: "practice", modelVersion: "practice/canned" };
    }
  });
}

async function runStoryLane(context: PracticeLaneContext): Promise<PracticeLaneOutcome> {
  const records: StoryRecordInput[] = [];
  const logs: string[] = [];
  const canned = cannedStoryGateway(context.pack, context.question);
  const realRef = context.lane === "STORYTELLER" ? STORY_WRITER_REF : STORY_CHECKER_REF;
  const writer = new StoryWriter({
    // The writer never touches the pool when both seams below are given (tests/unit/story-writer.test.ts).
    pool: {} as Pool,
    pack: context.pack,
    policy: practiceStoryPolicy(),
    hosted: false,
    resolveProvider: (roleRef) => ({ provider: roleRef === realRef ? context.gateway : canned, providerRef: roleRef }),
    log: (event) => { logs.push(event); },
    repository: { insert: async (record) => { records.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map()
  });
  await writer.writeAfterSettle(practiceStorySnapshot({ question: context.question, runId: context.runId, workItemId: context.workItemId }));
  const record = records.at(-1);
  if (record === undefined) return { postCheckError: "STORY_NOT_RECORDED", detail: logs.join(",") };
  return { postCheckError: null, detail: `${record.outcome}${record.failureCode === null ? "" : `:${record.failureCode}`}` };
}

function synthesisInputs(question: PracticeQuestion) {
  const graph = practiceDebateGraph(question);
  const outcome = buildSynthesisDigest({
    nodes: practiceDigestNodes(graph),
    servedRootNodeId: graph.servedRootNodeId,
    budgetBound: PRACTICE_COMPOSITION_BUDGET_HIGH
  });
  if (outcome.kind !== "DIGEST") throw new TypeError("PRACTICE_SYNTHESIS_DIGEST_UNRESOLVED");
  const controls = { synthesizerRoleRef: "practice:writer", evaluatorRoleRef: "practice:checker", evaluatorLoopMaxRounds: 3 };
  const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: graph.servedRootNodeId, servedStrength: 0.61, margin: graph.margin,
    registerVersion: 1 };
  return { graph, digest: outcome.digest, servedNodes: practiceServedNodes(graph), controls, codeLabel };
}

/**
 * The runner's reading of a draft after the format check (apps/runner/src/index.ts, `composedSegmentsOf` in the
 * writer's call): the composition parser, the reserved memory-disclosure segment id, each cited ref mapped by the
 * runner's own `composedNodeIdOf`, and unique segment ids. A draft it refuses ends the planned writer's run in
 * production, so here it is a failure after the format check. Returns the refusal's code, or null.
 */
export function practiceComposedPostCheck(content: string, context: Readonly<{
  digest: SynthesisDigest; servedRootNodeId: string; servedNodes: readonly Readonly<{ nodeId: string }>[];
}>): string | null {
  try {
    const parsed = parseComposerOutput(content);
    const ids = parsed.segments.map((segment) => {
      if (segment.segment_id === "memory:disclosure") {
        throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "The memory disclosure segment id is reserved for the typed renderer");
      }
      for (const ref of segment.node_refs) composedNodeIdOf({ ref, digest: context.digest, servedRootNodeId: context.servedRootNodeId, servedNodes: context.servedNodes });
      return segment.segment_id;
    });
    if (new Set(ids).size !== ids.length) throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composed segment ids must be stable and unique");
    return null;
  } catch (error) {
    return error instanceof TypedDomainError ? error.code : "COMPOSITION_CONTRACT_ERROR";
  }
}

/**
 * The evaluator's verdict as the runner reads it (apps/runner/src/index.ts, `evaluatorVerdictOf`): the same parser,
 * the same mapping, the same coherence assertion. tests/unit/preview-practice-wiring-drift.test.ts pins the mapping to
 * the runner's text.
 */
export function practiceEvaluatorVerdictOf(content: string): void {
  const parsed = parseEvaluatorOutput(content);
  assertEvaluatorVerdict(Object.freeze({
    satisfied: parsed.satisfied,
    objection: parsed.objection,
    criteria: Object.freeze({
      fairnessToLosers: parsed.criteria.fairness_to_losers,
      statementLabelAgreement: parsed.criteria.statement_label_agreement,
      noOverstatement: parsed.criteria.no_overstatement,
      restatement: parsed.criteria.restatement,
      citationTracing: parsed.criteria.citation_tracing
    })
  }));
}

/**
 * The review job's edges, by sample: a maker root is reviewed with none (every root of every debate), a cross-root
 * response with two (support and attack), an expansion point with one (apps/runner/src/index.ts). The review's format
 * check requires exactly one bearing per edge, so all three counts are asked.
 */
export function practiceReviewEdges(question: PracticeQuestion, sample: number) {
  const variants = [
    [],
    [{ edgeId: "edge:practice:support", targetStatement: question.otherPosition, polarity: "support" as const },
      { edgeId: "edge:practice:attack", targetStatement: question.position, polarity: "attack" as const }],
    [{ edgeId: "edge:practice", targetStatement: question.position, polarity: "attack" as const }]
  ];
  return variants[(Math.max(1, sample) - 1) % variants.length]!;
}

/** One job, through the real organ code. Throws only for a failure the gateway did not already record. */
export async function runPracticeLane(context: PracticeLaneContext): Promise<PracticeLaneOutcome> {
  const q = context.question;
  const judge = new Judge(context.gateway);
  const common = { runId: context.runId, subjectItemId: context.workItemId, questionLine: q.questionLine,
    argumentLanguageName: q.languageName, providerRef: context.providerRef, contractHash: PRACTICE_CONTRACT_HASHES.judge };
  const judgeLeg = async (leg: JudgeLeg, callSiteKey: string): Promise<PracticeLaneOutcome> => {
    await judge.judge({ ...common, callSiteKey, leg, bound: context.bounds.judge });
    return { postCheckError: null, detail: null };
  };
  switch (context.lane) {
    case "JUDGE_POSITION": return judgeLeg({ kind: "primary-root" }, "JUDGE");
    case "JUDGE_ATTACK": return judgeLeg({ kind: "attack", positionUnderDebate: q.fallacy }, "JUDGE:critic:root0:r2:p0");
    case "JUDGE_CROSS": return judgeLeg({ kind: "cross-root", ownPosition: q.position, otherMakersPosition: q.otherPosition },
      "JUDGE:cross-root:0->1");
    case "PANEL":
      await judge.assess({ ...common, callSiteKey: `PANEL:root:${context.providerRef}`, statement: q.fallacy,
        authorMaker: "practice-other-maker", bound: context.bounds.judge });
      return { postCheckError: null, detail: null };
    case "REVIEW":
      await judge.review({ ...common, callSiteKey: "JUDGE:review:practice-node", statement: q.objection,
        authorMaker: "practice-other-maker", bound: context.bounds.judge,
        edges: practiceReviewEdges(q, context.sample ?? 1) });
      return { postCheckError: null, detail: null };
    case "SYNTHESIZER": {
      const { graph, digest, servedNodes, controls, codeLabel } = synthesisInputs(q);
      const request = buildSynthesizerRequest({ controls, round: 1, digest, codeLabel, prior: null });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      const response = await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 }),
        role: "SYNTHESIZER", lane: "served", modelRole: "ANSWER_WRITER", bound: context.bounds.synthesizer,
        contractHash: PRACTICE_CONTRACT_HASHES.composer, providerRef: context.providerRef, packet: framed.packet,
        // The runner's own classifier with the runner's own citable set (every argued point; only the root served).
        classifyContent: (content) => classifyComposedContent(content, {
          digest: request.digest,
          servedNodes,
          exemptTokens: idShapedTokensIn([q.questionLine, ...graph.authored.map((node) => node.statement)])
        })
      });
      return { postCheckError: practiceComposedPostCheck(response.content,
        { digest: request.digest, servedRootNodeId: graph.servedRootNodeId, servedNodes }), detail: null };
    }
    case "EVALUATOR": {
      const { digest, controls, codeLabel } = synthesisInputs(q);
      const request = buildEvaluatorRequest({ controls, round: 1, digest, codeLabel, candidateStatement: practiceCandidateStatement(q) });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      const response = await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "EVALUATOR", round: 1 }),
        role: "EVALUATOR", lane: "served", modelRole: "ANSWER_CHECKER", bound: context.bounds.evaluator,
        contractHash: PRACTICE_CONTRACT_HASHES.conformance, providerRef: context.providerRef, packet: framed.packet,
        classifyContent: classifyEvaluatorContent
      });
      // The runner's own check after the format check (an objection must come with "not satisfied").
      try {
        practiceEvaluatorVerdictOf(response.content);
      } catch (error) {
        return { postCheckError: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "EVALUATOR_VERDICT_INVALID",
          detail: null };
      }
      return { postCheckError: null, detail: null };
    }
    case "STORYTELLER":
    case "STORY_CHECKER":
      return runStoryLane(context);
    default:
      return exhaustive(context.lane);
  }
}
