/**
 * NETOPIA spec 2026-10-05 §2.17.3 — the check command:
 *
 *   pnpm billing:check
 *
 * On the host it runs under `systemd-run` as the API's user with the API's EnvironmentFile, like the other owner
 * commands (deploy/vps/billing-setup.sh ends with it), and it works with billing off. One line per item: a tick or a
 * cross and a plain sentence. It never prints a secret: key files are read only to be judged, and the API key goes
 * nowhere but the one status read that asks NETOPIA whether it accepts it (a made-up tool-order id: nothing is
 * charged). Exit 0 when every item is ticked, 1 when any is crossed or the command could not start, 2 for any argument.
 */
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { paymentErrorCode, SELLER_COMPANY, type CardPayments, type SellerCompany } from "@debateai/billing-core";
import { readCustodyAuthorizationHeader } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import {
  createNetopiaPayments, isNetopiaPosSignature, loadTrustedKeys, netopiaEnvironmentOf, netopiaNoticeAnswer,
  publishedIpnKeyFingerprint, type NetopiaConfig, type TrustedKey
} from "@debateai/payments-netopia";
import {
  loadBillingCheckEnvironment, loadBillingOperatorEnvironment, readBillingEnvironmentGroup, readBillingPlans,
  readBillingPolicy, readCountryPolicy, type BillingCheckEnvironment
} from "@debateai/register";
import {
  assertMailedCompanyFacts, productionTrustedKeyOwners, readTrustedKeyFile, smartBillCompanyCif, type TrustedKeyFileOwners
} from "./connectors.js";
import { openBillingOperatorPool } from "./operator-connection.js";
import { assertLiveInvoicersAreLive, assertStageInvoicersAreSandboxes } from "./stage-clock.js";

export type CheckLine = Readonly<{ ok: boolean; text: string }>;
/** What the published register version says, read on the API's own read-only principal. */
export type RegisterFacts = Readonly<{
  registerVersion: number; billingEnabled: boolean | null; planCurrency: string | null; countryPolicy: boolean;
}>;
export type BillingCheckDeps = Readonly<{
  environment: BillingCheckEnvironment;
  company: SellerCompany;
  trustedKeyOwners: TrustedKeyFileOwners;
  /** The probe of the notify address: one POST of an empty body, no Verification-token, redirects never followed. */
  fetch: typeof fetch;
  payments: (config: NetopiaConfig) => CardPayments;
  randomOrderId: () => string;
  register: () => Promise<RegisterFacts>;
}>;
export type BillingCheckCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenBillingCheck = () => Promise<BillingCheckDeps & Readonly<{ close(): Promise<void> }>>;

/** N9's NETOPIA_NOTIFY_PATH as the public site serves it (the UI proxies /api to the API). */
const NOTIFY_ADDRESS_PATH = "/api/v1/billing/netopia/notify";
const PROBE_TIMEOUT_MS = 10_000;
/**
 * F6a (final review ops-7): what the notify route answers a message with no Verification-token (NOTICE_HEADER_MISSING:
 * HTTP 503 and NETOPIA's "retry" body, apps/api/src/billing/index.ts). Only the route itself gives it: a route not
 * served answers 404, a proxy whose API is down its own 5xx.
 */
const UNVERIFIED_ANSWER = netopiaNoticeAnswer("NOTICE_HEADER_MISSING");
/** The route's answers are a few dozen bytes; a body longer than this is not one of them and is not read further. */
const PROBE_BODY_MAX_BYTES = 1_024;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}(:[A-Za-z0-9_.-]{1,64})?$/u;
const CUSTODY_KEYS = Object.freeze([
  "NETOPIA_API_KEY_PATH", "QUADERNO_API_KEY_PATH", "SMARTBILL_CREDENTIALS_PATH", "OWNER_REPORT_EMAIL_PATH"
] as const);
/** NETOPIA_PAYMENTS' own construction refusals: our settings, not NETOPIA's answer. */
const OWN_SETTING_DETAILS: ReadonlySet<string> = new Set(["baseUrl", "posSignature", "apiKey"]);

const tick = (text: string): CheckLine => Object.freeze({ ok: true, text });
const cross = (text: string): CheckLine => Object.freeze({ ok: false, text });

/** A code only, never a message: the messages of lower layers may carry values. */
function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string" && PRINTABLE_CODE.test(code)) return code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_CHECK_FAILED";
}

