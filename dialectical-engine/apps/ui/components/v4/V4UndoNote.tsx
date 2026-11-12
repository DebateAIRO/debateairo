"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DIG_UNDO_MS } from "@/lib/v4/digUndo";

/*
 * THE Undo note of the V4 pages: one look, one Undo window, one confirmation. It only shows and offers; whoever owns the
 * thing that waits decides when it is sent and passes plain words in, so a dig, a Start or any later Undo looks and behaves
 * the same:
 *  - A quiet line under the words shrinks over the Undo window; no ticking number. With reduced motion the line stands
 *    still and a few words say it instead ("Starts in a few seconds").
 *  - dig-f7: focus moves to Undo when the note appears, Esc undoes, a screen reader hears one line once, and focus goes
 *    back where it was after Undo or the send.
 *  - After the Undo window the note says it is starting until the outcome, so there is no gap; after Undo it says
 *    "Cancelled. Nothing was used." (the caller removes it after a few seconds).
 * The note draws no position of its own: the page's bottom stack places it (inside the bottom bar on a phone,
 * bottom-left on a computer).
 */

/** How long the line shrinks when the caller does not say: the site's one Undo window, so it ends as the send starts. */
export const UNDO_NOTE_MS = DIG_UNDO_MS;

export type V4UndoNoteState = "counting" | "sending" | "cancelled" | "done";

export type V4UndoNoteProps = Readonly<{
  state: V4UndoNoteState;
  /** What waits, in the page's words (the caller marks any AI text inside). Shown while counting and sending. */
  label: ReactNode;
  /** When it is sent (ms since the epoch); the line shrinks from `sendsAt - durationMs` to `sendsAt`. */
  sendsAt: number;
  durationMs?: number;
  onUndo: () => void;
  /** The visible word ("Undo"). */
  undoLabel: string;
  /** The button's spoken name ("Undo this dig"); the visible word when absent. */
  undoName?: string;
  /** With reduced motion the line stands still and these words say it instead ("Starts in a few seconds"). */
  stillLine: string;
  /** Read out once, when the note takes focus ("Your dig starts in a few seconds. Undo is selected."). */
  announce: string;
  /** After the Undo window, until the outcome ("Starting your dig…"). */
  sendingLine: string;
  /** After Undo ("Cancelled. Nothing was used."). */
  confirmedLine: string;
  /** state "done": the outcome (it may hold a link or a button); `doneAnnounce` is what a screen reader hears. */
  doneLine?: ReactNode;
  doneAnnounce?: string;
  /** A close button on a settled note (cancelled or done). */
  onClose?: () => void;
  closeLabel?: string;
  /** dig-f7: move focus to Undo when the note appears (default true). False on a page the note travelled to. */
  takeFocus?: boolean;
  onFocusTaken?: () => void;
  /**
   * Where focus goes back after Undo or the send when what had focus as the note appeared (the pressed button) is no
   * longer on the page (a phone's pinned bar swaps its button for the note).
   */
  returnFocus?: () => HTMLElement | null;
  /** An older note on a phone, folded to one line: its words and Undo, no line. */
  folded?: boolean;
}>;

function focusable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && element.isConnected;
}

