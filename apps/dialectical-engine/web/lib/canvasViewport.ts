import { CARD_W } from "@/lib/debatePresentation";

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;
export const READABLE_ZOOM = 0.5;
export const RESIZE_THRESHOLD = 32;
export const DRAG_THRESHOLD = 8;
export const CARD_COLUMN_GUTTER = 48;

export type FitPolicyMode = "column-auto" | "overview-auto" | "user-owned";

export type FitPolicyState = {
  mode: FitPolicyMode;
  zoom: number;
  observedWidth: number;
};

export type Point = {
  clientX: number;
  clientY: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampZoom(value: number) {
  return clamp(finiteOr(value, 1), ZOOM_MIN, ZOOM_MAX);
}

export function overviewFitZoom(availableWidth: number, layoutWidth: number) {
  const available = Math.max(0, finiteOr(availableWidth, 0));
  const layout = Math.max(1, finiteOr(layoutWidth, 1));
  return clamp(available / layout, ZOOM_MIN, 1);
}

export function columnFitZoom(
  availableWidth: number,
  layoutWidth: number,
  viewportWidth: number
) {
  const available = Math.max(0, finiteOr(availableWidth, 0));
  const layout = Math.max(1, finiteOr(layoutWidth, 1));
  const viewport = Math.max(0, finiteOr(viewportWidth, available));

  if (viewport > 768 || available >= layout) return 1;
  return clamp(available / (CARD_W + CARD_COLUMN_GUTTER), READABLE_ZOOM, 1);
}

export function fitPolicyAfterResize(
  current: FitPolicyState,
  {
    availableWidth,
    layoutWidth,
    viewportWidth
  }: {
    availableWidth: number;
    layoutWidth: number;
    viewportWidth: number;
  }
): FitPolicyState {
  const width = Math.max(0, finiteOr(availableWidth, 0));
  if (
    current.observedWidth > 0 &&
    Math.abs(width - current.observedWidth) < RESIZE_THRESHOLD
  ) {
    return current;
  }

  if (current.mode === "overview-auto") {
    return {
      mode: current.mode,
      zoom: overviewFitZoom(width, layoutWidth),
      observedWidth: width
    };
  }

  if (current.mode === "column-auto") {
    return {
      mode: current.mode,
      zoom: columnFitZoom(width, layoutWidth, viewportWidth),
      observedWidth: width
    };
  }

  return {
    mode: current.mode,
    zoom: clampZoom(current.zoom),
    observedWidth: width
  };
}

export function zoomAtFocalPoint({
  currentZoom,
  nextZoom,
  scrollLeft,
  scrollTop,
  focalX,
  focalY
}: {
  currentZoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  focalX: number;
  focalY: number;
}) {
  const current = clampZoom(currentZoom);
  const next = clampZoom(nextZoom);
  const x = finiteOr(focalX, 0);
  const y = finiteOr(focalY, 0);
  const contentX = (Math.max(0, finiteOr(scrollLeft, 0)) + x) / current;
  const contentY = (Math.max(0, finiteOr(scrollTop, 0)) + y) / current;

  return {
    zoom: next,
    scrollLeft: Math.max(0, contentX * next - x),
    scrollTop: Math.max(0, contentY * next - y)
  };
}

export function pointDistance(a: Point, b: Point) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

export function pointCentroid(points: ArrayLike<Point>): CanvasPoint {
  if (points.length === 0) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    x += points[index].clientX;
    y += points[index].clientY;
  }
  return { x: x / points.length, y: y / points.length };
}
