"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { focusIsLost } from "@/lib/focusGuard";
import { PICKS_UNDO_MS } from "@/lib/v4/usePicksUndo";
import { V4UndoNote } from "./V4UndoNote";

/*
 * "Picks cleared [Undo]" for the Undo window after "Clear", where the tray was. It is the shared Undo note (V4UndoNote):
 * the same look, the same Undo window with the quiet shrinking line, focus on Undo and Esc to undo; with reduced motion
 * the line stands still and a written line says it.
 * The page's bottom stack places it, beside any dig notes. Undo brings the picks back and the note goes; so does the end of
 * the Undo window (lib/v4/usePicksUndo.ts). dig-f7: when the note goes while focus is on it (its Undo was pressed, or its
 * Undo window ended), focus moves to `returnFocus` (the tray's Clear button once the picks are back, else the page's next
 * place), never to the page's top.
 */
export function V4PicksClearedNote(props: Readonly<{
  onUndo: () => void;
  catalog: MessageCatalog;
  /** When the offer ends (ms since the epoch; usePicksUndo's `endsAt`). Absent: the Undo window from when the note appears. */
  endsAt?: number;
  /** dig-f7: move focus to Undo when the note appears (default true); false once it has done so for this offer. */
  takeFocus?: boolean;
  onFocusTaken?: () => void;
  /** Where focus goes when the note goes while it had focus. */
  returnFocus?: () => HTMLElement | null;
}>) {
  const { onUndo, catalog } = props;
  const [fallbackEnd] = useState(() => Date.now() + PICKS_UNDO_MS);
  const words = t(catalog, "v4.dig.picksCleared");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef(props.returnFocus);
  useEffect(() => {
    returnFocus.current = props.returnFocus;
  });
  // Runs as the note is taken off the page, while its elements are still there: if focus is on it, it moves on once the
  // rest of the change is drawn (the tray brought back by Undo).
  useLayoutEffect(() => {
    const root = rootRef.current;
    return () => {
      const active = document.activeElement;
      if (root === null || active === null || !root.contains(active)) return;
      queueMicrotask(() => {
        if (!focusIsLost()) return;
        const target = returnFocus.current?.() ?? null;
        if (target !== null && target.isConnected) target.focus();
      });
    };
  }, []);
  return (
    <div ref={rootRef} className="v4PicksCleared">
      <V4UndoNote
        state="counting"
        label={words}
        sendsAt={props.endsAt ?? fallbackEnd}
        durationMs={PICKS_UNDO_MS}
        onUndo={onUndo}
        undoLabel={t(catalog, "v4.dig.undo")}
        undoName={t(catalog, "v4.dig.picksClearedUndoLabel")}
        stillLine={t(catalog, "v4.dig.picksClearedStill")}
        announce={t(catalog, "v4.dig.picksClearedAnnounce")}
        sendingLine={words}
        confirmedLine={words}
        {...(props.takeFocus === undefined ? {} : { takeFocus: props.takeFocus })}
        {...(props.onFocusTaken === undefined ? {} : { onFocusTaken: props.onFocusTaken })}
      />
    </div>
  );
}
