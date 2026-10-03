// apps/api/src/billing/connectors.ts
import { timingSafeEqual } from "node:crypto";
import { readCustodyAuthorizationHeader, readCustodyTextSecretBytes } from "@debateai/crypto";
import { isUnverifiedCompanyFact, type InvoiceIssuer, type SellerCompany, type TaxEngine } from "@debateai/billing-core";
import type { BillingEnvironmentGroup } from "@debateai/register";
import {
  XMoneyClient,
  aesKeyFromPrivateKey,
  xmoneyEnvironmentOf,
  type XMoneyEnvironment
} from "@debateai/payments-xmoney";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";

export type BillingConnectors = Readonly<{
  xmoney: XMoneyClient;
  /** A22 / R-35: derived from XMONEY_API_BASE_URL; the checkout reply's sdk_environment and the customer link's environment. */
  xmoneyEnvironment: XMoneyEnvironment;
  tax: TaxEngine;
  /** P5's SmartBill issuer: `creditPartial` and `pdf` present, `lookup` absent (R-24). */
  invoiceRo: InvoiceIssuer;
  /** L1's records key (the same Buffer main.ts holds); billing seals profiles, quotes and evidence with it. */
  recordsKey: Buffer;
  /** A23: bytes, held by boot.hold and zeroed at shutdown; the HMAC key for signOrderPayload and the AES key source. */
  xmoneyPrivateKey: Buffer;
  xmoneyPublicKey: string;
  siteId: string;
  ownerReportEmail: string;
  /**
   * R-7: PUBLIC_APP_URL reduced to its origin (no path, no trailing slash), so `${publicAppUrl}/cancel` and
   * `new URL(path, publicAppUrl)` name the same page — xMoney's backUrl, the /settings/card return and the cancel links.
   */
  publicAppUrl: string;
}>;

type Closable = { end(): Promise<void> };

/** The configured billing custody files, for assertPublicationSecretDomains' path-aliasing check. */
export function billingCustodyPaths(environment: Readonly<{
  XMONEY_PRIVATE_KEY_PATH?: string | undefined; QUADERNO_API_KEY_PATH?: string | undefined;
  SMARTBILL_CREDENTIALS_PATH?: string | undefined; OWNER_REPORT_EMAIL_PATH?: string | undefined;
}>): string[] {
  return [
    environment.XMONEY_PRIVATE_KEY_PATH, environment.QUADERNO_API_KEY_PATH,
    environment.SMARTBILL_CREDENTIALS_PATH, environment.OWNER_REPORT_EMAIL_PATH
  ].filter((path): path is string => path !== undefined);
}

function smartBillCredentials(text: string): Readonly<{ username: string; token: string }> {
  const separator = text.indexOf(":");
  const username = separator < 0 ? "" : text.slice(0, separator);
  const token = separator < 0 ? "" : text.slice(separator + 1);
  if (!/^[^@\s:]+@[^@\s:]+$/u.test(username) || token.length === 0) {
    throw new TypeError("BILLING_CONFIGURATION_INVALID:SMARTBILL_CREDENTIALS_PATH");
  }
  return { username, token };
}

function ownerAddress(text: string): string {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(text)) throw new TypeError("BILLING_CONFIGURATION_INVALID:OWNER_REPORT_EMAIL_PATH");
  return text;
}

/** How SmartBill names the company inside the account (X1 row 16): the CUI's digits, or the RO VAT code. */
export type SmartBillCifForm = "bare" | "ro";

/**
 * X1 row 16's one line. "bare" while the row is ⚠; flipped to "ro" in the same commit as the facts file when
 * SmartBill's reference or P5 Step 9's recording shows it wants the RO form. The fake SmartBill's default CIF
 * (acceptance/billing-fakes/fake-smartbill.ts) follows it in that commit; tests/unit/billing-connectors.test.ts pins
 * the pair.
 */
export const SMARTBILL_CIF_FORM: SmartBillCifForm = "bare";

/**
 * RULINGS-R3 R3-4: SmartBill's companyVatCode / cif= is built from the legal notice's facts (COMPANY, mirrored as
 * SELLER_COMPANY). It is never a second setting, and never a reshaped CUI: /legal shows COMPANY.cui on its CUI row
 * and COMPANY.vat.number on its separate VAT row, so the CUI stays digits only. A bracketed value is the notice's
 * placeholder, and billing cannot start until the owner has filled it in, because every Romanian invoice carries it.
 * The "ro" form is the only place billing reads the VAT status. The form arrives as a parameter, so the tests can
 * reach both forms whatever the constant says.
 */
export function smartBillCompanyCif(company: SellerCompany, form: SmartBillCifForm = SMARTBILL_CIF_FORM): string {
  if (isUnverifiedCompanyFact(company.cui)) throw new TypeError("BILLING_COMPANY_FACTS_UNVERIFIED:cui");
  if (!/^[0-9]{2,10}$/u.test(company.cui)) throw new TypeError("BILLING_COMPANY_FACTS_INVALID:cui");
  if (form === "bare") return company.cui;
  const vat = company.vat;
  if (vat.kind !== "registered" || isUnverifiedCompanyFact(vat.number)) {
    throw new TypeError("BILLING_COMPANY_FACTS_UNVERIFIED:vat");
  }
  if (vat.number !== `RO${company.cui}`) throw new TypeError("BILLING_COMPANY_FACTS_INVALID:vat");
  return vat.number;
}

