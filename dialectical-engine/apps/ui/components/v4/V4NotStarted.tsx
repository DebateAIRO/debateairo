"use client";

import { useId, useState } from "react";
import { SAVED_QUESTION_LIMITS, type SavedQuestionSummary } from "@debateai/contract";
import { V4UndoNote } from "@/components/v4/V4UndoNote";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { DIG_UNDO_MS } from "@/lib/v4/digUndo";
import type { WaitingDelete } from "@/lib/v4/useSavedQuestion";

/*
 * V4 start step, Task 76f (owner cards "Where shown" and "How long"; answer S3 A; saved-questions spec 2026-11-04 §3.4): "Not
 * started yet" on step 1, under the question box and its lines, above "Your maps". Each question the account keeps shows its
 * first line (one line, cut by the page's styles), the day it was last saved, Pick up and Delete. The newest 5 show; with more,
 * "Show all (n)" shows the rest in the same place. Nothing shows without an item.
 */

/**
 * The day a question was last saved, in the page's language ("22 Oct"); nothing for a date the page cannot read. Review (wave
 * 16): through translate.ts's formatDate, so every English page writes the day first (the owner's answer Q5 B, 5 Nov).
 */
function dayOf(iso: string, locale: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.valueOf())) return "";
  return formatDate(locale, when, { day: "numeric", month: "short" });
}

export function V4NotStarted(props: Readonly<{
  items: readonly SavedQuestionSummary[];
  locale: string;
  catalog: MessageCatalog;
  onPickUp(id: string): void;
  onDelete(item: SavedQuestionSummary): void;
}>) {
  const { items, locale, catalog } = props;
  const ids = useId();
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SAVED_QUESTION_LIMITS.shown);
  return (
    <section className="v4NotStarted" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="v4NotStartedTitle">{t(catalog, "v4.saved.title")}</h2>
      <ul className="v4NotStartedList">
        {shown.map((item, at) => (
          <li key={item.id} className="v4NotStartedItem" data-saved-id={item.id}>
            <span id={`${ids}-q${at}`} className="v4NotStartedQuestion" dir="auto" title={item.question}>{item.question}</span>
            <span className="v4NotStartedDay v4Muted">{dayOf(item.saved_at, locale)}</span>
            <span className="v4NotStartedActions">
              <button type="button" className="v4Link v4NotStartedPickUp" aria-describedby={`${ids}-q${at}`} onClick={() => props.onPickUp(item.id)}>
                {t(catalog, "v4.saved.pickUp")}
              </button>
              <button type="button" className="v4Link v4NotStartedDelete" aria-describedby={`${ids}-q${at}`} onClick={() => props.onDelete(item)}>
                {t(catalog, "v4.saved.delete")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {all || items.length <= SAVED_QUESTION_LIMITS.shown ? null : (
        <button type="button" className="v4Link v4NotStartedAll" onClick={() => setAll(true)}>
          {t(catalog, "v4.saved.showAll", { count: items.length })}
        </button>
      )}
    </section>
  );
}

/**
 * Each Delete waiting out its Undo window (useSavedDeletes), in the shared Undo note ("Deleted “…”", Undo, the shrinking line);
 * a note goes once its DELETE is sent. The same note and the same words on the ask page and on "My questions"; the page
 * draws it right after "Not started yet".
 */
export function V4SavedDeleteNotes(props: Readonly<{
  waiting: readonly WaitingDelete[];
  catalog: MessageCatalog;
  onUndo(id: string): void;
}>) {
  const { catalog } = props;
  return (
    <>
      {props.waiting.filter((one) => !one.sent).map((one) => (
        <V4UndoNote
          key={one.item.id}
          state="counting"
          label={t(catalog, "v4.saved.deleted", { question: one.item.question })}
          sendsAt={one.sendsAt}
          durationMs={DIG_UNDO_MS}
          onUndo={() => props.onUndo(one.item.id)}
          undoLabel={t(catalog, "v4.start.undo")}
          stillLine={t(catalog, "v4.saved.deleteStill")}
          announce={t(catalog, "v4.saved.deleteAnnounce")}
          sendingLine={t(catalog, "v4.saved.deleteStill")}
          confirmedLine={t(catalog, "v4.saved.deleteStill")}
        />
      ))}
    </>
  );
}
