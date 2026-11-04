"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PlanIdSchema } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { READING_LEVELS } from "@/lib/v4/types";
import { RESET_TIME_MARK, ResetSentence } from "./ResetSentence";

type RoomSentence = Readonly<{
  key: string;
  at: string | null;
  upgrade: boolean;
  waitingRunRef: string | null;
}>;

/**
 * The highest plan. Plans are sealed in price order FREE, PLUS, PRO, MAX (B4a's
 * parser refuses any other order), and `PlanIdSchema` lists them the same way,
 * so its last option has nothing above it to upgrade to.
 */
const TOP_PLAN = PlanIdSchema.options[PlanIdSchema.options.length - 1];

/**
 * A person window that is FULL. The owner's rule is "out of credit: upgrade
 * only" (spec §1.10), so the sentence offers an upgrade and the plans link,
 * except to a person already on the highest plan, who reads the same sentence
 * without its "Or upgrade…" clause and gets no link.
 */
function timed(key: string, topPlanKey: string, room: AskRoom): RoomSentence | null {
  if (room.resets_at === null) return null;
  const top = room.plan_id === TOP_PLAN;
  return Object.freeze({ key: top ? topPlanKey : key, at: room.resets_at, upgrade: !top, waitingRunRef: null });
}

function fullSentence(room: AskRoom): RoomSentence | null {
  // Final review Part 1b, Important 1: only the person's own running debates
  // fill their windows, so the question starts as soon as one of them finishes.
  // One sentence, with no time and no upgrade: nothing was used up.
  if (room.waits_for === "OWN_DEBATES") {
    return Object.freeze({ key: "newDebate.room.ownDebatesFull", at: null, upgrade: false, waitingRunRef: null });
  }
  // Decisions 14 and 24: the team's month has no time to name. An owner can raise it at any moment, and the sentence says so itself.
  if ("funding" in room && room.scope === "TEAM_MONTH") return Object.freeze({key:"newDebate.room.internalTeamFull",at:null,upgrade:false,waitingRunRef:null});
  if ("funding" in room) return Object.freeze({key:room.scope === "PERSON_GRANT" ? "newDebate.room.internalGrantFull" : "newDebate.room.internalWindowFull",at:room.scope === "PERSON_GRANT" ? room.funding.expires_at : room.resets_at,upgrade:false,waitingRunRef:null});
  const scope = room.scope;
  switch (scope) {
    case null:
    case "SITE_DAY":
      return Object.freeze({ key: "newDebate.room.siteFull", at: null, upgrade: false, waitingRunRef: null });
    case "PERSON_DAY":
      return timed("newDebate.room.personDayFull", "newDebate.room.personDayFullTopPlan", room);
    case "PERSON_WEEK":
      return timed("newDebate.room.personWeekFull", "newDebate.room.personWeekFullTopPlan", room);
    case "PERSON_MONTH":
      return timed(
        room.plan_id === "FREE" ? "newDebate.room.freeMonthFull" : "newDebate.room.personMonthFull",
        "newDebate.room.personMonthFullTopPlan",
        room
      );
    default:
      return exhaustive(scope);
  }
}

/**
 * Which sentence the ask page shows (budget spec §1.3, paid-plans spec §2.9):
 *  - FITS: nothing.
 *  - CLOSE: B (the site's day) or P5 (a person window).
 *  - FULL: A (the site's day), or P1, P2, P3 or P4 (Free's month); on the
 *    highest plan, P1–P3 without the upgrade clause and without the link.
 *    When the person's own running debates are all that fill their windows
 *    (`waits_for: OWN_DEBATES`), one sentence instead of P1–P4: no time, no
 *    upgrade.
 *  - ALREADY_WAITING: D, with a link to the waiting debate.
 * None shows a figure or an internal.
 */
export function roomSentence(room: AskRoom | null): RoomSentence | null {
  if (room === null) return null;
  const state = room.room;
  switch (state) {
    case "FITS":
      return null;
    case "CLOSE":
      return Object.freeze({
        key: room.scope === null || room.scope === "SITE_DAY" ? "newDebate.room.siteClose" : "funding" in room ? "newDebate.room.internalClose" : "newDebate.room.personClose",
        at: null,
        upgrade: false,
        waitingRunRef: null
      });
    case "FULL":
      return fullSentence(room);
    case "ALREADY_WAITING":
      return room.resets_at === null
        ? null
        : Object.freeze({ key: "newDebate.room.alreadyWaiting", at: room.resets_at, upgrade: false, waitingRunRef: room.waiting_run_ref });
    default:
      return exhaustive(state);
  }
}

/**
 * Where "Open the waiting debate" leads (V4 review ask-f11, read-f4, public-f21). The notice is shared by the classic
 * pages (/new, the home composer) and the V4 pages, so it reads the address it sits on: on a V4 page (/v4 and below) the
 * link opens the waiting debate's V4 map, at the reading level the address carries (`?level=`, the parameter every V4
 * link carries, lib/v4/storage.ts); anywhere else, the classic debate page as before. `address` is the path with its
 * query ("" while it is unknown, e.g. on the server).
 */
export function waitingDebateHref(runRef: string, address: string): string {
  const run = encodeURIComponent(runRef);
  const queryAt = address.indexOf("?");
  const path = queryAt === -1 ? address : address.slice(0, queryAt);
  if (path !== "/v4" && !path.startsWith("/v4/")) return `/debate/${run}`;
  const level = new URLSearchParams(queryAt === -1 ? "" : address.slice(queryAt + 1)).get("level");
  const known = READING_LEVELS.find((option) => option === level);
  return known === undefined ? `/v4/debate/${run}` : `/v4/debate/${run}?level=${known}`;
}

/** The address, read from window.location (as lib/v4/useReadingLevel.ts does) and re-read on Back/Forward. */
function onTraversal(changed: () => void): () => void {
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
}
const readAddress = (): string => `${window.location.pathname}${window.location.search}`;
const noAddress = (): string => "";

function WaitingDebateLink({ runRef, label }: Readonly<{ runRef: string; label: string }>) {
  const address = useSyncExternalStore(onTraversal, readAddress, noAddress);
  return <Link className="roomNoticeLink" href={waitingDebateHref(runRef, address)}>{label}</Link>;
}

export function RoomNotice({ room, catalog, locale }: { room: AskRoom | null; catalog: MessageCatalog; locale: string }) {
  const sentence = roomSentence(room);
  if (sentence === null) return null;
  return (
    <div className="roomNotice" role="status" data-room={room?.room}>
      {sentence.at === null ? (
        <span className="roomNoticeText">{t(catalog, sentence.key)}</span>
      ) : (
        <ResetSentence
          className="roomNoticeText"
          text={t(catalog, sentence.key, { time: RESET_TIME_MARK })}
          at={sentence.at}
          locale={locale}
        />
      )}
      {sentence.upgrade ? (
        <Link className="roomNoticeLink" href="/pricing">{t(catalog, "newDebate.room.upgradeLink")}</Link>
      ) : null}
      {sentence.waitingRunRef === null ? null : (
        <WaitingDebateLink runRef={sentence.waitingRunRef} label={t(catalog, "newDebate.room.openWaiting")} />
      )}
    </div>
  );
}
