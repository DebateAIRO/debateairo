// @vitest-environment jsdom
/**
 * CODE-REV-CROSS-01 r1 — probe C. Tests ONE explicit claim made by the work:
 *
 *   ADR-0022 addendum: "a surface that omits the member behaves exactly as before"
 *   modalSemantics.ts JSDoc: "A surface that omits it keeps the captured-opener
 *   behaviour exactly"
 *
 * The new `opener !== document.body` term fires for EVERY surface, member or not.
 * This probe hunts for an omitting consumer whose landing differs from the base rule
 * `focusElement(opener)`. Run it against HEAD and against the reverted product.
 */
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useModalSurface } from "@/components/consent/modalSemantics";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
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
});

async function render(node: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(node);
  });
}

function Surface(): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  // NOTE: no `returnFocusRef` — this is the pre-V-22 consumer shape.
  useModalSurface(true, { containerRef, initialFocusRef, onClose: () => undefined });
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

describe("CROSS-01 probe C — an OMITTING consumer, opened with focus on the body", () => {
  it("leaves focus where it is at close, where the base rule blurred it onto the body", async () => {
    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <button type="button" id="elsewhere">
            elsewhere
          </button>
          {open ? <Surface /> : null}
        </>
      );
    }

    await render(<Harness open={false} />);
    expect(document.activeElement, "nothing focused: the capture will be the body").toBe(
      document.body
    );

    await render(<Harness open />);
    // While the surface is open, focus moves to a control OUTSIDE it (a click on a
    // still-reachable page control, a programmatic focus, an autofocusing widget).
    const elsewhere = document.querySelector<HTMLButtonElement>("#elsewhere")!;
    await act(async () => {
      elsewhere.focus();
    });
    expect(document.activeElement).toBe(elsewhere);

    await render(<Harness open={false} />);
    // eslint-disable-next-line no-console
    console.log(
      "PROBE C landing:",
      (document.activeElement as HTMLElement).id || (document.activeElement as HTMLElement).nodeName
    );
    // HEAD: `survived` is false (the capture was the body), no named control, so nothing
    // is focused and `elsewhere` keeps it.  BASE: focusElement(body) blurred it.
    expect(document.activeElement, "HEAD leaves focus on the outside control").toBe(elsewhere);
  });
});
