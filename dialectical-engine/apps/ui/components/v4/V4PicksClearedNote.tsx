"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 screen review, 3 Nov (dig-f23): "Picks cleared [Undo]" for 10 seconds after "Clear", where the tray was. A simple
 * local note for tonight: the shared Undo note (journey-f21, another track) replaces it at integration. Only the words are
 * a live region; the Undo button has a fixed name. The quiet shrinking line (owner r2-22) stands still with reduced motion.
 */
export function V4PicksClearedNote(props: Readonly<{ onUndo: () => void; catalog: MessageCatalog }>) {
  const { onUndo, catalog } = props;
  return (
    <div className="v4PicksCleared">
      <span className="v4PicksClearedText" role="status">{t(catalog, "v4.dig.picksCleared")}</span>
      <button type="button" className="v4PicksClearedUndo" onClick={onUndo} aria-label={t(catalog, "v4.dig.picksClearedUndoLabel")}>
        {t(catalog, "v4.dig.undo")}
      </button>
      {/* Shrinks over the 10 seconds of PICKS_UNDO_MS (lib/v4/usePicksUndo.ts); the time is set in v4-debate.css. */}
      <span className="v4PicksClearedLine" aria-hidden="true" />
    </div>
  );
}
