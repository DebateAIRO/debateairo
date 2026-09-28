import type { AnswerStory } from "@debateai/contract";
import type { StoredStory } from "./repository.js";

/**
 * How long the API keeps answering WRITING for an answer that has a verdict
 * but no stored story (spec 2026-09-26 §7). The window runs from the answer
 * row's insert time. It must cover the worst case of the sealed story call
 * bounds (every round spends every storyteller and checker attempt to its
 * deadline; 32 minutes at the provisional values), with margin.
 * tests/unit/story-status.test.ts reads that worst case from the sealed rows
 * and fails if this window ever drops below it. A frozen object, like
 * STORY_PACK_LIMITS: the source audit refuses an exported bare number.
 */
export const STORY_STATUS_LIMITS = Object.freeze({
  waitingWindowMs: 40 * 60 * 1000
});

/** The window under the name the plan's interface contract uses. */
export const STORY_WAITING_WINDOW_MS: number = STORY_STATUS_LIMITS.waitingWindowMs;

export interface DerivedStoryStatus {
  readonly status: AnswerStory["status"];
  readonly unavailableReason: string | null;
}

/**
 * The status for a story that exists for the caller's OWN answer but could not
 * be read (a key store down, a row that fails its checks, a database error).
 * A fixed code: the error itself never reaches the caller.
 */
export const STORY_UNREADABLE: DerivedStoryStatus = Object.freeze({
  status: "UNAVAILABLE",
  unavailableReason: "STORY_UNREADABLE"
});

/**
 * Whether an answer carries a label a story is written for (spec §3; §14.4.4,
 * Task M5): its own served verdict, or — for an answer that ended
 * components-only while its arithmetic label existed — its FLOOR. The runner
 * writes a story for exactly these answers, so the route treats a floor answer
 * like a served one: WRITING, then READY or UNAVAILABLE, never "no verdict".
 */
export function answerCarriesStoryLabel(input: {
  readonly verdictState: string | null;
  readonly floorVerdictState: string | null;
}): boolean {
  return input.verdictState !== null || input.floorVerdictState !== null;
}

/**
 * A stored row reports its own outcome (FAILED becomes UNAVAILABLE at once,
 * with its failure code, so the site stops waiting). With no row: no verdict
 * means no story will ever be written; a verdict younger than the window means
 * WRITING; anything older means the story was lost (for example the runner
 * died mid-story). `answerHasVerdict` is `answerCarriesStoryLabel`: a served
 * verdict or a floor.
 */
export function deriveStoryStatus(input: {
  readonly stored: StoredStory | null;
  readonly answerHasVerdict: boolean;
  readonly answerCreatedAt: Date;
  readonly now: Date;
}): DerivedStoryStatus {
  const { stored } = input;
  if (stored !== null) {
    if (stored.outcome === "FAILED") {
      return { status: "UNAVAILABLE", unavailableReason: stored.failureCode ?? "STORY_FAILED" };
    }
    // The repository refuses a ready row without a body; this keeps the rule
    // here too, so no caller can ever be told READY with nothing to show.
    if (stored.body === null) return { status: "UNAVAILABLE", unavailableReason: "STORY_BODY_MISSING" };
    return { status: stored.outcome, unavailableReason: null };
  }
  if (!input.answerHasVerdict) return { status: "UNAVAILABLE", unavailableReason: "NO_VERDICT" };
  const age = input.now.getTime() - input.answerCreatedAt.getTime();
  if (!Number.isFinite(age)) return { status: "UNAVAILABLE", unavailableReason: "ANSWER_TIME_UNKNOWN" };
  return age < STORY_WAITING_WINDOW_MS
    ? { status: "WRITING", unavailableReason: null }
    : { status: "UNAVAILABLE", unavailableReason: "STORY_WINDOW_PASSED" };
}

/** "money-decision" becomes "Money decision". The row stores the id only; the title is for display. */
export function storyShapeTitle(shapeId: string): string {
  const words = shapeId.split("-").filter((word) => word.length > 0).join(" ");
  return words.length === 0 ? shapeId : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The owner API response. Nothing of the stored row leaves unless the status is READY or READY_WITH_RESERVATION. */
export function buildAnswerStory(input: {
  readonly answerId: string;
  readonly answerVersion: number;
  readonly stored: StoredStory | null;
  readonly derived: DerivedStoryStatus;
}): AnswerStory {
  const ready = input.derived.status === "READY" || input.derived.status === "READY_WITH_RESERVATION";
  const stored = ready ? input.stored : null;
  return {
    answer_id: input.answerId,
    answer_version: input.answerVersion,
    status: input.derived.status,
    unavailable_reason: input.derived.unavailableReason,
    shape: stored === null || stored.shapeId === null
      ? null
      : { id: stored.shapeId, title: storyShapeTitle(stored.shapeId) },
    pack: stored === null || stored.packVersion === null || stored.packFingerprint === null
      ? null
      : { version: stored.packVersion, fingerprint: stored.packFingerprint },
    written_at: stored === null ? null : stored.createdAt.toISOString(),
    storyteller: stored === null ? null : stored.storytellerLineage,
    checker: stored === null ? null : stored.checkerLineage,
    rounds: stored === null ? null : stored.rounds,
    language: stored === null ? null : stored.languageTag,
    reservation: stored !== null && input.derived.status === "READY_WITH_RESERVATION" ? stored.reservation : null,
    verdict_basis: stored === null ? null : stored.verdictBasis,
    point_numbers: stored === null || stored.pointNumbers === null ? null : { ...stored.pointNumbers },
    story: stored === null ? null : stored.body
  };
}
