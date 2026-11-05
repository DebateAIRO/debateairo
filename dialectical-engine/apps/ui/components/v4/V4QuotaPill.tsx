"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { contractClient } from "@/lib/api";
import { readBillingUsage, type BillingUsage } from "@/lib/billing/usage";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { useQuotaRefresh } from "@/lib/v4/quotaPulse";

/*
 * The header's quota circle (the owner's answers of 5 Nov 2026: questions 14 B and 15, with both rounds of follow-ups).
 *  - A round circle that fills as quota is used, like a battery, with the whole percentage inside ("70%"). It shows the
 *    FULLEST period the person's plan counts, the longest one on a tie (14 B; a tie names the longest, as the server's room
 *    sentence does, so a Free or paid person whose month is used up reads the month). The same circle at every screen
 *    size: it replaces the words "Today: 14% of your quota used" (follow-up 3).
 *  - Never what is left (r2-2 A, journey-f8). Past 100% (a running debate's finish leeway; map-f9: never "100%"), a full
 *    ring with "Over" inside (the owner's word, second follow-up).
 *  - Its name says that period in words and keeps the figure it shows ("Quota used: this week 70%"; WCAG 2.5.3).
 *  - Tapping it opens one bar per period the plan counts, day first: "Today", "This week" and "This month" on paid plans,
 *    "This month" alone on Free, a team grant's own windows ("In total"). Each bar shows its percentage; a bar past 100% is
 *    full and says "Today: more than your quota used". Escape or a click outside closes the bars.
 *  - wait-f22 / public-f15 / map-f9: it is read again when something that uses quota starts or finishes
 *    (lib/v4/quotaPulse.ts) and when the person comes back to the tab, quietly: the ring and the bars change at once, with
 *    no transition or animation (so reduced motion has nothing to stop), and a failed read keeps what was shown. Nothing
 *    is kept in the browser.
 */

type QuotaScope = BillingUsage["windows"][number]["scope"];

/** One window as the circle and its bars say it: its scope and its whole percentage (above 100: past it). */
export type PillWindow = Readonly<{ scope: QuotaScope; percent: number }>;

/** Longest first: a tie between windows names the longest, as the server's room sentence does. */
const LONGEST_FIRST: readonly QuotaScope[] = Object.freeze(["PERSON_GRANT", "PERSON_MONTH", "PERSON_WEEK", "PERSON_DAY"]);

function windowOf(usage: BillingUsage, scope: QuotaScope): PillWindow | null {
  const found = usage.windows.find((window) => window.scope === scope);
  return found === undefined ? null : Object.freeze({ scope, percent: Math.max(0, Math.round(found.percent)) });
}

/**
 * The window the circle shows (question 14 B): the fullest of the windows the read names (the ones the plan counts), the
 * longest on a tie; null with no read, or a read that names no window.
 */
export function pillWindow(usage: BillingUsage | null): PillWindow | null {
  if (usage === null) return null;
  let fullest: PillWindow | null = null;
  for (const scope of LONGEST_FIRST) {
    const window = windowOf(usage, scope);
    if (window !== null && (fullest === null || window.percent > fullest.percent)) fullest = window;
  }
  return fullest;
}

/** Past 100%: a running debate's finish leeway (map-f9). */
function isOver(window: PillWindow): boolean {
  return window.percent > 100;
}

/** "Today: 40% of your quota used", or past it "Today: more than your quota used" (map-f9): a bar's words, read out. */
export function pillText(window: PillWindow, catalog: MessageCatalog): string {
  return isOver(window)
    ? t(catalog, `v4.header.over.${window.scope}`)
    : t(catalog, `v4.header.used.${window.scope}`, { percent: window.percent });
}

/** What the circle shows inside: "70%", or "Over" past 100%. */
export function circleShare(window: PillWindow, catalog: MessageCatalog): string {
  return isOver(window) ? t(catalog, "v4.header.circleShareOver") : t(catalog, "v4.header.circleShare", { percent: window.percent });
}

/** The circle's name: the period in words with what it shows ("Quota used: this week 70%"). */
export function circleName(window: PillWindow, catalog: MessageCatalog): string {
  return isOver(window)
    ? t(catalog, `v4.header.circleOver.${window.scope}`)
    : t(catalog, `v4.header.circle.${window.scope}`, { percent: window.percent });
}

/** Today, this week and this month (or a team grant's windows), day first: the bars tapping the circle shows. */
export function pillDetails(usage: BillingUsage | null): readonly PillWindow[] {
  if (usage === null) return [];
  return [...LONGEST_FIRST].reverse()
    .map((scope) => windowOf(usage, scope))
    .filter((window): window is PillWindow => window !== null);
}

