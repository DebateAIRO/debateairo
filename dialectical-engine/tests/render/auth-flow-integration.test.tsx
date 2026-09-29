// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { setPathname } from "next/navigation";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { TopBar } from "../../apps/ui/components/TopBar.js";

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
const checkAge = vi.fn();

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

/* Age gate replaced the 18+ box (Turn 8). The date of birth is React state, not FormData, so it
   is typed the way React sees it: the prototype value setter plus an `input` event, in act.
   Call it BEFORE the direct assignments: its re-renders reset the controlled text fields. */
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
    checkAge.mockReset().mockResolvedValue({ outcome: "allowed" });
    window.history.replaceState({}, "", "/");
    setPathname("/");
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
      <SignUpFlow client={{ register: vi.fn(), checkAge }} />
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

  it("moves password success into a dedicated authenticator screen with a recovery alternative", async () => {
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

    expect(document.querySelector("h1")?.textContent).toBe("Enter your authentication code.");
    expect(document.body.textContent).not.toContain("Back to the graph.");
    expect(document.querySelector('input[name="email"]')).toBeNull();
    expect(document.querySelector('input[name="password"]')).toBeNull();
    expect(field("code").inputMode).toBe("numeric");
    expect(field("code").maxLength).toBe(6);
    expect(field("code").pattern).toBe("[0-9]{6}");
    expect(document.body.textContent).toContain("Open Google Authenticator");

    await click("Use a recovery code");
    expect(document.querySelector("h1")?.textContent).toBe("Enter a recovery code.");
    expect(field("code").inputMode).toBe("text");
    expect(field("code").maxLength).toBe(-1);
    expect(field("code").pattern).toBe("");
    expect(document.body.textContent).toContain("Use an authenticator code");

    await click("Back to sign in");
    expect(document.querySelector("h1")?.textContent).toBe("Back to the graph.");
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="password"]')).not.toBeNull();
  });

  it("makes recovery-code acknowledgement the only home completion path", async () => {
    setPathname("/login");
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
      <>
        <TopBar />
        <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={onAuthenticated} />
      </>
    ));

    expect(document.querySelector('.authTopBar a[href="/"]')).not.toBeNull();
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "AAAA-BBBB-CCCC-DDDD";
    await submit();

    expect(document.body.textContent).toContain("AAAA-BBBB-CCCC-DDDD");
    expect(document.querySelectorAll('a[href="/"]')).toHaveLength(0);
    const unavailableBrand = document.querySelector('.authTopBar [aria-disabled="true"]');
    expect(unavailableBrand).not.toBeNull();
    expect(unavailableBrand?.tagName).not.toBe("A");
    expect(onAuthenticated).not.toHaveBeenCalled();
    const completionButtons = document.querySelectorAll(".authSuccessWarning button");
    expect(completionButtons).toHaveLength(1);
    expect(completionButtons[0]!.textContent?.trim()).toBe("I saved it — continue");

    await click("I saved it — continue");
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary login and sign-up auth chrome linked truthfully to home", async () => {
    setPathname("/login");
    await act(async () => root!.render(
      <>
        <TopBar />
        <LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />
      </>
    ));
    expect(document.querySelector('.authTopBar a[href="/"]')).not.toBeNull();
    expect(document.querySelector('.authTopBar [aria-disabled="true"]')).toBeNull();

    setPathname("/sign-up");
    await act(async () => root!.render(
      <>
        <TopBar />
        <SignUpFlow client={{ register: vi.fn(), checkAge }} />
      </>
    ));
    expect(document.querySelector('.authTopBar a[href="/"]')).not.toBeNull();
    expect(document.querySelector('.authTopBar [aria-disabled="true"]')).toBeNull();
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

  it("reads the validated default return path at login completion time", async () => {
    window.history.replaceState({}, "", "/login?next=%2Fsettings");
    const client = {
      beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required" as const, challenge_token: "challenge" }),
      completeLogin: vi.fn().mockResolvedValue({
        status: "authenticated" as const,
        csrf_token: "c".repeat(43),
        session: SESSION
      })
    };
    await act(async () => root!.render(<LoginFlow client={client} />));
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();

    const assign = vi.fn();
    const completionWindow = Object.create(window) as Window;
    Object.defineProperty(completionWindow, "location", {
      configurable: true,
      value: { search: "?next=%2Fnew", assign }
    });
    vi.stubGlobal("window", completionWindow);
    field("code").value = "123456";
    await submit();

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/new");
  });

  it("forwards sign-up next to login only when the parameter is present", async () => {
    window.history.replaceState({}, "", "/sign-up?next=%2Fnew");
    await act(async () => root!.render(
      <SignUpFlow client={{ register: vi.fn(), checkAge }} />
    ));
    await settle();

    expect(document.querySelector('.authPanelFooter a')?.getAttribute("href"))
      .toBe("/login?next=%2Fnew");
  });

  it("keeps the sign-up login link query-free when next is absent", async () => {
    window.history.replaceState({}, "", "/sign-up");
    await act(async () => root!.render(
      <SignUpFlow client={{ register: vi.fn(), checkAge }} />
    ));
    await settle();

    expect(document.querySelector('.authPanelFooter a')?.getAttribute("href")).toBe("/login");
  });

  it("renders the non-enumerating registration state", async () => {
    const register = vi.fn().mockResolvedValue({ message: REGISTRATION_MESSAGE });
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} />));

    await fillAdultDateOfBirth();
    field("email").value = " person@example.test ";
    field("confirm-email").value = " person@example.test ";
    field("recovery-email").value = " recovery@example.test ";
    field("password").value = "correct horse battery staple";
    field("confirm-password").value = "correct horse battery staple";
    field("privacy-accepted").checked = true;
    field("terms-accepted").checked = true;
    await submit();

    // The 4th argument is the ISO date of birth, not `true`: the age gate replaced the 18+ box (Turn 8).
    expect(register).toHaveBeenCalledWith(
      "person@example.test",
      "correct horse battery staple",
      "recovery@example.test",
      "1990-01-01"
    );
    expect(document.body.textContent).toContain(REGISTRATION_MESSAGE);
    expect(document.body.textContent).toContain("No account status is revealed here.");

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

  it("explains a rejected recovery code without revealing account state", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockRejectedValue(
      new ContractHttpError(
        "SESSION_REQUIRED",
        401,
        "AUTH_CREDENTIALS_INVALID for owner:secret",
        "AUTH_CREDENTIALS_INVALID"
      )
    );
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={vi.fn()} />
    ));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    await click("Use a recovery code");
    field("code").value = "AAAA-BBBB-CCCC-DDDD";
    await submit();

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "That recovery code was not accepted. Start sign-in again if the challenge is more than five minutes old, or use another unused code from this account."
    );
    expect(document.querySelector("h1")?.textContent).toBe("Enter a recovery code.");
    expect(document.body.textContent).not.toMatch(/AUTH_CREDENTIALS_INVALID|owner:secret/);
  });

  it("identifies the temporary MFA attempt lock without leaking server detail", async () => {
    const beginLogin = vi.fn().mockResolvedValue({
      status: "mfa_required" as const,
      challenge_token: "challenge"
    });
    const completeLogin = vi.fn().mockRejectedValue(
      new ContractHttpError("RATE_LIMITED", 429, "MFA_RATE_LIMITED internal", "MFA_RATE_LIMITED")
    );
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={vi.fn()} />
    ));

    field("email").value = "person@example.test";
    field("password").value = "password";
    await submit();
    field("code").value = "123456";
    await submit();

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Too many verification attempts. Wait five minutes, then start sign-in again."
    );
    expect(document.body.textContent).not.toContain("MFA_RATE_LIMITED");
  });

  it("keeps registration failures generic and separates primary and recovery autofill", async () => {
    const register = vi.fn().mockRejectedValue(
      new Error("ContractHttpError: duplicate account person@example.test")
    );
    await act(async () => root!.render(<SignUpFlow client={{ register, checkAge }} />));

    expect(field("email").autocomplete).toBe("section-primary-email email");
    expect(field("recovery-email").autocomplete).toBe("section-recovery-email email");
    await fillAdultDateOfBirth();
    field("email").value = "person@example.test";
    field("confirm-email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "password";
    field("confirm-password").value = "password";
    field("privacy-accepted").checked = true;
    field("terms-accepted").checked = true;
    await submit();

    expect(register, "the failure under test is register's, not an unfilled form's").toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toBe("Account creation could not be completed.");
    expect(document.body.textContent).not.toMatch(/ContractHttpError|duplicate account/);
  });



  // S02-S31 (SPEC.md S02-R18): a bare `new Event("submit")` bypasses HTML constraint
  // validation, so `required` gates nothing against a scripted submit. The handler
  // refuses from the two FormData reads — never from R17's React mirror, which an
  // assignment never updates.
  // Rewritten: the age gate replaced the 18+ box (Turn 8). Each consent box is now left empty
  // in turn with an adult date of birth filled, and the old "without the 18+ box" arm became
  // "without a date of birth": it is refused before any network call, checkAge included.
  async function remount(): Promise<void> {
    await act(async () => root!.unmount());
    document.body.replaceChildren();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }

  function fillCredentials(): void {
    field("email").value = "person@example.test";
    field("confirm-email").value = "person@example.test";
    field("recovery-email").value = "recovery@example.test";
    field("password").value = "correct horse battery staple";
    field("confirm-password").value = "correct horse battery staple";
  }

  it("refuses to register when any consent box is left unticked", async () => {
    const registerWithoutPrivacy = vi.fn();
    await act(async () =>
      root!.render(
        <SignUpFlow client={{ register: registerWithoutPrivacy, checkAge }} />
      )
    );

    await fillAdultDateOfBirth();
    fillCredentials();
    field("terms-accepted").checked = true;
    await submit();

    expect(registerWithoutPrivacy).not.toHaveBeenCalled();

    await remount();
    const registerWithoutTerms = vi.fn();
    await act(async () =>
      root!.render(
        <SignUpFlow client={{ register: registerWithoutTerms, checkAge }} />
      )
    );

    await fillAdultDateOfBirth();
    fillCredentials();
    field("privacy-accepted").checked = true;
    await submit();

    expect(registerWithoutTerms).not.toHaveBeenCalled();

    await remount();
    const registerWithoutDateOfBirth = vi.fn();
    await act(async () =>
      root!.render(
        <SignUpFlow client={{ register: registerWithoutDateOfBirth, checkAge }} />
      )
    );

    fillCredentials();
    field("privacy-accepted").checked = true;
    field("terms-accepted").checked = true;
    await submit();

    expect(registerWithoutDateOfBirth).not.toHaveBeenCalled();
    expect(document.getElementById("dob-msg")?.textContent, "the date of birth answers the submit")
      .toMatch(/^✗ /);
    expect(checkAge, "no refused arm reaches the age check").not.toHaveBeenCalled();
  });
});
