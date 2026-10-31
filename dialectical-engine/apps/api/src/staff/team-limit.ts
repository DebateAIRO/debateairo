import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as contract from "@debateai/contract";
import type { ActionBinding, Reason } from "@debateai/kernel";
import type { PostgresInternalAllowanceRepository, PostgresTeamLimitRepository, TeamLimitCommandState } from "@debateai/db";
import { parseCanonicalRegisterJson } from "@debateai/register";
import type { StaffAccessApplication, StaffAuthentication } from "./access.js";
import type { StaffAlertIntentProducer } from "./alerts.js";
import { StaffAlertError } from "./alerts.js";
import type { TemplatedMailChannel } from "../mail-channel.js";
import { gatedInterval, type ReleaseGate } from "../release-loops.js";

/**
 * THE TEAM'S ONE LIMIT over HTTP (plan 2026-10-31-r22-owner-changes decision 24; migration 0142). Two accounts only: the Owner, and the one
 * person the Owner picks. Every change needs that person's passkey, bound by the server to the exact new amount, the amount and revision the
 * person was looking at, and the operation (`canonicalTeamLimitActionBinding`); the database recomputes the same digest under its lock.
 * Mail is content-free: email is not a private channel, so no notice carries an amount; it says only that something changed and where to look.
 */
export type TeamLimitIntent = Extract<contract.StaffActionIntent, { action: "TEAM_LIMIT_SET" | "TEAM_LIMIT_PARTNER_GRANT" | "TEAM_LIMIT_PARTNER_REVOKE" | "TEAM_PRACTICE_RECORD" }>;
export interface TeamLimitStaffService { repository: PostgresTeamLimitRepository }
export class TeamLimitHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const FUNDING_REASON = Object.freeze({ code: "FUNDING_APPROVAL" as const });
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const canonical = (body: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)));
export const isTeamLimitIntent = (intent: { action: string }): intent is TeamLimitIntent =>
  ["TEAM_LIMIT_SET", "TEAM_LIMIT_PARTNER_GRANT", "TEAM_LIMIT_PARTNER_REVOKE", "TEAM_PRACTICE_RECORD"].includes(intent.action);

/** A proof made for one amount and one current value proves nothing else. A page looking at another value is stale before any ceremony. */
export function canonicalTeamLimitActionBinding(intent: TeamLimitIntent, staffId: string, state: TeamLimitCommandState | null): ActionBinding {
  if (intent.action === "TEAM_LIMIT_SET") {
    if (state === null || intent.current_micros !== state.currentMicros || intent.expected_revision !== state.expectedRevision) {
      throw new TeamLimitHttpError(409, "TEAM_LIMIT_STALE");
    }
    const body = { action: intent.action, target_id: staffId, amount_micros: intent.amount_micros, current_micros: state.currentMicros,
      expected_revision: state.expectedRevision, operation_id: intent.operation_id, reason: FUNDING_REASON };
    return { action: intent.action, targetId: staffId, expectedRevision: state.expectedRevision, operationId: intent.operation_id, bodySha256: sha(canonical(body)) };
  }
  if (intent.action === "TEAM_PRACTICE_RECORD") {
    const body = { action: intent.action, target_id: intent.practice_ref, charge_micros: intent.charge_micros, expected_revision: 0,
      operation_id: intent.operation_id, reason: FUNDING_REASON };
    return { action: intent.action, targetId: intent.practice_ref, expectedRevision: 0, operationId: intent.operation_id, bodySha256: sha(canonical(body)) };
  }
  const body = { action: intent.action, target_id: intent.target_staff_id, expected_revision: intent.expected_revision, operation_id: intent.operation_id,
    reason: { code: intent.reason.code, ...(intent.reason.ticket_ref === undefined ? {} : { ticket_ref: intent.reason.ticket_ref }) } };
  return { action: intent.action, targetId: intent.target_staff_id, expectedRevision: intent.expected_revision, operationId: intent.operation_id, bodySha256: sha(JSON.stringify(body)) };
}

