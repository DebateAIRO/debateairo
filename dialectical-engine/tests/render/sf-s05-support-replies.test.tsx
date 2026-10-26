// @vitest-environment jsdom

import { readFileSync } from "node:fs";
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

const helpline = vi.hoisted(() => ({ current: null as null | { name: string;phone: string;tel: string;countries: string[] } }));
vi.mock("@debateai/contract",async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/contract")>(),
  harmHelplineFor: (country: string | null) => country !== null && helpline.current?.countries.includes(country)
    ? helpline.current : null
}));

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
import { SUPPORT_OFFERED_STORAGE_KEY,resetSupportOfferedForTests } from "../../apps/ui/components/support/availability.js";

const catalogEn = Object.freeze({ ...chromeEn,...supportEn,...homeEn });
const catalogRo = Object.freeze({ ...chromeRo,...supportRo,...homeRo });
type Reply = Awaited<ReturnType<SupportAssistantClient["sendMessage"]>>;
const answer = (outcome: Reply["outcome"],text = `A ${outcome} reply`): Reply => ({ outcome,text });
let root: Root | null = null;

function transport(reply: Reply) {
  return { sendMessage: vi.fn(async () => reply),isSignedIn: vi.fn(async () => false) };
}
function localized(component: ReactNode,locale: "en" | "ro" = "en") {
  return <I18nProvider locale={locale} catalog={locale === "ro" ? catalogRo : catalogEn}>{component}</I18nProvider>;
}
async function render(component: ReactNode) {
  await act(async () => root!.render(component));
}
async function send(text = "Help me") {
  const form = document.querySelector<HTMLFormElement>("form.supportComposer")!;
  const input = form.querySelector<HTMLInputElement>('input[name="support-message"]')!;
  await act(async () => {
    input.value = text;
    form.dispatchEvent(new Event("submit",{ bubbles: true,cancelable: true }));
    await Promise.resolve();
  });
}
async function show(reply: Reply,options: { fullPage?: boolean;locale?: "en" | "ro";crisisCountryHint?: string | null } = {}) {
  const client = transport(reply);
  await render(localized(<Assistant client={client} signedIn={false} fullPage={options.fullPage ?? false}
    crisisCountryHint={options.crisisCountryHint} />,options.locale));
  await send();
  return client;
}
function json(body: unknown,status = 200): Response {
  return new Response(JSON.stringify(body),{ status,headers: { "content-type": "application/json" } });
}
function realClient() {
  return { sendMessage: supportAssistantClient.sendMessage,isSignedIn: async () => false };
}

