import * as contract from "@debateai/contract";
import { API_BASE, createSameOriginFetch } from "./api.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";
import { privateAdminRequester } from "./teamLimitApi.js";

export type RecoveryPermitsClient = ReturnType<typeof createRecoveryPermitsClient>;
export type RecoveryPermitRequest = contract.RecoveryPermitsPage["requests"][number];

/**
 * The Owner's list of requests to get back into an account (the Team page). A decision names the request by its ref and
 * the revision the page showed; the key ceremony binds both, and the proof handle stays in the ceremony that made it.
 * Nothing the person typed reaches this page: only facts the server knows, with the address already shortened.
 */
export function createRecoveryPermitsClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
  fetchImplementation?: typeof fetch;
  apiBase?: string;
  browser?: StaffBrowser;
} = {}) {
  const transport = createSameOriginFetch(apiBase, fetchImplementation);
  const staff = createStaffApiClient({ fetchImplementation, apiBase, browser });
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  let generation = 0;
  const request = privateAdminRequester("/v1/admin/recovery-permits", transport, origin, () => generation);
  /** One decision: the key is touched for this request at this revision, then the decision goes with the proof handle. */
  async function decide(decision: "approve" | "refuse", ref: string, expectedRevision: number) {
    const fields = { expected_revision: expectedRevision, operation_id: crypto.randomUUID() };
    const proof = await staff.proveAction({ action: decision === "approve" ? "RECOVERY_PERMIT_APPROVE" : "RECOVERY_PERMIT_REFUSE", request_ref: ref, ...fields });
    return request(`/${encodeURIComponent(ref)}/${decision}`, contract.SecurityReceiptSchema, "POST",
      contract.RecoveryPermitDecideRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
  }
  return Object.freeze({
    cancel() { generation++; staff.cancel(); },
    read: () => request("", contract.RecoveryPermitsPageSchema),
    approve: (ref: string, expectedRevision: number) => decide("approve", ref, expectedRevision),
    /** Refuses a request that waits for a decision, or stops one already approved: the server takes both. */
    refuse: (ref: string, expectedRevision: number) => decide("refuse", ref, expectedRevision)
  });
}
