"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { isRightToLeft } from "./useMapKeys.js";

/*
 * RC-1 and RC-2 (the checks of the last fixes, 4 Nov): a small box that opens from a control (the public page's phone
 * menu, the computer bar's "Link copied." line) stays on screen wherever the header has put that control. On a phone the
 * Menu button starts the bar's second row at about 467 px and below, but sits beside the brand, near the end side, from
 * about 468 to 767 px; a box held to one fixed edge of it ran off the screen at one of the two. So the box is held to the
 * control's start edge (it opens toward the end side) when the control sits in the start half of the window, and to its
 * end edge (it opens toward the start side) when it sits in the end half, in either reading direction. The CSS places the
 * box by the side this gives (`data-side`). Measured when the box shows and again when the window changes size (a phone
 * turned); nothing is kept anywhere.
 */

/** Which edge of its control a box that opens from it is held to. */
export type OpenSide = "start" | "end";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** "start" when the middle of `control` lies in the start half of the window (the room is toward the end side), else "end". */
export function openSideOf(control: Element): OpenSide {
  const box = control.getBoundingClientRect();
  const width = document.documentElement.clientWidth || window.innerWidth;
  const middle = (box.left + box.right) / 2;
  const inStartHalf = isRightToLeft(control) ? middle >= width / 2 : middle <= width / 2;
  return inStartHalf ? "start" : "end";
}

/** The side for a box that opens from `control`, measured before the box is painted while `shown` (else the last one). */
export function useOpenSide(control: RefObject<HTMLElement | null>, shown: boolean): OpenSide {
  const [side, setSide] = useState<OpenSide>("end");
  useBrowserLayoutEffect(() => {
    if (!shown) return undefined;
    const place = (): void => {
      const element = control.current;
      if (element !== null) setSide(openSideOf(element));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [control, shown]);
  return side;
}
