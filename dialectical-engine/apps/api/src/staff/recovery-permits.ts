import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as contract from "@debateai/contract";
import type { ActionBinding } from "@debateai/kernel";
import type { PostgresRecoveryPermitStaffRepository } from "@debateai/db";
import { parseCanonicalRegisterJson } from "@debateai/register";
import type { StaffAccessApplication, StaffAuthentication } from "./access.js";
import type { StaffAlertIntentProducer } from "./alerts.js";
import { maskedAddress } from "./preview-buyers.js";

/**
 * THE OWNER'S PERMIT FOR A LOCKED-OUT ACCOUNT over HTTP (migration 0188). A person who lost their passkey or
 * authenticator app and has no saved code proves the account's mailbox and password on /recover; the ask then waits
 * here for the Owner.
 *
 * Only the Owner: every route asks TEAM_GRANT and the owner designation before it reads anything. The list is facts the
 * database knows about the account and nothing the person typed; the address is shown shortened (`maskedAddress`) and
 * never leaves the server whole. A decision needs the Owner's fresh hardware-key proof, made by the existing key
 * ceremony under the action TEAM_GRANT and bound by the server to the decision, the ask, its account, the revision the
 * page showed and the operation (`canonicalRecoveryPermitBinding`); the database computes the same digest again. An
 * approval needs the team tools unlocked and sends the independent alert; a refusal is containment and goes on while
 * they are locked. The Owner types no address and is handed no link and no code: the mails were sealed when the person
 * proved the password, and an approval only switches them on.
 */
export type RecoveryPermitIntent = Extract<contract.StaffActionIntent, { action: "RECOVERY_PERMIT_APPROVE" | "RECOVERY_PERMIT_REFUSE" }>;
export const isRecoveryPermitIntent = (intent: { action: string }): intent is RecoveryPermitIntent =>
  intent.action === "RECOVERY_PERMIT_APPROVE" || intent.action === "RECOVERY_PERMIT_REFUSE";
export class RecoveryPermitHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface RecoveryPermitStaffService {
  /** `everPaid`: whether any payment of the account ever succeeded, a yes or a no, never an amount. */
  repository: Pick<PostgresRecoveryPermitStaffRepository, "readList" | "act" | "everPaid">;
  /** Opens an account's sign-in address on the system login; null when there is none. Used only to show it shortened. */
  readEmail(userId: string): Promise<string | null>;
}

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const canonical = (body: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(body)));

/**
 * The proof's binding: the existing action TEAM_GRANT, the account as its target, the ask's revision and the operation;
 * the body names the decision and the ask. A proof made for one ask therefore never matches another, a proof to approve
 * never refuses, and a proof made for 0085's grant, 0142's partner or 0186's buyers, whose bodies differ, never opens
 * this door, nor does this door's proof open theirs.
 */
export function canonicalRecoveryPermitBinding(intent: RecoveryPermitIntent["action"], targetUserId: string, requestRef: string, expectedRevision: number, operationId: string): ActionBinding {
  const body = { action: "TEAM_GRANT", intent, target_id: targetUserId, request_ref: requestRef, expected_revision: expectedRevision, operation_id: operationId };
  return { action: "TEAM_GRANT", targetId: targetUserId, expectedRevision, operationId, bodySha256: sha(canonical(body)) };
}

/** The binding for a decision the Owner asks for, against the list as it is now: a page looking at another revision is stale before any key is touched. */
export async function recoveryPermitBinding(service: RecoveryPermitStaffService, authentication: StaffAuthentication, intent: RecoveryPermitIntent): Promise<ActionBinding & { requestRef: string }> {
  const list = await service.repository.readList(authentication.context, authentication.baseSession.tokenHash);
  const row = list.requests.find((candidate) => candidate.ref === intent.request_ref);
  if (row === undefined || row.revision !== intent.expected_revision) throw new RecoveryPermitHttpError(409, "RECOVERY_PERMITS_STALE");
  return { ...canonicalRecoveryPermitBinding(intent.action, row.userId, row.ref, row.revision, intent.operation_id), requestRef: row.ref };
}

type Route = (method: "GET" | "POST" | "DELETE", path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
function parsed<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RecoveryPermitHttpError(422, "STAFF_INPUT_INVALID");
  return result.data;
}
/** The database's own words for a decision it would not take; anything else stays the generic refusal. */
const PLAIN_REFUSALS: Readonly<Record<string, readonly [number, string]>> = Object.freeze({
  RECOVERY_PERMITS_STALE: [409, "RECOVERY_PERMITS_STALE"], RECOVERY_PERMIT_NOT_ALLOWED: [409, "RECOVERY_PERMIT_NOT_ALLOWED"],
  RECOVERY_PERMITS_DAILY_CAP: [409, "RECOVERY_PERMITS_DAILY_CAP"], STAFF_OPERATION_CONFLICT: [409, "STAFF_OPERATION_CONFLICT"]
});
async function plainRefusals<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const known = PLAIN_REFUSALS[error instanceof Error ? error.message : ""];
    if (known !== undefined) throw new RecoveryPermitHttpError(known[0], known[1]);
    throw error;
  }
}
const REFUSED = () => new RecoveryPermitHttpError(403, "STAFF_REQUEST_REFUSED");
const iso = (value: Date | null) => value === null ? null : value.toISOString();

