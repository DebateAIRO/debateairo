import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AnswerSchema,
  AnswerIndexSchema,
  AskAcceptedSchema,
  AskRequestSchema,
  DeploymentSchema,
  EventTypeSchema,
  ExecutionLedgerDigestSchema,
  InspectionSchema,
  InvestigationAcceptedSchema,
  InvestigationRequestSchema,
  NodeSchema,
  PublicationTransitionSchema,
  PublicDebateListSchema,
  PublicDebateSchema,
  PublishDebateRequestSchema,
  RunEventSchema,
  RunProjectionSchema,
  SessionSchema,
  StepUpAuthorizationRequestSchema,
  UnpublishDebateRequestSchema,
  type Answer,
  type AnswerIndex,
  type AskAccepted,
  type AskRequest,
  type Deployment,
  type ExecutionLedgerDigest,
  type Inspection,
  type InvestigationAccepted,
  type Node,
  type RunProjection,
  type Session
} from "@debateai/contract";
import type { Pool } from "pg";
import { createInitialBatteryRows, SplitLifecycleProjection, WorkItemRepository } from "@debateai/battery";
import {
  RunRepository,
  type DiscoveredPanelMember,
  type RunOwnershipAccess
} from "@debateai/db";
import { ServeRepository, type MemoryQuestionRegistration } from "@debateai/serve";
import { applyCriticUnavailableCap, assertMakerAdmission } from "@debateai/critique";
import { TypedDomainError, type RiskTier, type TierSource } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import type {
  EvaluatorConsumerSelectionResult,
  EvaluatorDevMenuView
} from "@debateai/evaluator";
import { Argon2InfrastructureError } from "@debateai/crypto";
import {
  AUTH_RETRYABLE_UNAVAILABLE_CODE,
  AuthFlowError,
  type RegistrationApplication
} from "./registration.js";
import type { MfaApplication } from "./mfa.js";
import type { AuthenticatedSession, SessionApplication } from "./sessions.js";
import type { PublicationApplication } from "./publications.js";
import { normalizeClientIp, TRUSTED_UI_PROXY_NETWORKS } from "./client-ip.js";

type RouteAuthPolicy = "public" | "user" | "operator";
type RouteOriginPolicy = "trusted";

export const authorizationPolicyInventory = Object.freeze([
  { route: "POST /v1/auth/register", auth: "public", resource: "identity", action: "register" },
  { route: "POST /v1/auth/verify-email", auth: "public", resource: "identity", action: "verify-email" },
  { route: "POST /v1/auth/resend-verification", auth: "public", resource: "identity", action: "resend-verification" },
  { route: "POST /v1/auth/mfa/totp/begin", auth: "public", resource: "identity", action: "begin-totp" },
  { route: "POST /v1/auth/mfa/totp/verify", auth: "public", resource: "identity", action: "verify-totp" },
  { route: "POST /v1/auth/mfa/recovery-codes/generate", auth: "public", resource: "identity", action: "generate-recovery-codes" },
  { route: "POST /v1/auth/mfa/recovery-codes/confirm", auth: "public", resource: "identity", action: "confirm-recovery-code" },
  { route: "POST /v1/auth/login", auth: "public", origin: "trusted", resource: "identity", action: "login" },
  { route: "POST /v1/auth/logout", auth: "user", resource: "session-self", action: "logout" },
  { route: "GET /v1/auth/sessions", auth: "user", resource: "session-owner", action: "list" },
  { route: "DELETE /v1/auth/sessions/{id}", auth: "user", resource: "session-owner", action: "revoke" },
  { route: "DELETE /v1/auth/sessions", auth: "user", resource: "session-owner", action: "revoke-all" },
  { route: "POST /v1/auth/step-up", auth: "user", resource: "session-self", action: "step-up" },
  { route: "GET /v1/public/debates", auth: "public", resource: "public-debate", action: "list" },
  { route: "GET /v1/public/debates/{id}", auth: "public", resource: "public-debate", action: "read" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },
  { route: "GET /v1/session", auth: "user", resource: "session-self", action: "read" },
  { route: "GET /v1/deployment", auth: "operator", resource: "deployment", action: "read" },
  { route: "GET /v1/dev/evaluator", auth: "operator", resource: "evaluator", action: "read" },
  { route: "POST /v1/dev/evaluator/consumer-selection", auth: "operator", resource: "evaluator", action: "select-consumer" },
  { route: "GET /v1/answers", auth: "user", resource: "run-owner", action: "list" },
  { route: "GET /v1/answers/{id}", auth: "user", resource: "run-owner", action: "read-answer" },
  { route: "GET /v1/answers/{id}/inspection", auth: "user", resource: "run-owner", action: "read-inspection" },
  { route: "GET /v1/answers/{id}/nodes/{nodeId}", auth: "user", resource: "run-owner", action: "read-node" },
  { route: "GET /v1/answers/{id}/ledger-digest", auth: "user", resource: "run-owner", action: "read-ledger-digest" },
  { route: "POST /v1/answers/{id}/investigations/{gapRef}", auth: "user", resource: "run-owner", action: "investigate" },
  { route: "POST /v1/answers/{id}/memory-link/unlink", auth: "user", resource: "run-owner", action: "unlink-memory" },
  { route: "GET /v1/runs/{id}", auth: "user", resource: "run-owner", action: "read-run" },
  { route: "GET /v1/runs/{id}/visibility", auth: "user", resource: "run-owner", action: "read-visibility" },
  { route: "GET /v1/runs/{id}/events", auth: "user", resource: "run-owner", action: "read-events" },
  { route: "GET /v1/runs/{id}/answer", auth: "user", resource: "run-owner", action: "read-run-answer" },
  { route: "POST /v1/runs/{id}/publish", auth: "user", resource: "run-owner", action: "publish" },
  { route: "POST /v1/runs/{id}/unpublish", auth: "user", resource: "run-owner", action: "unpublish" }
] as const satisfies readonly Readonly<{
  route: string;
  auth: RouteAuthPolicy;
  origin?: RouteOriginPolicy;
  resource: "identity" | "session-self" | "session-owner" | "run-owner" | "public-debate" | "deployment" | "evaluator";
  action: string;
}>[]);

type AuthorizationRoute = typeof authorizationPolicyInventory[number]["route"];
const authorizationPolicies = new Map<string, typeof authorizationPolicyInventory[number]>(
  authorizationPolicyInventory.map((policy) => [policy.route, policy])
);

function routePolicy(route: AuthorizationRoute): { readonly config: {
  readonly auth: RouteAuthPolicy;
  readonly origin?: RouteOriginPolicy;
} } {
  const policy = authorizationPolicies.get(route);
  if (policy === undefined) throw new TypeError(`AUTHORIZATION_POLICY_UNDECLARED:${route}`);
  return Object.freeze({
    config: Object.freeze({
      auth: policy.auth,
      ...("origin" in policy ? { origin: policy.origin } : {})
    })
  });
}

function canonicalRoute(method: string, url: string): string {
  return `${method.toUpperCase()} ${url.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}")}`;
}

