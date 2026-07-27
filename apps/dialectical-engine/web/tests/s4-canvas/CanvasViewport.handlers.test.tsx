import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CanvasViewport } from "@/components/CanvasViewport";

type Contact = { clientX: number; clientY: number };

function eventWith<T extends object>(type: string, init: T) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(init)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event;
}

function pointerEvent(
  type: string,
  {
    pointerId,
    clientX,
    clientY,
    pointerType = "touch",
    button = 0
  }: {
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: string;
    button?: number;
  }
) {
  return eventWith(type, { pointerId, clientX, clientY, pointerType, button });
}

function touchEvent(type: string, touches: Contact[]) {
  return eventWith(type, { touches });
}

function Fixture({ onOpen = vi.fn() }: { onOpen?: () => void }) {
  const [checked, setChecked] = useState(true);

  return (
    <CanvasViewport
      layoutWidth={1600}
      layoutHeight={900}
      stickyControl={
        <label data-testid="sticky-toggle">
          <input
            aria-label="Show set-aside paths"
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.currentTarget.checked)}
          />
        </label>
      }
    >
      <div className="nodeWrap" data-node-id="node-a" style={{ position: "absolute", left: 40, top: 40 }}>
        <div className="node" onClick={onOpen}>
          Claim
          <button type="button">Interactive action</button>
        </div>
      </div>
    </CanvasViewport>
  );
}

describe("S4 native registration contract", () => {
  let clientWidth: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  });

  afterEach(() => {
    clientWidth.mockRestore();
  });

  test("registers every zoom-critical native stream non-passively and cleans it up", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const { unmount } = render(<Fixture />);

    for (const type of [
      "gesturestart",
      "gesturechange",
      "gestureend",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "wheel"
    ]) {
      expect(
        add.mock.calls.some(
          ([registeredType, , options]) =>
            registeredType === type &&
            typeof options === "object" &&
            options !== null &&
            "passive" in options &&
            options.passive === false
        ),
        `${type} should be registered with passive:false`
      ).toBe(true);
    }

    unmount();

    for (const type of ["gesturestart", "gesturechange", "gestureend", "touchmove", "wheel"]) {
      expect(
        remove.mock.calls.some(([registeredType]) => registeredType === type),
        `${type} should be removed`
      ).toBe(true);
    }
  });

  test("prevents default for cancelable GestureEvent and tier-3 TouchEvent moves", () => {
    render(<Fixture />);
    const canvas = document.querySelector<HTMLElement>(".canvas")!;

    const gestureStart = eventWith("gesturestart", { scale: 1 });
    const gestureChange = eventWith("gesturechange", { scale: 1.25 });
    canvas.dispatchEvent(gestureStart);
    canvas.dispatchEvent(gestureChange);

    expect(gestureStart.defaultPrevented).toBe(true);
    expect(gestureChange.defaultPrevented).toBe(true);

    canvas.dispatchEvent(touchEvent("touchend", []));
    canvas.dispatchEvent(
      touchEvent("touchstart", [
        { clientX: 10, clientY: 20 },
        { clientX: 110, clientY: 20 }
      ])
    );
    const touchMove = touchEvent("touchmove", [
      { clientX: 0, clientY: 20 },
      { clientX: 140, clientY: 20 }
    ]);
    canvas.dispatchEvent(touchMove);

    expect(touchMove.defaultPrevented).toBe(true);
  });
});

