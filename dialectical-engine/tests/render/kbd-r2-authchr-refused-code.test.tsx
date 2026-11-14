// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (AUTH-3, AUTH-4 refused code): a refused password + code, or a refused social
// sign-in / step-up code, kept the old six digits and left focus on <body> (the fields are disabled while the
// request runs). The code is now cleared, the same digits may be tried again, and focus waits on the field the
// person must fix next.
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { SecurityConfirmation } from "../../apps/ui/components/auth/SecurityConfirmation.js";
import { SocialCompleteFlow } from "../../apps/ui/components/auth/SocialCompleteFlow.js";
import { mount, unmount, input, click } from "./task11-harness.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); window.history.replaceState(null, "", "/"); });

async function securityCheck(failure: unknown) {
  const client = {
    authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
    stepUp: vi.fn().mockRejectedValue(failure),
  };
  const { host, root } = await mount(<SecurityConfirmation catalog={auth} authorization={{ action: "CHANGE_EMAIL" }} client={client as any} onConfirmed={vi.fn()} />);
  const unfix = installFocusFixup();
  cleanups.push(async () => { unfix(); await unmount(root, host); });
  await click(host, auth["auth.security.passwordMethod"]);
  await input(host, "[name=security-password]", "existing-password");
  const codeField = host.querySelector<HTMLInputElement>("[name=security-code]")!;
  codeField.focus();
  await input(host, "[name=security-code]", "123456");
  return { host, client, codeField };
}

it.each([[401, "auth.security.wrongPassword"], [429, "auth.security.tooManyAttempts"]] as const)("a %s on the security check clears the code and focuses the password field", async (status, message) => {
  const { host, client, codeField } = await securityCheck(new ContractHttpError("REFUSED", status, "refused", "REFUSED"));
  expect(client.stepUp).toHaveBeenCalledOnce();
  expect(host.querySelector("[role=alert]")?.textContent).toBe(auth[message]);
  expect(codeField.value).toBe("");
  expect(document.activeElement).toBe(host.querySelector("[name=security-password]"));
  // The cleared code counts as an edit: the same six digits are sent again.
  await input(host, "[name=security-code]", "123456");
  expect(client.stepUp).toHaveBeenCalledTimes(2);
});

it("an unavailable security check keeps the code and moves no focus", async () => {
  const { codeField } = await securityCheck(new ContractHttpError("SERVER_FAILURE", 503, "unavailable", "UNAVAILABLE"));
  expect(codeField.value).toBe("123456");
});

it.each(["login", "stepup"] as const)("a refused social %s code is cleared and its field takes focus again", async (kind) => {
  window.history.replaceState(null, "", "/social/complete#kind=" + kind + "&token=" + "a".repeat(43));
  const status = { expires_at: new Date(Date.now() + 300000).toISOString(), available_methods: ["totp"], authorization: { action: "CHANGE_EMAIL" } };
  const complete = vi.fn().mockRejectedValue(new ContractHttpError("UNAUTHORIZED", 401, "refused", "REFUSED"));
  const client = { socialLoginStatus: async () => status, socialStepUpStatus: async () => status, completeLogin: complete, completeSocialStepUp: complete };
  const { host, root } = await mount(<SocialCompleteFlow client={client as any} onAuthenticated={vi.fn()} onStepUp={vi.fn()} />);
  const unfix = installFocusFixup();
  cleanups.push(async () => { unfix(); await unmount(root, host); });
  const codeField = host.querySelector<HTMLInputElement>("[name=code]")!;
  codeField.focus();
  await input(host, "[name=code]", "123456");
  expect(complete).toHaveBeenCalledOnce();
  expect(host.querySelector("[role=alert]")).not.toBeNull();
  expect(codeField.value).toBe("");
  expect(document.activeElement).toBe(codeField);
  await input(host, "[name=code]", "123456");
  expect(complete).toHaveBeenCalledTimes(2);
  await act(async () => undefined);
});