export function V4UndoNote(props: V4UndoNoteProps) {
  const { state, durationMs = UNDO_NOTE_MS, takeFocus = true } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const undoRef = useRef<HTMLButtonElement | null>(null);
  const backTo = useRef<HTMLElement | null>(null);
  const counted = useRef(state === "counting");
  // Kept once: a note drawn again on another page carries on from where its line had got to.
  const [elapsed] = useState(() => Math.min(durationMs, Math.max(0, Date.now() - (props.sendsAt - durationMs))));
  const [spoken, setSpoken] = useState("");
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // dig-f7: focus moves to Undo once, and a screen reader hears one line (set after the region exists, so it is read).
  useEffect(() => {
    const now = latest.current;
    if (state !== "counting" || !takeFocus) return;
    const before = document.activeElement;
    // A second run of this effect (React's development check) finds focus already on Undo: keep the first answer.
    if (focusable(before) && !(rootRef.current?.contains(before) ?? false)) backTo.current = before;
    undoRef.current?.focus();
    setSpoken(now.announce);
    now.onFocusTaken?.();
    // Only when the note first appears (its later states keep the focus rules below).
  }, []);

  // Once it no longer counts, focus goes back where it was, if it was on the note (or got lost with the Undo button).
  useEffect(() => {
    const now = latest.current;
    if (state === "counting") {
      counted.current = true;
      return;
    }
    if (state === "cancelled") setSpoken(now.confirmedLine);
    if (state === "done" && now.doneAnnounce !== undefined) setSpoken(now.doneAnnounce);
    if (!counted.current) return;
    counted.current = false;
    const active = document.activeElement;
    const lost = active === null || active === document.body || (rootRef.current?.contains(active) ?? false);
    if (!lost) return;
    const target = focusable(backTo.current) ? backTo.current : now.returnFocus?.() ?? null;
    if (focusable(target)) target.focus();
  }, [state]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || state !== "counting") return;
    // Esc undoes, and is not also taken by a dialog around the note (the phone map closes on Esc).
    event.preventDefault();
    event.stopPropagation();
    props.onUndo();
  };

  const folded = props.folded === true;
  return (
    <div
      ref={rootRef}
      className={`v4Undo v4Undo-${state}${folded ? " v4UndoFolded" : ""}`}
      onKeyDown={onKeyDown}
    >
      <span className="v4SrOnly" role="status">{spoken}</span>
      {state === "counting" || state === "sending" ? (
        <>
          <p className="v4UndoText">
            {props.label}
            {state === "counting"
              ? <span className="v4UndoStill">{" · "}{props.stillLine}</span>
              : <span className="v4UndoSending">{" · "}{props.sendingLine}</span>}
          </p>
          {state === "counting" ? (
            <button
              ref={undoRef}
              type="button"
              className="v4UndoBtn"
              aria-label={props.undoName ?? props.undoLabel}
              onClick={props.onUndo}
            >
              {props.undoLabel}
            </button>
          ) : null}
          {state === "counting" && !folded ? (
            <span className="v4UndoLine" aria-hidden="true">
              <span
                className="v4UndoLineFill"
                style={{ animationDuration: `${durationMs}ms`, animationDelay: `-${elapsed}ms` }}
              />
            </span>
          ) : null}
        </>
      ) : (
        <>
          <p className="v4UndoText">{state === "cancelled" ? props.confirmedLine : props.doneLine}</p>
          {props.onClose !== undefined && props.closeLabel !== undefined ? (
            <button type="button" className="v4UndoBtn" onClick={props.onClose}>{props.closeLabel}</button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Several waiting things in one note (dig-d3 A): each line with its own Undo and its own line, newest last. At most
 * `max` lines; older ones fold to "+N more starting", which opens them. `foldOlder` (a phone): the lines above the
 * newest are folded to one line each.
 */
export function V4UndoNotes(props: Readonly<{
  items: readonly Readonly<{ key: string | number; render: (folded: boolean) => ReactNode }>[];
  max: number;
  foldOlder?: boolean;
  moreLabel: (count: number) => string;
  className?: string;
}>) {
  const { items, max } = props;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (items.length <= max) setOpen(false);
  }, [items.length, max]);
  if (items.length === 0) return null;
  const hidden = open || items.length <= max ? 0 : items.length - Math.max(1, max - 1);
  const shown = items.slice(hidden);
  return (
    <div className={`v4UndoNotes${props.className === undefined ? "" : ` ${props.className}`}`}>
      {hidden > 0 ? (
        <button type="button" className="v4UndoMore" aria-expanded="false" onClick={() => setOpen(true)}>
          {props.moreLabel(hidden)}
        </button>
      ) : null}
      {shown.map((item, index) => (
        <div key={item.key} className="v4UndoNotesItem">
          {item.render(props.foldOlder === true && index < shown.length - 1)}
        </div>
      ))}
    </div>
  );
}
