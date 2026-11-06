import * as contract from "@debateai/contract";
import { API_BASE, createSameOriginFetch } from "./api.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";
import { privateAdminRequester } from "./teamLimitApi.js";

/** 0157: what a statement of reasons needs from a step (DSA Art 17(3)). A hide may carry a suspected rule and a source; facts only go with the other steps. */
export type PublicReviewGround = Readonly<{ grounds: readonly contract.ModerationGround[]; source: contract.ModerationSource | null; flagId: string | null; facts: string | null }>;
export const NO_GROUND: PublicReviewGround = Object.freeze({ grounds: [], source: null, flagId: null, facts: null });
export type PublicReviewStepInput = Readonly<{
  step: "REPUBLISH" | "REMOVE_DIG" | "PUT_BACK" | "CORRECT" | "HIDE_REPORT" | "DECIDE"; pieceKind?: "SNAPSHOT" | "UPDATE" | "REPORT" | "DIG"; pieceId?: string; pointer?: string; text?: string;
  ground?: PublicReviewGround;
}>;
const digestOf = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** A pasted public link or a bare reference: the debate's reference, or null. */
export function publicationRefOf(text: string): string | null {
  const found = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.exec(text.trim())?.[0]?.toLowerCase();
  return found ?? null;
}

/** Decision 33, the private team page's client: the two accounts only. Proof handles stay in the ceremony that made them. */
export function createPublicReviewClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
  fetchImplementation?: typeof fetch; apiBase?: string; browser?: StaffBrowser;
} = {}) {
  const transport = createSameOriginFetch(apiBase, fetchImplementation);
  const staff = createStaffApiClient({ fetchImplementation, apiBase, browser });
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  let generation = 0;
  const request = privateAdminRequester("/v1/admin/public-review", transport, origin, () => generation);
  const reports = privateAdminRequester("/v1/admin/public-reports", transport, origin, () => generation);
  return Object.freeze({
    cancel: () => { generation++; staff.cancel(); },
    list: () => request("", contract.PublicReviewListSchema),
    /** Decision 35: the Report button's queue. Each read is logged: reporters' names are on it. */
    readReports: () => reports("", contract.PublicFlagQueueSchema),
    async dismissReport(flagId: string) {
      const operation_id = crypto.randomUUID();
      const proof = await staff.proveAction({ action: "PUBLIC_REPORT_DISMISS", flag_id: flagId, operation_id });
      return reports(`/${encodeURIComponent(flagId)}/dismiss`, contract.SecurityReceiptSchema, "POST", contract.PublicFlagDismissRequestSchema.parse({ operation_id, proof_handle: proof.proof_handle }));
    },
    read: (publicationRef: string) => request(`/${encodeURIComponent(publicationRef)}`, contract.PublicReviewPageSchema),
    async hide(publicationRef: string, revision: number, ground: PublicReviewGround = NO_GROUND) {
      const fields = { expected_revision: revision, operation_id: crypto.randomUUID(), grounds: [...ground.grounds], source: ground.source, flag_id: ground.flagId };
      const proof = await staff.proveAction({ action: "PUBLIC_REVIEW_HIDE", publication_ref: publicationRef, ...fields });
      return request(`/${encodeURIComponent(publicationRef)}/hide`, contract.SecurityReceiptSchema, "POST", contract.PublicReviewHideRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    },
    async step(publicationRef: string, revision: number, input: PublicReviewStepInput) {
      const ground = input.ground ?? NO_GROUND;
      const fields = { step: input.step, piece_kind: input.pieceKind ?? null, piece_id: input.pieceId ?? null, pointer: input.pointer ?? null, expected_revision: revision, operation_id: crypto.randomUUID(),
        grounds: [...ground.grounds], source: ground.source, flag_id: ground.flagId };
      const proof = await staff.proveAction({ action: "PUBLIC_REVIEW_STEP", publication_ref: publicationRef, ...fields, text_sha256: input.text === undefined ? null : await digestOf(input.text),
        facts_sha256: ground.facts === null ? null : await digestOf(ground.facts) });
      return request(`/${encodeURIComponent(publicationRef)}/step`, contract.SecurityReceiptSchema, "POST", contract.PublicReviewStepRequestSchema.parse({ ...fields, text: input.text ?? null, facts: ground.facts,
        proof_handle: proof.proof_handle }));
    }
  });
}
export type PublicReviewClient = ReturnType<typeof createPublicReviewClient>;
