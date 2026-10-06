// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async()=>{const {useEffect}=await import("react");return {TurnstileChallenge:({onToken}:{onToken:(token:string)=>void})=>{useEffect(()=>onToken("test-proof"),[onToken]);return null;}};});

/**
 * S02-C3 — the sign-up consent checkbox group (design artboard 8a).
 *
 * Steps pinned here: S02-S17 (structure), S02-S18 (byte-exact copy),
 * S02-S19 (form semantics), S02-S20 (accessible names). S02-S21 and S02-S70 pinned the
 * 18+ row, which the age gate (Turn 8) replaced with the date-of-birth field, so the group
 * now holds two rows: privacy, then terms.
 *
 * This file deliberately asserts NOTHING about the privacy row's click behaviour
 * (cluster S02-C7) and NOTHING about the submit button's `disabled` state
 * (cluster S02-C4) — an assertion about either would be one a later cluster rewrites.
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { pickRegion } from "../support/signupRegion.js";

/** Copy — byte-exact from SPEC.md §Copy / turn-8a-checkbox-group.html:4,8. */
const PRIVACY_ROW_TEXT = "I have read the Privacy Policy.";
const TERMS_ROW_TEXT = "I have read and agree to the Terms of Service.";
const POLICY_CONTROL_TEXT = "Privacy Policy";
const TERMS_CONTROL_TEXT = "Terms of Service";

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

function rows(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")];
}

/* `groupField` served only the 18+ cases (S02-S21/S02-S70), deleted when the age gate
   replaced the 18+ box (Turn 8). */

/** Type into a controlled text input the way React sees it (prototype setter + `input`). */
async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/* Age gate replaced the 18+ box (Turn 8): an adult date of birth, typed the way React sees it. */
async function fillAdultDateOfBirth(): Promise<void> {
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
}

async function mount(client?: {
  register: ReturnType<typeof vi.fn>;
  checkAge: ReturnType<typeof vi.fn>;
}): Promise<void> {
  /* A fresh fake per mount, so `checkAge` is reset exactly like `register`. */
  const stub = client ?? {
    register: vi.fn(),
    checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" })
  };
  await act(async () => root!.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={stub} />));
}

