"use client";

import { useId, useState } from "react";
import type { DigSuggestion } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { cardLabel } from "@/lib/v4/mapLooks";
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
import type { V4DigDraft, V4DigPick, V4OpenQuestion, V4Path } from "@/lib/v4/types";
import type { TypedWords } from "@/lib/v4/useLeaveGuard";

/*
 * Perplexity plan W3-4 and the dig model revision (2026-10-30/31): choosing what to dig on the map. A path's dig
 * suggestions are shown by kind (on the tree, the phone outline and the panel); the person picks and combines them,
 * edits a suggestion's wording, or adds their own view. Owner Q-D1: a dig combines picks of one path only — the page
 * says so, and every pick box of another path is closed while picks are waiting (lib/v4/suggestions.ts refuses them too).
 * Owner Q19: on Free a dig combines at most 3. There is no search-words box (the owner's correction of 31 Oct): what is
 * sent to the web search stays the planner's decision. Users see shares of their quota, never prices. Nothing here
 * fetches or stores anything; the page owns the draft.
 * V4 screen review (owner picks, 3 Nov): a greyed pick box always has a reason the person can see, one line above the
 * first box greyed for it (dig-f22); Cancel on a wording puts the tick back as it was (dig-f14); the boxes and the
 * person's own words follow the direction of what is typed (dig-f21); on Free a line under the own-view box says the
 * view may be shown publicly (dig-f26); a picked open question and the person's own view are labelled (dig-f34).
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
  /**
   * V4 screen review (dig-f23): words typed here and not added yet (an own view, a wording being edited), kept by the
   * page while the person moves between questions. Left out: they last only while this part is on screen, as before.
   */
  typed?: TypedWords;
  /**
   * dig-f5 (owner's screen review, 3 Nov): where the person's picks wait, named, and a way there: "Your picks are waiting
   * on “Mostly renewables”. [Go to them] [Clear them]". Left out: the older one-line warning and "Clear".
   */
  picksPlace?: Readonly<{ title: Readonly<{ text: string; ai: boolean }>; onGo: () => void }>;
  /**
   * journey-f20 / dig-f26 / public-f26: what the person types here goes on the debate's public page: one grey line under
   * the own-view box ("This will be public."), which the box points to. Left out: a private debate (or one whose state the
   * page does not know).
   */
  publicLine?: string;
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

/** Stands in for the path's label while the sentence around it is read from the catalogue (the label is AI text). */
const PATH_SLOT = "\u0000path\u0000";

/**
 * dig-f22: the one visible line above the first pick box greyed for `reason`, on the map and in the phone outline:
 * "Your picks are on “Mostly renewables”." (picks of another path wait), or the plan's cap ("On the Free plan a dig
 * combines up to 3 picks."). Only the path's own label is marked as AI text. It appears at once with the soft highlight.
 */
export function V4PickReason(props: Readonly<{ reason: PickRefusal; choice: V4DigChoice; paths: readonly V4Path[]; catalog: MessageCatalog }>) {
  const { reason, choice, catalog } = props;
  if (reason !== "OTHER_PATH") {
    return <p className="v4PickReason v4Highlight" role="note">{refusalLine(reason, choice.planTier, catalog)}</p>;
  }
  const path = choice.draft.group === null ? undefined : props.paths.find((candidate) => candidate.id === choice.draft.group);
  const label = path === undefined ? "" : shortLine(cardLabel(path.line), 40);
  const [before = "", after = ""] = t(catalog, "v4.suggest.picksOn", { path: PATH_SLOT }).split(PATH_SLOT);
  return (
    <p className="v4PickReason v4Highlight" role="note">
      {before}
      {label.length > 0
        ? <span data-ai-generated="true">{label}</span>
        : t(catalog, path === undefined ? "v4.panel.crumbRoot" : "v4.map.pathUntitled")}
      {after}
    </p>
  );
}

/** One group of pick boxes as it is drawn: its open questions in order, and whether its suggestion leaves are drawn. */
export type PickGroup = Readonly<{ key: string; path: V4Path | null; open: readonly V4OpenQuestion[]; suggestions: boolean }>;

/** Where a reason line goes: before this open question's row (its id), or before the group's suggestions ("suggestions"). */
export type PickReasonPlace = Readonly<{ reason: PickRefusal; before: string }>;

