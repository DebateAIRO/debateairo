import * as contract from "@debateai/contract";
import type { z } from "zod";
import { API_BASE, createSameOriginFetch, readBrowserCsrfCookie } from "./api.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";

type Output<S extends z.ZodType> = z.infer<S>;
export type ThreatReportsClient = ReturnType<typeof createThreatReportsClient>;

/** Threat report reads are always private; decision proofs stay in this ceremony. */
export function createThreatReportsClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
  fetchImplementation?: typeof fetch;
  apiBase?: string;
  browser?: StaffBrowser;
} = {}) {
  const transport = createSameOriginFetch(apiBase, fetchImplementation);
  const staff = createStaffApiClient({ fetchImplementation, apiBase, browser });
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  let generation = 0;
  const cancel = () => { generation++; staff.cancel(); };

  async function request<S extends z.ZodType>(path: string, schema: S, method = "GET", body?: unknown): Promise<Output<S>> {
    const epoch = generation;
    const headers = new Headers();
    if (method !== "GET") {
      headers.set("content-type", "application/json");
      const csrf = readBrowserCsrfCookie("__Host-debateai-csrf");
      const staffCsrf = readBrowserCsrfCookie("__Host-debateai-staff-csrf");
      if (csrf !== null) headers.set("x-csrf-token", csrf);
      if (staffCsrf !== null) headers.set("x-staff-csrf-token", staffCsrf);
    }
    let response: Response;
    try {
      response = await transport(new URL(`/v1/admin/threat-reports${path}`, origin), {
        method, headers, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new contract.ContractHttpError("NETWORK_FAILURE", 0, "STAFF_NETWORK_FAILURE");
    }
    if (generation !== epoch) throw new Error("STAFF_WEBAUTHN_CANCELLED");
    if (!response.ok) {
      const value: unknown = await response.json().catch(() => null);
      const serverCode = value !== null && typeof value === "object" && "error" in value
        && typeof value.error === "string" && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value.error) ? value.error : null;
      const code = response.status === 401 ? "SESSION_REQUIRED" : response.status === 403 ? "FORBIDDEN"
        : response.status === 400 ? "MALFORMED_REQUEST" : response.status === 422 ? "UNPROCESSABLE"
          : response.status === 429 ? "RATE_LIMITED" : "SERVER_FAILURE";
      throw new contract.ContractHttpError(code, response.status, "STAFF_REQUEST_FAILED", serverCode);
    }
    if (response.status !== 200) throw new contract.ContractHttpError("INVALID_RESPONSE", response.status, "STAFF_RESPONSE_INVALID");
    try {
      const value = schema.parse(await response.json()) as Output<S>;
      if (generation !== epoch) throw new Error("STAFF_WEBAUTHN_CANCELLED");
      return value;
    } catch (error) {
      if (error instanceof Error && error.message === "STAFF_WEBAUTHN_CANCELLED") throw error;
      throw new contract.ContractHttpError("INVALID_RESPONSE", response.status, "STAFF_RESPONSE_INVALID");
    }
  }

  return Object.freeze({
    cancel,
    summary: () => request("/summary", contract.ThreatReportSummarySchema),
    list: () => request("", contract.ThreatReportListSchema),
    read: (ref: string) => request(`/${encodeURIComponent(ref)}`, contract.ThreatReportSchema),
    async decide(ref: string, decision: "REPORTED" | "NOT_REPORTED") {
      const operation_id = crypto.randomUUID();
      const expected_revision = 0;
      const proof = await staff.proveAction({ action: "THREAT_REPORT_DECIDE", target_report_ref: ref, decision, expected_revision, operation_id });
      const body = contract.ThreatReportDecisionRequestSchema.parse({ decision, expected_revision, operation_id, proof: proof.proof_handle });
      return request(`/${encodeURIComponent(ref)}/decision`, contract.ThreatReportSchema.pick({ report_ref: true, decision: true }), "POST", body);
    }
  });
}
