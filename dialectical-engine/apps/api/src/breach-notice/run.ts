/**
 * The breach notice's plan, its sending, and its log (docs/operations/breach-runbook.md part 6).
 *
 * THE PLAN is what the owner reads before anything is sent: how many accounts were chosen, per declared country; which
 * text each language gets; and how much room today's mail limit has left.
 *
 * THE LANGUAGE of an account is the rule the site already uses for mail no request of the person's started (the
 * moderation mail, migration 0157): the language of the Terms they last accepted, and English when there is none. An
 * account whose language has no text is NOT written to, unless the owner allowed English for those (`--english-fallback`).
 *
 * THE SENDING writes one mail of its own to each account, one after the other, and writes each account it reached into
 * the list of accounts written to straight away, so a second run of the same command writes only to those still owed.
 * It stops early, and says why, when today's mail limit is reached, when the room the owner asked to keep is reached,
 * when the day's count cannot be read, or when the mail program fails five times in a row (a closed mail road, such as
 * the mail plan's allow-list lock, would otherwise use up the day's limit on mail that never leaves).
 *
 * THE LOG is for the breach record's folder: counts, times, the texts' subjects and file hashes. It holds no email
 * address and no account id, so the record keeps nothing that has to be deleted on a schedule.
 */
import { MailDeliveryError, type BreachNoticeMail, type BreachNoticeMailChannel } from "../mail-channel.js";
import { comparePlaces, placeOf, type ListedAccount } from "./selection.js";
import { renderBreachNotice, type BreachNoticeText } from "./text.js";

/** What the database says of one account: its state, and the language its mail is written in. */
export type AccountFacts = Readonly<{ state: string; language: string }>;

export interface BreachNoticeAccounts {
  /** The facts of each account that exists; an id with no account is simply absent. */
  facts(userIds: readonly string[]): Promise<ReadonlyMap<string, AccountFacts>>;
  /** The account's address as it is now, or null when the account is gone. Throws when the address cannot be read. */
  address(userId: string): Promise<string | null>;
}

/** The day's shared mail count (migration 0170), read only. */
export interface BreachNoticeMailRoom {
  today(): Promise<Readonly<{ total: number; day: string }>>;
}

/** The accounts written to so far. `add` returns only once the account is safely written down. */
export interface BreachNoticeProgress {
  has(userId: string): boolean;
  add(userId: string): void;
}

export type PlanDecision = "SEND" | "SEND_ENGLISH" | "ALREADY_SENT" | "NO_TEXT" | "ACCOUNT_GONE";
export type PlannedAccount = Readonly<{ account: ListedAccount; decision: PlanDecision; language: string | null }>;
export type BreachNoticePlan = Readonly<{ accounts: readonly PlannedAccount[]; idsNotListed: number; englishFallback: boolean }>;

const ENGLISH = "en";
const willSend = (decision: PlanDecision): boolean => decision === "SEND" || decision === "SEND_ENGLISH";

export function planBreachNotice(input: Readonly<{
  chosen: readonly ListedAccount[];
  idsNotListed: number;
  facts: ReadonlyMap<string, AccountFacts>;
  texts: ReadonlyMap<string, BreachNoticeText>;
  englishFallback: boolean;
  alreadySent: Readonly<{ has(userId: string): boolean }>;
}>): BreachNoticePlan {
  const accounts = input.chosen.map((account): PlannedAccount => {
    if (input.alreadySent.has(account.userId)) return Object.freeze({ account, decision: "ALREADY_SENT", language: null });
    const facts = input.facts.get(account.userId);
    // A deleted account has no address left to write to.
    if (facts === undefined || facts.state === "deleted") return Object.freeze({ account, decision: "ACCOUNT_GONE", language: null });
    const decision: PlanDecision = input.texts.has(facts.language) ? "SEND"
      : input.englishFallback && input.texts.has(ENGLISH) ? "SEND_ENGLISH" : "NO_TEXT";
    return Object.freeze({ account, decision, language: facts.language });
  });
  return Object.freeze({ accounts: Object.freeze(accounts), idsNotListed: input.idsNotListed, englishFallback: input.englishFallback });
}

