/**
 * Preview practice, debate mode, `--transcript` (R2, E12; INTERFACE §15.3): the whole graph a debate argued, both engines,
 * so the `rescore` mode can recompute it with no AI call.
 *
 * Plain words: the site's own reader (`structure.answer`) shows only the points that stood, and only each point's chosen
 * score. The rescore needs everything the arithmetic used: every point (a hidden one too), every link with the bearing its
 * reviewer measured, every review, every grader's own seven measures, each investigation's result, and the numbers the
 * engine served. Code reads them here from the throwaway database; nothing is judged, nothing is called.
 *
 * A grader's reply is found by its call-site key, as the runner wrote it: a node's author is the call whose reply is the
 * node's provenance; its panel calls are `PANEL:<author key>:<provider>` (root 0: `PANEL:root:<provider>`). Each reply is
 * read as the gateway accepted it (reclaim resume's `rebuildRecordedCallContent`: the reply, a patch merged into the reply
 * before it, A1's rescue or B's follow-up merged into A's base (the refused-repair salvage's `structureReplayReaders`), or
 * LG-A's structure-repair copy), by the step's own classifier with its language check, then by the step's own reader.
 */
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { decryptContentForRun, readCallPrompt } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import {
  JUDGE_ARTIFACT_PROSE,
  JUDGE_ARTIFACT_READING,
  JUDGE_ASSESSMENT_PROSE,
  classifyStructuredArtifact,
  honestDisputeFactor,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  type JudgeAssessment,
  type PointInvestigationResult
} from "@debateai/judgement";
import {
  replyLanguageCheckFor,
  type EdgeKind,
  type EdgeTargetKind,
  type MagnitudeStatus,
  type QuestionLanguage,
  type StrengthSource
} from "@debateai/kernel";
import type { EvaluationSnapshot, ProvenanceClusterKey } from "@debateai/propagation";
import {
  STRUCTURE_REPAIR_CALL_SITE_PREFIX,
  readRecordedProviderReply,
  rebuildRecordedCallContent,
  structureRepairOriginalKey,
  structureReplayReaders,
  type ContentClassification,
  type ModelReplyFacts,
  type PromptPacket,
  type ProviderCallRequest,
  type RecordedProviderReply
} from "@debateai/providers";
import { engineOfRun, type EngineScoring } from "@debateai/register";
import { runQuestionLanguageLock } from "@debateai/runner";
import { seatBaseCallSiteKey } from "@debateai/serve";
import { engineNodeFactsOf, engineOwnReplyEdgeIdsOf } from "../../apps/runner/src/engine-links.js";
import { engineInvestigatedStatuses } from "../../apps/runner/src/engine-investigations.js";
import { callFamilyOf, practiceJudgeReadingOf, type PracticeJudgeReading } from "./practice-lanes.js";

