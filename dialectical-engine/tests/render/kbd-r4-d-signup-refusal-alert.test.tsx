// @vitest-environment jsdom
const turnstile = vi.hoisted(() => ({ gives: true }));
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken, resetKey }: { onToken: (token: string) => void; resetKey?: number }) => { useEffect(() => { if (turnstile.gives) onToken("test-proof"); }, [onToken, resetKey]); return null; } }; });
// Keyboard audit round 4 (2026-11-12), D5: a sign-up refused with no field to blame (the day's mail limit, a country that
// cannot be told, Tor, the bot check unavailable, the generic "could not create") showed its reason only in the alert at
// the top of a long card, while focus went back to the bottom (Create account, or the password box Enter was pressed in);
// on a phone the alert was off screen. AUTH-5's `focusAfterRefusal` now sends focus to the alert itself for these
// (`tabIndex={-1}`, never a Tab stop, no control ring), and still to the field for a refusal that names one. Sign-up is
// tested on the hosted site by the owner, so this file is the proof here; it runs under the site's focus guard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { pickRegion } from "../support/signupRegion.js";
import { guardSettled, pressByKeyboard, startFocusGuard, submitByKeyboard } from "./kbd-guard-harness";

let root: Root | null = null;
let stop: () => void = () => undefined;
beforeEach(() => { turnstile.gives = true; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); stop = startFocusGuard(); });
afterEach(async () => {
  stop();
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function settled() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
  await guardSettled();
}
const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
async function type(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const createAccount = () => [...document.querySelectorAll<HTMLButtonElement>("button[type=submit]")].find((node) => node.textContent === auth["auth.signUp.createAccount"])!;
const alertBox = () => document.querySelector<HTMLElement>(".authAlert[role=alert]");

async function fill(register: ReturnType<typeof vi.fn>, region: [string, string?] = ["RO"]) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<SignUpFlow turnstile={{ siteKey: "test-site", nonce: "test-nonce" }} client={{ register, checkAge: vi.fn().mockResolvedValue({ outcome: "allowed" }) }} reloadPage={vi.fn()} /> as ReactNode); });
  await settled();
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
  await pickRegion(...region);
  // Both boxes ticked the way a person ticks them (each opens its document, then "I have read it"), so Create account
  // is not held back as unavailable.
  for (const name of ["privacy-accepted", "terms-accepted"]) {
    await act(async () => field(name).click());
    const acknowledge = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((node) => node.textContent === "I have read it");
    expect(acknowledge, name).toBeDefined();
    await act(async () => acknowledge!.click());
  }
  await settled();
  expect(createAccount().getAttribute("aria-disabled")).toBeNull();
  await type("email", "person@example.test");
  await type("password", "Correct horse 7!");
}
const refusal = (code: string, status = 422) => vi.fn().mockRejectedValue(new ContractHttpError("UNPROCESSABLE", status, code, code));

const fieldless: [string, () => ReturnType<typeof vi.fn>, string][] = [
  ["the day's mail limit", () => refusal("MAIL_DAILY_LIMIT", 429), auth["auth.mailDailyLimit"]],
  ["a country that cannot be told", () => refusal("COUNTRY_UNKNOWN", 403), auth["auth.signUp.countryUnavailable"]],
  ["Tor refused", () => refusal("TOR_REFUSED", 403), auth["auth.signUp.countryUnavailable"]],
  ["an unknown server code", () => refusal("SOMETHING_ELSE", 500), auth["auth.signUp.creationFailed"]],
  ["no answer at all", () => vi.fn().mockRejectedValue(new Error("offline")), auth["auth.signUp.creationFailed"]]
];

describe("a refusal that names no field puts focus on the alert that says it", () => {
  it.each(fieldless)("%s, sent with Enter in the password box", async (_name, register, text) => {
    const client = register();
    await fill(client);
    submitByKeyboard(field("password"));
    await settled();
    expect(client).toHaveBeenCalledOnce();
    expect(alertBox()?.textContent).toBe(text);
    expect(document.activeElement).toBe(alertBox());
  });

  it.each(fieldless)("%s, sent with Create account", async (_name, register, text) => {
    const client = register();
    await fill(client);
    pressByKeyboard(createAccount());
    await settled();
    expect(alertBox()?.textContent).toBe(text);
    expect(document.activeElement).toBe(alertBox());
  });

  it("the bot check unavailable (no proof yet): focus goes to the alert, nothing is sent", async () => {
    turnstile.gives = false;
    const client = vi.fn();
    await fill(client);
    pressByKeyboard(createAccount());
    await settled();
    expect(client).not.toHaveBeenCalled();
    expect(alertBox()?.textContent).toBe(auth["auth.pending.proofUnavailable"]);
    expect(document.activeElement).toBe(alertBox());
  });

  it("a second refusal after the person moved on moves focus to the alert again", async () => {
    const client = refusal("MAIL_DAILY_LIMIT", 429);
    await fill(client);
    submitByKeyboard(field("password"));
    await settled();
    expect(document.activeElement).toBe(alertBox());
    submitByKeyboard(field("password"));
    await settled();
    expect(client).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(alertBox());
  });

  it("the alert can take focus but is not a Tab stop, and keeps its role and text", async () => {
    await fill(refusal("MAIL_DAILY_LIMIT", 429));
    submitByKeyboard(field("password"));
    await settled();
    const box = alertBox()!;
    expect(box.getAttribute("tabindex")).toBe("-1");
    expect(box.getAttribute("role")).toBe("alert");
    expect(box.textContent).toBe(auth["auth.mailDailyLimit"]);
  });
});

describe("a refusal that names a field still sends focus there (AUTH-5)", () => {
  it.each([
    ["EMAIL_INVALID", 422, "#signup-email", ["RO"]],
    ["COUNTRY_SIGNUP_UNAVAILABLE", 403, "#signup-region-trigger", ["RO"]],
    ["STATE_SIGNUP_UNAVAILABLE", 403, "#signup-region-state", ["US", "TX"]]
  ] as const)("%s", async (code, status, selector, region) => {
    await fill(refusal(code, status), [...region] as [string, string?]);
    submitByKeyboard(field("password"));
    await settled();
    expect(alertBox()).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector(selector));
  });
});

it("a focused alert shows no control ring of its own (the parked-part ring still applies when the guard parks there)", () => {
  const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /\.authAlert\[tabindex="-1"\]:focus:not\(\[data-focus-parked\]\)\s*\{([^}]*)\}/.exec(css);
  expect(rule, "the alert's focus rule").not.toBeNull();
  expect(rule![1]).toMatch(/outline:\s*none/);
});
