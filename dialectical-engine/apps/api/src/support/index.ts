import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupportConfigurationPort, SupportConfigurationState } from "@debateai/register";
import { clientIpNetworkScope,normalizeClientIp } from "../client-ip.js";
import { SupportC3AdmissionWindow } from "./c3-admission.js";
import type { SupportAnswerPort } from "./answer.js";
import { classifySupportMessage,supportIntentSurface } from "./classify.js";
import { evaluateEscalation } from "./escalation.js";
import {
  formatOwnRunStateAnswer,isOwnContextListQuestion,isOwnContextQuestion,NIL_RUN_ID,
  type SupportOwnContextPort
} from "./own-context.js";
import { SupportCaseError,type SupportCaseAccessPort } from "./cases.js";
import {
  applyIncidentNotice,formatIncidentAnswer,type SupportIncidentRepositoryPort
} from "./incidents.js";
import {
  createSupportSessionCapability,
  hashSupportCapability,
  type SupportCasePort,
  type SupportMessageCipherPort,
  type SupportSessionPort,
  type SupportSessionRecord
} from "./session.js";
import { SHREDDED_NOTICE,supportTemplate,type SupportLanguage } from "./templates.js";

export const SUPPORT_ROUTE_PATHS = Object.freeze([
  "POST /v1/support/sessions",
  "GET /v1/support/sessions/{id}",
  "POST /v1/support/sessions/{id}/consent",
  "POST /v1/support/sessions/{id}/messages",
  "POST /v1/support/messages/{id}/rating",
  "POST /v1/support/sessions/{id}/escalate",
  "GET /v1/support/cases",
  "GET /v1/support/cases/{token}",
  "POST /v1/support/cases/{token}/messages",
  "GET /v1/support/status"
] as const);

export type SupportRoutePath = typeof SUPPORT_ROUTE_PATHS[number];

export interface SupportKnowledgeStatusPort {
  status(): Promise<Readonly<{ kbVersion: string; shipped: number; ignored: number }>>;
}

export type SupportDiagnostic = "SUPPORT_RATE_LIMIT_EVIDENCE_WRITE_FAILED";

export interface SupportApplication {
  readonly configuration: Pick<SupportConfigurationPort, "current">;
  readonly sessions: SupportSessionPort;
  readonly messages: SupportMessageCipherPort;
  readonly answer?: SupportAnswerPort;
  readonly cases?: SupportCasePort;
  readonly caseAccess?: SupportCaseAccessPort;
  readonly ownContext?: SupportOwnContextPort;
  readonly incidents?: Pick<SupportIncidentRepositoryPort,"readActiveIncidents">;
  readonly knowledge: SupportKnowledgeStatusPort;
  /**
   * DL5-F3. Turns one caller's network into the pseudonym the two append-only
   * support tables store. Required, never optional: an absent seam here would
   * mean writing a reversible digest of a visitor's address, which is exactly
   * the finding. `apps/api/src/main.ts` passes the support key port's keyed
   * derivation; a composition that has no key port cannot serve support at all.
   */
  readonly sourcePseudonym: (value: string) => string;
  readonly clock?: () => Date;
  readonly reportDiagnostic?: (diagnostic: SupportDiagnostic) => void;
}

/**
 * DL1-F2. The API's own admission bridge: it charges the sealed budget for
 * `scope` and, when it is spent, sends the API's typed 429 and answers false.
 * A deployment whose register version publishes no such budget always admits,
 * so support behaves exactly as it does today until the row is published.
 */
export type SupportAdmissionScope = "supportReads" | "supportSessions" | "supportModelCalls";

export type SupportAdmission = Readonly<{
  /** Charges the budget and, when it is spent, sends the API's own typed 429. */
  gate(
    reply: FastifyReply, scope: SupportAdmissionScope, route: SupportRoutePath, key: string
  ): boolean;
  /** Charges the budget and only reports: the caller owns the refusal it sends. */
  charge(scope: SupportAdmissionScope, route: SupportRoutePath, key: string): boolean;
}>;

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
  return typeof raw === "string" ? hashSupportCapability("support-session",raw) : null;
}

function publicSession(record: SupportSessionRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    session_id: record.sessionId,
    identity_bound: record.identityOwnerRef !== null,
    language: record.language,
    state: record.state,
    kb_version: record.kbVersion,
    created_at: record.createdAt.toISOString(),
    consent_own_context_at: record.consentOwnContextAt?.toISOString() ?? null
  });
}

function sessionOwnerMatches(request: FastifyRequest,record: SupportSessionRecord): boolean {
  return record.identityOwnerRef === (request.authenticatedSession?.ownerRef ?? null);
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "SUPPORT_NOT_COMPOSED" });
}

/**
 * DL1-F1. Every support `{id}` and `body.session_id` lands in a `uuid` column,
 * where a non-UUID raises Postgres `22P02`; the generic handler then turned a
 * pure client fault into a 500 plus one `api.request.failed` line. The routes
 * mirror the API's `ResourceIdSchema` here and answer the branch's constant
 * typed 404 before the repository is ever asked.
 */
