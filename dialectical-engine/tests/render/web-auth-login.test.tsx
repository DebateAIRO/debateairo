// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";
import { LoginFlow } from "../../web/components/LoginFlow.js";
import { TopBar } from "../../web/components/TopBar.js";

const SESSION = {
  asker_id: "owner:11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  caller_scope: "ASKER" as const,
  ownership_provenance: "server_session" as const,
  provisional_identity_model: false as const
};

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

describe("duplicate web login route", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setPathname("/login");
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

  it("raw-renders a query-free same-origin POST fallback", () => {
    const html = renderToStaticMarkup(
      <LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const form = parsed.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("action")).toBe("/login");
    expect(form!.getAttribute("action")).not.toContain("?");
  });

  it("uses the exact cookie-native password then mandatory-MFA contract", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockResolvedValue({
      status: "authenticated" as const,
      csrf_token: "c".repeat(43),
      session: SESSION
    });
    const onAuthenticated = vi.fn();
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={onAuthenticated} />
    ));

    field("email").value = " person@example.test ";
    field("password").value = "correct horse battery staple";
    await submit();
    expect(beginLogin).toHaveBeenCalledWith("person@example.test", "correct horse battery staple");
    expect(document.querySelector("h1")?.textContent).toBe("Enter your authentication code.");
    expect(document.body.textContent).not.toContain("Back to the graph.");
    expect(field("code").inputMode).toBe("numeric");
    expect(field("code").maxLength).toBe(6);
    const mfaForm = document.querySelector("form");
    expect(mfaForm?.getAttribute("method")).toBe("post");
    expect(mfaForm?.getAttribute("action")).toBe("/login");

    field("code").value = "123456";
    await submit();
    expect(completeLogin).toHaveBeenCalledWith("challenge", "123456");
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("holds all home navigation until a replacement recovery code is acknowledged", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockResolvedValue({
      status: "authenticated" as const,
      csrf_token: "c".repeat(43),
      session: SESSION,
      replacement_recovery_code: "AAAA-BBBB-CCCC-DDDD"
    });
    const onAuthenticated = vi.fn();
    await act(async () => root!.render(
      <><TopBar /><LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={onAuthenticated} /></>
    ));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "AAAA-BBBB-CCCC-DDDD";
    await submit();

    expect(document.body.textContent).toContain("AAAA-BBBB-CCCC-DDDD");
    expect(document.querySelectorAll('a[href="/"]')).toHaveLength(0);
    expect(document.querySelector('.authTopBar [aria-disabled="true"]')).not.toBeNull();
    expect(onAuthenticated).not.toHaveBeenCalled();

    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.trim() === "I saved it — continue");
    expect(button).toBeDefined();
    await act(async () => (button as HTMLButtonElement).click());
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("keeps password-phase transport and server details out of public failure copy", async () => {
    const beginLogin = vi.fn().mockRejectedValue(new Error("EMAIL_NOT_FOUND http://api.internal"));
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin: vi.fn() }} />
    ));
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Sign-in could not be completed.");
    expect(document.body.textContent).not.toMatch(/EMAIL_NOT_FOUND|api\.internal/);
  });

  it("keeps MFA-phase rejected-code details out of public failure copy", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockRejectedValue(
      new Error("INVALID_TOTP for user 81f6 at http://api.internal")
    );
    await act(async () => root!.render(<LoginFlow client={{ beginLogin, completeLogin }} />));
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "000000";
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Authenticator verification could not be completed.");
    expect(document.body.textContent).not.toMatch(/INVALID_TOTP|user 81f6|api\.internal/);
  });
});
