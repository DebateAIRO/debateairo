import { describe, expect, it } from "vitest";
import { placeChallengePopover } from "../../apps/ui/components/ChallengePopover.js";

/*
 * Keyboard audit round 2 (2026-11-12), DEB2-14: the Challenge popover is a fixed card centred on
 * its anchor and drawn above it. Its focused action must not open off-screen: x is kept inside the
 * viewport, and the card goes below the anchor when there is no room above. (At 640px and below
 * globals.css draws it as a bottom sheet instead, whatever this says.)
 */
const viewport = { width: 1280, height: 720 };
const card = { width: 252, height: 260 };

describe("placeChallengePopover", () => {
  it("keeps the old placement when the card fits: centred on the anchor, above it", () => {
    expect(placeChallengePopover({ x: 640, top: 400, bottom: 440 }, card, viewport)).toEqual({ left: 640, top: 400, placement: "above" });
  });

  it("keeps the whole card inside the left and right edges", () => {
    expect(placeChallengePopover({ x: 40, top: 400, bottom: 440 }, card, viewport).left).toBe(126 + 8);
    expect(placeChallengePopover({ x: 1270, top: 400, bottom: 440 }, card, viewport).left).toBe(1280 - 126 - 8);
  });

  it("centres the card on a viewport narrower than it", () => {
    expect(placeChallengePopover({ x: 20, top: 400, bottom: 440 }, card, { width: 200, height: 720 }).left).toBe(100);
  });

  it("goes below the anchor when there is no room above", () => {
    expect(placeChallengePopover({ x: 640, top: 120, bottom: 160 }, card, viewport)).toEqual({ left: 640, top: 168, placement: "below" });
  });

  it("when neither side fits, goes where there is more room, kept inside the viewport", () => {
    // 250 px above, 120 px below: above.
    const above = placeChallengePopover({ x: 640, top: 250, bottom: 600 }, card, viewport);
    expect(above.placement).toBe("above");
    expect(above.top).toBeGreaterThanOrEqual(0);
    // 150 px above, 220 px below: below, pulled up so the card ends inside the window.
    const below = placeChallengePopover({ x: 640, top: 150, bottom: 500 }, card, viewport);
    expect(below.placement).toBe("below");
    expect(below.top + card.height).toBeLessThanOrEqual(viewport.height);
  });
});