const SUPPORT_RESOURCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isResourceId(value: unknown): value is string {
  return typeof value === "string" && SUPPORT_RESOURCE_ID.test(value);
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "NOT_FOUND",message: "NOT_FOUND" });
}

/**
 * DL1-F9. A message body may not exceed 16 KiB of UTF-8. The register's
 * code-point limit stays authoritative for what a session may say; this
 * ceiling only keeps the hash, the classifier and two round-trips away from a
 * body that cannot be lawful at any setting.
 */
const SUPPORT_MESSAGE_BYTE_CEILING = 16 * 1_024;

/**
 * DL1-F2. How long one composed `/v1/support/status` answer serves every
 * caller. One second, matching the support configuration port's own cache, so
 * an operator watching the widget sees a change within the same beat while a
 * flood costs one aggregate per second instead of one per request.
 */
const SUPPORT_STATUS_CACHE_MS = 1_000;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function clientIp(request: FastifyRequest): string {
  return normalizeClientIp(request.ip)
    ?? normalizeClientIp(request.raw.socket.remoteAddress)
    ?? "unknown";
}

/**
 * DL5-F3. The value the support tables record for a caller's network: keyed, so
 * it cannot be inverted back to an address, and scoped to the IPv6 /64, so one
 * allocation is one source rather than 2^64 of them.
 */
function sourceOf(application: SupportApplication,request: FastifyRequest): string {
  return application.sourcePseudonym(clientIpNetworkScope(clientIp(request)));
}

function rateLimited(reply: FastifyReply, language: SupportLanguage) {
  return reply.status(429).send({
    outcome: "RATE_LIMITED",
    text: supportTemplate("RATE_LIMITED", language)
  });
}

function shredded(reply: FastifyReply,language: SupportLanguage) {
  return reply.send({
    kind: "SHREDDED",outcome: "SHREDDED",text: SHREDDED_NOTICE[language]
  });
}

async function recordRateLimitEvidence(
  application: SupportApplication,
  input: Parameters<SupportSessionPort["recordRateLimit"]>[0]
): Promise<void> {
  try {
    await application.sessions.recordRateLimit(input);
  } catch {
    const diagnostic: SupportDiagnostic = "SUPPORT_RATE_LIMIT_EVIDENCE_WRITE_FAILED";
    try {
      (application.reportDiagnostic ?? console.error)(diagnostic);
    } catch {
      console.error(diagnostic);
    }
  }
}

function disabledCode(state: SupportConfigurationState): string | null {
  if (state.kind === "DISABLED") return state.code;
  return state.snapshot.values.supportEnabled ? null : "SUPPORT_DISABLED";
}

async function openEscalatedCase(
  application: SupportApplication,
  session: SupportSessionRecord,
  language: SupportLanguage,
  predicate: Parameters<NonNullable<SupportApplication["cases"]>["open"]>[0]["triggerPredicate"],
  createdAt: Date,
  triggerGeneration = `predicate:${predicate ?? "E1"}`
): Promise<
  | Readonly<{ kind: "OPENED";record: Awaited<ReturnType<NonNullable<SupportApplication["cases"]>["open"]>>["record"];token: string }>
  | Readonly<{ kind: "ALREADY_OPENED";record: Awaited<ReturnType<NonNullable<SupportApplication["cases"]>["open"]>>["record"] }>
  | null
> {
  if (application.cases === undefined || predicate === undefined) return Promise.resolve(null);
  const toolCalls = await application.ownContext?.listCalls?.(session.sessionId) ?? [];
  const request = {
    sessionId: session.sessionId,
    language,
    createdAt,
    identityOwnerRef: session.identityOwnerRef,
    triggerPredicate: predicate,
    toolCalls,
    kbVersion: session.kbVersion,
    slaHours: 48
  } as const;
  if (application.cases.openOnce !== undefined) {
    return application.cases.openOnce({ ...request,triggerGeneration });
  }
  return Object.freeze({ kind: "OPENED" as const,...await application.cases.open(request) });
}

function openedCaseReceipt(
  opened: Awaited<ReturnType<typeof openEscalatedCase>>,
  language: SupportLanguage
) {
  if (opened?.kind !== "OPENED") return Object.freeze({});
  const link = `/help?case=${opened.token}`;
  const acknowledgement = supportTemplate("CASE_OPENED",language)
    .replace("{token}",opened.token)
    .replace("{sla}",String(opened.record.slaHours))
    .replace("{link}",link);
  return Object.freeze({
    case_token: opened.token,sla_hours: opened.record.slaHours,link,
    case_acknowledgement: acknowledgement
  });
}

