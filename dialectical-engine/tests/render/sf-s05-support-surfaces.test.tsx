// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportWidget } from "../../apps/ui/components/support/SupportWidget.js";
import { SiteFooter } from "../../apps/ui/components/SiteFooter.js";
import { markSupportNotOffered, resetSupportOfferedForTests, SUPPORT_OFFERED_STORAGE_KEY } from "../../apps/ui/components/support/availability.js";
import AiTransparencyPage from "../../apps/ui/app/ai-transparency/page.js";
import HelpPage from "../../apps/ui/app/help/page.js";
import supportEnglish from "../../apps/ui/messages/en/support.json" with { type: "json" };
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers()
}));
vi.mock("@/components/support/Assistant", () => ({
  Assistant: () => createElement("div", { "data-help-chat": true }, "Support chat")
}));
vi.mock("@/components/support/CaseView", () => ({
  CaseLookup: () => null,
  OwnCaseLookup: () => null
}));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/legal/CookiePreferencesButton", () => ({
  CookiePreferencesButton: () => null
}));
vi.mock("@/lib/i18n/I18nProvider", () => ({
  useChromeI18n: () => ({
    locale: "en",
    catalog: { ...supportEnglish, ...homeEnglish, ...chromeEnglish }
  })
}));

const MODES = ["terracotta", "chamber"] as const;
let root: Root | null = null;
let host: HTMLDivElement;

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function renderSurfaces(): Promise<void> {
  const transparency = await AiTransparencyPage();
  const help = await HelpPage();
  await act(async () => root!.render(createElement("main", null,
    createElement(SupportWidget),
    createElement(SiteFooter, { variant: "full" }),
    transparency,
    help
  )));
  await settle();
}

function surfaces() {
  return {
    widget: host.querySelector("[data-support-widget-toggle]"),
    footer: host.querySelector('.siteFooterFull a[href="/help"]'),
    transparency: host.querySelector('.aiTransparencyPage a[href="/help"]'),
    chat: host.querySelector('[data-help-page] [data-help-chat]'),
    country: host.querySelector("[data-help-page] .supportCountryUnavailable"),
    unavailable: host.querySelector("[data-help-page] .supportHelpUnavailable"),
    numbers: host.querySelector("[data-help-page] .supportHelpNumbers")
  };
}

function answer(service: boolean): void {
  sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, String(service));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  resetSupportOfferedForTests();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  host.remove();
  sessionStorage.clear();
  resetSupportOfferedForTests();
  vi.unstubAllGlobals();
});

describe.each(MODES)("S05 support surfaces in %s mode", (mode) => {
  beforeEach(() => { document.documentElement.dataset.theme = mode; });

  it("V1 hides every Help entry and shows only the country sentence when not offered", async () => {
    // Property: a refused country answer exposes no route to the chat.
    answer(false);
    await renderSurfaces();
    const view = surfaces();
    expect([view.widget, view.footer, view.transparency, view.chat, view.unavailable, view.numbers])
      .toEqual([null, null, null, null, null, null]);
    expect(view.country?.textContent).toBe(supportEnglish["support.countryUnavailable"]);
  });

  it("V2 shows the four Help entries when offered", async () => {
    // Property: the positive answer enables every normal support entry.
    answer(true);
    await renderSurfaces();
    const view = surfaces();
    expect([view.widget, view.footer, view.transparency, view.chat].every(Boolean)).toBe(true);
    expect([view.country, view.unavailable, view.numbers]).toEqual([null, null, null]);
  });

  it("V3 shows no Help or country sentence while the check is pending", async () => {
    // Property: an unanswered check never grants access or claims the country is closed.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await renderSurfaces();
    const view = surfaces();
    expect([view.widget, view.footer, view.transparency, view.chat, view.country, view.unavailable])
      .toEqual([null, null, null, null, null, null]);
  });

  it.each([
    ["a network failure", () => Promise.reject(new Error("offline"))],
    ["a 429", () => Promise.resolve({ status: 429, json: async () => ({}) } as Response)],
    ["a 500", () => Promise.resolve({ status: 500, json: async () => ({}) } as Response)],
    ["a 200 without a service boolean", () => Promise.resolve({ status: 200, json: async () => ({}) } as Response)]
  ])("V4 %s hides Help and shows only the load failure with help numbers", async (_name, fetchResult) => {
    // Property: every failed check leaves support closed while preserving crisis help.
    vi.stubGlobal("fetch", vi.fn(fetchResult));
    await renderSurfaces();
    const view = surfaces();
    expect([view.widget, view.footer, view.transparency, view.chat, view.country])
      .toEqual([null, null, null, null, null]);
    expect(view.unavailable?.textContent).toBe(supportEnglish["support.helpUnavailable"]);
    expect(view.numbers?.querySelector("select")).not.toBeNull();
    expect(view.numbers?.querySelector(".crisisSupportEmergency")).not.toBeNull();
  });

  it("V5 hides a widget already on screen when a support route refuses", async () => {
    // Property: a later 403 revokes the previously visible entry immediately.
    answer(true);
    await renderSurfaces();
    expect(surfaces().widget).not.toBeNull();
    await act(async () => markSupportNotOffered());
    expect(surfaces().widget).toBeNull();
    expect(surfaces().country?.textContent).toBe(supportEnglish["support.countryUnavailable"]);
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBe("false");
  });
});

it("V6 resolves help numbers from browser languages and page language, with a picker but no debate controls", async () => {
  // Property: a failed check still gives local crisis help, without debate-specific copy.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  vi.stubGlobal("navigator", { languages: ["ro-RO"], language: "ro-RO" });
  await renderSurfaces();
  const help = host.querySelector("[data-help-page]")!;
  const picker = help.querySelector<HTMLSelectElement>(".crisisSupportCountry select");
  expect(picker?.value).toBe("RO");
  expect(help.querySelector(".crisisSupportEmergency")).not.toBeNull();
  expect(help.querySelector(".crisisSupportBack")).toBeNull();
  expect(help.textContent).not.toContain(homeEnglish["home.crisisSupport.notSaved"]);
  expect(help.textContent).not.toContain(homeEnglish["home.crisisSupport.misread"]);
});
