"use client";

import Link from "next/link";
import { PlanIdSchema } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
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
  switch (room.scope) {
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
      return exhaustive(room.scope);
  }
}

/**
 * Which sentence the ask page shows (budget spec §1.3, paid-plans spec §2.9):
 *  - FITS: nothing.
 *  - CLOSE: B (the site's day) or P5 (a person window).
 *  - FULL: A (the site's day), or P1, P2, P3 or P4 (Free's month); on the
 *    highest plan, P1–P3 without the upgrade clause and without the link.
 *  - ALREADY_WAITING: D, with a link to the waiting debate.
 * None shows a figure or an internal.
 */
export function roomSentence(room: AskRoom | null): RoomSentence | null {
  if (room === null) return null;
  switch (room.room) {
    case "FITS":
      return null;
    case "CLOSE":
      return Object.freeze({
        key: room.scope === null || room.scope === "SITE_DAY" ? "newDebate.room.siteClose" : "newDebate.room.personClose",
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
      return exhaustive(room.room);
  }
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
        <Link className="roomNoticeLink" href={`/debate/${encodeURIComponent(sentence.waitingRunRef)}`}>
          {t(catalog, "newDebate.room.openWaiting")}
        </Link>
      )}
    </div>
  );
}
