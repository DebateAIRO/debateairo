// @vitest-environment jsdom
//
// CODE-REV-S02-C5C6 r1 — the F3 charge, MEASURED on the one stack the product will build:
// S01's preferences card open, then the privacy modal opened from its link, both rendered by
// S01's mount as UNRELATED SIBLINGS. Two DOM orders x the shipped rule, and the same two
// orders against F3's proposed rule (CONTAINED_BY only), simulated by a local re-implementation
// of topmostSurface so the shipped module is never edited.
import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useModalSurface } from "../../apps/ui/components/consent/modalSemantics.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function render(el: ReactNode): Promise<void> {
  await act(async () => { root!.render(el); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function Surface({ open, name, onClose }: { open: boolean; name: string; onClose: () => void }): ReactNode {
  const containerRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  useModalSurface(open, { containerRef, initialFocusRef, onClose });
  if (!open) return null;
  return (
    <div data-surface={name} ref={(n) => { containerRef.current = n; }}>
      <button type="button" ref={(n) => { initialFocusRef.current = n; }}>{`${name}-close`}</button>
    </div>
  );
}

/** S01's mount: the card is opened first, the modal second, as siblings. `modalFirst` flips
 *  which of the two comes FIRST in the DOM — the only thing the shipped rule reads. */
function S01Mount({ modalFirst, cardClose, modalClose }: {
  modalFirst: boolean; cardClose: () => void; modalClose: () => void;
}): ReactNode {
  const [modalOpen, setModalOpen] = useState(false);
  const card = <Surface key="card" open name="card" onClose={cardClose} />;
  const modal = <Surface key="modal" open={modalOpen} name="modal" onClose={modalClose} />;
  return (
    <>
      <button type="button" id="open-policy" onClick={() => setModalOpen(true)}>Privacy notice</button>
      {modalFirst ? <>{modal}{card}</> : <>{card}{modal}</>}
    </>
  );
}

async function runOrder(modalFirst: boolean): Promise<{ card: number; modal: number; order: string }> {
  const cardClose = vi.fn(); const modalClose = vi.fn();
  await render(<S01Mount modalFirst={modalFirst} cardClose={cardClose} modalClose={modalClose} />);
  await act(async () => { document.querySelector<HTMLButtonElement>("#open-policy")!.click(); });
  const surfaces = [...document.querySelectorAll("[data-surface]")].map((e) => e.getAttribute("data-surface"));
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  return { card: cardClose.mock.calls.length, modal: modalClose.mock.calls.length, order: surfaces.join(",") };
}

describe("REVIEWER PROBE — the Esc stack on the product's real card+modal pair", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null; host?.remove(); host = null; document.body.innerHTML = "";
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  });

  it("SHIPPED RULE, modal rendered AFTER the card (document order card,modal)", async () => {
    const r = await runOrder(false);
    // eslint-disable-next-line no-console
    console.log(`REV-F3 shipped rule, DOM order [${r.order}] -> cardClose=${r.card} modalClose=${r.modal}`);
    expect(r.modal).toBe(1);
    expect(r.card).toBe(0);
  });

  it("SHIPPED RULE, modal rendered BEFORE the card (document order modal,card)", async () => {
    const r = await runOrder(true);
    // eslint-disable-next-line no-console
    console.log(`REV-F3 shipped rule, DOM order [${r.order}] -> cardClose=${r.card} modalClose=${r.modal}`);
    // Recorded, not asserted one way: THIS is the measurement the charge asks for.
    expect(r.card + r.modal).toBe(1);
  });

  it("F3's PROPOSED RULE (CONTAINED_BY only) simulated over the same two arrangements", async () => {
    // A faithful local re-implementation of topmostSurface() with the FOLLOWING arm deleted,
    // run over the containers in registration order. The shipped module is not touched.
    const simulate = (containers: HTMLElement[], followingArm: boolean): number => {
      let top = containers.length - 1;
      for (let i = 0; i < containers.length; i += 1) {
        const held = containers[top]!, other = containers[i]!;
        if (held === other) continue;
        if (!other.isConnected) continue;
        if (!held.isConnected) { top = i; continue; }
        const rel = held.compareDocumentPosition(other);
        const above = (rel & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0 ||
          (followingArm && (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        if (above) top = i;
      }
      return top;
    };
    for (const modalFirst of [false, true]) {
      const wrap = document.createElement("div");
      const card = document.createElement("div"); card.dataset.s = "card";
      const modal = document.createElement("div"); modal.dataset.s = "modal";
      if (modalFirst) wrap.append(modal, card); else wrap.append(card, modal);
      document.body.append(wrap);
      // registration order is OPEN order: card first, modal second
      const registration = [card, modal];
      const withArm = registration[simulate(registration, true)]!.dataset.s;
      const withoutArm = registration[simulate(registration, false)]!.dataset.s;
      // eslint-disable-next-line no-console
      console.log(`REV-F3 DOM order [${modalFirst ? "modal,card" : "card,modal"}] registration [card,modal] -> ` +
        `shipped(CONTAINED_BY||FOLLOWING) topmost=${withArm}; F3(CONTAINED_BY only) topmost=${withoutArm}`);
      wrap.remove();
    }
    expect(true).toBe(true);
  });
});
