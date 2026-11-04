import { randomBytes as cryptoRandomBytes } from "node:crypto";
import type { PathOutcome } from "@debateai/contract";
import { TypedDomainError, replyLanguageCheckFor, type PathId } from "@debateai/kernel";
import type { ProviderGateway, TokenCounter } from "@debateai/providers";
import { INVESTIGATION_REPORT_POLICY } from "@debateai/register";
import type { ComposedSegment } from "@debateai/serve";
import {
  REPORT_ANSWER_PROSE, REPORT_CHECKER_PROSE, investigationReportCallSiteKey, writeOverallAnswer, type OverallAnswerWritten, type ReportAnswerDraft,
  type ReportCallMaterial, type ReportSite, type StoryRoleMaker
} from "@debateai/story";
import { engineContractHash } from "./engine-contracts.js";
import { closingRandomBytes } from "./investigation-close.js";
import { dossierRefsOf, investigationReportGuard, type DossierInput, type DossierPath, type DossierSource } from "./investigation-dossier.js";
import type { PathOutcomesJob } from "./path-outcomes.js";
import type { PathRewritePoint, PathRewriteQuestion } from "./path-rewrite-material.js";
import { fitDossierToTokenLine } from "./token-line.js";

/**
 * V4 start step, Task 50 (spec 2026-11-03 §4.3): THE MAIN ANSWER OF A PATH RUN, written when every path's own chain has ended (Task
 * 54). It is the owner's approved "Overall view, every point" writer (31 Oct), which weighs every path and leaves none out: the
 * report's own answer step, `writeOverallAnswer`, on report.answer.v4 and report.answer-check.v3 byte for byte. Haiku writes and GLM
 * checks (the seats the paths' answers so far sit in), 2 rounds on a paid plan and 1 on Free, no backup writer.
 *
 * THE MATERIAL is the report's dossier (investigation-dossier.ts), built by code from the paths (`pathsDossierInput`): the question
 * (the person's care sentence is inside it, owner answer Q4), then each path in the person's order as a first-debate path: its answer
 * so far (the outcome's line, summary and fate; the path's question and SET_ASIDE when it FAILED or has none), its points and their
 * pages; the person's own words on a path in `views`, marked as theirs, never beside the path; no first-debate answer and no digs. The
 * length line is the receipt's words ("about <answerWords> words"). It is fitted under the 100K line by the dossier's ladder and then
 * by the real count near the line (`fitDossierToTokenLine`, R22 decision 28), and every round of one answer is framed under one fence
 * (`closingRandomBytes` over one seed), so round 2 reads round 1's material from the cache.
 *
 * THE CALLS are the first debate's own answer calls: the writer at `COMPOSER:SYNTHESIZER:INITIAL:1` (then `RETRY:<r>`), the checker at
 * `POST_COMPOSE_R9:EVALUATOR:<r>`, on the served lane, so they draw on the answer's own money (SERVE) and are never walled, as R22's.
 * THE SEGMENTS are the answer's, `s1..` in order, the first alone load-bearing; each names the run's nodes its refs rest on (a path's
 * A-ref → its root, a P-ref → the point), and a ref with no node (a page, a path whose root dropped) is left out.
 *
 * Never throws for a provider or a refused call (`writeOverallAnswer`'s rule); material that fits no ladder place ends FAILED with no
 * call. Logs codes, ids and counts only.
 */

/** One path as the main answer reads it: its menu text, its root, its answer so far, the person's own words, its points and pages. */
export type PathsDossierPath = Readonly<{
  pathId: PathId;
  /** The root that argued it; null: the root dropped (its A-ref then names no node). */
  rootNodeId: string | null;
  title: string;
  question: string;
  /** The person's own words on this path (their own path, their rewrite), as they wrote them; none: []. */
  ownWords: readonly string[];
  /** Its answer so far (Task 49); null: none stored. */
  outcome: PathOutcome | null;
  /** The points under the root (the root excluded), each right after the one it argues, with code's trust word. */
  points: readonly PathRewritePoint[];
  sources: readonly DossierSource[];
}>;