/** Drive the card into its `sent` state the way a real registration does. */
async function registerSuccessfully(): Promise<void> {
  const register = vi.fn().mockResolvedValue({ message: "sent", retry_after_seconds: 60 });
  const checkAge = vi.fn().mockResolvedValue({ outcome: "allowed" });
  await mount({ register, checkAge });
  // First: its re-renders would reset the controlled fields assigned directly below.
  await fillAdultDateOfBirth();
  await pickRegion("RO");
  field("email").value = "person@example.test";
  field("phone").value = "+40712345678";
  field("password").value = "Correct horse 7!";
  field("privacy-accepted").checked = true;
  field("terms-accepted").checked = true;
  const form = document.querySelector<HTMLFormElement>("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
  expect(register).toHaveBeenCalledTimes(1);
  expect(register.mock.calls[0]![0].date_of_birth, "the date of birth, not an 18+ flag").toBe("1990-01-01");
}

describe("sign-up consent checkbox group", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  /* S02-S17 — structure. Rewritten: two rows, privacy first; the age gate replaced the 18+
     row with the date-of-birth field outside the group (Turn 8). */
  it("renders one bordered group holding exactly two rows, one input in each, privacy first", async () => {
    await mount();

    const groups = document.querySelectorAll(".consentGroup");
    expect(groups).toHaveLength(1);

    const consentRows = rows();
    expect(consentRows).toHaveLength(2);
    expect(document.querySelector('input[name="adult-affirmed"]'), "the 18+ box is gone").toBeNull();
    expect(groups[0]!.querySelector("fieldset"), "the date of birth is not a consent row").toBeNull();

    const privacy = field("privacy-accepted");
    const terms = field("terms-accepted");
    expect(consentRows[0].contains(privacy)).toBe(true);
    expect(consentRows[1].contains(terms)).toBe(true);
    expect(consentRows[0].contains(terms)).toBe(false);
    expect(consentRows[1].contains(privacy)).toBe(false);
    for (const row of consentRows) expect(row.querySelectorAll("input")).toHaveLength(1);
    expect(privacy.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /* S02-S18 — copy is byte-exact. Two sentences now: the age gate replaced the 18+ row (Turn 8). */
  it("carries the two sentences and the two document controls verbatim", async () => {
    await mount();

    const consentRows = rows();
    expect(consentRows[0].textContent?.trim()).toBe(PRIVACY_ROW_TEXT);
    expect(consentRows[1].textContent?.trim()).toBe(TERMS_ROW_TEXT);

    const termsControl = consentRows[1].querySelector(".consentPolicyLink");
    expect(termsControl, "missing the Terms of Service control").not.toBeNull();
    expect(termsControl!.textContent).toBe(TERMS_CONTROL_TEXT);
    expect(termsControl!.getAttribute("type"), "Terms of Service control type").toBe("button");

    const control = consentRows[0].querySelector(".consentPolicyLink");
    expect(control, "missing the Privacy Policy control").not.toBeNull();
    expect(control!.textContent).toBe(POLICY_CONTROL_TEXT);
    /* The control sits INSIDE the sign-up form, so its `type` is what stops an
       activation from submitting the registration. Asserted as the ATTRIBUTE:
       jsdom performs no form submission from a button activation, so a
       behavioural pin here would be green against a submit button too. */
    expect(control!.getAttribute("type"), "Privacy Policy control type").toBe("button");
  });

  /* S02-S19 — form semantics. Two boxes now: the age gate replaced the 18+ box (Turn 8). */
  it("keeps required consent controls in the form and removes them after acknowledgement", async () => {
    await mount();

    for (const name of ["privacy-accepted", "terms-accepted"]) {
      const input = field(name);
      expect(input.type, `${name} type`).toBe("checkbox");
      expect(input.required, `${name} required`).toBe(true);
      expect(input.disabled, `${name} disabled at idle`).toBe(false);
    }
    expect(document.querySelectorAll("form")).toHaveLength(1);

    await registerSuccessfully();

    expect(document.querySelector('input[name="privacy-accepted"]')).toBeNull();
    expect(document.querySelector('input[name="terms-accepted"]')).toBeNull();
    expect(document.querySelectorAll("form")).toHaveLength(0);
  });

  /* S02-S20 — both accessible names resolve through aria-labelledby. The 18+ box's <label>
     arm is gone: the age gate replaced the 18+ box (Turn 8). */
  it("gives each input its own sentence as an accessible name", async () => {
    await mount();

    const labelledBy = field("privacy-accepted").getAttribute("aria-labelledby");
    expect(labelledBy, "privacy-accepted has no aria-labelledby").not.toBeNull();
    const named = document.getElementById(labelledBy!);
    expect(named, `aria-labelledby="${labelledBy}" names no element`).not.toBeNull();
    expect(named!.textContent?.trim()).toBe(PRIVACY_ROW_TEXT);

    const termsLabelledBy = field("terms-accepted").getAttribute("aria-labelledby");
    expect(termsLabelledBy, "terms-accepted has no aria-labelledby").not.toBeNull();
    const termsNamed = document.getElementById(termsLabelledBy!);
    expect(termsNamed, `aria-labelledby="${termsLabelledBy}" names no element`).not.toBeNull();
    expect(termsNamed!.textContent?.trim()).toBe(TERMS_ROW_TEXT);
  });

  /* S02-S21 (the 18+ row toggles from its input, its text and the row, opening no dialog) and
     S02-S70 (the 18+ input is focusable and activation toggles it) are DELETED: the age gate
     replaced the 18+ box (Turn 8), and no row that plain-toggles remains — both remaining rows
     open their document, pinned in consent-signup-modal / consent-signup-terms. */
});
