// tests/architecture/billing-boot-wiring.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("N8 — the API boot wires billing only when hosted, switched on or provider-only", () => {
  it("reads the policy in hosted mode, asks B4a's readiness question, decides the mode, then builds the connectors", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const policy = main.indexOf('boot.run("billing-policy", () => readBillingPolicy(pool, environment.REGISTER_VERSION))');
    const readiness = main.indexOf('boot.run("billing-readiness"');
    const mode = main.indexOf("const billingMode: BillingMode = billingModeOf({");
    const connectors = main.indexOf('boot.runSync("billing-connectors"');
    expect(policy).toBeGreaterThan(0);
    expect(readiness).toBeGreaterThan(policy);
    expect(mode).toBeGreaterThan(readiness);
    expect(connectors).toBeGreaterThan(mode);
    expect(main.slice(policy - 120, policy)).toContain('environment.DEPLOYMENT_MODE === "hosted"');
    expect(main.slice(readiness, connectors)).toContain("assertBillingReady({");
    expect(main).toContain("billingPolicy?.enabled === true");
    expect(main.slice(mode, connectors)).toContain('hosted: environment.DEPLOYMENT_MODE === "hosted"');
    expect(main.slice(mode, connectors + 80)).toContain('billingMode === "ON"');
    expect(main).toContain("readBillingEnvironmentGroup(environment)");
    expect(main.slice(connectors, connectors + 400)).toContain("company: SELLER_COMPANY");
    expect(main).toContain('import { SELLER_COMPANY } from "@debateai/billing-core";');
    expect(main).toContain('import { BillingPersonAllowanceSource } from "@debateai/billing-core";');
    expect(main).not.toContain("SMARTBILL_COMPANY_CIF");
    expect(main).not.toContain("hold: (resource) => boot.hold(resource)");
    expect(main).toContain("...billingCustodyPaths(environment)");
    expect(main).not.toContain("PUBLIC_SITE_ORIGIN");
    // No development knob reaches the production boot.
    expect(main).not.toContain("trustedKeyOwners");
    expect(main).not.toContain("allowLoopbackBase");
  });

  it("builds the NETOPIA connector alone in the provider-only mode, and names a group set in part", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const providerOnly = main.indexOf('boot.runSync("billing-netopia-connectors"');
    expect(providerOnly).toBeGreaterThan(0);
    expect(main.slice(providerOnly - 200, providerOnly)).toContain('billingMode === "PROVIDER_ONLY"');
    expect(main.slice(providerOnly, providerOnly + 300)).toContain("readNetopiaEnvironmentGroup(environment)");
    expect(main).toContain("const providerOnlyConnectors: NetopiaConnectors | null");
    expect(main).toContain("incompleteNetopiaKey(environment)");
    expect(main).toContain('event: "billing.provider_only.incomplete"');
    // F3 (protocol-3): the notify route's billingNotify scope is sealed here exactly as in mode ON, before anything is built.
    const sealed = main.indexOf("assertProviderOnlyNotifySealed(admissionPolicy);");
    expect(sealed).toBeGreaterThan(providerOnly);
    expect(sealed).toBeLessThan(main.indexOf("loadNetopiaConnectors({", providerOnly));
  });

  it("refuses a live boot while another payment system's records are open, after the connectors know the payment system", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const connectors = main.indexOf('boot.runSync("billing-connectors"');
    const other = main.indexOf('boot.run("billing-other-system-records"');
    expect(other).toBeGreaterThan(connectors);
    expect(main.slice(connectors, other)).toContain('billingConnectors?.paymentEnvironment === "live"');
    expect(main.slice(other, other + 300)).toContain(
      'assertOtherSystemRecordsClosed(await new BillingRepository(pool).openOtherSystemRecordCounts({'
    );
    expect(main.slice(other, other + 300)).toContain('paymentProvider: "netopia", paymentEnvironment: "live"');
    expect(main).not.toContain("assertStageRecordsClosed");
  });

  it("refuses a live boot while billing rows or open jobs are dated more than a day ahead (W14, P2-I19)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const other = main.indexOf('boot.run("billing-other-system-records"');
    const ahead = main.indexOf('boot.run("billing-records-dated-ahead"');
    const live = main.lastIndexOf('if (billingConnectors?.paymentEnvironment === "live") {', other);
    expect(ahead).toBeGreaterThan(other);
    expect(live).toBeGreaterThan(0);
    expect(main.slice(live, ahead)).not.toContain("\n}\n");
    expect(main.slice(ahead, ahead + 240)).toContain("assertNoRecordsDatedAhead(await new BillingRepository(pool).recordsDatedAhead(new Date()))");
  });

  it("asks the retention purge once right after the API listens, then daily, in every mode (A15, P2-M42)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const daily = main.indexOf("setInterval(triggerRetentionPurge,86_400_000)");
    const listen = main.indexOf('await startup.run("listen"');
    const first = main.indexOf("\ntriggerRetentionPurge();\n");
    expect(daily).toBeGreaterThan(0);
    expect(listen).toBeGreaterThan(daily);
    expect(first).toBeGreaterThan(listen);
    expect(main.slice(listen, first)).toContain("\ntriggerErasureReconciliation();\n");
    expect(main.slice(listen, first)).not.toContain("billingPolicy");
  });

  it("N9: serves NETOPIA's message in the provider-only mode, and re-checks the quarantine once the API listens", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const connectors = main.indexOf("const providerOnlyConnectors: NetopiaConnectors | null");
    const intake = main.indexOf("const providerOnlyIntake = providerOnlyConnectors === null ? undefined : new NetopiaNoticeIntake({");
    expect(intake).toBeGreaterThan(connectors);
    expect(main.slice(intake, intake + 600)).toContain('mode: "PROVIDER_ONLY"');
    expect(main.slice(intake, intake + 600)).toContain("trust: providerOnlyConnectors.noticeTrust");
    expect(main).toContain("...(providerOnlyIntake === undefined ? {} : { netopiaNotices: providerOnlyIntake })");
    const listen = main.indexOf('await startup.run("listen"');
    const recheck = main.indexOf("netopiaIntake.recheckQuarantine(new Date())");
    expect(recheck).toBeGreaterThan(listen);
    expect(main).toContain("const netopiaIntake = billingRuntime?.netopiaNotices ?? providerOnlyIntake;");
    const runtime = await readFile("apps/api/src/billing/runtime.ts", "utf8");
    expect(runtime).toContain("trust: deps.connectors.noticeTrust");
    expect(runtime).toContain('mode: "ON"');
    expect(runtime).toMatch(/netopiaNotices,\s*\n\s*subscription\s*\n\s*\}\);/u);
  });

  it("F7 (data-1): the provider-only mode runs the daily card job alone, started with the API like the billing runtime", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const jobs = main.indexOf("const providerOnlyJobs = providerOnlyConnectors === null ? undefined : createProviderOnlyJobs({");
    expect(jobs).toBeGreaterThan(main.indexOf("const providerOnlyConnectors: NetopiaConnectors | null"));
    const built = main.slice(jobs, jobs + 500);
    expect(built).toContain("paymentEnvironment: providerOnlyConnectors.paymentEnvironment");
    expect(built).toContain("publicAppUrl: providerOnlyConnectors.publicAppUrl");
    expect(built).toContain("reportPending: (code) => console.error(`[${code}]`)");
    const listen = main.indexOf('await startup.run("listen"');
    const started = main.indexOf("\nproviderOnlyJobs?.start();\n");
    expect(started).toBeGreaterThan(listen);
    expect(main.slice(listen, started + 1)).toContain("\nbillingRuntime?.start();\n");
    const jobsSource = await readFile("apps/api/src/billing/provider-only-jobs.ts", "utf8");
    expect(jobsSource).toContain("new ProviderOnlyOwnerJobs({ custody, clock: deps.clock })");
    expect(jobsSource).toContain('deps.reportPending("BILLING_OWNER_JOBS_PENDING")');
    expect(jobsSource).toContain("setInterval(schedule, 86_400_000)");
  });

  it("F7 (data-2): refuses a sandbox boot while live NETOPIA plans are open, beside the live boot's guard", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const ahead = main.indexOf('boot.run("billing-records-dated-ahead"');
    const sandbox = main.indexOf('if (billingConnectors?.paymentEnvironment === "sandbox") {');
    const guard = main.indexOf('boot.run("billing-live-records-on-sandbox"');
    expect(sandbox).toBeGreaterThan(ahead);
    expect(guard).toBeGreaterThan(sandbox);
    expect(main.slice(guard, guard + 300)).toContain("assertOtherSystemRecordsClosed({");
    expect(main.slice(guard, guard + 300)).toContain('openNetopiaSubscriptionCount("live")');
  });

  it("F7 (money-3): the intake dates a message's card on the runtime's moved clock", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toContain("clockOffsetMs: stageClock.offsetMs");
    const runtime = await readFile("apps/api/src/billing/runtime.ts", "utf8");
    expect(runtime).toContain("clockOffsetMs: deps.clockOffsetMs ?? 0");
  });
});
