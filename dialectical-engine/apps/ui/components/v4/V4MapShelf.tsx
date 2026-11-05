"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { V4TrustBar } from "@/components/v4/V4TrustBar";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { readMapShelf, type DigLinkCache, type ShelfDig, type ShelfMap, type ShelfPause, type ShelfRead, type ShelfState } from "@/lib/v4/mapShelf";
import { stateWordText, whenText } from "@/lib/v4/stateWords";
import type { ReadingLevel } from "@/lib/v4/types";

/*
 * "Your maps" (owner pick ask-d5 B, 3 Nov 2026; lib/v4/mapShelf.ts reads it). On the ask page: the heading, the person's
 * newest questions as small cards — the question cut cleanly after two lines, one state word, the four-shade bar and a
 * "New" dot when the server gives them — each dig under its question in the person's own words, and "All my maps". The
 * "All my maps" view lists them further back, with "Show more". No counts anywhere. Nothing moves except the one slow
 * pulse of a map being looked into (none with reduced motion).
 * The reading-level ruling (owner, 5 Nov): a debate keeps the level it was asked at, so no link here carries a level; the
 * level props are accepted and unused.
 */

/** The ask page's shelf: this many questions. */
export const SHELF_MAX = 5;
/** Digs shown under a card (the newest); the rest are on the map itself. */
const SHELF_DIGS_MAX = 2;

/**
 * The address of "All my maps": a view of the ask page (`?maps=all`), so no new page route is needed. A level handed in is
 * accepted and unused (the 5 Nov reading-level ruling).
 */
export const ALL_MAPS_PARAM = "maps";
export function allMapsHref(_level?: ReadingLevel | null): string {
  return `/v4?${ALL_MAPS_PARAM}=all`;
}

export type ShelfLoad =
  | Readonly<{ status: "LOADING" }>
  | Readonly<{ status: "READ"; read: ShelfRead }>
  | Readonly<{ status: "FAILED" }>;

/**
 * The shelf for `want` questions, read once `enabled` (a signed-in person). A larger `want` reads further back and keeps
 * the cards shown meanwhile; the dig links already read are kept for the page's life (in memory only). `retry` reads again.
 */
export function useMapShelf(input: Readonly<{ enabled: boolean; want: number; catalog: MessageCatalog }>): Readonly<{
  load: ShelfLoad; busy: boolean; retry: () => void;
}> {
  const { enabled, want, catalog } = input;
  const [load, setLoad] = useState<ShelfLoad>({ status: "LOADING" });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<DigLinkCache>(new Map());
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setBusy(true);
    readMapShelf(want, catalog, { cache: cache.current }).then(
      (read) => { if (active) setLoad({ status: "READ", read }); },
      () => { if (active) setLoad((known) => (known.status === "READ" ? known : { status: "FAILED" })); }
    ).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [enabled, want, catalog, attempt]);
  const retry = useCallback(() => {
    setLoad({ status: "LOADING" });
    setAttempt((value) => value + 1);
  }, []);
  return { load, busy, retry };
}

/** A clock time ("14:00"), with the day in front when it is not today: the one V4 clock form (lib/v4/stateWords.ts). */
function startedText(iso: string, locale: string): string {
  return whenText(iso, locale) ?? "";
}

/**
 * The one state word (wait-f13, map-f34, journey-f22): "Looking into it · Started 14:00", "Waiting", "Paused until
 * 1 December" (the month wall; "Ready to continue" once the new month has started), "Ready", "Didn't finish". WHOLE-12
 * (the wave-2 checks, 4 Nov): from the shared list itself (lib/v4/stateWords.ts) and the waiting card's "Started 14:00"
 * (journey-f16), so the shelf keeps no words of its own.
 */
