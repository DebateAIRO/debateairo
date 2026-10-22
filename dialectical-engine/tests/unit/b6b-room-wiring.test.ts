import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * The F33 class again (tests/unit/v28-envelope-wiring.test.ts): a control that is
 * built, optional, and wired into nothing. The API root builds the room in hosted
 * mode once the band is published, supplies it INSTEAD of the daily guard, and
 * asks B4a's one readiness check first (A22, R-5): billing on without the band
 * or without plans refuses the boot.
 */
describe("B6b the API root composes the room", () => {
  it("builds it in hosted mode only, with the band, and billing's windows only when billing is on", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const loader = await readFile("apps/api/src/admission-settings.ts", "utf8");
    // Side-by-side spec §13 (S9): the room's boot questions and its site parts are asked over the SITE's money row
    // BEFORE the admission loader (billing on or off is a site member the loader's picker and run ceiling read); the
    // room itself is built after the loader, over the site version's estimator.
    expect(main).toMatch(/const askRoomReadiness = environment\.DEPLOYMENT_MODE === "hosted" && siteCostEnvelopePolicy !== null/u);
    const stepEnd = main.indexOf("// V-30(1): the support chat's model is configuration");
    const step = main.slice(main.indexOf('boot.run("ask-room"'), stepEnd);
    expect(stepEnd).toBeGreaterThan(main.indexOf('boot.run("ask-room"'));
    // Side-by-side spec §13 (S14, ruling R57): B4a's readiness, the band and the room-read budget are one decision
    // (decideAskRoomReadiness, admission-settings.ts) shared with the practice and check-version; null = no band.
    const ready = step.indexOf("const readiness = decideAskRoomReadiness({");
    const bandless = step.indexOf("if (readiness === null) {");
    expect(ready).toBeGreaterThan(-1);
    expect(bandless).toBeGreaterThan(ready);
    const decision = loader.slice(loader.indexOf("export function decideAskRoomReadiness("), loader.indexOf("export function buildAdmissionSiteContext("));
    expect(decision.indexOf("const billingPlans = assertBillingReady({")).toBeGreaterThan(-1);
    expect(decision.indexOf("if (band === null) return null;")).toBeGreaterThan(decision.indexOf("const billingPlans = assertBillingReady({"));
    expect(decision).toContain("envelope: input.envelope");
    expect(decision).not.toContain("BILLING_PLANS_UNRESOLVED");
    // No band and a non-empty line: the boot is refused by name, before anything is built.
    const stranded = step.slice(bandless, step.indexOf("return undefined;", bandless));
    expect(stranded).toContain("await new RunWaitRepository(pool).countWaiting()");
    expect(stranded).toContain('"WAITING_LINE_REQUIRES_BAND"');
    expect(step).toContain("envelope: siteCostEnvelopePolicy");
    expect(step).not.toContain("BILLING_PLANS_UNRESOLVED");
    expect(step).not.toContain("BILLING_REQUIRES_ENVELOPE_MEMBERS");
    expect(step).toContain("new BillingPersonAllowanceSource(");
    expect(step).toContain("NO_PERSON_ALLOWANCE");
    // R-19's API half: billing off builds no entitlement repository and no
    // person allowance, so openStart neither appends a lazy free entitlement
    // nor writes a charge scope the runner would wall at Free's windows.
    expect(step).toContain("const entitlements = billingPlans === null ? null : new EntitlementRepository(pool);");
    expect(step).toContain("const personAllowance = entitlements === null || billingPlans === null");
    const loaded = main.indexOf("const siteAdmission = await loadAdmissionSettings(");
    const composition = main.slice(main.indexOf('boot.runSync("ask-room-composition"'), main.indexOf("const askRoom = askRoomComposition?.room;"));
    expect(loaded).toBeGreaterThan(main.indexOf('boot.run("ask-room"'));
    expect(loaded).toBeLessThan(main.indexOf('boot.runSync("ask-room-composition"'));
    expect(composition).toContain("lockPool: roomDecisionPool");
    expect(composition).toContain("    personAllowance,\n    entitlements,\n");
    expect(composition).toContain("const estimator = siteAdmission.estimator;");
    // The estimator is each version's (the loader's), over the site's prices and recent runs, capped at what one run of
    // that version may spend; the room is handed the site version's and every version's by `estimatorFor`.
    // Side-by-side spec §13 (S14): the site context is built by the one builder main.ts, the practice and check-version
    // share (buildAdmissionSiteContext); main.ts tells it the room is built exactly when the room's readiness answered.
    expect(main).toContain("askRoomReadiness: askRoomReadiness ?? null,");
    expect(loader).toContain("const askRoom = input.askRoomReadiness !== null;");
    expect(loader).toContain("prices: buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE),");
    expect(loader).toContain("recentRunUsage: askRoom ? new PostgresRecentRunUsageSource(pool) : null,");
    expect(composition).toContain("estimatorFor: async (version) => (await admissionCache.admissionSettingsFor(version)).estimator!,");
    expect(loader).toContain("maximumMicros: mostOneRunMaySpendMicros(guardPolicy)");
  });

  it("imports the allowance source from billing-core and the repository from db (R-1)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain('import { BillingPersonAllowanceSource } from "@debateai/billing-core";');
    expect(main).toMatch(/import \{[^}]*\bEntitlementRepository\b[^}]*\} from "@debateai\/db";/u);
    expect(main).not.toMatch(/import \{[^}]*\bBillingPersonAllowanceSource\b[^}]*\} from "@debateai\/db";/u);
  });

  it("supplies the room instead of the daily guard, never both", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const loader = await readFile("apps/api/src/admission-settings.ts", "utf8");
    expect(main).toContain("...(askRoom === undefined ? {} : { room: askRoom, waitingLine: askRoom }),");
    // Side-by-side spec §13 (S9): the daily guard is the version's (the one mapping hands it), built only when the site
    // context gives it a store, which main.ts does only without the room (S14: by the one site builder, told whether the
    // room is built).
    expect(main).toContain("askRoomReadiness: askRoomReadiness ?? null,");
    expect(loader).toContain("spend: siteCostEnvelopePolicy === null || askRoom ? null : new PostgresModelSpendStore(pool),");
    expect(loader).toContain("dailyGuard: site.spend === null ? null : new CostEnvelopeGuard({ store: site.spend, policy: guardPolicy }),");
    expect(loader).toContain("...(dailyGuard === null ? {} : { assertDailyCostEnvelope: () => dailyGuard.assertDailyEnvelopeAdmitsNewRun() }),");
  });

  it("gives the decision a pool of its own, closed with the others", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    // Connection budget (2026-10-10): the size moved to packages/db/src/pool-budget.ts, still 4.
    expect(main).toContain("const roomDecisionPool=boot.hold(createPool(environment.DATABASE_URL, API_DATABASE_POOLS.roomDecision));");
    expect(main).toContain("legacyAskAdmissionPool,\n    roomDecisionPool,");
  });
});
