"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dugIds, reportMoment, starOf, type ReportMoment } from "@/lib/v4/mapLooks";
import { restarMap } from "@/lib/v4/mapModel";
import type { DigView, V4Map, V4Selection } from "@/lib/v4/types";
import { useRevealOnce } from "@/lib/v4/useReveal";
import { swipeTarget, usePositionFlash, useShortWindow, useSideSwipe } from "./V4MapPlace";

/*
 * The map as the debate page shows it (V4 screen review, 3 Nov), moved out of V4DebateClient so the page only wires it
 * (the review of 4 Nov). Memory only: nothing is kept in the browser.
 *  - map-f5 / journey-f12: the star sits on one open question no dig covers yet, and moves on when that one is dug.
 *  - dig-f29: "the starred question" is the one the map starred first, before any dig moved the star; the report moment
 *    reads it.
 *  - dig-d4 B / map-d5: each card with unopened news turns over once in this visit.
 *  - map-d1: the answer card folds when another question is open or the window is short; a tap unfolds it until the person
 *    opens another question.
 *  - map-d3 B: on the phone, a sideways swipe moves to the next or the previous path, and says where it landed.
 */
export type MapView = Readonly<{
  /** The map with its star moved off what is dug (null until the map is served). */
  shownMap: V4Map | null;
  /** The cards that turn over now (dig-d4 B). */
  reveal: ReadonlySet<string>;
  shortWindow: boolean;
  /** The person unfolded the answer card while another question is open (or the window is short). */
  answerUnfolded: boolean;
  setAnswerUnfolded: (unfolded: boolean) => void;
  /** "2 of 5" for a moment after a swipe (map-d3 B). */
  position: Readonly<{ n: number; total: number }> | null;
  swipe: ReturnType<typeof useSideSwipe>;
  /** dig-f29: whether this is a good time to write the report (null until the map is served). */
  moment: ReportMoment;
}>;

export function useMapView(input: Readonly<{
  map: V4Map | null;
  digs: readonly DigView[];
  /** The places with news not opened yet. */
  changed: ReadonlySet<string>;
  shownSelection: V4Selection;
  select: (selection: V4Selection, viaKeyboard: boolean) => void;
}>): MapView {
  const { map, digs, changed, shownSelection, select } = input;
  const dugKey = [...dugIds(digs)].sort().join("|");
  const shownMap = useMemo(() => (map === null ? null : restarMap(map, new Set(dugKey.length === 0 ? [] : dugKey.split("|")))), [map, dugKey]);
  const firstStarId = useMemo(() => (map === null ? null : starOf(map)?.id ?? null), [map]);
  const reveal = useRevealOnce(changed);
  const shortWindow = useShortWindow();
  const [answerUnfolded, setAnswerUnfolded] = useState(false);
  useEffect(() => {
    setAnswerUnfolded(false);
  }, [shownSelection]);
  const [position, flashPosition] = usePositionFlash();
  const swipe = useSideSwipe(useCallback((step: 1 | -1) => {
    if (shownMap === null) return;
    const next = swipeTarget(shownMap, digs, shownSelection, step);
    if (next === null) return;
    select(next.selection, false);
    if (next.n > 0) flashPosition({ n: next.n, total: next.total });
  }, [shownMap, digs, shownSelection, select, flashPosition]));
  const moment = map === null ? null : reportMoment(map, digs, firstStarId);
  return { shownMap, reveal, shortWindow, answerUnfolded, setAnswerUnfolded, position, swipe, moment };
}
