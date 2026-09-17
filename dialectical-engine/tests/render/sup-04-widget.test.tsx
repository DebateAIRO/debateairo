// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { SupportWidget } from "../../apps/ui/components/support/SupportWidget.js";
import { Assistant } from "../../apps/ui/components/support/Assistant.js";

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submit(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('[name="support-message"]')!;
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event("input",{ bubbles: true }));
  });
  await act(async () => document.querySelector<HTMLFormElement>("form")!
    .dispatchEvent(new Event("submit",{ bubbles: true,cancelable: true })));
  await settle();
}

function jsonResponse(body: unknown,status = 200): Response {
  return { ok: status >= 200 && status < 300,status,json: async () => body } as Response;
}

describe("SUP-04 product-route support widget", () => {
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

  it("starts collapsed as the exact accessible English button", () => {
    const html = renderToStaticMarkup(<SupportWidget />);
    const parsed = new DOMParser().parseFromString(html,"text/html");
    const widget = parsed.querySelector('[data-widget-state="collapsed"]');
    const button = widget?.querySelector<HTMLButtonElement>('button[aria-label="Help"]');
    expect(button?.textContent).toBe("Help");
    expect(parsed.querySelector("[data-support-widget-panel]")).toBeNull();
  });

  it("always shows human escalation and creates a session before using it", async () => {
    const createSession = vi.fn(async () => ({
      sessionId: "new-session",token: "new-token",identityBound: false
    }));
    const escalate = vi.fn(async () => ({ token: "case-token",text: "Case opened" }));
    await act(async () => root!.render(<Assistant signedIn={false} client={{
      createSession,sendMessage: vi.fn(),rate: vi.fn(),escalate
    }} />));
    const human = [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Talk to a human") as HTMLButtonElement | undefined;
    expect(human).toBeDefined();
    await act(async () => human!.click());
    await settle();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(escalate).toHaveBeenCalledWith({
      sessionId: "new-session",token: "new-token",identityBound: false
    },"en");
    expect(document.body.textContent).toContain("Case opened");
  });

  it("expands, focuses the message control, and follows the Romanian override", async () => {
    await act(async () => root!.render(<SupportWidget />));
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Help"]')!;
    button.focus();
    await act(async () => button.click());
    await settle();

    expect(document.querySelector('[data-widget-state="expanded"]')).not.toBeNull();
    expect(document.querySelector("[data-support-widget-panel]")).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector('[name="support-message"]')
    );

    const ro = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === "RO") as HTMLButtonElement;
    await act(async () => ro.click());
    const collapse = document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!;
    await act(async () => collapse.click());
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Ajutor"]')?.textContent)
      .toBe("Ajutor");
  });

  it("uses fixed lower-corner geometry and caps the expanded panel at seventy viewport percent", async () => {
    const css = await readFile("apps/ui/app/globals.css","utf8");
    expect(css).toMatch(/[.]supportWidget\s*\{[^}]*position:\s*fixed[^}]*right:\s*var\([^}]*bottom:\s*var\(/su);
    expect(css).toMatch(/[.]supportWidgetPanel\s*\{[^}]*max-height:\s*70vh/su);
    expect(css).not.toMatch(/[.]supportWidget(?:Panel)?\s*\{[^}]*top:/su);
  });

  it("publishes the exact primary-control measurement hook on all three owner surfaces", async () => {
    const [home,create,publication] = await Promise.all([
      readFile("apps/ui/app/page.tsx","utf8"),
      readFile("apps/ui/app/new/page.tsx","utf8"),
      readFile("apps/ui/components/PublicationControl.tsx","utf8")
    ]);
    expect(home).toMatch(/<section[^>]*data-support-primary-control[^>]*id="start-a-debate"/u);
    expect(create).toMatch(/<button[^>]*data-support-primary-control[^>]*type="submit"/su);
    expect(publication).toMatch(/<section[^>]*data-support-primary-control[^>]*aria-label="Publication controls"/u);
  });

  it("continues one session and its messages across widget and full-page remounts in the tab", async () => {
    const fetch = vi.fn(async (url: string,init?: RequestInit) => {
      if (url === "/api/v1/session") return jsonResponse({},401);
      if (url === "/api/v1/support/sessions" && init?.method === "POST") {
        return jsonResponse({ session: { session_id: "session-1" },session_token: "token-1" });
      }
      if (url.endsWith("/messages") && init?.method === "POST") {
        return jsonResponse({ message_id: "message-1",outcome: "NO_SOURCE",text: "Saved answer" });
      }
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    });
    vi.stubGlobal("fetch",fetch);

    await act(async () => root!.render(<SupportWidget />));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!.click());
    await submit("Saved question");
    expect(document.querySelector<HTMLAnchorElement>('a[href="/help"]')?.textContent)
      .toBe("Open full page");
    expect(sessionStorage.length).toBe(1);

    await act(async () => root!.unmount());
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<SupportWidget />));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!.click());
    expect(document.body.textContent).toContain("Saved question");
    expect(document.body.textContent).toContain("Saved answer");
    expect(fetch.mock.calls.filter(([url,init]) =>
      url === "/api/v1/support/sessions" && (init as RequestInit | undefined)?.method === "POST"
    )).toHaveLength(1);
  });

  it("keeps secret-like text out of the browser conversation and session storage", async () => {
    const sent: string[] = [];
    const fetch = vi.fn(async (url: string,init?: RequestInit) => {
      if (url === "/api/v1/session") return jsonResponse({},401);
      if (url === "/api/v1/support/sessions") {
        return jsonResponse({ session: { session_id: "session-secret" },session_token: "token-secret" });
      }
      if (url.endsWith("/messages")) {
        sent.push(String((JSON.parse(String(init?.body)) as Record<string,unknown>).text));
        return jsonResponse({
          message_id: "message-secret",outcome: "NO_SOURCE",
          text: "Reply repeats 654321 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature sk-live-secret"
        });
      }
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    });
    vi.stubGlobal("fetch",fetch);

    await act(async () => root!.render(<SupportWidget />));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!.click());
    await submit("Use 123456 abc.def.ghi and key-private-value");

    const stored = sessionStorage.getItem("debateai.support.conversation.v1") ?? "";
    expect(sent).toEqual(["Use [REDACTED_SECRET_LIKE] [REDACTED_SECRET_LIKE] and [REDACTED_SECRET_LIKE]"]);
    expect(stored).toContain("[REDACTED_SECRET_LIKE]");
    expect(stored).not.toMatch(/123456|654321|abc[.]def[.]ghi|eyJhbGci|key-private|sk-live/u);
    expect(document.body.textContent).not.toMatch(/123456|654321|abc[.]def[.]ghi|eyJhbGci|key-private|sk-live/u);
  });

  it("sends only public text and exposes no private context prop at the owner-page caller", async () => {
    const bodies: Array<Record<string,unknown>> = [];
    const fetch = vi.fn(async (url: string,init?: RequestInit) => {
      if (url === "/api/v1/session") return jsonResponse({});
      if (url === "/api/v1/support/sessions") {
        return jsonResponse({ session: { session_id: "session-2" },session_token: "token-2" });
      }
      if (url.endsWith("/messages")) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string,unknown>);
        return jsonResponse({ message_id: "message-2",outcome: "NO_SOURCE",text: "Public guidance only" });
      }
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    });
    vi.stubGlobal("fetch",fetch);
    await act(async () => root!.render(<SupportWidget />));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-support-widget-toggle]')!.click());
    await settle();
    await submit("Where is Your debates?");
    expect(bodies).toEqual([{ text: "Where is Your debates?" }]);

    const owner = await readFile("apps/ui/app/debate/[id]/DebatePageGate.tsx","utf8");
    const published = await readFile(
      "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx","utf8"
    );
    expect(owner).toContain("<SupportWidget />");
    expect(owner).not.toMatch(/<SupportWidget[^>]*context=/u);
    expect(published).toContain("<SupportWidget />");
    expect(published).not.toMatch(/<SupportWidget[^>]*context=/u);
  });
});
