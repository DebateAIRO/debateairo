import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BillingDowngradeRequestSchema,
  BillingInvoicesResponseSchema,
  BillingSubscriptionResponseSchema
} from "@debateai/contract";
import type { BillingAdmission, BillingRequestSource, BillingRoutePolicy } from "./index.js";
import { answerRefusal as answer, billingNotFound as notFound } from "./refusal.js";
import { cancelForOwner, revokeCancelForOwner, scheduleDowngrade } from "./subscription-actions.js";
import { listInvoices, readSubscriptionView } from "./subscription-view.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/** The subscriber's routes; B7a's `BILLING_ROUTE_PATHS` spreads this list, so the two never drift. */
export const SUBSCRIPTION_ROUTE_PATHS = Object.freeze([
  "GET /v1/billing/subscription",
  "GET /v1/billing/invoices",
  "POST /v1/billing/subscription/downgrade",
  "POST /v1/billing/subscription/cancel",
  "POST /v1/billing/subscription/cancel-revoke"
] as const);
export type SubscriptionRoutePath = typeof SUBSCRIPTION_ROUTE_PATHS[number];

function malformed(reply: FastifyReply): FastifyReply {
  return reply.status(400).send({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
}

function ownerOf(request: FastifyRequest): string | null {
  return request.authenticatedSession?.ownerRef ?? null;
}

/**
 * P12/P13. `deps` is undefined in local mode and while billing is off; every route is still registered (the
 * inventory and the s7 matrix need it) and answers the closed 404. `policy` is B7a's `BillingRouteDeps.policy`;
 * `admit` and `source` are the two values P8a's `installBillingRoutes` resolves from `deps.admission` and
 * `deps.source` (R-3), so these routes charge the same budgets as the rest of the billing module.
 */
export function installSubscriptionRoutes(
  api: FastifyInstance,
  deps: SubscriptionRouteDeps | undefined,
  policy: BillingRoutePolicy,
  admit: BillingAdmission,
  source: BillingRequestSource
): void {
  api.get("/v1/billing/subscription", policy("GET /v1/billing/subscription"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    return answer(reply, async () => reply.send(BillingSubscriptionResponseSchema.parse({
      subscription: await readSubscriptionView(deps, ownerRef, deps.clock())
    })));
  });
  api.get("/v1/billing/invoices", policy("GET /v1/billing/invoices"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    return answer(reply, async () => reply.send(BillingInvoicesResponseSchema.parse(await listInvoices(deps, ownerRef))));
  });
  api.post("/v1/billing/subscription/downgrade", policy("POST /v1/billing/subscription/downgrade"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    const parsed = BillingDowngradeRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    // Every downgrade prices the lower plan at the tax service: the same sealed per-owner budget as a quote.
    if (!admit.gate(reply, "billingQuote", "POST /v1/billing/subscription/downgrade", ownerRef)) return reply;
    return answer(reply, async () => {
      await scheduleDowngrade(deps, ownerRef, parsed.data.plan_id);
      return reply.status(204).send();
    });
  });
  // The one-click cancel is never refused by a budget (Terms §12); the repeat cycle is bounded at the revoke.
  api.post("/v1/billing/subscription/cancel", policy("POST /v1/billing/subscription/cancel"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    return answer(reply, async () => {
      await cancelForOwner(deps, ownerRef);
      return reply.status(204).send();
    });
  });
  api.post("/v1/billing/subscription/cancel-revoke", policy("POST /v1/billing/subscription/cancel-revoke"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    // Every repeat cancel needs a revoke first: this budget bounds the extra events and M7s at about ten an hour.
    if (!admit.gate(reply, "billingQuote", "POST /v1/billing/subscription/cancel-revoke", ownerRef)) return reply;
    return answer(reply, async () => {
      await revokeCancelForOwner(deps, ownerRef);
      return reply.status(204).send();
    });
  });
  // P12c (the upgrade quote, which reads the caller's address) is the first route to read `source`.
  void source;
}