export const SESSION_COOKIE_NAME = "__Host-debateai-session" as const;
export const CSRF_COOKIE_NAME = "__Host-debateai-csrf" as const;
const SESSION_IDLE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ResourceIdSchema = z.uuid();
const SessionIdSchema = ResourceIdSchema;
const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
});

declare module "fastify" {
  interface FastifyContextConfig {
    auth?: RouteAuthPolicy;
    origin?: RouteOriginPolicy;
  }

  interface FastifyRequest {
    session: Session;
    authenticatedSession?: AuthenticatedSession;
    cookieRefresh?: Readonly<{ sessionToken: string; csrfToken: string | null }>;
  }
}

export interface AskApplication {
  submit(ask: AskRequest, session: Session, principal: AskPrincipal): Promise<AskAccepted>;
  readAnswer(answerId: string, session: Session, version: number | undefined, ownership: RunOwnershipAccess): Promise<Answer | null>;
  readRunAnswer(runId: string, session: Session, ownership: RunOwnershipAccess): Promise<Answer | null>;
  readRun(runId: string, session: Session, ownership: RunOwnershipAccess): Promise<RunProjection | null>;
  readAnswerIndex(session: Session, limit: number, offset: number, ownership: RunOwnershipAccess): Promise<AnswerIndex>;
  readInspection(answerId: string, session: Session, version: number | undefined, ownership: RunOwnershipAccess): Promise<Inspection | null>;
  readLedgerDigest(answerId: string, session: Session, ownership: RunOwnershipAccess): Promise<ExecutionLedgerDigest | null>;
  readNode(answerId: string, nodeId: string, session: Session, ownership: RunOwnershipAccess): Promise<Node | null>;
  recordInvestigation(answerId: string, gapRef: string, userInput: string | null, session: Session, ownership: RunOwnershipAccess): Promise<InvestigationAccepted | null>;
  unlinkMemoryLink(answerId: string, session: Session, ownership: RunOwnershipAccess): Promise<{ readonly memory_link_id: string; readonly state: "UNLINKED" } | null>;
  readDeployment(session: Session): Promise<Deployment>;
  events(runId: string, session: Session, ownership: RunOwnershipAccess): AsyncIterable<unknown>;
}

export type AskPrincipal =
  | Readonly<{ readonly kind: "server"; readonly userId: string; readonly ownerRef: string }>
  | Readonly<{ readonly kind: "legacy"; readonly legacyAskerId: string }>;

export interface ApiOptions {
  readonly application: AskApplication;
  readonly registration?: RegistrationApplication;
  readonly mfa?: MfaApplication;
  readonly sessions?: SessionApplication;
  readonly publications?: PublicationApplication;
  readonly allowedOrigin?: string;
  readonly legacyDevSessionResolver?: LegacyDevSessionResolver;
  readonly evaluatorDevMenu?: EvaluatorDevMenuApplication;
  readonly evaluatorDevMenuRegisterVersion?: number;
  readonly evaluatorDevMenuClock?: () => Date;
}

export type LegacyDevSessionResolver = (token: unknown) => Session | null;

/**
 * S9 rollback boundary: only an explicitly configured, exact credential can
 * resolve. Cookie presence always suppresses this fallback in the HTTP hook.
 */
export function createLegacyDevSessionResolver(input: Readonly<{
  userToken?: string;
  operatorToken?: string;
}>): LegacyDevSessionResolver {
  const configured = Object.freeze([
    ...(input.userToken === undefined ? [] : [{ token: input.userToken, scope: "ASKER" as const }]),
    ...(input.operatorToken === undefined ? [] : [{ token: input.operatorToken, scope: "OPERATOR" as const }])
  ].map((entry) => Object.freeze({
    digest: createHash("sha256").update(entry.token, "utf8").digest(),
    scope: entry.scope
  })));
  return (token: unknown): Session | null => {
    if (typeof token !== "string" || token.length === 0) return null;
    const digest = createHash("sha256").update(token, "utf8").digest();
    const match = configured.find((entry) => timingSafeEqual(entry.digest, digest));
    if (match === undefined) return null;
    const tokenDigest = digest.toString("hex");
    return SessionSchema.parse({
      asker_id: `asker:${tokenDigest}`,
      session_id: `legacy:${tokenDigest}`,
      caller_scope: match.scope,
      ownership_provenance: match.scope === "OPERATOR" ? "operator_dev_token" : "user_dev_token",
      provisional_identity_model: true
    });
  };
}

export interface EvaluatorDevMenuApplication {
  readView(registerVersion: number): Promise<EvaluatorDevMenuView>;
  selectConsumerModel(input: {
    readonly modelId: string;
    readonly selectedBy: string;
    readonly orderRef: string;
    readonly selectedAt: Date;
  }): Promise<EvaluatorConsumerSelectionResult>;
}

/**
 * Marks a domain error that was observed while evaluating whether an ask may
 * be admitted. Typed errors from deployment reads or persistence deliberately
 * do not receive this marker and therefore remain internal failures.
 */
export class AskRefusal extends Error {
  readonly code: string;

  constructor(refusal: TypedDomainError) {
    super(refusal.message);
    this.name = "AskRefusal";
    this.code = refusal.code;
  }
}

class MalformedRequestError extends Error {
  constructor(error: Error) {
    super(error.message);
    this.name = "MalformedRequestError";
  }
}

function parseRequest<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new MalformedRequestError(error);
    }
    throw error;
  }
}

function markAskRefusal(error: unknown): never {
  if (error instanceof TypedDomainError) throw new AskRefusal(error);
  throw error;
}

function exactCookie(raw: unknown, name: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || /[\r\n\0]/.test(raw)) return null;
  const matches: string[] = [];
  for (const member of raw.split(";")) {
    const index = member.indexOf("=");
    if (index < 1) continue;
    if (member.slice(0, index).trim() === name) matches.push(member.slice(index + 1).trim());
  }
  return matches.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(matches[0]!) ? matches[0]! : null;
}

function exactOrigin(value: unknown, allowedOrigin: string | undefined): boolean {
  return typeof value === "string" && allowedOrigin !== undefined
    && !value.includes(",") && value === allowedOrigin;
}

