"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { contractClient } from "@/lib/api";
import { readBillingUsage, type BillingUsage } from "@/lib/billing/usage";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { useQuotaRefresh } from "@/lib/v4/quotaPulse";

/*
 * The header's quota pill (owner's screen review, 3 Nov 2026).
 *  - public-d3 A: it always shows the same window for the plan, so it stays steady: today on paid plans ("Today: 40% of
 *    your quota used"), the month on Free ("This month: …", public-f15: Free's only window). Never what is left. Another
 *    window is named only when it is the one blocking a start: a window that is used up (ask-f4: a Free or paid person
 *    whose month is used up never reads today's share). A team grant, which has no plan, names the window that binds
 *    first (ask-f4), as the header did before.
 *  - map-f9: past 100% (a running debate's finish leeway) it says "more than your quota", never "100%".
 *  - public-d3 A: tapping it shows today, this week and this month in words.
 *  - wait-f22 / public-f15 / map-f9: it is read again when something that uses quota starts or finishes
 *    (lib/v4/quotaPulse.ts) and when the person comes back to the tab, quietly: no animation, a failed read keeps what
 *    was shown. Nothing is kept in the browser.
 */

type QuotaScope = BillingUsage["windows"][number]["scope"];

/** One window as the pill says it: its scope and its whole percentage (above 100: past it). */
export type PillWindow = Readonly<{ scope: QuotaScope; percent: number }>;

/** Longest first: a tie between used-up windows names the one that blocks longest, as the server's room sentence does. */
const LONGEST_FIRST: readonly QuotaScope[] = Object.freeze(["PERSON_GRANT", "PERSON_MONTH", "PERSON_WEEK", "PERSON_DAY"]);

function windowOf(usage: BillingUsage, scope: QuotaScope): PillWindow | null {
  const found = usage.windows.find((window) => window.scope === scope);
  return found === undefined ? null : Object.freeze({ scope, percent: Math.max(0, Math.round(found.percent)) });
}

/** The plan's own window: Free counts by the month, every paid plan by the day; a team grant has none. */
function planScope(usage: BillingUsage): QuotaScope | null {
  if (usage.plan_id === null) return null;
  return usage.plan_id === "FREE" ? "PERSON_MONTH" : "PERSON_DAY";
}

/** The window the pill shows, or null (no read, or a read that names no window). */
export function pillWindow(usage: BillingUsage | null): PillWindow | null {
  if (usage === null) return null;
  const windows = LONGEST_FIRST.map((scope) => windowOf(usage, scope)).filter((window): window is PillWindow => window !== null);
  if (windows.length === 0) return null;
  // A used-up window blocks new starts: it is named, the longest first.
  const usedUp = windows.find((window) => window.percent >= 100);
  if (usedUp !== undefined) return usedUp;
  const own = planScope(usage);
  const steady = own === null ? undefined : windows.find((window) => window.scope === own);
  if (steady !== undefined) return steady;
  // A team grant (or a plan whose own window is missing from the read): the fullest window, the longest on a tie.
  return windows.reduce((fullest, window) => (window.percent > fullest.percent ? window : fullest));
}

/** "Today: 40% of your quota used", or past it "Today: more than your quota used" (map-f9). */
export function pillText(window: PillWindow, catalog: MessageCatalog): string {
  return window.percent > 100
    ? t(catalog, `v4.header.over.${window.scope}`)
    : t(catalog, `v4.header.used.${window.scope}`, { percent: window.percent });
}

/** Today, this week and this month (or a team grant), day first: what tapping the pill shows (public-d3 A). */
export function pillDetails(usage: BillingUsage | null): readonly PillWindow[] {
  if (usage === null) return [];
  return [...LONGEST_FIRST].reverse()
    .map((scope) => windowOf(usage, scope))
    .filter((window): window is PillWindow => window !== null);
}

/**
 * The person's usage, read once and again on every quota moment and tab return; null when there is none to show.
 * `answered`: the first read has answered (with usage or with none), so the pill's held place can go (ask-f16).
 */
function useQuotaUsage(wanted: boolean): Readonly<{ usage: BillingUsage | null; answered: boolean }> {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [answered, setAnswered] = useState(false);
  const reads = useRef(0);
  const read = useCallback(() => {
    reads.current += 1;
    const mine = reads.current;
    void readBillingUsage(contractClient).then((next) => {
      // The latest read wins; a failed read keeps what was shown (the pill never blinks out on a passing fault).
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

/**
 * The pill itself; nothing when the usage cannot be read (billing off, a local site). `wanted` false: the page shows no
 * quota and nothing is read (journey-f19: the report page and public pages). `hold` (ask-f16 with the wave-2 checks, 4
 * Nov): the page does not know yet whether the person is signed in, so the pill's place is held, empty and hidden, while
 * nothing is read; once they are (`wanted`), the same place waits for the read; signed out, it closes at once.
 */
export function V4QuotaPill({ catalog, wanted = true, hold = false }: Readonly<{ catalog: MessageCatalog; wanted?: boolean; hold?: boolean }>) {
  const { usage, answered } = useQuotaUsage(wanted);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const shown = pillWindow(usage);
  // ask-f16 (first frame = the real page, nothing moves): until the first read answers, the pill's place is held, empty and
  // hidden, so the header row does not shift when it comes.
  if (shown === null) return (wanted && !answered) || (hold && !wanted) ? <span className="v4HdrQuotaHold" aria-hidden="true" data-quota-hold="" /> : null;
  const text = pillText(shown, catalog);
  const details = pillDetails(usage);
  // One window only (a Free read names just its month): nothing more to show, so the pill is plain text.
  if (details.length <= 1) return <span className="v4HdrAllowance">{text}</span>;
  return (
    <div
      className="v4HdrQuota"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="v4HdrAllowance v4HdrQuotaButton"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {text}
      </button>
      <ul className="v4HdrQuotaList" id={listId} hidden={!open} aria-label={t(catalog, "v4.header.quotaDetails")}>
        {details.map((detail) => <li key={detail.scope}>{pillText(detail, catalog)}</li>)}
      </ul>
    </div>
  );
}