export type TranscriptEngineNode = Readonly<{
  nodeId: string;
  parentNodeId: string | null;
  /** The root (answer) the node argues under: 0 = root 0; -1 when no root is above it (never in a debate). */
  rootIndex: number;
  /** The maker of the reply the node was saved from; "UNKNOWN" for a node with no stored reply (a folder). */
  authorMaker: string;
  kind: "ROOT" | "POINT" | "CROSS";
  /** Judged, but left out of the served propagation (engine 1: its review said cannot-assess and nothing judged feeds it). */
  hidden: boolean;
  isFolder: boolean;
  /**
   * Engine 2: the dispute factor multiplied this node's score (its review disputed it, or its investigation found it
   * fails), by A6's rule on the recorded reviews (`honestDisputeFactor` of the status `engineNodeFactsOf` gives); always
   * false under engine 1, which has no dispute factor (pre-flight PF-R2a2.9; spec §4.2 "What is recorded").
   */
  disputeFactorApplied: boolean;
}>;
export type TranscriptEngineEdge = Readonly<{
  edgeId: string;
  from: string;
  /** The target node; null for an undercut (an edge on an edge, `targetEdgeId`). */
  to: string | null;
  polarity: "support" | "attack";
  /** The bearing the reviewer measured (`core.edge.strength`); null when unmeasured. */
  bearing: number | null;
  /** A cross-reply's support edge to its own root (E6(2): no weight under engine 2), by A8's `engineOwnReplyEdgeIdsOf`. */
  ownReply: boolean;
  targetKind: EdgeTargetKind;
  targetEdgeId: string | null;
  kind: EdgeKind | null;
  strengthSource: StrengthSource;
  clusterKey: ProvenanceClusterKey | null;
}>;
export type TranscriptEngineReview = Readonly<{ nodeId: string; outcome: "agree" | "dispute" | "cannot-assess"; reviewerMaker: string }>;
export type TranscriptEngineVoice = Readonly<{ nodeId: string; judgementRef: string; maker: string; isAuthor: boolean; assessment: JudgeAssessment }>;
/** `PointInvestigationResult` is A10's type (pre-flight PF-R2a9.4: declared once, plan deviation 16). */
export type TranscriptEngineInvestigation = Readonly<{ nodeId: string; result: PointInvestigationResult }>;
export type TranscriptEngineGraph = Readonly<{
  engine: 1 | 2;
  /** The receipt's `engine` member exactly as stored (`rescore` re-parses it); null for engine 1. */
  engineReceipt: unknown;
  nodes: readonly TranscriptEngineNode[];
  /** In the order propagation reads them (materialiseSnapshot's order). */
  edges: readonly TranscriptEngineEdge[];
  reviews: readonly TranscriptEngineReview[];
  voices: readonly TranscriptEngineVoice[];
  investigations: readonly TranscriptEngineInvestigation[];
  /** Accepted grader replies that could not be read again (`rescore` then leaves the debate out and says why). */
  unreadVoices: readonly Readonly<{ nodeId: string; judgementRef: string }>[];
  /**
   * The served base and final strengths. Base: `materialiseSnapshot`'s base strengths (engine 2: the honest score before
   * the dispute factor and the link rules, as `reduced_judgement.tau` records it) (pre-flight PF-R2a9.10).
   */
  served: Readonly<{
    baseStrength: Readonly<Record<string, number>>;
    finalStrength: Readonly<Record<string, number>>;
    servedRootNodeId: string | null;
  }>;
}>;

/** The question line and the run's language lock, as the judge and panel steps checked their replies (pre-flight PF-R2a9.2). */
export type EngineGraphLanguage = Readonly<{ questionLine: string; lock: QuestionLanguage | null }>;

/** The rows the graph is built from (pure input; `readEngineGraphSource` reads them, the unit test writes them). */
export type EngineGraphSource = Readonly<{
  engine: 1 | 2;
  engineReceipt: unknown;
  /** Engine 2's scoring settings off the receipt (`engineOfRun`); null for engine 1 (pre-flight PF-R2a2.9). */
  scoring: EngineScoring | null;
  /** The judge and panel steps' language check; null reads without it (pre-flight PF-R2a9.2). */
  language: EngineGraphLanguage | null;
  snapshot: Readonly<{
    nodes: readonly Readonly<{ nodeId: string; baseStrength: number | null; parentNodeId: string | null; provenanceRef: string | null; isFolder: boolean }>[];
    arrows: readonly Readonly<{ arrowId: string; sourceNodeId: string; targetKind: EdgeTargetKind; targetNodeId: string | null;
      targetEdgeId: string | null; polarity: "support" | "attack"; kind: EdgeKind | null; strength: number | null;
      magnitudeStatus: MagnitudeStatus; strengthSource: StrengthSource; clusterKey: ProvenanceClusterKey | null }>[];
  }>;
  /**
   * Every MODEL_CALL ledger row of the run. `messages`: a JUDGE or PANEL try's prompt as the gate received it (null for
   * any other call, or a prompt not found) (pre-flight PF-R2a9.1).
   */
  calls: readonly Readonly<{ sequence: number; callSiteKey: string; actorRef: string; outcome: string; rawArtifactRef: string | null;
    attemptId: string | null; messages: PromptPacket["messages"] | null }>[];
  /** Every stored reply: its maker and (JUDGE, PANEL and structure-repair calls only) the reply as the gateway read it. */
  artifacts: ReadonlyMap<string, Readonly<{ maker: string; recorded: RecordedProviderReply | null }>>;
  panelRefs: readonly string[];
  reviews: readonly Readonly<{ nodeId: string; outcome: string; reviewerMaker: string }>[];
  investigations: readonly Readonly<{ nodeId: string; result: string }>[];
  served: Readonly<{ servedRootNodeId: string | null; finalStrength: Readonly<Record<string, number>> }> | null;
}>;

