// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../web/components/SignUpFlow.js";

const REGISTRATION_MESSAGE =
  "If this address can be registered, verification instructions will arrive. Check your spam folder.";
const RESEND_MESSAGE =
  "If this address is awaiting verification, new instructions will arrive. Check your spam folder.";

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

async function submit(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button, `missing rendered button ${label}`).toBeDefined();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await settle();
}

describe("duplicate web sign-up route", () => {
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

  it("raw-renders one query-free POST form with distinct email autofill sections", () => {
    const html = renderToStaticMarkup(
      <SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const forms = parsed.querySelectorAll("form");
    expect(forms).toHaveLength(1);
    expect(forms[0]!.getAttribute("method")).toBe("post");
    expect(forms[0]!.getAttribute("action")).toBe("/sign-up");
    expect(forms[0]!.getAttribute("action")).not.toContain("?");
    expect(parsed.querySelector('input[name="email"]')?.getAttribute("autocomplete"))
      .toBe("section-primary-email email");
    expect(parsed.querySelector('input[name="recovery-email"]')?.getAttribute("autocomplete"))
      .toBe("section-recovery-email email");
  });

  it("uses the exact registration payload and only resends to the submitted address", async () => {
    const register = vi.fn().mockResolvedValue({ message: REGISTRATION_MESSAGE });
    const resendVerification = vi.fn().mockResolvedValue({ message: RESEND_MESSAGE });
    await act(async () => root!.render(<SignUpFlow client={{ register, resendVerification }} />));

    field("email").value = " person@example.test ";
    field("recovery-email").value = " recovery@example.test ";
    field("password").value = "correct horse battery staple";
    field("adult-affirmed").checked = true;
    await submit();

    expect(register).toHaveBeenCalledWith(
      "person@example.test",
      "correct horse battery staple",
      "recovery@example.test",
      true
    );
    expect(document.querySelector('[role="status"]')?.textContent).toContain(REGISTRATION_MESSAGE);
    await click("Resend instructions");
    expect(resendVerification).toHaveBeenCalledWith("person@example.test");
    expect(document.querySelector('[role="status"]')?.textContent).toContain(RESEND_MESSAGE);
  });

  it("does not expose registration transport or server details", async () => {
    const register = vi.fn().mockRejectedValue(
      new Error("EMAIL_ALREADY_EXISTS for user 81f6 at http://api.internal")
    );
    await act(async () => root!.render(
      <SignUpFlow client={{ register, resendVerification: vi.fn() }} />
    ));
    field("email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "password";
    field("adult-affirmed").checked = true;
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Account creation could not be completed.");
    expect(document.body.textContent).not.toMatch(/EMAIL_ALREADY_EXISTS|user 81f6|api\.internal/);
  });

  it("does not expose resend transport or account-state details", async () => {
    const register = vi.fn().mockResolvedValue({ message: REGISTRATION_MESSAGE });
    const resendVerification = vi.fn().mockRejectedValue(
      new Error("NO_PENDING_ACCOUNT for user 81f6 at http://api.internal")
    );
    await act(async () => root!.render(<SignUpFlow client={{ register, resendVerification }} />));
    field("email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "password";
    field("adult-affirmed").checked = true;
    await submit();
    await click("Resend instructions");
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Verification instructions could not be resent.");
    expect(document.body.textContent).not.toMatch(/NO_PENDING_ACCOUNT|user 81f6|api\.internal/);
  });
});
