// @vitest-environment jsdom
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-2 on the set-up and the security check): every passkey button, the
// warning's "Start again" and the security check's provider buttons, under the site's focus guard. The client and the
// browser's passkey sheet are stood in, as in security-enrollment.test.tsx and security-confirmation.test.tsx.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { SecurityEnrollment } from "../../apps/ui/components/auth/SecurityEnrollment.js";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
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
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
const cancelled = () => ({ authenticate: vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError")), register: vi.fn().mockRejectedValue(new DOMException("cancelled", "NotAllowedError")), supportsConditional: async () => false, cancel: vi.fn() });

it("AUTH-2: a cancelled passkey set-up gives focus back to Create a passkey", async () => {
  const client = { beginPasskeyEnrollment: vi.fn().mockResolvedValue({ challenge_handle: "a".repeat(43), options: {} }), completePasskeyEnrollment: vi.fn(), beginTotpEnrollment: vi.fn() };
  const browser = cancelled();
  await mount(<SecurityEnrollment authority={{ kind: "pending", token: "b".repeat(43) }} client={client as never} browser={browser as never} />);
  pressByKeyboard(button(auth["auth.passkey.create"]));
  await settled();
  expect(browser.register).toHaveBeenCalledOnce();
  expect(document.querySelector(".authEnrollment [role=alert].authFieldError:not(:empty)")?.textContent).toBe(auth["auth.passkey.cancelled"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.passkey.create"]));
});

it("AUTH-2: the warning's Start again, when the new set-up fails, parks focus on the set-up section, whose first line is the error", async () => {
  const soon = new Date(Date.now() + 30_000).toISOString();
  const client = {
    beginTotpEnrollment: vi.fn()
      .mockResolvedValueOnce({ enrollment_token: "c".repeat(43), secret: "A".repeat(32), otpauthUri: "otpauth://totp/test?secret=" + "A".repeat(32), expires_at: soon })
      .mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 503, "down", "UNAVAILABLE")),
    beginPasskeyEnrollment: vi.fn(), completeTotpEnrollment: vi.fn()
  };
  await mount(<SecurityEnrollment authority={{ kind: "pending", token: "b".repeat(43) }} client={client as never} />);
  pressByKeyboard(button(auth["auth.enroll.useAuthenticator"]));
  await settled();
  const restart = button(auth["auth.enroll.startAgain"]);
  expect(restart).toBeDefined();
  pressByKeyboard(restart);
  await settled();
  expect(client.beginTotpEnrollment).toHaveBeenCalledTimes(2);
  const section = document.querySelector<HTMLElement>("section.authEnrollment")!;
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(section);
  // What the person reads first in it is why, then the two ways on.
  expect(section.querySelector("[role=alert].authFieldError:not(.srOnly):not(:empty)")?.textContent).toBe(auth["auth.enroll.totpUnavailable"]);
});

const methods = (available: string[]) => ({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: available, step_up_providers: ["google", "apple"] });

it("AUTH-2: a cancelled passkey on the security check gives focus back to its passkey button", async () => {
  const browser = cancelled();
  const client = { authMethods: vi.fn().mockResolvedValue(methods(["passkey", "password_totp"])), beginPasskeyStepUp: vi.fn().mockResolvedValue({ challenge_handle: "h", options: {} }), completePasskeyStepUp: vi.fn() };
  await mount(<SecurityConfirmation catalog={auth} authorization={{ action: "CHANGE_EMAIL" }} client={client as never} browser={browser as never} onConfirmed={vi.fn()} />);
  pressByKeyboard(button(auth["auth.passkey.use"]));
  await settled();
  expect(browser.authenticate).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.passkey.cancelled"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.passkey.use"]));
});

it("AUTH-2: a provider button on the security check that fails to start gets focus back", async () => {
  const client = { authMethods: vi.fn().mockResolvedValue(methods(["provider"])), beginSocialStepUp: vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down", "UNAVAILABLE")) };
  await mount(<SecurityConfirmation catalog={auth} authorization={{ action: "CHANGE_EMAIL" }} client={client as never} onConfirmed={vi.fn()} />);
  const apple = button(auth["auth.social.continue"].replace("{provider}", "Apple"));
  pressByKeyboard(apple);
  await settled();
  expect(client.beginSocialStepUp).toHaveBeenCalledWith("apple", { action: "CHANGE_EMAIL" });
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.social.unavailable"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(apple);
});
