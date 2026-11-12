// @vitest-environment jsdom
// Keyboard audit 2026-11-12, wave 2 (SET-12 to SET-17): the team page's panels, the threat reports page and the staff
// invitation, followed by a keyboard user with the site's focus guard running.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import staff from "../../apps/ui/messages/en/staff.json";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { StaffInvitationPanel } from "../../apps/ui/components/StaffInvitationPanel.js";
import { TeamLimitPanel } from "../../apps/ui/components/TeamLimitPanel.js";
import { TeamAllowancePanel } from "../../apps/ui/components/TeamAllowancePanel.js";
import { ThreatReportsPanel } from "../../apps/ui/components/ThreatReportsPanel.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { button, expectFocusOn, expectParkedOn, guardWait, keyboardOn, mountPage, nextTabStop, press, typeInto, unmountPage } from "./kbd-r2-set-harness.js";
import { submitByKeyboard } from "./kbd-guard-harness.js";

const S = staff as Readonly<Record<string, string>>;
afterEach(unmountPage);
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

// ------------------------------------------------------------------------------------------------------ SET-12, SET-17
// The fake server of staff-team-controls.test.tsx, cut to what these steps reach.
const selfId = "11111111-1111-4111-8111-111111111111", targetId = "22222222-2222-4222-8222-222222222222";
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const enrollment = { user_id: selfId, readiness: { account_active: true, email_verified: true, totp_active: true, security_hold: false, verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true } };
let caps: string[], expiresAt: string, refuseRefresh: boolean;
function staffClient() {
  return createStaffApiClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/enrollment")) return Response.json(enrollment);
    if (path.endsWith("/options")) return Response.json(path.includes("/invitations/") ? { ...options, invitation_revision: 7 } : options);
    if (path.endsWith("/elevation/verify")) return Response.json({ staff_id: selfId, capabilities: caps, grant_revision: 0, expires_at: expiresAt });
    if (path.includes("/audit?")) return Response.json({ events: [], next_cursor: null, order: "RECORDED_AT_ID_ASC" });
    if (path.includes("/team?")) {
      if (refuseRefresh) return Response.json({ error: "STAFF_DEPENDENCY_UNAVAILABLE" }, { status: 503 });
      return Response.json({ members: [{ staff_id: targetId, pseudonym: "member_fixture", status: "ACTIVE", capabilities: ["TEAM_GRANT"], grant_revision: 1, credential_count: 2, last_privilege_at: null, delivery_state: "PENDING" }], next_cursor: null, order: "CREATED_AT_ID_ASC" });
    }
    if (path.endsWith("/verify")) return Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" });
    return Response.json({ operation_id: targetId, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" });
  }) as typeof fetch });
}
beforeEach(() => { caps = ["TEAM_READ", "TEAM_GRANT"]; expiresAt = "2099-01-01T00:00:00.000Z"; refuseRefresh = false; history.replaceState(null, "", "/admin/team"); });
const member = () => document.querySelector<HTMLElement>("[data-staff-member]")!;
async function unlocked() {
  await mountPage(<StaffAccessPanel client={staffClient()} />);
  await press(button(S["staff.elevate"]!));
}

