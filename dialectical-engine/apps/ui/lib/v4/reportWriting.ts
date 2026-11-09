import type { Answer, ContractClient, InvestigationReports } from "@debateai/contract";
import { contractClient } from "../api.js";
import { t, tPlural, type MessageCatalog } from "../i18n/translate.js";
import type { DigView } from "./types.js";

/*
 * V4 screen review (owner picks 3 Nov 2026), report-d1 A and report-d2 A: the report is asked for, and waited for, on the
 * map. This is what the map knows of it, worked out from the investigation read (GET /v1/runs/{id}/investigation):
 *  - NONE: nothing is being written and the person may ask for a report ("Write my report" opens the short check);
 *  - WAITING_DIGS: the report was asked for and waits for digs still running (F7 A: "Your report starts when …");
 *  - WRITING: the report is being written;
 *  - FAILED: the newest version could not be written, and the investigation was not reopened since (Write it again);
 *  - DONE: a finished report stands and nothing reopened the investigation (the report page has it, with Keep digging);
 *  - UNKNOWN: not read yet, or the read failed (the button then leads to the report page, as before).
 * While the report waits for digs or is written, digging rests (report-d2: "Digging opens again when your report is
 * written."): the server refuses to reopen an investigation while a version is being written.
 *
 * When writing started is said only when this visit knows it, the report page's rule (Phase A review F1, V4ReportClient's
 * useInvestigation): it saw the version wait for digs and then stop waiting (it started then), the investigation has no
 * digs (it started when the version closed), or this page's own press began it (the version closed within PRESS_MATCH_MS
 * of the press). Otherwise no time is said. "Taking longer than usual" (report-f8) counts its 15 minutes from that start,
 * or else from when this visit first saw the version being written, never from the press.
 *
 * Three things the page reads that today's server does not send yet (each absent = today's behaviour; see the track's
 * server notes): the report's share of today on the investigation read (`report_share_percent`), and the answer's
 * "carry on to the report" box (`branches.carry_on_to_report`, the start-step's). The third, whether the question is
 * public, is today's visibility read (GET /v1/runs/{id}/visibility). Nothing here is kept in the browser.
 */

export type ReportStage =
  | Readonly<{ kind: "UNKNOWN" }>
  | Readonly<{ kind: "NONE" }>
  | Readonly<{ kind: "WAITING_DIGS"; version: number; waitingForDigs: number }>
  | Readonly<{ kind: "WRITING"; version: number }>
  | Readonly<{ kind: "FAILED"; version: number }>
  | Readonly<{ kind: "DONE"; version: number }>;

const UNKNOWN: ReportStage = Object.freeze({ kind: "UNKNOWN" });
const NONE: ReportStage = Object.freeze({ kind: "NONE" });

/** The map's report stage from the newest investigation read (null: not read, or the read failed). */
export function reportStageOf(read: InvestigationReports | null): ReportStage {
  if (read === null) return UNKNOWN;
  const newest = read.versions.at(-1);
  if (newest === undefined) return NONE;
  if (newest.state === "WRITING") {
    return newest.waiting_for_digs > 0
      ? { kind: "WAITING_DIGS", version: newest.report_version, waitingForDigs: newest.waiting_for_digs }
      : { kind: "WRITING", version: newest.report_version };
  }
  // A dig reopens the investigation: then the person simply asks for the next version.
  if (read.state === "OPEN") return NONE;
  return newest.state === "FAILED"
    ? { kind: "FAILED", version: newest.report_version }
    : { kind: "DONE", version: newest.report_version };
}

/**
 * The owner's answers of 5 Nov 2026, question 2 A: once a report is asked for, the map's report button reads "See my report"
 * (and leads to the report page) while the report waits for a dig, while it is written, and once it stands with nothing
 * reopened; "Write my report" comes back as soon as a dig reopens the investigation (NONE), and a version that did not
 * finish keeps "Write it again" (FAILED). UNKNOWN keeps today's "Write my report" link (the read failed).
 */
export function reportSeenFor(stage: ReportStage): boolean {
  return stage.kind === "WAITING_DIGS" || stage.kind === "WRITING" || stage.kind === "DONE";
}

