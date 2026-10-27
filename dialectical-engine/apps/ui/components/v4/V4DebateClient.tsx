"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AnswerStory, RunProjection } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4ChangesBar } from "@/components/v4/V4ChangesBar";
import { V4DigToast, type V4DigNotice } from "@/components/v4/V4DigToast";
import { V4Header } from "@/components/v4/V4Header";
import { openCount, resolveSelection, selectionIdOf, V4MapTree } from "@/components/v4/V4MapTree";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { isNotFound } from "@/lib/api";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { digQuestion, digTargetQuestions } from "@/lib/v4/askText";
import { diffSnapshots, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import { loadDigView, loadStory, loadV4, type V4Load } from "@/lib/v4/load";
import { buildV4Map, openQuestionsOf } from "@/lib/v4/mapModel";
import {
  addDigLink,
  findDigParent,
  readDigLinks,
  readSeen,
  readStartedRuns,
  useReadingLevel,
  writeSeen
} from "@/lib/v4/storage";
import type {
  DigLink,
  DigMode,
  DigTarget,
  DigView,
  PendingDig,
  ReadingLevel,
  V4Change,
  V4Map,
  V4Selection
} from "@/lib/v4/types";
import { useV4Ask, type V4AskOutcome } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (2026-10-28), the map page shell (D3 map, D4 what changed, D6/D7 phone). It loads the debate over
 * today's V3 reads, waits calmly while it runs, then lays out rail | map | panel and owns the dig flow (row D
 * decision 1: a dig starts at once with a 10-second Undo, nothing is sent before then). Every polling loop keeps one
 * request in flight at a time and stops when the page goes.
 */

const RUN_POLL_MS = 5_000;
const RUN_POLL_AFTER_ERROR_MS = 30_000;
const STORY_POLL_MS = 10_000;
const STORY_POLL_TRIES = 30;
const DIG_POLL_MS = 15_000;
const UNDO_MS = 10_000;
const CLOCK_TICK_MS = 15_000;
/** The reading level a page uses before one is saved (as the report does). */
const DEFAULT_LEVEL: ReadingLevel = "background";
/** Spec: desktop ≥ 1100 px, 768–1099 px a top strip, < 768 px the phone layout. */
const PHONE_QUERY = "(max-width: 767px)";
const MID_QUERY = "(max-width: 1099px)";

type Layout = "desktop" | "mid" | "phone";
type LoadProblem = "NOT_FOUND" | "UNREACHABLE";

export type V4DebateClientProps = Readonly<{
  id: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
}>;

