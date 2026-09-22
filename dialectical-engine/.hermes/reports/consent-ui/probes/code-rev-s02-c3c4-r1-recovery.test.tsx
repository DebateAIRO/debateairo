// @vitest-environment jsdom

/**
 * CODE-REV-S02-C3C4 r1 — which recovery re-syncs React's input value tracker after a
 * cancelled click, so the finding's remedy is MEASURED rather than argued.
 * Run against the shipped component, not a stand-in.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../apps/ui/components/SignUpFlow.js";

let root: Root | null = null;
const field = (n: string) => document.querySelector<HTMLInputElement>(`input[name="${n}"]`)!;
const btn = () => document.querySelector<HTMLButtonElement>("button.authPrimary")!;
const row2 = () => [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")][1];

async function mount() {
  await act(async () =>
    root!.render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />)
  );
  await act(async () => { field("adult-affirmed").click(); }); // open half the gate
}

/** Cancel one click on the privacy box, exactly as an S02-C7 row handler must. */
async function cancelledClick() {
  const cancel = (e: Event) => e.preventDefault();
  row2().addEventListener("click", cancel);
  await act(async () => { field("privacy-accepted").click(); });
  row2().removeEventListener("click", cancel);
}

describe("recovery after a cancelled click on privacy-accepted", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const c = document.createElement("div");
    document.body.append(c);
    root = createRoot(c);
    await mount();
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("R0 — baseline: no recovery. The next genuine click ticks the DOM, the gate stays shut", async () => {
    await cancelledClick();
    await act(async () => { field("privacy-accepted").click(); });
    console.log(`R0: DOM=${field("privacy-accepted").checked} buttonDisabled=${btn().disabled}`);
    expect(field("privacy-accepted").checked).toBe(true);
    expect(btn().disabled, "R0 gate").toBe(true); // the defect
  });

  it("R1 — assigning .checked = false after the cancelled click re-syncs the tracker", async () => {
    await cancelledClick();
    field("privacy-accepted").checked = false;   // goes through React's instance setter
    await act(async () => { field("privacy-accepted").click(); });
    console.log(`R1: DOM=${field("privacy-accepted").checked} buttonDisabled=${btn().disabled}`);
    expect(field("privacy-accepted").checked).toBe(true);
    expect(btn().disabled, "R1 gate").toBe(false);
  });

  it("R2 — a .click() driven straight from an acknowledgement handler does NOT recover", async () => {
    await cancelledClick();
    // C7's "I have read it" ticking the box by synthesising a click
    await act(async () => { field("privacy-accepted").click(); });
    console.log(`R2: DOM=${field("privacy-accepted").checked} buttonDisabled=${btn().disabled}`);
    expect(btn().disabled, "R2 gate").toBe(true); // same defect as R0
  });

  it("R3 — the native prototype setter alone does NOT re-sync (it bypasses React's instance setter)", async () => {
    await cancelledClick();
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")!;
    desc.set!.call(field("privacy-accepted"), false);
    await act(async () => { field("privacy-accepted").click(); });
    console.log(`R3: DOM=${field("privacy-accepted").checked} buttonDisabled=${btn().disabled}`);
    expect(field("privacy-accepted").checked).toBe(true);
    expect(btn().disabled, "R3 gate").toBe(true);
  });
});
