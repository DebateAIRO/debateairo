"use client";

import {
  useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode
} from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import {
  cutText, PATH_PLAN_LIMITS, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanRefusal, type PlanPath, type PlanViewpoint
} from "@/lib/v4/pathPlan";

/*
 * V4 start step, Task 72 (choose-d3, choose-f6, choose-f7, choose-d4, chat-quota-word-on-choosing-card; spec 2026-11-03 §2
 * item 5 and its keyboard paragraph): the path rows the person shapes before Start, built once for the choosing card and,
 * later, a dig's picks (spec §9, dig-f35).
 *  - Clean rows (choose-d3): a number, the title and the question (the AIs' words marked as AI text; the person's never),
 *    "2 viewpoints together:" with the viewpoint chips (they wrap; a path holds any number of them, owner answer "Four per
 *    path" A, 5 Nov), the tag ("put together by us · Split", "combined by you · Split", "added by you", "Added when you
 *    widened", "new"), Rewrite and ⋯. There is no tick box: Space never ticks a path.
 *  - One tab stop per row, the row's button. ArrowUp / ArrowDown move between rows, ArrowRight / ArrowLeft into and out of
 *    the chips (mirrored right to left), Enter opens ⋯, Escape brings focus back. A row asking "Rewrite it for me / Keep my
 *    wording", and the inline editor, add their own stops while they show.
 *  - ⋯ on a path: Rewrite · Combine with… (two paths or more) · Split apart (two viewpoints or more) · Move up · Move down ·
 *    Remove. ⋯ on a chip: Move to path N · Its own path · Remove.
 *  - Combine with… picks this path; the combine line (V4StartCombineBar) says what combining frees, every other row's
 *    button adds ", press to combine with it", and pressing one (Enter, Space, or a tap anywhere on it) picks it and
 *    combines. Escape or Cancel combines nothing and puts focus on the first row. A refused combine (a fifth of the
 *    person's own points, or the technical bound) is reported and the first path stays picked, so another can be pressed.
 *  - The snap (one of the six moves): paths joining when their combined question is written, and parting on Split apart,
 *    under 0.5 s on its token; with reduced motion at once, with the 1-second highlight.
 *  - Phone (`narrow`, choose-f6): the title takes the whole row, the controls sit on a line under it, and Rewrite lives
 *    only in ⋯. No drag grip on a phone: Move up and Move down are in ⋯.
 * Task 77 (choose-d3, choose-f6; spec §2 item 5 "Drag"): drag is a mouse shortcut beside the menus. Only a mouse drags (never
 * touch, never a pen), a path from its row's grip (⋮⋮, on a computer only; hidden from screen readers and no tab stop, since
 * ⋯ does the same by keyboard) and a chip from itself, once the pointer has moved a few pixels (a press alone is still a
 * press). While dragging, a gap shows before each row and after the last, and the drop spot says what will happen:
 * a chip onto another path, "Drop to add · no extra path" (MOVE_CHIP); a chip onto a gap, "Drop to make its own path"
 * (MOVE_CHIP to NEW, then MOVE to that place); a path onto another path, "Drop to combine · frees 1 path" (SELECT both, then
 * COMBINE_SELECTED); a path onto a gap, the gap's line only (MOVE). A drop that would change nothing shows nothing. Escape,
 * or the browser taking the pointer back, ends a drag with nothing sent.
 * Every change goes through `dispatch` (the path plan model, through useStartPaths); a refusal goes to `onRefusal`, whose
 * words the card says (Task 73). Nothing here fetches, stores or keeps anything in the browser.
 */

/** What the rows, the combine line and (Task 74) the drawer and suggestions share. */
export type StartPlanProps = Readonly<{
  plan: PathPlan;
  catalog: MessageCatalog;
  locale: string;
  /** One change to the plan; its refusal, or null (useStartPaths's dispatch). */
  dispatch(action: PathPlanAction): PathPlanRefusal | null;
  /** A refused change, with the action that was refused (the card says why, Task 73). */
  onRefusal(refusal: PathPlanRefusal, action: PathPlanAction): void;
  /** The share after combining one path away and its change: startShareChange(step, paths, paths − 1) (owner answer Q7). */
  share: Readonly<{ percent: number; delta: number }> | null;
  /** At most 600 px wide (choose-f6). */
  narrow: boolean;
}>;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** How long a snapped row keeps its mark: the snap's token is under 0.5 s; the highlight (reduced motion) fades over 1 s. */
const SNAP_MARK_MS = 1_000;

/** True while the device asks for less motion (read once mounted; the server render assumes no). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** A chip's words: the viewpoint's title, or the start of its question when it has none (the person's own words). */
export function chipText(viewpoint: PlanViewpoint): string {
  return viewpoint.title ?? cutText(viewpoint.question, PATH_PLAN_LIMITS.titleMaxChars);
}

/** The AI text mark: on every word the AIs wrote, never on the person's own. */
const aiMark = (ai: boolean): "true" | undefined => ai ? "true" : undefined;

/** Whether the arrows run right to left here (the page's `dir`, not a text's own "auto"), so "into the chips" is ArrowLeft. */
function rightToLeft(element: Element): boolean {
  return element.closest('[dir]:not([dir="auto"])')?.getAttribute("dir") === "rtl";
}

