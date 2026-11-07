import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as contract from "@debateai/contract";
import type { ActionBinding, Reason } from "@debateai/kernel";
import type { InternalAllowancePort } from "@debateai/db";
import { parseCanonicalRegisterJson } from "@debateai/register";
import type { StaffAccessApplication, StaffAuthentication } from "./access.js";
import type { StaffAlertIntentProducer } from "./alerts.js";
import type { StaffInternalFundingApplication } from "./internal-allowances.js";

/**
 * THE OWNER GIVES A MEMBER AN ALLOWANCE, over HTTP (plan 2026-10-31-r22-owner-changes decision 32; migration 0146). ALLOWANCE_WRITE: only the
 * active Owner ever has it, so the partner and a delegate are refused here and again by the database. Every change needs the Owner's passkey,
 * bound by the server to the member, their account's reference, the amounts, the window and the revision; the browser sends the member and
 * the revision it was looking at, and never the reference. The database recomputes the same digest under its locks.
 */
export type TeamAllowanceIntent = contract.TeamAllowanceIntent;
export type TeamAllowanceState = Awaited<ReturnType<InternalAllowancePort["readMemberCommand"]>>;
export class TeamAllowanceHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export const isTeamAllowanceIntent = (intent: { action: string }): intent is TeamAllowanceIntent =>
  intent.action === "TEAM_ALLOWANCE_CONFIGURE" || intent.action === "TEAM_ALLOWANCE_REVOKE";

const REFUSED = () => new TeamAllowanceHttpError(403, "STAFF_REQUEST_REFUSED");
/** The database's own words for a change it would not make; anything else stays the generic refusal. */
function plain(error: unknown): unknown {
  const message = error instanceof Error ? error.message : "";
  if (message === "STAFF_REVISION_INVALID") return new TeamAllowanceHttpError(409, "TEAM_ALLOWANCE_STALE");
  if (message === "INTERNAL_ALLOWANCE_OVERLAP") return new TeamAllowanceHttpError(409, "TEAM_ALLOWANCE_EXISTS");
  if (message === "INTERNAL_ALLOWANCE_TARGET_INVALID") return new TeamAllowanceHttpError(409, "TEAM_ALLOWANCE_STALE");
  if (message === "STAFF_TARGET_INVALID") return new TeamAllowanceHttpError(409, "TEAM_ALLOWANCE_MEMBER_UNAVAILABLE");
  if (message === "INTERNAL_ALLOWANCE_COMMAND_INVALID") return new TeamAllowanceHttpError(422, "TEAM_ALLOWANCE_INVALID");
  return error;
}
async function plainRefusals<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw plain(error); }
}

/** The state a ceremony is bound to. A page looking at another revision is stale before any ceremony. */
export async function readTeamAllowanceState(allowances: StaffInternalFundingApplication["allowances"], authentication: StaffAuthentication, intent: TeamAllowanceIntent): Promise<TeamAllowanceState> {
  const state = await plainRefusals(() => allowances.readMemberCommand(authentication.context, authentication.baseSession.tokenHash, intent.target_staff_id,
    intent.action === "TEAM_ALLOWANCE_REVOKE" ? intent.grant_id : null));
  if (state.expectedRevision !== intent.expected_revision) throw new TeamAllowanceHttpError(409, "TEAM_ALLOWANCE_STALE");
  return state;
}
/** The member shapes of 0146's staff.internal_allowance_body, in the same canonical JSON as the self command. */
export function canonicalTeamAllowanceActionBinding(intent: TeamAllowanceIntent, state: TeamAllowanceState): ActionBinding {
  const reason = { code: intent.reason.code, ...(intent.reason.ticket_ref === undefined ? {} : { ticket_ref: intent.reason.ticket_ref }) };
  const common = { expected_revision: state.expectedRevision, policy_register_version: state.policyRegisterVersion, operation_id: intent.operation_id, owner_ref: state.ownerRef, reason };
  const action = intent.action === "TEAM_ALLOWANCE_CONFIGURE" ? "ALLOWANCE_CONFIGURE" as const : "ALLOWANCE_REVOKE" as const;
  const targetId = intent.action === "TEAM_ALLOWANCE_CONFIGURE" ? intent.target_staff_id : intent.grant_id;
  const body = intent.action === "TEAM_ALLOWANCE_CONFIGURE"
    ? { action, target_id: targetId, amount_micros: intent.amount_micros, day_micros: intent.day_micros, week_micros: intent.week_micros,
        starts_at: new Date(intent.starts_at).toISOString(), expires_at: new Date(intent.expires_at).toISOString(), funding_approval_ref: intent.funding_approval_ref, ...common }
    : { action, target_id: targetId, target_staff_id: intent.target_staff_id, ...common };
  return { action, targetId, expectedRevision: state.expectedRevision, operationId: intent.operation_id,
    bodySha256: createHash("sha256").update(parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)))).digest("hex") };
}

