// @vitest-environment jsdom
//
// CODE-REV-S02-C1C2 r1 — probe 2. Establishes the MECHANISM and the REACHABILITY of the
// stack-order defect P1 found, and MEASURES a candidate remedy so the remedy can be marked
// BINDING rather than argued.
//
// Mechanism under test: `useModalSurface` pushes onto the module-level LIFO from a
// `React.useEffect`. React runs effects CHILD-FIRST within one commit. So two surfaces that
// mount in the SAME commit, one nested inside the other, land on the stack as
// [inner, outer] — and `surfaceStack[length - 1]` is then the OUTER surface, i.e. the one
// UNDERNEATH. SPEC R14/R16 require the TOPMOST to consume Escape.

import { act, StrictMode, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSurfaceCount, useModalSurface } from "../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(el: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(el);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function esc(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

function Surface({
  open,
  name,
  onClose,
  children
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  children?: ReactNode;
}): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(open, { containerRef, initialFocusRef, onClose });
  if (!open) return null;
  return (
    <div
      data-surface={name}
      ref={(n) => {
        containerRef.current = n;
      }}
    >
      <button
        type="button"
        ref={(n) => {
          initialFocusRef.current = n;
        }}
      >
        {`close-${name}`}
      </button>
      {children}
    </div>
  );
}

describe("REV probe 2 — stack ORDER is React effect order, not open order", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    expect(openSurfaceCount()).toBe(0);
  });

  it("Q1 SIBLINGS in one commit -> effects run in render order -> topmost is correct", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await render(
      <>
        <Surface open name="outer" onClose={outer} />
        <Surface open name="inner" onClose={inner} />
      </>
    );
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`Q1 SIBLING same-commit  -> outer=${outer.mock.calls.length} inner=${inner.mock.calls.length}  (this is the shape the AUTHOR's test uses)`);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(0);
  });

  it("Q2 NESTED in one commit -> effects run CHILD-FIRST -> topmost is INVERTED", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await render(
      <Surface open name="outer" onClose={outer}>
        <Surface open name="inner" onClose={inner} />
      </Surface>
    );
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`Q2 NESTED same-commit   -> outer=${outer.mock.calls.length} inner=${inner.mock.calls.length}  (SPEC demands outer=0 inner=1)`);
    // Recorded as MEASURED BEHAVIOUR, not as the SPEC's expectation:
    expect(outer.mock.calls.length + inner.mock.calls.length).toBe(1);
  });

  it("Q3 NESTED under StrictMode (the dev stack's default) — measured", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await render(
      <StrictMode>
        <Surface open name="outer" onClose={outer}>
          <Surface open name="inner" onClose={inner} />
        </Surface>
      </StrictMode>
    );
    // eslint-disable-next-line no-console
    console.log(`Q3 StrictMode NESTED, depth after mount = ${openSurfaceCount()} (2 = no leak from the double-invoke)`);
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`Q3 StrictMode NESTED    -> outer=${outer.mock.calls.length} inner=${inner.mock.calls.length}`);
    expect(outer.mock.calls.length + inner.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("Q4 SIBLINGS under StrictMode — measured (does the double-invoke leak the stack?)", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await render(
      <StrictMode>
        <>
          <Surface open name="outer" onClose={outer} />
          <Surface open name="inner" onClose={inner} />
        </>
      </StrictMode>
    );
    // eslint-disable-next-line no-console
    console.log(`Q4 StrictMode SIBLINGS, depth = ${openSurfaceCount()} (expect 2)`);
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`Q4 StrictMode SIBLINGS  -> outer=${outer.mock.calls.length} inner=${inner.mock.calls.length}`);
    expect(openSurfaceCount()).toBe(2);
  });

  it("Q5 THREE nested in one commit — the order the module actually holds", async () => {
    const calls: string[] = [];
    const mk = (n: string) => () => calls.push(n);
    await render(
      <Surface open name="a" onClose={mk("a")}>
        <Surface open name="b" onClose={mk("b")}>
          <Surface open name="c" onClose={mk("c")} />
        </Surface>
      </Surface>
    );
    expect(openSurfaceCount()).toBe(3);
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`Q5 three nested a>b>c, ONE Escape -> closed: ${JSON.stringify(calls)}  (SPEC demands ["c"])`);
    expect(calls).toHaveLength(1);
  });

  // ------------------------------------------------------------------ THE CANDIDATE REMEDY
  // A DOM-containment tiebreak makes "topmost" independent of React's effect order:
  // among the open surfaces, the one no other open surface is contained BY is the topmost.
  it("Q6 REMEDY (measured): pick the topmost by DOM containment, not by array position", async () => {
    // Reproduce the module's stack semantics locally, plus the one-line tiebreak, and show it
    // returns the INNER surface for both the nested and the sibling shapes.
    type Entry = { name: string; el: HTMLElement };
    const pickTopByArray = (s: Entry[]): string | undefined => s[s.length - 1]?.name;
    const pickTopByDom = (s: Entry[]): string | undefined => {
      if (s.length === 0) return undefined;
      let top = s[s.length - 1]!;
      for (const e of s) {
        // `e` is above `top` when `top` contains `e`, or when `e` comes later in document order
        const rel = top.el.compareDocumentPosition(e.el);
        if (rel & Node.DOCUMENT_POSITION_CONTAINED_BY || rel & Node.DOCUMENT_POSITION_FOLLOWING) top = e;
      }
      return top.name;
    };

    document.body.innerHTML =
      '<div id="outer"><div id="inner"></div></div><div id="sibA"></div><div id="sibB"></div>';
    const el = (id: string): HTMLElement => document.getElementById(id)!;

    // Nested, in the CHILD-FIRST order React actually produces:
    const nested: Entry[] = [
      { name: "inner", el: el("inner") },
      { name: "outer", el: el("outer") }
    ];
    // Siblings, in the render order React produces:
    const siblings: Entry[] = [
      { name: "sibA", el: el("sibA") },
      { name: "sibB", el: el("sibB") }
    ];

    // eslint-disable-next-line no-console
    console.log(
      `Q6 nested   : byArray=${pickTopByArray(nested)}  byDom=${pickTopByDom(nested)}   (want inner)\n` +
        `Q6 siblings : byArray=${pickTopByArray(siblings)}  byDom=${pickTopByDom(siblings)}  (want sibB)`
    );
    expect(pickTopByArray(nested), "the CURRENT rule picks the wrong surface when nested").toBe("outer");
    expect(pickTopByDom(nested), "the containment tiebreak picks the right one").toBe("inner");
    expect(pickTopByDom(siblings), "and it does not regress the sibling case").toBe("sibB");
    document.body.innerHTML = "";
  });
});
