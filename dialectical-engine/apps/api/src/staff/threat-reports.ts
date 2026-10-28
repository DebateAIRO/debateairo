import type { FastifyReply, FastifyRequest } from "fastify";
import type { ActionBinding } from "@debateai/kernel";
import type { PostgresThreatReportRepository } from "@debateai/db";
import type { Pool } from "pg";
import { decrypt, type CryptoEnvelope, type ReadableUserDekStore } from "@debateai/crypto";
import * as contract from "@debateai/contract";
import type { StaffAuthentication, StaffAccessApplication } from "./access.js";

export class ThreatReportHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export interface ThreatReportStaffService {
  repository: Pick<PostgresThreatReportRepository, "list" | "countUnread" | "peekAccount" | "read" | "decide">;
  /** Opens the live user's email using the user DEK and identity.user.email_ciphertext AAD. */
  readRecipientEmail(userId: string): Promise<string | null>;
}

/** Reads the live identity envelope on the runtime pool; alert claims first resolve a current staff holder. */
export function threatReportEmailReader(
  pool: Pick<Pool, "query">, keys: Pick<ReadableUserDekStore, "load">, idKind: "user" | "staff" = "user"
): (id: string) => Promise<string | null> {
  return async id => {
    const userId = idKind === "staff"
      ? (await pool.query<{ user_id: string | null }>(
        "SELECT staff.threat_report_recipient_user($1::uuid) user_id", [id]
      )).rows[0]?.user_id ?? null
      : id;
    if (userId === null) return null;
    const row = (await pool.query<{ email_ciphertext: CryptoEnvelope }>(
      'SELECT email_ciphertext FROM identity."user" WHERE user_id=$1', [userId]
    )).rows[0];
    if (row === undefined) return null;
    const key = await keys.load(userId);
    try {
      const plain = decrypt(key, row.email_ciphertext,
        ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
      try { return plain.toString("utf8"); }
      finally { plain.fill(0); }
    } finally { key.fill(0); }
  };
}

type DecisionIntent = Extract<contract.StaffActionIntent, { action: "THREAT_REPORT_DECIDE" }>;
type Route = (method: "GET" | "POST", path: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;

function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ThreatReportHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}

function projected<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ThreatReportHttpError(503, "STAFF_UNAVAILABLE");
  return result.data;
}

const iso = (value: Date | string | null): string | null => value === null ? null : value instanceof Date ? value.toISOString() : value;

export function registerThreatReportRoutes(
  route: Route,
  service: ThreatReportStaffService | undefined,
  access: StaffAccessApplication | undefined,
  auth: (request: FastifyRequest) => StaffAuthentication,
  actionAuthority: (request: FastifyRequest, intent: DecisionIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding }>
): void {
  async function permitted(request: FastifyRequest): Promise<StaffAuthentication> {
    const authentication = auth(request);
    await access!.requireCapability(authentication, "THREAT_REPORT");
    if (service === undefined) throw new ThreatReportHttpError(503, "STAFF_UNAVAILABLE");
    return authentication;
  }
  function reference(request: FastifyRequest): string {
    const value = (request.params as { reportRef?: unknown }).reportRef;
    if (!contract.ThreatReportSchema.shape.report_ref.safeParse(value).success)
      throw new ThreatReportHttpError(404, "THREAT_REPORT_NOT_FOUND");
    return value as string;
  }

  route("GET", "/v1/admin/threat-reports", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = await permitted(request);
    const rows = await service!.repository.list(authentication.context, authentication.baseSession.tokenHash);
    return projected(contract.ThreatReportListSchema, { reports: rows.map(row => ({
      report_ref: row.report_ref, kept_at: iso(row.kept_at), decision: row.decision, decided_at: iso(row.decided_at)
    })) });
  });

  route("GET", "/v1/admin/threat-reports/summary", async request => {
    const authentication = await permitted(request);
    return projected(contract.ThreatReportSummarySchema, {
      unread: await service!.repository.countUnread(authentication.context, authentication.baseSession.tokenHash)
    });
  });

  route("GET", "/v1/admin/threat-reports/:reportRef", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = await permitted(request);
    const reportRef = reference(request);
    const account = await service!.repository.peekAccount(authentication.context, authentication.baseSession.tokenHash, reportRef);
    const liveEmail = account.account_user_id === null ? null : await service!.readRecipientEmail(account.account_user_id);
    const anonymous = account.account_user_id === null && !account.has_held_email;
    if (!anonymous && liveEmail === null && !account.has_held_email) throw new ThreatReportHttpError(503, "STAFF_UNAVAILABLE");
    const row = await service!.repository.read(authentication.context, authentication.baseSession.tokenHash, reportRef);
    const email = row.held_email ?? liveEmail;
    if (!anonymous && email === null) throw new ThreatReportHttpError(503, "STAFF_UNAVAILABLE");
    return projected(contract.ThreatReportSchema, { report_ref: row.report_ref, question: row.question,
      kept_at: iso(row.kept_at), account: anonymous ? null : { email, user_id: row.account_user_id },
      decision: row.decision, decided_at: iso(row.decided_at) });
  });

  route("POST", "/v1/admin/threat-reports/:reportRef/decision", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await permitted(request);
    const reportRef = reference(request);
    const input = parsed(contract.ThreatReportDecisionRequestSchema, request.body);
    const intent: DecisionIntent = { action: "THREAT_REPORT_DECIDE", target_report_ref: reportRef,
      decision: input.decision, expected_revision: input.expected_revision, operation_id: input.operation_id };
    const { authentication, binding } = await actionAuthority(request, intent);
    const proof = await access!.readActionProof(authentication, input.proof, binding);
    if (proof === null) throw new ThreatReportHttpError(403, "STAFF_REQUEST_REFUSED");
    const decision = await service!.repository.decide(authentication.context, authentication.baseSession.tokenHash,
      reportRef, input.decision, { proofId: proof.proofId, binding });
    return { report_ref: reportRef, decision };
  });
}
