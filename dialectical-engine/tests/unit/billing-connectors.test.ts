// tests/unit/billing-connectors.test.ts
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SELLER_COMPANY, type SellerCompany } from "@debateai/billing-core";
import {
  SMARTBILL_CIF_FORM,
  assertNoRecordsDatedAhead,
  assertStageRecordsClosed,
  billingCustodyPaths,
  loadBillingConnectors,
  smartBillCompanyCif
} from "../../apps/api/src/billing/connectors.js";
import type { BillingEnvironmentGroup } from "@debateai/register";
import { startFakeSmartBill } from "../support/fake-smartbill.js";

const roots: string[] = [];
function custody(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "p6a-billing-custody-"));
  chmodSync(root, 0o700);
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(root, name), contents);
    chmodSync(join(root, name), 0o600);
  }
  return root;
}
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function group(root: string, overrides: Partial<BillingEnvironmentGroup> = {}): BillingEnvironmentGroup {
  return {
    xmoneyPrivateKeyPath: join(root, "xmoney"), xmoneyPublicKey: "pk_stage_0123456789", xmoneySiteId: "4242",
    xmoneyApiBaseUrl: "https://api-stage.xmoney.com", quadernoApiKeyPath: join(root, "quaderno"),
    quadernoApiBaseUrl: "https://debateai.sandbox-quadernoapp.com/api", smartbillCredentialsPath: join(root, "smartbill"),
    smartbillApiBaseUrl: "https://ws.smartbill.ro/SBORO/api", smartbillSeries: "DBT",
    ownerReportEmailPath: join(root, "owner"), publicAppUrl: "https://debateai.test", ...overrides
  };
}
const files = {
  xmoney: "0123456789abcdef0123456789abcdef\n", quaderno: "qk_0123456789\n",
  smartbill: "owner@firma.ro:tok_0123456789\n", owner: "owner@firma.ro\n"
};
// The mirror of COMPANY with its two tax codes filled in, as the owner will fill them (X1 Step 3 item 6, RULINGS-R3
// R3-4): the CUI as digits only (what /legal's CUI row shows) and the RO VAT code (its VAT row), with the registered
// office and the general address every email prints (P2-M35). Every other fact stays as the legal notice has it today.
// With both codes filled, X1 row 16's flip of SMARTBILL_CIF_FORM changes no fixture here.
const filledCui: SellerCompany = Object.freeze({
  ...SELLER_COMPANY, cui: "12345678", registeredOffice: "Str. Exemplu 1, București, România",
  emails: Object.freeze({ ...SELLER_COMPANY.emails, general: "hello@dezbatere.ro" })
});
const company: SellerCompany = Object.freeze({
  ...filledCui, vat: Object.freeze({ kind: "registered", number: "RO12345678" } as const)
});
const expectedCif = SMARTBILL_CIF_FORM === "ro" ? "RO12345678" : "12345678";

