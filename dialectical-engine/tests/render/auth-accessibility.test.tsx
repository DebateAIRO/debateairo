// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 7: keyboard and screen-reader basics.
 * - After a rejected code, focus goes back to the (re-enabled, cleared) code field.
 * - One submit makes at most one live announcement: field errors are tied to their field
 *   (aria-describedby) and focus moves to the first invalid field; they are not each an alert.
 * - Onboarding's two consent checkboxes have visible labels.
 * - A pasted code is accepted only as exactly six digits (spaces and dashes ignored); anything else
 *   is shown with an inline error instead of being cut to six digits and sent.
 * - Credential fields carry the right autocomplete and input mode.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { SecurityEnrollment } from "../../apps/ui/components/auth/SecurityEnrollment.js";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
import { OnboardingEvidence } from "../../apps/ui/components/auth/OnboardingEvidence.js";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const token = "a".repeat(43);
const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
async function render(view: React.ReactNode) { const result = await mount(view); mounted.push(result); return result.host; }
afterEach(async () => { while (mounted.length) { const { root, host } = mounted.pop()!; await unmount(root, host); } });
const describedText = (field: Element) => (field.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");

async function toCodeStep(completeLogin = vi.fn()) {
  const client = { beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required", challenge_token: token, available_methods: ["totp", "recovery_code"] }), completeLogin };
  const host = await render(<LoginFlow client={client} onAuthenticated={vi.fn()} />);
  await input(host, "[name=email]", "person@example.test");
  await input(host, "[name=password]", "existing-password");
  await act(async () => host.querySelector("form")!.requestSubmit());
  return { host, client };
}

describe("focus returns to the code after a rejected code", () => {
  it("on sign-in", async () => {
    const { host } = await toCodeStep(vi.fn().mockRejectedValue(new ContractHttpError("SESSION_REQUIRED", 401, "AUTH_MFA_INVALID", "AUTH_MFA_INVALID")));
    await input(host, "[name=code]", "123456");
    const code = host.querySelector<HTMLInputElement>("[name=code]")!;
    expect(code.disabled).toBe(false);
    expect(code.value).toBe("");
    expect(document.activeElement).toBe(code);
  });

  it("in authenticator setup", async () => {
    const client = {
      beginTotpEnrollment: vi.fn().mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Example:person?secret=JBSWY3DPEHPK3PXP&issuer=Example", enrollment_token: "e".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() }),
      completeTotpEnrollment: vi.fn().mockRejectedValue(new ContractHttpError("SESSION_REQUIRED", 401, "MFA_TOTP_INVALID", "MFA_TOTP_INVALID"))
    };
    const host = await render(<SecurityEnrollment catalog={auth} client={client as never} authority={{ kind: "grant", token }} availableMethods={["totp"]} />);
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.enroll.useAuthenticator"])!.click());
    await input(host, "#enrollment-code", "123456");
    expect(client.completeTotpEnrollment).toHaveBeenCalledOnce();
    const code = host.querySelector<HTMLInputElement>("#enrollment-code")!;
    expect(code.value).toBe("");
    expect(document.activeElement).toBe(code);
  });
});

describe("one announcement per submit", () => {
  it("sign-up: field errors are described, not shouted, and focus lands on the first", async () => {
    const host = await render(<SignUpFlow client={{ register: vi.fn(), checkAge: vi.fn() }} />);
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(host.querySelectorAll("[role=alert]").length).toBe(0);
    const email = host.querySelector<HTMLInputElement>("[name=email]")!;
    expect(document.activeElement).toBe(email);
    expect(describedText(email)).toContain(auth["auth.invalidEmail"]);
  });

  it("sign-in: the same", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />);
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(host.querySelectorAll("[role=alert]").length).toBe(0);
    expect(describedText(document.activeElement!)).toContain(auth["auth.invalidEmail"]);
  });
});

describe("onboarding consent boxes have visible labels", () => {
  it("each checkbox is named by a visible label and opens its document", async () => {
    const requirements = { status: "pending_mfa", country: "RO", age_confirmation_required: false, legal_acceptance_required: true, terms: { locale: "en", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256, url: "/terms?lang=en" }, privacy: { locale: "en", version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256, url: "/privacy?lang=en" } };
    const client = { pendingOnboardingStatus: vi.fn().mockResolvedValue(requirements), completePendingOnboarding: vi.fn() };
    const host = await render(<OnboardingEvidence authority={{ kind: "pending", token }} locale="en" catalog={auth} client={client as never} onReady={vi.fn()} />);
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes).toHaveLength(2);
    const names = boxes.map((box) => { expect(box.hasAttribute("aria-label")).toBe(false); return host.querySelector(`label[for="${box.id}"]`)?.textContent ?? ""; });
    expect(names[0]).toContain("Privacy Policy");
    expect(names[1]).toContain("Terms of Service");
    await act(async () => boxes[0]!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(boxes[0]!.checked).toBe(false);
  });
});

