"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/*
 * The phone's Map sheet gives focus back to what opened it (the wave-2 browser check, 4 Nov; R2TIME-4/R2REG-4 before it).
 * Three things open it: the pinned bar's Map button, "Your picks ▸" above the bar (dig-f4) and the minimap in the pinned
 * top (map-f7). The bottom stack is not drawn while the sheet is open, so its two buttons are new ones by the time it closes:
 * they are remembered by which one it was and found again through their refs. The minimap stays on the page, so it is
 * remembered as itself. A row of the sheet that opened a question has already moved focus on to the panel heading (the
 * page's focus effect runs first in the same commit), so focus is given back only while nothing holds it. When the opener
 * is gone (the picks were cleared in the sheet), focus goes to the Map button, as before. Nothing is kept anywhere.
 */

type Opener = "map" | "picks" | HTMLElement | null;

export interface SheetFocusReturn {
  /** The pinned bar's Map button (V4BottomStack's `mapButtonRef`). */
  readonly mapButtonRef: RefObject<HTMLButtonElement | null>;
  /** "Your picks ▸" (V4BottomStack's `picksButtonRef`). */
  readonly picksButtonRef: RefObject<HTMLButtonElement | null>;
  /** Opens the sheet from the Map button. */
  readonly openFromMap: () => void;
  /** Opens the sheet from "Your picks ▸". */
  readonly openFromPicks: () => void;
  /** Opens the sheet from anything else that stays on the page (the minimap): the focused element is given focus back. */
  readonly openFromHere: () => void;
}

export function useSheetFocusReturn(sheetOpen: boolean, openSheet: () => void): SheetFocusReturn {
  const mapButtonRef = useRef<HTMLButtonElement | null>(null);
  const picksButtonRef = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<Opener>(null);
  const wasOpen = useRef(false);

  const openFromMap = useCallback((): void => {
    opener.current = "map";
    openSheet();
  }, [openSheet]);
  const openFromPicks = useCallback((): void => {
    opener.current = "picks";
    openSheet();
  }, [openSheet]);
  const openFromHere = useCallback((): void => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    openSheet();
  }, [openSheet]);

  useEffect(() => {
    if (wasOpen.current && !sheetOpen) {
      if (document.activeElement === document.body || document.activeElement === null) {
        const was = opener.current;
        const back = was === "picks" ? picksButtonRef.current : was instanceof HTMLElement ? was : null;
        (back !== null && back.isConnected ? back : mapButtonRef.current)?.focus();
      }
      opener.current = null;
    }
    wasOpen.current = sheetOpen;
  }, [sheetOpen]);

  return { mapButtonRef, picksButtonRef, openFromMap, openFromPicks, openFromHere };
}
