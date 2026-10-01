import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BillingChargeStatusResponseSchema, BillingCheckoutRequestSchema, BillingCheckoutResponseSchema,
  BillingPlansResponseSchema, BillingQuoteRequestSchema, BillingQuoteResponseSchema, BillingUsageResponseSchema
} from "@debateai/contract";
import { allowanceVsPlus, microsToDecimal } from "@debateai/billing-core";
import type { BillingPlans, PlanId } from "@debateai/register";
import { clientIpNetworkScope } from "../client-ip.js";
import type { LegalAcceptanceApplication } from "../legal.js";
import type { AuthenticatedSession } from "../sessions.js";
import type { ChargeStatusPort } from "./charge-status.js";
import type { CheckoutServicePort } from "./checkout.js";
import type { QuoteResult, QuoteServicePort } from "./quote.js";
import { BillingRefusal } from "./refusal.js";

/**
 * Paid-plans spec §2.5 — THE BILLING ROUTES, installed by `installBillingRoutes`
 * (pattern: `installSupportRoutes`, apps/api/src/support/index.ts:303). Every one
 * is always registered (the authorization inventory stays true) and answers 404
 * NOT_FOUND when billing is off or the deployment is local: the dependency that
 * serves it is simply absent. B7a creates this module with the first route, the
 * usage read; the plans, quote, checkout, notice and subscription tasks ADD their
 * paths to BILLING_ROUTE_PATHS, their optional members to BillingRouteDeps and
 * their routes to the same function (R-3). Nobody creates it twice. P8a adds the
 * public plans list and the shared refusal envelope.
 */
export const BILLING_ROUTE_PATHS = Object.freeze([
  "GET /v1/billing/usage",
  "GET /v1/billing/plans",
  "POST /v1/billing/quote",
  "POST /v1/billing/checkout",
  "GET /v1/billing/charges/{chargeRef}"
] as const);
export type BillingRoutePath = typeof BILLING_ROUTE_PATHS[number];

export type BillingRoutePolicy = (route: BillingRoutePath) => Readonly<{
  config: Readonly<{ auth: "public" | "user" | "operator"; origin?: "trusted"; session?: "optional" }>;
}>;

export interface BillingUsageReader {
  read(ownerRef: string, now: Date): Promise<Readonly<{
    planId: PlanId;
    windows: ReadonlyArray<Readonly<{
      scope: "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH";
      percent: number;
      resetsAt: Date;
    }>>;
  }>>;
}

/** Spec §2.3.2: L4's re-acceptance rule is the one source of LEGAL_REACCEPTANCE_REQUIRED. */
export type BillingLegalGate = Pick<LegalAcceptanceApplication, "requiresReacceptance">;

/** The sealed admission scopes billing charges (the admission policy's next versions, contract §2). */
export type BillingAdmissionScope = "publicReads" | "billingQuote" | "billingCheckout";

/** Like `SupportAdmission`: a scope the register version does not publish admits. */
export type BillingAdmission = Readonly<{
  gate(reply: FastifyReply, scope: BillingAdmissionScope, route: BillingRoutePath, key: string): boolean;
}>;

export type BillingRequestSource = (request: FastifyRequest) => Readonly<{ ip: string; userAgent: string }>;

/**
 * R3-2 (the age gate, PR #41): whether a session's account still owes its one-time age check. It is
 * `SessionApplication.readAgeConfirmation` (apps/api/src/sessions.ts:77), bound to its session application.
 */
export type BillingAgeConfirmation = (session: AuthenticatedSession) => Promise<"required" | "confirmed">;

export type BillingRouteDeps = Readonly<{
  /** `routePolicy` of apps/api/src/index.ts, so the authorization inventory stays the one source. */
  policy: BillingRoutePolicy;
  /** Present only when hosted and billingPolicy.enabled; absent, the usage route answers 404. */
  usage?: BillingUsageReader;
  clock?: () => Date;
  /** P8a: the admission budgets and the caller's source; apps/api/src/index.ts always supplies both. */
  admission?: BillingAdmission;
  source?: BillingRequestSource;
  /** P8a: composed by the billing runtime, present only when hosted with billing on. */
  plans?: BillingPlans;
  legal?: BillingLegalGate;
  /** P8b. */
  quotes?: QuoteServicePort;
  /** P8c. */
  checkout?: CheckoutServicePort;
  charges?: ChargeStatusPort;
  /**
   * P8c (R3-2): the age gate's reader. Only `buildApi` supplies it, from `options.sessions`; absent, the checkout
   * refuses 503 AGE_CHECK_UNAVAILABLE (this guard fails closed).
   */
  ageConfirmation?: BillingAgeConfirmation;
}>;

/**
 * What main.ts hands `buildApi` as `ApiOptions.billing`: every member except
 * those only `buildApi` can build (the route policy). A later task that adds a
 * member only `buildApi` knows adds its name to this Omit as well.
 * (B7a's type; P8a adds `admission` and `source`, which `buildApi` supplies.)
 * (P8c adds ageConfirmation, the age gate's reader, which buildApi binds.)
 */
