import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BillingCancelByTokenRequestSchema,
  BillingCancelLinkAcceptedSchema,
  BillingCancelLinkRequestSchema,
  BillingCardChangeResponseSchema,
  BillingDowngradeRequestSchema,
  BillingInvoicesResponseSchema,
  BillingSubscriptionResponseSchema,
  BillingUpgradeQuoteRequestSchema,
  BillingUpgradeQuoteResponseSchema,
  BillingUpgradeRequestSchema,
  BillingUpgradeResponseSchema,
  BillingWithdrawRequestSchema,
  BillingWithdrawResponseSchema
} from "@debateai/contract";
import { microsToDecimal } from "@debateai/billing-core";
import { clientIpNetworkScope } from "../client-ip.js";
import { startCardChange } from "./card-change.js";
import type { BillingAdmission, BillingRequestSource, BillingRoutePolicy } from "./index.js";
import { answerRefusal as answer, billingNotFound as notFound } from "./refusal.js";
import { cancelForOwner, revokeCancelForOwner, scheduleDowngrade } from "./subscription-actions.js";
import { refuse } from "./subscription-core.js";
import { listInvoices, readSubscriptionView } from "./subscription-view.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";
import { quoteUpgrade, startUpgrade } from "./upgrade.js";
import { withdraw } from "./withdrawal.js";

/** The subscriber's routes; B7a's `BILLING_ROUTE_PATHS` spreads this list, so the two never drift. */
export const SUBSCRIPTION_ROUTE_PATHS = Object.freeze([
  "GET /v1/billing/subscription",
  "GET /v1/billing/invoices",
  "POST /v1/billing/subscription/downgrade",
  "POST /v1/billing/subscription/cancel",
  "POST /v1/billing/subscription/cancel-revoke",
  "POST /v1/billing/subscription/upgrade-quote",
  "POST /v1/billing/subscription/upgrade",
  "POST /v1/billing/subscription/withdraw",
  "POST /v1/billing/subscription/card",
  "POST /v1/billing/cancel-link",
  "POST /v1/billing/cancel-by-token"
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
  api.post("/v1/billing/subscription/upgrade-quote", policy("POST /v1/billing/subscription/upgrade-quote"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    const parsed = BillingUpgradeQuoteRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    // Every quote is a paid tax call: the same sealed per-owner budget as checkout's quote (P8b's billingQuote).
    if (!admit.gate(reply, "billingQuote", "POST /v1/billing/subscription/upgrade-quote", ownerRef)) return reply;
    return answer(reply, async () => reply.send(BillingUpgradeQuoteResponseSchema.parse(await quoteUpgrade(deps, {
      ownerRef, planId: parsed.data.plan_id, ip: source(request).ip, now: deps.clock()
    }))));
  });
  api.post("/v1/billing/subscription/upgrade", policy("POST /v1/billing/subscription/upgrade"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const ownerRef = ownerOf(request);
    if (ownerRef === null) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    const parsed = BillingUpgradeRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    return answer(reply, async () => reply.send(BillingUpgradeResponseSchema.parse(await startUpgrade(deps, {
      ownerRef, planId: parsed.data.plan_id, quoteRef: parsed.data.quote_ref
    }))));
  });
  // P12d: the step-up grant (WITHDRAW_SUBSCRIPTION) rides in the body and is spent under the owner lock.
  api.post("/v1/billing/subscription/withdraw", policy("POST /v1/billing/subscription/withdraw"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const authenticated = request.authenticatedSession;
    if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    const parsed = BillingWithdrawRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    return answer(reply, async () => {
      const result = await withdraw(deps, { authenticated, grantToken: parsed.data.step_up_grant });
      return reply.send(BillingWithdrawResponseSchema.parse({
        refund: result.refundMicros === null ? null : microsToDecimal(result.refundMicros)
      }));
    });
  });
  // P12e (A12): the card change's signed 1.00 USD authorization for the dedicated /settings/card page.
  api.post("/v1/billing/subscription/card", policy("POST /v1/billing/subscription/card"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const authenticated = request.authenticatedSession;
    if (authenticated === undefined) return reply.status(409).send({ error: "COOKIE_SESSION_REQUIRED" });
    // A card change signs an order and writes a charge row. It spends the owner's billingQuote budget, shared with
    // quotes, downgrades and cancel-revoke; checkout has its own scope (billingCheckout).
    if (!admit.gate(reply, "billingQuote", "POST /v1/billing/subscription/card", authenticated.ownerRef)) return reply;
    return answer(reply, async () => reply.send(BillingCardChangeResponseSchema.parse(await startCardChange(deps, {
      ownerRef: authenticated.ownerRef, userId: authenticated.userId, ip: source(request).ip, now: deps.clock()
    }))));
  });
  // P13 (A25, Terms §12): cancel without signing in. Both routes are public, first-party Origin only, and charge the
  // source network's billingCancelLink budget (DL5-F3: one IPv6 /64 is one bucket); never a session.
  const accepted = BillingCancelLinkAcceptedSchema.parse({ status: "ACCEPTED" });
  api.post("/v1/billing/cancel-link", policy("POST /v1/billing/cancel-link"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const parsed = BillingCancelLinkRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    if (!admit.gate(reply, "billingCancelLink", "POST /v1/billing/cancel-link", clientIpNetworkScope(source(request).ip))) {
      return reply;
    }
    const email = parsed.data.email;
    const links = deps.cancelLinks;
    // Answer first. Nothing below can change what this caller is told, or when (spec §2.7).
    setImmediate(() => {
      links.request(email).catch(() => console.error(JSON.stringify({ event: "billing.cancel_link.failed" })));
    });
    return reply.status(202).send(accepted);
  });
  api.post("/v1/billing/cancel-by-token", policy("POST /v1/billing/cancel-by-token"), async (request, reply) => {
    if (deps === undefined) return notFound(reply);
    const parsed = BillingCancelByTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) return malformed(reply);
    if (!admit.gate(reply, "billingCancelLink", "POST /v1/billing/cancel-by-token", clientIpNetworkScope(source(request).ip))) {
      return reply;
    }
    return answer(reply, async () => {
      if (await deps.cancelLinks.cancelByToken(parsed.data.token) === "INVALID") refuse(404, "CANCEL_LINK_INVALID");
      return reply.status(204).send();
    });
  });
}
