// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

let root: Root;
let host: HTMLDivElement;
const register = vi.fn();

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

function fillOtherFields(): void {
  field("email").value = "person@example.test";
  field("confirm-email").value = "person@example.test";
  field("recovery-email").value = "recovery@example.test";
  for (const name of ["adult-affirmed", "privacy-accepted", "terms-accepted"]) {
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
  register.mockReset().mockResolvedValue({ message: "Check your inbox for verification instructions." });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<SignUpFlow client={{ register }} />));
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
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[name]:not([type="checkbox"])'), (input) => input.name))
      .toEqual(["email", "confirm-email", "recovery-email", "password", "confirm-password"]);
    expect(host.querySelector(".authRules")!.parentElement!.nextElementSibling === confirmation.parentElement).toBe(true);
    expect(confirmation.parentElement!.nextElementSibling?.className).toBe("consentGroup");
  });

  // Property: an empty confirmation is silent and cannot register, even if both passwords are empty.
  // Breaks: accepting empty equality, missing the guard, or showing feedback for an empty field.
  it.each(["", "Passw0rd!"])("keeps empty confirmation idle and refuses it with primary %j", async (primary) => {
    fillOtherFields();
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
    fillOtherFields();
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
    fillOtherFields();
    expect(validity().dataset.state).toBe("bad");
    expect(validity().textContent).toBe("✗ The passwords do not match");
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: equal nonempty whitespace is a match, with the primary password sent unchanged.
  // Breaks: trimming before idle/comparison, or trimming the password argument.
  it("accepts a whitespace-only exact match and preserves all password spaces", async () => {
    await type("password", "   ");
    await type("confirm-password", "   ");
    fillOtherFields();
    expect(validity().dataset.state).toBe("ok");
    expect(validity().textContent).toBe("✓ Passwords match");
    // A bare submit isolates the exact-match rule from the primary field's HTML minLength.
    await submit();
    expect(register.mock.calls).toEqual([[
      "person@example.test", "   ", "recovery@example.test", true
    ]]);
  });

  // Property: a visible-route match shows success and sends exactly the original four arguments.
  // Breaks: refusing a match, altered ok feedback, or leaking confirmation as another argument.
  it("accepts a typed match on the native route with exactly the original four arguments", async () => {
    await type("password", "Passw0rd!");
    await type("confirm-password", "Passw0rd!");
    fillOtherFields();
    expect(validity().dataset.state).toBe("ok");
    expect(validity().textContent).toBe("✓ Passwords match");
    await submit(false);
    expect(register.mock.calls).toEqual([[
      "person@example.test", "Passw0rd!", "recovery@example.test", true
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
    fillOtherFields();
    field(name).value = "Changed7!";
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: matching FormData works with empty mirrors and preserves a password's whitespace.
  // Breaks: consulting mirror state or trimming the transmitted primary password.
  it("accepts matching FormData with empty mirrors and preserves the password bytes", async () => {
    fillOtherFields();
    field("password").value = " Passw0rd! ";
    field("confirm-password").value = " Passw0rd! ";
    await submit();
    expect(register.mock.calls).toEqual([[
      "person@example.test", " Passw0rd! ", "recovery@example.test", true
    ]]);
  });

  // Property: confirmation shares the primary's editable, busy, and sent states.
  // Breaks: always disabling it, omitting busy, or omitting sent.
  it("disables confirmation with its sibling while busy and after success", async () => {
    let resolve!: (value: { message: string }) => void;
    register.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    expect(field("confirm-password").disabled).toBe(false);
    fillOtherFields();
    field("password").value = "Passw0rd!";
    field("confirm-password").value = "Passw0rd!";
    await submit();
    expect(field("password").disabled).toBe(true);
    expect(field("confirm-password").disabled).toBe(true);
    await act(async () => resolve({ message: "Check your inbox." }));
    expect(field("password").disabled).toBe(true);
    expect(field("confirm-password").disabled).toBe(true);
  });

  // Property: a failed request restores confirmation editing along with the primary field.
  // Breaks: keeping confirmation disabled after busy ends without a successful submission.
  it("re-enables confirmation after registration fails", async () => {
    register.mockRejectedValueOnce(new Error("offline"));
    fillOtherFields();
    field("password").value = "Passw0rd!";
    field("confirm-password").value = "Passw0rd!";
    await submit();
    expect(field("password").disabled).toBe(false);
    expect(field("confirm-password").disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Account creation could not be completed.");
  });
});