export type BillingRouteOptions = Omit<BillingRouteDeps, "policy" | "admission" | "source" | "ageConfirmation">;

/** The house 404 every billing route answers while its dependency is absent. */
export function billingNotFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send({ error: "NOT_FOUND", message: "NOT_FOUND" });
}

/**
 * Maps a `BillingRefusal` to its status and code (and, for CHECKOUT_PENDING, the charge the page should wait on);
 * every other error reaches the house error handler.
 */
export async function answerRefusal(reply: FastifyReply, work: () => Promise<FastifyReply>): Promise<FastifyReply> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BillingRefusal) {
      return reply.status(error.status).send({
        error: error.code, message: error.code, ...(error.chargeRef === null ? {} : { charge_ref: error.chargeRef })
      });
    }
    throw error;
  }
}

/**
 * R3-2 (the age gate, 0077): the checkout takes no money from an account that still owes its one-time age check.
 * Answered under 18, that check freezes the account (`age_frozen`, every session revoked) while a plan bought
 * before it would go on renewing. The UI sends such a session to the interstitial first and may fail open (Q-10);
 * this guard fails closed: no reader, or a read that fails, is the age gate's own 503 AGE_CHECK_UNAVAILABLE
 * (`GET /v1/auth/age-confirmation`, apps/api/src/index.ts). Anything but "confirmed" is owed.
 */
async function refuseUnconfirmedAge(read: BillingAgeConfirmation | undefined, session: AuthenticatedSession): Promise<void> {
  if (read === undefined) throw new BillingRefusal(503, "AGE_CHECK_UNAVAILABLE");
  let status: "required" | "confirmed";
  try {
    status = await read(session);
  } catch {
    throw new BillingRefusal(503, "AGE_CHECK_UNAVAILABLE");
  }
  if (status !== "confirmed") throw new BillingRefusal(403, "AGE_CONFIRMATION_REQUIRED");
}

/** Spec §2.5.3: the public plans list may be cached by the browser and by any shared cache for 60 seconds. */
const PLANS_CACHE_CONTROL = "public, max-age=60";

/** Quote, checkout and card bodies are small; each declares the 16 KiB credential-route ceiling. */
const BILLING_BODY_LIMIT_BYTES = 16_384;

function quoteResponse(result: QuoteResult): Readonly<Record<string, unknown>> {
  const { quote } = result;
  return BillingQuoteResponseSchema.parse({
    quote_ref: quote.quoteId, plan_id: quote.planId,
    net: microsToDecimal(quote.netMicros), tax: microsToDecimal(quote.taxMicros), total: microsToDecimal(quote.totalMicros),
    tax_name: quote.taxName, tax_rate_bp: quote.taxRateBasisPoints, tax_country: quote.taxCountry,
    tax_region: quote.taxRegion, tax_status: quote.taxStatus, country: result.declaredCountry,
    ip_country: result.ipCountry, country_confirm_needed: result.countryConfirmNeeded,
    address_required: result.addressRequired, renews_on: result.renewsOn.toISOString(),
    withdrawal_days: result.withdrawalDays, expires_at: quote.expiresAt.toISOString()
  });
}

/** The fallbacks match apps/api/src/index.ts's own rule: no limiter composed = no budget to charge. */
const ADMIT_WITHOUT_LIMITER: BillingAdmission = Object.freeze({ gate: () => true });
const SOCKET_SOURCE: BillingRequestSource = (request) => Object.freeze({ ip: request.ip, userAgent: "unknown" });

