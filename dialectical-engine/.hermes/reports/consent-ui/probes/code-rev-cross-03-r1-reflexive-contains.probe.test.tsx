// @vitest-environment jsdom

/**
 * CODE-REV-CROSS-03 r1 — the reviewer's OWN probe of the V-20 (b′) tiebreak.
 *
 * Built from the CLAIM ("open order, plus a tiebreak where a lower-registered entry wins only
 * when its container is a DESCENDANT of the incumbent's"), NOT from the author's suite.
 * Harness written from the repo's pre-existing `createRoot` + `act` idiom
 * (`tests/render/auth-flow-integration.test.tsx:1-40`), not from the file under review.
 *
 * The question: `Node.contains` is REFLEXIVE (`n.contains(n) === true`). "Descendant" is
 * strict. So do two surfaces that SHARE one container node get ranked by open order, or does
 * the earlier-registered one displace the later one?
 */

import { act, useEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSurfaceCount, useModalSurface } from "@lane/modalSemantics";

// React 19 prints "The current testing environment is not configured to support act(...)"
// without this; the flag changes no behaviour under test, only the warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(ui: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(ui);
  });
}

function press(key: string, shiftKey = false): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })
  );
}

function labelled(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name
  );
  expect(button, `no button labelled ${name}`).toBeDefined();
  return button as HTMLButtonElement;
}

/**
 * A surface that registers on the shared Esc stack with a container ref the CALLER owns, so
 * two of them can be pointed at the SAME node. Renders nothing of its own except a button,
 * which the caller places inside whichever container it likes.
 */
function Surface({
  containerRef,
  name,
  onClose
}: {
  containerRef: { current: HTMLElement | null };
  name: string;
  onClose: () => void;
}): ReactNode {
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(true, { containerRef, initialFocusRef, onClose });
  return <button ref={initialFocusRef as never}>{`close-${name}`}</button>;
}

/** Records effect order, so registration order is MEASURED and not assumed. */
function Recorder({ name, into }: { name: string; into: string[] }): ReactNode {
  useEffect(() => {
    into.push(name);
  }, [into, name]);
  return null;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root!.unmount();
  });
  host!.remove();
  root = null;
  host = null;
  expect(openSurfaceCount(), "the stack drained between probes").toBe(0);
});

