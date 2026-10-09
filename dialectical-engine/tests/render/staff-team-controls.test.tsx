// @vitest-environment jsdom
import { act, useEffect } from "react";
import staffRomanian from "../../apps/ui/messages/ro/staff.json";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { StaffInvitationPanel } from "../../apps/ui/components/StaffInvitationPanel.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
const selfId = "11111111-1111-4111-8111-111111111111", targetId = "22222222-2222-4222-8222-222222222222";
const handle = "a".repeat(43), expires = "2099-01-01T00:00:00.000Z";
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const enrollment = { user_id: selfId, readiness: { account_active: true, email_verified: true, totp_active: true, security_hold: false, verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true } };
let root: Root, host: HTMLDivElement;
let calls: Array<{
    path: string;
    body: Record<string, unknown> | null;
    hash: string;
}>;
let caps: string[], revision: number, denied: boolean, failMutation: boolean, ordinaryDenied: boolean;
let failSecondPossession: boolean, denialCode: string, toolsLocked: boolean;
let client: ReturnType<typeof createStaffApiClient>;
const paths = () => calls.map(c => c.path);
const content = () => host.textContent ?? "";
async function mount(invitation = false) { await act(async () => root.render(invitation ? <StaffInvitationPanel client={client}/> : <StaffAccessPanel client={client}/>)); }
async function click(label: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label); expect(button, label).toBeDefined(); await act(async () => button!.click()); }
async function submit(selector: string, fields: Record<string, string>) {
    const form = host.querySelector<HTMLFormElement>(selector);
    expect(form).not.toBeNull();
    for (const [name, value] of Object.entries(fields))
        form!.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
    for (const checkbox of form!.querySelectorAll<HTMLInputElement>('input[type="checkbox"][required]'))
        checkbox.checked = true;
    await act(async () => form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    history.replaceState(null, "", "/admin/team");
    calls = [];
    caps = ["TEAM_READ"];
    revision = 1;
    denied = false;
    failMutation = false;
    ordinaryDenied = false;
    failSecondPossession = false;
    denialCode = "STAFF_REQUEST_REFUSED";
    toolsLocked = false;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = createStaffApiClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input, init) => {
            const path = String(input), body = init?.body === undefined ? null : JSON.parse(String(init.body));
            calls.push({ path, body, hash: location.hash });
            if (ordinaryDenied)
                return Response.json({ error: "SESSION_REQUIRED" }, { status: 401 });
            if (path.endsWith("/enrollment"))
                return Response.json(enrollment);
            if (denied)
                return Response.json({ error: denialCode }, { status: 403 });
            if (path.endsWith("/options"))
                return Response.json(path.includes("/invitations/") ? { ...options, invitation_revision: 7 } : options);
            if (path.endsWith("/elevation/verify"))
                return Response.json({ staff_id: selfId, capabilities: caps, grant_revision: 0, expires_at: expires });
            if (path.includes("/team?"))
                return Response.json({ members: [{ staff_id: targetId, pseudonym: "member_fixture", status: "ACTIVE", capabilities: ["TEAM_GRANT"], grant_revision: revision, credential_count: 2, last_privilege_at: null, delivery_state: "PENDING" }], next_cursor: null, order: "CREATED_AT_ID_ASC" });
            if (path.endsWith("/grants") && failMutation) {
                revision = 2;
                return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: 403 });
            }
            if (path.endsWith("/prerequisites/step-up"))
                return Response.json({ prerequisite_handle: handle, expires_at: expires });
            if (path.endsWith("/owner-possession/verify")) {
                if (body?.credential_id === "aQ" && failSecondPossession)
                    return Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: 403 });
                return Response.json(body?.credential_id === "aA"
                    ? { receipt_id: "33333333-3333-4333-8333-333333333333", expires_at: "2099-02-01T00:00:00.000Z" }
                    : { receipt_id: "44444444-4444-4444-8444-444444444444", expires_at: "2099-03-01T00:00:00.000Z" });
            }
            if (path.endsWith("/team/invitations") && toolsLocked)
                return Response.json({ error: "STAFF_ALERT_UNAVAILABLE" }, { status: 503 });
            if (path.endsWith("/team/invitations"))
                return Response.json({ receipt: { operation_id: body.operation_id, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" }, invitation_id: targetId, expires_at: expires });
            if (path.endsWith("/verify"))
                return Response.json({ proof_handle: handle, expires_at: expires });
            return Response.json({ operation_id: targetId, outcome: "COMPLETED", recorded_at: "2026-10-03T00:00:00.000Z" });
        }) as typeof fetch });
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
describe("honest private team controls", () => {
    it("ordinary users see readiness but no operational controls or guessed role", async () => {
        await mount();
        expect(content()).toContain("Verified security keys: 2");
        expect(content()).not.toContain("Invite team member");
        expect(content()).not.toContain("Owner role");
        expect(paths()).toEqual(["/api/v1/admin/enrollment"]);
    });
    it("uses verified self capabilities, never another row's grants", async () => {
        await mount();
        await click("Verify security key for team access");
        expect(content()).toContain("member_fixture");
        expect(content()).toContain("PENDING");
        expect(host.querySelector('[data-staff-mutation]')).toBeNull();
        expect(content()).not.toContain("Invite team member");
        expect(content()).not.toContain("OWNER");
    });
    it("refreshes a refused stale revision without retrying mutation or proof", async () => {
        caps = ["TEAM_READ", "TEAM_GRANT"];
        failMutation = true;
        await mount();
        await click("Verify security key for team access");
        await submit('[data-staff-mutation="grant"]', { ticket_ref: "TEST-8" });
        expect(paths().filter(p => p.endsWith("/grants"))).toHaveLength(1);
        expect(paths().filter(p => p.endsWith("/action/options"))).toHaveLength(1);
        expect(paths().filter(p => p.includes("/team?"))).toHaveLength(2);
        expect(content()).toContain("Revision changed");
        expect(content()).toContain("Revision: 2");
    });
    it("clears privileged rows and controls when authority is denied", async () => {
        caps = ["TEAM_READ", "TEAM_GRANT"];
        await mount();
        await click("Verify security key for team access");
        denied = true;
        await click("Refresh team");
        expect(content()).not.toContain("member_fixture");
        expect(host.querySelector('[data-staff-mutation]')).toBeNull();
        expect(content()).toContain("Verify security key for team access");
    });
    it("unsupported WebAuthn grants no TOTP bypass and sends no verification", async () => {
        client = createStaffApiClient({ fetchImplementation: (async (input) => Response.json(String(input).endsWith("enrollment") ? enrollment : options)) as typeof fetch });
        await mount();
        await click("Verify security key for team access");
        expect(content()).toContain("Security key verification unavailable");
        expect(host.querySelector('[data-staff-mutation]')).toBeNull();
    });
    it("only scopes candidate possession to ordinary-auth prerequisite and the two selected credentials", async () => {
        await mount();
        await submit('[data-owner-possession]', { command_id: targetId, command_nonce: handle, credential_one: "aA", credential_two: "aQ", password: "synthetic", totp_code: "123456" });
        expect(paths()).toEqual(["/api/v1/admin/enrollment", "/api/v1/admin/prerequisites/step-up", "/api/v1/admin/owner-possession/options", "/api/v1/admin/owner-possession/verify", "/api/v1/admin/owner-possession/options", "/api/v1/admin/owner-possession/verify"]);
        expect(content()).toContain("Possession receipts recorded");
        expect(content()).not.toContain("Invite team member");
        expect(host.querySelector<HTMLInputElement>('[name="command_nonce"]')!.value).toBe("");
    });
});
describe("exact invitation fragment consumer", () => {
    it("clears fragment before ordinary calls; keeps bearer out of DOM/storage and accepts without staff elevation", async () => {
        history.replaceState(null, "", `/admin/invitation#${handle}`);
        const storage = vi.spyOn(Storage.prototype, "setItem");
        await mount(true);
        expect(location.hash).toBe("");
        expect(calls.every(c => c.hash === "")).toBe(true);
        expect(host.querySelector('[name="expected_revision"]')).toBeNull();
        expect(host.innerHTML).not.toContain(handle);
        expect(storage).not.toHaveBeenCalled();
        await submit('[data-invitation-accept]', {});
        expect(paths()).toEqual(["/api/v1/admin/enrollment", "/api/v1/admin/team/invitations/accept/options", "/api/v1/admin/team/invitations/accept/verify", "/api/v1/admin/team/invitations/accept"]);
        expect(content()).toContain("Invitation accepted");
        expect(content()).toContain("Verify your security key separately");
        expect(host.innerHTML).not.toContain(handle);
        storage.mockRestore();
    });
    it("does not call scoped acceptance without a valid fragment", async () => {
        await mount(true);
        expect(paths()).toEqual([]);
        expect(content()).toContain("Reopen the original invitation link");
    });
    it("refused pending/disabled acceptance remains unaccepted", async () => {
        history.replaceState(null, "", `/admin/invitation#${handle}`);
        await mount(true);
        denied = true;
        await submit('[data-invitation-accept]', {});
        expect(content()).toContain("Invitation has not been accepted");
        expect(content()).not.toContain("Invitation accepted.");
        expect(paths().filter(p => p.endsWith("/accept"))).toHaveLength(0);
    });
    it("logged-out recipient must sign in and reopen email, without persisting bearer", async () => {
        ordinaryDenied = true;
        history.replaceState(null, "", `/admin/invitation#${handle}`);
        await mount(true);
        expect(location.hash).toBe("");
        expect(content()).toContain("Sign in, then reopen the original invitation link");
        expect(host.innerHTML).not.toContain(handle);
        expect(paths()).toEqual(["/api/v1/admin/enrollment"]);
    });
});
it("candidate prerequisite rotation clears existing verified staff display", async () => {
    caps = ["TEAM_READ", "TEAM_GRANT"];
    await mount();
    await click("Verify security key for team access");
    await submit('[data-owner-possession]', { command_id: targetId, command_nonce: handle, credential_one: "aA", credential_two: "aQ", password: "synthetic", totp_code: "123456" });
    expect(content()).not.toContain("member_fixture");
    expect(host.querySelector('[data-staff-mutation]')).toBeNull();
    expect(content()).toContain("Possession receipts recorded");
});
it("session termination clears rows and suppresses a late elevation response", async () => {
    let finish!: (value: Response) => void;
    const delayed = createStaffApiClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input) => {
            const path = String(input);
            return path.endsWith("enrollment") ? Response.json(enrollment) : path.endsWith("options") ? Response.json(options)
                : new Promise<Response>(resolve => { finish = resolve; });
        }) as typeof fetch });
    client = delayed;
    await mount();
    const button = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === "Verify security key for team access")!;
    await act(async () => { button.click(); });
    await act(async () => window.dispatchEvent(new Event("debateai:staff-session-ended")));
    await act(async () => finish(Response.json({ staff_id: selfId, capabilities: ["TEAM_READ", "TEAM_INVITE"], grant_revision: 0, expires_at: expires })));
    expect(content()).not.toContain("Verified staff:");
    expect(content()).not.toContain("Invite team member");
});
it("cancelled native verification exposes no TOTP elevation bypass or verify call", async () => {
    const requested: string[] = [];
    client = createStaffApiClient({ browser: { authenticate: async () => { throw Error("STAFF_WEBAUTHN_CANCELLED"); }, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input) => { requested.push(String(input)); return Response.json(String(input).endsWith("enrollment") ? enrollment : options); }) as typeof fetch });
    await mount();
    await click("Verify security key for team access");
    expect(content()).toContain("Security key verification unavailable");
    expect(host.querySelector('[data-staff-mutation]')).toBeNull();
    expect(requested).toEqual(["/api/v1/admin/enrollment", "/api/v1/admin/webauthn/elevation/options"]);
});
it("a success-shaped role claim cannot render privileged controls", async () => {
    client = createStaffApiClient({ browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() { } }, fetchImplementation: (async (input) => Response.json(String(input).endsWith("enrollment") ? enrollment : String(input).endsWith("options") ? options : { staff_id: selfId, capabilities: ["TEAM_INVITE"], grant_revision: 0, expires_at: expires, role: "OWNER" })) as typeof fetch });
    await mount();
    await click("Verify security key for team access");
    expect(content()).not.toContain("Verified staff:");
    expect(content()).not.toContain("Invite team member");
    expect(host.querySelector('[data-staff-mutation]')).toBeNull();
});
it.each([
    ["en", "Your account ID: 11111111-1111-4111-8111-111111111111"],
    ["ro", "ID-ul contului tău: 11111111-1111-4111-8111-111111111111"]
] as const)("shows only the returned own account ID in %s readiness", async (locale, expected) => {
    await act(async () => root.render(locale === "ro" ? <StaffAccessPanel client={client} locale="ro" catalog={staffRomanian}/> : <StaffAccessPanel client={client}/>));
    expect(content()).toContain(expected);
    expect(content()).not.toContain(targetId);
    expect(paths()).toEqual(["/api/v1/admin/enrollment"]);
});
it("hands both distinct returned possession receipt IDs and expiries to the candidate", async () => {
    await mount();
    await submit('[data-owner-possession]', { command_id: targetId, command_nonce: handle, credential_one: "aA", credential_two: "aQ", password: "synthetic", totp_code: "123456" });
    const receipts = host.querySelector('[data-owner-receipts]');
    expect(receipts).not.toBeNull();
    expect(receipts!.textContent).toContain("33333333-3333-4333-8333-333333333333");
    expect(receipts!.textContent).toContain("44444444-4444-4444-8444-444444444444");
    expect(receipts!.textContent).toContain("2099-02-01T00:00:00.000Z");
    expect(receipts!.textContent).toContain("2099-03-01T00:00:00.000Z");
    expect(receipts!.textContent).not.toContain(handle);
    expect(paths().filter(path => path.endsWith("/owner-possession/verify"))).toHaveLength(2);
});
it("retains the first completed receipt if the second possession fails", async () => {
    failSecondPossession = true;
    await mount();
    await submit('[data-owner-possession]', { command_id: targetId, command_nonce: handle, credential_one: "aA", credential_two: "aQ", password: "synthetic", totp_code: "123456" });
    const receipts = host.querySelector('[data-owner-receipts]');
    expect(receipts).not.toBeNull();
    expect(receipts!.textContent).toContain("33333333-3333-4333-8333-333333333333");
    expect(receipts!.textContent).toContain("2099-02-01T00:00:00.000Z");
    expect(receipts!.textContent).not.toContain("44444444-4444-4444-8444-444444444444");
    expect(content()).not.toContain("Possession receipts recorded.");
    expect(content()).toContain("The operation was refused");
});
it("issues a new invitation at the sealed zero revision without a revision input", async () => {
    caps = ["TEAM_INVITE"];
    await mount();
    await click("Verify security key for team access");
    expect(host.querySelector('[data-staff-mutation="invite"] [name="expected_revision"]')).toBeNull();
    await submit('[data-staff-mutation="invite"]', { target_id: targetId, ticket_ref: "TASK8-REVIEW" });
    const actionCalls = calls.filter(call => call.path.includes("/webauthn/action/"));
    expect(actionCalls).toHaveLength(2);
    for (const call of actionCalls)
        expect(call.body).toMatchObject({ intent: { action: "TEAM_INVITE", expected_revision: 0, target_user_id: targetId } });
    expect(calls.find(call => call.path.endsWith("/team/invitations"))?.body).toMatchObject({ expected_revision: 0, target_user_id: targetId });
});
it("forbidden emergency-only authority is cleared without inventing a successful refresh", async () => {
    caps = ["EMERGENCY_DISABLE"];
    await mount();
    await click("Verify security key for team access");
    denied = true;
    await submit('[data-staff-mutation="compromise"]', { target_id: targetId, expected_revision: "4" });
    expect(host.querySelector('[data-staff-mutation]')).toBeNull();
    expect(content()).not.toContain("Verified staff:");
    expect(content()).toContain("Team authority is unavailable");
    expect(paths().some(path => path.includes("/team?") || path.includes("/audit?"))).toBe(false);
});
it("explicit STAFF_AUTHORITY_INVALID clears even read-capable authority without a reread", async () => {
    caps = ["TEAM_READ", "TEAM_GRANT"];
    await mount();
    await click("Verify security key for team access");
    denied = true;
    denialCode = "STAFF_AUTHORITY_INVALID";
    await submit('[data-staff-mutation="grant"]', { ticket_ref: "TASK8-REVIEW" });
    expect(host.querySelector('[data-staff-mutation]')).toBeNull();
    expect(content()).not.toContain("member_fixture");
    expect(paths().filter(path => path.includes("/team?"))).toHaveLength(1);
});
it("removes invitation fragment before an earlier sibling's passive auth work", async () => {
    history.replaceState(null, "", `/admin/invitation#${handle}`);
    let observed: string | null = null;
    function EarlierAuthWork() { useEffect(() => { observed = location.hash; }, []); return null; }
    await act(async () => root.render(<><EarlierAuthWork /><StaffInvitationPanel client={client}/></>));
    expect(observed).toBe("");
    expect(calls.every(call => call.hash === "")).toBe(true);
    expect(host.innerHTML).not.toContain(handle);
});


