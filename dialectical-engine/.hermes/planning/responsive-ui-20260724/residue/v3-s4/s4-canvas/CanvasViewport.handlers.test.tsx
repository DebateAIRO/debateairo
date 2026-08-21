import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CanvasViewport } from "../../components/CanvasViewport";

type ResizeCallback = ResizeObserverCallback;

class ResizeObserverHarness {
  static instances: ResizeObserverHarness[] = [];
  readonly callback: ResizeCallback;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    ResizeObserverHarness.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  resize(target: Element, width: number, height = 600) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width,
            height,
            x: 0,
            y: 0,
            top: 0,
            right: width,
            bottom: height,
            left: 0,
            toJSON: () => ({})
          }
        } as ResizeObserverEntry
      ],
      this as unknown as ResizeObserver
    );
  }
}

function eventWithProps(type: string, props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries(props)) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  return event;
}

function dispatchPointer(target: Element, type: string, pointerId: number, clientX: number, clientY: number) {
  const event = eventWithProps(type, {
    pointerId,
    pointerType: "touch",
    button: 0,
    isPrimary: pointerId === 1,
    clientX,
    clientY
  });
  fireEvent(target, event);
  return event;
}

function dispatchGesture(target: Element, type: string, scale: number, clientX = 120, clientY = 100) {
  const event = eventWithProps(type, { scale, clientX, clientY });
  fireEvent(target, event);
  return event;
}

function dispatchTouch(
  target: Element,
  type: string,
  touches: Array<{ identifier: number; clientX: number; clientY: number }>
) {
  const touchList = touches.map((touch) => ({ ...touch, target }));
  const event = eventWithProps(type, {
    touches: touchList,
    targetTouches: touchList,
    changedTouches: touchList
  });
  fireEvent(target, event);
  return event;
}

function renderViewport(children?: ReactNode) {
  const result = render(
    <CanvasViewport
      layoutWidth={1200}
      layoutHeight={800}
      stickyControl={
        <label className="canvasSetAside">
          <input type="checkbox" /> Show set-aside paths
        </label>
      }
    >
      {children ?? <div className="node" data-canvas-node-id="node-a">Node A</div>}
    </CanvasViewport>
  );
  const canvas = result.container.querySelector<HTMLElement>(".canvas");
  if (!canvas) throw new Error("missing canvas viewport");
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: 320 },
    clientHeight: { configurable: true, value: 600 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        width: 320,
        height: 600,
        top: 0,
        right: 320,
        bottom: 600,
        left: 0,
        toJSON: () => ({})
      })
    }
  });
  const observer = ResizeObserverHarness.instances.at(-1);
  if (!observer) throw new Error("missing ResizeObserver");
  act(() => observer.resize(canvas, 320));
  return { ...result, canvas, observer };
}

function zoomPercent() {
  return Number(screen.getByTestId("canvas-zoom-percent").textContent?.replace("%", ""));
}

beforeEach(() => {
  ResizeObserverHarness.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverHarness);
  vi.stubGlobal("PointerEvent", class PointerEventHarness extends Event {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S4 CanvasViewport DOM and registration contract", () => {
  test("keeps sticky chrome before and outside the transformed sizer", () => {
    const { canvas } = renderViewport();
    const sticky = canvas.querySelector(".canvasSetAside");
    const sizer = canvas.querySelector(".canvasSizer");
    const inner = canvas.querySelector(".canvasInner");

    expect(sticky).not.toBeNull();
    expect(sizer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(sticky?.nextElementSibling).toBe(sizer);
    expect(sticky?.contains(inner)).toBe(false);
    expect(sizer?.contains(inner)).toBe(true);
  });

  test("renders the complete accessible zoom cluster", () => {
    renderViewport();
    const group = screen.getByRole("group", { name: "Canvas zoom controls" });

    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveTextContent("+");
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveTextContent("−");
    expect(screen.getByRole("button", { name: "Fit whole tree (overview)" })).toHaveTextContent("Fit");
    expect(screen.getByRole("button", { name: "Reset zoom to 1:1" })).toHaveTextContent("1:1");
    expect(screen.getByTestId("canvas-zoom-percent")).toHaveAttribute("aria-live", "polite");
  });

  test("registers every zoom-critical stream natively as non-passive and cleans it up", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const { unmount } = renderViewport();
    const streams = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "gesturestart",
      "gesturechange",
      "gestureend",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "wheel"
    ];

    for (const stream of streams) {
      expect(
        add.mock.calls.some(
          ([type, , options]) =>
            type === stream && typeof options === "object" && options !== null && options.passive === false
        ),
        `${stream} registered non-passive`
      ).toBe(true);
    }

    unmount();
    for (const stream of streams) {
      expect(remove.mock.calls.some(([type]) => type === stream), `${stream} removed`).toBe(true);
    }
  });
});

