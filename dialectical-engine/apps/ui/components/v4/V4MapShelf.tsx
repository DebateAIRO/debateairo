"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { V4TrustBar } from "@/components/v4/V4TrustBar";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { readMapShelf, type DigLinkCache, type ShelfDig, type ShelfMap, type ShelfRead, type ShelfState } from "@/lib/v4/mapShelf";
import { whenText } from "@/lib/v4/stateWords";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";

/*
 * "Your maps" (owner pick ask-d5 B, 3 Nov 2026; lib/v4/mapShelf.ts reads it). On the ask page: the heading, the person's
 * newest questions as small cards — the question cut cleanly after two lines, one state word, the four-shade bar and a
 * "New" dot when the server gives them — each dig under its question in the person's own words, and "All my maps". The
 * "All my maps" view lists them further back, with "Show more". No counts anywhere. Nothing moves except the one slow
 * pulse of a map being looked into (none with reduced motion).
 */

/** The ask page's shelf: this many questions. */
export const SHELF_MAX = 5;
/** Digs shown under a card (the newest); the rest are on the map itself. */
const SHELF_DIGS_MAX = 2;

/** The address of "All my maps": a view of the ask page (`?maps=all`), so no new page route is needed. */
export const ALL_MAPS_PARAM = "maps";
export function allMapsHref(level: ReadingLevel | null): string {
  return levelHref(`/v4?${ALL_MAPS_PARAM}=all`, level);
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

/** The one state word (wait-f13, map-f34): "Being looked into, started 14:00", "Waiting", "Answer ready", "Didn't finish". */
export function shelfStateText(state: ShelfState, startedAt: string | null, catalog: MessageCatalog, locale: string): string {
  switch (state) {
    case "WORKING":
      return startedAt === null
        ? t(catalog, "v4.maps.state.working")
        : t(catalog, "v4.maps.state.workingSince", { time: startedText(startedAt, locale) });
    case "WAITING":
      return t(catalog, "v4.maps.state.waiting");
    case "READY":
      return t(catalog, "v4.maps.state.ready");
    case "FAILED":
      return t(catalog, "v4.maps.state.failed");
  }
}

function mapHref(runId: string, level: ReadingLevel | null): string {
  return levelHref(`/v4/debate/${encodeURIComponent(runId)}`, level);
}

function DigLine({ dig, catalog, locale, level }: Readonly<{ dig: ShelfDig; catalog: MessageCatalog; locale: string; level: ReadingLevel | null }>) {
  return (
    <li>
      <Link className="v4ShelfDig" href={mapHref(dig.runId, level)}>
        <span className="v4ShelfDigText" dir="auto" data-ai-generated="true">
          {t(catalog, dig.more ? "v4.maps.digMore" : "v4.maps.dig", { pick: dig.pick })}
        </span>
        <span className="v4ShelfDigState">{shelfStateText(dig.state, null, catalog, locale)}</span>
      </Link>
    </li>
  );
}

function MapCard({ map, catalog, locale, level, digsMax }: Readonly<{
  map: ShelfMap; catalog: MessageCatalog; locale: string; level: ReadingLevel | null; digsMax: number;
}>) {
  return (
    <li className="v4ShelfItem">
      <Link className="v4ShelfCard" href={mapHref(map.runId, level)}>
        <span className="v4ShelfQuestion" dir="auto" data-ai-generated="true">{map.question}</span>
        {map.bar === null ? null : <V4TrustBar counts={map.bar} catalog={catalog} />}
        <span className="v4ShelfMeta">
          {map.state === "WORKING" ? <span className="v4ShelfPulse" aria-hidden="true" /> : null}
          <span className="v4ShelfState">{shelfStateText(map.state, map.startedAt, catalog, locale)}</span>
          {map.changed ? (
            <span className="v4ShelfNew"><span className="v4ShelfNewDot" aria-hidden="true" />{t(catalog, "v4.maps.new")}</span>
          ) : null}
        </span>
      </Link>
      {map.digs.length === 0 ? null : (
        <ul className="v4ShelfDigs">
          {map.digs.slice(0, digsMax).map((dig) => <DigLine key={dig.runId} dig={dig} catalog={catalog} locale={locale} level={level} />)}
        </ul>
      )}
    </li>
  );
}

export function MapList({ maps, catalog, locale, level, digsMax }: Readonly<{
  maps: readonly ShelfMap[]; catalog: MessageCatalog; locale: string; level: ReadingLevel | null; digsMax: number;
}>) {
  return (
    <ul className="v4ShelfList">
      {maps.map((map) => <MapCard key={map.runId} map={map} catalog={catalog} locale={locale} level={level} digsMax={digsMax} />)}
    </ul>
  );
}

/** The ask page's "Your maps": shown once read with at least one map; quiet when there is none or the read failed. */
export function V4MapShelf({ load, catalog, locale, level }: Readonly<{
  load: ShelfLoad; catalog: MessageCatalog; locale: string; level: ReadingLevel | null;
}>) {
  const headingId = useId();
  if (load.status !== "READ" || load.read.maps.length === 0) return null;
  return (
    <section className="v4Shelf" aria-labelledby={headingId}>
      <h2 id={headingId} className="v4ShelfTitle">{t(catalog, "v4.maps.title")}</h2>
      <MapList maps={load.read.maps} catalog={catalog} locale={locale} level={level} digsMax={SHELF_DIGS_MAX} />
      <Link className="v4Link v4ShelfAll" href={allMapsHref(level)}>{t(catalog, "v4.maps.all")}</Link>
    </section>
  );
}