type Route = (method: "GET" | "POST" | "DELETE", path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new TeamLimitHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}
const REFUSED = () => new TeamLimitHttpError(403, "STAFF_REQUEST_REFUSED");
/** The database's own words for a change it would not make; anything else stays the generic refusal. */
async function plainRefusals<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "STAFF_REVISION_INVALID") throw new TeamLimitHttpError(409, "TEAM_LIMIT_STALE");
    if (message === "TEAM_LIMIT_PARTNER_EXISTS" || message === "TEAM_PRACTICE_ALREADY_RECORDED") throw new TeamLimitHttpError(409, message);
    throw error;
  }
}

export function registerTeamLimitRoutes(route: Route, service: () => TeamLimitStaffService | undefined, access: () => StaffAccessApplication,
  intents: () => Pick<StaffAlertIntentProducer, "mutation">, auth: (request: FastifyRequest) => StaffAuthentication,
  actionAuthority: (request: FastifyRequest, intent: TeamLimitIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding }>): void {
  const repository = (): PostgresTeamLimitRepository => {
    const present = service();
    if (present === undefined) throw new StaffAlertError("STAFF_ALERT_UNAVAILABLE");
    return present.repository;
  };
  async function proved(request: FastifyRequest, intent: TeamLimitIntent, proofHandle: string, event: "TEAM_LIMIT_CHANGED" | "TEAM_LIMIT_PARTNER_GRANTED" | "TEAM_LIMIT_PARTNER_REVOKED" | "TEAM_PRACTICE_RECORDED",
    subject: string | null, reason: Reason) {
    const { authentication, binding } = await actionAuthority(request, intent);
    const proof = await access().readActionProof(authentication, proofHandle, binding);
    if (proof === null) throw REFUSED();
    const alertIntent = await intents().mutation({ event, operationId: binding.operationId, keyUserId: authentication.context.userId,
      actorStaffId: authentication.context.staffId, subjectStaffId: subject ?? authentication.context.staffId, reason });
    return { actor: authentication.context, proof, operationId: binding.operationId, reason, alertIntent };
  }
  const answer = (value: { operationId: string; outcome: string; recordedAt: Date }) =>
    ({ operation_id: value.operationId, outcome: value.outcome, recorded_at: value.recordedAt.toISOString() });
  route("GET", "/v1/admin/team-limit", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = auth(request);
    await access().requireCapability(authentication, "TEAM_LIMIT_SET");
    const page = await repository().readPage(authentication.context, authentication.baseSession.tokenHash);
    const result = contract.TeamLimitPageSchema.safeParse(page);
    if (!result.success) throw new TeamLimitHttpError(503, "STAFF_UNAVAILABLE");
    return result.data;
  });
  route("POST", "/v1/admin/team-limit", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = parsed(contract.TeamLimitSetRequestSchema, request.body);
    return plainRefusals(async () => {
      const { proof_handle: proofHandle, ...fields } = input;
      const common = await proved(request, { action: "TEAM_LIMIT_SET", ...fields }, proofHandle, "TEAM_LIMIT_CHANGED", null, FUNDING_REASON);
      return answer(await repository().setLimit({ ...common, amountMicros: input.amount_micros, currentMicros: input.current_micros, expectedRevision: input.expected_revision }));
    });
  });
  route("POST", "/v1/admin/team-limit/practice", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = parsed(contract.TeamPracticeRequestSchema, request.body);
    return plainRefusals(async () => {
      const { proof_handle: proofHandle, ...fields } = input;
      const common = await proved(request, { action: "TEAM_PRACTICE_RECORD", ...fields }, proofHandle, "TEAM_PRACTICE_RECORDED", null, FUNDING_REASON);
      return answer(await repository().recordPractice({ ...common, practiceRef: input.practice_ref, chargeMicros: input.charge_micros }));
    });
  });
  async function partner(request: FastifyRequest, action: "TEAM_LIMIT_PARTNER_GRANT" | "TEAM_LIMIT_PARTNER_REVOKE") {
    const { staffId } = parsed(contract.StaffTargetParamsSchema, request.params);
    const input = parsed(contract.TeamLimitPartnerRequestSchema, request.body);
    return plainRefusals(async () => {
      const reason: Reason = { code: input.reason.code, ...(input.reason.ticket_ref === undefined ? {} : { ticketRef: input.reason.ticket_ref }) };
      const intent: TeamLimitIntent = { action, target_staff_id: staffId, expected_revision: input.expected_revision, operation_id: input.operation_id, reason: input.reason };
      const common = await proved(request, intent, input.proof_handle, action === "TEAM_LIMIT_PARTNER_GRANT" ? "TEAM_LIMIT_PARTNER_GRANTED" : "TEAM_LIMIT_PARTNER_REVOKED", staffId, reason);
      const change = { ...common, targetStaffId: staffId };
      return answer(action === "TEAM_LIMIT_PARTNER_GRANT" ? await repository().grantPartner(change) : await repository().revokePartner(change));
    });
  }
  route("POST", "/v1/admin/team-limit/partner/:staffId", request => partner(request, "TEAM_LIMIT_PARTNER_GRANT"));
  route("DELETE", "/v1/admin/team-limit/partner/:staffId", request => partner(request, "TEAM_LIMIT_PARTNER_REVOKE"));
}

