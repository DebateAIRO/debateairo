"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords, sameItemText } from "@/lib/v4/askText";
import {
  cardLabel,
  digGround,
  digIsWorking,
  digOutcome,
  groundClass,
  openLeftCount,
  pathHolds,
  pathOutcome,
  type DigOutcome,
  type DigResult
} from "@/lib/v4/mapLooks";
import { findOpenQuestion, isFinishedRewrite, openQuestionsOf } from "@/lib/v4/mapModel";
import { digPauseCardLine, pauseOfDig } from "@/lib/v4/monthPause";
import { useMapKeys } from "@/lib/v4/useMapKeys";
import type { DigView, V4Map, V4OpenQuestion, V4Path, V4Selection } from "@/lib/v4/types";
import type { PickRefusal } from "@/lib/v4/suggestions";
import {
  DigHereTooLeaf, pickReasonPlaces, refusalLine, SuggestionLeaves, V4PickReason, type PickGroup, type PickReasonPlace, type V4DigChoice
} from "./V4DigSuggest";
import { useDigSeeds, V4DigSeedLeaves } from "./V4DigSeed";
import { V4RewriteCardNote } from "./V4PathRewrite";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): the map (row D, D3 prototype) as a left-to-right tree drawn with plain HTML and CSS
 * borders: the question, then one card per path, then each path's open questions and digs. Purely presentational:
 * the page owns the data, the selection, the picks and the digs. W4-6 (dig model revision, draft 5.5): a path a dig
 * rewrote shows its new text and one line about its rewrite (the panel shows the rest), a path higher up the mark "A dig
 * further down changed part of this.", and a dig's card says what became of it.
 * V4 screen review (owner picks of 3 Nov, OWNER-PICKS-2026-11-03.md):
 *   - journey-f2 / map-d5: one look per state (lib/v4/mapLooks.ts): open ground is hatched with the word "Open" and is the
 *     only place the star sits; a dig at work is hatched with a slow pulse ring, "Looking into it"; the paths a dig opened
 *     are dashed, "New · your dig opened this"; everything settled is a solid card with its four-shade bar.
 *   - r2-20 A / map-f25 / journey-f11: no outcome tags ("Held up", "Partly held", "Set aside"): each path shows its bar and
 *     its one trust word; a finished dig earns one of three result tags (Corrected, Added to, Confirmed), shown on the path
 *     it changed until it is opened, in place of the "New" dot; a confirmed path that holds gets a small "Holds" seal.
 *   - dig-d4 B: the first time a result is seen the card turns over once and its bar slides to the new shares.
 *   - map-f28: no counts on the cards (the one approved count lives in the rail); "+N more" behind folded leaves stays.
 *   - map-f29 / dig-f20: a dig is titled by its first pick's own words, marked as AI text only when an AI wrote them.
 *   - map-d3 / map-f22: `fold` (laptops, 1100-1439 px): only the opened path unfolds its leaves, the others show a small
 *     "Open ground" mark; on every width at most about 12 cards show, the star, picks and digs at work first, and nothing
 *     is hidden without a visible sign ("+N more", the mark, the hint that the map goes on to the right).
 *   - map-f10: the map is one keyboard stop, moved with the arrow keys (lib/v4/useMapKeys.ts); each card says its level.
 */

