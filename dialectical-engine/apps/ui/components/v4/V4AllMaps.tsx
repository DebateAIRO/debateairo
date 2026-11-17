"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedQuestionSummary } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { V4Header } from "@/components/v4/V4Header";
import { MapList, useMapShelf } from "@/components/v4/V4MapShelf";
import { V4NotStarted, V4SavedDeleteNotes } from "@/components/v4/V4NotStarted";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { pickUpHref } from "@/lib/v4/savedQuestion";
import type { ReadingLevel } from "@/lib/v4/types";
import { useSavedDeletes } from "@/lib/v4/useSavedQuestion";

/*
 * "My questions" (owner pick ask-d5 B, 3 Nov 2026, then named "All my maps"): the person's maps further back than the
 * ask page's shelf, the same cards, 20 more with each "Show more". It is a view of the ask page's address
 * (`/v4?maps=all`), so the site's list of pages stays as it is; the account menu's "My questions" links here. Signed-in
 * only, as every V4 page but the ask page.
 * The owner's third round (5 Nov afternoon): the page is called "My questions" too (its heading, so its tab title), and
 * the first screen's link to it reads "All my questions".
 * The reading-level ruling (owner, 5 Nov): no level menu here, the account's level is not read, and no link carries one.
 * Design Document v2 (18b): "Not started yet" closes the page, under the list and its "Show more": the questions the account
 * keeps (read once as the page opens; a failed read shows nothing), each with Pick up and Delete. Pick up goes to the ask
 * page, which opens the question (`/v4?pickup=<id>`); Delete is the ask page's own (useSavedDeletes: the shared Undo note,
 * then one DELETE), its note right after the block, as there.
 */

/** This many more maps per "Show more". */
const ALL_MAPS_STEP = 20;
/** Digs shown under each card here (the newest); the rest are on the map itself. */
const ALL_MAPS_DIGS_MAX = 5;

function AllMapsView({ catalog, locale }: Readonly<{ catalog: MessageCatalog; locale: string }>) {
  const [want, setWant] = useState(ALL_MAPS_STEP);
  const { load, busy, retry } = useMapShelf({ enabled: true, want, catalog });
  const router = useRouter();
  const main = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<readonly SavedQuestionSummary[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const read = await contractClient.listSavedQuestions();
        if (live) setSaved(read.questions);
      } catch {
        // Nothing to show: the page stays without the block.
      }
    })();
    return () => { live = false; };
  }, []);
  const { waiting, deleteSaved, undoDelete } = useSavedDeletes({
    client: contractClient,
    onGone: (id) => setSaved((now) => now.filter((one) => one.id !== id)),
    lines: main
  });
  // A question waiting out its Delete is not listed (Undo brings it back).
  const notStarted = useMemo(() => saved.filter((one) => !waiting.some((held) => held.item.id === one.id)), [saved, waiting]);
  return (
    <>
      {/* journey-f19: the quota share shows only on the ask, choosing and map pages; My questions is none of them. */}
      <V4Header catalog={catalog} place="questions" />
      {/* UI-4: the site layout already holds the page's one <main>. */}
      <div ref={main} className="v4AskMain v4MapsMain">
        {/* Design Document v2 (18b): the title, with "New" (a new question) at the end of its row. */}
        <div className="v4MapsHead">
          <h1 className="v4AskTitle v4Serif">{t(catalog, "v4.maps.title")}</h1>
          <Link className="v4Btn v4BtnPrimary v4MapsNew" href="/v4">{t(catalog, "v4.maps.newQuestion")}</Link>
        </div>
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
            <button type="button" className="v4Link v4MapsMore" disabled={busy} aria-busy={busy} onClick={() => setWant((value) => value + ALL_MAPS_STEP)}>
              {t(catalog, "v4.maps.more")}
            </button>
          </div>
        ) : null}
        {/* Design Document v2 (18b): the questions not started yet, then any Delete's shared Undo note (as on the ask page). */}
        <V4NotStarted items={notStarted} locale={locale} catalog={catalog} onPickUp={(id) => router.push(pickUpHref(id))} onDelete={deleteSaved} />
        <V4SavedDeleteNotes waiting={waiting} catalog={catalog} onUndo={undoDelete} />
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
