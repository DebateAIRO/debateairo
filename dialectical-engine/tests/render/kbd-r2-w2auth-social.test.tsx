// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-2 and AUTH-4 on /social/complete): the social sign-in's last step under the
// site's focus guard. The form's own checks, region, date of birth and bot check are stood in, as in
// enroll-mfa-lockout.test.tsx; the set-up is the real one.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { pickRegion } from "../support/signupRegion.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

const webauthn = vi.hoisted(() => ({ browser: { authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn(), supportsConditional: vi.fn(async () => false) } }));
vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => webauthn.browser }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/authFormValidation", async (original) => ({ ...await original<typeof import("../../apps/ui/lib/authFormValidation")>(), validateSignup: () => ({}) }));
vi.mock("@debateai/kernel", async (original) => ({ ...await original<typeof import("@debateai/kernel")>(), declaredRegionFromPick: () => ({ country: "RO" }), dobToIso: () => "1990-01-01" }));
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken }: { onToken: (token: string) => void }) => { useEffect(() => onToken("proof"), []); return null; } }; });
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow";

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stop = guarded ? startFocusGuard() : installFocusFixup();
  webauthn.browser.authenticate.mockReset();
});
afterEach(async () => {
  stop();
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

const later = (ms = 300_000) => new Date(Date.now() + ms).toISOString();
async function mount(kind: string, client: Record<string, unknown>, props: Record<string, unknown> = {}) {
  window.history.replaceState(null, "", "/social/complete#kind=" + kind + "&token=" + "a".repeat(43));
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<SocialCompleteFlow client={client as never} onAuthenticated={vi.fn()} onStepUp={vi.fn()} {...props} />); });
  await settled();
}
async function settled() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
  await guardSettled();
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
/** Typing the code from the keyboard: the sixth digit sends it. */
async function typeCode(value: string) {
  const field = document.querySelector<HTMLInputElement>("[name=code]")!;
  await act(async () => {
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: value.at(-1)!, bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settled();
}
const panel = () => document.querySelector<HTMLElement>(".authPanelCore")!;
/** The first control after `from` in page order: where the next Tab goes. */
function nextTabStop(from: Element): Element | undefined {
  const all = [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
  return all.find((node) => from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING && !from.contains(node)) ?? all.find((node) => from.contains(node));
}

const status = (available_methods: string[], expires_at = later()) => ({ expires_at, available_methods, authorization: { action: "CHANGE_EMAIL" } });

it("AUTH-2: a cancelled passkey on the social sign-in gives focus back to its passkey button", async () => {
  webauthn.browser.authenticate.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
  const client = { socialLoginStatus: vi.fn().mockResolvedValue(status(["passkey", "totp"])), beginPasskeyLogin: vi.fn().mockResolvedValue({ challenge_handle: "h", options: {} }), completePasskeyLogin: vi.fn(), completeLogin: vi.fn() };
  await mount("login", client);
  pressByKeyboard(button(auth["auth.passkey.use"]));
  await settled();
  expect(webauthn.browser.authenticate).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.passkey.cancelled"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.passkey.use"]));
});

it("AUTH-4: a confirmed step-up code parks focus on the card, whose first thing is 'done' and its Return button", async () => {
  const grant = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action: "CHANGE_EMAIL", token: "g".repeat(43), expires_at: later() } };
  const client = { socialStepUpStatus: vi.fn().mockResolvedValue(status(["totp"])), completeSocialStepUp: vi.fn().mockResolvedValue(grant) };
  await mount("stepup", client);
  await typeCode("123456");
  expect(client.completeSocialStepUp).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain(auth["auth.security.complete"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(panel());
  expect(nextTabStop(panel())).toBe(button(auth["auth.security.return"]));
});

it("AUTH-4: the flow's time running out under the code field parks focus on the card, whose first thing is the alert", async () => {
  const client = { socialLoginStatus: vi.fn().mockResolvedValue(status(["totp"], later(400))), completeLogin: vi.fn() };
  await mount("login", client);
  const field = document.querySelector<HTMLInputElement>("[name=code]")!;
  act(() => { field.focus(); field.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  await settled();
  expect(document.querySelector("[name=code]")).toBeNull();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(panel());
  expect(panel().firstElementChild?.getAttribute("role")).toBe("alert");
  expect(panel().firstElementChild?.textContent).toBe(auth["auth.enroll.invalidLink"]);
});

const signupClient = (completeSocialSignup: ReturnType<typeof vi.fn>) => ({
  socialSignupStatus: vi.fn().mockResolvedValue({ provider: "google", email: "person@example.com", name: "Person", expires_at: later() }),
  completeSocialSignup,
  authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: [], step_up_providers: [] })
});

it("AUTH-4: Continue on a valid social sign-up swaps in the security set-up and focus lands on its headline", async () => {
  const client = signupClient(vi.fn().mockResolvedValue({ status: "enrollment_required", enrollment_token: "e".repeat(43), expires_at: later() }));
  await mount("signup", client, { turnstile: { siteKey: "site", nonce: "nonce" } });
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(client.completeSocialSignup).toHaveBeenCalledOnce();
  expect(document.querySelector("section.authEnrollment")).not.toBeNull();
  const headline = document.querySelector<HTMLElement>("#auth-title")!;
  expect(headline.textContent).toBe(auth["auth.enroll.securityTitle"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(headline);
});

it("AUTH-4: a social sign-up the server could not create gives focus back to Continue", async () => {
  const client = signupClient(vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down", "UNAVAILABLE")));
  await mount("signup", client, { turnstile: { siteKey: "site", nonce: "nonce" } });
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.creationFailed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.continue"]));
});

it("AUTH-4: a US state the service is not offered in sends focus to the state list", async () => {
  const client = signupClient(vi.fn().mockRejectedValue(new ContractHttpError("FORBIDDEN", 403, "STATE_SIGNUP_UNAVAILABLE", "STATE_SIGNUP_UNAVAILABLE")));
  await mount("signup", client, { turnstile: { siteKey: "site", nonce: "nonce" } });
  await pickRegion("US", "TX");
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(client.completeSocialSignup).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.stateUnavailable"]);
  expect(document.activeElement).toBe(document.querySelector("#signup-region-state"));
});
