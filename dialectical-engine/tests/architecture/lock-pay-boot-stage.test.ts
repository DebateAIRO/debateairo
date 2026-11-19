// Real payments on the hosted preview: main.ts checks the owner's switch in its own boot stage, under the boot ledger,
// once the connectors know the payment system and before a live boot asks about the other system's open records.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the API boot stage preview-live-payments", () => {
  it("runs on every boot, after the billing connectors are built and before the live boot's record checks", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const from = main.indexOf("const boot = installBootCustody(");
    const connectors = main.indexOf('boot.runSync("billing-connectors"');
    const providerOnly = main.indexOf('boot.runSync("billing-netopia-connectors"');
    const stage = main.indexOf('\nboot.runSync("preview-live-payments", () => assertPreviewLivePayments({\n');
    const other = main.indexOf('boot.run("billing-other-system-records"');
    const live = main.lastIndexOf('if (billingConnectors?.paymentEnvironment === "live") {', other);
    const release = main.indexOf("boot.release()");
    expect(from).toBeGreaterThan(0);
    expect(connectors).toBeGreaterThan(from);
    expect(providerOnly).toBeGreaterThan(connectors);
    // At the top level (column 0): not inside the live-only or any other conditional block.
    expect(stage).toBeGreaterThan(providerOnly);
    expect(stage).toBeLessThan(live);
    expect(live).toBeLessThan(other);
    expect(other).toBeLessThan(release);
    expect(main.split('boot.runSync("preview-live-payments"').length).toBe(2);
    const call = main.slice(stage, main.indexOf("}));", stage) + 4);
    expect(call).toContain("preview: previewGate !== undefined,");
    expect(call).toContain("paymentEnvironment: (billingConnectors ?? providerOnlyConnectors)?.paymentEnvironment ?? null,");
    expect(call).toContain('billingOn: billingMode === "ON",');
    expect(call).toContain("flag: environment.PREVIEW_LIVE_PAYMENTS ?? null");
    expect(main.indexOf("const billingMode: BillingMode = billingModeOf(")).toBeLessThan(connectors);
    expect(main).toMatch(/import \{[^}]*\bassertPreviewLivePayments,[^}]*\} from "\.\/billing\/stage-clock\.js";/u);
  });

  it("the sandbox boot's live-records guard also counts the live charges' open work, on the hosted preview only", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    const guard = main.indexOf('boot.run("billing-live-records-on-sandbox", async () => {');
    const end = main.indexOf("\n  });\n}\n", guard);
    expect(guard).toBeGreaterThan(0);
    expect(main.lastIndexOf('if (billingConnectors?.paymentEnvironment === "sandbox") {', guard)).toBeGreaterThan(main.indexOf('boot.runSync("preview-live-payments"'));
    const body = main.slice(guard, end);
    // One repository over the boot pool for both reads; deploy/vps (no preview gate) keeps its zero counts and asks nothing more.
    expect(body.match(/new \w*Billing\w*\(\s*pool\b/gu)).toEqual(["new BillingRepository(pool"]);
    expect(body).toContain("const live = new BillingRepository(pool);");
    expect(body).toContain('subscriptions: await live.openNetopiaSubscriptionCount("live"),');
    expect(body).toContain('...(previewGate === undefined ? { charges: 0, jobs: 0 } : await live.openNetopiaChargeWork("live"))');
  });
});
