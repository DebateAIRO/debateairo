import {
  RUN_PAUSED_UNTIL_RESET,
  type ContractClient,
  type MonthPause,
  type RunProjection,
  type UsageBorrow
} from "@debateai/contract";
import { contractClient } from "../api.js";
import type { AskRoom } from "../billing/room.js";
import { formatDate } from "../i18n/translate.js";

/*
 * The money rule (owner, 31 Oct 2026; dig model revision, "The money rule"), as the V4 pages say it. Users see shares
 * of their quota, never prices: every line here is a percentage of a window or a reset time, read from the API's own
 * words (contract W2-7), never worked out on the page.
 *  - before a dig: its share of today (`dig_share_percent`, the approved line "v4.dig.quotaShare");
 *  - before a new question: its share of today (`start_share_percent`);
 *  - new questions and digs wait for the day, week or month reset (`new_starts: BLOCKED_UNTIL_RESET`); running work goes on;
 *  - running work that went past the day or week borrowed from the next one (`borrowed`), and the page says so;
 *  - at the month wall a running debate pauses (`month_pause`) and the person presses Continue once the month resets.
 * Nothing is kept in the browser.
 */

/** One line to show: its catalogue key and the values its placeholders take. */
export type MoneyLine = Readonly<{ key: string; values: Readonly<Record<string, string | number>> }>;

const PERSON_SCOPES = ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"] as const;
type PersonScope = (typeof PERSON_SCOPES)[number];

function personScope(scope: string | null): PersonScope | null {
  return (PERSON_SCOPES as readonly string[]).includes(scope ?? "") ? (scope as PersonScope) : null;
}

/** A reset as people read it: the time of day for a day's reset, the date and time for a week's or a month's. */
export function resetText(iso: string, scope: PersonScope | "MONTH_PAUSE", locale: string): string {
  return scope === "PERSON_DAY"
    ? formatDate(locale, iso, { hour: "2-digit", minute: "2-digit" })
    : scope === "MONTH_PAUSE"
      ? formatDate(locale, iso, { dateStyle: "medium" })
      : formatDate(locale, iso, { dateStyle: "medium", timeStyle: "short" });
}

/** Before a dig: "This dig uses about {percent}% of today. …" (approved), when the room read for the dig says a share. */
export function digShareLine(room: AskRoom | null): MoneyLine | null {
  const percent = room?.dig_share_percent;
  return percent === undefined || percent <= 0 ? null : Object.freeze({ key: "v4.dig.quotaShare", values: { percent } });
}

/** Before a new question: its share of today, when the room read says one. */
export function startShareLine(room: AskRoom | null): MoneyLine | null {
  const percent = room?.start_share_percent;
  return percent === undefined || percent <= 0 ? null : Object.freeze({ key: "v4.room.startShare", values: { percent } });
}

/** New starts wait for the reset of a full day, week or month: the line with the reset time; null otherwise. */
export function startsWaitLine(room: AskRoom | null, locale: string): MoneyLine | null {
  if (room === null || room.new_starts !== "BLOCKED_UNTIL_RESET" || room.resets_at === null) return null;
  const scope = personScope(room.scope);
  if (scope === null) return null;
  return Object.freeze({ key: `v4.money.startsWait.${scope}`, values: { time: resetText(room.resets_at, scope, locale) } });
}

/** The usage area's borrow notices: what running work used of tomorrow's or next week's allowance, day first. */
export function borrowLines(borrowed: readonly UsageBorrow[] | undefined): readonly MoneyLine[] {
  const order: Readonly<Record<UsageBorrow["scope"], number>> = { PERSON_DAY: 0, PERSON_WEEK: 1 };
  const byScope = new Map<UsageBorrow["scope"], number>();
  for (const borrow of borrowed ?? []) {
    // Several runs may have borrowed from the same window: the notice says the window's whole share once (at most 100).
    byScope.set(borrow.scope, Math.min(100, (byScope.get(borrow.scope) ?? 0) + borrow.percent));
  }
  return Object.freeze([...byScope.entries()]
    .sort(([a], [b]) => order[a] - order[b])
    .map(([scope, percent]) => Object.freeze({ key: `v4.money.borrowed.${scope}`, values: { percent } })));
}

/** The borrow notices of the person's usage read; none when it cannot be read (billing off, a local site, a failure). */
export async function readBorrowed(client: Pick<ContractClient, "getBillingUsage"> = contractClient): Promise<readonly UsageBorrow[]> {
  try {
    const usage = await Promise.resolve().then(() => client.getBillingUsage());
    return "borrowed" in usage && usage.borrowed !== undefined ? usage.borrowed : [];
  } catch {
    return [];
  }
}

/** The month pause of a running debate, or null. */
export function monthPauseOf(run: RunProjection): MonthPause | null {
  return run.month_pause ?? null;
}

export type ContinueOutcome =
  | Readonly<{ kind: "CONTINUING" }>
  /** Pressed before the month reset: nothing changed; the page says from when it can continue. */
  | Readonly<{ kind: "TOO_EARLY"; until: string }>
  | Readonly<{ kind: "FAILED" }>;

/**
 * Continue on a month-paused debate: POST /v1/runs/{id}/continue, through the typed client (R22 W3-8: the route is
 * registered; the client sends the CSRF header as its other writes do). Pressed before the month reset the API refuses
 * with its reset (`until`), answered as data. True resume: finished work is never paid for again. Never throws.
 */
export async function continueRun(runId: string, client: Pick<ContractClient, "continueRun"> = contractClient): Promise<ContinueOutcome> {
  try {
    const answer = await Promise.resolve().then(() => client.continueRun(runId));
    if ("state" in answer && answer.state === "CONTINUING") return { kind: "CONTINUING" };
    if ("error" in answer && answer.error === RUN_PAUSED_UNTIL_RESET) return { kind: "TOO_EARLY", until: answer.until };
    return { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
