import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupportConfigurationPort, SupportConfigurationState } from "@debateai/register";
import type { LoadedHelpCorpus } from "@debateai/support-kb";
import { isSupportLanguage, type SupportLanguage } from "@debateai/support-kb/catalog";
import { clientIpNetworkScope, normalizeClientIp } from "../client-ip.js";
import { SupportC3AdmissionWindow } from "./c3-admission.js";
import type { SupportAnswerPort } from "./answer.js";
import { classifySupportMessage } from "./classify.js";
import { recognisedSupportCrisis } from "./crisis-first.js";
import { classifyPublicGuideBoundary, privateRecordRefusal } from "./public-guide-boundary.js";
import { formatIncidentAnswer, type SupportIncidentRepositoryPort } from "./incidents.js";
import { SupportMessageLimiter, supportMessageLimitsFrom } from "./memory-limits.js";
import type { SupportDegradedPort } from "./degraded.js";
import { supportTemplate } from "./templates.js";
import { recoverySecurityGuidance, type SupportSecurityRecoveryKind } from "./security-guidance.js";

export const SUPPORT_ROUTE_PATHS = Object.freeze([
  "POST /v1/support/messages",
  "GET /v1/support/status"
] as const);
export type SupportRoutePath = typeof SUPPORT_ROUTE_PATHS[number];

export interface SupportKnowledgeStatusPort {
  status(): Promise<Readonly<{ kbVersion: string; shipped: number; ignored: number }>>;
  snapshot?(version: string): LoadedHelpCorpus | undefined;
}

/** No conversation, case, or message repository is composed for the chat. */
export interface SupportApplication {
  readonly configuration: Pick<SupportConfigurationPort, "current">;
  readonly limiter: SupportMessageLimiter;
  readonly degraded: Pick<SupportDegradedPort, "isDegraded">;
  readonly answer?: SupportAnswerPort;
  readonly incidents?: Pick<SupportIncidentRepositoryPort, "readActiveIncidents">;
  readonly knowledge: SupportKnowledgeStatusPort;
  readonly sourcePseudonym: (network: string) => string;
  readonly clock?: () => Date;
}

export type SupportAdmissionScope = "supportReads" | "supportSessions" | "supportModelCalls";
export type SupportAdmission = Readonly<{
  gate(reply: FastifyReply, scope: SupportAdmissionScope, route: SupportRoutePath, key: string): boolean;
  charge(scope: SupportAdmissionScope, route: SupportRoutePath, key: string): boolean;
}>;
export type SupportRoutePolicy = (route: SupportRoutePath) => Readonly<{
  config: Readonly<{
    auth: "public" | "user" | "operator";
    origin?: "trusted";
    session?: "optional";
  }>;
}>;

const SUPPORT_MESSAGE_BYTE_CEILING = 16 * 1_024;
const SUPPORT_STATUS_CACHE_MS = 1_000;
const POST_MESSAGE = "POST /v1/support/messages" as const;
const GET_STATUS = "GET /v1/support/status" as const;

function languageFrom(value: unknown): SupportLanguage | null {
  return isSupportLanguage(value) ? value : null;
}
function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "SUPPORT_NOT_COMPOSED" });
}
function disabledCode(state: SupportConfigurationState): string | null {
  if (state.kind === "DISABLED") return state.code;
  return state.snapshot.values.supportEnabled ? null : "SUPPORT_DISABLED";
}
function clientIp(request: FastifyRequest): string {
  return normalizeClientIp(request.ip)
    ?? normalizeClientIp(request.raw.socket.remoteAddress)
    ?? "unknown";
}
function sourceOf(application: SupportApplication, request: FastifyRequest): string {
  return application.sourcePseudonym(clientIpNetworkScope(clientIp(request)));
}
function rateLimited(reply: FastifyReply, language: SupportLanguage) {
  return reply.status(429).send({
    outcome: "RATE_LIMITED", text: supportTemplate("RATE_LIMITED", language)
  });
}
function countryClosed(reply: FastifyReply, language: SupportLanguage) {
  return reply.status(403).send({
    outcome: "DISABLED", code: "COUNTRY_SERVICE_UNAVAILABLE",
    text: supportTemplate("COUNTRY_UNAVAILABLE", language)
  });
}
function tooLong(reply: FastifyReply, language: SupportLanguage) {
  return reply.send({ outcome: "TOO_LONG", text: supportTemplate("TOO_LONG", language) });
}

