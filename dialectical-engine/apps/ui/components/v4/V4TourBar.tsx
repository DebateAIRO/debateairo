"use client";

import { useEffect, useRef } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 screen review (owner picks 3 Nov 2026), dig-f18: while the changes tour runs, a small bar stays pinned (above the
 * pinned bar on a phone, under the where-you-are line on a computer) with "Next change ›" and "Done", so Next never
 * scrolls out of view. No "1 of 3" (the owner's rule on counts). At the last stop only "Done" is left. The tour is the
 * person's own doing, so the bar takes the focus when it appears, and Done takes it when Next goes.
 */
export function V4TourBar(props: Readonly<{
  /** There is a stop after this one. */
  hasNext: boolean;
  onNext: () => void;
  onDone: () => void;
  catalog: MessageCatalog;
}>) {
  const { hasNext, onNext, onDone, catalog } = props;
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef<HTMLButtonElement | null>(null);
  const nextHadFocus = useRef(false);
  useEffect(() => {
    (nextRef.current ?? doneRef.current)?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (hasNext || !nextHadFocus.current) return;
    nextHadFocus.current = false;
    doneRef.current?.focus({ preventScroll: true });
  }, [hasNext]);
  return (
    <div className="v4TourBar" role="group" aria-label={t(catalog, "v4.tour.label")}>
      {hasNext ? (
        <button
          ref={nextRef}
          type="button"
          className="v4Btn v4BtnPrimary v4TourNext"
          onClick={() => {
            nextHadFocus.current = document.activeElement === nextRef.current;
            onNext();
          }}
        >
          {t(catalog, "v4.tour.next")}
        </button>
      ) : null}
      <button ref={doneRef} type="button" className="v4Btn v4TourDone" onClick={onDone}>{t(catalog, "v4.tour.done")}</button>
    </div>
  );
}
