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
  if (input === null) throw new Error(`missing rendered input ${name}`);
  return input;
}

function validity(): HTMLParagraphElement {
  const sibling = field("confirm-email").nextElementSibling;
  expect(sibling?.matches("p.authValidity")).toBe(true);
  return sibling as HTMLParagraphElement;
}

async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillOtherFields(): void {
  field("email").value = "you@institution.edu";
  field("recovery-email").value = "recovery@example.test";
  field("password").value = "Correct horse 7!";
  field("confirm-password").value = "Correct horse 7!";
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

describe("register form F2 confirm email", () => {
  // Property: the second address is a required, labelled email field in the specified position.
  // Breaks: missing/wrong attributes, label association, classes, or moving it below recovery.
  it("renders the required confirmation directly between primary and recovery email", () => {
    const confirmation = field("confirm-email");
    expect(confirmation.id).toBe("signup-confirm-email");
    expect(confirmation.type).toBe("email");
    expect(confirmation.labels?.[0]?.textContent).toBe("Confirm email");
    expect(confirmation.required).toBe(true);
    expect(confirmation.autocomplete).toBe("off");
    expect(confirmation.parentElement!.className).toBe("authField");
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[name]:not([type="checkbox"])'), (input) => input.name))
      .toEqual(["email", "confirm-email", "recovery-email", "password", "confirm-password"]);
  });

  // Property: empty confirmation has no feedback and cannot pass either submit route.
  // Breaks: treating two empty values as a match, non-idle feedback, or removing required/guard.
  it("keeps empty confirmation idle and refuses an empty scripted submission", async () => {
    fillOtherFields();
    field("email").value = "";
    expect(validity().dataset.state).toBe("idle");
    expect(validity().textContent).toBe("");
    expect(field("confirm-email").checkValidity()).toBe(false);
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: mismatch reports the specified feedback and refuses both native and bare submits.
  // Breaks: dropping the comparison guard or reversing/omitting bad feedback.
  it.each([true, false])("refuses a mismatched address (scripted=%s)", async (scripted) => {
    await type("email", "you@institution.edu");
    await type("confirm-email", "you@institutio.edu");
    fillOtherFields();
    expect(validity().dataset.state).toBe("bad");
    expect(validity().textContent).toBe("✗ The addresses do not match");
    expect(host.querySelector("form")!.checkValidity()).toBe(true);
    await submit(scripted);
    expect(register).not.toHaveBeenCalled();
  });

  // Property: matching is trimmed and case-insensitive, and confirmation is absent from the API call.
  // Breaks: exact matching, altered success feedback, or adding/replacing a register argument.
  it("accepts a typed case-folded match and sends exactly the original four arguments", async () => {
    await type("email", "you@institution.edu");
    await type("confirm-email", "You@Institution.edu ");
    fillOtherFields();
    expect(validity().dataset.state).toBe("ok");
    expect(validity().textContent).toBe("✓ Addresses match");
    await submit();
    expect(register.mock.calls).toEqual([[
      "you@institution.edu", "Correct horse 7!", "recovery@example.test", true
    ]]);
  });

  // Property: changing the primary address re-evaluates the confirmation immediately.
  // Breaks: comparing with stale primary state or only updating validity on confirmation edits.
  it("revalidates when primary email changes and returns to idle when confirmation clears", async () => {
    await type("email", "you@institution.edu");
    await type("confirm-email", "you@institution.edu");
    await type("email", "another@institution.edu");
    expect(validity().dataset.state).toBe("bad");
    await type("confirm-email", "");
    expect(validity().dataset.state).toBe("idle");
    expect(validity().textContent).toBe("");
  });

  // Property: FormData, including both addresses, is authoritative even when React mirrors match.
  // Breaks: checking the mirror instead of the form on either side of the comparison.
  it.each(["email", "confirm-email"])("refuses a DOM mismatch after only %s changes without an event", async (name) => {
    await type("email", "you@institution.edu");
    await type("confirm-email", "you@institution.edu");
    fillOtherFields();
    field(name).value = "changed@institution.edu";
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: the FormData comparison trims and folds both operands, independently of mirrors.
  // Breaks: missing either trim/case-fold or refusing a form because its mirrors are empty.
  it("accepts trimmed FormData values while the React mirrors are empty", async () => {
    fillOtherFields();
    // NBSP survives native email ASCII-whitespace sanitization and exercises String.trim itself.
    field("email").value = "\u00a0YOU@institution.edu\u00a0";
    field("confirm-email").value = "\u00a0you@INSTITUTION.edu\u00a0";
    await submit();
    expect(register.mock.calls).toEqual([[
      "YOU@institution.edu", "Correct horse 7!", "recovery@example.test", true
    ]]);
  });

  // Property: whitespace-only confirmation is empty, not a valid match to an empty primary.
  // Breaks: treating trimmed empty values as a match in either feedback or the guard.
  it("keeps whitespace-only confirmation idle and refuses it", async () => {
    await type("confirm-email", "\u00a0");
    fillOtherFields();
    field("email").value = "";
    expect(validity().dataset.state).toBe("idle");
    expect(validity().textContent).toBe("");
    await submit();
    expect(register).not.toHaveBeenCalled();
  });

  // Property: confirmation shares primary email disabling at idle, during the request and after success.
  // Breaks: always disabling it, omitting busy, or omitting sent.
  it("disables confirmation with its sibling while busy and after success", async () => {
    let resolve!: (value: { message: string }) => void;
    register.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    expect(field("confirm-email").disabled).toBe(false);
    fillOtherFields();
    field("confirm-email").value = "you@institution.edu";
    await submit();
    expect(field("email").disabled).toBe(true);
    expect(field("confirm-email").disabled).toBe(true);
    await act(async () => resolve({ message: "Check your inbox." }));
    expect(field("email").disabled).toBe(true);
    expect(field("confirm-email").disabled).toBe(true);
  });

  // Property: a rejected registration returns confirmation to an editable state.
  // Breaks: retaining a disabled confirmation after busy ends without a sent state.
  it("re-enables confirmation after registration fails", async () => {
    register.mockRejectedValueOnce(new Error("offline"));
    fillOtherFields();
    field("confirm-email").value = "you@institution.edu";
    await submit();
    expect(field("email").disabled).toBe(false);
    expect(field("confirm-email").disabled).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Account creation could not be completed.");
  });
});
