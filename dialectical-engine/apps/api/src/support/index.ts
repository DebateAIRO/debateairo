import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SupportConfigurationPort, SupportConfigurationState } from "@debateai/register";
import type { LoadedHelpCorpus } from "@debateai/support-kb";
import { isSupportLanguage,type SupportLanguage } from "@debateai/support-kb/catalog";
import { normalizeClientIp } from "../client-ip.js";
import { SupportC3AdmissionWindow } from "./c3-admission.js";
import type { SupportAnswerPort } from "./answer.js";
import { classifySupportMessage,supportIntentSurface } from "./classify.js";
import { evaluateEscalation } from "./escalation.js";
import { classifyPublicGuideBoundary,privateRecordRefusal } from "./public-guide-boundary.js";
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
import { supportTemplate } from "./templates.js";
import { recoverySecurityGuidance,type SupportSecurityRecoveryKind } from "./security-guidance.js";

export const SUPPORT_ROUTE_PATHS = Object.freeze([
  "POST /v1/support/sessions",
  "GET /v1/support/sessions/{id}",
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
  snapshot?(version: string): LoadedHelpCorpus | undefined;
}

export type SupportDiagnostic = "SUPPORT_RATE_LIMIT_EVIDENCE_WRITE_FAILED";

export interface SupportApplication {
  readonly configuration: Pick<SupportConfigurationPort, "current">;
  readonly sessions: SupportSessionPort;
  readonly messages: SupportMessageCipherPort;
  readonly answer?: SupportAnswerPort;
  readonly cases?: SupportCasePort;
  readonly caseAccess?: SupportCaseAccessPort;
  readonly incidents?: Pick<SupportIncidentRepositoryPort,"readActiveIncidents">;
  readonly knowledge: SupportKnowledgeStatusPort;
  readonly clock?: () => Date;
  readonly reportDiagnostic?: (diagnostic: SupportDiagnostic) => void;
}

export type SupportRoutePolicy = (route: SupportRoutePath) => Readonly<{
  config: Readonly<{
    auth: "public" | "user" | "operator";
    origin?: "trusted";
    session?: "optional";
  }>;
}>;

function languageFrom(value: unknown): SupportLanguage | null {
  return isSupportLanguage(value) ? value : null;
}

function capabilityFrom(request: FastifyRequest): string | null {
  const raw = request.headers["x-support-session-token"];
  return typeof raw === "string" ? hashSupportCapability(raw) : null;
}

function publicSession(record: SupportSessionRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    session_id: record.sessionId,
    identity_bound: record.identityOwnerRef !== null,
    language: record.language,
    state: record.state,
    kb_version: record.kbVersion,
    created_at: record.createdAt.toISOString()
  });
}

function sessionOwnerMatches(request: FastifyRequest,record: SupportSessionRecord): boolean {
  return record.identityOwnerRef === (request.authenticatedSession?.ownerRef ?? null);
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "SUPPORT_NOT_COMPOSED" });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function clientIp(request: FastifyRequest): string {
  return normalizeClientIp(request.ip)
    ?? normalizeClientIp(request.raw.socket.remoteAddress)
    ?? "unknown";
}

function rateLimited(reply: FastifyReply, language: SupportLanguage) {
  return reply.status(429).send({
    outcome: "RATE_LIMITED",
    text: supportTemplate("RATE_LIMITED", language)
  });
}