export function shelfStateText(
  state: ShelfState, startedAt: string | null, catalog: MessageCatalog, locale: string, pause: ShelfPause | null = null
): string {
  switch (state) {
    case "PAUSED":
      return pause === null
        ? t(catalog, "v4.state.PAUSED.noDate")
        : stateWordText({ kind: "PAUSED", until: pause.until, canContinue: pause.canContinue }, catalog, locale);
    case "WORKING": {
      const word = stateWordText({ kind: "LOOKING" }, catalog, locale);
      const since = startedAt === null ? "" : startedText(startedAt, locale);
      return since === "" ? word : `${word} · ${t(catalog, "v4.wait.started", { time: since })}`;
    }
    case "WAITING":
      return stateWordText({ kind: "WAITING", startsAfter: null }, catalog, locale);
    case "READY":
      return stateWordText({ kind: "READY" }, catalog, locale);
    case "FAILED":
      return stateWordText({ kind: "DIDNT_FINISH" }, catalog, locale);
  }
}

function mapHref(runId: string): string {
  return `/v4/debate/${encodeURIComponent(runId)}`;
}

function DigLine({ dig, catalog, locale }: Readonly<{ dig: ShelfDig; catalog: MessageCatalog; locale: string }>) {
  return (
    <li>
      <Link className="v4ShelfDig" href={mapHref(dig.runId)}>
        <span className="v4ShelfDigText" dir="auto" data-ai-generated="true">
          {t(catalog, dig.more ? "v4.maps.digMore" : "v4.maps.dig", { pick: dig.pick })}
        </span>
        <span className="v4ShelfDigState">{shelfStateText(dig.state, null, catalog, locale, dig.pause)}</span>
      </Link>
    </li>
  );
}

function MapCard({ map, catalog, locale, digsMax }: Readonly<{
  map: ShelfMap; catalog: MessageCatalog; locale: string; digsMax: number;
}>) {
  return (
    <li className="v4ShelfItem">
      <Link className="v4ShelfCard" href={mapHref(map.runId)}>
        <span className="v4ShelfQuestion" dir="auto" data-ai-generated="true">{map.question}</span>
        {map.bar === null ? null : <V4TrustBar counts={map.bar} catalog={catalog} />}
        <span className="v4ShelfMeta">
          {map.state === "WORKING" ? <span className="v4ShelfPulse" aria-hidden="true" /> : null}
          {/* public-f17: a question paused at the month wall has the still pause mark, never the pulse. */}
          {map.state === "PAUSED" ? <span className="v4PauseDot" aria-hidden="true" /> : null}
          <span className="v4ShelfState">{shelfStateText(map.state, map.startedAt, catalog, locale, map.pause)}</span>
          {map.changed ? (
            <span className="v4ShelfNew"><span className="v4ShelfNewDot" aria-hidden="true" />{t(catalog, "v4.maps.new")}</span>
          ) : null}
        </span>
      </Link>
      {map.digs.length === 0 ? null : (
        <ul className="v4ShelfDigs">
          {map.digs.slice(0, digsMax).map((dig) => <DigLine key={dig.runId} dig={dig} catalog={catalog} locale={locale} />)}
        </ul>
      )}
    </li>
  );
}

export function MapList({ maps, catalog, locale, digsMax }: Readonly<{
  maps: readonly ShelfMap[]; catalog: MessageCatalog; locale: string;
  /** Accepted and unused (the 5 Nov reading-level ruling). */
  level?: ReadingLevel | null;
  digsMax: number;
}>) {
  return (
    <ul className="v4ShelfList">
      {maps.map((map) => <MapCard key={map.runId} map={map} catalog={catalog} locale={locale} digsMax={digsMax} />)}
    </ul>
  );
}

/** The ask page's "Your maps": shown once read with at least one map; quiet when there is none or the read failed. */
export function V4MapShelf({ load, catalog, locale }: Readonly<{
  load: ShelfLoad; catalog: MessageCatalog; locale: string;
  /** Accepted and unused (the 5 Nov reading-level ruling: no link carries a level). */
  level?: ReadingLevel | null;
}>) {
  const headingId = useId();
  if (load.status !== "READ" || load.read.maps.length === 0) return null;
  return (
    <section className="v4Shelf" aria-labelledby={headingId}>
      <h2 id={headingId} className="v4ShelfTitle">{t(catalog, "v4.maps.title")}</h2>
      <MapList maps={load.read.maps} catalog={catalog} locale={locale} digsMax={SHELF_DIGS_MAX} />
      <Link className="v4Link v4ShelfAll" href={allMapsHref()}>{t(catalog, "v4.maps.all")}</Link>
    </section>
  );
}
