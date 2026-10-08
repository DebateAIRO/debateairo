import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BillingEnvironmentGroup } from "@debateai/register";
import { startFakeQuaderno } from "../../../acceptance/billing-fakes/fake-quaderno.js";
import { startFakeSmartBill } from "../../../acceptance/billing-fakes/fake-smartbill.js";
import { startFakeNetopia } from "../../../acceptance/billing-fakes/fake-netopia.js";
import { ensureDevCustodyDirectory, resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";
import { DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE, type DevelopmentAuthStackProfile } from "./dev-auth-stack-profile.js";

/**
 * Paid plans (spec 2026-09-29 §2.11, task P6b; NETOPIA spec 2026-10-05 §2.20.1). Fake billing vendors for development:
 * four generated text secrets (0600, reused across runs), three loopback fakes that use them (NETOPIA, Quaderno,
 * SmartBill), NETOPIA's trusted message key (new at each start, so rewritten each time), and a 0600 receipt naming them.
 * Nothing here is a real credential; the development API (local mode) never reads any of it.
 */
export const DEVELOPMENT_BILLING_SECRET_FILES = Object.freeze([
  Object.freeze({ id: "netopia-api-key", relativePath: "billing/netopia-api-key" }),
  Object.freeze({ id: "quaderno-api-key", relativePath: "billing/quaderno-api-key" }),
  Object.freeze({ id: "smartbill-credentials", relativePath: "billing/smartbill-credentials" }),
  Object.freeze({ id: "owner-report-email", relativePath: "billing/owner-report-email" })
]);

export type DevelopmentBillingFakesReceipt = Readonly<{
  /** The NETOPIA fake: its API key is the custody file (reused across runs); its trusted key is new at every start. */
  netopia: Readonly<{ baseUrl: string; posSignature: string; apiKeyPath: string; ipnKeysPath: string }>;
  quaderno: Readonly<{ baseUrl: string; apiKeyPath: string }>;
  smartbill: Readonly<{ baseUrl: string; credentialsPath: string; companyCif: string; series: string }>;
  ownerReportEmailPath: string;
  /** The development profile's public origin, the local stand-in for PUBLIC_APP_URL (R-7). */
  publicAppUrl: string;
}>;

export type DevelopmentBillingFakes = Readonly<{
  receiptPath: string;
  receipt: DevelopmentBillingFakesReceipt;
  stop(): Promise<void>;
}>;

const PRIVATE_FILE_MODE = 0o600;
const MAX_SECRET_BYTES = 4_096;
const PRINTABLE_LINE = /^[\x21-\x7e]+$/u;

function currentUid(): number {
  if (typeof process.getuid !== "function") throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID");
  return process.getuid();
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

/** Creates the secret exclusively at 0600 the first time; afterwards validates, never repairs. */
async function textSecret(path: string, create: () => string): Promise<string> {
  try {
    const created = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, PRIVATE_FILE_MODE);
    try {
      await created.writeFile(`${create()}\n`, "latin1");
      await created.sync();
    } finally {
      await created.close();
    }
  } catch (error) {
    if (!isFileSystemError(error, "EEXIST")) throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID", { cause: error });
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID", { cause: error });
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.uid !== currentUid() || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE || metadata.size < 2 || metadata.size > MAX_SECRET_BYTES) {
      throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID");
    }
    const text = await handle.readFile("latin1");
    const line = text.endsWith("\n") ? text.slice(0, -1) : text;
    if (!PRINTABLE_LINE.test(line)) throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID");
    return line;
  } finally {
    await handle.close();
  }
}

