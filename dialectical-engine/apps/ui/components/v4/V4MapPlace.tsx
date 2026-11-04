"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigView, V4Map, V4Path, V4Selection } from "@/lib/v4/types";
import { digTitle, pathTitle, resolveSelection, shortText, TitleText, type ResolvedSelection, type Title } from "./V4MapTree";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 screen review (owner picks of 3 Nov): where the person is on the map, on a phone and wherever the window is short.
 *   - map-f7: a slim bar pinned under the header: the where-you-are line on one line (earlier parts shortened, the last
 *     part bold) and one dot per level, the current one filled; on deep chains the dots shorten to the first, "…" and the
 *     last three. A screen reader hears "You are in: Whole-system costs, level 2 of 3".
 *   - map-d3 B: in the same bar, a live minimap: one tiny four-shade bar per first-level path, the current one outlined;
 *     as digs finish the tiny bars change shade. Tapping it opens the Map sheet. Swiping sideways (not from the screen's
 *     edge) moves to the next or the previous path and says "3 of 5" for a moment (a position whose total never grows).
 *   - map-f23: under the answer on "Your question", "The paths we looked into": one row per first-level path with its
 *     short label, its bar and the star where it is; a row opens that path.
 * In memory only: nothing is stored.
 */

/** map-f7: the minimap shows at most this many tiny bars, then "+". */
const MINIMAP_MAX = 7;
/** A swipe: at least this far sideways, at most this far up or down, and not from within this distance of an edge. */
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_DRIFT_PX = 40;
const SWIPE_EDGE_PX = 24;
/** How long "3 of 5" shows after a swipe. */
const POSITION_SHOWN_MS = 1_500;
/** map-d1: a window shorter than this folds the answer card into its line. */
const SHORT_QUERY = "(max-height: 699px)";

/** The path a selection sits on (the path itself, or the path its open question or dig hangs under); null: the question. */
export function pathOfPlace(resolved: ResolvedSelection): V4Path | null {
  if (resolved.kind === "path") return resolved.path;
  if (resolved.kind === "open") return resolved.path;
  if (resolved.kind === "dig") return resolved.home.path;
  return null;
}

/** The where-you-are line, top first: each part's selection and title (the question itself first). */
export function placeParts(resolved: ResolvedSelection, map: V4Map, catalog: MessageCatalog, max = 28): readonly Readonly<{ id: V4Selection; title: Title }>[] {
  const parts: { id: V4Selection; title: Title }[] = [{ id: "root", title: { text: t(catalog, "v4.panel.crumbRoot"), ai: false, more: 0 } }];
  const path = pathOfPlace(resolved);
  if (path !== null) parts.push({ id: `path:${path.id}`, title: pathTitle(path, catalog, max) });
  if (resolved.kind === "open") {
    parts.push({ id: `open:${resolved.question.id}`, title: { text: shortText(resolved.question.text, max), ai: true, more: 0 } });
  }
  if (resolved.kind === "dig") parts.push({ id: `dig:${resolved.dig.link.childRunId}`, title: digTitle(resolved.dig, catalog, max, map) });
  return parts;
}

/**
 * map-f7: the level the person is on and how many levels the chain has. A dig's own map sits below the digs above it
 * (each adds its path and itself); this map adds the question, its paths and what hangs under them.
 */
export function depthOf(resolved: ResolvedSelection, map: V4Map, digs: readonly DigView[]): Readonly<{ level: number; total: number }> {
  const above = Math.max(0, map.digLevel ?? 0) * 2;
  const leavesUnderPaths = map.paths.some((path) => path.open.length > 0) || digs.length > 0;
  const local = map.paths.length === 0 ? 1 : leavesUnderPaths ? 3 : 2;
  const here = resolved.kind === "root" ? 1
    : resolved.kind === "path" ? 2
      : pathOfPlace(resolved) === null ? 2 : 3;
  return { level: above + here, total: above + Math.max(local, here) };
}

/** The dots of a chain: every level, or on a deep one the first, "…" and the last three. */
export function depthDots(level: number, total: number): readonly ("on" | "off" | "gap")[] {
  const dot = (n: number): "on" | "off" => (n === level ? "on" : "off");
  if (total <= 5) return Array.from({ length: total }, (_, at) => dot(at + 1));
  return [dot(1), "gap", dot(total - 2), dot(total - 1), dot(total)];
}

