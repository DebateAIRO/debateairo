"use client";

import { useId, useState } from "react";
import type { DigSuggestion } from "@debateai/contract";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { MoneyLine } from "@/lib/v4/money";
import {
  isEdited,
  pickedSuggestionIds,
  picksMax,
  suggestionKindKey,
  suggestionsByKind,
  type PickRefusal,
  type V4PlanTier
} from "@/lib/v4/suggestions";
import type { V4DigDraft, V4DigPick, V4Path } from "@/lib/v4/types";

/*
 * Perplexity plan W3-4 and the dig model revision (2026-10-30/31): choosing what to dig on the map. A path's dig
 * suggestions are shown by kind (on the tree, the phone outline and the panel); the person picks and combines them,
 * edits a suggestion's wording, or adds their own view. Owner Q-D1: a dig combines picks of one path only — the page
 * says so, and every pick box of another path is closed while picks are waiting (lib/v4/suggestions.ts refuses them too).
 * Owner Q19: on Free a dig combines at most 3. There is no search-words box (the owner's correction of 31 Oct): what is
 * sent to the web search stays the planner's decision. Users see shares of their quota, never prices. Nothing here
 * fetches or stores anything; the page owns the draft.
 */

/** What the page lends the map pieces and the panel for choosing what to dig. */
export type V4DigChoice = Readonly<{
  draft: V4DigDraft;
  planTier: V4PlanTier;
  /** False at the deepest level (10): nothing can be dug from this map, so nothing can be picked. */
  canDig: boolean;
  /** Owner: "Dig here too" on a path that already has a dig, and on every path of a dig's own map. */
  digHereToo: (pathId: string) => boolean;
  /** Why a pick of this group cannot join the draft now (null: it can). */
  refusalFor: (group: string | null) => PickRefusal | null;
  onToggleSuggestion: (pathId: string, suggestion: DigSuggestion) => void;
  /** Returns why the new text was refused (null: kept). */
  onEditPick: (key: string, text: string) => PickRefusal | null;
  onAddOwnView: (pathId: string, text: string) => PickRefusal | null;
  onRemovePick: (key: string) => void;
  onClear: () => void;
}>;

/** On the tree and the outline, at most this many suggestions per path; the panel lists them all. */
const SHOWN_ON_MAP = 2;
/** The contract's longest pick text (WEB_CONTRACT_LIMITS.pickTextMaxChars). */
const PICK_TEXT_MAX = 2000;

