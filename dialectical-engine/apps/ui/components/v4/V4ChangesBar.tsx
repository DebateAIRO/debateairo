"use client";

import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 initial (2026-10-28), D4: one quiet bar when something changed, with a tour that walks the news one question at a
 * time. Fix wave 1 told only what changed "while you were here"; N7 (2026-10-29) adds "since your last visit", from the
 * last visit the account kept: the bar says so while any of that news is still in it.
 * RULES-11/FIT-7: the bar counts questions with news, the same unit the tour numbers ("Stop 1 of 3").
 */
export function V4ChangesBar(props: Readonly<{
  /** How many questions have news (changes that land on the same question are one stop). */
  stops: number;
  /** N7: some of the news is since the person's last visit (not only from this one). */
  sinceLastVisit: boolean;
  /** null: the tour has not started; otherwise the stop now shown (0-based). */
  tourIndex: number | null;
  onTour: () => void;
  onDismiss: () => void;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { stops, sinceLastVisit, tourIndex, onTour, onDismiss, catalog, locale } = props;
  const atLast = tourIndex !== null && tourIndex >= stops - 1;
  const tourLabel = tourIndex === null
    ? t(catalog, "v4.changes.show")
    : atLast ? t(catalog, "v4.changes.backToAnswer") : t(catalog, "v4.changes.next");
  return (
    <section className="v4DebChanges" aria-label={t(catalog, sinceLastVisit ? "v4.changes.labelLastVisit" : "v4.changes.label")}>
      <span className="v4DebChangesDot" aria-hidden="true" />
      <p className="v4DebChangesText" role="status">
        <strong>{t(catalog, sinceLastVisit ? "v4.changes.sinceLastVisit" : "v4.changes.since")}</strong>{" "}
        {tPlural(catalog, "v4.changes.news", stops, locale)}
      </p>
      {tourIndex !== null && stops > 0 ? (
        <span className="v4DebChangesStep">
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