/** Every V3 read is asker-scoped, so the page waits for a session first (the classic page does the same). */
export function V4DebateClient({
  id,
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint
}: V4DebateClientProps) {
  return (
    <AuthGate catalog={newDebateCatalog}>
      {() => (
        // Keyed by id: moving between two debates (a dig's back link) starts fresh, never with the last one's state.
        <V4Debate
          key={id}
          id={id}
          catalog={catalog}
          homeCatalog={homeCatalog}
          newDebateCatalog={newDebateCatalog}
          billingCatalog={billingCatalog}
          locale={locale}
          crisisCountryHint={crisisCountryHint}
        />
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

/** A dig of a whole path is linked by the path ("path:<id>"), as the map pieces place it (V4MapTree digHome). */
function linkedIdsOf(target: DigTarget): readonly string[] {
  return target.kind === "path" ? [`path:${target.path.id}`] : target.questions.map((question) => question.id);
}

/** What the phone's pinned "Dig deeper here" digs into: a path or one open question (never the root or a dig). */
function targetOf(map: V4Map, selection: V4Selection): DigTarget | null {
  if (selection.startsWith("path:")) {
    const path = map.paths.find((candidate) => `path:${candidate.id}` === selection);
    return path === undefined ? null : { kind: "path", path };
  }
  if (selection.startsWith("open:")) {
    const question = openQuestionsOf(map).find((candidate) => `open:${candidate.id}` === selection);
    return question === undefined ? null : { kind: "open", questions: [question] };
  }
  return null;
}

function V4Debate({ id, catalog, homeCatalog, newDebateCatalog, billingCatalog, locale, crisisCountryHint }: V4DebateClientProps) {
  const layout = useLayout();
  const [savedLevel, saveLevel] = useReadingLevel();
  const readingLevel: ReadingLevel = savedLevel ?? DEFAULT_LEVEL;
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

  // ── The story: while it is missing or still being written, ask again every 10 s (at most 30 times) ──────────────
  const [polledStory, setPolledStory] = useState<Readonly<{ answerId: string; story: AnswerStory | null }> | null>(null);
  const [storyGaveUp, setStoryGaveUp] = useState(false);
  const story = polledStory !== null && polledStory.answerId === answerId ? polledStory.story : served?.story ?? null;
  const storyPending = served !== null && (story === null || story.status === "WRITING");
  useEffect(() => {
    if (answerId === null || !storyPending) return;
    let active = true;
    let timer: number | undefined;
    let tries = 0;
    const tick = async (): Promise<void> => {
      tries += 1;
      try {
        const next = await loadStory(answerId);
        if (!active) return;
        setPolledStory({ answerId, story: next });
        if (next !== null && next.status !== "WRITING") return;
      } catch {
        if (!active) return;
      }
      if (tries >= STORY_POLL_TRIES) {
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
  }, [answerId, storyPending]);

  const map = useMemo<V4Map | null>(
    () => (served === null ? null : buildV4Map({ runId: served.runId, answer: served.answer, story })),
    [served, story]
  );

  // ── Digs: the follow-ups started from this map (kept in this browser), polled while any is still going ─────────
  const [digs, setDigs] = useState<readonly DigView[]>([]);
  const [digsLoaded, setDigsLoaded] = useState(false);
  const [digLinksVersion, setDigLinksVersion] = useState(0);
  const digsRef = useRef<readonly DigView[]>([]);
  const servedRunId = served?.runId ?? null;
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      const links = readDigLinks(servedRunId);
      const before = new Map(digsRef.current.map((view) => [view.link.childRunId, view]));
      const results = await Promise.all(links.map(async (link) => {
        const known = before.get(link.childRunId);
        // DONE and FAILED do not change again: no need to ask.
        if (known !== undefined && !isRunning(known)) return { view: known, live: false };
        try {
          const view = await loadDigView(link);
          return { view, live: isRunning(view) };
        } catch {
          return { view: known ?? null, live: true };
        }
      }));
      if (!active) return;
      const next = results.flatMap((result) => (result.view === null ? [] : [result.view]));
      digsRef.current = next;
      setDigs(next);
      setDigsLoaded(true);
      if (results.some((result) => result.live)) timer = window.setTimeout(() => void tick(), DIG_POLL_MS);
    };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [servedRunId, digLinksVersion]);

  // ── Selection ───────────────────────────────────────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<V4Selection>("root");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(["root"]));
  const [focusRequest, setFocusRequest] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const shownSelection: V4Selection = map === null ? "root" : selectionIdOf(resolveSelection(map, digs, selected));

  const select = useCallback((selection: V4Selection, viaKeyboard: boolean): void => {
    setSelected(selection);
    setOpened((previous) => (previous.has(selection) ? previous : new Set([...previous, selection])));
    // Phone: tapping a row of the outline opens it in the panel, so the sheet closes and the heading takes focus.
    const fromSheet = layout === "phone" && outlineOpen;
    if (fromSheet) setOutlineOpen(false);
    if (viaKeyboard || fromSheet) setFocusRequest((count) => count + 1);
  }, [layout, outlineOpen]);

  useEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

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
  const pickedQuestions = useMemo(
    () => (map === null ? [] : openQuestionsOf(map).filter((question) => picked.has(question.id))),
    [map, picked]
  );

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

  const send = async (dig: PendingDig, parentRunId: string, rootQuestion: string): Promise<void> => {
    setPending(null);
    setSending(true);
    let outcome: V4AskOutcome;
    try {
      outcome = await ask.submit(digQuestion(dig.target, rootQuestion, catalog), dig.mode);
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
      // Kept even when the page has gone meanwhile: the dig is real, so the map must find it next time.
      addDigLink(link);
      if (!mounted.current) return;
      // Shown at once as waiting; the dig loop reads its real state straight away.
      const shown: DigView = { link, state: "WAITING", headline: null, counts: null };
      digsRef.current = [...digsRef.current.filter((view) => view.link.childRunId !== link.childRunId), shown];
      setDigs(digsRef.current);
      setDigLinksVersion((version) => version + 1);
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
  const mapRunId = map?.runId ?? null;
  const mapQuestion = map?.question ?? null;
  useEffect(() => {
    if (pending === null || mapRunId === null || mapQuestion === null) return;
    const timer = window.setTimeout(
      () => void sendRef.current(pending, mapRunId, mapQuestion),
      Math.max(0, pending.sendsAt - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [pending, mapRunId, mapQuestion]);

  // ── What changed since the last visit (D4) ──────────────────────────────────────────────────────────────────────
  const [changes, setChanges] = useState<readonly V4Change[] | null>(null);
  const [changesHidden, setChangesHidden] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const storySettled = !storyPending || storyGaveUp;
  const seenReady = map !== null && digsLoaded && storySettled;
  const diffDone = useRef(false);
  useEffect(() => {
    if (!seenReady || map === null) return;
    const items = snapshotItems(map, digs);
    if (!diffDone.current) {
      diffDone.current = true;
      setChanges(diffSnapshots(readSeen(map.runId), items));
    }
    // What the person has now seen live counts as seen, so the next visit tells only what came after.
    writeSeen(map.runId, { at: new Date().toISOString(), items });
  }, [seenReady, map, digs]);

  const tourStops = useMemo<readonly V4Selection[]>(() => {
    if (map === null || changes === null) return [];
    const stops: V4Selection[] = [];
    for (const change of changes) {
      const stop = selectionForChange(map, change);
      if (stop !== "root" && !stops.includes(stop)) stops.push(stop);
    }
    return stops;
  }, [map, changes]);
  const changed = useMemo<ReadonlySet<string>>(
    () => new Set(tourStops.filter((stop) => !opened.has(stop))),
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

  // ── The back link of a dig, and when it started (for the progress screen) ─────────────────────────────────────
  const [parent, setParent] = useState<Readonly<{ runId: string; question: string | null }> | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  useEffect(() => {
    const link = findDigParent(runId);
    const started = readStartedRuns().find((entry) => entry.runId === runId);
    setStartedAt(link?.startedAt ?? started?.startedAt ?? null);
    if (link === null) {
      setParent(null);
      return;
    }
    const known = readStartedRuns().find((entry) => entry.runId === link.parentRunId);
    if (known !== undefined && known.question.trim() !== "") {
      setParent({ runId: link.parentRunId, question: known.question });
      return;
    }
    setParent({ runId: link.parentRunId, question: null });
    let active = true;
    loadV4(link.parentRunId).then(
      (parentLoad) => {
        if (!active) return;
        const question = parentLoad.kind === "SERVED" ? parentLoad.answer.question_line : parentLoad.run.question_line;
        setParent({ runId: link.parentRunId, question });
      },
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [runId]);

  // A slow clock for "started N minutes ago" while the debate runs.
  const [now, setNow] = useState<number | null>(null);
  const waiting = load?.kind === "RUN" && load.run.state !== "FAILED";
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  const reportHref = `/v4/debate/${encodeURIComponent(runId)}/report`;
  const header = (
    <V4Header catalog={catalog} readingLevel={readingLevel} onReadingLevel={saveLevel} classicHref={classicHref}>
      {served !== null ? (
        <Link className="v4Btn v4BtnPrimary v4DebReportLink" href={reportHref}>{t(catalog, "v4.debate.report")}</Link>
      ) : null}
    </V4Header>
  );

  if (map === null) {
    return (
      <div className="v4DebPage">
        {header}
        <main className="v4DebCentre">
          {load === null || load.kind !== "RUN" ? (
            <StatusScreen
              problem={loadProblem}
              onRetry={() => {
                setLoadProblem(null);
                setLoadAttempt((count) => count + 1);
              }}
              catalog={catalog}
            />
          ) : load.run.state === "FAILED" ? (
            <FailedScreen run={load.run} classicHref={classicHref} catalog={catalog} homeCatalog={homeCatalog} />
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
        </main>
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
  const phoneTarget = layout === "phone" ? targetOf(map, shownSelection) : null;
  const showChanges = changes !== null && changes.length > 0 && !changesHidden;

  const rail = (variant: "column" | "strip") => (
    <V4Rail runId={runId} openLeft={openLeft} digs={dugCounts} variant={variant} catalog={catalog} locale={locale} />
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

  return (
    <div className={`v4DebPage v4DebLayout-${layout}`}>
      {header}
      {layout === "mid" ? rail("strip") : null}
      <main className="v4DebMain">
        <h1 className="v4SrOnly" data-ai-generated="true">{map.question}</h1>
        {parent !== null ? (
          <Link className="v4DebBack" href={`/v4/debate/${encodeURIComponent(parent.runId)}`}>
            <span aria-hidden="true">‹</span>{" "}
            {parent.question === null ? (
              t(catalog, "v4.debate.backToEarlier")
            ) : (
              <>
                {t(catalog, "v4.debate.backTo")}{" "}
                <span className="v4DebBackQuestion" data-ai-generated="true">{parent.question}</span>
              </>
            )}
          </Link>
        ) : null}
        {showChanges ? (
          <V4ChangesBar
            changes={changes}
            stops={tourStops.length}
            tourIndex={tourIndex}
            onTour={onTour}
            onDismiss={() => {
              setChangesHidden(true);
              setTourIndex(null);
            }}
            catalog={catalog}
            locale={locale}
          />
        ) : null}
        {map.storyState === "WRITING" && !storyGaveUp ? (
          <p className="v4DebNote v4Muted" role="status">{t(catalog, "v4.debate.storyWriting")}</p>
        ) : null}

        <div className="v4DebGrid">
          {layout === "desktop" ? <div className="v4DebRailCol">{rail("column")}</div> : null}
          {layout !== "phone" ? (
            <section className="v4DebMapCol" aria-label={t(catalog, "v4.debate.mapRegion")}>
              <V4MapTree {...pieces} />
            </section>
          ) : null}
          <section className="v4DebPanelCol" aria-label={t(catalog, "v4.debate.panelRegion")}>
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
      </main>

      <div className={`v4DebDock${layout === "phone" ? " v4DebDockPhone" : ""}`}>
        {pickedQuestions.length >= 2 ? (
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
        ) : null}
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

      {layout === "phone" && outlineOpen ? (
        <OutlineSheet onClose={() => setOutlineOpen(false)} catalog={catalog}>
          {rail("column")}
          <V4Outline {...pieces} />
        </OutlineSheet>
      ) : null}

      <V4DigToast
        pending={pending}
        onUndo={undoDig}
        notice={notice}
        onCloseNotice={() => setNotice(null)}
        lifted={layout === "phone" || pickedQuestions.length >= 2}
        catalog={catalog}
        locale={locale}
      />
      {ask.dialogs}
    </div>
  );
}

// ── Screens before the map ──────────────────────────────────────────────────────────────────────────────────────

function StatusScreen({ problem, onRetry, catalog }: Readonly<{
  problem: LoadProblem | null;
  onRetry: () => void;
  catalog: MessageCatalog;
}>) {
  if (problem === "NOT_FOUND") {
    return (
      <section className="v4Card v4DebStatus">
        <h1 className="v4Serif v4DebStatusTitle">{t(catalog, "v4.debate.notFoundTitle")}</h1>
        <p className="v4Muted">{t(catalog, "v4.debate.notFoundBody")}</p>
        <Link className="v4Btn" href="/v4">{t(catalog, "v4.debate.askNew")}</Link>
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

function FailedScreen({ run, classicHref, catalog, homeCatalog }: Readonly<{
  run: RunProjection;
  classicHref: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}>) {
  return (
    <section className="v4Card v4DebStatus">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{run.question_line}</p>
      <h1 className="v4DebStatusTitle">{t(catalog, "v4.debate.failedTitle")}</h1>
      <p>{runFailureMessage(run.terminal_reason, homeCatalog)}</p>
      <div className="v4DebStatusActions">
        <Link className="v4Btn v4BtnPrimary" href="/v4">{t(catalog, "v4.debate.askNew")}</Link>
        <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
      </div>
    </section>
  );
}

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
      <h1 className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{run.question_line}</h1>
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

function OutlineSheet({ onClose, catalog, children }: Readonly<{
  onClose: () => void;
  catalog: MessageCatalog;
  children: ReactNode;
}>) {
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
    }
  };
  return (
    <div className="v4DebSheet" role="dialog" aria-modal="true" aria-labelledby="v4-deb-sheet-title" onKeyDown={onKeyDown}>
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
    </div>
  );
}
