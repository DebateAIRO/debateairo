// @vitest-environment jsdom
// Keyboard audit 2026-11-12, wave 2 (SET-1, SET-2, SET-3, SET-18): the sessions list, the phone card and the security
// page, followed by a keyboard user with the site's focus guard running. Each case names where focus lands.
import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionList } from "@debateai/contract";
import settings from "../../apps/ui/messages/en/settings.json";
import auth from "../../apps/ui/messages/en/auth.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import { SessionControls } from "../../apps/ui/components/SessionControls.js";
import { PhoneProfileCard } from "../../apps/ui/components/PhoneProfileCard.js";
import { SecuritySettings } from "../../apps/ui/components/SecuritySettings.js";
import { button, expectFocusOn, expectParkedOn, guardWait, keyboardOn, mountPage, nextTabStop, press, settle, typeInto, unmountPage } from "./kbd-r2-set-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));
afterEach(unmountPage);

const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

// ---------------------------------------------------------------------------------------------------------------- SET-1
const CURRENT = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222";
const SECOND = "33333333-3333-4333-8333-333333333333";
const listOf = (...ids: string[]): SessionList => ({
  sessions: ids.map((sessionId) => ({
    session_id: sessionId, created_at: "2026-08-23T10:00:00.000Z", last_seen_at: "2026-08-23T10:05:00.000Z",
    idle_expires_at: "2026-09-06T10:05:00.000Z", absolute_expires_at: "2026-11-21T10:00:00.000Z",
    last_mfa_at: "2026-08-23T10:00:00.000Z", current: sessionId === CURRENT
  }))
});
const revokeLabel = (id: string) => settings["settings.sessions.revokeLabel"].replace("{sessionId}", id);
function sessionClient(...ids: string[]) {
  return {
    listSessions: vi.fn().mockResolvedValue(listOf(...ids)),
    logout: vi.fn().mockResolvedValue(undefined),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    revokeAllSessions: vi.fn().mockResolvedValue({ revoked: 2 })
  };
}

describe("SET-1 the sessions list", () => {
  it("a revoked row's Revoke hands focus to the next row's Revoke", async () => {
    const client = sessionClient(CURRENT, FIRST, SECOND);
    await mountPage(<SessionControls client={client} onSessionEnded={vi.fn()} />);
    client.listSessions.mockResolvedValue(listOf(CURRENT, SECOND));
    await press(button(revokeLabel(FIRST)));
    expect(client.revokeSession).toHaveBeenCalledWith(FIRST);
    expectFocusOn(button(revokeLabel(SECOND)));
  });

  it("revoking the last row hands focus to the row before it", async () => {
    const client = sessionClient(CURRENT, FIRST);
    await mountPage(<SessionControls client={client} onSessionEnded={vi.fn()} />);
    client.listSessions.mockResolvedValue(listOf(CURRENT));
    await press(button(revokeLabel(FIRST)));
    expectFocusOn(button(revokeLabel(CURRENT)));
  });

  it("when no row is left, focus waits on the list's heading", async () => {
    const client = sessionClient(FIRST);
    await mountPage(<SessionControls client={client} onSessionEnded={vi.fn()} />);
    client.listSessions.mockResolvedValue(listOf());
    await press(button(revokeLabel(FIRST)));
    expectFocusOn(document.getElementById("active-sessions-heading"));
  });

  it("a refused Revoke gives focus back to the same Revoke (guard)", async () => {
    const client = sessionClient(CURRENT, FIRST);
    client.revokeSession.mockRejectedValue(new Error("refused"));
    await mountPage(<SessionControls client={client} onSessionEnded={vi.fn()} />);
    await press(button(revokeLabel(FIRST)));
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expectFocusOn(button(revokeLabel(FIRST)));
  });

  it.each([["settings.sessions.revokeAll", "revokeAllSessions"], ["settings.sessions.signOut", "logout"]] as const)(
    "a failed %s gives focus back to it (guard)", async (key, method) => {
      const client = sessionClient(CURRENT, FIRST);
      client[method].mockRejectedValue(new Error("offline"));
      await mountPage(<SessionControls client={client} onSessionEnded={vi.fn()} />);
      await press(button(settings[key]));
      expect(document.querySelector("[role=alert]")).not.toBeNull();
      expectFocusOn(button(settings[key]));
    });
});

