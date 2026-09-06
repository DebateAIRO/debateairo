import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupportConfigurationPort, SupportConfigurationState } from "@debateai/register";
import {
  createSupportSessionCapability,
  hashSupportCapability,
  type SupportSessionPort,
  type SupportSessionRecord
} from "./session.js";
import { supportTemplate, type SupportLanguage } from "./templates.js";

export const SUPPORT_ROUTE_PATHS = Object.freeze([
  "POST /v1/support/sessions",
  "GET /v1/support/sessions/{id}",
  "POST /v1/support/sessions/{id}/messages",
  "POST /v1/support/messages/{id}/rating",
  "POST /v1/support/sessions/{id}/escalate",
  "GET /v1/support/cases/{token}",
  "GET /v1/support/status"
] as const);

export type SupportRoutePath = typeof SUPPORT_ROUTE_PATHS[number];

export interface SupportKnowledgeStatusPort {
  status(): Promise<Readonly<{ kbVersion: string; shipped: number; ignored: number }>>;
}

export interface SupportApplication {
  readonly configuration: Pick<SupportConfigurationPort, "current">;
  readonly sessions: SupportSessionPort;
  readonly knowledge: SupportKnowledgeStatusPort;
  readonly clock?: () => Date;
}

export type SupportRoutePolicy = (route: SupportRoutePath) => Readonly<{
  config: Readonly<{
    auth: "public" | "user" | "operator";
    origin?: "trusted";
    session?: "optional";
  }>;
}>;

function languageFrom(value: unknown): SupportLanguage | null {
  return value === "en" || value === "ro" ? value : null;
}

function capabilityFrom(request: FastifyRequest): string | null {
  const raw = request.headers["x-support-session-token"];
  return typeof raw === "string" ? hashSupportCapability(raw) : null;
}

function publicSession(record: SupportSessionRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    session_id: record.sessionId,
    language: record.language,
    state: record.state,
    kb_version: record.kbVersion,
    created_at: record.createdAt.toISOString(),
    consent_own_context_at: record.consentOwnContextAt?.toISOString() ?? null
  });
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "SUPPORT_NOT_COMPOSED" });
}

function disabledCode(state: SupportConfigurationState): string | null {
  if (state.kind === "DISABLED") return state.code;
  return state.snapshot.values.supportEnabled ? null : "SUPPORT_DISABLED";
}

export function installSupportRoutes(
  api: FastifyInstance,
  application: SupportApplication | undefined,
  policy: SupportRoutePolicy
): void {
  api.post("/v1/support/sessions", policy("POST /v1/support/sessions"), async (request, reply) => {
    if (application === undefined) return unavailable(reply);
    const body = typeof request.body === "object" && request.body !== null
      ? request.body as Readonly<Record<string, unknown>> : {};
    const language = languageFrom(body.language ?? "en");
    if (language === null) return reply.status(400).send({ error: "SUPPORT_LANGUAGE_INVALID" });
    const knowledge = await application.knowledge.status();
    if (!/^[0-9a-f]{64}$/u.test(knowledge.kbVersion)) {
      return reply.status(503).send({ error: "SUPPORT_KB_UNAVAILABLE" });
    }
    const capability = createSupportSessionCapability();
    const created = await application.sessions.create({
      sessionId: capability.sessionId,
      tokenSha256: capability.tokenSha256,
      identityOwnerRef: request.authenticatedSession?.ownerRef ?? null,
      language,
      kbVersion: knowledge.kbVersion,
      createdAt: (application.clock ?? (() => new Date()))()
    });
    return reply.status(201).send({
      session: publicSession(created),
      session_token: capability.token,
      first_message: {
        role: "assistant",
        text: supportTemplate("DISCLOSURE", language)
      }
    });
  });

  api.get<{ Params: { id: string } }>(
    "/v1/support/sessions/:id",
    policy("GET /v1/support/sessions/{id}"),
    async (request, reply) => {
      if (application === undefined) return unavailable(reply);
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
      const found = await application.sessions.read({ sessionId: request.params.id, tokenSha256 });
      return found === null
        ? reply.status(404).send({ error: "NOT_FOUND" })
        : reply.send({ session: publicSession(found) });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/messages",
    policy("POST /v1/support/sessions/{id}/messages"),
    async (request, reply) => {
      if (application === undefined) return unavailable(reply);
      const tokenSha256 = capabilityFrom(request);
      const found = tokenSha256 === null ? null
        : await application.sessions.read({ sessionId: request.params.id, tokenSha256 });
      if (found === null) return reply.status(404).send({ error: "NOT_FOUND" });
      const state = await application.configuration.current();
      const code = disabledCode(state);
      if (code !== null) {
        return reply.send({
          outcome: "DISABLED",
          code,
          text: supportTemplate("DISABLED", found.language)
        });
      }
      return reply.status(503).send({
        outcome: "DEGRADED",
        code: "SUPPORT_RELAY_NOT_COMPOSED",
        text: supportTemplate("DEGRADED", found.language)
      });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/messages/:id/rating",
    policy("POST /v1/support/messages/{id}/rating"),
    async (_request, reply) => unavailable(reply)
  );
  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/escalate",
    policy("POST /v1/support/sessions/{id}/escalate"),
    async (_request, reply) => unavailable(reply)
  );
  api.get<{ Params: { token: string } }>(
    "/v1/support/cases/:token",
    policy("GET /v1/support/cases/{token}"),
    async (_request, reply) => unavailable(reply)
  );

  api.get("/v1/support/status", policy("GET /v1/support/status"), async (_request, reply) => {
    if (application === undefined) return unavailable(reply);
    const [configuration, support, knowledge] = await Promise.all([
      application.configuration.current(),
      application.sessions.status(),
      application.knowledge.status()
    ]);
    return reply.send({
      configuration,
      calls_today: support.callsToday,
      open_sessions: support.openSessions,
      new_cases: support.newCases,
      kb_version: knowledge.kbVersion,
      kb_loaded: { shipped: knowledge.shipped, ignored: knowledge.ignored },
      relay_state: "UNAVAILABLE"
    });
  });
}
