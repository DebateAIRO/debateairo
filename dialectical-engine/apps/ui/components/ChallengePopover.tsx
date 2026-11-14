"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { challengeActions, type PopoverState } from "@/lib/scrutiny";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";
import composeEnglish from "@/messages/en/compose.json";
import { useDialogSurface } from "@/components/dialogSurface";

/** `below`: the card hangs under its anchor (there was no room above it); else it sits above. */
export type ChallengePopoverPlacement = { left: number; top: number; below: boolean };

/** Space kept between the card and the viewport's edges. */
const EDGE = 8;

/**
 * Where the card goes (keyboard audit 2026-11-12): centred on the anchor and above it, as before,
 * but its left edge and right edge kept inside the viewport, and below the anchor when there is no
 * room above, so the action that takes focus is never drawn off-screen. `anchor.top` is the point
 * the card's bottom sits on (the anchor's top less 8, from the page); `card` is the card's laid-out
 * size, its bottom margin included. A card that fits on neither side goes where there is more room,
 * pulled back inside the viewport as far as it can be.
 */
export function placeChallengePopover(
  anchor: { x: number; top: number; bottom: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number }
): ChallengePopoverPlacement {
  const half = card.width / 2;
  const left = viewport.width < card.width + 2 * EDGE
    ? viewport.width / 2
    : Math.min(Math.max(anchor.x, half + EDGE), viewport.width - half - EDGE);
  const roomAbove = anchor.top - EDGE;
  const belowTop = anchor.bottom + EDGE;
  const roomBelow = viewport.height - EDGE - belowTop;
  if (roomAbove >= card.height) return { left, top: anchor.top, below: false };
  if (roomBelow >= card.height) return { left, top: belowTop, below: true };
  if (roomAbove >= roomBelow) return { left, top: Math.min(EDGE + card.height, viewport.height - EDGE), below: false };
  return { left, top: Math.max(EDGE, viewport.height - EDGE - card.height), below: true };
}

export function ChallengePopover({
  state,
  anchorBottom,
  part,
  returnFocus,
  onClose,
  onChoose,
  catalog = debateDrawersEnglish,
  composeCatalog = composeEnglish
}: {
  state: PopoverState;
  /** The bottom of what the popover is anchored to, so the card can go below it. */
  anchorBottom?: number;
  /**
   * Opened from a Challenge button: the "Which part?" box is shown, starting with this text (a
   * selection in the argument's prose, or ""). Left out for a selection, whose quote is the part.
   */
  part?: string;
  /** Where a key press that closes the card puts focus when its opener has gone (a pointer selection). */
  returnFocus?: () => HTMLElement | null;
  onClose: () => void;
  /** `part` is the box's words, trimmed, when the box is shown. */
  onChoose: (actionKey: string, part?: string) => void;
  catalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: the challenge actions. */
  composeCatalog?: MessageCatalog;
}) {
  // Escape is a key press, so focus must land somewhere real (keyboard audit 2026-11-12): the
  // opener when it is still there, else `returnFocus`. A click on the scrim leaves the page as it was.
  const keyReturnRef = useRef<HTMLElement | null>(null);
  const dialogRef = useDialogSurface<HTMLDivElement>(() => {
    keyReturnRef.current = returnFocus?.() ?? null;
    onClose();
  }, keyReturnRef);
  const [partText, setPartText] = useState(part ?? "");
  const partId = useId();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<ChallengePopoverPlacement | null>(null);
  // Measured before paint, so the card never shows off-screen first.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    setPlace(placeChallengePopover(
      { x: state.x, top: state.y, bottom: anchorBottom ?? state.y + EDGE },
      { width: anchor.offsetWidth, height: anchor.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  }, [state.x, state.y, anchorBottom]);
  return (
    <>
      <div className="popScrim" onClick={onClose} />
      <div
        className="popAnchor"
        ref={anchorRef}
        data-placement={place?.below ? "below" : "above"}
        style={{ left: place?.left ?? state.x, top: place?.top ?? state.y }}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="popCard"
          role="dialog"
          aria-modal
          aria-label={t(catalog, "debateDrawers.challenge.title")}
        >
          {part !== undefined ? (
            <div className="popPart">
              <label className="popPartLabel" htmlFor={partId}>{t(catalog, "debateDrawers.challenge.whichPart")}</label>
              <input
                id={partId}
                type="text"
                className="popPartInput"
                value={partText}
                onChange={(event) => setPartText(event.target.value)}
              />
            </div>
          ) : state.text ? <div className="popQuote">“{state.text}”</div> : null}
          <div className="popLabel" aria-hidden="true">{t(catalog, "debateDrawers.challenge.title")}</div>
          {challengeActions(composeCatalog).map((action) => (
            <button key={action.key} type="button" className="popAction" onClick={() => (part !== undefined ? onChoose(action.key, partText.trim()) : onChoose(action.key))}>
              <span className="popActionIcon" aria-hidden="true">{action.icon}</span>
              <span className="popActionText">
                <span className="popActionLabel">{action.label}</span>
                <span className="popActionSub">{action.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
