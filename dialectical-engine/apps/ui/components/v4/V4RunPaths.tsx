"use client";

import Link from "next/link";
import type { CarryOnPart, RunProjection } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { pauseOfRun } from "@/lib/v4/monthPause";
import { waitStateOfRun } from "@/lib/v4/stateWords";
import type { V4Map, V4Selection } from "@/lib/v4/types";
import { V4MonthPause } from "./V4MonthPause";
import { V4MapCarryOnLine, V4PathCard } from "./V4MapTree";
import { V4WaitCard } from "./V4WaitCard";

/*
 * V4 start step, Task 62 (spec 2026-11-03 §2 item 7; items wait-d1, journey-d2, wait-f16, wait-f5): what sits under the map's
 * first card while the debate runs. The page draws it under the question's card (the tree's and the outline's `rootExtra`) on a
 * computer and a tablet, and inside the question's own screen on a phone:
 *   - while the AIs are still choosing what to look into ("Just answer it"), "The AIs are choosing what to look into";
 *   - the other session's waiting card (V4WaitCard) with its one state line, the start time when the page knows it, the
 *     lost-touch line and no choices of its own (the paths are right beside it). Paused at the month wall, the one pause block
 *     (V4MonthPause) stands in its place: the waiting card always draws its state line, so the pause is said once (wait-f5);
 *   - the carry-on line, when the box was ticked and the behaviour is built (under the "choosing" line while there is one);
 *   - on a phone, "Your paths": one compact row per path (the same V4PathCard), each opening that path's screen.
 * Once the answer is served only the carry-on line stays. Nothing here reads, keeps or sends anything.
 */

/** Task 62 (wait-f16): while the carry-on line shows on the served map, the owner's run read is asked again this often. */
export const CARRY_ON_REPORT_POLL_MS = 60_000;

/** The AIs work on it right now: the run is claimed or running and not paused at the month wall (the pulses run only then). */
export function runIsRunning(run: RunProjection | null): boolean {
  return run !== null && (run.state === "CLAIMED" || run.state === "RUNNING") && pauseOfRun(run) === null;
}

export function V4RunRoot(props: Readonly<{
  /** The map drawn now (the run read's, or the served one); null for an R22 run read, which has no map yet. */
  map: V4Map | null;
  /** The debate's run read; null once the answer is served. */
  run: RunProjection | null;
  startedAt: string | null;
  reconnecting: boolean;
  /** The part of a carry-on debate the server says is running (`carry_on_part`); null: none. */
  carryOn: CarryOnPart | null;
  free: boolean;
  layout: "phone" | "mid" | "desktop";
  selected: V4Selection;
  onSelect(selection: V4Selection, viaKeyboard: boolean): void;
  catalog: MessageCatalog;
  locale: string;
  /** wait-f23: "Open in the classic view", once, at the bottom of the waiting card; absent: none. */
  classicHref?: string | null;
  /** W2L-4: where focus goes when the pause block goes with Continue held (the first card's question); absent: nowhere. */
  pauseFocusAfter?: () => HTMLElement | null;
}>) {
  const { map, run, catalog, locale } = props;
  const carryOn = map === null ? null : <V4MapCarryOnLine map={map} part={props.carryOn} free={props.free} catalog={catalog} />;
  if (run === null) return carryOn === null ? null : <div className="v4RunRoot" data-run-root="">{carryOn}</div>;
  const pause = pauseOfRun(run);
  const pending = map?.pending === true;
  const running = runIsRunning(run);
  const paths = props.layout === "phone" && map !== null ? map.paths : [];
  return (
    <div className="v4RunRoot" data-run-root="">
      {pending ? <p className="v4RunChoosing" role="status">{t(catalog, "v4.paths.choosing")}</p> : null}
      {pending ? carryOn : null}
      {pause !== null ? (
        <>
          <V4MonthPause
            runId={run.run_ref}
            pause={pause}
            catalog={catalog}
            locale={locale}
            {...(props.pauseFocusAfter === undefined ? {} : { focusAfter: props.pauseFocusAfter })}
          />
          {/* Review of Tasks 60-62: what the waiting card carries at its foot stays with the block that stands in its place, as on
              the paused screen it replaced: the lost-touch line (wait-f19) and "Open in the classic view", once (wait-f23). */}
          {props.reconnecting ? <p className="v4WaitReconnect v4Muted" data-wait-reconnecting="">{t(catalog, "v4.debate.reconnecting")}</p> : null}
          {props.classicHref === null || props.classicHref === undefined ? null : (
            <p className="v4WaitClassic"><Link className="v4Link" href={props.classicHref}>{t(catalog, "v4.common.classicView")}</Link></p>
          )}
        </>
      ) : (
        <V4WaitCard
          state={waitStateOfRun(run)}
          variant="inline"
          startedAt={props.startedAt}
          reconnecting={props.reconnecting}
          classicHref={props.classicHref ?? null}
          catalog={catalog}
          locale={locale}
        />
      )}
      {pending ? null : carryOn}
      {paths.length === 0 ? null : (
        <section className="v4RunPhonePaths" aria-labelledby="v4-run-your-paths">
          <h3 className="v4PanelH3" id="v4-run-your-paths">{t(catalog, "v4.paths.yourPaths")}</h3>
          <ul className="v4RunPhoneRows">
            {paths.map((path) => (
              <li key={path.id} className="v4RunPhoneRow">
                <V4PathCard
                  path={path}
                  selected={props.selected === `path:${path.id}`}
                  changed={false}
                  phase="RUN"
                  running={running}
                  compact
                  onSelect={(keyboard) => props.onSelect(`path:${path.id}`, keyboard)}
                  catalog={catalog}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
