"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 screen review (owner's picks, 3 Nov 2026), journey-f18 / read-f25: ONE step marker for every V4 page, with the same four
 * steps everywhere, "Your question · What we'll look into · The map · Your report", and the step the person is on marked.
 * A dig's page is on the map step and shows all four as well (it used to drop the second step). The shapes:
 *   "line"  the small marker at the top of a page (step 1, step 2, the waiting screens, the report): the names on a
 *           computer; on a phone four small dots, the names kept for screen readers;
 *   "dots"  the dots alone, for the phone's pinned top beside the breadcrumb (the map);
 *   "list"  the map's rail column, the tablet strip and the phone sheet's foot: a numbered mark, the name, "You are here";
 *   "marks" the laptop's 56 px strip: the marks, and only the step the person is on named on screen.
 * "list" and "marks" are drawn inside the rail's own <nav>; "line" and "dots" carry their own name ("Where you are").
 */

export const V4_STEPS = Object.freeze(["question", "look", "map", "report"] as const);
export type V4StepId = (typeof V4_STEPS)[number];

const STEP_KEYS: Readonly<Record<V4StepId, string>> = Object.freeze({
  question: "v4.rail.stepQuestion",
  look: "v4.rail.stepRead",
  map: "v4.rail.stepMap",
  report: "v4.rail.stepReport"
});

export type V4StepsShape = "line" | "dots" | "list" | "marks";

export type V4StepsProps = Readonly<{
  /** The step the person is on. */
  current: V4StepId;
  /** Where a step leads, for the steps the person can go to from here (the report from the map, the map from the report). */
  hrefs?: Readonly<Partial<Record<V4StepId, string>>>;
  /**
   * journey-f17: a mark after the report's name, e.g. the map's "New" dot while a report it saw being written is ready and
   * not opened ("list" and "line"; the marks strip and the dots have no room for it).
   */
  reportMark?: ReactNode;
  shape: V4StepsShape;
  catalog: MessageCatalog;
}>;

type Place = "done" | "here" | "ahead";

function placeOf(step: V4StepId, current: V4StepId): Place {
  const at = V4_STEPS.indexOf(step);
  const here = V4_STEPS.indexOf(current);
  return at < here ? "done" : at === here ? "here" : "ahead";
}

/** The rail's shapes ("list", "marks"): the rail's own classes, so its look and its tests stay as they were. */
function RailStep(props: Readonly<{ step: V4StepId; number: number; place: Place; href: string | undefined; marks: boolean; rail: V4StepsProps }>) {
  const { step, number, place, href, marks, rail } = props;
  const words = t(rail.catalog, STEP_KEYS[step]);
  const className = `v4DebRailStep${place === "done" ? " v4DebRailDone" : place === "here" ? " v4DebRailHere" : ""}`;
  const mark = place === "done" ? "✓" : marks ? (place === "here" ? "●" : "○") : String(number);
  if (place === "here") {
    return (
      <li className={className} aria-current="step">
        <span className="v4DebRailMark" aria-hidden="true">{mark}</span>
        <span>
          {words}
          {marks ? null : <span className="v4DebRailNote">{t(rail.catalog, "v4.rail.youAreHere")}</span>}
        </span>
      </li>
    );
  }
  if (marks) {
    // The marks strip names only the step the person is on; a step it can go to is a link around its mark.
    return (
      <li className={className}>
        {href === undefined ? (
          <>
            <span className="v4DebRailMark" aria-hidden="true">{mark}</span>
            <span className="v4SrOnly">{words}</span>
          </>
        ) : (
          <Link className="v4DebRailMarkLink" href={href}>
            <span className="v4DebRailMark" aria-hidden="true">{mark}</span>
            <span className="v4SrOnly">{words}</span>
          </Link>
        )}
      </li>
    );
  }
  return (
    <li className={className}>
      <span className="v4DebRailMark" aria-hidden="true">{mark}</span>
      {href === undefined ? <span className="v4DebRailStepName">{words}</span> : <Link className="v4Link" href={href}>{words}</Link>}
      {step === "report" ? rail.reportMark : null}
    </li>
  );
}

const SMALL_PLACE_CLASS: Readonly<Record<Place, string>> = Object.freeze({ done: "v4StepsDone", here: "v4StepsHere", ahead: "v4StepsAhead" });

/** The small shapes ("line", "dots"): a dot per step, and the name (on screen in "line" on a computer). */
function SmallStep(props: Readonly<{ step: V4StepId; place: Place; href: string | undefined; rail: V4StepsProps }>) {
  const { step, place, href, rail } = props;
  const words = t(rail.catalog, STEP_KEYS[step]);
  const inner: ReactNode = (
    <>
      <span className="v4StepsDot" aria-hidden="true" />
      <span className="v4StepsName">{words}</span>
    </>
  );
  return (
    <li className={`v4StepsStep ${SMALL_PLACE_CLASS[place]}`} {...(place === "here" ? { "aria-current": "step" as const } : {})}>
      {href === undefined || place === "here" ? <span className="v4StepsPlace">{inner}</span> : <Link className="v4StepsPlace v4StepsLink" href={href}>{inner}</Link>}
      {step === "report" && rail.shape === "line" ? rail.reportMark : null}
    </li>
  );
}

export function V4Steps(props: V4StepsProps) {
  const { current, hrefs, shape, catalog } = props;
  if (shape === "list" || shape === "marks") {
    return (
      <ol className="v4DebRailSteps">
        {V4_STEPS.map((step, index) => (
          <RailStep key={step} step={step} number={index + 1} place={placeOf(step, current)} href={hrefs?.[step]} marks={shape === "marks"} rail={props} />
        ))}
      </ol>
    );
  }
  return (
    <nav className={`v4Steps v4Steps-${shape}`} aria-label={t(catalog, "v4.rail.label")}>
      <ol className="v4StepsList">
        {V4_STEPS.map((step) => (
          <SmallStep key={step} step={step} place={placeOf(step, current)} href={hrefs?.[step]} rail={props} />
        ))}
      </ol>
    </nav>
  );
}
