// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "../../apps/ui/app/layout.js";
import {
  AccountErasureControls,
  confirmationPhraseMatches
} from "../../apps/ui/components/AccountErasureControls.js";
import { LOCALE_COOKIE, type LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";

// FIX-VRULINGS: V's two rulings.
// 1. The account-deletion phrase the reader types is the locale's
//    `settings.erasure.confirmationPhrase`; the API still receives the English
//    wire literal from the contract client, untouched.
// 2. The document's meta description is the locale's `chrome.metaDescription`;
//    the title stays the brand.

const mocks = vi.hoisted(() => ({
  locale: "en",
  overlay: {} as Record<string, Record<string, string>>
}));

// next lives under apps/ui only, so the font loader is mocked at the path the
// layout resolves; outside Next's compiler its loaders are not callable.
vi.mock("../../apps/ui/node_modules/next/font/google/index.js", () => {
  const font = () => ({ variable: "font-variable", className: "font-class", style: {} });
  return { Fraunces: font, Plus_Jakarta_Sans: font, JetBrains_Mono: font };
});
vi.mock("@/lib/i18n/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/i18n/server.js")>();
  return {
    ...actual,
    loadNamespace: async (...args: Parameters<typeof actual.loadNamespace>) => {
      const catalog = await actual.loadNamespace(...args);
      const overlay = mocks.overlay[`${args[0]}/${args[1]}`];
      return overlay === undefined ? catalog : Object.freeze({ ...catalog, ...overlay });
    }
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === LOCALE_COOKIE ? { value: mocks.locale } : undefined)
  }),
  headers: async () => new Headers()
}));

function catalogValue(locale: string, namespace: string, key: string): string {
  const catalog = JSON.parse(
    readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/${namespace}.json`), "utf8")
  ) as Record<string, string>;
  const value = catalog[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${locale}/${namespace} lacks ${key}`);
  return value;
}

const ENGLISH_PHRASE = "DELETE MY ACCOUNT";
const ENGLISH_DESCRIPTION = "A reasoning instrument — several AI models argue a claim in a structured tree.";

beforeEach(() => {
  mocks.locale = "en";
  mocks.overlay = {};
});

describe("ruling 1: the delete-account phrase is the locale's own", () => {
  let root: Root | null = null;

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  function erasureClient() {
    return {
      readAccountErasure: vi.fn(async () => ({ status: "NONE" as const })),
      stepUp: vi.fn(async () => ({
        status: "step_up_complete" as const,
        csrf_token: "c".repeat(43),
        step_up_grant: {
          token: "g".repeat(43),
          action: "DELETE_ACCOUNT" as const,
          target_run_id: null,
          expires_at: "2026-09-30T00:00:00.000Z"
        }
      })),
      scheduleAccountErasure: vi.fn(async () => ({
        status: "SCHEDULED" as const,
        execute_at: "2026-10-30T00:00:00.000Z",
        cancellation_ref: "55555555-5555-4555-8555-555555555555"
      })),
      cancelAccountErasure: vi.fn()
    };
  }

  async function mount(catalog: Record<string, string>, locale: LocaleCode) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const client = erasureClient();
    await act(async () => root!.render(
      // The client double covers the four calls the control makes.
      <AccountErasureControls client={client as never} catalog={catalog} locale={locale} />
    ));
    await act(async () => { await Promise.resolve(); });
    const input = container.querySelector<HTMLInputElement>("#account-deletion-confirmation");
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (input === null || submit === null) throw new Error("erasure form did not render");
    const type = async (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      return !submit.disabled;
    };
    return { container, client, input, submit, type };
  }

  it("a German page asks for, and accepts, its own phrase and rejects the English one", async () => {
    // de carries the English placeholder until the translation seat runs, so the
    // German phrase is laid over the real de catalogue to prove where it is read.
    const german = { ...(await loadNamespace("de", "settings")), "settings.erasure.confirmationPhrase": "MEIN KONTO LÖSCHEN" };
    const { container, client, type } = await mount(german, "de");
    expect(container.querySelector("label[for='account-deletion-confirmation']")?.textContent)
      .toContain("MEIN KONTO LÖSCHEN");
    expect(await type(ENGLISH_PHRASE)).toBe(false);
    // Trimmed, NFC-normalised (decomposed Ö) and case-folded with the locale's rules.
    expect(await type("  mein konto löschen ")).toBe(true);
    expect(await type("MEIN KONTO LÖSCHEN")).toBe(true);

    const form = container.querySelector("form")!;
    for (const [id, value] of [["account-deletion-password", "pw"], ["account-deletion-code", "123456"]] as const) {
      const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(field, value);
        field.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    }
    await act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await Promise.resolve(); });
    // The wire literal is the contract client's business: the control hands over
    // the step-up grant only, never the phrase the reader typed.
    expect(client.scheduleAccountErasure).toHaveBeenCalledWith("g".repeat(43));
  });

  it("the shipped de catalogue's phrase is accepted on the German page", async () => {
    const shipped = await loadNamespace("de", "settings");
    const { type } = await mount(shipped, "de");
    expect(await type(catalogValue("de", "settings", "settings.erasure.confirmationPhrase").toLowerCase())).toBe(true);
  });

  it("English accepts only the exact phrase", async () => {
    const english = await loadNamespace("en", "settings");
    expect(english["settings.erasure.confirmationPhrase"]).toBe(ENGLISH_PHRASE);
    const { type } = await mount(english, "en");
    expect(await type(ENGLISH_PHRASE)).toBe(true);
    for (const near of ["delete my account", " DELETE MY ACCOUNT", "DELETE MY ACCOUNT ", "Delete My Account"]) {
      expect(await type(near), JSON.stringify(near)).toBe(false);
    }
  });

  it("folds case with the locale's own rules", () => {
    // Turkish dotted/dotless i: the locale-aware fold is what makes "i" match "İ".
    expect(confirmationPhraseMatches("hesabımı sil", "HESABIMI SİL", "tr")).toBe(true);
    expect(confirmationPhraseMatches("DELETE MY ACCOUNT", "HESABIMI SİL", "tr")).toBe(false);
    expect(confirmationPhraseMatches("delete my account", ENGLISH_PHRASE, "en")).toBe(false);
  });
});

