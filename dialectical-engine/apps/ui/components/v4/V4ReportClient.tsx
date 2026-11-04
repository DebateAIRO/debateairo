"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Answer, AnswerStory, DigLinks, InvestigationReports, InvestigationReportVersion } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { V4ReportDigWait } from "@/components/v4/V4DigUndo";
import { V4ReportHeader, type ReportShareItem } from "@/components/v4/V4ReportHeader";
import { V4OtherPages, V4SearchNote, V4SourceList, V4WebNoteLine } from "@/components/v4/V4Sources";
import { V4TrustBar } from "@/components/v4/V4TrustBar";
import { isNotFound } from "@/lib/api";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { pathTrustWord } from "@/lib/report/pathTrust";
import { STORY_POLLING, unreadableStory } from "@/lib/v3/useAnswerStory";
import { addedLines, ownWords, startsWithLabel } from "@/lib/v4/askText";
import { digLinksFor, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import {
  loadDigView, loadInvestigation, loadStory, loadV4, reopenInvestigation, storyReadFailed, writeReport, type FinishedReportVersion
} from "@/lib/v4/load";
import { buildV4Map } from "@/lib/v4/mapModel";
import { mergeDigLinks, readDigRecords } from "@/lib/v4/accountMemory";
import { waitForDigs } from "@/lib/v4/digUndo";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import {
  basisKey, TRUST_WORDS, type DigLink, type DigView, type ReadingLevel, type TrustCounts, type TrustWord, type V4Map, type V4Path, type V4WebNote
} from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), D5: the report. A document made from the same served answer as the map — nothing is
 * invented; parts the engine has no data for yet ("Gives up:", the per-round rewrite) are left out (row D 3, 4).
 * Fix wave 1, Decision A: nothing is kept in the browser — the level comes from the address (or, N7, the account), and
 * the digs from the account (N11: its dig records, then its question list by text).
 * Perplexity plan W2-6 (2026-10-30): the report shows the web part as the map does — the debate's web note (Free, a
 * failed search, switched off) above the paths, each path's own search note, and at the expert level each point's
 * sources and each path's other pages (listed only: the report has no buttons).
 * R22 W5-1: the final report over the investigation (the debate and all its digs): "Write my report", its versions (newest
 * first, the current one marked), the chosen version under the approved sections (W0-1 §2.6) with its sources, and while the
 * newest is being written the page says so and reads it again. Once a finished version stands, "Keep digging" reopens it.
 * R22 decision 17: the current version downloads as its own plain PDF (app/v4/debate/[id]/report/pdf, made by code from the
 * stored version). The route's HEAD says whether that PDF can be made: a language the fonts cannot print yet (Arabic)
 * offers the browser's Print instead, with a plain line.
 *
 * The owner's screen review (3 Nov 2026, OWNER-PICKS-2026-11-03.md "report"; Round 2 answered A throughout):
 *  - f3: once a report exists the page IS the report; the first debate's answer waits behind a closed row at the bottom
 *    ("See the first debate's answer"). Before then a card says "Your report isn't written yet" with Write my report, and the
 *    first answer follows under "Your first answer (not your report yet)". Each version shows its own answer and its own
 *    paths. f1: a written report shows its full answer under its short answer, as the PDF does.
 *  - r2-20: a path shows its bar and ONE trust word (lib/report/pathTrust.ts), never "Held up", "Partly held", "Set aside"
 *    or "Fell"; f18: bars show shades and words, the counts only in the bar's hidden label.
 *  - f2, f6, f7, f8: the report's reads and presses say what happened, never a time nobody measured; a slow report says so
 *    after 15 minutes and keeps checking, at once when the tab or the network comes back. f9: a dig's report address moves
 *    to the first question's report. f10: a report that cannot be found says so.
 *  - f5, f11, f12: the old V3 PDF is gone from V4; the report's PDF is made from inside the page; one header row with Share.
 *  - f13, r2-13: on paper each source prints its address, the version prints its own date, and Free's web line is its
 *    short honest half. f14: AI text carries the debate's language and follows its own direction. f16: the report's space
 *    is held while it loads; after a press focus moves to the status line. f17: under a written report, how digging goes
 *    on. f19: "How sure we are" at every reading level.
 */

type Props = Readonly<{
  id: string;
  locale: string;
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
}>;

type ReportLoad =
  | Readonly<{ kind: "LOADING" }>
  | Readonly<{ kind: "ERROR" }>
  /** report-f10: no such debate, or another account's (the API answers both with a 404). */
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "NOT_READY"; failed: boolean }>
  /** readFailures: failed story reads in a row (V3's rule: the fourth one is accepted as the story's state). */
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null; readFailures: number; language: string | null }>;

/** A dig as the report lists it; `view` is undefined while it loads and null when it could not be read just now. */
type ReportDig = Readonly<{ link: DigLink; view: DigView | null | undefined }>;

/*
 * R2TIME-3 / R2TIME-7: the same rule as the map page's story poll. While the story is being written it is read again
 * on a chained timer (never two reads in flight), backing off 10 s → 20 s → 40 s → 60 s; there is no try cap while it
 * is WRITING. The page gives up only after V3's read-failure limit (failed reads in a row) or about 15 minutes in all.
 */
const STORY_POLL_FIRST_MS = 10_000;
const STORY_POLL_MAX_MS = 60_000;
const STORY_WAIT_MAX_MS = 15 * 60_000;
/** report-f8: once a report has been written for 15 minutes the page says so and keeps checking, slowly. */
const REPORT_SLOW_POLL_MS = 120_000;
/** report-f12: how long "Link copied." stays. */
const COPIED_NOTE_MS = 4_000;
/** A dig's path sits one step in per level, up to four steps (as in the PDF). */
const PATH_LEVEL_STEPS = 4;
/** Spec D5: the reading level defaults to "Some background" when none is chosen. */
const DEFAULT_LEVEL: ReadingLevel = "background";

/** report-f14: what marks AI text: the debate's language (when known) and its own writing direction. */
type AiProps = Readonly<{ "data-ai-generated": "true"; dir: "auto"; lang?: string }>;
/** A list holding AI text only follows that text's direction too, so its markers and padding sit on the reading side. */
type AiListProps = Readonly<{ dir: "auto"; lang?: string }>;

const usableTag = (tag: string | null | undefined): string | null =>
  tag === undefined || tag === null || tag.trim().length === 0 || tag === "und" ? null : tag;
function aiProps(language: string | null): AiProps {
  return language === null ? { "data-ai-generated": "true", dir: "auto" } : { "data-ai-generated": "true", dir: "auto", lang: language };
}
function aiListProps(language: string | null): AiListProps {
  return language === null ? { dir: "auto" } : { dir: "auto", lang: language };
}

/** A sign no AI text contains, so a sentence splits around its slot and only the AI's words in it are marked. */
const TEXT_SLOT = "⁣⁣";
function withAiText(sentence: string, text: string, ai: AiProps): ReactNode {
  const [before = "", after = ""] = sentence.split(TEXT_SLOT);
  return <>{before}<span {...ai}>{text}</span>{after}</>;
}