// ---------------------------------------------------------------------------------------------------------------- SET-2
const grant = (action: string, ms: number) => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, token: "g".repeat(43), expires_at: new Date(Date.now() + ms).toISOString() } });
function phoneClient() {
  return {
    phoneProfile: vi.fn().mockResolvedValue({ phone_present: true, phone_masked: "+40 ••• 678", phone_verified: false, updated_at: null }),
    revealPhoneProfile: vi.fn().mockResolvedValue({ phone: "+40712345678" }),
    updatePhoneProfile: vi.fn(),
    authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
    stepUp: vi.fn()
  };
}
const phoneCard = () => document.querySelector<HTMLElement>("section.setList")!;
async function mountPhone(resume: unknown = null) {
  const client = phoneClient();
  await mountPage(<PhoneProfileCard client={client as never} catalog={settings} authCatalog={auth} resume={resume as never} />);
  return client;
}

describe("SET-2 the phone card (guard)", () => {
  it("Change phone number: focus waits on the card, and the next Tab is the new phone field", async () => {
    await mountPhone();
    await press(button(settings["settings.phone.change"]));
    expectParkedOn(phoneCard());
    expect(nextTabStop()?.closest("section.setList")).toBe(phoneCard());
    expect(document.querySelector('[id$="-phone"]')).not.toBeNull();
  });

  it("Show phone number: focus waits on the card, and the next Tab is the security check", async () => {
    await mountPhone();
    await press(button(settings["settings.phone.reveal"]));
    expectParkedOn(phoneCard());
    expect(nextTabStop()?.closest(".authSecurityConfirmation")).not.toBeNull();
  });

  it("Cancel in the check: focus waits on the card, and the next Tab is Show phone number again", async () => {
    await mountPhone();
    await press(button(settings["settings.phone.reveal"]));
    await press(button(auth["auth.security.cancel"]));
    expectParkedOn(phoneCard());
    expect(nextTabStop()).toBe(button(settings["settings.phone.reveal"]));
  });

  it("a finished reveal, then Hide: focus waits on the card each time, next to Hide and then to Show", async () => {
    await mountPhone({ authorization: { action: "READ_PHONE_PROFILE" }, initialProof: grant("READ_PHONE_PROFILE", 300_000) });
    await press(button(auth["auth.security.confirm"]));
    expect(phoneCard().textContent).toContain("+40712345678");
    expectParkedOn(phoneCard());
    expect(nextTabStop()).toBe(button(auth["auth.password.hide"]));
    await press(button(auth["auth.password.hide"]));
    expectParkedOn(phoneCard().querySelector(".setSessionRow"));
    expect(nextTabStop()).toBe(button(settings["settings.phone.reveal"]));
  });

  it("the reveal's own timer removing Hide under focus parks focus on the card's first row", async () => {
    await mountPhone({ authorization: { action: "READ_PHONE_PROFILE" }, initialProof: grant("READ_PHONE_PROFILE", 700) });
    await press(button(auth["auth.security.confirm"]));
    keyboardOn(button(auth["auth.password.hide"]));
    await wait(900);
    await guardWait();
    expect(phoneCard().textContent).not.toContain("+40712345678");
    expectParkedOn(phoneCard().querySelector(".setSessionRow"));
  });

  it("a held grant running out under Confirm parks focus on the card, with the alert in it", async () => {
    await mountPhone({ authorization: { action: "READ_PHONE_PROFILE" }, initialProof: grant("READ_PHONE_PROFILE", 400) });
    keyboardOn(button(auth["auth.security.confirm"]));
    await wait(600);
    await guardWait();
    expect(phoneCard().querySelector("[role=alert]")?.textContent).toBe(auth["auth.security.expired"]);
    expectParkedOn(phoneCard());
  });
});