type Tally = Map<string, number>;
const bump = (tally: Tally, key: string, by = 1): void => { tally.set(key, (tally.get(key) ?? 0) + by); };
const sorted = (tally: Tally): Array<[string, number]> => [...tally].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

function columns(rows: ReadonlyArray<readonly string[]>): string[] {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows.map((row) => `  ${row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column]! + 2))).join("")}`.trimEnd());
}

/** What the owner reads before anything is sent. Counts only: no address and no account id. */
export function renderBreachNoticePlan(plan: BreachNoticePlan, facts: Readonly<{
  texts: ReadonlyMap<string, BreachNoticeText>;
  room: Readonly<{ total: number; day: string }>;
  dailyLimit: number;
  leaveRoom: number;
  confirm: boolean;
}>): string {
  const places = new Map<string, { chosen: number; toWrite: number }>();
  const languages = new Map<string, { accounts: number; decision: PlanDecision }>();
  const others: Tally = new Map();
  for (const planned of plan.accounts) {
    const place = places.get(placeOf(planned.account)) ?? { chosen: 0, toWrite: 0 };
    place.chosen += 1;
    if (willSend(planned.decision)) place.toWrite += 1;
    places.set(placeOf(planned.account), place);
    if (planned.language !== null) {
      const language = languages.get(planned.language) ?? { accounts: 0, decision: planned.decision };
      language.accounts += 1;
      languages.set(planned.language, language);
    } else {
      bump(others, planned.decision);
    }
  }
  const toWrite = plan.accounts.filter((planned) => willSend(planned.decision)).length;
  const room = Math.max(0, facts.dailyLimit - facts.room.total);
  const usable = Math.max(0, room - facts.leaveRoom);
  const textOf = (decision: PlanDecision, language: string): string =>
    decision === "SEND" ? `${language}.txt` : decision === "SEND_ENGLISH" ? "no text: en.txt is sent instead (--english-fallback)" : "no text: not sent";
  const lines = [
    "Breach notice: the plan",
    "",
    `Accounts chosen: ${String(plan.accounts.length)}`,
    ...(plan.idsNotListed > 0 ? [`Ids in your file that are not on the accounts list (never written to): ${String(plan.idsNotListed)}`] : []),
    "",
    "By declared country (the United States by state):",
    ...columns([["Country", "Chosen", "To write to"],
      ...[...places].sort(([left], [right]) => comparePlaces(left, right)).map(([place, count]) => [place, String(count.chosen), String(count.toWrite)])]),
    "",
    "By language (the language of the Terms each person last accepted; English when there is none):",
    ...(languages.size === 0 ? ["  (nobody)"] : columns([["Language", "Accounts", "Text"],
      ...[...languages].sort(([left], [right]) => (left < right ? -1 : 1)).map(([language, entry]) => [language, String(entry.accounts), textOf(entry.decision, language)])])),
    "",
    ...(others.get("ALREADY_SENT") ? [`Written to in an earlier run (left out now): ${String(others.get("ALREADY_SENT"))}`] : []),
    ...(others.get("ACCOUNT_GONE") ? [`Accounts that no longer exist (left out): ${String(others.get("ACCOUNT_GONE"))}`] : []),
    `To write to: ${String(toWrite)}`,
    "",
    "The texts:",
    ...columns([["Language", "Subject"], ...[...facts.texts].sort(([left], [right]) => (left < right ? -1 : 1)).map(([language, text]) => [language, text.subject])]),
    "",
    `Today's mail limit is ${String(facts.dailyLimit)}; ${String(facts.room.total)} were handed over so far today, so there is room for ${String(room)}.`,
    ...(facts.leaveRoom > 0 ? [`You asked to keep ${String(facts.leaveRoom)} for other mail, so this notice may use ${String(usable)}.`] : []),
    ...(toWrite > usable
      ? [`NOT ALL OF IT FITS TODAY: ${String(toWrite)} to write to, room for ${String(usable)}. The run stops when the room is used; run the same`,
        "command again after 00:00 UTC, or raise the limit first (the runbook's part 6 says how)."]
      : []),
    ...(facts.leaveRoom === 0 && toWrite > 0
      ? ["This notice may use all of today's room. When the room is used up, no other mail goes out until 00:00 UTC,",
        "password resets included. To keep some room for them, add --leave-room <number>."]
      : []),
    ...(facts.confirm ? [] : ["", "Nothing was sent. Run the same command with --confirm to send."])
  ];
  return `${lines.join("\n")}\n`;
}

