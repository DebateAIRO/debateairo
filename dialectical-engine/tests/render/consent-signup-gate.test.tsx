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
import { pickRegion } from "../support/signupRegion.js";

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

/** Type into a controlled text input the way React sees it (prototype setter + `input`). */
async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/* Age gate replaced the 18+ box (Turn 8): an adult date of birth, entered as typed. */
async function fillAdultDateOfBirth(): Promise<void> {
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
}

async function mount(): Promise<void> {
  /* A fresh fake per mount (mount runs in beforeEach), so `checkAge` is reset like `register`. */
  const client = {
    register: vi.fn(),
    checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" })
  };
  await act(async () =>
    root!.render(<SignUpFlow client={client} />)
  );
}

describe("create-account gate on both consent boxes", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await mount();
    await pickRegion("RO");
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

  /* S02-S26 — R17 case 2. Rewritten: the age gate replaced the 18+ box (Turn 8), so the
     button's gate is privacy + terms only, and a valid date of birth does not stand in for it. */
  it("keeps Create account disabled with only a valid adult date of birth filled", async () => {
    await fillAdultDateOfBirth();

    expect(document.querySelector('input[name="adult-affirmed"]'), "the 18+ box is gone").toBeNull();
    expect(field("dob-y").value).toBe("1990");
    expect(createAccountButton().disabled).toBe(true);
  });

  /* S02-S27 — R17 case 3. The untouched-sibling check moved from the 18+ box (replaced by the
     age gate, Turn 8) to the terms box. */
  it("keeps Create account disabled with only the privacy box ticked", async () => {
    await act(async () => { field("privacy-accepted").click(); });
    const acknowledgement = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "I have read it");
    expect(acknowledgement).toBeDefined();
    await act(async () => { acknowledgement!.click(); });

    expect(field("privacy-accepted").checked).toBe(true);
    expect(field("terms-accepted").checked).toBe(false);
    expect(createAccountButton().disabled).toBe(true);
  });

  /* S02-S30 — R17 case 6: the pin that goes RED if a seat makes the inputs
     controlled. The click on the OTHER box is what forces a React re-render;
     the surviving `.checked` is the discriminating assertion. The assigned box is now the
     terms box: the age gate replaced the 18+ box (Turn 8). */
  it("keeps an assigned box ticked across a re-render and the button disabled", async () => {
    field("terms-accepted").checked = true;

    await act(async () => { field("privacy-accepted").click(); });

    expect(createAccountButton().disabled).toBe(true);
    expect(field("terms-accepted").checked).toBe(true);
  });
});
