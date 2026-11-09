"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import type { StartSuggestion } from "@debateai/contract";
import { t, type MessageCatalog, type TranslationVariables } from "@/lib/i18n/translate";
import { pathPlanSuggestions, type PathPlan, type PathPlanAction, type PlanPath } from "@/lib/v4/pathPlan";
import type { StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 74 (choose-f6; spec 2026-11-03 §2 item 5; row D §5): the one-tap suggestions above the paths, at most
 * two at a time and only those that would still change the list (pathPlanSuggestions):
 *  - "“{first}” and “{second}”: {reason} Combine them? It frees a path." [Combine] [Keep apart];
 *  - "“{title}” fits path {n}. Add it there, no extra path." [Add to path {n}] [Not now].
 * Hovering or focusing a suggestion outlines the paths it names on the list (.v4StartRow--named on their rows; choose-f6),
 * taken away on leave and blur. A press keeps the focus among the suggestions (on the first path when none is left).
 * Every change goes through `dispatch`; a refusal goes to `onRefusal`. Nothing here fetches, stores or keeps anything.
 */

/** The class that outlines a path a suggestion names (on the path rows, which carry data-path-key). */
const NAMED = "v4StartRow--named";
/** A placeholder's stand-in while a line is cut into its words (never in a catalogue line). */
const MARK = "\u0000";

/** A word of a line that is its own span: the AIs' words marked as AI text, the person's never. */
type Part = Readonly<{ text: string; ai: boolean }>;

/** A catalogue line with its `parts` placeholders as their own spans (dir="auto", the AIs' words marked). */
function lineWithParts(catalog: MessageCatalog, key: string, plain: TranslationVariables, parts: Readonly<Record<string, Part>>): ReactNode[] {
  const names = Object.keys(parts);
  const marks = Object.fromEntries(names.map((name, at) => [name, `${MARK}${String(at)}${MARK}`]));
  return t(catalog, key, { ...plain, ...marks }).split(MARK).map((piece, at) => {
    if (at % 2 === 0) return piece;
    const part = parts[names[Number(piece)]!]!;
    return <span key={at} dir="auto" data-ai-generated={part.ai ? "true" : undefined}>{part.text}</span>;
  });
}

const titlePart = (path: PlanPath): Part => ({ text: path.title, ai: path.wording !== "PERSON" });

/** The path keys a suggestion names: both paths of a Combine; the idea and the path it fits. */
function namedKeys(suggestion: StartSuggestion): readonly string[] {
  return suggestion.kind === "COMBINE" ? suggestion.path_refs : [suggestion.path_ref, suggestion.into_path_ref];
}

/** A suggestion's sentence and its two buttons' actions and words. */
function suggestionParts(plan: PathPlan, suggestion: StartSuggestion, catalog: MessageCatalog): Readonly<{
  line: ReactNode[];
  yes: Readonly<{ label: string; action: PathPlanAction }>;
  no: Readonly<{ label: string; action: PathPlanAction }>;
}> {
  const apply: PathPlanAction = { type: "APPLY_SUGGESTION", suggestionId: suggestion.suggestion_id };
  const dismiss: PathPlanAction = { type: "DISMISS_SUGGESTION", suggestionId: suggestion.suggestion_id };
  const listed = (key: string): PlanPath | undefined => plan.paths.find((path) => path.key === key);
  if (suggestion.kind === "COMBINE") {
    // pathPlanSuggestions shows a Combine only while both paths are on the list.
    const [first, second] = suggestion.path_refs.map((key) => listed(key)!);
    return {
      line: lineWithParts(catalog, "v4.start.suggest.combine", {}, {
        first: titlePart(first!), second: titlePart(second!), reason: { text: suggestion.reason, ai: true }
      }),
      yes: { label: t(catalog, "v4.start.suggest.combineButton"), action: apply },
      no: { label: t(catalog, "v4.start.suggest.keepApart"), action: dismiss }
    };
  }
  // A "fits" suggestion shows only while its idea is on the list or in more, and the path it fits is on the list.
  const idea = listed(suggestion.path_ref) ?? plan.more.find((path) => path.key === suggestion.path_ref)!;
  const n = plan.paths.findIndex((path) => path.key === suggestion.into_path_ref) + 1;
  return {
    line: lineWithParts(catalog, "v4.start.suggest.fits", { n }, { title: titlePart(idea) }),
    yes: { label: t(catalog, "v4.start.suggest.addTo", { n }), action: apply },
    no: { label: t(catalog, "v4.start.suggest.notNow"), action: dismiss }
  };
}

/** The one-tap suggestions; null with none to show. */
export function V4StartSuggest(props: StartPlanProps) {
  const { plan, catalog, dispatch, onRefusal } = props;
  const shown = pathPlanSuggestions(plan);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const box = useRef<HTMLUListElement>(null);
  /** Where the rows are (the card's rows block, else the page), kept at a press for when no suggestion is left. */
  const scope = useRef<ParentNode | null>(null);
  const pressed = useRef(false);

  // choose-f6: the paths a hovered or focused suggestion names are outlined; the cleanup takes the outline away.
  useEffect(() => {
    const ids = new Set([hovered, focused]);
    const names = shown.filter((suggestion) => ids.has(suggestion.suggestion_id)).flatMap(namedKeys);
    const within = box.current?.closest(".v4StartRows") ?? box.current?.ownerDocument ?? null;
    if (names.length === 0 || within === null) return undefined;
    const rows = [...within.querySelectorAll<HTMLElement>(".v4StartRow[data-path-key]")]
      .filter((row) => names.includes(row.dataset.pathKey ?? ""));
    for (const row of rows) row.classList.add(NAMED);
    return () => { for (const row of rows) row.classList.remove(NAMED); };
  });
  // After a press: with no suggestion left, focus goes to the first path.
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    if (box.current === null) (scope.current ?? document).querySelector<HTMLElement>(".v4StartList .v4StartRowButton")?.focus();
  });

  if (shown.length === 0) return null;

  const press = (action: PathPlanAction): void => {
    scope.current = box.current?.closest(".v4StartRows") ?? null;
    setHovered(null);
    setFocused(null);
    // The pressed suggestion goes: the focus stays among the suggestions (the list itself), so it never falls to the page.
    box.current?.focus();
    pressed.current = true;
    const refusal = dispatch(action);
    if (refusal !== null) onRefusal(refusal, action);
  };
  const onBlur = (event: FocusEvent<HTMLLIElement>, id: string): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setFocused((now) => now === id ? null : now);
  };
  return (
    <ul ref={box} className="v4StartSuggest" aria-label={t(catalog, "v4.start.suggest.label")} tabIndex={-1}>
      {shown.map((suggestion) => {
        const id = suggestion.suggestion_id;
        const { line, yes, no } = suggestionParts(plan, suggestion, catalog);
        return (
          <li
            key={id}
            className="v4StartSuggestion"
            data-suggestion-id={id}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered((now) => now === id ? null : now)}
            onFocus={() => setFocused(id)}
            onBlur={(event) => onBlur(event, id)}
          >
            <p className="v4StartSuggestionLine">{line}</p>
            <div className="v4StartSuggestionActions">
              <button type="button" className="v4Btn" onClick={() => press(yes.action)}>{yes.label}</button>
              <button type="button" className="v4Btn" onClick={() => press(no.action)}>{no.label}</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