describe("S4 CanvasViewport gesture and pointer-intent contract", () => {
  test("prevents cancelable wheel and WebKit gesture defaults while clamping their zoom", () => {
    const { canvas } = renderViewport();
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
      clientX: 100,
      clientY: 80
    });
    fireEvent(canvas, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomPercent()).toBeGreaterThan(87);

    const gestureStart = dispatchGesture(canvas, "gesturestart", 1);
    const gestureChange = dispatchGesture(canvas, "gesturechange", 20);
    expect(gestureStart.defaultPrevented).toBe(true);
    expect(gestureChange.defaultPrevented).toBe(true);
    expect(zoomPercent()).toBe(200);
  });

  test("uses tier-3 two-touch fallback and prevents a cancelable touchmove", () => {
    vi.stubGlobal("PointerEvent", undefined);
    const { canvas } = renderViewport();
    dispatchTouch(canvas, "touchstart", [
      { identifier: 1, clientX: 80, clientY: 100 },
      { identifier: 2, clientX: 180, clientY: 100 }
    ]);
    const move = dispatchTouch(canvas, "touchmove", [
      { identifier: 1, clientX: 50, clientY: 100 },
      { identifier: 2, clientX: 210, clientY: 100 }
    ]);

    expect(move.defaultPrevented).toBe(true);
    expect(zoomPercent()).toBeGreaterThan(87);
  });

  test("promotes pan to PE pinch and lets GestureEvent own the stream without double mutation", () => {
    const { canvas } = renderViewport();
    const initial = zoomPercent();

    dispatchPointer(canvas, "pointerdown", 1, 80, 100);
    dispatchPointer(canvas, "pointerdown", 2, 180, 100);
    dispatchPointer(canvas, "pointermove", 2, 230, 100);
    expect(zoomPercent()).toBeGreaterThan(initial);
    dispatchPointer(canvas, "pointerup", 1, 80, 100);
    dispatchPointer(canvas, "pointerup", 2, 230, 100);

    dispatchGesture(canvas, "gesturestart", 1);
    const gestureOwnedZoom = zoomPercent();
    dispatchPointer(canvas, "pointerdown", 3, 80, 100);
    dispatchPointer(canvas, "pointerdown", 4, 180, 100);
    dispatchPointer(canvas, "pointermove", 4, 260, 100);
    expect(zoomPercent()).toBe(gestureOwnedZoom);

    dispatchGesture(canvas, "gesturechange", 0.75);
    expect(zoomPercent()).not.toBe(gestureOwnedZoom);
    dispatchGesture(canvas, "gestureend", 0.75);
    dispatchPointer(canvas, "pointerup", 3, 80, 100);
    dispatchPointer(canvas, "pointerup", 4, 260, 100);

    const rearmedZoom = zoomPercent();
    dispatchPointer(canvas, "pointerdown", 5, 80, 100);
    dispatchPointer(canvas, "pointerdown", 6, 180, 100);
    dispatchPointer(canvas, "pointermove", 6, 240, 100);
    expect(zoomPercent()).toBeGreaterThan(rearmedZoom);
  });

  test("uses an 8px threshold, suppresses a post-pan click, and never pans from interactive controls", () => {
    const open = vi.fn();
    const action = vi.fn();
    const { canvas, getByText } = renderViewport(
      <div className="node" data-canvas-node-id="node-a" onClick={open}>
        Node A
        <button type="button" onClick={action}>
          Node action
        </button>
      </div>
    );
    const node = getByText("Node A").closest(".node");
    const button = getByText("Node action");
    if (!node) throw new Error("missing node");
    canvas.scrollLeft = 200;

    dispatchPointer(node, "pointerdown", 1, 100, 100);
    dispatchPointer(node, "pointermove", 1, 93, 100);
    dispatchPointer(node, "pointerup", 1, 93, 100);
    fireEvent.click(node);
    expect(open).toHaveBeenCalledTimes(1);

    dispatchPointer(node, "pointerdown", 2, 100, 100);
    dispatchPointer(node, "pointermove", 2, 80, 100);
    dispatchPointer(node, "pointerup", 2, 80, 100);
    fireEvent.click(node);
    expect(open).toHaveBeenCalledTimes(1);
    expect(canvas.scrollLeft).toBeGreaterThan(200);

    const beforeInteractive = canvas.scrollLeft;
    dispatchPointer(button, "pointerdown", 3, 100, 100);
    dispatchPointer(button, "pointermove", 3, 50, 100);
    dispatchPointer(button, "pointerup", 3, 50, 100);
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(canvas.scrollLeft).toBe(beforeInteractive);
  });

  test("turns an overview card tap into 1:1 before allowing its open click", () => {
    const zoomSeenByOpen = vi.fn();
    const { canvas, getByText } = renderViewport(
      <div
        className="node"
        data-canvas-node-id="node-a"
        onClick={() => zoomSeenByOpen(canvas.dataset.zoom)}
      >
        Node A
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Fit whole tree (overview)" }));
    expect(canvas.dataset.zoomBand).toBe("overview");
    const node = getByText("Node A");

    dispatchPointer(node, "pointerdown", 1, 100, 100);
    dispatchPointer(node, "pointerup", 1, 100, 100);
    fireEvent.click(node);

    expect(zoomPercent()).toBe(100);
    expect(zoomSeenByOpen).toHaveBeenCalledWith("1");
  });
});
