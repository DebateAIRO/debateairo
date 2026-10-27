"use client";

import { useState, type MouseEvent } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords } from "@/lib/v4/askText";
import { findOpenQuestion, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import type { DigView, V4Map, V4OpenQuestion, V4Path, V4Selection } from "@/lib/v4/types";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): the map (row D, D3 prototype) as a left-to-right tree drawn with plain HTML and CSS
 * borders: the question, then one card per path, then each path's open questions and digs. Purely presentational:
 * the page owns the data, the selection, the picks and the digs. Visible text says "question", never "path"
 * (decision 9).
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

/** How many open questions are still waiting for a dig; a point argued under two paths counts once (FIT-2). */
export function openCount(map: V4Map, digs: readonly DigView[]): number {
  return undugOpen(uniqueOpenQuestions(map), digs).length;
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
}>;

/** At most two open questions per card on the map; the selected and the picked ones are always shown. */
const SHOWN_OPEN = 2;

export function NewDot(props: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <span className="v4MapNew">
      <span className="v4MapNewDot" aria-hidden="true" />
      {t(props.catalog, "v4.map.new")}
    </span>
  );
}

export function PickBox(props: Readonly<{
  question: V4OpenQuestion;
  picked: boolean;
  onTogglePick: (openQuestionId: string) => void;
  catalog: MessageCatalog;
  className?: string;
}>) {
  return (
    <label className={props.className ?? "v4MapPick"}>
      <input
        type="checkbox"
        checked={props.picked}
        onChange={() => props.onTogglePick(props.question.id)}
      />
      <span className="v4SrOnly">{t(props.catalog, "v4.map.pick", { question: shortText(props.question.text) })}</span>
    </label>
  );
}

/** The one-line note under an open question: picked, else what kind of open question it is. */
export function openNote(question: V4OpenQuestion, picked: boolean, catalog: MessageCatalog): string {
  if (picked) return t(catalog, "v4.map.picked");
  return t(catalog, `v4.map.openKind.${question.kind}`);
}

export function digNote(dig: DigView, catalog: MessageCatalog): string {
  if (dig.state === "FAILED") return t(catalog, "v4.map.digFailed");
  if (dig.state === "DONE") return t(catalog, "v4.map.digDone");
  return t(catalog, "v4.map.digging");
}

/**
 * A title made of AI text, or the site's own words when there is none. RULES-14: only `ai` text is marked
 * data-ai-generated; `more` (picked together) is the site's "and N more" tail, shown outside the AI mark.
 */
export type Title = Readonly<{ text: string; ai: boolean; more: number }>;

/** The question a dig was started from (several when picked together: the first, and how many more). */
export function digTitle(dig: DigView, catalog: MessageCatalog, max = 70): Title {
  const [first, ...rest] = dig.link.questions;
  if (first === undefined || first.trim().length === 0) return { text: t(catalog, "v4.map.digUntitled"), ai: false, more: 0 };
  return { text: shortText(first, max), ai: true, more: rest.filter((question) => question.trim().length > 0).length };
}