/** A dig as the report's wait line looks at it: its questions, and its read (undefined or null: not read just now). */
export type WaitedDig = Readonly<{
  link: Readonly<{ questions: readonly string[] }>;
  view: Pick<DigView, "state" | "rewrite"> | null | undefined;
}>;

/** report-f7: a dig the report may still wait for: running, waiting for a spot, or done but still rewriting its path. */
export function mayBeWaitedFor(view: Pick<DigView, "state" | "rewrite">): boolean {
  return view.state === "RUNNING" || view.state === "WAITING" || (view.state === "DONE" && view.rewrite?.state === "WRITING");
}

/**
 * report-f7 (the report page's rule, shared with the map since the owner's question 23 A): the one dig the report may be
 * waiting for, by its question (AI text), when exactly one READ dig may be waited for; null otherwise. A dig not read
 * (a stand-in) is never counted, so the line never names a dig it cannot be sure of.
 */
export function waitingDigQuestionOf(digs: readonly WaitedDig[]): string | null {
  const waited = digs.filter((dig) => dig.view !== undefined && dig.view !== null && mayBeWaitedFor(dig.view));
  return waited.length === 1 ? waited[0]!.link.questions[0] ?? null : null;
}

/** A sign no AI text contains, so the wait line splits around the dig's question and only its words are marked. */
const DIG_SLOT = "⁣⁣";

/**
 * The report's wait line, the same on the map and on the report page (the owner's answers of 5 Nov, question 23 A and its
 * follow-up): when the server waits for one dig and the page knows it, "Your report starts when your dig on “…” finishes."
 * (report-f7; `before` + the dig's own words + `after`, so the page marks the words as AI text); one dig it cannot name,
 * "…when the dig in progress finishes."; several, "Your report starts when the digs in progress finish.", with no number.
 */
export type ReportWaitLine =
  | Readonly<{ kind: "NAMED"; before: string; dig: string; after: string }>
  | Readonly<{ kind: "PLAIN"; text: string }>;

export function reportWaitLineOf(waitingForDigs: number, digQuestion: string | null, catalog: MessageCatalog, locale: string): ReportWaitLine {
  if (waitingForDigs === 1 && digQuestion !== null && digQuestion.trim().length > 0) {
    const [before = "", after = ""] = t(catalog, "v4.investigation.waitingDig", { dig: DIG_SLOT }).split(DIG_SLOT);
    return { kind: "NAMED", before, dig: digQuestion, after };
  }
  return { kind: "PLAIN", text: tPlural(catalog, "v4.investigation.waitingDigs", Math.max(1, waitingForDigs), locale) };
}

/**
 * V4 start step, Task 56c (item public-f25; Task 56b's `first_closing_left`, owner answer Q20 B): whether the owner's next "Write my
 * report" would be the debate's first report (true: it goes ahead while new starts wait) or a further one (false: on a public debate
 * it waits for the reset). Null when there is no read or the read does not say it: the page then never says the report waits.
 */
export function firstReportLeftOf(read: InvestigationReports | null): boolean | null {
  return read?.first_closing_left ?? null;
}

/** "Write my report" (or "Write it again") opens the short check: nothing is being written, and no report stands. */
export function canAskForReport(stage: ReportStage): boolean {
  return stage.kind === "NONE" || stage.kind === "FAILED";
}

/** report-d2: dig buttons rest while the report waits for digs or is written. */
export function digsRestFor(stage: ReportStage): boolean {
  return stage.kind === "WAITING_DIGS" || stage.kind === "WRITING";
}

/**
 * dig-f29's report moment ("Good time to write your report") only while a report can be asked for: never while one waits
 * for digs or is written, and never while a finished one stands that nothing reopened.
 */
export function reportMomentAllowed(stage: ReportStage): boolean {
  return stage.kind !== "WAITING_DIGS" && stage.kind !== "WRITING" && stage.kind !== "DONE";
}

/**
 * A version this page's own "Write it" press began closes within this of the press (the server's clock against this
 * computer's), the report page's rule. Beyond it the page cannot tell that its press began the writing.
 */
export const PRESS_MATCH_MS = 5 * 60_000;
/** report-f8: once a version has been written this long (as far as this visit can tell), the page says it takes longer. */
export const REPORT_SLOW_MS = 15 * 60_000;

