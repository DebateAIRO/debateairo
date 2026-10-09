// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 4: screens that left people with no way forward.
 * (a) /enroll-mfa with a missing or used link showed a sentence and nothing to press.
 * (b) The authenticator setup timing out (5 minutes) said "This enrolment link is invalid or expired."
 *     although the link had already been used, and offered nothing; in Settings the setup simply vanished.
 * (c) Sign-in offered no way to ask for the verification email again.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import EnrollMfaPage from "../../apps/ui/app/enroll-mfa/page.js";
import { SecurityEnrollment } from "../../apps/ui/components/auth/SecurityEnrollment.js";
import { SecuritySettings } from "../../apps/ui/components/SecuritySettings.js";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));
vi.mock("@/components/auth/TurnstileChallenge", async () => {
  const { useEffect } = await import("react");
  return { TurnstileChallenge: ({ onToken }: { onToken: (value: string) => void }) => { useEffect(() => onToken("test-proof"), [onToken]); return null; } };
});

const token = "a".repeat(43);
const TIMED_OUT = "Setting up took too long, so it was stopped to keep your account safe. Please start again.";
const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
async function render(view: React.ReactNode) { const result = await mount(view); mounted.push(result); return result.host; }
afterEach(async () => { while (mounted.length) { const { root, host } = mounted.pop()!; await unmount(root, host); } window.history.replaceState(null, "", "/"); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === text);
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

describe("(a) a missing or used enrolment link leads back to sign-in", () => {
  it("shows Back to sign in, pointing at /login", async () => {
    window.history.replaceState(null, "", "/enroll-mfa");
    const host = await render(<EnrollMfaPage />);
    expect(host.querySelector("[role=alert]")?.textContent).toBe(auth["auth.enroll.invalidLink"]);
    const back = [...host.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === "Back to sign in");
    expect(back?.getAttribute("href")).toBe("/login");
  });
});

describe("(b) a timed-out authenticator setup says so and can start again", () => {
  const totpClient = () => ({ beginTotpEnrollment: vi.fn().mockImplementation(async () => ({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Example:person?secret=JBSWY3DPEHPK3PXP&issuer=Example", enrollment_token: "e".repeat(43), expires_at: new Date(Date.now() + 60).toISOString() })) });

  it("on the enrolment page: the right sentence, then Start again reopens the choice", async () => {
    const client = totpClient();
    const host = await render(<SecurityEnrollment catalog={auth} client={client as never} authority={{ kind: "pending", token }} />);
    await act(async () => button(host, auth["auth.enroll.useAuthenticator"])!.click());
    expect(host.querySelector("#enrollment-code")).not.toBeNull();
    await wait(120);
    expect(host.querySelector("[role=alert]")?.textContent).toBe(TIMED_OUT);
    expect(host.textContent).not.toContain("enrolment link");
    await act(async () => button(host, "Start again")!.click());
    await act(async () => button(host, auth["auth.enroll.useAuthenticator"])!.click());
    expect(client.beginTotpEnrollment).toHaveBeenCalledTimes(2);
    expect(host.querySelector("#enrollment-code")).not.toBeNull();
  });

  it("in Settings: the setup closes with the same sentence instead of vanishing", async () => {
    const factor = "11111111-1111-4111-8111-111111111111";
    const client = {
      ...totpClient(),
      authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: "passkey", label: "My key", created_at: "2026-10-01T10:00:00Z", last_used_at: null, removable: true }], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }),
      phoneProfile: vi.fn().mockResolvedValue({ phone_present: false, phone_masked: null, phone_verified: false, updated_at: null }),
      recoveryEmail: vi.fn().mockResolvedValue({ state: "absent", email: null, pending: null }),
      authProviders: vi.fn().mockResolvedValue({ providers: [] }), linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [] }),
      listSessions: vi.fn().mockResolvedValue({ sessions: [] }), logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn()
    };
    const proof = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action: "ADD_TOTP", token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } };
    const host = await render(<SecuritySettings client={client as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" resume={{ authorization: { action: "ADD_TOTP" }, initialProof: proof as never }} />);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-resumed-confirm]")!.click());
    const setup = host.querySelector<HTMLElement>('section[aria-label="Protect your account"]')!;
    await act(async () => button(setup, auth["auth.enroll.useAuthenticator"])!.click());
    expect(host.querySelector("#enrollment-code")).not.toBeNull();
    await wait(120);
    expect(host.querySelector("#enrollment-code")).toBeNull();
    expect([...host.querySelectorAll("[role=alert]")].map((alert) => alert.textContent)).toContain(TIMED_OUT);
  });
});

