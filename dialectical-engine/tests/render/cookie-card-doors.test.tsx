// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import { LegalCookiesBody } from "../../apps/ui/components/legal/LegalBodies.js";
import { openSurfaceCount } from "../../apps/ui/components/consent/modalSemantics.js";
import consentEnglish from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import legalEnglish from "../../apps/ui/messages/en/legal.json" with { type: "json" };
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";

/**
 * SPEC-v2 R07: one card, four doors (both footer layouts count as the footer door, so five
 * openers), no promised choice. Every opener is mounted beside `<CookieConsent />` WITHOUT a
 * consent catalogue provider, so the card's rows come through the English fallback of
 * `useConsentCatalog` (PLAN S19). The Help panel's shortcut is the fifth door of D-43 and is
 * out of this slice (row V-6); `sup-01-help.test.tsx` keeps it opening the same card.
 */

/** PLAN §2 Key map, en, EXACT (SPEC-v2 R09), in INV order. */
const EN_KIND = [
  "Cookie (HttpOnly)",
  "Cookie",
  "Cookie (HttpOnly)",
  "Cookie",
  "Local storage",
  "Local storage",
  "Session storage",
  "Session storage"
];
const EN_LIFE = [
  "14 days",
  "14 days",
  "30 days",
  "1 year",
  "Until you clear it",
  "Until you clear it",
  "Until you close the tab",
  "Until you close the tab"
];
const ACK = JSON.stringify({ v: 2, acknowledgedAt: "2026-09-29T00:00:00.000Z" });
const consent = consentEnglish as MessageCatalog;
const chrome = chromeEnglish as MessageCatalog;
const legal = legalEnglish as MessageCatalog;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
  expect(openSurfaceCount(), "no surface leaks out of a case").toBe(0);
});

function mount(node: ReactNode): void {
  act(() => {
    root!.render(<div className="appShell">{node}</div>);
  });
}

/** Click the opener the way a pointer does: a real browser focuses what it activates. */
function activate(control: HTMLElement): void {
  act(() => {
    control.focus();
    control.click();
  });
}

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
}

/** The one button inside `scope` whose trimmed text is exactly `label`. */
function buttonIn(scope: string, label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].filter(
    (button) => button.textContent?.trim() === label
  );
  expect(found.length, `exactly one ${scope} button labelled ${label}`).toBe(1);
  return found[0]!;
}

type Door = {
  name: string;
  node: () => ReactNode;
  opener: () => HTMLElement;
};

const DOORS: Door[] = [
  {
    name: "the bar's what-we-store button",
    node: () => <CookieConsent />,
    opener: () => buttonIn(".consentBar", consent["consent.bar.whatWeStore"]!)
  },
  {
    name: "the one-line footer control",
    node: () => (
      <>
        <SiteFooter variant="line" />
        <CookieConsent />
      </>
    ),
    opener: () => buttonIn("footer", chrome["chrome.footer.cookiePreferences"]!)
  },
  {
    name: "the full footer control",
    node: () => (
      <>
        <SiteFooter variant="full" />
        <CookieConsent />
      </>
    ),
    opener: () => buttonIn("footer", chrome["chrome.footer.cookiePreferences"]!)
  },
  {
    name: "Settings → Privacy",
    node: () => (
      <>
        <ConsentSettingsPanel />
        <CookieConsent />
      </>
    ),
    opener: () => buttonIn('[aria-labelledby="consent-privacy-heading"]', consent["consent.settings.button"]!)
  },
  {
    name: "the /cookies control",
    node: () => (
      <>
        <LegalCookiesBody legalCatalog={legal} />
        <CookieConsent />
      </>
    ),
    opener: () => {
      const found = [...document.querySelectorAll<HTMLElement>("button.legalAction")].filter(
        (button) => button.textContent?.trim() === legal["legal.cookies.change"]
      );
      expect(found.length, "exactly one /cookies control").toBe(1);
      return found[0]!;
    }
  }
];

