// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 6: words ordinary people understand.
 * - Removing a passkey, the recovery email or a linked sign-in provider said "Revoke".
 * - The authenticator-recovery screens spoke jargon ("bounded confirmation receipt",
 *   "Delivery-provider verification alone does not qualify").
 * - Sign-in listed three recovery links side by side; now one "Can't sign in?" opens the choices,
 *   each with one plain sentence.
 * - Sign-up's Create account stayed disabled with no hint until both consent boxes were ticked (and a
 *   region chosen). The disabled state is owner ruling V-18 (R17), so the button keeps it and says why.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import mfaEnglish from "../../apps/ui/messages/en/mfa-recovery.json";
import mfaRomanian from "../../apps/ui/messages/ro/mfa-recovery.json";
import { SecuritySettings } from "../../apps/ui/components/SecuritySettings.js";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { MfaRecoveryFlow } from "../../apps/ui/components/MfaRecoveryFlow.js";
import { BackupEmailConfirmation } from "../../apps/ui/components/BackupEmailVerification.js";
import { pickRegion } from "../support/signupRegion.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
async function render(view: React.ReactNode) { const result = await mount(view); mounted.push(result); return result.host; }
afterEach(async () => { while (mounted.length) { const { root, host } = mounted.pop()!; await unmount(root, host); } window.history.replaceState(null, "", "/"); });

describe("removing a sign-in method says Remove", () => {
  it("for a passkey, the recovery email and a linked provider", async () => {
    const factor = "11111111-1111-4111-8111-111111111111";
    const client = {
      authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: "passkey", label: "My key", created_at: "2026-10-01T10:00:00Z", last_used_at: null, removable: true }], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }),
      phoneProfile: vi.fn().mockResolvedValue({ phone_present: false, phone_masked: null, phone_verified: false, updated_at: null }),
      recoveryEmail: vi.fn().mockResolvedValue({ state: "verified", email: "r***@example.test", pending: null }),
      authProviders: vi.fn().mockResolvedValue({ providers: [{ id: "google", name: "Google" }] }),
      linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [{ provider: "google", removable: true }] }),
      listSessions: vi.fn().mockResolvedValue({ sessions: [] }), logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn()
    };
    const host = await render(<SecuritySettings client={client as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" />);
    // The session list (empty here) keeps its own "Revoke"; every other removal reads "Remove".
    const labels = [...host.querySelectorAll("button.setBtnRevoke")].map((button) => button.textContent);
    expect(labels).toEqual(["Remove", "Remove", "Remove"]);
  });
});

describe("sign-in has one Can't sign in? entry", () => {
  it("opens three choices, each a link with one plain sentence", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />);
    const help = host.querySelector("details")!;
    expect(help.querySelector("summary")?.textContent).toBe("Can't sign in?");
    expect(help.open).toBe(false);
    const choices = [...help.querySelectorAll("li")].map((item) => ({ href: item.querySelector("a")?.getAttribute("href"), sentence: item.querySelector("p")?.textContent ?? "" }));
    expect(choices.map((choice) => choice.href)).toEqual(["/reset-password", "/recover-authenticator", "/recover"]);
    for (const choice of choices) expect(choice.sentence.length).toBeGreaterThan(20);
    const outside = [...host.querySelectorAll("a")].filter((link) => !help.contains(link)).map((link) => link.getAttribute("href"));
    expect(outside).not.toContain("/reset-password");
    expect(outside).not.toContain("/recover-authenticator");
    expect(outside).not.toContain("/recover");
    expect(host.textContent).not.toContain("Recovery access");
  });
});

// Review copy tweaks (2026-10-09): the code message says what to do, and the recovery-code choice opens with
// the situation it is for.
describe("sign-in copy says what to do", () => {
  it("a code that is not six digits", async () => {
    const client = { beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required", challenge_token: "a".repeat(43), available_methods: ["totp"] }), completeLogin: vi.fn() };
    const host = await render(<LoginFlow client={client} onAuthenticated={vi.fn()} />);
    await input(host, "[name=email]", "person@example.test");
    await input(host, "[name=password]", "existing-password");
    await act(async () => host.querySelector("form")!.requestSubmit());
    await input(host, "[name=code]", "12a");
    expect(host.querySelector("#login-code-error")?.textContent).toBe("Enter only the 6 digits (spaces are fine).");
  });

  it("the recovery-code choice under Can't sign in?", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn() }} />);
    const recover = [...host.querySelectorAll("details li")].find((item) => item.querySelector("a")?.getAttribute("href") === "/recover");
    expect(recover?.querySelector("p")?.textContent).toBe("Lost both your password and authenticator? Use a recovery code you saved, plus a link we email you.");
  });
});

describe("sign-up explains a disabled Create account", () => {
  it("names what is missing and stops naming it once done", async () => {
    const host = await render(<SignUpFlow client={{ register: vi.fn(), checkAge: vi.fn() }} />);
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === "Create account")!;
    expect(button.disabled).toBe(true);
    const hint = () => (button.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(hint()).toContain("Choose your region");
    expect(hint()).toContain("tick both boxes");
    await pickRegion("RO");
    expect(hint()).not.toContain("Choose your region");
    expect(hint()).toContain("tick both boxes");
  });
});

describe("authenticator recovery speaks plainly", () => {
  const JARGON = /bounded|receipt|delivery-provider|qualif|eligib|credential recovery|bound to|closure|existing time limit/iu;
  it.each([["en", mfaEnglish], ["ro", mfaRomanian]] as const)("the request screen (%s)", async (locale, catalog) => {
    const host = await render(<MfaRecoveryFlow locale={locale} catalog={catalog} client={{ status: vi.fn().mockRejectedValue(new Error("none")) } as never} />);
    expect(host.querySelector("select")).not.toBeNull();
    expect(host.textContent).not.toMatch(JARGON);
    expect(host.textContent).not.toMatch(/eligibil|asociată contului|furnizorului de email/iu);
  });

  it("a backup-email confirmation whose result is unknown", async () => {
    window.history.replaceState(null, "", `/verify-backup-email#token=${"t".repeat(43)}`);
    const client = { confirm: vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom")) } as never;
    const host = await render(<BackupEmailConfirmation client={client} />);
    await act(async () => host.querySelector<HTMLButtonElement>("button.authPrimary")!.click());
    expect(host.querySelector("[role=alert]")?.textContent).toBeTruthy();
    expect(host.textContent).not.toMatch(JARGON);
  });

  // Most recovery phases need a mailed link and a live server to reach; their sentences are read here.
  it.each(["en", "ro"])("no recovery or password-reset sentence uses the jargon (%s)", (locale) => {
    for (const name of ["mfa-recovery", "password-reset"]) {
      const catalog = JSON.parse(readFileSync(`apps/ui/messages/${locale}/${name}.json`, "utf8")) as Record<string, string>;
      const offending = Object.entries(catalog).filter(([, value]) => JARGON.test(value) || /eligibil|asociată contului|furnizorului de email|dovedește închiderea/iu.test(value));
      expect(offending, `${locale}/${name}`).toEqual([]);
    }
  });
});
