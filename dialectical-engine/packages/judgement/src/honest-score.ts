// packages/judgement/src/honest-score.ts
/**
 * ENGINE REDESIGN R2 (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.2, §4.6; INTERFACE §6.1):
 * honest scores, pure functions.
 *
 * Plain words: each grader's assessment of a point becomes one honest grade: the seven measures the grader already
 * gives, weighted as the engine row says, then capped when the grader flagged a serious fatal flaw or could not restate
 * the point faithfully. The point's honest score is the median of the OTHER makers' grades; the author's own grade counts
 * only when nobody else graded the point, and that is disclosed. A point a cross-maker reviewer disputed, or an
 * investigation found to fail, counts for less (`honestDisputeFactor`); that factor is applied to the point's base
 * strength when engine 2's propagation snapshot is built (apps/runner/src/engine-links.ts), never written into the score.
 * Code only computes here; every judgment is a grader's. Engine 1 never calls this file (its reduction stays in s04.ts).
 */
import { TypedDomainError } from "@debateai/kernel";
import type { EngineScoring } from "@debateai/register";
import { compositionMetricsOf, type CompositionMetric, type JudgeAssessment } from "./s04.js";

/** The cap that lowered a grade: a fatal flaw at or above the row's severity, or a restatement below the row's fidelity. */
export type HonestCap = "FATAL" | "FIDELITY_FLOOR";

export type HonestGrade = Readonly<{
  /** After both caps, 0..1. */
  grade: number;
  /** The clamped weighted sum of the seven measures, before the caps. */
  weighted: number;
  /** The caps that lowered `weighted`, FATAL before FIDELITY_FLOOR; a cap that would not lower it is not listed. */
  caps: readonly HonestCap[];
  metrics: Readonly<Record<CompositionMetric, number>>;
}>;