/** Every source file under apps/ui (ts, tsx), skipping build and dependency directories. */
function uiSources(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...uiSources(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("S01 one card, four doors (SPEC-v2 R07, R02, R04, R08)", () => {
  it.each(DOORS.map((door) => [door.name, door] as const))(
    "opens the one card from %s and returns focus to it on close",
    (_name, door) => {
      // PROPERTY (R07, R02): every door opens the same read-only card of eight rows whose kind
      // and lifetime are the English /cookies strings, and closing it returns focus to the door.
      mount(door.node());
      const opener = door.opener();
      activate(opener);

      const dialogs = document.querySelectorAll('[role="dialog"]');
      expect(dialogs.length, "one dialog").toBe(1);
      const rows = [...dialogs[0]!.querySelectorAll<HTMLElement>(".consentCatRow")];
      expect(rows.length, "eight rows").toBe(8);
      expect(rows.map((row) => row.querySelector(".consentTag-kind")?.textContent), "kinds").toEqual(EN_KIND);
      expect(rows.map((row) => row.querySelector(".consentCatDetail")?.textContent), "lifetimes").toEqual(EN_LIFE);

      pressEscape();

      expect(document.querySelector('[role="dialog"]'), "the card is gone").toBeNull();
      // The bar door's opener is unmounted while the card is open and returns as a fresh node.
      const expected = door === DOORS[0] ? door.opener() : opener;
      expect(document.activeElement, "focus is back on the door").toBe(expected);
    }
  );

  it("labels every door, the Settings hint and the card's eyebrow, title and lede with none of preference, choose, choice, save, change, decide", () => {
    // PROPERTY (R07, en): no door promises a choice the product does not offer.
    const banned = /preference|choose|choice|save|change|decide/i;
    const values: [string, string | undefined][] = [
      ["consent.bar.whatWeStore", consent["consent.bar.whatWeStore"]],
      ["consent.settings.button", consent["consent.settings.button"]],
      ["consent.settings.hint", consent["consent.settings.hint"]],
      ["consent.preferences.eyebrow", consent["consent.preferences.eyebrow"]],
      ["consent.preferences.title", consent["consent.preferences.title"]],
      ["consent.preferences.lede", consent["consent.preferences.lede"]],
      ["chrome.footer.cookiePreferences", chrome["chrome.footer.cookiePreferences"]],
      ["legal.cookies.change", legal["legal.cookies.change"]]
    ];
    for (const [key, value] of values) {
      expect(typeof value, `${key} is a string`).toBe("string");
      expect(value, `${key}`).not.toMatch(banned);
    }
  });

  it("renders no switch or checkbox on the bar, Settings, either footer or /cookies, with or without an acknowledgement stored", () => {
    // PROPERTY (R04): outside the card nothing can be switched on, in either stored state.
    for (const seed of [null, ACK]) {
      if (seed === null) localStorage.removeItem(CONSENT_KEY);
      else localStorage.setItem(CONSENT_KEY, seed);
      mount(
        <>
          <ConsentSettingsPanel />
          <LegalCookiesBody legalCatalog={legal} />
          <SiteFooter variant="full" />
          <SiteFooter variant="line" />
          <CookieConsent key={seed ?? "none"} />
        </>
      );
      expect(document.querySelector("footer"), "the footers rendered").not.toBeNull();
      expect(
        document.querySelectorAll('[role="switch"], [role="checkbox"], input[type="checkbox"]').length,
        `switches or checkboxes with ${seed === null ? "nothing" : "an acknowledgement"} stored`
      ).toBe(0);
    }
  });

  it("leaves readConsent with no caller outside the consent machine and its module", () => {
    // PROPERTY (R08, code half): nothing but the machine waits on the answer.
    const ui = resolve(process.cwd(), "apps/ui");
    const callers = uiSources(ui)
      .filter((path) => readFileSync(path, "utf8").includes("readConsent"))
      .map((path) => relative(ui, path))
      .sort();
    expect(callers, "files naming readConsent").toEqual(["components/consent/CookieConsent.tsx", "lib/consent.ts"]);
  });
});
