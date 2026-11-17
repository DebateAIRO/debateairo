// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) => { useEffect(() => onToken(resetKey === 0 ? "first-proof" : null), [onToken, resetKey]); return null; } }; });
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-11): "Check your email" under the site's focus guard. Resend switches itself
// off for the request and stays off afterwards (the new countdown, or the spent bot check), so the guard can only wait
// for it. The bot check is stood in: it gives one proof, and none after the reset that follows every send.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError, RESEND_VERIFICATION_PUBLIC_MESSAGE } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { EmailPendingScreen } from "../../apps/ui/components/auth/EmailPendingScreen.js";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

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

async function mount(resendVerification: ReturnType<typeof vi.fn>) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<EmailPendingScreen email="person@example.test" retryAfterSeconds={0} client={{ resendVerification } as never} catalog={auth} locale="en" turnstile={{ siteKey: "1x00000000000000000000AA", nonce: "abcdefghijklmnopqrstuv==" }} onDifferentEmail={vi.fn()} />); });
  await settled();
}
async function settled() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
  await guardSettled();
}
const resend = () => document.querySelector<HTMLButtonElement>("button[data-action=resend]")!;

it("AUTH-11: a resend that went out leaves Resend counting down; focus lands on the line that says it was sent", async () => {
  const resendVerification = vi.fn().mockResolvedValue({ message: RESEND_VERIFICATION_PUBLIC_MESSAGE, retry_after_seconds: 60 });
  await mount(resendVerification);
  expect(resend().disabled).toBe(false);
  pressByKeyboard(resend());
  await settled();
  expect(resendVerification).toHaveBeenCalledOnce();
  expect(resend().disabled).toBe(true);
  const outcome = document.querySelector<HTMLElement>(".authPanelCore [role=status].authFinePrint")!;
  expect(outcome.textContent).toBe(auth["auth.signUp.registrationSent"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(outcome);
});

it("AUTH-11: a resend that was refused leaves Resend off until a new bot check; focus lands on the refusal under it", async () => {
  const resendVerification = vi.fn().mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "MAIL_DAILY_LIMIT", "MAIL_DAILY_LIMIT"));
  await mount(resendVerification);
  pressByKeyboard(resend());
  await settled();
  expect(resend().disabled).toBe(true);
  const refusal = document.querySelector<HTMLElement>("[role=alert]")!;
  expect(refusal.textContent).toBe(auth["auth.mailDailyLimit"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(refusal);
});