export function V4ReportClient({ id, locale, initialLevel, catalog, newDebateCatalog }: Props) {
  // AuthGate reads newDebate.* keys (checking session / sign-in redirect), so it gets that namespace.
  return (
    <AuthGate catalog={newDebateCatalog}>
      {() => <ReportBody id={id} locale={locale} initialLevel={initialLevel} catalog={catalog} />}
    </AuthGate>
  );
}

/** report-f11: the PDF's file name from the route's Content-Disposition (its UTF-8 form first), or null. */
export function pdfFileName(disposition: string | null): string | null {
  if (disposition === null) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/iu.exec(disposition);
  if (utf8 !== null) {
    try {
      return decodeURIComponent(utf8[1]!.trim());
    } catch {
      // A malformed encoded name: the plain one below.
    }
  }
  return /filename="([^"]+)"/iu.exec(disposition)?.[1] ?? null;
}

/** report-f11: fetches the PDF and saves it as a file without leaving the page; false on any failure (nothing was saved). */
async function savePdf(href: string, fallbackName: string): Promise<boolean> {
  try {
    const response = await fetch(href, { credentials: "same-origin" });
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("application/pdf")) return false;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = pdfFileName(response.headers.get("content-disposition")) ?? fallbackName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

type InvestigationState =
  | Readonly<{ kind: "LOADING" }>
  /** report-f2: the versions could not be read just now. */
  | Readonly<{ kind: "FAILED" }>
  | Readonly<{ kind: "READ"; read: InvestigationReports }>;

type Investigation = Readonly<{
  state: InvestigationState;
  /** Reads the versions again now (after a press); a read that fails keeps what the page shows and answers null. */
  reread: () => Promise<InvestigationReports | null>;
  /** report-f2's Try again: the first read again. */
  retry: () => void;
  /** report-f8's Check again while a version is being written. */
  checkNow: () => void;
  /** When the newest version's writing started as far as the page knows (ms); null while it is not being written or waits for digs. */
  writingSince: number | null;
  /** report-f8: the newest version has been written for 15 minutes or more. */
  slow: boolean;
}>;

/**
 * R22 W5-1: the investigation's report versions, read on their own. While the newest is being written it is read again on
 * the story poll's chained timer (never two reads in flight, 10 s → 20 s → 40 s → 60 s). report-f8: the page never stops
 * checking: after 15 minutes it checks every 2 minutes and says it is taking longer, and it checks at once when the tab
 * comes back or the network returns.
 */
function useInvestigation(runId: string | null): Investigation {
  const [state, setState] = useState<InvestigationState>({ kind: "LOADING" });
  const [attempt, setAttempt] = useState(0);
  const forRun = useRef(runId);
  forRun.current = runId;
  // Which versions this visit saw waiting for digs, and when it saw them stop waiting: writing started then.
  const sawWaiting = useRef(new Set<number>());
  const clearedAt = useRef(new Map<number, number>());

  const apply = useCallback((read: InvestigationReports) => {
    const newest = read.versions.at(-1);
    if (newest?.state === "WRITING") {
      if (newest.waiting_for_digs > 0) sawWaiting.current.add(newest.report_version);
      else if (sawWaiting.current.has(newest.report_version) && !clearedAt.current.has(newest.report_version)) {
        clearedAt.current.set(newest.report_version, Date.now());
      }
    }
    setState({ kind: "READ", read });
  }, []);

  useEffect(() => {
    setState({ kind: "LOADING" });
    if (runId === null) return;
    let active = true;
    Promise.resolve().then(() => loadInvestigation(runId)).then(
      (read) => {
        if (!active) return;
        if (read === null) setState({ kind: "FAILED" });
        else apply(read);
      },
      () => { if (active) setState({ kind: "FAILED" }); }
    );
    return () => { active = false; };
  }, [runId, attempt, apply]);

  const reread = useCallback(async (): Promise<InvestigationReports | null> => {
    if (runId === null) return null;
    const read = await Promise.resolve().then(() => loadInvestigation(runId)).catch(() => null);
    if (read !== null && forRun.current === runId) apply(read);
    return read;
  }, [runId, apply]);

  const read = state.kind === "READ" ? state.read : null;
  const newest = read?.versions.at(-1) ?? null;
  const writing = newest?.state === "WRITING" ? newest : null;
  const writingVersion = writing?.report_version ?? null;
  const check = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (runId === null || writingVersion === null) return;
    let active = true;
    let timer: number | undefined;
    let inFlight = false;
    let delay = STORY_POLL_FIRST_MS;
    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      window.clearTimeout(timer);
      const next = await Promise.resolve().then(() => loadInvestigation(runId)).catch(() => null);
      inFlight = false;
      if (!active) return;
      if (next !== null) apply(next);
      if (next !== null && next.versions.at(-1)?.state !== "WRITING") return;
      delay = Date.now() - startedAt >= STORY_WAIT_MAX_MS ? REPORT_SLOW_POLL_MS : Math.min(STORY_POLL_MAX_MS, delay * 2);
      timer = window.setTimeout(() => void tick(), delay);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    const onOnline = () => { void tick(); };
    check.current = () => { void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      check.current = () => undefined;
    };
  }, [runId, writingVersion, apply]);

  // While digs still run, writing has not started; once they are done (seen on this visit) it started then, else when asked.
  const writingSince = writing === null || writing.waiting_for_digs > 0
    ? null
    : clearedAt.current.get(writing.report_version) ?? Date.parse(writing.closed_at);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (writingSince === null) return;
    const left = writingSince + STORY_WAIT_MAX_MS - Date.now();
    if (left <= 0) {
      setSlow(true);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), left);
    return () => window.clearTimeout(timer);
  }, [writingSince]);

  return {
    state,
    reread,
    retry: () => setAttempt((value) => value + 1),
    checkNow: () => check.current(),
    writingSince,
    slow
  };
}

type ShareNote = "MAKING" | "PDF_FAILED" | "COPIED" | "COPY_FAILED";

