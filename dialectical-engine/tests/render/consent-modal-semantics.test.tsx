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

  it("delivers one Escape to the nested inner surface, not to the outer one it mounted with", async () => {
    // The two surfaces mount in ONE commit, the inner as a React CHILD of the outer. React runs
    // effects child-first, so registration order is [inner, outer] and "the last registered
    // entry" names the surface UNDERNEATH. Topmost is a DOM property, not an effect-order one.
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    await render(
      <TestSurface open name="outer" onClose={outerClose}>
        <TestSurface open name="inner" onClose={innerClose} />
      </TestSurface>
    );
    expect(openSurfaceCount()).toBe(2);

    await act(async () => {
      pressEscape();
    });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).toHaveBeenCalledTimes(0);
  });

  it("delivers one Escape to the innermost of three nested surfaces", async () => {
    const closed: string[] = [];
    const record = (name: string) => () => {
      closed.push(name);
    };

    await render(
      <TestSurface open name="a" onClose={record("a")}>
        <TestSurface open name="b" onClose={record("b")}>
          <TestSurface open name="c" onClose={record("c")} />
        </TestSurface>
      </TestSurface>
    );
    expect(openSurfaceCount()).toBe(3);

    await act(async () => {
      pressEscape();
    });

    expect(closed).toEqual(["c"]);
  });

  it("delivers one Escape by document position when two surfaces opened out of DOM order", async () => {
    // Same class as the nested pair: the surface that registered LAST is not the topmost one.
    // Here `later` is rendered BEFORE `earlier` in the DOM but opens after it, so registration
    // order is [earlier, later] while document order — which is what the visitor sees stacked —
    // puts `earlier` on top. This is the arm of the rule that containment alone cannot decide.
    const firstDomClose = vi.fn();
    const secondDomClose = vi.fn();

    function Harness({ firstDomOpen }: { firstDomOpen: boolean }): ReactNode {
      return (
        <>
          <TestSurface open={firstDomOpen} name="first-dom" onClose={firstDomClose} />
          <TestSurface open name="second-dom" onClose={secondDomClose} />
        </>
      );
    }

    await render(<Harness firstDomOpen={false} />);
    expect(openSurfaceCount()).toBe(1);
    await render(<Harness firstDomOpen />);
    expect(openSurfaceCount()).toBe(2);

    await act(async () => {
      pressEscape();
    });

    expect(secondDomClose).toHaveBeenCalledTimes(1);
    expect(firstDomClose).toHaveBeenCalledTimes(0);
  });

  it("traps Tab inside the nested inner surface, not inside the outer one", async () => {
    // The Tab trap reads the same "topmost" the Escape branch reads, so the nested pair must be
    // asserted for Tab too: focus sitting in the outer surface is pulled into the inner one.
    await render(
      <TestSurface open name="outer" onClose={vi.fn()} buttons={["outer-2"]}>
        <TestSurface open name="inner" onClose={vi.fn()} />
      </TestSurface>
    );

    await act(async () => {
      labelled("close-outer").focus();
      pressTab();
    });

    expect(document.activeElement).toBe(labelled("close-inner"));
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

  it("skips a control that tabindex=-1 has removed from the tab order", async () => {
    // The pinned selector's `:not([tabindex="-1"])` guard sits on the `[tabindex]` arm only, so
    // `button:not([disabled])` re-admits a button carrying tabindex="-1". jsdom's focus() DOES
    // land on such a button, so without the filter the trap parks focus where Tab cannot reach.
    await render(
      <TestSurface open name="only" onClose={vi.fn()}>
        <button type="button" tabIndex={-1}>
          untabbable
        </button>
        <button type="button">last</button>
      </TestSurface>
    );

    await act(async () => {
      labelled("close-only").focus();
      pressTab();
    });

    expect(document.activeElement).toBe(labelled("last"));
  });

  it("skips a hidden input, so Tab inside the surface is never a no-op", async () => {
    // `input:not([disabled])` matches `<input type="hidden">`. focus() is a no-op on it in jsdom
    // and in every real browser, so an unfiltered cycle preventDefaults Tab and moves nothing.
    await render(
      <TestSurface open name="only" onClose={vi.fn()}>
        <input type="hidden" name="csrf" />
        <button type="button">last</button>
      </TestSurface>
    );

    await act(async () => {
      labelled("close-only").focus();
      pressTab();
    });

    expect(document.activeElement).toBe(labelled("last"));
  });

  it("keeps Escape from reaching a window listener while a surface is open", async () => {
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    const onClose = vi.fn();

    // Control: with nothing open the same listener DOES see the key, so a run in which the
    // event never reached the document at all cannot pass this case vacuously.
    expect(openSurfaceCount()).toBe(0);
    pressEscape();
    expect(onWindow).toHaveBeenCalledTimes(1);

    await render(<TestSurface open name="only" onClose={onClose} />);
    await act(async () => {
      pressEscape();
    });
    window.removeEventListener("keydown", onWindow);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onWindow).toHaveBeenCalledTimes(1);
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
    // The absent branch is DRIVEN here, never inherited from the environment: jsdom 30.0.1 in
    // this repo happens to have no `window.matchMedia`, but that is an environment fact, and a
    // jsdom upgrade that implements it must not read as a modal-semantics regression.
    vi.stubGlobal("matchMedia", undefined);
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
