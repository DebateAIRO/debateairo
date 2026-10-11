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
  buildSynthesisRolePrompt,
  classifyComposedContent,
  classifyEvaluatorContent,
  classifySynthesisRoleContent,
  parseEvaluatorOutput
} from "@debateai/runner";
import {
  SYNTHESIZER_PROMPT_CONTRACT,
  assertEvaluatorVerdict,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  idShapedTokensIn,
  synthesisCallSiteKey
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
import { exhaustive } from "@debateai/kernel";
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

const NODE_POSITION = "11111111-1111-4111-8111-111111111111";
const NODE_OBJECTION = "22222222-2222-4222-8222-222222222222";

function storySnapshot(context: PracticeLaneContext): StoryWriteInput {
  const q = context.question;
  return Object.freeze<StoryWriteInput>({
    runId: context.runId,
    workItemId: context.workItemId,
    answerId: randomUUID(),
    answerVersion: 1,
    questionLine: q.questionLine,
    argumentLanguage: { tag: q.languageTag, name: q.languageName },
    compositionBudgetTier: "high",
    verdictBasis: {
      label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
      winner_node_id: NODE_POSITION, winner_strength: 0.61,
      runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
      confidence_band: "FULL", marks: ["LABEL-BASIS-INCOMPLETE"]
    },
    servedStatement: [q.position],
    nodes: [
      { nodeId: NODE_POSITION, claim: q.position, isPosition: true, wayOfKnowing: "REASONING",
        baseScore: 0.7, finalStrength: 0.61, excludedReason: null, authorModel: "maker-a",
        panelDispersion: null, criticSummary: q.objection },
      { nodeId: NODE_OBJECTION, claim: q.objection, isPosition: false, wayOfKnowing: "REASONING",
        baseScore: 0.4, finalStrength: 0.4, excludedReason: null, authorModel: "maker-b",
        panelDispersion: null, criticSummary: "No figures given." }
    ],
    arrows: [{ sourceNodeId: NODE_OBJECTION, targetNodeId: NODE_POSITION, polarity: "attack" }],
    sensitivity: [{ removedNodeId: NODE_POSITION, leverage: 0.61 }, { removedNodeId: NODE_OBJECTION, leverage: 0.09 }],
    setAside: [],
    judgeArtifactRefs: new Map([[NODE_POSITION, randomUUID()]])
  });
}

/** A story that is valid for storySnapshot's material (P1 = the position, P2 = the objection). */
function cannedStory(pack: StoryPack, question: PracticeQuestion): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: pack.defaultShape,
    short: {
      headline: "The position held up, with one open question.",
      summary: `You asked: ${question.questionLine} The debate says yes, with the cost unresolved.`,
      confidence: "Fairly sure, as long as the budget holds.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1", "P2"] }],
      change: paragraph("Budget figures showing a shortfall would change the answer.")
    },
    why: { reasons: [{ text: "The cost objection (P2) gave no figures.", node_refs: ["P2"] }] },
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
      const content = contractId === STORYTELLER_CONTRACT_ID ? cannedStory(pack, question)
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
  await writer.writeAfterSettle(storySnapshot(context));
  const record = records.at(-1);
  if (record === undefined) return { postCheckError: "STORY_NOT_RECORDED", detail: logs.join(",") };
  return { postCheckError: null, detail: `${record.outcome}${record.failureCode === null ? "" : `:${record.failureCode}`}` };
}

function synthesisInputs(question: PracticeQuestion) {
  const outcome = buildSynthesisDigest({
    nodes: [
      { nodeId: "position:a", statement: question.position, finalStrength: 0.61, wayOfKnowing: "REASONING",
        marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false },
      { nodeId: "objection:b", statement: question.objection, finalStrength: 0.4, wayOfKnowing: "REASONING",
        marks: [], polarityRelations: [], isPosition: false, isSurvivingObjection: true }
    ],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new TypeError("PRACTICE_SYNTHESIS_DIGEST_UNRESOLVED");
  const controls = { synthesizerRoleRef: "practice:writer", evaluatorRoleRef: "practice:checker", evaluatorLoopMaxRounds: 3 };
  const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 1 };
  return { digest: outcome.digest, controls, codeLabel };
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
        edges: [{ edgeId: "edge:practice", targetStatement: q.position, polarity: "attack" }] });
      return { postCheckError: null, detail: null };
    case "SYNTHESIZER": {
      const { digest, controls, codeLabel } = synthesisInputs(q);
      const request = buildSynthesizerRequest({ controls, round: 1, digest, codeLabel, prior: null });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 }),
        role: "SYNTHESIZER", lane: "served", modelRole: "ANSWER_WRITER", bound: context.bounds.synthesizer,
        contractHash: PRACTICE_CONTRACT_HASHES.composer, providerRef: context.providerRef, packet: framed.packet,
        classifyContent: (content) => classifyComposedContent(content, {
          digest: request.digest,
          servedNodes: [{ nodeId: "position:a" }],
          exemptTokens: idShapedTokensIn([q.questionLine, q.position, q.objection])
        })
      });
      return { postCheckError: null, detail: null };
    }
    case "EVALUATOR": {
      const { digest, controls, codeLabel } = synthesisInputs(q);
      const request = buildEvaluatorRequest({ controls, round: 1, digest, codeLabel, candidateStatement: q.position });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      const response = await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "EVALUATOR", round: 1 }),
        role: "EVALUATOR", lane: "served", modelRole: "ANSWER_CHECKER", bound: context.bounds.evaluator,
        contractHash: PRACTICE_CONTRACT_HASHES.conformance, providerRef: context.providerRef, packet: framed.packet,
        classifyContent: classifyEvaluatorContent
      });
      // The runner's own check after the format check (an objection must come with "not satisfied").
      // Mirrors the runner's evaluatorVerdictOf (apps/runner/src/index.ts): the same parser, the same mapping.
      try {
        const parsed = parseEvaluatorOutput(response.content);
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
