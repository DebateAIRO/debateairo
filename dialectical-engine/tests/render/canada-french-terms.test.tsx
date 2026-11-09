// @vitest-environment jsdom
/**
 * Canada at sign-up (owner ruling, 2 November 2026; docs/missions/canada-french-terms/PROMPT.md). A person who picks
 * Canada in the Region field reads the Terms of Service and the Privacy Policy in French first, whatever the page
 * language, with a "Continue in English" button at the top of either document that moves both to English (and
 * "Lire en français" back). The request names the language of the pair it sends; a tick does not survive a change
 * of document. The same rules hold on email sign-up and on social sign-up completion.
 */

// Installed before any import, so the flows' module-level contract client reaches the network only through this spy.
const network = vi.hoisted(() => {
  const spy = vi.fn(async (..._args: unknown[]): Promise<Response> => { throw new Error("T1_NO_NETWORK"); });
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
});
vi.mock("@/components/auth/TurnstileChallenge", async () => {
  const { useEffect } = await import("react");
  return {
    TurnstileChallenge: ({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: string | number }) => {
      useEffect(() => onToken(`proof-${resetKey}`), [onToken, resetKey]);
      return null;
    }
  };
});
// The German-page case renders inside a German I18n provider; every other case reads the render stub's English.
vi.mock("@/lib/i18n/I18nProvider", async (importOriginal) => {
  const original = await importOriginal<typeof import("./stubs/i18n-provider.js")>();
  return {
    I18nProvider({ locale, catalog, children }: Readonly<{ locale: LocaleCode; catalog: MessageCatalog; children: ReactNode }>) {
      return <I18nTestContext.Provider value={{ locale, catalog }}>{children}</I18nTestContext.Provider>;
    },
    useChromeI18n() {
      return useContext(I18nTestContext) ?? original.useChromeI18n();
    }
  };
});

import { act, createContext, useContext, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ContractClient } from "@debateai/contract";
import { resolveSignUpDocuments } from "../../apps/api/src/legal.js";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { LegalDocumentsProvider } from "../../apps/ui/components/consent/LegalDocumentsProvider.js";
import { PrivacyPolicyModal } from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { TermsOfServiceModal } from "../../apps/ui/components/consent/TermsOfServiceModal.js";
import { ConsentCatalogProvider } from "../../apps/ui/components/consent/useConsentCatalog.js";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY as PRIVACY_DE } from "../../apps/ui/lib/legal/de/privacyPolicy.js";
import { TERMS_OF_SERVICE as TERMS_DE } from "../../apps/ui/lib/legal/de/termsOfService.js";
import { PRIVACY_POLICY as PRIVACY_FR } from "../../apps/ui/lib/legal/fr/privacyPolicy.js";
import { TERMS_OF_SERVICE as TERMS_FR } from "../../apps/ui/lib/legal/fr/termsOfService.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json";
import { pickRegion } from "../support/signupRegion.js";

const I18nTestContext = createContext<Readonly<{ locale: LocaleCode; catalog: MessageCatalog }> | null>(null);

const TOKEN = "a".repeat(43);
const TURNSTILE = { siteKey: "test-site", nonce: "test-nonce" };
const ACCEPTED = { message: "ok", retry_after_seconds: 60 };
const CONTINUE_IN_ENGLISH = "Continue in English";
const LIRE_EN_FRANCAIS = "Lire en français";

let root: Root | null = null;

const pair = (document: LegalDocument) => ({ version: document.version, sha256: document.sha256 });

/** The server checks both pairs under the request's one locale: it must accept them, and record this language. */
function expectServerAccepts(request: unknown, recorded: string): void {
  const sent = request as Readonly<{ terms: ReturnType<typeof pair>; privacy: ReturnType<typeof pair>; locale: string }>;
  const resolved = resolveSignUpDocuments({ terms: sent.terms, privacy: sent.privacy, locale: sent.locale });
  expect(resolved, "the server accepts the pair the flow sent").not.toBeNull();
  expect([resolved!.terms.locale, resolved!.privacy.locale]).toEqual([recorded, recorded]);
}

async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); });
}

/** A locale's documents load as their own chunk: wait, inside act, until the screen shows what is expected. */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 100 && !check(); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
  expect(check(), what).toBe(true);
}