const UNKNOWN_MAKER = "UNKNOWN";
const ROOT_N_KEY = /^JUDGE:root:(\d+)$/u;
const CROSS_KEY_PREFIX = "JUDGE:cross-root:";
const REVIEW_OUTCOMES_READ: ReadonlySet<string> = new Set(["agree", "dispute", "cannot-assess"]);
type Classifier = (content: string, reply?: ModelReplyFacts) => ContentClassification;

/**
 * The two steps' own classifiers (packages/judgement/src/index.ts:698-700, :876-878 at 1bc8f549b), with the language
 * check the call ran (`replyLanguageCheckFor` on the question line and the run's lock); `language` null: no check (an
 * older transcript's reading) (pre-flight PF-R2a9.2).
 */
function classifierOf(family: "JUDGE" | "PANEL", language: EngineGraphLanguage | null): Classifier {
  const checkOf = (patterns: readonly string[]) => language === null ? undefined
    : replyLanguageCheckFor(language.questionLine, language.lock, patterns);
  if (family === "JUDGE") {
    const inQuestionLanguage = checkOf(JUDGE_ARTIFACT_PROSE);
    return (content, reply) => classifyStructuredArtifact(content, judgeArtifactSchema, reply, JUDGE_ARTIFACT_READING, inQuestionLanguage);
  }
  const inQuestionLanguage = checkOf(JUDGE_ASSESSMENT_PROSE);
  return (content, reply) => classifyStructuredArtifact(content, judgeAssessmentSchema, reply, JUDGE_ARTIFACT_READING, inQuestionLanguage);
}

/** The root index an author call-site key (seat suffix removed) names; null for a key that authors no root. */
export function rootIndexOfAuthorKey(baseKey: string): number | null {
  if (baseKey === "JUDGE") return 0;
  if (baseKey === "JUDGE:root:secondary") return 1;
  const match = ROOT_N_KEY.exec(baseKey);
  return match === null ? null : Number(match[1]);
}

/** The panel call-site keys of a node start with this text (apps/runner/src/index.ts `PANEL:${callSiteKey}`, root 0 `PANEL:root`). */
export function panelKeyPrefixOf(authorBaseKey: string): string {
  return authorBaseKey === "JUDGE" ? "PANEL:root:" : `PANEL:${authorBaseKey}:`;
}

/**
 * A JUDGE or PANEL call's accepted reply, rebuilt as the gateway decided it (`rebuildRecordedCallContent`: the reply, or
 * a patch merged into `answered`, the try before it; with the step's original `messages`, also A1's rescue and B's
 * follow-up, through the salvage's `structureReplayReaders`) and read by the step's own reader; null when it cannot be.
 * `rescore` reads an older transcript's calls with the same function (both new members are optional: absent, today's
 * rebuild without the language check).
 */
export function practiceAcceptedJudgeReading(input: Readonly<{ callSiteKey: string; accepted: RecordedProviderReply;
  answered: RecordedProviderReply | null; messages?: PromptPacket["messages"] | null; language?: EngineGraphLanguage | null }>):
  PracticeJudgeReading | null {
  const classify = classifierOf(callFamilyOf(input.callSiteKey) === "JUDGE" ? "JUDGE" : "PANEL", input.language ?? null);
  // Pre-flight PF-R2a9.1: the salvage's readers, as the reclaim replay passes them (apps/runner/src/run-replay.ts:214-218 at
  // 1bc8f549b); judge and panel calls are routed steps (lane "served"). They read the step's answer form off its ORIGINAL
  // packet, so `messages` must be the first try's, never a follow-up's (that one carries an assistant turn).
  const readers = input.messages == null ? null : structureReplayReaders({ callSiteKey: input.callSiteKey, lane: "served",
    packet: { messages: input.messages }, classifyContent: classify } as unknown as ProviderCallRequest);
  const content = rebuildRecordedCallContent({ accepted: input.accepted, answered: input.answered, classifyContent: classify,
    ...(readers ?? {}) });
  return content === null ? null : practiceJudgeReadingOf(input.callSiteKey, content, input.accepted.reply.finishReason);
}