export function installSupportRoutes(
  api: FastifyInstance,
  application: SupportApplication | undefined,
  policy: SupportRoutePolicy,
  admit: SupportAdmission,
  countryClosedFor?: (request: FastifyRequest) => boolean
): void {
  const admission = new SupportC3AdmissionWindow();
  const closedHere = (request: FastifyRequest): boolean => countryClosedFor?.(request) === true;
  const modelShare = (sourceKey: string): boolean =>
    admit.charge("supportModelCalls", POST_MESSAGE, sourceKey);
  let statusCache: Readonly<{ at: number; body: Readonly<Record<string, unknown>> }> | null = null;

  api.post("/v1/support/messages", policy(POST_MESSAGE), async (request, reply) => {
    const body = typeof request.body === "object" && request.body !== null
      && !Array.isArray(request.body) ? request.body as Readonly<Record<string, unknown>> : {};
    const candidateLanguage = languageFrom(body.language) ?? "en";
    if (closedHere(request)) return countryClosed(reply, candidateLanguage);
    if (typeof body.text === "string"
      && Buffer.byteLength(body.text, "utf8") > SUPPORT_MESSAGE_BYTE_CEILING) {
      return tooLong(reply, candidateLanguage);
    }
    const language = languageFrom(body.language);
    if (Object.keys(body).sort().join(",") !== "language,text"
      || typeof body.text !== "string" || language === null) {
      return reply.status(400).send({ error: "SUPPORT_MESSAGE_INVALID" });
    }
    if (recognisedSupportCrisis(body.text) !== null) {
      return reply.send({ outcome: "CRISIS", text: supportTemplate("CRISIS_SUPPORT", language),
        can_escalate: true, sources: [], actions: [] });
    }
    if (application === undefined) return unavailable(reply);
    const state = await application.configuration.current();
    const code = disabledCode(state);
    if (code !== null) {
      return reply.send({ outcome: "DISABLED", code, text: supportTemplate("DISABLED", language) });
    }
    if (state.kind !== "AVAILABLE") {
      return reply.send({ outcome: "DISABLED", code: state.code,
        text: supportTemplate("DISABLED", language) });
    }
    const now = (application.clock ?? (() => new Date()))();
    const timeDecision = admission.observeTime(now.getTime());
    if (!timeDecision.admitted) return rateLimited(reply, language);
    if ([...body.text].length > state.snapshot.values.supportLimitMessageCharacters) {
      return tooLong(reply, language);
    }
    const classification = classifySupportMessage(body.text);
    const publicGuideBoundary = classifyPublicGuideBoundary(body.text, language);
    const source = sourceOf(application, request);
    const admitted = application.limiter.admit({
      source, ownerRef: request.authenticatedSession?.ownerRef ?? null,
      injection: classification.outcome === "REFUSE_INJECTION", atMs: now.getTime(),
      limits: supportMessageLimitsFrom(state.snapshot.values)
    });
    if (admitted === "RATE_LIMITED") return rateLimited(reply, language);

    if (publicGuideBoundary.kind === "PRIVATE_RECORD_REQUEST"
      && classification.outcome !== "REFUSE_INJECTION"
      && classification.outcome !== "REFUSE_SAFETY") {
      return reply.send({ outcome: "REFUSE_ZONE", text: privateRecordRefusal(language),
        sources: [], actions: [] });
    }
    if (classification.securityNavigation === "FORGOT_PASSWORD"
      || classification.securityOperation === "CREDENTIAL_OPERATION") {
      const recoveryKind: SupportSecurityRecoveryKind =
        classification.securityNavigation === "FORGOT_PASSWORD"
        && classification.securityOperation === "CREDENTIAL_OPERATION"
          ? "CREDENTIAL_OPERATION_AND_FORGOT_PASSWORD"
          : classification.securityNavigation === "FORGOT_PASSWORD"
            ? "FORGOT_PASSWORD" : "CREDENTIAL_OPERATION";
      return reply.send({ outcome: "REFUSE_ZONE",
        text: recoverySecurityGuidance(recoveryKind, language),
        sources: [], actions: [],
        ...(classification.securityNavigation === "FORGOT_PASSWORD"
          ? { refusal_link: "/recover" } : {}) });
    }
    if (classification.outcome === "INCIDENT") {
      if (application.incidents === undefined) return unavailable(reply);
      return reply.send(formatIncidentAnswer(
        await application.incidents.readActiveIncidents(), language
      ));
    }
    if (classification.outcome === "REFUSE_ZONE"
      || classification.outcome === "REFUSE_INJECTION"
      || classification.outcome === "REFUSE_SAFETY") {
      const text = classification.outcome === "REFUSE_ZONE" && classification.link !== null
        ? supportTemplate("REFUSE_ZONE", language).replace("{link}", classification.link)
        : supportTemplate(classification.outcome, language);
      return reply.send({ outcome: classification.outcome, text,
        ...(classification.outcome === "REFUSE_ZONE" && classification.link !== null
          ? { link: classification.link } : {}) });
    }
    if (!modelShare(source)) return rateLimited(reply, language);
    const knowledge = await application.knowledge.status();
    const snapshot = application.knowledge.snapshot?.(knowledge.kbVersion);
    if (snapshot === undefined) {
      return reply.status(503).send({ outcome: "DEGRADED",
        code: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", text: supportTemplate("DEGRADED", language) });
    }
    if (application.answer !== undefined) {
      const result = await application.answer.respond({
        text: body.text, language, detectedLanguage: classification.language,
        overrideLanguage: null, modelRef: state.snapshot.values.supportModelRef,
        kbVersion: knowledge.kbVersion, snapshot,
        signedIn: request.authenticatedSession !== undefined, receivedAt: now
      });
      return reply.send({ outcome: result.outcome, text: result.text,
        can_escalate: result.canEscalate, sources: result.sources ?? [], actions: result.actions ?? [] });
    }
    return reply.status(503).send({ outcome: "DEGRADED", code: "SUPPORT_RELAY_NOT_COMPOSED",
      text: supportTemplate("DEGRADED", language) });
  });

  api.get("/v1/support/status", policy(GET_STATUS), async (request, reply) => {
    if (closedHere(request)) return countryClosed(reply, "en");
    if (application === undefined) return unavailable(reply);
    if (!admit.gate(reply, "supportReads", GET_STATUS, sourceOf(application, request))) return reply;
    const now = (application.clock ?? (() => new Date()))().getTime();
    if (statusCache !== null && now >= statusCache.at
      && now - statusCache.at < SUPPORT_STATUS_CACHE_MS) return reply.send(statusCache.body);
    const [configuration, knowledge] = await Promise.all([
      application.configuration.current(), application.knowledge.status()
    ]);
    const degraded = application.degraded.isDegraded();
    const body = Object.freeze({
      configuration: { kind: configuration.kind },
      relay_state: degraded.degraded && degraded.reason === "relay" ? "UNAVAILABLE" : "AVAILABLE",
      kb_version: knowledge.kbVersion,
      kb_loaded: { shipped: knowledge.shipped }
    });
    statusCache = Object.freeze({ at: now, body });
    return reply.send(body);
  });
}
