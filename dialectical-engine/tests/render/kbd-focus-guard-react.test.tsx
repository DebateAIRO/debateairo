// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalSurface } from "../../apps/ui/components/consent/modalSemantics";
import { FOCUS_PARKED_ATTRIBUTE } from "../../apps/ui/lib/focusGuard";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026. The focus guard under React's own timing, on the three shapes the audit found on almost
 * every screen: a button switched off for its own request, a step swapped under the pressed button, and a dialog opened
 * from a button that is switched off while the dialog is up.
 */

let root: Root | null = null;
let stop: () => void = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.append(main);
  root = createRoot(main);
  stop = startFocusGuard();
});

afterEach(() => {
  stop();
  if (root !== null) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** `disabled={busy}` around a request that fails: the shape of every "Continue", "Save" and "Revoke" on the site. */
function BusyButton({ request }: { request: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const press = async (): Promise<void> => {
    setBusy(true);
    try {
      await request();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section id="card">
      {failed ? <p role="alert">It did not work.</p> : null}
      <button id="save" type="button" disabled={busy} onClick={() => void press()}>
        Save
      </button>
    </section>
  );
}

/** A two-step screen: the press swaps the step, and the pressed button goes with it. */
function Steps() {
  const [step, setStep] = useState<"ask" | "sent">("ask");
  return (
    <section id="card">
      {step === "ask" ? (
        <button id="send" type="button" onClick={() => setStep("sent")}>
          Send link
        </button>
      ) : (
        <p id="sent">Sent.</p>
      )}
      <a id="help" href="/help">
        Help
      </a>
    </section>
  );
}

/** A dialog asked over the page by a button that is switched off for as long as the dialog is up. */
function Asks() {
  const [asking, setAsking] = useState(false);
  const dialog = useRef<HTMLDivElement | null>(null);
  const back = useRef<HTMLButtonElement | null>(null);
  useModalSurface(asking, { containerRef: dialog, initialFocusRef: back, onClose: () => setAsking(false) });
  return (
    <section id="card">
      <button id="start" type="button" disabled={asking} onClick={() => setAsking(true)}>
        Start
      </button>
      {asking ? (
        <div role="dialog" aria-modal="true" ref={dialog}>
          <button id="back" type="button" ref={back} onClick={() => setAsking(false)}>
            Back
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** A real modal surface (the site's shared helper traps Tab in it) whose list loses the pressed row. */
function ListDialog() {
  const box = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState(["a", "b", "c"]);
  useModalSurface(true, { containerRef: box, initialFocusRef: box, onClose: () => undefined });
  return (
    <div role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
      <button id="close" type="button">Close</button>
      <section id="list">
        {rows.map((row) => (
          <button key={row} id={row} type="button" onClick={() => setRows((all) => all.filter((other) => other !== row))}>
            Remove {row}
          </button>
        ))}
      </section>
      <button id="done" type="button">Done</button>
    </div>
  );
}

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const tabFrom = (el: Element, shiftKey = false): KeyboardEvent => {
  const tab = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(tab);
  });
  return tab;
};

describe("the focus guard under React", () => {
  it("a button switched off for its own failed request has focus again when the request ends", async () => {
    let fail: () => void = () => undefined;
    const request = (): Promise<void> => new Promise((_resolve, reject) => (fail = () => reject(new Error("no"))));
    act(() => root!.render(<BusyButton request={request} />));
    pressByKeyboard(byId("save"));
    await guardSettled();
    expect(byId<HTMLButtonElement>("save").disabled).toBe(true);
    expect(document.activeElement, "while it is off, nothing holds focus").toBe(document.body);
    await act(async () => {
      fail();
      await Promise.resolve();
    });
    await guardSettled();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(byId("save"));
  });

  it("a button that goes with its step leaves focus on the card it was in, and Tab carries on from there", async () => {
    act(() => root!.render(<Steps />));
    pressByKeyboard(byId("send"));
    await guardSettled();
    const card = byId("card");
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      card.dispatchEvent(tab);
    });
    expect(document.activeElement, "Tab goes to the control after the place the button was").toBe(byId("help"));
    expect(tab.defaultPrevented).toBe(true);
    await guardSettled();
    expect(card.hasAttribute("tabindex"), "the card is left as React drew it").toBe(false);
  });

  it("in a modal surface, Tab after a row went goes to the row after it: the surface's own trap does not send it back", async () => {
    act(() => root!.render(<ListDialog />));
    pressByKeyboard(byId("b"));
    await guardSettled();
    expect(document.activeElement).toBe(byId("list"));
    const tab = tabFrom(byId("list"));
    expect(document.activeElement).toBe(byId("c"));
    expect(tab.defaultPrevented).toBe(true);
  });

  it("in a modal surface, Tab after the last control went goes round to the first, and the trap still works after", async () => {
    act(() => root!.render(<ListDialog />));
    pressByKeyboard(byId("c"));
    await guardSettled();
    tabFrom(document.activeElement!);
    expect(document.activeElement).toBe(byId("done"));
    tabFrom(byId("done"));
    expect(document.activeElement, "from a real control the trap goes round as it always did").toBe(byId("close"));
  });

  it("a dialog opened from a button that is off while it is up gives focus back to that button on Back", async () => {
    act(() => root!.render(<Asks />));
    pressByKeyboard(byId("start"));
    await guardSettled();
    expect(document.activeElement).toBe(byId("back"));
    pressByKeyboard(byId("back"));
    await guardSettled();
    expect(document.activeElement).toBe(byId("start"));
  });
});
