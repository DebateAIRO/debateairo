// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 1: PR #82 dropped the `.authField` wrappers and used class names that
 * have no rule in globals.css, so login, social buttons, "Use a different email", the security settings
 * and the recovery pages showed plain browser boxes and grey default buttons.
 *
 * This renders every auth screen and checks what a browser would style: each text-like input, select and
 * button must carry a class the stylesheet defines, or sit inside a wrapper whose descendant rule styles
 * it (`.authField input`, `.setListActions button`, ...). A class the stylesheet never defines counts as
 * unstyled, so a misspelt or forgotten class fails here too.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { EmailPendingScreen } from "../../apps/ui/components/auth/EmailPendingScreen.js";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
import { SecurityEnrollment } from "../../apps/ui/components/auth/SecurityEnrollment.js";
import { EphemeralCodes } from "../../apps/ui/components/auth/EphemeralCodes.js";
import { PasswordResetFlow } from "../../apps/ui/components/PasswordResetFlow.js";
import { MfaRecoveryFlow } from "../../apps/ui/components/MfaRecoveryFlow.js";
import { BackupEmailVerification } from "../../apps/ui/components/BackupEmailVerification.js";
import { SecuritySettings } from "../../apps/ui/components/SecuritySettings.js";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import { OnboardingEvidence } from "../../apps/ui/components/auth/OnboardingEvidence.js";
import { ChangeEmailScreen, EmailSettingsCard } from "../../apps/ui/components/EmailSettings.js";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { RecoveryFlow } from "../../apps/ui/components/auth/RecoveryFlow.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({
  createConsumerWebAuthnBrowser: () => ({
    supportsConditional: async () => false,
    authenticate: vi.fn(),
    register: vi.fn(),
    cancel: vi.fn()
  })
}));