/** Pure: the graph from the rows; null when the run served no propagation (nothing to rescore). */
export function buildTranscriptEngineGraph(source: EngineGraphSource): TranscriptEngineGraph | null {
  if (source.served === null) return null;
  const finals = source.served.finalStrength;
  const ordered = [...source.calls].sort((left, right) => left.sequence - right.sequence);
  const callOfReply = new Map(ordered.flatMap((call) => call.rawArtifactRef === null ? [] : [[call.rawArtifactRef, call] as const]));
  const recordedOf = (ref: string | null | undefined): RecordedProviderReply | null => ref === null || ref === undefined
    ? null : source.artifacts.get(ref)?.recorded ?? null;
  /** LG-A (deviation 7): the structure-repair call that put this refused reply into its form, when one was accepted. */
  const structureRepairOf = (call: (typeof ordered)[number]) => ordered.find((other) => other.sequence > call.sequence
    && other.outcome === "OK" && other.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)
    && structureRepairOriginalKey(other.callSiteKey) === call.callSiteKey);
  /** What the step read for the call whose reply is `ref`: its own accepted reply, or (LG-A) the structure-repair copy. */
  const readingOf = (ref: string, baseKey: string): PracticeJudgeReading | null => {
    const call = callOfReply.get(ref);
    const own = recordedOf(ref);
    if (call === undefined || own === null) return null;
    if (call.outcome === "OK") {
      const before = ordered.filter((other) => other.sequence < call.sequence && other.callSiteKey === call.callSiteKey
        && other.actorRef === call.actorRef).at(-1);
      // Pre-flight PF-R2a9.1: the step's ORIGINAL packet is its first try's (the `answered` row, or this row when it is the first).
      const firstTry = ordered.find((other) => other.sequence <= call.sequence && other.callSiteKey === call.callSiteKey
        && other.actorRef === call.actorRef);
      return practiceAcceptedJudgeReading({ callSiteKey: baseKey, accepted: own, answered: recordedOf(before?.rawArtifactRef),
        messages: firstTry?.messages ?? null, language: source.language });
    }
    // LG-A's copy is read as the wrapper read it: the step's classifier (language check included), no A1 or B on Haiku's copy.
    const repaired = recordedOf(structureRepairOf(call)?.rawArtifactRef);
    return repaired === null ? null
      : practiceAcceptedJudgeReading({ callSiteKey: baseKey, accepted: repaired, answered: null, language: source.language });
  };
  const byId = new Map(source.snapshot.nodes.map((node) => [node.nodeId, node] as const));
  const authorKeyOf = (nodeId: string): string | null => {
    const reply = byId.get(nodeId)?.provenanceRef ?? null;
    const call = reply === null ? undefined : callOfReply.get(reply);
    return call === undefined ? null : seatBaseCallSiteKey(call.callSiteKey);
  };
  const rootIndexOf = (nodeId: string): number => {
    const seen = new Set<string>();
    let current = byId.get(nodeId);
    while (current !== undefined && !seen.has(current.nodeId)) {
      seen.add(current.nodeId);
      if (current.parentNodeId === null) {
        const key = authorKeyOf(current.nodeId);
        return key === null ? -1 : rootIndexOfAuthorKey(key) ?? -1;
      }
      current = byId.get(current.parentNodeId);
    }
    return -1;
  };
  // Pre-flight PF-R2a9.7: the own-reply links by A8's structural rule (the reading the review catch-up uses), never by
  // call-site key, so a node whose author call cannot be found still reads as the runner read it.
  const shape: EvaluationSnapshot = { nodes: source.snapshot.nodes, arrows: source.snapshot.arrows,
    arrowOrder: source.snapshot.arrows.map((arrow) => arrow.arrowId), operatorResolutions: [], clusterRecords: [] };
  const ownReplies = engineOwnReplyEdgeIdsOf(shape);
  const ownReplyIds = new Set([...ownReplies.values()].flat());
  const reviews = source.reviews.flatMap((review): TranscriptEngineReview[] => REVIEW_OUTCOMES_READ.has(review.outcome)
    ? [Object.freeze({ nodeId: review.nodeId, outcome: review.outcome as TranscriptEngineReview["outcome"], reviewerMaker: review.reviewerMaker })]
    : []);
  // Pre-flight PF-R2a2.9: engine 2's facts by A8's rule (`engineNodeFactsOf`; an investigation's HOLDS = AGREE and FAILS =
  // DISPUTE, a dead end stays cannot-assess, as A14 reads them back) and A6's factor (`honestDisputeFactor`). Reviews and
  // investigations of nodes outside the snapshot (stale) are left out, as the runner's review readers leave them out.
  const inGraph = new Set(source.snapshot.nodes.map((node) => node.nodeId));
  const counted = reviews.filter((review) => inGraph.has(review.nodeId));
  const facts = source.engine !== 2 || source.scoring === null ? null : engineNodeFactsOf({
    reviewedNodeIds: counted.filter((review) => review.outcome !== "cannot-assess").map((review) => review.nodeId),
    disputedNodeIds: counted.filter((review) => review.outcome === "dispute").map((review) => review.nodeId),
    cannotAssessNodeIds: counted.filter((review) => review.outcome === "cannot-assess").map((review) => review.nodeId),
    ownReplyEdgeIds: ownReplies,
    investigated: engineInvestigatedStatuses(source.investigations.filter((row) => inGraph.has(row.nodeId)))
  });
  const disputeFactorAppliedTo = (nodeId: string): boolean => facts !== null && source.scoring !== null
    && honestDisputeFactor(facts.get(nodeId)?.status ?? "NONE", source.scoring) !== 1;
  const nodes = source.snapshot.nodes.map((node): TranscriptEngineNode => {
    const key = authorKeyOf(node.nodeId);
    return Object.freeze({
      nodeId: node.nodeId, parentNodeId: node.parentNodeId, rootIndex: rootIndexOf(node.nodeId),
      authorMaker: (node.provenanceRef === null ? undefined : source.artifacts.get(node.provenanceRef)?.maker) ?? UNKNOWN_MAKER,
      kind: node.parentNodeId === null && !node.isFolder ? "ROOT" : key !== null && key.startsWith(CROSS_KEY_PREFIX) ? "CROSS" : "POINT",
      hidden: !Object.hasOwn(finals, node.nodeId) && node.baseStrength !== null && !node.isFolder,
      isFolder: node.isFolder,
      disputeFactorApplied: disputeFactorAppliedTo(node.nodeId)
    });
  });
  const edges = source.snapshot.arrows.map((arrow): TranscriptEngineEdge => Object.freeze({
    edgeId: arrow.arrowId, from: arrow.sourceNodeId, to: arrow.targetKind === "NODE" ? arrow.targetNodeId : null,
    polarity: arrow.polarity, bearing: arrow.magnitudeStatus === "MEASURED" ? arrow.strength : null,
    ownReply: ownReplyIds.has(arrow.arrowId),
    targetKind: arrow.targetKind, targetEdgeId: arrow.targetEdgeId, kind: arrow.kind, strengthSource: arrow.strengthSource,
    clusterKey: arrow.clusterKey
  }));
  const panelRefs = new Set(source.panelRefs);
  const voices: TranscriptEngineVoice[] = [];
  const unreadVoices: Readonly<{ nodeId: string; judgementRef: string }>[] = [];
  const voiceOf = (nodeId: string, baseKey: string, judgementRef: string, isAuthor: boolean): void => {
    const reading = readingOf(judgementRef, baseKey);
    const maker = source.artifacts.get(judgementRef)?.maker;
    if (reading === null || maker === undefined) {
      unreadVoices.push(Object.freeze({ nodeId, judgementRef }));
      return;
    }
    voices.push(Object.freeze({ nodeId, judgementRef, maker, isAuthor, assessment: reading.assessment }));
  };
  for (const node of source.snapshot.nodes) {
    const key = authorKeyOf(node.nodeId);
    if (key === null || node.provenanceRef === null) continue;
    voiceOf(node.nodeId, key, node.provenanceRef, true);
    const prefix = panelKeyPrefixOf(key);
    // Per panel key, the reply the step took: the last accepted one, or (LG-A) the last one the structure-repair call fixed.
    const chosen = new Map<string, string>();
    for (const call of ordered) {
      const base = seatBaseCallSiteKey(call.callSiteKey);
      if (call.rawArtifactRef === null || callFamilyOf(base) !== "PANEL" || !base.startsWith(prefix)
        || !panelRefs.has(base.slice(prefix.length))) continue;
      if (call.outcome === "OK" || structureRepairOf(call) !== undefined) chosen.set(base, call.rawArtifactRef);
    }
    for (const [base, judgementRef] of chosen) voiceOf(node.nodeId, base, judgementRef, false);
  }
  const baseStrength = Object.fromEntries(source.snapshot.nodes.flatMap((node) => node.baseStrength === null ? [] : [[node.nodeId, node.baseStrength] as const]));
  return Object.freeze({
    engine: source.engine,
    engineReceipt: source.engine === 2 ? source.engineReceipt : null,
    nodes: Object.freeze(nodes), edges: Object.freeze(edges), reviews: Object.freeze(reviews),
    voices: Object.freeze(voices),
    investigations: Object.freeze(source.investigations.map((row) =>
      Object.freeze({ nodeId: row.nodeId, result: row.result as PointInvestigationResult }))),
    unreadVoices: Object.freeze(unreadVoices),
    served: Object.freeze({ baseStrength: Object.freeze(baseStrength), finalStrength: Object.freeze({ ...finals }),
      servedRootNodeId: source.served.servedRootNodeId })
  });
}

