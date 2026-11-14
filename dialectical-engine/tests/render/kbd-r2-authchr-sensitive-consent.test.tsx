// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (CHR2-4, CHR2-5): "I agree" disabled itself while it saved, so focus fell out of the open
// modal and a failed save left nothing focused; and Escape still declined while the save ran, though the consent was
// saved anyway. "I agree" now stays focusable (aria-disabled) and ignores further presses while saving, and Escape
// does nothing until the save has ended.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SensitiveDataConsentDialog } from "../../apps/ui/components/SensitiveDataConsent.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

const catalog = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/home.json"), "utf8")) as Record<string, string>;
let root: Root;
let uninstall: () => void;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  uninstall = installFocusFixup();
});
afterEach(async () => {
  await act(async () => root.unmount());
  uninstall();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function open() {
  let fail: (reason: unknown) => void = () => undefined;
  let succeed: () => void = () => undefined;
  const onAgree = vi.fn(() => new Promise<void>((resolve, reject) => { succeed = resolve; fail = reject; }));
  const onDecline = vi.fn();
  await act(async () => root.render(<SensitiveDataConsentDialog catalog={catalog} onAgree={onAgree} onDecline={onDecline} />));
  const agree = document.querySelector<HTMLButtonElement>('[data-dialog="sensitive-data-consent"] .policyPrimary')!;
  agree.focus();
  await act(async () => agree.click());
  return { agree, onAgree, onDecline, fail: (reason: unknown) => fail(reason), succeed: () => succeed() };
}

it("I agree keeps focus while it saves, ignores a second press, and keeps focus beside the alert after a failure", async () => {
  const { agree, onAgree, fail } = await open();
  expect(agree.disabled).toBe(false);
  expect(agree.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(agree);
  await act(async () => agree.click());
  expect(onAgree).toHaveBeenCalledOnce();
  await act(async () => fail(new Error("offline")));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(catalog["home.sensitiveConsent.failed"]);
  expect(agree.getAttribute("aria-disabled")).toBeNull();
  expect(document.activeElement).toBe(agree);
  await act(async () => agree.click());
  expect(onAgree).toHaveBeenCalledTimes(2);
});

it("Escape does nothing while I agree is saving, and declines again once the save has failed", async () => {
  const { onDecline, fail } = await open();
  const escape = () => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
  await escape();
  expect(onDecline).not.toHaveBeenCalled();
  expect(document.querySelector('[data-dialog="sensitive-data-consent"]')).not.toBeNull();
  await act(async () => fail(new Error("offline")));
  await escape();
  expect(onDecline).toHaveBeenCalledOnce();
});

it("a click outside does nothing while I agree is saving either, and declines again once the save has failed", async () => {
  const { onDecline, fail } = await open();
  const scrim = document.querySelector<HTMLElement>(".policyScrim")!;
  await act(async () => { scrim.click(); });
  expect(onDecline).not.toHaveBeenCalled();
  await act(async () => fail(new Error("offline")));
  await act(async () => { scrim.click(); });
  expect(onDecline).toHaveBeenCalledOnce();
});