const detailOf = (code: string): string => (code.includes(":") ? code.slice(code.indexOf(":") + 1) : "");

function isHttpsUrl(value: string | undefined): value is string {
  if (value === undefined) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function netopiaSystemOf(base: string | undefined): "sandbox" | "live" | null {
  return base === undefined ? null : netopiaEnvironmentOf(base.replace(/\/+$/u, ""));
}

function settingsLines(environment: BillingCheckEnvironment): CheckLine[] {
  const lines: CheckLine[] = [];
  const publicAppUrl = environment.PUBLIC_APP_URL;
  if (!isHttpsUrl(publicAppUrl)) {
    lines.push(cross("PUBLIC_APP_URL is missing or not an https address: NETOPIA's return and notify addresses are built from it."));
  } else {
    try {
      readBillingEnvironmentGroup({ ...environment, PUBLIC_APP_URL: publicAppUrl });
      lines.push(tick("Every billing setting is present and well formed."));
    } catch (error) {
      const code = codeOf(error);
      lines.push(cross(code.startsWith("BILLING_CONFIGURATION_INCOMPLETE")
        ? `${code}: that setting is missing from api.env (deploy/vps/billing-setup.sh writes it).`
        : `${code}: that setting is not well formed.`));
    }
  }
  const system = netopiaSystemOf(environment.NETOPIA_API_BASE_URL);
  if (system === "sandbox") lines.push(tick("NETOPIA_API_BASE_URL is NETOPIA's sandbox: payments made here are tests, and no card is really charged."));
  else if (system === "live") lines.push(tick("NETOPIA_API_BASE_URL is NETOPIA's live system: payments made here are real."));
  else lines.push(cross("NETOPIA_API_BASE_URL is missing or not one of NETOPIA's four API addresses."));
  const pos = environment.NETOPIA_POS_SIGNATURE;
  lines.push(pos !== undefined && isNetopiaPosSignature(pos)
    ? tick("NETOPIA_POS_SIGNATURE has NETOPIA's form (five groups of four).")
    : cross("NETOPIA_POS_SIGNATURE is missing or not five groups of four capital letters or digits."));
  if (system !== null) {
    const invoicers = {
      paymentEnvironment: system,
      quadernoApiBaseUrl: environment.QUADERNO_API_BASE_URL ?? null, smartbillApiBaseUrl: environment.SMARTBILL_API_BASE_URL ?? null
    };
    try {
      assertStageInvoicersAreSandboxes(invoicers);
      assertLiveInvoicersAreLive(invoicers);
      lines.push(tick(system === "sandbox"
        ? "Quaderno's sandbox and a .invalid SmartBill address go with NETOPIA's sandbox, so no real invoice can be issued."
        : "Quaderno and SmartBill are live, as NETOPIA's live system needs."));
    } catch (error) {
      lines.push(cross(`${codeOf(error)}: Quaderno and SmartBill must match NETOPIA's system (sandbox with sandbox, live with live).`));
    }
  }
  return lines;
}

function custodyLine(key: typeof CUSTODY_KEYS[number], path: string | undefined): CheckLine {
  if (path === undefined || path.trim() === "") return cross(`${key} is not set, so its file was not checked.`);
  try {
    readCustodyAuthorizationHeader(path);
    return tick(`${key}: the file is there, holds one line, and only the API's user can read it.`);
  } catch (error) {
    const code = codeOf(error);
    if (code === "PROVIDER_CREDENTIAL_FILE_ABSENT") return cross(`${key}: the file does not exist.`);
    if (code === "PROVIDER_CREDENTIAL_FILE_INVALID") return cross(`${key}: the file is not one line of printable characters.`);
    if (code === "SECRET_CUSTODY_INVALID") {
      return cross(`${key}: the file's mode or owner is wrong (it must be 0600 and the API's user's, in a 0700 directory of the same user).`);
    }
    return cross(`${key}: the file could not be read (${code}).`);
  }
}

// A refused trust list is never made root's by hand: a chown or chmod would bless keys that someone other than root
// may have written, and would follow a link planted at that name. The setup puts a fresh file in place instead.
const REPLACE_KEY_FILE = "Someone other than root may have changed it, so do not trust the keys in it:"
  + " put it in place again with the setup's NETOPIA section, run as root from the checkout:"
  + " bash deploy/vps/billing-setup.sh --replace netopia (README §14.2).";

function unsafeKeyFileSentence(code: string): string {
  const problem = detailOf(code);
  if (problem === "ABSENT") return "the file does not exist.";
  if (problem === "NOT_A_FILE") return "the path is not a plain file (a link is refused).";
  if (problem === "TOO_LARGE") return "the file is far too large to be a list of keys.";
  if (problem === "WRITABLE_BY_API_USER") return `the file belongs to the API's user, not to root. ${REPLACE_KEY_FILE}`;
  if (problem === "NOT_ROOT_OWNED") return `the file does not belong to root. ${REPLACE_KEY_FILE}`;
  if (problem === "GROUP_OR_OTHER_WRITABLE") return `someone other than root can write the file. ${REPLACE_KEY_FILE}`;
  return "the file could not be read.";
}

function trustedKeyLines(path: string | undefined, owners: TrustedKeyFileOwners): CheckLine[] {
  if (path === undefined || path.trim() === "") return [cross("NETOPIA_IPN_KEYS_PATH is not set, so NETOPIA's messages cannot be verified.")];
  let pem: string;
  try {
    pem = readTrustedKeyFile(path, owners);
  } catch (error) {
    const code = codeOf(error);
    return [cross(`NETOPIA_IPN_KEYS_PATH: ${code}: ${unsafeKeyFileSentence(code)}`)];
  }
  let keys: ReadonlyArray<TrustedKey>;
  try {
    keys = loadTrustedKeys(pem);
  } catch (error) {
    return [cross(`NETOPIA_IPN_KEYS_PATH: ${codeOf(error)}: the file holds no usable key (each must be an RSA PUBLIC KEY or CERTIFICATE block of at least 2,048 bits).`)];
  }
  const published = publishedIpnKeyFingerprint();
  return [
    tick(`NETOPIA_IPN_KEYS_PATH: ${String(keys.length)} trusted ${keys.length === 1 ? "key" : "keys"}, in a file owned by root and not writable by the API's user.`),
    ...keys.map((trusted, index) => tick(`Key ${String(index + 1)}: RSA ${String(trusted.key.asymmetricKeyDetails?.modulusLength ?? 0)} bits,`
      + ` SHA-256 ${trusted.fingerprint}, ${trusted.fingerprint === published
        ? "NETOPIA's published plugin key."
        : "not NETOPIA's published plugin key: confirm this fingerprint with NETOPIA."}`))
  ];
}

async function apiKeyLine(deps: BillingCheckDeps): Promise<CheckLine> {
  const { NETOPIA_API_BASE_URL: base, NETOPIA_POS_SIGNATURE: pos, NETOPIA_API_KEY_PATH: keyPath } = deps.environment;
  if (base === undefined || netopiaSystemOf(base) === null || pos === undefined || !isNetopiaPosSignature(pos) || keyPath === undefined) {
    return cross("NETOPIA's acceptance of the API key was not asked: the address, the POS signature or the key file setting is not right yet.");
  }
  let apiKey: string;
  try {
    apiKey = readCustodyAuthorizationHeader(keyPath);
  } catch {
    return cross("NETOPIA's acceptance of the API key was not asked: the API key file cannot be read.");
  }
  try {
    const answer = await deps.payments({ baseUrl: base.replace(/\/+$/u, ""), apiKey, posSignature: pos })
      .status({ orderId: deps.randomOrderId(), providerPaymentId: null });
    return tick(answer === "NO_SUCH_ORDER"
      ? "NETOPIA accepted the API key (it answered that our made-up order does not exist; nothing was charged)."
      : "NETOPIA accepted the API key (nothing was charged).");
  } catch (error) {
    const code = codeOf(error);
    const kind = paymentErrorCode(error);
    const detail = detailOf(code);
    if (kind === "PAYMENT_CREDENTIALS_REFUSED") {
      return cross(`NETOPIA refused the API key (${code}): check that it is this system's key (a sandbox key works only on the sandbox).`);
    }
    if (kind === "PAYMENT_CONFIGURATION_REFUSED" && detail === "redirect") {
      return cross(`NETOPIA's address answered with a redirect (${code}): NETOPIA_API_BASE_URL must be one of its API addresses exactly.`);
    }
    if (kind === "PAYMENT_CONFIGURATION_REFUSED" && OWN_SETTING_DETAILS.has(detail)) {
      return cross(`NETOPIA's client refused our own settings (${code}).`);
    }
    if (kind === "PAYMENT_CONFIGURATION_REFUSED" && (detail === "404" || detail === "405")) {
      return cross(`The address did not answer as NETOPIA's API does (${code}).`);
    }
    if (kind === "PAYMENT_CONFIGURATION_REFUSED") {
      return tick(`NETOPIA accepted the API key: it answered our made-up order with its own error (${code}); nothing was charged.`);
    }
    if (kind === "PAYMENT_PROVIDER_UNAVAILABLE" || kind === "PAYMENT_OUTCOME_UNKNOWN") {
      return cross(`NETOPIA could not be reached (${code}); try again in a few minutes.`);
    }
    return cross(`NETOPIA's answer was not one NETOPIA gives (${code}).`);
  }
}

/** At most PROBE_BODY_MAX_BYTES of an answer's body (null when it is longer); the rest is never read. */
async function boundedBody(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > PROBE_BODY_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Whether the probe's answer is the notify route's own to an unsigned message: its status and its exact JSON body. */
function isUnverifiedAnswer(status: number, body: string | null): boolean {
  if (status !== UNVERIFIED_ANSWER.status || body === null) return false;
  try {
    const got = JSON.parse(body) as unknown;
    const want = JSON.parse(UNVERIFIED_ANSWER.body) as Record<string, unknown>;
    return typeof got === "object" && got !== null && !Array.isArray(got)
      && Object.keys(got).length === Object.keys(want).length
      && Object.entries(want).every(([name, value]) => (got as Record<string, unknown>)[name] === value);
  } catch {
    return false;
  }
}

/**
 * The notify address as NETOPIA reaches it: one POST of an empty body with no Verification-token. A tick only for the
 * route's own "try again" to an unsigned message (which it answers without storing anything; the API's journal shows
 * one `billing.notice.unverified` line with NOTICE_HEADER_MISSING); every other answer is a cross with what it means.
 */
async function notifyLine(deps: BillingCheckDeps, publicAppUrl: string): Promise<CheckLine> {
  const address = `${new URL(publicAppUrl).origin}${NOTIFY_ADDRESS_PATH}`;
  let response: Response;
  let body: string | null = null;
  try {
    response = await deps.fetch(address, {
      method: "POST", body: "", redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (response.status === UNVERIFIED_ANSWER.status) body = await boundedBody(response);
  } catch (error) {
    return cross(`${address} could not be reached (${codeOf(error)}).`);
  }
  if (body === null) await response.body?.cancel().catch(() => undefined);
  const status = response.status;
  if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
    const shown = status === 0 ? "a redirect" : `HTTP ${String(status)}`;
    return cross(`${address} answers with a redirect (${shown}): NETOPIA does not follow redirects, so PUBLIC_APP_URL must be the site's exact public address.`);
  }
  if (isUnverifiedAnswer(status, body)) {
    return tick(`${address} gives the notify route's own answer to an unsigned message (HTTP 503, "retry"), with no redirect, so NETOPIA's messages can reach it.`);
  }
  if (status >= 500) {
    return cross(`${address} answered HTTP ${String(status)}: the site answered, but the API behind it did not, so NETOPIA's messages cannot reach it now (start debateai-api, then run the check again).`);
  }
  if (status === 404) {
    return cross(`${address} answered HTTP 404: the API does not serve NETOPIA's notify route, so NETOPIA's messages cannot reach it.`
      + " The API serves it only with NETOPIA's four settings complete, and reads them only when it starts: after the setup,"
      + " restart it (systemctl restart debateai-api), then run the check again.");
  }
  if (status === 429) {
    return cross(`${address} answered HTTP 429: too many messages reached it just now; run the check again in a few minutes.`);
  }
  return cross(`${address} answered HTTP ${String(status)}, which is not the notify route's answer to an unsigned message`
    + " (HTTP 503, \"retry\"): check that PUBLIC_APP_URL is this site's public address and that the site passes /api to the API.");
}

async function registerLines(deps: BillingCheckDeps): Promise<CheckLine[]> {
  let facts: RegisterFacts;
  try {
    facts = await deps.register();
  } catch (error) {
    return [cross(`The published register version could not be read (${codeOf(error)}).`)];
  }
  const version = String(facts.registerVersion);
  return [
    facts.billingEnabled === null ? cross(`Register version ${version} has no billingPolicy row.`)
      : facts.billingEnabled ? tick(`Billing is switched on in register version ${version}.`)
        : tick(`Billing is off in register version ${version}: with NETOPIA's four settings complete, the API serves only NETOPIA's message (the provider-only mode).`),
    facts.planCurrency === null ? cross(`Register version ${version} has no billingPlans row.`)
      : tick(`The plans of register version ${version} are priced in ${facts.planCurrency}.`),
    facts.countryPolicy ? tick(`Register version ${version} carries countryPolicy.`)
      : cross(`Register version ${version} has no countryPolicy row: billing cannot be switched on without it (README §14.8).`)
  ];
}

function companyLine(company: SellerCompany): CheckLine {
  try {
    smartBillCompanyCif(company);
    assertMailedCompanyFacts(company);
    return tick("The company's facts (CUI, name, registered office, general address) are filled in.");
  } catch (error) {
    return cross(`${codeOf(error)}: that company fact is still in square brackets or malformed in COMPANY and SELLER_COMPANY (README §14.7).`);
  }
}

export async function runBillingCheck(deps: BillingCheckDeps): Promise<ReadonlyArray<CheckLine>> {
  const environment = deps.environment;
  const lines: CheckLine[] = [
    ...settingsLines(environment),
    ...CUSTODY_KEYS.map((key) => custodyLine(key, environment[key])),
    ...trustedKeyLines(environment.NETOPIA_IPN_KEYS_PATH, deps.trustedKeyOwners),
    await apiKeyLine(deps)
  ];
  const publicAppUrl = environment.PUBLIC_APP_URL;
  if (isHttpsUrl(publicAppUrl)) lines.push(await notifyLine(deps, publicAppUrl));
  lines.push(...await registerLines(deps), companyLine(deps.company));
  return Object.freeze(lines);
}

export function renderCheckLines(lines: ReadonlyArray<CheckLine>): string {
  const crossed = lines.filter((line) => !line.ok).length;
  const summary = crossed === 0
    ? `All ${String(lines.length)} checks passed.`
    : `${String(crossed)} of ${String(lines.length)} checks need attention.`;
  return `${[...lines.map((line) => `${line.ok ? "✓" : "✗"} ${line.text}`), summary].join("\n")}\n`;
}

export async function runBillingCheckCli(
  args: readonly string[], output: BillingCheckCliOutput, open: OpenBillingCheck
): Promise<number> {
  if (args.length > 0) {
    output.stderr("BILLING_CHECK_USAGE\n");
    return 2;
  }
  let deps: Awaited<ReturnType<OpenBillingCheck>>;
  try {
    deps = await open();
  } catch (error) {
    output.stderr(`${codeOf(error)}\n`);
    return 1;
  }
  try {
    const lines = await runBillingCheck(deps);
    output.stdout(renderCheckLines(lines));
    return lines.every((line) => line.ok) ? 0 : 1;
  } catch (error) {
    output.stderr(`${codeOf(error)}\n`);
    return 1;
  } finally {
    await deps.close().catch(() => undefined);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingCheckCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    let pool: Pool | undefined;
    return Object.freeze({
      environment: loadBillingCheckEnvironment(),
      company: SELLER_COMPANY,
      trustedKeyOwners: productionTrustedKeyOwners(),
      fetch: globalThis.fetch,
      payments: (config: NetopiaConfig) => createNetopiaPayments(config),
      // A tool-order id (`t-` + 30 hex): never one of our charges, so the read can match nothing of ours.
      randomOrderId: () => `t-${randomBytes(15).toString("hex")}`,
      register: async (): Promise<RegisterFacts> => {
        const operator = loadBillingOperatorEnvironment();
        pool = await openBillingOperatorPool(operator.DATABASE_URL, {
          production: operator.NODE_ENV === "production", readOnly: true, max: 1
        });
        const version = operator.REGISTER_VERSION;
        const [policy, plans, countryPolicy] = await Promise.all([
          readBillingPolicy(pool, version), readBillingPlans(pool, version), readCountryPolicy(pool, version)
        ]);
        return Object.freeze({
          registerVersion: version, billingEnabled: policy?.enabled ?? null, planCurrency: plans?.currency ?? null,
          countryPolicy: countryPolicy !== null
        });
      },
      close: async () => { await pool?.end(); }
    });
  });
}