it('records one selected Owner key without requiring or requesting an optional second key', async () => {
 await mount();
 const second=host.querySelector<HTMLInputElement>('[name="credential_two"]')!;
 expect(second.required).toBe(false);
 await submit('[data-owner-possession]', { command_id: targetId, command_nonce: handle, credential_one: "aA", password: "synthetic", totp_code: "123456" });
 expect(calls.filter(call=>call.path.endsWith('/owner-possession/verify'))).toHaveLength(1);
 expect(host.querySelector('[data-owner-receipts]')?.textContent).toContain('33333333-3333-4333-8333-333333333333');
});
it.each([
    ["en", "Verify security key for team access", "Team tools are locked. They unlock for one hour when the operator turns them on."],
    ["ro", "Verifică cheia de securitate pentru accesul echipei", "Instrumentele echipei sunt blocate. Se deblochează pentru o oră atunci când operatorul le activează."]
] as const)("shows the %s locked Team tools state when alert readiness is not fresh", async (locale, elevate, expected) => {
    caps = ["TEAM_INVITE"];
    toolsLocked = true;
    await act(async () => root.render(locale === "ro" ? <StaffAccessPanel client={client} locale="ro" catalog={staffRomanian}/> : <StaffAccessPanel client={client}/>));
    await click(elevate);
    await submit('[data-staff-mutation="invite"]', { target_id: targetId });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(expected);
    expect(paths().filter(path => path.endsWith("/team/invitations"))).toHaveLength(1);
    expect(host.querySelector('[data-staff-mutation="invite"]')).not.toBeNull();
});