async function publishReceipt(path: string, receipt: DevelopmentBillingFakesReceipt): Promise<void> {
  const temporary = join(dirname(path), `.billing-fakes.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new TypeError("DEV_BILLING_FAKES_PUBLISH_FAILED", { cause: error });
  }
}

/** A file the fakes own, rewritten whole at every start (temporary file, then one rename). */
async function publishFile(path: string, text: string, mode: number): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new TypeError("DEV_BILLING_FAKES_PUBLISH_FAILED", { cause: error });
  }
}

export async function startDevelopmentBillingFakes(input: Readonly<{
  repositoryRoot: string;
  commandEnvironment: Readonly<Record<string, string | undefined>>;
  profile?: DevelopmentAuthStackProfile;
}>): Promise<DevelopmentBillingFakes> {
  const profile = input.profile ?? DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
  const custodyRoot = resolveDevCustodyRoot(input.repositoryRoot, input.commandEnvironment);
  const directory = join(custodyRoot, "billing");
  try {
    await ensureDevCustodyDirectory(dirname(custodyRoot));
    await ensureDevCustodyDirectory(custodyRoot);
    await ensureDevCustodyDirectory(directory);
  } catch (error) {
    throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID", { cause: error });
  }
  const [netopiaKeyFile, quadernoFile, smartbillFile, ownerFile] = DEVELOPMENT_BILLING_SECRET_FILES.map(
    ({ relativePath }) => join(custodyRoot, relativePath)
  ) as [string, string, string, string];
  // NETOPIA's API key is a printable line with no space (readCustodyAuthorizationHeader's rule), built from pieces.
  const netopiaKey = await textSecret(netopiaKeyFile, () => ["dev", "netopia", randomBytes(16).toString("hex")].join("-"));
  const quadernoKey = await textSecret(quadernoFile, () => `dev_${randomBytes(16).toString("hex")}`);
  const smartbillCredentials = await textSecret(smartbillFile, () => `dev-billing@localhost.test:${randomBytes(16).toString("hex")}`);
  await textSecret(ownerFile, () => "owner@localhost.test");
  const separator = smartbillCredentials.indexOf(":");
  if (separator < 1) throw new TypeError("DEV_BILLING_FAKES_SECRET_INVALID");

  const started: Array<{ stop(): Promise<void> }> = [];
  try {
    // A fixed development POS signature in NETOPIA's pattern (not a secret); the API key is the custody file above.
    const netopia = await startFakeNetopia({
      apiKey: netopiaKey, posSignature: "DEVF-AKE0-NTPA-0000-0001", port: profile.billingFakePorts[0]
    });
    started.push({ stop: () => netopia.close() });
    const netopiaPemFile = join(directory, "netopia-ipn-keys.pem");
    await publishFile(netopiaPemFile, netopia.trustedKeysPem, 0o644);
    const quaderno = await startFakeQuaderno({ apiKey: quadernoKey, port: profile.billingFakePorts[1] });
    started.push(quaderno);
    const smartbill = await startFakeSmartBill({
      username: smartbillCredentials.slice(0, separator), token: smartbillCredentials.slice(separator + 1),
      series: "DEV", port: profile.billingFakePorts[2]
    });
    started.push(smartbill);
    const receipt: DevelopmentBillingFakesReceipt = Object.freeze({
      netopia: Object.freeze({
        baseUrl: netopia.baseUrl, posSignature: netopia.posSignature, apiKeyPath: netopiaKeyFile, ipnKeysPath: netopiaPemFile
      }),
      quaderno: Object.freeze({ baseUrl: quaderno.baseUrl, apiKeyPath: quadernoFile }),
      smartbill: Object.freeze({ baseUrl: smartbill.baseUrl, credentialsPath: smartbillFile, companyCif: smartbill.companyCif, series: smartbill.series }),
      ownerReportEmailPath: ownerFile,
      publicAppUrl: profile.publicOrigin
    });
    const receiptPath = join(custodyRoot, "billing-fakes.json");
    await publishReceipt(receiptPath, receipt);
    let stopping: Promise<void> | undefined;
    return Object.freeze({
      receiptPath,
      receipt,
      stop() {
        stopping ??= Promise.allSettled([...started].reverse().map((fake) => fake.stop())).then(() => undefined);
        return stopping;
      }
    });
  } catch (error) {
    await Promise.allSettled(started.map((fake) => fake.stop()));
    throw error;
  }
}

/**
 * The receipt as the group loadBillingConnectors takes (loopback http: the caller passes `allowLoopbackBase: true` and
 * `trustedKeyOwners` naming its own uid; the hosted validation is not applied). The group has no CIF (RULINGS-R3
 * R3-4). The caller passes `company` filled as the owner fills COMPANY: `cui` is the digits of
 * `receipt.smartbill.companyCif`, and in SMARTBILL_CIF_FORM's "ro" form `vat` is
 * `{kind: "registered", number: companyCif}`. The fake's RO value never goes in as a CUI.
 */
export function developmentBillingEnvironmentGroup(receipt: DevelopmentBillingFakesReceipt): BillingEnvironmentGroup {
  return Object.freeze({
    netopiaApiBaseUrl: receipt.netopia.baseUrl,
    netopiaPosSignature: receipt.netopia.posSignature,
    netopiaApiKeyPath: receipt.netopia.apiKeyPath,
    netopiaIpnKeysPath: receipt.netopia.ipnKeysPath,
    quadernoApiKeyPath: receipt.quaderno.apiKeyPath,
    quadernoApiBaseUrl: receipt.quaderno.baseUrl,
    smartbillCredentialsPath: receipt.smartbill.credentialsPath,
    smartbillApiBaseUrl: receipt.smartbill.baseUrl,
    smartbillSeries: receipt.smartbill.series,
    ownerReportEmailPath: receipt.ownerReportEmailPath,
    publicAppUrl: receipt.publicAppUrl,
    // Until N23 removes the member: the development stack names no xMoney system.
    xmoney: null
  });
}
