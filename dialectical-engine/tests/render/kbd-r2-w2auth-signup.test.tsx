// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken }: { onToken: (token: string) => void }) => { useEffect(() => onToken("test-proof"), [onToken]); return null; } }; });
// Keyboard audit, 12 Nov 2026, wave 2 (AUTH-5, AUTH-6, AUTH-14): email sign-up and the one-time age check under the site's
// focus guard. Every field is switched off while Create account / Confirm runs; the guard gives focus back to the field
// it came from, and a refusal whose fix is elsewhere on the card sends it there. The form is filled as in
// signup-legal-pairs.test.tsx and the age check's client is stood in as in age-gate-flow.test.tsx.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import auth from "../../apps/ui/messages/en/auth.json";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { AgeConfirmationFlow } from "../../apps/ui/components/AgeConfirmationFlow.js";
import { pickRegion } from "../support/signupRegion.js";
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
const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
async function type(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;

/** A filled sign-up form, sent by Enter in the password box (as signup-legal-pairs.test.tsx fills it). */
async function signUp(register: ReturnType<typeof vi.fn>, region: [string, string?] = ["RO"], checkAge = vi.fn().mockResolvedValue({ outcome: "allowed" })) {
  await mount(<SignUpFlow turnstile={{ siteKey: "test-site", nonce: "test-nonce" }} client={{ register, checkAge }} reloadPage={vi.fn()} />);
  await type("dob-d", "01");
  await type("dob-m", "01");
  await type("dob-y", "1990");
  await pickRegion(...region);
  field("email").value = "person@example.test";
  field("password").value = "Correct horse 7!";
  field("privacy-accepted").checked = true;
  field("terms-accepted").checked = true;
  submitByKeyboard(field("password"));
  await settled();
}
const refusal = (code: string, status = 422) => vi.fn().mockRejectedValue(new ContractHttpError("UNPROCESSABLE", status, code, code));

it("AUTH-5: a sign-up that could not be created gives focus back to the password box Enter was pressed in", async () => {
  const register = vi.fn().mockRejectedValue(new Error("offline"));
  await signUp(register);
  expect(register).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.creationFailed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(field("password"));
});

it("AUTH-5: an address the server cannot deliver to sends focus to the email box", async () => {
  await signUp(refusal("EMAIL_INVALID"));
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.emailUndeliverable"]);
  expect(document.activeElement).toBe(document.querySelector("#signup-email"));
});

it("AUTH-5: a country the service is not offered in sends focus to the region picker", async () => {
  await signUp(refusal("COUNTRY_SIGNUP_UNAVAILABLE", 403));
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.countryUnavailable"]);
  expect(document.activeElement).toBe(document.querySelector("#signup-region-trigger"));
});

it("AUTH-5: a US state the service is not offered in sends focus to the state list", async () => {
  await signUp(refusal("STATE_SIGNUP_UNAVAILABLE", 403), ["US", "TX"]);
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.stateUnavailable"]);
  expect(document.activeElement).toBe(document.querySelector("#signup-region-state"));
});

it("AUTH-5: documents updated meanwhile send focus to Reload the page, next to the alert at the top", async () => {
  await signUp(refusal("LEGAL_DOCUMENT_STALE", 409));
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.signUp.documentsUpdated"]);
  expect(document.activeElement).toBe(button(auth["auth.signUp.reloadDocuments"]));
});

it("AUTH-6: an under-age date on sign-up swaps in the refusal and focus lands on its heading", async () => {
  await signUp(vi.fn(), ["RO"], vi.fn().mockResolvedValue({ outcome: "refused" }));
  const heading = document.querySelector<HTMLElement>("#age-refusal-title")!;
  expect(heading).not.toBeNull();
  expect(document.querySelector("form")).toBeNull();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(heading);
});

it("AUTH-6: a refusal shown on arrival moves no focus", async () => {
  await mount(<SignUpFlow refused client={{ register: vi.fn(), checkAge: vi.fn() }} />);
  expect(document.querySelector("#age-refusal-title")).not.toBeNull();
  expect(document.activeElement).toBe(document.body);
});

const ageClient = (confirmAge: ReturnType<typeof vi.fn>) => ({ readAgeConfirmation: vi.fn(async () => ({ status: "required" as const })), confirmAge });
async function ageCheck(confirmAge: ReturnType<typeof vi.fn>) {
  await mount(<AgeConfirmationFlow client={ageClient(confirmAge)} onConfirmed={vi.fn()} onSignedOut={vi.fn()} />);
  await type("dob-d", "14");
  await type("dob-m", "03");
  await type("dob-y", "1998");
}

it("AUTH-14: a failed Confirm on the age check gives focus back to Confirm", async () => {
  const confirmAge = vi.fn().mockRejectedValue(new Error("offline"));
  await ageCheck(confirmAge);
  pressByKeyboard(button(auth["auth.ageCheck.confirm"]));
  await settled();
  expect(confirmAge).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=alert]")?.textContent).toBe(auth["auth.ageCheck.failed"]);
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(button(auth["auth.ageCheck.confirm"]));
});

it("AUTH-14: Enter in the year box on a failed age check gives focus back to the year box", async () => {
  await ageCheck(vi.fn().mockRejectedValue(new Error("offline")));
  submitByKeyboard(field("dob-y"));
  await settled();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(field("dob-y"));
});

it("AUTH-6: an under-age date on the age check swaps in the refusal and focus lands on its heading", async () => {
  await ageCheck(vi.fn().mockResolvedValue({ outcome: "refused" }));
  pressByKeyboard(button(auth["auth.ageCheck.confirm"]));
  await settled();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(document.querySelector("#age-refusal-title"));
});
