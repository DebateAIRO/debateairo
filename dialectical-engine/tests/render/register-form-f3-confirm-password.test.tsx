// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { DISPLAYED_LEGAL_EN } from "../support/signupLegal.js";

let root: Root;
let host: HTMLDivElement;
const register = vi.fn();
const checkAge = vi.fn();

function field(name: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

function validity(): HTMLParagraphElement {
  return field("confirm-password").nextElementSibling as HTMLParagraphElement;
}

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

async function fillOtherFields(): Promise<void> {
  // First: its re-renders would reset the controlled fields assigned directly below.
  await fillAdultDateOfBirth();
  field("email").value = "person@example.test";
  field("confirm-email").value = "person@example.test";
  field("recovery-email").value = "recovery@example.test";
  for (const name of ["privacy-accepted", "terms-accepted"]) {
    field(name).checked = true;
  }
}

async function submit(scripted = true): Promise<void> {
  await act(async () => {
    const form = host.querySelector("form")!;
    if (scripted) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    else form.requestSubmit();
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  register.mockReset().mockResolvedValue({ message: "Check your inbox for verification instructions.", retry_after_seconds: 60 });
  checkAge.mockReset().mockResolvedValue({ outcome: "allowed" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<SignUpFlow client={{ register, checkAge }} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("register-form F3 confirm password", () => {
  // Property: an accessible, required password confirmation follows the rules and precedes consent.
  // Breaks: removing/renaming it, changing its type/autofill/label, dropping required, or moving the field.
  it("renders the required password confirmation directly after the rules and before consent", () => {
    const confirmation = field("confirm-password");
    expect(confirmation.id).toBe("signup-confirm-password");
    expect(confirmation.type).toBe("password");
    expect(confirmation.labels?.[0]?.textContent).toBe("Confirm password");
    expect(confirmation.required).toBe(true);
    expect(confirmation.autocomplete).toBe("new-password");
    expect(confirmation.parentElement!.className).toBe("authField");
    expect(validity().tagName).toBe("P");
    expect(validity().className).toBe("authValidity");
    // The age gate (Turn 8) puts the date-of-birth fieldset between this field and the consent
    // group, its inputs in en-GB's DMY order.
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[name]:not([type="checkbox"])'), (input) => input.name))
      .toEqual(["email", "confirm-email", "recovery-email", "password", "confirm-password", "dob-d", "dob-m", "dob-y"]);
    expect(host.querySelector(".authRules")!.parentElement!.nextElementSibling === confirmation.parentElement).toBe(true);
    const dateOfBirth = confirmation.parentElement!.nextElementSibling;
    expect(dateOfBirth?.className).toBe("authField");
    expect(dateOfBirth?.querySelector("fieldset")?.contains(field("dob-d"))).toBe(true);
    expect(dateOfBirth?.nextElementSibling?.className).toBe("consentGroup");
  });

  // Property: an empty confirmation is silent and cannot register, even if both passwords are empty.
  // Breaks: accepting empty equality, missing the guard, or showing feedback for an empty field.
  it.each(["", "Passw0rd!"])("keeps empty confirmation idle and refuses it with primary %j", async (primary) => {
    await fillOtherFields();
    field("password").value = primary;
    expect(validity().dataset.state).toBe("idle");
    expect(validity().textContent).toBe("");
    expect(field("confirm-password").checkValidity()).toBe(false);
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: nonempty mismatches show feedback and refuse both native and scripted submission.
  // Breaks: dropping the comparison or reversing/omitting its bad feedback.
  it.each([true, false])("refuses a mismatched password (scripted=%s)", async (scripted) => {
    await type("password", "Passw0rd!");
    await type("confirm-password", "Passw0rd");
    await fillOtherFields();
    expect(validity().dataset.state).toBe("bad");
    expect(validity().textContent).toBe("✗ The passwords do not match");
    expect(host.querySelector("form")!.checkValidity()).toBe(true);
    await submit(scripted);
    expect(register).not.toHaveBeenCalled();
  });

  // Property: only an empty confirmation is idle; all other unequal strings are bad,
  // preserving case, whitespace, and distinct Unicode sequences in feedback and at submit.
  // Breaks: trim-before-idle, empty-primary short-circuit, case-folding, or NFC normalization.
  it.each([
    ["Passw0rd!", "passw0rd!"],
    ["Passw0rd!", " Passw0rd! "],
    [" Passw0rd! ", "Passw0rd!"],
    ["Passw0rd!", "   "],
    ["", "x"],
    ["caf\u00e9!", "cafe\u0301!"]
  ])("requires an exact match for %j and %j", async (primary, confirmation) => {
    await type("password", primary);
    await type("confirm-password", confirmation);
    await fillOtherFields();
    expect(validity().dataset.state).toBe("bad");
    expect(validity().textContent).toBe("✗ The passwords do not match");
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: equal nonempty whitespace is a match, with the primary password sent unchanged.
  // Breaks: trimming before idle/comparison, or trimming the password argument.
  // The 4th argument is the ISO date of birth, not `true`: the age gate replaced the 18+ box (Turn 8).
  it("accepts a whitespace-only exact match and preserves all password spaces", async () => {
    await type("password", "   ");
    await type("confirm-password", "   ");
    await fillOtherFields();
    expect(validity().dataset.state).toBe("ok");
    expect(validity().textContent).toBe("✓ Passwords match");
    // A bare submit isolates the exact-match rule from the primary field's HTML minLength.
    await submit();
    expect(register.mock.calls).toEqual([[
      "person@example.test", "   ", "recovery@example.test", "1990-01-01", DISPLAYED_LEGAL_EN
    ]]);
  });

  // Property: a visible-route match shows success and sends exactly the four registration arguments and the displayed document pairs.
  // Breaks: refusing a match, altered ok feedback, or leaking confirmation as another argument.
  // The 4th argument is the ISO date of birth, not `true`: the age gate replaced the 18+ box (Turn 8).
  it("accepts a typed match on the native route with exactly the four registration arguments and the displayed document pairs", async () => {
    await type("password", "Passw0rd!");
    await type("confirm-password", "Passw0rd!");
    await fillOtherFields();
    expect(validity().dataset.state).toBe("ok");
    expect(validity().textContent).toBe("✓ Passwords match");
    await submit(false);
    expect(register.mock.calls).toEqual([[
      "person@example.test", "Passw0rd!", "recovery@example.test", "1990-01-01", DISPLAYED_LEGAL_EN
    ]]);
  });

  // Property: changing the primary revalidates the confirmation; clearing confirmation is silent.
  // Breaks: comparing stale primary state or retaining feedback after clearing.
  it("revalidates primary edits and returns to idle when confirmation clears", async () => {
    await type("password", "Passw0rd!");
    await type("confirm-password", "Passw0rd!");
    await type("password", "Changed7!");
    expect(validity().dataset.state).toBe("bad");
    await type("confirm-password", "");
    expect(validity().dataset.state).toBe("idle");
    expect(validity().textContent).toBe("");
  });

  // Property: either DOM operand can invalidate a previously matching React mirror at submit.
  // Breaks: reading password or confirmPassword state instead of FormData in the guard.
  it.each(["password", "confirm-password"])("refuses a DOM mismatch after only %s changes without an event", async (name) => {
    await type("password", "Passw0rd!");
    await type("confirm-password", "Passw0rd!");
    await fillOtherFields();
    field(name).value = "Changed7!";
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: matching FormData works with empty mirrors and preserves a password's whitespace.
  // Breaks: consulting mirror state or trimming the transmitted primary password.
  // The 4th argument is the ISO date of birth, not `true`: the age gate replaced the 18+ box (Turn 8).
  it("accepts matching FormData with empty mirrors and preserves the password bytes", async () => {
    await fillOtherFields();
    field("password").value = " Passw0rd! ";
    field("confirm-password").value = " Passw0rd! ";
    await submit();
    expect(register.mock.calls).toEqual([[
      "person@example.test", " Passw0rd! ", "recovery@example.test", "1990-01-01", DISPLAYED_LEGAL_EN
    ]]);
  });

  // Property: confirmation shares the primary's editable, busy, and sent states.
  // Breaks: always disabling it, omitting busy, or omitting sent.
  it("disables confirmation while busy and removes both fields after acknowledgement", async () => {
    let resolve!: (value: { message: string; retry_after_seconds: 60 }) => void;
    register.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    expect(field("confirm-password").disabled).toBe(false);
    await fillOtherFields();
    field("password").value = "Passw0rd!";
    field("confirm-password").value = "Passw0rd!";
    await submit();
    expect(field("password").disabled).toBe(true);
    expect(field("confirm-password").disabled).toBe(true);
    await act(async () => resolve({ message: "Check your inbox.", retry_after_seconds: 60 }));
    expect(host.querySelector('input[name="password"]')).toBeNull();
    expect(host.querySelector('input[name="confirm-password"]')).toBeNull();
  });

  // Property: a failed request restores confirmation editing along with the primary field.
  // Breaks: keeping confirmation disabled after busy ends without a successful submission.
  it("re-enables confirmation after registration fails", async () => {
    register.mockRejectedValueOnce(new Error("offline"));
    await fillOtherFields();
    field("password").value = "Passw0rd!";
    field("confirm-password").value = "Passw0rd!";
    await submit();
    expect(field("password").disabled).toBe(false);
    expect(field("confirm-password").disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Account creation could not be completed.");
  });
});
