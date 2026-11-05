"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { V4Header } from "@/components/v4/V4Header";
import { MapList, useMapShelf } from "@/components/v4/V4MapShelf";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { ReadingLevel } from "@/lib/v4/types";

/*
 * "All my maps" (owner pick ask-d5 B, 3 Nov 2026): the person's maps further back than the ask page's shelf, the same
 * cards, 20 more with each "Show more". It is a view of the ask page's address (`/v4?maps=all`), so the site's list of
 * pages stays as it is; the account menu's "My questions" links here. Signed-in only, as every V4 page but the ask page.
 * The owner's third round (5 Nov afternoon): the page is called "My questions" too (its heading, so its tab title), and
 * the first screen's link to it reads "All my questions".
 * The reading-level ruling (owner, 5 Nov): no level menu here, the account's level is not read, and no link carries one.
 */

/** This many more maps per "Show more". */
const ALL_MAPS_STEP = 20;
/** Digs shown under each card here (the newest); the rest are on the map itself. */
const ALL_MAPS_DIGS_MAX = 5;

function AllMapsView({ catalog, locale }: Readonly<{ catalog: MessageCatalog; locale: string }>) {
  const [want, setWant] = useState(ALL_MAPS_STEP);
  const { load, busy, retry } = useMapShelf({ enabled: true, want, catalog });
  return (
    <>
      {/* journey-f19: the quota share shows only on the ask, choosing and map pages; All my maps is none of them. */}
      <V4Header catalog={catalog} showQuota={false} />
      {/* UI-4: the site layout already holds the page's one <main>. */}
      <div className="v4AskMain v4MapsMain">
        <h1 className="v4AskTitle v4Serif">{t(catalog, "v4.maps.title")}</h1>
        {load.status === "LOADING" ? <p className="v4AskHint v4Muted" role="status">{t(catalog, "v4.common.loading")}</p> : null}
        {load.status === "FAILED" ? (
          <p className="v4AskHint" role="status">
            {t(catalog, "v4.maps.failed")}{" "}
            <button type="button" className="v4Link" onClick={retry}>{t(catalog, "v4.common.retry")}</button>
          </p>
        ) : null}
        {load.status === "READ" && load.read.maps.length === 0 ? (
          <p className="v4AskHint v4Muted">
            {t(catalog, "v4.maps.empty")}{" "}
            <Link className="v4Link" href="/v4">{t(catalog, "v4.maps.ask")}</Link>
          </p>
        ) : null}
        {load.status === "READ" && load.read.maps.length > 0 ? (
          <MapList maps={load.read.maps} catalog={catalog} locale={locale} digsMax={ALL_MAPS_DIGS_MAX} />
        ) : null}
        {load.status === "READ" && load.read.more ? (
          <div>
            <button type="button" className="v4Btn" disabled={busy} aria-busy={busy} onClick={() => setWant((value) => value + ALL_MAPS_STEP)}>
              {t(catalog, "v4.maps.more")}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function V4AllMaps({ catalog, newDebateCatalog, locale }: Readonly<{
  catalog: MessageCatalog; newDebateCatalog: MessageCatalog; locale: string;
  /** Accepted and unused (the 5 Nov reading-level ruling). */
  initialLevel?: ReadingLevel | null;
}>) {
  return (
    <AuthGate catalog={newDebateCatalog}>{() => <AllMapsView catalog={catalog} locale={locale} />}</AuthGate>
  );
}