/** The public key goes to every browser; if it were the private key, anyone could sign orders and read notices. */
function refuseTheSecretAsPublic(publicKey: string, privateKey: Buffer): void {
  const candidate = Buffer.from(publicKey, "latin1");
  if (candidate.byteLength === privateKey.byteLength && timingSafeEqual(candidate, privateKey)) {
    throw new TypeError("BILLING_CONFIGURATION_INVALID:XMONEY_PUBLIC_KEY");
  }
}

/**
 * Going from stage to live (P1b `openRecordCounts("stage")`): a live boot is refused while any stage subscription or
 * charge is still open — the live renewal pass never rebills a stage order, so such a subscription would otherwise
 * stay ACTIVE for ever — and (P2-I4) while any outbox job of a stage charge is still queued: the live outbox would
 * claim it and run it against live xMoney, SmartBill or Quaderno (each handler also refuses it, DEAD
 * OTHER_XMONEY_SYSTEM). The runbook's switch-on step cancels or withdraws every sandbox subscription first.
 */
export function assertStageRecordsClosed(
  counts: Readonly<{ subscriptions: number; charges: number; jobs: number }>
): void {
  if (counts.subscriptions > 0 || counts.charges > 0 || counts.jobs > 0) {
    throw new TypeError(
      `BILLING_STAGE_RECORDS_OPEN:subscriptions=${counts.subscriptions}:charges=${counts.charges}:jobs=${counts.jobs}`
    );
  }
}

/**
 * W14 (P2-I19): a live boot is also refused while any billing row or open outbox job is dated more than a day ahead
 * (`BillingRepository.recordsDatedAhead`). Only a host that ran the sandbox with `BILLING_STAGE_CLOCK_OFFSET_DAYS`
 * writes such rows, and its jobs would wait up to a month and then run against the live services. The runbook keeps
 * that run on its own throwaway server; this is the guard for a host that took the same-host path anyway. It is
 * only a guard: a month after such a run its rows are no longer ahead. The counts are content-free.
 */
export function assertNoRecordsDatedAhead(counts: Readonly<{ rows: number; jobs: number }>): void {
  if (counts.rows > 0 || counts.jobs > 0) {
    throw new TypeError(`BILLING_RECORDS_DATED_AHEAD:rows=${counts.rows}:jobs=${counts.jobs}`);
  }
}

/**
 * Builds every billing connector from the custody files. Called under boot.runSync, so a refusal
 * closes the boot ledger (DL7-F7). SmartBill's code is built from the company's facts first, before any
 * secret is read (smartBillCompanyCif; main.ts passes SELLER_COMPANY, tests and the development fakes
 * pass the mirror filled with their fake's code). The private key
 * (L1's text-secret loader, A23) is handed to `hold` the moment it exists; Quaderno's key, SmartBill's
 * `user:token` and the owner's address are text credentials read like provider keys
 * (`readCustodyAuthorizationHeader`).
 */
export function loadBillingConnectors(input: Readonly<{
  environment: BillingEnvironmentGroup;
  company: SellerCompany;
  recordsKey: Buffer;
  hold: (resource: Closable) => unknown;
  fetch?: typeof fetch;
}>): BillingConnectors {
  const environment = input.environment;
  const companyCif = smartBillCompanyCif(input.company);
  const xmoneyPrivateKey = readCustodyTextSecretBytes(environment.xmoneyPrivateKeyPath);
  input.hold({ end: async () => { xmoneyPrivateKey.fill(0); } });
  aesKeyFromPrivateKey(xmoneyPrivateKey).fill(0);
  refuseTheSecretAsPublic(environment.xmoneyPublicKey, xmoneyPrivateKey);
  const fetchOption = input.fetch === undefined ? {} : { fetch: input.fetch };
  const smartbill = smartBillCredentials(readCustodyAuthorizationHeader(environment.smartbillCredentialsPath));
  return Object.freeze({
    xmoney: new XMoneyClient({
      baseUrl: environment.xmoneyApiBaseUrl, privateKey: xmoneyPrivateKey, siteId: environment.xmoneySiteId, ...fetchOption
    }),
    xmoneyEnvironment: xmoneyEnvironmentOf(environment.xmoneyApiBaseUrl),
    tax: new QuadernoTaxEngine({
      baseUrl: environment.quadernoApiBaseUrl,
      apiKey: readCustodyAuthorizationHeader(environment.quadernoApiKeyPath),
      ...fetchOption
    }),
    invoiceRo: new SmartBillInvoiceIssuer({
      baseUrl: environment.smartbillApiBaseUrl, username: smartbill.username, token: smartbill.token,
      companyCif, series: environment.smartbillSeries, ...fetchOption
    }),
    recordsKey: input.recordsKey,
    xmoneyPrivateKey,
    xmoneyPublicKey: environment.xmoneyPublicKey,
    siteId: environment.xmoneySiteId,
    ownerReportEmail: ownerAddress(readCustodyAuthorizationHeader(environment.ownerReportEmailPath)),
    publicAppUrl: environment.publicAppUrl
  });
}
