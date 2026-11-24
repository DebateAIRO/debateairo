import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import type { z } from "zod";
import type { AuthSourceContext } from "@debateai/db";
import { RecoveryPermitProofRequestSchema, RecoveryPermitStartRequestSchema } from "@debateai/contract";
import { RecoveryPermitError, type RecoveryPermitApplication } from "./recovery-permit.js";

/**
 * The person's routes of the Owner's permit (migration 0188). All five are public and take a trusted origin only: the
 * caller is known by the emailed link each call carries, never by a cookie.
 */
export const recoveryPermitPolicyInventory = [
  { route: "POST /v1/auth/recovery-permit/start", auth: "public", origin: "trusted", resource: "identity", action: "start-recovery-permit" },
  { route: "POST /v1/auth/recovery-permit/request", auth: "public", origin: "trusted", resource: "identity", action: "request-recovery-permit" },
  { route: "POST /v1/auth/recovery-permit/cancel", auth: "public", origin: "trusted", resource: "identity", action: "cancel-recovery-permit" },
  { route: "POST /v1/auth/recovery-permit/finish/status", auth: "public", origin: "trusted", resource: "identity", action: "read-recovery-permit-finish" },
  { route: "POST /v1/auth/recovery-permit/finish", auth: "public", origin: "trusted", resource: "identity", action: "finish-recovery-permit" }
] as const;
type Route = typeof recoveryPermitPolicyInventory[number]["route"];
const link = RecoveryPermitProofRequestSchema.pick({ token: true }).strict();

/**
 * A refusal's status by its code: a wrong password 401, too early 409, the source's limit 429, a malformed body 400,
 * and 410 for a link that no longer works or an ask that cannot be taken, which are never told apart. Anything else is
 * 503.
 */
function statusOf(code: string): number {
  return code.endsWith("RATE_LIMITED") ? 429 : code.endsWith("TOO_EARLY") ? 409 : code.endsWith("PROOF_INVALID") ? 401
    : code.endsWith("INPUT_INVALID") ? 400 : code.endsWith("_INVALID") ? 410 : 503;
}

export function registerRecoveryPermitRoutes(api: FastifyInstance, o: Readonly<{
  service?: RecoveryPermitApplication;
  policy: (route: Route) => RouteShorthandOptions;
  source: (request: FastifyRequest) => AuthSourceContext;
  /** The start's own admission: the per-network limit and, while it is required, the Turnstile proof. It answers a refusal itself. */
  admitStart: (request: FastifyRequest, reply: FastifyReply) => boolean | Promise<boolean>;
}>): void {
  if (!o.service) return;
  const service = o.service;
  const guarded = (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    try { return await handler(request, reply); } catch (error) {
      const code = error instanceof RecoveryPermitError ? error.code : "RECOVERY_PERMIT_UNAVAILABLE";
      return reply.status(statusOf(code)).send({ error: code });
    }
  };
  const parse = <T,>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null => {
    const result = schema.safeParse(body);
    if (!result.success) { void reply.status(400).send({ error: "RECOVERY_PERMIT_INPUT_INVALID" }); return null; }
    return result.data;
  };
  api.post("/v1/auth/recovery-permit/start", o.policy("POST /v1/auth/recovery-permit/start"), guarded(async (request, reply) => {
    const parsed = parse(RecoveryPermitStartRequestSchema, request.body, reply);
    if (!parsed || !await o.admitStart(request, reply)) return reply;
    return reply.status(202).send(await service.start({ email: parsed.email }, o.source(request)));
  }));
  api.post("/v1/auth/recovery-permit/request", o.policy("POST /v1/auth/recovery-permit/request"), guarded(async (request, reply) => {
    const input = parse(RecoveryPermitProofRequestSchema, request.body, reply);
    if (!input) return reply;
    return reply.send(await service.request(input, o.source(request)));
  }));
  api.post("/v1/auth/recovery-permit/cancel", o.policy("POST /v1/auth/recovery-permit/cancel"), guarded(async (request, reply) => {
    const input = parse(link, request.body, reply);
    if (!input) return reply;
    return reply.send(await service.cancel(input, o.source(request)));
  }));
  api.post("/v1/auth/recovery-permit/finish/status", o.policy("POST /v1/auth/recovery-permit/finish/status"), guarded(async (request, reply) => {
    const input = parse(link, request.body, reply);
    if (!input) return reply;
    return reply.send(await service.prepareFinish(input, o.source(request)));
  }));
  api.post("/v1/auth/recovery-permit/finish", o.policy("POST /v1/auth/recovery-permit/finish"), guarded(async (request, reply) => {
    const input = parse(RecoveryPermitProofRequestSchema, request.body, reply);
    if (!input) return reply;
    return reply.send(await service.finish(input, o.source(request)));
  }));
}
