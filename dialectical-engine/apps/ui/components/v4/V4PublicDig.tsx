"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DigSuggestion } from "@debateai/contract";
import { V4DigUndoHost } from "@/components/v4/V4DigUndo";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import {
  newWordMarks, progressSettled, publicDigAnchor, publicPathAnchor, readPublicDigProgress, stopsReached,
  type PublicDigProgress, type PublicDigStarted, type PublicDigSuggestion
} from "@/lib/v4/publicDig";
import type { WaitState } from "@/lib/v4/stateWords";
import { V4WaitCard } from "./V4WaitCard";
import { DIG_MODES, type DigMode } from "@/lib/v4/types";

/*
 * V4 screen review (owner picks 3 Nov 2026): the pieces of the public dig box (V4PublicLane.tsx holds the box itself).
 *  - public-f11: Quick look by default, with Thorough beside it on paid plans (Free has no such choice, owner N13).
 *  - public-d2 A: the path's own suggestions as chips; a chip someone has dug since says "Someone dug near here on 2 Nov"
 *    and opens their result on the page instead. After the 10-second Undo the person stays on the page: a card under the
 *    path says the dig is running, with "Open it". Nothing moves on the page while they wait: the card is read again when
 *    the person comes back to the page (it shows again in the same tab), and then shows the two stops, "Dig done" and
 *    "Checked", and one outcome: on the public page (before and after, new words underlined, "See it on the page", which
 *    glows the path once), "Kept with you: the public page is unchanged." in grey, or "Confirmed: the answer holds."
 *  - journey-f2: a dig being looked into has the map's one look for that (hatched paper, one slow pulse ring), never a
 *    dashed card; a settled one is a plain card.
 *  - Question 47 A (owner, 9 Nov; journey-d2 A, one waiting card everywhere): while the dig runs, the card holds the shared
 *    waiting card: its state word ("Looking into it", or the wait's own), "Started 14:31", the two stops, "When you come
 *    back to this page, its result shows here.", "You can leave this page. It keeps going.", then "Open it".
 *  - journey-f21 / dig-f25: the site's one Undo note, bottom-left, as on every V4 page (V4DigUndoHost).
 * No browser storage of any kind.
 */

/** Scrolls to a place on the page, gives it focus, and glows it once (the shared 1-second highlight). */
export function glowOnPage(id: string): void {
  const place = document.getElementById(id);
  if (place === null) return;
  place.classList.remove("v4Highlight");
  // Re-read the layout so the highlight plays again when it is put on again.
  void place.offsetWidth;
  place.classList.add("v4Highlight");
  place.addEventListener("animationend", () => place.classList.remove("v4Highlight"), { once: true });
  place.scrollIntoView?.({ block: "center" });
  place.focus({ preventScroll: true });
}

/** public-f11: Quick look / Thorough, the map panel's own words; shown on paid plans only. */
export function PublicDigModes({ mode, onMode, catalog }: Readonly<{ mode: DigMode; onMode: (mode: DigMode) => void; catalog: MessageCatalog }>) {
  return (
    <>
      <div className="v4PubModes" role="group" aria-label={t(catalog, "v4.panel.modeLabel")}>
        {DIG_MODES.map((one) => (
          <button key={one} type="button" className="v4Chip" aria-pressed={mode === one} onClick={() => onMode(one)}>
            {t(catalog, `v4.digMode.${one}`)}
          </button>
        ))}
      </div>
      <p className="v4PubHint">{t(catalog, `v4.panel.modeHint.${mode}`)}</p>
    </>
  );
}

/** "2 Nov": the day someone dug near a suggestion, said as written (a calendar date), whatever the reader's clock. */
function shortDay(day: string, locale: string): string {
  return formatDate(locale, `${day}T00:00:00.000Z`, { timeZone: "UTC", day: "numeric", month: "short" });
}