type Route = (method: "GET" | "POST" | "DELETE", path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new TeamAllowanceHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}
export function registerTeamAllowanceRoutes(route: Route, funding: () => StaffInternalFundingApplication | undefined, access: () => StaffAccessApplication,
  intents: () => Pick<StaffAlertIntentProducer, "mutation">, auth: (request: FastifyRequest) => StaffAuthentication,
  actionAuthority: (request: FastifyRequest, intent: TeamAllowanceIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding; memberState?: TeamAllowanceState }>): void {
  const application = (): StaffInternalFundingApplication => {
    const present = funding();
    if (present === undefined) throw new TeamAllowanceHttpError(503, "STAFF_UNAVAILABLE");
    return present;
  };
  async function proved(request: FastifyRequest, intent: TeamAllowanceIntent, proofHandle: string, event: "ALLOWANCE_CONFIGURED" | "ALLOWANCE_REVOKED") {
    const { authentication, binding, memberState } = await actionAuthority(request, intent);
    if (memberState === undefined) throw REFUSED();
    const proof = await access().readActionProof(authentication, proofHandle, binding);
    if (proof === null) throw REFUSED();
    const reason: Reason = { code: intent.reason.code, ...(intent.reason.ticket_ref === undefined ? {} : { ticketRef: intent.reason.ticket_ref }) };
    // Sealed for the member's account, as every change to a member is; the plain metadata names staff ids and no amount.
    const alertIntent = await intents().mutation({ event, operationId: binding.operationId, keyUserId: memberState.keyUserId,
      actorStaffId: authentication.context.staffId, subjectStaffId: intent.target_staff_id, reason });
    await access().requireCapability(authentication, "ALLOWANCE_WRITE", binding);
    return { ownerRef: memberState.ownerRef, expectedRevision: memberState.expectedRevision, policyRegisterVersion: memberState.policyRegisterVersion,
      targetStaffId: intent.target_staff_id, actor: authentication.context, proof, operationId: binding.operationId, reason, alertIntent };
  }
  const answer = (value: { operationId: string; outcome: string; recordedAt: Date }) =>
    ({ operation_id: value.operationId, outcome: value.outcome, recorded_at: value.recordedAt.toISOString() });
  route("GET", "/v1/admin/team-allowances", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = auth(request);
    await access().requireCapability(authentication, "ALLOWANCE_WRITE");
    const page = await application().allowances.readMemberPage(authentication.context, authentication.baseSession.tokenHash);
    const result = contract.TeamAllowancePageSchema.safeParse(page);
    if (!result.success) throw new TeamAllowanceHttpError(503, "STAFF_UNAVAILABLE");
    return result.data;
  });
  route("POST", "/v1/admin/team-allowances/:staffId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { staffId } = parsed(contract.StaffTargetParamsSchema, request.params);
    const { proof_handle: proofHandle, ...fields } = parsed(contract.TeamAllowanceConfigureRequestSchema, request.body);
    const intent = { action: "TEAM_ALLOWANCE_CONFIGURE" as const, target_staff_id: staffId, ...fields };
    return plainRefusals(async () => {
      const common = await proved(request, intent, proofHandle, "ALLOWANCE_CONFIGURED");
      return answer(await application().allowances.configure({ ...common, amountMicros: intent.amount_micros, dayMicros: intent.day_micros, weekMicros: intent.week_micros,
        startsAt: new Date(intent.starts_at), expiresAt: new Date(intent.expires_at), fundingApprovalRef: intent.funding_approval_ref }));
    });
  });
  route("DELETE", "/v1/admin/team-allowances/:staffId/:grantId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { staffId, grantId } = parsed(contract.TeamAllowanceRevokeParamsSchema, request.params);
    const { proof_handle: proofHandle, ...fields } = parsed(contract.TeamAllowanceRevokeRequestSchema, request.body);
    const intent = { action: "TEAM_ALLOWANCE_REVOKE" as const, target_staff_id: staffId, grant_id: grantId, ...fields };
    return plainRefusals(async () => answer(await application().allowances.revoke({ ...await proved(request, intent, proofHandle, "ALLOWANCE_REVOKED"), grantId })));
  });
}