function exactCsrfPair(header: unknown, cookie: string | null): string | null {
  if (typeof header !== "string" || cookie === null || !/^[A-Za-z0-9_-]{43}$/.test(header)) return null;
  const headerBytes = Buffer.from(header, "utf8");
  const cookieBytes = Buffer.from(cookie, "utf8");
  return headerBytes.byteLength === cookieBytes.byteLength && timingSafeEqual(headerBytes, cookieBytes)
    ? header : null;
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function csrfCookie(value: string, maxAgeSeconds: number): string {
  return `${CSRF_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAgeSeconds}; Secure; SameSite=Lax`;
}

function expiredCookies(): readonly string[] {
  const expired = "Thu, 01 Jan 1970 00:00:00 GMT";
  return Object.freeze([
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=${expired}; HttpOnly; Secure; SameSite=Lax`,
    `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=${expired}; Secure; SameSite=Lax`
  ]);
}

function refreshedCookies(input: Readonly<{
  sessionToken: string;
  csrfToken: string | null;
}>): readonly string[] {
  return Object.freeze([
    sessionCookie(input.sessionToken, SESSION_IDLE_MAX_AGE_SECONDS),
    ...(input.csrfToken === null ? [] : [csrfCookie(input.csrfToken, SESSION_IDLE_MAX_AGE_SECONDS)])
  ]);
}

export function buildApi(options: ApiOptions): FastifyInstance {
  const allowedOrigin = options.allowedOrigin === undefined
    ? undefined : new URL(options.allowedOrigin).origin;
  const api = Fastify({
    logger: false,
    trustProxy: [...TRUSTED_UI_PROXY_NETWORKS],
    exposeHeadRoutes: false
  });
  api.addHook("onRoute", (route) => {
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      const key = canonicalRoute(method, route.url);
      const policy = authorizationPolicies.get(key);
      if (policy === undefined
        || route.config?.auth !== policy.auth
        || route.config?.origin !== ("origin" in policy ? policy.origin : undefined)) {
        throw new TypeError(`AUTHORIZATION_POLICY_UNDECLARED:${key}`);
      }
    }
  });
  api.decorateRequest("session");
  api.decorateRequest("authenticatedSession");
  api.decorateRequest("cookieRefresh");
  const sourceFor = (request: {
    readonly ip: string;
    readonly id: string;
    readonly headers: Readonly<Record<string, unknown>>;
    readonly raw: { readonly socket: { readonly remoteAddress: string | undefined } };
  }) => Object.freeze({
    // Registration, MFA and sessions share T2's one canonical public source.
    ip: normalizeClientIp(request.ip)
      ?? normalizeClientIp(request.raw.socket.remoteAddress)
      ?? "unknown",
    userAgent: typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"] as string
      : "unknown",
    requestId: request.id
  });
  const ownershipFor = (request: Readonly<{
    session: Session;
    authenticatedSession?: AuthenticatedSession;
  }>): RunOwnershipAccess => request.authenticatedSession === undefined
    ? Object.freeze({ ownerRef: null, legacyAskerId: request.session.asker_id })
    : Object.freeze({ ownerRef: request.authenticatedSession.ownerRef, legacyAskerId: null });
  api.addHook("onSend", async (request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    reply.header("cache-control", "no-store");
    // Reissue the same opaque generation after successful cookie auth so the
    // browser transport observes the ruled sliding 14-day idle lifetime. The
    // conditional database refresh remains the sole authorization decision,
    // and route-level rotation/deletion headers take precedence here.
    if (request.cookieRefresh !== undefined && reply.getHeader("set-cookie") === undefined) {
      reply.header("set-cookie", refreshedCookies(request.cookieRefresh));
    }
    return payload;
  });
  api.addHook("preHandler", async (request, reply) => {
    if (request.is404) return;
    const authPolicy = request.routeOptions.config.auth;
    if (authPolicy === "public") {
      if (request.routeOptions.config.origin === "trusted"
        && !exactOrigin(request.headers.origin, allowedOrigin)) {
        return reply.status(403).send({ error: "CSRF_VALIDATION_FAILED" });
      }
      return;
    }
    if (authPolicy !== "user" && authPolicy !== "operator") {
      return reply.status(401).send({ error: "SESSION_REQUIRED" });
    }
    const rawCookie = request.headers.cookie;
    const cookieWasPresented = typeof rawCookie === "string"
      && rawCookie.split(";").some((member) => member.trimStart().startsWith(`${SESSION_COOKIE_NAME}=`));
    const legacyWasPresented = typeof request.headers["x-user-dev-token"] === "string";
    if (cookieWasPresented && legacyWasPresented) {
      return reply.status(401).send({ error: "SESSION_REQUIRED" });
    }
    if (cookieWasPresented) {
      const sessionToken = exactCookie(rawCookie, SESSION_COOKIE_NAME);
      const authenticated = sessionToken === null || options.sessions === undefined
        ? null : await options.sessions.authenticate(sessionToken, sourceFor(request));
      if (authenticated === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
      request.authenticatedSession = authenticated;
      request.session = authenticated.session;
      const csrfCookieToken = exactCookie(rawCookie, CSRF_COOKIE_NAME);
      if (MUTATING_METHODS.has(request.method)) {
        const csrf = exactCsrfPair(
          request.headers["x-csrf-token"], csrfCookieToken
        );
        if (!exactOrigin(request.headers.origin, allowedOrigin) || csrf === null
          || !options.sessions!.verifyCsrf(authenticated, csrf)) {
          return reply.status(403).send({ error: "CSRF_VALIDATION_FAILED" });
        }
      }
      request.cookieRefresh = Object.freeze({ sessionToken: sessionToken!, csrfToken: csrfCookieToken });
      if (authPolicy === "operator") {
        return reply.status(403).send({ error: "OPERATOR_REQUIRED" });
      }
      return;
    }
    const legacy = options.legacyDevSessionResolver?.(request.headers["x-user-dev-token"]) ?? null;
    if (legacy === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    request.session = legacy;
    if (authPolicy === "operator" && legacy.caller_scope !== "OPERATOR") {
      return reply.status(403).send({ error: "OPERATOR_REQUIRED" });
    }
  });
  api.setErrorHandler((error, _request, reply) => {
    if (reply.sent || reply.raw.headersSent) {
      // A streaming response has no lawful error envelope left to send. Abort
      // the one connection instead of fabricating a terminal SSE event (DR-115)
      // or letting Fastify attempt a second write and crash the process.
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        try {
          reply.raw.destroy();
        } catch {
          try {
            reply.raw.socket?.destroy();
          } catch {
            // The error handler must remain total even if the transport is
            // already tearing itself down.
          }
        }
      }
      return;
    }
    const knownError = error instanceof Error ? error : new Error(String(error));
    const malformed = knownError instanceof MalformedRequestError || knownError instanceof SyntaxError;
    const authFlow = knownError instanceof AuthFlowError;
    // Only an error marked at the ask-evaluation stage is a refusal. Register,
    // memory, sequence-allocation and other persistence faults remain 5xx even
    // when they happen behind POST /v1/asks (DR-115).
    const askRefusal = knownError instanceof AskRefusal;
    // A pool failure that reached this boundary without being typed by the auth
    // service still takes the one constant retryable envelope. It must never
    // fall through to the generic 500 branch, whose body is `knownError.message`
    // — for these that message IS the internal ARGON2_* code.
    const argon2Unavailable = knownError instanceof Argon2InfrastructureError;
    const statusCode = malformed ? 400
      : authFlow ? knownError.statusCode
        : argon2Unavailable ? 503
          : askRefusal ? 422 : 500;
    const errorCode = malformed
      ? "MALFORMED_REQUEST"
      : authFlow ? knownError.code
        : argon2Unavailable ? AUTH_RETRYABLE_UNAVAILABLE_CODE
          : askRefusal ? knownError.code : "INTERNAL_ERROR";
    return reply.status(statusCode).send({
      error: errorCode,
      message: statusCode >= 500 ? errorCode : knownError.message
    });
  });

  if (options.sessions !== undefined) {
    api.post("/v1/auth/login", routePolicy("POST /v1/auth/login"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown> : {};
      if (typeof body.challenge_token === "string") {
        const result = await options.sessions!.completeLogin({
          challengeToken: body.challenge_token,
          code: typeof body.code === "string" ? body.code : ""
        }, sourceFor(request));
        reply.header("set-cookie", [
          sessionCookie(result.sessionToken, SESSION_IDLE_MAX_AGE_SECONDS),
          csrfCookie(result.csrfToken, SESSION_IDLE_MAX_AGE_SECONDS)
        ]);
        return reply.send({
          status: result.status,
          csrf_token: result.csrfToken,
          session: result.session,
          ...(result.replacementRecoveryCode === undefined
            ? {} : { replacement_recovery_code: result.replacementRecoveryCode })
        });
      }
      const result = await options.sessions!.beginLogin({
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : ""
      }, sourceFor(request));
      return reply.status(202).send({ status: result.status, challenge_token: result.challengeToken });
    });
    api.post("/v1/auth/logout", routePolicy("POST /v1/auth/logout"), async (request, reply) => {
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
      await options.sessions!.logout(authenticated, sourceFor(request));
      reply.header("set-cookie", expiredCookies());
      return reply.status(204).send();
    });
    api.get("/v1/auth/sessions", routePolicy("GET /v1/auth/sessions"), async (request, reply) => {
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
      return reply.send({ sessions: await options.sessions!.listSessions(authenticated) });
    });
    api.delete<{ Params: { id: string } }>("/v1/auth/sessions/:id", routePolicy("DELETE /v1/auth/sessions/{id}"), async (request, reply) => {
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
      const parsedSessionId = SessionIdSchema.safeParse(request.params.id);
      if (!parsedSessionId.success) return reply.status(404).send({ error: "NOT_FOUND" });
      const revoked = await options.sessions!.revokeSession(authenticated, parsedSessionId.data, sourceFor(request));
      if (!revoked) return reply.status(404).send({ error: "NOT_FOUND" });
      if (parsedSessionId.data === authenticated.session.session_id) reply.header("set-cookie", expiredCookies());
      return reply.status(204).send();
    });
    api.delete("/v1/auth/sessions", routePolicy("DELETE /v1/auth/sessions"), async (request, reply) => {
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
      const revoked = await options.sessions!.revokeAllSessions(authenticated, sourceFor(request));
      reply.header("set-cookie", expiredCookies());
      return reply.send({ revoked });
    });
    api.post("/v1/auth/step-up", routePolicy("POST /v1/auth/step-up"), async (request, reply) => {
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown> : {};
      const authorization = body.authorization === undefined
        ? undefined
        : parseRequest(StepUpAuthorizationRequestSchema, body.authorization);
      const rotated = await options.sessions!.stepUp({
        session: authenticated,
        password: typeof body.password === "string" ? body.password : "",
        code: typeof body.code === "string" ? body.code : "",
        ...(authorization === undefined ? {} : { authorization: {
          action: authorization.action,
          targetRunId: authorization.target_run_id
        } })
      }, sourceFor(request));
      reply.header("set-cookie", [
        sessionCookie(rotated.sessionToken, SESSION_IDLE_MAX_AGE_SECONDS),
        csrfCookie(rotated.csrfToken, SESSION_IDLE_MAX_AGE_SECONDS)
      ]);
      return reply.send({
        status: "step_up_complete",
        csrf_token: rotated.csrfToken,
        ...(authorization === undefined
          || rotated.grantToken === undefined
          || rotated.grantExpiresAt === undefined
          ? {}
          : { step_up_grant: {
              token: rotated.grantToken,
              action: authorization.action,
              target_run_id: authorization.target_run_id,
              expires_at: rotated.grantExpiresAt.toISOString()
            } })
      });
    });
  }

  api.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/v1/public/debates",
    routePolicy("GET /v1/public/debates"),
    async (request, reply) => {
      const limit = Number(request.query.limit);
      const offset = Number(request.query.offset);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100
        || !Number.isInteger(offset) || offset < 0) {
        return reply.status(400).send({ error: "MALFORMED_REQUEST" });
      }
      if (options.publications === undefined) {
        return reply.send(PublicDebateListSchema.parse({ items: [], total: 0 }));
      }
      return reply.send(PublicDebateListSchema.parse(
        await options.publications.list(limit, offset)
      ));
    }
  );

  api.get<{ Params: { id: string } }>(
    "/v1/public/debates/:id",
    routePolicy("GET /v1/public/debates/{id}"),
    async (request, reply) => {
      const publicationRef = ResourceIdSchema.safeParse(request.params.id);
      if (!publicationRef.success || options.publications === undefined) {
        return reply.status(404).send({ error: "DEBATE_NOT_FOUND" });
      }
      const debate = await options.publications.readPublicDebate(publicationRef.data);
      return debate === null
        ? reply.status(404).send({ error: "DEBATE_NOT_FOUND" })
        : reply.send(PublicDebateSchema.parse(debate));
    }
  );
  if (options.registration !== undefined) {
    api.post("/v1/auth/register", routePolicy("POST /v1/auth/register"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      const response = await options.registration!.register({
        email: typeof body.email === "string" ? body.email : "",
        password: typeof body.password === "string" ? body.password : "",
        recoveryEmail: typeof body.recovery_email === "string" ? body.recovery_email : "",
        adultAffirmed: body.adult_affirmed === true
      }, sourceFor(request));
      return reply.status(202).send(response);
    });
    api.post("/v1/auth/verify-email", routePolicy("POST /v1/auth/verify-email"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      const response = await options.registration!.verifyEmail({
        token: typeof body.token === "string" ? body.token : ""
      }, sourceFor(request));
      return reply.send(response);
    });
    api.post("/v1/auth/resend-verification", routePolicy("POST /v1/auth/resend-verification"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      const response = await options.registration!.resendVerification({
        email: typeof body.email === "string" ? body.email : ""
      }, sourceFor(request));
      return reply.status(202).send(response);
    });
  }

  if (options.mfa !== undefined) {
    api.post("/v1/auth/mfa/totp/begin", routePolicy("POST /v1/auth/mfa/totp/begin"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      return reply.send(await options.mfa!.beginTotp({
        enrollmentToken: typeof body.enrollment_token === "string" ? body.enrollment_token : ""
      }, sourceFor(request)));
    });
    api.post("/v1/auth/mfa/totp/verify", routePolicy("POST /v1/auth/mfa/totp/verify"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      return reply.send(await options.mfa!.verifyTotp({
        enrollmentToken: typeof body.enrollment_token === "string" ? body.enrollment_token : "",
        code: typeof body.code === "string" ? body.code : ""
      }, sourceFor(request)));
    });
    api.post("/v1/auth/mfa/recovery-codes/generate", routePolicy("POST /v1/auth/mfa/recovery-codes/generate"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      return reply.send(await options.mfa!.generateRecoveryCodes({
        enrollmentToken: typeof body.enrollment_token === "string" ? body.enrollment_token : ""
      }, sourceFor(request)));
    });
    api.post("/v1/auth/mfa/recovery-codes/confirm", routePolicy("POST /v1/auth/mfa/recovery-codes/confirm"), async (request, reply) => {
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Record<string, unknown>
        : {};
      return reply.send(await options.mfa!.confirmRecoveryCode({
        enrollmentToken: typeof body.enrollment_token === "string" ? body.enrollment_token : "",
        recoveryCode: typeof body.recovery_code === "string" ? body.recovery_code : ""
      }, sourceFor(request)));
    });
  }

  api.get("/v1/session", routePolicy("GET /v1/session"), async (request, reply) => {
    return reply.send(request.session);
  });

  api.get("/v1/deployment", routePolicy("GET /v1/deployment"), async (request, reply) => {
    return reply.send(DeploymentSchema.parse(await options.application.readDeployment(request.session)));
  });

  if (options.evaluatorDevMenu !== undefined) {
    if (!Number.isInteger(options.evaluatorDevMenuRegisterVersion)
      || options.evaluatorDevMenuRegisterVersion! < 1) {
      throw new TypeError("EVALUATOR_DEV_MENU_REGISTER_VERSION_REQUIRED");
    }
    api.get("/v1/dev/evaluator", routePolicy("GET /v1/dev/evaluator"), async (_request, reply) => {
      return reply.send(await options.evaluatorDevMenu!.readView(options.evaluatorDevMenuRegisterVersion!));
    });

    api.post("/v1/dev/evaluator/consumer-selection", routePolicy("POST /v1/dev/evaluator/consumer-selection"), async (request, reply) => {
      const body = request.body;
      if (typeof body !== "object" || body === null || !("model_id" in body)
        || typeof body.model_id !== "string" || body.model_id.trim() === "") {
        return reply.status(400).send({ error: "MALFORMED_REQUEST" });
      }
      try {
        const selection = await options.evaluatorDevMenu!.selectConsumerModel({
          modelId: body.model_id,
          selectedBy: request.session.asker_id,
          orderRef: `dev-menu:${request.session.session_id}`,
          selectedAt: options.evaluatorDevMenuClock?.() ?? new Date()
        });
        return reply.status(201).send(selection);
      } catch (error) {
        if (error instanceof TypedDomainError && [
          "EVALUATOR_CATALOG_UNAVAILABLE",
          "EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED"
        ].includes(error.code)) {
          return reply.status(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    });
  }

  api.post("/v1/asks", routePolicy("POST /v1/asks"), async (request, reply) => {
    const ask = parseRequest(AskRequestSchema, request.body);
    const accepted = AskAcceptedSchema.parse(await options.application.submit(
      ask,
      request.session,
      request.authenticatedSession === undefined
        ? Object.freeze({ kind: "legacy" as const, legacyAskerId: request.session.asker_id })
        : Object.freeze({ kind: "server" as const, userId: request.authenticatedSession.userId,
          ownerRef: request.authenticatedSession.ownerRef })
    ));
    return reply.status(202).send(accepted);
  });

  api.get<{ Querystring: { limit?: string; offset?: string } }>("/v1/answers", routePolicy("GET /v1/answers"), async (request, reply) => {
    const limit = Number(request.query.limit);
    const offset = Number(request.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    return reply.send(AnswerIndexSchema.parse(await options.application.readAnswerIndex(
      request.session, limit, offset, ownershipFor(request)
    )));
  });

  api.get<{ Params: { id: string }; Querystring: { version?: string } }>("/v1/answers/:id", routePolicy("GET /v1/answers/{id}"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    if (!answerId.success) return reply.status(404).send({ error: "ANSWER_NOT_FOUND" });
    const rawVersion = request.query.version;
    const version = rawVersion === undefined ? undefined : Number(rawVersion);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    const answer = await options.application.readAnswer(
      answerId.data, request.session, version, ownershipFor(request)
    );
    return answer === null ? reply.status(404).send({ error: "ANSWER_NOT_FOUND" }) : reply.send(AnswerSchema.parse(answer));
  });

  api.get<{ Params: { id: string }; Querystring: { version?: string } }>("/v1/answers/:id/inspection", routePolicy("GET /v1/answers/{id}/inspection"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    if (!answerId.success) return reply.status(404).send({ error: "INSPECTION_NOT_FOUND" });
    const rawVersion = request.query.version;
    const version = rawVersion === undefined ? undefined : Number(rawVersion);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      return reply.status(400).send({ error: "MALFORMED_REQUEST" });
    }
    const inspection = await options.application.readInspection(
      answerId.data, request.session, version, ownershipFor(request)
    );
    return inspection === null
      ? reply.status(404).send({ error: "INSPECTION_NOT_FOUND" })
      : reply.send(InspectionSchema.parse(inspection));
  });

  api.get<{ Params: { id: string } }>("/v1/answers/:id/ledger-digest", routePolicy("GET /v1/answers/{id}/ledger-digest"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    if (!answerId.success) return reply.status(404).send({ error: "LEDGER_DIGEST_NOT_FOUND" });
    const digest = await options.application.readLedgerDigest(answerId.data, request.session, ownershipFor(request));
    return digest === null ? reply.status(404).send({ error: "LEDGER_DIGEST_NOT_FOUND" }) : reply.send(ExecutionLedgerDigestSchema.parse(digest));
  });

  api.get<{ Params: { id: string; nodeId: string } }>("/v1/answers/:id/nodes/:nodeId", routePolicy("GET /v1/answers/{id}/nodes/{nodeId}"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    const nodeId = ResourceIdSchema.safeParse(request.params.nodeId);
    if (!answerId.success || !nodeId.success) return reply.status(404).send({ error: "NODE_NOT_FOUND" });
    const node = await options.application.readNode(
      answerId.data, nodeId.data, request.session, ownershipFor(request)
    );
    return node === null ? reply.status(404).send({ error: "NODE_NOT_FOUND" }) : reply.send(NodeSchema.parse(node));
  });

  api.post<{ Params: { id: string; gapRef: string } }>("/v1/answers/:id/investigations/:gapRef", routePolicy("POST /v1/answers/{id}/investigations/{gapRef}"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    if (!answerId.success) return reply.status(404).send({ error: "INVESTIGATION_GAP_NOT_FOUND" });
    const input = parseRequest(InvestigationRequestSchema, request.body);
    const accepted = await options.application.recordInvestigation(
      answerId.data, request.params.gapRef, input.user_input, request.session, ownershipFor(request)
    );
    return accepted === null ? reply.status(404).send({ error: "INVESTIGATION_GAP_NOT_FOUND" }) : reply.status(202).send(InvestigationAcceptedSchema.parse(accepted));
  });

  api.get<{ Params: { id: string } }>("/v1/runs/:id/events", routePolicy("GET /v1/runs/{id}/events"), async (request, reply) => {
    const runId = ResourceIdSchema.safeParse(request.params.id);
    const ownership = ownershipFor(request);
    if (!runId.success || await options.application.readRun(runId.data, request.session, ownership) === null) {
      return reply.status(404).send({ error: "RUN_NOT_FOUND" });
    }
    reply.raw.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      ...(request.cookieRefresh === undefined
        ? {} : { "set-cookie": [...refreshedCookies(request.cookieRefresh)] }),
      connection: "keep-alive"
    });
    for await (const candidate of options.application.events(runId.data, request.session, ownership)) {
      const event = RunEventSchema.parse(candidate);
      reply.raw.write(`id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    reply.raw.end();
  });
  api.get<{ Params: { id: string } }>("/v1/runs/:id", routePolicy("GET /v1/runs/{id}"), async (request, reply) => {
    const runId = ResourceIdSchema.safeParse(request.params.id);
    if (!runId.success) return reply.status(404).send({ error: "RUN_NOT_FOUND" });
    const run = await options.application.readRun(runId.data, request.session, ownershipFor(request));
    return run === null ? reply.status(404).send({ error: "RUN_NOT_FOUND" }) : reply.send(RunProjectionSchema.parse(run));
  });
  api.get<{ Params: { id: string } }>(
    "/v1/runs/:id/visibility",
    routePolicy("GET /v1/runs/{id}/visibility"),
    async (request, reply) => {
      const runId = ResourceIdSchema.safeParse(request.params.id);
      const authenticated = request.authenticatedSession;
      if (!runId.success || authenticated === undefined || options.publications === undefined) {
        return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      }
      const visibility = await options.publications.readOwnedVisibility({
        runId: runId.data,
        authenticated
      });
      return visibility === null
        ? reply.status(404).send({ error: "RUN_NOT_FOUND" })
        : reply.send(PublicationTransitionSchema.parse(visibility));
    }
  );
  api.get<{ Params: { id: string } }>("/v1/runs/:id/answer", routePolicy("GET /v1/runs/{id}/answer"), async (request, reply) => {
    const runId = ResourceIdSchema.safeParse(request.params.id);
    if (!runId.success) return reply.status(404).send({ error: "ANSWER_NOT_SERVED" });
    const answer = await options.application.readRunAnswer(runId.data, request.session, ownershipFor(request));
    return answer === null ? reply.status(404).send({ error: "ANSWER_NOT_SERVED" }) : reply.send(AnswerSchema.parse(answer));
  });
  api.post<{ Params: { id: string } }>(
    "/v1/runs/:id/publish",
    routePolicy("POST /v1/runs/{id}/publish"),
    async (request, reply) => {
      const runId = ResourceIdSchema.safeParse(request.params.id);
      const authenticated = request.authenticatedSession;
      if (!runId.success || authenticated === undefined) {
        return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      }
      const input = parseRequest(PublishDebateRequestSchema, request.body);
      if (options.publications === undefined) {
        return reply.status(503).send({ error: "PUBLICATION_UNAVAILABLE" });
      }
      if (!await options.publications.preflightGrant({
        runId: runId.data,
        authenticated,
        grantToken: input.step_up_grant,
        action: "PUBLISH"
      })) return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      const answer = await options.application.readRunAnswer(
        runId.data,
        request.session,
        ownershipFor(request)
      );
      if (answer === null) return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      const published = await options.publications.publish({
        runId: runId.data,
        answer,
        authenticated,
        grantToken: input.step_up_grant,
        source: sourceFor(request)
      });
      return published === null
        ? reply.status(404).send({ error: "RUN_NOT_FOUND" })
        : reply.status(201).send(PublicationTransitionSchema.parse(published));
    }
  );
  api.post<{ Params: { id: string } }>(
    "/v1/runs/:id/unpublish",
    routePolicy("POST /v1/runs/{id}/unpublish"),
    async (request, reply) => {
      const runId = ResourceIdSchema.safeParse(request.params.id);
      const authenticated = request.authenticatedSession;
      if (!runId.success || authenticated === undefined) {
        return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      }
      const input = parseRequest(UnpublishDebateRequestSchema, request.body);
      if (options.publications === undefined) {
        return reply.status(503).send({ error: "PUBLICATION_UNAVAILABLE" });
      }
      if (!await options.publications.preflightGrant({
        runId: runId.data,
        authenticated,
        grantToken: input.step_up_grant,
        action: "UNPUBLISH"
      })) return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      const owned = await options.application.readRun(
        runId.data,
        request.session,
        ownershipFor(request)
      );
      if (owned === null) return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      const unpublished = await options.publications.unpublish({
        runId: runId.data,
        authenticated,
        grantToken: input.step_up_grant,
        source: sourceFor(request)
      });
      return unpublished === null
        ? reply.status(404).send({ error: "RUN_NOT_FOUND" })
        : reply.send(PublicationTransitionSchema.parse(unpublished));
    }
  );
  api.post<{ Params: { id: string } }>("/v1/answers/:id/memory-link/unlink", routePolicy("POST /v1/answers/{id}/memory-link/unlink"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    if (!answerId.success) return reply.status(404).send({ error: "MEMORY_LINK_NOT_FOUND" });
    const unlinked = await options.application.unlinkMemoryLink(
      answerId.data, request.session, ownershipFor(request)
    );
    return unlinked === null
      ? reply.status(404).send({ error: "MEMORY_LINK_NOT_FOUND" })
      : reply.send(unlinked);
  });
  return api;
}

export interface Dispatcher {
  dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void>;
}

export class HatchetDispatcher implements Dispatcher {
  constructor(
    private readonly client: Pick<Hatchet, "runNoWait">,
    private readonly workflowName: string
  ) {
    if (workflowName.trim().length === 0) throw new TypeError("Hatchet workflow name must be a register value");
  }

  async dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    await this.client.runNoWait(this.workflowName, {
      runId: input.runId,
      workItemId: input.workItemId
    }, {
      additionalMetadata: {
        v3RunId: input.runId,
        v3WorkItemId: input.workItemId,
        sourceOfRecord: "core.work_item"
      }
    });
  }
}

