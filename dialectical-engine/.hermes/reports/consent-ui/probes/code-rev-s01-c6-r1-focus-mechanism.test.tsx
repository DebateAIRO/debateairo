// @vitest-environment jsdom

/**
 * REVIEWER PROBE — CODE-REV-S01-C6 round 1.
 *
 * Charge: rule on C6-F1's MECHANISM ("is it the effect timing, or the unmount —
 * would `useLayoutEffect` see the opener?") and on remedy (a)'s FEASIBILITY
 * ("at the moment the card's passive cleanup runs, is a ref to the NEW bar
 * button already attached?").
 *
 * Both are answered with a synthetic fixture that reproduces the shipped
 * topology — a parent that swaps a focusable OPENER for a modal in ONE commit —
 * without importing any consent component, so the answer is a fact about React
 * and jsdom rather than about the author's code. The shipped behaviour is then
 * confirmed against the real components.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  host = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Probe = {
  layoutSaw: string;
  layoutSawBody: boolean;
  passiveSawBody: boolean;
  renderSawBody: boolean;
  cleanupOpenerRefTag: string;
  cleanupOpenerRefConnected: boolean;
  cleanupOpenerRefIsFreshNode: boolean;
};

describe("REVIEWER PROBE — C6-F1 mechanism and remedy (a) feasibility", () => {
  it("MEASURES: neither useLayoutEffect nor useEffect can see the opener — the unmount is the cause", () => {
    const probe: Probe = {
      layoutSaw: "",
      layoutSawBody: false,
      passiveSawBody: false,
      renderSawBody: false,
      cleanupOpenerRefTag: "",
      cleanupOpenerRefConnected: false,
      cleanupOpenerRefIsFreshNode: false
    };
    // The ref a hypothetical fourth `ModalSurface` member (`returnFocusRef`)
    // would carry: owned by the PARENT, attached by the returning opener.
    const openerRef: { current: HTMLElement | null } = { current: null };
    let firstOpenerNode: HTMLElement | null = null;

    function Opener({ onOpen }: { onOpen: () => void }) {
      return (
        <button
          type="button"
          ref={(node) => {
            openerRef.current = node;
            if (node !== null && firstOpenerNode === null) firstOpenerNode = node;
          }}
          onClick={onOpen}
        >
          Choose what to store
        </button>
      );
    }

    function Modal({ onClose }: { onClose: () => void }) {
      // The render phase runs BEFORE the mutation phase: the opener is still in
      // the document here. This is the only place a hook could still see it.
      probe.renderSawBody = document.activeElement === document.body;
      React.useLayoutEffect(() => {
        const active = document.activeElement as HTMLElement | null;
        probe.layoutSaw = active === null ? "<null>" : active.tagName;
        probe.layoutSawBody = active === document.body;
      }, []);
      React.useEffect(() => {
        probe.passiveSawBody = document.activeElement === document.body;
        return () => {
          // Passive CLEANUP of the unmounting modal, in the same commit that
          // remounts the opener. This is exactly where the helper calls
          // `focusElement(opener)`.
          const node = openerRef.current;
          probe.cleanupOpenerRefTag = node === null ? "<null>" : node.tagName;
          probe.cleanupOpenerRefConnected = node !== null && node.isConnected;
          probe.cleanupOpenerRefIsFreshNode = node !== null && node !== firstOpenerNode;
        };
      }, []);
      return (
        <button type="button" onClick={onClose}>
          close
        </button>
      );
    }

    function Machine() {
      const [open, setOpen] = React.useState(false);
      // Mutually exclusive, exactly like S01-R14's bar/card.
      return open ? <Modal onClose={() => setOpen(false)} /> : <Opener onOpen={() => setOpen(true)} />;
    }

    act(() => root!.render(<Machine />));
    const opener = host!.querySelector("button")!;
    act(() => opener.focus());
    expect(document.activeElement, "the opener holds focus before the click").toBe(opener);

    act(() => opener.click());

    // --- ANSWER 1: is it effect timing, or the unmount? ---
    expect(probe.renderSawBody, "during RENDER the opener still held focus").toBe(false);
    expect(probe.layoutSawBody, "by the LAYOUT phase focus is already on body").toBe(true);
    expect(probe.layoutSaw, "useLayoutEffect sees BODY, not the opener").toBe("BODY");
    expect(probe.passiveSawBody, "and useEffect sees body too").toBe(true);
    expect(opener.isConnected, "because the opener left the document in the mutation phase").toBe(
      false
    );

    // --- ANSWER 2: is the NEW opener's ref attached at passive-cleanup time? ---
    act(() => host!.querySelector("button")!.click());
    expect(probe.cleanupOpenerRefTag, "a ref IS attached when the modal's passive cleanup runs").toBe(
      "BUTTON"
    );
    expect(probe.cleanupOpenerRefConnected, "and it is in the document").toBe(true);
    expect(probe.cleanupOpenerRefIsFreshNode, "and it is the FRESH node, not the detached one").toBe(
      true
    );
  });

  it("CONFIRMS the same two facts against the shipped components", () => {
    act(() => root!.render(<CookieConsent />));
    const opener = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Choose what to store"
    )!;
    act(() => {
      opener.focus();
      opener.click();
    });
    expect(opener.isConnected, "the bar that owned the opener is gone").toBe(false);

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      )
    );

    const returned = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Choose what to store"
    )!;
    expect(returned, "the bar returns as a FRESH node").not.toBe(opener);
    expect(document.activeElement, "and focus is on body — R18's bar direction UNMET").toBe(
      document.body
    );
    // The Settings direction, where the opener is never unmounted, is the control.
    expect(returned.isConnected).toBe(true);
  });
});