describe("(c) sign-in offers to send the verification email again", () => {
  const turnstile = { siteKey: "1x00000000000000000000AA", nonce: "abcdefghijklmnopqrstuv==" };
  const RESEND_ENTRY = "Didn't get the verification email? Send it again";

  it("is visible on the sign-in screen and sends to the address typed", async () => {
    const resendVerification = vi.fn().mockResolvedValue({ message: "sent", retry_after_seconds: 60 });
    const client = { beginLogin: vi.fn(), completeLogin: vi.fn(), resendVerification };
    const host = await render(<LoginFlow client={client} turnstile={turnstile} />);
    await act(async () => button(host, RESEND_ENTRY)!.click());
    const field = host.querySelector<HTMLInputElement>("#resend-email")!;
    expect(field.getAttribute("autocomplete")).toBe("email");
    expect(document.activeElement).toBe(field);
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(field.getAttribute("aria-invalid")).toBe("true");
    await input(host, "#resend-email", "person@example.test");
    await act(async () => host.querySelector("form")!.requestSubmit());
    expect(host.textContent).toContain("person@example.test");
    const resend = host.querySelector<HTMLButtonElement>('button[data-action="resend"]')!;
    expect(resend.disabled).toBe(false);
    await act(async () => resend.click());
    expect(resendVerification).toHaveBeenCalledOnce();
    expect(resendVerification.mock.calls[0]![0]).toMatchObject({ email: "person@example.test", turnstile_token: "test-proof" });
    expect(client.beginLogin).not.toHaveBeenCalled();
  });

  /*
   * Review fix (2026-10-09): after "Continue" the screen said "Create an account" / "Check your email",
   * as if a link had been sent, while nothing had been. It now names what it does ("Send the verification
   * email again", button "Send email"), takes focus to its heading, and only after a send says, in the
   * same words for every address (the server always answers 202), that a link is on its way.
   */
  async function resendScreen(resendVerification = vi.fn().mockResolvedValue({ message: "sent", retry_after_seconds: 60 })) {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn(), resendVerification }} turnstile={turnstile} />);
    await act(async () => button(host, RESEND_ENTRY)!.click());
    await input(host, "#resend-email", "person@example.test");
    await act(async () => host.querySelector("form")!.requestSubmit());
    return host;
  }
  const SENT = auth["auth.pending.resendSent"];

  it("before sending, says what it will do and not that anything was sent", async () => {
    const host = await resendScreen();
    const heading = host.querySelector("h1")!;
    expect(heading.textContent).toBe("Send the verification email again");
    expect(document.activeElement).toBe(heading);
    expect(host.querySelector(".authEyebrow")?.textContent).not.toBe(auth["auth.signUp.eyebrow"]);
    expect(host.textContent).not.toContain(auth["auth.pending.title"]);
    expect(host.querySelector<HTMLButtonElement>('button[data-action="resend"]')?.textContent).toBe("Send email");
    expect(host.textContent).not.toContain(SENT);
  });

  it("after a send, says a link is on its way and announces it", async () => {
    const host = await resendScreen();
    await act(async () => host.querySelector<HTMLButtonElement>('button[data-action="resend"]')!.click());
    await wait(250);
    expect(SENT).toBe("If this address has an account waiting for verification, a new link is on its way. Check your spam folder too.");
    expect(host.querySelector("p.authFinePrint")?.textContent).toBe(SENT);
    expect([...host.querySelectorAll('[aria-live="polite"]')].map((region) => region.textContent)).toContain(SENT);
  });

  it("a failed send does not claim anything was sent", async () => {
    const host = await resendScreen(vi.fn().mockRejectedValue(new Error("offline")));
    await act(async () => host.querySelector<HTMLButtonElement>('button[data-action="resend"]')!.click());
    await wait(250);
    expect(host.textContent).not.toContain(SENT);
    expect(host.querySelector("[role=alert]")?.textContent).toBe(auth["auth.pending.unavailable"]);
  });

  it("Back to sign in returns to the password form", async () => {
    const host = await render(<LoginFlow client={{ beginLogin: vi.fn(), completeLogin: vi.fn(), resendVerification: vi.fn() }} turnstile={turnstile} />);
    await act(async () => button(host, RESEND_ENTRY)!.click());
    await act(async () => button(host, "Back to sign in")!.click());
    expect(host.querySelector("[name=password]")).not.toBeNull();
  });
});