describe("SET-12 the team access panel (guard)", () => {
  it("Verify security key: focus waits on the access card, whose heading now says verified", async () => {
    await unlocked();
    const summary = document.querySelector<HTMLElement>("section.staffAccessSummary");
    expect(summary?.querySelector("h2")?.textContent).toBe(S["staff.verified"]);
    expectParkedOn(summary);
  });

  it("opening a member's form keeps focus on its button; Cancel parks it on the member, next to that button", async () => {
    await unlocked();
    await press(button(S["staff.action.grant"]!));
    expectFocusOn(button(S["staff.action.grant"]!));
    expect(button(S["staff.action.grant"]!).getAttribute("aria-expanded")).toBe("true");
    await press(button(S["staff.cancel"]!, member()));
    expectParkedOn(member());
    expect(nextTabStop()).toBe(button(S["staff.action.grant"]!));
  });

  it("a recorded change parks focus on the member it was for", async () => {
    await unlocked();
    await press(button(S["staff.action.grant"]!));
    const form = member().querySelector<HTMLFormElement>("[data-staff-mutation=grant]")!;
    form.querySelector<HTMLInputElement>("[name=confirmed]")!.checked = true;
    submitByKeyboard(form.querySelector<HTMLInputElement>("[name=ticket_ref]")!);
    await guardWait();
    expect(document.querySelector("[role=status]")?.textContent).toBe(S["staff.complete"]);
    expectParkedOn(member());
  });

  it("Refresh team gives focus back to Refresh team", async () => {
    await unlocked();
    await press(button(S["staff.refresh"]!));
    expectFocusOn(button(S["staff.refresh"]!));
  });

  it("team access running out under focus parks it on the panel, before Verify again", async () => {
    expiresAt = new Date(Date.now() + 1_500).toISOString();
    await unlocked();
    keyboardOn(button(S["staff.refresh"]!));
    await wait(1_700);
    await guardWait();
    expect(document.querySelector("[role=status]")?.textContent).toBe(S["staff.denied"]);
    expectParkedOn(document.querySelector(".staffAccess"));
    expect(nextTabStop()).toBe(button(S["staff.elevate"]!));
  });
});

describe("SET-17 the staff invitation (guard)", () => {
  it("Confirm invitation acceptance parks focus on the card, with the outcome in it", async () => {
    history.replaceState(null, "", `/admin/invitation#${handle}`);
    await mountPage(<StaffInvitationPanel client={staffClient()} />);
    const form = document.querySelector<HTMLFormElement>("[data-invitation-accept]")!;
    form.querySelector<HTMLInputElement>("[name=confirmed]")!.checked = true;
    await press(button(S["staff.accept"]!));
    const card = document.querySelector<HTMLElement>("section.setCard");
    expect(card?.querySelector("[role=status]")?.textContent).toBe(S["staff.accepted"]);
    expectParkedOn(card);
  });
});

// --------------------------------------------------------------------------------------------------------------- SET-13
const OWNER = "11111111-1111-4111-8111-111111111111", PARTNER = "22222222-2222-4222-8222-222222222222", MEMBER = "33333333-3333-4333-8333-333333333333";
const limitPage = (partner: boolean) => ({
  amount_micros: 40_000_000, revision: 3, spent_micros: 12_500_000, committed_micros: 2_250_000,
  month_starts_at: "2031-03-01T00:00:00.000Z", month_ends_at: "2031-04-01T00:00:00.000Z", is_owner: true,
  partner: partner ? { staff_id: PARTNER, pseudonym: "partner_fixture", grant_revision: 7 } : null, log: []
});
function limitClient(partner = false) {
  return {
    read: vi.fn(async () => limitPage(partner)),
    team: vi.fn(async () => [{ staff_id: MEMBER, pseudonym: "member_fixture", status: "ACTIVE", capabilities: ["TEAM_READ"], grant_revision: 9, credential_count: 1, last_privilege_at: null, delivery_state: "DELIVERED" }]),
    setLimit: vi.fn(async () => undefined), pickPartner: vi.fn(async () => undefined), takeBackPartner: vi.fn(async () => undefined),
    recordPractice: vi.fn(async () => undefined), cancel: vi.fn()
  };
}

