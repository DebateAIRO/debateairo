// @vitest-environment jsdom
/**
 * S01-C6 (mission italy-clause-approval, PLAN P22): the Italy approval box on social sign-up completion
 * (`/social/complete#kind=signup&token=…`). The same rules as email sign-up: Region Italy shows the box at once
 * with no request, the server's 409 ITALY_APPROVAL_REQUIRED reveals it, and only a shown, ticked box is sent.
 */

// Installed before any import, so the flow's module-level contract client (`@/lib/api`) reaches the network only
// through this spy (ARCH-REV p2 N1).
const network = vi.hoisted(() => {
  const spy = vi.fn(async (..._args: unknown[]): Promise<Response> => { throw new Error("T1_NO_NETWORK"); });
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
});
// A new bot-check token after every reset: the resubmit after the 409 must not reuse the spent one.
vi.mock("@/components/auth/TurnstileChallenge", async () => {
  const { useEffect } = await import("react");
  return {
    TurnstileChallenge: ({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: string | number }) => {
      useEffect(() => onToken(`proof-${resetKey}`), [onToken, resetKey]);
      return null;
    }
  };
});
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
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { ITALY_APPROVAL_CLAUSES } from "@debateai/kernel";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { LegalDocumentsProvider } from "../../apps/ui/components/consent/LegalDocumentsProvider.js";
import { ConsentCatalogProvider } from "../../apps/ui/components/consent/useConsentCatalog.js";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { PRIVACY_POLICY as PRIVACY_IT } from "../../apps/ui/lib/legal/it/privacyPolicy.js";
import { TERMS_OF_SERVICE as TERMS_IT } from "../../apps/ui/lib/legal/it/termsOfService.js";
import english from "../../apps/ui/messages/en/auth.json";
import consentEnglish from "../../apps/ui/messages/en/consent.json";
import { pickRegion } from "../support/signupRegion.js";

const I18nTestContext = createContext<Readonly<{ locale: LocaleCode; catalog: MessageCatalog }> | null>(null);

const TOKEN = "a".repeat(43);
const TURNSTILE = { siteKey: "test-site", nonce: "test-nonce" };
const C1 = english["auth.signUp.italyApproval"];
const HINT = english["auth.signUp.italyApprovalHint"];
const REQUIRED = english["auth.signUp.italyApprovalRequired"];
const SEPARATOR = english["auth.signUp.italyApprovalClauseSeparator"];
const PENDING = { message: "ok", retry_after_seconds: 60 };

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); });
}

async function mount(element: ReactElement): Promise<void> {
  window.history.replaceState(null, "", `/social/complete#kind=signup&token=${TOKEN}`);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
  expect(document.querySelector('input[name="email"]'), "the sign-up form is shown").not.toBeNull();
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

const italyBoxes = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>('input[name="italy-approval"]')];
const italyBox = (): HTMLInputElement => {
  expect(italyBoxes(), "expected exactly one Italy box").toHaveLength(1);
  return italyBoxes()[0]!;
};
const italyLabel = (): HTMLLabelElement => document.querySelector<HTMLLabelElement>('label[for="social-italy-approval"]')!;
const continueButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('form.authForm button[type="submit"]')!;

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

/** Privacy and Terms tick only through their document's own "I have read it". */
async function acknowledge(name: "privacy" | "terms"): Promise<void> {
  await click(field(name));
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find((candidate) => candidate.textContent === "I have read it");
  expect(button, `missing the ${name} acknowledgement`).toBeDefined();
  await click(button!);
  expect(field(name).checked, `${name} ticked`).toBe(true);
}

async function fillValid(country: string): Promise<void> {
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
  await pickRegion(country);
  await settle();
  await acknowledge("privacy");
  await acknowledge("terms");
}

function stubs(completeSocialSignup: Mock = vi.fn().mockResolvedValue(PENDING)) {
  return {
    socialSignupStatus: vi.fn().mockResolvedValue({ provider: "google", email: "person@example.test", name: "Person", expires_at: new Date(Date.now() + 300_000).toISOString() }),
    completeSocialSignup,
    checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" })
  };
}

const italyRefusal = () => new ContractHttpError("FORBIDDEN", 409, "ITALY_APPROVAL_REQUIRED", "ITALY_APPROVAL_REQUIRED");

function expectedLabel(document: LegalDocument): string {
  const items = ITALY_APPROVAL_CLAUSES.map((number) => english["auth.signUp.italyApprovalClause"]
    .replace("{number}", String(number))
    .replace("{title}", document.sections.find((section) => section.no === String(number).padStart(2, "0"))!.title));
  return `${C1} ${items.join(SEPARATOR)}`;
}

const flow = (client: unknown) => <SocialCompleteFlow client={client as ContractClient} turnstile={TURNSTILE}/>;

