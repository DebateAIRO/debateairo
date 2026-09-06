// @vitest-environment jsdom

import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backdropCloseHandler,
  openSurfaceCount,
  prefersReducedMotion,
  useModalSurface
} from "../../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

type TestSurfaceProps = {
  open: boolean;
  name: string;
  onClose: () => void;
  /** Extra buttons rendered after the close button, in this order. */
  buttons?: readonly string[];
  /** Label of the control the caller names as initial focus; defaults to the close button. */
  initialFocus?: string;
  /** Label of a button rendered with `disabled`, so the focusable set can change while open. */
  disabledButton?: string;
  children?: ReactNode;
};

function TestSurface({
  open,
  name,
  onClose,
  buttons = [],
  initialFocus,
  disabledButton,
  children
}: TestSurfaceProps): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(open, { containerRef, initialFocusRef, onClose });
  if (!open) return null;
  const closeLabel = `close-${name}`;
  const named = initialFocus ?? closeLabel;
  const claim = (label: string) => (node: HTMLElement | null) => {
    if (label === named) initialFocusRef.current = node;
  };
  return (
    <div
      data-surface={name}
      ref={(node) => {
        containerRef.current = node;
      }}
    >
      <button type="button" data-role="close" ref={claim(closeLabel)}>
        {closeLabel}
      </button>
      {buttons.map((label) => (
        <button
          key={label}
          type="button"
          disabled={label === disabledButton}
          ref={claim(label)}
        >
          {label}
        </button>
      ))}
      {children}
    </div>
  );
}

function labelled(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button, `missing rendered button ${label}`).toBeDefined();
  return button as HTMLButtonElement;
}

async function render(element: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(element);
  });
  await settle();
}

function pressEscape(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
}

function pressTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
  return event;
}

describe("consent modal semantics helper", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers one Escape to the topmost open surface only", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    await render(
      <>
        <TestSurface open name="outer" onClose={outerClose} />
        <TestSurface open name="inner" onClose={innerClose} />
      </>
    );

    await act(async () => {
      pressEscape();
    });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).toHaveBeenCalledTimes(0);
  });

  it("moves initial focus to the element the caller names, not the first one", async () => {
    await render(
      <TestSurface
        open
        name="only"
        onClose={vi.fn()}
        buttons={["second", "third"]}
        initialFocus="third"
      />
    );

    expect(document.activeElement).toBe(labelled("third"));
  });

  it("returns focus to the element that was focused when the surface opened", async () => {
    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <input id="opener" name="opener" />
          <TestSurface open={open} name="only" onClose={vi.fn()} />
        </>
      );
    }

    await render(<Harness open={false} />);
    const opener = document.querySelector<HTMLInputElement>("#opener")!;
    await act(async () => {
      opener.focus();
    });
    expect(document.activeElement).toBe(opener);

    await render(<Harness open />);
    expect(document.activeElement).toBe(labelled("close-only"));

    await render(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("wraps Tab from the last focusable back to the first", async () => {
    await render(
      <TestSurface open name="only" onClose={vi.fn()} buttons={["second", "third"]} />
    );

    let event: KeyboardEvent | null = null;
    await act(async () => {
      labelled("third").focus();
      event = pressTab();
    });

    expect(document.activeElement).toBe(labelled("close-only"));
    expect(event!.defaultPrevented).toBe(true);
  });

  it("wraps Shift+Tab from the first focusable back to the last", async () => {
    await render(
      <TestSurface open name="only" onClose={vi.fn()} buttons={["second", "third"]} />
    );

    await act(async () => {
      labelled("close-only").focus();
      pressTab(true);
    });

    expect(document.activeElement).toBe(labelled("third"));
  });

  it("recomputes the focusable set on every Tab instead of caching it at open", async () => {
    function Harness({ locked }: { locked: boolean }): ReactNode {
      return (
        <TestSurface
          open
          name="only"
          onClose={vi.fn()}
          buttons={["second", "third"]}
          disabledButton={locked ? "third" : undefined}
        />
      );
    }

    await render(<Harness locked />);
    expect(labelled("third").disabled).toBe(true);

    await render(<Harness locked={false} />);
    expect(labelled("third").disabled).toBe(false);

    await act(async () => {
      labelled("second").focus();
      pressTab();
    });

    expect(document.activeElement).toBe(labelled("third"));
  });

  it("closes on a backdrop click only when the click landed on the backdrop", () => {
    const scrim = document.createElement("div");
    const child = document.createElement("div");
    scrim.append(child);
    document.body.append(scrim);
    const onClose = vi.fn();

    const handler = backdropCloseHandler(scrim, onClose);
    handler({ target: scrim });
    handler({ target: child });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports no reduced-motion preference when matchMedia does not exist", () => {
    // Measured environment fact (jsdom 30.0.1 in this repo): the property is absent.
    expect(typeof window.matchMedia).toBe("undefined");
    expect(prefersReducedMotion()).toBe(false);

    const queries: string[] = [];
    vi.stubGlobal("matchMedia", (query: string) => {
      queries.push(query);
      return { matches: true } as MediaQueryList;
    });

    expect(prefersReducedMotion()).toBe(true);
    expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
  });

  it("hands Escape back to the outer surface once the inner one closes", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    function Harness({ innerOpen }: { innerOpen: boolean }): ReactNode {
      return (
        <>
          <TestSurface open name="outer" onClose={outerClose} />
          <TestSurface open={innerOpen} name="inner" onClose={innerClose} />
        </>
      );
    }

    await render(<Harness innerOpen />);
    expect(openSurfaceCount()).toBe(2);

    await render(<Harness innerOpen={false} />);
    expect(openSurfaceCount()).toBe(1);

    await act(async () => {
      pressEscape();
    });

    expect(outerClose).toHaveBeenCalledTimes(1);
    expect(innerClose).toHaveBeenCalledTimes(0);
  });

  it("keeps exactly one document-level keydown listener across all surfaces", async () => {
    expect(openSurfaceCount()).toBe(0);
    const added = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const keydownCalls = (spy: typeof added): number =>
      spy.mock.calls.filter((call) => call[0] === "keydown").length;

    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <TestSurface open={open} name="outer" onClose={vi.fn()} />
          <TestSurface open={open} name="inner" onClose={vi.fn()} />
        </>
      );
    }

    await render(<Harness open />);
    expect(openSurfaceCount()).toBe(2);
    expect(keydownCalls(added)).toBe(1);
    expect(keydownCalls(removed)).toBe(0);

    await render(<Harness open={false} />);
    expect(openSurfaceCount()).toBe(0);
    expect(keydownCalls(added)).toBe(1);
    expect(keydownCalls(removed)).toBe(1);
  });
});