/** Titles on cards: AI text cut on a word boundary at about 70 characters; the panel shows the full text. */
export function shortText(text: string, max = 70): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space > max / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:.\-–—]+$/u, "")}…`;
}

/** What a selection points at. A selection that no longer exists falls back to the question itself. */
export type ResolvedSelection =
  | Readonly<{ kind: "root" }>
  | Readonly<{ kind: "path"; path: V4Path }>
  | Readonly<{ kind: "open"; question: V4OpenQuestion; path: V4Path | null }>
  | Readonly<{ kind: "dig"; dig: DigView; home: DigHome }>;

/** Where a dig hangs on the map: under the path its open questions belong to, else under the question. */
export type DigHome = Readonly<{ path: V4Path | null }>;

export function digHome(map: V4Map, dig: DigView): DigHome {
  for (const id of dig.link.openQuestionIds) {
    const question = findOpenQuestion(map, id);
    if (question !== null) {
      return { path: question.pathId === null ? null : map.paths.find((path) => path.id === question.pathId) ?? null };
    }
    const pathId = id.startsWith("path:") ? id.slice("path:".length) : id;
    const path = map.paths.find((candidate) => candidate.id === pathId);
    if (path !== undefined) return { path };
  }
  return { path: null };
}

/** The dig that is looking (or looked) into this open question; a dig that did not finish no longer covers it. */
export function digFor(question: V4OpenQuestion, digs: readonly DigView[]): DigView | null {
  return digs.find((dig) => dig.state !== "FAILED" && dig.link.openQuestionIds.includes(question.id)) ?? null;
}

export function resolveSelection(map: V4Map, digs: readonly DigView[], selected: V4Selection): ResolvedSelection {
  if (selected.startsWith("path:")) {
    const id = selected.slice("path:".length);
    const path = map.paths.find((candidate) => candidate.id === id);
    if (path !== undefined) return { kind: "path", path };
  } else if (selected.startsWith("open:")) {
    const question = findOpenQuestion(map, selected.slice("open:".length));
    if (question !== null) {
      const path = question.pathId === null ? null : map.paths.find((candidate) => candidate.id === question.pathId) ?? null;
      return { kind: "open", question, path };
    }
  } else if (selected.startsWith("dig:")) {
    const childRunId = selected.slice("dig:".length);
    const dig = digs.find((candidate) => candidate.link.childRunId === childRunId);
    if (dig !== undefined) return { kind: "dig", dig, home: digHome(map, dig) };
  }
  return { kind: "root" };
}

/** The selection id a resolved selection stands for (so a stale id highlights the question card). */
export function selectionIdOf(resolved: ResolvedSelection): V4Selection {
  if (resolved.kind === "path") return `path:${resolved.path.id}`;
  if (resolved.kind === "open") return `open:${resolved.question.id}`;
  if (resolved.kind === "dig") return `dig:${resolved.dig.link.childRunId}`;
  return "root";
}

/** Open questions not yet covered by a dig, star first (the dig card stands in for a dug one). */
export function undugOpen(list: readonly V4OpenQuestion[], digs: readonly DigView[]): readonly V4OpenQuestion[] {
  const open = list.filter((question) => digFor(question, digs) === null);
  return [...open.filter((question) => question.star), ...open.filter((question) => !question.star)];
}

/**
 * What the main question's panel lists under "Where to dig from here": its own open questions, and the starred one when
 * it sits on a path (map-f14 / dig-f4: that panel's pinned button digs the picks only when it lists every one of them).
 */
export function rootPanelOpen(map: V4Map, digs: readonly DigView[]): readonly V4OpenQuestion[] {
  const star = openQuestionsOf(map).find((question) => question.star && question.pathId !== null);
  return undugOpen(star === undefined ? map.open : [...map.open, star], digs);
}

/**
 * The one approved count (row D): open questions that could still change the answer, each once (FIT-2). map-f26 (3 Nov):
 * a question leaves the count only when a dig comes back Confirmed or Corrected, never when a dig merely starts.
 */
export function openCount(map: V4Map, digs: readonly DigView[]): number {
  return openLeftCount(map, digs);
}

/** Does this dig come from the open questions of this group (a path, or the question's own list when null)? */
function digLivesIn(map: V4Map, dig: DigView, pathId: string | null): boolean {
  const list = pathId === null ? map.open : map.paths.find((path) => path.id === pathId)?.open ?? [];
  return dig.link.openQuestionIds.some((id) => (pathId !== null && id === `path:${pathId}`) || list.some((question) => question.id === id));
}

/**
 * The digs shown under one group. FIT-9: a dig shows under every group that holds one of its questions, so a point
 * argued under two paths keeps its dig card under both (its open card is hidden under both). A dig whose questions are
 * nowhere on the map any more hangs where digHome puts it.
 */
export function digsUnder(map: V4Map, digs: readonly DigView[], pathId: string | null): readonly DigView[] {
  return digs.filter((dig) => {
    if (digLivesIn(map, dig, pathId)) return true;
    const anywhere = digLivesIn(map, dig, null) || map.paths.some((path) => digLivesIn(map, dig, path.id));
    return !anywhere && (digHome(map, dig).path?.id ?? null) === pathId;
  });
}

/** A click that came from the keyboard (Enter or Space on a button) has no pointer detail. */
export function viaKeyboard(event: MouseEvent<HTMLElement>): boolean {
  return event.detail === 0;
}

export type MapPiecesProps = Readonly<{
  map: V4Map;
  digs: readonly DigView[];
  selected: V4Selection;
  changed: ReadonlySet<string>;
  picked: ReadonlySet<string>;
  onSelect: (selection: V4Selection, viaKeyboard: boolean) => void;
  onTogglePick: (openQuestionId: string) => void;
  catalog: MessageCatalog;
  /**
   * W3-4: choosing what to dig (V4DigSuggest.tsx): each path's suggestions, the one-path rule on every pick box, and
   * "Dig here too". Absent: the pieces draw as before W3-4.
   */
  choice?: V4DigChoice;
  /** W4-6: the page's language, for the dates on rewritten paths (absent: English). */
  locale?: string;
  /** dig-d4 B / map-d5: the cards whose one-time reveal plays now (lib/v4/useReveal.ts); absent: none. */
  reveal?: ReadonlySet<string>;
  /** map-d3 (laptops, 1100-1439 px): only the opened path unfolds its leaves; absent or false: every path shows them. */
  fold?: boolean;
  /**
   * public-d1 A (owner review, 3 Nov): the same map in read-only form, for a public debate's "Explore the map": no pick
   * boxes (nothing can be ticked or dug from the map itself); the cards still open. Absent or false: the own map.
   */
  readOnly?: boolean;
}>;

/**
 * W3-4: whether an open question's pick box is closed: nothing can be dug from this map (the deepest level), or picks of
 * another path are waiting (owner Q-D1), or the plan's cap is reached. A picked box always stays open, to unpick it.
 */
export function pickClosed(question: V4OpenQuestion, picked: boolean, choice: V4DigChoice | undefined):
  Readonly<{ reason: PickRefusal | null }> | null {
  if (choice === undefined || picked) return null;
  if (!choice.canDig) return { reason: null };
  const reason = choice.refusalFor(question.pathId);
  return reason === null ? null : { reason };
}

/** At most two open questions per card on the map; the selected and the picked ones are always shown. */
const SHOWN_OPEN = 2;
/** map-f22: at most about this many cards on screen at once (the owner's design limit, row D). */
export const MAP_CARD_LIMIT = 12;
/** On the tree and the outline a path shows at most this many of its suggestions (V4DigSuggest's own limit). */
const SUGGESTIONS_ON_MAP = 2;

export function NewDot(props: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <span className="v4MapNew">
      <span className="v4MapNewDot" aria-hidden="true" />
      {t(props.catalog, "v4.map.new")}
    </span>
  );
}

/** map-f10: what a screen reader hears of a card's place in the tree ("level 2"). */
export function LevelWords(props: Readonly<{ level: number; catalog: MessageCatalog }>) {
  return <span className="v4SrOnly">{t(props.catalog, "v4.map.level", { n: props.level })}</span>;
}

const RESULT_TAG_KEYS: Readonly<Record<DigResult, string>> = Object.freeze({
  CORRECTED: "v4.result.tag.CORRECTED",
  ADDED_TO: "v4.result.tag.ADDED_TO",
  CONFIRMED: "v4.result.tag.CONFIRMED"
});
/** dig-d4 A: a tag is a shape and a word, never colour alone. */
const RESULT_SHAPES: Readonly<Record<DigResult, string>> = Object.freeze({ CORRECTED: "↻", ADDED_TO: "▲", CONFIRMED: "✓" });
const RESULT_CARD_KEYS: Readonly<Record<DigOutcome, string>> = Object.freeze({
  CORRECTED: "v4.result.card.CORRECTED",
  ADDED_TO: "v4.result.card.ADDED_TO",
  CONFIRMED: "v4.result.card.CONFIRMED",
  NOTHING_NEW: "v4.result.card.NOTHING_NEW"
});

/** journey-f11: one of the three result tags, as a small mark with its word. */
export function ResultTag(props: Readonly<{ result: DigResult; catalog: MessageCatalog }>) {
  return (
    <span className={`v4ResultTag v4ResultTag${props.result}`}>
      <span aria-hidden="true">{RESULT_SHAPES[props.result]}</span>
      {t(props.catalog, RESULT_TAG_KEYS[props.result])}
    </span>
  );
}

/** r2-20 A: a path's one trust word, beside its bar. */
export function TrustWordTag(props: Readonly<{ path: V4Path; catalog: MessageCatalog }>) {
  const word = props.path.trust ?? null;
  if (word === null) return null;
  return <span className={`v4MapTrust v4MapTrust${word}`}>{t(props.catalog, `v4.trust.${word}`)}</span>;
}

/** dig-d4 B: the small "Holds" seal on a path a dig confirmed, when the path holds. */
export function HoldsSeal(props: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <span className="v4MapSeal">
      <span aria-hidden="true">✓</span>
      {t(props.catalog, "v4.result.holds")}
    </span>
  );
}

/**
 * What a path's card carries about its newest finished dig: the result tag while that news is unopened (in place of the
 * "New" dot), and the seal while a confirmed path holds.
 */
export function pathMarks(path: V4Path, digs: readonly DigView[], news: boolean): Readonly<{ tag: DigResult | null; seal: boolean }> {
  const found = pathOutcome(path, digs);
  const outcome = found?.outcome ?? null;
  const tag = news && outcome !== null && outcome !== "NOTHING_NEW" ? outcome : null;
  return { tag, seal: outcome === "CONFIRMED" && pathHolds(path) };
}

export function PickBox(props: Readonly<{
  question: V4OpenQuestion;
  picked: boolean;
  onTogglePick: (openQuestionId: string) => void;
  catalog: MessageCatalog;
  className?: string;
  /** W3-4: the dig choice, so a box that cannot join the picks is closed and says why. */
  choice?: V4DigChoice;
}>) {
  const closed = pickClosed(props.question, props.picked, props.choice);
  const reason = closed === null || closed.reason === null || props.choice === undefined
    ? null
    : refusalLine(closed.reason, props.choice.planTier, props.catalog);
  return (
    <label className={props.className ?? "v4MapPick"}>
      <input
        type="checkbox"
        checked={props.picked}
        disabled={closed !== null}
        onChange={() => props.onTogglePick(props.question.id)}
      />
      <span className="v4SrOnly">
        {t(props.catalog, "v4.map.pick", { question: shortText(props.question.text) })}
        {reason === null ? null : ` ${reason}`}
      </span>
    </label>
  );
}

/** The one-line note under an open question: picked, else what kind of open question it is. */
export function openNote(question: V4OpenQuestion, picked: boolean, catalog: MessageCatalog): string {
  if (picked) return t(catalog, "v4.map.picked");
  return t(catalog, `v4.map.openKind.${question.kind}`);
}

/**
 * The dig card's line (draft 5.5): waiting, looking into it, didn't finish, or once done what it found (journey-f11: the
 * result line, "Confirmed: the answer holds", "Corrected", "Added to", or "Nothing new was found"); a dig whose result
 * the page cannot tell (a dig from before R22, read by its story) is "done". W4-6 (the money rule): a dig whose own run is
 * paused at the month wall says so.
 * Owner review 3 Nov (wait-f2): with the page's `locale`, a paused dig reads "Dig · paused until 1 Dec", then "Dig ·
 * ready to continue" once the server says its month has reset (without it, the older undated line).
 */
export function digNote(dig: DigView, catalog: MessageCatalog, locale?: string): string {
  if (dig.state === "FAILED") return t(catalog, "v4.rewrite.digCard.FAILED");
  if (dig.state === "WAITING") return t(catalog, "v4.rewrite.digCard.WAITING");
  if (dig.state === "RUNNING") {
    const pause = pauseOfDig(dig);
    if (pause === null) return t(catalog, "v4.rewrite.digCard.RUNNING");
    return locale === undefined && !pause.canContinue ? t(catalog, "v4.rewrite.digCard.PAUSED") : digPauseCardLine(pause, catalog, locale ?? "en");
  }
  const rewrite = dig.rewrite ?? null;
  if (rewrite !== null && rewrite.state === "WRITING") return t(catalog, "v4.rewrite.digCard.REWRITING");
  if (rewrite !== null && rewrite.state === "FAILED") return t(catalog, "v4.rewrite.digCard.REWRITE_FAILED");
  const outcome = digOutcome(dig);
  return t(catalog, outcome === null ? "v4.rewrite.digCard.DONE" : RESULT_CARD_KEYS[outcome]);
}

/** A dig still at work: waiting, running, or (W4-6) rewriting the path it came from. */
export function digWorking(dig: DigView): boolean {
  return digIsWorking(dig);
}

/** Owner review 3 Nov (public-f17): a dig paused at the month wall shows a still, hollow dot where a working dig pulses. */
export function DigPauseDot(props: Readonly<{ dig: DigView }>) {
  return pauseOfDig(props.dig) === null ? null : <span className="v4PauseDot" aria-hidden="true" />;
}

/**
 * A title made of AI text, or the site's own words when there is none. RULES-14: only `ai` text is marked
 * data-ai-generated; `more` (picked together) is the site's "and N more" tail, shown outside the AI mark.
 */
export type Title = Readonly<{ text: string; ai: boolean; more: number }>;

/** Every text the paths of this map have had (their lines now and before each rewrite): a dig never takes these as its title. */
function pathLinesOf(map: V4Map): readonly string[] {
  return map.paths.flatMap((path) => [
    path.line,
    path.rewrites?.original.line ?? "",
    ...(path.rewrites?.history ?? []).filter(isFinishedRewrite).map((rewrite) => rewrite.text.line)
  ]).filter((line) => line.trim().length > 0);
}

/**
 * What a dig looked into, as its title (several when picked together: the first, and how many more). map-f29 (3 Nov): its
 * first pick's own words, or the person's own wording; never the path it came from (a whole-path dig says so in the site's
 * words) and never empty. dig-f20: marked as AI text only when an AI wrote that first pick. `map` (the map the dig hangs
 * on) lets the title skip the path's own line; without it the dig's questions are taken as they are.
 */
export function digTitle(dig: DigView, catalog: MessageCatalog, max = 70, map?: V4Map): Title {
  const picks = (dig.picks ?? []).filter((pick) => pick.text.trim().length > 0);
  const first = picks[0];
  if (first !== undefined) return { text: shortText(first.text, max), ai: first.by === "AI_SUGGESTION", more: picks.length - 1 };
  const asked = dig.link.questions.filter((question) => question.trim().length > 0);
  const lines = map === undefined ? [] : pathLinesOf(map);
  const own = asked.filter((question) => !lines.some((line) => sameItemText(question, line)));
  const ai = dig.link.firstBy !== "PERSON";
  const [lead, ...rest] = own;
  if (lead !== undefined) return { text: shortText(lead, max), ai, more: rest.length };
  if (asked.length > 0) return { text: t(catalog, "v4.map.digWholePath"), ai: false, more: 0 };
  return { text: t(catalog, "v4.map.digUntitled"), ai: false, more: 0 };
}

/** map-f25: a path's card title is its own short label, never the outcome words its line may carry ("…: held up."). */
export function pathTitle(path: V4Path, catalog: MessageCatalog, max = 70): Title {
  const label = cardLabel(path.line);
  return label.length > 0
    ? { text: shortText(label, max), ai: true, more: 0 }
    : { text: t(catalog, "v4.map.pathUntitled"), ai: false, more: 0 };
}

/** Renders a Title: the AI part marked, the site's words not (RULES-14). */
export function TitleText(props: Readonly<{ title: Title; catalog: MessageCatalog; className?: string }>) {
  const { title, catalog } = props;
  return (
    <span className={props.className}>
      <span data-ai-generated={title.ai ? "true" : undefined}>{title.text}</span>
      {title.more > 0 ? <> {t(catalog, "v4.map.digMoreTail", { count: title.more })}</> : null}
    </span>
  );
}

/** The word on open ground (journey-f2): "Open", with the star's own words when it carries the star. */
export function OpenWord(props: Readonly<{ catalog: MessageCatalog }>) {
  return <span className="v4GroundWord">{t(props.catalog, "v4.ground.open")}</span>;
}

function OpenCard(props: Readonly<{
  question: V4OpenQuestion;
  pieces: MapPiecesProps;
  selectedId: V4Selection;
  group: string;
  level: number;
}>) {
  const { question, pieces } = props;
  const id: V4Selection = `open:${question.id}`;
  const picked = pieces.picked.has(question.id);
  const selected = props.selectedId === id;
  return (
    <div className={`v4MapOpen ${groundClass("OPEN")}${selected ? " v4MapSelected" : ""}${picked ? " v4MapPicked" : ""}`}>
      <button
        type="button"
        className="v4MapOpenMain"
        data-rove=""
        data-row={`${id}@${props.group}`}
        data-parent={props.group}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        {question.star ? <span className="v4MapStar" aria-hidden="true">★</span> : null}
        <span className="v4MapOpenBody">
          <span className="v4MapOpenTitle" data-ai-generated="true">{shortText(question.text)}</span>
          <span className="v4MapNote">
            <OpenWord catalog={pieces.catalog} />
            {question.star ? <span className="v4MapStarWords">{t(pieces.catalog, "v4.map.starHint")}</span> : null}
            <span>{openNote(question, picked, pieces.catalog)}</span>
          </span>
          {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
          <LevelWords level={props.level} catalog={pieces.catalog} />
        </span>
      </button>
      {pieces.readOnly === true ? null : (
        <PickBox
          question={question}
          picked={picked}
          onTogglePick={pieces.onTogglePick}
          catalog={pieces.catalog}
          {...(pieces.choice === undefined ? {} : { choice: pieces.choice })}
        />
      )}
    </div>
  );
}

/** dig-f27: the short label of each path a finished dig opened (its own paths, on each finished rewrite). */
export function digSprouts(dig: DigView): ReadonlyArray<Readonly<{ key: string; line: string }>> {
  const rewrite = dig.state === "DONE" ? dig.rewrite ?? null : null;
  if (rewrite === null || !isFinishedRewrite(rewrite)) return [];
  return rewrite.dig_paths
    .filter((path) => path.line.trim().length > 0)
    .map((path) => ({ key: path.position_ref, line: shortText(cardLabel(path.line), 60) }));
}

function DigCard(props: Readonly<{ dig: DigView; pieces: MapPiecesProps; selectedId: V4Selection; group: string; level: number }>) {
  const { dig, pieces } = props;
  const id: V4Selection = `dig:${dig.link.childRunId}`;
  const selected = props.selectedId === id;
  const ground = digGround(dig);
  const revealing = pieces.reveal?.has(id) === true;
  return (
    <button
      type="button"
      className={`v4MapDig v4MapDig${dig.state} ${groundClass(ground)}${selected ? " v4MapSelected" : ""}${revealing ? " v4Reveal" : ""}`}
      data-rove=""
      data-row={`${id}@${props.group}`}
      data-parent={props.group}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
    >
      <TitleText className="v4MapDigTitle" title={digTitle(dig, pieces.catalog, 70, pieces.map)} catalog={pieces.catalog} />
      <span className="v4MapNote">
        {ground === "LOOKING" ? <span className="v4MapPulse" aria-hidden="true" /> : null}
        <DigPauseDot dig={dig} />
        {digNote(dig, pieces.catalog, pieces.locale)}
      </span>
      {dig.state === "DONE" && dig.counts !== null
        ? <V4TrustBar counts={dig.counts} catalog={pieces.catalog} />
        : null}
      {dig.state === "DONE" && dig.headline !== null && dig.headline.trim().length > 0
        ? <span className="v4MapDigHeadline" data-ai-generated="true">{dig.headline}</span>
        : null}
      {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
      <LevelWords level={props.level} catalog={pieces.catalog} />
    </button>
  );
}

/**
 * dig-f27: the paths a finished dig opened, under its card: dashed with "New · your dig opened this" while that news is
 * unopened (they fly in once), then plain. Each opens the dig in the panel, where its own map is one link away.
 */
function DigSproutList(props: Readonly<{ dig: DigView; pieces: MapPiecesProps; fresh: boolean; parentRow: string; level: number }>) {
  const { dig, pieces } = props;
  const sprouts = digSprouts(dig);
  if (sprouts.length === 0) return null;
  const id: V4Selection = `dig:${dig.link.childRunId}`;
  return (
    <ul className="v4MapSprouts" data-group={props.parentRow}>
      {sprouts.map((sprout) => (
        <li key={sprout.key}>
          <button
            type="button"
            className={`v4MapSprout ${groundClass(props.fresh ? "NEW" : "SETTLED")}`}
            data-rove=""
            data-row={`sprout:${dig.link.childRunId}:${sprout.key}`}
            data-parent={props.parentRow}
            onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
          >
            {props.fresh ? <span className="v4GroundNewTag">{t(pieces.catalog, "v4.ground.new")}</span> : null}
            <span className="v4MapSproutTitle" data-ai-generated="true">{sprout.line}</span>
            <LevelWords level={props.level} catalog={pieces.catalog} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One leaf of a group: an open question or a dig, and whether it always shows (map-f22's first claims on the budget). */
type Leaf =
  | Readonly<{ kind: "open"; key: string; question: V4OpenQuestion; must: boolean }>
  | Readonly<{ kind: "dig"; key: string; dig: DigView; must: boolean; cards: number }>;

/** One group on the map (the question's own leaves, or a path's) and what of it shows now. */
type GroupPlan = Readonly<{
  key: string;
  row: string;
  leaves: readonly Leaf[];
  shown: ReadonlySet<string>;
  /** Cards behind "+N more" (or, folded, behind the "Open ground" mark). */
  hidden: number;
  extras: ReactNode;
  showExtras: boolean;
  folded: boolean;
  expanded: boolean;
}>;

/** The suggestions and "Dig here too" a path adds, as cards (V4DigSuggest shows at most two and a "more" link). */
function extraCards(path: V4Path | null, pieces: MapPiecesProps): number {
  const choice = pieces.choice;
  if (path === null || choice === undefined || !choice.canDig) return 0;
  const suggestions = (path.suggestions ?? []).length;
  return Math.min(SUGGESTIONS_ON_MAP, suggestions) + (suggestions > SUGGESTIONS_ON_MAP ? 1 : 0) + (choice.digHereToo(path.id) ? 1 : 0);
}

function leavesOf(open: readonly V4OpenQuestion[], digs: readonly DigView[], pieces: MapPiecesProps, selectedId: V4Selection): Leaf[] {
  return [
    ...open.map((question): Leaf => ({
      kind: "open",
      key: question.id,
      question,
      must: question.star || pieces.picked.has(question.id) || selectedId === `open:${question.id}`
    })),
    ...digs.map((dig): Leaf => {
      const id = `dig:${dig.link.childRunId}`;
      return {
        kind: "dig",
        key: id,
        dig,
        must: digGround(dig) === "LOOKING" || selectedId === id || pieces.changed.has(id),
        cards: 1 + (digSprouts(dig).length > 0 ? 1 : 0)
      };
    })
  ];
}

const cardsOf = (leaf: Leaf): number => (leaf.kind === "dig" ? leaf.cards : 1);

/**
 * map-f22 / map-d3: what each group shows. The star, the picks, the selected card and digs at work always show (the first
 * claims on the card limit), and so does the opened path's own group; then, round by round over the other groups, their
 * other digs, then their first two open questions, then a path's suggestions; whatever is left waits behind "+N more". A group
 * the person unfolded with "+N more" shows everything. Folded groups (laptops) show only what always shows, one line
 * each, and the "Open ground" mark.
 */
function planGroups(groups: ReadonlyArray<Readonly<{ key: string; row: string; path: V4Path | null; leaves: readonly Leaf[]; extras: ReactNode }>>,
  pieces: MapPiecesProps, expanded: ReadonlySet<string>, unfolded: (key: string) => boolean, fixedCards: number,
  focusKey: string | null): GroupPlan[] {
  let budget = MAP_CARD_LIMIT - fixedCards;
  const shown = new Map<string, Set<string>>(groups.map((group) => [group.key, new Set<string>()]));
  const extrasShown = new Set<string>();
  const live = groups.filter((group) => !expanded.has(group.key));
  for (const group of live) {
    for (const leaf of group.leaves) {
      if (!leaf.must) continue;
      shown.get(group.key)!.add(leaf.key);
      budget -= cardsOf(leaf);
    }
  }
  // A group's further leaves, in the order they claim what is left: the person's own digs first, then its first two open
  // questions (the star first, as today); the others wait behind "+N more".
  const optionalOf = (group: (typeof groups)[number]): Leaf[] => [
    ...group.leaves.filter((leaf) => leaf.kind === "dig" && !leaf.must),
    ...group.leaves.filter((leaf) => leaf.kind === "open").filter((leaf, index) => !leaf.must && index < SHOWN_OPEN)
  ];
  // The opened path's group first, in full (its two open questions, its digs, its suggestions): "about" 12 cards.
  const focus = live.find((group) => group.key === focusKey && unfolded(group.key));
  if (focus !== undefined) {
    for (const leaf of optionalOf(focus)) {
      shown.get(focus.key)!.add(leaf.key);
      budget -= cardsOf(leaf);
    }
    const cards = extraCards(focus.path, pieces);
    if (cards > 0) {
      extrasShown.add(focus.key);
      budget -= cards;
    }
  }
  const open = live.filter((group) => unfolded(group.key) && group !== focus);
  // Round by round over the groups (digs, then open questions), then the suggestions blocks while room is left.
  const optional = new Map(open.map((group) => [group.key, optionalOf(group)]));
  for (let round = 0; budget > 0; round += 1) {
    let any = false;
    for (const group of open) {
      const leaf = optional.get(group.key)?.[round];
      if (leaf === undefined || cardsOf(leaf) > budget) continue;
      any = true;
      shown.get(group.key)!.add(leaf.key);
      budget -= cardsOf(leaf);
    }
    if (!any) break;
  }
  for (const group of open) {
    const cards = extraCards(group.path, pieces);
    if (cards === 0 || cards > budget) continue;
    extrasShown.add(group.key);
    budget -= cards;
  }
  return groups.map((group) => {
    const all = expanded.has(group.key);
    const folded = !all && !unfolded(group.key);
    const showing = all ? new Set(group.leaves.map((leaf) => leaf.key)) : shown.get(group.key)!;
    const showExtras = all || extrasShown.has(group.key);
    const hiddenLeaves = group.leaves.filter((leaf) => !showing.has(leaf.key)).reduce((sum, leaf) => sum + cardsOf(leaf), 0);
    const hidden = hiddenLeaves + (showExtras ? 0 : extraCards(group.path, pieces));
    return { key: group.key, row: group.row, leaves: group.leaves, shown: showing, hidden, extras: group.extras, showExtras, folded, expanded: all };
  });
}

/**
 * dig-f22: the visible reason line as one row of a leaves column, placed right above the first box it explains (a list
 * item of its own, with no card lines and no keyboard stop).
 */
export function PickReasonRow(props: Readonly<{ place: PickReasonPlace; pieces: MapPiecesProps; className: string }>) {
  const { pieces } = props;
  if (pieces.choice === undefined) return null;
  return (
    <li className={props.className}>
      <V4PickReason reason={props.place.reason} choice={pieces.choice} paths={pieces.map.paths} catalog={pieces.catalog} />
    </li>
  );
}

/** One column of open questions and digs, with "+N more" to show the rest and "Show fewer" to fold them again. */
function Leaves(props: Readonly<{
  plan: GroupPlan;
  pieces: MapPiecesProps;
  selectedId: V4Selection;
  level: number;
  onToggle: () => void;
  /** dig-f22: where this column's reason line goes (absent: it has none). */
  reason?: PickReasonPlace;
}>) {
  const { plan, pieces, selectedId } = props;
  const shown = plan.leaves.filter((leaf) => plan.shown.has(leaf.key));
  const extra = plan.showExtras ? plan.extras : null;
  const toggle = plan.expanded || (!plan.folded && plan.hidden > 0);
  // dig-d3 B: a whole-path dig on a path with nothing else under it still grows its seed here.
  const seeds = useDigSeeds(pieces.map.runId, plan.key);
  if (shown.length === 0 && extra === null && !toggle && seeds.length === 0) return null;
  const reasonRow = (before: string): ReactNode => (props.reason?.before === before
    ? <PickReasonRow key={`reason/${plan.key}`} place={props.reason} pieces={pieces} className="v4MapLeafReason" />
    : null);
  return (
    <ul className={`v4MapLeaves${plan.folded ? " v4MapLeavesFolded" : ""}`} data-group={plan.row}>
      {shown.flatMap((leaf) => leaf.kind === "open"
        ? [
          reasonRow(leaf.question.id),
          <li key={`${plan.key}/${leaf.key}`} className="v4MapLeaf v4MapLeafOpen">
            <OpenCard question={leaf.question} pieces={pieces} selectedId={selectedId} group={plan.row} level={props.level} />
          </li>
        ]
        : [
          <li key={leaf.key} className="v4MapLeaf v4MapLeafDig">
            <DigCard dig={leaf.dig} pieces={pieces} selectedId={selectedId} group={plan.row} level={props.level} />
            <DigSproutList
              dig={leaf.dig}
              pieces={pieces}
              fresh={pieces.changed.has(leaf.key) || pieces.changed.has(plan.row)}
              parentRow={`${leaf.key}@${plan.row}`}
              level={props.level + 1}
            />
          </li>
        ])}
      {extra === null ? null : reasonRow("suggestions")}
      {extra}
      {/* dig-d3 B: a dig still in its 10 seconds grows a dashed "Your dig · … · starting" card here (V4DigSeed.tsx). */}
      <V4DigSeedLeaves runId={pieces.map.runId} groupKey={plan.key} catalog={pieces.catalog} />
      {toggle ? (
        <li className="v4MapLeaf v4MapLeafMore">
          <button
            type="button"
            className="v4MapMore"
            data-rove=""
            data-row={`more:${plan.row}`}
            data-parent={plan.row}
            aria-expanded={plan.expanded}
            onClick={props.onToggle}
          >
            {plan.expanded ? t(pieces.catalog, "v4.map.showFewer") : t(pieces.catalog, "v4.map.moreOpen", { count: plan.hidden })}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * W3-4: what a path adds under its open questions and digs: its suggestions (with their pick boxes) and "Dig here too"
 * (a path that already has a dig, or any path of a dig's own map). Null when there is nothing to add.
 */
export function pathExtras(path: V4Path, pieces: MapPiecesProps, variant: "tree" | "outline"): ReactNode {
  const choice = pieces.choice;
  if (choice === undefined || !choice.canDig) return null;
  const onOpenPath = (): void => pieces.onSelect(`path:${path.id}`, false);
  const suggestions = (path.suggestions ?? []).length > 0;
  const again = choice.digHereToo(path.id);
  if (!suggestions && !again) return null;
  return (
    <>
      <SuggestionLeaves path={path} choice={choice} onOpenPath={onOpenPath} variant={variant} catalog={pieces.catalog} />
      {again ? <DigHereTooLeaf onOpenPath={onOpenPath} variant={variant} catalog={pieces.catalog} pathId={path.id} /> : null}
    </>
  );
}

/** The path a selection sits on (the path itself, or the path its open question or dig hangs under). */
function pathOfSelection(resolved: ResolvedSelection): string | null {
  if (resolved.kind === "path") return resolved.path.id;
  if (resolved.kind === "open") return resolved.path?.id ?? null;
  if (resolved.kind === "dig") return resolved.home.path?.id ?? null;
  return null;
}

/** map-f22: whether the drawn map is wider than its box (so a hint says it goes on to the right). */
function useOverflows(box: HTMLElement | null): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (box === null || typeof ResizeObserver === "undefined") return;
    const check = (): void => setOverflows(box.scrollWidth > box.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(box);
    if (box.firstElementChild !== null) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [box]);
  return overflows;
}

export function V4MapTree(props: MapPiecesProps) {
  const { map, digs, catalog } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  /** map-f10: branches unfolded with the Right arrow on a laptop (the opened path is always unfolded). */
  const [unfoldedByKey, setUnfoldedByKey] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) => setExpanded((before) => {
    const next = new Set(before);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const resolved = resolveSelection(map, digs, props.selected);
  const selectedId = selectionIdOf(resolved);
  const rootSelected = selectedId === "root";
  const fold = props.fold === true;
  const openPathId = pathOfSelection(resolved);
  const unfolded = (key: string): boolean => !fold || key === "root" || key === openPathId || unfoldedByKey.has(key);
  const [scrollBox, setScrollBox] = useState<HTMLDivElement | null>(null);
  const overflows = useOverflows(scrollBox);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const keys = useMapKeys(treeRef, {
    onExpand: (row) => {
      if (!fold || !row.startsWith("path:")) return false;
      const id = row.slice("path:".length);
      setUnfoldedByKey((before) => new Set([...before, id]));
      return true;
    },
    onCollapse: (row) => {
      if (!fold || !row.startsWith("path:")) return false;
      const id = row.slice("path:".length);
      if (!unfoldedByKey.has(id)) return false;
      setUnfoldedByKey((before) => new Set([...before].filter((key) => key !== id)));
      return true;
    }
  });

  const groups = [
    { key: "root", row: "root", path: null, leaves: leavesOf(undugOpen(map.open, digs), digsUnder(map, digs, null), props, selectedId), extras: null },
    ...map.paths.map((path) => ({
      key: path.id,
      row: `path:${path.id}`,
      path,
      leaves: leavesOf(undugOpen(path.open, digs), digsUnder(map, digs, path.id), props, selectedId),
      extras: pathExtras(path, props, "tree")
    }))
  ];
  const plans = planGroups(groups, props, expanded, unfolded, 1 + map.paths.length, openPathId);
  const rootPlan = plans[0]!;
  // dig-f22: a visible line above the first box greyed for each reason (each box still says it to screen readers).
  const reasons = pickReasonPlaces(plans.map((plan, at): PickGroup => ({
    key: plan.key,
    path: groups[at]!.path,
    open: plan.leaves.flatMap((leaf) => (leaf.kind === "open" && plan.shown.has(leaf.key) ? [leaf.question] : [])),
    suggestions: plan.showExtras
  })), props.picked, props.choice);
  const reasonOf = (key: string) => {
    const place = reasons.get(key);
    return place === undefined ? {} : { reason: place };
  };
  return (
    <div className={`v4Map${fold ? " v4MapFold" : ""}`}>
      <div className={`v4MapScroll${overflows ? " v4MapScrollMore" : ""}`} ref={setScrollBox}>
        <div className="v4MapCanvas" ref={treeRef} onKeyDown={keys.onKeyDown} onFocus={keys.onFocus}>
          <div className="v4MapHeads" aria-hidden="true">
            <span>{t(catalog, "v4.map.colQuestion")}</span>
            <span>{t(catalog, "v4.map.colPaths")}</span>
            {fold ? null : <span>{t(catalog, "v4.map.colOpen")}</span>}
          </div>
          <div className="v4MapBody">
            <div className="v4MapRootCol">
              <button
                type="button"
                className={`v4MapRoot${rootSelected ? " v4MapSelected" : ""}`}
                data-rove=""
                data-row="root"
                data-parent=""
                aria-current={rootSelected ? "true" : undefined}
                onClick={(event) => props.onSelect("root", viaKeyboard(event))}
              >
                <span className="v4MapRootTitle v4Serif" data-ai-generated="true">{shortText(ownWords(map.question), 110)}</span>
                <V4TrustBar counts={map.counts} unchecked={map.unchecked} catalog={catalog} />
                {props.changed.has("root") ? <NewDot catalog={catalog} /> : null}
                <LevelWords level={1} catalog={catalog} />
              </button>
              <div className="v4MapRootLeaves">
                <Leaves plan={rootPlan} pieces={props} selectedId={selectedId} level={2} onToggle={() => toggle("root")} {...reasonOf(rootPlan.key)} />
              </div>
            </div>
            {map.paths.length === 0
              ? <p className="v4MapEmpty v4Muted">{t(catalog, "v4.map.noPaths")}</p>
              : (
                <ul className="v4MapBranches" data-group="root">
                  {map.paths.map((path, at) => {
                    const id: V4Selection = `path:${path.id}`;
                    const selected = selectedId === id;
                    const plan = plans[at + 1]!;
                    const news = props.changed.has(id);
                    const marks = pathMarks(path, digs, news);
                    const groundLeft = plan.folded && plan.hidden > 0;
                    return (
                      <li key={path.id} className={`v4MapBranch${plan.folded ? " v4MapBranchFolded" : ""}`}>
                        <button
                          type="button"
                          className={`v4MapPath ${groundClass("SETTLED")}${selected ? " v4MapSelected" : ""}${props.reveal?.has(id) === true ? " v4Reveal" : ""}`}
                          data-rove=""
                          data-row={id}
                          data-parent="root"
                          aria-current={selected ? "true" : undefined}
                          aria-expanded={fold ? !plan.folded : undefined}
                          onClick={(event) => props.onSelect(id, viaKeyboard(event))}
                        >
                          {marks.tag !== null ? <ResultTag result={marks.tag} catalog={catalog} /> : null}
                          <TitleText className="v4MapPathTitle" title={pathTitle(path, catalog)} catalog={catalog} />
                          <span className="v4MapPathMeta">
                            <TrustWordTag path={path} catalog={catalog} />
                            {marks.seal ? <HoldsSeal catalog={catalog} /> : null}
                          </span>
                          <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
                          <V4RewriteCardNote path={path} catalog={catalog} locale={props.locale ?? "en"} digs={digs} />
                          {groundLeft ? (
                            <span className="v4MapGroundMark">
                              <span className="v4MapGroundKey" aria-hidden="true" />
                              {t(catalog, "v4.map.openGround")}
                            </span>
                          ) : null}
                          {news && marks.tag === null ? <NewDot catalog={catalog} /> : null}
                          <LevelWords level={2} catalog={catalog} />
                        </button>
                        <Leaves plan={plan} pieces={props} selectedId={selectedId} level={3} onToggle={() => toggle(path.id)} {...reasonOf(plan.key)} />
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
      </div>
      {overflows ? <p className="v4MapScrollHint v4Muted">{t(catalog, "v4.map.scrollHint")}</p> : null}
      <ul className="v4MapLegend" aria-label={t(catalog, "v4.map.legendLabel")}>
        <MapLegendItems catalog={catalog} />
      </ul>
    </div>
  );
}

/** The marks the map uses, in words (the tree's legend, and the outline's folded "What the shades mean"). */
export function MapLegendItems(props: Readonly<{ catalog: MessageCatalog }>) {
  const { catalog } = props;
  return (
    <>
      <li><span className="v4MapKey v4BarSure" aria-hidden="true" />{t(catalog, "v4.trust.SURE")}</li>
      <li><span className="v4MapKey v4BarCase" aria-hidden="true" />{t(catalog, "v4.trust.SURE_FOR_CASE")}</li>
      <li><span className="v4MapKey v4BarArgued" aria-hidden="true" />{t(catalog, "v4.trust.STILL_ARGUED")}</li>
      <li><span className="v4MapKey v4BarFell" aria-hidden="true" />{t(catalog, "v4.trust.DIDNT_HOLD")}</li>
      <li><span className="v4MapKey v4MapKeyOpen" aria-hidden="true" />{t(catalog, "v4.map.legendOpen")}</li>
      <li><span className="v4MapKey v4MapKeyLooking" aria-hidden="true" />{t(catalog, "v4.map.legendLooking")}</li>
      <li><span className="v4MapKey v4MapKeyNew" aria-hidden="true" />{t(catalog, "v4.map.legendNew")}</li>
      <li><span className="v4MapStar" aria-hidden="true">★</span>{t(catalog, "v4.map.legendStar")}</li>
    </>
  );
}