function unitInterval(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be in [0,1]`);
  return value;
}

/**
 * One grader's assessment → its honest grade. The fatal cap reads each flag's own `severity` (fatalFlagSchema, s04.ts),
 * never its free-text type: a flag at or above `fatalCap.minFlagSeverity` caps the grade at `fatalCap.to`. The fidelity
 * floor: a `steelman.fidelity` below `fidelityFloor.below` caps it at `fidelityFloor.to`. A cap never raises a grade.
 */
export function honestGrade(assessment: JudgeAssessment, scoring: EngineScoring): HonestGrade {
  const metrics = compositionMetricsOf(assessment, unitInterval(scoring.clarityDecayPerAmbiguity, "clarity decay"));
  let sum = 0;
  for (const term of scoring.terms) sum += metrics[term.metric] * unitInterval(term.coefficient, `coefficient ${term.metric}`);
  const weighted = Math.max(0, Math.min(1, sum));
  const fatalTo = unitInterval(scoring.fatalCap.to, "fatal cap");
  const fatalSeverity = unitInterval(scoring.fatalCap.minFlagSeverity, "fatal cap severity");
  const floorTo = unitInterval(scoring.fidelityFloor.to, "fidelity floor");
  const floorBelow = unitInterval(scoring.fidelityFloor.below, "fidelity floor threshold");
  const caps: HonestCap[] = [];
  let grade = weighted;
  if (assessment.fallacy.fatalFlags.some((flag) => flag.severity >= fatalSeverity) && weighted > fatalTo) {
    caps.push("FATAL");
    grade = Math.min(grade, fatalTo);
  }
  if (assessment.steelman.fidelity < floorBelow && weighted > floorTo) {
    caps.push("FIDELITY_FLOOR");
    grade = Math.min(grade, floorTo);
  }
  return Object.freeze({ grade, weighted, caps: Object.freeze(caps), metrics });
}

/** The middle value, or the mean of the middle two. Each grade must be a number in [0,1], so none can scramble the sort. */
export function honestMedian(values: readonly number[]): number {
  if (values.length === 0) throw new TypedDomainError("HONEST_MEDIAN_EMPTY", "A median needs at least one grade");
  const sorted = values.map((value) => unitInterval(value, "grade")).sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export type HonestVoice = Readonly<{ judgementRef: string; maker: string; isAuthor: boolean; grade: HonestGrade }>;
export type HonestPointScore = Readonly<{
  /** The median of the other makers' grades; an even count: the mean of the middle two. */
  score: number;
  source: "OTHER_MAKERS" | "AUTHOR_LAST_RESORT";
  /** The voices counted. */
  voices: number;
  /** The median voice; an even count: the lower middle; the last resort: the author. */
  selectedJudgementRef: string;
}>;

/**
 * Null when there is no voice at all. The author's voice counts only when no other maker's voice exists (E10). Another
 * maker's voice is neither the author's nor of the author's maker (spec §4.2's producer law): a second voice of the
 * author's own maker is kept on record by the caller, never counted here.
 */
export function honestPointScore(voices: readonly HonestVoice[]): HonestPointScore | null {
  const authorMaker = voices.find((voice) => voice.isAuthor)?.maker;
  const others = voices.filter((voice) => !(voice.isAuthor || voice.maker === authorMaker));
  if (others.length > 0) {
    // A stable sort: of two equal grades, the one heard first is the lower.
    const ordered = [...others].sort((left, right) => left.grade.grade - right.grade.grade);
    return Object.freeze({
      score: honestMedian(others.map((voice) => voice.grade.grade)),
      source: "OTHER_MAKERS",
      voices: others.length,
      selectedJudgementRef: ordered[Math.floor((ordered.length - 1) / 2)]!.judgementRef
    });
  }
  const author = voices.find((voice) => voice.isAuthor);
  return author === undefined ? null : Object.freeze({
    score: author.grade.grade, source: "AUTHOR_LAST_RESORT", voices: 1, selectedJudgementRef: author.judgementRef
  });
}

/** A point's own cross-maker review (or its investigation's reading, §4.2b) as engine 2 weighs it. */
export type EngineReviewStatus = "AGREE" | "DISPUTE" | "CANNOT_ASSESS" | "NONE";

/** The row's disputed weight for a disputed point (a review dispute, or an investigation that found it fails), else 1. */
export function honestDisputeFactor(status: EngineReviewStatus, scoring: EngineScoring): number {
  return status === "DISPUTE" ? unitInterval(scoring.disputedWeight, "disputed weight") : 1;
}

/** Engine 2's judgement-selection rule, beside engine 1's `JudgementSelectionRule` (MAXIMIZE_WEIGHTED_TAU). */
export type HonestSelectionRule = Readonly<{ kind: "ENGINE2_HONEST_MEDIAN"; rowKey: string; registerVersion: number; sourceRef: string }>;

export function honestSelectionRule(provenance: Readonly<{ rowKey: string; registerVersion: number; sourceRef: string }>): HonestSelectionRule {
  if (provenance.rowKey.trim() === "" || provenance.sourceRef.trim() === ""
    || !Number.isInteger(provenance.registerVersion) || provenance.registerVersion < 1) {
    throw new TypeError("Register-row provenance is incomplete");
  }
  return Object.freeze({ kind: "ENGINE2_HONEST_MEDIAN", rowKey: provenance.rowKey, registerVersion: provenance.registerVersion, sourceRef: provenance.sourceRef });
}

/** INTERFACE §6.2: the `honest` member of `ledger.reduced_judgement.disagreement`, beside `panel`. */
export type HonestDisagreementRecord = Readonly<{
  voices: readonly Readonly<{ memberRole: string; grade: number; weighted: number; caps: readonly HonestCap[] }>[];
  median: number;
  source: HonestPointScore["source"];
}>;

/** Every voice heard (the author first, as the panel heard it), with the score the point got and where it came from. */
export function honestDisagreementRecord(voices: readonly Readonly<{ memberRole: string; grade: HonestGrade }>[],
  score: HonestPointScore): HonestDisagreementRecord {
  return Object.freeze({
    voices: Object.freeze(voices.map((voice) => Object.freeze({
      memberRole: voice.memberRole, grade: voice.grade.grade, weighted: voice.grade.weighted, caps: voice.grade.caps
    }))),
    median: score.score,
    source: score.source
  });
}
