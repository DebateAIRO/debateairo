// @vitest-environment jsdom
// Keyboard audit round 3 (2026-11-12), K4 / CSS-12: the V4 header's round account button reuses the site's AccountMenu
// (PR #204 item 5) with its own trigger and items, and only kbd-account-menu pinned the keyboard rules, on the classic
// look. Here the same rules are followed through the V4 header: open by keyboard, the arrows, Escape back to the
// button, and Tab out closing the menu onto the button. Mocks copied from v4-header-account.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  createDebate: async () => { throw new Error("not in this test"); },
  validateSession: async () => undefined,
  contractClient: {
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 15, resets_at: "2026-12-01T00:00:00.000Z" }] }),
    logout: async () => undefined,
    revokeAllSessions: async () => ({ revoked: 0 })
  }
}));

import { V4Header } from "../../apps/ui/components/v4/V4Header.js";

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/v4/debate/11111111-1111-4111-8111-111111111111");
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  delete document.documentElement.dataset.mode;
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}
async function mount(): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<V4Header catalog={CATALOG} readingLevel="plain" classicHref="/debate/11111111-1111-4111-8111-111111111111" />));
  await settle();
}

const trigger = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>(".v4HdrAccountButton")!;
const menu = (): HTMLElement | null => document.querySelector<HTMLElement>("[role=menu]");
const items = (): HTMLElement[] => [...(menu()?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
async function key(target: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await Promise.resolve();
  });
  return event;
}
/** Enter on the focused round button: the key goes down and the button is activated, as a browser does. */
async function pressTrigger(): Promise<void> {
  await act(async () => {
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    trigger().click();
    await Promise.resolve();
  });
}

describe("the V4 account menu by keyboard", () => {
  it("Enter on the round button opens the menu with focus on its first item, and says so on the button", async () => {
    await mount();
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await pressTrigger();
    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(menu()!.id);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("ArrowDown on the round button opens it too", async () => {
    await mount();
    trigger().focus();
    await key(trigger(), { key: "ArrowDown" });
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
  });

  it("the arrows move through every item and wrap; Home and End jump to the ends", async () => {
    await mount();
    await pressTrigger();
    const all = items();
    // My questions, Language, Light or dark, Settings, the classic view, Sign out.
    expect(all).toHaveLength(6);
    for (let index = 1; index < all.length; index += 1) {
      await key(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(all[index]);
    }
    await key(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement, "ArrowDown wraps to the first").toBe(all[0]);
    await key(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement, "ArrowUp wraps to the last").toBe(all.at(-1));
    await key(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(all[0]);
    await key(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(all.at(-1));
  });

  it("Escape closes the menu and gives focus back to the round button", async () => {
    await mount();
    await pressTrigger();
    await key(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items()[1]);
    await key(document.activeElement!, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  it("Tab past the last item closes the menu onto the round button (the panel sits at the end of the page)", async () => {
    await mount();
    await pressTrigger();
    await key(document.activeElement!, { key: "End" });
    await key(document.activeElement!, { key: "Tab" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("Shift+Tab before the first item closes the menu and stays on the round button", async () => {
    await mount();
    await pressTrigger();
    const event = await key(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(menu()).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it("Tab between items keeps the menu open", async () => {
    await mount();
    await pressTrigger();
    const event = await key(document.activeElement!, { key: "Tab" });
    expect(event.defaultPrevented).toBe(false);
    expect(menu()).not.toBeNull();
  });

  it("focus leaving for nowhere closes the menu onto the round button", async () => {
    await mount();
    await pressTrigger();
    await act(async () => {
      (document.activeElement as HTMLElement).blur();
      await Promise.resolve();
    });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
