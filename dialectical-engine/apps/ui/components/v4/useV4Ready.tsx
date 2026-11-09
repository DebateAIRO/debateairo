"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import {
  newsHeadlineOf, readyNewsOf, sinceLastLookedOf, stopsOfChanges, type DigResult, type NewsHeadline
} from "@/lib/v4/readyMoment";
import { tabStateWordOf, type WaitState } from "@/lib/v4/stateWords";
import type { V4Change, V4Map, V4Selection } from "@/lib/v4/types";
import { newsHeadlineText } from "./V4ChangesBar";
import { readyPlain, readyText, V4ReadyAnnouncer, V4ReadyNote, type ReadyNoteText } from "./V4ReadyNote";
import { V4TourBar } from "./V4TourBar";

/*
 * V4 screen review (owner picks 3 Nov 2026): the map page's ready moments and its changes tour, in one place, so the page
 * only wires them in.
 * - journey-f17 / wait-f4: the answer arriving while the person waited, a dig (or the main answer) finishing while they
 *   are here, and the report being written: one small note with [See it] (several digs: [Show me], the tour), one line
 *   for screen readers, the tab title ("Looking into it · …", "Ready · …", "(1) changed · …"), and focus kept where it
 *   was. The dots on the map stay until each place is opened (the page keeps that with the account, V4DebateClient).
 *   The owner's fourth round (6 Nov): before the answer, the tab follows the page's state word ("Waiting · …" while the
 *   question waits for a free spot, "Looking into it · …" while it runs) when the page hands the question's state.
 * - dig-f3 / journey-f10: what the "What your digs did" notice says and does ("See it" for one place, "Show me" for more).
 * - dig-f18: the tour walks the news place by place with a pinned "Next change › · Done"; Done, or reaching the last
 *   place, puts the notice away. dig-f1: the question itself (the main answer) is the last place.
 * - map-f19: "Since you last looked: Confirmed" under the where-you-are line, from the last visit the account keeps.
 * Every change shows at once with a 1-second soft highlight (no movement, the same with reduced motion).
 * V4 start step, Task 62 (wait-f10): a short answer that comes after the page stopped waiting for it is its own moment, "The
 * short answer is ready." with [See it] (the answer was already there, so "Your answer is ready." would be untrue).
 */

/** How long the soft highlight stays on a place the tour or [See it] opened. */
const FLASH_MS = 1_000;

type Moment =
  | Readonly<{ kind: "ANSWER"; id: number }>
  /** Task 62 (wait-f10): the short answer came after the page had stopped waiting for it. */
  | Readonly<{ kind: "SHORT_ANSWER"; id: number }>
  | Readonly<{ kind: "NEWS"; changes: readonly V4Change[]; id: number }>
  | Readonly<{ kind: "REPORT"; id: number }>;

type Tour = Readonly<{ stops: readonly V4Selection[]; index: number }>;

export type V4ReadyInput = Readonly<{
  map: V4Map | null;
  /** The wait screen shows (the debate runs and has not failed). */
  waiting: boolean;
  /**
   * The owner's fourth round (6 Nov 2026): the unfinished question's state (lib/v4/stateWords.ts waitStateOfRun of its
   * status read), so the tab follows the page's state word until the answer is served: "Waiting" while it waits for a free
   * spot, "Taking a short break", the month's pause ("Paused until 1 December", even when `waiting` is false), and "Looking
   * into it" while it runs. Absent or null: "Looking into it" while `waiting`, as before.
   */
  waitState?: WaitState | null;
  /** This debate is a dig: its arrival says "Your dig is done." */
  isDigPage: boolean;
  /** All news so far, and how much of it "Hide this" (or the tour) put away. */
  news: readonly V4Change[];
  hiddenNews: number;
  /** How many of the first news items came from the account's last visit. */
  visitNewsCount: number;
  /** The places with news the person has not opened (the "New" dots). */
  changed: ReadonlySet<string>;
  /** The place the panel shows. */
  selected: V4Selection;
  phone: boolean;
  /** Opens a place in the panel; `focusHeading` moves focus to its heading. */
  select: (selection: V4Selection, focusHeading: boolean) => void;
  /** Puts the notice's news away (as "Hide this" does). */
  hideNews: () => void;
  focusHeading: () => void;
  reportHref: string;
  /**
   * V4 start step, Task 62 (wait-f10): how many times a short answer came after the page stopped waiting for it; each rise
   * is one SHORT_ANSWER moment.
   */
  shortAnswerLate: number;
  catalog: MessageCatalog;
  locale: string;
}>;

