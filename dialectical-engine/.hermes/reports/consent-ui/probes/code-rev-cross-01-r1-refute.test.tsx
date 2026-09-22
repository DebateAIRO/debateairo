// @vitest-environment jsdom
/**
 * CODE-REV-CROSS-01 r1 — REFUTATION probe. Default posture: try to break the claim.
 * Every case here is one I invented against the SPEC property, not one the author wrote.
 */
import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { useModalSurface } from "@/components/consent/modalSemantics";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  window.localStorage.clear();
});

async function render(node: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(node);
  });
}

const byText = (text: string): HTMLElement => {
  const hit = [...document.querySelectorAll<HTMLElement>("button")].find(
    (node) => node.textContent?.trim() === text
  );
  if (hit === undefined) throw new Error(`no button labelled ${text}`);
  return hit;
};
const card = (): HTMLElement | null => document.querySelector('[role="dialog"]');

async function click(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
async function pressEscape(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
}

/** A surface driven by the helper, with a caller-named return control. */
function Surface({
  namedRef,
  name = "s"
}: {
  namedRef?: React.RefObject<HTMLElement | null>;
  name?: string;
}): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(true, {
    containerRef,
    initialFocusRef,
    onClose: () => undefined,
    returnFocusRef: namedRef
  });
  return (
    <div
      data-surface={name}
      ref={(node) => {
        containerRef.current = node;
      }}
    >
      <button
        type="button"
        ref={(node) => {
          initialFocusRef.current = node;
        }}
      >
        inside-{name}
      </button>
    </div>
  );
}

describe("CROSS-01 refutation — reachable edges of the new precedence", () => {
  it("EDGE A: an opener that SURVIVES but refuses focus (disabled) swallows the return; the lent control never serves", async () => {
    // Concrete inputs: a caller lends `returnFocusRef`; the opener is still connected at
    // close but is `disabled`, so `focus()` is a no-op. `survived` is true, so the helper
    // returns early and the named control is never asked.
    function Harness({ open, off }: { open: boolean; off: boolean }): ReactNode {
      const namedRef = useRef<HTMLElement | null>(null);
      return (
        <>
          <button type="button" id="opener" disabled={off}>
            opener
          </button>
          <button
            type="button"
            ref={(node) => {
              namedRef.current = node;
            }}
          >
            named
          </button>
          {open ? <Surface namedRef={namedRef} /> : null}
        </>
      );
    }
    await render(<Harness open={false} off={false} />);
    const opener = document.querySelector<HTMLButtonElement>("#opener")!;
    await act(async () => {
      opener.focus();
    });
    expect(document.activeElement).toBe(opener);

    await render(<Harness open off={false} />);
    await render(<Harness open off />); // the opener is disabled while the surface is open
    expect(opener.isConnected, "still on the page").toBe(true);

    await render(<Harness open={false} off />);
    // eslint-disable-next-line no-console
    console.log(
      "EDGE A landing:",
      (document.activeElement as HTMLElement).tagName,
      (document.activeElement as HTMLElement).id || (document.activeElement as HTMLElement).textContent
    );
    expect(document.activeElement, "focus went nowhere — not to the lent control").toBe(
      document.body
    );
  });

  it("EDGE B: opener = document.documentElement is treated as SURVIVED (only body is excluded)", async () => {
    // `document.activeElement` can be the root element, not the body. The guard excludes
    // only `document.body`, so a root-element capture counts as a live opener.
    const named = document.createElement("button");
    document.body.appendChild(named);
    const spy = vi.spyOn(named, "focus");
    function Harness({ open }: { open: boolean }): ReactNode {
      const namedRef = useRef<HTMLElement | null>(named);
      return open ? <Surface namedRef={namedRef} /> : null;
    }
    // Force activeElement to the root element.
    document.documentElement.setAttribute("tabindex", "-1");
    await act(async () => {
      document.documentElement.focus();
    });
    // eslint-disable-next-line no-console
    console.log("EDGE B activeElement before open:", document.activeElement?.nodeName);
    await render(<Harness open />);
    await render(<Harness open={false} />);
    // eslint-disable-next-line no-console
    console.log(
      "EDGE B named.focus called:",
      spy.mock.calls.length,
      "activeElement:",
      document.activeElement?.nodeName
    );
    document.documentElement.removeAttribute("tabindex");
    named.remove();
    expect(true).toBe(true); // observation only — the assertion is the logged pair
  });

  it("EDGE C: the SECOND open through the same shared ref still returns focus", async () => {
    await render(<CookieConsent />);
    const first = byText("Choose what to store");
    await act(async () => {
      first.focus();
    });
    await click(first);
    await pressEscape();
    const second = byText("Choose what to store");
    expect(document.activeElement, "first round returned").toBe(second);

    await click(second);
    expect(card(), "second open").not.toBeNull();
    await pressEscape();
    const third = byText("Choose what to store");
    expect(third).not.toBe(second);
    expect(document.activeElement, "second round returned too").toBe(third);
  });

  it("EDGE D: policy over the card — Esc returns to `Privacy notice`, the next Esc to the fresh bar control", async () => {
    await render(<CookieConsent />);
    const opener = byText("Choose what to store");
    await act(async () => {
      opener.focus();
    });
    await click(opener);
    const notice = byText("Privacy notice");
    await act(async () => {
      notice.focus();
    });
    await click(notice);
    expect(document.querySelectorAll('[role="dialog"]').length, "two surfaces open").toBe(2);

    await pressEscape();
    expect(document.querySelectorAll('[role="dialog"]').length, "the policy closed").toBe(1);
    // eslint-disable-next-line no-console
    console.log(
      "EDGE D after first Esc:",
      (document.activeElement as HTMLElement)?.textContent?.trim()
    );

    await pressEscape();
    expect(card(), "the card closed").toBeNull();
    const returned = byText("Choose what to store");
    expect(document.activeElement, "and the bar's fresh control took the focus").toBe(returned);
  });

  it("EDGE E: a stale ref from a PREVIOUS bar cannot be used — the lent node is always the live one", async () => {
    await render(<CookieConsent />);
    const first = byText("Choose what to store");
    await act(async () => {
      first.focus();
    });
    await click(first);
    // While the card is open the bar is unmounted; React has detached the ref.
    expect(first.isConnected).toBe(false);
    await pressEscape();
    const returned = byText("Choose what to store");
    expect(returned.isConnected).toBe(true);
    expect(document.activeElement).toBe(returned);
    expect(document.activeElement).not.toBe(first);
  });

  it("EDGE F: a consumer that omits the member keeps the captured-opener behaviour byte-for-byte", async () => {
    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <button type="button" id="plain">
            plain-opener
          </button>
          {open ? <Surface /> : null}
        </>
      );
    }
    await render(<Harness open={false} />);
    const plain = document.querySelector<HTMLButtonElement>("#plain")!;
    await act(async () => {
      plain.focus();
    });
    await render(<Harness open />);
    expect(document.activeElement).toBe(byText("inside-s"));
    await render(<Harness open={false} />);
    expect(document.activeElement).toBe(plain);
  });

  it("EDGE G: the bar's control is reachable by keyboard after the return (it is a real focusable button)", async () => {
    await render(<CookieConsent />);
    const opener = byText("Choose what to store");
    await act(async () => {
      opener.focus();
    });
    await click(opener);
    await pressEscape();
    const returned = byText("Choose what to store");
    expect(returned.tagName).toBe("BUTTON");
    expect(returned.hasAttribute("disabled")).toBe(false);
    expect(returned.getAttribute("tabindex")).toBeNull();
    expect(document.activeElement).toBe(returned);
  });
});