/**
 * dig-f22: for each reason a box can be greyed for, the group (in the order drawn) that shows the first box greyed for it,
 * and where in that group the line goes. A picked box is never greyed; nothing is placed at the deepest level (no box can
 * be picked there, and the page says so once at the top).
 */
export function pickReasonPlaces(groups: readonly PickGroup[], picked: ReadonlySet<string>, choice: V4DigChoice | undefined):
  ReadonlyMap<string, PickReasonPlace> {
  const places = new Map<string, PickReasonPlace>();
  if (choice === undefined || !choice.canDig || choice.draft.picks.length === 0) return places;
  const placed = new Set<PickRefusal>();
  for (const group of groups) {
    let found: PickReasonPlace | null = null;
    for (const question of group.open) {
      const reason = picked.has(question.id) ? null : choice.refusalFor(question.pathId);
      if (reason !== null) {
        found = { reason, before: question.id };
        break;
      }
    }
    if (found === null && group.suggestions && group.path !== null && shownSuggestions(group.path, choice).closed > 0) {
      const reason = choice.refusalFor(group.path.id);
      if (reason !== null) found = { reason, before: "suggestions" };
    }
    if (found !== null && !placed.has(found.reason)) {
      placed.add(found.reason);
      places.set(group.key, found);
    }
  }
  return places;
}

/**
 * The suggestions a path shows on the tree and the outline: the picked ones always, then the first ones in the answer's
 * order, at most two unless more are picked; the rest are in the panel ("{count} more"). `closed`: how many of those
 * shown have a box that cannot join the picks now.
 */
export function shownSuggestions(path: V4Path, choice: V4DigChoice): Readonly<{ shown: readonly DigSuggestion[]; more: number; closed: number }> {
  const all = choice.canDig ? path.suggestions ?? [] : [];
  const picked = pickedSuggestionIds(choice.draft);
  const mine = all.filter((item) => picked.has(item.suggestion_id));
  const shown = [...mine, ...all.filter((item) => !picked.has(item.suggestion_id))].slice(0, Math.max(SHOWN_ON_MAP, mine.length));
  const closed = choice.refusalFor(path.id) === null ? 0 : shown.filter((item) => !picked.has(item.suggestion_id)).length;
  return { shown, more: all.length - shown.length, closed };
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
  // The picked ones always show, then the first ones in the answer's order.
  const { shown, more } = shownSuggestions(path, choice);
  if (shown.length === 0) return null;
  const picked = pickedSuggestionIds(choice.draft);
  const tree = props.variant === "tree";
  return (
    <>
      {shown.map((suggestion) => (
        <li
          key={`suggestion/${path.id}/${suggestion.suggestion_id}`}
          className={tree ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}
        >
          <div className={`v4Sug${picked.has(suggestion.suggestion_id) ? " v4SugPicked" : ""}`}>
            <button type="button" className="v4SugMain" data-row={`suggestion:${suggestion.suggestion_id}@path:${path.id}`} onClick={props.onOpenPath}>
              <KindTag suggestion={suggestion} catalog={catalog} />
              <span className="v4SugText" data-ai-generated="true">{shortLine(suggestion.text)}</span>
            </button>
            <SuggestionBox path={path} suggestion={suggestion} choice={choice} catalog={catalog} className="v4MapPick" />
          </div>
        </li>
      ))}
      {more > 0 ? (
        <li className={tree ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}>
          <button type="button" className="v4MapMore" data-row={`suggestions-more@path:${path.id}`} onClick={props.onOpenPath}>
            {t(catalog, "v4.suggest.more", { count: more })}
          </button>
        </li>
      ) : null}
    </>
  );
}

/**
 * On the tree and the outline, under a path that already has a dig (and every path of a dig's own map): opens the path in
 * the panel, where the person chooses what to dig. journey-f13 (owner's screen review, 3 Nov): it no longer says "Dig
 * here too", which promised a dig it did not start; it says where it goes, "Choose what to dig ›" (dig-f31's words).
 */
