// @vitest-environment jsdom

import React from "react";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it,vi } from "vitest";
import {
  CaseOpened,CaseView,OwnCaseList,supportCaseClient
} from "../../apps/ui/components/support/CaseView.js";

describe("SUP-02 case browser surfaces", () => {
  it("renders the exact acknowledgement without promising an outcome", () => {
    const html = renderToStaticMarkup(<CaseOpened token="opaque-token" slaHours={48} language="en" />);
    expect(html).toContain("I&#x27;ve opened case opaque-token for a person.");
    expect(html).toContain("within 48 hours");
    expect(html).toContain('href="/help?case=opaque-token"');
    expect(html).toContain("I can&#x27;t promise an outcome");
    expect(html).not.toMatch(/\b(?:will|guaranteed|resolved)\b/iu);
  });

  it("attributes V replies to a person and renders reply and closed affordances", () => {
    const html = renderToStaticMarkup(<CaseView
      language="en"
      token="opaque-token"
      state="CLOSED"
      messages={[
        { id: "1",role: "user",text: "Thank you" },
        { id: "2",role: "V",text: "A person here." }
      ]}
    />);
    expect(html).toContain("Support (a person)");
    expect(html).toContain("This case is closed. You can still reply to reopen it.");
    expect(html).toContain("Reply to this case");
  });

  it("renders unknown-token and identity-bound own-case states", () => {
    expect(renderToStaticMarkup(<CaseView
      language="ro" token="missing" state="NOT_FOUND" messages={[]}
    />)).toContain("Nu există niciun caz cu acest cod.");
    expect(renderToStaticMarkup(<OwnCaseList signedIn={false} cases={[]} language="en" />))
      .toBe("");
    expect(renderToStaticMarkup(<OwnCaseList
      signedIn cases={[{ caseId: "case-a",state: "NEW",createdAt: "2026-09-07" }]} language="en"
    />)).toContain("case-a");
  });

  it("renders the bilingual advisory summary as plain text and suppresses null or shredded summaries", () => {
    const english = renderToStaticMarkup(<CaseView
      language="en" token="opaque" state="NEW" messages={[]}
      summary={'<img src=x onerror="alert(1)"> advisory'}
    />);
    expect(english).toContain("Model-written summary — advisory");
    expect(english).toContain('aria-label="Model-written summary — advisory"');
    expect(english).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; advisory");
    expect(english).not.toContain("<img");

    const romanianNull = renderToStaticMarkup(<CaseView
      language="ro" token="opaque" state="NEW" messages={[]} summary={null}
    />);
    expect(romanianNull).not.toContain("Rezumat scris de model — orientativ");

    const shredded = renderToStaticMarkup(<CaseView
      language="ro" token="opaque" state="SHREDDED"
      messages={[{ id: "secret",role: "user",text: "must not render" }]}
      summary="must not render"
    />);
    expect(shredded).toContain("Această conversație a fost ștearsă la cererea proprietarului.");
    expect(shredded).not.toContain("must not render");
    expect(shredded).not.toContain("Rezumat scris de model — orientativ");
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
