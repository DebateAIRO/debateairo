"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AskRoom, AskRoomQuery } from "../billing/room.js";
import type { MessageCatalog } from "../i18n/translate.js";
import { effectiveDigMode, v4RoomQuery } from "./askConfig.js";
import { digButtonLabel, digPeriodLine, digWaitLine, digWaitOf, shareOfTarget, type DigShares, type V4DigQuota } from "./digQuota.js";
import { readDigRoom, readDigShare } from "./money.js";
import { useQuotaRefresh } from "./quotaPulse.js";
import type { DigMode, DigTarget, ReadingLevel } from "./types.js";

/*
 * The map page's dig buttons and their quota (owner's screen review, 3 Nov 2026), worked out from the room reads only.
 *  - dig-f5: each button's share comes from its own check with the server. The page's main room read (useV4Ask) is for the
 *    dig it would send now: the person's picks when there are some, else a whole path or one open question. While picks
 *    wait, a second read asks the share of a whole path (or one open question), so another place's "Dig here" never shows
 *    the picks' share. That read is made only when the main read names a share at all, and again only when what it asks
 *    changes.
 *  - dig-f11 / map-f9: after something used quota (lib/v4/quotaPulse.ts: a dig sent or finished, the question finished)
 *    and when the person comes back to the tab, the main read is asked again, so the buttons grey as soon as new digs
 *    wait for a reset, not after a refused press.
 * Each read costs no AI call and no quota. Nothing is kept anywhere.
 */

/** The plan the room read was for, as useV4Ask decides it (the server's plan; team funding counts as paid). */
function planTierOf(room: AskRoom): "free" | "premium" {
  if ("funding" in room) return "premium";
  return room.plan_id === null || room.plan_id === "FREE" ? "free" : "premium";
}

/**
 * The room query of a dig, as useV4Ask asks it: the main read's own settings, the dig's parent and mode, and how many
 * picks it combines (0: a whole path or one open question, which names no picks).
 */
export function digRoomQuery(room: AskRoom, parentRunId: string, mode: DigMode, readingLevel: ReadingLevel, picks: number): AskRoomQuery {
  const planTier = planTierOf(room);
  return {
    ...v4RoomQuery(mode, readingLevel, {
      planTier,
      shapeSettings: room.shape_settings === true,
      lengthSettings: room.length_settings === true,
      ...(room.settings_version === undefined ? {} : { settingsVersion: room.settings_version })
    }),
    dig_parent: parentRunId,
    dig_mode: effectiveDigMode(mode, planTier),
    ...(picks > 0 ? { dig_picks: picks } : {})
  };
}

function shareOf(room: AskRoom | null): number | null {
  const percent = room?.dig_share_percent;
  return percent === undefined || percent <= 0 ? null : percent;
}

/** The main read, asked again after each quota moment: the newest answer for the same question, else the page's own. */
function useLiveDigRoom(room: AskRoom | null, mainKey: string | null): AskRoom | null {
  const [fresh, setFresh] = useState<Readonly<{ base: AskRoom; key: string; room: AskRoom }> | null>(null);
  const refresh = useCallback(() => {
    if (room === null || mainKey === null) return;
    const base = room;
    void readDigRoom(JSON.parse(mainKey) as AskRoomQuery).then((next) => {
      if (next !== null) setFresh({ base, key: mainKey, room: next });
    });
  }, [room, mainKey]);
  useQuotaRefresh(refresh, mainKey !== null);
  // A new read of the page's own (another question: other picks, another mode) replaces anything read here.
  return fresh !== null && fresh.base === room && fresh.key === mainKey ? fresh.room : room;
}

/** dig-f5: the shares per kind of dig, from the main read and, while picks wait, a second read for a whole dig. */
function useDigShares(room: AskRoom | null, parentRunId: string | null, picks: number, mode: DigMode, readingLevel: ReadingLevel): DigShares {
  const main = shareOf(room);
  const wholeKey = useMemo(
    () => (room === null || parentRunId === null || picks === 0 || main === null
      ? null : JSON.stringify(digRoomQuery(room, parentRunId, mode, readingLevel, 0))),
    [room, parentRunId, picks, main, mode, readingLevel]
  );
  const [whole, setWhole] = useState<Readonly<{ key: string; percent: number | null }> | null>(null);
  useEffect(() => {
    if (wholeKey === null) return undefined;
    let active = true;
    void readDigShare(JSON.parse(wholeKey) as AskRoomQuery).then((percent) => {
      if (active) setWhole({ key: wholeKey, percent });
    });
    return () => {
      active = false;
    };
  }, [wholeKey]);
  const wholeShare = parentRunId === null ? null : picks === 0 ? main : whole !== null && whole.key === wholeKey ? whole.percent : null;
  const picksShare = parentRunId === null || picks === 0 ? null : main;
  return useMemo(() => Object.freeze({ whole: wholeShare, picks: picksShare }), [wholeShare, picksShare]);
}

/**
 * What the map page lends its dig buttons (the panel, the tray and the phone's pinned bar), and the room read it works
 * from (the page's own, or the newer one read after a quota moment).
 */
export function useDigQuota(input: Readonly<{
  /** The page's main room read (useV4Ask: for the picks when there are some). */
  room: AskRoom | null;
  /** The debate a dig would dig (null: no dig can start from this map). */
  parentRunId: string | null;
  /** How many picks wait (0: the main read is for a whole path or one open question). */
  picks: number;
  mode: DigMode;
  readingLevel: ReadingLevel;
  catalog: MessageCatalog;
  locale: string;
}>): Readonly<{ quota: V4DigQuota; room: AskRoom | null }> {
  const { parentRunId, picks, mode, readingLevel, catalog, locale } = input;
  const mainKey = input.room === null || parentRunId === null
    ? null : JSON.stringify(digRoomQuery(input.room, parentRunId, mode, readingLevel, picks));
  const room = useLiveDigRoom(input.room, mainKey);
  const shares = useDigShares(room, parentRunId, picks, mode, readingLevel);
  const quota = useMemo<V4DigQuota>(() => {
    const wait = digWaitOf(room);
    const share = (target: DigTarget): number | null => (wait === null ? shareOfTarget(target, shares) : null);
    const anyShare = shares.whole !== null || shares.picks !== null;
    return Object.freeze({
      label: (target: DigTarget, tray?: boolean) => digButtonLabel({ target, share: share(target), wait, catalog, locale, tray: tray === true }),
      share,
      periodLine: wait === null && anyShare ? digPeriodLine(room, catalog) : null,
      waitLine: digWaitLine(room, catalog, locale)
    });
  }, [room, shares, catalog, locale]);
  return { quota, room };
}