export interface RunCreationSettings {
  readonly strangerSampleRate: number;
  readonly registerVersion: number;
  readonly batteryVersion: string;
  readonly settlementWatchHandle: string;
  readonly memoryPullPolicy?: MemoryQuestionRegistration["pullPolicy"];
  readonly resolveDiscoveredPanel: () => Promise<readonly DiscoveredPanelMember[]>;
  readonly resolveEnvelopeBasis: (input: {
    readonly depthParams: Readonly<Record<string, unknown>>;
    readonly riskTier: RiskTier;
    readonly panelSize: number;
  }) => Promise<Readonly<Record<string, unknown>>>;
  readonly resolveRisk: (askerRiskTier: RiskTier, tierSource: AskRequest["tier_source"], provenanceRef: string) => {
    readonly effectiveRiskTier: RiskTier;
    readonly tierSource: TierSource;
    readonly tierProvenanceRef: string;
  };
}

export function preserveSubmittedTierSource<T extends { readonly tierSource: TierSource }>(
  resolved: T,
  submittedTierSource: AskRequest["tier_source"]
): Omit<T, "tierSource"> & { readonly tierSource: TierSource } {
  return {
    ...resolved,
    tierSource: resolved.tierSource === "DEPLOYMENT_POLICY"
      ? "DEPLOYMENT_POLICY"
      : submittedTierSource
  };
}

