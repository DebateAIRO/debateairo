import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  developmentBillingEnvironmentGroup,
  startDevelopmentBillingFakes
} from "../../apps/runner/src/dev-billing-fakes.js";
import { DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";
import { SMARTBILL_CIF_FORM, loadBillingConnectors } from "../../apps/api/src/billing/connectors.js";
import { SELLER_COMPANY, type SellerCompany } from "@debateai/billing-core";

/**
 * The mirror of COMPANY filled the way the owner fills it (X1 Step 3 item 6), for a fake SmartBill that answers only
 * `companyCif` (RULINGS-R3 R3-4). The CUI is the digits; in SMARTBILL_CIF_FORM's "ro" form the fake's CIF is the RO VAT
 * code. The fake's RO value never goes in as a CUI.
 */
function companyAnswering(companyCif: string): SellerCompany {
  const digits = companyCif.replace(/^RO/u, "");
  return SMARTBILL_CIF_FORM === "ro"
    ? { ...SELLER_COMPANY, cui: digits, vat: { kind: "registered", number: companyCif } }
    : { ...SELLER_COMPANY, cui: digits };
}

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
// Ephemeral ports: a developer's running stack may hold 8797–8799. The receipt records the real ones.
const profile = { ...DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE, billingFakePorts: [0, 0, 0] as const };

async function listening(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  return (server.address() as AddressInfo).port;
}

async function closed(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
}

/** Three loopback ports that were free a moment ago: each is bound on 0, read and released. */
async function freePorts(): Promise<readonly [number, number, number]> {
  const ports: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const probe = createServer();
    ports.push(await listening(probe, 0));
    await closed(probe);
  }
  return ports as unknown as readonly [number, number, number];
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p6b-dev-billing-"));
  await chmod(root, 0o700);
  roots.push(root);
  return root;
}

describe("P6b — development billing fakes", () => {
  it("creates private secrets once, starts the fakes on them, and the API's connectors talk to them", async () => {
    const repositoryRoot = await repository();
    const first = await startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile });
    let key: string;
    try {
      const keyPath = first.receipt.xmoney.privateKeyPath;
      expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
      expect((await stat(dirname(keyPath))).mode & 0o777).toBe(0o700);
      expect((await stat(first.receiptPath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(first.receiptPath, "utf8"))).toEqual(first.receipt);
      const connectors = loadBillingConnectors({
        environment: developmentBillingEnvironmentGroup(first.receipt),
        company: companyAnswering(first.receipt.smartbill.companyCif),
        recordsKey: randomBytes(32), hold: () => undefined
      });
      const { customerId } = await connectors.xmoney.createCustomer({ identifier: "dev-check", email: "person@example.test", country: "RO" });
      expect(customerId).toMatch(/^[0-9]+$/u);
      const quote = await connectors.tax.quote({
        netMicros: 20_000_000, currency: "USD", taxId: null, taxCode: "saas", date: new Date(),
        location: { country: "RO", region: null, postalCode: null, city: null, street: null, ip: null }
      });
      expect(quote.taxMicros).toBe(4_200_000);
      // The fake SmartBill refuses any other company code (400), so an issued invoice proves the code built from the
      // company facts is the one the fake answers, in the form SMARTBILL_CIF_FORM names.
      const invoice = await connectors.invoiceRo.issue({
        chargeId: "p6b-dev-check", transactionId: "0", issuedOn: new Date(),
        customer: {
          name: "Test Person", email: "person@example.test", country: "RO", region: "Cluj", postalCode: "400001",
          city: "Cluj-Napoca", street: "Str. Exemplu 1", taxId: null, locale: "ro"
        },
        lines: [{ description: "DebateAI Plus", netMicros: 1_000_000, taxMicros: 210_000, taxRateBasisPoints: 2100 }],
        taxCode: "saas",
        evidence: { billingCountry: "RO", ipAddress: "203.0.113.10", bankCountry: "RO" }
      });
      expect(invoice.series).toBe("DEV");
      key = await readFile(keyPath, "latin1");
    } finally {
      await first.stop();
    }
    const second = await startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile });
    try {
      expect(await readFile(second.receipt.xmoney.privateKeyPath, "latin1")).toBe(key);
    } finally {
      await second.stop();
    }
  });

  it("refuses a fake secret other users can read, and starts nothing", async () => {
    const repositoryRoot = await repository();
    const first = await startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile });
    await first.stop();
    await chmod(first.receipt.quaderno.apiKeyPath, 0o644);
    await expect(startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile }))
      .rejects.toThrow("DEV_BILLING_FAKES_SECRET_INVALID");
  });

  // A busy port must fail the start (not hang it), and the fakes already started must be stopped: the second start on
  // the same three ports can only succeed if nothing from the failed start still holds them.
  it("fails, instead of hanging, when a billing port is busy, and stops the fakes it had started", async () => {
    const repositoryRoot = await repository();
    for (const busy of [0, 1, 2] as const) {
      const billingFakePorts = await freePorts();
      const busyProfile = { ...DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE, billingFakePorts };
      const holder = createServer();
      await listening(holder, billingFakePorts[busy]);
      try {
        await expect(startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile: busyProfile }))
          .rejects.toThrow("EADDRINUSE");
      } finally {
        await closed(holder);
      }
      const retried = await startDevelopmentBillingFakes({ repositoryRoot, commandEnvironment: {}, profile: busyProfile });
      await retried.stop();
    }
  }, 15_000);
});
