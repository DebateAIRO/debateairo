"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { flushSync } from "react-dom";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { isPicking, type PathPlan, type PathPlanAction } from "@/lib/v4/pathPlan";
import { pickedTitle, type StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 72 (choose-d3, choose-f7, owner answer Q7; spec 2026-11-03 §2 items 5 and 6): the combine line while
 * "Combine with…" is picking. It names the picked path and asks for the other one: "Combine “Whole-system costs” with… Pick
 * a path." Beside it, the true share after combining and the change in grey: "Combining frees 1 path (about 15%, −3%)"
 * (Task 69's line; no period named, journey-f8). Cancel, or Escape, combines nothing and puts focus on the first row. The
 * page places it above a slimmer Start bar (Task 75's combineLine). Nothing picked: no line.
 * Design Document v2 (16b): the rows' tick boxes share that selection. One path picked by "Combine with…" is the line
 * above; one box ticked shows no line. Exactly two ticked: "2 picked · Combining frees 1 path (about 3% of today)." with
 * Combine and Keep apart; the share is what combining frees, of the day (of the month on the Free plan). Combine sends the
 * plan's combine; done, the ticks are gone (the model clears them) and focus is on the combined path; a refusal is handed
 * to `onRefusal` (the card says why) and the ticks stay. Keep apart, or Escape, unticks them all and combines nothing. A
 * third tick takes the line away again, as the design draws it for exactly two ("tick two to combine them").
 */

/** Stands in for the path's title in its sentence, so the title alone is marked as AI text. */
const TITLE_MARK = "\u0000";

/** The paths of the list that are picked (ticked), in list order. */
function pickedPaths(plan: PathPlan): PathPlan["paths"] {
  return plan.paths.filter((path) => plan.selected.includes(path.key));
}

/**
 * How many paths the combine line's combine frees, for its share (`StartPlanProps.share`): "Combine with…" joins the picked
 * path with one other, so one; ticked paths become one path, so one less than their number.
 */
export function startCombineFrees(plan: PathPlan): number {
  return Math.max(1, pickedPaths(plan).length - 1);
}

/** "Combining frees 1 path (about 15%, −3%)", its "−3%" in the grey of a share change; null without a share. */
function freesLine(catalog: MessageCatalog, locale: string, share: StartPlanProps["share"], freed: number): ReactNode {
  if (share === null) return null;
  const delta = Math.abs(share.delta);
  const line = tPlural(catalog, "v4.start.combineFrees", freed, locale, { percent: share.percent, delta });
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
  const { plan, catalog, locale, dispatch, onRefusal, share } = props;
  const first = plan.selected[0];
  const picked = first === undefined ? null : pickedTitle(plan, first);
  if (picked === null) return null;
  const ticked = pickedPaths(plan);
  const cancel = (): void => {
    dispatch({ type: "CLEAR_SELECTION" });
    document.querySelector<HTMLElement>(".v4StartList .v4StartRowButton")?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  };
  const frees = freesLine(catalog, locale, share, startCombineFrees(plan));
  // Design Document v2 (16b): the line is drawn for exactly two ticked paths ("tick two to combine them").
  if (ticked.length > 2) return null;
  if (ticked.length === 2) {
    // The design's sentence: what combining frees, as a share of the day (of the month on the Free plan).
    const freed = share === null ? null : tPlural(catalog, "v4.start.combineFreesShare", 1, locale, {
      share: t(catalog, plan.freePlan ? "v4.start.share.month" : "v4.start.share.day", { percent: Math.abs(share.delta) })
    });
    const combine = (): void => {
      const at = plan.paths.indexOf(ticked[0]!);
      const action: PathPlanAction = { type: "COMBINE_SELECTED" };
      // The page is drawn again before focus moves: this line goes with the ticks, and the combined path is a new row.
      const refusal = flushSync(() => dispatch(action));
      if (refusal !== null) {
        onRefusal(refusal, action);
        return;
      }
      document.querySelectorAll<HTMLElement>(".v4StartList .v4StartRowButton")[at]?.focus();
    };
    return (
      <div className="v4StartCombineBar v4StartCombineBar--ticked" onKeyDown={onKeyDown}>
        <p className="v4StartCombineBarLine">
          <b>{t(catalog, "v4.start.combinePicked", { count: ticked.length })}</b>
          {freed === null ? null : <>{" · "}{freed}</>}
        </p>
        <div className="v4StartCombineBarActions">
          <button type="button" className="v4Btn v4StartCombineBarGo" onClick={combine}>{t(catalog, "v4.start.suggest.combineButton")}</button>
          <button type="button" className="v4Btn v4StartCombineBarCancel" onClick={cancel}>{t(catalog, "v4.start.suggest.keepApart")}</button>
        </div>
      </div>
    );
  }
  // One box ticked is only a tick: the design shows no line until a second is ticked.
  if (!isPicking(plan)) return null;
  const [before = "", after = ""] = t(catalog, "v4.start.combineWith.pick", { title: TITLE_MARK }).split(TITLE_MARK);
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
