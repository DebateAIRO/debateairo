// @vitest-environment jsdom
//
// CODE-REV-S02-C1C2 r1 — REVIEWER's own probes, built from the SPEC properties, NOT from the
// author's test file.  Charges answered here:
//   * the Esc STACK with two NESTED surfaces (packet §4)
//   * focus trap / focus return (packet §4, F2)
//   * `matchMedia` absence (packet §4)
//   * openSurfaceCount depth
//
// SPEC properties under probe (docs/missions/consent-ui/slices/S02/SPEC.md):
//   R14/R16 — "the TOPMOST open surface consumes Esc and no other surface acts on the same event"
//   R16     — initial focus, trap both directions, focus return, focusables never cached
//   R24     — prefersReducedMotion() guards window.matchMedia

import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backdropCloseHandler,
  openSurfaceCount,
  prefersReducedMotion,
  useModalSurface
} from "../apps/ui/components/consent/modalSemantics.js";

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

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(ev);
  return ev;
}

/** A surface whose children are supplied by the caller — so one can NEST inside another. */
function Surface({
  open,
  name,
  onClose,
  children,
  extra
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  children?: ReactNode;
  /** raw markup appended inside the container, for focusable-set probes */
  extra?: ReactNode;
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
        data-close={name}
        ref={(n) => {
          initialFocusRef.current = n;
        }}
      >
        {`close-${name}`}
      </button>
      {extra}
      {children}
    </div>
  );
}

const btn = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

