"use client";

import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from "react";

/*
 * map-f10 (V4 screen review, 3 Nov): the drawn map and the outline are one keyboard stop each. Inside, the arrow keys move:
 * Up and Down go between the rows in reading order (Home and End to the first and last), Right unfolds a folded branch
 * (or, once it is open, goes to its first row), Left folds an open branch (or goes to the row it hangs under), Enter opens
 * the question, and Space ticks the row's pick box. Each row is a control marked `data-rove` with its own `data-row` id and
 * the id of the row it hangs under (`data-parent`, else the nearest `data-group` around it); a branch says whether it is
 * open with aria-expanded (or `data-expanded`, when a separate fold button owns aria-expanded). Every other control inside
 * leaves the tab order: its row reaches it (`data-no-rove` keeps a control out of the rows: a row's own fold button). On a
 * right-to-left page the two side keys swap, as the page is mirrored: Left unfolds or goes in, Right folds or goes out.
 * A row the page does not name gets its place in reading order as its id, worked out again on every pass. Nothing is stored.
 * Keyboard audit 2026-11-12 (V4C-1, V4B-F8): a render that takes away the row holding focus (a suggestion unticked, a poll
 * re-planning the card limit, an open question turning into a dig) puts focus on the nearest row instead of the page: the
 * same row if it is still drawn, else its path's "more" row, else the row it hangs under, else the one tab stop. A part
 * marked `data-rove-skip` (the waiting card under the question, V4B-M3) is not rows: its controls keep their own Tab stop.
 * Keyboard audit 2026-11-12 (V4B-M1): `hint` names the line that says these keys; the row focus enters on is described by
 * it (so a screen reader hears it once, not on every arrow press), and on a row that has a pick box Space only ever ticks it:
 * a closed box makes it do nothing (it used to fall through to the button and open the question). A row with no pick box
 * keeps its own Space press.
 */

/** Whether the map is laid out right to left (the page's language, app/layout.tsx; or a `dir` around the map). */
export function isRightToLeft(element: Element): boolean {
  const direction = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(element).direction : "";
  if (direction === "rtl" || direction === "ltr") return direction === "rtl";
  const marked = element.closest("[dir]:not([dir='auto'])");
  return (marked?.getAttribute("dir") ?? document.documentElement.getAttribute("dir") ?? "").toLowerCase() === "rtl";
}

const ROW = "[data-rove]";
/** Every button and link is a row (a suggestion's, a "more" link); the pick boxes are reached from their row with Space. */
const ROW_CONTROLS = "button, a[href]";
const CONTROLS = "a[href], button, input, select, textarea, summary, [tabindex]";
/** V4B-M3: a part drawn inside the map that is not part of its rows (its controls are ordinary Tab stops). */
const SKIP = "[data-rove-skip]";

/** Each returns whether it folded or unfolded anything (false: the key then moves on as if there were nothing to do). */
type Handlers = Readonly<{
  onExpand?: (row: string) => boolean;
  onCollapse?: (row: string) => boolean;
  /** V4B-M1: the id of the line that says the keys (it describes the row focus enters on). */
  hint?: string;
}>;

/** V4B-M1: adds the key line to a row's description, or takes it away, keeping whatever else describes the row. */
function describeWith(row: HTMLElement, hint: string, on: boolean): void {
  const ids = (row.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id.length > 0 && id !== hint);
  if (on) ids.push(hint);
  if (ids.length > 0) row.setAttribute("aria-describedby", ids.join(" "));
  else row.removeAttribute("aria-describedby");
}

