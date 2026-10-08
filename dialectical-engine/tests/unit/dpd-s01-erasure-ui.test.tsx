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
const REMOVE_WARNING = "Encrypted private content becomes permanently unreadable when its keys are destroyed. When the deletion runs, your public debates are removed from DebateAI and the keys to our copies are destroyed; downloaded, quoted, cached, indexed, or provider-retained copies may persist. Claimed legacy plaintext is reported as a retained residual, not as fully cleaned content.";

let dom: JSDOM;
let root: Root | null = null;

const none = { status: "NONE" as const };
const scheduled = (status: "SCHEDULED" | "DUE" | "PROCESSING", remove: boolean) => ({
  status, execute_at: EXECUTE_AT, cancellation_ref: CANCELLATION_REF,
  delete_public_debates: remove
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

function checkbox(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>("#account-deletion-public-debates");
  if (found === null) throw new Error("CHECKBOX_NOT_FOUND");
  return found;
}

async function tick(): Promise<void> {
  await act(async () => { checkbox().click(); });
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

describe("DPD S01 account erasure choice", () => {
  it("R1 R3 one checkbox and its label sit between the confirmation field and the submit button", async () => {
    await mount(stubClient());
    const boxes = document.querySelectorAll('input[type="checkbox"]#account-deletion-public-debates');
    expect(boxes).toHaveLength(1);
    const label = document.querySelector("label[for=account-deletion-public-debates]");
    expect(label?.textContent).toBe("Also delete my public debates");
    const field = document.querySelector("#account-deletion-confirmation")!;
    const box = boxes[0]!;
    const button = document.querySelector("button[type=submit]")!;
    expect(field.closest("form")).toBe(box.closest("form"));
    expect(box.closest("form")).toBe(button.closest("form"));
    expect(field.compareDocumentPosition(box) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(button) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const element of [field, box, button]) expect(element.hasAttribute("tabindex")).toBe(false);
  });

  it("R2 the box is unticked on mount, keeps its state after a failed schedule, and is unticked when the form returns", async () => {
    const client = stubClient();
    client.stepUp.mockRejectedValueOnce(new Error("DENIED"));
    await mount(client);
    expect(checkbox().checked).toBe(false);
    await tick();
    await fill("account-deletion-confirmation", "DELETE MY ACCOUNT");
    await submit();
    await confirmSecurity();
    expect(client.stepUp).toHaveBeenCalledTimes(1);
    expect(checkbox().checked).toBe(true);
    await confirmSecurity("654321");
    expect(client.scheduleAccountErasure).toHaveBeenCalledWith(G, true);
    expect(document.querySelector("#account-deletion-confirmation")).toBeNull();
    const cancel = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Cancel account deletion"))!;
    await act(async () => { cancel.click(); });
    expect(checkbox().checked).toBe(false);
    await act(async () => { root?.unmount(); });
    root = null;

    vi.useFakeTimers();
    const poll = stubClient(vi.fn()
      .mockResolvedValueOnce(none)
      .mockResolvedValueOnce(scheduled("SCHEDULED", false))
      .mockResolvedValueOnce(none));
    await mount(poll);
    await tick();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(checkbox().checked).toBe(false);
  });

  it("R4 the box does not gate the button", async () => {
    await mount(stubClient());
    const button = document.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(button.disabled).toBe(true);
    await tick();
    expect(button.disabled).toBe(true);
    await fill("account-deletion-confirmation", "DELETE MY ACCOUNT");
    expect(button.disabled).toBe(false);
    await tick();
    expect(button.disabled).toBe(false);
  });

  it("R6 the warning note swaps on tick and untick without a request", async () => {
    const client = stubClient();
    await mount(client);
    const warning = document.querySelector("p.setCardNote")!;
    expect(warning.textContent).toBe(settingsEnglish["settings.erasure.dataWarning"]);
    await tick();
    expect(warning.textContent).toBe(REMOVE_WARNING);
    await tick();
    expect(warning.textContent).toBe(settingsEnglish["settings.erasure.dataWarning"]);
    expect(client.scheduleAccountErasure).toHaveBeenCalledTimes(0);
    expect(client.stepUp).toHaveBeenCalledTimes(0);
  });

  it("R7 the stored choice note follows the status response", async () => {
    for (const status of ["SCHEDULED", "DUE", "PROCESSING"] as const) {
      for (const remove of [true, false]) {
        const client = stubClient(vi.fn(async () => scheduled(status, remove)));
        await mount(client);
        const statusLine = document.querySelector("p.setStatus[role=status]")!;
        const note = statusLine.nextElementSibling;
        expect(note?.matches("p.setCardNote")).toBe(true);
        expect(note?.textContent).toBe(remove
          ? "Your public debates will be removed when the deletion runs."
          : "Your public debates will stay public under a retired pseudonym.");
        await act(async () => { root?.unmount(); });
        root = null;
      }
    }
  });

  it("R10 the request body carries the box state at submit", async () => {
    for (const remove of [true, false]) {
      const bodies: string[] = [];
      const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.method === "DELETE") bodies.push(String(init.body));
        return new Response(JSON.stringify(scheduled("SCHEDULED", remove)), {
          status: 202, headers: { "content-type": "application/json" }
        });
      });
      const client = {
        ...createContractClient("http://api.test", fakeFetch as typeof fetch),
        stepUp: stepUpGrant(), authMethods,
        readAccountErasure: vi.fn(async () => none)
      };
      await mount(client);
      if (remove) await tick();
      await fill("account-deletion-confirmation", "DELETE MY ACCOUNT");
      await submit();
      await confirmSecurity();
      expect(bodies).toEqual([
        JSON.stringify({ confirmation: "DELETE MY ACCOUNT", step_up_grant: G, delete_public_debates: remove })
      ]);
      await act(async () => { root?.unmount(); });
      root = null;
    }
  });
});