export type BreachNoticeOutcome =
  | "SENT" | "SENT_ENGLISH" | "ALREADY_SENT" | "NO_TEXT" | "ACCOUNT_GONE"
  | "ADDRESS_UNREADABLE" | "ADDRESS_SUPPRESSED" | "MAIL_FAILED" | "NOT_TRIED";
export type BreachNoticeStop = "DAILY_LIMIT" | "ROOM_KEPT" | "MAIL_PROGRAM_FAILING" | "MAIL_COUNT_UNREADABLE";
export type BreachNoticeEntry = Readonly<{ account: ListedAccount; outcome: BreachNoticeOutcome; language: string | null; code?: string }>;
export type BreachNoticeResult = Readonly<{ startedAt: Date; endedAt: Date; outcomes: readonly BreachNoticeEntry[]; stopped: BreachNoticeStop | null }>;

export type BreachNoticeSendDependencies = Readonly<{
  accounts: BreachNoticeAccounts;
  mail: BreachNoticeMailChannel;
  room: BreachNoticeMailRoom;
  dailyLimit: number;
  progress: BreachNoticeProgress;
  texts: ReadonlyMap<string, BreachNoticeText>;
  clock: () => Date;
  /** A new uuid v4 for each mail. */
  messageId: () => string;
}>;

/** So many failures of the mail program in a row end the run: the road is closed, and each try is counted against the day. */
const MAIL_PROGRAM_FAILURES_IN_A_ROW = 5;

