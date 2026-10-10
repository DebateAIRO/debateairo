// apps/api/src/billing/connectors.ts
import { closeSync, constants, fstatSync, openSync, readFileSync, type Stats } from "node:fs";
import { readCustodyAuthorizationHeader } from "@debateai/crypto";
import {
  isUnverifiedCompanyFact,
  type CardPayments,
  type InvoiceIssuer,
  type PaymentEnvironment,
  type SellerCompany,
  type TaxEngine
} from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";
import {
  NETOPIA_ENVIRONMENT_KEYS,
  type AdmissionPolicy,
  type BillingEnvironmentGroup,
  type NetopiaEnvironmentGroup,
  type NetopiaEnvironmentKey
} from "@debateai/register";
import {
  createNetopiaPayments,
  isNetopiaPosSignature,
  loadTrustedKeys,
  netopiaEnvironmentOf,
  type NoticeTrust
} from "@debateai/payments-netopia";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";

/**
 * NETOPIA (spec 2026-10-05 §2.3, §2.17.1): what the provider-only mode builds (ruling C-9), and the first members of
 * every BillingConnectors. `payments` is the port (main.ts wraps it in TimeShiftedCardPayments under a sandbox clock);
 * `noticeTrust` is what NETOPIA's message is verified with (our POS signature and the trusted keys read at boot).
 */
export type NetopiaConnectors = Readonly<{
  payments: CardPayments;
  noticeTrust: NoticeTrust;
  /** Follows NETOPIA_API_BASE_URL (§2.4.1): which NETOPIA system this deployment's payments are made in. */
  paymentEnvironment: PaymentEnvironment;
  /** L1's records key (the same Buffer main.ts holds); the notice intake seals what it stores with it. */
  recordsKey: Buffer;
  /**
   * R-7: PUBLIC_APP_URL reduced to its origin (no path, no trailing slash), so `${publicAppUrl}/cancel` and
   * `new URL(path, publicAppUrl)` name the same page — the return and notify addresses and the emailed links.
   */
  publicAppUrl: string;
}>;

export type BillingConnectors = NetopiaConnectors & Readonly<{
  tax: TaxEngine;
  /** P5's SmartBill issuer: `creditPartial` and `pdf` present, `lookup` absent (R-24). */
  invoiceRo: InvoiceIssuer;
  ownerReportEmail: string;
}>;

