// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (CHR2-8, the widget half): Escape that only cancels an IME candidate in the help composer
// closed the widget, and the draft went with it. Escape during composition now belongs to the text field.
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
  sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, "true");
  resetSupportOfferedForTests();
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  sessionStorage.clear();
  resetSupportOfferedForTests();
  vi.unstubAllGlobals();
});

async function escape(init: KeyboardEventInit, keyCode?: number): Promise<void> {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
  if (keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: keyCode });
  await act(async () => { document.activeElement!.dispatchEvent(event); });
}

it.each([["isComposing", { isComposing: true }, undefined], ["keyCode 229", {}, 229]] as const)("Escape flagged by %s keeps the widget open", async (_name, init, keyCode) => {
  await act(async () => root.render(<SupportWidget />));
  const toggle = document.querySelector<HTMLButtonElement>("[data-support-widget-toggle]")!;
  toggle.focus();
  await act(async () => toggle.click());
  expect(document.activeElement).toBe(document.querySelector('[name="support-message"]'));
  await escape(init, keyCode);
  expect(document.querySelector('[data-widget-state="expanded"]')).not.toBeNull();
  await escape({});
  expect(document.querySelector('[data-widget-state="expanded"]'), "a plain Escape still closes").toBeNull();
});