export async function sendBreachNotice(
  deps: BreachNoticeSendDependencies, plan: BreachNoticePlan, options: Readonly<{ leaveRoom: number }>
): Promise<BreachNoticeResult> {
  const startedAt = deps.clock();
  const rendered = new Map<string, ReturnType<typeof renderBreachNotice>>();
  const mailOf = (language: string): ReturnType<typeof renderBreachNotice> => {
    const known = rendered.get(language);
    if (known !== undefined) return known;
    const text = deps.texts.get(language);
    if (text === undefined) throw new TypeError("BREACH_NOTICE_TEXT_MISSING");
    const made = renderBreachNotice(text);
    rendered.set(language, made);
    return made;
  };
  const outcomes: BreachNoticeEntry[] = [];
  let stopped: BreachNoticeStop | null = null;
  let failuresInARow = 0;
  for (const planned of plan.accounts) {
    const { account, language } = planned;
    const entry = (outcome: BreachNoticeOutcome, code?: string): void => {
      outcomes.push(Object.freeze({ account, outcome, language, ...(code === undefined ? {} : { code }) }));
    };
    if (!willSend(planned.decision)) { entry(planned.decision as BreachNoticeOutcome); continue; }
    if (stopped !== null) { entry("NOT_TRIED"); continue; }
    let room: number;
    try {
      room = deps.dailyLimit - (await deps.room.today()).total;
    } catch {
      stopped = "MAIL_COUNT_UNREADABLE";
      entry("NOT_TRIED");
      continue;
    }
    if (room <= options.leaveRoom) {
      stopped = room <= 0 || options.leaveRoom === 0 ? "DAILY_LIMIT" : "ROOM_KEPT";
      entry("NOT_TRIED");
      continue;
    }
    let to: string | null;
    try {
      to = await deps.accounts.address(account.userId);
    } catch {
      entry("ADDRESS_UNREADABLE");
      continue;
    }
    if (to === null) { entry("ACCOUNT_GONE"); continue; }
    const english = planned.decision === "SEND_ENGLISH";
    const textLanguage = english ? ENGLISH : language!;
    const mail: BreachNoticeMail = { to, language: textLanguage, messageId: deps.messageId(), ...mailOf(textLanguage) };
    try {
      if (await deps.mail.sendBreachNotice(mail) === "SUPPRESSED") { entry("ADDRESS_SUPPRESSED"); continue; }
    } catch (error) {
      const code = error instanceof MailDeliveryError ? error.operatorCode : "MAIL_FAILED";
      if (code === "MAIL_DAILY_LIMIT") { stopped = "DAILY_LIMIT"; entry("NOT_TRIED"); continue; }
      if (code === "OUTBOUND_MAIL_GATE_UNAVAILABLE") { stopped = "MAIL_COUNT_UNREADABLE"; entry("NOT_TRIED"); continue; }
      entry("MAIL_FAILED", code);
      // Only the mail program's own failures say the road is closed; one address it cannot take says nothing of the next.
      if (code.startsWith("SENDMAIL_")) {
        failuresInARow += 1;
        if (failuresInARow >= MAIL_PROGRAM_FAILURES_IN_A_ROW) stopped = "MAIL_PROGRAM_FAILING";
      }
      continue;
    }
    failuresInARow = 0;
    // Written down straight after the hand-over: a run that dies here writes to this one account twice, never to nobody.
    deps.progress.add(account.userId);
    entry(english ? "SENT_ENGLISH" : "SENT");
  }
  return Object.freeze({ startedAt, endedAt: deps.clock(), outcomes: Object.freeze(outcomes), stopped });
}

const sentNow = (outcome: BreachNoticeOutcome): boolean => outcome === "SENT" || outcome === "SENT_ENGLISH";
const stamp = (at: Date): string => `${at.toISOString().slice(0, 19).replace("T", " ")} UTC`;

const STOP_TEXT: Readonly<Record<BreachNoticeStop, string>> = Object.freeze({
  DAILY_LIMIT: "today's mail limit was reached. Run the same command again after 00:00 UTC, or raise the limit first.",
  ROOM_KEPT: "the room you asked to keep for other mail was reached. Run the same command again after 00:00 UTC, or with a smaller --leave-room.",
  MAIL_PROGRAM_FAILING: "the mail program failed five times in a row. Find out why before you run it again: is mail still locked to the allow-list?",
  MAIL_COUNT_UNREADABLE: "the day's mail count could not be read from the database. Run the same command again when the database answers."
});

function reasonOf(entry: BreachNoticeEntry): string | null {
  switch (entry.outcome) {
    case "SENT":
    case "SENT_ENGLISH":
    case "ALREADY_SENT":
      return null;
    case "NO_TEXT":
      return `No text in the account's language (${entry.language ?? "?"})`;
    case "ACCOUNT_GONE":
      return "The account no longer exists";
    case "ADDRESS_UNREADABLE":
      return "The account's address could not be read";
    case "ADDRESS_SUPPRESSED":
      return "The address is on the blocked list (it bounced or complained)";
    case "MAIL_FAILED":
      return `The mail program failed (${entry.code ?? "MAIL_FAILED"})`;
    case "NOT_TRIED":
      return "Not tried: the run stopped first";
  }
}

/**
 * How many accounts a run left without the notice although they still exist. An account that is gone has nobody left to
 * write to: the log counts it under its reason, and it does not keep the job open.
 */