export type V4Ready = Readonly<{
  /** The tab title's state word (DocumentTitle's data-tab-prefix), or "" for none. */
  tabPrefix: string;
  /** The one quiet live region; always in the page. */
  announcer: ReactNode;
  /** The small note, for the bottom of the page (above the phone's pinned bar), or null. */
  note: ReactNode;
  /** dig-f18 on a phone: the pinned tour bar, for just above the pinned bar; null otherwise. */
  phoneTourBar: ReactNode;
  /** What sits under the where-you-are line: map-f19's line and, on a computer, the pinned tour bar. */
  underCrumbs: ReactNode;
  /** The notice's news: its sentence (null: none), its places, and its [See it] / [Show me]. */
  notice: Readonly<{ headline: NewsHeadline | null; stops: number; onSee: () => void }>;
  /** Live news just landed (not news since the last visit: that one is told by the notice). */
  onNews: (fresh: readonly V4Change[]) => void;
  /** The report this page saw being written is ready. */
  onReportReady: () => void;
  /** The report is ready and not opened yet (a dot on the rail's report step). */
  reportDot: boolean;
  /** The person acted on the map (opened a place): the answer's ready moment has been seen. */
  acknowledge: () => void;
}>;

export function useV4Ready(input: V4ReadyInput): V4Ready {
  const { map, news, hiddenNews, catalog, locale } = input;
  const [moment, setMoment] = useState<Moment | null>(null);
  const [readyUnseen, setReadyUnseen] = useState<"ANSWER" | "REPORT" | null>(null);
  const [reportDot, setReportDot] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [flash, setFlash] = useState<Readonly<{ stop: V4Selection; serial: number }> | null>(null);
  const serial = useRef(0);
  const next = (): number => {
    serial.current += 1;
    return serial.current;
  };

  // The answer arriving while the person waited on this page is its ready moment; a page opened on a finished answer has none.
  const sawWaiting = useRef(false);
  const arrived = useRef(false);
  const served = map !== null;
  useEffect(() => {
    if (input.waiting) sawWaiting.current = true;
    if (!served || arrived.current) return;
    arrived.current = true;
    if (!sawWaiting.current) return;
    setMoment({ kind: "ANSWER", id: next() });
    setReadyUnseen("ANSWER");
  }, [input.waiting, served]);

  // Task 62 (wait-f10): each rise of the late short answer's count is its moment (none for the count the page opened with).
  const lateSeen = useRef(input.shortAnswerLate);
  useEffect(() => {
    if (input.shortAnswerLate <= lateSeen.current) return;
    lateSeen.current = input.shortAnswerLate;
    setMoment({ kind: "SHORT_ANSWER", id: next() });
    setReadyUnseen("ANSWER");
  }, [input.shortAnswerLate]);
  // Its [See it] takes focus to the answer card's heading, once that card is drawn open (only on the press).
  const [cardFocus, setCardFocus] = useState(0);
  useEffect(() => {
    if (cardFocus === 0) return;
    document.querySelector<HTMLElement>(".v4AnswerCard .v4AnswerHead .v4Eyebrow")?.focus();
  }, [cardFocus]);

  // The soft highlight on the place just opened: its card on the map, its heading, and the main answer for the question.
  useEffect(() => {
    if (flash === null) return;
    const targets: Element[] = [];
    const card = document.querySelector(".v4DebMapCol [aria-current='true']");
    const heading = document.querySelector(".v4PanelH2");
    const main = flash.stop === "root" ? document.querySelector(".v4AnswerCard") : null;
    for (const target of [main, card, heading]) {
      if (target === null) continue;
      targets.push(target);
      target.classList.add("v4Highlight");
    }
    (main ?? card)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const timer = window.setTimeout(() => {
      for (const target of targets) target.classList.remove("v4Highlight");
    }, FLASH_MS);
    return () => {
      window.clearTimeout(timer);
      for (const target of targets) target.classList.remove("v4Highlight");
    };
  }, [flash]);

  const shownNews = useMemo(() => news.slice(hiddenNews), [news, hiddenNews]);
  const shownStops = useMemo(() => (map === null ? [] : stopsOfChanges(map, shownNews)), [map, shownNews]);
  const headline = useMemo(() => (map === null || shownNews.length === 0 ? null : newsHeadlineOf(map, shownNews)), [map, shownNews]);
  const sinceLastLooked = useMemo<ReadonlyMap<string, DigResult>>(
    () => (map === null ? new Map() : sinceLastLookedOf(map, news.slice(0, input.visitNewsCount))),
    [map, news, input.visitNewsCount]
  );

  // A dig's note goes once every place it named that was not opened yet (but the question itself) has been opened; a note
  // about the place the person is already reading stays until they close it.
  const noteStops = useMemo(
    () => (map === null || moment?.kind !== "NEWS" ? [] : stopsOfChanges(map, moment.changes)),
    [map, moment]
  );
  const notePlaces = useRef<Readonly<{ id: number; places: readonly V4Selection[] }> | null>(null);
  useEffect(() => {
    if (moment?.kind !== "NEWS") {
      notePlaces.current = null;
      return;
    }
    if (notePlaces.current?.id !== moment.id) {
      notePlaces.current = { id: moment.id, places: noteStops.filter((stop) => stop !== "root" && input.changed.has(stop)) };
    }
    const places = notePlaces.current.places;
    if (places.length > 0 && places.every((stop) => !input.changed.has(stop))) setMoment(null);
  }, [moment, noteStops, input.changed]);

  const open = (stop: V4Selection): void => {
    input.select(stop, true);
    setFlash({ stop, serial: next() });
  };
  const startTour = (stops: readonly V4Selection[]): void => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      open(stops[0]!);
      input.hideNews();
      return;
    }
    setTour({ stops, index: 0 });
    input.select(stops[0]!, false);
    setFlash({ stop: stops[0]!, serial: next() });
  };
  const close = (): void => {
    setMoment(null);
    setReadyUnseen((unseen) => (unseen === "ANSWER" ? null : unseen));
  };

  // ── The note ──
  let noteText: ReadyNoteText | null = null;
  let action: Readonly<{ label: string; onAct: () => void; href?: string }> | null = null;
  if (moment !== null && map !== null) {
    if (moment.kind === "ANSWER") {
      noteText = readyText(catalog, input.isDigPage ? "v4.ready.digPage" : "v4.ready.answer");
      action = {
        label: t(catalog, "v4.ready.seeIt"),
        onAct: () => {
          close();
          open("root");
        }
      };
    } else if (moment.kind === "SHORT_ANSWER") {
      noteText = readyText(catalog, "v4.ready.shortAnswer");
      action = {
        label: t(catalog, "v4.ready.seeIt"),
        onAct: () => {
          close();
          input.select("root", false);
          setFlash({ stop: "root", serial: next() });
          setCardFocus((count) => count + 1);
        }
      };
    } else if (moment.kind === "REPORT") {
      noteText = readyText(catalog, "v4.ready.report");
      action = {
        label: t(catalog, "v4.ready.seeIt"),
        href: input.reportHref,
        onAct: () => {
          setMoment(null);
          setReadyUnseen(null);
          setReportDot(false);
        }
      };
    } else {
      noteText = newsHeadlineText(catalog, newsHeadlineOf(map, moment.changes));
      const stops = noteStops;
      action = {
        label: t(catalog, stops.length > 1 ? "v4.ready.showMe" : "v4.ready.seeIt"),
        onAct: () => {
          setMoment(null);
          if (stops.length > 1) {
            startTour(stops);
            return;
          }
          open(stops[0] ?? "root");
          // The notice goes too when this was the only place it named.
          if (shownStops.length === 1 && shownStops[0] === stops[0]) input.hideNews();
        }
      };
    }
  }
  const note = noteText === null || action === null ? null : (
    <V4ReadyNote text={noteText} action={action} onClose={close} catalog={catalog} />
  );
  const announcer = <V4ReadyAnnouncer line={noteText === null ? "" : readyPlain(noteText)} id={moment?.id ?? 0} />;

  // ── The tour bar ──
  const tourBar = tour === null ? null : (
    <V4TourBar
      hasNext={tour.index < tour.stops.length - 1}
      onNext={() => {
        const index = tour.index + 1;
        const stop = tour.stops[index];
        if (stop === undefined) return;
        setTour({ ...tour, index });
        input.select(stop, false);
        setFlash({ stop, serial: next() });
        // dig-f18: the last stop puts the notice away (the bar keeps "Done").
        if (index === tour.stops.length - 1) input.hideNews();
      }}
      onDone={() => {
        setTour(null);
        input.hideNews();
        input.focusHeading();
      }}
      catalog={catalog}
    />
  );
  const sinceWord = input.selected.startsWith("path:") ? sinceLastLooked.get(input.selected.slice("path:".length)) : undefined;
  const underCrumbs = (
    <>
      {sinceWord === undefined ? null : (
        <p className="v4PanelSince">{t(catalog, "v4.panel.sinceLastLooked", { result: t(catalog, `v4.digsDid.result.${sinceWord}`) })}</p>
      )}
      {input.phone ? null : tourBar}
    </>
  );

  // ── The tab title ──
  // Before the answer is served, the question's own state word when it has one for the tab (never once the map is here).
  const waitState = map === null ? input.waitState ?? null : null;
  const stateTab = waitState === null ? null : tabStateWordOf(waitState, locale);
  const tabPrefix = stateTab !== null
    ? t(catalog, stateTab.key, stateTab.values)
    : input.waiting
      ? t(catalog, "v4.ready.tab.waiting")
      : readyUnseen !== null
        ? t(catalog, "v4.ready.tab.ready")
        : input.changed.size > 0 ? tPlural(catalog, "v4.ready.tab.changed", input.changed.size, locale) : "";

  return {
    tabPrefix,
    announcer,
    note,
    phoneTourBar: input.phone ? tourBar : null,
    underCrumbs,
    notice: {
      headline,
      stops: shownStops.length,
      onSee: () => {
        // The note about the same news has done its job.
        setMoment((before) => (before?.kind === "NEWS" ? null : before));
        startTour(shownStops);
      }
    },
    onNews: (fresh) => {
      const ready = readyNewsOf(fresh);
      if (ready.length === 0) return;
      // Two digs that finish close together are one note, which opens the tour.
      setMoment((before) => ({ kind: "NEWS", changes: before?.kind === "NEWS" ? [...before.changes, ...ready] : ready, id: next() }));
    },
    onReportReady: () => {
      setMoment({ kind: "REPORT", id: next() });
      setReadyUnseen("REPORT");
      setReportDot(true);
    },
    reportDot,
    acknowledge: () => {
      // Functional updates only, so a handler from an earlier render still acts on the newest state.
      setReadyUnseen((unseen) => (unseen === "ANSWER" ? null : unseen));
      setMoment((before) => (before?.kind === "ANSWER" || before?.kind === "SHORT_ANSWER" ? null : before));
    }
  };
}