describe("REV probe — the Esc stack", () => {
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
    expect(openSurfaceCount(), "stack leaked between probes").toBe(0);
  });

  // ---------------------------------------------------------------- NESTED, SAME COMMIT
  it("P1 NESTED same-commit: which surface consumes the one Escape?", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    // The inner surface is a REACT CHILD of the outer one, and both mount in ONE commit.
    await render(
      <Surface open name="outer" onClose={outer}>
        <Surface open name="inner" onClose={inner} />
      </Surface>
    );
    expect(openSurfaceCount()).toBe(2);

    await act(async () => {
      key("Escape");
    });

    // eslint-disable-next-line no-console
    console.log(
      `P1 NESTED same-commit -> outer.onClose=${outer.mock.calls.length} inner.onClose=${inner.mock.calls.length}`
    );
    // The SPEC property: only the TOPMOST (the inner, visually on top) may act.
    expect(inner, "SPEC R14/R16: the inner (topmost) surface must consume the Escape").toHaveBeenCalledTimes(1);
    expect(outer, "SPEC R14/R16: the outer surface must NOT act on the same event").toHaveBeenCalledTimes(0);
  });

  // ------------------------------------------------- NESTED, SEQUENTIAL (the real S01→S02 flow)
  it("P2 NESTED sequential (card open, THEN modal opens): topmost consumes", async () => {
    const cardClose = vi.fn();
    const modalClose = vi.fn();
    function Harness({ modalOpen }: { modalOpen: boolean }): ReactNode {
      return (
        <Surface open name="card" onClose={cardClose}>
          <Surface open={modalOpen} name="modal" onClose={modalClose} />
        </Surface>
      );
    }
    await render(<Harness modalOpen={false} />);
    expect(openSurfaceCount()).toBe(1);
    await render(<Harness modalOpen />);
    expect(openSurfaceCount()).toBe(2);

    await act(async () => {
      key("Escape");
    });
    // eslint-disable-next-line no-console
    console.log(
      `P2 NESTED sequential -> card.onClose=${cardClose.mock.calls.length} modal.onClose=${modalClose.mock.calls.length}`
    );
    expect(modalClose).toHaveBeenCalledTimes(1);
    expect(cardClose).toHaveBeenCalledTimes(0);
  });

  // ------------------------------------------------------------------ SIBLING, SEQUENTIAL
  it("P3 SIBLING sequential: second-opened consumes, first untouched; then it pops back", async () => {
    const a = vi.fn();
    const b = vi.fn();
    function Harness({ bOpen }: { bOpen: boolean }): ReactNode {
      return (
        <>
          <Surface open name="a" onClose={a} />
          <Surface open={bOpen} name="b" onClose={b} />
        </>
      );
    }
    await render(<Harness bOpen={false} />);
    await render(<Harness bOpen />);
    expect(openSurfaceCount()).toBe(2);
    await act(async () => {
      key("Escape");
    });
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(0);

    await render(<Harness bOpen={false} />);
    expect(openSurfaceCount()).toBe(1);
    await act(async () => {
      key("Escape");
    });
    expect(a, "after the inner pops, Escape reaches the outer").toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------- preventDefault / stopPropagation
  it("P4 Escape is preventDefault'd and stopPropagation'd; a window listener never sees it", async () => {
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    const close = vi.fn();
    await render(<Surface open name="s" onClose={close} />);
    let ev!: KeyboardEvent;
    await act(async () => {
      ev = key("Escape");
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented, "SPEC: the handler preventDefaults").toBe(true);
    expect(onWindow, "stopPropagation() must keep it from the window phase").toHaveBeenCalledTimes(0);
    window.removeEventListener("keydown", onWindow);
  });

  it("P5 with NO surface open, Escape is not intercepted and reaches window", async () => {
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    expect(openSurfaceCount()).toBe(0);
    key("Escape");
    expect(onWindow).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", onWindow);
  });

  it("P6 a non-Escape, non-Tab key is passed through untouched", async () => {
    const close = vi.fn();
    await render(<Surface open name="s" onClose={close} />);
    let ev!: KeyboardEvent;
    await act(async () => {
      ev = key("a");
    });
    expect(close).toHaveBeenCalledTimes(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  // ---------------------------------------------------------------------------- FOCUS
  it("P7 focus returns to the opener; and the opener is captured at OPEN time", async () => {
    const close = vi.fn();
    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <input id="opener" />
          <input id="other" />
          <Surface open={open} name="s" onClose={close} />
        </>
      );
    }
    await render(<Harness open={false} />);
    const opener = document.querySelector<HTMLInputElement>("#opener")!;
    const other = document.querySelector<HTMLInputElement>("#other")!;
    await act(async () => opener.focus());
    await render(<Harness open />);
    expect(document.activeElement, "initial focus goes to the named ref").toBe(btn("close-s"));
    // move focus elsewhere while open, then close: the OPENER (not `other`) must get it back
    await act(async () => other.focus());
    await render(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("P8 focus return when the opener has been REMOVED from the DOM meanwhile", async () => {
    const close = vi.fn();
    function Harness({ open, keepOpener }: { open: boolean; keepOpener: boolean }): ReactNode {
      return (
        <>
          {keepOpener ? <input id="opener" /> : null}
          <Surface open={open} name="s" onClose={close} />
        </>
      );
    }
    await render(<Harness open={false} keepOpener />);
    const opener = document.querySelector<HTMLInputElement>("#opener")!;
    await act(async () => opener.focus());
    await render(<Harness open keepOpener />);
    await render(<Harness open={false} keepOpener={false} />);
    // eslint-disable-next-line no-console
    console.log(`P8 activeElement after opener removed -> ${document.activeElement?.nodeName}`);
    // Documented as a known non-guarantee in PLAN §Refutation (S02-S03): we only assert no throw.
    expect(openSurfaceCount()).toBe(0);
  });

  it("P9 Tab from OUTSIDE the surface is pulled back inside (index === -1 branch)", async () => {
    const close = vi.fn();
    function Harness(): ReactNode {
      return (
        <>
          <input id="outside" />
          <Surface open name="s" onClose={close} extra={<button type="button">mid-s</button>} />
        </>
      );
    }
    await render(<Harness />);
    const outside = document.querySelector<HTMLInputElement>("#outside")!;
    await act(async () => {
      outside.focus();
      key("Tab");
    });
    expect(document.activeElement, "Tab from the page behind must land inside").toBe(btn("close-s"));
    await act(async () => {
      outside.focus();
      key("Tab", { shiftKey: true });
    });
    expect(document.activeElement).toBe(btn("mid-s"));
  });

  it("P10 the trap is applied to the TOPMOST surface only", async () => {
    const a = vi.fn();
    const b = vi.fn();
    await render(
      <>
        <Surface open name="a" onClose={a} extra={<button type="button">a-2</button>} />
        <Surface open name="b" onClose={b} extra={<button type="button">b-2</button>} />
      </>
    );
    await act(async () => {
      btn("close-a").focus();
      key("Tab");
    });
    // activeElement is in surface `a`, but the trap runs against surface `b` (the topmost):
    // index === -1 there, so focus is pulled into `b`.
    // eslint-disable-next-line no-console
    console.log(`P10 after Tab from surface a -> activeElement = ${document.activeElement?.textContent}`);
    expect(document.activeElement).toBe(btn("close-b"));
  });

  // ------------------------------------------------------------------ FOCUSABLE-SET GAPS (F2)
  it("P11 tabindex=-1 on a BUTTON: is it (wrongly) in the trap cycle?", async () => {
    const close = vi.fn();
    await render(
      <Surface
        open
        name="s"
        onClose={close}
        extra={
          <>
            <button type="button" tabIndex={-1}>
              untabbable
            </button>
            <button type="button">last</button>
          </>
        }
      />
    );
    await act(async () => {
      btn("close-s").focus();
      key("Tab");
    });
    const landed = document.activeElement?.textContent?.trim();
    // eslint-disable-next-line no-console
    console.log(`P11 Tab from close-s landed on: ${landed}  (a real browser would skip 'untabbable')`);
    expect(["untabbable", "last"]).toContain(landed);
  });

  it("P12 a HIDDEN input and a display:none button: are they in the cycle?", async () => {
    const close = vi.fn();
    await render(
      <Surface
        open
        name="s"
        onClose={close}
        extra={
          <>
            <input type="hidden" name="csrf" />
            <button type="button" style={{ display: "none" }}>
              invisible
            </button>
            <button type="button">visible-last</button>
          </>
        }
      />
    );
    const container = document.querySelector<HTMLElement>('[data-surface="s"]')!;
    const SELECTOR =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const matched = [...container.querySelectorAll<HTMLElement>(SELECTOR)].map(
      (e) => `${e.nodeName}${(e as HTMLInputElement).type ? "[" + (e as HTMLInputElement).type + "]" : ""}:${e.textContent?.trim() ?? ""}`
    );
    // eslint-disable-next-line no-console
    console.log(`P12 pinned selector matches inside the surface: ${JSON.stringify(matched)}`);
    await act(async () => {
      btn("close-s").focus();
      key("Tab");
    });
    // eslint-disable-next-line no-console
    console.log(
      `P12 Tab from close-s -> activeElement = ${document.activeElement?.nodeName}/${document.activeElement?.getAttribute?.("type") ?? ""}/${document.activeElement?.textContent?.trim() ?? ""}`
    );
    expect(matched.length).toBeGreaterThan(0);
  });

  it("P13 an EMPTY surface (no focusables): Tab is not preventDefault'd, no throw", async () => {
    const close = vi.fn();
    function Empty({ onClose }: { onClose: () => void }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      useModalSurface(true, { containerRef, initialFocusRef, onClose });
      return (
        <div
          ref={(n) => {
            containerRef.current = n;
          }}
        />
      );
    }
    await render(<Empty onClose={close} />);
    let ev!: KeyboardEvent;
    await act(async () => {
      ev = key("Tab");
    });
    // eslint-disable-next-line no-console
    console.log(`P13 empty surface, Tab defaultPrevented = ${ev.defaultPrevented}`);
    expect(ev.defaultPrevented).toBe(false);
    await act(async () => {
      key("Escape");
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("P14 a NULL containerRef (surface renders null body): no throw, Escape still works", async () => {
    const close = vi.fn();
    function NoContainer({ onClose }: { onClose: () => void }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      useModalSurface(true, { containerRef, initialFocusRef, onClose });
      return null;
    }
    await render(<NoContainer onClose={close} />);
    await act(async () => {
      key("Tab");
    });
    await act(async () => {
      key("Escape");
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------- onClose FRESHNESS / RE-RENDER
  it("P15 a re-rendered consumer's FRESH onClose is the one invoked", async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Harness({ which }: { which: 1 | 2 }): ReactNode {
      return <Surface open name="s" onClose={which === 1 ? first : second} />;
    }
    await render(<Harness which={1} />);
    await render(<Harness which={2} />);
    await act(async () => {
      key("Escape");
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(0);
  });

  it("P16 openSurfaceCount reports depth 0/1/2/1/0 across a full open-close cycle", async () => {
    const seen: number[] = [openSurfaceCount()];
    function Harness({ n }: { n: 0 | 1 | 2 }): ReactNode {
      return (
        <>
          <Surface open={n >= 1} name="a" onClose={vi.fn()} />
          <Surface open={n >= 2} name="b" onClose={vi.fn()} />
        </>
      );
    }
    await render(<Harness n={0} />);
    seen.push(openSurfaceCount());
    await render(<Harness n={1} />);
    seen.push(openSurfaceCount());
    await render(<Harness n={2} />);
    seen.push(openSurfaceCount());
    await render(<Harness n={1} />);
    seen.push(openSurfaceCount());
    await render(<Harness n={0} />);
    seen.push(openSurfaceCount());
    expect(seen).toEqual([0, 0, 1, 2, 1, 0]);
  });

  // ----------------------------------------------------------------------- matchMedia (R24)
  it("P17 prefersReducedMotion: absent / matches:false / matches:true / throwing", () => {
    expect(typeof window.matchMedia).toBe("undefined");
    expect(prefersReducedMotion(), "absent matchMedia must not throw and must be false").toBe(false);

    vi.stubGlobal("matchMedia", () => ({ matches: false }) as MediaQueryList);
    expect(prefersReducedMotion()).toBe(false);

    const q: string[] = [];
    vi.stubGlobal("matchMedia", (query: string) => {
      q.push(query);
      return { matches: true } as MediaQueryList;
    });
    expect(prefersReducedMotion()).toBe(true);
    expect(q).toEqual(["(prefers-reduced-motion: reduce)"]);

    // A non-function value on window.matchMedia must also be tolerated.
    vi.stubGlobal("matchMedia", 42 as unknown as typeof window.matchMedia);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("P18 backdropCloseHandler: scrim / child / grandchild / null-target / null-scrim", () => {
    const scrim = document.createElement("div");
    const child = document.createElement("div");
    const grandchild = document.createElement("span");
    child.append(grandchild);
    scrim.append(child);
    document.body.append(scrim);
    const onClose = vi.fn();
    const h = backdropCloseHandler(scrim, onClose);
    h({ target: child });
    h({ target: grandchild });
    h({ target: null });
    expect(onClose, "only a click landing ON the scrim closes").toHaveBeenCalledTimes(0);
    h({ target: scrim });
    expect(onClose).toHaveBeenCalledTimes(1);

    const onClose2 = vi.fn();
    backdropCloseHandler(null, onClose2)({ target: null });
    expect(onClose2).toHaveBeenCalledTimes(0);
  });

  it("P19 a surface that unmounts WITHOUT its open flag flipping still pops the stack", async () => {
    const close = vi.fn();
    function Harness({ mounted }: { mounted: boolean }): ReactNode {
      return mounted ? <Surface open name="s" onClose={close} /> : <div />;
    }
    await render(<Harness mounted />);
    expect(openSurfaceCount()).toBe(1);
    await render(<Harness mounted={false} />);
    expect(openSurfaceCount(), "unmount must pop, or the listener leaks for the session").toBe(0);
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    key("Escape");
    expect(close, "a popped surface must not receive Escape").toHaveBeenCalledTimes(0);
    expect(onWindow, "the document listener must have been detached").toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", onWindow);
  });

  it("P20 state update inside onClose (the realistic consumer) closes exactly once", async () => {
    const opened: boolean[] = [];
    function Harness(): ReactNode {
      const [open, setOpen] = useState(true);
      opened.push(open);
      return <Surface open={open} name="s" onClose={() => setOpen(false)} />;
    }
    await render(<Harness />);
    expect(openSurfaceCount()).toBe(1);
    await act(async () => {
      key("Escape");
    });
    expect(openSurfaceCount()).toBe(0);
    expect(document.querySelector('[data-surface="s"]')).toBeNull();
  });
});
