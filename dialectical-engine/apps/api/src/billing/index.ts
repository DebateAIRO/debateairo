import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BillingChargeStatusResponseSchema, BillingCheckoutRequestSchema, BillingCheckoutResponseSchema, BillingCurrencySchema,
  BillingPlansResponseSchema, BillingQuoteRequestSchema, BillingQuoteResponseSchema, BillingUsageResponseSchema,
  type BillingCurrency
} from "@debateai/contract";
import { allowanceVsPlus, microsToDecimal } from "@debateai/billing-core";
import type { GeoLookup } from "@debateai/geo";
import { planNetPrice, type BillingPlans, type PlanId } from "@debateai/register";
import { clientIpNetworkScope } from "../client-ip.js";
import type { LegalAcceptanceApplication } from "../legal.js";
import type { AuthenticatedSession } from "../sessions.js";
import type { ChargeStatusPort } from "./charge-status.js";
import type { CheckoutServicePort } from "./checkout.js";
import type { NetopiaNoticeIntakePort } from "./netopia-intake.js";
import { connectionCurrency } from "./place.js";
import type { QuoteResult, QuoteServicePort } from "./quote.js";
import { answerRefusal, BillingRefusal, billingNotFound } from "./refusal.js";
import { installSubscriptionRoutes, SUBSCRIPTION_ROUTE_PATHS } from "./subscription-routes.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

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
  "GET /v1/billing/charges/{chargeRef}",
  "POST /v1/billing/netopia/notify",
  ...SUBSCRIPTION_ROUTE_PATHS
] as const);
export type BillingRoutePath = typeof BILLING_ROUTE_PATHS[number];

export type BillingRoutePolicy = (route: BillingRoutePath) => Readonly<{
  config: Readonly<{ auth: "public" | "user" | "operator"; origin?: "trusted"; session?: "optional" }>;
}>;

export interface BillingUsageReader {
  read(ownerRef: string, now: Date): Promise<Readonly<{
    planId: PlanId | null;
    funding?: Readonly<{kind:"INTERNAL";expiresAt:Date}>;
    windows: ReadonlyArray<Readonly<{
      scope: "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH" | "PERSON_GRANT";
      percent: number;
      resetsAt: Date;
    }>>;
  }>>;
}

/** Spec §2.3.2: L4's re-acceptance rule is the one source of LEGAL_REACCEPTANCE_REQUIRED. */
export type BillingLegalGate = Pick<LegalAcceptanceApplication, "requiresReacceptance">;

/** The sealed admission scopes billing charges (the admission policy's next versions, contract §2). */
export type BillingAdmissionScope = "publicReads" | "billingQuote" | "billingCheckout" | "billingNotify"
  | "billingCancelLink";

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
  /** Part C: the connection's country for the plans' currency; absent, the rule's default. */
  geo?: GeoLookup;
  legal?: BillingLegalGate;
  /** P8b. */
  quotes?: QuoteServicePort;
  /** P8c. */
  checkout?: CheckoutServicePort;
  charges?: ChargeStatusPort;
  /** N9 (spec 2026-10-05 §2.7): NETOPIA's message. Present with billing on, and in the provider-only mode. */
  netopiaNotices?: NetopiaNoticeIntakePort;
  /**
   * P8c (R3-2): the age gate's reader. Only `buildApi` supplies it, from `options.sessions`; absent, the checkout
   * refuses 503 AGE_CHECK_UNAVAILABLE (this guard fails closed).
   */
  ageConfirmation?: BillingAgeConfirmation;
  /** P12/P13: present only when hosted with billing on; absent, the subscriber's routes answer 404. */
  subscription?: SubscriptionRouteDeps;
}>;

/**
 * What main.ts hands `buildApi` as `ApiOptions.billing`: every member except
 * those only `buildApi` can build (the route policy). A later task that adds a
 * member only `buildApi` knows adds its name to this Omit as well.
 * (B7a's type; P8a adds `admission` and `source`, which `buildApi` supplies.)
 * (P8c adds ageConfirmation, the age gate's reader, which buildApi binds.)
 */
export type BillingRouteOptions = Omit<BillingRouteDeps, "policy" | "admission" | "source" | "ageConfirmation">;

/** The house 404 and the refusal envelope (B7a, P8a) are defined once, in ./refusal.ts, and exported here. */
export { answerRefusal, billingNotFound };

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

/**
 * Spec 2026-10-05 §2.16.5: the answer names the caller's currency, so only the browser may keep it for a minute; a
 * shared cache would hand one country's currency to everyone.
 */
const PLANS_CACHE_CONTROL = "private, max-age=60";

/** Quote, checkout and card bodies are small; each declares the 16 KiB credential-route ceiling. */
const BILLING_BODY_LIMIT_BYTES = 16_384;

const NOTIFY_BODY_LIMIT_BYTES = 65_536;
/** N9 (spec 2026-10-05 §2.7.1): the route NETOPIA posts its message to (the public address adds `/api`). */
export const NETOPIA_NOTIFY_PATH = "/v1/billing/netopia/notify";
/**
 * NETOPIA's message must reach its verifier as the exact bytes received, whatever content type it was sent with: the
 * route's preParsing hook relabels the request with this private type, the one parser registered for it keeps a
 * Buffer, and every other route refuses the type with the house 415. Fastify's JSON parsing stays for all others.
 */