describe("S05-C6 support replies",() => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    sessionStorage.clear();
    resetSupportOfferedForTests();
    helpline.current = null;
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    sessionStorage.clear();
    resetSupportOfferedForTests();
    vi.unstubAllGlobals();
  });

  it("V1 puts an off-topic template in the reply without a citation",async () => {
    await show(answer("OFF_TOPIC","Off-topic template"));
    expect(document.querySelector(".supportMessage--assistant .supportMessageCore p")?.textContent).toBe("Off-topic template");
    expect(document.querySelector(".supportCitation")).toBeNull();
  });
  it("V2 puts Romanian crisis lines and a dial link inside the reply",async () => {
    await show(answer("CRISIS"),{ crisisCountryHint: "RO" });
    const numbers = document.querySelector(".supportMessage--assistant .supportHelpNumbers")!;
    expect(numbers.querySelector("select")?.value).toBe("RO");
    expect(numbers.querySelectorAll(".crisisSupportLine").length).toBeGreaterThanOrEqual(1);
    expect(numbers.querySelector('.crisisSupportEmergency a[href^="tel:"]')).not.toBeNull();
  });
  it("V3 keeps dialog fine print and back controls out of the crisis reply",async () => {
    await show(answer("CRISIS"),{ crisisCountryHint: "RO" });
    const core = document.querySelector(".supportMessage--assistant .supportMessageCore")!;
    expect(core.querySelector(".supportHelpNumbers select")).not.toBeNull();
    expect(core.querySelector(".crisisSupportBody,.crisisSupportFine,.crisisSupportBack")).toBeNull();
    expect(core.textContent).not.toContain(homeEn["home.crisisSupport.notSaved"]);
    expect(core.textContent).not.toContain(homeEn["home.crisisSupport.misread"]);
  });
  it.each(["terracotta","chamber"] as const)("V4 %s compact human control opens a mail link without sending",async (mode) => {
    document.documentElement.dataset.mode = mode;
    const client = transport(answer("NO_SOURCE"));
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    await render(localized(<Assistant client={client} signedIn={false} />));
    await act(async () => document.querySelector<HTMLButtonElement>(".supportEscalateCompact")!.click());
    const line = document.querySelector(".supportHumanAddress")!;
    expect(line.textContent).toContain("To reach a person");
    expect(line.querySelector('a[href="mailto:support@dezbatere.ro"]')?.textContent).toBe("support@dezbatere.ro");
    expect(fetch).not.toHaveBeenCalled(); expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it.each(["terracotta","chamber"] as const)("V4 %s crisis human control opens a mail link without sending",async (mode) => {
    document.documentElement.dataset.mode = mode;
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    const client = await show(answer("CRISIS"),{ crisisCountryHint: "RO" });
    expect(document.querySelector(".supportHumanAddress")).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>(".supportHelpHuman")!.click());
    expect(document.querySelector('.supportMessageCore .supportHumanAddress a[href="mailto:support@dezbatere.ro"]')?.textContent)
      .toBe("support@dezbatere.ro");
    expect(fetch).not.toHaveBeenCalled(); expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });
  it.each(["terracotta","chamber"] as const)("V5 %s full page removes ratings, reference and escalation button",(mode) => {
    document.documentElement.dataset.mode = mode;
    const html = renderToStaticMarkup(localized(<Assistant fullPage client={transport(answer("NO_SOURCE"))} signedIn={false} />));
    const parsed = new DOMParser().parseFromString(html,"text/html");
    expect(parsed.querySelector(".supportRating,.supportEscalation button")).toBeNull();
    expect(parsed.querySelector(".supportMetadata")?.textContent).not.toContain(supportEn["support.reference"]);
    expect(parsed.querySelector('.supportEscalation a[href="mailto:support@dezbatere.ro"]')).not.toBeNull();
  });
  it("V6 shows Türkiye's no-verified-line note and emergency number",async () => {
    await show(answer("CRISIS"),{ crisisCountryHint: "TR" });
    const numbers = document.querySelector(".supportHelpNumbers")!;
    expect(numbers.querySelector(".crisisSupportNote")?.textContent).toContain("checked helpline");
    expect(numbers.querySelector('.crisisSupportEmergency a[href^="tel:"]')).not.toBeNull();
  });
  it("V7 asks for country when neither hint nor language identifies one",async () => {
    vi.stubGlobal("navigator",{ languages: [],language: "ru" });
    const client = transport(answer("CRISIS"));
    await render(<I18nProvider locale="ru" catalog={catalogEn}><Assistant client={client} signedIn={false} crisisCountryHint={null} /></I18nProvider>);
    await send();
    expect(document.querySelector(".crisisSupportNote")?.textContent).toBe(homeEn["home.crisisSupport.chooseCountry"]);
    expect(document.querySelector(".crisisSupportEmergency")?.textContent).toBe(homeEn["home.crisisSupport.emergencyAnywhere"]);
  });
  it("V8 renders the threat emergency without a country selector or unsupported line",async () => {
    await show(answer("THREAT"),{ crisisCountryHint: "RO" });
    const numbers = document.querySelector(".supportHelpNumbers")!;
    expect(numbers.querySelector('[data-part="emergency"]')).not.toBeNull();
    expect(numbers.querySelector('[data-part="helpline"],select')).toBeNull();
  });
  it("V9 puts a confirmed RO harm line before emergency",async () => {
    helpline.current = { name: "Confirmed line",phone: "0800 000 000",tel: "0800000000",countries: ["RO"] };
    await show(answer("THREAT"),{ crisisCountryHint: "RO" });
    const children = [...document.querySelector(".supportHelpNumbers")!.querySelectorAll("[data-part]")];
    expect(children.map((node) => node.getAttribute("data-part"))).toEqual(["helpline","emergency"]);
  });
  it("V9b does not offer the RO-only harm line in France",async () => {
    helpline.current = { name: "Confirmed line",phone: "0800 000 000",tel: "0800000000",countries: ["RO"] };
    await show(answer("THREAT"),{ crisisCountryHint: "FR" });
    const numbers = document.querySelector(".supportHelpNumbers")!;
    expect(numbers.querySelector('[data-part="helpline"]')).toBeNull();
    expect(numbers.querySelector('[data-part="emergency"] a[href="tel:112"]')).not.toBeNull();
  });
  it("V10 support reply rules use colour tokens",() => {
    const css = readFileSync("apps/ui/app/globals.css","utf8");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/gu)].filter(([,selector]) =>
      selector!.trim().split(",").some((part) => /^\.support(?:HelpNumbers|HelpHuman|Notice|HumanAddress|HelpUnavailable)/u.test(part.trim())));
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const [,selector,body] of rules) {
      for (const [,value] of body!.matchAll(/(?:^|;)\s*(?:color|background(?:-color)?|border(?:-color)?):\s*([^;]+)/gu)) {
        if (value.trim() === "0" || value.trim() === "none") continue;
        expect(value.trim(),selector).toMatch(/var\(--[^)]+\)/u);
      }
    }
  });
  it("V11 uses Romanian emergency words from the home catalogue",async () => {
    await show(answer("CRISIS"),{ locale: "ro",crisisCountryHint: "RO" });
    expect(document.querySelector(".crisisSupportEmergency")?.textContent).toContain(
      homeRo["home.crisisSupport.emergency"].split("{number}")[0]);
  });
  it("V12 accepts every new route body at the browser boundary",async () => {
    for (const outcome of ["OFF_TOPIC","CRISIS","THREAT","TOO_LONG"] as const) {
      const fetch = vi.fn(async () => json({ outcome,text: `${outcome} text`,sources: [],actions: [] }));
      vi.stubGlobal("fetch",fetch);
      await expect(supportAssistantClient.sendMessage("Question","en")).resolves.toMatchObject({ outcome,text: `${outcome} text` });
    }
  });
  it("V13 keeps the help-number list gap and emergency separation",() => {
    const css = readFileSync("apps/ui/app/globals.css","utf8");
    expect(css).toMatch(/\.supportHelpNumbers\s+\.crisisSupportLines\s*\{[^}]*gap:/su);
    expect(css).toMatch(/\.supportHelpNumbers\s+\.crisisSupportEmergency\s*\{[^}]*margin-top:/su);
  });
  it.each(["terracotta","chamber"] as const)("V14 %s compact notice is first before any request",async (mode) => {
    document.documentElement.dataset.mode = mode;
    const client = transport(answer("NO_SOURCE"));
    await render(localized(<Assistant client={client} signedIn={false} />));
    expect(document.querySelector(".supportConversation")?.firstElementChild?.textContent).toBe(supportEn["support.notice"]);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it.each(["terracotta","chamber"] as const)("V14 %s full-page notice scrolls with the conversation",async (mode) => {
    document.documentElement.dataset.mode = mode;
    const client = transport(answer("NO_SOURCE"));
    await render(localized(<Assistant fullPage client={client} signedIn={false} />));
    const conversation = document.querySelector(".supportChatScroll .supportConversation")!;
    expect(conversation.firstElementChild?.textContent).toBe(supportEn["support.notice"]);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it.each(["terracotta","chamber"] as const)("V15 %s shows too-long for a JSON 413",async (mode) => {
    document.documentElement.dataset.mode = mode;
    vi.stubGlobal("fetch",vi.fn(async () => json({ error: "TOO_LARGE" },413)));
    await render(localized(<Assistant client={realClient()} signedIn={false} />)); await send();
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe(supportEn["support.tooLong"]);
  });
  it.each(["terracotta","chamber"] as const)("V15 %s shows too-long for an empty 413",async (mode) => {
    document.documentElement.dataset.mode = mode;
    vi.stubGlobal("fetch",vi.fn(async () => new Response(null,{ status: 413 })));
    await render(localized(<Assistant client={realClient()} signedIn={false} />)); await send();
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe(supportEn["support.tooLong"]);
  });
  it.each(["terracotta","chamber"] as const)("V15 %s shows too-long for HTML 413",async (mode) => {
    document.documentElement.dataset.mode = mode;
    vi.stubGlobal("fetch",vi.fn(async () => new Response("<h1>Too large</h1>",{ status: 413,headers: { "content-type": "text/html" } })));
    await render(localized(<Assistant client={realClient()} signedIn={false} />)); await send();
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe(supportEn["support.tooLong"]);
  });
  it("V16 renders the TOO_LONG template as the reply",async () => {
    await show(answer("TOO_LONG",supportEn["support.tooLong"]));
    expect(document.querySelector(".supportMessage--assistant p")?.textContent).toBe(supportEn["support.tooLong"]);
  });
  it("V17 a country refusal records not-offered in this tab",async () => {
    vi.stubGlobal("fetch",vi.fn(async () => json({ outcome: "DISABLED",code: "COUNTRY_SERVICE_UNAVAILABLE",text: "Closed" },403)));
    await expect(supportAssistantClient.sendMessage("Question","en")).rejects.toThrow();
    expect(sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY)).toBe("false");
  });
  it("V18 posts only text and language to the message route with no support session header",async () => {
    const fetch = vi.fn(async () => json({ outcome: "NO_SOURCE",text: "No source" }));
    vi.stubGlobal("fetch",fetch);
    await supportAssistantClient.sendMessage("Question","ro");
    expect(fetch).toHaveBeenCalledWith("/api/v1/support/messages",expect.objectContaining({
      method: "POST",body: JSON.stringify({ text: "Question",language: "ro" })
    }));
    const headers = fetch.mock.calls[0]?.[1]?.headers as Record<string,string>;
    expect(headers).not.toHaveProperty("x-support-session-token");
  });
});
