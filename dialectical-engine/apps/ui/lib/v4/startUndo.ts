import { DIG_UNDO_MS } from "./digUndo.js";
import type { PathPlan, PlanPath } from "./pathPlan.js";
import type { DigMode, V4PathTag } from "./types.js";

/*
 * V4 start step, Task 76b (chat-undo-after-every-start, owner answers Q11, Q12, Q13 and Q8): a press of Start, or of either
 * "Just answer it", waits out the site's Undo window before anything is sent, in the site's one Undo note (V4UndoNote).
 * Meanwhile the map shows at once with the paths being sent (buildV4PendingMap, Task 60). Nothing is kept in the browser.
 */

/** The Undo window of a Start: the dig's own, so both timers always match. */
export const START_UNDO_MS = DIG_UNDO_MS;

/** A pressed Start that waits out its Undo window: when it is sent, who chose its paths, its mode and the carry-on box. */
export type PendingStart = Readonly<{ sendsAt: number; chosenBy: "PERSON" | "AIS"; mode: DigMode; carryOn: boolean }>;

/**
 * A path's tag on the map during the Undo window, as the server will store its author (Task 33b's note): the person's own
 * path ADDED; a path in the person's words EDITED; a combine (written, still being written, or joined in code) COMBINED;
 * the AIs' path of several viewpoints TOGETHER; anything else none.
 */
function pendingTagOf(path: PlanPath): V4PathTag | null {
  if (path.tag === "ADDED_BY_YOU") return "ADDED";
  if (path.wording === "PERSON") return "EDITED";
  if (path.tag === "COMBINED_BY_YOU") return "COMBINED";
  if (path.tag === "PUT_TOGETHER_BY_US") return "TOGETHER";
  return null;
}

/** The paths a Start sends, in the person's order, as the pending map draws them; none without a plan. */
export function pendingPathsOf(plan: PathPlan | null): readonly Readonly<{ title: string; question: string; tag: V4PathTag | null }>[] {
  if (plan === null) return [];
  return plan.paths.map((path) => ({ title: path.title, question: path.question, tag: pendingTagOf(path) }));
}
