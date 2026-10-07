import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import type { InternalAllowanceConfigure, InternalAllowancePolicy, InternalAllowanceReadPort, InternalAllowanceRevoke,
  InternalGrant, InternalRunFundingState, SecurityReceipt, StaffContext } from "@debateai/kernel";
import { guardedAuthorityQuery } from "./staff-access.js";
import type { StaffMutation } from "./staff-access.js";

export type SelectedInternalAllowancePolicy = Readonly<{
  registerVersion: number;
  policy: Extract<InternalAllowancePolicy, { enabled: true }>;
}>;
export type InternalAllowanceCommandState = Readonly<{ ownerRef: string; expectedRevision: number; policyRegisterVersion: number }>;
export type InternalAllowanceConfigureCommand = StaffMutation & InternalAllowanceConfigure;
export type InternalAllowanceRevokeCommand = StaffMutation & InternalAllowanceRevoke;
export interface InternalAllowancePort extends InternalAllowanceReadPort {
  readPolicy(): Promise<SelectedInternalAllowancePolicy | null>;
  readRunState(runId:string):Promise<InternalRunFundingState>;
  readSelfCommand(context: StaffContext, ordinaryTokenHash: string, grantId: string | null): Promise<InternalAllowanceCommandState>;
  configure(input: InternalAllowanceConfigureCommand): Promise<SecurityReceipt>;
  revoke(input: InternalAllowanceRevokeCommand): Promise<SecurityReceipt>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const refusal = () => new TypedDomainError("INTERNAL_ALLOWANCE_UNAVAILABLE", "The selected internal funding authority is unavailable");
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function identifier(value: string): string {
  if (!uuid.test(value)) throw refusal();
  return value;
}
function instant(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw refusal();
  return value;
}
function policyFrom(value: unknown, registerVersion: number): SelectedInternalAllowancePolicy | null {
  if (value === null) return null;
  if (!object(value) || !exact(value, ["registerVersion", "policy", "sourceRef"]) || value.registerVersion !== registerVersion
    || typeof value.sourceRef !== "string" || value.sourceRef.trim() === "" || !object(value.policy)) throw refusal();
  const raw = value.policy;
  if (!exact(raw, ["enabled", "funding_policy_version", "currency", "maximum_grant_micros", "maximum_day_micros",
    "maximum_week_micros", "maximum_lifetime_ms", "finish_allowance_bp"])
    || raw.enabled !== true || raw.funding_policy_version !== 1 || raw.currency !== "USD" || raw.finish_allowance_bp !== 10000
    || !positive(raw.maximum_grant_micros) || !positive(raw.maximum_day_micros) || !positive(raw.maximum_week_micros)
    || !positive(raw.maximum_lifetime_ms) || raw.maximum_lifetime_ms > 2678400000
    || raw.maximum_day_micros > raw.maximum_week_micros || raw.maximum_week_micros > raw.maximum_grant_micros) throw refusal();
  return Object.freeze({ registerVersion, policy: Object.freeze({ enabled: true, fundingPolicyVersion: 1, currency: "USD",
    maximumGrantMicros: raw.maximum_grant_micros, maximumDayMicros: raw.maximum_day_micros,
    maximumWeekMicros: raw.maximum_week_micros, maximumLifetimeMs: raw.maximum_lifetime_ms,
    finishAllowanceBp: 10000, sourceRef: value.sourceRef }) });
}
function grantFrom(value: unknown, registerVersion: number): InternalGrant | null {
  if (value === null) return null;
  if (!object(value) || !exact(value, ["grantId", "grantEventId", "ownerRef", "revision", "amountMicros", "dayMicros",
    "weekMicros", "startsAt", "expiresAt", "fundingApprovalRef", "policyRegisterVersion"])
    || typeof value.grantId !== "string" || !uuid.test(value.grantId) || typeof value.grantEventId !== "string" || !uuid.test(value.grantEventId)
    || typeof value.ownerRef !== "string" || !uuid.test(value.ownerRef) || !positive(value.revision)
    || !positive(value.amountMicros) || !positive(value.dayMicros) || !positive(value.weekMicros)
    || value.dayMicros > value.weekMicros || value.weekMicros > value.amountMicros
    || value.policyRegisterVersion !== registerVersion || typeof value.startsAt !== "string" || typeof value.expiresAt !== "string"
    || typeof value.fundingApprovalRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.fundingApprovalRef)) throw refusal();
  const startsAt = instant(new Date(value.startsAt)), expiresAt = instant(new Date(value.expiresAt));
  if (expiresAt.getTime() <= startsAt.getTime() || expiresAt.getTime() - startsAt.getTime() > 2678400000) throw refusal();
  return Object.freeze({ grantId: value.grantId, grantEventId: value.grantEventId, ownerRef: value.ownerRef,
    revision: value.revision, amountMicros: value.amountMicros, dayMicros: value.dayMicros, weekMicros: value.weekMicros,
    startsAt, expiresAt, fundingApprovalRef: value.fundingApprovalRef, policyRegisterVersion: registerVersion });
}
function receiptFrom(value: unknown): SecurityReceipt {
  if (!object(value) || !exact(value, ["operationId", "outcome", "recordedAt"]) || typeof value.operationId !== "string"
    || !uuid.test(value.operationId) || value.outcome !== "COMPLETED" || typeof value.recordedAt !== "string") throw refusal();
  return Object.freeze({ operationId: value.operationId, outcome: "COMPLETED", recordedAt: instant(new Date(value.recordedAt)) });
}