describe("SET-13 the team limit panel", () => {
  async function asked() {
    const client = limitClient();
    await mountPage(<TeamLimitPanel client={client as never} />);
    const amount = document.querySelector<HTMLInputElement>("#team-limit-amount")!;
    await typeInto(amount, "55");
    submitByKeyboard(amount);
    await guardWait();
    return { client, amount };
  }

  it("asking puts focus on the confirm's Confirm (the form is switched off while it waits)", async () => {
    const { amount } = await asked();
    expect(amount.matches(":disabled")).toBe(true);
    expectFocusOn(button(S["staff.teamLimit.confirm"]!));
  });

  it("Cancel gives focus back to where the person asked from, switched on again", async () => {
    const { amount } = await asked();
    await press(button(S["staff.teamLimit.cancel"]!));
    expect(document.querySelector("[data-team-limit-confirm]")).toBeNull();
    expectFocusOn(amount);
  });

  it("Confirm parks focus on the limit's card, where the outcome is said (guard)", async () => {
    const { client } = await asked();
    await press(button(S["staff.teamLimit.confirm"]!));
    expect(client.setLimit).toHaveBeenCalledOnce();
    const card = document.querySelector<HTMLElement>("[data-team-limit-form=limit]")!.closest("section");
    expect(card?.querySelector("[role=status]")?.textContent).toBe(S["staff.teamLimit.done"]);
    expectParkedOn(card);
  });

  it("Take back puts focus on its Confirm, and Cancel gives it back to Take back", async () => {
    await mountPage(<TeamLimitPanel client={limitClient(true) as never} />);
    await press(button(S["staff.teamLimit.partner.takeBack"]!));
    expectFocusOn(button(S["staff.teamLimit.confirm"]!));
    await press(button(S["staff.teamLimit.cancel"]!));
    expectFocusOn(button(S["staff.teamLimit.partner.takeBack"]!));
  });
});

// ------------------------------------------------------------------------------------------------------ SET-14, SET-15
const HOLDER = "44444444-4444-4444-8444-444444444444";
const allowancePage = {
  limits: { maximum_grant_micros: 50_000_000, maximum_day_micros: 5_000_000, maximum_week_micros: 20_000_000, maximum_lifetime_ms: 2_592_000_000 },
  members: [
    { staff_id: OWNER, pseudonym: "owner_fixture", is_owner: true, revision: 0, allowance: null },
    { staff_id: MEMBER, pseudonym: "member_fixture", is_owner: false, revision: 2, allowance: null },
    { staff_id: HOLDER, pseudonym: "holder_fixture", is_owner: false, revision: 4, allowance: { grant_id: "55555555-5555-4555-8555-555555555555", amount_micros: 30_000_000, day_micros: 3_000_000, week_micros: 10_000_000, starts_at: "2031-03-01T00:00:00.000Z", expires_at: "2031-03-20T00:00:00.000Z", spent_micros: 1_250_000 } }
  ],
  log: []
};
const allowanceClient = () => ({ read: vi.fn(async () => allowancePage), give: vi.fn(async () => undefined), takeBack: vi.fn(async () => undefined), cancel: vi.fn() });

describe("SET-14, SET-15 the team allowance panel", () => {
  async function asked() {
    const client = allowanceClient();
    await mountPage(<TeamAllowancePanel client={client as never} />);
    await typeInto(document.querySelector<HTMLSelectElement>("#team-allowance-person")!, MEMBER);
    for (const [id, value] of [["amount", "20"], ["day", "2"], ["week", "8"]] as const) await typeInto(document.querySelector<HTMLInputElement>(`#team-allowance-${id}`)!, value);
    await press(button(S["staff.teamAllowance.give"]!, document.querySelector("[data-team-allowance-form]")!));
    return client;
  }

  it("Give a quota puts focus on the confirm's Confirm; Cancel gives it back to Give a quota", async () => {
    await asked();
    expectFocusOn(button(S["staff.teamAllowance.confirm"]!));
    await press(button(S["staff.teamAllowance.cancel"]!));
    expectFocusOn(button(S["staff.teamAllowance.give"]!, document.querySelector("[data-team-allowance-form]")!));
  });

  it("Confirm parks focus on the Give card, where the outcome is said (guard)", async () => {
    const client = await asked();
    await press(button(S["staff.teamAllowance.confirm"]!));
    expect(client.give).toHaveBeenCalledOnce();
    const card = document.querySelector<HTMLElement>("[data-team-allowance-form]")!.closest("section");
    expect(card?.querySelector("[role=status]")?.textContent).toBe(S["staff.teamAllowance.done"]);
    expectParkedOn(card);
  });

  it("a row's Take it back puts focus on the confirm in the other card; Cancel brings it back to that row", async () => {
    await mountPage(<TeamAllowancePanel client={allowanceClient() as never} />);
    const row = document.querySelector(`[data-team-allowance-member="${HOLDER}"]`)!;
    await press(button(S["staff.teamAllowance.takeBack"]!, row));
    const confirm = button(S["staff.teamAllowance.confirm"]!);
    expect(confirm.closest("[data-team-allowance-confirm=takeBack]")).not.toBeNull();
    expectFocusOn(confirm);
    await press(button(S["staff.teamAllowance.cancel"]!));
    expectFocusOn(button(S["staff.teamAllowance.takeBack"]!, row));
  });
});

