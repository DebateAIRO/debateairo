// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): on Settings, Cancel on the security check (Delete account, Export data) unmounts
// the focused Cancel button, and a finished action replaces the button that started it; focus fell to <body>. It
// now goes back to the button that opened the check, or to the card's heading when that button is gone.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };

const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] };
const grant = (action: string) => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } });
const SCHEDULED = { status: "SCHEDULED" as const, execute_at: "2026-10-30T00:00:00.000Z", cancellation_ref: "55555555-5555-4555-8555-555555555555", delete_public_debates: false };
let root: Root | null = null;
async function settle() { await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }); }
async function mount(node: React.ReactNode) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(node); }); await settle();
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}
/** A keyboard press: the button holds focus, then activates. */
async function press(label: string) { const target = button(label); target.focus(); expect(document.activeElement).toBe(target); await act(async () => { target.click(); }); await settle(); }
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await settle();
}
async function prove() {
  await press("Password · 6-digit authentication code");
  await type('[name="security-password"]', "correct horse");
  await type('[name="security-code"]', "123456");
}
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root !== null) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("Delete account", () => {
  const client = (overrides: Record<string, unknown> = {}) => ({
    readAccountErasure: vi.fn(async () => ({ status: "NONE" as const })),
    scheduleAccountErasure: vi.fn(async () => SCHEDULED),
    cancelAccountErasure: vi.fn(async () => ({ status: "NONE" as const })),
    authMethods: vi.fn(async () => methods),
    stepUp: vi.fn(async () => grant("DELETE_ACCOUNT")),
    ...overrides
  });
  async function open(api: ReturnType<typeof client>) {
    await mount(<AccountErasureControls client={api as never} catalog={settings} locale="en"/>);
    await type("#account-deletion-confirmation", settings["settings.erasure.confirmationPhrase"]);
    await press(settings["settings.erasure.schedule"]);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
  }

  it("Cancel on the security check returns focus to Schedule deletion", async () => {
    await open(client());
    await press("Cancel");
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(settings["settings.erasure.schedule"]));
  });

  it("a scheduled deletion, whose form is gone, lands on the card's heading", async () => {
    const api = client();
    await open(api);
    await prove();
    expect(api.scheduleAccountErasure).toHaveBeenCalled();
    expect(document.body.textContent).toContain(settings["settings.erasure.scheduled"]);
    const heading = document.querySelector<HTMLHeadingElement>("#account-deletion-heading")!;
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("cancelling a scheduled deletion lands on the heading; a failed cancel keeps the button", async () => {
    await mount(<AccountErasureControls client={client({ readAccountErasure: vi.fn(async () => SCHEDULED) }) as never} catalog={settings} locale="en"/>);
    await press(settings["settings.erasure.cancel"]);
    expect(document.body.textContent).toContain(settings["settings.erasure.cancelled"]);
    expect(document.activeElement).toBe(document.querySelector("#account-deletion-heading"));
    await act(async () => root!.unmount()); root = null; document.body.replaceChildren();
    await mount(<AccountErasureControls client={client({ readAccountErasure: vi.fn(async () => SCHEDULED), cancelAccountErasure: vi.fn(async () => { throw new Error("OFFLINE"); }) }) as never} catalog={settings} locale="en"/>);
    await press(settings["settings.erasure.cancel"]);
    expect(document.body.textContent).toContain(settings["settings.erasure.cancelFailed"]);
    expect(document.activeElement).toBe(button(settings["settings.erasure.cancel"]));
  });
});

describe("Export data", () => {
  const client = (overrides: Record<string, unknown> = {}) => ({
    readDataExportStatus: vi.fn(async () => ({ status: "NONE" as const })),
    requestDataExport: vi.fn(async () => ({ status: "PREPARING" as const, requested_at: "2026-10-08T15:43:00.000Z" })),
    authMethods: vi.fn(async () => methods),
    stepUp: vi.fn(async () => grant("EXPORT_DATA")),
    ...overrides
  });

  it("Cancel on the security check returns focus to Export data", async () => {
    await mount(<DataExportCard catalog={settings} locale="en" client={client() as never}/>);
    await press(settings["settings.export.request"]);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    await press("Cancel");
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(settings["settings.export.request"]));
  });

  it("a request, whose button is gone while it prepares, lands on the card's heading", async () => {
    await mount(<DataExportCard catalog={settings} locale="en" client={client() as never}/>);
    await press(settings["settings.export.request"]);
    await prove();
    const heading = document.querySelector<HTMLHeadingElement>("#export-heading")!;
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("a refused request keeps focus on the card's heading, its answer below it", async () => {
    const api = client({ requestDataExport: vi.fn(async () => { throw new ContractHttpError("HTTP_ERROR", 409, "busy", "EXPORT_IN_PROGRESS"); }) });
    await mount(<DataExportCard catalog={settings} locale="en" client={api as never}/>);
    await press(settings["settings.export.request"]);
    await prove();
    expect(document.body.textContent).toContain(settings["settings.export.inProgress"]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector("#export-heading"));
  });
});