export function DigHereTooLeaf(props: Readonly<{
  onOpenPath: () => void;
  variant: "tree" | "outline";
  catalog: MessageCatalog;
  /** The path it hangs under: its row keeps one id on the map's arrow keys (map-f10). */
  pathId?: string;
}>) {
  return (
    <li className={props.variant === "tree" ? "v4MapLeaf v4MapLeafSuggestion" : "v4OutRow v4OutSuggestion"}>
      <button
        type="button"
        className="v4MapMore v4SugAgain"
        {...(props.pathId === undefined ? {} : { "data-row": `dig-here-too@path:${props.pathId}` })}
        onClick={props.onOpenPath}
      >
        {t(props.catalog, "v4.dig.chooseWhat")}
      </button>
    </li>
  );
}

/** Stands in for the picks' path title while the sentence around it is read from the catalogue (the title is AI text). */
const PLACE_MARK = "\u0000place\u0000";

/** dig-f5: "Your picks are waiting on “Mostly renewables”." with the title marked as the AI's words when it is. */
function WaitingOn(props: Readonly<{ title: Readonly<{ text: string; ai: boolean }>; catalog: MessageCatalog }>) {
  const [before = "", after = ""] = t(props.catalog, "v4.suggest.waitingOn", { path: PLACE_MARK }).split(PLACE_MARK);
  return (
    <p className="v4PanelText">
      {before}
      <span data-ai-generated={props.title.ai ? "true" : undefined}>{props.title.text}</span>
      {after}
    </p>
  );
}