function shortLine(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/u, "")}…`;
}

/** The plain sentence for a refusal the page shows beside the picks. */
export function refusalLine(refusal: PickRefusal, planTier: V4PlanTier, catalog: MessageCatalog): string {
  // A table, one line per refusal (the source audit wants no switch without an exhaustive fall-through).
  const lines: Readonly<Record<PickRefusal, () => string>> = {
    OTHER_PATH: () => t(catalog, "v4.suggest.otherPath"),
    FULL: () => (planTier === "free"
      ? t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })
      : t(catalog, "v4.suggest.full")),
    EMPTY: () => t(catalog, "v4.suggest.empty"),
    TOO_LONG: () => t(catalog, "v4.suggest.tooLong", { count: PICK_TEXT_MAX })
  };
  return lines[refusal]();
}

/** A pick box for one suggestion. Closed (with its reason read aloud) when it cannot join the draft. */
function SuggestionBox(props: Readonly<{
  path: V4Path; suggestion: DigSuggestion; choice: V4DigChoice; catalog: MessageCatalog; className: string;
}>) {
  const { path, suggestion, choice, catalog } = props;
  const picked = pickedSuggestionIds(choice.draft).has(suggestion.suggestion_id);
  const refusal = picked ? null : choice.canDig ? choice.refusalFor(path.id) : null;
  const closed = !choice.canDig || refusal !== null;
  return (
    <label className={props.className}>
      <input
        type="checkbox"
        checked={picked}
        disabled={closed}
        onChange={() => choice.onToggleSuggestion(path.id, suggestion)}
      />
      <span className="v4SrOnly">
        {t(catalog, "v4.suggest.pick", { text: shortLine(suggestion.text) })}
        {refusal !== null ? ` ${refusalLine(refusal, choice.planTier, catalog)}` : null}
      </span>
    </label>
  );
}

/** The kind of a suggestion, as a small label. */
function KindTag(props: Readonly<{ suggestion: DigSuggestion; catalog: MessageCatalog }>) {
  return <span className="v4SugKind">{t(props.catalog, suggestionKindKey(props.suggestion))}</span>;
}

/**
 * The tree and the outline: a path's first suggestions, each with its kind and a pick box; the rest are in the panel
 * ("{count} more"). Selecting the row opens the path in the panel, where they can be edited.
 */
export function SuggestionLeaves(props: Readonly<{
  path: V4Path;
  choice: V4DigChoice;
  onOpenPath: () => void;
  variant: "tree" | "outline";
  catalog: MessageCatalog;
}>) {
  const { path, choice, catalog } = props;
  const all = choice.canDig ? path.suggestions ?? [] : [];
  if (all.length === 0) return null;
  const picked = pickedSuggestionIds(choice.draft);
  // The picked ones always show, then the first ones in the answer's order.
  const shown = [...all.filter((item) => picked.has(item.suggestion_id)), ...all.filter((item) => !picked.has(item.suggestion_id))]
    .slice(0, Math.max(SHOWN_ON_MAP, all.filter((item) => picked.has(item.suggestion_id)).length));
  const more = all.length - shown.length;
  const tree = props.variant === "tree";
  return (
    <>
      {shown.map((suggestion) => (
        <li
          key={`suggestion/${path.id}/${suggestion.suggestion_id}`}
          className={tree ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}
        >
          <div className={`v4Sug${picked.has(suggestion.suggestion_id) ? " v4SugPicked" : ""}`}>
            <button type="button" className="v4SugMain" onClick={props.onOpenPath}>
              <KindTag suggestion={suggestion} catalog={catalog} />
              <span className="v4SugText" data-ai-generated="true">{shortLine(suggestion.text)}</span>
            </button>
            <SuggestionBox path={path} suggestion={suggestion} choice={choice} catalog={catalog} className="v4MapPick" />
          </div>
        </li>
      ))}
      {more > 0 ? (
        <li className={tree ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}>
          <button type="button" className="v4MapMore" onClick={props.onOpenPath}>
            {t(catalog, "v4.suggest.more", { count: more })}
          </button>
        </li>
      ) : null}
    </>
  );
}

/** "Dig here too" on the tree and the outline: opens the path in the panel, where the person chooses what to dig. */
export function DigHereTooLeaf(props: Readonly<{ onOpenPath: () => void; variant: "tree" | "outline"; catalog: MessageCatalog }>) {
  return (
    <li className={props.variant === "tree" ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}>
      <button type="button" className="v4MapMore v4SugAgain" onClick={props.onOpenPath}>
        {t(props.catalog, "v4.nest.digHereToo")}
      </button>
    </li>
  );
}

/** One suggestion in the panel: its pick box, its text (or the person's wording), and "Edit this path". */
function PanelSuggestion(props: Readonly<{ path: V4Path; suggestion: DigSuggestion; choice: V4DigChoice; catalog: MessageCatalog }>) {
  const { path, suggestion, choice, catalog } = props;
  const id = useId();
  const key = `suggestion:${suggestion.suggestion_id}`;
  const pick = choice.draft.picks.find((candidate) => candidate.key === key);
  const [editing, setEditing] = useState<string | null>(null);
  const [problem, setProblem] = useState<PickRefusal | null>(null);
  const refusal = pick !== undefined ? null : choice.refusalFor(path.id);
  const editedText = pick?.kind === "SUGGESTION" && isEdited(pick) ? pick.text : null;
  const startEdit = (): void => {
    // Editing a suggestion picks it, so the wording the person writes is what is sent.
    if (pick === undefined) choice.onToggleSuggestion(path.id, suggestion);
    setProblem(null);
    setEditing(pick?.kind === "SUGGESTION" ? pick.text : suggestion.text);
  };
  const saveEdit = (): void => {
    if (editing === null) return;
    const refused = choice.onEditPick(key, editing);
    setProblem(refused);
    if (refused === null) setEditing(null);
  };
  return (
    <li className={`v4SugRow${pick !== undefined ? " v4SugPicked" : ""}`}>
      <div className="v4SugRowHead">
        <SuggestionBox path={path} suggestion={suggestion} choice={choice} catalog={catalog} className="v4PanelPick" />
        <p className="v4SugRowText">
          {editedText !== null
            ? <span>{editedText}</span>
            : <span data-ai-generated="true">{suggestion.text}</span>}
          {editedText !== null ? <> <span className="v4SugTag">{t(catalog, "v4.suggest.edited")}</span></> : null}
        </p>
      </div>
      {editing === null ? (
        refusal === null ? (
          <button type="button" className="v4Link v4SugEdit" onClick={startEdit}>{t(catalog, "v4.suggest.edit")}</button>
        ) : null
      ) : (
        <div className="v4SugEditor">
          <label className="v4SrOnly" htmlFor={`${id}-edit`}>{t(catalog, "v4.suggest.editLabel")}</label>
          <textarea
            id={`${id}-edit`}
            className="v4SugInput"
            value={editing}
            maxLength={PICK_TEXT_MAX}
            rows={3}
            onChange={(event) => setEditing(event.target.value)}
          />
          {problem !== null ? <p className="v4SugProblem" role="alert">{refusalLine(problem, choice.planTier, catalog)}</p> : null}
          <div className="v4SugEditorActions">
            <button type="button" className="v4Btn" onClick={saveEdit}>{t(catalog, "v4.suggest.editDone")}</button>
            <button type="button" className="v4Link" onClick={() => setEditing(null)}>{t(catalog, "v4.suggest.cancel")}</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** "Add your own view": the person's words, added to this path's dig as their own (never as a finding). */
function OwnView(props: Readonly<{ path: V4Path; choice: V4DigChoice; catalog: MessageCatalog }>) {
  const { path, choice, catalog } = props;
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState<PickRefusal | null>(null);
  const refusal = choice.refusalFor(path.id);
  if (text === null) {
    return refusal === null ? (
      <button type="button" className="v4Btn v4SugOwnOpen" onClick={() => { setProblem(null); setText(""); }}>
        {t(catalog, "v4.suggest.ownView")}
      </button>
    ) : null;
  }
  const add = (): void => {
    const refused = choice.onAddOwnView(path.id, text);
    setProblem(refused);
    if (refused === null) setText(null);
  };
  return (
    <div className="v4SugEditor">
      <label className="v4SugLabel" htmlFor={`${id}-own`}>{t(catalog, "v4.suggest.ownViewLabel")}</label>
      <textarea
        id={`${id}-own`}
        className="v4SugInput"
        value={text}
        maxLength={PICK_TEXT_MAX}
        rows={3}
        onChange={(event) => setText(event.target.value)}
      />
      {problem !== null ? <p className="v4SugProblem" role="alert">{refusalLine(problem, choice.planTier, catalog)}</p> : null}
      <div className="v4SugEditorActions">
        <button type="button" className="v4Btn" onClick={add}>{t(catalog, "v4.suggest.ownViewAdd")}</button>
        <button type="button" className="v4Link" onClick={() => setText(null)}>{t(catalog, "v4.suggest.cancel")}</button>
      </div>
    </div>
  );
}

/** The person's own views and the open questions picked on this path (the suggestions show their own boxes). */
function OtherPicks(props: Readonly<{ picks: readonly V4DigPick[]; choice: V4DigChoice; catalog: MessageCatalog }>) {
  const { catalog } = props;
  const shown = props.picks.filter((pick) => pick.kind !== "SUGGESTION");
  if (shown.length === 0) return null;
  return (
    <ul className="v4SugList">
      {shown.map((pick) => (
        <li key={pick.key} className="v4SugRow v4SugRowPlain v4SugPicked">
          <p className="v4SugRowText">
            {pick.kind === "OWN_VIEW"
              ? <><span className="v4SugTag">{t(catalog, "v4.suggest.ownViewTag")}</span> <span>{pick.text}</span></>
              : pick.kind === "OPEN" ? <span data-ai-generated="true">{shortLine(pick.question.text, 120)}</span> : null}
          </p>
          <button type="button" className="v4Link" onClick={() => props.choice.onRemovePick(pick.key)}>
            {t(catalog, "v4.suggest.remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The money lines before a dig: its share of today, or when new starts wait for the reset. Never a price. */
export function V4MoneyLines(props: Readonly<{ lines: readonly MoneyLine[]; catalog: MessageCatalog }>) {
  if (props.lines.length === 0) return null;
  return (
    <>
      {props.lines.map((line) => (
        <p key={line.key} className="v4PanelHint v4MoneyLine">{t(props.catalog, line.key, line.values)}</p>
      ))}
    </>
  );
}

/**
 * The panel of a path: "Choose what to dig". Its suggestions by kind, each with a pick box and "Edit this path"; "Add your
 * own view"; the one-path line, and Free's cap. Another path's picks waiting: one plain line and "Clear", nothing else.
 */
export function V4DigCompose(props: Readonly<{ path: V4Path; choice: V4DigChoice; catalog: MessageCatalog; locale: string }>) {
  const { path, choice, catalog } = props;
  if (!choice.canDig) return null;
  const suggestions = path.suggestions ?? [];
  const mine = choice.draft.group === path.id ? choice.draft.picks : [];
  const elsewhere = choice.draft.picks.length > 0 && choice.draft.group !== path.id;
  const full = !elsewhere && choice.refusalFor(path.id) === "FULL";
  return (
    <section className="v4PanelSection v4Sugs" aria-labelledby={`v4-sug-${path.id}`}>
      <h3 className="v4PanelH3" id={`v4-sug-${path.id}`}>{t(catalog, "v4.suggest.heading")}</h3>
      <p className="v4PanelHint v4Muted">{t(catalog, "v4.suggest.onePath")}</p>
      {choice.planTier === "free" ? (
        <p className="v4PanelHint v4Muted">{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</p>
      ) : null}
      {elsewhere ? (
        <div className="v4SugElsewhere" role="status">
          <p className="v4PanelText">{t(catalog, "v4.suggest.otherPath")}</p>
          <button type="button" className="v4Btn" onClick={choice.onClear}>{t(catalog, "v4.dig.trayClear")}</button>
        </div>
      ) : null}
      {suggestions.length === 0
        ? <p className="v4Muted">{t(catalog, "v4.suggest.none")}</p>
        : suggestionsByKind(suggestions).map((group) => (
          <div key={group.group} className="v4SugGroup">
            <h4 className="v4PanelSmallHead">{t(catalog, group.key)}</h4>
            <ul className="v4SugList">
              {group.suggestions.map((suggestion) => (
                <PanelSuggestion
                  key={suggestion.suggestion_id}
                  path={path}
                  suggestion={suggestion}
                  choice={choice}
                  catalog={catalog}
                />
              ))}
            </ul>
          </div>
        ))}
      <OtherPicks picks={mine} choice={choice} catalog={catalog} />
      {elsewhere ? null : <OwnView key={`own/${path.id}`} path={path} choice={choice} catalog={catalog} />}
      {full && choice.planTier !== "free" ? <p className="v4PanelHint v4Muted">{t(catalog, "v4.suggest.full")}</p> : null}
      {mine.length > 0 ? (
        <p className="v4PanelHint">{tPlural(catalog, "v4.dig.trayPicked", mine.length, props.locale)}</p>
      ) : null}
    </section>
  );
}