const css = readFileSync("apps/ui/app/globals.css", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const defined = new Set([...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map((match) => match[1]!));
const wrappers = (element: "input" | "select" | "button") => new Set(
  [...css.matchAll(new RegExp(String.raw`\.([A-Za-z][\w-]*)(?:\s*>)?\s+${element}\b`, "g"))].map((match) => match[1]!)
);
const descendantRules = { input: wrappers("input"), select: wrappers("select"), button: wrappers("button") };

function unstyled(host: ParentNode): string[] {
  const failures: string[] = [];
  for (const element of host.querySelectorAll<HTMLElement>("*")) {
    for (const name of element.classList) {
      if (!defined.has(name)) failures.push(`.${name} has no CSS rule (${element.tagName.toLowerCase()})`);
    }
  }
  const controls = host.querySelectorAll<HTMLElement>("input, select, button, textarea");
  for (const control of controls) {
    const tag = control.tagName.toLowerCase() as "input" | "select" | "button" | "textarea";
    if (tag === "input" && ["hidden", "checkbox", "radio"].includes((control as HTMLInputElement).type)) continue;
    if ([...control.classList].some((name) => defined.has(name))) continue;
    const rule = descendantRules[tag === "textarea" ? "input" : tag];
    let styledBy: Element | null = control.parentElement;
    while (styledBy !== null && ![...styledBy.classList].some((name) => rule.has(name))) styledBy = styledBy.parentElement;
    if (styledBy !== null) continue;
    failures.push(`unstyled <${tag}> "${(control.textContent || control.getAttribute("name") || control.id).trim()}"`);
  }
  return failures;
}

const providers = { providers: [{ id: "google", name: "Google" }] };
const token = "a".repeat(43);
const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
async function render(view: React.ReactNode) {
  const result = await mount(view);
  mounted.push(result);
  return result.host;
}
afterEach(async () => {
  while (mounted.length) {
    const { root, host } = mounted.pop()!;
    await unmount(root, host);
  }
});

describe("every auth screen styles its own controls", () => {
  it("sign-in: email, password, passkey and social buttons", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn(), authProviders: vi.fn().mockResolvedValue(providers), beginSocialLogin: vi.fn() }} />);
    expect(host.querySelector("[name=email]")).not.toBeNull();
    expect(host.textContent).toContain("Continue with Google");
    expect(unstyled(host)).toEqual([]);
  });

  it("sign-in: the two-step code screen and its alternatives", async () => {
    const client = { beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required", challenge_token: token, available_methods: ["passkey", "totp", "recovery_code"] }), completeLogin: vi.fn(), beginPasskeyLogin: vi.fn(), completePasskeyLogin: vi.fn() };
    const host = await render(<LoginFlow client={client} />);
    await input(host, "[name=email]", "person@example.test");
    await input(host, "[name=password]", "existing-password");
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(host.querySelector("[name=code]")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("sign-in: the send-the-verification-email-again screens", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn(), resendVerification: vi.fn() }} turnstile={{ siteKey: "1x00000000000000000000AA", nonce: "abcdefghijklmnopqrstuv==" }} />);
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.login.resendVerification"])!.click());
    expect(host.querySelector("#resend-email")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("sign-up: the password Show toggle, its hint and the social buttons", async () => {
    const host = await render(<SignUpFlow client={{ register: vi.fn(), checkAge: vi.fn(), authProviders: vi.fn().mockResolvedValue(providers), beginSocialLogin: vi.fn() }} />);
    const hint = host.querySelector("#signup-password-hint");
    expect(hint?.classList.contains("authFieldHint")).toBe(true);
    expect(unstyled(host)).toEqual([]);
  });

  it("the check-your-email screen and Use a different email", async () => {
    const host = await render(<EmailPendingScreen email="person@example.test" retryAfterSeconds={60} client={{ resendVerification: vi.fn() }} catalog={auth} locale="en" onDifferentEmail={vi.fn()} />);
    expect(host.textContent).toContain("Use a different email");
    expect(unstyled(host)).toEqual([]);
  });

  it("the security confirmation with passkey, provider and password-and-code proofs", async () => {
    const client = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["passkey", "password_totp", "provider"], step_up_providers: ["google"] }) };
    const host = await render(<SecurityConfirmation catalog={auth} client={client} authorization={{ action: "REGENERATE_RECOVERY_CODES" }} onConfirmed={vi.fn()} onCancel={vi.fn()} />);
    const passwordMethod = [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.security.passwordMethod"])!;
    await act(async () => passwordMethod.click());
    expect(host.querySelector("[name=security-password]")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("authenticator setup with its QR code, setup key and code field", async () => {
    const client = { beginTotpEnrollment: vi.fn().mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Example:person?secret=JBSWY3DPEHPK3PXP&issuer=Example", enrollment_token: token, expires_at: new Date(Date.now() + 300_000).toISOString() }) } as never;
    const host = await render(<SecurityEnrollment catalog={auth} client={client} authority={{ kind: "grant", token }} availableMethods={["passkey", "totp"]} />);
    const totp = [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.enroll.useAuthenticator"])!;
    await act(async () => totp.click());
    const key = [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.enroll.useSetupKey"])!;
    await act(async () => key.click());
    expect(host.querySelector("#enrollment-code")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("onboarding: date of birth and the two documents", async () => {
    const requirements = { status: "pending_mfa", country: "RO", age_confirmation_required: true, legal_acceptance_required: true, terms: { locale: "en", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256, url: "/terms?lang=en" }, privacy: { locale: "en", version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256, url: "/privacy?lang=en" } };
    const client = { pendingOnboardingStatus: vi.fn().mockResolvedValue(requirements), completePendingOnboarding: vi.fn() } as never;
    const host = await render(<OnboardingEvidence authority={{ kind: "pending", token }} locale="en" catalog={auth} client={client} onReady={vi.fn()} />);
    expect(host.querySelector("form")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("the email card and the change-email screen", async () => {
    const client = {
      readAccountEmail: vi.fn().mockResolvedValue({ email: "ana@example.test", verified: true, pending: null }),
      authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["password_totp"], step_up_providers: [] })
    } as never;
    const card = await render(<EmailSettingsCard client={client} />);
    expect(unstyled(card)).toEqual([]);
    const screen = await render(<ChangeEmailScreen client={client} currentEmail="ana@example.test" onBack={vi.fn()} onRequested={vi.fn()} />);
    expect(screen.querySelector("#email-change-new")).not.toBeNull();
    expect(unstyled(screen)).toEqual([]);
  });

  it.each([
    ["signup", { socialSignupStatus: vi.fn().mockResolvedValue({ provider: "google", email: "person@example.test", name: "Person", expires_at: new Date(Date.now() + 300_000).toISOString() }) }],
    ["login", { socialLoginStatus: vi.fn().mockResolvedValue({ expires_at: new Date(Date.now() + 300_000).toISOString(), available_methods: ["passkey", "totp", "recovery_code"] }) }]
  ])("finishing a %s with a provider", async (kind, client) => {
    window.history.replaceState(null, "", `/social/complete#kind=${kind}&token=${token}`);
    try {
      const host = await render(<SocialCompleteFlow client={client as never} />);
      expect(host.querySelector("input")).not.toBeNull();
      expect(unstyled(host)).toEqual([]);
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it.each([["/recover", "the request"], [`/recover#token=${token}`, "the saved-code step"]])("account recovery: %s (%s)", async (path) => {
    window.history.replaceState(null, "", path);
    try {
      const host = await render(<RecoveryFlow catalog={auth} locale="en" client={{ recoveryStart: vi.fn(), recoveryProve: vi.fn() } as never} />);
      expect(host.querySelector("input")).not.toBeNull();
      expect(unstyled(host)).toEqual([]);
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("recovery codes with Copy and Download", async () => {
    const host = await render(<EphemeralCodes catalog={auth} codes={["AAAA-BBBB", "CCCC-DDDD"]} />);
    expect(unstyled(host)).toEqual([]);
  });

  it("password reset request and sent screens", async () => {
    const client = { status: vi.fn().mockRejectedValue(new Error("none")), start: vi.fn().mockResolvedValue(undefined) } as never;
    const host = await render(<PasswordResetFlow client={client} />);
    expect(unstyled(host)).toEqual([]);
    await input(host, "[name=email]", "person@example.test");
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(unstyled(host)).toEqual([]);
  });

  it("authenticator recovery request screen", async () => {
    const client = { status: vi.fn().mockRejectedValue(new Error("none")) } as never;
    const host = await render(<MfaRecoveryFlow client={client} />);
    expect(host.querySelector("select")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("backup email verification card", async () => {
    const client = { status: vi.fn().mockResolvedValue({ status: "pending", email: "b***@example.test" }) } as never;
    const host = await render(<BackupEmailVerification client={client} />);
    expect(host.querySelector("#backup-current-password")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it.each([
    ["PUBLISH", { target_run_id: "33333333-3333-4333-8333-333333333333" }],
    ["DELETE_ACCOUNT", {}],
    ["CHANGE_EMAIL", {}]
  ])("a resumed %s action after a provider check", async (action, target) => {
    const proof = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, ...target, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } };
    const client = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }) } as never;
    const host = await render(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={publicCatalog} locale="en" client={client} takeProof={() => proof as never} />);
    expect(host.querySelector("input")).not.toBeNull();
    expect(unstyled(host)).toEqual([]);
  });

  it("security settings: methods, recovery email, sign-in providers and removal", async () => {
    const factor = "11111111-1111-4111-8111-111111111111";
    const client = {
      authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: "passkey", label: "My key", created_at: "2026-10-01T10:00:00Z", last_used_at: null, removable: true }], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }),
      phoneProfile: vi.fn().mockResolvedValue({ phone_present: true, phone_masked: "+40 ••• 678", phone_verified: false, updated_at: null }),
      recoveryEmail: vi.fn().mockResolvedValue({ state: "verified", email: "r***@example.test", pending: null }),
      authProviders: vi.fn().mockResolvedValue({ providers: [{ id: "google", name: "Google" }, { id: "apple", name: "Apple" }] }),
      linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [{ provider: "google", removable: true }] }),
      listSessions: vi.fn().mockResolvedValue({ sessions: [] }),
      logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn()
    } as never;
    const host = await render(<SecuritySettings client={client} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" />);
    expect(host.textContent).toContain("My key");
    expect(unstyled(host)).toEqual([]);
    const remove = host.querySelector<HTMLButtonElement>("[data-remove-factor]")!;
    await act(async () => remove.click());
    expect(unstyled(host)).toEqual([]);
  });
});

/*
 * Review fixes (2026-10-09), read through jsdom's CSSOM: render tests have no CSS, so these check the
 * rules that apply to the rendered markup.
 * - Account recovery codes (35 characters, "XXXX-XXXX-...") wrapped inside a code in two columns at
 *   phone width: one column, monospace, never broken inside a code (the list scrolls sideways if needed).
 * - The sign-in help panel was pinned to the left, so a right-to-left page read it from the wrong side.
 */
describe("layout rules for the auth screens", () => {
  type Rule = { selectors: string[]; style: CSSStyleDeclaration };
  function rulesMatching(element: Element): Rule[] {
    const style = document.createElement("style");
    style.textContent = readFileSync("apps/ui/app/globals.css", "utf8");
    document.head.append(style);
    const rules: Rule[] = [];
    const walk = (list: CSSRuleList) => {
      for (const rule of [...list]) {
        if ((rule as CSSMediaRule).cssRules !== undefined && (rule as CSSStyleRule).selectorText === undefined) walk((rule as CSSMediaRule).cssRules);
        else if ((rule as CSSStyleRule).selectorText !== undefined) {
          const selectors = (rule as CSSStyleRule).selectorText.split(",").map((part) => part.trim());
          if (selectors.some((selector) => { try { return element.matches(selector); } catch { return false; } })) rules.push({ selectors, style: (rule as CSSStyleRule).style });
        }
      }
    };
    walk(style.sheet!.cssRules);
    style.remove();
    return rules;
  }
  const declared = (rules: Rule[], property: string) => rules.map((rule) => rule.style.getPropertyValue(property)).filter(Boolean);

  it("recovery codes: one column, monospace, a code never broken across lines", () => {
    const list = document.createElement("ol");
    list.className = "recoveryCodes";
    list.innerHTML = "<li><code>ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-23456</code></li>";
    document.body.append(list);
    try {
      const listRules = rulesMatching(list);
      expect(listRules.length).toBeGreaterThan(0);
      for (const columns of declared(listRules, "grid-template-columns")) {
        expect(columns).not.toMatch(/repeat\(\s*(?:[2-9]|auto)/);
        expect(columns.replace(/\((?:[^()]|\([^()]*\))*\)/g, "()").trim().split(/\s+/)).toHaveLength(1);
      }
      expect(declared(listRules, "font-family").join(" ")).toContain("--font-mono");
      expect(declared(listRules, "overflow-x")).toContain("auto");
      const code = list.querySelector("code")!;
      expect(declared(rulesMatching(code), "white-space")).toContain("nowrap");
      expect(declared([...rulesMatching(code), ...listRules], "overflow-wrap")).not.toContain("anywhere");
    } finally { list.remove(); }
  });

  it("the sign-in help panel aligns to the start of the line, not the left", () => {
    const help = document.createElement("details");
    help.className = "authHelp";
    document.body.append(help);
    try {
      const alignments = declared(rulesMatching(help), "text-align");
      expect(alignments.length).toBeGreaterThan(0);
      expect(alignments.filter((value) => value === "left" || value === "right")).toEqual([]);
    } finally { help.remove(); }
  });
});
