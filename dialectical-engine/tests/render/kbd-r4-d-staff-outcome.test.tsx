// @vitest-environment jsdom
// Keyboard audit round 4 (2026-11-12), D6: on /admin/team the outcome of an invite, grant, disable or compromise
// ("Change recorded", stale, failed, denied) showed only in the status line at the very top of the page. The form's
// `<fieldset disabled>` drops focus at once, the guard parks it on the member's article deep in the list, and the result
// could not be seen from there. Now the same line, same string, shows inside the member's article (or the invite card)
// that was acted on; when that place is gone (access denied), it shows at the top and takes focus if nothing real has it.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import staff from "../../apps/ui/messages/en/staff.json";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { button, expectFocusOn, expectParkedOn, guardWait, mountPage, press, unmountPage } from "./kbd-r2-set-harness.js";
import { submitByKeyboard } from "./kbd-guard-harness.js";

const S = staff as Readonly<Record<string, string>>;

// A browser takes focus from a control inside `<fieldset disabled>` at once (measured in Chrome; jsdom does not): drop it
// the moment the fieldset is switched off, as kbd-r3-team-asker.test.tsx does.
const setAttribute = Element.prototype.setAttribute;
beforeEach(() => {
  Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
    setAttribute.call(this, name, value);
    const focused = document.activeElement;
    if (name !== "disabled" || !(focused instanceof HTMLElement) || !this.contains(focused)) return;
    const sink = document.createElement("span");
    sink.tabIndex = -1;
    setAttribute.call(sink, "data-focus-fixup-sink", "");
    document.body.append(sink);
    sink.focus();
    sink.remove();
  };
});
afterEach(async () => { Element.prototype.setAttribute = setAttribute; await unmountPage(); });

