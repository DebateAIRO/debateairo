"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import type { BillingUsage } from "@/lib/billing/usage";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { levelHref } from "@/lib/v4/storage";
import { READING_LEVELS, type ReadingLevel } from "@/lib/v4/types";
import { V4QuotaPill } from "./V4QuotaPill";
import { V4AccountMenu, type V4HeaderSession } from "./V4AccountMenu";

/*
 * V4 initial (spec "/v4", header everywhere): brand + badge to /v4, the reading level as a small menu (changing it
 * saves it, through the page's onReadingLevel; the level lives in the address, FIXES Decision A) and the page's own
 * extras. The quota is shown only as "N% used" of one window (no prices, no other numbers) and only when the usage read
 * succeeds: the steady pill of V4QuotaPill.tsx (public-d3 A, owner's screen review 3 Nov).
 * V4 screen review (3 Nov 2026), ask-d6 A / ask-f5 / journey-f19: this is the V4 pages' one header row (the site's old top
 * bar steps back on them). It ends in the round account button (V4AccountMenu), whose menu also holds the classic-view
 * link, once; the header itself shows no classic link any more.
 */

type QuotaScope = BillingUsage["windows"][number]["scope"];

/**
 * V4 review ask-f4: the window that binds first, named by its own word ("Today", "This week", "This month", or "In
 * total" for a team grant). That is the fullest one; a tie goes to the longest window, as the server's room sentence
 * names a tie (packages/budget room.ts SCOPE_PRECEDENCE), so a Free person whose month is used up reads "This month"
 * here too, never today's share.
 */
const LONGEST_FIRST: readonly QuotaScope[] = Object.freeze(["PERSON_GRANT", "PERSON_MONTH", "PERSON_WEEK", "PERSON_DAY"]);

export function tightestWindow(usage: BillingUsage | null): Readonly<{ scope: QuotaScope; percent: number }> | null {
  if (usage === null) return null;
  let tightest: Readonly<{ scope: QuotaScope; percent: number }> | null = null;
  for (const scope of LONGEST_FIRST) {
    const window = usage.windows.find((candidate) => candidate.scope === scope);
    if (window === undefined) continue;
    // Past 100% is a running debate's finish leeway (UsageBars); the person reads "100% used".
    const percent = Math.min(100, Math.max(0, Math.round(window.percent)));
    if (tightest === null || percent > tightest.percent) tightest = Object.freeze({ scope, percent });
  }
  return tightest;
}

function ReadingLevelMenu({ catalog, level, onLevel }: Readonly<{
  catalog: MessageCatalog; level: ReadingLevel; onLevel: (level: ReadingLevel) => void;
}>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Close on a click outside, like any menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keyboard: opening puts focus on the current choice; Escape closes and returns focus to the button.
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[aria-pressed=\"true\"]")?.focus();
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    toggle.current?.focus();
  }

  // UI-11: keyboard focus moving outside the menu closes it, like a click outside. A blur with no new target is left
  // to the mousedown handler: Safari blurs without focusing the option being clicked, and closing then would lose it.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (open && next instanceof Node && root.current !== null && !root.current.contains(next)) setOpen(false);
  }

  function choose(next: ReadingLevel) {
    onLevel(next);
    setOpen(false);
    toggle.current?.focus();
  }

  return (
    <div className="v4HdrLevel" ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={toggle}
        type="button"
        className="v4HdrLevelButton"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t(catalog, "v4.header.levelButton", { level: t(catalog, `v4.readingLevel.${level}`) })}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{t(catalog, `v4.readingLevel.${level}`)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="v4HdrLevelList" id={listId} role="group" aria-label={t(catalog, "v4.header.levelMenu")}>
          <p className="v4HdrLevelTitle" aria-hidden="true">{t(catalog, "v4.header.levelMenu")}</p>
          {READING_LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              className="v4HdrLevelOption"
              aria-pressed={option === level}
              onClick={() => choose(option)}
            >
              <span className="v4HdrLevelCheck" aria-hidden="true">{option === level ? "✓" : ""}</span>
              <span>{t(catalog, `v4.readingLevel.${option}`)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function V4Header({
  catalog, readingLevel, linkLevel, onReadingLevel, classicHref = null, showQuota = true, session, children
}: Readonly<{
  catalog: MessageCatalog;
  /** The level the menu shows (a page may show its default when none was chosen). */
  readingLevel: ReadingLevel | null;
  /**
   * R2REG-5: the level the brand link carries — only one the person chose (null: none, so /v4 still offers the choice).
   * Left out, the link carries `readingLevel` as before.
   */
  linkLevel?: ReadingLevel | null;
  onReadingLevel?: (level: ReadingLevel) => void;
  /** journey-f19 / ask-f6: this page's classic view, offered once, in the account menu (null: none, or the page shows it). */
  classicHref?: string | null;
  /**
   * journey-f19: the quota share shows only on the ask, choosing and map pages. False on any other page (a public page's
   * note, for one): no share is shown and the usage is not read.
   */
  showQuota?: boolean;
  /** The page's own knowledge of the session (the ask page learns it beside the page); absent: the menu reads it. */
  session?: V4HeaderSession;
  /** Extras before the account button (e.g. the Report button). */
  children?: ReactNode;
}>) {
  return (
    <header className="v4Hdr">
      <Link href={levelHref("/v4", linkLevel === undefined ? readingLevel : linkLevel)} className="v4HdrBrand">
        <span className="v4HdrMark" aria-hidden="true" />
        <span className="v4HdrName">Dialectical Engine</span>
        <span className="v4HdrBadge">{t(catalog, "v4.brand.badge")}</span>
      </Link>
      <div className="v4HdrRight">
        {readingLevel === null ? null : onReadingLevel === undefined ? (
          <span className="v4HdrLevelStatic">{t(catalog, `v4.readingLevel.${readingLevel}`)}</span>
        ) : (
          <ReadingLevelMenu catalog={catalog} level={readingLevel} onLevel={onReadingLevel} />
        )}
        <V4QuotaPill catalog={catalog} wanted={showQuota} />
        {children}
        {/* ask-d6 A: the round account button ends the row; its links carry the level the brand link carries. */}
        <V4AccountMenu
          catalog={catalog}
          level={linkLevel === undefined ? readingLevel : linkLevel}
          classicHref={classicHref}
          {...(session === undefined ? {} : { session })}
        />
      </div>
    </header>
  );
}
