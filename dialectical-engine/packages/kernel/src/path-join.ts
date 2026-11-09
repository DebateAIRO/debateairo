import { START_STEP_LIMITS } from "./start-step-limits.js";

/*
 * V4 start step, Task 33b (spec 2026-11-03 §7 "A path you added or rewrote is your own words"; the coordinator's ruling
 * of 5 Nov on Task 63's review) — THE ONE JOIN. Two to four viewpoints put together with no AI wording for them (the AI
 * combine failed, or Start sends a path still being written) read as their titles joined with " · " and their questions
 * numbered one per line, each cut to a chosen path's lengths. The page (apps/ui/lib/v4/pathPlan.ts) writes those words
 * with this function, and the server (Task 33's author rule, apps/api/src/start-paths-at-ask.ts) joins the signed menu's
 * own texts with it, so code-joined AI words are stored as the AIs' wording, never the person's. Pure.
 */

const ELLIPSIS = "…";

/** `text` when it fits in `max` UTF-16 code units; else whole code points (never half an emoji) and "…", at most `max` in all. */
export function cutPathText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max < ELLIPSIS.length) return "";
  let kept = "";
  for (const point of text) {
    if (kept.length + point.length + ELLIPSIS.length > max) break;
    kept += point;
  }
  return `${kept}${ELLIPSIS}`;
}

/** Viewpoints' words joined, in their order: the titles with " · " (at most 120), the questions "1. …" one per line (at most 1000). */
export function joinedPathWords(viewpoints: readonly { title: string; question: string }[]): { title: string; question: string } {
  return {
    title: cutPathText(viewpoints.map((viewpoint) => viewpoint.title).join(" · "), START_STEP_LIMITS.pathTitleMaxChars),
    question: cutPathText(viewpoints.map((viewpoint, at) => `${at + 1}. ${viewpoint.question}`).join("\n"),
      START_STEP_LIMITS.pathQuestionMaxChars)
  };
}