/** The configured billing custody files, for assertPublicationSecretDomains' path-aliasing check. */
export function billingCustodyPaths(environment: Readonly<{
  NETOPIA_API_KEY_PATH?: string | undefined; NETOPIA_IPN_KEYS_PATH?: string | undefined;
  QUADERNO_API_KEY_PATH?: string | undefined; SMARTBILL_CREDENTIALS_PATH?: string | undefined;
  OWNER_REPORT_EMAIL_PATH?: string | undefined;
}>): string[] {
  return [
    environment.NETOPIA_API_KEY_PATH, environment.NETOPIA_IPN_KEYS_PATH, environment.QUADERNO_API_KEY_PATH,
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

/**
 * P2-M35: the company facts every billing email prints, in each footer and in the model withdrawal form's "To:" line
 * (packages/mail-templates/src/render.ts): the legal name, the registered office and the general address. A bracketed
 * value is the legal notice's placeholder, and billing cannot start until the owner has filled it in, as for the CUI.
 */
export function assertMailedCompanyFacts(company: SellerCompany): void {
  const printed: ReadonlyArray<readonly [string, string]> = [
    ["legalName", company.legalName], ["registeredOffice", company.registeredOffice], ["emails.general", company.emails.general]
  ];
  for (const [name, value] of printed) {
    if (isUnverifiedCompanyFact(value)) throw new TypeError(`BILLING_COMPANY_FACTS_UNVERIFIED:${name}`);
  }
}

/**
 * Going live (spec 2026-10-05 §2.5.4): a live boot is refused while anything of another payment system is still
 * open — a subscription or charge of the previous card processor, or a NETOPIA sandbox one after the same-host
 * switch — and while any outbox job of such a charge is still queued: the live outbox would claim it and run it
 * against live SmartBill or Quaderno (each handler also refuses it, DEAD OTHER_PAYMENT_SYSTEM). The runbook's
 * switch-on step closes them first.
 * The counts are content-free (`BillingRepository.openOtherSystemRecordCounts`).
 */
export function assertOtherSystemRecordsClosed(
  counts: Readonly<{ subscriptions: number; charges: number; jobs: number }>
): void {
  if (counts.subscriptions > 0 || counts.charges > 0 || counts.jobs > 0) {
    throw new TypeError(
      `BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=${counts.subscriptions}:charges=${counts.charges}:jobs=${counts.jobs}`
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

/** Which billing exists (spec 2026-10-05 §2.7.3, ruling C-9). Local mode never bills (§2.2 rule 9). */
export type BillingMode = "OFF" | "PROVIDER_ONLY" | "ON";

type NetopiaSource = Readonly<Partial<Record<NetopiaEnvironmentKey, string | undefined>>>;
const isSet = (value: string | undefined): boolean => value !== undefined && value.trim() !== "";

export function billingModeOf(input: Readonly<{
  hosted: boolean; billingEnabled: boolean; environment: NetopiaSource;
}>): BillingMode {
  if (!input.hosted) return "OFF";
  if (input.billingEnabled) return "ON";
  return NETOPIA_ENVIRONMENT_KEYS.every((key) => isSet(input.environment[key])) ? "PROVIDER_ONLY" : "OFF";
}

/**
 * The provider-only mode serves NETOPIA's notify address, and a message that fails verification charges the
 * source-keyed billingNotify budget (spec §2.7.1) before it is quarantined for 14 days. A register version that does
 * not seal that scope would leave such messages unlimited, so this boot is refused with the code billing on uses
 * (main.ts's billing-runtime stage), by name (final review protocol-3).
 */
export function assertProviderOnlyNotifySealed(admission: Pick<AdmissionPolicy, "billingNotify">): void {
  if (admission.billingNotify === null) {
    throw new TypedDomainError("BILLING_ADMISSION_UNSEALED",
      "NETOPIA's notify address is served in the provider-only mode, so the register must seal the billingNotify admission scope");
  }
}

/** With billing off: the first NETOPIA key left out of a group that is set in part, for one boot line; else null. */
export function incompleteNetopiaKey(environment: NetopiaSource): NetopiaEnvironmentKey | null {
  const set = NETOPIA_ENVIRONMENT_KEYS.filter((key) => isSet(environment[key]));
  if (set.length === 0 || set.length === NETOPIA_ENVIRONMENT_KEYS.length) return null;
  return NETOPIA_ENVIRONMENT_KEYS.find((key) => !isSet(environment[key])) ?? null;
}

/**
 * Who may own NETOPIA's trusted-key file (spec §2.17.1, SR-28): root, and never the API's own user, because a trust
 * list the API user could write would let anyone who controls that user forge NETOPIA's messages. `apiUid` -1 names no
 * user (the development fakes and the tests, whose file is their own).
 */
export type TrustedKeyFileOwners = Readonly<{ ownerUid: number; apiUid: number }>;
export type TrustedKeyFileProblem =
  | "ABSENT" | "NOT_A_FILE" | "TOO_LARGE" | "WRITABLE_BY_API_USER" | "NOT_ROOT_OWNED" | "GROUP_OR_OTHER_WRITABLE";

/** A trust list is a few PEM blocks; anything near this size is not one. */
const TRUSTED_KEYS_MAX_BYTES = 65_536;

export function productionTrustedKeyOwners(): TrustedKeyFileOwners {
  return Object.freeze({ ownerUid: 0, apiUid: typeof process.getuid === "function" ? process.getuid() : -1 });
}

export function trustedKeyFileProblem(
  stat: Pick<Stats, "uid" | "mode" | "size"> & Readonly<{ isFile(): boolean }>, owners: TrustedKeyFileOwners
): TrustedKeyFileProblem | null {
  if (!stat.isFile()) return "NOT_A_FILE";
  if (stat.size > TRUSTED_KEYS_MAX_BYTES) return "TOO_LARGE";
  if (stat.uid === owners.apiUid) return "WRITABLE_BY_API_USER";
  if (stat.uid !== owners.ownerUid) return "NOT_ROOT_OWNED";
  if ((stat.mode & 0o022) !== 0) return "GROUP_OR_OTHER_WRITABLE";
  return null;
}

/**
 * Reads the trusted-key file through one descriptor opened without following a link, judging the very file it reads
 * (no check-then-open race). BILLING_IPN_KEYS_FILE_UNSAFE:<problem> names what is wrong, never the content.
 */
export function readTrustedKeyFile(path: string, owners: TrustedKeyFileOwners): string {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new TypeError("BILLING_IPN_KEYS_FILE_UNSAFE:ABSENT");
    if (code === "ELOOP" || code === "EMLINK") throw new TypeError("BILLING_IPN_KEYS_FILE_UNSAFE:NOT_A_FILE");
    throw error;
  }
  try {
    const problem = trustedKeyFileProblem(fstatSync(descriptor), owners);
    if (problem !== null) throw new TypeError(`BILLING_IPN_KEYS_FILE_UNSAFE:${problem}`);
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

function netopiaInvalid(key: NetopiaEnvironmentKey): never {
  throw new TypeError(`BILLING_CONFIGURATION_INVALID:${key}`);
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** The development fakes' base (apps/runner/src/dev-billing-fakes.ts): plain http on a loopback address only. */
function isLoopbackHttp(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * NETOPIA's connector (spec §2.4.1, §2.17.1). The base and the POS signature are checked first, before any file is
 * read; then the trusted-key file (root's, §2.17.1) and the API key (a custody text file, read as a string and held
 * for the process's life, `readCustodyAuthorizationHeader`'s precedent). `trustedKeyOwners` and `allowLoopbackBase`
 * exist for the development fakes and the tests; main.ts passes neither.
 */
export function loadNetopiaConnectors(input: Readonly<{
  environment: NetopiaEnvironmentGroup;
  recordsKey: Buffer;
  fetch?: typeof fetch;
  trustedKeyOwners?: TrustedKeyFileOwners;
  allowLoopbackBase?: true;
}>): NetopiaConnectors {
  const environment = input.environment;
  const known = netopiaEnvironmentOf(environment.netopiaApiBaseUrl);
  const paymentEnvironment: PaymentEnvironment = known
    ?? (input.allowLoopbackBase === true && isLoopbackHttp(environment.netopiaApiBaseUrl)
      ? "sandbox" : netopiaInvalid("NETOPIA_API_BASE_URL"));
  if (!isNetopiaPosSignature(environment.netopiaPosSignature)) netopiaInvalid("NETOPIA_POS_SIGNATURE");
  const pem = readTrustedKeyFile(environment.netopiaIpnKeysPath, input.trustedKeyOwners ?? productionTrustedKeyOwners());
  const keys = loadTrustedKeys(pem);
  const apiKey = readCustodyAuthorizationHeader(environment.netopiaApiKeyPath);
  const payments = createNetopiaPayments(
    { baseUrl: environment.netopiaApiBaseUrl, apiKey, posSignature: environment.netopiaPosSignature },
    input.fetch === undefined ? {} : { fetch: input.fetch }
  );
  return Object.freeze({
    payments,
    noticeTrust: Object.freeze({ posSignature: environment.netopiaPosSignature, keys }),
    paymentEnvironment,
    recordsKey: input.recordsKey,
    publicAppUrl: environment.publicAppUrl
  });
}

/**
 * Builds every billing connector from the custody files. Called under boot.runSync, so a refusal closes the boot
 * ledger (DL7-F7). SmartBill's code is built from the company's facts first, before any secret is read
 * (smartBillCompanyCif; main.ts passes SELLER_COMPANY, tests and the development fakes pass the mirror filled with
 * their fake's code), and the facts every email prints must be filled in too (assertMailedCompanyFacts, P2-M35). Then
 * NETOPIA's connector (loadNetopiaConnectors), and Quaderno's key, SmartBill's `user:token` and the owner's address,
 * read as text credentials (`readCustodyAuthorizationHeader`).
 */
export function loadBillingConnectors(input: Readonly<{
  environment: BillingEnvironmentGroup;
  company: SellerCompany;
  recordsKey: Buffer;
  fetch?: typeof fetch;
  trustedKeyOwners?: TrustedKeyFileOwners;
  allowLoopbackBase?: true;
}>): BillingConnectors {
  const environment = input.environment;
  const companyCif = smartBillCompanyCif(input.company);
  assertMailedCompanyFacts(input.company);
  const fetchOption = input.fetch === undefined ? {} : { fetch: input.fetch };
  const netopia = loadNetopiaConnectors({
    environment, recordsKey: input.recordsKey, ...fetchOption,
    ...(input.trustedKeyOwners === undefined ? {} : { trustedKeyOwners: input.trustedKeyOwners }),
    ...(input.allowLoopbackBase === undefined ? {} : { allowLoopbackBase: input.allowLoopbackBase })
  });
  const smartbill = smartBillCredentials(readCustodyAuthorizationHeader(environment.smartbillCredentialsPath));
  return Object.freeze({
    ...netopia,
    tax: new QuadernoTaxEngine({
      baseUrl: environment.quadernoApiBaseUrl,
      apiKey: readCustodyAuthorizationHeader(environment.quadernoApiKeyPath),
      ...fetchOption
    }),
    invoiceRo: new SmartBillInvoiceIssuer({
      baseUrl: environment.smartbillApiBaseUrl, username: smartbill.username, token: smartbill.token,
      companyCif, series: environment.smartbillSeries, ...fetchOption
    }),
    ownerReportEmail: ownerAddress(readCustodyAuthorizationHeader(environment.ownerReportEmailPath))
  });
}
