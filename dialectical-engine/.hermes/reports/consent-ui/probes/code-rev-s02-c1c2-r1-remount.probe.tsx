// @vitest-environment jsdom
//
// CODE-REV-S02-C1C2 r1 — probe 3. REACHABILITY of the stack-order defect through the shape
// S01 actually builds: the preferences card opens the policy modal as a CHILD (S01 SPEC
// §States: "Card (either) | `Privacy notice` | Policy modal (`mode=\"read\"`) over the card").
// The sequential open is correct (probe 1, P2). The question this probe answers is whether
// anything puts the two surfaces back on the stack in ONE commit after that.

import { act, useRef, useState, type ReactNode } from "react";
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
      >{`close-${name}`}</button>
      {children}
    </div>
  );
}

describe("REV probe 3 — reachability of the inverted stack", () => {
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

  it("R1 the S01 shape: card open, modal opened FROM it, THEN the subtree is re-keyed", async () => {
    const cardClose = vi.fn();
    const modalClose = vi.fn();
    function App({ modalOpen, k }: { modalOpen: boolean; k: string }): ReactNode {
      return (
        <div key={k}>
          <Surface open name="card" onClose={cardClose}>
            <Surface open={modalOpen} name="modal" onClose={modalClose} />
          </Surface>
        </div>
      );
    }
    // 1. card opens
    await render(<App modalOpen={false} k="v1" />);
    // 2. the visitor clicks `Privacy notice`: the modal opens in its OWN commit
    await render(<App modalOpen k="v1" />);
    expect(openSurfaceCount()).toBe(2);
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`R1a sequential open -> card=${cardClose.mock.calls.length} modal=${modalClose.mock.calls.length} (want card=0 modal=1)`);
    expect(modalClose).toHaveBeenCalledTimes(1);
    expect(cardClose).toHaveBeenCalledTimes(0);

    // 3. anything that REMOUNTS the subtree while both are open — a key change, a Fast Refresh
    //    in the dev stack, a parent that re-mounts on a locale/theme swap.
    cardClose.mockClear();
    modalClose.mockClear();
    await render(<App modalOpen k="v2" />);
    expect(openSurfaceCount(), "no leak across the remount").toBe(2);
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`R1b AFTER a remount  -> card=${cardClose.mock.calls.length} modal=${modalClose.mock.calls.length} (SPEC wants card=0 modal=1)`);
    expect(cardClose.mock.calls.length + modalClose.mock.calls.length).toBe(1);
  });

  it("R2 what the VISITOR sees when the stack is inverted", async () => {
    function App(): ReactNode {
      const [cardOpen, setCardOpen] = useState(true);
      const [modalOpen, setModalOpen] = useState(true); // both open in ONE commit
      return (
        <Surface open={cardOpen} name="card" onClose={() => setCardOpen(false)}>
          <Surface open={modalOpen} name="modal" onClose={() => setModalOpen(false)} />
        </Surface>
      );
    }
    await render(<App />);
    expect(openSurfaceCount()).toBe(2);
    await act(async () => esc());
    const cardStill = document.querySelector('[data-surface="card"]') !== null;
    const modalStill = document.querySelector('[data-surface="modal"]') !== null;
    // eslint-disable-next-line no-console
    console.log(
      `R2 after ONE Escape: card in document = ${cardStill}, modal in document = ${modalStill}, depth = ${openSurfaceCount()}`
    );
    // S01 SPEC R20/§A11y: "one Esc must not throw the visitor two surfaces" — assert the
    // OBSERVED shape rather than the wanted one, so this probe records the defect.
    expect(cardStill || modalStill).toBe(true);
  });

  it("R3 a PORTAL-style consumer (modal a sibling in the DOM but a React child) — measured", async () => {
    // Many modal implementations render into a portal. The stack order follows the REACT tree,
    // not the DOM tree, so a portalled child is still a React child.
    const cardClose = vi.fn();
    const modalClose = vi.fn();
    await render(
      <Surface open name="card" onClose={cardClose}>
        <Surface open name="modal" onClose={modalClose} />
      </Surface>
    );
    await act(async () => esc());
    // eslint-disable-next-line no-console
    console.log(`R3 react-child (same commit) -> card=${cardClose.mock.calls.length} modal=${modalClose.mock.calls.length}`);
    expect(cardClose.mock.calls.length + modalClose.mock.calls.length).toBe(1);
  });
});
