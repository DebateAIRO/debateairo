// @vitest-environment jsdom

import { act, useRef, type ReactNode, type RefObject } from "react";
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
  /**
   * The caller-named control focus should return to (V-22). Omitted by every case that
   * predates it, so those keep exercising the captured-opener path unchanged.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
};

function TestSurface({
  open,
  name,
  onClose,
  buttons = [],
  initialFocus,
  disabledButton,
  returnFocusRef,
  children
}: TestSurfaceProps): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(open, { containerRef, initialFocusRef, onClose, returnFocusRef });
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

  it("delivers one Escape to the nested INNER surface of a pair mounted in ONE commit", async () => {
    // PROPERTY (V-20 (b′)): when one open surface's container is a DOM DESCENDANT of another
    // open surface's container, Escape reaches the DESCENDANT — whatever order the two
    // registered in — and exactly one `onClose` runs.
    //
    // This is the one arrangement where open order alone gets it wrong. The two surfaces mount
    // in ONE commit, the inner as a React CHILD of the outer; React runs effects CHILD-FIRST, so
    // registration order is [inner, outer] and "last registered" names the OUTER surface — the
    // one UNDERNEATH. Under plain open order (V-20 (b), shipped at c334136d) the outer surface
    // answered, which is CODE-REV-S02-C9 r1 B1's exact harm in a different shape: the key closes
    // the surface the visitor is not looking at, discards what they had in it, and leaves focus
    // trapped in the surface that refused the key (CODE-REV-CROSS-02 r1 N2, measured).
    //
    // (b′) keeps open order and adds a CONTAINMENT-ONLY tiebreak: the last connected entry is
    // the incumbent, and a lower entry replaces it only when the incumbent's container
    // `contains` it. There is no FOLLOWING arm — document order between UNRELATED surfaces is
    // what produced B1 and it is not consulted anywhere. No surface in this product nests today
    // (both policy modals are siblings, mounted conditionally by a state change the visitor
    // causes — CODE-REV-CROSS-02 r1's sweep), so the tiebreak changes nothing a visitor can
    // reach; it exists so the next nested overlay does not re-create B1.
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    await render(
      <TestSurface open name="outer" onClose={outerClose}>
        <TestSurface open name="inner" onClose={innerClose} />
      </TestSurface>
    );
    expect(openSurfaceCount()).toBe(2);

    // The premise, asserted rather than assumed: the inner container really is nested inside
    // the outer one, so a pass here cannot come from the two being unrelated siblings.
    const outerContainer = document.querySelector<HTMLElement>('[data-surface="outer"]')!;
    const innerContainer = document.querySelector<HTMLElement>('[data-surface="inner"]')!;
    expect(
      outerContainer.contains(innerContainer),
      "the inner surface's container is nested inside the outer one's"
    ).toBe(true);

    await act(async () => {
      pressEscape();
    });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).toHaveBeenCalledTimes(0);
  });

  it("delivers one Escape to a nested inner surface that opened in a LATER commit", async () => {
    // The reachable half of the case above, and the shape every consumer in this product has:
    // the outer surface is already open when the inner one opens, so registration order is
    // [outer, inner] and the inner surface — the one the visitor opened last, and the one its
    // own scrim covers the outer with — answers Escape. Nesting neither helps nor hinders it.
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    function Harness({ innerOpen }: { innerOpen: boolean }): ReactNode {
      return (
        <TestSurface open name="outer" onClose={outerClose}>
          <TestSurface open={innerOpen} name="inner" onClose={innerClose} />
        </TestSurface>
      );
    }

    await render(<Harness innerOpen={false} />);
    expect(openSurfaceCount()).toBe(1);
    await render(<Harness innerOpen />);
    expect(openSurfaceCount()).toBe(2);

    await act(async () => {
      pressEscape();
    });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).toHaveBeenCalledTimes(0);
  });

  it("delivers one Escape to exactly one of three surfaces, and it is the innermost", async () => {
    // Three at once, mounted in ONE commit and nested `a > b > c`, so child-first registration
    // order is [c, b, a] and `a` — the last registered — is the incumbent the walk starts at.
    // (b′) then descends the containment chain twice, `a` → `b` → `c`, so the INNERMOST surface
    // takes the key: the tiebreak repeats until nothing deeper is open, it does not stop at the
    // first descendant it meets. What the assertion pins is that EXACTLY ONE `onClose` runs
    // (REQ-REV-01 B3), whichever it is: `toEqual` on the whole array fails both if a second
    // surface acts and if the wrong one does.
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

  it("delivers one Escape by OPEN order when two surfaces opened out of DOM order", async () => {
    // THE discriminating case, and the mechanism V-20 (b) ruled on: `first-dom` is rendered
    // BEFORE `second-dom` in the document but OPENS after it, so registration order is
    // [second-dom, first-dom] while document order puts `second-dom` last. Ranking by document
    // position gives the key to `second-dom`; ranking by open order gives it to `first-dom`,
    // which is the surface the visitor just opened and — because it opened from a control of the
    // one below it, under its own scrim — the one they are looking at.
    //
    // This is the abstract form of CODE-REV-S02-C9 r1 B1: on `/sign-up` the cookie card is later
    // in the document (`layout.tsx` mounts `<CookieConsent />` after `{children}`) while the
    // sign-up policy, which renders inside `{children}`, is the one opened last and painted on
    // top. `tests/render/consent-cross-slice.test.tsx` pins it on the real surfaces.
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

    expect(firstDomClose).toHaveBeenCalledTimes(1);
    expect(secondDomClose).toHaveBeenCalledTimes(0);
  });

  it("never lets a surface whose container has detached consume Escape", async () => {
    // The `isConnected` guard is the one clause `topmostSurface()` kept when it moved from
    // document order to open order, and this is the arrangement that discriminates it: the
    // detaching surface mounts SECOND, so it is the LAST-REGISTERED entry — the one the walk
    // starts at — and only the guard stops it swallowing the key.
    // The reachable shape is React 19's cleanup-returning callback ref: it does NOT null the
    // ref on detach, so a surface that stays registered while it stops rendering its container
    // holds a stale detached node. The precondition is asserted, not assumed, so the case
    // cannot pass through the `null` branch that already returns such an entry.
    const staleClose = vi.fn();
    const liveClose = vi.fn();
    const captured: { ref: { current: HTMLElement | null } | null } = { ref: null };

    function DetachingSurface({ mounted }: { mounted: boolean }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      captured.ref = containerRef;
      useModalSurface(true, { containerRef, initialFocusRef, onClose: staleClose });
      if (!mounted) return null;
      return (
        <div
          data-surface="stale"
          ref={(node) => {
            containerRef.current = node;
            return () => {};
          }}
        >
          <button
            type="button"
            ref={(node) => {
              initialFocusRef.current = node;
            }}
          >
            close-stale
          </button>
        </div>
      );
    }

    function Harness({ mounted }: { mounted: boolean }): ReactNode {
      return (
        <>
          <TestSurface open name="live" onClose={liveClose} />
          <DetachingSurface mounted={mounted} />
        </>
      );
    }

    await render(<Harness mounted />);
    expect(openSurfaceCount()).toBe(2);
    await render(<Harness mounted={false} />);
    expect(openSurfaceCount()).toBe(2);

    const stale = captured.ref!.current;
    expect(stale, "the stale surface must still hold its container ref").not.toBeNull();
    expect(stale!.isConnected).toBe(false);

    await act(async () => {
      pressEscape();
    });

    expect(liveClose).toHaveBeenCalledTimes(1);
    expect(staleClose).toHaveBeenCalledTimes(0);
  });

  it("never lets a DETACHED entry receive Escape, however many have detached", async () => {
    // The same guard as the case above, taken to the shape only an open-order walk has: the two
    // most recently registered surfaces have both detached, so the guard has to keep WALKING
    // rather than step over one entry. It replaces the case that installed a spec-conformant
    // `compareDocumentPosition` shim to make the "detached incumbent" half of the old
    // document-order comparison observable; there is no comparison left to shim, and the shim
    // and its helpers went with it. The outcome that case pinned — a detached surface never
    // receives Escape, even though it is the entry the walk starts at — is what these two cases
    // pin between them, now without patching a DOM prototype.
    const closed: string[] = [];
    const record = (name: string) => () => {
      closed.push(name);
    };
    const captured: Record<string, { current: HTMLElement | null } | null> = {};

    function DetachingSurface({ name, mounted }: { name: string; mounted: boolean }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      captured[name] = containerRef;
      useModalSurface(true, { containerRef, initialFocusRef, onClose: record(name) });
      if (!mounted) return null;
      return (
        <div
          data-surface={name}
          ref={(node) => {
            containerRef.current = node;
            return () => {};
          }}
        >
          <button
            type="button"
            ref={(node) => {
              initialFocusRef.current = node;
            }}
          >
            {`close-${name}`}
          </button>
        </div>
      );
    }

    function Harness({ mounted }: { mounted: boolean }): ReactNode {
      return (
        <>
          <TestSurface open name="live" onClose={record("live")} />
          <DetachingSurface name="stale-1" mounted={mounted} />
          <DetachingSurface name="stale-2" mounted={mounted} />
        </>
      );
    }

    await render(<Harness mounted />);
    expect(openSurfaceCount()).toBe(3);
    await render(<Harness mounted={false} />);
    expect(openSurfaceCount(), "both stale surfaces stay registered").toBe(3);

    // The preconditions, asserted rather than assumed: each stale surface still holds its
    // container ref (so the case cannot pass through the `null` branch, which RETURNS the entry
    // rather than skipping it), and both of those nodes have left the document.
    for (const name of ["stale-1", "stale-2"]) {
      const node = captured[name]!.current;
      expect(node, `${name} must still hold its container ref`).not.toBeNull();
      expect(node!.isConnected, `${name} has left the document`).toBe(false);
    }
    expect(
      document.querySelector('[data-surface="live"]'),
      "the live surface must still be rendered"
    ).not.toBeNull();

    await act(async () => {
      pressEscape();
    });

    expect(closed, "the walk skipped both detached entries and stopped at the live one").toEqual([
      "live"
    ]);
  });

  it("delivers Escape to a registered surface that renders NO container of its own", async () => {
    // PROPERTY (CODE-REV-CROSS-02 r1 N1): an entry whose container is `null` is RETURNED by the
    // walk, not skipped — the third branch `topmostSurface()`'s doc comment states as a
    // behaviour, and the only one nothing pinned. The comment claimed it; mutant M5 `NONULL`
    // (`container !== null && container.isConnected`) survived every suite in the mission.
    //
    // A container-less surface is also the one incumbent no containment tiebreak can displace:
    // with no node there is nothing for a lower entry to be a descendant OF, so open order
    // decides alone. Both halves are asserted here.
    //
    // Unreachable in this product today — both consumers attach their container ref before the
    // registering effect runs — so this is a contract pin for the next consumer, and it is GREEN
    // at BASE by construction: its RED is the mutant's, not the base helper's.
    const belowClose = vi.fn();
    const containerlessClose = vi.fn();
    const captured: { ref: { current: HTMLElement | null } | null } = { ref: null };

    function ContainerlessSurface({ onClose }: { onClose: () => void }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      captured.ref = containerRef;
      useModalSurface(true, { containerRef, initialFocusRef, onClose });
      return null;
    }

    await render(
      <>
        <TestSurface open name="below" onClose={belowClose} />
        <ContainerlessSurface onClose={containerlessClose} />
      </>
    );
    expect(openSurfaceCount()).toBe(2);

    // The precondition, asserted rather than assumed: the later-registered surface really holds
    // a `null` container, so a pass cannot come from the `isConnected` branch instead.
    expect(captured.ref!.current, "the container-less surface has no container node").toBeNull();
    expect(
      document.querySelector('[data-surface="below"]'),
      "the surface underneath is rendered, so it is a real rival for the key"
    ).not.toBeNull();

    await act(async () => {
      pressEscape();
    });

    expect(containerlessClose).toHaveBeenCalledTimes(1);
    expect(belowClose).toHaveBeenCalledTimes(0);
  });

  it("traps Tab in the same surface Escape reaches, for the same nested pair", async () => {
    // The Tab trap reads the same `topmostSurface()` the Escape branch reads, so the nested pair
    // is asserted for Tab too and the two must agree — that agreement IS the property, and the
    // title states it rather than an outcome. Under (b′) the surface Escape reaches is the INNER
    // one, so Tab from `close-outer` — a control OUTSIDE the trapped surface — enters the inner
    // surface at its first candidate, `close-inner`.
    //
    // `outer-2` is the discriminator and is why it is rendered: it is the outer surface's own
    // next control, and it is exactly where Tab lands if the trap reads the OUTER entry. So this
    // case fails in a NAMED direction under plain open order (V-20 (b)) as well as under a
    // document-order rank, instead of merely failing.
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

  it("returns focus to the named control when the opener was unmounted by the same commit", async () => {
    // PROPERTY (V-22's default; S01-R18's bar direction): when `returnFocusRef` names a
    // control that IS in the document at close, the helper prefers it over the
    // `document.activeElement` it captured at open.
    //
    // The captured opener cannot serve this arrangement and no hook tier can rescue it:
    // the commit that opens the surface also unmounts the opener, so the platform has
    // already moved focus to `document.body` before any effect runs, and the control that
    // comes back is a FRESH node (measured: CODE-REV-S01-C6 r1 B2). The fixture reproduces
    // exactly that — opener and surface are mutually exclusive, like the cookie bar and
    // its preferences card — and the ref is the parent's, so React re-attaches it in the
    // layout phase of the commit that remounts the control, before this passive cleanup.
    function Harness({ open }: { open: boolean }): ReactNode {
      const returnFocusRef = useRef<HTMLElement | null>(null);
      return open ? (
        <TestSurface open name="only" onClose={vi.fn()} returnFocusRef={returnFocusRef} />
      ) : (
        <button
          type="button"
          ref={(node) => {
            returnFocusRef.current = node;
          }}
        >
          opener
        </button>
      );
    }

    await render(<Harness open={false} />);
    const first = labelled("opener");
    await act(async () => {
      first.focus();
    });
    expect(document.activeElement, "the opener holds focus before the surface opens").toBe(first);

    await render(<Harness open />);
    expect(document.activeElement, "focus moved into the surface").toBe(labelled("close-only"));
    expect(first.isConnected, "and the commit that opened it removed the opener").toBe(false);

    await render(<Harness open={false} />);
    const returned = labelled("opener");
    expect(returned, "the control that came back is a fresh node").not.toBe(first);
    expect(document.activeElement, "focus is on the control the caller named").toBe(returned);
  });

  it("keeps the captured opener ahead of the named control while the opener is on the page", async () => {
    // PROPERTY: `returnFocusRef` serves the opens where the capture did NOT survive; it is
    // not a general override. A caller that lends a control and still has its opener on the
    // page gets the opener — which is what keeps the cookie card's Settings direction on
    // `Cookie preferences` even though the bar returns underneath it and re-attaches the
    // very ref the bar entry needs (measured; see the ordering note in the helper).
    function Harness({ open }: { open: boolean }): ReactNode {
      const returnFocusRef = useRef<HTMLElement | null>(null);
      return (
        <>
          <input id="opener" name="opener" />
          <button
            type="button"
            ref={(node) => {
              returnFocusRef.current = node;
            }}
          >
            named
          </button>
          <TestSurface open={open} name="only" onClose={vi.fn()} returnFocusRef={returnFocusRef} />
        </>
      );
    }

    await render(<Harness open={false} />);
    const opener = document.querySelector<HTMLInputElement>("#opener")!;
    await act(async () => {
      opener.focus();
    });

    await render(<Harness open />);
    expect(document.activeElement).toBe(labelled("close-only"));
    expect(labelled("named").isConnected, "the named control is on the page and would win").toBe(
      true
    );

    await render(<Harness open={false} />);
    expect(document.activeElement, "the surviving opener kept the return").toBe(opener);
  });

  it("returns focus to the named control when the captured opener has since left the page", async () => {
    // PROPERTY: "did the capture survive?" is asked at CLOSE, not at open. An opener that
    // was on the page when the surface opened and has been removed while it was open is as
    // unusable as one the opening commit removed, so the named control takes the return.
    function Harness({ open, opener }: { open: boolean; opener: boolean }): ReactNode {
      const returnFocusRef = useRef<HTMLElement | null>(null);
      return (
        <>
          {opener ? <input id="opener" name="opener" /> : null}
          <button
            type="button"
            ref={(node) => {
              returnFocusRef.current = node;
            }}
          >
            named
          </button>
          <TestSurface open={open} name="only" onClose={vi.fn()} returnFocusRef={returnFocusRef} />
        </>
      );
    }

    await render(<Harness open={false} opener />);
    const opener = document.querySelector<HTMLInputElement>("#opener")!;
    await act(async () => {
      opener.focus();
    });

    await render(<Harness open opener />);
    expect(document.activeElement, "the surface captured a live opener").toBe(
      labelled("close-only")
    );

    await render(<Harness open opener={false} />);
    expect(opener.isConnected, "and the capture has now left the document").toBe(false);

    await render(<Harness open={false} opener={false} />);
    expect(document.activeElement, "so the named control took the return").toBe(labelled("named"));
  });

  it("never hands focus to a named control that is not in the document", async () => {
    // PROPERTY: the named control is taken only while it is connected. Focus lands nowhere
    // rather than on a node that has left the page.
    //
    // NOT RED at base, and said so rather than implied: the base helper reads no such
    // member at all, so this case passes there for the wrong reason — its RED is the
    // `named.isConnected` mutant, watched in the handoff. And the assertion that
    // DISCRIMINATES that mutant is the spy, not the active element: focusing a detached
    // node and focusing nothing leave `document.activeElement` identical, so a purely
    // behavioural assertion here would pin nothing.
    const stale = document.createElement("button");
    expect(stale.isConnected, "the named control is genuinely off-document").toBe(false);
    const stealFocus = vi.spyOn(stale, "focus");

    function Harness({ open }: { open: boolean }): ReactNode {
      const returnFocusRef = useRef<HTMLElement | null>(stale);
      return <TestSurface open={open} name="only" onClose={vi.fn()} returnFocusRef={returnFocusRef} />;
    }

    await render(<Harness open={false} />);
    expect(document.activeElement, "nothing holds focus, so the capture will be the body").toBe(
      document.body
    );

    await render(<Harness open />);
    expect(document.activeElement).toBe(labelled("close-only"));

    await render(<Harness open={false} />);
    expect(stealFocus, "the detached name was never asked for focus").not.toHaveBeenCalled();
    expect(document.activeElement, "and focus went nowhere else either").toBe(document.body);
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

  it("advances past a control inside a disabled fieldset, so Tab is not a dead key", async () => {
    // `button:not([disabled])` MATCHES this button — the `disabled` attribute is on the
    // fieldset, not on the button — so the attribute filter keeps it, while `focus()` refuses
    // it in jsdom exactly as a real browser does (HTML: a descendant of a disabled fieldset is
    // itself disabled). It is the SECOND unfocusable shape this environment can discriminate,
    // and it is the one that pins the advance loop: without that loop, the trap preventDefaults
    // Tab, calls focus() on a control the platform refuses, and Tab becomes a dead key.
    await render(
      <TestSurface open name="only" onClose={vi.fn()}>
        <fieldset disabled>
          <button type="button">locked</button>
        </fieldset>
        <button type="button">next-real</button>
      </TestSurface>
    );

    expect(labelled("locked").matches('button:not([disabled])')).toBe(true);

    await act(async () => {
      labelled("close-only").focus();
      pressTab();
    });

    expect(document.activeElement).toBe(labelled("next-real"));
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
