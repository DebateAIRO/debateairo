"use client";

import type { Ref } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { MoneyLine } from "@/lib/v4/money";
import { picksMax } from "@/lib/v4/suggestions";
import type { DigMode, DigTarget } from "@/lib/v4/types";
import { V4PickChips } from "./V4ChoiceChips";
import { V4MoneyLines } from "./V4DigSuggest";
import { pathTitle, TitleText } from "./V4MapTree";

/*
 * The tray of picks on the map page (row D decision 1; W3-4: any pick shows the tray, which digs them together), moved out
 * of V4DebateClient so the page only wires it. The tray names the path its picks are on (owner Q-D1: one path per dig),
 * the money lines and Free's cap. journey-f23: the picks show as chips, never as a count. journey-f13 / journey-f8: the
 * button reads "Dig into these · about 5%" (the share only when the room read is for these picks); one pick keeps the
 * panel's own dig word, with its share. dig-f8: no mode word on Free. journey-d3: inside the phone's bar the bar's own
 * button digs the picks when the person is on their path, so the folded tray does not offer a second one (`withDig`
 * false).
 */

/** journey-f13 / journey-f8: "Dig here · about 3%" (the share only when the room read is for this dig). */
export function digHereLabel(percent: number | null, catalog: MessageCatalog): string {
  const label = t(catalog, "v4.bar.dig");
  return percent === null ? label : `${label} · ${t(catalog, "v4.bar.digAbout", { percent })}`;
}

/** journey-f13: the tray's button, "Dig into these · about 5%" (one pick: the panel's dig word, with its share). */
export function digTrayLabel(picks: number, percent: number | null, catalog: MessageCatalog, locale: string): string {
  const label = picks < 2 ? t(catalog, "v4.panel.dig") : tPlural(catalog, "v4.dig.trayDig", picks, locale);
  return percent === null ? label : `${label} · ${t(catalog, "v4.bar.digAbout", { percent })}`;
}

export function V4DigTray(props: Readonly<{
  target: Extract<DigTarget, { kind: "picks" }>;
  /** False inside the phone's bar while the bar's own button digs these picks. */
  withDig: boolean;
  planTier: "free" | "premium";
  sentDigMode: DigMode;
  money: readonly MoneyLine[];
  /** The share the room read said for these picks (null: none said). */
  sharePercent: number | null;
  onDig: () => void;
  onClear: () => void;
  /** The Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  clearRef?: Ref<HTMLButtonElement>;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { target, planTier, catalog } = props;
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
      <V4MoneyLines lines={props.money} catalog={catalog} />
      <div className="v4DebTrayActions">
        {props.withDig ? (
          <button type="button" className="v4Btn v4BtnPrimary" onClick={props.onDig}>
            {digTrayLabel(target.picks.length, props.sharePercent, catalog, props.locale)}
          </button>
        ) : null}
        <button ref={props.clearRef} type="button" className="v4Link v4DebTrayClear" onClick={props.onClear}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  );
}