export function registerRecoveryPermitRoutes(route: Route, service: () => RecoveryPermitStaffService | undefined, access: () => StaffAccessApplication,
  intents: () => Pick<StaffAlertIntentProducer, "mutation">, auth: (request: FastifyRequest) => StaffAuthentication, unlocked: () => Promise<boolean>,
  actionAuthority: (request: FastifyRequest, intent: RecoveryPermitIntent) => Promise<{ authentication: StaffAuthentication; binding: ActionBinding }>): void {
  /** The Owner and nobody else, before anything is read. */
  async function owner(request: FastifyRequest): Promise<StaffAuthentication> {
    const authentication = auth(request);
    await access().requireCapability(authentication, "TEAM_GRANT");
    if (authentication.context.designation !== "OWNER") throw REFUSED();
    return authentication;
  }
  /** Where the API was built without the person's side there is nothing to decide: main.ts hands no service. */
  const present = (): RecoveryPermitStaffService => {
    const value = service();
    if (value === undefined) throw new RecoveryPermitHttpError(404, "NOT_FOUND");
    return value;
  };
  async function decided(request: FastifyRequest, intent: RecoveryPermitIntent, proofHandle: string) {
    const { authentication, binding } = await actionAuthority(request, intent);
    const proof = await access().readActionProof(authentication, proofHandle, binding);
    if (proof === null) throw REFUSED();
    // An approval has come through actionAuthority's lock check; a refusal never waits for the alert channel.
    const alertIntent = intent.action === "RECOVERY_PERMIT_REFUSE" && !await unlocked() ? null
      : await intents().mutation({ event: intent.action === "RECOVERY_PERMIT_APPROVE" ? "ACCOUNT_RECOVERY_APPROVED" : "ACCOUNT_RECOVERY_REFUSED", operationId: binding.operationId,
        keyUserId: authentication.context.userId, actorStaffId: authentication.context.staffId, subjectStaffId: authentication.context.staffId, reason: { code: "SECURITY_RESPONSE" } });
    const receipt = await present().repository.act({ actor: authentication.context, proof, intent: intent.action, requestRef: intent.request_ref, targetUserId: binding.targetId,
      expectedRevision: binding.expectedRevision, operationId: binding.operationId, alertIntent });
    return { operation_id: receipt.operationId, outcome: receipt.outcome, recorded_at: receipt.recordedAt.toISOString() };
  }
  route("GET", "/v1/admin/recovery-permits", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authentication = await owner(request);
    const value = present();
    const list = await value.repository.readList(authentication.context, authentication.baseSession.tokenHash);
    const requests = [];
    for (const row of list.requests) {
      let address: string | null = null, everPaid: boolean | null = null;
      try { address = await value.readEmail(row.userId); } catch { address = null; }
      try { everPaid = await value.repository.everPaid(row.userId); } catch { everPaid = null; }
      requests.push({ ref: row.ref, revision: row.revision, stage: row.stage, masked_address: address === null ? null : maskedAddress(address),
        requested_at: row.requestedAt.toISOString(), request_expires_at: row.requestExpiresAt.toISOString(), approved_at: iso(row.approvedAt),
        not_before: iso(row.notBefore), finish_expires_at: iso(row.finishExpiresAt), account_created_at: row.accountCreatedAt.toISOString(),
        last_sign_in_at: iso(row.lastSignInAt), passkeys: row.passkeys, authenticator_app: row.authenticatorApp, saved_codes_left: row.savedCodesLeft,
        security_hold: row.securityHold, risk_mark: row.riskMark, ever_paid: everPaid, earlier_requests: row.earlierRequests });
    }
    const page = contract.RecoveryPermitsPageSchema.safeParse({ daily_cap: list.dailyCap, approved_today: list.approvedToday, requests });
    if (!page.success) throw new RecoveryPermitHttpError(503, "STAFF_UNAVAILABLE");
    return page.data;
  });
  for (const [verb, action] of [["approve", "RECOVERY_PERMIT_APPROVE"], ["refuse", "RECOVERY_PERMIT_REFUSE"]] as const) {
    route("POST", `/v1/admin/recovery-permits/:ref/${verb}`, async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const { ref } = parsed(contract.RecoveryPermitRefParamsSchema, request.params);
      const input = parsed(contract.RecoveryPermitDecideRequestSchema, request.body);
      return plainRefusals(() => decided(request, { action, request_ref: ref, expected_revision: input.expected_revision, operation_id: input.operation_id }, input.proof_handle));
    });
  }
}
