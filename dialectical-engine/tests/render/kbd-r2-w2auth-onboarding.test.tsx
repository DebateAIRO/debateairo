// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-7, AUTH-8): the documents/age step before the MFA set-up, on /enroll-mfa
// and on its own, under the site's focus guard. The step and the set-up are the real ones; the API is stood in with the
// requirements of auth-wrong-messages.test.tsx, the route's link and language as in enroll-mfa-lockout.test.tsx.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

const api = vi.hoisted(() => ({ pendingOnboardingStatus: vi.fn(), completePendingOnboarding: vi.fn() }));
vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: {} }) }));
vi.mock("@/lib/mfaEnrollment", () => ({ takeFragmentToken: () => "t".repeat(43), verifyMfaEmail: async () => undefined, MfaEnrollmentHttpError: class extends Error {} }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("../../apps/ui/lib/api")>(), contractClient: api }));
import EnrollMfaPage from "../../apps/ui/app/enroll-mfa/page";
import { OnboardingEvidence } from "../../apps/ui/components/auth/OnboardingEvidence";

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
const requirements = { status: "pending_mfa", country: "RO", age_confirmation_required: true, legal_acceptance_required: false, terms: { locale: "en", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256, url: "/terms?lang=en" }, privacy: { locale: "en", version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256, url: "/privacy?lang=en" } };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stop = guarded ? startFocusGuard() : installFocusFixup();
  api.pendingOnboardingStatus.mockReset().mockResolvedValue(requirements);
  api.completePendingOnboarding.mockReset();
});
afterEach(async () => {
  stop();
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(view: ReactNode) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(view); });
  await settled();
}
async function settled() {
  await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
  await guardSettled();
}
async function type(name: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fillBirth() { await type("dob-d", "01"); await type("dob-m", "01"); await type("dob-y", "1990"); }
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
/** The first control after `from` in page order: where the next Tab goes. */
function nextTabStop(from: Element): Element | undefined {
  const all = [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
  return all.find((node) => (from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
}

it("AUTH-7: Continue on the age step of /enroll-mfa parks focus on the card, whose first thing is the set-up", async () => {
  api.completePendingOnboarding.mockResolvedValue(undefined);
  await mount(<EnrollMfaPage />);
  await fillBirth();
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(api.completePendingOnboarding).toHaveBeenCalledOnce();
  const card = document.querySelector<HTMLElement>(".authPanelCore")!;
  expect(card.querySelector("section.authEnrollment")).not.toBeNull();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(card);
  // The headline stays "Protect your account" across the swap; the next Tab is the set-up's first way in.
  expect(document.querySelector("#auth-title")?.textContent).toBe(auth["auth.enroll.securityTitle"]);
  expect(nextTabStop(card)).toBe(button(auth["auth.passkey.create"]));
});

const evidence = () => <OnboardingEvidence authority={{ kind: "pending", token: "a".repeat(43) }} locale="en" catalog={auth} client={api as never} onReady={vi.fn()} />;

it("AUTH-8: a save that failed gives focus back to Continue, which tries again", async () => {
  api.completePendingOnboarding.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom", "UPSTREAM"));
  await mount(evidence());
  await fillBirth();
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.onboarding.saveFailed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.continue"]));
});

it("AUTH-8: documents updated meanwhile send focus to Try again, which loads the current ones", async () => {
  api.completePendingOnboarding.mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 409, "LEGAL_DOCUMENT_STALE", "LEGAL_DOCUMENT_STALE"));
  await mount(evidence());
  await fillBirth();
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.documentsUpdated"]);
  expect(document.activeElement).toBe(button(auth["auth.onboarding.tryAgain"]));
});

it("AUTH-8: Try again parks focus on the step, which says it is loading and then shows the form", async () => {
  api.pendingOnboardingStatus.mockRejectedValueOnce(new ContractHttpError("NETWORK_FAILURE", 0, "offline"));
  await mount(evidence());
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.onboarding.loadFailed"]);
  let release!: () => void;
  api.pendingOnboardingStatus.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(requirements); }));
  pressByKeyboard(button(auth["auth.onboarding.tryAgain"]));
  await settled();
  const step = document.querySelector<HTMLElement>("main section section, .authPanelCore > section, main > section")!;
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement?.tagName).toBe("SECTION");
  expect(document.activeElement?.querySelector("[role=status]")?.textContent).toBe(auth["auth.enroll.verifyingEmail"]);
  await act(async () => release());
  await settled();
  expect(step.querySelector("form")).not.toBeNull();
  expect(nextTabStop(document.activeElement!)).toBe(document.querySelector("[name=dob-d]"));
});
