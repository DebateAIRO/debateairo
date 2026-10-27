"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AnswerStory, RunProjection } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4ChangesBar } from "@/components/v4/V4ChangesBar";
import { V4DigToast, type V4DigNotice } from "@/components/v4/V4DigToast";
import { V4Header } from "@/components/v4/V4Header";
import { digFor, openCount, resolveSelection, selectionIdOf, V4MapTree } from "@/components/v4/V4MapTree";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { isNotFound } from "@/lib/api";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { digQuestion, digTargetQuestions, ownWords } from "@/lib/v4/askText";
import { diffSnapshots, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import { digLinksFor, digParentOf, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import { loadDigView, loadStory, loadV4, storyReadFailed, type V4Load } from "@/lib/v4/load";
import { buildV4Map, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import type {
  DigLink,
  DigMode,
  DigTarget,
  DigView,
  PendingDig,
  ReadingLevel,
  V4Change,
  V4Map,
  V4OpenQuestion,
  V4Selection
} from "@/lib/v4/types";
import { useV4Ask, type V4AskOutcome } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (2026-10-28), the map page shell (D3 map, D4 what changed, D6/D7 phone). It loads the debate over
 * today's V3 reads, waits calmly while it runs, then lays out rail | map | panel and owns the dig flow (row D
 * decision 1: a dig starts at once with a 10-second Undo, nothing is sent before then). Every polling loop keeps one
 * request in flight at a time and stops when the page goes. Fix wave 1, Decision A: nothing is kept in the browser's
 * storage; digs are found again from the account's question list, and "what changed" is "while you were here".
 */

const RUN_POLL_MS = 5_000;
const RUN_POLL_AFTER_ERROR_MS = 30_000;
const STORY_POLL_MS = 10_000;
const STORY_POLL_TRIES = 30;
/** DATA-3: a story read that failed is accepted only after this many failures in a row (V3's readFailureLimit). */
const STORY_READ_FAILURE_LIMIT = 4;
const DIG_POLL_MS = 15_000;
/** TIME-8/FIT-3: a dig read as done before its story was written is asked again, at most this many times. */
const DIG_HEADLESS_TRIES = 30;
/** TIME-1: a dig whose reads keep failing stops holding back "what changed" after this many failures. */
const DIG_FIRST_READ_FAILURES = 3;
/** Decision A: the account's question list is read again this often while a dig is going, and when all are final. */
const INDEX_POLL_BUSY_MS = 20_000;
const INDEX_POLL_IDLE_MS = 60_000;
const UNDO_MS = 10_000;
const CLOCK_TICK_MS = 15_000;
/** The reading level a page uses when the address names none (Decision A). */
const DEFAULT_LEVEL: ReadingLevel = "background";
/** Spec: desktop ≥ 1100 px, 768–1099 px a top strip, < 768 px the phone layout. */
const PHONE_QUERY = "(max-width: 767px)";
const MID_QUERY = "(max-width: 1099px)";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

type Layout = "desktop" | "mid" | "phone";
type LoadProblem = "NOT_FOUND" | "UNREACHABLE";

/** What the page last read of one dig, and how its reads went. */
type DigStatus = Readonly<{
  view: Pick<DigView, "state" | "headline" | "counts"> | null;
  /** Failed reads in a row. */
  failures: number;
  /** Reads that found it done but without its story headline yet. */
  headlessTries: number;
}>;

const NO_STATUS: DigStatus = { view: null, failures: 0, headlessTries: 0 };
/** RULES-4/TIME-1: a dig not read yet shows as working, never as "waiting for a free spot" and never vanishes. */
const STAND_IN: NonNullable<DigStatus["view"]> = { state: "RUNNING", headline: null, counts: null };

/**
 * Decision A: the digs started in this tab, in memory only (gone on reload). Module-level so they survive moving
 * between V4 pages without a reload: the dig's own page then knows when it started and where it came from.
 */
type VisitDig = Readonly<{ link: DigLink; parentQuestion: string }>;
const startedThisVisit = new Map<string, VisitDig>();

export type V4DebateClientProps = Readonly<{
  id: string;
  /** The reading level the address names (`?level=`), or null. */
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
}>;

/** Every V3 read is asker-scoped, so the page waits for a session first (the classic page does the same). */
export function V4DebateClient(props: V4DebateClientProps) {
  return (
    <AuthGate catalog={props.newDebateCatalog}>
      {() => (
        // Keyed by id: moving between two debates (a dig's back link) starts fresh, never with the last one's state.
        <V4Debate key={props.id} {...props} />
      )}
    </AuthGate>
  );
}

/** Desktop on the server render and the first paint; the real width is read once mounted. */
function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("desktop");
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const mid = window.matchMedia(MID_QUERY);
    const update = (): void => setLayout(phone.matches ? "phone" : mid.matches ? "mid" : "desktop");
    update();
    phone.addEventListener("change", update);
    mid.addEventListener("change", update);
    return () => {
      phone.removeEventListener("change", update);
      mid.removeEventListener("change", update);
    };
  }, []);
  return layout;
}

