// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): Change email, its Back button and its success path swap the whole Settings
// screen, and Cancel on the security check unmounts the check; each dropped focus to <body>. Focus now lands on the
// change form's title, back on the Email card (Change email, or its heading), and on what opened the check.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };

const GRANT = "G".repeat(43);
const PENDING = { status: "PENDING" as const, new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z" };
const CURRENT = { email: "ana.popescu@unibuc.ro", recovery_email: null, pending: null };
const api = vi.hoisted(() => ({ client: {} as Record<string, ReturnType<typeof vi.fn>> }));
function stub() {
  return {
    readAccountEmail: vi.fn().mockResolvedValue(CURRENT),
    requestEmailChange: vi.fn().mockResolvedValue(PENDING),
    resendEmailChange: vi.fn(), cancelEmailChange: vi.fn(),
    authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
    stepUp: vi.fn().mockResolvedValue({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { token: GRANT, action: "CHANGE_EMAIL", expires_at: new Date(Date.now() + 300_000).toISOString() } })
  };
}
vi.mock("@/lib/api", () => ({ get contractClient() { return api.client; }, getSettingsView: vi.fn() }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: () => React.ReactNode }) => children() }));
vi.mock("@/components/consent/ConsentSettingsPanel", () => ({ ConsentSettingsPanel: () => null }));
vi.mock("@/components/AccountErasureControls", () => ({ AccountErasureControls: () => null }));
vi.mock("@/components/DataExportCard", () => ({ DataExportCard: () => null }));
vi.mock("@/components/SessionControls", () => ({ SessionControls: () => null }));
vi.mock("@/components/billing/SubscriptionControls", () => ({ SubscriptionControls: () => null }));
vi.mock("@/components/billing/UsageBars", () => ({ UsageBars: () => null }));
const { ChangeEmailScreen, EmailSettingsCard } = await import("../../apps/ui/components/EmailSettings.js");
const { SettingsPageClient } = await import("../../apps/ui/components/SettingsPageClient.js");

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
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); api.client = stub(); });
afterEach(async () => { if (root !== null) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("the change form", () => {
  it("opens on its title", async () => {
    await mount(<ChangeEmailScreen client={api.client as never} currentEmail={CURRENT.email} onBack={vi.fn()} onRequested={vi.fn()}/>);
    const title = document.querySelector<HTMLHeadingElement>("h1")!;
    expect(title.textContent).toBe(settings["settings.emailChange.title"]);
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title);
  });

  it("Cancel on the security check returns focus to the send button", async () => {
    await mount(<ChangeEmailScreen client={api.client as never} currentEmail={CURRENT.email} onBack={vi.fn()} onRequested={vi.fn()}/>);
    await type("#email-change-new", "ana.popescu@icub.ro");
    await type("#email-change-confirm", "ana.popescu@icub.ro");
    await press(settings["settings.emailChange.submit"]);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    await press("Cancel");
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(settings["settings.emailChange.submit"]));
  });

  it("Cancel returns focus to the field Enter was pressed in, enabled again", async () => {
    await mount(<ChangeEmailScreen client={api.client as never} currentEmail={CURRENT.email} onBack={vi.fn()} onRequested={vi.fn()}/>);
    await type("#email-change-new", "ana.popescu@icub.ro");
    await type("#email-change-confirm", "ana.popescu@icub.ro");
    const confirm = document.querySelector<HTMLInputElement>("#email-change-confirm")!;
    confirm.focus();
    await act(async () => { confirm.form!.requestSubmit(); }); await settle();
    expect(confirm.disabled).toBe(true);
    await press("Cancel");
    expect(confirm.disabled).toBe(false);
    expect(document.activeElement).toBe(confirm);
  });
});

describe("the Email card", () => {
  it("takes no focus on an ordinary page load", async () => {
    await mount(<EmailSettingsCard client={api.client as never} onChange={vi.fn()}/>);
    expect(document.activeElement).toBe(document.body);
  });

  it("coming back, holds focus on its heading while loading, then on Change email", async () => {
    let answer!: (value: typeof CURRENT) => void;
    api.client.readAccountEmail.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    await mount(<EmailSettingsCard client={api.client as never} onChange={vi.fn()} restoreFocus/>);
    expect(document.activeElement).toBe(document.querySelector("#account-email-heading"));
    await act(async () => answer(CURRENT)); await settle();
    expect(document.activeElement).toBe(button(settings["settings.email.change"]));
  });

  it("coming back, leaves focus alone when the person moved on while it loaded", async () => {
    let answer!: (value: typeof CURRENT) => void;
    api.client.readAccountEmail.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const elsewhere = document.createElement("button"); document.body.append(elsewhere);
    await mount(<EmailSettingsCard client={api.client as never} onChange={vi.fn()} restoreFocus/>);
    elsewhere.focus();
    await act(async () => answer(CURRENT)); await settle();
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("on the Settings page", () => {
  it("Change email lands on the form's title, and Back lands on Change email again", async () => {
    await mount(<SettingsPageClient/>);
    await press(settings["settings.email.change"]);
    expect(document.activeElement?.textContent).toBe(settings["settings.emailChange.title"]);
    await press(settings["settings.emailChange.back"]);
    expect(document.querySelector("#account-email-heading")).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(settings["settings.email.change"]));
  });

  it("a sent request lands on the Email card, which shows the pending change", async () => {
    await mount(<SettingsPageClient/>);
    api.client.readAccountEmail.mockResolvedValue({ ...CURRENT, pending: { new_email: PENDING.new_email, expires_at: PENDING.expires_at } });
    await press(settings["settings.email.change"]);
    await type("#email-change-new", "ana.popescu@icub.ro");
    await type("#email-change-confirm", "ana.popescu@icub.ro");
    await press(settings["settings.emailChange.submit"]);
    await press("Password · 6-digit authentication code");
    await type('[name="security-password"]', "correct horse");
    await type('[name="security-code"]', "123456");
    expect(api.client.requestEmailChange).toHaveBeenCalledWith("ana.popescu@icub.ro", GRANT);
    expect(document.body.textContent).toContain(settings["settings.email.requested"]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector("#account-email-heading"));
  });
});

// 2026-10-22 follow-up: the mailed link's screen stands in for Settings, and its Go to Settings swaps the whole
// screen out from under the pressed button.
describe("the mailed link's screen", () => {
  afterEach(() => { window.history.replaceState(null, "", "/"); });

  it("Go to Settings lands on the Settings title", async () => {
    api.client.confirmEmailChange = vi.fn().mockResolvedValue(undefined);
    window.history.replaceState(null, "", `/settings#email-change=confirm&token=${"L".repeat(43)}`);
    await mount(<SettingsPageClient/>);
    expect(api.client.confirmEmailChange).toHaveBeenCalledTimes(1);
    expect(document.querySelector("h1")?.textContent).toBe(settings["settings.emailLink.confirmedTitle"]);
    await press(settings["settings.emailLink.continue"]);
    const title = document.querySelector<HTMLHeadingElement>("h1.setTitle")!;
    expect(title.textContent).toBe(settings["settings.account.title"]);
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(title);
  });

  it("Settings opened without a link keeps the browser's own starting point", async () => {
    await mount(<SettingsPageClient/>);
    const title = document.querySelector<HTMLHeadingElement>("h1.setTitle")!;
    expect(title.textContent).toBe(settings["settings.account.title"]);
    expect(title.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
