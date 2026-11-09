"use client";

import { isEdited } from "@/lib/v4/suggestions";
import type { V4DigPick } from "@/lib/v4/types";
import { shortText } from "./V4MapTree";

/*
 * Owner's screen review, 3 Nov 2026 (journey-f23, journey-f7): the person's choices are shown as chips, in their own
 * words, never as a count ("2 picked"). A chip here only shows a choice; it is not a button. The list has a name for
 * screen readers (`label`, from the page's catalogue). dig-f20 / RULES-14: only words the AIs wrote are marked as AI text;
 * the person's own view and their own wording of a suggestion are theirs. Each chip follows its own writing direction.
 */

/** One chip: its words, and whether the AIs wrote them. */
export type V4Choice = Readonly<{ text: string; ai: boolean }>;

/** The longest a chip's words run before they are cut at a word edge (the full words stay in the panel). */
const CHIP_TEXT_MAX = 60;

export function V4ChoiceChips(props: Readonly<{
  /**
   * The choices, as the person sees them elsewhere (their answers, their picks, or the paths' questions). A plain string is
   * marked as AI text (the paths' questions); pass { text, ai } to say who wrote each one.
   */
  choices: readonly (string | V4Choice)[];
  /** The list's name for screen readers, e.g. t(catalog, "v4.wait.choices"). */
  label: string;
}>) {
  const shown = props.choices
    .map((choice): V4Choice => (typeof choice === "string" ? { text: choice.trim(), ai: true } : { text: choice.text.trim(), ai: choice.ai }))
    .filter((choice) => choice.text.length > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="v4ChoiceChips" aria-label={props.label}>
      {shown.map((choice, at) => (
        <li key={`${String(at)}:${choice.text}`} className="v4ChoiceChip" dir="auto" data-ai-generated={choice.ai ? "true" : undefined}>
          {choice.text}
        </li>
      ))}
    </ul>
  );
}

/** The words a dig pick shows on its chip: the suggestion as the person left it, their own view, or the open question. */
export function digPickWords(pick: V4DigPick): string {
  // V4 start step, Task 60: a "+ N more" item shows its question, the words a dig of it asks.
  if (pick.kind === "MORE") return shortText(pick.more.question, CHIP_TEXT_MAX);
  return shortText(pick.kind === "OPEN" ? pick.question.text : pick.text, CHIP_TEXT_MAX);
}

/**
 * Whether the AIs wrote a pick's words: an open question, a suggestion as they worded it, or a "+ N more" item (never an own
 * view or an edit).
 */
export function pickIsAi(pick: V4DigPick): boolean {
  return pick.kind === "OPEN" || pick.kind === "MORE" || (pick.kind === "SUGGESTION" && !isEdited(pick));
}

/** The dig tray's picks as chips (journey-f23: "Picks show as chips, not as '2 picked'"). */
export function V4PickChips(props: Readonly<{ picks: readonly V4DigPick[]; label: string }>) {
  return <V4ChoiceChips choices={props.picks.map((pick) => ({ text: digPickWords(pick), ai: pickIsAi(pick) }))} label={props.label} />;
}
