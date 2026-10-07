// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async()=>{const {useEffect}=await import("react");return {TurnstileChallenge:({onToken}:{onToken:(token:string)=>void})=>{useEffect(()=>onToken("test-proof"),[onToken]);return null;}};});

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, createContractClient } from "@debateai/contract";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { AgeConfirmationFlow } from "../../apps/ui/components/AgeConfirmationFlow.js";
import { resolveDobLocale } from "../../apps/ui/lib/dob/dobLocale.js";
import english from "../../apps/ui/messages/en/auth.json";
import german from "../../apps/ui/messages/de/auth.json";
import { pickRegion } from "../support/signupRegion.js";

/* Age gate — the sign-up flow (8a → 8j) and the existing-account interstitial (8k). */

const REGISTRATION_MESSAGE =
  "If this address can be registered, verification instructions will arrive. Check your spam folder.";

let root: Root;
let host: HTMLDivElement;
let requests: { path: string; body: unknown }[];

/** A real contract client over a recording fetch: the assertions are about the network. */
function networkClient(ageOutcome: "allowed" | "refused", registerStatus = 202, registerBody: unknown = { message: REGISTRATION_MESSAGE, retry_after_seconds: 60 }) {
  return createContractClient("https://app.debateai.test", (async (url: URL | string, init: RequestInit = {}) => {
    const path = new URL(String(url)).pathname;
    if(path==="/v1/auth/providers")return Response.json({providers:[]});
    requests.push({ path, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    if (path === "/v1/auth/age-check") return Response.json({ outcome: ageOutcome });
    if (path === "/v1/auth/register") return Response.json(registerBody, { status: registerStatus });
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }) as typeof fetch);
}

const field = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

async function setValue(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function fillForm(dateOfBirth: readonly [string, string, string] | null): Promise<void> {
  await setValue("email", "adult@example.test");
  await setValue("phone", "+40712345678");
  await setValue("password", "Correct horse 7!");
  if (dateOfBirth !== null) {
    await setValue("dob-d", dateOfBirth[0]);
    await setValue("dob-m", dateOfBirth[1]);
    await setValue("dob-y", dateOfBirth[2]);
  }
  await pickRegion("RO");
  for (const name of ["privacy-accepted", "terms-accepted"]) {
    await act(async () => field(name).click());
    const acknowledgement = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "I have read it");
    expect(acknowledgement, `missing ${name} acknowledgement`).toBeDefined();
    await act(async () => acknowledgement!.click());
    expect(field(name).checked).toBe(true);
  }
}

async function submit(): Promise<void> {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = [];
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("sign-up with the date of birth (8a)", () => {
  it("places the date of birth after Password and before the privacy consent, with no 18+ box", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    const form = host.querySelector("form")!;
    const password=field("password");
    const fieldset = form.querySelector("fieldset.dobFieldset")!;
    const consent = form.querySelector(".consentGroup")!;
    expect(password.compareDocumentPosition(fieldset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldset.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.querySelector('input[name="adult-affirmed"]')).toBeNull();
    expect(form.querySelectorAll(".consentRow")).toHaveLength(2);
    expect(form.textContent).not.toMatch(/18/);
    expect(fieldset.closest(".authField")).not.toBeNull();
  });

  it("checks the date on submit before any request", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await fillForm(null);
    await submit();
    expect(host.querySelector("#dob-msg")!.textContent).toBe("✗ Enter the day, month and year.");
    expect(requests).toEqual([]);
  });

  it("asks the age check first, then registers with the ISO date", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await fillForm(["14", "03", "1998"]);
    await submit();
    expect(requests.map((request) => request.path)).toEqual(["/v1/auth/age-check", "/v1/auth/register"]);
    expect(requests[0]!.body).toEqual({ date_of_birth: "1998-03-14" });
    expect(requests[1]!.body).toMatchObject({ date_of_birth: "1998-03-14" });
    expect(requests[1]!.body).not.toHaveProperty("adult_affirmed");
    expect(host.querySelector('[role="status"]')!.textContent).toContain(english["auth.signUp.registrationSent"]);
  });

  it("refuses a date under 18 on the form: the reason under the field, Create account disabled, no request", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 29, 12)) });
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await fillForm(["14", "03", "2012"]);
    const message = host.querySelector("#dob-msg")!;
    expect(message.textContent).toBe("✗ You must be 18 or over in order for you to create an account.");
    expect(message.getAttribute("data-state")).toBe("bad");
    for (const name of ["dob-d", "dob-m", "dob-y"]) {
      expect(field(name).getAttribute("aria-invalid")).toBe("true");
      expect(field(name).getAttribute("aria-describedby")).toBe("dob-msg");
    }
    expect(host.querySelector<HTMLButtonElement>("button.authPrimary")!.disabled).toBe(true);
    // A scripted submit gets no further than the disabled button would.
    await submit();
    expect(requests).toEqual([]);
    expect(host.querySelector("form")).not.toBeNull();
    vi.useRealTimers();
  });

  it("holds the boundary: 18 tomorrow is refused on the form, exactly 18 today goes through", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 29, 12)) });
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await fillForm(["30", "09", "2008"]);
    expect(host.querySelector("#dob-msg")!.textContent).toBe("✗ You must be 18 or over in order for you to create an account.");
    await submit();
    expect(requests).toEqual([]);
    await setValue("dob-d", "29");
    expect(host.querySelector("#dob-msg")!.textContent).toBe("✓ Valid date");
    await submit();
    expect(requests.map((request) => request.path)).toEqual(["/v1/auth/age-check", "/v1/auth/register"]);
    expect(requests[0]!.body).toEqual({ date_of_birth: "2008-09-29" });
    vi.useRealTimers();
  });

  it.each([
    ["born in 1500", ["14", "03", "1500"], "✗ Enter a year from 1900 onwards."],
    ["born in the future", ["14", "03", "2030"], "✗ That date is in the future."],
    ["an impossible date", ["31", "02", "2001"], "✗ That date doesn't exist. Check the day and month."]
  ] as const)("refuses %s on the form as soon as the date is complete, and sends nothing", async (_label, date, text) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 29, 12)) });
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await fillForm(date);
    expect(host.querySelector("#dob-msg")!.textContent).toBe(text);
    expect(host.querySelector("#dob-msg")!.getAttribute("data-state")).toBe("bad");
    expect(host.querySelector<HTMLButtonElement>("button.authPrimary")!.disabled).toBe(true);
    await submit();
    expect(requests).toEqual([]);
    vi.useRealTimers();
  });

  it("stays quiet while the date is still being typed", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} />));
    await setValue("dob-d", "14");
    await setValue("dob-m", "03");
    await setValue("dob-y", "150");
    expect(host.querySelector("#dob-msg")!.textContent).toBe("");
  });

  it("names the minimum age in the reader's language (de)", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} catalog={german} dobLocale={resolveDobLocale("de")} client={networkClient("allowed")} />));
    await setValue("dob-d", "01");
    await setValue("dob-m", "01");
    await setValue("dob-y", "2015");
    expect(host.querySelector("#dob-msg")!.textContent)
      .toBe("✗ Sie müssen mindestens 18 Jahre alt sein, um ein Konto zu erstellen.");
  });

  it("on a server refusal (the lockout) shows only the refusal screen and never calls register", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("refused")} />));
    await fillForm(["14", "03", "1998"]);
    await submit();
    expect(requests.map((request) => request.path)).toEqual(["/v1/auth/age-check"]);
    expect(requests.some((request) => request.path === "/v1/auth/register")).toBe(false);
    const heading = host.querySelector("h2")!;
    expect(heading.textContent).toBe("We can't create an account for you.");
    const links = host.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]!.textContent).toBe("Back to the home page");
    expect(links[0]!.getAttribute("href")).toBe("/");
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toMatch(/\b18\b|try again|\bage\b|minimum|old/i);
  });

  it("shows the same refusal when register itself refuses the age", async () => {
    await act(async () => root.render(
      <SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed", 403, { error: "AUTH_AGE_REFUSED", message: "AUTH_AGE_REFUSED" })} />
    ));
    await fillForm(["01", "01", "1990"]);
    await submit();
    expect(host.querySelector("h2")!.textContent).toBe("We can't create an account for you.");
  });

  it("renders the refusal straight away while the lockout cookie is set (reload, back, second attempt)", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} client={networkClient("allowed")} refused />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("h2")!.textContent).toBe("We can't create an account for you.");
    expect(requests).toEqual([]);
  });

  it("speaks the reader's language on the refusal (de)", async () => {
    await act(async () => root.render(<SignUpFlow turnstile={{siteKey:"test-site",nonce:"test-nonce"}} catalog={german} dobLocale={resolveDobLocale("de")} refused />));
    expect(host.querySelector("h2")!.textContent).toBe("Wir können kein Konto für Sie erstellen.");
    expect(host.querySelector("a")!.textContent).toBe("Zur Startseite");
  });
});