describe("ruling 1: native spellings of the same phrase are accepted (fluency review REV-VKEYS)", () => {
  // The shipped phrases (messages/{ru,ro,hi}/settings.json), spelled as a native
  // writer or keyboard commonly produces them.
  const RU = "УДАЛИТЬ МОЮ УЧЁТНУЮ ЗАПИСЬ";
  const RO = "ȘTERGEȚI CONTUL MEU";
  const HI = "मेरा खाता मिटाएँ";

  it("accepts ru typed with е for ё, and still refuses a different phrase", () => {
    expect(confirmationPhraseMatches("удалить мою учетную запись", RU, "ru")).toBe(true);
    expect(confirmationPhraseMatches("УДАЛИТЬ МОЮ УЧЕТНУЮ ЗАПИСЬ", RU, "ru")).toBe(true);
    // Both sides fold: a phrase shipped with е accepts ё typed.
    expect(confirmationPhraseMatches("учётную запись", "УЧЕТНУЮ ЗАПИСЬ", "ru")).toBe(true);
    expect(confirmationPhraseMatches("удалить мою запись", RU, "ru")).toBe(false);
    expect(confirmationPhraseMatches(ENGLISH_PHRASE, RU, "ru")).toBe(false);
  });

  it("accepts ro typed with cedilla ş/ţ (U+015F/U+0163) for comma-below ș/ț", () => {
    expect(confirmationPhraseMatches("\u015Fterge\u0163i contul meu", RO, "ro")).toBe(true);
    expect(confirmationPhraseMatches("\u015ETERGE\u0162I CONTUL MEU", RO, "ro")).toBe(true);
    expect(confirmationPhraseMatches("stergeti contul meu", RO, "ro")).toBe(false);
    expect(confirmationPhraseMatches("\u015Fterge\u0163i contul", RO, "ro")).toBe(false);
  });

  it("accepts hi typed with anusvara ं (U+0902) for chandrabindu ँ (U+0901)", () => {
    expect(confirmationPhraseMatches("मेरा खाता मिटाए\u0902", HI, "hi")).toBe(true);
    expect(confirmationPhraseMatches(HI, HI, "hi")).toBe(true);
    expect(confirmationPhraseMatches("मेरा खाता मिटाए", HI, "hi")).toBe(false);
    expect(confirmationPhraseMatches("खाता मिटाएं", HI, "hi")).toBe(false);
  });

  it("leaves English exact", () => {
    expect(confirmationPhraseMatches(ENGLISH_PHRASE, ENGLISH_PHRASE, "en")).toBe(true);
    for (const near of ["delete my account", " DELETE MY ACCOUNT", "DELETE MY ACCOUNT "]) {
      expect(confirmationPhraseMatches(near, ENGLISH_PHRASE, "en"), JSON.stringify(near)).toBe(false);
    }
    // The equivalences are not applied on the English path.
    expect(confirmationPhraseMatches("УЧЕТНУЮ", "УЧЁТНУЮ", "en")).toBe(false);
  });
});

describe("ruling 2: the meta description follows the reader's locale", () => {
  it("returns the catalogue's description for he and de, and the brand title", async () => {
    for (const locale of ["he", "de"] as const) {
      mocks.locale = locale;
      mocks.overlay = {};
      expect(await generateMetadata()).toEqual({
        title: "Dialectical Engine",
        description: catalogValue(locale, "chrome", "chrome.metaDescription")
      });
      // Both carry the English placeholder today; a value the layout could not
      // invent proves the description is read from the locale's catalogue.
      mocks.overlay = { [`${locale}/chrome`]: { "chrome.metaDescription": `${locale.toUpperCase()}_META_SENTINEL` } };
      expect((await generateMetadata()).description).toBe(`${locale.toUpperCase()}_META_SENTINEL`);
    }
  });

  it("leaves the English metadata unchanged", async () => {
    expect(await generateMetadata()).toEqual({ title: "Dialectical Engine", description: ENGLISH_DESCRIPTION });
    mocks.locale = "not-a-locale";
    expect(await generateMetadata()).toEqual({ title: "Dialectical Engine", description: ENGLISH_DESCRIPTION });
  });
});
