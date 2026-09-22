// @vitest-environment jsdom

/**
 * CODE-REV-CROSS-03 r2 — MY OWN probe, built from the CLAIM, not from the author's suite.
 *
 * MODELS: whether an assertion about the `Tab` trap can DISCRIMINATE the containment tiebreak
 *   for two surfaces that SHARE one container node. Every reachable starting position is
 *   exercised (focus on each control, and focus outside the surface), forwards and backwards,
 *   and the landing element is printed. Run this file at HEAD and again with the identity term
 *   removed from `topmostSurface()`'s pass 2: if the two transcripts are byte-identical, no
 *   `Tab` assertion on a shared-container pair can pin the tiebreak.
 * DOES NOT MODEL: the NESTED pair (two DIFFERENT containers), where the candidate lists differ
 *   and `Tab` genuinely does discriminate — that shape is the shipped suite's
 *   `traps Tab in the same surface Escape reaches, for the same nested pair` case.
 *   It also does not model a real browser's sequential focus navigation (jsdom has none).
 *
 * The two surfaces are given DIFFERENT `initialFocusRef` targets on purpose, so that if
 * anything in the Tab path read the entry rather than the container, the transcripts would
 * diverge.
 */

import { act, useEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSurfaceCount, useModalSurface } from "@lane/modalSemantics";

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

function activeLabel(): string {
  const active = document.activeElement as HTMLElement | null;
  if (active === null) return "<null>";
  if (active === document.body) return "<body>";
  return active.textContent ?? `<${active.nodeName}>`;
}

function Surface({
  containerRef,
  name,
  into
}: {
  containerRef: { current: HTMLElement | null };
  name: string;
  into?: string[];
}): ReactNode {
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(true, { containerRef, initialFocusRef, onClose: () => undefined });
  useEffect(() => {
    into?.push(name);
  }, [into, name]);
  return <button ref={initialFocusRef as never}>{`close-${name}`}</button>;
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

describe("CODE-REV-CROSS-03 r2 — can a Tab assertion discriminate the tiebreak?", () => {
  it("T1 — shared container: the full Tab transcript from every starting position", async () => {
    const order: string[] = [];

    function SharedPair(): ReactNode {
      const sharedRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="shared" ref={sharedRef as never}>
          <Surface containerRef={sharedRef} name="first" into={order} />
          <Surface containerRef={sharedRef} name="second" into={order} />
        </div>
      );
    }

    await render(<SharedPair />);
    expect(openSurfaceCount()).toBe(2);
    expect(order, "registration (open) order").toEqual(["first", "second"]);

    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);

    const starts: Array<[string, () => void]> = [
      ["close-first", () => labelled("close-first").focus()],
      ["close-second", () => labelled("close-second").focus()],
      ["outside", () => outside.focus()],
      ["nothing", () => (document.activeElement as HTMLElement | null)?.blur()]
    ];

    const transcript: string[] = [];
    for (const [startName, start] of starts) {
      for (const shift of [false, true]) {
        await act(async () => {
          start();
          press("Tab", shift);
        });
        transcript.push(
          `start=${startName} shift=${String(shift)} -> ${activeLabel()}`
        );
      }
    }

    outside.remove();
    // eslint-disable-next-line no-console
    console.log("T1 TAB TRANSCRIPT (shared container)\n" + transcript.join("\n"));

    // The transcript is the evidence; this assertion only pins its SHAPE so the case cannot
    // silently stop producing one.
    expect(transcript).toHaveLength(8);
  });

  it("T2 CONTROL — a genuinely NESTED pair, where the candidate lists DIFFER", async () => {
    function Nested(): ReactNode {
      const outerRef = useRef<HTMLElement | null>(null);
      const innerRef = useRef<HTMLElement | null>(null);
      return (
        <div data-c="outer" ref={outerRef as never}>
          <Surface containerRef={outerRef} name="outer-1" />
          <Surface containerRef={outerRef} name="outer-2" />
          <div data-c="inner" ref={innerRef as never}>
            <Surface containerRef={innerRef} name="inner" />
          </div>
        </div>
      );
    }

    await render(<Nested />);
    expect(openSurfaceCount()).toBe(3);

    await act(async () => {
      labelled("close-inner").focus();
      press("Tab");
    });

    // eslint-disable-next-line no-console
    console.log(`T2 CONTROL nested: Tab from close-inner -> ${activeLabel()}`);
    expect(activeLabel()).toBe("close-inner");
  });
});
