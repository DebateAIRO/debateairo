// @vitest-environment jsdom

import { act,createContext,createElement,useContext,type ReactNode } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import supportEnglish from "../../apps/ui/messages/en/support.json" with { type: "json" };

const TestI18nContext = createContext<Readonly<{
  locale: LocaleCode;
  catalog: MessageCatalog;
}> | null>(null);

vi.mock("@/lib/i18n/I18nProvider", () => ({
  I18nProvider({ locale,catalog,children }: Readonly<{
    locale: LocaleCode;
    catalog: MessageCatalog;
    children: ReactNode;
  }>) {
    return createElement(TestI18nContext.Provider,{ value: { locale,catalog } },children);
  },
  useChromeI18n() {
    const context = useContext(TestI18nContext);
    return context ?? Object.freeze({
      locale: "en" as const,
      catalog: Object.freeze({ ...chromeEnglish,...supportEnglish })
    });
  }
}));

import { Assistant,supportAssistantClient } from "../../apps/ui/components/support/Assistant.js";

/**
 * Paid plans G3a, extended to support: where the service is not offered the support panel says
 * so in place of its composer — the sign-up page's own sentence — and starts nothing.
 */
const SENTENCE = "Dialectical Engine isn't available in your country yet.";

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown,status = 200): Response {
  return {
    ok: status >= 200 && status < 300,status,json: async () => body,headers: new Headers()
  } as Response;
}

function testClient(open: boolean) {
  return {
    isOpenHere: vi.fn(async () => open),
    createSession: vi.fn(async () => ({ sessionId: "new-session",token: "new-token",identityBound: false })),
    sendMessage: vi.fn(),rate: vi.fn(),escalate: vi.fn()
  };
}

describe("the support panel where the service is not offered", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    sessionStorage.clear();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  for (const fullPage of [false,true]) {
    it(`shows the sentence instead of the composer and starts nothing (${fullPage ? "help page" : "widget"})`,
      async () => {
        const client = testClient(false);
        await act(async () => root!.render(<Assistant signedIn={false} fullPage={fullPage} client={client} />));
        await settle();
        expect(document.querySelector("[data-support-country-unavailable]")?.textContent).toBe(SENTENCE);
        expect(document.querySelector('[name="support-message"]')).toBeNull();
        const human = [...document.querySelectorAll<HTMLButtonElement>("button")]
          .filter((button) => /to a human/u.test(button.textContent ?? ""));
        expect(human.length).toBeGreaterThan(0);
        for (const button of human) {
          expect(button.disabled).toBe(true);
          await act(async () => button.click());
        }
        await settle();
        expect(client.createSession).not.toHaveBeenCalled();
        expect(client.escalate).not.toHaveBeenCalled();
      });
  }

  it("keeps the composer where support is offered", async () => {
    const client = testClient(true);
    await act(async () => root!.render(<Assistant signedIn={false} client={client} />));
    await settle();
    expect(client.isOpenHere).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[name="support-message"]')).not.toBeNull();
    expect(document.querySelector("[data-support-country-unavailable]")).toBeNull();
  });

  it("reads `support` from the availability check, and fails open like the sign-up page", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ signup: false,pay: false,support: false }));
    vi.stubGlobal("fetch",fetchMock);
    await expect(supportAssistantClient.isOpenHere!()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/geo/availability",expect.objectContaining({ method: "GET" }));
    fetchMock.mockImplementation(async () => jsonResponse({ signup: true,pay: false,support: true }));
    await expect(supportAssistantClient.isOpenHere!()).resolves.toBe(true);
    fetchMock.mockImplementation(async () => jsonResponse({ error: "RATE_LIMITED" },429));
    await expect(supportAssistantClient.isOpenHere!()).resolves.toBe(true);
    fetchMock.mockImplementation(async () => { throw new TypeError("offline"); });
    await expect(supportAssistantClient.isOpenHere!()).resolves.toBe(true);
  });

  it("renders the API's own 403 refusal as an answer, not as an outage", async () => {
    vi.stubGlobal("fetch",vi.fn(async () => jsonResponse({
      outcome: "DISABLED",code: "COUNTRY_SUPPORT_UNAVAILABLE",text: SENTENCE
    },403)));
    const started = await supportAssistantClient.createSession("en");
    expect(started).toMatchObject({ outcome: "DISABLED",text: SENTENCE });
  });
});
