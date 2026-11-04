import {
  RUN_PAUSED_UNTIL_RESET,
  type ContractClient,
  type MonthPause,
  type RunProjection,
  type UsageBorrow
} from "@debateai/contract";
import { contractClient } from "../api.js";
import { readAskRoom, type AskRoom, type AskRoomQuery } from "../billing/room.js";
import { formatDate } from "../i18n/translate.js";
import { CLOCK_24H } from "./clock.js";

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

function personScope(scope: string | null | undefined): PersonScope | null {
  return (PERSON_SCOPES as readonly string[]).includes(scope ?? "") ? (scope as PersonScope) : null;
}

/** journey-f15: the one 24-hour clock form of every V4 page (lib/v4/clock.ts). */
export { CLOCK_24H };

/**
 * A reset as people read it (journey-f15, owner's screen review 3 Nov): the clock time for a day's reset ("08:00", never
 * "02:00 AM"), the weekday and the clock time for a week's ("Monday 09:00", public-d3), and the day for a month's
 * ("December 1": a month resets as it starts, so its lines say "on"). A month pause keeps its medium date.
 */
export function resetText(iso: string, scope: PersonScope | "MONTH_PAUSE", locale: string): string {
  return scope === "PERSON_DAY"
    ? formatDate(locale, iso, CLOCK_24H)
    : scope === "MONTH_PAUSE"
      ? formatDate(locale, iso, { dateStyle: "medium" })
      : scope === "PERSON_WEEK"
        ? formatDate(locale, iso, { weekday: "long", ...CLOCK_24H })
        : formatDate(locale, iso, { day: "numeric", month: "long" });
}

/** The values of a reset line: `{time}` for a day's or a week's reset, `{date}` for a month's (journey-f15). */
function resetValues(iso: string, scope: PersonScope, locale: string): MoneyLine["values"] {
  const text = resetText(iso, scope, locale);
  return scope === "PERSON_MONTH" ? { date: text } : { time: text };
}

/**
 * The quota window a share is of (read-f19, public-f14, map-f33). The room read may name it in an optional `share_scope`
 * (not in the contract yet; the stand-in shows it on its draft view): the window that will actually stop this person, so a
 * share reads "of this week" when the week is the limit that applies. Without it the page says what the server measures
 * today (apps/api ask-room.ts moneyRuleMembers): Free's share is of its month (its only window), every other plan's of today.
 */
export const SHARE_SCOPE_FIELD = "share_scope";
export type SharePeriod = PersonScope;

export function sharePeriodOf(room: AskRoom | null): SharePeriod {
  const named = room === null ? null : (room as AskRoom & Readonly<Record<string, unknown>>)[SHARE_SCOPE_FIELD];
  const scope = personScope(typeof named === "string" ? named : null);
  if (scope !== null) return scope;
  return room?.plan_id === "FREE" ? "PERSON_MONTH" : "PERSON_DAY";
}

/** Before a dig: "This dig uses about {percent}% of today. …" (approved), when the room read for the dig says a share. */
export function digShareLine(room: AskRoom | null): MoneyLine | null {
  const percent = room?.dig_share_percent;
  return percent === undefined || percent <= 0 ? null : Object.freeze({ key: "v4.dig.quotaShare", values: { percent } });
}

/**
 * Before a new question: its share, when the room read says one: "… of today", or of the window it is measured against
 * (read-f19, public-f14: "… of this month" on Free, "… of this week" when the server names the week).
 */
export function startShareLine(room: AskRoom | null): MoneyLine | null {
  const percent = room?.start_share_percent;
  if (percent === undefined || percent <= 0) return null;
  const period = sharePeriodOf(room);
  return Object.freeze({ key: period === "PERSON_DAY" ? "v4.room.startShare" : `v4.room.startShare.${period}`, values: { percent } });
}

/** New starts wait for the reset of a full day, week or month: the line with the reset time; null otherwise. */
export function startsWaitLine(room: AskRoom | null, locale: string): MoneyLine | null {
  if (room === null || room.new_starts !== "BLOCKED_UNTIL_RESET" || room.resets_at === null) return null;
  const scope = personScope(room.scope);
  if (scope === null) return null;
  return Object.freeze({ key: `v4.money.startsWait.${scope}`, values: resetValues(room.resets_at, scope, locale) });
}

/** A person window that holds new questions and digs until its reset. */
export type LimitWindow = Readonly<{ scope: PersonScope; at: string; free: boolean }>;

