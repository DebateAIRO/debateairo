// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (CHR2-9): the /help chat conceals itself while the page sleeps (bfcache) and until
 * the wake's check decides, and every control that acts on the conversation is switched off meanwhile, the focused one
 * included. Under the site's focus guard, focus comes back to that control once it is on again. The chat is the real
 * one; the API is stood in through `fetch` (installed before any module loads), as in s04-assistant-session-change.test.tsx.
 */
const fetchRoute = vi.hoisted(() => {
  const state: { handler: ((url: string, init?: RequestInit) => Promise<Response>) | null } = { handler: null };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => state.handler === null
    ? original(input, init) : state.handler(String(input), init)) as typeof fetch;
  return state;
});

import { Assistant } from "../../apps/ui/components/support/Assistant.js";
import { SupportConversationGuard } from "../../apps/ui/components/support/SupportConversationGuard.js";
import { announceSessionChange } from "../../apps/ui/components/support/sessionChange.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, startFocusGuard } from "./kbd-guard-harness";

const DATE = "Wed, 30 Sep 2026 11:42:23 GMT";
const T = 1_790_768_543;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", date: DATE } });
const at = new Date((T - 600) * 1000).toISOString();
function installApi(): void {
  fetchRoute.handler = async (url) => {
    if (url === "/api/v1/session") return json({});
    if (url === "/api/v1/auth/sessions") return json({ sessions: [{ session_id: "11111111-1111-4111-8111-111111111111", created_at: at, last_seen_at: at,
      idle_expires_at: "2026-10-14T11:42:53.000Z", absolute_expires_at: "2026-12-29T11:42:53.000Z", last_mfa_at: at, current: true }] });
    if (url === "/api/v1/support/status") return json({ configuration: { kind: "AVAILABLE" }, relay_state: "AVAILABLE", kb_loaded: { shipped: 12, ignored: 0 } });
    throw new Error(`UNEXPECTED_FETCH:${url}`);
  };
}
function persisted(type: "pagehide" | "pageshow"): Event {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: true });
  return event;
}

const roots: Root[] = [];
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.sessionStorage.clear();
  announceSessionChange();
  installApi();
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
  fetchRoute.handler = null;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function mount(node: React.ReactNode, into: HTMLElement): Promise<void> {
  const root = createRoot(into);
  roots.push(root);
  await act(async () => root.render(node));
}
async function until(condition: () => boolean, ms = 2000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  return condition();
}

describe("CHR2-9: the chat conceals itself across a sleep", () => {
  it("New conversation, focused when the page sleeps, has focus again once the wake's check lets it act", async () => {
    const main = document.createElement("main");
    main.id = "main-content";
    document.body.append(main);
    const guardHost = document.createElement("div");
    const chatHost = document.createElement("div");
    main.append(guardHost, chatHost);
    await mount(<SupportConversationGuard />, guardHost);
    await mount(<Assistant fullPage />, chatHost);
    const fresh = () => chatHost.querySelector<HTMLButtonElement>(".supportNewConversation");
    expect(await until(() => fresh() !== null && !fresh()!.disabled), "the chat is ready").toBe(true);
    const button = fresh()!;
    await act(async () => {
      button.focus();
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(button);
    await act(async () => { window.dispatchEvent(persisted("pagehide")); });
    expect(button.disabled, "concealed while asleep").toBe(true);
    await act(async () => { window.dispatchEvent(persisted("pageshow")); });
    expect(await until(() => !button.disabled), "the wake's check decided").toBe(true);
    await guardSettled();
    expect(button.isConnected).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button);
  });
});