/** map-f7 / map-d3 B: the phone's pinned slim bar. */
export function V4WhereBar(props: Readonly<{
  map: V4Map;
  digs: readonly DigView[];
  selected: V4Selection;
  onSelect: (selection: V4Selection, viaKeyboard: boolean) => void;
  onOpenMap: () => void;
  /** "3 of 5" after a swipe (null: nothing to say). */
  position: Readonly<{ n: number; total: number }> | null;
  catalog: MessageCatalog;
}>) {
  const { map, digs, catalog } = props;
  const resolved = resolveSelection(map, digs, props.selected);
  const parts = placeParts(resolved, map, catalog);
  const last = parts[parts.length - 1]!;
  const { level, total } = depthOf(resolved, map, digs);
  const here = pathOfPlace(resolved);
  const shown = map.paths.slice(0, MINIMAP_MAX);
  return (
    <div className="v4WhereBar">
      <p className="v4SrOnly" role="status">
        {t(catalog, "v4.phone.youAreIn", { place: last.title.text, n: level, total })}
      </p>
      <nav className="v4WhereLine" aria-label={t(catalog, "v4.panel.crumbsLabel")}>
        <ol>
          {parts.map((part, index) => {
            const isLast = index === parts.length - 1;
            return (
              <li key={part.id} className={isLast ? "v4WhereLast" : undefined}>
                {isLast
                  ? <span aria-current="location"><TitleText title={part.title} catalog={catalog} /></span>
                  : (
                    <button type="button" className="v4Link v4WherePart" onClick={() => props.onSelect(part.id, false)}>
                      <TitleText title={part.title} catalog={catalog} />
                    </button>
                  )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="v4WhereRow">
        {shown.length > 0 ? (
          <button type="button" className="v4Mini" onClick={props.onOpenMap} aria-label={t(catalog, "v4.phone.openMap")} aria-haspopup="dialog">
            <span className="v4MiniBars" aria-hidden="true">
              {shown.map((path) => (
                <span key={path.id} className={`v4MiniBar${here?.id === path.id ? " v4MiniHere" : ""}`}>
                  <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
                </span>
              ))}
              {map.paths.length > MINIMAP_MAX ? <span className="v4MiniMore">+</span> : null}
            </span>
          </button>
        ) : null}
        <span className="v4WhereDots" aria-hidden="true">
          {depthDots(level, total).map((dot, index) => (dot === "gap"
            ? <span key={index} className="v4WhereGap">…</span>
            : <span key={index} className={`v4WhereDot${dot === "on" ? " v4WhereDotOn" : ""}`} />))}
        </span>
        {props.position === null ? null : (
          <span className="v4WherePosition" role="status">{t(catalog, "v4.phone.position", { n: props.position.n, total: props.position.total })}</span>
        )}
      </div>
    </div>
  );
}

/** map-f23: "The paths we looked into", under the answer on the phone's "Your question" screen. */
export function V4PathList(props: Readonly<{
  map: V4Map;
  onSelect: (selection: V4Selection, viaKeyboard: boolean) => void;
  catalog: MessageCatalog;
}>) {
  const { map, catalog } = props;
  if (map.paths.length === 0) return null;
  return (
    <section className="v4PathList" aria-labelledby="v4-path-list-title">
      <h2 id="v4-path-list-title" className="v4PathListTitle">{t(catalog, "v4.phone.pathsTitle")}</h2>
      <ul className="v4PathListRows">
        {map.paths.map((path) => {
          const star = path.open.some((question) => question.star);
          return (
            <li key={path.id}>
              <button type="button" className="v4PathListRow" onClick={(event) => props.onSelect(`path:${path.id}`, event.detail === 0)}>
                <span className="v4PathListLabel">
                  {star ? <span className="v4MapStar" aria-hidden="true">★ </span> : null}
                  <TitleText title={pathTitle(path, catalog, 60)} catalog={catalog} />
                  {star ? <span className="v4SrOnly">{t(catalog, "v4.map.starHint")}</span> : null}
                </span>
                <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The selection one swipe away: the next or the previous first-level path (from the question itself, the first one). */
export function swipeTarget(map: V4Map, digs: readonly DigView[], selected: V4Selection, step: 1 | -1): Readonly<{ selection: V4Selection; n: number; total: number }> | null {
  const total = map.paths.length;
  if (total === 0) return null;
  const at = (() => {
    const path = pathOfPlace(resolveSelection(map, digs, selected));
    return path === null ? -1 : map.paths.findIndex((candidate) => candidate.id === path.id);
  })();
  const next = at + step;
  if (next < -1 || next >= total) return null;
  if (next === -1) return { selection: "root", n: 0, total };
  return { selection: `path:${map.paths[next]!.id}`, n: next + 1, total };
}

/** map-d3 B: a sideways swipe on the phone's question screen (not from the screen's edge, where the phone's own back gesture is). */
export function useSideSwipe(onSwipe: (step: 1 | -1) => void): Readonly<{
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
}> {
  const start = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>): void => {
    const touch = event.touches[0];
    if (touch === undefined || event.touches.length > 1) {
      start.current = null;
      return;
    }
    const width = window.innerWidth;
    start.current = touch.clientX < SWIPE_EDGE_PX || touch.clientX > width - SWIPE_EDGE_PX ? null : { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchEnd = useCallback((event: TouchEvent<HTMLElement>): void => {
    const from = start.current;
    start.current = null;
    const touch = event.changedTouches[0];
    if (from === null || touch === undefined) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > SWIPE_MAX_DRIFT_PX) return;
    // A swipe to the left moves on to the next path, as a page turns.
    onSwipe(dx < 0 ? 1 : -1);
  }, [onSwipe]);
  return { onTouchStart, onTouchEnd };
}

/** "3 of 5" for a moment after a swipe (in memory only). */
export function usePositionFlash(): readonly [Readonly<{ n: number; total: number }> | null, (position: Readonly<{ n: number; total: number }>) => void] {
  const [position, setPosition] = useState<Readonly<{ n: number; total: number }> | null>(null);
  useEffect(() => {
    if (position === null) return;
    const timer = window.setTimeout(() => setPosition(null), POSITION_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [position]);
  return [position, setPosition];
}

/** map-d1: whether the window is short (under about 700 px), so the answer card starts folded. */
export function useShortWindow(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(SHORT_QUERY);
    const update = (): void => setShort(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return short;
}
