// @vitest-environment jsdom
// Keyboard audit 2026-11-12, wave 2 (SET-4, SET-5): the Email card with a change pending, and Enter in the change form,
// followed by a keyboard user with the site's focus guard running.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import { button, expectFocusOn, expectParkedOn, guardWait, mountPage, nextTabStop, press, typeInto, unmountPage } from "./kbd-r2-set-harness.js";
import { submitByKeyboard } from "./kbd-guard-harness.js";

const GRANT = "G".repeat(43);
const PENDING = { status: "PENDING" as const, new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z" };
const CURRENT = { email: "ana.popescu@unibuc.ro", recovery_email: null, pending: null };
const WITH_PENDING = { ...CURRENT, pending: { new_email: PENDING.new_email, expires_at: PENDING.expires_at } };
const api = vi.hoisted(() => ({ client: {} as Record<string, ReturnType<typeof vi.fn>> }));
function stub() {
  return {
    readAccountEmail: vi.fn().mockResolvedValue(WITH_PENDING),
    requestEmailChange: vi.fn().mockResolvedValue(PENDING),
    resendEmailChange: vi.fn().mockResolvedValue(PENDING), cancelEmailChange: vi.fn().mockResolvedValue(undefined),
    authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
    stepUp: vi.fn().mockResolvedValue({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { token: GRANT, action: "CHANGE_EMAIL", expires_at: new Date(Date.now() + 300_000).toISOString() } })
  };
}
vi.mock("@/lib/api", () => ({ get contractClient() { return api.client; }, getSettingsView: vi.fn() }));
const { ChangeEmailScreen, EmailSettingsCard } = await import("../../apps/ui/components/EmailSettings.js");

beforeEach(() => { api.client = stub(); });
afterEach(unmountPage);

describe("SET-4 the Email card with a change pending (guard)", () => {
  it("Resend gives focus back to Resend once it is done", async () => {
    await mountPage(<EmailSettingsCard client={api.client as never} onChange={vi.fn()} />);
    await press(button(settings["settings.email.resend"]));
    expect(api.client.resendEmailChange).toHaveBeenCalledOnce();
    expectFocusOn(button(settings["settings.email.resend"]));
  });

  it("a refused Resend gives focus back to Resend too", async () => {
    api.client.resendEmailChange.mockRejectedValue(new Error("offline"));
    await mountPage(<EmailSettingsCard client={api.client as never} onChange={vi.fn()} />);
    await press(button(settings["settings.email.resend"]));
    expectFocusOn(button(settings["settings.email.resend"]));
  });

  it("Cancel change: focus waits on the Email card, and the next Tab is Change email", async () => {
    await mountPage(<EmailSettingsCard client={api.client as never} onChange={vi.fn()} />);
    await press(button(settings["settings.email.cancel"]));
    expect(document.querySelector("[role=status]")?.textContent).toBe(settings["settings.email.cancelled"]);
    expectParkedOn(document.querySelector("section.emlCard"));
    expect(nextTabStop()).toBe(button(settings["settings.email.change"]));
  });
});

describe("SET-5 Enter in the change form", () => {
  async function fill() {
    await mountPage(<ChangeEmailScreen client={api.client as never} currentEmail={CURRENT.email} onBack={vi.fn()} onRequested={vi.fn()} />);
    await typeInto(document.querySelector<HTMLInputElement>("#email-change-new")!, "ana.popescu@icub.ro");
    await typeInto(document.querySelector<HTMLInputElement>("#email-change-confirm")!, "ana.popescu@icub.ro");
  }

  it("Enter in a field that the check switches off puts focus on the check's first choice", async () => {
    await fill();
    const confirm = document.querySelector<HTMLInputElement>("#email-change-confirm")!;
    submitByKeyboard(confirm);
    await guardWait();
    expect(confirm.disabled).toBe(true);
    expectFocusOn(document.querySelector(".authSecurityConfirmation .authSecurityActions button"));
  });

  it("the send button keeps its focus when it opens the check (it is not switched off)", async () => {
    await fill();
    await press(button(settings["settings.emailChange.submit"]));
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    expectFocusOn(button(settings["settings.emailChange.submit"]));
  });
});
