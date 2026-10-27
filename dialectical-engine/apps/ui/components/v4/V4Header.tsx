"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { contractClient } from "@/lib/api";
import { readBillingUsage } from "@/lib/billing/usage";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { levelHref } from "@/lib/v4/storage";
import { READING_LEVELS, type ReadingLevel } from "@/lib/v4/types";

/*
 * V4 initial (spec "/v4", header everywhere): brand + badge to /v4, the reading level as a small menu (changing it
 * saves it, through the page's onReadingLevel; the level lives in the address, FIXES Decision A), the classic-view
 * link and the page's own extras. Today's allowance is
 * shown only as "N% used" (no prices, no other numbers) and only when the usage read succeeds.
 */

/** The person's day window, in percent, or null (billing off, local site, read failed). */
function useDayPercent(): number | null {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void readBillingUsage(contractClient).then((usage) => {
      if (!active || usage === null) return;
      const day = usage.windows.find((window) => window.scope === "PERSON_DAY");
      // 110% is a running debate's finish leeway (UsageBars); the person reads "100% used".
      setPercent(day === undefined ? null : Math.min(100, Math.max(0, Math.round(day.percent))));
    });
    return () => { active = false; };
  }, []);
  return percent;
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

export function V4Header({ catalog, readingLevel, onReadingLevel, classicHref = null, children }: Readonly<{
  catalog: MessageCatalog;
  readingLevel: ReadingLevel | null;
  onReadingLevel?: (level: ReadingLevel) => void;
  classicHref?: string | null;
  /** Right-side extras (e.g. the Report button). */
  children?: ReactNode;
}>) {
  const dayPercent = useDayPercent();
  return (
    <header className="v4Hdr">
      <Link href={levelHref("/v4", readingLevel)} className="v4HdrBrand">
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
        {dayPercent === null ? null : (
          <span className="v4HdrAllowance">{t(catalog, "v4.header.allowance", { percent: dayPercent })}</span>
        )}
        {classicHref === null ? null : (
          <Link href={classicHref} className="v4Link v4HdrClassic">{t(catalog, "v4.common.classicView")}</Link>
        )}
        {children}
      </div>
    </header>
  );
}
