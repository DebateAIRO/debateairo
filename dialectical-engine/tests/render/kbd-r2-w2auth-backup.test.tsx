// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-13): the backup email card in Settings and /verify-backup-email, under the
// site's focus guard. The card and the page are the real ones; the client is stood in (made-up answers), with the
// states of email-mfa-ui.test.tsx.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import mfa from "../../apps/ui/messages/en/mfa-recovery.json";
import { BackupEmailVerification, BackupEmailConfirmation } from "../../apps/ui/components/BackupEmailVerification.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard, submitByKeyboard } from "./kbd-guard-harness";

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); stop = guarded ? startFocusGuard() : installFocusFixup(); });
afterEach(async () => {
  stop();
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

async function mount(view: ReactNode) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(view); });
  await settled();
}
async function settled() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
  await guardSettled();
}
async function type(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
const pending = { status: "pending", email: "bound@example.test" };
async function fillCard() { await type("#backup-current-password", "known current password"); await type("#backup-current-code", "123456"); }

it("AUTH-13: Send on the backup email card gives focus back to Send once the link went out", async () => {
  const client = { status: vi.fn().mockResolvedValue(pending), startVerification: vi.fn().mockResolvedValue(undefined) };
  await mount(<BackupEmailVerification client={client as never} />);
  await fillCard();
  pressByKeyboard(button(mfa["backup.button"]));
  await settled();
  expect(client.startVerification).toHaveBeenCalledWith("known current password", "123456");
  expect(document.body.textContent).toContain(mfa["backup.sent"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(mfa["backup.button"]));
});

it("AUTH-13: a refused password or code gives focus back to the code box Enter was pressed in", async () => {
  const client = { status: vi.fn().mockResolvedValue(pending), startVerification: vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "refused", "REFUSED")) };
  await mount(<BackupEmailVerification client={client as never} />);
  await fillCard();
  submitByKeyboard(document.querySelector("#backup-current-code")!);
  await settled();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(mfa["error.proof"]);
  expect(document.activeElement).toBe(document.querySelector("#backup-current-code"));
});

it("AUTH-13: a send with no clear answer sends focus to Check, the one control left on; Check then parks it on the card", async () => {
  const client = { status: vi.fn().mockResolvedValue(pending), startVerification: vi.fn().mockRejectedValue(new TypeError("synthetic lost reply")) };
  await mount(<BackupEmailVerification client={client as never} />);
  await fillCard();
  pressByKeyboard(button(mfa["backup.button"]));
  await settled();
  expect(button(mfa["backup.button"]).disabled).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(mfa["backup.check"]));
  client.status.mockResolvedValueOnce({ status: "verified", email: "bound@example.test" });
  pressByKeyboard(button(mfa["backup.check"]));
  await settled();
  expect(button(mfa["backup.check"])).toBeUndefined();
  const card = document.querySelector<HTMLElement>(".setPanelCore")!;
  expect(document.activeElement).toBe(card);
  // The card's own heading and the new status are what the next Tab reads past first.
  expect(card.querySelector("[role=status]")?.textContent).toBe(mfa["backup.verified"]);
});

it("AUTH-13: Continue on /verify-backup-email swaps the page to its outcome and focus lands on the new headline", async () => {
  window.history.replaceState(null, "", "/verify-backup-email#token=" + "A".repeat(43));
  const client = { confirm: vi.fn().mockResolvedValue(undefined) };
  await mount(<BackupEmailConfirmation client={client as never} />);
  expect(document.activeElement).toBe(document.body);
  pressByKeyboard(button(mfa.continue));
  await settled();
  expect(client.confirm).toHaveBeenCalledOnce();
  const headline = document.querySelector<HTMLElement>("#auth-title")!;
  expect(headline.textContent).toBe(mfa["backup.done.title"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(headline);
});

it("AUTH-13: an expired link on /verify-backup-email also lands on the new headline", async () => {
  window.history.replaceState(null, "", "/verify-backup-email#token=" + "A".repeat(43));
  const client = { confirm: vi.fn().mockRejectedValue(new ContractHttpError("GONE", 410, "gone", "GONE")) };
  await mount(<BackupEmailConfirmation client={client as never} />);
  pressByKeyboard(button(mfa.continue));
  await settled();
  expect(document.activeElement).toBe(document.querySelector("#auth-title"));
  expect(document.activeElement?.textContent).toBe(mfa["backup.expired.title"]);
});

it("AUTH-13: a confirmation with no clear answer gives focus back to the same button, now saying Check", async () => {
  window.history.replaceState(null, "", "/verify-backup-email#token=" + "A".repeat(43));
  const client = { confirm: vi.fn().mockRejectedValue(new TypeError("synthetic dropped confirmation")) };
  await mount(<BackupEmailConfirmation client={client as never} />);
  const pressed = button(mfa.continue);
  pressByKeyboard(pressed);
  await settled();
  expect(pressed.textContent).toBe(mfa["backup.confirm.check"]);
  expect(document.activeElement).toBe(pressed);
});
