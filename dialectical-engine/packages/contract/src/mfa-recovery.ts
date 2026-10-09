import { z } from "zod";
import { ContractHttpError } from "./http-error.js";
const bearer = z.string().regex(/^[A-Za-z0-9_-]{43}$/), date = z.iso.datetime({ offset: true });
const empty = z.object({}).strict(), link = z.object({ token: bearer }).strict();
const generic = z.object({ message: z.literal("If this account can be recovered, instructions will arrive through an eligible channel.") }).strict();
const result = <S extends string>(status: S) => z.object({ status: z.literal(status) }).strict();
const digits = z.object({ code: z.string().regex(/^[0-9]{6}$/) }).strict();
export const MfaRecoveryStartRequestSchema = z.object({ email: z.string().min(1).max(320), destination: z.enum(["primary", "backup"]) }).strict();
export const MfaRecoveryExchangeRequestSchema = z.object({ token: bearer, password: z.string().min(1).max(1024) }).strict();
export const MfaRecoveryStateSchema = z.object({ status: z.enum(["factor_required", "totp_required", "codes_required", "ack_required", "ready", "waiting", "completed", "cancelled", "refused"]), expires_at: date, not_before: date.optional() }).strict();
// Owner ruling 2026-10-09: completing starts a 24-hour wait; the emailed finish link plus the current password finishes it.
export const MfaRecoveryWaitingSchema = z.object({ status: z.literal("waiting"), not_before: date }).strict();
export const MfaRecoveryFinishStatusSchema = z.discriminatedUnion("status", [MfaRecoveryWaitingSchema, z.object({ status: z.literal("ready_to_finish"), expires_at: date }).strict()]);
export const MfaRecoveryFinishRequestSchema = z.object({ token: bearer, password: z.string().min(1).max(1024) }).strict();
export const MfaRecoveryExchangeSchema = MfaRecoveryStateSchema.extend({ status: z.literal("factor_required") });
export const MfaRecoveryFactorSchema = z.object({ status: z.literal("totp_required"), secret: z.string().regex(/^[A-Z2-7]{32}$/), otpauth_uri: z.string().startsWith("otpauth://totp/").max(8192), account_label: z.string().min(1).max(512) }).strict();
export const MfaRecoveryCodesSchema = z.object({ status: z.literal("ack_required"), recovery_codes: z.array(z.string().min(16).max(96)).length(10) }).strict();
export const BackupEmailStateSchema = z.object({ status: z.enum(["pending", "verified", "unavailable"]), email: z.string().min(1).max(320).nullable() }).strict();
export const BackupEmailVerificationRequestSchema = z.object({ password: z.string().min(1).max(1024), code: z.string().regex(/^[0-9]{6}$/) }).strict();
function endpoints(rows: [string, z.ZodType | null, z.ZodType, number][]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(rows.map(([route, input, output, status]) => [route, { ...(input ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(input) } } } } : {}), responses: { [status]: { description: "Purpose-bound verified email operation", content: { "application/json": { schema: z.toJSONSchema(output) } } } } }]));
}
export const mfaRecoveryEndpointContracts = endpoints([
  ["POST /v1/auth/mfa-recovery/start", MfaRecoveryStartRequestSchema, generic, 202],
  ["POST /v1/auth/mfa-recovery/exchange", MfaRecoveryExchangeRequestSchema, MfaRecoveryExchangeSchema, 200],
  ["GET /v1/auth/mfa-recovery/status", null, MfaRecoveryStateSchema, 200],
  ["POST /v1/auth/mfa-recovery/totp/begin", empty, MfaRecoveryFactorSchema, 200],
  ["POST /v1/auth/mfa-recovery/totp/verify", digits, result("codes_required"), 200],
  ["POST /v1/auth/mfa-recovery/codes/generate", empty, MfaRecoveryCodesSchema, 200],
  ["POST /v1/auth/mfa-recovery/codes/confirm", z.object({ code: z.string().min(1).max(128) }).strict(), result("ready"), 200],
  ["POST /v1/auth/mfa-recovery/complete", empty, MfaRecoveryWaitingSchema, 200],
  ["POST /v1/auth/mfa-recovery/cancel", link, result("cancelled"), 200],
  ["POST /v1/auth/mfa-recovery/cancel-current", empty, result("cancelled"), 200],
  ["POST /v1/auth/mfa-recovery/finish/status", link, MfaRecoveryFinishStatusSchema, 200],
  ["POST /v1/auth/mfa-recovery/finish", MfaRecoveryFinishRequestSchema, result("completed"), 200]
]);
export const backupEmailEndpointContracts = endpoints([
  ["GET /v1/account/backup-email", null, BackupEmailStateSchema, 200],
  ["POST /v1/account/backup-email/verify/start", BackupEmailVerificationRequestSchema, generic, 202],
  ["POST /v1/account/backup-email/verify/confirm", link, result("verified"), 200]
]);
function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const values = document.cookie.split(";").map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  const token = values[0]!.split("=", 2)[1]; return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
function transport(fetcher: typeof fetch, base: string, prefix: string, csrf: () => string | undefined, header: string) {
  if (!base.startsWith("/") || base.startsWith("//") || /[\\?#]/.test(base) || base.split("/").some(part => { try { const decoded = decodeURIComponent(part); return decoded === "." || decoded === ".." || /[\\/]/.test(decoded); } catch { return true; } })) throw new TypeError("EMAIL_RECOVERY_API_BASE_INVALID");
  let baseEnd = base.length;
  while (baseEnd > 0 && base[baseEnd - 1] === "/") baseEnd--;
  base = base.slice(0, baseEnd);
  return async <T>(path: string, schema: z.ZodType<T>, body?: unknown, scoped = true, expected = 200): Promise<T> => {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (scoped && body !== undefined) { const value = csrf(); if (value) headers.set(header, value); }
    let response: Response, value: unknown;
    try { response = await fetcher(`${base}${prefix}${path}`, { method: body === undefined ? "GET" : "POST", headers, credentials: "include", cache: "no-store", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new ContractHttpError("NETWORK_FAILURE", 0, "Email recovery could not be confirmed."); }
    try { value = await response.json(); } catch { throw new ContractHttpError("INVALID_RESPONSE", response.status, "Email recovery could not be confirmed."); }
    if (response.status !== expected) {
      const raw = typeof value === "object" && value !== null ? (value as { error?: unknown }).error : null;
      const code = typeof raw === "string" && /^(?:MFA_RECOVERY|BACKUP_EMAIL)_[A-Z_]{1,80}$/.test(raw) ? raw : null;
      throw new ContractHttpError(response.status === 429 ? "RATE_LIMITED" : response.status === 403 ? "FORBIDDEN" : response.status >= 500 ? "SERVER_FAILURE" : "UNPROCESSABLE", response.status, "Email recovery was not accepted.", code);
    }
    const parsed = schema.safeParse(value); if (!parsed.success) throw new ContractHttpError("INVALID_RESPONSE", response.status, "Email recovery could not be confirmed.");
    return parsed.data;
  };
}
export function createMfaRecoveryClient(fetcher: typeof fetch = fetch, base = "/api", csrf = () => cookie("__Host-debateai-mfa-recovery-csrf")) {
  const request = transport(fetcher, base, "/v1/auth/mfa-recovery/", csrf, "x-mfa-recovery-csrf-token");
  return { start: (email: string, destination: "primary" | "backup") => request("start", generic, { email, destination }, false, 202), exchange: (token: string, password: string) => request("exchange", MfaRecoveryExchangeSchema, { token, password }, false), status: () => request("status", MfaRecoveryStateSchema), beginFactor: () => request("totp/begin", MfaRecoveryFactorSchema, {}), verifyFactor: (code: string) => request("totp/verify", result("codes_required"), { code }), generateCodes: () => request("codes/generate", MfaRecoveryCodesSchema, {}), acknowledge: (code: string) => request("codes/confirm", result("ready"), { code }), complete: () => request("complete", MfaRecoveryWaitingSchema, {}), finishStatus: (token: string) => request("finish/status", MfaRecoveryFinishStatusSchema, { token }, false), finish: (token: string, password: string) => request("finish", result("completed"), { token, password }, false), cancel: (token: string) => request("cancel", result("cancelled"), { token }, false), cancelCurrent: () => request("cancel-current", result("cancelled"), {}) };
}
export function createBackupEmailClient(fetcher: typeof fetch = fetch, base = "/api", csrf = () => cookie("__Host-debateai-csrf")) {
  const request = transport(fetcher, base, "/v1/account/backup-email", csrf, "x-csrf-token");
  return { status: () => request("", BackupEmailStateSchema), startVerification: (password: string, code: string) => request("/verify/start", generic, { password, code }, true, 202), confirm: (token: string) => request("/verify/confirm", result("verified"), { token }, false) };
}
export type MfaRecoveryState = z.infer<typeof MfaRecoveryStateSchema>;
export type MfaRecoveryFinishStatus = z.infer<typeof MfaRecoveryFinishStatusSchema>;
export type MfaRecoveryClient = ReturnType<typeof createMfaRecoveryClient>;
export type BackupEmailClient = ReturnType<typeof createBackupEmailClient>;

export const mfaRecoveryContractSchemas=Object.freeze({MfaRecoveryStartRequestSchema,MfaRecoveryExchangeRequestSchema,MfaRecoveryStateSchema,MfaRecoveryExchangeSchema,MfaRecoveryWaitingSchema,MfaRecoveryFinishStatusSchema,MfaRecoveryFinishRequestSchema,MfaRecoveryFactorSchema,MfaRecoveryCodesSchema,BackupEmailStateSchema,BackupEmailVerificationRequestSchema});