async function render(element: ReactElement): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
}

async function unmount(): Promise<void> {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing ${name}`).not.toBeNull();
  return input!;
}

async function type(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settle();
}

const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const dialogTitle = (): string | null => dialog()?.querySelector(".policyTitle")?.textContent ?? null;
const switchButtons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] .policyLanguage button')];
const switchButton = (): HTMLButtonElement => {
  expect(switchButtons(), "exactly one language switch").toHaveLength(1);
  return switchButtons()[0]!;
};
const namedSwitches = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .filter((button) => button.textContent === CONTINUE_IN_ENGLISH || button.textContent === LIRE_EN_FRANCAIS);

/** The switch sits at the top of the document text, above the jumps and the first section. */
function expectSwitchAtTop(name: string, lang: "en" | "fr"): HTMLButtonElement {
  const button = switchButton();
  expect(button.tagName).toBe("BUTTON");
  expect(button.type).toBe("button");
  expect(button.textContent).toBe(name);
  expect(button.getAttribute("lang")).toBe(lang);
  const body = dialog()!.querySelector<HTMLElement>(".policyBody")!;
  expect(body.firstElementChild!.contains(button), "the first thing in the document text").toBe(true);
  const jumps = body.querySelector(".policyJumps")!;
  expect(button.compareDocumentPosition(jumps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  return button;
}

async function readAndAccept(): Promise<void> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find((candidate) => candidate.textContent === "I have read it");
  expect(button, "the acknowledgement").toBeDefined();
  await click(button!);
  expect(dialog()).toBeNull();
}

async function closeDocument(): Promise<void> {
  await click(dialog()!.querySelector<HTMLButtonElement>(".policyClose")!);
  expect(dialog()).toBeNull();
}

/** Both flows open each document from the link inside its consent sentence: Privacy first, then Terms. */
async function openDocument(kind: "privacy" | "terms", title: string): Promise<void> {
  const links = [...document.querySelectorAll<HTMLButtonElement>(".consentGroup .consentPolicyLink")];
  expect(links).toHaveLength(2);
  await click(links[kind === "privacy" ? 0 : 1]!);
  await until(() => dialogTitle() === title, `the ${kind} document shows "${title}"`);
}

/** A page in another language: its own I18n provider and the documents the server sent for it. */
type Page = (flow: ReactElement) => ReactElement;
const germanPage: Page = (flow) => (
  <I18nProvider locale="de" catalog={{}}>
    <ConsentCatalogProvider catalog={consentEnglish}>
      <LegalDocumentsProvider locale="de" privacy={PRIVACY_DE} terms={TERMS_DE}>{flow}</LegalDocumentsProvider>
    </ConsentCatalogProvider>
  </I18nProvider>
);
const englishPage: Page = (flow) => flow;

type Flow = Readonly<{
  name: string;
  boxes: Readonly<{ privacy: string; terms: string }>;
  mount(page?: Page): Promise<Mock>;
  fill(): Promise<void>;
  submit(): Promise<void>;
}>;

const emailFlow: Flow = {
  name: "email sign-up",
  boxes: { privacy: "privacy-accepted", terms: "terms-accepted" },
  async mount(page = englishPage) {
    const register = vi.fn().mockResolvedValue(ACCEPTED);
    await render(page(<SignUpFlow turnstile={TURNSTILE} client={{ checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" }), register }}/>));
    return register;
  },
  async fill() {
    await type("dob-d", "01");
    await type("dob-m", "01");
    await type("dob-y", "1990");
    await type("email", "person@example.test");
    await type("password", "Correct horse 7!");
  },
  async submit() {
    await click(document.querySelector<HTMLButtonElement>('form[data-form="signup"] button.authPrimary')!);
    await settle();
  }
};

const socialFlow: Flow = {
  name: "social sign-up completion",
  boxes: { privacy: "privacy", terms: "terms" },
  async mount(page = englishPage) {
    window.history.replaceState(null, "", `/social/complete#kind=signup&token=${TOKEN}`);
    const completeSocialSignup = vi.fn().mockResolvedValue(ACCEPTED);
    const client = {
      socialSignupStatus: vi.fn().mockResolvedValue({ provider: "google", email: "person@example.test", name: "Person", expires_at: new Date(Date.now() + 300_000).toISOString() }),
      completeSocialSignup,
      checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" })
    };
    await render(page(<SocialCompleteFlow client={client as unknown as ContractClient} turnstile={TURNSTILE}/>));
    await settle();
    expect(document.querySelector('input[name="email"]'), "the sign-up form is shown").not.toBeNull();
    return completeSocialSignup;
  },
  async fill() {
    await type("dob-d", "01");
    await type("dob-m", "01");
    await type("dob-y", "1990");
  },
  async submit() {
    await click(document.querySelector<HTMLButtonElement>('form.authForm button[type="submit"]')!);
    await settle();
  }
};

