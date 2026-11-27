import * as contract from "@debateai/contract";
import { API_BASE, createSameOriginFetch } from "./api.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";
import { privateAdminRequester } from "./teamLimitApi.js";

export type PreviewBuyersClient = ReturnType<typeof createPreviewBuyersClient>;
export type PreviewBuyer = contract.PreviewBuyersPage["buyers"][number];

/**
 * The Owner's list of accounts that may buy while the whole site is open with buying kept to listed accounts, with test
 * payments or real ones (the Team page). The typed address goes only in request bodies: the look-up that answers its
 * shortened form before any key is touched, the key ceremony's intent and the addition itself. It never goes into a URL
 * or browser storage, and proof handles stay in the ceremony that made them.
 */
export function createPreviewBuyersClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
  fetchImplementation?: typeof fetch;
  apiBase?: string;
  browser?: StaffBrowser;
} = {}) {
  const transport = createSameOriginFetch(apiBase, fetchImplementation);
  const staff = createStaffApiClient({ fetchImplementation, apiBase, browser });
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  let generation = 0;
  const request = privateAdminRequester("/v1/admin/preview-buyers", transport, origin, () => generation);
  return Object.freeze({
    cancel() { generation++; staff.cancel(); },
    read: () => request("", contract.PreviewBuyersPageSchema),
    /** The account an address names, as its shortened address, or the refusal by name; nothing is changed. */
    find: (address: string) => request("/find", contract.PreviewBuyerFindResponseSchema, "POST", contract.PreviewBuyerFindRequestSchema.parse({ address })),
    async add(address: string, expectedRevision: number) {
      const fields = { address, expected_revision: expectedRevision, operation_id: crypto.randomUUID() };
      const proof = await staff.proveAction({ action: "PREVIEW_BUYER_ADD", ...fields });
      return request("", contract.SecurityReceiptSchema, "POST", contract.PreviewBuyerAddRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    },
    async remove(ref: string, expectedRevision: number) {
      const fields = { expected_revision: expectedRevision, operation_id: crypto.randomUUID() };
      const proof = await staff.proveAction({ action: "PREVIEW_BUYER_REMOVE", buyer_ref: ref, ...fields });
      return request(`/${encodeURIComponent(ref)}`, contract.SecurityReceiptSchema, "DELETE", contract.PreviewBuyerRemoveRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    }
  });
}