/** "HH:MM" in the page's language, or null when the time cannot be read. */
function clockTime(iso: string | null | undefined, locale: string): string | null {
  if (typeof iso !== "string") return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(when);
  }
}

function isRunning(dig: DigView): boolean {
  return dig.state === "WAITING" || dig.state === "RUNNING";
}

/** No more reads needed: it failed, or it is done with its headline (or we stopped waiting for the headline). */
function isFinal(status: DigStatus | undefined): boolean {
  const view = status?.view ?? null;
  if (view === null) return false;
  if (view.state === "FAILED") return true;
  return view.state === "DONE" && (view.headline !== null || (status?.headlessTries ?? 0) >= DIG_HEADLESS_TRIES);
}

/** Read once, or given up on for now (TIME-1): only then may "what changed" take its baseline. */
function isSettled(status: DigStatus | undefined): boolean {
  return status !== undefined && (status.view !== null || status.failures >= DIG_FIRST_READ_FAILURES);
}

function linkKeyOf(links: readonly DigLink[]): string {
  return links.map((link) => link.childRunId).join("|");
}

/** A dig of a whole path is linked by the path ("path:<id>"), as the map pieces place it (V4MapTree digHome). */
function linkedIdsOf(target: DigTarget): readonly string[] {
  return target.kind === "path" ? [`path:${target.path.id}`] : target.questions.map((question) => question.id);
}

/**
 * What the phone's pinned "Dig deeper here" digs into: a path or one open question (never the root or a dig).
 * RULES-5: an open question that already has a dig offers none.
 */
function targetOf(map: V4Map, digs: readonly DigView[], selection: V4Selection): DigTarget | null {
  if (selection.startsWith("path:")) {
    const path = map.paths.find((candidate) => `path:${candidate.id}` === selection);
    return path === undefined ? null : { kind: "path", path };
  }
  if (selection.startsWith("open:")) {
    const question = uniqueOpenQuestions(map).find((candidate) => `open:${candidate.id}` === selection);
    return question === undefined || digFor(question, digs) !== null ? null : { kind: "open", questions: [question] };
  }
  return null;
}

/**
 * "While you were here" (fix wave 1): which live changes are news. A dig this tab started is not news when it appears
 * (the person just started it), nor is it while it is still going; it is news when it finishes or fails, and a dig that
 * appears from elsewhere (another tab) is news. An open question turning "dug" is told by its dig, not twice.
 */
function isNews(change: V4Change, startedHere: ReadonlySet<string>): boolean {
  if (change.id.startsWith("dig:")) {
    if (change.kind === "ADDED") return !startedHere.has(change.id.slice("dig:".length));
    return change.now === "DONE" || change.now === "FAILED";
  }
  if (change.id.startsWith("open:")) return change.kind === "ADDED";
  return true;
}

