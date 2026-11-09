import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import {
  CRISIS_SUPPORT_OFFERED, SAVED_QUESTION_LIMITS, SavedQuestionIdSchema, SavedQuestionListSchema, SavedQuestionReadSchema,
  SavedQuestionWrittenSchema
} from "@debateai/contract";
import {
  SavedQuestionRefused, type SavedQuestionBinding, type SavedQuestionCaller, type SavedQuestionGate, type SavedQuestionRefusedCode,
  type SavedQuestionService
} from "./service.js";

/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.14; owner answers S3 A, S4 A): THE FIVE ROUTES of the questions not
 * started yet, for the signed-in person's own account. They are mounted whether or not the service is composed (absent: 503
 * SAVED_QUESTIONS_UNAVAILABLE after the sign-in, as the account memory's routes answer). The shared preHandler refuses an anonymous
 * request (401) and checks the CSRF pair and the Origin of every POST, PUT and DELETE. A first or later save carries its own body
 * limit, SAVED_QUESTION_LIMITS.saveBodyMaxBytes, as POST /v1/asks carries the start step's (never the 16 KiB credential limit). Every
 * answer is `cache-control: no-store`; a failure logs one line with the route and nothing else.
 */
export const SAVED_QUESTION_ROUTES = Object.freeze([
  "GET /v1/account/saved-questions",
  "POST /v1/account/saved-questions",
  "PUT /v1/account/saved-questions/{id}",
  "GET /v1/account/saved-questions/{id}",
  "DELETE /v1/account/saved-questions/{id}"
] as const);
export type SavedQuestionRoute = typeof SAVED_QUESTION_ROUTES[number];

export type SavedQuestionRouteDeps = Readonly<{
  routePolicy: (route: SavedQuestionRoute) => RouteShorthandOptions;
  service: SavedQuestionService | undefined;
  /** The signed-in account (null: none), from the session, never from the body. */
  callerOf(request: FastifyRequest): SavedQuestionCaller | null;
  /** The preview's team rule, as POST /v1/asks applies it. */
  teamAdmits(request: FastifyRequest): boolean;
  /** The one-time data consent, read as POST /v1/asks reads it (Task 39e ruling: a request's, so the route gives it). */
  consentGiven(request: FastifyRequest): Promise<boolean>;
  /** startStepBindingOf (Task 30) under the active version, without its version (Task 39e ruling: the route gives it). */
  bindingOf(caller: SavedQuestionCaller): Promise<SavedQuestionBinding | null>;
  /** The edge's country, for the crisis screen's helplines. */
  edgeCountry(request: FastifyRequest): string | null;
}>;

const STATUS: Readonly<Record<SavedQuestionRefusedCode, number>> = Object.freeze({
  MALFORMED_REQUEST: 400,
  SAVED_QUESTION_TOO_LARGE: 400,
  SAVED_QUESTION_INVALID: 400,
  CRISIS_SUPPORT_OFFERED: 422,
  SENSITIVE_DATA_CONSENT_REQUIRED: 403,
  PREVIEW_TEAM_ONLY: 403,
  SAVED_QUESTION_GONE: 404,
  SAVED_QUESTIONS_OFF: 409,
  SAVED_QUESTIONS_FULL: 409,
  SAVED_QUESTION_REVISION: 409,
  SAVED_QUESTIONS_UNAVAILABLE: 503
});

export function registerSavedQuestionRoutes(api: FastifyInstance, deps: SavedQuestionRouteDeps): void {
  const refusal = (reply: FastifyReply, code: SavedQuestionRefusedCode, request: FastifyRequest, revision?: number) =>
    reply.status(STATUS[code]).send({ error: code, message: code,
      ...(code === CRISIS_SUPPORT_OFFERED ? { country: deps.edgeCountry(request) } : {}),
      ...(revision === undefined ? {} : { revision }) });

  /**
   * One route's frame: no-store, the sign-in, the service, the id (a lowercase uuid, as the API makes them: the question-key store
   * compares ids as written), then the route's own work; a refusal answers its code, anything else 503 with one content-free line.
   */
  const handled = (route: SavedQuestionRoute, work: (input: Readonly<{ caller: SavedQuestionCaller; service: SavedQuestionService;
    gate: SavedQuestionGate; id: string | null }>, reply: FastifyReply) => Promise<FastifyReply>) =>
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      reply.header("cache-control", "no-store");
      const caller = deps.callerOf(request);
      if (caller === null) return reply.status(401).send({ error: "SESSION_REQUIRED" });
      const service = deps.service;
      if (service === undefined) return refusal(reply, "SAVED_QUESTIONS_UNAVAILABLE", request);
      let id: string | null = null;
      if (route.endsWith("{id}")) {
        const parsed = SavedQuestionIdSchema.safeParse((request.params as Readonly<{ id?: unknown }> | undefined)?.id);
        if (!parsed.success) return refusal(reply, "MALFORMED_REQUEST", request);
        id = parsed.data;
      }
      const gate: SavedQuestionGate = Object.freeze({
        teamAdmits: deps.teamAdmits(request),
        consentGiven: () => deps.consentGiven(request),
        bindingOf: () => deps.bindingOf(caller)
      });
      try {
        return await work({ caller, service, gate, id }, reply);
      } catch (error) {
        if (error instanceof SavedQuestionRefused) return refusal(reply, error.code, request, error.revision);
        console.error(JSON.stringify(Object.freeze({ event: "api.saved_question.failed", route })));
        return refusal(reply, "SAVED_QUESTIONS_UNAVAILABLE", request);
      }
    };
  const saveLimit = (route: SavedQuestionRoute): RouteShorthandOptions =>
    Object.freeze({ ...deps.routePolicy(route), bodyLimit: SAVED_QUESTION_LIMITS.saveBodyMaxBytes });

  api.get("/v1/account/saved-questions", deps.routePolicy("GET /v1/account/saved-questions"),
    handled("GET /v1/account/saved-questions", async ({ caller, service, gate }, reply) =>
      reply.send(SavedQuestionListSchema.parse(await service.list(caller, gate)))));
  api.post("/v1/account/saved-questions", saveLimit("POST /v1/account/saved-questions"),
    handled("POST /v1/account/saved-questions", async ({ caller, service, gate }, reply) =>
      reply.status(201).send(SavedQuestionWrittenSchema.parse(await service.create(caller, reply.request.body, gate)))));
  api.put("/v1/account/saved-questions/:id", saveLimit("PUT /v1/account/saved-questions/{id}"),
    handled("PUT /v1/account/saved-questions/{id}", async ({ caller, service, gate, id }, reply) =>
      reply.send(SavedQuestionWrittenSchema.parse(await service.save(caller, id!, reply.request.body, gate)))));
  api.get("/v1/account/saved-questions/:id", deps.routePolicy("GET /v1/account/saved-questions/{id}"),
    handled("GET /v1/account/saved-questions/{id}", async ({ caller, service, gate, id }, reply) => {
      const read = await service.read(caller, id!, gate);
      return read === null ? refusal(reply, "SAVED_QUESTION_GONE", reply.request) : reply.send(SavedQuestionReadSchema.parse(read));
    }));
  api.delete("/v1/account/saved-questions/:id", deps.routePolicy("DELETE /v1/account/saved-questions/{id}"),
    handled("DELETE /v1/account/saved-questions/{id}", async ({ caller, service, id }, reply) => {
      await service.remove(caller, id!);
      return reply.status(204).send();
    }));
}
