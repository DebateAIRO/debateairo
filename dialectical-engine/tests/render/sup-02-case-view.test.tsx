// @vitest-environment jsdom

import React,{ createContext,useContext,type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it,vi } from "vitest";
import type { LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import type { MessageCatalog } from "../../apps/ui/lib/i18n/translate.js";

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
    return <TestI18nContext.Provider value={{ locale,catalog }}>{children}</TestI18nContext.Provider>;
  },
  useChromeI18n() {
    const context = useContext(TestI18nContext);
    if (context === null) throw new Error("Missing test I18nProvider");
    return context;
  }
}));

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import {
  CaseOpened,CaseView,OwnCaseList,supportCaseClient
} from "../../apps/ui/components/support/CaseView.js";

async function messages(locale: "en" | "ro"): Promise<Record<string,string>> {
  return JSON.parse(await readFile(
    `apps/ui/messages/${locale}/support.json`,"utf8"
  )) as Record<string,string>;
}

async function templates(locale: "en" | "ro"): Promise<Record<string,string>> {
  return JSON.parse(await readFile(
    `packages/support-kb/content/templates/${locale}.json`,"utf8"
  )) as Record<string,string>;
}

function localized(
  locale: "en" | "ro",catalog: MessageCatalog,component: ReactNode
): ReactNode {
  return <I18nProvider locale={locale} catalog={catalog}>{component}</I18nProvider>;
}

describe("SUP-02 case browser surfaces", () => {
  it("renders the exact acknowledgement without promising an outcome", async () => {
    // The acknowledgement is a server template now (PLAN-SUPPORT §5); build it exactly
    // as apps/api/src/support/index.ts openedCaseReceipt() does, from the en template
    // file itself (the loader resolves its directory from import.meta.url, which jsdom
    // does not provide, so the JSON is read directly — same bytes, no loader).
    const englishTemplates = await templates("en");
    const text = englishTemplates.CASE_OPENED!
      .replace("{token}","opaque-token")
      .replace("{sla}","48")
      .replace("{link}","/help?case=opaque-token");
    const html = renderToStaticMarkup(<CaseOpened token="opaque-token" text={text} />);
    expect(html).toContain("I&#x27;ve opened case opaque-token for a person.");
    expect(html).toContain("within 48 hours");
    expect(html).toContain('href="/help?case=opaque-token"');
    expect(html).toContain("I can&#x27;t promise an outcome");
    expect(html).not.toMatch(/\b(?:will|guaranteed|resolved)\b/iu);
  });

  it("attributes V replies to a person and renders reply and closed affordances", async () => {
    const [englishTemplates,englishMessages] = await Promise.all([
      templates("en"),messages("en")
    ]);
    const html = renderToStaticMarkup(localized("en",englishMessages,<CaseView
      token="opaque-token"
      state="CLOSED"
      text={`${englishTemplates.HUMAN_LABEL} ${englishTemplates.CLOSED_LABEL}`}
      messages={[
        { id: "1",role: "user",text: "Thank you" },
        { id: "2",role: "V",text: "A person here." }
      ]}
    />));
    expect(html).toContain(englishTemplates.HUMAN_LABEL);
    expect(html).toContain(englishTemplates.CLOSED_LABEL);
    expect(html).toContain(englishMessages["support.case.reply"]);
  });

  it("renders unknown-token and identity-bound own-case states", async () => {
    const [romanianTemplates,romanianMessages,englishMessages] = await Promise.all([
      templates("ro"),messages("ro"),messages("en")
    ]);
    expect(renderToStaticMarkup(localized("ro",romanianMessages,<CaseView
      token="missing" state="NOT_FOUND" messages={[]} text={romanianTemplates.NOT_FOUND}
    />))).toContain(romanianTemplates.NOT_FOUND);
    expect(renderToStaticMarkup(localized("en",englishMessages,
      <OwnCaseList signedIn={false} cases={[]} />
    )))
      .toBe("");
    expect(renderToStaticMarkup(localized("en",englishMessages,<OwnCaseList
      signedIn cases={[{ caseId: "case-a",state: "NEW",createdAt: "2026-09-07" }]}
    />))).toContain("case-a");
  });

  it("renders the bilingual advisory summary as plain text and suppresses null or shredded summaries", async () => {
    const [englishTemplates,romanianTemplates,englishMessages,romanianMessages] = await Promise.all([
      templates("en"),templates("ro"),messages("en"),messages("ro")
    ]);
    const english = renderToStaticMarkup(localized("en",englishMessages,<CaseView
      token="opaque" state="NEW" messages={[]}
      summary={'<img src=x onerror="alert(1)"> advisory'}
    />));
    expect(english).toContain(englishTemplates.SUMMARY_LABEL);
    expect(english).toContain(`aria-label="${englishTemplates.SUMMARY_LABEL}"`);
    expect(english).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; advisory");
    expect(english).not.toContain("<img");

    const romanianNull = renderToStaticMarkup(localized("ro",romanianMessages,<CaseView
      token="opaque" state="NEW" messages={[]} summary={null}
    />));
    expect(romanianNull).not.toContain(romanianTemplates.SUMMARY_LABEL);

    const shredded = renderToStaticMarkup(localized("ro",romanianMessages,<CaseView
      token="opaque" state="SHREDDED" text={romanianTemplates.SHREDDED_NOTICE}
      messages={[{ id: "secret",role: "user",text: "must not render" }]}
      summary="must not render"
    />));
    expect(shredded).toContain(romanianTemplates.SHREDDED_NOTICE);
    expect(shredded).not.toContain("must not render");
    expect(shredded).not.toContain(romanianTemplates.SUMMARY_LABEL);
    expect(shredded).not.toContain("<form");
  });

  it("mounts the authenticated own-case lookup on the help page", async () => {
    const source = await readFile("apps/ui/app/help/page.tsx","utf8");
    expect(source).toContain("<OwnCaseLookup />");
  });

  it("posts case replies through the same-origin CSRF boundary without identity fabrication", async () => {
    const csrf = "r".repeat(43);
    const token = "T".repeat(43);
    Object.defineProperty(document,"cookie",{
      configurable: true,value: `__Host-debateai-csrf=${csrf}`
    });
    const calls: Array<Readonly<{ url: string;init: RequestInit }>> = [];
    vi.stubGlobal("fetch",vi.fn(async (url: string,init: RequestInit = {}) => {
      calls.push({ url,init });
      return new Response("{}",{ status: 201 });
    }));

    await supportCaseClient.reply(token,"I still need help");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/v1/support/cases/${token}/messages`);
    expect(calls[0]!.init).toMatchObject({ method: "POST",credentials: "same-origin" });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("x-csrf-token")).toBe(csrf);
    expect(headers.get("x-support-session-token")).toBeNull();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: "I still need help" });
    vi.unstubAllGlobals();
  });
});
