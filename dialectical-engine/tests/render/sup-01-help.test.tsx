// @vitest-environment jsdom

import { act,createContext,createElement,useContext,type ReactNode } from "react";
import { createRoot,type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import chromeEn from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import supportEn from "../../apps/ui/messages/en/support.json" with { type: "json" };
import homeEn from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeRo from "../../apps/ui/messages/ro/chrome.json" with { type: "json" };
import supportRo from "../../apps/ui/messages/ro/support.json" with { type: "json" };
import homeRo from "../../apps/ui/messages/ro/home.json" with { type: "json" };
import chromeJa from "../../apps/ui/messages/ja/chrome.json" with { type: "json" };
import supportJa from "../../apps/ui/messages/ja/support.json" with { type: "json" };
import homeJa from "../../apps/ui/messages/ja/home.json" with { type: "json" };

const Context = createContext<Readonly<{ locale: LocaleCode;catalog: MessageCatalog }> | null>(null);
vi.mock("@/lib/i18n/I18nProvider",() => ({
  I18nProvider({ locale,catalog,children }: Readonly<{ locale: LocaleCode;catalog: MessageCatalog;children: ReactNode }>) {
    return createElement(Context.Provider,{ value: { locale,catalog } },children);
  },
  useChromeI18n() {
    return useContext(Context) ?? { locale: "en",catalog: { ...chromeEn,...supportEn,...homeEn } };
  }
}));

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { Assistant,supportAssistantClient,type SupportAssistantClient } from "../../apps/ui/components/support/Assistant.js";
import { subscribeToPreferenceRequests } from "../../apps/ui/lib/consent.js";

const catalogs = {
  en: Object.freeze({ ...chromeEn,...supportEn,...homeEn }),
  ro: Object.freeze({ ...chromeRo,...supportRo,...homeRo }),
  ja: Object.freeze({ ...chromeJa,...supportJa,...homeJa })
};
type Reply = Awaited<ReturnType<SupportAssistantClient["sendMessage"]>>;
let root: Root | null = null;
function client(reply: Reply = { outcome: "NO_SOURCE",text: "No source." }) {
  return { sendMessage: vi.fn(async () => reply),isSignedIn: vi.fn(async () => false) };
}
function localized(locale: "en" | "ro" | "ja",component: ReactNode) {
  return <I18nProvider locale={locale} catalog={catalogs[locale]}>{component}</I18nProvider>;
}
async function render(component: ReactNode) { await act(async () => root!.render(component)); }
async function submit(text: string) {
  const form = document.querySelector<HTMLFormElement>("form.supportComposer")!;
  const input = form.querySelector<HTMLInputElement>('input[name="support-message"]')!;
  await act(async () => {
    input.value = text;
    form.dispatchEvent(new Event("submit",{ bubbles: true,cancelable: true }));
    await Promise.resolve();
  });
}
function json(body: unknown,status = 200) {
  return new Response(JSON.stringify(body),{ status,headers: { "content-type": "application/json" } });
}

describe("SUP-01 /help assistant",() => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null; document.body.replaceChildren(); sessionStorage.clear(); vi.unstubAllGlobals();
  });

  it.each(["ja","ro"] as const)("uses the %s locale for the help chrome and posted language",async (locale) => {
    const transport = client();
    await render(localized(locale,<Assistant fullPage signedIn={false} client={transport} />));
    expect(document.body.textContent).toContain(catalogs[locale]["chrome.help"]);
    expect(document.querySelector<HTMLInputElement>('[name="support-message"]')?.placeholder)
      .toBe(catalogs[locale]["support.placeholder"]);
    await submit("Question");
    expect(transport.sendMessage).toHaveBeenCalledWith("Question",locale);
  });
  it("renders the full help desk without case, rating or reference controls",() => {
    const html = renderToStaticMarkup(localized("en",<Assistant fullPage signedIn={false} client={client()} />));
    const page = new DOMParser().parseFromString(html,"text/html");
    expect(page.querySelector("[data-support-desk] [data-support-header]")).not.toBeNull();
    expect(page.querySelector('[aria-label="Browse by topic"]')?.querySelectorAll("button")).toHaveLength(6);
    expect(page.querySelector(".supportRating,.supportEscalation button")).toBeNull();
    expect(page.querySelector(".supportMetadata")?.textContent).not.toContain(supportEn["support.reference"]);
    expect(page.querySelector('.supportEscalation a[href="mailto:support@dezbatere.ro"]')).not.toBeNull();
  });
  it("keeps the verified shortcuts and opens cookie preferences",async () => {
    await render(localized("en",<Assistant fullPage signedIn client={client()} />));
    const shortcuts = document.querySelector('[aria-label="Support shortcuts"]')!;
    expect(shortcuts.querySelector('a[href="/settings#consent-privacy-heading"]')).not.toBeNull();
    const cookie = [...shortcuts.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Cookies we store"))!;
    const calls: Array<HTMLElement | null> = [];
    const stop = subscribeToPreferenceRequests((opener) => calls.push(opener));
    try { await act(async () => cookie.click()); expect(calls).toEqual([cookie]); }
    finally { stop(); }
  });
  it("sends a suggestion immediately rather than leaving it in the composer",async () => {
    const transport = client();
    await render(localized("en",<Assistant fullPage signedIn={false} client={transport} />));
    const button = [...document.querySelectorAll<HTMLButtonElement>(".supportSuggestions button")][0]!;
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(transport.sendMessage).toHaveBeenCalledWith(button.textContent,"en");
    expect(document.querySelector<HTMLInputElement>('[name="support-message"]')?.value).toBe("");
  });
  it("starts a clean conversation without a session request",async () => {
    const transport = client({ outcome: "NO_SOURCE",text: "Answer one" });
    await render(localized("en",<Assistant fullPage signedIn={false} client={transport} />));
    await submit("Question one");
    expect(document.body.textContent).toContain("Answer one");
    await act(async () => document.querySelector<HTMLButtonElement>(".supportNewConversation")!.click());
    expect(document.body.textContent).not.toContain("Question one");
    expect(document.body.textContent).not.toContain("Answer one");
    expect(document.querySelector(".supportConversation")?.firstElementChild?.textContent).toBe(supportEn["support.notice"]);
  });
  it("renders the notice before the first message in both page surfaces",() => {
    for (const fullPage of [false,true]) {
      const html = renderToStaticMarkup(localized("en",<Assistant fullPage={fullPage} client={client()} />));
      const page = new DOMParser().parseFromString(html,"text/html");
      expect(page.querySelector(".supportConversation")?.firstElementChild?.textContent).toBe(supportEn["support.notice"]);
    }
  });
  it("renders response text literally and drops an external response link",async () => {
    await render(localized("en",<Assistant signedIn={false} client={client({
      outcome: "NO_SOURCE",text: "<script>alert(1)</script>",link: "https://elsewhere.test"
    })} />));
    await submit("Question");
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe("<script>alert(1)</script>");
    expect(document.querySelector(".supportMessage--assistant script,.supportCitation a")).toBeNull();
  });
  it("keeps a verified first-party recovery link",async () => {
    await render(localized("en",<Assistant signedIn={false} client={client({
      outcome: "REFUSE_INJECTION",text: "Recover your account",link: "/recover"
    })} />));
    await submit("Recovery");
    expect(document.querySelector('.supportMessage--assistant a[href="/recover"]')).not.toBeNull();
  });
  it("reads a structured 429 reply as a rate limit",async () => {
    vi.stubGlobal("fetch",vi.fn(async () => json({ outcome: "RATE_LIMITED",text: "Wait a few minutes" },429)));
    await expect(supportAssistantClient.sendMessage("Question","en")).resolves.toMatchObject({
      outcome: "RATE_LIMITED",text: "Wait a few minutes"
    });
  });
  it("shows the unavailable reply for an unreadable server error",async () => {
    const transport = { sendMessage: vi.fn(async () => { throw new Error("offline"); }) };
    await render(localized("en",<Assistant signedIn={false} client={transport} />));
    await submit("Question");
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe(supportEn["support.unavailable"]);
  });
  it("posts the exact message body through the same-origin CSRF boundary",async () => {
    document.cookie = `__Host-debateai-csrf=${"A".repeat(43)}; path=/`;
    const fetch = vi.fn(async () => json({ outcome: "NO_SOURCE",text: "No source" }));
    vi.stubGlobal("fetch",fetch);
    await supportAssistantClient.sendMessage("Question","en");
    expect(fetch).toHaveBeenCalledWith("/api/v1/support/messages",expect.objectContaining({
      method: "POST",body: JSON.stringify({ text: "Question",language: "en" })
    }));
    const headers = fetch.mock.calls[0]?.[1]?.headers as Record<string,string>;
    expect(headers["x-support-session-token"]).toBeUndefined();
    expect(headers["x-support-case-token"]).toBeUndefined();
  });
  it("rejects forged source and action decorations at the response boundary",async () => {
    const fetch = vi.fn(async () => json({ outcome: "ANSWER_GROUNDED",text: "Answer",
      sources: [{ id: "not-reviewed",label: "Fake" }],actions: [] }));
    vi.stubGlobal("fetch",fetch);
    await expect(supportAssistantClient.sendMessage("Question","en")).rejects.toThrow("SUPPORT_RESPONSE_INVALID");
  });
  it("accepts the canonical signed-in action returned with a grounded answer",async () => {
    const fetch = vi.fn(async (path: string) => path === "/api/v1/session" ? json({}) : json({
      outcome: "ANSWER_GROUNDED",text: "Open the debate composer",sources: [],
      actions: [{ id: "start-debate",label: "Start a debate",href: "/new" }]
    }));
    vi.stubGlobal("fetch",fetch);
    await expect(supportAssistantClient.sendMessage("Question","en")).resolves.toMatchObject({
      actions: [{ id: "start-debate",label: "Start a debate",href: "/new" }]
    });
  });
});
