"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import {
  cutText, PATH_PLAN_LIMITS, type PathPlan, type PathPlanAction, type PathPlanRefusal, type PlanPath, type PlanViewpoint
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
 *    only in ⋯. No drag grip anywhere here (Task 77 adds the mouse's drag).
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
export function V4StartChip({ viewpoint, n, count, path, picked, catalog, open, onOpen, onKeyDown, buttonRef }: Readonly<{
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
}>) {
  const words = chipText(viewpoint);
  return (
    <li className="v4StartChipItem">
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        className="v4Chip v4StartChip"
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
}>;

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
  // In "Combine with…", a tap anywhere on another row presses it (its own buttons keep their own presses).
  const onRowClick = combining && !picked
    ? (event: MouseEvent<HTMLLIElement>): void => {
      if ((event.target as Element).closest("button, a, input, textarea, [role='menu']") !== null) return;
      props.onPress();
    }
    : undefined;
  const classes = ["v4StartRow"];
  if (narrow) classes.push("v4StartRow--narrow");
  if (picked) classes.push("v4StartRow--picked");
  else if (combining) classes.push("v4StartRow--pickable");
  if (props.snapClass !== null) classes.push(props.snapClass);
  return (
    <li className={classes.join(" ")} data-path-key={path.key} onClick={onRowClick}>
      <div className="v4StartRowHead">
        <button
          ref={props.rowRef}
          type="button"
          className="v4StartRowButton"
          aria-label={label}
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
              />
            ))}
          </ul>
          {chipMenu?.node ?? null}
        </div>
      ) : null}
      {tagLine(path, catalog, props.onSplit)}
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
    <ol className="v4StartList">
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
        />
      ))}
    </ol>
  );
}