const selfId = "11111111-1111-4111-8111-111111111111", targetId = "22222222-2222-4222-8222-222222222222", otherId = "33333333-3333-4333-8333-333333333333";
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const enrollment = { user_id: selfId, readiness: { account_active: true, email_verified: true, totp_active: true, security_hold: false, verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true } };
let caps: string[];
let revision: number;
let answer: () => Response;
let teamDown: boolean;
const row = (staff_id: string, pseudonym: string, grant_revision: number) => ({ staff_id, pseudonym, status: "ACTIVE", capabilities: ["TEAM_GRANT"], grant_revision, credential_count: 2, last_privilege_at: null, delivery_state: "PENDING" });
function staffClient() {
  return createStaffApiClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/enrollment")) return Response.json(enrollment);
    if (path.endsWith("/options")) return Response.json(options);
    if (path.endsWith("/elevation/verify")) return Response.json({ staff_id: selfId, capabilities: caps, grant_revision: 0, expires_at: "2099-01-01T00:00:00.000Z" });
    if (path.includes("/audit?")) return Response.json({ events: [], next_cursor: null, order: "RECORDED_AT_ID_ASC" });
    if (path.includes("/team?") && teamDown) return Response.json({ error: "STAFF_DEPENDENCY_UNAVAILABLE" }, { status: 503 });
    if (path.includes("/team?")) return Response.json({ members: [row(otherId, "other_fixture", 4), row(targetId, "member_fixture", revision)], next_cursor: null, order: "CREATED_AT_ID_ASC" });
    if (path.endsWith("/verify")) return Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" });
    if (path.endsWith("/team/invitations")) return Response.json({ receipt: { operation_id: targetId, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" }, invitation_id: targetId, expires_at: "2099-01-01T00:00:00.000Z" });
    return answer();
  }) as typeof fetch });
}
beforeEach(() => {
  caps = ["TEAM_READ", "TEAM_GRANT", "TEAM_INVITE"];
  revision = 1;
  teamDown = false;
  answer = () => Response.json({ operation_id: targetId, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" });
  history.replaceState(null, "", "/admin/team");
});

const members = () => [...document.querySelectorAll<HTMLElement>("[data-staff-member]")];
const target = () => members()[1]!;
const topLine = () => document.querySelector<HTMLElement>(".staffAccess > [role=status]");
async function unlocked() {
  await mountPage(<StaffAccessPanel client={staffClient()} />);
  await press(button(S["staff.elevate"]!));
  expect(members().length).toBe(2);
}
async function grantOnTarget() {
  await press(button(S["staff.action.grant"]!, target()));
  const form = target().querySelector<HTMLFormElement>("[data-staff-mutation=grant]")!;
  form.querySelector<HTMLInputElement>("[name=confirmed]")!.checked = true;
  submitByKeyboard(form.querySelector<HTMLInputElement>("[name=ticket_ref]")!);
  await guardWait();
}

describe("the outcome shows inside the member's article that was acted on", () => {
  it("Change recorded: the line is in that member (not the other one, not the top), where focus is parked", async () => {
    await unlocked();
    await grantOnTarget();
    const line = target().querySelector<HTMLElement>("[role=status]");
    expect(line?.textContent).toBe(S["staff.complete"]);
    expect(line?.className).toBe("staffNotice");
    expect(members()[0]!.querySelector("[role=status]")).toBeNull();
    expect(topLine()).toBeNull();
    expectParkedOn(target());
  });

  it("failed (refused, same revision): the line is in that member, next to its open form", async () => {
    answer = () => Response.json({ error: "STAFF_ACTION_REFUSED" }, { status: 409 });
    await unlocked();
    await grantOnTarget();
    const line = target().querySelector<HTMLElement>("[role=status]");
    expect(line?.textContent).toBe(S["staff.failed"]);
    expect(line?.className).toBe("setError");
    expect(topLine()).toBeNull();
    expect(target().contains(document.activeElement)).toBe(true);
  });

  it("stale (the member changed meanwhile): the line is in that member", async () => {
    answer = () => { revision = 2; return Response.json({ error: "STAFF_REVISION_CONFLICT" }, { status: 409 }); };
    await unlocked();
    await grantOnTarget();
    expect(target().querySelector("[role=status]")?.textContent).toBe(S["staff.stale"]);
    expect(topLine()).toBeNull();
    expect(target().contains(document.activeElement)).toBe(true);
  });

  it("an invite's outcome shows in the members card, by the invite form", async () => {
    await unlocked();
    await press(button(S["staff.action.invite"]!));
    const form = document.querySelector<HTMLFormElement>("[data-staff-mutation=invite]")!;
    const card = form.closest<HTMLElement>("section.setCard")!;
    form.querySelector<HTMLInputElement>("[name=target_id]")!.value = otherId;
    form.querySelector<HTMLInputElement>("[name=confirmed]")!.checked = true;
    submitByKeyboard(form.querySelector<HTMLInputElement>("[name=ticket_ref]")!);
    await guardWait();
    const line = card.querySelector<HTMLElement>(":scope > [role=status]");
    expect(line?.textContent).toBe(S["staff.complete"]);
    expect(topLine()).toBeNull();
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it("a later outcome of something else (a failed Refresh team) shows at the top again, not in the member", async () => {
    await unlocked();
    await grantOnTarget();
    expect(target().querySelector("[role=status]")).not.toBeNull();
    teamDown = true;
    await press(button(S["staff.refresh"]!));
    expect(document.querySelector("[data-staff-member] [role=status]")).toBeNull();
    expect(topLine()).not.toBeNull();
    expect(topLine()!.textContent).not.toBe(S["staff.complete"]);
  });
});

describe("when the place acted on is gone", () => {
  it("access denied: the line shows at the top and takes focus, since nothing real holds it", async () => {
    answer = () => Response.json({ error: "STAFF_AUTHORITY_INVALID" }, { status: 401 });
    await unlocked();
    await grantOnTarget();
    expect(members()).toEqual([]);
    expect(topLine()?.textContent).toBe(S["staff.denied"]);
    expectFocusOn(topLine());
    expect(topLine()!.getAttribute("tabindex")).toBe("-1");
  });
});

it("adds no text: the strings are the panel's own", async () => {
  await unlocked();
  await grantOnTarget();
  expect(Object.values(S)).toContain(target().querySelector("[role=status]")!.textContent);
  await act(async () => undefined);
});