describe("the Italy approval box on social sign-up completion (S01-C6, P22)", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    await unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("T1 picking Italy shows one unticked box under Terms and reaches no client method and no network", async () => {
    const own = stubs(vi.fn());
    const others = new Map<PropertyKey, Mock>();
    // Every ContractClient method the flow reaches is counted: the stubs, and a recording fake for any other key.
    const client = new Proxy(own, {
      get(target, key) {
        if (key === "then") return undefined;
        if (Object.hasOwn(target, key)) return target[key as keyof typeof target];
        if (!others.has(key)) others.set(key, vi.fn(async () => undefined));
        return others.get(key);
      }
    });
    await mount(flow(client));
    expect(italyBoxes()).toHaveLength(0);
    const calls = (): number => [...Object.values(own), ...others.values()].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    const before = { client: calls(), network: network.mock.calls.length };
    await pickRegion("IT");
    await settle();
    const box = italyBox();
    expect(box.checked).toBe(false);
    expect({ client: calls(), network: network.mock.calls.length }).toEqual(before);
    const rows = [...document.querySelectorAll(".consentGroup > .consentRow")];
    expect(rows).toHaveLength(3);
    expect(rows[1]!.contains(field("terms"))).toBe(true);
    expect(rows[2]!.contains(box)).toBe(true);
  });

  it("T2 picking France shows no box", async () => {
    await mount(flow(stubs()));
    await pickRegion("FR");
    await settle();
    expect(italyBoxes()).toHaveLength(0);
  });

  it("T3 a tick does not survive leaving Italy: Italy, tick, France, Italy shows the box unticked", async () => {
    await mount(flow(stubs()));
    await pickRegion("IT");
    await click(italyBox());
    expect(italyBox().checked).toBe(true);
    await pickRegion("FR");
    await settle();
    expect(italyBoxes()).toHaveLength(0);
    await pickRegion("IT");
    await settle();
    expect(italyBox().checked).toBe(false);
  });

  it("T3b ticking the box, on the box or on its label, opens no document and no window", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await mount(flow(stubs()));
    await pickRegion("IT");
    await click(italyBox());
    expect(italyBox().checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(italyLabel());
    expect(italyBox().checked).toBe(false);
    await click(italyLabel());
    expect(italyBox().checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("T4 Continue with the box unticked shows the hint under the box, focuses it and sends nothing", async () => {
    const client = stubs();
    await mount(flow(client));
    await fillValid("IT");
    await click(continueButton());
    expect(document.querySelector("#social-italy-approval-error")?.textContent).toBe(HINT);
    expect(italyBox().getAttribute("aria-invalid")).toBe("true");
    expect(italyBox().getAttribute("aria-describedby")).toBe("social-italy-approval-error");
    expect(document.activeElement).toBe(italyBox());
    expect(client.completeSocialSignup).not.toHaveBeenCalled();
    await click(italyBox());
    expect(document.querySelector("#social-italy-approval-error")).toBeNull();
  });

  it("T5 the tick is sent as italy_approval: true with Italy, and France sends no italy_approval key", async () => {
    const italy = stubs();
    await mount(flow(italy));
    await fillValid("IT");
    await click(italyBox());
    await click(continueButton());
    expect(italy.completeSocialSignup).toHaveBeenCalledTimes(1);
    expect(italy.completeSocialSignup.mock.calls[0]![0]).toMatchObject({ continuation_token: TOKEN, country: "IT", italy_approval: true });
    await unmount();
    const france = stubs();
    await mount(flow(france));
    await fillValid("FR");
    await click(continueButton());
    expect(france.completeSocialSignup).toHaveBeenCalledTimes(1);
    expect(france.completeSocialSignup.mock.calls[0]![0]).toMatchObject({ country: "FR" });
    expect(Object.hasOwn(france.completeSocialSignup.mock.calls[0]![0] as object, "italy_approval")).toBe(false);
  });

  it("T6 the server's ITALY_APPROVAL_REQUIRED reveals the box unticked, keeps the continuation and every field", async () => {
    const client = stubs(vi.fn().mockRejectedValueOnce(italyRefusal()).mockResolvedValue(PENDING));
    await mount(flow(client));
    await fillValid("FR");
    const region = document.querySelector("#signup-region-value")!.textContent;
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(1);
    expect(italyBox().checked).toBe(false);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(REQUIRED);
    expect(document.activeElement).toBe(italyBox());
    expect(field("email").value).toBe("person@example.test");
    expect(document.querySelector("#signup-region-value")!.textContent).toBe(region);
    expect([field("dob-d").value, field("dob-m").value, field("dob-y").value]).toEqual(["01", "01", "1990"]);
    expect(field("privacy").checked).toBe(true);
    expect(field("terms").checked).toBe(true);
    // Shown and unticked: Continue again sends nothing.
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(1);
    // Ticked: the same continuation, the approval, and a fresh bot-check token (the first was spent on the 409).
    await click(italyBox());
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(2);
    const [first, second] = client.completeSocialSignup.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(first).toMatchObject({ continuation_token: TOKEN });
    expect(Object.hasOwn(first!, "italy_approval")).toBe(false);
    expect(second).toMatchObject({ continuation_token: TOKEN, country: "FR", italy_approval: true });
    expect(second!.turnstile_token).toEqual(expect.any(String));
    expect(second!.turnstile_token).not.toBe(first!.turnstile_token);
  });

  it("T6b once revealed, the box stays shown and unticked when Region changes, and its tick is sent", async () => {
    const client = stubs(vi.fn().mockRejectedValueOnce(italyRefusal()).mockResolvedValue(PENDING));
    await mount(flow(client));
    await fillValid("FR");
    await click(continueButton());
    expect(italyBox().checked).toBe(false);
    await pickRegion("DE");
    await settle();
    expect(italyBox().checked).toBe(false);
    await click(italyBox());
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(2);
    expect(client.completeSocialSignup.mock.calls[1]![0]).toMatchObject({ continuation_token: TOKEN, country: "DE", italy_approval: true });
  });

  it("T7 the label is the box sentence, then the five clauses from the Terms headings, with no §", async () => {
    await mount(flow(stubs()));
    await pickRegion("IT");
    await settle();
    expect(italyLabel().textContent).toBe(expectedLabel(TERMS_OF_SERVICE));
    expect(italyLabel().textContent).not.toContain("§");
  });

  it("T7-it in Italian the clauses come from the Italian Terms the form shows, and that document's pair is sent", async () => {
    const client = stubs();
    await mount(
      <I18nProvider locale="it" catalog={{}}>
        <ConsentCatalogProvider catalog={consentEnglish}>
          <LegalDocumentsProvider locale="it" privacy={PRIVACY_IT} terms={TERMS_IT}>
            {flow(client)}
          </LegalDocumentsProvider>
        </ConsentCatalogProvider>
      </I18nProvider>
    );
    await fillValid("IT");
    expect(italyLabel().textContent).toBe(expectedLabel(TERMS_IT));
    for (const number of ITALY_APPROVAL_CLAUSES) {
      const no = String(number).padStart(2, "0");
      const italian = TERMS_IT.sections.find((section) => section.no === no)!.title;
      expect(italian).not.toBe(TERMS_OF_SERVICE.sections.find((section) => section.no === no)!.title);
      expect(document.querySelector(`.consentClause[data-clause="${number}"]`)?.textContent).toContain(italian);
    }
    await click(italyBox());
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(1);
    expect(client.completeSocialSignup.mock.calls[0]![0]).toMatchObject({
      italy_approval: true,
      terms: { version: TERMS_IT.version, sha256: TERMS_IT.sha256 }
    });
  });

  it("T8 the box's accessible name is its label's text", async () => {
    await mount(flow(stubs()));
    await pickRegion("IT");
    await settle();
    const named = document.getElementById(italyBox().getAttribute("aria-labelledby")!);
    expect(named).toBe(italyLabel());
    expect(named!.textContent).toBe(italyLabel().textContent);
    expect(named!.textContent!.startsWith(C1)).toBe(true);
    expect(italyBox().hasAttribute("aria-label")).toBe(false);
  });

  it("T9 the Italy box and the Privacy and Terms boxes never tick or untick each other", async () => {
    await mount(flow(stubs()));
    await pickRegion("IT");
    await acknowledge("privacy");
    await acknowledge("terms");
    expect(italyBox().checked).toBe(false);
    await click(field("terms"));
    await click(field("privacy"));
    expect([field("privacy").checked, field("terms").checked]).toEqual([false, false]);
    expect(italyBox().checked).toBe(false);
    await acknowledge("privacy");
    await acknowledge("terms");
    await click(italyBox());
    expect(italyBox().checked).toBe(true);
    expect([field("privacy").checked, field("terms").checked]).toEqual([true, true]);
    await click(italyBox());
    expect(italyBox().checked).toBe(false);
    expect([field("privacy").checked, field("terms").checked]).toEqual([true, true]);
  });

  it("T10 the tick is never stored in the browser", async () => {
    const before = { local: localStorage.length, session: sessionStorage.length };
    const client = stubs();
    await mount(flow(client));
    await fillValid("IT");
    await click(italyBox());
    await click(continueButton());
    expect(client.completeSocialSignup).toHaveBeenCalledTimes(1);
    expect({ local: localStorage.length, session: sessionStorage.length }).toEqual(before);
  });
});
