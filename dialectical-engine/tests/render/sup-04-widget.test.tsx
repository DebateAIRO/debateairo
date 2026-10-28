// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { act, createContext, createElement, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import chromeArabic from "../../apps/ui/messages/ar/chrome.json" with { type: "json" };
import supportArabic from "../../apps/ui/messages/ar/support.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import supportEnglish from "../../apps/ui/messages/en/support.json" with { type: "json" };
import chromeRomanian from "../../apps/ui/messages/ro/chrome.json" with { type: "json" };
import supportRomanian from "../../apps/ui/messages/ro/support.json" with { type: "json" };

const TestI18nContext = createContext<Readonly<{ locale: LocaleCode; catalog: MessageCatalog }> | null>(null);

vi.mock("@/lib/i18n/I18nProvider", () => ({
  I18nProvider({ locale, catalog, children }: Readonly<{ locale: LocaleCode; catalog: MessageCatalog; children: ReactNode }>) {
    return createElement(TestI18nContext.Provider, { value: { locale, catalog } }, children);
  },
  useChromeI18n() {
    return useContext(TestI18nContext) ?? Object.freeze({
      locale: "en" as const,
      catalog: Object.freeze({ ...chromeEnglish, ...supportEnglish })
    });
  }
}));

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { SupportWidget } from "../../apps/ui/components/support/SupportWidget.js";
import { Assistant } from "../../apps/ui/components/support/Assistant.js";
import { resetSupportOfferedForTests, SUPPORT_OFFERED_STORAGE_KEY } from "../../apps/ui/components/support/availability.js";

describe("SUP-04 product-route support widget", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    sessionStorage.clear();
    sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, "true");
    resetSupportOfferedForTests();
    root = createRoot(document.body.appendChild(document.createElement("div")));
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    sessionStorage.clear();
    resetSupportOfferedForTests();
    vi.unstubAllGlobals();
  });

  it("inherits RTL from the Arabic document without adding a support-desk direction", () => {
    const catalog = Object.freeze({ ...chromeArabic, ...supportArabic });
    const html = renderToStaticMarkup(<html lang="ar" dir="rtl"><body>
      <I18nProvider locale="ar" catalog={catalog}><Assistant fullPage /></I18nProvider>
    </body></html>);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.documentElement.dir).toBe("rtl");
    expect(parsed.querySelector(".supportDesk")?.hasAttribute("dir")).toBe(false);
  });

  it("starts collapsed as the exact accessible English button when support is offered", async () => {
    await act(async () => root!.render(<SupportWidget />));
    const widget = document.querySelector('[data-widget-state="collapsed"]');
    const button = widget?.querySelector<HTMLButtonElement>('button[aria-label="Help"]');
    expect(button?.textContent).toBe("Help");
    expect(document.querySelector("[data-support-widget-panel]")).toBeNull();
  });

  it("expands, focuses the message control, and follows the Romanian interface locale", async () => {
    const catalog = Object.freeze({ ...chromeRomanian, ...supportRomanian });
    await act(async () => root!.render(<I18nProvider locale="ro" catalog={catalog}><SupportWidget /></I18nProvider>));
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${chromeRomanian["chrome.help"]}"]`)!;
    button.focus();
    await act(async () => button.click());
    expect(document.querySelector('[data-widget-state="expanded"]')).not.toBeNull();
    expect(document.querySelector("[data-support-widget-panel]")).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[name="support-message"]'));
    expect(document.querySelector('[aria-label="Language override"]')).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!.click());
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Ajutor"]')?.textContent).toBe("Ajutor");
  });

  it("uses fixed lower-corner geometry and caps the expanded panel at seventy viewport percent", async () => {
    const css = await readFile("apps/ui/app/globals.css", "utf8");
    expect(css).toMatch(/[.]supportWidget\s*\{[^}]*position:\s*fixed[^}]*right:\s*var\([^}]*bottom:\s*var\(/su);
    expect(css).toMatch(/[.]supportWidgetPanel\s*\{[^}]*max-height:\s*70vh/su);
    expect(css).not.toMatch(/[.]supportWidget(?:Panel)?\s*\{[^}]*top:/su);
  });

  it("publishes the exact primary-control measurement hook on all three owner surfaces", async () => {
    const [home, create, publication] = await Promise.all([
      readFile("apps/ui/app/page.tsx", "utf8"),
      readFile("apps/ui/app/new/NewDebatePageClient.tsx", "utf8"),
      readFile("apps/ui/components/PublicationControl.tsx", "utf8")
    ]);
    expect(home).toMatch(/<section[^>]*data-support-primary-control[^>]*id="start-a-debate"/u);
    expect(create).toMatch(/<button[^>]*data-support-primary-control[^>]*type="submit"/su);
    expect(publication).toMatch(/<section[^>]*data-support-primary-control[^>]*aria-label=\{t\(catalog, "public\.publication\.controlsAria"\)\}/u);
    const publicEnglish = JSON.parse(await readFile("apps/ui/messages/en/public.json", "utf8")) as Record<string, string>;
    expect(publicEnglish["public.publication.controlsAria"]).toBe("Publication controls");
  });
});
