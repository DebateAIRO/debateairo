import type { Answer, AnswerStory } from "@debateai/contract";
import debateDrawersEnglish from "../../messages/en/debateDrawers.json" with { type: "json" };
import type { LiveVerdictState } from "../types.js";
import { liveVerdictState } from "./labels.js";
import { STORY_FATE_WORDS, countStoryPositions, type StoryFateValue } from "./storyWords.js";
import { STORY_SUPPORTED_SENTENCE, verdictStateSentence } from "./verdictStateSentences.js";

/**
 * The owner page's story strip (spec 2026-09-26 §10), as plain data. The label
 * and confidence come from the arithmetic on the answer, never from the story;
 * every other string is the story's own plain text.
 */
export interface StoryPathView {
  readonly fate: StoryFateValue;
  readonly fateWords: string;
  readonly line: string;
  readonly positionRef: string;
}

export interface StoryView {
  readonly status: AnswerStory["status"];
  /** The arithmetic verdict state the label's colour is keyed off; null when the debate has no verdict. */
  readonly verdictState: LiveVerdictState | null;
  readonly labelWords: string;
  readonly labelSentence: string;
  readonly confidenceWords: string | null;
  readonly headline: string | null;
  readonly summary: string | null;
  readonly paths: readonly StoryPathView[];
  readonly morePaths: number;
  readonly change: string | null;
  readonly reviewerNote: string | null;
  readonly reservation: string | null;
  /**
   * The first point number (such as "P5") the checker's reservation names, or
   * null when it names none. Only the full report's appendix explains those
   * numbers, so the reservation box says so under the reservation, and only
   * when there is a number to explain.
   */
  readonly reservationPointNumber: string | null;
  /** Today's composed text, shown only when the story is UNAVAILABLE. */
  readonly fallbackText: string | null;
  /** The PDF download, only for READY and READY_WITH_RESERVATION. */
  readonly pdfHref: string | null;
}

type VerdictLabel = NonNullable<Answer["verdict_state"]>;

const LABEL_WORDS: Readonly<Record<VerdictLabel, string>> = Object.freeze({
  SUPPORTED: "Supported",
  CONTESTED: "Contested",
  UNSUPPORTED: "Unsupported"
});

/**
 * A point number as the story checks read one (packages/story validate.ts,
 * STORY_SHORT_POINT_NUMBER): "P" and a number from 1, standing alone.
 */
const POINT_NUMBER = /\bP[1-9][0-9]*\b/u;

export function storyLabelWords(label: Answer["verdict_state"]): string {
  return label === null ? "No verdict" : LABEL_WORDS[label];
}

export function storyLabelSentence(label: Answer["verdict_state"]): string {
  if (label === null) return "This debate ended without a verdict, so there is no label to explain.";
  // TODO(story localization): the story view is English for now, so it reads the
  // banner's sentence from the English catalogue; the localization task passes
  // the interface locale's debateDrawers catalogue here.
  return verdictStateSentence(liveVerdictState(label), debateDrawersEnglish) ?? STORY_SUPPORTED_SENTENCE;
}

/**
 * The confidence band is the engine's own vocabulary (ENGINE_BAND_ORDER,
 * weakest first: CAPPED, FULL). The served band starts at the register's
 * candidate band, and several independent rules can each hold it down
 * (apps/runner servedCandidateConfidenceBand, then packages/serve
 * deriveBandCeiling):
 *  - a run where only one AI maker argued (applySingleLineageBandCap);
 *  - a judge panel that fell to a single voice on the served position
 *    (applyPanelDegradedBandStepDown);
 *  - a cross-maker review that disputed a point (the downgrade-bands row's
 *    one-step-down);
 *  - the way-of-knowing ceiling over the points the answer cites: too much of
 *    it is reasoning alone, or no cited point could be traced.
 * The answer does not record which rule fired (`band_ceiling` describes only
 * the ceiling's own check, and can name its default while a step-down still
 * lowered the band), and the thresholds are sealed register values the page
 * does not read. So CAPPED is worded with examples, never one cause, and FULL
 * says only that none of these rules lowered it. Both stay true on every route.
 */
export function storyConfidenceWords(band: string | null): string | null {
  if (band === null) return null;
  if (band === "FULL") return "Confidence: full, because none of the checks that can lower it found a reason to";
  if (band === "CAPPED") {
    return "Confidence: held below full, for example because much of the answer rests on reasoning alone, a reviewer disputed a point, or only one AI model argued";
  }
  return `Confidence: ${band.toLowerCase()}`;
}

export function storyReportHref(debateId: string): string {
  return `/debate/${encodeURIComponent(debateId)}/report`;
}

export function toStoryView(answer: Answer, story: AnswerStory | null, debateId: string): StoryView {
  const requested: AnswerStory["status"] = story === null ? "WRITING" : story.status;
  const ready = requested === "READY" || requested === "READY_WITH_RESERVATION";
  const body = ready && story !== null ? story.story : null;
  const status: AnswerStory["status"] = ready && body === null ? "UNAVAILABLE" : requested;
  const label = {
    verdictState: answer.verdict_state === null ? null : liveVerdictState(answer.verdict_state),
    labelWords: storyLabelWords(answer.verdict_state),
    labelSentence: storyLabelSentence(answer.verdict_state),
    confidenceWords: storyConfidenceWords(answer.confidence_band)
  };
  if (body === null) {
    const composed = answer.composed_text
      .map((segment) => segment.text.trim())
      .filter((text) => text.length > 0)
      .join("\n\n");
    return {
      status,
      ...label,
      headline: null,
      summary: null,
      paths: [],
      morePaths: 0,
      change: null,
      reviewerNote: null,
      reservation: null,
      reservationPointNumber: null,
      fallbackText: status === "UNAVAILABLE" && composed.length > 0 ? composed : null,
      pdfHref: null
    };
  }
  const paths = body.short.paths.map((path) => ({
    fate: path.fate,
    fateWords: STORY_FATE_WORDS[path.fate],
    line: path.line,
    positionRef: path.position_ref
  }));
  const reservation = status === "READY_WITH_RESERVATION" && story !== null ? story.reservation : null;
  return {
    status,
    ...label,
    headline: body.short.headline,
    summary: body.short.summary,
    paths,
    morePaths: Math.max(0, countStoryPositions(answer.nodes, answer.edges) - paths.length),
    change: body.short.change.text,
    reviewerNote: body.reviewer_note === null ? null : body.reviewer_note.text,
    reservation,
    reservationPointNumber: reservation === null ? null : POINT_NUMBER.exec(reservation)?.[0] ?? null,
    fallbackText: null,
    pdfHref: storyReportHref(debateId)
  };
}
