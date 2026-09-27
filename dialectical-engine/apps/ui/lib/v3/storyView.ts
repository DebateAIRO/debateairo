import type { Answer, AnswerStory } from "@debateai/contract";
import { reportSupportedForLocale } from "../report/reportLanguage.js";
import type { LiveVerdictState } from "../types.js";
import type { ResolvedFloor } from "./floorAnswer.js";
import { liveVerdictState } from "./labels.js";
import { countStoryPositions, type StoryFateValue, type StoryLabel } from "./storyWords.js";

/**
 * The owner page's story strip (spec 2026-09-26 §10, amended by §14), as plain
 * data. It holds no fixed words: the panel words the label, the fates and every
 * line of its own from the catalogue of the question's locale. The label comes
 * from the arithmetic on the answer, never from the story; every other string
 * is the story's own plain text.
 */
export interface StoryPathView {
  readonly fate: StoryFateValue;
  readonly line: string;
  readonly positionRef: string;
}

export interface StoryView {
  readonly status: AnswerStory["status"];
  /** The arithmetic label, shown in human words; null when the debate has no verdict (no pill then). */
  readonly label: StoryLabel | null;
  /** The label's colour key, from the same arithmetic. */
  readonly verdictState: LiveVerdictState | null;
  /**
   * The storyteller's own sentence on how sure we are (spec §14.2), in the
   * question's language. Null with no story (WRITING, UNAVAILABLE): the panel
   * then says nothing about confidence rather than a generic line.
   */
  readonly confidence: string | null;
  readonly headline: string | null;
  readonly summary: string | null;
  readonly paths: readonly StoryPathView[];
  readonly morePaths: number;
  readonly change: string | null;
  readonly reviewerNote: string | null;
  /**
   * True only for READY_WITH_RESERVATION. The panel then shows the gentle line
   * from the catalogue; the checker's own text stays stored for the owner's
   * records and never reaches the page (spec §14.2).
   */
  readonly reservation: boolean;
  /**
   * Today's composed answer, shown while the story is WRITING and when it is
   * UNAVAILABLE, so the reader always sees an answer (spec §14.2). Null for a
   * ready story, or when nothing was composed.
   */
  readonly fallbackText: string | null;
  /**
   * A floor answer (spec §14.4.4, Task M6): the answer ended components-only
   * but the engine kept its label, so while the story is WRITING and when it is
   * UNAVAILABLE the strip shows the floor answer ("Our best answer:" and the
   * leading position's statement) in the question's language. Null for a ready
   * story, and for an answer without a floor.
   */
  readonly floor: ResolvedFloor | null;
  /** The PDF download, only for a ready story whose language the report can print. */
  readonly pdfHref: string | null;
  /** A ready story whose language the report cannot print yet: the panel says so instead of offering the PDF. */
  readonly reportUnsupported: boolean;
}

export function storyReportHref(debateId: string): string {
  return `/debate/${encodeURIComponent(debateId)}/report`;
}

/**
 * `locale` is the question's locale, the one the story's fixed text and the
 * report are in (lib/i18n/questionLocale.ts), so the view knows whether the
 * report can print it. `supported` is the report's own rule; a test passes
 * another so the hidden-download path stays covered whatever the rule holds.
 * `floor` is the answer's floor (lib/v3/floorAnswer.ts resolveFloor), or null:
 * the label comes from it when the answer carries none (Task M6).
 */
export function toStoryView(
  answer: Answer,
  story: AnswerStory | null,
  debateId: string,
  locale: string,
  supported: (locale: string) => boolean = reportSupportedForLocale,
  floor: ResolvedFloor | null = null
): StoryView {
  const requested: AnswerStory["status"] = story === null ? "WRITING" : story.status;
  const ready = requested === "READY" || requested === "READY_WITH_RESERVATION";
  const body = ready && story !== null ? story.story : null;
  const status: AnswerStory["status"] = ready && body === null ? "UNAVAILABLE" : requested;
  const verdict = answer.verdict_state ?? floor?.label ?? null;
  const label = {
    label: verdict,
    verdictState: verdict === null ? null : liveVerdictState(verdict)
  };
  if (body === null) {
    const composed = answer.composed_text
      .map((segment) => segment.text.trim())
      .filter((text) => text.length > 0)
      .join("\n\n");
    return {
      status,
      ...label,
      confidence: null,
      headline: null,
      summary: null,
      paths: [],
      morePaths: 0,
      change: null,
      reviewerNote: null,
      reservation: false,
      fallbackText: composed.length > 0 ? composed : null,
      floor,
      pdfHref: null,
      reportUnsupported: false
    };
  }
  const paths = body.short.paths.map((path) => ({ fate: path.fate, line: path.line, positionRef: path.position_ref }));
  const printable = supported(locale);
  return {
    status,
    ...label,
    confidence: body.short.confidence,
    headline: body.short.headline,
    summary: body.short.summary,
    paths,
    morePaths: Math.max(0, countStoryPositions(answer.nodes, answer.edges) - paths.length),
    change: body.short.change.text,
    reviewerNote: body.reviewer_note === null ? null : body.reviewer_note.text,
    reservation: status === "READY_WITH_RESERVATION",
    fallbackText: null,
    floor: null,
    pdfHref: printable ? storyReportHref(debateId) : null,
    reportUnsupported: !printable
  };
}
