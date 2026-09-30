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
    expect(main).toMatch(/const askRoomComposition = environment\.DEPLOYMENT_MODE === "hosted" && costEnvelopeRows !== undefined/u);
    const step = main.slice(main.indexOf('boot.run("ask-room"'), main.indexOf("const askRoom = askRoomComposition?.room;"));
    expect(step.length).toBeGreaterThan(0);
    const ready = step.indexOf("const billingPlans = assertBillingReady({");
    const bandless = step.indexOf("if (band === null) {");
    expect(ready).toBeGreaterThan(-1);
    expect(bandless).toBeGreaterThan(ready);
    // No band and a non-empty line: the boot is refused by name, before anything is built.
    const stranded = step.slice(bandless, step.indexOf("return undefined;", bandless));
    expect(stranded).toContain("await new RunWaitRepository(pool).countWaiting()");
    expect(stranded).toContain('"WAITING_LINE_REQUIRES_BAND"');
    expect(step).toContain("envelope: costEnvelopeRows.runPolicy");
    expect(step).not.toContain("BILLING_PLANS_UNRESOLVED");
    expect(step).not.toContain("BILLING_REQUIRES_ENVELOPE_MEMBERS");
    expect(step).toContain("lockPool: roomDecisionPool");
    expect(step).toContain("new BillingPersonAllowanceSource(");
    expect(step).toContain("NO_PERSON_ALLOWANCE");
    expect(step).toContain("buildApiProviderPriceMap(declaredProviderTargets, environment.DEPLOYMENT_MODE)");
    expect(step).toContain("mostOneRunMaySpendMicros(costEnvelopeRows.guardPolicy)");
  });

  it("imports the allowance source from billing-core and the repository from db (R-1)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain('import { BillingPersonAllowanceSource } from "@debateai/billing-core";');
    expect(main).toMatch(/import \{[^}]*\bEntitlementRepository\b[^}]*\} from "@debateai\/db";/u);
    expect(main).not.toMatch(/import \{[^}]*\bBillingPersonAllowanceSource\b[^}]*\} from "@debateai\/db";/u);
  });

  it("supplies the room instead of the daily guard, never both", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("...(askRoom !== undefined\n    ? { room: askRoom }");
    expect(main).toContain("assertDailyCostEnvelope: () => costEnvelopeGuard.assertDailyEnvelopeAdmitsNewRun()");
  });

  it("gives the decision a pool of its own, closed with the others", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("const roomDecisionPool=boot.hold(createPool(environment.DATABASE_URL,{ max: 4 }));");
    expect(main).toContain("legacyAskAdmissionPool,\n    roomDecisionPool,");
  });
});
