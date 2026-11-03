"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { digTargetQuestions } from "@/lib/v4/askText";
import {
  digGroupOf,
  dismissDig,
  markDigFocused,
  undoDig,
  useDigNotesClaimed,
  useDigUndo,
  waitingDigsOf,
  type DigUndoEntry
} from "@/lib/v4/digUndo";
import { isEdited } from "@/lib/v4/suggestions";
import type { DigTarget } from "@/lib/v4/types";
import { V4UndoNote, V4UndoNotes, type V4UndoNoteState } from "./V4UndoNote";

/*
 * V4 UX fixes (owner picks 3 Nov: dig-d3 B, dig-f7, dig-f8, dig-f10, journey-f21): the dig's words around the shared
 * Undo note (V4UndoNote.tsx), read from the site-wide list of waiting digs (lib/v4/digUndo.ts).
 *  - The note: "Digging into “Mostly renewables” · up to 4% of today [Undo]" (no mode word on Free), then "Starting your
 *    dig…", then "Started 14:31 · You can leave this page." with [See it] unless the person is already on the dig, or the
 *    plain reason it was refused; after Undo, "Cancelled. Nothing was used." for 4 seconds.
 *  - The panel of the place being dug: "Your dig starts in a few seconds. You can still undo it. [Undo]".
 *  - The site-wide holder (app/v4/layout.tsx) draws the notes on every V4 page that does not draw them in its own bottom
 *    stack (the map page does), so the note travels with the person.
 *  - The report page: "Your dig on “…” starts in a few seconds. Your report will wait for it." (ruling F7).
 * Only the words of a first pick the AIs wrote are marked as AI text: the person's own view and their own wording of a
 * suggestion are theirs.
 */

const QUESTION_MARK = "\u0000question\u0000";
const SHORT_QUESTION = 70;
/** dig-d3 A: at most three lines on a computer and two on a phone; older ones fold to "+N more starting". */
const LINES_WIDE = 3;
const LINES_PHONE = 2;
const NARROW_QUERY = "(max-width: 767px)";

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= SHORT_QUESTION ? flat : `${flat.slice(0, SHORT_QUESTION - 1).trimEnd()}…`;
}

/** Whether the first words a dig names were written by the AIs (RULES-14; dig-f20 for the person's own words). */
function firstIsAi(target: DigTarget): boolean {
  if (target.kind !== "picks") return true;
  const first = target.picks[0];
  if (first === undefined) return true;
  return first.kind === "OPEN" || (first.kind === "SUGGESTION" && !isEdited(first));
}

/** The first thing a dig looks into, shortened, with its AI mark when the AIs wrote it. */
export function DigFirstQuestion(props: Readonly<{ target: DigTarget }>) {
  const first = shorten(digTargetQuestions(props.target)[0] ?? "");
  return <span data-ai-generated={firstIsAi(props.target) ? "true" : undefined}>{first}</span>;
}

/** A sentence of the catalogue with the dig's first question put in at {question}. */
function withQuestion(sentence: string, target: DigTarget): ReactNode {
  const [before = "", after = ""] = sentence.split(QUESTION_MARK);
  return <>{before}<DigFirstQuestion target={target} />{after}</>;
}

function clock(iso: string, locale: string): string {
  const when = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(when);
  }
}

/** "Digging into “…” and 1 more · Thorough · up to 4% of today". */
function digLabel(entry: DigUndoEntry, catalog: MessageCatalog, locale: string): ReactNode {
  const { target, mode } = entry.dig;
  const more = digTargetQuestions(target).length - 1;
  return (
    <>
      {withQuestion(t(catalog, "v4.dig.digging", { question: QUESTION_MARK }), target)}
      {more > 0 ? <>{" "}{tPlural(catalog, "v4.dig.andMore", more, locale)}</> : null}
      {entry.showMode ? <span className="v4UndoMode">{" · "}{t(catalog, `v4.digMode.${mode}`)}</span> : null}
      {entry.sharePercent !== null && entry.sharePercent > 0
        ? <>{" · "}{t(catalog, "v4.undo.digShare", { percent: entry.sharePercent })}</>
        : null}
    </>
  );
}

function noteState(entry: DigUndoEntry): V4UndoNoteState {
  if (entry.phase === "COUNTING") return "counting";
  if (entry.phase === "SENDING") return "sending";
  if (entry.phase === "CANCELLED") return "cancelled";
  return "done";
}

/** Where a started dig can be seen: on its debate's map, at the path it digs (when it digs one). */
function mapHrefOf(entry: DigUndoEntry): string {
  const base = `/v4/debate/${encodeURIComponent(entry.parentRunId)}`;
  const group = digGroupOf(entry.dig.target);
  return group === "root" ? base : `${base}?path=${encodeURIComponent(group)}`;
}

