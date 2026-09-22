// @vitest-environment jsdom
/**
 * CODE-REV-CROSS-01 r1 — MY OWN probe, built from the CLAIM (V-22 / S01-R18), not from
 * the author's test. It mounts the REAL product component `CookieConsent` and drives the
 * three close routes the review packet names, plus the two entry directions.
 *
 * Nothing here imports a lane test file.
 */
import { act, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { CONSENT_KEY, requestPreferences } from "@/lib/consent";
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
const maybeByText = (text: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>("button")].find(
    (node) => node.textContent?.trim() === text
  ) ?? null;

const card = (): HTMLElement | null => document.querySelector('[role="dialog"]');
const bar = (): HTMLElement | null => document.querySelector(".consentBar");
const scrim = (): HTMLElement => {
  const node = document.querySelector<HTMLElement>(".consentScrim");
  if (node === null) throw new Error("no scrim");
  return node;
};

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

describe("CROSS-01 probe — the focus-return route through the real CookieConsent", () => {
  it("ROUTE 1 (Escape): focus lands on the FRESH bar's `Choose what to store`", async () => {
    await render(<CookieConsent />);
    expect(bar(), "nothing stored, so the bar shows").not.toBeNull();
    const opener = byText("Choose what to store");
    await act(async () => {
      opener.focus();
    });
    expect(document.activeElement).toBe(opener);

    await click(opener);
    expect(card(), "the card opened").not.toBeNull();
    expect(opener.isConnected, "the opening commit removed the bar").toBe(false);
    expect(document.activeElement, "the capture at open would have been the body").not.toBe(opener);

    await pressEscape();

    expect(card(), "the card is gone").toBeNull();
    expect(bar(), "the bar is back").not.toBeNull();
    const returned = byText("Choose what to store");
    expect(returned, "and it is a FRESH node").not.toBe(opener);
    expect(document.activeElement, "focus is on the returned bar's own control").toBe(returned);
  });

  it("ROUTE 2 (scrim click): same landing", async () => {
    await render(<CookieConsent />);
    const opener = byText("Choose what to store");
    await act(async () => {
      opener.focus();
    });
    await click(opener);
    expect(card()).not.toBeNull();

    await act(async () => {
      scrim().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(card(), "the backdrop closed it").toBeNull();
    const returned = byText("Choose what to store");
    expect(returned).not.toBe(opener);
    expect(document.activeElement).toBe(returned);
  });

  it("ROUTE 3: the card has NO dismiss control — the footer is exactly three buttons", async () => {
    // The review packet asks for a close "by the dismiss control". S01-R18 gives 10b no
    // close glyph, so this route DOES NOT EXIST; recorded as a measurement, not skipped.
    await render(<CookieConsent />);
    await click(byText("Choose what to store"));
    const footer = document.querySelector<HTMLElement>(".consentCardFooter");
    const labels = [...footer!.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Privacy notice", "Essential only", "Save choices"]);
    expect(maybeByText("×"), "no close glyph").toBeNull();
  });

  it("ROUTE 4 (a deciding footer control): the bar does not return, so focus goes nowhere", async () => {
    await render(<CookieConsent />);
    const opener = byText("Choose what to store");
    await act(async () => {
      opener.focus();
    });
    await click(opener);
    await click(byText("Essential only"));
    expect(card(), "settled").toBeNull();
    expect(bar(), "a decision is stored, so no bar returns").toBeNull();
    expect(document.activeElement, "nothing to return to").toBe(document.body);
    expect(window.localStorage.getItem(CONSENT_KEY)).not.toBeNull();
  });

  it("SETTINGS direction, NOTHING stored: the still-mounted opener keeps the focus", async () => {
    function Page(): ReactNode {
      const [, force] = useState(0);
      const settingsRef = useRef<HTMLButtonElement | null>(null);
      return (
        <>
          <button
            type="button"
            ref={settingsRef}
            onClick={() => {
              requestPreferences(settingsRef.current);
              force((n) => n + 1);
            }}
          >
            Cookie preferences
          </button>
          <CookieConsent />
        </>
      );
    }
    await render(<Page />);
    const settings = byText("Cookie preferences");
    await act(async () => {
      settings.focus();
    });
    expect(bar(), "nothing stored, so the bar is showing too").not.toBeNull();

    await click(settings);
    expect(card(), "the card opened from Settings").not.toBeNull();
    expect(settings.isConnected, "the Settings opener survived the open").toBe(true);

    await pressEscape();

    expect(card()).toBeNull();
    expect(bar(), "R14: nothing valid stored, so the bar returns underneath").not.toBeNull();
    expect(
      document.activeElement,
      "the surviving Settings opener keeps the return, NOT the bar's control"
    ).toBe(settings);
  });

  it("SETTINGS direction, a VALID decision stored: opener keeps the focus, no bar returns", async () => {
    window.localStorage.setItem(
      CONSENT_KEY,
      // EXACTLY the five members isDecision() accepts — a sixth key makes it invalid.
      JSON.stringify({
        v: 1,
        essential: true,
        quality: true,
        analytics: false,
        decidedAt: new Date().toISOString()
      })
    );
    function Page(): ReactNode {
      const [, force] = useState(0);
      const settingsRef = useRef<HTMLButtonElement | null>(null);
      return (
        <>
          <button
            type="button"
            ref={settingsRef}
            onClick={() => {
              requestPreferences(settingsRef.current);
              force((n) => n + 1);
            }}
          >
            Cookie preferences
          </button>
          <CookieConsent />
        </>
      );
    }
    await render(<Page />);
    const settings = byText("Cookie preferences");
    await act(async () => {
      settings.focus();
    });
    expect(bar(), "a valid decision is stored, so no bar").toBeNull();

    await click(settings);
    expect(card()).not.toBeNull();

    await pressEscape();

    expect(card()).toBeNull();
    expect(bar()).toBeNull();
    expect(document.activeElement, "focus is back on Cookie preferences").toBe(settings);
  });
});

describe("CROSS-01 probe — the TIMING CHAIN, ordered explicitly", () => {
  it("the fresh control's ref is ATTACHED before the closing surface's cleanup calls focus", async () => {
    const events: string[] = [];
    let seq = 0;

    function Surface({ namedRef }: { namedRef: React.RefObject<HTMLElement | null> }): ReactNode {
      const containerRef = useRef<HTMLElement | null>(null);
      const initialFocusRef = useRef<HTMLElement | null>(null);
      useModalSurface(true, {
        containerRef,
        initialFocusRef,
        onClose: () => undefined,
        returnFocusRef: namedRef
      });
      useEffect(() => () => events.push(`${++seq}:surface-passive-cleanup-of-consumer`), []);
      return (
        <div
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
            inside
          </button>
        </div>
      );
    }

    function Harness({ open }: { open: boolean }): ReactNode {
      const namedRef = useRef<HTMLElement | null>(null);
      return open ? (
        <Surface namedRef={namedRef} />
      ) : (
        <button
          type="button"
          id={`opener-${open ? "x" : "y"}`}
          ref={(node) => {
            if (node === null) {
              events.push(`${++seq}:ref-DETACH`);
              namedRef.current = null;
              return;
            }
            events.push(`${++seq}:ref-ATTACH`);
            const original = node.focus.bind(node);
            node.focus = () => {
              events.push(`${++seq}:focus-CALLED-on-named`);
              original();
            };
            namedRef.current = node;
          }}
        >
          opener
        </button>
      );
    }

    await render(<Harness open={false} />);
    const first = byText("opener");
    await act(async () => {
      first.focus();
    });
    events.length = 0;
    seq = 0;

    await render(<Harness open />);
    const afterOpen = [...events];
    events.length = 0;
    seq = 0;

    await render(<Harness open={false} />);
    const afterClose = [...events];

    // eslint-disable-next-line no-console
    console.log("TIMING afterOpen:", JSON.stringify(afterOpen));
    // eslint-disable-next-line no-console
    console.log("TIMING afterClose:", JSON.stringify(afterClose));

    const attach = afterClose.findIndex((e) => e.endsWith("ref-ATTACH"));
    const focused = afterClose.findIndex((e) => e.endsWith("focus-CALLED-on-named"));
    expect(attach, "the fresh control's ref was attached").toBeGreaterThanOrEqual(0);
    expect(focused, "the helper asked the named control for focus").toBeGreaterThanOrEqual(0);
    expect(attach, "ATTACH strictly precedes the cleanup's focus call").toBeLessThan(focused);
    expect(document.activeElement).toBe(byText("opener"));
  });
});
