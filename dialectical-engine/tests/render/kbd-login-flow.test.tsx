// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): the sign-in's two-step screen swaps out the control that was pressed — "Use a
// recovery code" / "Use an authenticator code" replace each other, "Back to sign in" replaces the whole step — and
// focus fell to <body>. It now lands on the step's code field, or on the screen's headline.
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { mount, unmount, input } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const token = "a".repeat(43);
const mounted: Array<Awaited<ReturnType<typeof mount>>> = [];
afterEach(async () => { while (mounted.length) { const { root, host } = mounted.pop()!; await unmount(root, host); } });

async function toSecondStep(available_methods: string[]) {
  const client = { beginLogin: vi.fn().mockResolvedValue({ status: "mfa_required", challenge_token: token, available_methods }), completeLogin: vi.fn(), beginPasskeyLogin: vi.fn(), completePasskeyLogin: vi.fn() };
  const result = await mount(<LoginFlow client={client} onAuthenticated={vi.fn()} />);
  mounted.push(result);
  const { host } = result;
  await input(host, "[name=email]", "person@example.test");
  await input(host, "[name=password]", "existing-password");
  const submit = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
  submit.focus();
  await act(async () => host.querySelector("form")!.requestSubmit());
  return host;
}
/** A keyboard press on a button: it holds focus, then activates. */
async function press(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === label);
  expect(button, `missing button ${label}`).toBeDefined();
  button!.focus();
  expect(document.activeElement).toBe(button);
  await act(async () => button!.click());
}
const codeLabel = (host: HTMLElement) => host.querySelector('label[for="login-code"]')?.textContent;

it("the code step opens on its code field", async () => {
  const host = await toSecondStep(["totp", "recovery_code"]);
  expect(document.activeElement).toBe(host.querySelector("[name=code]"));
});

it("switching to a recovery code and back keeps focus on the code field", async () => {
  const host = await toSecondStep(["totp", "recovery_code"]);
  await press(host, auth["auth.login.useRecoveryCode"]);
  expect(codeLabel(host)).toBe(auth["auth.login.recoveryCodeLabel"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(host.querySelector("[name=code]"));
  await press(host, auth["auth.login.useAuthenticatorCode"]);
  expect(codeLabel(host)).toBe(auth["auth.login.authenticationCodeLabel"]);
  expect(document.activeElement).toBe(host.querySelector("[name=code]"));
});

it("Back to sign in lands on the sign-in headline", async () => {
  const host = await toSecondStep(["totp", "recovery_code"]);
  await press(host, auth["auth.login.backToSignIn"]);
  expect(host.querySelector("[name=email]")).not.toBeNull();
  const headline = host.querySelector<HTMLHeadingElement>("#auth-title")!;
  expect(headline.textContent).toBe(auth["auth.login.backToGraph"]);
  expect(headline.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(headline);
  // A second round trip moves focus the same way.
  await input(host, "[name=password]", "existing-password");
  await act(async () => host.querySelector("form")!.requestSubmit());
  expect(document.activeElement).toBe(host.querySelector("[name=code]"));
  await press(host, auth["auth.login.backToSignIn"]);
  expect(document.activeElement).toBe(host.querySelector("#auth-title"));
});

it("a passkey-only second step, which has no code field, lands on its headline", async () => {
  const host = await toSecondStep(["passkey"]);
  expect(host.querySelector("[name=code]")).toBeNull();
  const headline = host.querySelector<HTMLHeadingElement>("#auth-title")!;
  expect(headline.textContent).toBe(auth["auth.login.twoStepVerification"]);
  expect(document.activeElement).toBe(headline);
});
