"use client";

import { useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { PICKS_UNDO_MS } from "@/lib/v4/usePicksUndo";
import { V4UndoNote } from "./V4UndoNote";

/*
 * V4 screen review, 3 Nov (dig-f23): "Picks cleared [Undo]" for 10 seconds after "Clear", where the tray was. It is the
 * shared Undo note (V4UndoNote, journey-f21): the same look, the same 10 seconds with the quiet shrinking line (owner
 * r2-22), focus on Undo and Esc to undo (dig-f7); with reduced motion the line stands still and a written line says it.
 * The page's bottom stack places it, beside any dig notes. Undo brings the picks back and the note goes; so does the end of
 * the 10 seconds (lib/v4/usePicksUndo.ts).
 */
export function V4PicksClearedNote(props: Readonly<{
  onUndo: () => void;
  catalog: MessageCatalog;
  /** When the offer ends (ms since the epoch; usePicksUndo's `endsAt`). Absent: 10 seconds from when the note appears. */
  endsAt?: number;
}>) {
  const { onUndo, catalog } = props;
  const [fallbackEnd] = useState(() => Date.now() + PICKS_UNDO_MS);
  const words = t(catalog, "v4.dig.picksCleared");
  return (
    <div className="v4PicksCleared">
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
      />
    </div>
  );
}
