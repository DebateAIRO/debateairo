// @vitest-environment jsdom
//
// CODE-REV-S02-C5C6 r1 — is the "a disconnected INCUMBENT never stands" clause really
// unpinnable (author MN7b / F1)? The claim is environmental: jsdom answers FOLLOWING both
// ways, so a connected candidate displaces a detached incumbent even without the clause.
// This probe asks a different question: with a SPEC-CONFORMANT compareDocumentPosition
// shimmed in (exactly one of PRECEDING/FOLLOWING per disconnected pair, consistently), does
// the clause become discriminating? If it does, the clause IS pinnable and the "unpinnable"
// verdict is about jsdom's default, not about the property.
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalSurface, openSurfaceCount } from "../../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let original: PropertyDescriptor | undefined;

/**
 * A conformant shim: for a pair where either node is disconnected, answer DISCONNECTED |
 * IMPLEMENTATION_SPECIFIC | (PRECEDING or FOLLOWING), decided consistently by a monotonic
 * creation tag, so `a.cDP(b)` and `b.cDP(a)` disagree exactly as the DOM standard requires.
 */
let tag = 0;
const TAG = new WeakMap<Node, number>();
function tagOf(n: Node): number {
  let t = TAG.get(n);
  if (t === undefined) { t = ++tag; TAG.set(n, t); }
  return t;
}
function installConformantCDP(): void {
  original = Object.getOwnPropertyDescriptor(Node.prototype, "compareDocumentPosition");
  const real = original!.value as (this: Node, other: Node) => number;
  Object.defineProperty(Node.prototype, "compareDocumentPosition", {
    configurable: true, writable: true,
    value(this: Node, other: Node): number {
      if (this.isConnected && other.isConnected) return real.call(this, other);
      const D = Node.DOCUMENT_POSITION_DISCONNECTED;
      const I = Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
      // CONSISTENT and spec-legal: a disconnected node sorts AFTER a connected one, so
      // `connected.cDP(disconnected)` is FOLLOWING and the reverse is PRECEDING. (When both
      // are disconnected, fall back to the creation tag.) The two directions never agree,
      // which is exactly the requirement jsdom 30.0.1 violates.
      let dir: number;
      if (this.isConnected !== other.isConnected) {
        dir = other.isConnected
          ? Node.DOCUMENT_POSITION_PRECEDING
          : Node.DOCUMENT_POSITION_FOLLOWING;
      } else {
        dir = tagOf(this) < tagOf(other)
          ? Node.DOCUMENT_POSITION_FOLLOWING
          : Node.DOCUMENT_POSITION_PRECEDING;
      }
      return D | I | dir;
    }
  });
}
function restoreCDP(): void {
  if (original !== undefined) Object.defineProperty(Node.prototype, "compareDocumentPosition", original);
  original = undefined;
}

async function render(el: ReactNode): Promise<void> {
  await act(async () => { root!.render(el); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("REVIEWER PROBE — MN7b under a conformant compareDocumentPosition", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    installConformantCDP();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null; host?.remove(); host = null;
    document.body.innerHTML = "";
    restoreCDP();
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  });

  it("the conformance shim really is consistent", () => {
    const a = document.createElement("div");
    document.body.append(a);
    const b = document.createElement("div");
    const ab = a.compareDocumentPosition(b), ba = b.compareDocumentPosition(a);
    // eslint-disable-next-line no-console
    console.log(`REV-MN7b shim: a->b=${ab} b->a=${ba}`);
    const F = Node.DOCUMENT_POSITION_FOLLOWING, P = Node.DOCUMENT_POSITION_PRECEDING;
    expect(((ab & F) !== 0) !== ((ba & F) !== 0)).toBe(true);
    expect(((ab & P) !== 0) !== ((ba & P) !== 0)).toBe(true);
  });

  it("a DETACHED INCUMBENT (registered last, created last) must not consume Escape", async () => {
    const staleClose = vi.fn();
    const liveClose = vi.fn();
    const held: { ref: { current: HTMLElement | null } | null } = { ref: null };

    function Live(): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      useModalSurface(true, { containerRef, initialFocusRef, onClose: liveClose });
      return (
        <div data-s="live" ref={(n) => { containerRef.current = n; }}>
          <button type="button" ref={(n) => { initialFocusRef.current = n; }}>live-close</button>
        </div>
      );
    }
    function Stale({ mounted }: { mounted: boolean }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      held.ref = containerRef;
      useModalSurface(true, { containerRef, initialFocusRef, onClose: staleClose });
      if (!mounted) return null;
      return (
        <div data-s="stale" ref={(n) => { containerRef.current = n; return () => {}; }}>
          <button type="button" ref={(n) => { initialFocusRef.current = n; }}>stale-close</button>
        </div>
      );
    }
    // Stale registers LAST, so it is the INCUMBENT `top` that topmostSurface() starts from.
    function H({ mounted }: { mounted: boolean }): ReactNode {
      return (<><Live /><Stale mounted={mounted} /></>);
    }
    await render(<H mounted />);
    expect(openSurfaceCount()).toBe(2);
    await render(<H mounted={false} />);
    expect(openSurfaceCount()).toBe(2);
    const stale = held.ref!.current;
    expect(stale, "the stale surface must still hold a (now detached) container").not.toBeNull();
    expect(stale!.isConnected).toBe(false);
    // Under the shim, `stale.cDP(live)` is PRECEDING, so `above` is false and WITHOUT the
    // incumbent clause the detached `stale` entry stays `top` and swallows Escape.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    // eslint-disable-next-line no-console
    console.log(`REV-MN7b liveClose=${liveClose.mock.calls.length} staleClose=${staleClose.mock.calls.length}`);
    expect(staleClose).toHaveBeenCalledTimes(0);
    expect(liveClose).toHaveBeenCalledTimes(1);
  });
});
