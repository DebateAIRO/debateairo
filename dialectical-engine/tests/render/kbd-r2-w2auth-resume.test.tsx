// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-12): the action resumed after a provider check, under the site's focus
// guard. Every exit (Confirm, Cancel, the proof running out, Cancel account deletion) takes the pressed control away;
// the resume section itself stays, and its first line is then the outcome. The API is stood in, as in
// security-action-resume-label.test.tsx.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

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

const proof = (action: string, ms = 300_000) => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, token: "g".repeat(43), expires_at: new Date(Date.now() + ms).toISOString() } });
async function mount(grant: ReturnType<typeof proof>, overrides: Record<string, unknown> = {}) {
  const client = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }), ...overrides };
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={publicCatalog} locale="en" client={client as never} takeProof={() => grant as never} />); });
  await settled();
  return client;
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
const section = () => document.querySelector<HTMLElement>("main > section")!;
/** Focus is on the resume section, and the first thing in it is `message`. */
function landsOnOutcome(message: string) {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(section());
  expect(section().firstElementChild?.textContent).toBe(message);
}

it("AUTH-12: Confirm on a resumed email change parks focus on the section, whose first line is the outcome", async () => {
  const client = await mount(proof("CHANGE_EMAIL"), { requestEmailChange: vi.fn().mockResolvedValue(undefined) });
  await type("#resume-new-email", "new@example.test");
  pressByKeyboard(button(auth["auth.security.confirm"]));
  await settled();
  expect(client.requestEmailChange).toHaveBeenCalledOnce();
  landsOnOutcome(settings["settings.email.requested"]);
});

it("AUTH-12: Cancel parks focus on the section, whose first line says to choose an action again", async () => {
  await mount(proof("CHANGE_EMAIL"));
  pressByKeyboard(button(auth["auth.security.cancel"]));
  await settled();
  landsOnOutcome(auth["auth.security.resumeEmpty"]);
});

it("AUTH-12: the proof running out under Confirm parks focus on the section, whose first line says it expired", async () => {
  await mount(proof("CHANGE_EMAIL", 400));
  await type("#resume-new-email", "new@example.test");
  const confirm = button(auth["auth.security.confirm"]);
  act(() => { confirm.focus(); confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true })); confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  await settled();
  landsOnOutcome(auth["auth.security.expired"]);
});

it("AUTH-12: Cancel account deletion parks focus on the section, whose first line says it was cancelled", async () => {
  const client = await mount(proof("DELETE_ACCOUNT"), { scheduleAccountErasure: vi.fn().mockResolvedValue({ cancellation_ref: "r".repeat(43) }), cancelAccountErasure: vi.fn().mockResolvedValue(undefined) });
  await type("#resume-erasure-phrase", settings["settings.erasure.confirmationPhrase"]);
  pressByKeyboard(button(auth["auth.security.confirm"]));
  await settled();
  landsOnOutcome(settings["settings.erasure.scheduled"]);
  pressByKeyboard(button(settings["settings.erasure.cancel"]));
  await settled();
  expect(client.cancelAccountErasure).toHaveBeenCalledWith("r".repeat(43));
  expect(button(settings["settings.erasure.cancel"])).toBeUndefined();
  landsOnOutcome(settings["settings.erasure.cancelled"]);
});
