import { z } from "zod";
import { ContractHttpError } from "./http-error.js";

const bearer = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const PasswordResetStateSchema = z.object({
  status: z.enum(["password_required", "completed", "cancelled", "refused"]),
  expires_at: z.iso.datetime({ offset: true }),
  password_min_length: z.number().int().positive(),
  password_max_length: z.number().int().positive().nullable().optional()
}).strict();
export const PasswordResetExchangeSchema = PasswordResetStateSchema.extend({ status: z.literal("password_required") });
export const PasswordResetStartRequestSchema = z.object({ email: z.string().min(1).max(320) }).strict();
export const PasswordResetStartSchema = z.object({ message: z.literal("If this account can be recovered, instructions will arrive through an eligible channel.") }).strict();
export const PasswordResetLinkRequestSchema = z.object({ token: bearer }).strict();
export const PasswordResetCompleteRequestSchema = z.object({ password: z.string().min(1).max(1024), code: z.string().regex(/^[0-9]{6}$/) }).strict();
export const PasswordResetEmptyRequestSchema = z.object({}).strict();
export const PasswordResetCompletedSchema = z.object({ status: z.literal("completed") }).strict();
export const PasswordResetCancelledSchema = z.object({ status: z.literal("cancelled") }).strict();
export const passwordResetEndpointContracts: Record<string, Record<string, unknown>> = Object.fromEntries([
  ["POST /v1/auth/password-reset/start", PasswordResetStartRequestSchema, PasswordResetStartSchema, 202],
  ["POST /v1/auth/password-reset/exchange", PasswordResetLinkRequestSchema, PasswordResetExchangeSchema, 200],
  ["GET /v1/auth/password-reset/status", null, PasswordResetStateSchema, 200],
  ["POST /v1/auth/password-reset/complete", PasswordResetCompleteRequestSchema, PasswordResetCompletedSchema, 200],
  ["POST /v1/auth/password-reset/cancel", PasswordResetLinkRequestSchema, PasswordResetCancelledSchema, 200],
  ["POST /v1/auth/password-reset/cancel-current", PasswordResetEmptyRequestSchema, PasswordResetCancelledSchema, 200]
].map(([route, input, output, status]) => [route, {
  ...(input ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(input as z.ZodType) } } } } : {}),
  responses: { [status as number]: { description: "Scoped password reset only", content: { "application/json": { schema: z.toJSONSchema(output as z.ZodType) } } } }
}]));
export type PasswordResetState = z.infer<typeof PasswordResetStateSchema>;
export type PasswordResetClient = ReturnType<typeof createPasswordResetClient>;

function csrfFromBrowser(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const values = document.cookie.split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-debateai-password-reset-csrf="));
  if (values.length !== 1) return undefined;
  const token = values[0]!.split("=", 2)[1];
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function createPasswordResetClient(fetcher: typeof fetch = fetch, base = "/api", csrf: () => string | undefined = csrfFromBrowser) {
  if (!base.startsWith("/") || base.startsWith("//") || /[\\?#]/.test(base) || base.split("/").some(part => {
    try { const decoded = decodeURIComponent(part); return decoded === ".." || decoded === "." || /[\\/]/.test(decoded); } catch { return true; }
  })) throw new TypeError("PASSWORD_RESET_API_BASE_INVALID");
  base = base.replace(/\/+$/, "");
  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, scoped = true, expectedStatus = 200): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (scoped && body !== undefined) { const token = csrf(); if (token) headers.set("x-password-reset-csrf-token", token); }
    let response: Response;
    try { response = await fetcher(`${base}/v1/auth/password-reset/${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", headers, cache: "no-store", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new ContractHttpError("NETWORK_FAILURE", 0, "Password reset could not be confirmed."); }
    let value: unknown;
    try { value = await response.json(); } catch { throw new ContractHttpError("INVALID_RESPONSE", response.status, "Password reset could not be confirmed."); }
    if (response.status !== expectedStatus) {
      const raw = typeof value === "object" && value !== null ? (value as { error?: unknown }).error : null;
      const code = typeof raw === "string" && /^PASSWORD_RESET_[A-Z_]{1,80}$/.test(raw) ? raw : null;
      throw new ContractHttpError(response.status === 429 ? "RATE_LIMITED" : response.status === 403 ? "FORBIDDEN" : response.status >= 500 ? "SERVER_FAILURE" : "UNPROCESSABLE", response.status, "Password reset was not accepted.", code);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ContractHttpError("INVALID_RESPONSE", response.status, "Password reset could not be confirmed.");
    return parsed.data;
  }
  return {
    start: (email: string) => request("start", PasswordResetStartSchema, { email }, false, 202),
    exchange: (token: string) => request("exchange", PasswordResetExchangeSchema, { token }, false),
    status: () => request("status", PasswordResetStateSchema),
    complete: (password: string, code: string) => request("complete", PasswordResetCompletedSchema, { password, code }),
    cancel: (token: string) => request("cancel", PasswordResetCancelledSchema, { token }, false),
    cancelCurrent: () => request("cancel-current", PasswordResetCancelledSchema, {})
  };
}

export const passwordResetContractSchemas=Object.freeze({PasswordResetStateSchema,PasswordResetExchangeSchema,PasswordResetStartRequestSchema,PasswordResetStartSchema,PasswordResetLinkRequestSchema,PasswordResetCompleteRequestSchema,PasswordResetEmptyRequestSchema,PasswordResetCompletedSchema,PasswordResetCancelledSchema});
