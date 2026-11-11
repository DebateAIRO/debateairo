import * as contract from "@debateai/contract";
import { API_BASE, createSameOriginFetch } from "./api.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";
import { privateAdminRequester } from "./teamLimitApi.js";

export type TeamAllowanceClient = ReturnType<typeof createTeamAllowanceClient>;
export type TeamAllowanceGift = Readonly<{ staffId: string; revision: number; amountMicros: number; dayMicros: number; weekMicros: number; days: number }>;
const FUNDING_REASON = Object.freeze({ code: "FUNDING_APPROVAL" as const });
const DAY_MS = 86_400_000;

/**
 * The Owner's allowance for a member (decision 32): the funded staff client proves it, this one sends it. The grant asks for an approval
 * reference; here the Owner's passkey is the approval, so the reference says that and the date, and the Owner writes nothing.
 */
export function createTeamAllowanceClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
  fetchImplementation?: typeof fetch;
  apiBase?: string;
  browser?: StaffBrowser;
} = {}) {
  const transport = createSameOriginFetch(apiBase, fetchImplementation);
  const staff = createStaffApiClient({ fetchImplementation, apiBase, browser, fundingPolicyVersion: 1 });
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  let generation = 0;
  const request = privateAdminRequester("/v1/admin/team-allowances", transport, origin, () => generation);
  return Object.freeze({
    cancel() { generation++; staff.cancel(); },
    read: () => request("", contract.TeamAllowancePageSchema),
    async give(gift: TeamAllowanceGift) {
      const now = new Date(), startsAt = now.toISOString(), expiresAt = new Date(now.getTime() + gift.days * DAY_MS).toISOString();
      const fields = { expected_revision: gift.revision, amount_micros: gift.amountMicros, day_micros: gift.dayMicros, week_micros: gift.weekMicros, starts_at: startsAt, expires_at: expiresAt,
        funding_approval_ref: `owner-approved-${startsAt.slice(0, 10)}`, operation_id: crypto.randomUUID(), reason: FUNDING_REASON };
      const proof = await staff.proveAction({ action: "TEAM_ALLOWANCE_CONFIGURE", target_staff_id: gift.staffId, ...fields });
      return request(`/${encodeURIComponent(gift.staffId)}`, contract.SecurityReceiptSchema, "POST", contract.TeamAllowanceConfigureRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    },
    async takeBack(staffId: string, grantId: string, revision: number) {
      const fields = { expected_revision: revision, operation_id: crypto.randomUUID(), reason: FUNDING_REASON };
      const proof = await staff.proveAction({ action: "TEAM_ALLOWANCE_REVOKE", target_staff_id: staffId, grant_id: grantId, ...fields });
      return request(`/${encodeURIComponent(staffId)}/${encodeURIComponent(grantId)}`, contract.SecurityReceiptSchema, "DELETE", contract.TeamAllowanceRevokeRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    }
  });
}
