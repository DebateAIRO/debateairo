"use client";

import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from "react";

/*
 * map-f10 (V4 screen review, 3 Nov): the drawn map and the outline are one keyboard stop each. Inside, the arrow keys move:
 * Up and Down go between the rows in reading order (Home and End to the first and last), Right unfolds a folded branch
 * (or, once it is open, goes to its first row), Left folds an open branch (or goes to the row it hangs under), Enter opens
 * the question, and Space ticks the row's pick box. Each row is a control marked `data-rove` with its own `data-row` id and
 * the id of the row it hangs under (`data-parent`, else the nearest `data-group` around it); a branch says whether it is
 * open with aria-expanded. Every other control inside leaves the tab order: its row reaches it. Nothing is stored.
 */

const ROW = "[data-rove]";
/** Every button and link is a row (a suggestion's, a "more" link); the pick boxes are reached from their row with Space. */
const ROW_CONTROLS = "button, a[href]";
const CONTROLS = "a[href], button, input, select, textarea, summary, [tabindex]";

/** Each returns whether it folded or unfolded anything (false: the key then moves on as if there were nothing to do). */
type Handlers = Readonly<{ onExpand?: (row: string) => boolean; onCollapse?: (row: string) => boolean }>;

/** The rows a person can reach now, in reading order (a folded part is inert, so its rows are not). */
function rowsOf(box: HTMLElement): HTMLElement[] {
  for (const control of box.querySelectorAll<HTMLElement>(ROW_CONTROLS)) {
    if (control.dataset.rove === undefined) control.dataset.rove = "";
  }
  const rows = [...box.querySelectorAll<HTMLElement>(ROW)]
    .filter((row) => !row.hasAttribute("disabled") && row.closest("[inert], [hidden]") === null);
  rows.forEach((row, index) => {
    if (row.dataset.row === undefined || row.dataset.row.length === 0) row.dataset.row = `row:${index}`;
    if (row.dataset.parent === undefined) {
      const group = row.parentElement?.closest<HTMLElement>("[data-group]");
      if (group !== null && group !== undefined && box.contains(group)) row.dataset.parent = group.dataset.group ?? "";
    }
  });
  return rows;
}

/** The row's own pick box: a checkbox beside it (in its own card), never one of a row further down. */
function pickBoxOf(row: HTMLElement): HTMLInputElement | null {
  const box = row.parentElement?.querySelector<HTMLInputElement>(":scope > label > input[type=checkbox]") ?? null;
  return box !== null && !box.disabled ? box : null;
}

export function useMapKeys(ref: RefObject<HTMLElement | null>, handlers: Handlers = {}): Readonly<{
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
}> {
  const active = useRef<string | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // After every render: the active row (else the one on screen, else the first) is the one tab stop.
  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const rows = rowsOf(box);
    for (const control of box.querySelectorAll<HTMLElement>(CONTROLS)) {
      if (!control.matches(ROW)) control.tabIndex = -1;
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
    row.focus();
  };

  const onFocus = (event: FocusEvent<HTMLElement>): void => {
    const box = ref.current;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ROW) : null;
    if (box === null || row === null || !box.contains(row)) return;
    active.current = row.dataset.row ?? null;
    for (const other of rowsOf(box)) other.tabIndex = other === row ? 0 : -1;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const box = ref.current;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ROW) : null;
    if (box === null || row === null || !box.contains(row) || event.altKey || event.ctrlKey || event.metaKey) return;
    // A key typed in a text box inside the map is the text box's own.
    if (event.target instanceof HTMLElement && event.target !== row) return;
    const rows = rowsOf(box);
    const at = rows.indexOf(row);
    const expanded = row.getAttribute("aria-expanded");
    switch (event.key) {
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
        const pick = pickBoxOf(row);
        if (pick === null) return;
        event.preventDefault();
        pick.click();
        return;
      }
      default:
    }
  };

  return { onKeyDown, onFocus };
}