/** Reads the rows from the throwaway database, while the run's key still exists (called by recordPracticeTranscript). */
export async function readEngineGraphSource(pool: Pool, runId: string, panelRefs: readonly string[]): Promise<EngineGraphSource> {
  const run = (await pool.query<{ envelope_basis: unknown; question_line: string; content_ciphertext: unknown;
    argument_language_tag: string; argument_language_name: string }>(
    `SELECT envelope_basis, question_line, content_ciphertext, argument_language_tag, argument_language_name
       FROM core.run WHERE run_id=$1`, [runId])).rows[0];
  const basis = run?.envelope_basis ?? null;
  const receipt = parseCostEnvelopeBasis(basis);
  // R1d's one reader of the receipt's engine member (INTERFACE §3.3).
  const ofRun = engineOfRun(receipt);
  // Pre-flight PF-R2a9.2: the question line (decrypted as packages/db/src/index.ts:2402-2405 reads it, at 1bc8f549b) and
  // the run's lock, decided by its receipt as the runner decides it (`runQuestionLanguageLock`; columns 0072).
  const language: EngineGraphLanguage | null = run === undefined ? null : Object.freeze({
    questionLine: (await decryptContentForRun<{ questionLine: string }>(pool, runId, "core.run", runId,
      (run.content_ciphertext ?? null) as never, { questionLine: run.question_line })).questionLine,
    lock: runQuestionLanguageLock(receipt.shape ?? null, { argumentLanguageTag: run.argument_language_tag,
      argumentLanguageName: run.argument_language_name })
  });
  const snapshot = await new GraphRepository(pool).materialiseSnapshot(runId);
  const calls = (await pool.query<{ sequence: string; attempt_id: string | null; call_site_key: string; actor_ref: string; outcome: string;
    raw_artifact_ref: string | null }>(
    `SELECT sequence::text, attempt_id::text, call_site_key, actor_ref, outcome, raw_artifact_ref::text
       FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, [runId])).rows;
  // Pre-flight PF-R2a9.1: each JUDGE and PANEL try's prompt, read as the transcript reads it (practice-transcript.ts:370-372
  // `readCallPrompt`, :248-249 the messages' JSON, at 1bc8f549b), so the salvage's readers see the step's answer form.
  const messagesOf = new Map<string, PromptPacket["messages"]>();
  for (const call of calls) {
    const family = callFamilyOf(call.call_site_key);
    if (call.attempt_id === null || (family !== "JUDGE" && family !== "PANEL")) continue;
    const prompt = await readCallPrompt(pool, call.attempt_id);
    let messages: unknown = null;
    try { messages = prompt === null ? null : JSON.parse(prompt.promptText) as unknown; } catch { messages = null; }
    if (Array.isArray(messages)) messagesOf.set(call.attempt_id, messages as PromptPacket["messages"]);
  }
  const wanted = new Set(calls.filter((call) => call.raw_artifact_ref !== null && (call.call_site_key.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX)
    || callFamilyOf(call.call_site_key) === "JUDGE" || callFamilyOf(call.call_site_key) === "PANEL")).map((call) => call.raw_artifact_ref!));
  const artifacts = new Map<string, Readonly<{ maker: string; recorded: RecordedProviderReply | null }>>();
  for (const row of (await pool.query<{ raw_artifact_id: string; provider: string; maker: string; raw_text: string; content_ciphertext: unknown }>(
    `SELECT raw_artifact_id::text, provider, maker, raw_text, content_ciphertext FROM ledger.raw_artifact WHERE run_id=$1`, [runId])).rows) {
    let recorded: RecordedProviderReply | null = null;
    if (wanted.has(row.raw_artifact_id)) {
      const stored = await decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(pool, runId, "ledger.raw_artifact",
        row.raw_artifact_id, (row.content_ciphertext ?? null) as never, { rawText: row.raw_text, parseErrorDetail: null });
      // As the reclaim resume reads a recorded reply (apps/runner/src/run-replay.ts:214-218 at 1bc8f549b): the vendor's own bytes, normalised.
      recorded = readRecordedProviderReply(stored.rawText, row.provider);
    }
    artifacts.set(row.raw_artifact_id, Object.freeze({ maker: row.maker, recorded }));
  }
  const reviews = (await pool.query<{ node_id: string; outcome: string; reviewer_maker: string }>(
    `SELECT review.node_id::text, review.outcome, artifact.maker AS reviewer_maker
       FROM ledger.node_review AS review
       JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = review.review_raw_artifact_ref
       JOIN core.node AS node ON node.run_id = review.run_id AND node.node_id = review.node_id
      WHERE review.run_id=$1 AND node.generation_status IS DISTINCT FROM 'stale' ORDER BY review.at_seq`, [runId])).rows;
  // A9's table (one row per qualifying point, in investigation order). Both reads skip a set-aside ('stale') node, as A10's
  // reader does and as the report's investigations block does (practice-investigations.ts).
  const investigations = (await pool.query<{ node_id: string; result: string }>(
    `SELECT investigation.node_id::text, investigation.result FROM ledger.point_investigation AS investigation
       JOIN core.node AS node ON node.run_id = investigation.run_id AND node.node_id = investigation.node_id
      WHERE investigation.run_id=$1 AND node.generation_status IS DISTINCT FROM 'stale'
      ORDER BY investigation.investigation_order, investigation.node_id`, [runId])).rows;
  const servedRow = (await pool.query<{ propagation_run_id: string; served_root_selection: { servedNodeId?: unknown } | null }>(
    `SELECT propagation_run_id::text, served_root_selection FROM ledger.propagation_run
      WHERE run_id=$1 AND served_root_selection IS NOT NULL ORDER BY at_seq DESC LIMIT 1`, [runId])).rows[0];
  const finals = servedRow === undefined ? [] : (await pool.query<{ node_id: string; strength: number }>(
    "SELECT node_id::text, strength FROM ledger.node_strength_record WHERE propagation_run_id=$1", [servedRow.propagation_run_id])).rows;
  return Object.freeze({
    engine: ofRun.engine, engineReceipt: (basis as { engine?: unknown } | null)?.engine ?? null,
    scoring: ofRun.engine === 2 ? ofRun.scoring : null, language,
    snapshot: Object.freeze({
      nodes: snapshot.nodes.map((node) => Object.freeze({ nodeId: node.nodeId, baseStrength: node.baseStrength,
        parentNodeId: node.parentNodeId, provenanceRef: node.provenanceRef, isFolder: node.isFolder })),
      arrows: snapshot.arrows
    }),
    calls: calls.map((call) => Object.freeze({ sequence: Number(call.sequence), callSiteKey: call.call_site_key, actorRef: call.actor_ref,
      outcome: call.outcome, rawArtifactRef: call.raw_artifact_ref, attemptId: call.attempt_id,
      messages: call.attempt_id === null ? null : messagesOf.get(call.attempt_id) ?? null })),
    artifacts, panelRefs,
    reviews: reviews.map((row) => Object.freeze({ nodeId: row.node_id, outcome: row.outcome, reviewerMaker: row.reviewer_maker })),
    investigations: investigations.map((row) => Object.freeze({ nodeId: row.node_id, result: row.result })),
    served: servedRow === undefined ? null : Object.freeze({
      servedRootNodeId: typeof servedRow.served_root_selection?.servedNodeId === "string" ? servedRow.served_root_selection.servedNodeId : null,
      finalStrength: Object.freeze(Object.fromEntries(finals.map((row) => [row.node_id, Number(row.strength)])))
    })
  });
}