export function installSupportRoutes(
  api: FastifyInstance,
  application: SupportApplication | undefined,
  policy: SupportRoutePolicy,
  admit: SupportAdmission = Object.freeze({ gate: () => true, charge: () => true })
): void {
  const admission = new SupportC3AdmissionWindow();
  /**
   * DL1-F2. `/v1/support/status` composed a multi-CTE aggregate over
   * `support.message`/`session`/`rating`/`case`, a configuration read and a
   * knowledge read on EVERY anonymous call. The body is four fixed fields
   * (DL1-F4) that no caller can influence, so one answer serves every caller
   * for a second — the same freshness the configuration port already caches at.
   */
  let statusCache: Readonly<{ at: number;body: Readonly<Record<string,unknown>> }> | null = null;

  api.post("/v1/support/sessions", policy("POST /v1/support/sessions"), async (request, reply) => {
    if (application === undefined) return unavailable(reply);
    /**
     * DL1-F2. An authenticated create skipped `admitIpSession` and had no cap of
     * its own, so one account could loop a KEK wrap plus two inserts without
     * bound. Charged before the language check so nothing is done on the way.
     */
    const ownerRef = request.authenticatedSession?.ownerRef;
    if (ownerRef !== undefined
      && !admit.gate(reply, "supportSessions", "POST /v1/support/sessions", ownerRef)) {
      return reply;
    }
    const body = typeof request.body === "object" && request.body !== null
      ? request.body as Readonly<Record<string, unknown>> : {};
    const language = languageFrom(body.language ?? "en");
    if (language === null) return reply.status(400).send({ error: "SUPPORT_LANGUAGE_INVALID" });
    const state = await application.configuration.current();
    if (state.kind === "DISABLED") return reply.status(503).send({ error: state.code });
    if (!state.snapshot.values.supportEnabled) {
      return reply.send({
        outcome: "DISABLED",
        code: "SUPPORT_DISABLED",
        text: supportTemplate("DISABLED", language)
      });
    }
    const now = (application.clock ?? (() => new Date()))();
    const timeDecision = admission.observeTime(now.getTime());
    if (!timeDecision.admitted) return rateLimited(reply, language);
    if (request.authenticatedSession === undefined) {
      const ipSha256 = sourceOf(application,request);
      if (application.sessions.admitIpSession !== undefined
        && await application.sessions.admitIpSession({
          ipSha256,at: now,
          cooldownMinutes: state.snapshot.values.supportIpCooldownMinutes,
          sessionLimit: state.snapshot.values.supportLimitAnonSessions1h
        }) !== "ADMITTED") {
        return rateLimited(reply,language);
      }
    }
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
      createdAt: now
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
      if (!admit.gate(reply, "supportReads", "GET /v1/support/sessions/{id}", clientIp(request))) {
        return reply;
      }
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
      if (!isResourceId(request.params.id)) return notFound(reply);
      const state = await application.configuration.current();
      if (state.kind === "DISABLED") return reply.status(503).send({ error: state.code });
      const found = await application.sessions.read({
        sessionId: request.params.id,
        tokenSha256,
        lockAfterInjections: state.snapshot.values.supportLockAfterInjections
      });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return reply.send({ kind: "SHREDDED",text: SHREDDED_NOTICE[found.language] });
      }
      return reply.send({ kind: "READABLE",session: publicSession(found) });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/consent",
    policy("POST /v1/support/sessions/{id}/consent"),
    async (request,reply) => {
      if (application === undefined || application.sessions.setConsent === undefined) {
        return unavailable(reply);
      }
      const tokenSha256 = capabilityFrom(request);
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string,unknown>> : {};
      if (tokenSha256 === null || typeof body.on !== "boolean") {
        return reply.status(400).send({ error: "SUPPORT_CONSENT_INVALID" });
      }
      if (!isResourceId(request.params.id)) return notFound(reply);
      const found = await application.sessions.read({
        sessionId: request.params.id,tokenSha256
      });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      if (request.authenticatedSession === undefined) {
        return reply.status(401).send({ error: "AUTHENTICATION_REQUIRED" });
      }
      const updated = await application.sessions.setConsent({
        sessionId: request.params.id,
        tokenSha256,
        identityOwnerRef: request.authenticatedSession.ownerRef,
        on: body.on,
        at: (application.clock ?? (() => new Date()))()
      });
      return updated === null
        ? reply.status(404).send({ error: "NOT_FOUND" })
        : reply.send({ session: publicSession(updated) });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/messages",
    policy("POST /v1/support/sessions/{id}/messages"),
    async (request, reply) => {
      if (application === undefined) return unavailable(reply);
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
      if (!isResourceId(request.params.id)) return notFound(reply);
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string, unknown>> : {};
      /**
       * DL1-F9. The register's 2,000-code-point rule sits behind a session read,
       * a configuration read, a sha256 and the classifier's code-point spread —
       * all of which used to run over a body of up to the 256 KiB transport
       * ceiling. The cheap byte refusal comes first; everything below keeps its
       * order, including the code-point rule that carries the RATE_LIMITED
       * evidence.
       */
      if (typeof body.text === "string"
        && Buffer.byteLength(body.text,"utf8") > SUPPORT_MESSAGE_BYTE_CEILING) {
        return reply.status(400).send({
          error: "MALFORMED_REQUEST",message: "MALFORMED_REQUEST"
        });
      }
      const found = await application.sessions.read({ sessionId: request.params.id, tokenSha256 });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      const state = await application.configuration.current();
      const code = disabledCode(state);
      if (code !== null) {
        return reply.send({
          outcome: "DISABLED",
          code,
          text: supportTemplate("DISABLED", found.language)
        });
      }
      if (state.kind !== "AVAILABLE") {
        return reply.send({
          outcome: "DISABLED",
          code: state.code,
          text: supportTemplate("DISABLED", found.language)
        });
      }
      if (typeof body.text !== "string") {
        return reply.status(400).send({ error: "SUPPORT_MESSAGE_INVALID" });
      }
      const now = (application.clock ?? (() => new Date()))();
      const timeDecision = admission.observeTime(now.getTime());
      if (!timeDecision.admitted) return rateLimited(reply,found.language);
      const ipSha256 = sourceOf(application,request);
      const messageSha256 = sha256(body.text);
      const classification = classifySupportMessage(body.text);
      const overrideLanguage = body.language === undefined ? null : languageFrom(body.language);
      if (body.language !== undefined && overrideLanguage === null) {
        return reply.status(400).send({ error: "SUPPORT_LANGUAGE_INVALID" });
      }
      const responseLanguage = overrideLanguage ?? classification.language;
      if (now.getTime() < found.createdAt.getTime()
        || now.getTime() - found.createdAt.getTime() > 24 * 60 * 60 * 1_000
        || [...body.text].length > state.snapshot.values.supportLimitMessageCharacters) {
        await recordRateLimitEvidence(application,{
          sessionId: found.sessionId,messageSha256,ipSha256,at: now
        });
        return rateLimited(reply,responseLanguage);
      }
      const persistentAdmission = await application.sessions.admitMessage({
        sessionId: found.sessionId,
        tokenSha256,
        injection: classification.outcome === "REFUSE_INJECTION",
        messageSha256,
        ipSha256,
        at: now,
        lockAfterInjections: state.snapshot.values.supportLockAfterInjections,
        identityOwnerRef: found.identityOwnerRef,
        characterCount: [...body.text].length,
        limits: state.snapshot.values
      });
      if (persistentAdmission === "NOT_FOUND") {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (persistentAdmission === "SHREDDED") {
        return shredded(reply,found.language);
      }
      if (persistentAdmission === "LOCKED" || persistentAdmission === "RATE_LIMITED") {
        await recordRateLimitEvidence(application, {
          sessionId: found.sessionId,
          messageSha256,
          ipSha256,
          at: now
        });
        return rateLimited(reply, responseLanguage);
      }
      const previousMessages = application.cases === undefined
        ? []
        : await application.messages.listSession({ sessionId: found.sessionId });
      const priorOutcomes = previousMessages
        .filter((message) => message.role === "assistant")
        .map((message) => message.outcome);
      const escalationBeforeResponse = evaluateEscalation({
        message: body.text,classification: classification.outcome,
        outcomes: priorOutcomes,previousOutcomes: priorOutcomes,
        ratings: [],toolCalls: [],requestedHuman: false
      });
      if (classification.outcome === "INCIDENT") {
        if (application.incidents === undefined) return unavailable(reply);
        const incident = formatIncidentAnswer(
          await application.incidents.readActiveIncidents(),responseLanguage
        );
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome: incident.outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const messageId = randomUUID();
        await application.messages.write({
          messageId,sessionId: found.sessionId,role: "assistant",
          text: incident.text,outcome: incident.outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const opened = escalationBeforeResponse === null ? null
          : await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeResponse.predicate,now
          );
        return reply.send({
          message_id: messageId,...incident,...openedCaseReceipt(opened,responseLanguage)
        });
      }
      if (classification.outcome === "REFUSE_ZONE"
        || classification.outcome === "REFUSE_INJECTION"
        || classification.outcome === "REFUSE_SAFETY") {
        const text = classification.outcome === "REFUSE_ZONE" && classification.link !== null
          ? supportTemplate("REFUSE_ZONE",responseLanguage).replace("{link}",classification.link)
          : supportTemplate(classification.outcome,responseLanguage);
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome: classification.outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "assistant",
          text,outcome: classification.outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        if (classification.outcome === "REFUSE_INJECTION"
          && application.sessions.finalizeInjectionLock !== undefined) {
          await application.sessions.finalizeInjectionLock({
            sessionId: found.sessionId,
            lockAfterInjections: state.snapshot.values.supportLockAfterInjections
          });
        }
        const opened = escalationBeforeResponse === null ? null
          : await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeResponse.predicate,now
          );
        return reply.send({
          outcome: classification.outcome,text,
          ...(classification.outcome === "REFUSE_ZONE" && classification.link !== null
            ? opened?.kind === "OPENED"
              ? { refusal_link: classification.link } : { link: classification.link }
            : {}),
          ...openedCaseReceipt(opened,responseLanguage)
        });
      }
      const ownContextIntent = isOwnContextQuestion(body.text)
        || isOwnContextListQuestion(body.text)
        || typeof body.run_id === "string" || body.latest === true;
      if (ownContextIntent
        && (request.authenticatedSession === undefined || found.consentOwnContextAt === null)) {
        const outcome = request.authenticatedSession === undefined
          ? "ANON_CONTEXT" as const : "CONSENT_NEEDED" as const;
        const text = supportTemplate(outcome,responseLanguage);
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const messageId = randomUUID();
        await application.messages.write({
          messageId,sessionId: found.sessionId,role: "assistant",
          text,outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const opened = escalationBeforeResponse === null ? null
          : await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeResponse.predicate,now
          );
        return reply.send({
          message_id: messageId,outcome,text,...openedCaseReceipt(opened,responseLanguage)
        });
      }
      if (ownContextIntent) {
        if (application.ownContext === undefined || request.authenticatedSession === undefined) {
          return unavailable(reply);
        }
        if (isOwnContextListQuestion(body.text)) {
          const projections = await application.ownContext.list({
            sessionId: found.sessionId,
            ownerRef: request.authenticatedSession.ownerRef,
            legacyAskerId: null,
            at: now
          });
          const outcome = "ANSWER_OWN_STATE" as const;
          const ownText = projections.map((projection) => [
            projection.run_id.slice(0,8),projection.created_at,projection.run_state
          ].join(" · ")).join("\n");
          const text = application.incidents === undefined ? ownText : applyIncidentNotice(
            ownText,supportIntentSurface(body.text),
            await application.incidents.readActiveIncidents(),responseLanguage
          );
          await application.messages.write({
            messageId: randomUUID(),sessionId: found.sessionId,role: "user",
            text: body.text,outcome,language: responseLanguage,
            detectedLanguage: classification.language,overrideLanguage,
            receivedAt: now,firstTokenAt: null,completedAt: now
          });
          const messageId = randomUUID();
          await application.messages.write({
            messageId,sessionId: found.sessionId,role: "assistant",
            text,outcome,language: responseLanguage,
            detectedLanguage: classification.language,overrideLanguage,
            receivedAt: now,firstTokenAt: null,completedAt: now
          });
          const opened = escalationBeforeResponse === null ? null
            : await openEscalatedCase(
              application,found,responseLanguage,escalationBeforeResponse.predicate,now
            );
          return reply.send({
            message_id: messageId,outcome,text,...openedCaseReceipt(opened,responseLanguage)
          });
        }
        const statedRun = typeof body.run_id === "string" ? body.run_id : NIL_RUN_ID;
        const latest = body.latest === true || typeof body.run_id !== "string";
        const result = await application.ownContext.read({
          sessionId: found.sessionId,
          ownerRef: request.authenticatedSession.ownerRef,
          legacyAskerId: null,
          runId: statedRun,
          latest,
          at: now
        });
        if (result === "NOT_OWNED") {
          const outcome = "REFUSE_OTHER_USER" as const;
          const text = supportTemplate(outcome,responseLanguage);
          await application.messages.write({
            messageId: randomUUID(),sessionId: found.sessionId,role: "user",
            text: body.text,outcome,language: responseLanguage,
            detectedLanguage: classification.language,overrideLanguage,
            receivedAt: now,firstTokenAt: null,completedAt: now
          });
          await application.messages.write({
            messageId: randomUUID(),sessionId: found.sessionId,role: "assistant",
            text,outcome,language: responseLanguage,
            detectedLanguage: classification.language,overrideLanguage,
            receivedAt: now,firstTokenAt: null,completedAt: now
          });
          const toolCalls = await application.ownContext.listCalls?.(found.sessionId) ?? [];
          const toolEscalation = evaluateEscalation({
            message: body.text,classification: null,outcomes: [],ratings: [],
            toolCalls,requestedHuman: false
          });
          const escalation = escalationBeforeResponse ?? toolEscalation;
          const opened = escalation !== null
            ? await openEscalatedCase(
              application,found,responseLanguage,escalation.predicate,now,
              escalation.predicate === "E4"
                ? `tool:${toolCalls.at(-1)?.at.toISOString() ?? now.toISOString()}`
                : `predicate:${escalation.predicate}`
            ) : null;
          return reply.send({ outcome,text,...openedCaseReceipt(opened,responseLanguage) });
        }
        const outcome = "ANSWER_OWN_STATE" as const;
        const ownText = formatOwnRunStateAnswer(result,responseLanguage,now);
        const text = application.incidents === undefined ? ownText : applyIncidentNotice(
          ownText,supportIntentSurface(body.text),
          await application.incidents.readActiveIncidents(),responseLanguage
        );
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const messageId = randomUUID();
        await application.messages.write({
          messageId,sessionId: found.sessionId,role: "assistant",
          text,outcome,language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const opened = escalationBeforeResponse === null ? null
          : await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeResponse.predicate,now
          );
        return reply.send({
          message_id: messageId,outcome,text,...openedCaseReceipt(opened,responseLanguage)
        });
      }
      const escalationBeforeAnswer = escalationBeforeResponse;
      if (escalationBeforeAnswer?.predicate === "E1") {
        const userMessageId = randomUUID();
        await application.messages.write({
          messageId: userMessageId,sessionId: found.sessionId,role: "user",
          text: body.text,outcome: "CASE_OPENED",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const opened = await openEscalatedCase(
          application,found,responseLanguage,escalationBeforeAnswer.predicate,now,
          `message:${userMessageId}`
        );
        if (opened === null) return unavailable(reply);
        if (opened.kind === "ALREADY_OPENED") {
          return reply.status(409).send({
            outcome: "CASE_ALREADY_OPENED",case_id: opened.record.caseId
          });
        }
        const link = `/help?case=${opened.token}`;
        const text = supportTemplate("CASE_OPENED",responseLanguage)
          .replace("{token}",opened.token)
          .replace("{sla}",String(opened.record.slaHours))
          .replace("{link}",link);
        const assistantMessageId = randomUUID();
        await application.messages.write({
          messageId: assistantMessageId,sessionId: found.sessionId,role: "assistant",
          text,outcome: "CASE_OPENED",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        return reply.send({
          outcome: "CASE_OPENED",text,message_id: assistantMessageId,
          case_token: opened.token,link
        });
      }
      if (classification.outcome === "REFUSE_ZONE" && classification.link !== null) {
        const text = supportTemplate("REFUSE_ZONE", responseLanguage)
          .replace("{link}", classification.link);
        await application.messages.write({
          messageId: randomUUID(),
          sessionId: found.sessionId,
          role: "user",
          text: body.text,
          outcome: classification.outcome,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          receivedAt: now,
          firstTokenAt: null,
          completedAt: now
        });
        await application.messages.write({
          messageId: randomUUID(),
          sessionId: found.sessionId,
          role: "assistant",
          text,
          outcome: classification.outcome,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          receivedAt: now,
          firstTokenAt: null,
          completedAt: now
        });
        if (escalationBeforeAnswer !== null) {
          await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeAnswer.predicate,now
          );
        }
        return reply.send({
          outcome: classification.outcome,
          text,
          link: classification.link
        });
      }
      if (classification.outcome === "REFUSE_INJECTION"
        || classification.outcome === "REFUSE_SAFETY") {
        const text = supportTemplate(classification.outcome, responseLanguage);
        await application.messages.write({
          messageId: randomUUID(),
          sessionId: found.sessionId,
          role: "user",
          text: body.text,
          outcome: classification.outcome,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          receivedAt: now,
          firstTokenAt: null,
          completedAt: now
        });
        await application.messages.write({
          messageId: randomUUID(),
          sessionId: found.sessionId,
          role: "assistant",
          text,
          outcome: classification.outcome,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          receivedAt: now,
          firstTokenAt: null,
          completedAt: now
        });
        if (classification.outcome === "REFUSE_INJECTION"
          && application.sessions.finalizeInjectionLock !== undefined) {
          await application.sessions.finalizeInjectionLock({
            sessionId: found.sessionId,
            lockAfterInjections: state.snapshot.values.supportLockAfterInjections
          });
        }
        if (escalationBeforeAnswer !== null) {
          await openEscalatedCase(
            application,found,responseLanguage,escalationBeforeAnswer.predicate,now
          );
        }
        return reply.send({
          outcome: classification.outcome,
          text
        });
      }
      if (application.answer !== undefined) {
        /**
         * DL1-F7. The model budget is one global daily bucket, so a few sources
         * could take a whole day's calls and leave everyone else DEGRADED. The
         * per-source share is charged HERE — after the classifier has decided
         * this message really does need the model, so a refusal, an incident or
         * an own-context answer costs a source nothing — and the refusal is the
         * ordinary rate-limit refusal with its evidence, so a spent share looks
         * to that source like every other window it can hit, and to every other
         * source like nothing at all.
         */
        if (!admit.charge("supportModelCalls",
          "POST /v1/support/sessions/{id}/messages", ipSha256)) {
          await recordRateLimitEvidence(application,{
            sessionId: found.sessionId,messageSha256,ipSha256,at: now
          });
          return rateLimited(reply,responseLanguage);
        }
        const result = await application.answer.respond({
          sessionId: found.sessionId,
          text: body.text,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          modelRef: state.snapshot.values.supportModelRef,
          receivedAt: now
        });
        const escalationAfterAnswer = escalationBeforeAnswer ?? evaluateEscalation({
          message: body.text,
          classification: classification.outcome,
          outcomes: [...priorOutcomes,result.outcome],
          previousOutcomes: priorOutcomes,
          ratings: [],
          toolCalls: [],
          requestedHuman: false
        });
        const opened = escalationAfterAnswer === null ? null
          : await openEscalatedCase(
            application,found,responseLanguage,escalationAfterAnswer.predicate,now
          );
        return reply.send({
          message_id: result.messageId,
          outcome: result.outcome,
          text: result.text,
          can_escalate: result.canEscalate,
          ...openedCaseReceipt(opened,responseLanguage)
        });
      }
      return reply.status(503).send({
        outcome: "DEGRADED",
        code: "SUPPORT_RELAY_NOT_COMPOSED",
        text: supportTemplate("DEGRADED", responseLanguage)
      });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/messages/:id/rating",
    policy("POST /v1/support/messages/{id}/rating"),
    async (request, reply) => {
      if (application === undefined || application.sessions.rateMessage === undefined) {
        return unavailable(reply);
      }
      const tokenSha256 = capabilityFrom(request);
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string,unknown>> : {};
      if (tokenSha256 === null
        || typeof body.session_id !== "string"
        || (body.rating !== "yes" && body.rating !== "no" && body.rating !== "human")) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (!isResourceId(request.params.id) || !isResourceId(body.session_id)) {
        return notFound(reply);
      }
      const found = await application.sessions.read({
        sessionId: body.session_id,tokenSha256
      });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      const ratings = await application.sessions.rateMessage({
        sessionId: found.sessionId,tokenSha256,messageId: request.params.id,rating: body.rating,
        at: (application.clock ?? (() => new Date()))()
      });
      if (ratings === null) return reply.status(404).send({ error: "NOT_FOUND" });
      const escalation = evaluateEscalation({
        message: "",classification: null,outcomes: [],ratings,toolCalls: [],
        requestedHuman: body.rating === "human"
      });
      const opened = escalation === null ? null
        : await openEscalatedCase(
          application,found,found.language,escalation.predicate,
          (application.clock ?? (() => new Date()))()
        );
      return reply.send({
        rating: body.rating,case_opened: opened?.kind === "OPENED",
        ...openedCaseReceipt(opened,found.language)
      });
    }
  );
  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/escalate",
    policy("POST /v1/support/sessions/{id}/escalate"),
    async (request, reply) => {
      if (application?.cases === undefined) return unavailable(reply);
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
      if (!isResourceId(request.params.id)) return notFound(reply);
      const found = await application.sessions.read({ sessionId: request.params.id,tokenSha256 });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string,unknown>> : {};
      const language = body.language === undefined ? found.language : languageFrom(body.language);
      if (language === null) return reply.status(400).send({ error: "SUPPORT_LANGUAGE_INVALID" });
      const opened = await openEscalatedCase(
        application,found,language,"E1",
        (application.clock ?? (() => new Date()))(),"manual"
      );
      if (opened === null) return unavailable(reply);
      if (opened.kind === "ALREADY_OPENED") {
        return reply.status(409).send({
          outcome: "CASE_ALREADY_OPENED",case_id: opened.record.caseId
        });
      }
      const link = `/help?case=${opened.token}`;
      const text = supportTemplate("CASE_OPENED",language)
        .replace("{token}",opened.token)
        .replace("{sla}",String(opened.record.slaHours ?? 48))
        .replace("{link}",link);
      return reply.status(201).send({
        case: {
          case_id: opened.record.caseId,
          state: opened.record.state,
          language: opened.record.language,
          created_at: opened.record.createdAt.toISOString()
        },
        case_token: opened.token,
        sla_hours: opened.record.slaHours,
        link,
        text
      });
    }
  );
  api.get(
    "/v1/support/cases",
    policy("GET /v1/support/cases"),
    async (request,reply) => {
      if (application?.caseAccess === undefined) return unavailable(reply);
      if (request.authenticatedSession === undefined) {
        return reply.status(401).send({ error: "AUTHENTICATION_REQUIRED" });
      }
      const cases = await application.caseAccess.listOwn(
        request.authenticatedSession.ownerRef
      );
      return reply.send({ cases: cases.map((opened) => Object.freeze({
        case_id: opened.caseId,state: opened.state,language: opened.language,
        created_at: opened.createdAt.toISOString()
      })) });
    }
  );
  api.get<{ Params: { token: string };Querystring: { limit?: string;cursor?: string } }>(
    "/v1/support/cases/:token",
    policy("GET /v1/support/cases/{token}"),
    async (request, reply) => {
      if (application?.caseAccess === undefined) return unavailable(reply);
      if (!admit.gate(reply, "supportReads", "GET /v1/support/cases/{token}", clientIp(request))) {
        return reply;
      }
      const configuration = await application.configuration.current();
      if (configuration.kind !== "AVAILABLE") {
        return reply.status(503).send({ error: configuration.code });
      }
      const tokenSha256 = hashSupportCapability("support-case",request.params.token);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
      const rawLimit = request.query.limit;
      const limit = rawLimit === undefined
        ? configuration.snapshot.values.supportLimitSessionMessages : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1
        || limit > configuration.snapshot.values.supportLimitSessionMessages) {
        return reply.status(400).send({ error: "SUPPORT_CASE_PAGE_INVALID" });
      }
      let found;
      try {
        /**
         * DL1-F5. The token alone no longer decides: the case service also sees
         * when it was presented (the thirty-day ceiling) and who presented it
         * (the owner binding the row already carries). A refusal is the same
         * typed 404 an unknown token gets — a 403 here would confirm the case.
         */
        found = await application.caseAccess.readByToken(tokenSha256,{
          limit,
          at: (application.clock ?? (() => new Date()))(),
          callerOwnerRef: request.authenticatedSession?.ownerRef ?? null,
          ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor })
        });
      } catch (error) {
        if (error instanceof SupportCaseError && error.code === "SUPPORT_CASE_CURSOR_INVALID") {
          return reply.status(400).send({ error: error.code });
        }
        throw error;
      }
      if (found === null) {
        return reply.status(404).send({
          error: "NOT_FOUND",text: supportTemplate("NOT_FOUND","en")
        });
      }
      if (found.kind === "SHREDDED") {
        return reply.send({
          kind: "SHREDDED",text: found.notice,
          case: {
            case_id: found.caseId,state: found.state,language: found.language,
            sla_hours: found.slaHours,summary: null
          },
          messages: [],next_cursor: null
        });
      }
      return reply.send({
        kind: "READABLE",
        case: {
          case_id: found.caseId,state: found.state,language: found.language,
          sla_hours: found.slaHours,summary: found.summary
        },
        messages: found.messages,next_cursor: found.nextCursor
      });
    }
  );
  api.post<{ Params: { token: string } }>(
    "/v1/support/cases/:token/messages",
    policy("POST /v1/support/cases/{token}/messages"),
    async (request,reply) => {
      if (application?.caseAccess === undefined) return unavailable(reply);
      const configuration = await application.configuration.current();
      if (configuration.kind !== "AVAILABLE") {
        return reply.status(503).send({ error: configuration.code });
      }
      const tokenSha256 = hashSupportCapability("support-case",request.params.token);
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string,unknown>> : {};
      if (tokenSha256 === null || typeof body.text !== "string" || body.text.trim() === "") {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      let state;
      try {
        state = await application.caseAccess.replyByToken({
          tokenSha256,text: body.text,at: (application.clock ?? (() => new Date()))(),
          callerOwnerRef: request.authenticatedSession?.ownerRef ?? null,
          messageByteLimit: configuration.snapshot.values.supportLimitMessageCharacters,
          caseMessageLimit: configuration.snapshot.values.supportLimitSessionMessages
        });
      } catch (error) {
        if (error instanceof SupportCaseError
          && (error.code === "SUPPORT_CASE_MESSAGE_TOO_LARGE"
            || error.code === "SUPPORT_CASE_MESSAGE_LIMIT")) {
          return reply.status(error.code === "SUPPORT_CASE_MESSAGE_TOO_LARGE" ? 413 : 429)
            .send({ error: error.code });
        }
        throw error;
      }
      if (state !== null && typeof state === "object" && state.kind === "SHREDDED") {
        return reply.send({ kind: "SHREDDED",text: state.notice });
      }
      return state === null
        ? reply.status(404).send({ error: "NOT_FOUND" })
        : reply.send({ state });
    }
  );

  /**
   * DL1-F4. This route is anonymous by design, for the help widget. It used to
   * echo `configuration` verbatim — the internal model ref, every limiter
   * threshold, the snapshot sha and the register version — beside daily spend,
   * token totals, open sessions, new cases and the deflection ratios, handing
   * an unauthenticated caller the exact tuning of the subsystem's own controls.
   * The body is now the four fields the widget reads
   * (`apps/ui/components/support/Assistant.tsx`); the operator view stays whole
   * in `apps/runner/src/support-status-cli.ts`, which reads the database
   * directly and needs no HTTP route.
   */
  api.get("/v1/support/status", policy("GET /v1/support/status"), async (request, reply) => {
    if (application === undefined) return unavailable(reply);
    if (!admit.gate(reply, "supportReads", "GET /v1/support/status", clientIp(request))) return reply;
    const now = (application.clock ?? (() => new Date()))().getTime();
    if (statusCache !== null && now - statusCache.at < SUPPORT_STATUS_CACHE_MS
      && now >= statusCache.at) {
      return reply.send(statusCache.body);
    }
    const [configuration, support, knowledge] = await Promise.all([
      application.configuration.current(),
      application.sessions.status(),
      application.knowledge.status()
    ]);
    const body = Object.freeze({
      configuration: { kind: configuration.kind },
      relay_state: support.relayState ?? "AVAILABLE",
      kb_version: knowledge.kbVersion,
      kb_loaded: { shipped: knowledge.shipped }
    });
    statusCache = Object.freeze({ at: now, body });
    return reply.send(body);
  });
}