describe("P6a — BillingConnectors", () => {
  it("builds every connector from custody files and holds the private key for zeroing", async () => {
    const held: Array<{ end(): Promise<void> }> = [];
    const recordsKey = Buffer.alloc(32, 3);
    const connectors = loadBillingConnectors({
      environment: group(custody(files)), company, recordsKey, hold: (resource) => held.push(resource)
    });
    expect(connectors.xmoneyEnvironment).toBe("stage");
    expect(connectors.siteId).toBe("4242");
    expect(connectors.xmoneyPublicKey).toBe("pk_stage_0123456789");
    expect(connectors.ownerReportEmail).toBe("owner@firma.ro");
    expect(connectors.publicAppUrl).toBe("https://debateai.test");
    expect(connectors.recordsKey).toBe(recordsKey);
    expect(connectors.xmoneyPrivateKey.toString("latin1")).toBe("0123456789abcdef0123456789abcdef");
    expect(typeof connectors.tax.quote).toBe("function");
    expect(typeof connectors.invoiceRo.issue).toBe("function");
    expect(typeof connectors.invoiceRo.creditPartial).toBe("function");
    expect(connectors.invoiceRo.lookup).toBeUndefined();
    expect(typeof connectors.xmoney.rebill).toBe("function");
    expect(held).toHaveLength(1);
    await held[0]!.end();
    expect(connectors.xmoneyPrivateKey.every((byte) => byte === 0)).toBe(true);
  });

  it("sends SmartBill the company's code built from the mirrored COMPANY facts, the one source (RULINGS-R3 R3-4)", async () => {
    const urls: string[] = [];
    const recordingFetch = (async (url: string | URL | Request) => {
      urls.push(url instanceof Request ? url.url : String(url));
      return new Response(Buffer.from("%PDF-1.4 recorded"), { status: 200 });
    }) as typeof fetch;
    const connectors = loadBillingConnectors({
      environment: group(custody(files)), company, recordsKey: Buffer.alloc(32), hold: () => undefined, fetch: recordingFetch
    });
    await connectors.invoiceRo.pdf!({ series: "DBT", number: "7" });
    expect(urls).toHaveLength(1);
    // "12345678" while SMARTBILL_CIF_FORM is "bare" (the start); "RO12345678" once X1 row 16 flips it to "ro".
    expect(new URL(urls[0]!).searchParams.get("cif")).toBe(expectedCif);
  });

  it("refuses, before reading any secret, a CUI that is still the legal notice's bracketed placeholder, or malformed", () => {
    const held: Array<{ end(): Promise<void> }> = [];
    const root = custody(files);
    expect(() => loadBillingConnectors({
      environment: group(root), company: { ...company, cui: "[…]" }, recordsKey: Buffer.alloc(32), hold: (resource) => held.push(resource)
    })).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:cui");
    expect(() => loadBillingConnectors({
      environment: group(root), company: { ...company, cui: "CIF 123" }, recordsKey: Buffer.alloc(32), hold: (resource) => held.push(resource)
    })).toThrow("BILLING_COMPANY_FACTS_INVALID:cui");
    // The RO VAT code written into the CUI field: /legal would show it on its CUI row, so it is refused too.
    expect(() => loadBillingConnectors({
      environment: group(root), company: { ...company, cui: "RO12345678" }, recordsKey: Buffer.alloc(32), hold: (resource) => held.push(resource)
    })).toThrow("BILLING_COMPANY_FACTS_INVALID:cui");
    // No refusal read the private key: nothing was handed to the boot ledger.
    expect(held).toHaveLength(0);
  });

  it("refuses, before reading any secret, a company fact every email prints that is still bracketed (P2-M35)", () => {
    const held: Array<{ end(): Promise<void> }> = [];
    const root = custody(files);
    const load = (facts: SellerCompany) => () => loadBillingConnectors({
      environment: group(root), company: facts, recordsKey: Buffer.alloc(32), hold: (resource) => held.push(resource)
    });
    // Every footer and the model withdrawal form's "To:" line print the legal name, the registered office and the
    // general address (packages/mail-templates/src/render.ts).
    expect(load({ ...company, registeredOffice: SELLER_COMPANY.registeredOffice })).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:registeredOffice");
    expect(load({ ...company, emails: SELLER_COMPANY.emails })).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:emails.general");
    expect(load({ ...company, legalName: "[…] S.R.L." })).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:legalName");
    // The CUI is still named first: the facts today fail on it.
    expect(load(SELLER_COMPANY)).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:cui");
    expect(held).toHaveLength(0);
  });

  it("builds SmartBill's code in the form X1 row 16 names, from the CUI and the RO VAT code (never a reshaped CUI)", () => {
    // Bare: the CUI's digits; the VAT status is not read, so an unconfirmed one does not matter.
    expect(smartBillCompanyCif(filledCui, "bare")).toBe("12345678");
    expect(smartBillCompanyCif(company, "bare")).toBe("12345678");
    // RO: the RO VAT code from COMPANY.vat, which must be registered, filled in and RO + the same digits.
    expect(smartBillCompanyCif(company, "ro")).toBe("RO12345678");
    expect(() => smartBillCompanyCif(filledCui, "ro")).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:vat");
    expect(() => smartBillCompanyCif({ ...filledCui, vat: { kind: "not-registered" } }, "ro"))
      .toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:vat");
    expect(() => smartBillCompanyCif({ ...filledCui, vat: { kind: "registered", number: "[RO…]" } }, "ro"))
      .toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:vat");
    expect(() => smartBillCompanyCif({ ...filledCui, vat: { kind: "registered", number: "RO87654321" } }, "ro"))
      .toThrow("BILLING_COMPANY_FACTS_INVALID:vat");
    // The CUI is checked first in both forms: an RO-prefixed CUI is refused even when the VAT code matches it.
    expect(() => smartBillCompanyCif({ ...company, cui: "RO12345678" }, "ro")).toThrow("BILLING_COMPANY_FACTS_INVALID:cui");
    expect(() => smartBillCompanyCif({ ...company, cui: "[…]" }, "ro")).toThrow("BILLING_COMPANY_FACTS_UNVERIFIED:cui");
    // Without a form, the one constant decides.
    expect(smartBillCompanyCif(company)).toBe(expectedCif);
  });

  it("pairs the fake SmartBill's default CIF with SMARTBILL_CIF_FORM, so X1 row 16's flip cannot leave the fake behind", async () => {
    const fake = await startFakeSmartBill({ minGapMs: 0 });
    try {
      expect(
        fake.companyCif,
        "flip acceptance/billing-fakes/fake-smartbill.ts's default CIF in the same commit as SMARTBILL_CIF_FORM (X1 row 16)"
      ).toBe(expectedCif);
    } finally {
      await fake.stop();
    }
  });

  it("refuses a private key that cannot key AES-256, after handing it to the boot ledger to zero", () => {
    const held: Array<{ end(): Promise<void> }> = [];
    expect(() => loadBillingConnectors({
      environment: group(custody({ ...files, xmoney: "too-short-key\n" })), company, recordsKey: Buffer.alloc(32, 3),
      hold: (resource) => held.push(resource)
    })).toThrow(expect.objectContaining({ code: "XMONEY_KEY_LENGTH_INVALID" }));
    expect(held).toHaveLength(1);
  });

  it("reads the private key through L1's text-secret loader (R-6)", () => {
    const root = custody(files);
    expect(() => loadBillingConnectors({
      environment: group(root, { xmoneyPrivateKeyPath: join(root, "absent") }), company, recordsKey: Buffer.alloc(32),
      hold: () => undefined
    })).toThrow(expect.objectContaining({ code: "SECRET_TEXT_ABSENT" }));
  });

  it("refuses SmartBill credentials that are not e-mail:token, and an owner address that is not one", () => {
    expect(() => loadBillingConnectors({
      environment: group(custody({ ...files, smartbill: "no-colon\n" })), company, recordsKey: Buffer.alloc(32), hold: () => undefined
    })).toThrow("BILLING_CONFIGURATION_INVALID:SMARTBILL_CREDENTIALS_PATH");
    expect(() => loadBillingConnectors({
      environment: group(custody({ ...files, owner: "not-an-address\n" })), company, recordsKey: Buffer.alloc(32), hold: () => undefined
    })).toThrow("BILLING_CONFIGURATION_INVALID:OWNER_REPORT_EMAIL_PATH");
  });

  it("refuses a public key that is really the private key: it would be sent to every browser", () => {
    const root = custody(files);
    expect(() => loadBillingConnectors({
      environment: group(root, { xmoneyPublicKey: "0123456789abcdef0123456789abcdef" }), company, recordsKey: Buffer.alloc(32),
      hold: () => undefined
    })).toThrow("BILLING_CONFIGURATION_INVALID:XMONEY_PUBLIC_KEY");
  });

  it("refuses to go live while stage subscriptions, charges or their outbox jobs are still open", () => {
    expect(() => assertStageRecordsClosed({ subscriptions: 0, charges: 0, jobs: 0 })).not.toThrow();
    expect(() => assertStageRecordsClosed({ subscriptions: 1, charges: 0, jobs: 0 }))
      .toThrow("BILLING_STAGE_RECORDS_OPEN:subscriptions=1:charges=0:jobs=0");
    expect(() => assertStageRecordsClosed({ subscriptions: 0, charges: 2, jobs: 0 }))
      .toThrow("BILLING_STAGE_RECORDS_OPEN:subscriptions=0:charges=2:jobs=0");
    // P2-I4: a sandbox refund or invoice job still queued would otherwise run against the live services.
    expect(() => assertStageRecordsClosed({ subscriptions: 0, charges: 0, jobs: 3 }))
      .toThrow("BILLING_STAGE_RECORDS_OPEN:subscriptions=0:charges=0:jobs=3");
  });

  it("refuses to go live while any billing row or open job is dated more than a day ahead (W14, P2-I19)", () => {
    expect(() => assertNoRecordsDatedAhead({ rows: 0, jobs: 0 })).not.toThrow();
    // A host that ran the sandbox with BILLING_STAGE_CLOCK_OFFSET_DAYS holds rows and jobs up to a month ahead.
    expect(() => assertNoRecordsDatedAhead({ rows: 2, jobs: 0 })).toThrow("BILLING_RECORDS_DATED_AHEAD:rows=2:jobs=0");
    expect(() => assertNoRecordsDatedAhead({ rows: 0, jobs: 1 })).toThrow("BILLING_RECORDS_DATED_AHEAD:rows=0:jobs=1");
  });

  it("lists the billing custody paths that are configured, for the secret-domain check", () => {
    expect(billingCustodyPaths({ XMONEY_PRIVATE_KEY_PATH: "/a", QUADERNO_API_KEY_PATH: undefined, SMARTBILL_CREDENTIALS_PATH: "/b", OWNER_REPORT_EMAIL_PATH: undefined }))
      .toEqual(["/a", "/b"]);
  });
});
