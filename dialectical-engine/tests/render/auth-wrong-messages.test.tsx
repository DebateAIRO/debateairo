// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 5: messages that described the wrong situation.
 * - A timed-out confirmation in Settings said "This enrolment link is invalid or expired.": no link
 *   was involved.
 * - Freshly generated recovery codes said "Your used recovery code has been replaced".
 * - Any onboarding failure said the Terms "were updated while you were reading".
 * - A wrong password/code or a rate limit at the security check said "Authenticator verification could
 *   not be completed."
 */
import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import { SecuritySettings } from "../../apps/ui/components/SecuritySettings.js";
import { PhoneProfileCard } from "../../apps/ui/components/PhoneProfileCard.js";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
import { OnboardingEvidence } from "../../apps/ui/components/auth/OnboardingEvidence.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const factor = "11111111-1111-4111-8111-111111111111";
const grant = (action: string, ms: number, target: Record<string, string> = {}) => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, ...target, token: "g".repeat(43), expires_at: new Date(Date.now() + ms).toISOString() } });
const settingsClient = () => ({
  authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: "passkey", label: "My key", created_at: "2026-10-01T10:00:00Z", last_used_at: null, removable: true }], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }),
  phoneProfile: vi.fn().mockResolvedValue({ phone_present: true, phone_masked: "+40 ••• 678", phone_verified: false, updated_at: null }),
  recoveryEmail: vi.fn().mockResolvedValue({ state: "absent", email: null, pending: null }),
  authProviders: vi.fn().mockResolvedValue({ providers: [] }), linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [] }),
  regenerateRecoveryCodes: vi.fn().mockResolvedValue({ codes: Array.from({ length: 10 }, (_, index) => `CODE-${index}`) }),
  listSessions: vi.fn().mockResolvedValue({ sessions: [] }), logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn()
});
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const ENROLMENT_LINK = "enrolment link";
const EXPIRED = "This confirmation expired. Please try again.";

const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
async function render(view: React.ReactNode) { const result = await mount(view); mounted.push(result); return result.host; }
afterEach(async () => { while (mounted.length) { const { root, host } = mounted.pop()!; await unmount(root, host); } });

describe("a timed-out confirmation says the confirmation expired", () => {
  it("in the security settings", async () => {
    const host = await render(<StrictMode><SecuritySettings client={settingsClient() as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" resume={{ authorization: { action: "REMOVE_AUTH_METHOD", target_factor_id: factor }, initialProof: grant("REMOVE_AUTH_METHOD", 60, { target_factor_id: factor }) as never }} /></StrictMode>);
    expect(host.querySelector("[data-resumed-confirm]")).not.toBeNull();
    await wait(120);
    expect(host.querySelector("[role=alert]")?.textContent).toBe(EXPIRED);
    expect(host.textContent).not.toContain(ENROLMENT_LINK);
  });

  it("on the phone card", async () => {
    const host = await render(<PhoneProfileCard catalog={settings} authCatalog={auth} client={settingsClient() as never} resume={{ authorization: { action: "READ_PHONE_PROFILE" }, initialProof: grant("READ_PHONE_PROFILE", 60) as never }} />);
    expect(host.querySelector("[data-resumed-confirm]")).not.toBeNull();
    await wait(120);
    expect(host.querySelector("[role=alert]")?.textContent).toBe(EXPIRED);
  });

  it("on a resumed debate action", async () => {
    const proof = grant("PUBLISH", 60, { target_run_id: "33333333-3333-4333-8333-333333333333" });
    const client = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }) } as never;
    const host = await render(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={publicCatalog} locale="en" client={client} takeProof={() => proof as never} />);
    await wait(120);
    expect(host.querySelector("[role=status]")?.textContent).toBe(EXPIRED);
  });
});

describe("recovery codes say what just happened", () => {
  it("freshly generated codes are introduced as new codes, not as a replaced used code", async () => {
    const client = settingsClient();
    const host = await render(<SecuritySettings client={client as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" resume={{ authorization: { action: "REGENERATE_RECOVERY_CODES" }, initialProof: grant("REGENERATE_RECOVERY_CODES", 300_000) as never }} />);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-resumed-confirm]")!.click());
    expect(client.regenerateRecoveryCodes).toHaveBeenCalledOnce();
    const notice = host.querySelector(".authCodes p")?.textContent ?? "";
    expect(notice).toContain("new recovery codes");
    expect(notice).not.toContain("used recovery code has been replaced");
  });
});