export type PathsMainAnswerInput = Readonly<{
  runId: string;
  free: boolean;
  /** The receipt's answer words. */
  answerWords: number;
  question: PathRewriteQuestion;
  paths: readonly PathsDossierPath[];
  seats: PathOutcomesJob["seats"];
  gateway: ProviderGateway;
  tokenCount: TokenCounter | undefined;
  log: (event: string, detail: Record<string, unknown>) => void;
}>;

export const PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE = "PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE" as const;
/** The subject every call of a path run's main answer names (its attempts' key, beside the run and the call site). */
const PATHS_MAIN_ANSWER_SUBJECT = "paths-main-answer";

/* ----------------------------------------------------------------- the material */

function dossierPathOf(path: PathsDossierPath): DossierPath {
  const text = path.outcome?.text ?? null;
  return Object.freeze({
    ref: path.pathId,
    storyLine: text?.line ?? path.question,
    storyFate: text?.fate ?? "SET_ASIDE",
    points: path.points,
    sources: path.sources,
    current: text === null ? null : Object.freeze({ line: text.line, summary: text.summary, fate: text.fate }),
    ownWords: Object.freeze([...path.ownWords])
  });
}

/** A path run's dossier input: the paths as the first debate's, in the person's order; no first-debate answer, no digs, no earlier report. */
export function pathsDossierInput(input: Readonly<{ runId: string; question: PathRewriteQuestion; paths: readonly PathsDossierPath[];
  answerWords: number }>): DossierInput {
  return Object.freeze({
    question: input.question,
    first: Object.freeze({ runId: input.runId, answer: null, paths: Object.freeze(input.paths.map(dossierPathOf)) }),
    digs: Object.freeze([]),
    earlier: null,
    answerWords: input.answerWords
  });
}

/** Each ref the answer may rest on that names a node of the run: a path's A-ref → its root, a P-ref → the point. */
function refToNodeOf(input: DossierInput, paths: readonly PathsDossierPath[]): ReadonlyMap<string, string> {
  const refs = dossierRefsOf(input, []);
  const nodes = new Map<string, string>();
  for (const path of paths) {
    const pathRef = refs.pathRef.get(path.pathId);
    if (pathRef !== undefined && path.rootNodeId !== null) nodes.set(pathRef, path.rootNodeId);
    for (const point of path.points) {
      const pointRef = refs.pointRef.get(point.id.toLowerCase());
      if (pointRef !== undefined && !nodes.has(pointRef)) nodes.set(pointRef, point.id);
    }
  }
  return nodes;
}

/* ----------------------------------------------------------------- the calls and the segments */

/** The first debate's own answer keys: the writer `COMPOSER:SYNTHESIZER:INITIAL:1`, then `RETRY:<r>`; the checker `POST_COMPOSE_R9:EVALUATOR:<r>`. */
export function pathsMainAnswerCallSiteOf(site: ReportSite, round: number): string {
  // The report's own round rule (1 to 4: two rounds, then a backup writer's two).
  investigationReportCallSiteKey(site, round);
  if (site === "ANSWER") return `COMPOSER:SYNTHESIZER:${round === 1 ? "INITIAL" : "RETRY"}:${String(round)}`;
  if (site === "ANSWER_CHECK") return `POST_COMPOSE_R9:EVALUATOR:${String(round)}`;
  // A path run's dossier has no deeper paths to ask for, and the main answer has no story.
  throw new TypedDomainError("PATHS_MAIN_ANSWER_SITE_INVALID", "A path run's main answer has a writer and a checker only");
}

/** The answer's segments as the run serves them: `s1..`, the first alone load-bearing, each ref turned into its node, the rest left out. */
export function pathsComposedSegments(draft: ReportAnswerDraft, refToNode: ReadonlyMap<string, string>): readonly ComposedSegment[] {
  return Object.freeze(draft.segments.map((segment, at) => Object.freeze({
    segmentId: `s${String(at + 1)}`,
    text: segment.text,
    loadBearing: at === 0,
    assertedNodeRefs: Object.freeze([...new Set(segment.rests_on.flatMap((ref) => {
      const node = refToNode.get(ref);
      return node === undefined ? [] : [node];
    }))]),
    servedNumberRefs: Object.freeze([])
  })));
}