/** What this visit saw of the versions being written (kept in the page's memory only). */
export type WritingClock = {
  /** Versions this visit saw waiting for digs. */
  sawWaiting: Set<number>;
  /** Versions whose start this visit knows (ms since 1970). */
  startedAt: Map<number, number>;
  /** When this visit first saw each version being written (not waiting for digs), ms since 1970. */
  firstSeen: Map<number, number>;
  /** When this page last sent "Write it" (ms), or null. */
  pressedAt: number | null;
};

export function newWritingClock(): WritingClock {
  return { sawWaiting: new Set(), startedAt: new Map(), firstSeen: new Map(), pressedAt: null };
}

/** Takes in one investigation read: what it says about the newest version's start, by the report page's rule. */
export function noteWritingRead(clock: WritingClock, read: InvestigationReports, now: number = Date.now()): void {
  const newest = read.versions.at(-1);
  if (newest?.state !== "WRITING") return;
  const version = newest.report_version;
  if (newest.waiting_for_digs > 0) {
    clock.sawWaiting.add(version);
    return;
  }
  if (!clock.firstSeen.has(version)) clock.firstSeen.set(version, now);
  if (clock.startedAt.has(version)) return;
  const closed = Date.parse(newest.closed_at);
  // Seen waiting, now not: writing started about now. No digs: it started when the version closed. This page's press
  // began it: the version closed with that press, and no dig was waited for since (it would have read as waiting first).
  if (clock.sawWaiting.has(version)) clock.startedAt.set(version, now);
  else if (read.digs === 0 && !Number.isNaN(closed)) clock.startedAt.set(version, closed);
  else if (clock.pressedAt !== null && !Number.isNaN(closed) && Math.abs(closed - clock.pressedAt) <= PRESS_MATCH_MS) {
    clock.startedAt.set(version, closed);
  }
}

/** When the version being written started, only when this visit knows it (ms); null otherwise or when none is written. */
export function writingStartOf(clock: WritingClock, stage: ReportStage): number | null {
  return stage.kind === "WRITING" ? clock.startedAt.get(stage.version) ?? null : null;
}

/** report-f8: where the 15 minutes count from: the known start, else this visit's first sight; null while none is written. */
export function slowFromOf(clock: WritingClock, stage: ReportStage): number | null {
  if (stage.kind !== "WRITING") return null;
  return clock.startedAt.get(stage.version) ?? clock.firstSeen.get(stage.version) ?? null;
}

/** The investigation read's optional field (not in the contract yet): the report's share of today, a whole percent. */
export const REPORT_SHARE_FIELD = "report_share_percent";

/**
 * report-d1: roughly what share of today's quota writing the report uses, once the server says it (the way a dig's
 * "about 20% of today" comes from the room read). Never guessed: absent, unreadable or not a whole percent above 0 is null.
 */
export function reportSharePercentOf(read: InvestigationReports | null): number | null {
  if (read === null) return null;
  const value = (read as InvestigationReports & Readonly<Record<string, unknown>>)[REPORT_SHARE_FIELD];
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 100 ? value : null;
}

/** The start step's answer member (`Answer.branches`, not in this contract yet) and its box. */
export const CARRY_ON_FIELD = "carry_on_to_report";

/**
 * report-d1: the person ticked "Let the AIs carry on to the report without asking me" at the start step, so "Write my
 * report" asks for the report at once, with no strip. Read from the served answer's `branches` once the server sends it.
 */
export function carryOnOf(answer: Answer | null | undefined): boolean {
  const branches = (answer as (Answer & Readonly<{ branches?: unknown }>) | null | undefined)?.branches;
  return typeof branches === "object" && branches !== null
    && (branches as Readonly<Record<string, unknown>>)[CARRY_ON_FIELD] === true;
}

/**
 * report-f15: whether the question is public now (today's visibility read: PUBLISHED). A Free debate goes public once it
 * is finished and its check passed; a question the check kept private stays PRIVATE. Null when it could not be read.
 */
export async function loadRunPublished(runId: string, client: Pick<ContractClient, "readRunVisibility"> = contractClient): Promise<boolean | null> {
  try {
    const visibility = await Promise.resolve().then(() => client.readRunVisibility(runId));
    return visibility.state === "PUBLISHED";
  } catch {
    return null;
  }
}
