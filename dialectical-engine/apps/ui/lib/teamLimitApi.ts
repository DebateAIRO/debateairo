import * as contract from "@debateai/contract";
import type { z } from "zod";
import { API_BASE, createSameOriginFetch, readBrowserCsrfCookie } from "./api.js";
import { formatNumber } from "./i18n/translate.js";
import { createStaffApiClient, type StaffBrowser } from "./staffApi.js";
import { createStaffWebAuthnBrowser } from "./staffWebAuthn.js";

type Output<S extends z.ZodType> = z.infer<S>;
type TeamLimitPage = contract.TeamLimitPage;
export type TeamMember = contract.StaffTeamPage["members"][number];
export type TeamLimitClient = ReturnType<typeof createTeamLimitClient>;

const MICROS_PER_DOLLAR = 1_000_000;
const TEAM_READ_PAGES = 50;
const PARTNER_REASON = Object.freeze({ code: "GRANT_CHANGE" as const });

/**
 * Dollars as a person writes them, to whole micros by digits, so 0.29 is exactly 290000. A comma is a decimal mark only before one or two
 * digits: "1,000" could be a thousand or one, so it is refused rather than guessed. Null: not an amount.
 */
export function dollarsToMicros(text: string): number | null {
  const match = /^\$?(\d{1,10})(?:\.(\d{1,6})|,(\d{1,2}))?$/u.exec(text.trim());
  if (match === null) return null;
  const micros = Number(match[1]) * MICROS_PER_DOLLAR + Number((match[2] ?? match[3] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(micros) ? micros : null;
}

/** What a person reads: dollars, two decimals, in their language's form. */
export function formatDollars(locale: string, micros: number): string {
  return formatNumber(locale, Math.round(micros / 10_000) / 100, { style: "currency", currency: "USD" });
}

export const isPracticeRef = (value: string): boolean => contract.TeamPracticeRequestSchema.shape.practice_ref.safeParse(value).success;

/** The private team panel's client. Proof handles stay in the ceremony that made them: never a URL, never browser storage. */
export function createTeamLimitClient({ fetchImplementation = fetch, apiBase = API_BASE, browser = createStaffWebAuthnBrowser() }: {
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
      response = await transport(new URL(`/v1/admin/team-limit${path}`, origin), {
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

  async function changePartner(action: "TEAM_LIMIT_PARTNER_GRANT" | "TEAM_LIMIT_PARTNER_REVOKE", staffId: string, grantRevision: number) {
    const fields = { expected_revision: grantRevision, operation_id: crypto.randomUUID(), reason: PARTNER_REASON };
    const proof = await staff.proveAction({ action, target_staff_id: staffId, ...fields });
    const body = contract.TeamLimitPartnerRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle });
    return request(`/partner/${encodeURIComponent(staffId)}`, contract.SecurityReceiptSchema, action === "TEAM_LIMIT_PARTNER_GRANT" ? "POST" : "DELETE", body);
  }

  return Object.freeze({
    cancel,
    read: () => request("", contract.TeamLimitPageSchema),
    /** The whole team, through the schema the server selected: a funded Owner's row fails the plain one. */
    async team(): Promise<readonly TeamMember[]> {
      const enrollment = await staff.enrollment();
      const reader = staff.withFundingPolicyVersion("funding_policy_version" in enrollment ? enrollment.funding_policy_version : undefined);
      const members: TeamMember[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < TEAM_READ_PAGES; page++) {
        const value = await reader.team({ limit: 100, ...(cursor === undefined ? {} : { cursor }) });
        members.push(...value.members);
        if (value.next_cursor === null) break;
        cursor = value.next_cursor;
      }
      return members;
    },
    async setLimit(amountMicros: number, page: Pick<TeamLimitPage, "amount_micros" | "revision">) {
      const fields = { amount_micros: amountMicros, current_micros: page.amount_micros ?? 0, expected_revision: page.revision, operation_id: crypto.randomUUID() };
      const proof = await staff.proveAction({ action: "TEAM_LIMIT_SET", ...fields });
      return request("", contract.SecurityReceiptSchema, "POST", contract.TeamLimitSetRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    },
    pickPartner: (staffId: string, grantRevision: number) => changePartner("TEAM_LIMIT_PARTNER_GRANT", staffId, grantRevision),
    takeBackPartner: (staffId: string, grantRevision: number) => changePartner("TEAM_LIMIT_PARTNER_REVOKE", staffId, grantRevision),
    async recordPractice(practiceRef: string, chargeMicros: number) {
      const fields = { practice_ref: practiceRef, charge_micros: chargeMicros, operation_id: crypto.randomUUID() };
      const proof = await staff.proveAction({ action: "TEAM_PRACTICE_RECORD", ...fields });
      return request("/practice", contract.SecurityReceiptSchema, "POST", contract.TeamPracticeRequestSchema.parse({ ...fields, proof_handle: proof.proof_handle }));
    }
  });
}
