// @vitest-environment jsdom

/**
 * S02-C4 — the create-account gate: R17's onChange mirror and the button's
 * `disabled`, computed from both mirrors.
 *
 * Steps pinned here: S02-S25 (case 1), S02-S26 (case 2), S02-S27 (case 3),
 * S02-S30 (case 6). R17's cases 4 and 5 are NOT here: both expect the button
 * ENABLED, and after S02-C7 the modal's acknowledgement is the only route that
 * ticks `privacy-accepted`, so they live in `consent-signup-modal.test.tsx`
 * (PLAN §Cluster S02-C7; ARCH-REV-S02-r2 B3; V-DECISIONS V-18).
 *
 * THE ONE IDIOM for every assertion about the BUTTON is
 * `field(name).click()` wrapped in `await act(async () => { … })`.
 * `field(x).checked = true` fires no React change event and can never move this
 * button; `dispatchEvent(new Event("change"|"click", …))` are measured dead
 * (SPEC.md R17 hook; probe b2-idiom-matrix.mjs). `.click()` TOGGLES.
 *
 * Every case here expects `disabled === true`, and each is invariant under C7:
 * at this stage a click on the privacy box toggles it natively, after C7 it opens
 * the modal instead — both routes leave the box unticked, so the expectation holds.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

let root: Root | null = null;

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

function createAccountButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("button.authPrimary");
  expect(button, "missing the Create account button").not.toBeNull();
  return button!;
}

async function mount(): Promise<void> {
  await act(async () =>
    root!.render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />)
  );
}

describe("create-account gate on both consent boxes", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await mount();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  /* S02-S25 — R17 case 1. */
  it("keeps Create account disabled with neither box ticked", () => {
    expect(createAccountButton().disabled).toBe(true);
  });

  /* S02-S26 — R17 case 2. */
  it("keeps Create account disabled with only the 18+ box ticked", async () => {
    await act(async () => { field("adult-affirmed").click(); });

    expect(field("adult-affirmed").checked).toBe(true);
    expect(createAccountButton().disabled).toBe(true);
  });

  /* S02-S27 — R17 case 3. */
  it("keeps Create account disabled with only the privacy box ticked", async () => {
    await act(async () => { field("privacy-accepted").click(); });

    expect(field("adult-affirmed").checked).toBe(false);
    expect(createAccountButton().disabled).toBe(true);
  });

  /* S02-S30 — R17 case 6: the pin that goes RED if a seat makes the inputs
     controlled. The click on the OTHER box is what forces a React re-render;
     the surviving `.checked` is the discriminating assertion. */
  it("keeps an assigned box ticked across a re-render and the button disabled", async () => {
    field("adult-affirmed").checked = true;

    await act(async () => { field("privacy-accepted").click(); });

    expect(createAccountButton().disabled).toBe(true);
    expect(field("adult-affirmed").checked).toBe(true);
  });
});