/** The rows a person can reach now, in reading order (a folded part is inert, so its rows are not). */
function rowsOf(box: HTMLElement): HTMLElement[] {
  for (const control of box.querySelectorAll<HTMLElement>(ROW_CONTROLS)) {
    if (control.dataset.rove === undefined && control.dataset.noRove === undefined && control.closest(SKIP) === null) control.dataset.rove = "";
  }
  const rows = [...box.querySelectorAll<HTMLElement>(ROW)]
    .filter((row) => !row.hasAttribute("disabled") && row.closest("[inert], [hidden]") === null && row.closest(SKIP) === null);
  rows.forEach((row, index) => {
    // A row the page names keeps its id; any other gets its place now (never an old place another row may hold since).
    if (row.dataset.row === undefined || row.dataset.row.length === 0 || row.dataset.rowAuto !== undefined) {
      row.dataset.row = `row:${index}`;
      row.dataset.rowAuto = "";
    }
    if (row.dataset.parent === undefined) {
      const group = row.parentElement?.closest<HTMLElement>("[data-group]");
      if (group !== null && group !== undefined && box.contains(group)) row.dataset.parent = group.dataset.group ?? "";
    }
  });
  return rows;
}

/** The row's own pick box: a checkbox beside it (in its own card), never one of a row further down. A closed box is drawn
 *  disabled (PickBox), so it is still found here; a row with no box (a path, "Show more", a read-only map) finds none. */
function pickBoxOf(row: HTMLElement): HTMLInputElement | null {
  return row.parentElement?.querySelector<HTMLInputElement>(":scope > label > input[type=checkbox]") ?? null;
}

/** The row a focused element is (or sits in), when focus is inside the map now; else null. */
function focusedRowIn(box: HTMLElement | null): HTMLElement | null {
  if (box === null || typeof document === "undefined") return null;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !box.contains(focused)) return null;
  return focused.closest<HTMLElement>(ROW);
}

/** Where focus goes when its row left the map (V4C-1): the same row, its path's "more" row, the row above it, the tab stop. */
function nearestRow(rows: readonly HTMLElement[], lost: Readonly<{ row: string | null; parent: string | null }>): HTMLElement | undefined {
  const named = (id: string | null): HTMLElement | undefined => (id === null ? undefined : rows.find((row) => row.dataset.row === id));
  const parent = lost.parent === null || lost.parent.length === 0 ? null : lost.parent;
  return named(lost.row)
    ?? (lost.row?.startsWith("suggestion:") === true && parent !== null ? named(`suggestions-more@${parent}`) : undefined)
    ?? (parent === null ? undefined : named(`more:${parent}`))
    ?? named(parent)
    ?? rows.find((row) => row.tabIndex === 0)
    ?? rows.find((row) => row.getAttribute("aria-current") === "true")
    ?? rows[0];
}

