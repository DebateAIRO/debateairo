"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { pickedTitle, type StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 72 (choose-d3, choose-f7, owner answer Q7; spec 2026-11-03 §2 items 5 and 6): the combine line while
 * "Combine with…" is picking. It names the picked path and asks for the other one: "Combine “Whole-system costs” with… Pick
 * a path." Beside it, the true share after combining and the change in grey: "Combining frees 1 path (about 15%, −3%)"
 * (Task 69's line; no period named, journey-f8). Cancel, or Escape, combines nothing and puts focus on the first row. The
 * page places it above a slimmer Start bar (Task 75's combineLine). Nothing picked: no line.
 */

/** Stands in for the path's title in its sentence, so the title alone is marked as AI text. */
const TITLE_MARK = "\u0000";
/** "Combine with…" joins the picked path with one other, so the list has one path fewer. */
const PATHS_FREED = 1;

/** "Combining frees 1 path (about 15%, −3%)", its "−3%" in the grey of a share change; null without a share. */
function freesLine(catalog: MessageCatalog, locale: string, share: StartPlanProps["share"]): ReactNode {
  if (share === null) return null;
  const delta = Math.abs(share.delta);
  const line = tPlural(catalog, "v4.start.combineFrees", PATHS_FREED, locale, { percent: share.percent, delta });
  const mark = t(catalog, "v4.start.shareDown", { percent: delta });
  const at = line.lastIndexOf(mark);
  if (at < 0) return line;
  return (
    <>
      {line.slice(0, at)}
      <span className="v4ShareChange" dir="ltr">{mark}</span>
      {line.slice(at + mark.length)}
    </>
  );
}

export function V4StartCombineBar(props: StartPlanProps) {
  const { plan, catalog, locale, dispatch, share } = props;
  const first = plan.selected[0];
  const picked = first === undefined ? null : pickedTitle(plan, first);
  if (picked === null) return null;
  const [before = "", after = ""] = t(catalog, "v4.start.combineWith.pick", { title: TITLE_MARK }).split(TITLE_MARK);
  const cancel = (): void => {
    dispatch({ type: "CLEAR_SELECTION" });
    document.querySelector<HTMLElement>(".v4StartList .v4StartRowButton")?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  };
  const frees = freesLine(catalog, locale, share);
  return (
    <div className="v4StartCombineBar" onKeyDown={onKeyDown}>
      <p className="v4StartCombineBarPick">
        {before}
        <span dir="auto" data-ai-generated={picked.ai ? "true" : undefined}>{picked.text}</span>
        {after}
      </p>
      {frees === null ? null : <p className="v4StartCombineBarFrees">{frees}</p>}
      <button type="button" className="v4Btn v4StartCombineBarCancel" onClick={cancel}>{t(catalog, "v4.start.combineWith.cancel")}</button>
    </div>
  );
}