describe("a pasted code is taken only as exactly six digits", () => {
  it("eight digits are refused with an inline error, never cut and sent", async () => {
    const completeLogin = vi.fn();
    const { host } = await toCodeStep(completeLogin);
    await input(host, "[name=code]", "12345678");
    const code = host.querySelector<HTMLInputElement>("[name=code]")!;
    expect(completeLogin).not.toHaveBeenCalled();
    expect(code.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(code)).toContain("6 digits");
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(completeLogin).not.toHaveBeenCalled();
  });

  it.each(["123 456", "123-456", " 123456 "])("%j is accepted as 123456", async (pasted) => {
    const completeLogin = vi.fn().mockResolvedValue({ status: "authenticated", csrf_token: "c".repeat(43) });
    const { host } = await toCodeStep(completeLogin);
    await input(host, "[name=code]", pasted);
    expect(completeLogin).toHaveBeenCalledWith(token, "123456");
  });

  it("in authenticator setup and the security check too", async () => {
    const enrollment = { beginTotpEnrollment: vi.fn().mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Example:person?secret=JBSWY3DPEHPK3PXP&issuer=Example", enrollment_token: "e".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() }), completeTotpEnrollment: vi.fn() };
    const setup = await render(<SecurityEnrollment catalog={auth} client={enrollment as never} authority={{ kind: "grant", token }} availableMethods={["totp"]} />);
    await act(async () => [...setup.querySelectorAll("button")].find((button) => button.textContent === auth["auth.enroll.useAuthenticator"])!.click());
    await input(setup, "#enrollment-code", "1234567");
    expect(enrollment.completeTotpEnrollment).not.toHaveBeenCalled();
    expect(setup.querySelector("#enrollment-code")?.getAttribute("aria-invalid")).toBe("true");

    const stepUp = vi.fn();
    const check = await render(<SecurityConfirmation catalog={auth} client={{ authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["password_totp"], step_up_providers: [] }), stepUp }} authorization={{ action: "REGENERATE_RECOVERY_CODES" }} onConfirmed={vi.fn()} />);
    await act(async () => [...check.querySelectorAll("button")].find((button) => button.textContent === auth["auth.security.passwordMethod"])!.click());
    await input(check, "[name=security-password]", "existing-password");
    await input(check, "[name=security-code]", "12345678");
    expect(stepUp).not.toHaveBeenCalled();
    expect(check.querySelector("[name=security-code]")?.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("a pasted code after a provider sign-in", () => {
  it("is refused unless it is exactly six digits", async () => {
    window.history.replaceState(null, "", `/social/complete#kind=login&token=${token}`);
    const completeLogin = vi.fn();
    try {
      const host = await render(<SocialCompleteFlow client={{ socialLoginStatus: vi.fn().mockResolvedValue({ expires_at: new Date(Date.now() + 300_000).toISOString(), available_methods: ["totp"] }), completeLogin } as never} />);
      await input(host, "#social-code", "12345678");
      expect(completeLogin).not.toHaveBeenCalled();
      expect(host.querySelector("#social-code")?.getAttribute("aria-invalid")).toBe("true");
    } finally { window.history.replaceState(null, "", "/"); }
  });
});

describe("credential fields carry the right autocomplete", () => {
  it("sign-in, its code step and sign-up", async () => {
    const signIn = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />);
    expect(signIn.querySelector("[name=email]")?.getAttribute("autocomplete")).toMatch(/^(?:username|email)\b/);
    expect(signIn.querySelector("[name=password]")?.getAttribute("autocomplete")).toBe("current-password");
    const { host } = await toCodeStep();
    const code = host.querySelector("[name=code]")!;
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    const signUp = await render(<SignUpFlow client={{ register: vi.fn(), checkAge: vi.fn() }} />);
    expect(signUp.querySelector("[name=email]")?.getAttribute("autocomplete")).toMatch(/^(?:username|email)$/);
    expect(signUp.querySelector("[name=password]")?.getAttribute("autocomplete")).toBe("new-password");
  });
});
