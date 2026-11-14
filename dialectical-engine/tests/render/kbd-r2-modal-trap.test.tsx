// @vitest-environment jsdom

import { act, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSurfaceCount, useModalSurface } from "../../apps/ui/components/consent/modalSemantics";
import { FOCUS_PARKED_ATTRIBUTE } from "../../apps/ui/lib/focusGuard";

/*
 * Keyboard audit, 12 Nov 2026: three rules added to the one shared modal helper.
 *  - Tab from a focused part that is not a control (a section a jump link moved focus to) carries on from that part.
 *  - Escape that only cancels an IME candidate does not close the surface.
 *  - An opener that cannot take focus back (hidden by then, or only a place the focus guard parked on) falls back to
 *    the named control.
 */

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function Surface({ open, onClose, named }: { open: boolean; onClose: () => void; named?: RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useModalSurface(open, { containerRef: dialog, initialFocusRef: dialog, onClose, returnFocusRef: named });
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} ref={dialog}>
      <button id="close" type="button">Close</button>
      <a id="pill" href="#two">Jump</a>
      <section id="one" tabIndex={-1}>
        <a id="link-one" href="/one">One</a>
      </section>
      <section id="two" tabIndex={-1}>
        <p>Text only.</p>
      </section>
      <section id="three" tabIndex={-1}>
        <a id="link-three" href="/three">Three</a>
      </section>
      <button id="done" type="button">Done</button>
    </div>
  );
}

function Page({ open, onClose, withNamed = false }: { open: boolean; onClose: () => void; withNamed?: boolean }) {
  const named = useRef<HTMLButtonElement | null>(null);
  return (
    <main>
      <section id="card">
        <button id="opener" type="button">Open</button>
        <button id="named" type="button" ref={named}>Named</button>
      </section>
      <Surface open={open} onClose={onClose} named={withNamed ? named : undefined} />
    </main>
  );
}

const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const tab = (shiftKey = false): void =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));
  });

describe("Tab inside a modal surface, from a focused part that is not a control", () => {
  it("goes to the next control after that part, not back to the first one", () => {
    act(() => root!.render(<Page open onClose={() => undefined} />));
    act(() => byId("two").focus());
    tab();
    expect(document.activeElement).toBe(byId("link-three"));
  });

  it("goes backwards to the control before that part", () => {
    act(() => root!.render(<Page open onClose={() => undefined} />));
    act(() => byId("two").focus());
    tab(true);
    expect(document.activeElement).toBe(byId("link-one"));
  });

  it("enters a part that holds a control at that control", () => {
    act(() => root!.render(<Page open onClose={() => undefined} />));
    act(() => byId("three").focus());
    tab();
    expect(document.activeElement).toBe(byId("link-three"));
  });

  it("still starts at the first control, and backwards at the last, from the surface itself", () => {
    act(() => root!.render(<Page open onClose={() => undefined} />));
    expect(document.activeElement, "the surface took focus on opening").toBe(document.querySelector('[role="dialog"]'));
    tab();
    expect(document.activeElement).toBe(byId("close"));
    act(() => (document.querySelector('[role="dialog"]') as HTMLElement).focus());
    tab(true);
    expect(document.activeElement).toBe(byId("done"));
  });

  it("still wraps at the ends", () => {
    act(() => root!.render(<Page open onClose={() => undefined} />));
    act(() => byId("done").focus());
    tab();
    expect(document.activeElement).toBe(byId("close"));
    tab(true);
    expect(document.activeElement).toBe(byId("done"));
  });
});

describe("Escape during IME composition", () => {
  it("is left to the text field: the surface stays open", () => {
    const onClose = vi.fn();
    act(() => root!.render(<Page open onClose={onClose} />));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 229, bubbles: true, cancelable: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(openSurfaceCount()).toBe(1);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("giving focus back when the surface closes", () => {
  it("uses the named control when the opener will not take focus any more", () => {
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    const opener = byId("opener");
    act(() => opener.focus());
    act(() => root!.render(<Page open onClose={() => undefined} withNamed />));
    // Hidden by the time the surface closes: a browser's focus() on it does nothing.
    opener.focus = () => undefined;
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    expect(document.activeElement).toBe(byId("named"));
  });

  it("does not count a place the focus guard parked on as the opener", () => {
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    const card = byId("card");
    card.setAttribute("tabindex", "-1");
    card.setAttribute(FOCUS_PARKED_ATTRIBUTE, "added");
    act(() => card.focus());
    act(() => root!.render(<Page open onClose={() => undefined} withNamed />));
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    expect(document.activeElement).toBe(byId("named"));
  });

  it("still returns to an opener that survived, even when a named control was lent", () => {
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    act(() => byId("opener").focus());
    act(() => root!.render(<Page open onClose={() => undefined} withNamed />));
    act(() => root!.render(<Page open={false} onClose={() => undefined} withNamed />));
    expect(document.activeElement).toBe(byId("opener"));
  });
});