/** One suggestion in the panel: its pick box, its text (or the person's wording), and "Edit this path". */
function PanelSuggestion(props: Readonly<{ path: V4Path; suggestion: DigSuggestion; choice: V4DigChoice; catalog: MessageCatalog }>) {
  const { path, suggestion, choice, catalog } = props;
  const id = useId();
  const key = `suggestion:${suggestion.suggestion_id}`;
  const pick = choice.draft.picks.find((candidate) => candidate.key === key);
  // dig-f23: a wording being edited stays in the page while the person looks at another question.
  const typedKey = `edit:${suggestion.suggestion_id}`;
  const [editing, setEditingNow] = useState<string | null>(() => choice.typed?.get(typedKey) ?? null);
  const [problem, setProblem] = useState<PickRefusal | null>(null);
  const refusal = pick !== undefined ? null : choice.refusalFor(path.id);
  const editedText = pick?.kind === "SUGGESTION" && isEdited(pick) ? pick.text : null;
  const startText = pick?.kind === "SUGGESTION" ? pick.text : suggestion.text;
  // The wording the box starts with is not "typed words": only a change is kept as worth asking about.
  const setEditing = (text: string | null): void => {
    setEditingNow(text);
    choice.typed?.set(typedKey, text, startText);
  };
  // dig-f14: whether starting the edit ticked the box, so Cancel can put the tick back as it was. Kept beside the typed
  // wording in the page's memory (its text equals its start, so it never counts as typed words), never in the browser.
  const tickedKey = `edit-ticked:${suggestion.suggestion_id}`;
  const setTickedByEdit = (ticked: boolean): void => {
    choice.typed?.set(tickedKey, ticked ? "yes" : null, "yes");
  };
  const [tickedByEdit, setTickedByEditNow] = useState(() => choice.typed?.get(tickedKey) === "yes");
  const startEdit = (): void => {
    // Editing a suggestion picks it, so the wording the person writes is what is sent.
    const ticks = pick === undefined;
    if (ticks) choice.onToggleSuggestion(path.id, suggestion);
    setTickedByEditNow(ticks);
    setTickedByEdit(ticks);
    setProblem(null);
    setEditing(startText);
  };
  const saveEdit = (): void => {
    if (editing === null) return;
    // Picks cleared while the wording waited in the page: editing picks it again, as starting the edit did.
    if (pick === undefined) choice.onToggleSuggestion(path.id, suggestion);
    const refused = choice.onEditPick(key, editing);
    setProblem(refused);
    if (refused === null) {
      setEditing(null);
      setTickedByEditNow(false);
      setTickedByEdit(false);
    }
  };
  const cancelEdit = (): void => {
    // dig-f14: an edit that ticked the box gives the tick back on Cancel; a box ticked before the edit stays ticked.
    if (tickedByEdit && pick !== undefined) choice.onToggleSuggestion(path.id, suggestion);
    setTickedByEditNow(false);
    setTickedByEdit(false);
    setProblem(null);
    setEditing(null);
  };
  return (
    <li className={`v4SugRow${pick !== undefined ? " v4SugPicked" : ""}`}>
      <div className="v4SugRowHead">
        <SuggestionBox path={path} suggestion={suggestion} choice={choice} catalog={catalog} className="v4PanelPick" />
        <p className="v4SugRowText">
          {/* dig-f21: the person's wording follows the direction it was typed in. */}
          {editedText !== null
            ? <span dir="auto">{editedText}</span>
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
            dir="auto"
            value={editing}
            maxLength={PICK_TEXT_MAX}
            rows={3}
            onChange={(event) => setEditing(event.target.value)}
          />
          {problem !== null ? <p className="v4SugProblem" role="alert">{refusalLine(problem, choice.planTier, catalog)}</p> : null}
          <div className="v4SugEditorActions">
            <button type="button" className="v4Btn" onClick={saveEdit}>{t(catalog, "v4.suggest.editDone")}</button>
            <button type="button" className="v4Link" onClick={cancelEdit}>{t(catalog, "v4.suggest.cancel")}</button>
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
  // dig-f23: an own view typed but not added yet stays in the page while the person looks at another question.
  const typedKey = `own:${path.id}`;
  const [text, setTextNow] = useState<string | null>(() => choice.typed?.get(typedKey) ?? null);
  const setText = (next: string | null): void => {
    setTextNow(next);
    choice.typed?.set(typedKey, next);
  };
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
  // journey-f20 / dig-f26: one line under the box when what is typed here will be public.
  const shownPublicly = choice.publicLine !== undefined;
  return (
    <div className="v4SugEditor">
      <label className="v4SugLabel" htmlFor={`${id}-own`}>{t(catalog, "v4.suggest.ownViewLabel")}</label>
      <textarea
        id={`${id}-own`}
        className="v4SugInput"
        dir="auto"
        value={text}
        maxLength={PICK_TEXT_MAX}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        {...(shownPublicly ? { "aria-describedby": `${id}-public` } : {})}
      />
      {shownPublicly ? <p id={`${id}-public`} className="v4PanelHint v4Muted v4SugPublic" data-public-will-be>{choice.publicLine}</p> : null}
      {problem !== null ? <p className="v4SugProblem" role="alert">{refusalLine(problem, choice.planTier, catalog)}</p> : null}
      <div className="v4SugEditorActions">
        <button type="button" className="v4Btn" onClick={add}>{t(catalog, "v4.suggest.ownViewAdd")}</button>
        <button type="button" className="v4Link" onClick={() => setText(null)}>{t(catalog, "v4.suggest.cancel")}</button>
      </div>
    </div>
  );
}

/**
 * The person's own views and the open questions picked on this path (the suggestions show their own boxes). dig-f34:
 * each says what it is, "Open question" or "Your view", so a picked open question never looks like the person's view.
 */
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
              // dig-f21: the person's own words follow the direction they were typed in.
              ? <><span className="v4SugTag">{t(catalog, "v4.suggest.ownViewTag")}</span> <span dir="auto">{pick.text}</span></>
              : pick.kind === "OPEN"
                ? <><span className="v4SugTag">{t(catalog, "v4.suggest.openTag")}</span> <span data-ai-generated="true">{shortLine(pick.question.text, 120)}</span></>
                : null}
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
          {choice.picksPlace === undefined ? (
            <>
              <p className="v4PanelText">{t(catalog, "v4.suggest.otherPath")}</p>
              <button type="button" className="v4Btn" onClick={choice.onClear}>{t(catalog, "v4.dig.trayClear")}</button>
            </>
          ) : (
            <>
              <WaitingOn title={choice.picksPlace.title} catalog={catalog} />
              <div className="v4SugElsewhereActions">
                <button type="button" className="v4Btn" onClick={choice.picksPlace.onGo}>{t(catalog, "v4.suggest.goToPicks")}</button>
                <button type="button" className="v4Btn" onClick={choice.onClear}>{t(catalog, "v4.suggest.clearPicks")}</button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {/* dig-f22: the reason sits right above the boxes it greys (Free's cap is said above already). */}
      {full && choice.planTier !== "free" ? <p className="v4PanelHint v4Muted">{t(catalog, "v4.suggest.full")}</p> : null}
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
      {/* journey-f23 (owner's screen review): no "N picked" count; the picks are marked above and shown as chips in the tray. */}
    </section>
  );
}