describe("S4 gesture ownership and pointer intent", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  });

  test("promotes pan to PE pinch and hands the remaining pointer back to pan", () => {
    const onOpen = vi.fn();
    render(<Fixture onOpen={onOpen} />);
    const canvas = document.querySelector<HTMLElement>(".canvas")!;
    const node = document.querySelector<HTMLElement>(".node")!;

    canvas.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.dataset.gestureOwner).toBe("pointer-pan");

    canvas.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 }));
    expect(canvas.dataset.gestureOwner).toBe("pointer-pinch");

    canvas.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 260, clientY: 100 }));
    expect(Number(canvas.dataset.zoom)).toBeGreaterThan(1);

    canvas.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, clientX: 260, clientY: 100 }));
    expect(canvas.dataset.gestureOwner).toBe("pointer-pan");

    canvas.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 100, clientY: 100 }));
    expect(canvas.dataset.gestureOwner).toBe("none");

    fireEvent.click(node);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("lets WebKit GestureEvent take ownership exactly once without touch double-mutation", () => {
    render(<Fixture />);
    const canvas = document.querySelector<HTMLElement>(".canvas")!;

    canvas.dispatchEvent(
      touchEvent("touchstart", [
        { clientX: 20, clientY: 40 },
        { clientX: 120, clientY: 40 }
      ])
    );
    canvas.dispatchEvent(eventWith("gesturestart", { scale: 1 }));
    canvas.dispatchEvent(eventWith("gesturechange", { scale: 1.2 }));
    expect(canvas.dataset.gestureOwner).toBe("webkit-gesture");
    expect(Number(canvas.dataset.zoom)).toBeCloseTo(1.2, 2);

    canvas.dispatchEvent(eventWith("gesturestart", { scale: 1 }));
    const touchMove = touchEvent("touchmove", [
      { clientX: 10, clientY: 40 },
      { clientX: 150, clientY: 40 }
    ]);
    canvas.dispatchEvent(touchMove);
    canvas.dispatchEvent(eventWith("gesturechange", { scale: 1.3 }));

    expect(touchMove.defaultPrevented).toBe(true);
    expect(Number(canvas.dataset.zoom)).toBeCloseTo(1.3, 2);

    canvas.dispatchEvent(eventWith("gestureend", { scale: 1.3 }));
    expect(canvas.dataset.gestureOwner).toBe("none");
  });

  test("supports tier-3 two-touch centroid zoom when PE and GestureEvent do not own the stream", () => {
    render(<Fixture />);
    const canvas = document.querySelector<HTMLElement>(".canvas")!;

    canvas.dispatchEvent(
      touchEvent("touchstart", [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 }
      ])
    );
    expect(canvas.dataset.gestureOwner).toBe("touch-pinch");

    canvas.dispatchEvent(
      touchEvent("touchmove", [
        { clientX: 50, clientY: 100 },
        { clientX: 250, clientY: 100 }
      ])
    );
    expect(Number(canvas.dataset.zoom)).toBe(2);
  });

  test("uses an 8px threshold, suppresses the post-pan click, and never pans from interactive hits", () => {
    const onOpen = vi.fn();
    render(<Fixture onOpen={onOpen} />);
    const canvas = document.querySelector<HTMLElement>(".canvas")!;
    const node = document.querySelector<HTMLElement>(".node")!;
    const button = screen.getByRole("button", { name: "Interactive action" });

    canvas.scrollLeft = 100;
    node.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    node.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 1,
        clientX: 107,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    node.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 1,
        clientX: 107,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    fireEvent.click(node);
    expect(onOpen).toHaveBeenCalledTimes(1);

    node.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 2,
        clientX: 100,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    node.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 2,
        clientX: 80,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    node.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 2,
        clientX: 80,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    fireEvent.click(node);
    expect(onOpen).toHaveBeenCalledTimes(1);

    const beforeInteractiveDrag = canvas.scrollLeft;
    button.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 3,
        clientX: 100,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    button.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 3,
        clientX: 40,
        clientY: 100,
        pointerType: "mouse"
      })
    );
    expect(canvas.dataset.gestureOwner).toBe("none");
    expect(canvas.scrollLeft).toBe(beforeInteractiveDrag);
  });
});

describe("S4 viewport DOM and control contract", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  });

  test("keeps the sticky toggle before and outside the scaled sizer", () => {
    render(<Fixture />);

    const sticky = screen.getByTestId("sticky-toggle");
    const sizer = document.querySelector<HTMLElement>(".canvasSizer")!;
    const inner = document.querySelector<HTMLElement>(".canvasInner")!;

    expect(sticky.nextElementSibling).toBe(sizer);
    expect(sizer.contains(sticky)).toBe(false);
    expect(inner.contains(sticky)).toBe(false);
    expect(inner.style.transformOrigin).toBe("0px 0px");
  });

  test("offers the named 44px control cluster, live percentage, scaled sizer, and overview band", () => {
    render(<Fixture />);

    const group = screen.getByRole("group", { name: "Canvas zoom controls" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit whole tree (overview)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset zoom to 1:1" })).toBeInTheDocument();
    expect(group.querySelector('[aria-live="polite"]')).toHaveTextContent("100%");

    fireEvent.click(screen.getByRole("button", { name: "Fit whole tree (overview)" }));

    const sizer = document.querySelector<HTMLElement>(".canvasSizer")!;
    const inner = document.querySelector<HTMLElement>(".canvasInner")!;
    expect(sizer.style.width).toBe("640px");
    expect(sizer.style.height).toBe("360px");
    expect(inner.style.transform).toBe("scale(0.4)");
    expect(inner.dataset.zoomBand).toBe("overview");
    expect(group.querySelector('[aria-live="polite"]')).toHaveTextContent("40%");
  });
});
