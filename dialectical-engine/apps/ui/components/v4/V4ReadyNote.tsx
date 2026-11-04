"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 screen review (owner picks 3 Nov 2026), journey-f17 / wait-f4: the one ready moment, the same for the answer, a dig
 * and the report. A small note at the bottom (above the pinned bar on a phone) says what is ready, with [See it]; it
 * appears at once with a 1-second soft highlight (no movement, so reduced motion keeps it as it is). Screen readers hear
 * the same line once, from one quiet live region the page keeps mounted (V4ReadyAnnouncer). Focus never moves by itself:
 * only [See it] takes the person there.
 */

/** The note's words come in two parts so the AI's words (a path's line) are marked as AI text and the site's are not. */
export type ReadyNoteText = Readonly<{ before: string; ai: string | null; after: string }>;

/** A sign no path line can hold, so a sentence splits around the line and the line alone is marked AI text. */
export const READY_LINE_SLOT = "⁣⁣";

/** Splits a sentence with a `{line}` placeholder around the (AI-written) line. */
export function readyText(catalog: MessageCatalog, key: string, line: string | null = null): ReadyNoteText {
  if (line === null) return { before: t(catalog, key), ai: null, after: "" };
  const [before = "", after = ""] = t(catalog, key, { line: READY_LINE_SLOT }).split(READY_LINE_SLOT);
  return { before, ai: line, after };
}

/** The whole sentence as one string (what a screen reader hears). */
export function readyPlain(text: ReadyNoteText): string {
  return `${text.before}${text.ai ?? ""}${text.after}`.replace(/\s+/g, " ").trim();
}

export function ReadyWords({ text }: Readonly<{ text: ReadyNoteText }>) {
  return (
    <>
      {text.before}
      {text.ai === null ? null : <span data-ai-generated="true">{text.ai}</span>}
      {text.after}
    </>
  );
}

export function V4ReadyNote(props: Readonly<{
  text: ReadyNoteText;
  /** The note's one action: a button ("See it", "Show me") or a link (the report). */
  action: Readonly<{ label: string; onAct: () => void; href?: string }>;
  onClose: () => void;
  catalog: MessageCatalog;
}>) {
  const { text, action, onClose, catalog } = props;
  return (
    <div className="v4ReadyNote v4Highlight">
      <span className="v4ReadyNoteText"><ReadyWords text={text} /></span>
      {action.href === undefined ? (
        <button type="button" className="v4ReadyNoteAct" onClick={action.onAct}>{action.label}</button>
      ) : (
        <Link className="v4ReadyNoteAct" href={action.href} onClick={action.onAct}>{action.label}</Link>
      )}
      <button type="button" className="v4ReadyNoteClose" onClick={onClose} aria-label={t(catalog, "v4.ready.close")}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

/** How long the live region stays empty before it takes a new line, so the line is heard even when the region is new. */
const ANNOUNCE_AFTER_MS = 150;

/**
 * The one line screen readers hear for a ready moment, once: the region is always in the page, empty, and takes the line
 * a moment after it is given (a region that appears with its words already in it is not read by every screen reader).
 */
export function V4ReadyAnnouncer({ line, id }: Readonly<{ line: string; /** A new moment with the same words is said again. */ id: number }>) {
  const [said, setSaid] = useState("");
  useEffect(() => {
    setSaid("");
    if (line === "") return;
    const timer = window.setTimeout(() => setSaid(line), ANNOUNCE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [line, id]);
  return <p className="v4SrOnly" role="status" aria-live="polite" aria-atomic="true">{said}</p>;
}