describe("the security check names the actual problem", () => {
  const methods = { methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["password_totp"], step_up_providers: [] };
  async function proveWith(failure: unknown) {
    const client = { authMethods: vi.fn().mockResolvedValue(methods), stepUp: vi.fn().mockRejectedValue(failure) };
    const host = await render(<SecurityConfirmation catalog={auth} client={client} authorization={{ action: "REGENERATE_RECOVERY_CODES" }} onConfirmed={vi.fn()} />);
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === auth["auth.security.passwordMethod"])!.click());
    await input(host, "[name=security-password]", "wrong-password");
    await input(host, "[name=security-code]", "123456");
    expect(client.stepUp).toHaveBeenCalledOnce();
    return host.querySelector("[role=alert]")?.textContent;
  }
  it("a wrong password or code", async () => {
    expect(await proveWith(new ContractHttpError("SESSION_REQUIRED", 401, "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID"))).toBe("The password or the code is not correct. Please check both and try again.");
  });
  it("too many attempts", async () => {
    expect(await proveWith(new ContractHttpError("RATE_LIMITED", 429, "MFA_RATE_LIMITED", "MFA_RATE_LIMITED"))).toBe("Too many attempts. Please wait a few minutes, then try again.");
  });
  it("anything else keeps the general message", async () => {
    expect(await proveWith(new ContractHttpError("SERVER_FAILURE", 503, "AUTH_TEMPORARILY_UNAVAILABLE", "AUTH_TEMPORARILY_UNAVAILABLE"))).toBe(auth["auth.security.unavailable"]);
  });
});

describe("onboarding failures say what went wrong", () => {
  const token = "a".repeat(43);
  const requirements = { status: "pending_mfa", country: "RO", age_confirmation_required: false, legal_acceptance_required: true, terms: { locale: "en", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256, url: "/terms?lang=en" }, privacy: { locale: "en", version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256, url: "/privacy?lang=en" } };
  const UPDATED = "updated while you were reading";
  it("a failed load is not blamed on updated documents", async () => {
    const client = { pendingOnboardingStatus: vi.fn().mockRejectedValue(new ContractHttpError("NETWORK_FAILURE", 0, "offline")), completePendingOnboarding: vi.fn() };
    const host = await render(<OnboardingEvidence authority={{ kind: "pending", token }} locale="en" catalog={auth} client={client as never} onReady={vi.fn()} />);
    expect(host.querySelector("[role=alert]")?.textContent).toBe("This step could not be loaded. Please try again.");
    expect(host.textContent).not.toContain(UPDATED);
  });
  it("documents that changed while reading still say so", async () => {
    const client = { pendingOnboardingStatus: vi.fn().mockResolvedValue({ ...requirements, terms: { ...requirements.terms, sha256: "f".repeat(64) } }), completePendingOnboarding: vi.fn() };
    const host = await render(<OnboardingEvidence authority={{ kind: "pending", token }} locale="en" catalog={auth} client={client as never} onReady={vi.fn()} />);
    expect(host.querySelector("[role=alert]")?.textContent).toContain(UPDATED);
  });
  it.each([
    [new ContractHttpError("UNPROCESSABLE", 409, "LEGAL_DOCUMENT_STALE", "LEGAL_DOCUMENT_STALE"), UPDATED],
    [new ContractHttpError("SERVER_FAILURE", 500, "boom", "UPSTREAM"), "Your answers could not be saved. Please try again."]
  ])("a refused save (%s) says what happened", async (failure, expected) => {
    const client = { pendingOnboardingStatus: vi.fn().mockResolvedValue({ ...requirements, legal_acceptance_required: false, age_confirmation_required: true }), completePendingOnboarding: vi.fn().mockRejectedValue(failure) };
    const host = await render(<OnboardingEvidence authority={{ kind: "pending", token }} locale="en" catalog={auth} client={client as never} onReady={vi.fn()} />);
    await input(host, "[name=dob-d]", "01"); await input(host, "[name=dob-m]", "01"); await input(host, "[name=dob-y]", "1990");
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(client.completePendingOnboarding).toHaveBeenCalledOnce();
    expect(host.querySelector("[role=alert]")?.textContent).toContain(expected);
  });
});
