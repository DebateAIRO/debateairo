"use client";

import { useEffect, useId, useRef, useState, type Ref, type RefObject } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { V4DigQuota } from "@/lib/v4/digQuota";
import type { MoneyLine } from "@/lib/v4/money";
import { picksMax, type V4PlanTier } from "@/lib/v4/suggestions";
import type { DigMode, DigTarget } from "@/lib/v4/types";
import { V4PickChips } from "./V4ChoiceChips";
import { V4MoneyLines } from "./V4DigSuggest";
import { pathTitle, TitleText } from "./V4MapTree";
import { V4ShareChange } from "./V4ShareChange";

/*
 * The tray of picks on the map page (row D decision 1), moved out of V4DebateClient so the page only wires it.
 * V4 screen review, 3 Nov 2026 (OWNER-PICKS-2026-11-03.md: dig-f4, map-f14, map-d4 A, journey-f13, dig-f5, dig-f11):
 *  - On a computer it appears only from the second pick (while new digs wait for a reset, from the first: public-d4 A, it
 *    is then the only way to keep a pick), docked at the foot of the panel column (never floating over the map or the
 *    panel), under the panel's own pinned dig block. When that block already digs these picks, the tray offers no second
 *    dig button, only the picks and Clear (lib/v4/digDock.ts).
 *  - A phone has no tray: its pinned bar carries the picks, and the Map sheet lists them with Clear (V4PicksList).
 *  - Its button reads "Dig into these · up to 5%" ("Dig into your pick" for one), the picks' own share from their own
 *    room read, through the one dig-button helper of lib/v4/digQuota.ts (useDigQuota); a share that changed shows its grey
 *    mark for 2 seconds (journey-f8). While new digs wait for a reset it stays, greyed with the reset time, and the line
 *    beside it says why; pressing it starts nothing (dig-f11, journey-f14).
 * It names the path its picks are on (owner Q-D1: one path per dig) and Free's cap. The picks show as chips, never as a
 * count (journey-f23); on Free no mode word (dig-f8). It appears at once with the shared soft highlight (journey-d1: no
 * move of its own). Nothing here fetches or stores anything.
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

/** dig-f4: the docked tray on a computer (the page shows it only from the second pick, or the first while digs wait). */
export function V4DigTray(props: Readonly<{
  target: PicksTarget;
  planTier: V4PlanTier;
  mode: DigMode;
  money: readonly MoneyLine[];
  /** The dig buttons' quota words (lib/v4/useDigQuota.ts): the label, the share and the waiting line. */
  quota: V4DigQuota;
  /**
   * report-d2: while the report waits for digs or is written, digging rests: the button is disabled and this line says why
   * ("Digging opens again when your report is written."). Absent or null: digging can start.
   */
  rest?: string | null;
  /** public-f26: on a debate whose page is public, "This adds to your public debate." (null or absent: nothing). */
  publicNote?: string | null;
  /** False when the panel's own pinned dig block already digs these picks: the tray then offers no second button. */
  withDig: boolean;
  onDig: () => void;
  onClear: () => void;
  /** The Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  clearRef?: Ref<HTMLButtonElement>;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { target, catalog, quota } = props;
  const ref = useRef<HTMLElement | null>(null);
  useDockRoom(ref);
  const waiting = quota.waitLine !== null;
  const rest = props.rest ?? null;
  // journey-f14 / dig-f11 (the wave-2 review, 4 Nov): one pattern with the panel's button: greyed but focusable, pointing at
  // the visible line that says why, and a press gives that line the highlight again.
  const reasonId = useId();
  const [replay, setReplay] = useState(0);
  const greyed = waiting || rest !== null;
  return (
    <section ref={ref} className="v4DebTray v4DebTrayDock v4Highlight" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={target.picks} label={t(catalog, "v4.map.picked")} />
      <TrayText target={target} planTier={props.planTier} mode={props.mode} catalog={catalog} />
      <p className="v4DebTrayHint v4Muted">
        {t(catalog, "v4.suggest.onePath")}
        {props.planTier === "free" ? <>{" "}{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</> : null}
      </p>
      {/* The share is said once, beside the button that spends it. dig-f11 / journey-f14: while new digs wait, the greyed
          button carries the reset time and this line says why. */}
      {props.withDig
        ? waiting && rest === null
          ? <p key={replay} id={reasonId} className={`v4PanelHint v4DigWaitLine${replay > 0 ? " v4Highlight" : ""}`} role="note">{quota.waitLine}</p>
          : waiting ? null : <V4MoneyLines lines={props.money} catalog={catalog} />
        : null}
      {props.publicNote === null || props.publicNote === undefined ? null : <p className="v4DebTrayPublic">{props.publicNote}</p>}
      <div className="v4DebTrayActions">
        {props.withDig ? (
          <span className="v4DigBtnRow">
            <button
              type="button"
              className={`v4Btn v4BtnPrimary${greyed ? " v4DigWaiting" : ""}`}
              aria-disabled={greyed ? "true" : undefined}
              aria-describedby={greyed ? reasonId : undefined}
              onClick={() => {
                if (greyed) setReplay((count) => count + 1);
                else props.onDig();
              }}
            >
              {quota.label(target, true)}
            </button>
            <V4ShareChange share={quota.share(target)} subject={`path:${target.path?.id ?? "root"}`} />
          </span>
        ) : null}
        <button ref={props.clearRef} type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
      {props.withDig && rest !== null ? (
        <p key={replay} id={reasonId} className={`v4DebTrayHint v4Muted${replay > 0 ? " v4Highlight" : ""}`} data-dig-rest="">{rest}</p>
      ) : null}
    </section>
  );
}

/**
 * dig-f4 (phone): the Map sheet lists the picks with Clear, so the outline is also the tray; the pinned bar under the
 * sheet carries the dig. From the first pick, since a phone has no tray of its own.
 */
export function V4PicksList(props: Readonly<{
  target: PicksTarget;
  planTier: V4PlanTier;
  onClear: () => void;
  /** The Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  clearRef?: Ref<HTMLButtonElement>;
  /** public-f26: on a debate whose page is public, "This adds to your public debate." (null or absent: nothing). */
  publicNote?: string | null;
  catalog: MessageCatalog;
}>) {
  const { target, catalog } = props;
  return (
    <section className="v4DebTray v4DebTrayList" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={target.picks} label={t(catalog, "v4.map.picked")} />
      <TrayText target={target} planTier={props.planTier} mode={null} catalog={catalog} />
      {props.publicNote === null || props.publicNote === undefined ? null : <p className="v4DebTrayPublic">{props.publicNote}</p>}
      <div className="v4DebTrayActions">
        <button ref={props.clearRef} type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  );
}