export function stillOwed(result: BreachNoticeResult): number {
  return result.outcomes.filter((entry) => reasonOf(entry) !== null && entry.outcome !== "ACCOUNT_GONE").length;
}

/** One run's section of the log, as Markdown. Counts, times, subjects and file hashes: no address, no account id. */
export function renderBreachNoticeLog(result: BreachNoticeResult, plan: BreachNoticePlan, info: Readonly<{
  selection: string;
  texts: ReadonlyMap<string, BreachNoticeText>;
}>): string {
  const places = new Map<string, { chosen: number; now: number; earlier: number; not: number }>();
  const languages = new Map<string, { sent: number; english: number }>();
  const reasons: Tally = new Map();
  for (const entry of result.outcomes) {
    const place = places.get(placeOf(entry.account)) ?? { chosen: 0, now: 0, earlier: 0, not: 0 };
    place.chosen += 1;
    const reason = reasonOf(entry);
    if (sentNow(entry.outcome)) {
      place.now += 1;
      const language = languages.get(entry.language ?? ENGLISH) ?? { sent: 0, english: 0 };
      language.sent += 1;
      if (entry.outcome === "SENT_ENGLISH") language.english += 1;
      languages.set(entry.language ?? ENGLISH, language);
    } else if (reason === null) {
      place.earlier += 1;
    } else {
      place.not += 1;
      bump(reasons, reason);
    }
    places.set(placeOf(entry.account), place);
  }
  const total = (pick: (place: { chosen: number; now: number; earlier: number; not: number }) => number): number =>
    [...places.values()].reduce((sum, place) => sum + pick(place), 0);
  const lines = [
    "# Breach notice: sending log",
    "",
    "This file holds counts and times only: no email address and no account id. Keep it in the breach record's folder,",
    "with the texts that were sent.",
    "",
    `- Started: ${stamp(result.startedAt)}`,
    `- Ended: ${stamp(result.endedAt)}`,
    `- Chosen with: ${info.selection}`,
    `- English for a language with no text: ${plan.englishFallback ? "allowed (--english-fallback)" : "not allowed"}`,
    `- Accounts chosen: ${String(result.outcomes.length)}`,
    ...(plan.idsNotListed > 0 ? [`- Ids in the file that are not on the accounts list (never written to): ${String(plan.idsNotListed)}`] : []),
    `- Written to in this run: ${String(total((place) => place.now))}`,
    `- Written to in an earlier run: ${String(total((place) => place.earlier))}`,
    `- Not written to: ${String(total((place) => place.not))}`,
    `- Stopped early: ${result.stopped === null ? "no." : STOP_TEXT[result.stopped]}`,
    "",
    "## By declared country (the United States by state)",
    "",
    "| Country | Chosen | Written to in this run | Written to earlier | Not written to |",
    "|---|---|---|---|---|",
    ...[...places].sort(([left], [right]) => comparePlaces(left, right))
      .map(([place, count]) => `| ${place} | ${String(count.chosen)} | ${String(count.now)} | ${String(count.earlier)} | ${String(count.not)} |`),
    "",
    "## By language, in this run",
    "",
    "| The account's language | Written to | Of these, in English because the language has no text |",
    "|---|---|---|",
    ...(languages.size === 0 ? ["| (nobody) | 0 | 0 |"] : [...languages].sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([language, count]) => `| ${language} | ${String(count.sent)} | ${String(count.english)} |`)),
    "",
    "## Not written to, by reason",
    "",
    "| Reason | Accounts |",
    "|---|---|",
    ...(reasons.size === 0 ? ["| (nobody) | 0 |"] : sorted(reasons).map(([reason, count]) => `| ${reason} | ${String(count)} |`)),
    "",
    "## The texts",
    "",
    "| Language | Subject | SHA-256 of the file |",
    "|---|---|---|",
    ...[...info.texts].sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([language, text]) => `| ${language} | ${text.subject.replaceAll("|", "\\|")} | ${text.sha256} |`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}