// ------------------------------------------------------------------------------------------------------ SET-3, SET-18
const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "44444444-4444-4444-8444-444444444444";
const method = (factorId: string, label: string) => ({ factor_id: factorId, type: "totp", label, created_at: "2026-10-01T10:00:00Z", last_used_at: null, removable: true });
const methods = (...rows: ReturnType<typeof method>[]) => ({ methods: rows, recovery_codes_remaining: 10, available_step_up_methods: ["password_totp"], step_up_providers: [] });
function securityClient() {
  return {
    authMethods: vi.fn().mockResolvedValue(methods(method(M1, "Phone app"), method(M2, "Tablet app"))),
    phoneProfile: vi.fn().mockResolvedValue({ phone_present: false, phone_masked: null, phone_verified: false, updated_at: null }),
    recoveryEmail: vi.fn().mockResolvedValue({ state: "absent", email: null, pending: null }),
    authProviders: vi.fn().mockResolvedValue({ providers: [] }), linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [] }),
    removeAuthMethod: vi.fn().mockResolvedValue(undefined),
    stepUp: vi.fn(async () => ({ status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { token: "g".repeat(43), action: "REMOVE_AUTH_METHOD", target_factor_id: M1, expires_at: new Date(Date.now() + 300_000).toISOString() } })),
    listSessions: vi.fn().mockResolvedValue({ sessions: [] }), logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn(),
    pendingMfaRecovery: vi.fn().mockResolvedValue({ pending: null }),
    cancelPendingMfaRecovery: vi.fn().mockResolvedValue({ status: "cancelled" })
  };
}
async function mountSecurity(client: ReturnType<typeof securityClient>) {
  await mountPage(<StrictMode><SecuritySettings client={client as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" /></StrictMode>);
}

describe("SET-3 Cancel recovery", () => {
  it("a cancelled recovery puts focus on the line that says so", async () => {
    const client = securityClient();
    client.pendingMfaRecovery.mockResolvedValue({ pending: { not_before: new Date(Date.now() + 3_600_000).toISOString(), started_at: "2026-10-09T12:00:00.000Z" } });
    await mountSecurity(client);
    await press(button(settings["settings.security.pendingRecovery.cancel"]));
    expect(document.querySelector("[data-pending-recovery]")).toBeNull();
    const line = [...document.querySelectorAll("[role=status]")].find((node) => node.textContent === settings["settings.security.pendingRecovery.cancelled"]);
    expectFocusOn(line);
  });

  it("a failed cancel gives focus back to Cancel recovery (guard)", async () => {
    const client = securityClient();
    client.pendingMfaRecovery.mockResolvedValue({ pending: { not_before: new Date(Date.now() + 3_600_000).toISOString(), started_at: "2026-10-09T12:00:00.000Z" } });
    client.cancelPendingMfaRecovery.mockRejectedValue(new Error("offline"));
    await mountSecurity(client);
    await press(button(settings["settings.security.pendingRecovery.cancel"]));
    expect(document.querySelector("[data-pending-recovery] [role=alert]")).not.toBeNull();
    expectFocusOn(button(settings["settings.security.pendingRecovery.cancel"]));
  });
});

describe("SET-18 removing a sign-in method", () => {
  it("focus lands on the methods list's heading, not the page title", async () => {
    const client = securityClient();
    await mountSecurity(client);
    await press(button(settings["settings.security.removeNamed"].replace("{method}", "Phone app")));
    client.authMethods.mockResolvedValue(methods(method(M2, "Tablet app")));
    const card = document.querySelector(".setCard[aria-labelledby=security-card-title]")!;
    await press(button(auth["auth.security.passwordMethod"], card));
    await typeInto(card.querySelector<HTMLInputElement>("[name=security-password]")!, "existing-password");
    await typeInto(card.querySelector<HTMLInputElement>("[name=security-code]")!, "123456");
    await guardWait();
    expect(client.removeAuthMethod).toHaveBeenCalledWith(M1, "g".repeat(43));
    const heading = [...document.querySelectorAll("h2.setSectionTitle")].find((node) => node.textContent === auth["auth.enroll.securityTitle"]);
    expectFocusOn(heading);
    expect(nextTabStop()).toBe(button(settings["settings.security.removeNamed"].replace("{method}", "Tablet app")));
  });
});