/** The title of what a picked key names: a path's title, or a chip's words. */
export function pickedTitle(plan: PathPlan, key: string): Readonly<{ text: string; ai: boolean }> | null {
  for (const path of plan.paths) {
    if (path.key === key) return { text: path.title, ai: path.wording !== "PERSON" };
    const chip = path.viewpoints.find((viewpoint) => viewpoint.key === key);
    if (chip !== undefined) return { text: chipText(chip), ai: chip.source.kind !== "OWN" };
  }
  return null;
}

/** Task 77: where a drag would land: a path's row, a chip (in its path), or the gap before row `index` (the list's length: after the last). */
export type StartDropTarget =
  | Readonly<{ kind: "PATH"; key: string }>
  | Readonly<{ kind: "CHIP"; key: string; pathKey: string }>
  | Readonly<{ kind: "GAP"; index: number }>;

/** Task 77: the drop target an element under the pointer is part of: a gap, a chip, or anywhere else on a path's row; else null. */
export function dropTargetOf(element: Element | null): StartDropTarget | null {
  if (element === null) return null;
  const gap = element.closest<HTMLElement>("[data-drop-gap]");
  if (gap !== null) {
    const index = Number(gap.dataset.dropGap);
    return Number.isSafeInteger(index) && index >= 0 ? { kind: "GAP", index } : null;
  }
  const row = element.closest<HTMLElement>(".v4StartRow[data-path-key]");
  const pathKey = row?.dataset.pathKey;
  if (row === null || pathKey === undefined) return null;
  const chipKey = element.closest<HTMLElement>("[data-chip-key]")?.dataset.chipKey;
  return chipKey === undefined ? { kind: "PATH", key: pathKey } : { kind: "CHIP", key: chipKey, pathKey };
}

/**
 * Task 77 (choose-f6): the catalogue key of what a drop there says, by what is dragged: a chip onto a path (or one of its
 * chips) adds it, with no extra path; a chip onto a gap makes it its own path; a path onto another path combines them; a path
 * onto a gap says nothing (the gap's line shows where it goes). Null with no target.
 */
export function dropLabelOf(dragged: "PATH" | "CHIP", target: StartDropTarget | null): string | null {
  if (target === null) return null;
  if (target.kind === "GAP") return dragged === "CHIP" ? "v4.start.drop.ownPath" : null;
  return dragged === "CHIP" ? "v4.start.drop.add" : "v4.start.drop.combine";
}

/** Task 77: what a drag holds: a path (`key` its own, `pathKey` the same), or a chip (`key` the viewpoint's) of the path `pathKey`. */
type Dragged = Readonly<{ kind: "PATH" | "CHIP"; key: string; pathKey: string }>;
/** A drag under way: what is dragged and where a drop would land now (null: a drop there changes nothing). */
type DragView = Readonly<{ dragged: Dragged; aim: StartDropTarget | null }>;
/** How far a mouse moves, pressed, before it drags: a press that stays put is still a press (a chip's ⋯). */
const DRAG_START_PX = 4;

/** The drop target `target` when a drop there would change the plan; null when it would not (its own path, its own place). */
function aimOf(dragged: Dragged, target: StartDropTarget | null, plan: PathPlan): StartDropTarget | null {
  if (target === null) return null;
  if (target.kind === "GAP") {
    if (dragged.kind === "CHIP") return target;
    const from = plan.paths.findIndex((path) => path.key === dragged.key);
    return from < 0 || target.index === from || target.index === from + 1 ? null : target;
  }
  const pathKey = target.kind === "PATH" ? target.key : target.pathKey;
  return pathKey === dragged.pathKey || !plan.paths.some((path) => path.key === pathKey) ? null : target;
}

/** The element under the pointer: the browser's own answer where it has one, else the event's target (a page without layout). */
function elementUnder(event: PointerEvent): Element | null {
  const under = typeof document.elementFromPoint === "function" ? document.elementFromPoint(event.clientX, event.clientY) : null;
  return under ?? (event.target instanceof Element ? event.target : null);
}

