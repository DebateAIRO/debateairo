"use client";

import type { V4DigPick } from "@/lib/v4/types";
import { shortText } from "./V4MapTree";

/*
 * Owner's screen review, 3 Nov 2026 (journey-f23, journey-f7): the person's choices are shown as chips, in their own
 * words, never as a count ("2 picked"). A chip here only shows a choice; it is not a button. The list has a name for
 * screen readers (`label`, from the page's catalogue).
 */

/** The longest a chip's words run before they are cut at a word edge (the full words stay in the panel). */
const CHIP_TEXT_MAX = 60;

export function V4ChoiceChips(props: Readonly<{
  /** The choices, as the person sees them elsewhere (their answers, their picks, or the paths' questions). */
  choices: readonly string[];
  /** The list's name for screen readers, e.g. t(catalog, "v4.wait.choices"). */
  label: string;
}>) {
  const shown = props.choices.map((choice) => choice.trim()).filter((choice) => choice.length > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="v4ChoiceChips" aria-label={props.label}>
      {shown.map((choice, at) => (
        <li key={`${String(at)}:${choice}`} className="v4ChoiceChip" data-ai-generated="true">{choice}</li>
      ))}
    </ul>
  );
}

/** The words a dig pick shows on its chip: the suggestion as the person left it, their own view, or the open question. */
export function digPickWords(pick: V4DigPick): string {
  return shortText(pick.kind === "OPEN" ? pick.question.text : pick.text, CHIP_TEXT_MAX);
}

/** The dig tray's picks as chips (journey-f23: "Picks show as chips, not as '2 picked'"). */
export function V4PickChips(props: Readonly<{ picks: readonly V4DigPick[]; label: string }>) {
  return <V4ChoiceChips choices={props.picks.map(digPickWords)} label={props.label} />;
}
