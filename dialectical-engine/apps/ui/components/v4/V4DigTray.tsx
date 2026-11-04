"use client";

import type { Ref } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { V4DigQuota } from "@/lib/v4/digQuota";
import type { MoneyLine } from "@/lib/v4/money";
import { picksMax } from "@/lib/v4/suggestions";
import type { DigMode, DigTarget } from "@/lib/v4/types";
import { V4PickChips } from "./V4ChoiceChips";
import { V4MoneyLines } from "./V4DigSuggest";
import { pathTitle, TitleText } from "./V4MapTree";
import { V4ShareChange } from "./V4ShareChange";

/*
 * The tray of picks on the map page (row D decision 1; W3-4: any pick shows the tray, which digs them together), moved out
 * of V4DebateClient so the page only wires it. The tray names the path its picks are on (owner Q-D1: one path per dig),
 * the money lines and Free's cap. journey-f23: the picks show as chips, never as a count. journey-f13 / dig-f5: the button
 * reads "Dig into these · up to 5%" ("Dig into your pick" for one), the picks' own share from their own room read, through
 * the one dig-button helper of lib/v4/digQuota.ts (useDigQuota); a share that changed shows its grey mark for 2 seconds
 * (journey-f8). dig-f11 / journey-f14: while new digs wait for a reset the button stays, greyed with the reset time, and
 * the line beside it says why; pressing it starts nothing. dig-f8: no mode word on Free. journey-d3: inside the phone's
 * bar the bar's own button digs the picks when the person is on their path, so the folded tray does not offer a second
 * one (`withDig` false).
 */

export function V4DigTray(props: Readonly<{
  target: Extract<DigTarget, { kind: "picks" }>;
  /** False inside the phone's bar while the bar's own button digs these picks. */
  withDig: boolean;
  planTier: "free" | "premium";
  sentDigMode: DigMode;
  money: readonly MoneyLine[];
  /** The dig buttons' quota words (lib/v4/useDigQuota.ts): the label, the share and the waiting line. */
  quota: V4DigQuota;
  onDig: () => void;
  onClear: () => void;
  /** The Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  clearRef?: Ref<HTMLButtonElement>;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { target, planTier, catalog, quota } = props;
  const waiting = quota.waitLine !== null;
  return (
    <section className="v4DebTray" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={target.picks} label={t(catalog, "v4.map.picked")} />
      <p className="v4DebTrayText">
        {target.path !== null ? <TitleText title={pathTitle(target.path, catalog, 40)} catalog={catalog} /> : null}
        {target.path !== null && planTier !== "free" ? " · " : null}
        {planTier === "free" ? null : t(catalog, `v4.digMode.${props.sentDigMode}`)}
      </p>
      <p className="v4DebTrayHint v4Muted">
        {t(catalog, "v4.suggest.onePath")}
        {planTier === "free" ? <>{" "}{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</> : null}
      </p>
      {/* dig-f11 / journey-f14: while new digs wait, the greyed button carries the reset time and this line says why. */}
      {waiting
        ? <p className="v4PanelHint v4DigWaitLine" role="note">{quota.waitLine}</p>
        : <V4MoneyLines lines={props.money} catalog={catalog} />}
      <div className="v4DebTrayActions">
        {props.withDig ? (
          <span className="v4DigBtnRow">
            <button
              type="button"
              className={`v4Btn v4BtnPrimary${waiting ? " v4DigWaiting" : ""}`}
              aria-disabled={waiting ? "true" : undefined}
              onClick={() => {
                if (!waiting) props.onDig();
              }}
            >
              {quota.label(target, true)}
            </button>
            <V4ShareChange share={quota.share(target)} />
          </span>
        ) : null}
        <button ref={props.clearRef} type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  );
}