const NETOPIA_NOTICE_MEDIA_TYPE = "application/vnd.debateai.netopia-notice";

/** A transport fault the house error handler already maps to its constant envelope (index.ts TRANSPORT_FAULT_ENVELOPES). */
function transportFault(code: "FST_ERR_CTP_INVALID_MEDIA_TYPE" | "FST_ERR_CTP_BODY_TOO_LARGE", statusCode: 413 | 415): Error {
  return Object.assign(new Error(code), { code, statusCode });
}

function quoteResponse(result: QuoteResult): Readonly<Record<string, unknown>> {
  const { quote } = result;
  return BillingQuoteResponseSchema.parse({
    quote_ref: quote.quoteId, plan_id: quote.planId,
    net: microsToDecimal(quote.netMicros), tax: microsToDecimal(quote.taxMicros), total: microsToDecimal(quote.totalMicros),
    currency: quote.currency, tax_name: quote.taxName, tax_rate_bp: quote.taxRateBasisPoints, tax_country: quote.taxCountry,
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
      ...(usage.funding === undefined ? {} : {funding:{kind:"INTERNAL",expires_at:usage.funding.expiresAt.toISOString()}}),
      windows: usage.windows.map((window) => ({
        scope: window.scope, percent: window.percent, resets_at: window.resetsAt.toISOString()
      }))
    }));
  });

  // N9: root-level, because Fastify parsers are per encapsulation context and a plugin would register the route
  // asynchronously; for NETOPIA's notify route only (the route relabels its own requests), so every other route keeps
  // its 415.
  api.addContentTypeParser(
    NETOPIA_NOTICE_MEDIA_TYPE, { parseAs: "buffer", bodyLimit: NOTIFY_BODY_LIMIT_BYTES },
    (request, body, done) => {
      if (request.routeOptions.url !== NETOPIA_NOTIFY_PATH) {
        done(transportFault("FST_ERR_CTP_INVALID_MEDIA_TYPE", 415), undefined);
        return;
      }
      done(null, body);
    }
  );

  // The plans come from the register version read at boot, so one body per currency serves every caller until restart.
  const plansBodies = new Map<BillingCurrency, Readonly<Record<string, unknown>>>();
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
    // Spec 2026-10-05 §2.16.1: every plan's price in each currency, and the one this caller's connection pays in.
    const currency = connectionCurrency({ geo: deps.geo, plans, ip: source(request).ip });
    let body = plansBodies.get(currency);
    if (body === undefined) {
      body = BillingPlansResponseSchema.parse({
        currency,
        plans: plans.plans.map((plan) => ({
          plan_id: plan.planId,
          net_prices: Object.fromEntries(BillingCurrencySchema.options.map((priced) =>
            [priced, microsToDecimal(planNetPrice(plan, priced))])),
          allowance_vs_plus: allowanceVsPlus(plans, plan.planId)
        }))
      });
      plansBodies.set(currency, body);
    }
    return reply.send(body);
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
        name: body.name ?? null, firstName: body.first_name ?? null, lastName: body.last_name ?? null,
        phone: body.phone ?? null, street: body.street ?? null, region: body.region ?? null,
        postalCode: body.postal_code ?? null, city: body.city ?? null,
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
        redirect_url: result.redirectUrl, charge_ref: result.chargeId, environment: result.environment
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
      return reply.send(BillingChargeStatusResponseSchema.parse({ state: status.state, reason_code: status.reasonCode, kind: status.kind }));
    }
  );

  // N9 (spec 2026-10-05 §2.7.1-2.7.2): verification before admission. A verified message is never refused for volume;
  // only one that fails verification is charged to the source's billingNotify budget (429 over it). Every answer is
  // JSON; the intake decides it. Installed in BILLING_ROUTE_PATHS order.
  api.post(NETOPIA_NOTIFY_PATH, {
    ...deps.policy("POST /v1/billing/netopia/notify"),
    bodyLimit: NOTIFY_BODY_LIMIT_BYTES,
    preParsing: async (request, _reply, payload) => {
      request.headers = { ...request.headers, "content-type": NETOPIA_NOTICE_MEDIA_TYPE };
      return payload;
    }
  }, async (request, reply) => {
    const intake = deps.netopiaNotices;
    if (intake === undefined) return billingNotFound(reply);
    const sourceKey = clientIpNetworkScope(source(request).ip);
    // Node lowercases header names, so NETOPIA's `Verification-token` is read whatever its letter case.
    const header = request.headers["verification-token"];
    let refused = false;
    const answer = await intake.receive({
      rawBody: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      header: typeof header === "string" ? header : undefined,
      sourceKey,
      now: clock(),
      admit: () => {
        const admitted = admit.gate(reply, "billingNotify", "POST /v1/billing/netopia/notify", sourceKey);
        if (!admitted) refused = true;
        return admitted;
      }
    });
    // The gate has already answered 429 with its retry-after; never send twice, whatever the onSend hooks' timing.
    if (refused || reply.sent) return reply;
    return reply.status(answer.status).header("content-type", "application/json").send(answer.body);
  });

  // P12b onward: the subscriber's own routes, in BILLING_ROUTE_PATHS order after the notice route.
  installSubscriptionRoutes(api, deps.subscription, deps.policy, admit, source);
}