describe.each([emailFlow, socialFlow])("Canada at sign-up: Terms and Privacy in French first ($name)", (flow) => {
  const box = (kind: "privacy" | "terms"): HTMLInputElement => field(flow.boxes[kind]);

  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    await unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Canada, page in English: both documents open in French under a Continue in English button, and the French pair is sent", async () => {
    const submitted = await flow.mount();
    await flow.fill();
    await pickRegion("CA");
    await settle();

    await openDocument("privacy", PRIVACY_FR.title);
    expectSwitchAtTop(CONTINUE_IN_ENGLISH, "en");
    expect(dialog()!.querySelector(".policyBody")!.getAttribute("lang")).toBe("fr");
    await readAndAccept();
    await openDocument("terms", TERMS_FR.title);
    expectSwitchAtTop(CONTINUE_IN_ENGLISH, "en");
    await readAndAccept();
    expect([box("privacy").checked, box("terms").checked]).toEqual([true, true]);

    await flow.submit();
    expect(submitted).toHaveBeenCalledTimes(1);
    const request = submitted.mock.calls[0]![0];
    expect(request).toMatchObject({ country: "CA", terms: pair(TERMS_FR), privacy: pair(PRIVACY_FR), locale: "fr", ui_locale: "en" });
    expectServerAccepts(request, "fr");
  });

  it("Canada, Continue in English pressed: both documents show English under Lire en français, focus stays on the switch, and the English pair is sent", async () => {
    const submitted = await flow.mount();
    await flow.fill();
    await pickRegion("CA");
    await settle();

    await openDocument("terms", TERMS_FR.title);
    const button = expectSwitchAtTop(CONTINUE_IN_ENGLISH, "en");
    await act(async () => button.focus());
    await click(button);
    await until(() => dialogTitle() === TERMS_OF_SERVICE.title, "the Terms in English");
    expect(expectSwitchAtTop(LIRE_EN_FRANCAIS, "fr")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(dialog()!.querySelector(".policyBody")!.getAttribute("lang")).toBe("en");
    await readAndAccept();

    await openDocument("privacy", PRIVACY_POLICY.title);
    expectSwitchAtTop(LIRE_EN_FRANCAIS, "fr");
    await readAndAccept();

    await flow.submit();
    expect(submitted).toHaveBeenCalledTimes(1);
    const request = submitted.mock.calls[0]![0];
    expect(request).toMatchObject({ country: "CA", terms: pair(TERMS_OF_SERVICE), privacy: pair(PRIVACY_POLICY), locale: "en", ui_locale: "en" });
    expectServerAccepts(request, "en");
  });

  it("Lire en français brings both documents back to French", async () => {
    await flow.mount();
    await pickRegion("CA");
    await settle();
    await openDocument("privacy", PRIVACY_FR.title);
    await click(switchButton());
    await until(() => dialogTitle() === PRIVACY_POLICY.title, "the Privacy Policy in English");
    await click(switchButton());
    await until(() => dialogTitle() === PRIVACY_FR.title, "the Privacy Policy in French again");
    expectSwitchAtTop(CONTINUE_IN_ENGLISH, "en");
    await closeDocument();
    await openDocument("terms", TERMS_FR.title);
  });

  it("any other country: no switch, the page language's documents, and the request as before", async () => {
    const submitted = await flow.mount();
    await flow.fill();
    await pickRegion("RO");
    await settle();

    await openDocument("privacy", PRIVACY_POLICY.title);
    expect(namedSwitches()).toHaveLength(0);
    expect(document.querySelector(".policyLanguage")).toBeNull();
    expect(dialog()!.querySelector(".policyBody")!.hasAttribute("lang")).toBe(false);
    await readAndAccept();
    await openDocument("terms", TERMS_OF_SERVICE.title);
    expect(namedSwitches()).toHaveLength(0);
    await readAndAccept();

    await flow.submit();
    expect(submitted.mock.calls[0]![0]).toMatchObject({ country: "RO", terms: pair(TERMS_OF_SERVICE), privacy: pair(PRIVACY_POLICY), locale: "en", ui_locale: "en" });
    expectServerAccepts(submitted.mock.calls[0]![0], "en");
  });

  it("changing Region to or from Canada after ticking unticks both boxes", async () => {
    await flow.mount();
    await pickRegion("CA");
    await settle();
    await openDocument("privacy", PRIVACY_FR.title);
    await readAndAccept();
    await openDocument("terms", TERMS_FR.title);
    await readAndAccept();
    expect([box("privacy").checked, box("terms").checked]).toEqual([true, true]);

    await pickRegion("RO");
    await settle();
    expect([box("privacy").checked, box("terms").checked]).toEqual([false, false]);

    await openDocument("privacy", PRIVACY_POLICY.title);
    await readAndAccept();
    expect(box("privacy").checked).toBe(true);
    await pickRegion("CA");
    await settle();
    expect([box("privacy").checked, box("terms").checked]).toEqual([false, false]);
  });

  it("switching between French and English after ticking unticks both boxes", async () => {
    await flow.mount();
    await pickRegion("CA");
    await settle();
    await openDocument("privacy", PRIVACY_FR.title);
    await readAndAccept();
    await openDocument("terms", TERMS_FR.title);
    await readAndAccept();
    expect([box("privacy").checked, box("terms").checked]).toEqual([true, true]);

    await openDocument("terms", TERMS_FR.title);
    await click(switchButton());
    await until(() => dialogTitle() === TERMS_OF_SERVICE.title, "the Terms in English");
    await closeDocument();
    expect([box("privacy").checked, box("terms").checked]).toEqual([false, false]);
  });

  it("Canada, page in German: the documents still open in French, the request sends French under locale fr and keeps ui_locale de", async () => {
    const submitted = await flow.mount(germanPage);
    await flow.fill();
    await pickRegion("CA");
    await settle();
    await openDocument("privacy", PRIVACY_FR.title);
    expectSwitchAtTop(CONTINUE_IN_ENGLISH, "en");
    await readAndAccept();
    await openDocument("terms", TERMS_FR.title);
    await readAndAccept();
    await flow.submit();
    expect(submitted.mock.calls[0]![0]).toMatchObject({ terms: pair(TERMS_FR), privacy: pair(PRIVACY_FR), locale: "fr", ui_locale: "de" });
    expectServerAccepts(submitted.mock.calls[0]![0], "fr");
  });
});

describe("the documents opened outside sign-up have no language switch", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
  });

  it("the footer's read mode shows no switch, for either document", async () => {
    await render(<TermsOfServiceModal open mode="read" onClose={vi.fn()}/>);
    expect(dialogTitle()).toBe(TERMS_OF_SERVICE.title);
    expect(namedSwitches()).toHaveLength(0);
    await unmount();
    await render(<PrivacyPolicyModal open mode="read" onClose={vi.fn()}/>);
    expect(dialogTitle()).toBe(PRIVACY_POLICY.title);
    expect(namedSwitches()).toHaveLength(0);
  });

  it("read mode shows no switch even when one is handed to it, and consent mode without one shows none", async () => {
    const languageSwitch = { lang: "en" as const, name: CONTINUE_IN_ENGLISH, onSwitch: vi.fn() };
    await render(<TermsOfServiceModal open mode="read" locale="fr" languageSwitch={languageSwitch} onClose={vi.fn()}/>);
    await until(() => dialogTitle() === TERMS_FR.title, "the Terms in French");
    expect(namedSwitches()).toHaveLength(0);
    await unmount();
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()}/>);
    expect(namedSwitches()).toHaveLength(0);
  });
});

void network;