export function pathTitle(path: V4Path, catalog: MessageCatalog, max = 70): Title {
  return path.line.trim().length > 0
    ? { text: shortText(path.line, max), ai: true, more: 0 }
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

function OpenCard(props: Readonly<{
  question: V4OpenQuestion;
  pieces: MapPiecesProps;
  selectedId: V4Selection;
}>) {
  const { question, pieces } = props;
  const id: V4Selection = `open:${question.id}`;
  const picked = pieces.picked.has(question.id);
  const selected = props.selectedId === id;
  return (
    <div className={`v4MapOpen${selected ? " v4MapSelected" : ""}${picked ? " v4MapPicked" : ""}`}>
      <button
        type="button"
        className="v4MapOpenMain"
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        {question.star ? <span className="v4MapStar" aria-hidden="true">★</span> : null}
        <span className="v4MapOpenBody">
          {question.star ? <span className="v4SrOnly">{t(pieces.catalog, "v4.map.starHint")}</span> : null}
          <span className="v4MapOpenTitle" data-ai-generated="true">{shortText(question.text)}</span>
          <span className="v4MapNote">{openNote(question, picked, pieces.catalog)}</span>
          {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
        </span>
      </button>
      <PickBox question={question} picked={picked} onTogglePick={pieces.onTogglePick} catalog={pieces.catalog} />
    </div>
  );
}

function DigCard(props: Readonly<{ dig: DigView; pieces: MapPiecesProps; selectedId: V4Selection }>) {
  const { dig, pieces } = props;
  const id: V4Selection = `dig:${dig.link.childRunId}`;
  const selected = props.selectedId === id;
  const working = dig.state === "WAITING" || dig.state === "RUNNING";
  return (
    <button
      type="button"
      className={`v4MapDig v4MapDig${dig.state}${selected ? " v4MapSelected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
    >
      <TitleText className="v4MapDigTitle" title={digTitle(dig, pieces.catalog)} catalog={pieces.catalog} />
      <span className="v4MapNote">
        {working ? <span className="v4MapPulse" aria-hidden="true" /> : null}
        {digNote(dig, pieces.catalog)}
      </span>
      {dig.state === "DONE" && dig.counts !== null
        ? <V4TrustBar counts={dig.counts} catalog={pieces.catalog} />
        : null}
      {dig.state === "DONE" && dig.headline !== null && dig.headline.trim().length > 0
        ? <span className="v4MapDigHeadline" data-ai-generated="true">{dig.headline}</span>
        : null}
      {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
    </button>
  );
}

/** One column of open questions and digs, with "+N open" to show the rest. */
function Leaves(props: Readonly<{
  groupKey: string;
  open: readonly V4OpenQuestion[];
  digs: readonly DigView[];
  pieces: MapPiecesProps;
  selectedId: V4Selection;
  expanded: boolean;
  onExpand: () => void;
}>) {
  const { open, digs, pieces, selectedId } = props;
  const keep = (question: V4OpenQuestion, index: number) =>
    props.expanded || index < SHOWN_OPEN || pieces.picked.has(question.id) || selectedId === `open:${question.id}`;
  const shown = open.filter(keep);
  const hidden = open.length - shown.length;
  if (shown.length === 0 && digs.length === 0) return null;
  return (
    <ul className="v4MapLeaves">
      {shown.map((question) => (
        <li key={`${props.groupKey}/${question.id}`} className="v4MapLeaf v4MapLeafOpen">
          <OpenCard question={question} pieces={pieces} selectedId={selectedId} />
        </li>
      ))}
      {hidden > 0
        ? (
          <li className="v4MapLeaf v4MapLeafOpen">
            <button type="button" className="v4MapMore" aria-expanded="false" onClick={props.onExpand}>
              {t(pieces.catalog, "v4.map.moreOpen", { count: hidden })}
            </button>
          </li>
        )
        : null}
      {digs.map((dig) => (
        <li key={dig.link.childRunId} className="v4MapLeaf v4MapLeafDig">
          <DigCard dig={dig} pieces={pieces} selectedId={selectedId} />
        </li>
      ))}
    </ul>
  );
}

export function V4MapTree(props: MapPiecesProps) {
  const { map, digs, catalog } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const expand = (key: string) => setExpanded((before) => new Set([...before, key]));
  const selectedId = selectionIdOf(resolveSelection(map, digs, props.selected));
  const rootSelected = selectedId === "root";
  const waiting = openCount(map, digs);
  return (
    <div className="v4Map">
      <div className="v4MapScroll">
        <div className="v4MapCanvas">
          <div className="v4MapHeads" aria-hidden="true">
            <span>{t(catalog, "v4.map.colQuestion")}</span>
            <span>{t(catalog, "v4.map.colPaths")}</span>
            <span>{t(catalog, "v4.map.colOpen")}</span>
          </div>
          <div className="v4MapBody">
            <div className="v4MapRootCol">
              <button
                type="button"
                className={`v4MapRoot${rootSelected ? " v4MapSelected" : ""}`}
                aria-current={rootSelected ? "true" : undefined}
                onClick={(event) => props.onSelect("root", viaKeyboard(event))}
              >
                <span className="v4MapRootTitle v4Serif" data-ai-generated="true">{shortText(ownWords(map.question), 110)}</span>
                <V4TrustBar counts={map.counts} unchecked={map.unchecked} catalog={catalog} />
                {waiting > 0
                  ? <span className="v4MapRootChip">{t(catalog, "v4.map.openCount", { count: waiting })}</span>
                  : null}
                {props.changed.has("root") ? <NewDot catalog={catalog} /> : null}
              </button>
              <div className="v4MapRootLeaves">
                <Leaves
                  groupKey="root"
                  open={undugOpen(map.open, digs)}
                  digs={digsUnder(map, digs, null)}
                  pieces={props}
                  selectedId={selectedId}
                  expanded={expanded.has("root")}
                  onExpand={() => expand("root")}
                />
              </div>
            </div>
            {map.paths.length === 0
              ? <p className="v4MapEmpty v4Muted">{t(catalog, "v4.map.noPaths")}</p>
              : (
                <ul className="v4MapBranches">
                  {map.paths.map((path) => {
                    const id: V4Selection = `path:${path.id}`;
                    const selected = selectedId === id;
                    return (
                      <li key={path.id} className="v4MapBranch">
                        <button
                          type="button"
                          className={`v4MapPath${selected ? " v4MapSelected" : ""}`}
                          aria-current={selected ? "true" : undefined}
                          onClick={(event) => props.onSelect(id, viaKeyboard(event))}
                        >
                          <TitleText className="v4MapPathTitle" title={pathTitle(path, catalog)} catalog={catalog} />
                          {path.fate !== null
                            ? <span className={`v4MapFate v4MapFate${path.fate}`}>{t(catalog, `v4.fate.${path.fate}`)}</span>
                            : null}
                          <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
                          {props.changed.has(id) ? <NewDot catalog={catalog} /> : null}
                        </button>
                        <Leaves
                          groupKey={path.id}
                          open={undugOpen(path.open, digs)}
                          digs={digsUnder(map, digs, path.id)}
                          pieces={props}
                          selectedId={selectedId}
                          expanded={expanded.has(path.id)}
                          onExpand={() => expand(path.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
      </div>
      <ul className="v4MapLegend" aria-label={t(catalog, "v4.map.legendLabel")}>
        <li><span className="v4MapKey v4BarSure" aria-hidden="true" />{t(catalog, "v4.trust.SURE")}</li>
        <li><span className="v4MapKey v4BarCase" aria-hidden="true" />{t(catalog, "v4.trust.SURE_FOR_CASE")}</li>
        <li><span className="v4MapKey v4BarArgued" aria-hidden="true" />{t(catalog, "v4.trust.STILL_ARGUED")}</li>
        <li><span className="v4MapKey v4BarFell" aria-hidden="true" />{t(catalog, "v4.trust.DIDNT_HOLD")}</li>
        <li><span className="v4MapKey v4MapKeyOpen" aria-hidden="true" />{t(catalog, "v4.map.legendOpen")}</li>
        <li><span className="v4MapStar" aria-hidden="true">★</span>{t(catalog, "v4.map.legendStar")}</li>
      </ul>
    </div>
  );
}
