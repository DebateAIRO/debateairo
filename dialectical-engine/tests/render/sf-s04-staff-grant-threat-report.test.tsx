// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";

const self = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const handle = "a".repeat(43);
const credential = { id: "aA", rawId: "aA", type: "public-key" as const, response: { clientDataJSON: "aA", authenticatorData: "aA", signature: "aA", userHandle: null }, clientExtensionResults: {} };
const options = { challenge_handle: handle, options: { challenge: handle, rpId: "app.test", timeout: 300000, userVerification: "required", allowCredentials: [{ id: "aA", type: "public-key" }] } };
const calls: { path: string; body: Record<string, unknown> | null }[] = [];
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  calls.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });

function client() {
  return createStaffApiClient({
    browser: { authenticate: async () => credential, register: async () => { throw Error("unused"); }, cancel() {} },
    fetchImplementation: (async (input, init) => {
      const path = String(input);
      const body = init?.body === undefined ? null : JSON.parse(String(init.body));
      calls.push({ path, body });
      if (path.endsWith("/enrollment")) return Response.json({ user_id: self, readiness: { account_active: true, email_verified: true, totp_active: true, security_hold: false, verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true } });
      if (path.endsWith("/options")) return Response.json(options);
      if (path.endsWith("/elevation/verify")) return Response.json({ staff_id: self, capabilities: ["TEAM_READ", "TEAM_GRANT", "AUDIT_READ"], grant_revision: 0, expires_at: "2099-01-01T00:00:00.000Z" });
      if (path.includes("/team?")) return Response.json({ members: [{ staff_id: target, pseudonym: "member_fixture", status: "ACTIVE", capabilities: ["TEAM_READ"], grant_revision: 0, credential_count: 1, last_privilege_at: null, delivery_state: "DELIVERED" }], next_cursor: null, order: "CREATED_AT_ID_ASC" });
      if (path.includes("/audit?")) return Response.json({ events: [{ event_id: "33333333-3333-4333-8333-333333333333", actor_staff_id: self, event: "THREAT_REPORT_READ", threat_report_ref: target, recorded_at: "2026-10-20T12:00:00.000Z" }], next_cursor: null, order: "RECORDED_AT_ID_ASC" });
      if (path.endsWith("/action/verify")) return Response.json({ proof_handle: handle, expires_at: "2099-01-01T00:00:00.000Z" });
      return Response.json({ operation_id: target, outcome: "COMPLETED", recorded_at: "2026-10-20T12:00:00.000Z" });
    }) as typeof fetch
  });
}
async function openTeam() {
  await act(async () => root.render(<StaffAccessPanel client={client()}/>));
  const verify = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Verify security key for team access"));
  await act(async () => verify!.click());
}

describe("S04 threat report staff grant", () => {
  it("offers a labelled THREAT_REPORT checkbox and sends it in a grant", async () => {
    await openTeam();
    const edit = [...host.querySelectorAll("button")].find(button => button.textContent === "Edit permissions");
    await act(async () => edit!.click());
    const checkbox = host.querySelector<HTMLInputElement>('input[name="capabilities"][value="THREAT_REPORT"]');
    expect(checkbox?.parentElement?.textContent).toBe("Read threat reports");
    checkbox!.checked = true;
    host.querySelector<HTMLInputElement>('[data-staff-mutation="grant"] input[name="confirmed"]')!.checked = true;
    const form = host.querySelector<HTMLFormElement>('[data-staff-mutation="grant"]')!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(calls.find(call => call.path.endsWith("/grants"))?.body?.capabilities).toContain("THREAT_REPORT");
  });
  it("labels a threat-report read audit row without a delivery state", async () => {
    await openTeam();
    const row = [...host.querySelectorAll(".staffAuditList li")].find(item => item.textContent?.includes("Threat report read"));
    expect(row?.querySelector("strong")?.textContent).toBe("Threat report read");
    expect(row?.querySelector(".staffDelivery")).toBeNull();
  });
});
