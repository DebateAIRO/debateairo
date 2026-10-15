"use client";

import { useId } from "react";
import type { DebateMapView } from "@debateai/contract";
import { localeDirection } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): "Also raised, not debated" lists the map's
 * points that no answer argued.
 * - The words are in the question's language: `catalog` is the `public` catalogue of `locale`,
 *   the story's.
 * - Only the claims are shown, never who raised them, how many did, or any mark.
 * - With no map (a run without the new shape, or a map that chose nothing), nothing is shown.
 */
export function AlsoRaisedList({
  view,
  catalog,
  locale
}: {
  view: DebateMapView | null | undefined;
  catalog: MessageCatalog;
  locale: string;
}) {
  // React's useId, not a fixed id, so two lists on one page never share an id (pre-flight PF-C29).
  // A hook: called before the early return.
  const titleId = useId();
  if (view === null || view === undefined) return null;
  return (
    <section className="alsoRaised" aria-labelledby={titleId} lang={locale} dir={localeDirection(locale)} data-ai-generated="true">
      <h2 id={titleId} className="alsoRaisedTitle">{t(catalog, "public.alsoRaised.title")}</h2>
      {view.also_raised.length === 0 ? (
        <p className="alsoRaisedEmpty">{t(catalog, "public.alsoRaised.empty")}</p>
      ) : (
        <ul className="alsoRaisedList">
          {view.also_raised.map((claim, index) => (
            <li key={`${String(index)}:${claim}`} className="alsoRaisedItem">{claim}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
