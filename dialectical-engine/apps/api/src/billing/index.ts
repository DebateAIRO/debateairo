import type { FastifyInstance, FastifyReply } from "fastify";
import { BillingUsageResponseSchema } from "@debateai/contract";
import type { PlanId } from "@debateai/register";

/**
 * Paid-plans spec §2.5 — THE BILLING ROUTES, installed by `installBillingRoutes`
 * (pattern: `installSupportRoutes`, apps/api/src/support/index.ts:303). Every one
 * is always registered (the authorization inventory stays true) and answers 404
 * NOT_FOUND when billing is off or the deployment is local: the dependency that
 * serves it is simply absent. B7a creates this module with the first route, the
 * usage read; the plans, quote, checkout, notice and subscription tasks ADD their
 * paths to BILLING_ROUTE_PATHS, their optional members to BillingRouteDeps and
 * their routes to the same function (R-3). Nobody creates it twice.
 */
export const BILLING_ROUTE_PATHS = Object.freeze(["GET /v1/billing/usage"] as const);
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

export type BillingRouteDeps = Readonly<{
  /** `routePolicy` of apps/api/src/index.ts, so the authorization inventory stays the one source. */
  policy: BillingRoutePolicy;
  /** Present only when hosted and billingPolicy.enabled; absent, the usage route answers 404. */
  usage?: BillingUsageReader;
  clock?: () => Date;
}>;

/**
 * What main.ts hands `buildApi` as `ApiOptions.billing`: every member except
 * those only `buildApi` can build (the route policy). A later task that adds a
 * member only `buildApi` knows adds its name to this Omit as well.
 */
export type BillingRouteOptions = Omit<BillingRouteDeps, "policy">;

/** The house 404 every billing route answers while its dependency is absent. */
export function billingNotFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send({ error: "NOT_FOUND", message: "NOT_FOUND" });
}

export function installBillingRoutes(api: FastifyInstance, deps: BillingRouteDeps): void {
  const clock = deps.clock ?? (() => new Date());
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
}
