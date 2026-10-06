import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import type { AuthSourceContext } from "@debateai/db";
import { PasswordResetStartRequestSchema, PasswordResetLinkRequestSchema, PasswordResetCompleteRequestSchema, PasswordResetEmptyRequestSchema } from "@debateai/contract";
import { PasswordResetError, type PasswordResetApplication } from "./password-reset.js";
export const passwordResetPolicyInventory = [
  { route: "POST /v1/auth/password-reset/start", auth: "public", origin: "trusted", resource: "identity", action: "start-password-reset" },
  { route: "POST /v1/auth/password-reset/exchange", auth: "public", origin: "trusted", resource: "identity", action: "exchange-password-reset" },
  { route: "GET /v1/auth/password-reset/status", auth: "public", resource: "identity", action: "read-password-reset" },
  { route: "POST /v1/auth/password-reset/complete", auth: "public", origin: "trusted", resource: "identity", action: "complete-password-reset" },
  { route: "POST /v1/auth/password-reset/cancel", auth: "public", origin: "trusted", resource: "identity", action: "cancel-password-reset" },
  { route: "POST /v1/auth/password-reset/cancel-current", auth: "public", origin: "trusted", resource: "identity", action: "cancel-current-password-reset" }
] as const;
type Route = typeof passwordResetPolicyInventory[number]["route"];
const cookieName = "__Host-debateai-password-reset", csrfName = "__Host-debateai-password-reset-csrf", csrfHeader = "x-password-reset-csrf-token", bearer = /^[A-Za-z0-9_-]{43}$/;
function cookie(header: unknown, name: string): string | null {
  if (typeof header !== "string")
    return null;
  const values = header.split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  if (values.length !== 1)
    return null;
  const value = values[0]!.slice(name.length + 1);
  return bearer.test(value) ? value : null;
}
export function registerPasswordResetRoutes(api: FastifyInstance, options: Readonly<{
  service: PasswordResetApplication;
  policy: (route: Route) => RouteShorthandOptions;
  source: (request: FastifyRequest) => AuthSourceContext;
  admitStart: (request: FastifyRequest, reply: FastifyReply) => boolean;
}>) {
  const guarded = (operation: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "no-store");
    try {
      return await operation(request, reply);
    }
    catch (error) {
      const code = error instanceof PasswordResetError ? error.code : "PASSWORD_RESET_UNAVAILABLE";
      const status = code === "PASSWORD_RESET_CSRF_INVALID" ? 403 : code === "PASSWORD_RESET_RATE_LIMITED" ? 429 : code === "PASSWORD_RESET_PROOF_INVALID" ? 401 : code === "PASSWORD_RESET_PASSWORD_INVALID" ? 400 : code === "PASSWORD_RESET_INVALID" ? 410 : 503;
      return reply.status(status).send({ error: code });
    }
  };
  const parse = <T,>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null => {
    const result = schema.safeParse(body);
    if (!result.success) {
      void reply.status(400).send({ error: "PASSWORD_RESET_INPUT_INVALID" });
      return null;
    }
    return result.data;
  };
  const session = async (request: FastifyRequest, reply: FastifyReply, mutating: boolean): Promise<string | null> => {
    const value = cookie(request.headers.cookie, cookieName);
    if (value === null) {
      void reply.status(401).send({ error: "PASSWORD_RESET_INVALID" });
      return null;
    }
    if (mutating) {
      const supplied = request.headers[csrfHeader], stored = cookie(request.headers.cookie, csrfName);
      if (typeof supplied !== "string" || stored === null || !bearer.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(stored))) {
        void reply.status(403).send({ error: "PASSWORD_RESET_CSRF_INVALID" });
        return null;
      }
      await options.service.assertCsrf(value, supplied);
    }
    return value;
  };
  api.post("/v1/auth/password-reset/start", options.policy("POST /v1/auth/password-reset/start"), guarded(async (request, reply) => {
    const body = parse(PasswordResetStartRequestSchema, request.body, reply);
    if (body === null || !options.admitStart(request, reply))
      return reply;
    return reply.status(202).send(await options.service.start(body, options.source(request)));
  }));
  api.post("/v1/auth/password-reset/exchange", options.policy("POST /v1/auth/password-reset/exchange"), guarded(async (request, reply) => {
    const body = parse(PasswordResetLinkRequestSchema, request.body, reply);
    if (body === null)
      return reply;
    const result = await options.service.exchange(body, options.source(request)), maxAge = Math.min(1800, Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)));
    reply.header("set-cookie", [`${cookieName}=${result.sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`, `${csrfName}=${result.csrfToken}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict`]);
    return reply.send(result.state);
  }));
  api.get("/v1/auth/password-reset/status", options.policy("GET /v1/auth/password-reset/status"), guarded(async (request, reply) => {
    const value = await session(request, reply, false);
    if (value === null)
      return reply;
    return reply.send(await options.service.status({ sessionToken: value }));
  }));
  api.post("/v1/auth/password-reset/complete", options.policy("POST /v1/auth/password-reset/complete"), guarded(async (request, reply) => {
    const body = parse(PasswordResetCompleteRequestSchema, request.body, reply);
    if (body === null)
      return reply;
    const value = await session(request, reply, true);
    if (value === null)
      return reply;
    return reply.send(await options.service.complete({ ...body, sessionToken: value }, options.source(request)));
  }));
  api.post("/v1/auth/password-reset/cancel-current", options.policy("POST /v1/auth/password-reset/cancel-current"), guarded(async (request, reply) => {
    if (parse(PasswordResetEmptyRequestSchema, request.body, reply) === null)
      return reply;
    const value = await session(request, reply, true);
    if (value === null)
      return reply;
    return reply.send(await options.service.cancelSession({ sessionToken: value }, options.source(request)));
  }));
  api.post("/v1/auth/password-reset/cancel", options.policy("POST /v1/auth/password-reset/cancel"), guarded(async (request, reply) => {
    const body = parse(PasswordResetLinkRequestSchema, request.body, reply);
    if (body === null)
      return reply;
    return reply.send(await options.service.cancel(body, options.source(request)));
  }));
  // The original scoped cookie remains until its original TTL for read-only
  // terminal receipts. Lost response bodies must not erase reconciliation.
}
