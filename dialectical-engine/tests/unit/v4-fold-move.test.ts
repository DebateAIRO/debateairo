import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { foldTransform } from "../../apps/ui/lib/v4/foldMove.js";

/*
 * V4 start step, Task 76b (choose-f19, coordinator's ruling of 4 Nov night): Start folds the card into the map's first card,
 * and Undo plays the fold backwards. The move is one transform from where the card was to where the first card is (origin at
 * the top left), then `none` under the fold's own token. Every rectangle here is made up.
 */
const CARD = Object.freeze({ left: 16, top: 300, width: 343, height: 600 });
const FIRST_CARD = Object.freeze({ left: 16, top: 120, width: 343, height: 120 });

describe("foldTransform (choose-f19)", () => {
  it("Start: the map's first card starts where the card was, moved and scaled from its top left", () => {
    expect(foldTransform(CARD, FIRST_CARD)).toBe("translate(0px, 180px) scale(1, 5)");
  });

  it("Undo: the same move backwards, from the first card to the card", () => {
    expect(foldTransform(FIRST_CARD, CARD)).toBe("translate(0px, -180px) scale(1, 0.2)");
  });

  it("moves sideways too (a page whose card and first card do not share a left edge)", () => {
    expect(foldTransform({ left: 40, top: 10, width: 200, height: 100 }, { left: 20, top: 30, width: 400, height: 50 }))
      .toBe("translate(20px, -20px) scale(0.5, 2)");
  });

  it("a zero width or height on either side: none (nothing to grow from or to)", () => {
    expect(foldTransform({ ...CARD, height: 0 }, FIRST_CARD)).toBe("none");
    expect(foldTransform(CARD, { ...FIRST_CARD, height: 0 })).toBe("none");
    expect(foldTransform({ ...CARD, width: 0 }, FIRST_CARD)).toBe("none");
    expect(foldTransform(CARD, { ...FIRST_CARD, width: 0 })).toBe("none");
  });

  it("a rectangle that is not a number (no layout) is none too", () => {
    expect(foldTransform({ ...CARD, top: Number.NaN }, FIRST_CARD)).toBe("none");
    expect(foldTransform(CARD, { ...FIRST_CARD, width: Number.POSITIVE_INFINITY })).toBe("none");
  });
});

describe("the fold's CSS rule (v4-ask.css)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");

  it(".v4FoldMoving moves the transform with the fold's own token and the move ease, from the top left, and names no other duration", () => {
    const rules = [...css.matchAll(/\.v4FoldMoving\s*\{([^}]*)\}/gu)];
    expect(rules).toHaveLength(1);
    const body = rules[0]![1]!;
    expect(body).toMatch(/transition:\s*transform var\(--v4-move-fold\) var\(--v4-ease-move\);/u);
    expect(body).toMatch(/transform-origin:\s*0 0;/u);
    expect(body).not.toMatch(/\d(?:\.\d+)?m?s\b/u);
  });
});
