// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

const REGISTRATION_MESSAGE =
  "If this address can be registered, verification instructions will arrive. Check your spam folder.";
const RESEND_MESSAGE =
  "If this address is awaiting verification, new instructions will arrive. Check your spam folder.";
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

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button, `missing rendered button ${label}`).toBeDefined();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await settle();
}

describe("rendered auth flow integration", () => {
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

  it("raw-renders credential forms with query-free same-origin POST fallbacks", () => {
    const loginHtml = renderToStaticMarkup(
      <LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />
    );
    const signUpHtml = renderToStaticMarkup(
      <SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />
    );
    const cases = [
      { route: "/login", html: loginHtml },
      { route: "/sign-up", html: signUpHtml }
    ];

    for (const { route, html } of cases) {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const forms = parsed.querySelectorAll("form");
      expect(forms, `${route} must raw-render exactly one initial credential form`).toHaveLength(1);
      expect(forms[0]!.getAttribute("method")).toBe("post");
      expect(forms[0]!.getAttribute("action")).toBe(route);
      expect(forms[0]!.getAttribute("action")).not.toContain("?");
    }
  });

  it("renders the second-step login form with the same safe POST fallback", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin: vi.fn() }} onAuthenticated={vi.fn()} />
    ));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();

    const form = document.querySelector<HTMLFormElement>("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("action")).toBe("/login");
    expect(form!.getAttribute("action")).not.toContain("?");
  });

  it("keeps recovery-login navigation behind one explicit replacement-code acknowledgement", async () => {
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
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={onAuthenticated} />
    ));

    field("email").value = " person@example.test ";
    field("password").value = "correct horse battery staple";
    await submit();
    expect(beginLogin).toHaveBeenCalledWith("person@example.test", "correct horse battery staple");

    field("code").value = "AAAA-BBBB-CCCC-DDDD";
    await submit();
    expect(completeLogin).toHaveBeenCalledWith("challenge", "AAAA-BBBB-CCCC-DDDD");
    expect(document.body.textContent).toContain("AAAA-BBBB-CCCC-DDDD");
    expect(onAuthenticated).not.toHaveBeenCalled();

    await click("I saved it — continue");
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledWith();
  });

  it("navigates once after an ordinary MFA completion", async () => {
    const onAuthenticated = vi.fn();
    const client = {
      beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required" as const, challenge_token: "challenge" }),
      completeLogin: vi.fn().mockResolvedValue({
        status: "authenticated" as const,
        csrf_token: "c".repeat(43),
        session: SESSION
      })
    };
    await act(async () => root!.render(<LoginFlow client={client} onAuthenticated={onAuthenticated} />));
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "123456";
    await submit();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("renders the non-enumerating registration state and resends only to the submitted email", async () => {
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
    expect(document.body.textContent).toContain(REGISTRATION_MESSAGE);
    expect(document.body.textContent).toContain("No account status is revealed here.");

    await click("Resend instructions");
    expect(resendVerification).toHaveBeenCalledWith("person@example.test");
    expect(document.body.textContent).toContain(RESEND_MESSAGE);
    expect(document.body.textContent).not.toMatch(/Google|forgot|keep me signed|model API key/i);
  });

  it("keeps login failures friendly and does not render transport or server details", async () => {
    const beginLogin = vi.fn().mockRejectedValue(
      new Error("ContractHttpError: EMAIL_NOT_FOUND from http://api.internal:3001")
    );
    const completeLogin = vi.fn();
    await act(async () => root!.render(<LoginFlow client={{ beginLogin, completeLogin }} />));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Sign-in could not be completed.");
    expect(document.body.textContent).not.toMatch(/ContractHttpError|EMAIL_NOT_FOUND|api\.internal/);
  });

  it("keeps MFA failures friendly and does not render rejected-code details", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockRejectedValue(
      new Error("ContractHttpError: invalid TOTP for user 81f6")
    );
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={vi.fn()} />
    ));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "123456";
    await submit();

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Authenticator verification could not be completed.");
    expect(document.body.textContent).not.toMatch(/ContractHttpError|invalid TOTP|81f6/);
  });

  it("keeps registration failures generic and separates primary and recovery autofill", async () => {
    const register = vi.fn().mockRejectedValue(
      new Error("ContractHttpError: duplicate account person@example.test")
    );
    const resendVerification = vi.fn();
    await act(async () => root!.render(<SignUpFlow client={{ register, resendVerification }} />));

    expect(field("email").autocomplete).toBe("section-primary-email email");
    expect(field("recovery-email").autocomplete).toBe("section-recovery-email email");
    field("email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "password";
    field("adult-affirmed").checked = true;
    await submit();

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Account creation could not be completed.");
    expect(document.body.textContent).not.toMatch(/ContractHttpError|duplicate account/);
  });

  it("keeps resend failures generic without changing the non-enumerating success message", async () => {
    const register = vi.fn().mockResolvedValue({ message: REGISTRATION_MESSAGE });
    const resendVerification = vi.fn().mockRejectedValue(
      new Error("network ECONNREFUSED api.internal")
    );
    await act(async () => root!.render(<SignUpFlow client={{ register, resendVerification }} />));

    field("email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "password";
    field("adult-affirmed").checked = true;
    await submit();
    expect(document.body.textContent).toContain(REGISTRATION_MESSAGE);

    await click("Resend instructions");
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Verification instructions could not be resent.");
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|api\.internal/);
  });
});