function ReportBody({ id, locale, initialLevel, catalog }: Readonly<{
  id: string;
  locale: string;
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
}>) {
  // Decision A: the level lives in the address; choosing one rewrites `?level=` (useReadingLevel does that).
  const [chosenLevel, chooseLevel] = useReadingLevel(initialLevel);
  const level: ReadingLevel = chosenLevel ?? DEFAULT_LEVEL;

  // report-f9: the debate this page reads. A dig's report address moves to the first question's (the investigation's root).
  const [target, setTarget] = useState(id);
  useEffect(() => { setTarget(id); }, [id]);

  const [load, setLoad] = useState<ReportLoad>({ kind: "LOADING" });
  const [attempt, setAttempt] = useState(0);
  // B1's rule: a story still being written reads as such until the page stops waiting for it.
  const [storyGaveUp, setStoryGaveUp] = useState(false);

  useEffect(() => {
    let active = true;
    setLoad({ kind: "LOADING" });
    setStoryGaveUp(false);
    loadV4(target).then(
      (result) => {
        if (!active) return;
        if (result.kind === "SERVED") {
          setLoad({
            kind: "SERVED",
            runId: result.runId,
            answer: result.answer,
            story: result.story,
            readFailures: storyReadFailed(result.story) ? 1 : 0,
            language: usableTag(result.language) ?? usableTag(result.story?.language)
          });
        } else {
          setLoad({ kind: "NOT_READY", failed: result.run.state === "FAILED" });
        }
      },
      (failure: unknown) => { if (active) setLoad(isNotFound(failure) ? { kind: "NOT_FOUND" } : { kind: "ERROR" }); }
    );
    return () => { active = false; };
  }, [target, attempt]);

  // DATA-3: the fourth failed story read in a row ends the wait too (buildV4Map reads a failed read as "still being
  // written" until the page gives up).
  const gaveUp = storyGaveUp || (load.kind === "SERVED" && load.readFailures >= STORY_POLLING.readFailureLimit);
  const map: V4Map | null = useMemo(
    () => load.kind === "SERVED" ? buildV4Map({ runId: load.runId, answer: load.answer, story: load.story, storyGaveUp: gaveUp }) : null,
    [load, gaveUp]
  );

  // A story still being written, or a read that failed for a moment, is read again (rule above); a failed read is
  // accepted only on the fourth failure in a row (DATA-3).
  const answerId = load.kind === "SERVED" ? load.answer.answer_id : null;
  const answerVersion = load.kind === "SERVED" ? load.answer.answer_version : null;
  const storyPending = map !== null && !gaveUp && map.storyState === "WRITING";
  const retrying = storyPending && load.kind === "SERVED" && storyReadFailed(load.story);
  useEffect(() => {
    if (answerId === null || answerVersion === null || !storyPending) return;
    let active = true;
    let timer: number | undefined;
    let delay = STORY_POLL_FIRST_MS;
    let failuresInARow = 0;
    const startedAt = Date.now();
    // null: the read itself threw; it counts as a failed read, labelled as V3 labels it.
    const settle = (read: AnswerStory | null): AnswerStory => {
      const next = read ?? unreadableStory(answerId, answerVersion, "STORY_READ_FAILED");
      setLoad((current) => {
        if (current.kind !== "SERVED" || current.answer.answer_id !== answerId) return current;
        if (!storyReadFailed(next)) return { ...current, story: next, readFailures: 0 };
        const readFailures = current.readFailures + 1;
        // Until the limit the page keeps what it shows; the last failure then becomes the story's state.
        return readFailures < STORY_POLLING.readFailureLimit ? { ...current, readFailures } : { ...current, story: next, readFailures };
      });
      return next;
    };
    const tick = async (): Promise<void> => {
      let read: AnswerStory | null = null;
      try {
        read = await loadStory(answerId, undefined, answerVersion);
      } catch {
        read = null;
      }
      if (!active) return;
      const next = settle(read);
      if (storyReadFailed(next)) {
        failuresInARow += 1;
        // The failure limit ends the wait through `readFailures` (gaveUp above); nothing more to schedule.
        if (failuresInARow >= STORY_POLLING.readFailureLimit) return;
      } else {
        failuresInARow = 0;
        // Written (or finally unavailable): the effect stops here; `storyPending` turns false on the next render.
        if (next.status !== "WRITING") return;
      }
      if (Date.now() - startedAt >= STORY_WAIT_MAX_MS) {
        setStoryGaveUp(true);
        return;
      }
      delay = Math.min(STORY_POLL_MAX_MS, delay * 2);
      timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answerId, answerVersion, storyPending]);

  const runId = load.kind === "SERVED" ? load.runId : null;
  const investigation = useInvestigation(runId);
  const read = investigation.state.kind === "READ" ? investigation.state.read : null;
  // report-f9: every report address leads to the first question's report. A dig's moves there, and the address follows.
  const rootRunId = read?.root_run_id ?? null;
  const elsewhere = runId !== null && rootRunId !== null && rootRunId.toLowerCase() !== runId.toLowerCase();
  useEffect(() => {
    if (!elsewhere || rootRunId === null) return;
    window.history.replaceState(null, "", levelHref(`/v4/debate/${encodeURIComponent(rootRunId)}/report`, chosenLevel));
    setTarget(rootRunId);
  }, [elsewhere, rootRunId, chosenLevel]);

  // Decision A: digs are found again from the account's question list (lib/v4/digIndex.ts); read once — the report is a
  // snapshot. Digs are newer than their parent, so the list is paged only until this run has been seen (FIXES2,
  // R2DIG-6). A failed list read leaves the digs out quietly.
  const questionLine = load.kind === "SERVED" ? load.answer.question_line : null;
  const [index, setIndex] = useState<readonly IndexEntry[] | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    setIndex(null);
    readQuestionIndex(undefined, { untilRunId: runId }).then(
      (entries) => { if (active) setIndex(entries); },
      () => { if (active) setIndex([]); }
    );
    return () => { active = false; };
  }, [runId]);

  // N11: the dig records (read once too) decide which debates are digs of this one; the text finds only digs without a
  // record. A failed read leaves the records out (null), and the digs found by text stay.
  const [records, setRecords] = useState<DigLinks | null | undefined>(undefined);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    setRecords(undefined);
    readDigRecords(runId).then(
      (found) => { if (active) setRecords(found); },
      () => { if (active) setRecords(null); }
    );
    return () => { active = false; };
  }, [runId]);

  const digLinks: readonly DigLink[] = useMemo(
    () => runId === null || questionLine === null || index === null || records === undefined
      ? [] : mergeDigLinks(records, digLinksFor(runId, questionLine, map, index, catalog), map),
    [runId, questionLine, map, index, records, catalog]
  );

  // Each dig's follow-up is read once (by its run id), even when the links are worked out again after the story lands.
  const [views, setViews] = useState<ReadonlyMap<string, DigView | null>>(() => new Map());
  const requested = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    for (const link of digLinks) {
      if (requested.current.has(link.childRunId)) continue;
      requested.current.add(link.childRunId);
      const done = (view: DigView | null) => {
        if (alive.current) setViews((current) => new Map(current).set(link.childRunId, view));
      };
      loadDigView(link).then(done, () => done(null));
    }
  }, [digLinks]);
  const digs: readonly ReportDig[] = digLinks.map((link) => ({ link, view: views.get(link.childRunId) }));
  // report-f16: the digs are listed together once every one is read, never filling in one by one.
  const digsReady = index !== null && records !== undefined && digs.every((dig) => dig.view !== undefined);
  // report-f7: the one dig still running, by its question, for "Your report starts when your dig on … finishes."
  const running = digs.filter((dig) => dig.view?.state === "RUNNING" || dig.view?.state === "WAITING");
  const runningDig = running.length === 1 ? running[0]!.link.questions[0] ?? null : null;

  // The person's own words, not the added lines. R2TIME-8: the site's DocumentTitle names the tab (and a printed file)
  // after the h1, so the "Report:" prefix sits inside the h1 (hidden on screen) instead of a document.title write.
  const ownQuestion = map !== null ? ownWords(map.question) : null;
  const language = load.kind === "SERVED" ? load.language : null;
  const ai = aiProps(language);

  const mapHref = levelHref(`/v4/debate/${encodeURIComponent(target)}`, chosenLevel);
  const classicHref = `/debate/${encodeURIComponent(target)}`;
  const askHref = levelHref("/v4", chosenLevel);
  // Owner review 3 Nov (map-f30): a debate that did not finish has no map; the way back is to its page, which offers
  // "Ask this again".
  const failed = load.kind === "NOT_READY" && load.failed;

  // R22 decision 17: whether the current version's PDF can be made. report-f11: the choice is drawn only once the check
  // has answered; a check that fails offers it (the download then says if it cannot be made); only a clear 404 hides it.
  const current = read?.current ?? null;
  const pdfHref = runId === null ? null : `/v4/debate/${encodeURIComponent(runId)}/report/pdf`;
  const [pdfCheck, setPdfCheck] = useState<"CHECKING" | "OFFERED" | "REFUSED">("CHECKING");
  useEffect(() => {
    setPdfCheck("CHECKING");
    if (current === null || pdfHref === null) return;
    let active = true;
    Promise.resolve().then(() => fetch(pdfHref, { method: "HEAD", credentials: "same-origin" })).then(
      (response) => { if (active) setPdfCheck(response.status === 404 ? "REFUSED" : "OFFERED"); },
      () => { if (active) setPdfCheck("OFFERED"); }
    );
    return () => { active = false; };
  }, [current, pdfHref]);

  const [shareNote, setShareNote] = useState<ShareNote | null>(null);
  useEffect(() => {
    if (shareNote !== "COPIED") return;
    const timer = window.setTimeout(() => setShareNote(null), COPIED_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [shareNote]);
  const savePdfNow = async () => {
    if (pdfHref === null || current === null) return;
    setShareNote("MAKING");
    const saved = await savePdf(pdfHref, `report-version-${current}.pdf`);
    if (alive.current) setShareNote(saved ? null : "PDF_FAILED");
  };
  const copyLink = async () => {
    if (runId === null) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v4/debate/${encodeURIComponent(runId)}/report`);
      if (alive.current) setShareNote("COPIED");
    } catch {
      if (alive.current) setShareNote("COPY_FAILED");
    }
  };

  // The page is drawn once the debate and its report versions are read (report-f16: one placeholder until then).
  const ready = load.kind === "SERVED" && map !== null && ownQuestion !== null && investigation.state.kind !== "LOADING" && !elsewhere;
  const share: ReportShareItem[] = [];
  if (ready && current !== null && pdfCheck === "OFFERED") {
    share.push({ id: "pdf", label: t(catalog, "v4.investigation.downloadVersion", { n: current }), onSelect: () => void savePdfNow() });
  }
  if (ready) {
    // Until a report is written, Print is the way to keep the first answer (report-f5: the old V3 PDF is not offered).
    share.push({ id: "print", label: t(catalog, "v4.report.print"), onSelect: () => window.print() });
    share.push({ id: "copy", label: t(catalog, "v4.report.copyLink"), onSelect: () => void copyLink() });
  }
  const status = shareNote === null ? null : shareNote === "PDF_FAILED" ? (
    <span className="v4RepHdrStatusLine">
      {t(catalog, "v4.report.pdfFailed")}{" "}
      <button type="button" className="v4Link" onClick={() => void savePdfNow()}>{t(catalog, "v4.common.retry")}</button>
    </span>
  ) : (
    <span className="v4RepHdrStatusLine">
      {t(catalog, shareNote === "MAKING" ? "v4.report.pdfMaking" : shareNote === "COPIED" ? "v4.report.linkCopied" : "v4.report.copyFailed")}
    </span>
  );
  const header = (
    <V4ReportHeader
      catalog={catalog}
      backHref={load.kind === "NOT_FOUND" ? null : mapHref}
      backKey={failed ? "v4.report.backToQuestion" : "v4.report.backToMap"}
      level={level}
      onLevel={chooseLevel}
      share={share}
      status={status}
    />
  );
  // report-f12: the classic-view link sits at the page foot, small.
  const foot = (
    <p className="v4RepFoot v4RepNoPrint">
      <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
    </p>
  );

  if (load.kind !== "SERVED" || map === null || ownQuestion === null) {
    return (
      <div className="v4RepPage">
        {header}
        <div className="v4RepState">
          {load.kind === "LOADING" ? <p role="status" className="v4Muted">{t(catalog, "v4.common.loading")}</p> : null}
          {load.kind === "ERROR" ? (
            <>
              <p role="alert">{t(catalog, "v4.report.loadFailed")}</p>
              <button type="button" className="v4Btn" onClick={() => setAttempt((value) => value + 1)}>{t(catalog, "v4.common.retry")}</button>
            </>
          ) : null}
          {load.kind === "NOT_FOUND" ? (
            <>
              <p className="v4RepProse">{t(catalog, "v4.report.notFound")}</p>
              <Link className="v4Btn v4BtnPrimary" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
            </>
          ) : null}
          {load.kind === "NOT_READY" && load.failed ? (
            <>
              <p className="v4RepProse">{t(catalog, "v4.report.failed")}</p>
              {/* map-f30: back to the debate's own page, where "Ask this again" is; report-f10: Ask a new question, and the
                  classic view small under it. */}
              <Link className="v4Btn v4BtnPrimary" href={mapHref}>{t(catalog, "v4.report.backToQuestion")}</Link>
              <Link className="v4Btn" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
              <Link className="v4Link v4RepSmallLink" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
            </>
          ) : null}
          {load.kind === "NOT_READY" && !load.failed ? (
            <>
              <p className="v4RepProse">{t(catalog, "v4.report.notReady")}</p>
              <Link className="v4Btn" href={mapHref}>{t(catalog, "v4.report.backToMap")}</Link>
            </>
          ) : null}
        </div>
        {load.kind === "ERROR" || (load.kind === "NOT_READY" && !load.failed) ? foot : null}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="v4RepPage">
        {header}
        <div className="v4RepDoc">
          <div className="v4RepLoading" role="status">{t(catalog, "v4.report.loadingReport")}</div>
        </div>
      </div>
    );
  }

  const hasReport = current !== null;
  // A read that failed cannot say whether a report exists, so the first answer waits behind the same closed row.
  const firstFolded = hasReport || investigation.state.kind === "FAILED";
  const first = (
    <FirstAnswer map={map} level={level} chosenLevel={chosenLevel} locale={locale} catalog={catalog} language={language}
      digs={digs} digsReady={digsReady} storyPending={storyPending} retrying={retrying} />
  );

  return (
    <div className="v4RepPage">
      {header}
      <article className="v4RepDoc" aria-labelledby="v4-report-title">
        <p className="v4RepPrintBrand" aria-hidden="true">Dialectical Engine</p>
        <header className="v4RepTop">
          <p className="v4Eyebrow v4RepMeta">{t(catalog, "v4.report.eyebrow", { level: t(catalog, `v4.readingLevel.${level}`) })}</p>
          <h1 id="v4-report-title" className="v4RepTitle">
            <span className="v4SrOnly">{t(catalog, "v4.report.titlePrefix")} </span>
            <span {...ai}>{ownQuestion}</span>
          </h1>
        </header>

        {/* dig-d3 A, ruling F7: a dig still in its 10 seconds (pressed on the map just before) is waited for. */}
        <V4ReportDigWait runId={load.runId} catalog={catalog} />
        <ReportArea
          runId={load.runId}
          investigation={investigation}
          runningDig={runningDig}
          webNote={map.webNote}
          pdfRefused={pdfCheck === "REFUSED"}
          mapHref={mapHref}
          locale={locale}
          language={language}
          catalog={catalog}
        />

        {firstFolded ? null : (
          <section className="v4RepFirstOpen" aria-labelledby="v4-report-first">
            <h2 id="v4-report-first" className="v4RepH2">{t(catalog, "v4.report.firstAnswerNotReport")}</h2>
            {first}
          </section>
        )}

        <CheckedSection catalog={catalog} />

        {firstFolded ? (
          <details className="v4RepFirst">
            <summary className="v4RepFirstSummary">{t(catalog, "v4.investigation.firstAnswer")}</summary>
            <div className="v4RepFirstBody">{first}</div>
          </details>
        ) : null}
      </article>
      {foot}
    </div>
  );
}

/** The first debate's own answer and parts: open before any report exists, behind a closed row once one does (report-f3). */
function FirstAnswer({ map, level, chosenLevel, locale, catalog, language, digs, digsReady, storyPending, retrying }: Readonly<{
  map: V4Map;
  level: ReadingLevel;
  chosenLevel: ReadingLevel | null;
  locale: string;
  catalog: MessageCatalog;
  language: string | null;
  digs: readonly ReportDig[];
  digsReady: boolean;
  storyPending: boolean;
  retrying: boolean;
}>) {
  const ai = aiProps(language);
  const aiList = aiListProps(language);
  // report-f19: "How sure we are" at every reading level.
  const showConfidence = map.confidence !== null;
  const noShortAnswer = map.headline === null && map.summary === null;
  // DATA-2 ("always an answer"): with no written short answer, the AIs' whole composed answer stands in.
  const fallback = noShortAnswer && map.fallbackText !== null
    ? map.fallbackText.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length > 0)
    : [];
  const storyNote = retrying
    ? t(catalog, "v4.report.storyRetrying")
    : fallback.length > 0
      ? (storyPending ? t(catalog, "v4.report.fallbackWriting") : t(catalog, "v4.report.fallbackUnavailable"))
      : (storyPending ? t(catalog, "v4.report.storyWriting") : t(catalog, "v4.report.storyUnavailable"));
  const sent = addedLines(map.question).length > 0;
  return (
    <>
      {sent ? (
        <section className="v4RepSent" aria-labelledby="v4-report-sent">
          <h2 id="v4-report-sent" className="v4Eyebrow v4RepSentLabel">{t(catalog, "v4.report.sentHeading")}</h2>
          <p className="v4RepSentText" {...ai}>{map.question}</p>
        </section>
      ) : null}

      <section className="v4RepAnswer" aria-labelledby="v4-report-answer">
        <h2 id="v4-report-answer" className="v4Eyebrow v4RepAnswerLabel">{t(catalog, "v4.report.answerHeading")}</h2>
        {map.headline !== null ? <p className="v4RepHeadline" {...ai}>{map.headline}</p> : null}
        {map.summary !== null ? <p className="v4RepProse" {...ai}>{map.summary}</p> : null}
        {fallback.length > 0 ? (
          <div className="v4RepFallback">
            {fallback.map((part, at) => <p key={at} className="v4RepProse" {...ai}>{part}</p>)}
          </div>
        ) : null}
        {/* RULES-1: V3's caveat for a READY_WITH_RESERVATION story; our own words, so not marked as AI text. */}
        {map.reservation ? <p className="v4RepNote">{t(catalog, "v4.story.reservation")}</p> : null}
        {noShortAnswer ? <p className="v4RepNote" role="status">{storyNote}</p> : null}
        {showConfidence ? (
          <p className="v4RepConfidence">
            {/* The story's sentence may already open with these words; then the label is not repeated. */}
            {startsWithLabel(map.confidence ?? "", t(catalog, "v4.report.confidenceLabel"))
              ? null
              : <><b>{t(catalog, "v4.report.confidenceLabel")}</b>{" "}</>}
            <span {...ai}>{map.confidence}</span>
          </p>
        ) : null}
      </section>

      {map.why.length > 0 ? (
        <section className="v4RepSection" aria-labelledby="v4-report-why">
          <h2 id="v4-report-why" className="v4RepH2">{t(catalog, "v4.report.whyHeading")}</h2>
          <ul className="v4RepList" {...aiList}>
            {map.why.map((reason, at) => <li key={at} {...ai}>{reason}</li>)}
          </ul>
        </section>
      ) : null}

      {map.wouldChange !== null ? (
        <section className="v4RepSection" aria-labelledby="v4-report-change">
          <h2 id="v4-report-change" className="v4RepH2">{t(catalog, "v4.report.changeHeading")}</h2>
          <p className="v4RepProse" {...ai}>{map.wouldChange}</p>
        </section>
      ) : null}

      {map.objections.length > 0 ? (
        <section className="v4RepSection" aria-labelledby="v4-report-objections">
          <h2 id="v4-report-objections" className="v4RepH2">{t(catalog, "v4.report.objectionsHeading")}</h2>
          <ul className="v4RepList" {...aiList}>
            {map.objections.map((objection, at) => <li key={at} {...ai}>{objection}</li>)}
          </ul>
        </section>
      ) : null}

      {map.paths.length > 0 ? (
        <section className="v4RepSection" aria-labelledby="v4-report-paths">
          <h2 id="v4-report-paths" className="v4RepH2">{t(catalog, "v4.report.pathsHeading")}</h2>
          <ReportWebNote note={map.webNote} catalog={catalog} />
          <ol className="v4RepPaths">
            {map.paths.map((path) => (
              <ReportPath key={path.id} path={path} level={level} catalog={catalog} locale={locale} language={language}
                debateNote={map.webNote !== null && map.webNote !== undefined} />
            ))}
          </ol>
        </section>
      ) : null}

      {digs.length > 0 ? (
        <section className="v4RepSection" aria-labelledby="v4-report-digs">
          <h2 id="v4-report-digs" className="v4RepH2">{t(catalog, "v4.report.digsHeading")}</h2>
          {digsReady ? (
            <ul className="v4RepDigs">
              {digs.map((dig) => <ReportDigItem key={dig.link.childRunId} dig={dig} level={chosenLevel} catalog={catalog} language={language} />)}
            </ul>
          ) : <p className="v4RepNote" role="status">{t(catalog, "v4.common.loading")}</p>}
        </section>
      ) : null}

      {level === "expert" && map.sections.length > 0 ? (
        <section className="v4RepSection" aria-labelledby="v4-report-story">
          <h2 id="v4-report-story" className="v4RepH2">{t(catalog, "v4.report.fullStoryHeading")}</h2>
          <div className="v4RepStory">
            {map.sections.map((section, at) => (
              <div key={at} className="v4RepStoryPart">
                <h3 className="v4RepH3" {...ai}>{section.title}</h3>
                {section.paragraphs.map((paragraph, paragraphAt) => (
                  <p key={paragraphAt} className="v4RepProse" {...ai}>{paragraph}</p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** "How this was checked": what the four words mean. report-f18: no counts, in words only. */
function CheckedSection({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <section className="v4RepSection" aria-labelledby="v4-report-checked">
      <h2 id="v4-report-checked" className="v4RepH2">{t(catalog, "v4.report.checkedHeading")}</h2>
      <p className="v4RepProse">{t(catalog, "v4.report.checkedSecondAi")}</p>
      <p className="v4RepProse">{t(catalog, "v4.report.checkedWordsIntro")}</p>
      <ul className="v4RepWords">
        {TRUST_WORDS.map((word) => (
          <li key={word} className="v4RepWord">
            <b>{t(catalog, `v4.trust.${word}`)}</b>
            {/* W2-6: "Sure" now means a page this debate looked up, in the owner-approved words of its basis. */}
            <span>{t(catalog, word === "SURE" ? basisKey("WEB_CHECKED_AND_AGREED") : `v4.report.word.${word}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The debate's web note. Round 2 r2-13 (owner A): on Free the screen keeps the full approved E3b line, and paper gets only its
 * honest half, "Not checked on the web.".
 */
function ReportWebNote({ note, catalog }: Readonly<{ note: V4WebNote | null | undefined; catalog: MessageCatalog }>) {
  if (note !== "FREE") return <V4WebNoteLine note={note} catalog={catalog} className="v4RepNote" />;
  return (
    <p className="v4WebNote v4RepNote">
      <span className="v4RepScreenOnly">{t(catalog, "v4.web.free")}</span>
      <span className="v4RepPrintOnly">{t(catalog, "v4.web.freeOnPaper")}</span>
    </p>
  );
}

/** The one trust word a path shows (r2-20), above its line, in the bar's colours. */
function PathWord({ word, catalog }: Readonly<{ word: TrustWord | null; catalog: MessageCatalog }>) {
  return word === null ? null : <span className="v4RepPathWord" data-trust={word}>{t(catalog, `v4.trust.${word}`)}</span>;
}

function ReportPath({ path, level, catalog, locale, language, debateNote }: Readonly<{
  path: V4Path;
  level: ReadingLevel;
  catalog: MessageCatalog;
  locale: string;
  language: string | null;
  /** W2-6: the debate's own web note is shown above the paths, so the paths do not repeat it. */
  debateNote: boolean;
}>) {
  const ai = aiProps(language);
  return (
    <li className="v4RepPath">
      <PathWord word={pathTrustWord(path.fate, path.points.map((point) => point.trust))} catalog={catalog} />
      <p className="v4RepPathLine" {...ai}>{path.line}</p>
      <div className="v4RepBar">
        <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} size="small" />
      </div>
      {path.web !== undefined && !debateNote ? <V4SearchNote search={path.web.search} catalog={catalog} className="v4RepNote" /> : null}
      {/* report-f18: at the expert level every point is listed; one no second AI checked is shown in grey, never counted. */}
      {level === "expert" && path.points.length > 0 ? (
        <ul className="v4RepPoints">
          {path.points.map((point) => (
            <li key={point.id} className="v4RepPoint" data-trust={point.trust ?? "UNCHECKED"}>
              <span className="v4RepPointMark" aria-hidden="true" />
              <div className="v4RepPointBody">
                <span className="v4RepPointWord">{t(catalog, point.trust === null ? "v4.trust.unchecked" : `v4.trust.${point.trust}`)}</span>
                <span {...ai}>{point.text}</span>
                <V4SourceList sources={point.sources} catalog={catalog} locale={locale} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {level === "expert" && path.web !== undefined
        ? <V4OtherPages pages={path.web.otherPages} catalog={catalog} locale={locale} actions={false} headingClassName="v4RepSmallHead" />
        : null}
    </li>
  );
}

function ReportDigItem({ dig, level, catalog, language }: Readonly<{
  dig: ReportDig;
  level: ReadingLevel | null;
  catalog: MessageCatalog;
  language: string | null;
}>) {
  const view = dig.view;
  const ai = aiProps(language);
  const state = view === undefined
    ? t(catalog, "v4.common.loading")
    : view === null ? t(catalog, "v4.report.digUnknown") : t(catalog, `v4.report.digState.${view.state}`);
  return (
    <li className="v4RepDig">
      <ul className="v4RepDigQuestions" {...aiListProps(language)}>
        {dig.link.questions.map((question, at) => <li key={at} {...ai}>{question}</li>)}
      </ul>
      <p className="v4RepDigMeta">
        {/* A dig found again from the account list has no known mode: then only its state is shown. */}
        {dig.link.mode !== null ? <>{t(catalog, `v4.digMode.${dig.link.mode}`)}{" · "}</> : null}
        {state}
      </p>
      {view?.state === "DONE" && view.headline !== null ? (
        <p className="v4RepProse" {...ai}>{view.headline}</p>
      ) : null}
      {view?.state === "DONE" && view.counts !== null ? (
        <div className="v4RepBar"><V4TrustBar counts={view.counts} catalog={catalog} size="small" /></div>
      ) : null}
      {view?.state === "DONE" ? (
        <Link className="v4Link v4RepDigLink" href={levelHref(`/v4/debate/${encodeURIComponent(dig.link.childRunId)}`, level)}>
          {t(catalog, "v4.report.digOpenMap")}
        </Link>
      ) : null}
    </li>
  );
}

const finishedVersion = (version: InvestigationReportVersion | null | undefined): version is FinishedReportVersion =>
  version !== null && version !== undefined && (version.state === "READY" || version.state === "READY_WITH_RESERVATION");

/** When a version is dated in the list: when it was written (or failed). */
const versionDate = (version: Exclude<InvestigationReportVersion, { state: "WRITING" }>): string => version.written_at;

/** report-f7: a clock time ("Started 14:02"), with the day when it is not today; nothing ticks. */
function clockTime(locale: string, at: number): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString();
  // journey-f15 / f16: the one V4 clock form, a 24-hour time (lib/v4/stateWords.ts CLOCK_OPTIONS).
  return formatDate(locale, at, sameDay ? { timeStyle: "short", hourCycle: "h23" } : { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
}

type PressKind = "write" | "reopen";
/** report-f6: a press whose answer was lost: `checking` while the versions are read again. */
type PressNote = Readonly<{ kind: PressKind; checking: boolean }>;

/**
 * R22 W5-1: the report over the investigation: its versions, the one shown, and "Write my report" / "Keep digging".
 * report-f2: a read that fails says so in this place, with Try again, and keeps Write my report.
 */
function ReportArea({ runId, investigation, runningDig, webNote, pdfRefused, mapHref, locale, language, catalog }: Readonly<{
  runId: string;
  investigation: Investigation;
  runningDig: string | null;
  webNote: V4WebNote | null | undefined;
  pdfRefused: boolean;
  mapHref: string;
  locale: string;
  language: string | null;
  catalog: MessageCatalog;
}>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<PressNote | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  // report-f16: after a press, focus moves to the status line (once the page has drawn what the press led to).
  const [focusAsked, setFocusAsked] = useState(0);
  useEffect(() => {
    if (focusAsked > 0) statusRef.current?.focus();
  }, [focusAsked]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // report-f6: a press that fails may still have reached the server (its reply was lost), so the page never says nothing
  // was used: it says it could not confirm, reads the versions again at once, and offers Try again only when nothing started.
  const press = async (kind: PressKind): Promise<void> => {
    setBusy(true);
    setNote(null);
    // dig-d3 A, ruling F7: "Your report will wait for it." A dig still in its 10 seconds is not on the server yet, so the
    // report is asked for only once it has been sent (or undone).
    if (kind === "write") await waitForDigs(runId);
    if (!alive.current) return;
    const result = kind === "write" ? await writeReport(runId) : await reopenInvestigation(runId);
    if (!alive.current) return;
    if (result.kind === "FAILED") {
      setNote({ kind, checking: true });
      const next = await investigation.reread();
      if (!alive.current) return;
      const started = next !== null && (kind === "write" ? next.versions.at(-1)?.state === "WRITING" : next.state === "OPEN");
      setNote(started ? null : { kind, checking: false });
    } else {
      await investigation.reread();
      if (!alive.current) return;
    }
    // The newest version (the one just asked for) is shown next.
    setChosen(null);
    setBusy(false);
    setFocusAsked((value) => value + 1);
  };

  const noteLine = note === null ? null : (
    <div className="v4RepPressNote">
      <p className="v4RepNote" role="alert">
        {t(catalog, note.kind === "write" ? "v4.investigation.startUnconfirmed" : "v4.investigation.reopenUnconfirmed")}
      </p>
      {note.checking ? null : (
        <div className="v4RepActions">
          <button type="button" className="v4Btn" disabled={busy} onClick={() => void press(note.kind)}>{t(catalog, "v4.common.retry")}</button>
        </div>
      )}
    </div>
  );
  const writeButton = (label: string) => (
    <button type="button" className="v4Btn v4BtnPrimary v4RepWrite" disabled={busy} onClick={() => void press("write")}>{label}</button>
  );

  const { state } = investigation;
  if (state.kind !== "READ") {
    // LOADING never reaches here (the page holds its placeholder until the first read answers).
    return (
      <div className="v4RepCard v4RepNoPrint" ref={statusRef} tabIndex={-1}>
        <p className="v4RepCardTitle" role="alert">{t(catalog, "v4.investigation.loadFailed")}</p>
        {noteLine}
        <div className="v4RepActions">
          <button type="button" className="v4Btn" onClick={investigation.retry}>{t(catalog, "v4.common.retry")}</button>
          {writeButton(t(catalog, "v4.rail.writeReport"))}
        </div>
      </div>
    );
  }

  const read = state.read;
  const newest = read.versions.at(-1) ?? null;
  const current = read.current;
  // The current version is shown first; before any, the newest (being written, or failed); any other is one click away.
  const shownNumber = chosen ?? current ?? newest?.report_version ?? null;
  const shown = read.versions.find((version) => version.report_version === shownNumber) ?? null;
  // The status line: the shown version's when it is not written, else a newer version being written or failed.
  const statusVersion = shown !== null && !finishedVersion(shown) ? shown : newest !== null && !finishedVersion(newest) ? newest : null;
  // "Write my report" while the investigation is open (a debate in none too), and again after a version that failed.
  const canWrite = read.state === "OPEN" || newest?.state === "FAILED";
  const canKeepDigging = read.state === "CLOSED" && finishedVersion(newest);
  const actions = canWrite || canKeepDigging ? (
    <div className="v4RepActions v4RepNoPrint">
      {canWrite ? writeButton(t(catalog, newest?.state === "FAILED" ? "v4.investigation.writeAgain" : "v4.rail.writeReport")) : null}
      {canKeepDigging ? (
        <button type="button" className="v4Btn v4RepKeepDigging" disabled={busy} onClick={() => void press("reopen")}>
          {t(catalog, "v4.investigation.keepDigging")}
        </button>
      ) : null}
    </div>
  ) : null;

  if (read.versions.length === 0) {
    return (
      <div className="v4RepCard v4RepNoPrint" ref={statusRef} tabIndex={-1}>
        <p className="v4RepCardTitle">{t(catalog, "v4.report.notWrittenYet")}</p>
        {noteLine}
        {actions}
      </div>
    );
  }

  const versionLabel = (version: InvestigationReportVersion): string => version.state === "WRITING"
    ? t(catalog, "v4.investigation.versionWriting", { n: version.report_version })
    : t(catalog, version.report_version === current ? "v4.investigation.versionCurrent" : "v4.investigation.version", {
      n: version.report_version,
      date: formatDate(locale, versionDate(version), { dateStyle: "medium" })
    });
  return (
    <section className="v4RepSection v4RepInvestigation" aria-labelledby="v4-report-versions">
      {/* report-f13: the list is for the screen; its heading goes with it on paper. */}
      <h2 id="v4-report-versions" className="v4RepH2 v4RepNoPrint">{t(catalog, "v4.investigation.versions")}</h2>
      <ul className="v4RepVersions v4RepNoPrint">
        {[...read.versions].reverse().map((version) => (
          <li key={version.report_version}>
            <button
              type="button"
              className="v4Link v4RepVersion"
              aria-pressed={version.report_version === shownNumber}
              onClick={() => setChosen(version.report_version)}
            >
              {versionLabel(version)}
            </button>
          </li>
        ))}
      </ul>
      <div className="v4RepStatusBox v4RepNoPrint" ref={statusRef} tabIndex={-1}>
        {statusVersion !== null
          ? <VersionStatus version={statusVersion} investigation={investigation} runningDig={runningDig} locale={locale} language={language} catalog={catalog} />
          : null}
        {noteLine}
      </div>
      {shown !== null && finishedVersion(shown) ? (
        <ReportVersion version={shown} isCurrent={shown.report_version === current} webNote={webNote} locale={locale} language={language} catalog={catalog} />
      ) : null}
      {pdfRefused && current !== null
        ? <p className="v4RepNote v4RepNoPrint" role="status">{t(catalog, "v4.investigation.pdfUnavailable")}</p>
        : null}
      {actions}
      {/* report-f17: digging goes on from the map; this version stays as it is. */}
      {canKeepDigging ? (
        <div className="v4RepDigMore v4RepNoPrint">
          <p className="v4RepNote">{t(catalog, "v4.investigation.digMore", { n: read.versions.length + 1 })}</p>
          <Link className="v4Link v4RepDigMoreLink" href={mapHref}>{t(catalog, "v4.report.backToMap")}</Link>
        </div>
      ) : null}
    </section>
  );
}

/** The line for a version that is not written: waiting for a dig, being written (since when), taking longer, or failed. */
function VersionStatus({ version, investigation, runningDig, locale, language, catalog }: Readonly<{
  version: Exclude<InvestigationReportVersion, FinishedReportVersion>;
  investigation: Investigation;
  runningDig: string | null;
  locale: string;
  language: string | null;
  catalog: MessageCatalog;
}>) {
  if (version.state === "FAILED") return <p className="v4RepNote" role="status">{t(catalog, "v4.investigation.failed")}</p>;
  const waiting = version.waiting_for_digs;
  if (waiting > 0) {
    // report-f7: while a dig runs, only the line that says the report waits for it, by its question when it is the one.
    return (
      <p className="v4RepNote" role="status">
        {waiting === 1 && runningDig !== null
          ? withAiText(t(catalog, "v4.investigation.waitingDig", { dig: TEXT_SLOT }), runningDig, aiProps(language))
          : tPlural(catalog, "v4.investigation.waitingDigs", waiting, locale, { n: waiting })}
      </p>
    );
  }
  if (investigation.slow) {
    // report-f8: never "we're still writing it", which the page cannot know.
    return (
      <div className="v4RepSlow" role="status">
        <p className="v4RepNote">{t(catalog, "v4.investigation.slow")}</p>
        <div className="v4RepActions">
          <button type="button" className="v4Btn" onClick={investigation.checkNow}>{t(catalog, "v4.investigation.checkAgain")}</button>
        </div>
      </div>
    );
  }
  const since = investigation.writingSince ?? Date.parse(version.closed_at);
  return <p className="v4RepNote" role="status">{t(catalog, "v4.investigation.writingSince", { time: clockTime(locale, since) })}</p>;
}

/** The pieces a stored version's path keeps (an earlier version keeps only its line, summary, fate and level). */
type VersionPath = NonNullable<FinishedReportVersion["paths"]>[number];

function countsOf(words: readonly (TrustWord | null)[]): TrustCounts {
  const counts: Record<TrustWord, number> = { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 };
  for (const word of words) if (word !== null) counts[word] += 1;
  return counts;
}

/**
 * report-f3: a version's own paths as it was written over them, each with its one trust word (r2-20) and, when the version
 * keeps its points (the current one), its bar. A version written before R22 keeps no paths.
 */
function VersionPaths({ paths, isCurrent, language, catalog }: Readonly<{
  paths: readonly VersionPath[] | undefined;
  isCurrent: boolean;
  language: string | null;
  catalog: MessageCatalog;
}>) {
  if (paths === undefined) return isCurrent ? null : <p className="v4RepNote">{t(catalog, "v4.investigation.onlyAnswer")}</p>;
  if (paths.length === 0) return null;
  const ai = aiProps(language);
  return (
    <>
      <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.paths")}</h3>
      <ol className="v4RepPaths">
        {paths.map((path, at) => {
          const words = (path.points ?? []).map((point) => point.trust);
          const counts = countsOf(words);
          const checked = TRUST_WORDS.some((word) => counts[word] > 0);
          return (
            <li key={at} className="v4RepPath" data-level={Math.min(path.level, PATH_LEVEL_STEPS)}>
              <PathWord word={pathTrustWord(path.fate, words)} catalog={catalog} />
              <p className="v4RepPathLine" {...ai}>{path.line}</p>
              {path.summary !== null ? <p className="v4RepPathSummary" {...ai}>{path.summary}</p> : null}
              {checked ? (
                <div className="v4RepBar">
                  <V4TrustBar counts={counts} unchecked={words.filter((word) => word === null).length} catalog={catalog} size="small" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ReportVersion({ version, isCurrent, webNote, locale, language, catalog }: Readonly<{
  version: FinishedReportVersion;
  isCurrent: boolean;
  webNote: V4WebNote | null | undefined;
  locale: string;
  language: string | null;
  catalog: MessageCatalog;
}>) {
  return (
    <div className="v4RepVersionShown">
      {/* report-f13: which version this is and when it was written, on paper too (never today's date). */}
      <p className="v4RepVersionLine">
        {t(catalog, "v4.investigation.versionWritten", { n: version.report_version, date: formatDate(locale, version.written_at, { dateStyle: "long" }) })}
      </p>
      {webNote === "FREE" ? <ReportWebNote note={webNote} catalog={catalog} /> : null}
      <FinishedReportBody
        version={version}
        state={version.state}
        catalog={catalog}
        language={language}
        pathsPart={<VersionPaths paths={version.paths} isCurrent={isCurrent} language={language} catalog={catalog} />}
      />
    </div>
  );
}

/**
 * One finished report's text: the owner's page, and any version on a public page (decision 13), the same. report-f1: the
 * report's whole answer always follows its short answer, as the PDF prints it. `pathsPart` (the owner's page) sits before
 * the sources.
 */
export function FinishedReportBody({ version, state, catalog, language = null, pathsPart = null }: Readonly<{
  version: Pick<Extract<InvestigationReportVersion, { state: "READY" }>, "report_version" | "shortened" | "story" | "answer" | "sources">;
  state: "READY" | "READY_WITH_RESERVATION";
  catalog: MessageCatalog;
  /** report-f14: the debate's language, when known. */
  language?: string | null;
  pathsPart?: ReactNode;
}>) {
  const { story } = version;
  const ai = aiProps(language);
  return (
    <div className="v4RepVersionBody" data-version={version.report_version}>
      {version.shortened ? <p className="v4RepNote v4RepShortened">{t(catalog, "v4.investigation.shortened")}</p> : null}
      <div className="v4RepAnswer">
        <h3 className="v4Eyebrow v4RepAnswerLabel">{t(catalog, "v4.investigation.heading.answer")}</h3>
        {story !== null
          ? <p className="v4RepHeadline" {...ai}>{story.short_answer}</p>
          // N14 (approved): no story this time; the report's whole answer stands in.
          : <p className="v4RepNote v4RepNoStory" role="status">{t(catalog, "v4.investigation.noStory")}</p>}
        <div className="v4RepAnswerText">
          {version.answer.segments.map((segment, at) => <p key={at} className="v4RepProse" {...ai}>{segment}</p>)}
        </div>
        {state === "READY_WITH_RESERVATION" ? <p className="v4RepNote">{t(catalog, "v4.story.reservation")}</p> : null}
      </div>
      {story !== null ? (
        <>
          <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.wouldChange")}</h3>
          <p className="v4RepProse" {...ai}>{story.what_would_change}</p>
          {story.how_it_went.length > 0 ? (
            <>
              <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.howItWent")}</h3>
              {story.how_it_went.map((entry) => (
                <p key={entry.dig_run_id} className="v4RepProse" {...ai}>{entry.paragraph}</p>
              ))}
            </>
          ) : null}
          {story.still_open.length > 0 ? (
            <>
              <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.stillOpen")}</h3>
              <ul className="v4RepList" {...aiListProps(language)}>
                {story.still_open.map((open, at) => <li key={at} {...ai}>{open}</li>)}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
      {pathsPart}
      {version.sources.length > 0 ? (
        <>
          <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.sources")}</h3>
          <ul className="v4RepSources">
            {version.sources.map((source, at) => (
              <li key={at} className="v4RepSource">
                {source.link === null || source.link === undefined
                  ? <span className="v4RepSourceSite">{source.site}</span>
                  : (
                    <a className="v4RepSourceSite v4Link" href={source.link} target="_blank" rel="noopener noreferrer nofollow">
                      {source.site}
                      {/* report-f16: a screen reader hears that the page opens in a new tab. */}
                      <span className="v4SrOnly"> {t(catalog, "v4.common.newTab")}</span>
                    </a>
                  )}
                {source.title !== null ? <b className="v4RepSourceTitle">{source.title}</b> : null}
                {/* Reader 1's line about the page (owner F9) is the AI's; the quote is the page's own words. */}
                {source.line !== null ? <p className="v4RepSourceLine" {...ai}>{source.line}</p> : null}
                <blockquote className="v4RepSourceQuote" dir="auto">{source.quote}</blockquote>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
