import { describe, expect, test } from "vitest";
import {
  CARD_COLUMN_GUTTER,
  DRAG_THRESHOLD,
  READABLE_ZOOM,
  RESIZE_THRESHOLD,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  columnFitZoom,
  fitPolicyAfterResize,
  overviewFitZoom,
  pointCentroid,
  pointDistance,
  zoomAtFocalPoint,
  type FitPolicyState
} from "@/lib/canvasViewport";

describe("S4 canvas zoom bounds and fit math", () => {
  test("pins global, readable, resize, drag, and column constants", () => {
    expect(ZOOM_MIN).toBe(0.1);
    expect(ZOOM_MAX).toBe(2);
    expect(READABLE_ZOOM).toBe(0.5);
    expect(RESIZE_THRESHOLD).toBe(32);
    expect(DRAG_THRESHOLD).toBe(8);
    expect(CARD_COLUMN_GUTTER).toBe(48);
  });

  test("clamps every numeric zoom path to the global bounds", () => {
    expect(clampZoom(-4)).toBe(ZOOM_MIN);
    expect(clampZoom(0.74)).toBe(0.74);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  test("fits the whole tree below the readability floor when overview requires it", () => {
    expect(overviewFitZoom(320, 1616)).toBeCloseTo(0.19802, 5);
    expect(overviewFitZoom(320, 2424)).toBeCloseTo(0.13201, 5);
    expect(overviewFitZoom(320, 8000)).toBe(ZOOM_MIN);
    expect(overviewFitZoom(1200, 600)).toBe(1);
  });

  test("uses readable single-column fit only for overflowing mobile canvases", () => {
    expect(columnFitZoom(320, 1616, 320)).toBeCloseTo(320 / (320 + 48), 5);
    expect(columnFitZoom(180, 1616, 180)).toBe(READABLE_ZOOM);
    expect(columnFitZoom(375, 1616, 375)).toBe(1);
    expect(columnFitZoom(720, 600, 720)).toBe(1);
    expect(columnFitZoom(1440, 2424, 1440)).toBe(1);
  });
});

describe("S4 fit-policy ownership on resize", () => {
  const overview: FitPolicyState = {
    mode: "overview-auto",
    zoom: 0.2,
    observedWidth: 320
  };

  test("ignores width jitter below the 32px threshold", () => {
    expect(
      fitPolicyAfterResize(overview, {
        availableWidth: 351,
        viewportWidth: 351,
        layoutWidth: 1616
      })
    ).toEqual(overview);
  });

  test("preserves explicit overview mode across a material resize", () => {
    expect(
      fitPolicyAfterResize(overview, {
        availableWidth: 375,
        viewportWidth: 375,
        layoutWidth: 1616
      })
    ).toEqual({
      mode: "overview-auto",
      zoom: overviewFitZoom(375, 1616),
      observedWidth: 375
    });
  });

  test("preserves column-auto mode and recomputes its readable zoom", () => {
    const resized = fitPolicyAfterResize(
      { mode: "column-auto", zoom: 320 / 368, observedWidth: 320 },
      { availableWidth: 375, viewportWidth: 375, layoutWidth: 1616 }
    );

    expect(resized.mode).toBe("column-auto");
    expect(resized.zoom).toBe(1);
    expect(resized.observedWidth).toBe(375);
  });

  test("never converts user-owned zoom into an automatic fit", () => {
    expect(
      fitPolicyAfterResize(
        { mode: "user-owned", zoom: 0.73, observedWidth: 320 },
        { availableWidth: 420, viewportWidth: 420, layoutWidth: 2424 }
      )
    ).toEqual({ mode: "user-owned", zoom: 0.73, observedWidth: 420 });
  });
});

describe("S4 focal and multi-contact geometry", () => {
  test("keeps the same content point under the focal coordinate", () => {
    expect(
      zoomAtFocalPoint({
        currentZoom: 1,
        nextZoom: 2,
        scrollLeft: 100,
        scrollTop: 60,
        focalX: 50,
        focalY: 40
      })
    ).toEqual({
      zoom: 2,
      scrollLeft: 250,
      scrollTop: 160
    });
  });

  test("computes TouchEvent-compatible centroid and distance from array-like contacts", () => {
    const touches = {
      0: { clientX: 20, clientY: 30 },
      1: { clientX: 100, clientY: 90 },
      length: 2
    };

    expect(pointCentroid(touches)).toEqual({ x: 60, y: 60 });
    expect(pointDistance(touches[0], touches[1])).toBe(100);
  });
});