export async function evaluateAskAdmission(
  settings: RunCreationSettings,
  ask: AskRequest
): Promise<{
  readonly risk: ReturnType<RunCreationSettings["resolveRisk"]>;
  readonly envelopeBasis: Readonly<Record<string, unknown>>;
  readonly discoveredPanel: readonly DiscoveredPanelMember[];
  readonly criticUnavailableCap: ReturnType<typeof applyCriticUnavailableCap>;
}> {
  const risk = settings.resolveRisk(ask.risk_tier, ask.tier_source, ask.tier_provenance_ref);
  const discoveredPanel = await settings.resolveDiscoveredPanel();
  const makers = Object.freeze([...new Set(discoveredPanel.map((member) => member.maker))]);
  const makerAvailability = Object.freeze({
    deploymentMakerCapability: makers.length > 0,
    runMakerReachability: makers.length >= 2,
    classification: makers.length >= 2 ? "CAPABLE" as const : "TRANSIENT_OUTAGE" as const,
    configuredMakers: makers,
    reachedMakers: makers,
    registerRef: discoveredPanel.map((member) => member.probe_evidence_ref).join(",") || "provider_probe:empty"
  });
  try {
    assertMakerAdmission(risk.effectiveRiskTier, makerAvailability);
  } catch (error) {
    markAskRefusal(error);
  }
  let envelopeBasis: Readonly<Record<string, unknown>>;
  try {
    envelopeBasis = await settings.resolveEnvelopeBasis({
      depthParams: ask.depth_params,
      riskTier: risk.effectiveRiskTier,
      panelSize: discoveredPanel.length
    });
  } catch (error) {
    markAskRefusal(error);
  }
  return { risk, envelopeBasis, discoveredPanel, criticUnavailableCap: applyCriticUnavailableCap(makerAvailability) };
}