/**
 * public-f24 (owner's screen review, 3 Nov): the person window that holds new questions and digs until its reset, whichever
 * server switch is in force. Under the money rule the room read says so itself (`new_starts`); an older server answers a
 * FULL person window with its reset (and would queue the question for it). Never a team's window under the older switch
 * (its own sentences), nor a wait for the person's own running debates (no reset to name). Null while new starts can go.
 */
export function limitWindowOf(room: AskRoom | null): LimitWindow | null {
  if (room === null || room.resets_at === null) return null;
  const scope = personScope(room.scope);
  if (scope === null) return null;
  const held = room.new_starts === "BLOCKED_UNTIL_RESET"
    || (room.room === "FULL" && !("funding" in room) && room.waits_for !== "OWN_DEBATES");
  return held ? Object.freeze({ scope, at: room.resets_at, free: room.plan_id === "FREE" }) : null;
}

/**
 * public-f24: the V4 pages' one set of limit messages. A held person window reads the same V4 line under either server
 * switch ("You've used what today allows. New questions and digs can start after 08:00. …"), never the older "your
 * debate will start by itself at {time}. Or upgrade…" sentences (nothing starts by itself, journey-f15). Null when no
 * person window holds new starts: the page's other room notices (nearly full, a waiting question) stay as they are.
 */
export function limitLine(room: AskRoom | null, locale: string): MoneyLine | null {
  const held = limitWindowOf(room);
  return held === null ? null : Object.freeze({ key: `v4.money.startsWait.${held.scope}`, values: resetValues(held.at, held.scope, locale) });
}

/**
 * dig-f5: a dig's own share, from its own check with the server (the room read for that dig). The page's main read is for
 * the dig it would send now; this reads another kind (a whole path or one open question while picks wait). Null when it
 * cannot be read or names no share. It costs no AI call and no quota.
 */
export async function readDigShare(query: AskRoomQuery, client: Pick<ContractClient, "getAskRoom"> = contractClient): Promise<number | null> {
  const room = await readDigRoom(query, client);
  const percent = room?.dig_share_percent;
  return percent === undefined || percent <= 0 ? null : percent;
}

/**
 * dig-f11 / map-f9: the dig's room read again (the same question as the page's own read), after something used quota, so
 * a dig button greys as soon as new digs wait for a reset, not after a refused press. Null when it cannot be read.
 */
export function readDigRoom(query: AskRoomQuery, client: Pick<ContractClient, "getAskRoom"> = contractClient): Promise<AskRoom | null> {
  return readAskRoom(client, query);
}

/**
 * map-f9: what this question (the debate with its digs) has used of the person's window, "This question: 11% of today".
 * The run read may carry it in an optional `question_share` ({ scope, percent }; not in the contract yet, the stand-in
 * shows it on its draft view). Null when the read fails or does not say it (today's server): the page then shows nothing.
 */
export const QUESTION_SHARE_FIELD = "question_share";
export type QuestionShare = Readonly<{ scope: SharePeriod; percent: number }>;

export function questionShareOf(run: unknown): QuestionShare | null {
  if (run === null || typeof run !== "object") return null;
  const share = (run as Readonly<Record<string, unknown>>)[QUESTION_SHARE_FIELD];
  if (share === null || typeof share !== "object") return null;
  const { scope, percent } = share as Readonly<Record<string, unknown>>;
  const window = personScope(typeof scope === "string" ? scope : null);
  if (window === null || typeof percent !== "number" || !Number.isInteger(percent) || percent < 0) return null;
  return Object.freeze({ scope: window, percent });
}

export async function readQuestionShare(runId: string, client: Pick<ContractClient, "readRun"> = contractClient): Promise<QuestionShare | null> {
  try {
    return questionShareOf(await Promise.resolve().then(() => client.readRun(runId)));
  } catch {
    return null;
  }
}

/**
 * The ask page's step 1 (ask-f18, ask-d4 C): when new questions wait for a reset, the ONE line above the question box,
 * naming the window that binds — "You've used today's quota. New questions start after 08:00." (a clock time), or this
 * week's or this month's quota (Free counts by the month) "… start on 1 December." (a date). null otherwise. public-f24:
 * the same held window as every other V4 limit line, whichever server switch is in force. The box keeps the person's
 * words; holding Next and "Just answer it" until then is the step-1 buttons' own rule.
 */
export function usedUpLine(room: AskRoom | null, locale: string): MoneyLine | null {
  const held = limitWindowOf(room);
  if (held === null) return null;
  const values: MoneyLine["values"] = held.scope === "PERSON_DAY"
    ? { time: resetText(held.at, held.scope, locale) }
    : { date: formatDate(locale, held.at, { day: "numeric", month: "long" }) };
  return Object.freeze({ key: `v4.ask.usedUp.${held.scope}`, values });
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
