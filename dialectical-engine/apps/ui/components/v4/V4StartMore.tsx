"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { StartAngle } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { pathPlanByArea, pathPlanDirections, type PathPlan, type PathPlanAction, type PlanPath } from "@/lib/v4/pathPlan";
import type { StartFullRequest } from "./V4StartCard";
import type { StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 74 (choose-f18, choose-f7; spec 2026-11-03 §2 item 5; row D §5): "+ N more to explore", under the paths.
 * It opens a drawer, a dialog named "More to explore": on a computer a panel at the end side, so the list stays readable
 * beside it (a tablet too); at 600 px or less a full-screen sheet. It appears at once (sliding is not one of the six moves).
 * Focus goes into it; Escape or Done closes it and gives focus back to the button. Inside:
 *  - "Most useful first": the next ten ideas, not three (choose-f18);
 *  - "Other directions": one idea for each area no path on the list touches (when any);
 *  - "All, by area": every idea, under its area, the person's own words and the cards' paths last under "Added by you".
 * Each idea has "+ Look into this"; a late idea says "new". On a full list it is never a dead end (choose-f7): the card's
 * full-list choice (add to a path, swap, look wider) opens under the idea. What is left out is the next tier, not a no.
 * Every change goes through `dispatch`; nothing here fetches, stores or keeps anything in the browser.
 */

/** "Most useful first" shows the next ten ideas (choose-f18). */
const MORE_USEFUL_SHOWN = 10;
/** The phone's full-screen sheet (the CSS's 600 px rule says the same). */
const SHEET_QUERY = "(max-width: 600px)";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** True at 600 px or less, read once mounted (the server render and jsdom without matchMedia say no). */
function useSheet(): boolean {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(SHEET_QUERY);
    const update = (): void => setSheet(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return sheet;
}

/** An idea taken from the drawer: its key, and the key of its first viewpoint (found again wherever it went). */
type Added = Readonly<{ ideaKey: string; viewpointKey: string }>;

/** "Added as a path ✓" when the idea is a path of its own on the list, "Added to path {n} ✓" when it went into one; else null. */
function startAddedLine(plan: PathPlan, ideaKey: string, viewpointKey: string, catalog: MessageCatalog): string | null {
  const at = plan.paths.findIndex((path) => path.viewpoints.some((viewpoint) => viewpoint.key === viewpointKey));
  if (at < 0) return null;
  return plan.paths[at]!.key === ideaKey ? t(catalog, "v4.start.added.asPath") : t(catalog, "v4.start.added.to", { n: at + 1 });
}

export type V4StartMoreProps = StartPlanProps & Readonly<{
  /** The menu's angles, for "Other directions" and "All, by area". */
  angles: readonly StartAngle[];
  /** The card's full-list choice; without it a full list's refusal goes to onRefusal. */
  fullChoice?(request: StartFullRequest): ReactNode;
}>;

/** "+ N more to explore" and its drawer; null while "+ N more" is empty and the drawer is shut. */
export function V4StartMore(props: V4StartMoreProps) {
  const { plan, catalog, dispatch, onRefusal, angles } = props;
  const ids = useId();
  const sheet = useSheet();
  const [open, setOpen] = useState(false);
  /** The idea whose full-list choice shows, by its place in the drawer ("useful:kp06"). */
  const [full, setFull] = useState<string | null>(null);
  const [added, setAdded] = useState<Added | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  /** Keyboard audit 2026-11-12 (V4A-8): the "+ Look into this" that opened a full-list choice, for its Cancel. */
  const fullFrom = useRef<HTMLElement | null>(null);

  // Focus goes into the drawer when it opens and back to "+ N more to explore" when it shuts (to the first path when the
  // drawer took the last idea, so that the button is gone).
  useEffect(() => {
    if (open) box.current?.focus();
    else if (wasOpen.current) (opener.current ?? document.querySelector<HTMLElement>(".v4StartList .v4StartRowButton"))?.focus();
    wasOpen.current = open;
  }, [open]);

  if (plan.more.length === 0 && !open) return null;

  const close = (): void => {
    setOpen(false);
    setFull(null);
    setAdded(null);
  };
  /** The idea is on the list: the drawer says where, and keeps the focus (the pressed button is gone with the idea). */
  const landed = (idea: PlanPath): void => {
    setFull(null);
    setAdded({ ideaKey: idea.key, viewpointKey: idea.viewpoints[0]!.key });
    box.current?.focus();
  };
  const look = (place: string, idea: PlanPath, from: HTMLElement): void => {
    const action: PathPlanAction = { type: "ADD_FROM_MORE", key: idea.key, intoPathKey: null };
    const refusal = dispatch(action);
    if (refusal === null) landed(idea);
    else if (refusal === "PATHS_FULL" && props.fullChoice !== undefined) {
      fullFrom.current = from;
      setFull(place);
    } else onRefusal(refusal, action);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    // aria-modal: Tab and Shift+Tab stay inside the drawer.
    if (event.key !== "Tab" || box.current === null) return;
    const all = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (all.length === 0) return;
    const first = all[0]!;
    const last = all[all.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === box.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // The full-list choice shows only while the list is still full (a path removed meanwhile makes room: press again).
  const listFull = plan.paths.length >= plan.width;
  const idea = (place: string, path: PlanPath, area?: string): ReactNode => {
    const at = `${place}:${path.key}`;
    const titleId = `${ids}-${at}`;
    const ai = path.wording !== "PERSON" ? "true" : undefined;
    return (
      <li key={path.key} className="v4StartMoreIdea">
        {area === undefined ? null : <p className="v4StartMoreIdeaArea" dir="auto" data-ai-generated="true">{area}</p>}
        <p className="v4StartMoreIdeaHead">
          <span id={titleId} className="v4StartMoreIdeaTitle" dir="auto" data-ai-generated={ai}>{path.title}</span>
          {path.isNew ? <>{" · "}<span className="v4StartMoreNew">{t(catalog, "v4.start.tag.new")}</span></> : null}
        </p>
        <p className="v4StartMoreIdeaQuestion" dir="auto" data-ai-generated={ai}>{path.question}</p>
        <button type="button" className="v4Btn v4StartMoreAdd" aria-describedby={titleId} onClick={(event) => look(at, path, event.currentTarget)}>
          {t(catalog, "v4.start.lookInto")}
        </button>
        {full === at && listFull && props.fullChoice !== undefined ? props.fullChoice({
          make: (target) => ({ type: "ADD_FROM_MORE", key: path.key, ...target }),
          listed: (after) => after.paths.some((one) => one.key === path.key),
          onDone: () => landed(path),
          onCancel: () => {
            setFull(null);
            // Cancel goes with the choice: focus goes back to the idea's "+ Look into this", so it stays in the drawer.
            if (fullFrom.current?.isConnected === true) fullFrom.current.focus();
            else box.current?.focus();
          }
        }) : null}
      </li>
    );
  };

  const useful = plan.more.slice(0, MORE_USEFUL_SHOWN);
  const directions = pathPlanDirections(plan, angles);
  const groups = pathPlanByArea(plan, angles);
  const status = added === null ? null : startAddedLine(plan, added.ideaKey, added.viewpointKey, catalog);
  const section = (name: string, title: string, body: ReactNode): ReactNode => (
    <section className="v4StartMoreSection" aria-labelledby={`${ids}-${name}`}>
      <h3 id={`${ids}-${name}`} className="v4StartMoreSectionTitle">{title}</h3>
      {body}
    </section>
  );
  return (
    <>
      {plan.more.length > 0 ? (
        <button
          ref={opener}
          type="button"
          className="v4Btn v4StartMoreOpen"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {t(catalog, "v4.start.more.open", { count: plan.more.length })}
        </button>
      ) : null}
      {open ? (
        <div
          ref={box}
          className={sheet ? "v4StartMore v4StartMore--sheet" : "v4StartMore"}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-title`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <div className="v4StartMoreTop">
            <h2 id={`${ids}-title`} className="v4StartMoreHead">{t(catalog, "v4.start.more.title")}</h2>
            <button type="button" className="v4Btn v4StartMoreDone" onClick={close}>{t(catalog, "v4.start.more.done")}</button>
          </div>
          <p className="v4StartMoreStatus" role="status">{status ?? ""}</p>
          {useful.length > 0 ? section("useful", t(catalog, "v4.start.more.useful"), (
            <ul className="v4StartMoreList">{useful.map((path) => idea("useful", path))}</ul>
          )) : null}
          {directions.length > 0 ? section("directions", t(catalog, "v4.start.more.directions"), (
            <ul className="v4StartMoreList">{directions.map(({ angle, path }) => idea("directions", path, angle.label))}</ul>
          )) : null}
          {groups.length > 0 ? section("area", t(catalog, "v4.start.more.byArea"), groups.map((group) => {
            const area = group.angle?.angle_id ?? "none";
            return (
              <div key={area} className="v4StartMoreGroup">
                <h4 className="v4StartMoreGroupTitle" dir="auto" data-ai-generated={group.angle === null ? undefined : "true"}>
                  {group.angle?.label ?? t(catalog, "v4.start.more.addedByYou")}
                </h4>
                <ul className="v4StartMoreList">{group.paths.map((path) => idea(`area-${area}`, path))}</ul>
              </div>
            );
          })) : null}
        </div>
      ) : null}
    </>
  );
}
