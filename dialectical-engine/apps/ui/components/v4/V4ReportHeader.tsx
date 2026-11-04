"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { READING_LEVELS, type ReadingLevel } from "@/lib/v4/types";
import { V4AccountMenu } from "./V4AccountMenu";
import { V4Steps } from "./V4Steps";

/*
 * report-f12 (owner screen review, 3 Nov 2026): the report's own header, ONE row. "← Back to the map" on the start side;
 * on the end side the reading level in its small "Plain words ▾" form and "Share" (Download PDF, Print, Copy link). No quota
 * share on the report (row D cut it), no second brand row, and the classic-view link moves to the page foot. It is built
 * here rather than in the shared V4Header, so every other V4 page keeps its header as it is.
 * Below the row, one status line says what a Share choice is doing ("Making your PDF…", "Link copied.").
 * ask-d6 A / journey-f19: the row ends in the V4 header's round account button (the site's old top bar steps back on V4
 * pages), with no classic link in its menu: the report keeps that at its foot. journey-f18 / read-f25: under the row, the
 * four steps with "Your report" marked.
 */

/** One Share choice. */
export type ReportShareItem = Readonly<{ id: string; label: string; onSelect: () => void }>;

/** A small menu: a button that opens a list below it; a click outside, Escape or focus leaving it closes it. */
function HeaderMenu({ buttonLabel, buttonText, title, className, children }: Readonly<{
  /** The button's accessible name. */
  buttonLabel: string;
  buttonText: string;
  /** The list's name (read out; shown small at its top when `title` is set). */
  title: string;
  className: string;
  children: (close: (refocus: boolean) => void) => ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Opening puts focus on the chosen item (the level menu), else the first one.
  useEffect(() => {
    if (!open) return;
    const list = root.current?.querySelector<HTMLElement>(".v4RepMenuList");
    (list?.querySelector<HTMLButtonElement>("[aria-pressed=\"true\"]") ?? list?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggle.current?.focus();
  };
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    close(true);
  }
  // As V4Header's level menu (UI-11): focus moving outside closes it; a blur with no new target is left to the click handler.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (open && next instanceof Node && root.current !== null && !root.current.contains(next)) setOpen(false);
  }

  return (
    <div className={`v4RepMenu ${className}`} ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={toggle}
        type="button"
        className="v4RepMenuButton"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={buttonLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{buttonText}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="v4RepMenuList" id={listId} role="group" aria-label={title}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function V4ReportHeader({ catalog, backHref, backKey = "v4.report.backToMap", level, onLevel, share, status }: Readonly<{
  catalog: MessageCatalog;
  /** null: there is no map to go back to (a report that cannot be found). */
  backHref: string | null;
  /** The back link's words: "Back to the map", or "Back to your question" for a debate that did not finish (map-f30). */
  backKey?: "v4.report.backToMap" | "v4.report.backToQuestion";
  level: ReadingLevel;
  onLevel: (level: ReadingLevel) => void;
  /** The Share choices in their order; none: no Share button. */
  share: readonly ReportShareItem[];
  /** What a Share choice is doing, or null. */
  status: ReactNode;
}>) {
  return (
    <div className="v4RepChrome">
      <header className="v4RepHdr">
        {backHref === null ? <span className="v4RepHdrSpacer" /> : (
          <Link className="v4RepHdrBack" href={backHref}>
            <span className="v4RepHdrArrow" aria-hidden="true">←</span>
            <span className="v4RepHdrBackText">{t(catalog, backKey)}</span>
          </Link>
        )}
        <HeaderMenu
          className="v4RepLevel"
          buttonLabel={t(catalog, "v4.header.levelButton", { level: t(catalog, `v4.readingLevel.${level}`) })}
          buttonText={t(catalog, `v4.readingLevel.${level}`)}
          title={t(catalog, "v4.header.levelMenu")}
        >
          {(close) => (
            <>
              <p className="v4RepMenuTitle" aria-hidden="true">{t(catalog, "v4.header.levelMenu")}</p>
              {READING_LEVELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="v4RepMenuItem"
                  aria-pressed={option === level}
                  onClick={() => {
                    onLevel(option);
                    close(true);
                  }}
                >
                  <span className="v4RepMenuCheck" aria-hidden="true">{option === level ? "✓" : ""}</span>
                  <span>{t(catalog, `v4.readingLevel.${option}`)}</span>
                </button>
              ))}
            </>
          )}
        </HeaderMenu>
        {share.length === 0 ? null : (
          <HeaderMenu
            className="v4RepShare"
            buttonLabel={t(catalog, "v4.report.shareButton")}
            buttonText={t(catalog, "v4.report.share")}
            title={t(catalog, "v4.report.shareButton")}
          >
            {(close) => share.map((item) => (
              <button
                key={item.id}
                type="button"
                className="v4RepMenuItem"
                data-share={item.id}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </HeaderMenu>
        )}
        <V4AccountMenu catalog={catalog} level={level} classicHref={null} />
      </header>
      <div className="v4StepsTop">
        <V4Steps current="report" shape="line" {...(backHref === null ? {} : { hrefs: { map: backHref } })} catalog={catalog} />
      </div>
      <div className="v4RepHdrStatus" role="status">{status}</div>
    </div>
  );
}
