// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-1, AUTH-2 on sign-in, AUTH-15): sign-in under the site's focus guard. A
// refused email/password, a cancelled passkey and a failed social start each switch the pressed control off for the
// wait; the guard gives focus back to that control once the request ends. The client is stood in, as in
// kbd-login-flow.test.tsx.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
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
  vi.unstubAllGlobals();
});

async function mount(client: Record<string, unknown>, browser?: unknown) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<LoginFlow client={client as never} browser={browser as never} onAuthenticated={vi.fn()} />); });
  return main;
}
async function type(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** The request's promises end inside act (so React renders their outcome), then the guard's wait passes. */
async function settled() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
  await guardSettled();
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
const refused = () => ({ beginLogin: vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "refused", "REFUSED")), completeLogin: vi.fn() });

it("AUTH-1: Enter in the password box on a refused sign-in gives focus back to the password box", async () => {
  const client = refused();
  await mount(client);
  await type("[name=email]", "person@example.test");
  await type("[name=password]", "wrong-password");
  submitByKeyboard(document.querySelector("#login-password")!);
  await settled();
  expect(client.beginLogin).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.login.signInFailed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(document.querySelector("#login-password"));
});

it("AUTH-1: a press on Continue on a refused sign-in gives focus back to Continue, one Shift+Tab from the password", async () => {
  const client = refused();
  await mount(client);
  await type("[name=email]", "person@example.test");
  await type("[name=password]", "wrong-password");
  pressByKeyboard(button(auth["auth.continue"]));
  await settled();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.continue"]));
});

it("AUTH-2: a cancelled passkey sign-in gives focus back to the passkey button", async () => {
  const browser = { supportsConditional: async () => false, authenticate: vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError")), register: vi.fn(), cancel: vi.fn() };
  const client = { beginLogin: vi.fn(), completeLogin: vi.fn(), beginPasskeyLogin: vi.fn().mockResolvedValue({ challenge_handle: "h", options: {} }), completePasskeyLogin: vi.fn() };
  await mount(client, browser);
  pressByKeyboard(button(auth["auth.passkey.signIn"]));
  await settled();
  expect(browser.authenticate).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.passkey.cancelled"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.passkey.signIn"]));
});

it("AUTH-2: a cancelled passkey on the two-step screen gives focus back to its passkey button", async () => {
  const browser = { supportsConditional: async () => false, authenticate: vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError")), register: vi.fn(), cancel: vi.fn() };
  const client = {
    beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required", challenge_token: "a".repeat(43), available_methods: ["passkey", "totp"] }),
    completeLogin: vi.fn(), beginPasskeyLogin: vi.fn().mockResolvedValue({ challenge_handle: "h", options: {} }), completePasskeyLogin: vi.fn()
  };
  await mount(client, browser);
  await type("[name=email]", "person@example.test");
  await type("[name=password]", "existing-password");
  submitByKeyboard(document.querySelector("#login-password")!);
  await settled();
  expect(document.activeElement).toBe(document.querySelector("[name=code]"));
  pressByKeyboard(button(auth["auth.passkey.signIn"]));
  await settled();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.passkey.signIn"]));
});

it("AUTH-15: a social sign-in that fails to start gives focus back to the pressed provider button", async () => {
  const client = {
    beginLogin: vi.fn(), completeLogin: vi.fn(),
    authProviders: vi.fn().mockResolvedValue({ providers: [{ id: "google", name: "Google" }, { id: "apple", name: "Apple" }] }),
    beginSocialLogin: vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down", "UNAVAILABLE"))
  };
  await mount(client);
  await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
  const providers = [...document.querySelectorAll<HTMLButtonElement>(".authSocial button")];
  expect(providers.length).toBeGreaterThan(1);
  const second = providers[1]!;
  pressByKeyboard(second);
  await settled();
  expect(client.beginSocialLogin).toHaveBeenCalledOnce();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(second);
});
