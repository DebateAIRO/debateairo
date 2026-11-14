// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-9, AUTH-10): /recover, /reset-password and /recover-authenticator under the
// site's focus guard. The flows are the real ones; their clients are stood in (made-up answers), with the states of
// password-reset-ui.test.tsx and recovery-enrollment.test.tsx.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import reset from "../../apps/ui/messages/en/password-reset.json";
import mfa from "../../apps/ui/messages/en/mfa-recovery.json";
import { RecoveryFlow } from "../../apps/ui/components/auth/RecoveryFlow.js";
import { PasswordResetFlow } from "../../apps/ui/components/PasswordResetFlow.js";
import { MfaRecoveryFlow } from "../../apps/ui/components/MfaRecoveryFlow.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard, submitByKeyboard } from "./kbd-guard-harness";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

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
const dropped = () => new TypeError("synthetic dropped response");

it("AUTH-9: a refused recovery email gives focus back to the email box Enter was pressed in", async () => {
  const client = { startRecovery: vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down", "UNAVAILABLE")) };
  await mount(<RecoveryFlow catalog={auth} locale="en" client={client as never} />);
  await type("[name=email]", "person@example.test");
  submitByKeyboard(document.querySelector("#recover-email")!);
  await settled();
  expect(client.startRecovery).toHaveBeenCalledOnce();
  expect(document.querySelector("#recover-error")?.textContent).toBe(auth["auth.login.verificationFailed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(document.querySelector("#recover-email"));
});

it("AUTH-9: a refused recovery code, sent with Continue, gives focus back to Continue, under the code box", async () => {
  window.history.replaceState(null, "", "/recover#token=" + "a".repeat(43));
  const client = { recoveryProve: vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "refused", "REFUSED")) };
  await mount(<RecoveryFlow catalog={auth} locale="en" client={client as never} />);
  await type("[name=code]", "SAVED-CODE");
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(client.recoveryProve).toHaveBeenCalledOnce();
  expect(document.querySelector("#recover-error")?.textContent).toBe(auth["auth.login.recoveryCodeRejected"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.continue"]));
});

const resetClient = (overrides: Record<string, unknown>) => ({
  status: vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "none", "PASSWORD_RESET_INVALID")),
  start: vi.fn(), exchange: vi.fn(), complete: vi.fn(), cancel: vi.fn(), cancelCurrent: vi.fn(),
  ...overrides
});

it("AUTH-10: a reset request with no clear answer sends focus to Check reset status, the one control left on", async () => {
  const client = resetClient({ start: vi.fn().mockRejectedValue(dropped()) });
  await mount(<PasswordResetFlow client={client as never} />);
  await type("[name=email]", "person@example.test");
  pressByKeyboard(button(reset["request.button"]));
  await settled();
  expect(client.start).toHaveBeenCalledOnce();
  expect(document.querySelector("#password-reset-error")?.textContent).toBe(reset["error.unknown"]);
  expect(button(reset["request.button"]).disabled).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(reset["check.state"]));
});

it("AUTH-10: Check reset status that still has no answer keeps focus on it; one that does moves to the new headline", async () => {
  const client = resetClient({ start: vi.fn().mockRejectedValue(dropped()) });
  await mount(<PasswordResetFlow client={client as never} />);
  await type("[name=email]", "person@example.test");
  pressByKeyboard(button(reset["request.button"]));
  await settled();
  client.status.mockRejectedValueOnce(dropped());
  pressByKeyboard(button(reset["check.state"]));
  await settled();
  expect(document.activeElement).toBe(button(reset["check.state"]));
  client.status.mockResolvedValueOnce({ status: "cancelled", expires_at: null, password_min_length: 12, password_max_length: 1024 });
  pressByKeyboard(button(reset["check.state"]));
  await settled();
  expect(button(reset["check.state"])).toBeUndefined();
  expect(document.activeElement).toBe(document.querySelector("#auth-title"));
  expect(document.activeElement?.textContent).toBe(reset["cancelled.title"]);
});

it("AUTH-10: too many attempts on the new-password form gives focus back to the code box Enter was pressed in", async () => {
  window.history.replaceState(null, "", "/reset-password#token=" + "A".repeat(43));
  const state = { status: "password_required", expires_at: "2030-01-01T00:00:00Z", password_min_length: 12, password_max_length: 1024 };
  const client = resetClient({ exchange: vi.fn().mockResolvedValue(state), complete: vi.fn().mockRejectedValue(new ContractHttpError("RATE_LIMITED", 429, "slow", "RATE_LIMITED")) });
  await mount(<PasswordResetFlow client={client as never} />);
  pressByKeyboard(button(reset.continue));
  await settled();
  await type("[name=new-password]", "long unique new password");
  await type("[name=confirm-password]", "long unique new password");
  await type("[name=code]", "123456");
  submitByKeyboard(document.querySelector("#password-reset-code")!);
  await settled();
  expect(client.complete).toHaveBeenCalledOnce();
  expect(document.querySelector("#password-reset-error")?.textContent).toBe(reset["error.rate"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(document.querySelector("#password-reset-code"));
});

it("AUTH-10: an authenticator recovery request with no clear answer sends focus to Check recovery state", async () => {
  const client = { status: vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "none", "NONE")), start: vi.fn().mockRejectedValue(dropped()) };
  await mount(<MfaRecoveryFlow client={client as never} />);
  await type("[name=email]", "person@example.test");
  pressByKeyboard(button(mfa["request.button"]));
  await settled();
  expect(client.start).toHaveBeenCalledOnce();
  expect(document.querySelector("#mfa-error")?.textContent).toBe(mfa["error.unknown"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(mfa["check.state"]));
});
