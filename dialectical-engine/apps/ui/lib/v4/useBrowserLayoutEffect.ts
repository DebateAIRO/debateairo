import { useEffect, useLayoutEffect } from "react";

/**
 * useLayoutEffect in the browser, useEffect on the server (which has no layout and warns about useLayoutEffect): for the
 * V4 pages' work that must be done before the browser paints (focus handed on, a line looked up, a size read).
 */
export const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
