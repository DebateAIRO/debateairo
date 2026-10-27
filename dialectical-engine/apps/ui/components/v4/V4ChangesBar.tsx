"use client";

import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { V4Change } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), D4 "back after a round": one quiet bar when something changed since this browser last
 * looked, with a tour that walks the changes one at a time. First visit: the caller shows no bar.
 */
export function V4ChangesBar(props: Readonly<{
  changes: readonly V4Change[];
  /** How many places the tour stops at (changes that land on the same question are one stop). */
  stops: number;
  /** null: the tour has not started; otherwise the stop now shown (0-based). */
  tourIndex: number | null;
  onTour: () => void;
  onDismiss: () => void;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { changes, stops, tourIndex, onTour, onDismiss, catalog, locale } = props;
  const added = changes.filter((change) => change.kind === "ADDED").length;
  const changed = changes.length - added;
  const atLast = tourIndex !== null && tourIndex >= stops - 1;
  const tourLabel = tourIndex === null
    ? t(catalog, "v4.changes.show")
    : atLast ? t(catalog, "v4.changes.backToAnswer") : t(catalog, "v4.changes.next");
  return (
    <section className="v4DebChanges" aria-label={t(catalog, "v4.changes.label")}>
      <span className="v4DebChangesDot" aria-hidden="true" />
      <p className="v4DebChangesText">
        <strong>{t(catalog, "v4.changes.since")}</strong>{" "}
        {added > 0 ? tPlural(catalog, "v4.changes.added", added, locale) : null}
        {added > 0 && changed > 0 ? " · " : null}
        {changed > 0 ? tPlural(catalog, "v4.changes.changed", changed, locale) : null}
      </p>
      {tourIndex !== null && stops > 0 ? (
        <span className="v4DebChangesStep" role="status">
          {t(catalog, "v4.changes.step", { index: Math.min(tourIndex + 1, stops), total: stops })}
        </span>
      ) : null}
      <div className="v4DebChangesActions">
        {stops > 0 ? <button type="button" className="v4Btn" onClick={onTour}>{tourLabel}</button> : null}
        <button type="button" className="v4Link v4DebChangesDismiss" onClick={onDismiss}>{t(catalog, "v4.changes.dismiss")}</button>
      </div>
    </section>
  );
}