/** Decision 32 runs this same loop over its own notices (0146): the Owner's and the member's. Neither names an amount or a person. */
const NOTICE_TEMPLATES = Object.freeze({ LIMIT_CHANGED: "TEAM_LIMIT_CHANGED", PARTNER_CHANGED: "TEAM_LIMIT_PARTNER_CHANGED", ALLOWANCE_CHANGED: "TEAM_ALLOWANCE_CHANGED", ALLOWANCE_YOURS: "TEAM_ALLOWANCE_YOURS" } as const);
export type TeamLimitNoticeInputs = Readonly<{
  repository: Pick<PostgresTeamLimitRepository, "completeNotice" | "noticeUser"> & Readonly<{ claimNotices(limit: number): ReturnType<PostgresTeamLimitRepository["claimNotices"]> | ReturnType<PostgresInternalAllowanceRepository["claimNotices"]> }>;
  mail: TemplatedMailChannel;
  /** Opens a live account's address; the same reader the threat reports use for a named account. */
  readEmail(userId: string): Promise<string | null>;
  everyMs?: number;
}>;
/** One lease per notice. A failed send never touches the change: the row counts its tries, ends marked failed, and the panel says so. */
export async function drainTeamLimitNotices(input: TeamLimitNoticeInputs): Promise<void> {
  for (const claim of await input.repository.claimNotices(100)) {
    try {
      const userId = await input.repository.noticeUser(claim.notice_id, claim.claim_token);
      const to = userId === null ? null : await input.readEmail(userId);
      if (to === null) throw new Error("TEAM_LIMIT_NOTICE_NO_ADDRESS");
      await input.mail.sendTemplated({ to, templateId: NOTICE_TEMPLATES[claim.kind],
        locale: "en", params: {}, messageId: claim.notice_id });
      await input.repository.completeNotice(claim.notice_id, claim.claim_token, true);
    } catch {
      await input.repository.completeNotice(claim.notice_id, claim.claim_token, false);
    }
  }
}
const TEAM_LIMIT_NOTICE_EVERY_MS = 15_000;
/** Side-by-side C7: the tick claims rows, so it runs only while this process's release is current (`gate`). */
export function startTeamLimitNotices(input: TeamLimitNoticeInputs, gate: ReleaseGate): NodeJS.Timeout {
  let active = false;
  return gatedInterval(gate, () => {
    if (active) return;
    active = true;
    void drainTeamLimitNotices(input).catch(() => undefined).finally(() => { active = false; });
  }, input.everyMs ?? TEAM_LIMIT_NOTICE_EVERY_MS);
}
