// @vitest-environment jsdom
// CODE-REV-S02-C1C2 r2 — probe W2.
// W1 found ONE element that the pinned selector admits, `isFocusCandidate` keeps, and jsdom's
// focus() refuses: a control inside `<fieldset disabled>`.  That makes the N1 "advance past a
// refused focus target" remedy PINNABLE in this harness, contradicting the author's F3.
// This probe is the pin: GREEN against the shipped module, RED against the no-advance-loop
// mutant (MN1c).  Run it both ways — see .review-scratch/advance-loop-discriminates.sh.
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalSurface } from "../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Surface({ children }: { children?: ReactNode }): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(true, { containerRef, initialFocusRef, onClose: () => {} });
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
        close
      </button>
      {children}
    </div>
  );
}

function labelled(text: string): HTMLElement {
  const hit = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text
  );
  expect(hit, `missing ${text}`).toBeDefined();
  return hit as HTMLElement;
}

async function render(el: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(el);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function pressTab(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
  );
}

describe("W2 — the advance loop IS pinnable in jsdom", () => {
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
  });

  it("W2 Tab skips a control inside <fieldset disabled> and lands on the next real one", async () => {
    await render(
      <Surface>
        <fieldset disabled>
          <button type="button">locked</button>
        </fieldset>
        <button type="button">next-real</button>
      </Surface>
    );

    await act(async () => {
      labelled("close").focus();
      pressTab();
    });

    console.log(
      `W2 Tab from close -> activeElement = ${document.activeElement?.textContent?.trim()}`
    );
    expect(document.activeElement).toBe(labelled("next-real"));
  });
});
