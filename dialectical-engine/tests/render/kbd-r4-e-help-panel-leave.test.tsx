// @vitest-environment jsdom
// Keyboard audit round 4 (E1, 12 Nov 2026): the open Help panel is a non-modal box in the bottom right corner, and while
// it is open its toggle is hidden. Tab past its last control (or Shift+Tab before its first) went to controls UNDER the
// panel (the cookie notice, the one-line footer's links, the footer's language button), and Escape no longer reached it.
// Now focus that leaves the widget for another control closes the panel and stays where it went; the widget is still
// not modal (Tab is never trapped), a pointer press outside is not affected, and Escape inside still closes onto Help.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import supportEnglish from "../../apps/ui/messages/en/support.json" with { type: "json" };

vi.mock("@/lib/i18n/I18nProvider", () => ({
  useChromeI18n: () => Object.freeze({ locale: "en" as const, catalog: Object.freeze({ ...chromeEnglish, ...supportEnglish }) })
}));

import { SupportWidget } from "../../apps/ui/components/support/SupportWidget.js";
import { resetSupportOfferedForTests, SUPPORT_OFFERED_STORAGE_KEY } from "../../apps/ui/components/support/availability.js";

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Reduced motion: the panel unmounts at once, so the assertions see the end state.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
  sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, "true");
  resetSupportOfferedForTests();
  document.body.innerHTML = '<button id="before">before</button><div id="root"></div><a id="after" href="#x">after</a>';
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  sessionStorage.clear();
  resetSupportOfferedForTests();
  vi.unstubAllGlobals();
});

const toggle = () => document.querySelector<HTMLButtonElement>("[data-support-widget-toggle]")!;
const panel = () => document.querySelector("[data-support-widget-panel]");
const message = () => document.querySelector<HTMLElement>('[name="support-message"]')!;

async function openPanel(): Promise<void> {
  await act(async () => root.render(<SupportWidget />));
  toggle().focus();
  await act(async () => toggle().click());
  expect(panel()).not.toBeNull();
  expect(document.activeElement).toBe(message());
}

it.each(["before", "after"])("focus that leaves the open panel for a control %s it closes the panel and stays there", async (id) => {
  await openPanel();
  const outside = document.getElementById(id)!;
  await act(async () => { outside.focus(); });
  expect(panel(), "the panel would stay open over the control the keyboard moved to").toBeNull();
  expect(document.activeElement, "focus is not pulled back to Help").toBe(outside);
});

it("a pointer press outside does not close the panel (as before)", async () => {
  await openPanel();
  const outside = document.getElementById("after")!;
  await act(async () => {
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    outside.focus();
    outside.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  expect(panel()).not.toBeNull();
});

it("a tap outside on a touch screen (down, up, then focus) does not close the panel or lose the draft (round 4 review)", async () => {
  await openPanel();
  const outside = document.getElementById("after")!;
  await act(async () => {
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    outside.dispatchEvent(new Event("pointerup", { bubbles: true }));
    outside.focus();
  });
  expect(panel()).not.toBeNull();
});

it("after a pointer press, a later Tab out of the panel still closes it", async () => {
  await openPanel();
  const outside = document.getElementById("after")!;
  await act(async () => {
    message().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    message().dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  await act(async () => {
    message().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    outside.focus();
  });
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(outside);
});

it("focus that falls to nowhere (no next control) keeps the panel open", async () => {
  await openPanel();
  await act(async () => { message().blur(); });
  expect(panel()).not.toBeNull();
});

it("moving between the panel's own controls keeps it open, and Escape still closes onto Help", async () => {
  await openPanel();
  const link = document.querySelector<HTMLElement>(".supportWidgetFullPage")!;
  await act(async () => { link.focus(); });
  expect(panel()).not.toBeNull();
  await act(async () => { link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(toggle());
});