/** No material at all: what a main answer whose dossier fits no ladder place ends with (nothing reads it). */
const NO_MATERIAL: ReportCallMaterial = Object.freeze({
  answerWriter: Object.freeze([]),
  answerCheckerOf: () => Object.freeze([]),
  storyWriterOf: () => Object.freeze([]),
  storyCheckerOf: () => Object.freeze([]),
  index: Object.freeze({ refs: new Set<string>(), cardRefs: Object.freeze([]) })
});

function tooLarge(): OverallAnswerWritten {
  const outcome = Object.freeze({ outcome: "FAILED" as const, failureCode: PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE,
    cause: PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE, rounds: Object.freeze([]) });
  return Object.freeze({ outcome, rounds: outcome.rounds, backup: null, material: NO_MATERIAL, askArtifactRef: null });
}

/** The main answer: its material, the writer's and the checker's rounds, and its segments (none when it FAILED). */
export async function runPathsMainAnswer(input: PathsMainAnswerInput): Promise<Readonly<{ written: OverallAnswerWritten;
  segments: readonly ComposedSegment[] }>> {
  const log: PathsMainAnswerInput["log"] = (event, detail) => {
    try {
      input.log(event, { runId: input.runId, ...detail });
    } catch {
      // A failing log sink never costs the run its answer.
    }
  };
  const dossierInput = pathsDossierInput({ runId: input.runId, question: input.question, paths: input.paths, answerWords: input.answerWords });
  const built = await fitDossierToTokenLine(dossierInput, input.tokenCount, log);
  if (built.kind === "TOO_LARGE") {
    log(PATHS_MAIN_ANSWER_DOSSIER_TOO_LARGE, { bodyBytes: built.bodyBytes });
    return Object.freeze({ written: tooLarge(), segments: Object.freeze([]) });
  }
  const writer: StoryRoleMaker = Object.freeze({ provider: input.gateway, providerRef: input.seats.writer.providerRef });
  const checker: StoryRoleMaker = Object.freeze({ provider: input.gateway, providerRef: input.seats.checker.providerRef });
  const language = input.question.language;
  const written = await writeOverallAnswer({
    runId: input.runId, subjectItemId: PATHS_MAIN_ANSWER_SUBJECT, contractHash: engineContractHash(), callSiteOf: pathsMainAnswerCallSiteOf,
    maxRounds: input.free ? INVESTIGATION_REPORT_POLICY.freeMaxRounds : INVESTIGATION_REPORT_POLICY.maxRounds,
    later: false, writer, checker, backupCandidates: [],
    material: built.material,
    // The first debate's answer calls are the writer and the checker on the served lane: the answer's own money, never walled.
    send: (maker, request) => maker.provider.call(Object.freeze({ ...request, lane: "served" as const })),
    guard: investigationReportGuard,
    // One seed per answer: every round is framed under one fence and canary.
    randomBytes: closingRandomBytes(cryptoRandomBytes(32)),
    answerLanguageCheck: replyLanguageCheckFor(input.question.line, language, REPORT_ANSWER_PROSE),
    checkerLanguageCheck: replyLanguageCheckFor(input.question.line, language, REPORT_CHECKER_PROSE),
    log
  });
  const outcome = written.outcome;
  if (outcome.outcome === "FAILED") {
    log("PATHS_MAIN_ANSWER_FAILED", { failureCode: outcome.failureCode, cause: outcome.cause, rounds: written.rounds.length });
    return Object.freeze({ written, segments: Object.freeze([]) });
  }
  return Object.freeze({ written, segments: pathsComposedSegments(outcome.body, refToNodeOf(dossierInput, input.paths)) });
}
