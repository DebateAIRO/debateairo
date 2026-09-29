// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import authEnglish from "../../apps/ui/messages/en/auth.json";

let host: HTMLDivElement;
let root: Root;
const checkAge = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  checkAge.mockReset().mockResolvedValue({ outcome: "allowed" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function field(name: string): HTMLInputElement {
  return host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}

async function mount(message = "Check your inbox for verification instructions.") {
  const register = vi.fn().mockResolvedValue({
    message
  });
  await act(async () => root.render(<SignUpFlow client={{ register, checkAge }} />));
  return register;
}

/* Age gate replaced the 18+ box (Turn 8). The date of birth is React state, not FormData, so it
   is typed the way React sees it: the prototype value setter plus an `input` event. */
async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function fillAdultDateOfBirth(): Promise<void> {
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
}

async function submitValidForm() {
  // First: its re-renders would reset the controlled fields assigned directly below.
  await fillAdultDateOfBirth();
  // Email inputs strip ASCII padding before FormData; NBSP survives and exercises trim().
  field("email").value = "\u00a0Person@Example.test\u00a0";
  field("confirm-email").value = "\u00a0Person@Example.test\u00a0";
  field("recovery-email").value = "\u00a0Recovery@Example.test\u00a0";
  field("password").value = " Correct horse 7! ";
  field("confirm-password").value = " Correct horse 7! ";
  field("privacy-accepted").checked = true;
  field("terms-accepted").checked = true;
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true
    }));
  });
}

describe("register form F1", () => {
  it.each([false, true])("has no verification button on the page or button in the email field (submitted=%s)", async (submitted) => {
    await mount();
    if (submitted) await submitValidForm();
    expect(field("email").closest(".authField")!.querySelectorAll("button").length).toBe(0);
    expect(document.querySelector("button.authVerifyEmail")).toBeNull();
  });

  it.each([false, true])("has no verification affordance text in buttons or the email field (submitted=%s)", async (submitted) => {
    await mount();
    if (submitted) await submitValidForm();
    expect(document.body.textContent).not.toContain("Verify email");
    expect(field("email").closest(".authField")!.textContent).not.toMatch(/verif/i);
    // Instructions and the returned status legitimately mention verification.
    for (const button of host.querySelectorAll("form button")) {
      expect(button.textContent).not.toMatch(/verif/i);
    }
  });

  // The 4th argument is the ISO date of birth, not `true`: the age gate replaced the 18+ box (Turn 8).
  it("submits the four registration arguments unchanged", async () => {
    const register = await mount();
    await submitValidForm();
    expect(register).toHaveBeenCalledWith(
      "Person@Example.test",
      " Correct horse 7! ",
      "Recovery@Example.test",
      "1990-01-01"
    );
  });

  // Port adaptation: the localized form renders the catalogue's registrationSent copy in the
  // status (the server's English `message` is not shown), so the pin is on that catalogue value.
  it("renders the verification instructions in the status", async () => {
    await mount();
    await submitValidForm();
    expect(authEnglish["auth.signUp.registrationSent"]).toBe(
      "If this address can be registered, verification instructions will arrive. Check your spam folder."
    );
    expect(host.querySelector('[role="status"]')?.textContent)
      .toContain(authEnglish["auth.signUp.registrationSent"]);
  });
});
