import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContractClient } from "@debateai/contract";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";
import settingsEnglish from "../../apps/ui/messages/en/settings.json" with { type: "json" };

const G = "g".repeat(43);
const CANCELLATION_REF = "55555555-5555-4555-8555-555555555555";
const EXECUTE_AT = "2026-10-14T00:00:00.000Z";

let dom: JSDOM;
let root: Root | null = null;

const none = { status: "NONE" as const };
const scheduled = (status: "SCHEDULED" | "DUE" | "PROCESSING") => ({
  status, execute_at: EXECUTE_AT, cancellation_ref: CANCELLATION_REF
});
// origin/dev confirms the step-up AFTER "Schedule deletion", in <SecurityConfirmation> (PLAN Revision 4, S01-Q18):
// the stub offers password + authenticator code, and stepUp answers as dev's contract does.
const authMethods = vi.fn(async () => ({ methods: [], recovery_codes_remaining: 0,
  available_step_up_methods: ["password_totp" as const], step_up_providers: [] }));
const stepUpGrant = () => vi.fn(async () => ({ status: "step_up_complete" as const, csrf_token: "c".repeat(43),
  step_up_grant: { action: "DELETE_ACCOUNT" as const, token: G, expires_at: new Date(Date.now() + 300000).toISOString() } }));
const stubClient = (readAccountErasure = vi.fn(async () => none)) => ({
  readAccountErasure, authMethods,
  stepUp: stepUpGrant(),
  scheduleAccountErasure: vi.fn(async () => scheduled("SCHEDULED", true)),
  cancelAccountErasure: vi.fn(async () => none)
});

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://app.debateai.test/settings"
  });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
    // SecurityConfirmation reads its form through FormData: it must be this window's.
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true
  });
});

afterEach(async () => {
  if (root !== null) await act(async () => { root?.unmount(); });
  root = null;
  vi.useRealTimers();
  dom.window.close();
});

async function mount(client: unknown): Promise<void> {
  const { createRoot } = await import("react-dom/client");
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AccountErasureControls client={client as never} />); });
}

async function fill(id: string, value: string): Promise<void> {
  const input = document.getElementById(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  const form = document.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

// dev's own harness (tests/unit/s10-erasure-ui-render.test.tsx:44-49): choose Password, type it and the code, submit.
// SecurityConfirmation takes each code once, so a retry passes a new one.
async function confirmSecurity(codeValue = "123456"): Promise<void> {
  await act(async () => { await Promise.resolve(); });
  if (document.querySelector('[name="security-password"]') === null) {
    const choose = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Password"))!;
    await act(async () => { choose.click(); });
    await act(async () => { await Promise.resolve(); });
  }
  const password = document.querySelector<HTMLInputElement>('[name="security-password"]')!;
  const code = document.querySelector<HTMLInputElement>('[name="security-code"]')!;
  await act(async () => {
    password.value = "correct horse battery staple"; code.value = codeValue;
    password.form!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

describe("R22 decision 21: erasing an account offers no public-debate choice", () => {
  it("there is no tick box, on the form or in any status", async () => {
    await mount(stubClient());
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.querySelector("#account-deletion-public-debates")).toBeNull();
    await act(async () => { root?.unmount(); });
    root = null;
    for (const status of ["SCHEDULED", "DUE", "PROCESSING"] as const) {
      await mount(stubClient(vi.fn(async () => scheduled(status))));
      expect(document.querySelector('input[type="checkbox"]')).toBeNull();
      await act(async () => { root?.unmount(); });
      root = null;
    }
  });

  it("the warning says public debates stay and the name goes, before and after scheduling", async () => {
    expect(settingsEnglish["settings.erasure.dataWarning"]).toContain("Your public debates stay public");
    expect(settingsEnglish["settings.erasure.dataWarning"]).toContain("a contributor");
    expect(settingsEnglish).not.toHaveProperty("settings.erasure.deletePublicDebates");
    await mount(stubClient());
    expect(document.querySelector("p.setCardNote")!.textContent).toBe(settingsEnglish["settings.erasure.dataWarning"]);
    await act(async () => { root?.unmount(); });
    root = null;
    await mount(stubClient(vi.fn(async () => scheduled("SCHEDULED"))));
    expect(document.querySelector("p.setCardNote")!.textContent).toBe(settingsEnglish["settings.erasure.dataWarning"]);
    expect(document.body.textContent).not.toContain("retired pseudonym");
  });

  it("the request carries the confirmation and the grant, nothing else", async () => {
    const bodies: string[] = [];
    const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "DELETE") bodies.push(String(init.body));
      return new Response(JSON.stringify(scheduled("SCHEDULED")), {
        status: 202, headers: { "content-type": "application/json" }
      });
    });
    await mount({
      ...createContractClient("http://api.test", fakeFetch as typeof fetch),
      stepUp: stepUpGrant(), authMethods,
      readAccountErasure: vi.fn(async () => none)
    });
    await fill("account-deletion-confirmation", "DELETE MY ACCOUNT");
    await submit();
    await confirmSecurity();
    expect(bodies).toEqual([JSON.stringify({ confirmation: "DELETE MY ACCOUNT", step_up_grant: G })]);
  });
});