/** public-d2: the path's own suggestions as chips. Tapped chips go into the dig; a dug one opens that result instead. */
export function PublicDigChips({ chips, chosen, full, onToggle, locked, pathAnchor, catalog, locale, firstRef, fullLineId }: Readonly<{
  chips: readonly PublicDigSuggestion[];
  /** The path's own place on the page: a dug chip opens it when that dig shows no paths of its own. */
  pathAnchor: string;
  chosen: ReadonlySet<string>;
  /** The plan combines no more picks: chips not chosen yet cannot be added (the box says why). */
  full: boolean;
  onToggle: (suggestion: DigSuggestion) => void;
  /** While the dig waits out its 10 seconds, nothing changes in it. */
  locked: boolean;
  catalog: MessageCatalog;
  locale: string;
  firstRef?: (element: HTMLButtonElement | null) => void;
  /** ACCESS-17 (journey-f14): the visible line saying why a chip cannot be added now (the plan's cap), for the greyed chips. */
  fullLineId?: string;
}>) {
  return (
    <div className="v4PubChips" role="group" aria-label={t(catalog, "v4.public.dig.chipsLabel")}>
      {chips.map((chip, at) => {
        const id = chip.suggestion.suggestion_id;
        const ref = at === 0 ? firstRef : undefined;
        if (chip.dugOn !== null && chip.dugRef !== null) {
          const dugRef = chip.dugRef;
          return (
            <button key={id} ref={ref} type="button" className="v4Chip v4PubChip v4PubChipDug" data-public-chip-dug
              onClick={() => glowOnPage(document.getElementById(publicDigAnchor(dugRef)) === null ? pathAnchor : publicDigAnchor(dugRef))}>
              <span dir="auto" data-ai-generated="true">{chip.suggestion.text}</span>
              <span className="v4PubChipDugLine">{t(catalog, "v4.public.dig.dugNear", { date: shortDay(chip.dugOn, locale) })}</span>
            </button>
          );
        }
        const picked = chosen.has(id);
        return (
          <button key={id} ref={ref} type="button" className="v4Chip v4PubChip" aria-pressed={picked}
            aria-disabled={locked || (!picked && full) ? "true" : undefined}
            aria-describedby={!locked && !picked && full && fullLineId !== undefined ? fullLineId : undefined}
            onClick={() => {
              if (!locked && (picked || !full)) onToggle(chip.suggestion);
            }}>
            <span dir="auto" data-ai-generated="true">{chip.suggestion.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function BeforeAfter({ before, after, catalog }: Readonly<{ before: string; after: string; catalog: MessageCatalog }>) {
  return (
    <div className="v4PubDigChange">
      <p className="v4PubDigChangeLine">
        <span className="v4PubLabel">{t(catalog, "v4.public.digCard.before")}</span>{" "}
        <span dir="auto" data-ai-generated="true">{before}</span>
      </p>
      <p className="v4PubDigChangeLine">
        <span className="v4PubLabel">{t(catalog, "v4.public.digCard.after")}</span>{" "}
        <span dir="auto" data-ai-generated="true">
          {newWordMarks(before, after).map((mark, at) => (mark.added ? <ins key={at} className="v4PubNewWords">{mark.text}</ins> : <span key={at}>{mark.text}</span>))}
        </span>
      </p>
    </div>
  );
}

function Stops({ progress, catalog }: Readonly<{ progress: PublicDigProgress | null; catalog: MessageCatalog }>) {
  const reached = stopsReached(progress);
  const stop = (key: string, done: boolean) => (
    <li className={done ? "v4PubDigStop v4PubDigStopDone" : "v4PubDigStop"} data-reached={done ? "true" : "false"}>
      <span className="v4PubDigStopMark" aria-hidden="true">{done ? "✓" : ""}</span>
      {t(catalog, key)}
      <span className="v4SrOnly">{` · ${t(catalog, done ? "v4.public.digCard.stopReached" : "v4.public.digCard.stopOpen")}`}</span>
    </li>
  );
  return (
    <ol className="v4PubDigStops">
      {stop("v4.public.digCard.stopDone", reached.dug)}
      {stop("v4.public.digCard.stopChecked", reached.checked)}
    </ol>
  );
}

/** Before the dig's first read: it is being looked into. */
const LOOKING: WaitState = Object.freeze({ kind: "LOOKING" });

/**
 * public-d2 A: the card under the path for one dig this visit started. It reads the dig's own run when it appears and
 * when the person comes back to the page, until there is an outcome; nothing else moves it.
 */
export function PublicDigCard({ dig, openHref, catalog, locale }: Readonly<{
  dig: PublicDigStarted; openHref: string; catalog: MessageCatalog; locale: string;
}>) {
  const router = useRouter();
  const [progress, setProgress] = useState<PublicDigProgress | null>(null);
  const settled = progressSettled(progress);
  const read = useCallback(() => {
    void readPublicDigProgress(dig.childRunId, dig.before).then(setProgress, () => undefined);
  }, [dig.childRunId, dig.before]);
  useEffect(() => {
    if (dig.notJoined || settled) return;
    read();
    const back = (): void => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
    };
  }, [dig.notJoined, settled, read]);
  const openIt = <Link className="v4Link" href={openHref}>{t(catalog, "v4.public.dig.openIt")}</Link>;
  if (dig.notJoined) {
    // public-f10: it runs as the person's own private debate; the page is unchanged. A calm note, never the red box.
    return (
      <p className="v4PubNote" role="status" data-public-dig-private>
        {t(catalog, "v4.public.dig.notJoined")}{" "}
        {openIt}
      </p>
    );
  }
  const working = !settled;
  // While it runs (or before its first read): what the shared waiting card says; null once it has moved on.
  const runningWait: WaitState | null = progress === null ? LOOKING : progress.kind === "RUNNING" ? progress.wait : null;
  const outcome = progress === null || progress.kind === "RUNNING" ? null : progress.kind === "CHECKING" ? (
    <p className="v4PubHint">{t(catalog, "v4.contribution.CHECKING")}</p>
  ) : progress.kind === "ON_THE_PAGE" ? (
    <>
      <p className="v4PubDigOutcome">{t(catalog, "v4.public.digCard.onPage")}</p>
      {progress.after === null ? null : <BeforeAfter before={dig.before} after={progress.after} catalog={catalog} />}
      <button type="button" className="v4Link v4PubDigSee" onClick={() => {
        // The page is read again, so the path shows its new text; the path glows once where it is.
        router.refresh();
        glowOnPage(publicPathAnchor({ ref: dig.pathRef, digRef: dig.digRef }));
      }}>
        {t(catalog, "v4.public.digCard.seeOnPage")}
      </button>
    </>
  ) : progress.kind === "CONFIRMED" ? (
    // journey-f10 (WHOLE-8, the wave-2 checks): the one win sentence, from "What your digs did" (V4ChangesBar), never a copy.
    <p className="v4PubDigOutcome">{t(catalog, "v4.digsDid.holds")}</p>
  ) : progress.kind === "KEPT_PRIVATE" ? (
    <p className="v4PubHint">{t(catalog, "v4.public.digCard.keptPrivate")}</p>
  ) : progress.kind === "REMOVED" ? (
    <p className="v4PubHint">{t(catalog, "v4.public.digCard.removed")}</p>
  ) : progress.kind === "KEPT_BY_REVIEW" ? (
    <p className="v4PubHint">{t(catalog, "v4.public.digCard.keptByReview")}</p>
  ) : progress.kind === "OFF_FOR_REVIEW" ? (
    <p className="v4PubHint">{t(catalog, "v4.public.digCard.offForReview")}</p>
  ) : (
    <p className="v4PubHint">{t(catalog, "v4.state.DIDNT_FINISH")}</p>
  );
  return (
    <div className={working ? "v4PubDigCard v4Ground v4GroundLOOKING" : "v4PubDigCard"} role="group"
      aria-label={t(catalog, "v4.seed.yourDig")} data-public-dig-card={progress?.kind ?? "RUNNING"}>
      <p className="v4PubDigCardTitle">
        <span className="v4PubLabel">{t(catalog, "v4.seed.yourDig")}</span>{" "}
        <span dir="auto" data-ai-generated={dig.firstIsAi ? "true" : undefined}>{dig.first}</span>
      </p>
      {runningWait !== null ? (
        <V4WaitCard variant="inline" state={runningWait} startedAt={dig.startedAt} catalog={catalog} locale={locale}>
          <Stops progress={progress} catalog={catalog} />
          <p className="v4PubHint" data-public-dig-result-here="">{t(catalog, "v4.public.digCard.resultShowsHere")}</p>
        </V4WaitCard>
      ) : <Stops progress={progress} catalog={catalog} />}
      {/* The review of 9 Nov: the outcome's status line stays in place from the start, empty while the dig runs, so the outcome is
          read out when it comes (a status line that appears already filled is often not). */}
      <div role="status" data-public-dig-outcome="">{outcome}</div>
      <p className="v4PubDigOpen">{openIt}</p>
    </div>
  );
}

/** journey-f21 / dig-f25: the site's one Undo note on a public page, which sits outside the V4 pages' own layout. */
export function V4PublicDigNotes({ catalog, locale }: Readonly<{ catalog: MessageCatalog; locale: string }>) {
  return (
    <div className="v4Root v4PublicLane v4PubNotes">
      <V4DigUndoHost catalog={catalog} locale={locale} />
    </div>
  );
}
