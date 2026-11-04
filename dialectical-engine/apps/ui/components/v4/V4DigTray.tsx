"use client";

import { useEffect, useRef, type RefObject } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { digButtonLabel } from "@/lib/v4/digDock";
import type { MoneyLine } from "@/lib/v4/money";
import { picksMax, type V4PlanTier } from "@/lib/v4/suggestions";
import type { DigMode, DigTarget } from "@/lib/v4/types";
import { V4PickChips } from "./V4ChoiceChips";
import { V4MoneyLines } from "./V4DigSuggest";
import { pathTitle, TitleText } from "./V4MapTree";

/*
 * V4 screen review, 3 Nov 2026 (OWNER-PICKS-2026-11-03.md: dig-f4, map-f14, map-d4 A): the tray of picks.
 *  - On a computer it appears only from the second pick, docked at the foot of the panel column (never floating over the
 *    map or the panel), under the panel's own pinned dig block. When that block already digs these picks, the tray offers
 *    no second dig button, only the picks and Clear.
 *  - A phone has no tray: its pinned bar carries the picks, and the Map sheet lists them with Clear (V4PicksList).
 * The picks show as chips, never as a count (journey-f23); on Free no mode word (dig-f8). It appears at once with the
 * shared soft highlight (journey-d1: no move of its own). Nothing here fetches or stores anything.
 */

type PicksTarget = Extract<DigTarget, { kind: "picks" }>;

/**
 * map-d4 A: the docked tray's real height on the panel column (--v4-dock-room), so the panel's pinned dig block sits
 * right above it while the panel scrolls; removed when the tray goes.
 */
function useDockRoom(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    const column = element?.parentElement ?? null;
    if (element === null || column === null) return undefined;
    const set = (): void => column.style.setProperty("--v4-dock-room", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    set();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      column.style.removeProperty("--v4-dock-room");
    };
  }, [ref]);
}

/** The path the picks are on, then the mode word (left out on Free, which has no Quick look / Thorough choice). */
function TrayText(props: Readonly<{ target: PicksTarget; planTier: V4PlanTier; mode: DigMode | null; catalog: MessageCatalog }>) {
  const { target, catalog } = props;
  const mode = props.planTier === "free" || props.mode === null ? null : t(catalog, `v4.digMode.${props.mode}`);
  if (target.path === null && mode === null) return null;
  return (
    <p className="v4DebTrayText">
      {target.path !== null ? <TitleText title={pathTitle(target.path, catalog, 40)} catalog={catalog} /> : null}
      {target.path !== null && mode !== null ? " · " : null}
      {mode}
    </p>
  );
}

/** dig-f4: the docked tray on a computer (the page shows it only from the second pick). */
export function V4DigTray(props: Readonly<{
  target: PicksTarget;
  planTier: V4PlanTier;
  mode: DigMode;
  money: readonly MoneyLine[];
  /** False when the panel's own pinned dig block already digs these picks: the tray then offers no second button. */
  withDig: boolean;
  onDig: () => void;
  onClear: () => void;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { target, catalog } = props;
  const ref = useRef<HTMLElement | null>(null);
  useDockRoom(ref);
  return (
    <section ref={ref} className="v4DebTray v4DebTrayDock v4Highlight" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={target.picks} label={t(catalog, "v4.map.picked")} />
      <TrayText target={target} planTier={props.planTier} mode={props.mode} catalog={catalog} />
      <p className="v4DebTrayHint v4Muted">
        {t(catalog, "v4.suggest.onePath")}
        {props.planTier === "free" ? <>{" "}{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</> : null}
      </p>
      {/* The share is said once, beside the button that spends it. */}
      {props.withDig ? <V4MoneyLines lines={props.money} catalog={catalog} /> : null}
      <div className="v4DebTrayActions">
        {props.withDig ? (
          <button type="button" className="v4Btn v4BtnPrimary" onClick={props.onDig}>
            {digButtonLabel(target, false, "v4.panel.dig", catalog, props.locale)}
          </button>
        ) : null}
        <button type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  );
}

/**
 * dig-f4 (phone): the Map sheet lists the picks with Clear, so the outline is also the tray; the pinned bar under the
 * sheet carries the dig. From the first pick, since a phone has no tray of its own.
 */
export function V4PicksList(props: Readonly<{ target: PicksTarget; planTier: V4PlanTier; onClear: () => void; catalog: MessageCatalog }>) {
  const { target, catalog } = props;
  return (
    <section className="v4DebTray v4DebTrayList" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={target.picks} label={t(catalog, "v4.map.picked")} />
      <TrayText target={target} planTier={props.planTier} mode={null} catalog={catalog} />
      <div className="v4DebTrayActions">
        <button type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  );
}