describe("the existing-account interstitial (8k)", () => {
  function fakeClient(overrides: Partial<{
    readAgeConfirmation: () => Promise<{ status: "required" | "confirmed" }>;
    confirmAge: (date: string) => Promise<{ outcome: "allowed" | "refused" }>;
  }> = {}) {
    return {
      readAgeConfirmation: vi.fn(overrides.readAgeConfirmation ?? (async () => ({ status: "required" as const }))),
      confirmAge: vi.fn(overrides.confirmAge ?? (async () => ({ outcome: "allowed" as const })))
    };
  }

  it("shows the eyebrow, heading, body, the widget and one Confirm button", async () => {
    const client = fakeClient();
    await act(async () => root.render(<AgeConfirmationFlow client={client} onConfirmed={vi.fn()} onSignedOut={vi.fn()} />));
    expect(host.querySelector(".authEyebrow")!.textContent).toBe("One-time check");
    expect(host.querySelector("h1")!.textContent).toBe("Confirm your date of birth to keep using Dialectical Engine");
    expect(host.querySelector(".authLede")!.textContent).toBe("We ask once. Only the result is kept, never the date.");
    expect(host.querySelector("fieldset.dobFieldset legend")!.textContent).toBe("Date of birth");
    const buttons = host.querySelectorAll("button.authPrimary");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe("Confirm");
  });

  it("continues on a pass", async () => {
    const onConfirmed = vi.fn();
    const client = fakeClient();
    await act(async () => root.render(<AgeConfirmationFlow client={client} onConfirmed={onConfirmed} onSignedOut={vi.fn()} />));
    await setValue("dob-d", "14");
    await setValue("dob-m", "03");
    await setValue("dob-y", "1998");
    await submit();
    expect(client.confirmAge).toHaveBeenCalledWith("1998-03-14");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("freezes into the refusal on a fail", async () => {
    const onConfirmed = vi.fn();
    const client = fakeClient({ confirmAge: async () => ({ outcome: "refused" }) });
    await act(async () => root.render(<AgeConfirmationFlow client={client} onConfirmed={onConfirmed} onSignedOut={vi.fn()} />));
    await setValue("dob-d", "29");
    await setValue("dob-m", "09");
    await setValue("dob-y", "2010");
    await submit();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(host.querySelector("h2")!.textContent).toBe("We can't create an account for you.");
    expect(host.querySelector("form")).toBeNull();
  });

  it("validates before asking and never sends an invalid date", async () => {
    const client = fakeClient();
    await act(async () => root.render(<AgeConfirmationFlow client={client} onConfirmed={vi.fn()} onSignedOut={vi.fn()} />));
    await setValue("dob-d", "31");
    await setValue("dob-m", "02");
    await setValue("dob-y", "2001");
    await submit();
    expect(host.querySelector("#dob-msg")!.textContent).toBe("✗ That date doesn't exist. Check the day and month.");
    expect(client.confirmAge).not.toHaveBeenCalled();
  });

  it("moves on when the account has nothing left to confirm, and to sign-in when signed out", async () => {
    const onConfirmed = vi.fn();
    await act(async () => root.render(<AgeConfirmationFlow client={fakeClient({ readAgeConfirmation: async () => ({ status: "confirmed" }) })} onConfirmed={onConfirmed} onSignedOut={vi.fn()} />));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    root = createRoot(host);
    const onSignedOut = vi.fn();
    await act(async () => root.render(<AgeConfirmationFlow client={fakeClient({ readAgeConfirmation: async () => { throw new ContractHttpError("UNAUTHORIZED", 401, "no session"); } })} onConfirmed={vi.fn()} onSignedOut={onSignedOut} />));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("says so when the check itself fails, without refusing", async () => {
    const client = fakeClient({ confirmAge: async () => { throw new ContractHttpError("NETWORK_FAILURE", 0, "offline"); } });
    await act(async () => root.render(<AgeConfirmationFlow client={client} onConfirmed={vi.fn()} onSignedOut={vi.fn()} />));
    await setValue("dob-d", "14");
    await setValue("dob-m", "03");
    await setValue("dob-y", "1998");
    await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("The check could not be completed. Try again.");
    expect(host.querySelector("form")).not.toBeNull();
  });
});