export function installBillingRoutes(api: FastifyInstance, deps: BillingRouteDeps): void {
  const clock = deps.clock ?? (() => new Date());
  const admit = deps.admission ?? ADMIT_WITHOUT_LIMITER;
  const source = deps.source ?? SOCKET_SOURCE;

  api.get("/v1/billing/usage", deps.policy("GET /v1/billing/usage"), async (request, reply) => {
    const ownerRef = request.authenticatedSession?.ownerRef;
    if (deps.usage === undefined || ownerRef === undefined) return billingNotFound(reply);
    const usage = await deps.usage.read(ownerRef, clock());
    return reply.send(BillingUsageResponseSchema.parse({
      plan_id: usage.planId,
      windows: usage.windows.map((window) => ({
        scope: window.scope, percent: window.percent, resets_at: window.resetsAt.toISOString()
      }))
    }));
  });

  // The plans come from the register version read at boot, so one body serves every caller until restart.
  let plansBody: Readonly<Record<string, unknown>> | null = null;
  api.get("/v1/billing/plans", {
    ...deps.policy("GET /v1/billing/plans"),
    // Spec §2.5.3: "GET /v1/billing/plans (public; cached 60 s)". The house onSend hook of `buildApi`
    // (apps/api/src/index.ts) stamps `no-store` on every answer; a route-level hook runs after it (Fastify runs route
    // hooks last in their category), so only a served list may be cached for a minute. A 404 (billing off) or a 429
    // keeps no-store.
    onSend: async (_request, reply, payload) => {
      if (reply.statusCode === 200) reply.header("cache-control", PLANS_CACHE_CONTROL);
      return payload;
    }
  }, async (request, reply) => {
    const plans = deps.plans;
    if (plans === undefined) return billingNotFound(reply);
    // A source-keyed scope counts the caller's network (DL5-F3: an IPv6 address is its /64), as G3a's does.
    if (!admit.gate(reply, "publicReads", "GET /v1/billing/plans", clientIpNetworkScope(source(request).ip))) return reply;
    plansBody ??= BillingPlansResponseSchema.parse({
      currency: plans.currency,
      plans: plans.plans.map((plan) => ({
        plan_id: plan.planId,
        net_price: microsToDecimal(plan.netPriceMicros),
        allowance_vs_plus: allowanceVsPlus(plans, plan.planId)
      }))
    });
    return reply.send(plansBody);
  });

  api.post("/v1/billing/quote", { ...deps.policy("POST /v1/billing/quote"), bodyLimit: BILLING_BODY_LIMIT_BYTES }, async (request, reply) => {
    const { quotes, legal } = deps;
    if (quotes === undefined || legal === undefined) return billingNotFound(reply);
    const authenticated = request.authenticatedSession;
    if (authenticated === undefined) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    // Owner-keyed (contract §2: 10 an hour per owner), so no network scope applies here.
    if (!admit.gate(reply, "billingQuote", "POST /v1/billing/quote", authenticated.ownerRef)) return reply;
    const parsed = BillingQuoteRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    const body = parsed.data;
    return answerRefusal(reply, async () => {
      if (await legal.requiresReacceptance(authenticated.ownerRef)) {
        throw new BillingRefusal(403, "LEGAL_REACCEPTANCE_REQUIRED");
      }
      const result = await quotes.create({
        ownerRef: authenticated.ownerRef, ip: source(request).ip, planId: body.plan_id, country: body.country ?? null,
        name: body.name ?? null, region: body.region ?? null, postalCode: body.postal_code ?? null,
        city: body.city ?? null,
        company: body.company === undefined ? null
          : { name: body.company.name, vatId: body.company.vat_id, address: body.company.address },
        now: clock()
      });
      return reply.send(quoteResponse(result));
    });
  });

  api.post("/v1/billing/checkout", { ...deps.policy("POST /v1/billing/checkout"), bodyLimit: BILLING_BODY_LIMIT_BYTES }, async (request, reply) => {
    const { checkout, legal } = deps;
    if (checkout === undefined || legal === undefined) return billingNotFound(reply);
    const authenticated = request.authenticatedSession;
    if (authenticated === undefined) return reply.status(401).send({ error: "SESSION_REQUIRED" });
    if (!admit.gate(reply, "billingCheckout", "POST /v1/billing/checkout", authenticated.ownerRef)) return reply;
    const parsed = BillingCheckoutRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    const body = parsed.data;
    return answerRefusal(reply, async () => {
      // R3-2: the age check first (403 AGE_CONFIRMATION_REQUIRED, or 503 AGE_CHECK_UNAVAILABLE), then L4's legal gate.
      await refuseUnconfirmedAge(deps.ageConfirmation, authenticated);
      if (await legal.requiresReacceptance(authenticated.ownerRef)) {
        throw new BillingRefusal(403, "LEGAL_REACCEPTANCE_REQUIRED");
      }
      const from = source(request);
      const result = await checkout.start({
        ownerRef: authenticated.ownerRef, userId: authenticated.userId, ip: from.ip, userAgent: from.userAgent,
        quoteRef: body.quote_ref, locale: body.locale,
        consents: { renewal: body.consents.renewal_terms, immediateStart: body.consents.immediate_start },
        countryConfirmed: body.country_confirmed === true, now: clock()
      });
      return reply.send(BillingCheckoutResponseSchema.parse({
        public_key: result.publicKey, order_payload: result.orderPayload, order_checksum: result.orderChecksum,
        charge_ref: result.chargeId, sdk_environment: result.sdkEnvironment
      }));
    });
  });
  api.get<{ Params: { chargeRef: string } }>(
    "/v1/billing/charges/:chargeRef", deps.policy("GET /v1/billing/charges/{chargeRef}"), async (request, reply) => {
      const { charges } = deps;
      if (charges === undefined) return billingNotFound(reply);
      const authenticated = request.authenticatedSession;
      if (authenticated === undefined) return reply.status(401).send({ error: "SESSION_REQUIRED" });
      const status = await charges.read(request.params.chargeRef, authenticated.ownerRef);
      if (status === null) return billingNotFound(reply);
      return reply.send(BillingChargeStatusResponseSchema.parse({ state: status.state, reason_code: status.reasonCode }));
    }
  );
}
