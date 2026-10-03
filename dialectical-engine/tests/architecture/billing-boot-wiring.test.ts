// tests/architecture/billing-boot-wiring.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("P6a — the API boot wires billing only when hosted and switched on", () => {
  it("reads the policy in hosted mode, asks B4a's readiness question, then builds the connectors under the boot ledger", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const policy = main.indexOf('boot.run("billing-policy", () => readBillingPolicy(pool, environment.REGISTER_VERSION))');
    const readiness = main.indexOf('boot.run("billing-readiness"');
    const connectors = main.indexOf('boot.runSync("billing-connectors"');
    expect(policy).toBeGreaterThan(0);
    expect(readiness).toBeGreaterThan(policy);
    expect(connectors).toBeGreaterThan(readiness);
    expect(main.slice(policy - 120, policy)).toContain('environment.DEPLOYMENT_MODE === "hosted"');
    expect(main.slice(readiness, connectors)).toContain("assertBillingReady({");
    expect(main).toContain("billingPolicy?.enabled === true");
    expect(main).toContain("readBillingEnvironmentGroup(environment)");
    // RULINGS-R3 R3-4: SmartBill's CIF comes from the legal notice's facts, never from api.env.
    expect(main.slice(connectors, connectors + 400)).toContain("company: SELLER_COMPANY");
    // SELLER_COMPANY has its own import line; B6b's billing-core line stays byte for byte (B6b's test pins it).
    expect(main).toContain('import { SELLER_COMPANY } from "@debateai/billing-core";');
    expect(main).toContain('import { BillingPersonAllowanceSource } from "@debateai/billing-core";');
    expect(main).not.toContain("SMARTBILL_COMPANY_CIF");
    expect(main).toContain("hold: (resource) => boot.hold(resource)");
    expect(main).toContain("...billingCustodyPaths(environment)");
    expect(main).toContain("billingConnectors.xmoneyPrivateKey.fill(0)");
    expect(main).not.toContain("PUBLIC_SITE_ORIGIN");
  });

  it("refuses a live boot while stage records are open, after the connectors know the xMoney system", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const connectors = main.indexOf('boot.runSync("billing-connectors"');
    const stage = main.indexOf('boot.run("billing-stage-records"');
    expect(stage).toBeGreaterThan(connectors);
    expect(main.slice(connectors, stage)).toContain('billingConnectors?.xmoneyEnvironment === "live"');
    expect(main.slice(stage, stage + 240)).toContain('assertStageRecordsClosed(await new BillingRepository(pool).openRecordCounts("stage"))');
  });

  it("refuses a live boot while billing rows or open jobs are dated more than a day ahead (W14, P2-I19)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const stage = main.indexOf('boot.run("billing-stage-records"');
    const ahead = main.indexOf('boot.run("billing-records-dated-ahead"');
    const live = main.lastIndexOf('if (billingConnectors?.xmoneyEnvironment === "live") {', stage);
    expect(ahead).toBeGreaterThan(stage);
    expect(live).toBeGreaterThan(0);
    // Inside the same live-only block as the stage check: a stage boot runs on its moved clock by design.
    expect(main.slice(live, ahead)).not.toContain("\n}\n");
    expect(main.slice(ahead, ahead + 240)).toContain("assertNoRecordsDatedAhead(await new BillingRepository(pool).recordsDatedAhead(new Date()))");
  });
});
