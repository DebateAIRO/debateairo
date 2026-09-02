"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  DRAG_THRESHOLD,
  READABLE_ZOOM,
  clampZoom,
  fitPolicyAfterResize,
  overviewFitZoom,
  pointCentroid,
  pointDistance,
  zoomAtFocalPoint,
  type CanvasPoint,
  type FitPolicyState,
  type Point
} from "@/lib/canvasViewport";

const PASSIVE_FALSE = { passive: false } as const;
const ZOOM_STEP = 0.1;

type GestureOwner =
  | "none"
  | "pointer-pan"
  | "pointer-pinch"
  | "webkit-gesture"
  | "touch-pinch";

type PointerSample = Point & {
  pointerId: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type PinchState = {
  distance: number;
  zoom: number;
};

type WebKitGestureEvent = Event & {
  scale?: number;
};

export type CanvasViewportProps = {
  layoutWidth: number;
  layoutHeight: number;
  initialAnchorTop?: number | null;
  stickyControl: ReactNode;
  children: ReactNode;
  canvasRef?: (element: HTMLDivElement | null) => void;
};

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, label, summary, [role="button"], [contenteditable="true"]'
      )
    )
  );
}

function eventPoint(event: PointerEvent): PointerSample {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY
  };
}

export function CanvasViewport({
  layoutWidth,
  layoutHeight,
  initialAnchorTop,
  stickyControl,
  children,
  canvasRef
}: CanvasViewportProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const fitStateRef = useRef<FitPolicyState>({
    mode: "column-auto",
    zoom: 1,
    observedWidth: 0
  });
  const [fitState, setFitState] = useState(fitStateRef.current);
  const gestureOwnerRef = useRef<GestureOwner>("none");
  const pointersRef = useRef(new Map<number, PointerSample>());
  const panRef = useRef<PanState | null>(null);
  const pointerPinchRef = useRef<PinchState | null>(null);
  const touchPinchRef = useRef<PinchState | null>(null);
  const webKitStartZoomRef = useRef(1);
  const lastTouchCentroidRef = useRef<CanvasPoint | null>(null);
  const didPanRef = useRef(false);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const previousLayoutWidthRef = useRef(layoutWidth);
  const didInitialAnchorRef = useRef(false);

  const setSurface = useCallback(
    (element: HTMLDivElement | null) => {
      surfaceRef.current = element;
      canvasRef?.(element);
    },
    [canvasRef]
  );

  const syncSurfaceState = useCallback((state: FitPolicyState) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.dataset.zoom = state.zoom.toFixed(4);
    surface.dataset.fitPolicy = state.mode;
  }, []);

  const commitFitState = useCallback(
    (next: FitPolicyState) => {
      fitStateRef.current = next;
      syncSurfaceState(next);
      setFitState(next);
    },
    [syncSurfaceState]
  );

  const setGestureOwner = useCallback((owner: GestureOwner) => {
    gestureOwnerRef.current = owner;
    if (surfaceRef.current) surfaceRef.current.dataset.gestureOwner = owner;
  }, []);

  const queueScroll = useCallback((left: number, top: number) => {
    const next = {
      left: Math.max(0, left),
      top: Math.max(0, top)
    };
    pendingScrollRef.current = next;
    const surface = surfaceRef.current;
    if (surface) {
      surface.scrollLeft = next.left;
      surface.scrollTop = next.top;
    }
  }, []);

  const localPoint = useCallback((point: CanvasPoint) => {
    const surface = surfaceRef.current;
    if (!surface) return point;
    const bounds = surface.getBoundingClientRect();
    return {
      x: point.x - bounds.left,
      y: point.y - bounds.top
    };
  }, []);

  const viewportCenter = useCallback(() => {
    const surface = surfaceRef.current;
    return {
      x: (surface?.clientWidth ?? 0) / 2,
      y: (surface?.clientHeight ?? 0) / 2
    };
  }, []);

  const applyUserZoom = useCallback(
    (requestedZoom: number, focal = viewportCenter()) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const nextGeometry = zoomAtFocalPoint({
        currentZoom: fitStateRef.current.zoom,
        nextZoom: requestedZoom,
        scrollLeft: surface.scrollLeft,
        scrollTop: surface.scrollTop,
        focalX: focal.x,
        focalY: focal.y
      });
      const nextState = {
        ...fitStateRef.current,
        mode: "user-owned" as const,
        zoom: nextGeometry.zoom
      };
      queueScroll(nextGeometry.scrollLeft, nextGeometry.scrollTop);
      commitFitState(nextState);
    },
    [commitFitState, queueScroll, viewportCenter]
  );

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    const surface = surfaceRef.current;
    if (!pending || !surface) return;
    surface.scrollLeft = pending.left;
    surface.scrollTop = pending.top;
    pendingScrollRef.current = null;
  }, [fitState.zoom]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null || initialAnchorTop == null || didInitialAnchorRef.current) return;
    surface.scrollTo({ left: 0, top: Math.max(0, initialAnchorTop * fitStateRef.current.zoom - 120) });
    didInitialAnchorRef.current = true;
  }, [initialAnchorTop]);

  useLayoutEffect(() => {
    const entranceHost = surfaceRef.current?.closest<HTMLElement>(".fadeup");
    if (!entranceHost) return;

    let fallbackId: number | undefined;
    const clearEntranceClass = () => {
      entranceHost.classList.remove("fadeup");
      if (fallbackId !== undefined) window.clearTimeout(fallbackId);
    };
    const handleEntranceEnd = (event: AnimationEvent) => {
      if (event.target === entranceHost && event.animationName === "de-fadeup") {
        clearEntranceClass();
      }
    };

    entranceHost.addEventListener("animationend", handleEntranceEnd);
    entranceHost.addEventListener("animationcancel", handleEntranceEnd);

    const animations =
      typeof entranceHost.getAnimations === "function"
        ? entranceHost.getAnimations({ subtree: false })
        : [];
    const hasEntranceAnimation = getComputedStyle(entranceHost)
      .animationName.split(",")
      .some((name) => name.trim() === "de-fadeup");
    if (
      !hasEntranceAnimation ||
      (animations.length > 0 &&
        animations.every((animation) => animation.playState === "finished"))
    ) {
      clearEntranceClass();
    } else {
      fallbackId = window.setTimeout(clearEntranceClass, 600);
    }

    return () => {
      entranceHost.removeEventListener("animationend", handleEntranceEnd);
      entranceHost.removeEventListener("animationcancel", handleEntranceEnd);
      if (fallbackId !== undefined) window.clearTimeout(fallbackId);
    };
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const measure = () => {
      const availableWidth = surface.clientWidth;
      const layoutChanged = previousLayoutWidthRef.current !== layoutWidth;
      const current = layoutChanged
        ? { ...fitStateRef.current, observedWidth: 0 }
        : fitStateRef.current;
      previousLayoutWidthRef.current = layoutWidth;
      const next = fitPolicyAfterResize(current, {
        availableWidth,
        layoutWidth,
        viewportWidth: window.innerWidth
      });
      if (
        next !== fitStateRef.current &&
        (next.mode !== fitStateRef.current.mode ||
          next.zoom !== fitStateRef.current.zoom ||
          next.observedWidth !== fitStateRef.current.observedWidth)
      ) {
        commitFitState(next);
      } else {
        syncSurfaceState(fitStateRef.current);
      }
      surface.dataset.viewportReady = "true";
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(surface);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [commitFitState, layoutWidth, syncSurfaceState]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const beginPan = (pointer: PointerSample, preserveClickSuppression = false) => {
      panRef.current = {
        pointerId: pointer.pointerId,
        startX: pointer.clientX,
        startY: pointer.clientY,
        startScrollLeft: surface.scrollLeft,
        startScrollTop: surface.scrollTop
      };
      if (!preserveClickSuppression) didPanRef.current = false;
      setGestureOwner("pointer-pan");
    };

    const beginPointerPinch = () => {
      const points = Array.from(pointersRef.current.values());
      if (points.length < 2) return;
      pointerPinchRef.current = {
        distance: Math.max(1, pointDistance(points[0], points[1])),
        zoom: fitStateRef.current.zoom
      };
      panRef.current = null;
      didPanRef.current = true;
      setGestureOwner("pointer-pinch");
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (gestureOwnerRef.current === "webkit-gesture") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;

      const pointer = eventPoint(event);
      pointersRef.current.set(event.pointerId, pointer);
      const target = event.target as Element & {
        setPointerCapture?: (pointerId: number) => void;
      };
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can be unavailable in synthetic or detached targets.
      }

      if (pointersRef.current.size >= 2) beginPointerPinch();
      else beginPan(pointer);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, eventPoint(event));

      if (
        gestureOwnerRef.current === "pointer-pinch" &&
        pointerPinchRef.current &&
        pointersRef.current.size >= 2
      ) {
        if (event.cancelable) event.preventDefault();
        const points = Array.from(pointersRef.current.values());
        const distance = Math.max(1, pointDistance(points[0], points[1]));
        const centroid = localPoint(pointCentroid(points));
        applyUserZoom(
          pointerPinchRef.current.zoom * (distance / pointerPinchRef.current.distance),
          centroid
        );
        return;
      }

      const pan = panRef.current;
      if (gestureOwnerRef.current !== "pointer-pan" || !pan || pan.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - pan.startX;
      const deltaY = event.clientY - pan.startY;
      if (!didPanRef.current && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

      didPanRef.current = true;
      if (event.cancelable) event.preventDefault();
      surface.scrollLeft = Math.max(0, pan.startScrollLeft - deltaX);
      surface.scrollTop = Math.max(0, pan.startScrollTop - deltaY);
    };

    const finishPointer = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.delete(event.pointerId);

      if (gestureOwnerRef.current === "pointer-pinch") {
        pointerPinchRef.current = null;
        const remaining = Array.from(pointersRef.current.values());
        if (remaining.length === 1) beginPan(remaining[0], true);
        else {
          panRef.current = null;
          setGestureOwner("none");
        }
        return;
      }

      if (
        gestureOwnerRef.current === "pointer-pan" &&
        panRef.current?.pointerId === event.pointerId
      ) {
        panRef.current = null;
        setGestureOwner("none");
      }
    };

    const handleGestureStart = (rawEvent: Event) => {
      if (rawEvent.cancelable) rawEvent.preventDefault();
      if (gestureOwnerRef.current === "webkit-gesture") return;
      webKitStartZoomRef.current = fitStateRef.current.zoom;
      pointerPinchRef.current = null;
      panRef.current = null;
      pointersRef.current.clear();
      setGestureOwner("webkit-gesture");
    };

    const handleGestureChange = (rawEvent: Event) => {
      if (gestureOwnerRef.current !== "webkit-gesture") return;
      if (rawEvent.cancelable) rawEvent.preventDefault();
      const event = rawEvent as WebKitGestureEvent;
      const scale = Number.isFinite(event.scale) ? Number(event.scale) : 1;
      const clientFocal = lastTouchCentroidRef.current;
      applyUserZoom(
        webKitStartZoomRef.current * scale,
        clientFocal ? localPoint(clientFocal) : viewportCenter()
      );
    };

    const handleGestureEnd = (rawEvent: Event) => {
      if (gestureOwnerRef.current !== "webkit-gesture") return;
      if (rawEvent.cancelable) rawEvent.preventDefault();
      touchPinchRef.current = null;
      lastTouchCentroidRef.current = null;
      setGestureOwner("none");
    };

    const handleTouchStart = (rawEvent: Event) => {
      const event = rawEvent as TouchEvent;
      if (event.touches.length < 2) return;
      lastTouchCentroidRef.current = pointCentroid(event.touches);

      if (
        gestureOwnerRef.current === "webkit-gesture" ||
        gestureOwnerRef.current === "pointer-pinch"
      ) {
        return;
      }

      touchPinchRef.current = {
        distance: Math.max(1, pointDistance(event.touches[0], event.touches[1])),
        zoom: fitStateRef.current.zoom
      };
      setGestureOwner("touch-pinch");
    };

    const handleTouchMove = (rawEvent: Event) => {
      const event = rawEvent as TouchEvent;
      if (event.touches.length < 2) return;
      const centroid = pointCentroid(event.touches);
      lastTouchCentroidRef.current = centroid;

      if (
        gestureOwnerRef.current === "webkit-gesture" ||
        gestureOwnerRef.current === "pointer-pinch"
      ) {
        if (event.cancelable) event.preventDefault();
        return;
      }

      if (gestureOwnerRef.current !== "touch-pinch" || !touchPinchRef.current) return;
      if (event.cancelable) event.preventDefault();
      const distance = Math.max(1, pointDistance(event.touches[0], event.touches[1]));
      applyUserZoom(
        touchPinchRef.current.zoom * (distance / touchPinchRef.current.distance),
        localPoint(centroid)
      );
    };

    const handleTouchEnd = (rawEvent: Event) => {
      const event = rawEvent as TouchEvent;
      if (event.touches.length >= 2) {
        lastTouchCentroidRef.current = pointCentroid(event.touches);
        return;
      }
      lastTouchCentroidRef.current = null;
      if (gestureOwnerRef.current === "touch-pinch") {
        touchPinchRef.current = null;
        setGestureOwner("none");
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.cancelable) event.preventDefault();
      const focal = localPoint({ x: event.clientX, y: event.clientY });
      applyUserZoom(fitStateRef.current.zoom * Math.exp(-event.deltaY * 0.002), focal);
    };

    const handleClick = (event: MouseEvent) => {
      if (didPanRef.current) {
        didPanRef.current = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (fitStateRef.current.zoom >= READABLE_ZOOM || !(event.target instanceof Element)) {
        return;
      }
      const card = event.target.closest<HTMLElement>(".nodeWrap");
      if (!card) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const surfaceBounds = surface.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const localCenter = {
        x: cardBounds.left + cardBounds.width / 2 - surfaceBounds.left,
        y: cardBounds.top + cardBounds.height / 2 - surfaceBounds.top
      };
      const currentZoom = fitStateRef.current.zoom;
      const contentCenterX = (surface.scrollLeft + localCenter.x) / currentZoom;
      const contentCenterY = (surface.scrollTop + localCenter.y) / currentZoom;
      applyUserZoom(1, localCenter);
      queueScroll(
        contentCenterX - surface.clientWidth / 2,
        contentCenterY - surface.clientHeight / 2
      );
    };

    surface.addEventListener("pointerdown", handlePointerDown, PASSIVE_FALSE);
    surface.addEventListener("pointermove", handlePointerMove, PASSIVE_FALSE);
    surface.addEventListener("pointerup", finishPointer, PASSIVE_FALSE);
    surface.addEventListener("pointercancel", finishPointer, PASSIVE_FALSE);
    surface.addEventListener("gesturestart", handleGestureStart, PASSIVE_FALSE);
    surface.addEventListener("gesturechange", handleGestureChange, PASSIVE_FALSE);
    surface.addEventListener("gestureend", handleGestureEnd, PASSIVE_FALSE);
    surface.addEventListener("touchstart", handleTouchStart, PASSIVE_FALSE);
    surface.addEventListener("touchmove", handleTouchMove, PASSIVE_FALSE);
    surface.addEventListener("touchend", handleTouchEnd, PASSIVE_FALSE);
    surface.addEventListener("touchcancel", handleTouchEnd, PASSIVE_FALSE);
    surface.addEventListener("wheel", handleWheel, PASSIVE_FALSE);
    surface.addEventListener("click", handleClick, true);

    return () => {
      surface.removeEventListener("pointerdown", handlePointerDown);
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerup", finishPointer);
      surface.removeEventListener("pointercancel", finishPointer);
      surface.removeEventListener("gesturestart", handleGestureStart);
      surface.removeEventListener("gesturechange", handleGestureChange);
      surface.removeEventListener("gestureend", handleGestureEnd);
      surface.removeEventListener("touchstart", handleTouchStart);
      surface.removeEventListener("touchmove", handleTouchMove);
      surface.removeEventListener("touchend", handleTouchEnd);
      surface.removeEventListener("touchcancel", handleTouchEnd);
      surface.removeEventListener("wheel", handleWheel);
      surface.removeEventListener("click", handleClick, true);
      pointersRef.current.clear();
      setGestureOwner("none");
    };
  }, [
    applyUserZoom,
    localPoint,
    queueScroll,
    setGestureOwner,
    viewportCenter
  ]);

  const zoom = fitState.zoom;
  const zoomBand = zoom < READABLE_ZOOM ? "overview" : "normal";

  const setOverviewFit = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    commitFitState({
      mode: "overview-auto",
      zoom: overviewFitZoom(surface.clientWidth, layoutWidth),
      observedWidth: surface.clientWidth
    });
    queueScroll(0, 0);
  };

  return (
    <div className="canvasViewport">
      <div
        className="canvas scroll"
        ref={setSurface}
        data-fit-policy={fitState.mode}
        data-gesture-owner="none"
        data-zoom={zoom.toFixed(4)}
      >
        {stickyControl}
        <div
          className="canvasSizer"
          style={{
            width: layoutWidth * zoom,
            height: layoutHeight * zoom
          }}
        >
          <div
            className="canvasInner"
            data-zoom-band={zoomBand}
            style={{
              width: layoutWidth,
              height: layoutHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "0px 0px"
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <div
        className="canvasZoomCluster"
        role="group"
        aria-label="Canvas zoom controls"
      >
        <button
          type="button"
          className="canvasZoomButton"
          aria-label="Zoom in"
          onClick={() => applyUserZoom(clampZoom(zoom + ZOOM_STEP))}
        >
          +
        </button>
        <button
          type="button"
          className="canvasZoomButton"
          aria-label="Zoom out"
          onClick={() => applyUserZoom(clampZoom(zoom - ZOOM_STEP))}
        >
          −
        </button>
        <button
          type="button"
          className="canvasZoomButton canvasZoomFit"
          aria-label="Fit whole tree (overview)"
          aria-pressed={fitState.mode === "overview-auto"}
          onClick={setOverviewFit}
        >
          Fit
        </button>
        <button
          type="button"
          className="canvasZoomButton canvasZoomOne"
          aria-label="Reset zoom to 1:1"
          onClick={() => applyUserZoom(1)}
        >
          1:1
        </button>
        <output className="canvasZoomPercent" aria-live="polite" aria-atomic="true">
          {Math.round(zoom * 100)}%
        </output>
      </div>
    </div>
  );
}
