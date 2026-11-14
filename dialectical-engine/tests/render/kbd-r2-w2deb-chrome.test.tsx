// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "../../apps/ui/components/AccountMenu.js";
import { HelpSupport } from "../../apps/ui/components/support/HelpSupport.js";
import { markSupportNotOffered, resetSupportOfferedForTests, SUPPORT_OFFERED_STORAGE_KEY } from "../../apps/ui/components/support/availability.js";
import chrome from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import support from "../../apps/ui/messages/en/support.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (CHR1-1, CHR2-7): the account menu's Log out, and the /help chat a country refusal
 * takes away, under the site's focus guard, where the guard's own landing is the right one. The menu and HelpSupport
 * are the real ones; the session API is stood in, and the chat is a stand-in composer (HelpSupport's half only).
 */
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: { ...support, ...chrome } }) }));

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  resetSupportOfferedForTests();
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function settle() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
async function mount(element: React.ReactElement) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(element); });
  await settle();
}
async function key(target: Element, init: KeyboardEventInit) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); await Promise.resolve(); });
}

describe("CHR1-1: a failed Log out in the account menu (a panel at the end of <body>)", () => {
  // The menu's onBlur reads relatedTarget: the harness's blur for a switched-off control names none, as a browser's does.

  it("comes back to Log out once it is on again, with the menu open and the error under it; Escape still closes onto the trigger", async () => {
    let fail: () => void = () => undefined;
    const logout = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = () => reject(new Error("made-up 502")); }));
    await mount(<AccountMenu authenticated catalog={chrome} client={{ logout, revokeAllSessions: vi.fn() }} redirectTo={null} />);
    const trigger = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    await key(trigger, { key: "ArrowDown" });
    await key(document.activeElement!, { key: "End" });
    const button = document.querySelector<HTMLButtonElement>("[data-account-logout]")!;
    expect(document.activeElement).toBe(button);
    pressByKeyboard(button);
    await settle();
    await guardSettled();
    expect(button.disabled).toBe(true);
    // The in-flight blur is not the person leaving: the menu stays open.
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => fail());
    await settle();
    await guardSettled();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('[role="menu"] [role="alert"]')!.textContent).toBe(chrome["chrome.accountError"]);
    await key(document.activeElement!, { key: "Escape" });
    await act(async () => { await new Promise((resolve) => queueMicrotask(() => resolve(undefined))); });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("CHR2-7: a country refusal mid-chat on /help", () => {
  it("parks on the help page's own part, which now holds only the refusal line", async () => {
    sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, "true");
    await mount(<div className="supportPage" data-help-page><HelpSupport chat={<form><input id="support-message" aria-label="Message" /></form>} /></div>);
    const composer = document.querySelector<HTMLInputElement>("#support-message")!;
    expect(composer).not.toBeNull();
    await act(async () => {
      composer.focus();
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await act(async () => markSupportNotOffered());
    await guardSettled();
    const page = document.querySelector<HTMLElement>("[data-help-page]")!;
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(page);
    expect(page.hasAttribute("data-focus-parked")).toBe(true);
    expect(page.textContent).toBe(support["support.countryUnavailable"]);
  });
});