export class PostgresAskApplication implements AskApplication {
  readonly #runs: RunRepository;
  readonly #work: WorkItemRepository;
  readonly #serve: ServeRepository;
  readonly #splitLifecycle: Pick<SplitLifecycleProjection, "read">;
  readonly #liveness: LivenessRepository;

  constructor(
    private readonly pool: Pool,
    private readonly dispatcher: Dispatcher,
    private readonly settings: RunCreationSettings,
    splitLifecycle?: Pick<SplitLifecycleProjection, "read">
  ) {
    this.#runs = new RunRepository(pool);
    this.#work = new WorkItemRepository(pool);
    this.#serve = new ServeRepository(pool);
    this.#splitLifecycle = splitLifecycle ?? new SplitLifecycleProjection(pool);
    this.#liveness = new LivenessRepository(pool);
  }

  async submit(
    ask: AskRequest,
    session: Session,
    principal: AskPrincipal
  ): Promise<AskAccepted> {
    if (principal.kind === "server") {
      if (session.ownership_provenance !== "server_session" || session.asker_id !== `owner:${principal.ownerRef}`) {
        throw new TypedDomainError("RUN_PRINCIPAL_SESSION_MISMATCH", "The server session and opaque run owner must match");
      }
    } else if (session.ownership_provenance === "server_session" || session.asker_id !== principal.legacyAskerId) {
      throw new TypedDomainError("RUN_PRINCIPAL_SESSION_MISMATCH", "Legacy scope is valid only for an exact legacy session");
    }
    const ownership: RunOwnershipAccess = principal.kind === "legacy"
      ? Object.freeze({ ownerRef: null, legacyAskerId: principal.legacyAskerId })
      : Object.freeze({ ownerRef: principal.ownerRef, legacyAskerId: null });
    await this.#liveness.recordQuery(ask.question_line, ownership, new Date(ask.as_of));
    const { risk, envelopeBasis, discoveredPanel, criticUnavailableCap } = await evaluateAskAdmission(this.settings, ask);
    const runId = await this.#runs.startRun({
      questionLine: ask.question_line,
      principal,
      sessionId: session.session_id,
      callerScope: session.caller_scope,
      asOf: new Date(ask.as_of),
      askerRiskTier: ask.risk_tier,
      effectiveRiskTier: risk.effectiveRiskTier,
      tierSource: risk.tierSource,
      tierProvenanceRef: risk.tierProvenanceRef,
      compositionBudgetTier: ask.composition_budget_tier,
      depthParams: ask.depth_params,
      discoveredPanel,
      strangerSampleRate: this.settings.strangerSampleRate,
      envelopeBasis,
      registerVersion: this.settings.registerVersion,
      batteryVersion: this.settings.batteryVersion,
      askContract: {
        decision_scope: ask.decision_scope,
        steering_presets: ask.steering_presets,
        steering_annotations: ask.steering_annotations,
        critic_unavailable_cap: criticUnavailableCap
      },
      batteryRows: createInitialBatteryRows({ settlementWatchHandle: this.settings.settlementWatchHandle })
    });
    await this.#serve.recordMemoryQuestion({
      runId,
      questionLine: ask.question_line,
      callerScope: session.caller_scope,
      askerScope: session.asker_id,
      asOf: ask.as_of,
      policyVersion: this.settings.registerVersion,
      ...(this.settings.memoryPullPolicy === undefined ? {} : { pullPolicy: this.settings.memoryPullPolicy })
    }, ownership);
    const workItemId = await this.#work.enqueue({
      runId,
      batteryRowId: "Q1",
      nodeSet: [],
      commandKey: `S00:${runId}:Q1`
    });
    await this.dispatcher.dispatch({ runId, workItemId });
    return { run_ref: runId, status: "QUEUED" };
  }

  async unlinkMemoryLink(answerId: string, session: Session, ownership: RunOwnershipAccess): Promise<{ readonly memory_link_id: string; readonly state: "UNLINKED" } | null> {
    const result = await this.#serve.unlinkMemoryForAnswer(answerId, ownership, `asker:${session.asker_id}`);
    return result === null ? null : Object.freeze({ memory_link_id: result.memoryLinkId, state: "UNLINKED" });
  }

  readAnswer(answerId: string, _session: Session, version: number | undefined, ownership: RunOwnershipAccess): Promise<Answer | null> {
    return this.#serve.readAnswerProjection(answerId, ownership, version);
  }

  readRunAnswer(runId: string, _session: Session, ownership: RunOwnershipAccess): Promise<Answer | null> {
    return this.#serve.readRunAnswerProjection(runId, ownership);
  }

  async readRun(runId: string, _session: Session, ownership: RunOwnershipAccess): Promise<RunProjection | null> {
    const run = await this.#runs.readLoadingProjection(runId, ownership);
    return run === null ? null : RunProjectionSchema.parse({
      run_ref: run.runRef,
      question_line: run.questionLine,
      state: run.state,
      terminal_reason: run.terminalReason,
      hold_until: run.holdUntil?.toISOString() ?? null
    });
  }

  readAnswerIndex(_session: Session, limit: number, offset: number, ownership: RunOwnershipAccess): Promise<AnswerIndex> {
    return this.#serve.readAnswerIndex(ownership, limit, offset);
  }

  readInspection(answerId: string, _session: Session, version: number | undefined, ownership: RunOwnershipAccess): Promise<Inspection | null> {
    return this.#serve.readInspectionProjection(answerId, ownership, version);
  }

  readLedgerDigest(answerId: string, _session: Session, ownership: RunOwnershipAccess): Promise<ExecutionLedgerDigest | null> {
    return this.#serve.readExecutionLedgerDigest(answerId, ownership);
  }

  readNode(answerId: string, nodeId: string, _session: Session, ownership: RunOwnershipAccess): Promise<Node | null> {
    return this.#serve.readNodeProjection(answerId, nodeId, ownership);
  }

  recordInvestigation(answerId: string, gapRef: string, userInput: string | null, _session: Session, ownership: RunOwnershipAccess): Promise<InvestigationAccepted | null> {
    return this.#serve.recordInvestigationRequest({ answerId, gapRef, ownership, userInput });
  }

  async readDeployment(session: Session): Promise<Deployment> {
    const version = await this.pool.query<{ register_version: string }>(
      `SELECT register_version FROM register.register_version WHERE sealed ORDER BY register_version DESC LIMIT 1`
    );
    const registerVersion = Number(version.rows[0]?.register_version);
    if (!Number.isInteger(registerVersion) || registerVersion < 1) {
      throw new TypedDomainError("DEPLOYMENT_REGISTER_UNAVAILABLE", "No sealed V3 deployment register exists");
    }
    const [rows, scorecards, ledger] = await Promise.all([
      this.pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
        `SELECT row_key, value_json, source_ref FROM register.register_row
         WHERE register_version=$1 ORDER BY row_key`, [registerVersion]
      ),
      this.pool.query<{
        model_id: string; model_version: string; provider: string; task_class: string; metric: string;
        value: number | null; basis: Deployment["scorecards"][number]["basis"];
        derivation_hash: string; strategy_source_ref: string; as_of: Date;
      }>(
        `SELECT DISTINCT ON (model_id, model_version, provider, task_class, metric)
                model_id, model_version, provider, task_class, metric, value, basis,
                derivation_hash, strategy_source_ref, as_of
         FROM scorecard.scorecard_cell
         ORDER BY model_id, model_version, provider, task_class, metric, derivation_version DESC`
      ),
      this.pool.query<{
        task_class: string; model_id: string; model_version: string; provider: string; routing_decision_id: string;
      }>(
        `SELECT task_class, model_id, model_version, provider, routing_decision_id
         FROM scorecard.session_assignment WHERE session_id=$1 ORDER BY at_seq`, [session.session_id]
      )
    ]);
    return DeploymentSchema.parse({
      register: {
        register_version: registerVersion,
        rows: rows.rows.map((row) => ({ row_key: row.row_key, value: row.value_json, source_ref: row.source_ref }))
      },
      scorecards: scorecards.rows.map((row) => ({
        model_id: row.model_id, model_version: row.model_version, provider: row.provider,
        task_class: row.task_class, metric: row.metric,
        value: row.value === null ? null : Number(row.value), basis: row.basis,
        derivation_hash: row.derivation_hash, source_ref: row.strategy_source_ref,
        as_of: row.as_of.toISOString()
      })),
      model_ledger: ledger.rows.map((row) => ({
        task_class: row.task_class, model_id: row.model_id, model_version: row.model_version,
        provider: row.provider, routing_decision_ref: row.routing_decision_id
      })),
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    });
  }

  async *events(runId: string, _session: Session, ownership: RunOwnershipAccess): AsyncIterable<unknown> {
    const access = ownership;
    const [result, failedWork] = await Promise.all([this.pool.query<{
      event_id: string;
      kind: string;
      at_seq: string;
      value_json: unknown;
    }>(
      `SELECT event.event_id, event.kind, event.at_seq, event.value_json
       FROM core.run_progress_event AS event
       JOIN core.run AS run ON run.run_id = event.run_id
      WHERE event.run_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3) ORDER BY event.at_seq`,
      [runId, access.ownerRef, access.legacyAskerId]
    ), this.pool.query<{
      work_item_id: string;
      created_at_seq: string;
      terminal_reason: string;
    }>(
      `SELECT work.work_item_id, work.created_at_seq, work.terminal_reason
       FROM core.work_item AS work
       JOIN core.run AS run ON run.run_id = work.run_id
       WHERE work.run_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3) AND work.state = 'FAILED'
       ORDER BY work.created_at_seq`,
      [runId, access.ownerRef, access.legacyAskerId]
    )]);
    if (result.rows.length === 0 && failedWork.rows.length === 0) return;
    const projected = await this.#splitLifecycle.read(runId);
    // Lifecycle projection performs additional ungated reads. Revalidate after
    // every source snapshot and before yielding any bytes so a claim committed
    // between the stored-event query and projection cannot disclose data to the
    // superseded owner.
    const stillOwned = await this.pool.query<{ owned: boolean }>(
      `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
      [runId, access.ownerRef, access.legacyAskerId]
    );
    if (stillOwned.rows[0]?.owned !== true) return;
    const storedEvents = result.rows.flatMap((row) => {
      const direct = EventTypeSchema.safeParse(row.kind);
      const eventType = direct.success
        ? direct.data
        : row.kind === "PHASE" ? "run.running"
        : row.kind === "TERMINAL" ? "run.terminal"
        : row.kind === "ENVELOPE_STATE" && row.value_json !== "WITHIN" ? "honesty.budget_skip_marked"
        : null;
      if (eventType === null) return [];
      return [{
        event_id: row.event_id,
        event_type: eventType,
        run_ref: runId,
        at_sequence: Number(row.at_seq),
        payload: row.kind === "PHASE" ? { phase: row.value_json }
          : row.kind === "TERMINAL" ? { terminal: row.value_json }
          : row.kind === "ENVELOPE_STATE" ? { state: row.value_json }
          : typeof row.value_json === "object" && row.value_json !== null ? row.value_json as Record<string, unknown>
          : { value: row.value_json }
      }];
    });
    const events = [
      ...storedEvents,
      ...failedWork.rows.map((work) => ({
        event_id: work.work_item_id,
        event_type: "run.terminal" as const,
        run_ref: runId,
        at_sequence: Number(work.created_at_seq),
        payload: { state: "FAILED", reason: work.terminal_reason }
      })),
      ...projected.map((event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        run_ref: event.runRef,
        subject_ref: event.subjectRef,
        at_sequence: event.atSequence,
        payload: event.payload
      }))
    ].sort((left, right) => left.at_sequence - right.at_sequence);
    for (const event of events) yield event;
  }
}