function V4Debate({
  id,
  initialLevel,
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint
}: V4DebateClientProps) {
  const layout = useLayout();
  const [chosenLevel, chooseLevel] = useReadingLevel(initialLevel);
  const readingLevel: ReadingLevel = chosenLevel ?? DEFAULT_LEVEL;
  const [digMode, setDigMode] = useState<DigMode>("quick");
  const ask = useV4Ask({ catalog, homeCatalog, newDebateCatalog, locale, crisisCountryHint, mode: digMode, readingLevel });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── The debate: poll the run until it is served or failed ─────────────────────────────────────────────────────────
  const [load, setLoad] = useState<V4Load | null>(null);
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const next = await loadV4(id);
        if (!active) return;
        setLoad(next);
        setLoadProblem(null);
        if (next.kind === "RUN" && next.run.state !== "FAILED") timer = window.setTimeout(() => void tick(), RUN_POLL_MS);
      } catch (failure) {
        if (!active) return;
        if (isNotFound(failure)) {
          setLoadProblem("NOT_FOUND");
          return;
        }
        // Spec: back off to 30 s after an error; the page keeps what it last showed.
        setLoadProblem("UNREACHABLE");
        timer = window.setTimeout(() => void tick(), RUN_POLL_AFTER_ERROR_MS);
      }
    };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, loadAttempt]);

  const served = load?.kind === "SERVED" ? load : null;
  const runId = load?.runId ?? id;
  const answerId = served?.answer.answer_id ?? null;
  const answerVersion = served?.answer.answer_version ?? 1;
  /** The whole text that was sent for this debate (the person's words plus any added lines). */
  const questionLine = served !== null ? served.answer.question_line : load?.kind === "RUN" ? load.run.question_line : null;

  // ── The story: while it is missing, being written or its read failed, ask again every 10 s (at most 30 times) ────
  const [polledStory, setPolledStory] = useState<Readonly<{ answerId: string; story: AnswerStory | null }> | null>(null);
  const [storyGaveUp, setStoryGaveUp] = useState(false);
  const story = polledStory !== null && polledStory.answerId === answerId ? polledStory.story : served?.story ?? null;
  const storyFailedRead = story !== null && storyReadFailed(story);
  const storyPending = served !== null && !storyGaveUp && (story === null || story.status === "WRITING" || storyFailedRead);
  const storyFailedReadRef = useRef(storyFailedRead);
  useEffect(() => {
    storyFailedReadRef.current = storyFailedRead;
  });
  useEffect(() => {
    if (answerId === null || !storyPending) return;
    let active = true;
    let timer: number | undefined;
    let tries = 0;
    // The read the page already holds counts: a failed one is the first of the four in a row (DATA-3).
    let failuresInARow = storyFailedReadRef.current ? 1 : 0;
    const tick = async (): Promise<void> => {
      tries += 1;
      let next: AnswerStory | null = null;
      let failed = false;
      try {
        next = await loadStory(answerId, undefined, answerVersion);
      } catch {
        failed = true;
      }
      if (!active) return;
      if (!failed) setPolledStory({ answerId, story: next });
      const readFailed = failed || (next !== null && storyReadFailed(next));
      failuresInARow = readFailed ? failuresInARow + 1 : 0;
      if (!readFailed && next !== null && next.status !== "WRITING") return;
      if (failuresInARow >= STORY_READ_FAILURE_LIMIT || tries >= STORY_POLL_TRIES) {
        setStoryGaveUp(true);
        return;
      }
      timer = window.setTimeout(() => void tick(), STORY_POLL_MS);
    };
    timer = window.setTimeout(() => void tick(), STORY_POLL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answerId, answerVersion, storyPending]);

  // TIME-6/FIT-5: once the page stops waiting, the map says the summary is unavailable, not "still being written".
  const map = useMemo<V4Map | null>(
    () => (served === null ? null : buildV4Map({ runId: served.runId, answer: served.answer, story, storyGaveUp })),
    [served, story, storyGaveUp]
  );
  const servedRunId = served?.runId ?? null;
  const servedQuestionLine = served?.answer.question_line ?? null;

  // ── The account's question list (Decision A): digs and the back link are found again in it, by text ───────────
  const [index, setIndex] = useState<readonly IndexEntry[]>([]);
  const [indexSettled, setIndexSettled] = useState(false);
  const digsLiveRef = useRef(false);
  const hasLoad = load !== null;
  useEffect(() => {
    if (!hasLoad) return;
    let active = true;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const entries = await readQuestionIndex();
        if (!active) return;
        setIndex(entries);
      } catch {
        if (!active) return;
        // Quiet: the digs started in this visit still show; the list is asked again later.
      }
      setIndexSettled(true);
      timer = window.setTimeout(() => void tick(), digsLiveRef.current ? INDEX_POLL_BUSY_MS : INDEX_POLL_IDLE_MS);
    };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [hasLoad]);

  // ── Digs: the ones started in this visit (memory) merged with the ones found in the account's list ─────────────
  const [visitLinks, setVisitLinks] = useState<readonly DigLink[]>(() => [...startedThisVisit.values()].map((entry) => entry.link));
  const links = useMemo<readonly DigLink[]>(() => {
    if (map === null || servedRunId === null || servedQuestionLine === null) return [];
    const mine = visitLinks.filter((link) => link.parentRunId === servedRunId);
    const mineById = new Map(mine.map((link) => [link.childRunId, link]));
    // Oldest first (the order they were started). A dig started here keeps its exact link (mode, start time).
    const found = digLinksFor(servedRunId, servedQuestionLine, map, index, catalog);
    const foundIds = new Set(found.map((link) => link.childRunId));
    return [
      ...found.map((link) => mineById.get(link.childRunId) ?? link),
      ...mine.filter((link) => !foundIds.has(link.childRunId))
    ];
  }, [map, servedRunId, servedQuestionLine, visitLinks, index, catalog]);
  const linkKey = linkKeyOf(links);

  const [statuses, setStatuses] = useState<ReadonlyMap<string, DigStatus>>(() => new Map());
  const statusesRef = useRef(statuses);
  const linksRef = useRef(links);
  useEffect(() => {
    linksRef.current = links;
  });
  const digs = useMemo<readonly DigView[]>(
    () => links.map((link) => {
      const view = statuses.get(link.childRunId)?.view ?? STAND_IN;
      return { link, state: view.state, headline: view.headline, counts: view.counts };
    }),
    [links, statuses]
  );
  useEffect(() => {
    digsLiveRef.current = links.some((link) => !isFinal(statuses.get(link.childRunId)));
  }, [links, statuses]);

  // One loop per debate, one round of reads in flight; a new link "kicks" it instead of starting a second loop.
  const digLoop = useRef<Readonly<{ kick: () => void; seenKey: () => string }> | null>(null);
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    let busy = false;
    let again = false;
    let timer: number | undefined;
    let seenKey = "";
    const tick = async (): Promise<void> => {
      window.clearTimeout(timer);
      timer = undefined;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      const current = linksRef.current;
      seenKey = linkKeyOf(current);
      const due = current.filter((link) => !isFinal(statusesRef.current.get(link.childRunId)));
      const results = await Promise.all(due.map(async (link) => {
        try {
          return { childRunId: link.childRunId, view: await loadDigView(link) };
        } catch {
          return { childRunId: link.childRunId, view: null };
        }
      }));
      busy = false;
      if (!active) return;
      const next = new Map(statusesRef.current);
      for (const result of results) {
        const before = next.get(result.childRunId) ?? NO_STATUS;
        if (result.view === null) {
          // TIME-1: a failed read keeps what was shown (or the stand-in), never drops the dig.
          next.set(result.childRunId, { ...before, failures: before.failures + 1 });
          continue;
        }
        const { state, headline, counts } = result.view;
        const headless = state === "DONE" && headline === null;
        next.set(result.childRunId, {
          view: { state, headline, counts },
          failures: 0,
          headlessTries: headless ? before.headlessTries + 1 : before.headlessTries
        });
      }
      statusesRef.current = next;
      setStatuses(next);
      if (again) {
        again = false;
        void tick();
        return;
      }
      if (linksRef.current.some((link) => !isFinal(next.get(link.childRunId)))) {
        timer = window.setTimeout(() => void tick(), DIG_POLL_MS);
      }
    };
    digLoop.current = { kick: () => void tick(), seenKey: () => seenKey };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
      digLoop.current = null;
    };
  }, [servedRunId]);
  useEffect(() => {
    const loop = digLoop.current;
    if (loop !== null && loop.seenKey() !== linkKey) loop.kick();
  }, [linkKey]);

  // ── Selection ───────────────────────────────────────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<V4Selection>("root");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(["root"]));
  const [focusRequest, setFocusRequest] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const panelColRef = useRef<HTMLElement | null>(null);
  const shownSelection: V4Selection = map === null ? "root" : selectionIdOf(resolveSelection(map, digs, selected));
  const sheetOpen = layout === "phone" && outlineOpen;

  const select = useCallback((selection: V4Selection, viaKeyboard: boolean): void => {
    setSelected(selection);
    setOpened((previous) => (previous.has(selection) ? previous : new Set([...previous, selection])));
    // Phone: tapping a row of the outline opens it in the panel, so the sheet closes.
    if (layout === "phone" && outlineOpen) setOutlineOpen(false);
    // UI-5: on the phone the new question always opens at its heading (focus scrolls it into view).
    if (viaKeyboard || layout === "phone") setFocusRequest((count) => count + 1);
  }, [layout, outlineOpen]);

  useEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

  // UI-5: the side panel scrolls on its own; a new question starts at its top, not where the last one was left.
  useEffect(() => {
    if (panelColRef.current !== null) panelColRef.current.scrollTop = 0;
  }, [shownSelection]);

  // ── Picks for the tray (row D decision 1: a tray only when several are picked) ────────────────────────────────
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const togglePick = useCallback((openQuestionId: string): void => {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(openQuestionId)) next.delete(openQuestionId);
      else next.add(openQuestionId);
      return next;
    });
  }, []);
  // FIT-1: a point still argued under two paths is one pick, sent once.
  const pickedQuestions = useMemo<readonly V4OpenQuestion[]>(
    () => (map === null ? [] : uniqueOpenQuestions(map).filter((question) => picked.has(question.id))),
    [map, picked]
  );
  const hasTray = pickedQuestions.length >= 2;

  // ── The dig flow ────────────────────────────────────────────────────────────────────────────────────────────────
  const [pending, setPending] = useState<PendingDig | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<V4DigNotice | null>(null);
  const digBusy = pending !== null || sending || ask.submitting;

  const startDig = useCallback((target: DigTarget): void => {
    if (digBusy || map === null) return;
    setNotice(null);
    setPending({ target, mode: digMode, sendsAt: Date.now() + UNDO_MS });
  }, [digBusy, map, digMode]);

  const undoDig = useCallback((): void => setPending(null), []);

  const send = async (dig: PendingDig, parentRunId: string, parentQuestionLine: string): Promise<void> => {
    setPending(null);
    setSending(true);
    let outcome: V4AskOutcome;
    try {
      // ASK-4: a dig carries AI-written text, so it is sent as a dig (no client crisis pop-up on AI words).
      outcome = await ask.submit(digQuestion(dig.target, parentQuestionLine, catalog, locale), dig.mode, "dig");
    } catch {
      outcome = { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
    }
    if (outcome.kind === "STARTED") {
      const link: DigLink = {
        parentRunId,
        childRunId: outcome.runId,
        openQuestionIds: linkedIdsOf(dig.target),
        questions: digTargetQuestions(dig.target),
        mode: dig.mode,
        startedAt: new Date().toISOString()
      };
      // Kept for this visit even when the page has gone meanwhile (Decision A: memory only).
      startedThisVisit.set(link.childRunId, { link, parentQuestion: ownWords(parentQuestionLine) });
      if (!mounted.current) return;
      // Shown at once (as working); the dig loop reads its real state straight away.
      setVisitLinks((previous) => [...previous.filter((known) => known.childRunId !== link.childRunId), link]);
      if (dig.target.kind === "open") {
        const sent = new Set(link.openQuestionIds);
        setPicked((previous) => new Set([...previous].filter((idOf) => !sent.has(idOf))));
      }
      const selection: V4Selection = `dig:${link.childRunId}`;
      setSelected(selection);
      setOpened((previous) => new Set([...previous, selection]));
      setNotice({ kind: "STARTED" });
    } else if (outcome.kind === "REFUSED") {
      if (!mounted.current) return;
      setNotice({ kind: "REFUSED", message: outcome.message });
    }
    if (mounted.current) setSending(false);
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // Nothing is sent before `sendsAt`. Undo (pending → null) and leaving the page both clear the timer.
  useEffect(() => {
    if (pending === null || servedRunId === null || servedQuestionLine === null) return;
    const timer = window.setTimeout(
      () => void sendRef.current(pending, servedRunId, servedQuestionLine),
      Math.max(0, pending.sendsAt - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [pending, servedRunId, servedQuestionLine]);

  // ── What changed while you were here (D4, fix wave 1) ─────────────────────────────────────────────────────────
  // The first complete load (map + every dig read once + the question list read once) is the baseline; later live
  // changes are news, each with a dot and a tour stop. Nothing is written anywhere (Decision A).
  const [news, setNews] = useState<readonly V4Change[]>([]);
  const [hiddenStops, setHiddenStops] = useState(0);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const baseline = useRef<Readonly<Record<string, string>> | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  });
  const digsSettled = indexSettled && links.every((link) => isSettled(statuses.get(link.childRunId)));
  const liveReady = map !== null && digsSettled;
  useEffect(() => {
    if (!liveReady || map === null) return;
    const items = snapshotItems(map, digs);
    const before = baseline.current;
    baseline.current = items;
    if (before === null) return;
    const startedHere = new Set(visitLinks.map((link) => link.childRunId));
    const fresh = diffSnapshots({ at: "", items: before }, items).filter((change) => isNews(change, startedHere));
    if (fresh.length === 0) return;
    setNews((previous) => [...previous, ...fresh]);
    // A question opened earlier gets its "New" dot back when news lands on it (not the one on screen now).
    const landed = new Set<string>(fresh.map((change) => selectionForChange(map, change)));
    setOpened((previous) => new Set([...previous].filter((stop) => !landed.has(stop) || stop === selectedRef.current)));
  }, [liveReady, map, digs, visitLinks]);

  // RULES-11/FIT-7: the bar counts stops (questions), the same unit the tour numbers; news on the question itself is
  // one stop too, so every change can be reached.
  const tourStops = useMemo<readonly V4Selection[]>(() => {
    if (map === null) return [];
    const stops: V4Selection[] = [];
    for (const change of news) {
      const stop = selectionForChange(map, change);
      if (!stops.includes(stop)) stops.push(stop);
    }
    return stops;
  }, [map, news]);
  const changed = useMemo<ReadonlySet<string>>(
    () => new Set(tourStops.filter((stop) => stop !== "root" && !opened.has(stop))),
    [tourStops, opened]
  );

  const onTour = useCallback((): void => {
    if (tourStops.length === 0) return;
    const next = tourIndex === null ? 0 : tourIndex + 1;
    if (next >= tourStops.length) {
      setTourIndex(null);
      select("root", false);
      return;
    }
    setTourIndex(next);
    select(tourStops[next]!, false);
  }, [tourStops, tourIndex, select]);

  // ── The back link of a dig, and when it started (known only for a dig started in this visit) ────────────────
  const visitEntry = startedThisVisit.get(runId) ?? null;
  const parent = useMemo<Readonly<{ runId: string; question: string }> | null>(() => {
    if (visitEntry !== null) return { runId: visitEntry.link.parentRunId, question: visitEntry.parentQuestion };
    if (questionLine === null) return null;
    const entry = digParentOf(questionLine, index, catalog);
    return entry === null || entry.runId === runId ? null : { runId: entry.runId, question: ownWords(entry.questionLine) };
  }, [visitEntry, questionLine, index, catalog, runId]);
  const startedAt = visitEntry?.link.startedAt ?? null;

  // A slow clock for "started N minutes ago" while the debate runs (only when the start time is known).
  const [now, setNow] = useState<number | null>(null);
  const waiting = load?.kind === "RUN" && load.run.state !== "FAILED" && startedAt !== null;
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, readingLevel);
  const askHref = levelHref("/v4", readingLevel);
  const header = (
    <V4Header catalog={catalog} readingLevel={readingLevel} onReadingLevel={chooseLevel} classicHref={classicHref}>
      {served !== null ? (
        <Link className="v4Btn v4BtnPrimary v4DebReportLink" href={reportHref}>{t(catalog, "v4.debate.report")}</Link>
      ) : null}
    </V4Header>
  );

  if (map === null) {
    return (
      <div className="v4DebPage">
        {header}
        {/* UI-4: the layout already holds the page's one <main>. */}
        <div className="v4DebCentre">
          {load === null || load.kind !== "RUN" ? (
            <StatusScreen
              problem={loadProblem}
              onRetry={() => {
                setLoadProblem(null);
                setLoadAttempt((count) => count + 1);
              }}
              askHref={askHref}
              catalog={catalog}
            />
          ) : load.run.state === "FAILED" ? (
            <FailedScreen run={load.run} classicHref={classicHref} askHref={askHref} catalog={catalog} homeCatalog={homeCatalog} />
          ) : (
            <ProgressScreen
              run={load.run}
              startedAt={startedAt}
              now={now}
              reconnecting={loadProblem === "UNREACHABLE"}
              classicHref={classicHref}
              catalog={catalog}
              locale={locale}
            />
          )}
        </div>
      </div>
    );
  }

  const dugCounts: V4DigCounts = {
    running: digs.filter(isRunning).length,
    done: digs.filter((dig) => dig.state === "DONE").length,
    failed: digs.filter((dig) => dig.state === "FAILED").length
  };
  const openLeft = openCount(map, digs);
  const room = ask.room;
  const roomNotice = room !== null && (room.room === "CLOSE" || room.room === "FULL" || room.room === "ALREADY_WAITING")
    ? <RoomNotice room={room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
    : null;
  const phoneTarget = layout === "phone" ? targetOf(map, digs, shownSelection) : null;
  const showChanges = tourStops.length > hiddenStops;

  const rail = (variant: "column" | "strip") => (
    <V4Rail
      runId={runId}
      level={readingLevel}
      openLeft={openLeft}
      digs={dugCounts}
      variant={variant}
      catalog={catalog}
      locale={locale}
    />
  );
  const pieces = {
    map,
    digs,
    selected: shownSelection,
    changed,
    picked,
    onSelect: select,
    onTogglePick: togglePick,
    catalog
  } as const;

  const tray = hasTray ? (
    <section className="v4DebTray" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <p className="v4DebTrayText">
        <strong>{tPlural(catalog, "v4.dig.trayPicked", pickedQuestions.length, locale)}</strong>
        {" · "}
        {t(catalog, `v4.digMode.${digMode}`)}
      </p>
      <div className="v4DebTrayActions">
        <button
          type="button"
          className="v4Btn v4BtnPrimary"
          disabled={digBusy}
          onClick={() => startDig({ kind: "open", questions: pickedQuestions })}
        >
          {tPlural(catalog, "v4.dig.trayDig", pickedQuestions.length, locale)}
        </button>
        <button type="button" className="v4Link v4DebTrayClear" onClick={() => setPicked(new Set())}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  ) : null;

  const toast = (
    <V4DigToast
      pending={pending}
      onUndo={undoDig}
      notice={notice}
      onCloseNotice={() => setNotice(null)}
      lifted={layout === "phone" || hasTray}
      catalog={catalog}
      locale={locale}
    />
  );

  const pageClass = `v4DebPage v4DebLayout-${layout}${hasTray ? " v4DebHasTray" : ""}${sheetOpen ? " v4DebSheetOpen" : ""}`;
  return (
    <div className={pageClass}>
      {/* UI-6: while the phone map is open, everything behind it is inert (the sheet is a real modal). */}
      <div className="v4DebBehind" inert={sheetOpen}>
        {header}
        {layout === "mid" ? rail("strip") : null}
        <div className="v4DebMain">
          {/* The tab title follows this heading (DocumentTitle): the person's own words, not the added lines. */}
          <h1 className="v4SrOnly" data-ai-generated="true">{ownWords(map.question)}</h1>
          {parent !== null ? (
            <Link className="v4DebBack" href={levelHref(`/v4/debate/${encodeURIComponent(parent.runId)}`, readingLevel)}>
              <span aria-hidden="true">‹</span>{" "}
              {t(catalog, "v4.debate.backTo")}{" "}
              <span className="v4DebBackQuestion" data-ai-generated="true">{parent.question}</span>
            </Link>
          ) : null}
          {showChanges ? (
            <V4ChangesBar
              stops={tourStops.length}
              tourIndex={tourIndex}
              onTour={onTour}
              onDismiss={() => {
                setHiddenStops(tourStops.length);
                setTourIndex(null);
              }}
              catalog={catalog}
              locale={locale}
            />
          ) : null}
          {map.storyState === "WRITING" ? (
            <p className="v4DebNote v4Muted" role="status">{t(catalog, "v4.debate.storyWriting")}</p>
          ) : null}

          <div className="v4DebGrid">
            {layout === "desktop" ? <div className="v4DebRailCol">{rail("column")}</div> : null}
            {layout !== "phone" ? (
              <section className="v4DebMapCol" aria-label={t(catalog, "v4.debate.mapRegion")}>
                <V4MapTree {...pieces} />
              </section>
            ) : null}
            <section ref={panelColRef} className="v4DebPanelCol" aria-label={t(catalog, "v4.debate.panelRegion")}>
              <V4Panel
                map={map}
                digs={digs}
                selected={shownSelection}
                readingLevel={readingLevel}
                picked={picked}
                onTogglePick={togglePick}
                onSelect={select}
                digMode={digMode}
                onDigMode={setDigMode}
                onDig={startDig}
                digBusy={digBusy}
                roomNotice={roomNotice}
                headingRef={headingRef}
                catalog={catalog}
                locale={locale}
              />
            </section>
          </div>
        </div>
      </div>

      {sheetOpen ? null : (
        <div className={`v4DebDock${layout === "phone" ? " v4DebDockPhone" : ""}`}>
          {tray}
          {layout === "phone" ? (
            <PhoneBar
              onMap={() => setOutlineOpen(true)}
              target={phoneTarget}
              onDig={startDig}
              digBusy={digBusy}
              catalog={catalog}
            />
          ) : null}
        </div>
      )}

      {sheetOpen ? (
        <OutlineSheet
          onClose={() => setOutlineOpen(false)}
          footer={<>{tray}{toast}</>}
          catalog={catalog}
        >
          {rail("column")}
          <V4Outline {...pieces} />
        </OutlineSheet>
      ) : toast}
      {ask.dialogs}
    </div>
  );
}

// ── Screens before the map ──────────────────────────────────────────────────────────────────────────────────────

function StatusScreen({ problem, onRetry, askHref, catalog }: Readonly<{
  problem: LoadProblem | null;
  onRetry: () => void;
  askHref: string;
  catalog: MessageCatalog;
}>) {
  if (problem === "NOT_FOUND") {
    return (
      <section className="v4Card v4DebStatus">
        <h1 className="v4Serif v4DebStatusTitle">{t(catalog, "v4.debate.notFoundTitle")}</h1>
        <p className="v4Muted">{t(catalog, "v4.debate.notFoundBody")}</p>
        <Link className="v4Btn" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
      </section>
    );
  }
  if (problem === "UNREACHABLE") {
    return (
      <section className="v4Card v4DebStatus">
        <h1 className="v4Serif v4DebStatusTitle">{t(catalog, "v4.debate.loadFailedTitle")}</h1>
        <p className="v4Muted">{t(catalog, "v4.debate.loadFailedBody")}</p>
        <button type="button" className="v4Btn" onClick={onRetry}>{t(catalog, "v4.common.retry")}</button>
      </section>
    );
  }
  return <p className="v4DebLoading v4Muted" role="status">{t(catalog, "v4.common.loading")}</p>;
}

function FailedScreen({ run, classicHref, askHref, catalog, homeCatalog }: Readonly<{
  run: RunProjection;
  classicHref: string;
  askHref: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}>) {
  return (
    <section className="v4Card v4DebStatus">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</p>
      <h1 className="v4DebStatusTitle">{t(catalog, "v4.debate.failedTitle")}</h1>
      <p>{runFailureMessage(run.terminal_reason, homeCatalog)}</p>
      <div className="v4DebStatusActions">
        <Link className="v4Btn v4BtnPrimary" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
        <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
      </div>
    </section>
  );
}

/** RULES-4: QUEUED and CLAIMED say "Starting"; only a run that really waits for a spot says so. */
function stateLine(run: RunProjection, catalog: MessageCatalog, locale: string): string {
  switch (run.state) {
    case "WAITING": {
      const time = clockTime(run.waits_until, locale);
      return time === null ? t(catalog, "v4.debate.state.WAITING.noTime") : t(catalog, "v4.debate.state.WAITING", { time });
    }
    case "HOLDING": {
      const time = clockTime(run.hold_until, locale);
      return time === null ? t(catalog, "v4.debate.state.HOLDING.noTime") : t(catalog, "v4.debate.state.HOLDING", { time });
    }
    case "RUNNING":
      return t(catalog, "v4.debate.state.RUNNING");
    case "SETTLED":
      return t(catalog, "v4.debate.state.FINISHING");
    case "QUEUED":
    case "CLAIMED":
    case "FAILED":
      return t(catalog, "v4.debate.state.STARTING");
  }
}

function ProgressScreen({ run, startedAt, now, reconnecting, classicHref, catalog, locale }: Readonly<{
  run: RunProjection;
  startedAt: string | null;
  now: number | null;
  reconnecting: boolean;
  classicHref: string;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const started = startedAt === null ? Number.NaN : new Date(startedAt).getTime();
  const minutes = now === null || Number.isNaN(started) ? null : Math.max(0, Math.floor((now - started) / 60_000));
  return (
    <section className="v4Card v4DebStatus v4DebProgress">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      {/* The person's own words (the tab title follows this heading); the added lines are not a title. */}
      <h1 className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</h1>
      <p className="v4DebProgressState" role="status">
        <span className="v4DebPulse" aria-hidden="true" />
        {stateLine(run, catalog, locale)}
      </p>
      {minutes === null ? null : (
        <p className="v4Muted">
          {minutes < 1 ? t(catalog, "v4.debate.elapsedJustNow") : tPlural(catalog, "v4.debate.elapsed", minutes, locale)}
        </p>
      )}
      <p className="v4Muted">{t(catalog, "v4.debate.usually")}</p>
      {reconnecting ? <p className="v4Muted">{t(catalog, "v4.debate.reconnecting")}</p> : null}
      <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
    </section>
  );
}

// ── Phone pieces (D6, D7) ───────────────────────────────────────────────────────────────────────────────────────

function PhoneBar({ onMap, target, onDig, digBusy, catalog }: Readonly<{
  onMap: () => void;
  target: DigTarget | null;
  onDig: (target: DigTarget) => void;
  digBusy: boolean;
  catalog: MessageCatalog;
}>) {
  return (
    <div className="v4DebPhoneBar">
      <button type="button" className="v4Btn v4DebPhoneMap" onClick={onMap} aria-haspopup="dialog">
        {t(catalog, "v4.debate.mapButton")}
      </button>
      {target !== null ? (
        <button type="button" className="v4Btn v4BtnPrimary v4DebPhoneDig" disabled={digBusy} onClick={() => onDig(target)}>
          {t(catalog, "v4.debate.digHere")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * D7: the phone map, full screen. UI-6: a real modal — the page behind is inert, Tab stays inside, Escape closes, and
 * the tray (and the dig note with its Undo) live inside it while it is open.
 */
function OutlineSheet({ onClose, footer, catalog, children }: Readonly<{
  onClose: () => void;
  footer: ReactNode;
  catalog: MessageCatalog;
  children: ReactNode;
}>) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      // Back to the Map button, unless a row moved focus on to the panel heading.
      if (document.activeElement === document.body || document.activeElement === null) opener?.focus();
    };
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || sheetRef.current === null) return;
    const items = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => item.getClientRects().length > 0
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      ref={sheetRef}
      className="v4DebSheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v4-deb-sheet-title"
      onKeyDown={onKeyDown}
    >
      <div className="v4DebSheetHead">
        <h2 id="v4-deb-sheet-title" className="v4Serif v4DebSheetTitle">{t(catalog, "v4.debate.mapTitle")}</h2>
        <button
          ref={closeRef}
          type="button"
          className="v4Btn v4DebSheetClose"
          onClick={onClose}
          aria-label={t(catalog, "v4.debate.closeMap")}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="v4DebSheetBody">{children}</div>
      <div className="v4DebSheetFoot">{footer}</div>
    </div>
  );
}
