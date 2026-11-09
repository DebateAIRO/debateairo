/*
 * V4 start step, Task 76b (choose-f19, coordinator's ruling of 4 Nov night: "the fold", one of the six moves): at Start the
 * card folds into the map's first card, and Undo plays it backwards. The page measures where the card was and where the
 * first card is, puts the first card where the card was with one transform (origin at the top left, no transition), then
 * on the next frame lets it go to `none` under the fold's own token (`.v4FoldMoving`, v4-ask.css). Pure: no page is read here.
 */

/** A box on the screen, as getBoundingClientRect gives it. */
export type FoldRect = Readonly<{ left: number; top: number; width: number; height: number }>;

function sized(rect: FoldRect): boolean {
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)
    && rect.width > 0 && rect.height > 0;
}

/**
 * The transform that puts a box drawn at `to` where `from` is (transform-origin 0 0): "translate(0px, 180px) scale(1, 5)".
 * A box with no size (or no layout) on either side has nothing to grow from or to: "none".
 */
export function foldTransform(from: FoldRect, to: FoldRect): string {
  if (!sized(from) || !sized(to)) return "none";
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}
