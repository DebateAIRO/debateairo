import { describe, expect, test } from "vitest";
import {
  READABLE_ZOOM,
  RESIZE_THRESHOLD,
  ZOOM_MAX,
  ZOOM_MIN,
  clampCanvasScroll,
  clampZoom,
  columnFitZoom,
  overviewFitZoom,
  resizeFitPolicy,
  resolveFitPolicy,
  scaledCanvasBounds,
  zoomAroundFocalPoint
} from "../../lib/canvasViewport";

describe("S4 canvas viewport zoom math", () => {
  test("publishes and enforces the global zoom bounds on every raw zoom", () => {
    expect(ZOOM_MIN).toBe(0.1);
    expect(ZOOM_MAX).toBe(2);
    expect(READABLE_ZOOM).toBe(0.5);
    expect(clampZoom(-1)).toBe(ZOOM_MIN);
    expect(clampZoom(0.75)).toBe(0.75);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
  });

  test("fits whole layouts into overview while allowing zoom below the readability floor", () => {
    expect(overviewFitZoom(320, 1616)).toBeCloseTo(0.198, 3);
    expect(overviewFitZoom(320, 2424)).toBeCloseTo(0.132, 3);
    expect(overviewFitZoom(320, 5000)).toBe(ZOOM_MIN);
    expect(overviewFitZoom(2000, 1200)).toBe(1);
  });

  test("fits one readable card column on narrow viewports", () => {
    expect(columnFitZoom(320)).toBeCloseTo(320 / (320 + 48), 5);
    expect(columnFitZoom(120)).toBe(READABLE_ZOOM);
    expect(columnFitZoom(900)).toBe(1);
  });

  test("resolves column-auto on mobile, 1:1 on desktop, and overview without changing modes", () => {
    expect(
      resolveFitPolicy("column-auto", {
        availableWidth: 320,
        layoutWidth: 1616,
        currentZoom: 1
      })
    ).toBeCloseTo(320 / 368, 5);
    expect(
      resolveFitPolicy("column-auto", {
        availableWidth: 1024,
        layoutWidth: 1616,
        currentZoom: 0.7
      })
    ).toBe(1);
    expect(
      resolveFitPolicy("overview-auto", {
        availableWidth: 320,
        layoutWidth: 1616,
        currentZoom: 1
      })
    ).toBeCloseTo(0.198, 3);
    expect(
      resolveFitPolicy("user-owned", {
        availableWidth: 320,
        layoutWidth: 1616,
        currentZoom: 1.35
      })
    ).toBe(1.35);
  });

  test("preserves fit mode through the 32px resize threshold", () => {
    expect(RESIZE_THRESHOLD).toBe(32);

    const underThreshold = resizeFitPolicy({
      policy: "overview-auto",
      zoom: 0.2,
      previousWidth: 320,
      availableWidth: 351,
      layoutWidth: 1616
    });
    expect(underThreshold).toEqual({ policy: "overview-auto", zoom: 0.2, width: 320 });

    const overviewResize = resizeFitPolicy({
      policy: "overview-auto",
      zoom: 0.2,
      previousWidth: 320,
      availableWidth: 352,
      layoutWidth: 1616
    });
    expect(overviewResize.policy).toBe("overview-auto");
    expect(overviewResize.zoom).toBeCloseTo(352 / 1616, 5);

    const userResize = resizeFitPolicy({
      policy: "user-owned",
      zoom: 1.4,
      previousWidth: 320,
      availableWidth: 420,
      layoutWidth: 1616
    });
    expect(userResize).toEqual({ policy: "user-owned", zoom: 1.4, width: 420 });
  });

  test("keeps the focal content coordinate stable and clamps scaled scroll bounds", () => {
    const nextScroll = zoomAroundFocalPoint({
      scrollLeft: 240,
      scrollTop: 160,
      focalX: 80,
      focalY: 60,
      fromZoom: 0.5,
      toZoom: 1
    });

    expect((240 + 80) / 0.5).toBeCloseTo((nextScroll.left + 80) / 1);
    expect((160 + 60) / 0.5).toBeCloseTo((nextScroll.top + 60) / 1);
    expect(scaledCanvasBounds(1200, 800, 0.5)).toEqual({ width: 600, height: 400 });
    expect(
      clampCanvasScroll(
        { left: 999, top: -20 },
        { viewportWidth: 320, viewportHeight: 240, contentWidth: 600, contentHeight: 400 }
      )
    ).toEqual({ left: 280, top: 0 });
  });
});
