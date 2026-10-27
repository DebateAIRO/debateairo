"use client";

import { useEffect, useRef, useState } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { digTargetQuestions } from "@/lib/v4/askText";
import type { PendingDig } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), row D decision 1: a dig starts at once with a 10-second Undo. This note only counts down
 * and offers Undo; the page sends nothing before `sendsAt` (V4DebateClient owns the timer). After the send it shows
 * one short outcome: started, or the plain reason it was refused.
 */

export type V4DigNotice =
  | Readonly<{ kind: "STARTED" }>
  | Readonly<{ kind: "REFUSED"; message: string }>;

const QUESTION_MARK = "\u0000question\u0000";
const SHORT_QUESTION = 70;
const STARTED_SHOWN_MS = 6000;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= SHORT_QUESTION ? flat : `${flat.slice(0, SHORT_QUESTION - 1).trimEnd()}…`;
}

function secondsLeft(sendsAt: number, now: number): number {
  return Math.max(0, Math.ceil((sendsAt - now) / 1000));
}

export function V4DigToast(props: Readonly<{
  pending: PendingDig | null;
  onUndo: () => void;
  notice: V4DigNotice | null;
  onCloseNotice: () => void;
  /** Phone: sit above the pinned bottom bar. */
  lifted: boolean;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { pending, onUndo, notice, onCloseNotice, lifted, catalog, locale } = props;
  const [now, setNow] = useState(() => Date.now());
  const closeRef = useRef(onCloseNotice);
  useEffect(() => {
    closeRef.current = onCloseNotice;
  }, [onCloseNotice]);

  // The visible countdown; the send itself is timed by the page, so a slow tick never delays or speeds it.
  useEffect(() => {
    if (pending === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [pending]);

  useEffect(() => {
    if (notice?.kind !== "STARTED") return;
    const timer = window.setTimeout(() => closeRef.current(), STARTED_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const className = `v4Toast v4DebToast${lifted ? " v4DebToastLifted" : ""}`;

  if (pending !== null) {
    const questions = digTargetQuestions(pending.target);
    const first = shorten(questions[0] ?? "");
    const [before = "", after = ""] = t(catalog, "v4.dig.digging", { question: QUESTION_MARK }).split(QUESTION_MARK);
    const seconds = secondsLeft(pending.sendsAt, now);
    return (
      <div className={className} role="status">
        <span className="v4DebToastText">
          {before}
          <span data-ai-generated="true">{first}</span>
          {after}
          {questions.length > 1 ? <>{" "}{tPlural(catalog, "v4.dig.andMore", questions.length - 1, locale)}</> : null}
          <span className="v4DebToastMode">{" · "}{t(catalog, `v4.digMode.${pending.mode}`)}</span>
        </span>
        <button type="button" onClick={onUndo} aria-label={t(catalog, "v4.dig.undoLabel", { seconds })}>
          {t(catalog, "v4.dig.undo", { seconds })}
        </button>
      </div>
    );
  }

  if (notice === null) return null;
  return (
    <div className={className} role="status">
      <span className="v4DebToastText">
        {notice.kind === "STARTED" ? t(catalog, "v4.dig.started") : notice.message}
      </span>
      <button type="button" onClick={onCloseNotice}>{t(catalog, "v4.dig.close")}</button>
    </div>
  );
}