describe("CODE-REV-CROSS-03 r1 — reflexive `contains` in the (b′) tiebreak", () => {
  it("P1 CONTROL — two UNRELATED containers rank by open order (the last registered wins)", async () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    function Two(): ReactNode {
      const aRef = useRef<HTMLElement | null>(null);
      const bRef = useRef<HTMLElement | null>(null);
      return (
        <>
          <div data-c="a" ref={aRef as never}>
            <Surface containerRef={aRef} name="a" onClose={firstClose} />
          </div>
          <div data-c="b" ref={bRef as never}>
            <Surface containerRef={bRef} name="b" onClose={secondClose} />
          </div>
        </>
      );
    }

    await render(<Two />);
    expect(openSurfaceCount()).toBe(2);
    await act(async () => {
      press("Escape");
    });

    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).toHaveBeenCalledTimes(0);
  });

  it("P2 CONTROL — a strictly NESTED pair hands Escape to the descendant", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    function Nested(): ReactNode {
      const outerRef = useRef<HTMLElement | null>(null);
      const innerRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="outer" ref={outerRef as never}>
          <Surface containerRef={outerRef} name="outer" onClose={outerClose} />
          <div data-c="inner" ref={innerRef as never}>
            <Surface containerRef={innerRef} name="inner" onClose={innerClose} />
          </div>
        </div>
      );
    }

    await render(<Nested />);
    expect(openSurfaceCount()).toBe(2);
    await act(async () => {
      press("Escape");
    });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).toHaveBeenCalledTimes(0);
  });

  it("P3 THE QUESTION — two surfaces SHARING one container node: which onClose runs?", async () => {
    const order: string[] = [];
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    function Shared(): ReactNode {
      const sharedRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="shared" ref={sharedRef as never}>
          <Recorder name="first" into={order} />
          <Surface containerRef={sharedRef} name="first" onClose={firstClose} />
          <Recorder name="second" into={order} />
          <Surface containerRef={sharedRef} name="second" onClose={secondClose} />
        </div>
      );
    }

    await render(<Shared />);
    expect(openSurfaceCount()).toBe(2);

    // The premise, MEASURED not assumed: `first` registers before `second`, so `second` is the
    // surface the visitor opened last, and both hold the very same container node.
    expect(order, "effect (registration) order").toEqual(["first", "second"]);

    await act(async () => {
      press("Escape");
    });

    // eslint-disable-next-line no-console
    console.log(
      `P3 RESULT firstClose=${firstClose.mock.calls.length} secondClose=${secondClose.mock.calls.length}`
    );

    // The rule under review, as V-20 (b′) words it: a lower entry wins only when its container
    // is a DESCENDANT of the incumbent's. The same node is not a descendant of itself, so open
    // order must decide and `second` must answer.
    expect(secondClose, "the LAST-opened surface answers Escape").toHaveBeenCalledTimes(1);
    expect(firstClose, "the earlier surface does not").toHaveBeenCalledTimes(0);
  });

  it("P4 THE QUESTION, three deep — three surfaces sharing ONE container node", async () => {
    const closed: string[] = [];
    const record = (name: string) => () => {
      closed.push(name);
    };

    function SharedThree(): ReactNode {
      const sharedRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="shared" ref={sharedRef as never}>
          <Surface containerRef={sharedRef} name="a" onClose={record("a")} />
          <Surface containerRef={sharedRef} name="b" onClose={record("b")} />
          <Surface containerRef={sharedRef} name="c" onClose={record("c")} />
        </div>
      );
    }

    await render(<SharedThree />);
    expect(openSurfaceCount()).toBe(3);

    await act(async () => {
      press("Escape");
    });

    // eslint-disable-next-line no-console
    console.log(`P4 RESULT closed=${JSON.stringify(closed)}`);

    expect(closed, "exactly one onClose runs, and it is the last-opened surface").toEqual(["c"]);
  });

  it("P5 THE SAME DEFECT ON Tab — the trap reads the same entry Escape does", async () => {
    function SharedTab(): ReactNode {
      const sharedRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="shared" ref={sharedRef as never}>
          <Surface containerRef={sharedRef} name="first" onClose={vi.fn()} />
          <Surface containerRef={sharedRef} name="second" onClose={vi.fn()} />
        </div>
      );
    }

    await render(<SharedTab />);
    expect(openSurfaceCount()).toBe(2);

    // Both surfaces share ONE container, so the Tab trap's candidate list is identical either
    // way: this case exists to show the Tab branch is NOT a second, independent ranking — it
    // reads whatever `topmostSurface()` returned, which P3 measures.
    await act(async () => {
      labelled("close-first").focus();
      press("Tab");
    });

    // Two candidates in one container: Tab from the first wraps to the second.
    expect(document.activeElement).toBe(labelled("close-second"));
  });

  it("P6 MIXED — a shared-container pair with a genuinely nested surface below it", async () => {
    const closed: string[] = [];
    const record = (name: string) => () => {
      closed.push(name);
    };

    function Mixed(): ReactNode {
      const outerRef = useRef<HTMLElement | null>(null);
      const innerRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="outer" ref={outerRef as never}>
          <div data-c="inner" ref={innerRef as never}>
            <Surface containerRef={innerRef} name="inner" onClose={record("inner")} />
          </div>
          <Surface containerRef={outerRef} name="outer-1" onClose={record("outer-1")} />
          <Surface containerRef={outerRef} name="outer-2" onClose={record("outer-2")} />
        </div>
      );
    }

    await render(<Mixed />);
    expect(openSurfaceCount()).toBe(3);

    await act(async () => {
      press("Escape");
    });

    // eslint-disable-next-line no-console
    console.log(`P6 RESULT closed=${JSON.stringify(closed)}`);

    // Registration order is [inner, outer-1, outer-2]; the incumbent is `outer-2`, and `inner`
    // IS a strict descendant of the shared outer container, so the tiebreak should reach it.
    expect(closed).toEqual(["inner"]);
  });
});