function shredded(reply: FastifyReply,language: SupportLanguage) {
  return reply.send({
    kind: "SHREDDED",outcome: "SHREDDED",text: supportTemplate("SHREDDED_NOTICE",language)
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
  const request = {
    sessionId: session.sessionId,
    language,
    createdAt,
    identityOwnerRef: session.identityOwnerRef,
    triggerPredicate: predicate,
    toolCalls: Object.freeze([]),
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
  policy: SupportRoutePolicy
): void {
  const admission = new SupportC3AdmissionWindow();

  api.post("/v1/support/sessions", policy("POST /v1/support/sessions"), async (request, reply) => {
    if (application === undefined) return unavailable(reply);
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
      const ipSha256 = sha256(clientIp(request));
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
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
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
        return reply.send({
          kind: "SHREDDED",text: supportTemplate("SHREDDED_NOTICE",found.language)
        });
      }
      return reply.send({ kind: "READABLE",session: publicSession(found) });
    }
  );

  api.post<{ Params: { id: string } }>(
    "/v1/support/sessions/:id/messages",
    policy("POST /v1/support/sessions/{id}/messages"),
    async (request, reply) => {
      if (application === undefined) return unavailable(reply);
      const tokenSha256 = capabilityFrom(request);
      if (tokenSha256 === null) return reply.status(404).send({ error: "NOT_FOUND" });
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
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string, unknown>> : {};
      if (Object.keys(body).length !== 1 || typeof body.text !== "string") {
        return reply.status(400).send({ error: "SUPPORT_MESSAGE_INVALID" });
      }
      const now = (application.clock ?? (() => new Date()))();
      const timeDecision = admission.observeTime(now.getTime());
      if (!timeDecision.admitted) return rateLimited(reply,found.language);
      const ipSha256 = sha256(clientIp(request));
      const messageSha256 = sha256(body.text);
      const classification = classifySupportMessage(body.text);
      const publicGuideBoundary = classifyPublicGuideBoundary(body.text,found.language);
      const overrideLanguage = null;
      const responseLanguage = found.language;
      const knowledgeSnapshot = application.answer === undefined
        ? undefined : application.knowledge.snapshot?.(found.kbVersion);
      if (application.answer !== undefined && knowledgeSnapshot === undefined) {
        return reply.status(409).send({
          error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE",
          restart_session: true
        });
      }
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
      if (publicGuideBoundary.kind === "PRIVATE_RECORD_REQUEST"
        && classification.outcome !== "REFUSE_INJECTION"
        && classification.outcome !== "REFUSE_SAFETY") {
        const text = privateRecordRefusal(responseLanguage);
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome: "REFUSE_ZONE",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const messageId = randomUUID();
        const stored = await application.messages.write({
          messageId,sessionId: found.sessionId,role: "assistant",
          text,outcome: "REFUSE_ZONE",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        return reply.send({
          message_id: messageId,outcome: "REFUSE_ZONE",text: stored.text,
          sources: Object.freeze([]),actions: Object.freeze([])
        });
      }
      if (classification.securityNavigation === "FORGOT_PASSWORD"
        || classification.securityOperation === "CREDENTIAL_OPERATION") {
        const recoveryKind: SupportSecurityRecoveryKind =
          classification.securityNavigation === "FORGOT_PASSWORD"
          && classification.securityOperation === "CREDENTIAL_OPERATION"
            ? "CREDENTIAL_OPERATION_AND_FORGOT_PASSWORD"
            : classification.securityNavigation === "FORGOT_PASSWORD"
              ? "FORGOT_PASSWORD" : "CREDENTIAL_OPERATION";
        const text = recoverySecurityGuidance(recoveryKind,responseLanguage);
        await application.messages.write({
          messageId: randomUUID(),sessionId: found.sessionId,role: "user",
          text: body.text,outcome: "REFUSE_ZONE",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        const messageId = randomUUID();
        const stored = await application.messages.write({
          messageId,sessionId: found.sessionId,role: "assistant",
          text,outcome: "REFUSE_ZONE",language: responseLanguage,
          detectedLanguage: classification.language,overrideLanguage,
          receivedAt: now,firstTokenAt: null,completedAt: now
        });
        return reply.send({
          message_id: messageId,outcome: "REFUSE_ZONE",text: stored.text,
          sources: Object.freeze([]),actions: Object.freeze([])
        });
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
        const result = await application.answer.respond({
          sessionId: found.sessionId,
          text: body.text,
          language: responseLanguage,
          detectedLanguage: classification.language,
          overrideLanguage,
          modelRef: state.snapshot.values.supportModelRef,
          kbVersion: found.kbVersion,
          ...(knowledgeSnapshot === undefined ? {} : { snapshot: knowledgeSnapshot }),
          signedIn: found.identityOwnerRef !== null,
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
          sources: result.sources ?? Object.freeze([]),
          actions: result.actions ?? Object.freeze([]),
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
      const found = await application.sessions.read({
        sessionId: body.session_id,tokenSha256
      });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      if (found.state === "LOCKED") return rateLimited(reply,found.language);
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
      const found = await application.sessions.read({ sessionId: request.params.id,tokenSha256 });
      if (found === null || !sessionOwnerMatches(request,found)) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      if (found.shreddedAt !== undefined && found.shreddedAt !== null) {
        return shredded(reply,found.language);
      }
      if (found.state === "LOCKED") return rateLimited(reply,found.language);
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
      const configuration = await application.configuration.current();
      if (configuration.kind !== "AVAILABLE") {
        return reply.status(503).send({ error: configuration.code });
      }
      const tokenSha256 = hashSupportCapability(request.params.token);
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
        found = await application.caseAccess.readByToken(tokenSha256,{
          limit,...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor })
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
      const tokenSha256 = hashSupportCapability(request.params.token);
      const body = typeof request.body === "object" && request.body !== null
        ? request.body as Readonly<Record<string,unknown>> : {};
      if (tokenSha256 === null || typeof body.text !== "string" || body.text.trim() === "") {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
      let state;
      try {
        state = await application.caseAccess.replyByToken({
          tokenSha256,text: body.text,at: (application.clock ?? (() => new Date()))(),
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
      calls_last_7_days: support.callsLast7Days ?? support.callsToday,
      input_tokens_today: support.inputTokensToday ?? null,
      output_tokens_today: support.outputTokensToday ?? null,
      cost_usd_today: support.costUsdToday ?? null,
      input_tokens_last_7_days: support.inputTokensLast7Days ?? null,
      output_tokens_last_7_days: support.outputTokensLast7Days ?? null,
      cost_usd_last_7_days: support.costUsdLast7Days ?? null,
      open_sessions: support.openSessions,
      new_cases: support.newCases,
      kb_version: knowledge.kbVersion,
      kb_loaded: { shipped: knowledge.shipped, ignored: knowledge.ignored },
      relay_state: support.relayState ?? "AVAILABLE",
      relay_unavailable_since: support.relayUnavailableSince?.toISOString() ?? null,
      deflection_7_days: support.deflection7Days,
      deflection_30_days: support.deflection30Days,
      rating_resolution_7_days: support.ratingResolution7Days,
      rating_resolution_30_days: support.ratingResolution30Days
    });
  });
}