export function useMapKeys(ref: RefObject<HTMLElement | null>, handlers: Handlers = {}): Readonly<{
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  /** V4B-F8: the row that holds keyboard focus as this render began (null: focus is not in the map). */
  focusedRow: string | null;
}> {
  const active = useRef<string | null>(null);
  const activeParent = useRef<string | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  // Read as this render begins: whether focus is inside the map, and on which row (V4C-1, V4B-F8). The DOM is the one the
  // last commit left, so a render that removes the focused row still sees it here.
  const focusWasInside = ref.current !== null && typeof document !== "undefined" && ref.current.contains(document.activeElement);
  const focusedBefore = focusWasInside ? focusedRowIn(ref.current) : null;

  // What the page draws under the question's card (the pause, the waiting card) is marked as not the map's: it hands its
  // own focus on (to the question card), and this hook leaves that to it.
  const focusWasOnARow = focusWasInside && document.activeElement?.closest(SKIP) == null;

  // Keyboard audit 2026-11-12 (V4C-1): focus was in the map when this render began and the commit left it on the page
  // (its row was removed): it goes to the nearest row, without scrolling. Focus that is anywhere real is never taken.
  useLayoutEffect(() => {
    const box = ref.current;
    if (box === null || !focusWasOnARow) return;
    const now = document.activeElement;
    if (now !== null && now !== document.body && now !== document.documentElement) return;
    const target = nearestRow(rowsOf(box), { row: active.current, parent: activeParent.current });
    target?.focus({ preventScroll: true });
  });

  // After every render: the active row (else the one on screen, else the first) is the one tab stop.
  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const rows = rowsOf(box);
    for (const control of box.querySelectorAll<HTMLElement>(CONTROLS)) {
      if (!control.matches(ROW) && control.closest(SKIP) === null) control.tabIndex = -1;
    }
    const current = rows.find((row) => row.dataset.row === active.current)
      ?? rows.find((row) => row.getAttribute("aria-current") === "true")
      ?? rows[0];
    for (const row of rows) row.tabIndex = row === current ? 0 : -1;
  });

  const focusRow = (box: HTMLElement, row: HTMLElement | undefined): void => {
    if (row === undefined) return;
    for (const other of rowsOf(box)) other.tabIndex = other === row ? 0 : -1;
    active.current = row.dataset.row ?? null;
    activeParent.current = row.dataset.parent ?? null;
    row.focus();
  };

  const onFocus = (event: FocusEvent<HTMLElement>): void => {
    const box = ref.current;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ROW) : null;
    if (box === null || row === null || !box.contains(row)) return;
    const rows = rowsOf(box);
    active.current = row.dataset.row ?? null;
    activeParent.current = row.dataset.parent ?? null;
    for (const other of rows) other.tabIndex = other === row ? 0 : -1;
    // V4B-M1: focus coming from outside the map is told the keys; a move inside it is not told again.
    const hint = handlersRef.current.hint;
    if (hint === undefined) return;
    // A part that is not rows (the waiting card's Try now, data-rove-skip) is outside them: coming from it is entering too.
    const from = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    const entering = from === null || !box.contains(from) || from.closest(SKIP) !== null;
    for (const other of rows) describeWith(other, hint, entering && other === row);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const box = ref.current;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ROW) : null;
    if (box === null || row === null || !box.contains(row) || event.altKey || event.ctrlKey || event.metaKey) return;
    // A key typed in a text box inside the map is the text box's own.
    if (event.target instanceof HTMLElement && event.target !== row) return;
    const rows = rowsOf(box);
    const at = rows.indexOf(row);
    const expanded = row.dataset.expanded ?? row.getAttribute("aria-expanded");
    // map-f10 on a right-to-left page: the side keys are mirrored.
    const rtl = isRightToLeft(box);
    const key = event.key === "ArrowRight" ? (rtl ? "ArrowLeft" : "ArrowRight")
      : event.key === "ArrowLeft" ? (rtl ? "ArrowRight" : "ArrowLeft") : event.key;
    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(box, rows[at + 1]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRow(box, rows[at - 1]);
        return;
      case "Home":
        event.preventDefault();
        focusRow(box, rows[0]);
        return;
      case "End":
        event.preventDefault();
        focusRow(box, rows[rows.length - 1]);
        return;
      case "ArrowRight":
        event.preventDefault();
        if (expanded === "false" && handlersRef.current.onExpand?.(row.dataset.row ?? "") === true) return;
        focusRow(box, rows.find((candidate) => candidate.dataset.parent === row.dataset.row));
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (expanded === "true" && handlersRef.current.onCollapse?.(row.dataset.row ?? "") === true) return;
        focusRow(box, rows.find((candidate) => candidate.dataset.row === row.dataset.parent));
        return;
      case " ": {
        // V4B-M1: on a row that has a pick box Space is the box's key only; a closed box makes it do nothing (Enter opens
        // the question). A row with no box is a plain button and keeps its own Space press (wave-3 fix round, A2).
        const pick = pickBoxOf(row);
        if (pick === null) return;
        event.preventDefault();
        if (!pick.disabled) pick.click();
        return;
      }
      default:
    }
  };

  return { onKeyDown, onFocus, focusedRow: focusedBefore?.dataset.row ?? null };
}