// --------------------------------------------------------------------------------------------------------------- SET-16
const OLD = "11111111-1111-4111-8111-111111111111", NEW = "22222222-2222-4222-8222-222222222222";
function reportsClient() {
  let decision: "UNREAD" | "REPORTED" | "NOT_REPORTED" = "UNREAD";
  const row = (ref: string, kept: string) => ({ report_ref: ref, kept_at: kept, decision: ref === OLD ? decision : "UNREAD", decided_at: ref === OLD && decision !== "UNREAD" ? "2026-10-21T10:00:00.000Z" : null });
  return {
    list: vi.fn(async () => ({ reports: [row(OLD, "2026-10-20T08:00:00.000Z"), row(NEW, "2026-10-20T09:00:00.000Z")].filter(item => item.decision !== "NOT_REPORTED") })),
    read: vi.fn(async (ref: string) => ({ ...row(ref, "2026-10-20T08:00:00.000Z"), question: "A kept question", account: { email: "kept@example.com", user_id: "33333333-3333-4333-8333-333333333333" } })),
    decide: vi.fn(async (_ref: string, next: "REPORTED" | "NOT_REPORTED") => { decision = next; }),
    cancel: vi.fn()
  };
}
const openLink = (ref: string) => document.querySelector<HTMLAnchorElement>(`[data-report-ref="${ref}"] a`)!;
const sectionTitle = (key: string) => [...document.querySelectorAll("h2")].find((node) => node.textContent === S[key]);

describe("SET-16 the threat reports page", () => {
  beforeEach(() => { history.replaceState(null, "", "/admin/threat-reports"); });

  it("Open puts focus on the report's heading; Back to the list puts it on the row just read", async () => {
    await mountPage(<ThreatReportsPanel client={reportsClient() as never} />);
    expect(document.activeElement).toBe(document.body);
    await press(openLink(OLD));
    expectFocusOn(sectionTitle("staff.threatReports.itemTitle"));
    await press(button(S["staff.threatReports.backList"]!));
    expectFocusOn(openLink(OLD));
  });

  it("a decision puts focus on the notice that says it was recorded", async () => {
    await mountPage(<ThreatReportsPanel client={reportsClient() as never} />);
    await press(openLink(OLD));
    await press(button(S["staff.threatReports.notReported"]!));
    expect(document.querySelector(`[data-report-ref="${OLD}"]`)).toBeNull();
    expectFocusOn(document.querySelector(".staffNotice[role=status]"));
  });

  it("the browser's Back to the list puts focus on the row just read", async () => {
    await mountPage(<ThreatReportsPanel client={reportsClient() as never} />);
    await press(openLink(NEW));
    history.replaceState(null, "", "/admin/threat-reports");
    keyboardOn(sectionTitle("staff.threatReports.itemTitle")!);
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    await guardWait();
    expectFocusOn(openLink(NEW));
  });

  it("a page opened straight on a report takes no focus", async () => {
    history.replaceState(null, "", `/admin/threat-reports?report=${OLD}`);
    await mountPage(<ThreatReportsPanel client={reportsClient() as never} />);
    expect(sectionTitle("staff.threatReports.itemTitle")).toBeDefined();
    expect(document.activeElement).toBe(document.body);
  });
});