/** How full a ring or a bar is drawn, 0 to 100 (past 100%: full). */
function filled(window: PillWindow): number {
  return Math.min(100, window.percent);
}

/**
 * The person's usage, read once and again on every quota moment and tab return; null when there is none to show.
 * `answered`: the first read has answered (with usage or with none), so the circle's held place can go (ask-f16).
 */
function useQuotaUsage(wanted: boolean): Readonly<{ usage: BillingUsage | null; answered: boolean }> {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [answered, setAnswered] = useState(false);
  const reads = useRef(0);
  const read = useCallback(() => {
    reads.current += 1;
    const mine = reads.current;
    void readBillingUsage(contractClient).then((next) => {
      // The latest read wins; a failed read keeps what was shown (the circle never blinks out on a passing fault).
      if (mine === reads.current && next !== null) setUsage(next);
      setAnswered(true);
    }, () => setAnswered(true));
  }, []);
  useEffect(() => {
    if (!wanted) return undefined;
    read();
    return () => {
      reads.current += 1;
    };
  }, [wanted, read]);
  useQuotaRefresh(read, wanted);
  return { usage: wanted ? usage : null, answered };
}

/** One bar of the open circle: its period and percentage (or, past 100%, the "more than" line), full past 100%. */
function QuotaBar({ bar, catalog }: Readonly<{ bar: PillWindow; catalog: MessageCatalog }>) {
  return (
    <li className="v4HdrQuotaBar" data-quota-scope={bar.scope}>
      {/* What the bar shows is read out once, as one sentence (the visually hidden words below). */}
      <span className="v4HdrQuotaBarHead" aria-hidden="true">
        {isOver(bar) ? (
          <span className="v4HdrQuotaBarLabel">{pillText(bar, catalog)}</span>
        ) : (
          <>
            <span className="v4HdrQuotaBarLabel">{t(catalog, `v4.header.bar.${bar.scope}`)}</span>
            <span className="v4HdrQuotaBarShare">{circleShare(bar, catalog)}</span>
          </>
        )}
      </span>
      <span className="v4HdrQuotaBarTrack" aria-hidden="true">
        <span className="v4HdrQuotaBarFill" style={{ width: `${filled(bar)}%` }} />
      </span>
      <span className="v4SrOnly">{pillText(bar, catalog)}</span>
    </li>
  );
}

/**
 * The circle itself; nothing when the usage cannot be read (billing off, a local site). `wanted` false: the page shows no
 * quota and nothing is read (journey-f19: the report page and public pages). `hold` (ask-f16 with the wave-2 checks, 4
 * Nov): the page does not know yet whether the person is signed in, so the circle's place is held, empty and hidden, while
 * nothing is read; once they are (`wanted`), the same place waits for the read; signed out, it closes at once.
 */
export function V4QuotaPill({ catalog, wanted = true, hold = false }: Readonly<{ catalog: MessageCatalog; wanted?: boolean; hold?: boolean }>) {
  const { usage, answered } = useQuotaUsage(wanted);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const circle = useRef<HTMLButtonElement>(null);
  const barsId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const shown = pillWindow(usage);
  // ask-f16 (first frame = the real page, nothing moves): until the first read answers, the circle's place is held, empty
  // and hidden, so the header row does not shift when it comes.
  if (shown === null) return (wanted && !answered) || (hold && !wanted) ? <span className="v4HdrQuotaHold" aria-hidden="true" data-quota-hold="" /> : null;
  const over = isOver(shown);
  return (
    <div
      className="v4HdrQuota"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          circle.current?.focus();
        }
      }}
    >
      <button
        ref={circle}
        type="button"
        className="v4HdrQuotaCircle"
        aria-label={circleName(shown, catalog)}
        aria-expanded={open}
        aria-controls={barsId}
        data-quota-scope={shown.scope}
        data-quota-over={over ? "" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {/* r = 100 / 2π: the ring's length is 100, so its dash is the share itself. It starts at the top. */}
        <svg className="v4HdrQuotaRing" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
          <circle className="v4HdrQuotaTrack" cx="18" cy="18" r="15.9155" />
          <circle className="v4HdrQuotaFill" cx="18" cy="18" r="15.9155" strokeDasharray={`${filled(shown)} 100`} transform="rotate(-90 18 18)" />
        </svg>
        <span className="v4HdrQuotaShare" aria-hidden="true">{circleShare(shown, catalog)}</span>
      </button>
      <ul className="v4HdrQuotaBars" id={barsId} hidden={!open} aria-label={t(catalog, "v4.header.quotaDetails")}>
        {pillDetails(usage).map((bar) => <QuotaBar key={bar.scope} bar={bar} catalog={catalog} />)}
      </ul>
    </div>
  );
}