/** After a drag, the click its release makes (on what the pointer went down and up over) presses nothing. */
function swallowNextClick(): void {
  const swallow = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/** One item of a ⋯ menu. */
export type StartMenuItem = Readonly<{ id: string; label: string; disabled?: boolean; onChoose(): void }>;

/**
 * A ⋯ menu: its items as menu items, the first focused when it opens; ArrowUp / ArrowDown (and Home / End) move between
 * them, Escape closes it and gives focus back to what opened it, Tab or a press outside closes it.
 */
export function V4StartMenu({ label, items, onClose, opener }: Readonly<{
  label: string;
  items: readonly StartMenuItem[];
  onClose(returnFocus: boolean): void;
  /** What opens the menu (a chip, or a row's line with its button and ⋯): a press there is not "outside". */
  opener: HTMLElement | null;
}>) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, []);
  useEffect(() => {
    const outside = (event: Event): void => {
      const target = event.target as Node | null;
      if (target !== null && (box.current?.contains(target) === true || opener?.contains(target) === true)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [onClose, opener]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to = (index: number): void => { event.preventDefault(); all[(index + all.length) % all.length]?.focus(); };
    switch (event.key) {
      case "ArrowDown": to(at + 1); break;
      case "ArrowUp": to(at < 0 ? all.length - 1 : at - 1); break;
      case "Home": to(0); break;
      case "End": to(all.length - 1); break;
      case "Escape": event.preventDefault(); event.stopPropagation(); onClose(true); break;
      case "Tab": onClose(false); break;
      default: break;
    }
  };
  return (
    <div ref={box} className="v4StartMenu" role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="v4StartMenuItem"
          aria-disabled={item.disabled === true ? "true" : undefined}
          onClick={() => { if (item.disabled !== true) item.onChoose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** A viewpoint chip: its words (the AIs' marked), its place said to a screen reader, and its ⋯ on a press or Enter. */
export function V4StartChip({ viewpoint, n, count, path, picked, catalog, open, onOpen, onKeyDown, buttonRef, onPointerDown, dragged = false }: Readonly<{
  viewpoint: PlanViewpoint;
  /** Its place in the path, from 1. */
  n: number;
  count: number;
  /** The path's number on the list. */
  path: number;
  picked: boolean;
  catalog: MessageCatalog;
  open: boolean;
  onOpen(): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
  buttonRef(element: HTMLButtonElement | null): void;
  /** Task 77: a press that may become a mouse's drag (absent on a phone). */
  onPointerDown?: ((event: ReactPointerEvent<HTMLButtonElement>) => void) | undefined;
  /** Task 77: this chip is being dragged. */
  dragged?: boolean;
}>) {
  const words = chipText(viewpoint);
  return (
    <li className="v4StartChipItem">
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        className={dragged ? "v4Chip v4StartChip v4StartChip--dragged" : "v4Chip v4StartChip"}
        onPointerDown={onPointerDown}
        dir="auto"
        data-chip-key={viewpoint.key}
        data-ai-generated={aiMark(viewpoint.source.kind !== "OWN")}
        aria-label={t(catalog, "v4.start.chip.a11y", {
          n, count, path, title: words, state: t(catalog, picked ? "v4.start.row.picked" : "v4.start.row.notSelected")
        })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onOpen}
        onKeyDown={onKeyDown}
      >
        {words}
      </button>
    </li>
  );
}

/** The inline editor of Rewrite: "Title" and "Your wording for path N", Save and Cancel; Escape cancels. */
function V4StartRewrite({ path, n, catalog, onSave, onCancel }: Readonly<{
  path: PlanPath;
  n: number;
  catalog: MessageCatalog;
  onSave(title: string, question: string): void;
  onCancel(): void;
}>) {
  const [title, setTitle] = useState(path.title);
  const [question, setQuestion] = useState(path.question);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const questionId = useId();
  useEffect(() => { titleRef.current?.focus(); }, []);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSave(title, question);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };
  return (
    <form className="v4StartRewrite" onSubmit={submit} onKeyDown={onKeyDown}>
      <label className="v4StartRewriteLabel" htmlFor={titleId}>{t(catalog, "v4.start.rewrite.title")}</label>
      <input ref={titleRef} id={titleId} className="v4StartRewriteField" dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label className="v4StartRewriteLabel" htmlFor={questionId}>{t(catalog, "v4.start.rewrite.wording", { n })}</label>
      <textarea
        id={questionId}
        className="v4StartRewriteField v4StartRewriteWording"
        dir="auto"
        rows={3}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <div className="v4StartRewriteActions">
        <button type="submit" className="v4Btn v4BtnPrimary">{t(catalog, "v4.start.rewrite.save")}</button>
        <button type="button" className="v4Btn" onClick={onCancel}>{t(catalog, "v4.start.rewrite.cancel")}</button>
      </div>
    </form>
  );
}

/** What a row draws and does; the list owns the focus, the open menu, the editor and the snap. */
type RowProps = Readonly<{
  path: PlanPath;
  /** Its place on the list, from 0. */
  at: number;
  count: number;
  catalog: MessageCatalog;
  locale: string;
  narrow: boolean;
  /** "Combine with…" is picking: this row is picked, or can be pressed to combine. */
  combining: boolean;
  picked: boolean;
  selected: readonly string[];
  menu: ReactNode;
  chipMenu: Readonly<{ chipKey: string; node: ReactNode }> | null;
  menuOpen: boolean;
  editing: boolean;
  snapClass: string | null;
  onPress(): void;
  onRowKey(event: KeyboardEvent<HTMLButtonElement>): void;
  onMore(): void;
  onRewrite(): void;
  onSplit(): void;
  onReword(keep: boolean): void;
  onSave(title: string, question: string): void;
  onCancelEdit(): void;
  onChip(chipKey: string): void;
  onChipKey(event: KeyboardEvent<HTMLButtonElement>, chip: number): void;
  rowRef(element: HTMLButtonElement | null): void;
  chipRef(chipKey: string, element: HTMLButtonElement | null): void;
  /** Task 77: the grip's press, which may become a mouse's drag of this path; absent: no grip (a phone). */
  onGripDown?: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined;
  /** Task 77: a chip's press, which may become a mouse's drag of that chip; absent on a phone. */
  onChipDown?: ((event: ReactPointerEvent<HTMLButtonElement>, chipKey: string) => void) | undefined;
  /** Task 77: while something is dragged, what this row shows of it; null or absent: nothing is dragged. */
  drag?: RowDrag | null;
}>;

/** Task 77: one row's part of a drag under way. */
type RowDrag = Readonly<{
  /** This path is what is dragged. */
  dragged: boolean;
  /** The chip of this path being dragged, if one is. */
  chipKey: string | null;
  /** A drop on this path would land here: the words it says, or "" for none. Null: it would not land here. */
  over: string | null;
  /** The gap before this row, and (on the last row) the gap after it: its place, and its words when a drop would land there ("" for none). */
  gaps: readonly Readonly<{ index: number; over: string | null }>[];
}>;

/** Task 77: the gap before a row (or after the last): where a drag lands between paths. Never read out: drag is a mouse's. */
function DropGap({ index, over, after }: Readonly<{ index: number; over: string | null; after: boolean }>) {
  const classes = ["v4StartGap"];
  if (after) classes.push("v4StartGap--after");
  if (over !== null) classes.push("v4StartGap--over");
  return (
    <div className={classes.join(" ")} data-drop-gap={index} aria-hidden="true">
      {over === null || over === "" ? null : <span className="v4StartDropLabel">{over}</span>}
    </div>
  );
}

/** The tag line: the tag's words, "· Split" on a path put together, and "new" on a late idea; null when none of them. */
function tagLine(path: PlanPath, catalog: MessageCatalog, onSplit: () => void): ReactNode {
  const parts: ReactNode[] = [];
  if (path.tag !== null) parts.push(<span key="tag">{t(catalog, `v4.start.tag.${path.tag}`)}</span>);
  if ((path.tag === "PUT_TOGETHER_BY_US" || path.tag === "COMBINED_BY_YOU") && path.viewpoints.length > 1) {
    parts.push(<button key="split" type="button" tabIndex={-1} className="v4Link v4StartRowSplit" onClick={onSplit}>{t(catalog, "v4.start.tag.split")}</button>);
  }
  if (path.isNew) parts.push(<span key="new" className="v4StartRowNew">{t(catalog, "v4.start.tag.new")}</span>);
  if (parts.length === 0) return null;
  return <p className="v4StartRowTag">{parts.flatMap((part, index) => index === 0 ? [part] : [" · ", part])}</p>;
}

/** One path row. */
export function V4StartRow(props: RowProps) {
  const { path, at, count, catalog, locale, narrow, combining, picked, selected, chipMenu } = props;
  const n = at + 1;
  const ai = path.wording !== "PERSON";
  const viewpoints = tPlural(catalog, "v4.start.row.viewpoints", path.viewpoints.length, locale);
  const state = t(catalog, picked ? "v4.start.row.picked" : "v4.start.row.notSelected");
  const label = t(catalog, combining && !picked ? "v4.start.combineWith.rowA11y" : "v4.start.row.a11y", {
    n, count, title: path.title, viewpoints, state
  });
  const together = path.viewpoints.length > 1;
  // Keyboard audit 2026-11-12 (V4A-18): the chips are reached with ArrowRight from the row; a line says so (v4-ask.css).
  // On a right-to-left page the key is ArrowLeft (rightToLeft above), so the line names that one. The direction is the
  // page's, read once the line is on the page (the server draws the left-to-right words; the line is hidden until a key
  // puts the ring on its row, long after this has run).
  const chipsHintId = useId();
  const chipsHintRef = useRef<HTMLParagraphElement | null>(null);
  const [mirrored, setMirrored] = useState(false);
  useEffect(() => {
    if (chipsHintRef.current !== null) setMirrored(rightToLeft(chipsHintRef.current));
  }, [together]);
  // In "Combine with…", a tap anywhere on another row presses it (its own buttons keep their own presses).
  const onRowClick = combining && !picked
    ? (event: MouseEvent<HTMLLIElement>): void => {
      if ((event.target as Element).closest("button, a, input, textarea, [role='menu']") !== null) return;
      props.onPress();
    }
    : undefined;
  const drag = props.drag ?? null;
  const classes = ["v4StartRow"];
  if (narrow) classes.push("v4StartRow--narrow");
  if (picked) classes.push("v4StartRow--picked");
  else if (combining) classes.push("v4StartRow--pickable");
  if (props.snapClass !== null) classes.push(props.snapClass);
  if (drag?.dragged === true) classes.push("v4StartRow--dragged");
  if (drag !== null && drag.over !== null) classes.push("v4StartRow--drop");
  const gapBefore = drag?.gaps.find((gap) => gap.index === at);
  const gapAfter = drag?.gaps.find((gap) => gap.index === at + 1);
  return (
    <li className={classes.join(" ")} data-path-key={path.key} onClick={onRowClick}>
      {gapBefore === undefined ? null : <DropGap index={gapBefore.index} over={gapBefore.over} after={false} />}
      {drag === null || drag.over === null || drag.over === "" ? null : <span className="v4StartDropLabel" aria-hidden="true">{drag.over}</span>}
      <div className="v4StartRowHead">
        {narrow || props.onGripDown === undefined ? null : (
          <span className="v4StartRowGrip" aria-hidden="true" onPointerDown={props.onGripDown}>⋮⋮</span>
        )}
        <button
          ref={props.rowRef}
          type="button"
          className="v4StartRowButton"
          aria-label={label}
          aria-describedby={together ? chipsHintId : undefined}
          aria-haspopup={combining ? undefined : "menu"}
          aria-expanded={combining ? undefined : props.menuOpen}
          onClick={props.onPress}
          onKeyDown={props.onRowKey}
        >
          <span className="v4StartRowNumber" aria-hidden="true">{n}</span>
          <span className={narrow ? "v4StartRowTitle v4StartRowTitle--full" : "v4StartRowTitle"} dir="auto" data-ai-generated={aiMark(ai)}>
            {path.title}
          </span>
        </button>
        <div className="v4StartRowControls">
          {narrow ? null : (
            <button type="button" tabIndex={-1} className="v4Btn v4StartRowRewrite" onClick={props.onRewrite}>
              {t(catalog, "v4.start.rewrite.open")}
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            className="v4Btn v4StartRowMore"
            aria-label={t(catalog, "v4.start.row.more", { n })}
            aria-haspopup="menu"
            aria-expanded={props.menuOpen}
            onClick={props.onMore}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        </div>
        {props.menu}
      </div>
      {props.editing
        ? <V4StartRewrite path={path} n={n} catalog={catalog} onSave={props.onSave} onCancel={props.onCancelEdit} />
        : <p className="v4StartRowQuestion" dir="auto" data-ai-generated={aiMark(ai)}>{path.question}</p>}
      {path.wording === "WRITING" ? <p className="v4StartRowWriting">{t(catalog, "v4.start.writing")}</p> : null}
      {path.askReword ? (
        <div className="v4StartReword">
          <p className="v4StartRewordLine">{t(catalog, "v4.start.reword.changed")}</p>
          <div className="v4StartRewordActions">
            <button type="button" className="v4Btn" onClick={() => props.onReword(false)}>{t(catalog, "v4.start.reword.rewrite")}</button>
            <button type="button" className="v4Btn" onClick={() => props.onReword(true)}>{t(catalog, "v4.start.reword.keep")}</button>
          </div>
        </div>
      ) : null}
      {together ? (
        <div className="v4StartRowTogether">
          <p className="v4StartRowTogetherLine">{tPlural(catalog, "v4.start.row.together", path.viewpoints.length, locale)}</p>
          <ul className="v4StartChips">
            {path.viewpoints.map((viewpoint, chip) => (
              <V4StartChip
                key={viewpoint.key}
                viewpoint={viewpoint}
                n={chip + 1}
                count={path.viewpoints.length}
                path={n}
                picked={selected.includes(viewpoint.key)}
                catalog={catalog}
                open={chipMenu?.chipKey === viewpoint.key}
                onOpen={() => props.onChip(viewpoint.key)}
                onKeyDown={(event) => props.onChipKey(event, chip)}
                buttonRef={(element) => props.chipRef(viewpoint.key, element)}
                onPointerDown={narrow || props.onChipDown === undefined ? undefined : (event) => props.onChipDown?.(event, viewpoint.key)}
                dragged={drag?.chipKey === viewpoint.key}
              />
            ))}
          </ul>
          <p id={chipsHintId} ref={chipsHintRef} className="v4StartChipsHint">
            {t(catalog, mirrored ? "v4.start.chip.keysHintRtl" : "v4.start.chip.keysHint")}
          </p>
          {chipMenu?.node ?? null}
        </div>
      ) : null}
      {tagLine(path, catalog, props.onSplit)}
      {gapAfter === undefined || at + 1 !== count ? null : <DropGap index={gapAfter.index} over={gapAfter.over} after />}
    </li>
  );
}

/** Where focus goes once a change has landed: a path by key (else its place on the list), or a chip. */
type FocusWish = Readonly<{ key?: string; index?: number; chip?: string }>;
type OpenMenu = Readonly<{ kind: "PATH" | "CHIP"; key: string }>;

/** The path rows, as an ordered list. */
export function V4StartList(props: StartPlanProps) {
  const { plan, catalog, locale, dispatch, onRefusal, narrow } = props;
  const reduced = useReducedMotion();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [snap, setSnap] = useState<readonly string[]>([]);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const chipButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusWish = useRef<FocusWish | null>(null);
  const splitWish = useRef<Readonly<{ index: number; count: number }> | null>(null);
  const pathsBefore = useRef(plan.paths);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combining = plan.selected.length > 0;
  // Task 77: the drag under way (drawn), how to end the one listening (null: none), and what it reads when it lands.
  const [drag, setDrag] = useState<DragView | null>(null);
  const dragEnd = useRef<((draw: boolean) => void) | null>(null);
  const current = useRef({ plan, dispatch, onRefusal });
  current.current = { plan, dispatch, onRefusal };
  useEffect(() => () => dragEnd.current?.(false), []);

  const send = (action: PathPlanAction): PathPlanRefusal | null => {
    const refusal = dispatch(action);
    if (refusal !== null) onRefusal(refusal, action);
    return refusal;
  };
  const rowAt = (index: number): HTMLButtonElement | null => {
    const path = plan.paths[Math.min(Math.max(index, 0), plan.paths.length - 1)];
    return path === undefined ? null : rowButtons.current.get(path.key) ?? null;
  };

  // Focus after a change lands (every commit, so a change that left the plan as it was still settles it).
  useEffect(() => {
    const wish = focusWish.current;
    if (wish === null) return;
    focusWish.current = null;
    const target = wish.chip !== undefined
      ? chipButtons.current.get(wish.chip)
      : wish.key !== undefined && rowButtons.current.has(wish.key)
        ? rowButtons.current.get(wish.key)
        : rowAt(wish.index ?? 0);
    target?.focus();
  });

  // The snap: a combined path whose question was just written, and the pieces of a split.
  useEffect(() => {
    const was = new Map(pathsBefore.current.map((path) => [path.key, path] as const));
    const changed = pathsBefore.current !== plan.paths;
    pathsBefore.current = plan.paths;
    if (!changed) return;
    const written = plan.paths.filter((path) => path.wording === "COMBINED" && was.get(path.key)?.wording === "WRITING").map((path) => path.key);
    const split = splitWish.current;
    splitWish.current = null;
    const pieces = split === null ? [] : plan.paths.slice(split.index, split.index + split.count).map((path) => path.key);
    const keys = [...written, ...pieces];
    if (keys.length === 0) return;
    setSnap(keys);
    if (snapTimer.current !== null) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => { snapTimer.current = null; setSnap([]); }, SNAP_MARK_MS);
  }, [plan.paths]);
  useEffect(() => () => { if (snapTimer.current !== null) clearTimeout(snapTimer.current); }, []);

  const closeMenu = (returnFocus: boolean): void => {
    const open = menu;
    setMenu(null);
    if (!returnFocus || open === null) return;
    (open.kind === "PATH" ? rowButtons.current.get(open.key) : chipButtons.current.get(open.key))?.focus();
  };
  const cancelCombine = (): void => {
    send({ type: "CLEAR_SELECTION" });
    focusWish.current = { index: 0 };
  };
  /** A press on a row: in "Combine with…", pick it and combine (or, on the picked row, stop picking); else its ⋯, open or shut. */
  const pressRow = (path: PlanPath, at: number): void => {
    if (!combining) {
      setMenu(menu?.kind === "PATH" && menu.key === path.key ? null : { kind: "PATH", key: path.key });
      return;
    }
    if (plan.selected.includes(path.key)) {
      send({ type: "CLEAR_SELECTION" });
      focusWish.current = { key: path.key };
      return;
    }
    const places = plan.selected
      .map((key) => plan.paths.findIndex((one) => one.key === key || one.viewpoints.some((viewpoint) => viewpoint.key === key)))
      .filter((index) => index >= 0);
    dispatch({ type: "SELECT", key: path.key });
    const refusal = send({ type: "COMBINE_SELECTED" });
    if (refusal === null) {
      focusWish.current = { index: Math.min(at, ...places) };
      return;
    }
    dispatch({ type: "UNSELECT", key: path.key });
    focusWish.current = { key: path.key };
  };
  const split = (path: PlanPath, at: number): void => {
    setMenu(null);
    splitWish.current = { index: at, count: path.viewpoints.length };
    focusWish.current = { index: at };
    if (send({ type: "SPLIT", key: path.key }) !== null) {
      splitWish.current = null;
      focusWish.current = { key: path.key };
    }
  };
  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>, path: PlanPath, at: number): void => {
    const into = rightToLeft(event.currentTarget) ? "ArrowLeft" : "ArrowRight";
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? at + 1 : at - 1;
        if (next >= 0 && next < plan.paths.length) rowAt(next)?.focus();
        break;
      }
      case into: {
        const first = path.viewpoints.length > 1 ? chipButtons.current.get(path.viewpoints[0]!.key) : undefined;
        if (first === undefined) break;
        event.preventDefault();
        first.focus();
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        pressRow(path, at);
        break;
      case "Escape":
        if (!combining) break;
        event.preventDefault();
        cancelCombine();
        break;
      default:
        break;
    }
  };
  const onChipKey = (event: KeyboardEvent<HTMLButtonElement>, path: PlanPath, at: number, chip: number): void => {
    const forward = rightToLeft(event.currentTarget) ? "ArrowLeft" : "ArrowRight";
    const back = forward === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
    const chipAt = (index: number): HTMLButtonElement | undefined => {
      const viewpoint = path.viewpoints[index];
      return viewpoint === undefined ? undefined : chipButtons.current.get(viewpoint.key);
    };
    switch (event.key) {
      case forward:
        event.preventDefault();
        chipAt(chip + 1)?.focus();
        break;
      case back:
        event.preventDefault();
        (chip === 0 ? rowButtons.current.get(path.key) : chipAt(chip - 1))?.focus();
        break;
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? at + 1 : at - 1;
        if (next >= 0 && next < plan.paths.length) rowAt(next)?.focus();
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        setMenu({ kind: "CHIP", key: path.viewpoints[chip]!.key });
        break;
      case "Escape":
        event.preventDefault();
        if (combining) cancelCombine();
        else rowButtons.current.get(path.key)?.focus();
        break;
      default:
        break;
    }
  };

  /** Task 77: a drag lands, on the plan as it is now (each change through the model; a refusal is reported as for the menus). */
  const land = (dragged: Dragged, target: StartDropTarget): void => {
    const now = current.current;
    const sent = (action: PathPlanAction): PathPlanRefusal | null => {
      const refusal = now.dispatch(action);
      if (refusal !== null) now.onRefusal(refusal, action);
      return refusal;
    };
    if (target.kind !== "GAP") {
      const into = target.kind === "PATH" ? target.key : target.pathKey;
      if (dragged.kind === "CHIP") {
        sent({ type: "MOVE_CHIP", chipKey: dragged.key, toPathKey: into });
        return;
      }
      // A path onto another: both picked, then combined, as "Combine with…" does; a refused combine leaves nothing picked.
      if (now.plan.selected.length > 0) now.dispatch({ type: "CLEAR_SELECTION" });
      now.dispatch({ type: "SELECT", key: dragged.key });
      now.dispatch({ type: "SELECT", key: into });
      if (sent({ type: "COMBINE_SELECTED" }) !== null) now.dispatch({ type: "CLEAR_SELECTION" });
      return;
    }
    if (dragged.kind === "PATH") {
      const from = now.plan.paths.findIndex((path) => path.key === dragged.key);
      sent({ type: "MOVE", key: dragged.key, to: target.index > from ? target.index - 1 : target.index });
      return;
    }
    // A chip onto a gap: its own path (made right under its path, Task 65), then moved to the gap's place: right above the
    // path that was below the gap (the chip's own path when the gap is just above it), or last.
    const own: PathPlanAction = { type: "MOVE_CHIP", chipKey: dragged.key, toPathKey: "NEW" };
    const after = pathPlanReduce(now.plan, own).plan;
    if (sent(own) !== null || after === now.plan) return;
    const madeAt = after.paths.findIndex((path) => path.viewpoints.length === 1 && path.viewpoints[0]!.key === dragged.key);
    if (madeAt < 0) return;
    const below = now.plan.paths[target.index];
    const belowAt = below === undefined ? -1 : below.key === dragged.pathKey ? madeAt - 1 : after.paths.findIndex((path) => path.key === below.key);
    const to = belowAt < 0 ? after.paths.length - 1 : belowAt > madeAt ? belowAt - 1 : belowAt;
    if (to !== madeAt) sent({ type: "MOVE", key: after.paths[madeAt]!.key, to });
  };

  /**
   * Task 77: a press that may become a drag. Only a mouse's main button, never on a phone; touch and pen press as before. The
   * drag starts once the pointer has moved DRAG_START_PX; from then on the page follows the pointer until it is let go
   * (landing), Escape, or the browser taking the pointer back (a cancel). The release's click then presses nothing.
   */
  const pressToDrag = (event: ReactPointerEvent<HTMLElement>, dragged: Dragged): void => {
    if (event.pointerType !== "mouse" || event.button !== 0 || narrow) return;
    dragEnd.current?.(true);
    const { pointerId, clientX: x, clientY: y } = event;
    let started = false;
    /** The aim last drawn, as text (null: none yet): the list is drawn again only when it changes, not on every move of the mouse. */
    let drawn: string | null = null;
    const aimAt = (moved: PointerEvent): StartDropTarget | null => aimOf(dragged, dropTargetOf(elementUnder(moved)), current.current.plan);
    const onMove = (moved: PointerEvent): void => {
      if (moved.pointerId !== pointerId) return;
      if (!started) {
        if (Math.hypot(moved.clientX - x, moved.clientY - y) < DRAG_START_PX) return;
        started = true;
        setMenu(null);
      }
      moved.preventDefault();
      const aim = aimAt(moved);
      const seen = JSON.stringify(aim);
      if (seen === drawn) return;
      drawn = seen;
      setDrag({ dragged, aim });
    };
    const onUp = (released: PointerEvent): void => {
      if (released.pointerId !== pointerId) return;
      const was = started;
      end(true);
      if (!was) return;
      swallowNextClick();
      const aim = aimAt(released);
      if (aim !== null) land(dragged, aim);
    };
    const onCancel = (cancelled: PointerEvent): void => {
      if (cancelled.pointerId === pointerId) end(true);
    };
    const onKey = (pressed: globalThis.KeyboardEvent): void => {
      if (pressed.key !== "Escape" || !started) return;
      pressed.preventDefault();
      end(true);
    };
    const onBlur = (): void => end(true);
    const end = (draw: boolean): void => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      if (dragEnd.current === end) dragEnd.current = null;
      if (draw && started) setDrag(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    dragEnd.current = end;
  };

  /** Task 77: what one row shows of the drag under way. */
  const rowDrag = (path: PlanPath, at: number): RowDrag | null => {
    if (drag === null) return null;
    const { dragged, aim } = drag;
    const words = (): string => {
      const key = dropLabelOf(dragged.kind, aim);
      return key === null ? "" : t(catalog, key);
    };
    const overPath = aim === null || aim.kind === "GAP" ? null : aim.kind === "PATH" ? aim.key : aim.pathKey;
    const gapAt = (index: number): Readonly<{ index: number; over: string | null }> =>
      ({ index, over: aim?.kind === "GAP" && aim.index === index ? words() : null });
    return {
      dragged: dragged.kind === "PATH" && dragged.key === path.key,
      chipKey: dragged.kind === "CHIP" && dragged.pathKey === path.key ? dragged.key : null,
      over: overPath === path.key ? words() : null,
      gaps: at + 1 === plan.paths.length ? [gapAt(at), gapAt(at + 1)] : [gapAt(at)]
    };
  };

  const pathMenu = (path: PlanPath, at: number): ReactNode => {
    if (menu?.kind !== "PATH" || menu.key !== path.key) return null;
    const n = at + 1;
    const items: StartMenuItem[] = [{
      id: "rewrite", label: t(catalog, "v4.start.menu.rewrite"),
      onChoose: () => { setMenu(null); setEditing(path.key); }
    }];
    if (plan.paths.length > 1) {
      items.push({
        id: "combine", label: t(catalog, "v4.start.menu.combineWith"),
        onChoose: () => {
          setMenu(null);
          if (plan.selected.length > 0) dispatch({ type: "CLEAR_SELECTION" });
          dispatch({ type: "SELECT", key: path.key });
          focusWish.current = { key: path.key };
        }
      });
    }
    if (path.viewpoints.length > 1) items.push({ id: "split", label: t(catalog, "v4.start.menu.split"), onChoose: () => split(path, at) });
    const moveTo = (to: number) => (): void => {
      setMenu(null);
      send({ type: "MOVE", key: path.key, to });
      focusWish.current = { key: path.key };
    };
    items.push(
      { id: "up", label: t(catalog, "v4.start.menu.moveUp"), disabled: at === 0, onChoose: moveTo(at - 1) },
      { id: "down", label: t(catalog, "v4.start.menu.moveDown"), disabled: at === plan.paths.length - 1, onChoose: moveTo(at + 1) },
      {
        id: "remove", label: t(catalog, "v4.start.menu.remove"),
        onChoose: () => {
          setMenu(null);
          focusWish.current = send({ type: "REMOVE", key: path.key }) === null ? { index: at } : { key: path.key };
        }
      }
    );
    // The row's line (its button and ⋯) opens and shuts the menu itself, so a press there is not "outside".
    const opener = rowButtons.current.get(path.key)?.parentElement ?? null;
    return <V4StartMenu label={t(catalog, "v4.start.row.more", { n })} items={items} onClose={closeMenu} opener={opener} />;
  };

  const chipMenu = (path: PlanPath, at: number): Readonly<{ chipKey: string; node: ReactNode }> | null => {
    if (menu?.kind !== "CHIP") return null;
    const viewpoint = path.viewpoints.find((one) => one.key === menu.key);
    if (viewpoint === undefined) return null;
    const moved = (action: PathPlanAction, wish: FocusWish) => (): void => {
      setMenu(null);
      focusWish.current = send(action) === null ? wish : { chip: viewpoint.key };
    };
    const items: StartMenuItem[] = plan.paths.flatMap((other, index) => other.key === path.key ? [] : [{
      id: `to:${other.key}`, label: t(catalog, "v4.start.chipMenu.moveTo", { n: index + 1 }),
      onChoose: moved({ type: "MOVE_CHIP", chipKey: viewpoint.key, toPathKey: other.key }, { index })
    }]);
    items.push(
      { id: "own", label: t(catalog, "v4.start.chipMenu.ownPath"), onChoose: moved({ type: "MOVE_CHIP", chipKey: viewpoint.key, toPathKey: "NEW" }, { index: at + 1 }) },
      { id: "remove", label: t(catalog, "v4.start.chipMenu.remove"), onChoose: moved({ type: "REMOVE", key: viewpoint.key }, { index: at }) }
    );
    return {
      chipKey: viewpoint.key,
      node: (
        <V4StartMenu
          label={t(catalog, "v4.start.chipMenu.label", { title: chipText(viewpoint) })}
          items={items}
          onClose={closeMenu}
          opener={chipButtons.current.get(viewpoint.key) ?? null}
        />
      )
    };
  };

  const snapClass = reduced ? "v4Highlight" : "v4StartRow--snap";
  return (
    <ol className={drag === null ? "v4StartList" : "v4StartList v4StartList--dragging"}>
      {plan.paths.map((path, at) => (
        <V4StartRow
          key={path.key}
          path={path}
          at={at}
          count={plan.paths.length}
          catalog={catalog}
          locale={locale}
          narrow={narrow}
          combining={combining}
          picked={plan.selected.includes(path.key)}
          selected={plan.selected}
          menu={pathMenu(path, at)}
          chipMenu={chipMenu(path, at)}
          menuOpen={menu?.kind === "PATH" && menu.key === path.key}
          editing={editing === path.key}
          snapClass={snap.includes(path.key) ? snapClass : null}
          onPress={() => pressRow(path, at)}
          onRowKey={(event) => onRowKey(event, path, at)}
          onMore={() => setMenu(menu?.kind === "PATH" && menu.key === path.key ? null : { kind: "PATH", key: path.key })}
          onRewrite={() => { setMenu(null); setEditing(path.key); }}
          onSplit={() => split(path, at)}
          onReword={(keep) => { send(keep ? { type: "KEEP_WORDING", key: path.key } : { type: "REWORD", key: path.key }); }}
          onSave={(title, question) => {
            if (send({ type: "REWRITE", key: path.key, title, question }) !== null) return;
            setEditing(null);
            focusWish.current = { index: at };
          }}
          onCancelEdit={() => { setEditing(null); focusWish.current = { key: path.key }; }}
          onChip={(chipKey) => setMenu(menu?.kind === "CHIP" && menu.key === chipKey ? null : { kind: "CHIP", key: chipKey })}
          onChipKey={(event, chip) => onChipKey(event, path, at, chip)}
          rowRef={(element) => { if (element === null) rowButtons.current.delete(path.key); else rowButtons.current.set(path.key, element); }}
          chipRef={(chipKey, element) => { if (element === null) chipButtons.current.delete(chipKey); else chipButtons.current.set(chipKey, element); }}
          onGripDown={narrow ? undefined : (event) => pressToDrag(event, { kind: "PATH", key: path.key, pathKey: path.key })}
          onChipDown={narrow ? undefined : (event, chipKey) => pressToDrag(event, { kind: "CHIP", key: chipKey, pathKey: path.key })}
          drag={rowDrag(path, at)}
        />
      ))}
    </ol>
  );
}