export type V4DigNotesProps = Readonly<{
  entries: readonly DigUndoEntry[];
  catalog: MessageCatalog;
  locale: string;
  /** A phone: two lines at most, the older one folded. */
  narrow: boolean;
  /** The debate whose map draws these notes (null or absent: not a map page). */
  hereRunId?: string | null;
  /**
   * dig-f10: on the map of the dig's debate (`hereRunId`), [See it] opens the new dig in the panel, and is left out when
   * the person is already on it; anywhere else it is a link to that map.
   */
  onSeeIt?: (entry: DigUndoEntry, childRunId: string) => void;
  /** The dig the person is on (`dig:<run>` selections), so its own note does not offer [See it]. */
  viewingDig?: string | null;
  /** Where focus goes back when the pressed button is gone (a phone's pinned bar swaps it for the note). */
  returnFocus?: () => HTMLElement | null;
}>;

/** The site's dig notes, oldest first, in one note (V4UndoNotes). */
export function V4DigNotes(props: V4DigNotesProps) {
  const { entries, catalog, locale } = props;
  if (entries.length === 0) return null;
  const items = entries.map((entry) => ({
    key: entry.id,
    render: (folded: boolean) => {
      const result = entry.result;
      const started = result?.kind === "STARTED" ? result : null;
      const here = props.hereRunId !== undefined && props.hereRunId !== null && entry.parentRunId === props.hereRunId;
      const seeIt = started === null || (here && props.viewingDig === `dig:${started.childRunId}`)
        ? null
        : here && props.onSeeIt !== undefined
          ? (
            <button type="button" className="v4UndoLink" onClick={() => props.onSeeIt?.(entry, started.childRunId)}>
              {t(catalog, "v4.dig.seeIt")}
            </button>
          )
          : <Link className="v4UndoLink" href={mapHrefOf(entry)}>{t(catalog, "v4.dig.seeIt")}</Link>;
      const doneWords = started !== null
        ? t(catalog, "v4.dig.started", { time: clock(started.startedAt, locale) })
        : result?.kind === "REFUSED" ? result.message : "";
      return (
        <V4UndoNote
          state={noteState(entry)}
          label={digLabel(entry, catalog, locale)}
          sendsAt={entry.dig.sendsAt}
          onUndo={() => void undoDig(entry.id)}
          undoLabel={t(catalog, "v4.dig.undo")}
          undoName={t(catalog, "v4.dig.undoLabel")}
          stillLine={t(catalog, "v4.undo.still")}
          announce={t(catalog, "v4.undo.announceDig")}
          sendingLine={t(catalog, "v4.undo.sendingDig")}
          confirmedLine={t(catalog, "v4.undo.cancelled")}
          doneLine={<>{doneWords}{seeIt === null ? null : <>{" "}{seeIt}</>}</>}
          doneAnnounce={doneWords}
          onClose={() => dismissDig(entry.id)}
          closeLabel={t(catalog, "v4.dig.close")}
          takeFocus={!entry.focused}
          onFocusTaken={() => markDigFocused(entry.id)}
          {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
          folded={folded}
        />
      );
    }
  }));
  return (
    <V4UndoNotes
      items={items}
      max={props.narrow ? LINES_PHONE : LINES_WIDE}
      foldOlder={props.narrow}
      moreLabel={(count) => t(catalog, "v4.undo.more", { count })}
    />
  );
}

/** dig-f8 / dig-d3 B: the line where the dig was pressed, while it waits. Its Undo is the same as the note's. */
export function V4DigStartingLine(props: Readonly<{ entry: DigUndoEntry; onUndo: (id: number) => void; catalog: MessageCatalog }>) {
  const { entry, catalog } = props;
  if (entry.phase === "SENDING") return <p className="v4PanelHint v4DigStarting" role="status">{t(catalog, "v4.undo.sendingDig")}</p>;
  return (
    <p className="v4PanelHint v4DigStarting">
      {t(catalog, "v4.panel.digStarting")}{" "}
      <button type="button" className="v4Link v4DigStartingUndo" aria-label={t(catalog, "v4.dig.undoLabel")} onClick={() => props.onUndo(entry.id)}>
        {t(catalog, "v4.dig.undo")}
      </button>
    </p>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(NARROW_QUERY);
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * dig-d3 A: the site-wide holder, in app/v4/layout.tsx. On a V4 page that does not draw the notes itself (the report,
 * the ask page, a page loading), the waiting digs keep their note and their Undo, bottom-left on a computer.
 */
export function V4DigUndoHost(props: Readonly<{ catalog: MessageCatalog; locale: string }>) {
  const entries = useDigUndo();
  const claimed = useDigNotesClaimed();
  const narrow = useNarrow();
  if (claimed || entries.length === 0) return null;
  return (
    <div className="v4UndoHost">
      <V4DigNotes entries={entries} catalog={props.catalog} locale={props.locale} narrow={narrow} />
    </div>
  );
}

/** dig-d3 A, ruling F7: the report page says it will wait for a dig still in its 10 seconds (or being sent). */
export function V4ReportDigWait(props: Readonly<{ runId: string; catalog: MessageCatalog }>) {
  const entries = useDigUndo();
  const waiting = waitingDigsOf(entries, props.runId);
  if (waiting.length === 0) return null;
  return (
    <div className="v4RepDigWait v4RepNoPrint" role="status">
      {waiting.map((entry) => (
        <p key={entry.id} className="v4RepNote">
          {withQuestion(t(props.catalog, "v4.report.digWait", { question: QUESTION_MARK }), entry.dig.target)}
        </p>
      ))}
    </div>
  );
}