/** Machine data port only. SQL owns current authority, clocks, revision, locks, audit and proof consumption. */
export class PostgresInternalAllowanceRepository implements InternalAllowancePort {
  private readonly registerVersion: number;
  constructor(private readonly pool: Pool, input: Readonly<{ registerVersion: number }>) {
    if (!positive(input.registerVersion)) throw refusal();
    this.registerVersion = input.registerVersion;
  }
  async readPolicy(): Promise<SelectedInternalAllowancePolicy | null> {
    const result = await this.pool.query<{ value: unknown }>("SELECT staff.read_internal_funding_policy() AS value");
    return policyFrom(result.rows[0]?.value, this.registerVersion);
  }
  async readSelfCommand(context: StaffContext, ordinaryTokenHash: string, grantId: string | null): Promise<InternalAllowanceCommandState> {
    const result = await guardedAuthorityQuery<{ value: unknown }>(this.pool,
      "SELECT staff.read_self_allowance_command($1::jsonb,$2,$3::uuid) AS value", [context, ordinaryTokenHash, grantId === null ? null : identifier(grantId)]);
    const value = result.rows[0]?.value;
    if (!object(value) || !exact(value, ["ownerRef", "expectedRevision", "policyRegisterVersion"])
      || typeof value.ownerRef !== "string" || !uuid.test(value.ownerRef) || typeof value.expectedRevision !== "number"
      || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0 || value.policyRegisterVersion !== this.registerVersion) throw refusal();
    return Object.freeze({ ownerRef: value.ownerRef, expectedRevision: value.expectedRevision, policyRegisterVersion: this.registerVersion });
  }
  async current(ownerRef: string, now: Date): Promise<InternalGrant | null> {
    const result = await this.pool.query<{ value: unknown }>("SELECT billing.read_internal_allowance($1::uuid,$2::timestamptz) AS value", [identifier(ownerRef), instant(now)]);
    return grantFrom(result.rows[0]?.value, this.registerVersion);
  }
  async forRun(runId: string, now: Date): Promise<InternalGrant | null> {
    const result = await this.pool.query<{ value: unknown }>("SELECT billing.read_internal_allowance_for_run($1::uuid,$2::timestamptz) AS value", [identifier(runId), instant(now)]);
    return grantFrom(result.rows[0]?.value, this.registerVersion);
  }
  async readRunState(runId:string):Promise<InternalRunFundingState> {
    const result=await this.pool.query<{state:unknown}>("SELECT billing.read_internal_run_state($1::uuid) AS state",[identifier(runId)]);
    const state=result.rows[0]?.state;
    if(typeof state!=="string" || !["ACTIVE","HELD","EXPIRED","REVOKED","REPLACED","ERASED","UNAVAILABLE"].includes(state))throw refusal();
    return state as InternalRunFundingState;
  }
  async configure(input: InternalAllowanceConfigureCommand): Promise<SecurityReceipt> {
    if (input.policyRegisterVersion !== this.registerVersion) throw refusal();
    const command = { ownerRef: identifier(input.ownerRef), expectedRevision: input.expectedRevision, policyRegisterVersion: this.registerVersion,
      amountMicros: input.amountMicros, dayMicros: input.dayMicros, weekMicros: input.weekMicros,
      startsAt: instant(input.startsAt).toISOString(), expiresAt: instant(input.expiresAt).toISOString(),
      fundingApprovalRef: input.fundingApprovalRef, operationId: identifier(input.operationId), reason: input.reason };
    const result = await this.pool.query<{ value: unknown }>("SELECT staff.configure_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent]);
    return receiptFrom(result.rows[0]?.value);
  }
  async revoke(input: InternalAllowanceRevokeCommand): Promise<SecurityReceipt> {
    if (input.policyRegisterVersion !== this.registerVersion) throw refusal();
    const command = { ownerRef: identifier(input.ownerRef), grantId: identifier(input.grantId), expectedRevision: input.expectedRevision,
      policyRegisterVersion: this.registerVersion, operationId: identifier(input.operationId), reason: input.reason };
    const result = await this.pool.query<{ value: unknown }>("SELECT staff.revoke_internal_allowance($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent]);
    return receiptFrom(result.rows[0]?.value);
  }
}
