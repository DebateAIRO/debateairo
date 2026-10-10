// tools/billing/netopia-sandbox.ts
// N22 (spec 2026-10-05 §2.20.3): OWNER-RUN recording of NETOPIA (the sandbox, or a small live test in provider-only mode),
// run on the host under systemd-run with the API's EnvironmentFile, like the other billing commands:
//   pnpm billing:netopia-sandbox check
//   pnpm billing:netopia-sandbox start   --capture-dir D [--amount 1.00] [--currency USD|EUR|RON] [--client-id-at order|instrument] [--installments 0|1] [--payer F]
//   pnpm billing:netopia-sandbox zero    --capture-dir D [--currency USD|EUR|RON] [--client-id-at order|instrument] [--installments 0|1] [--payer F]
//   pnpm billing:netopia-sandbox status  --capture-dir D (--order <tool order> [--no-ntp-id] | --unknown-order)
//   pnpm billing:netopia-sandbox charge  --capture-dir D --from-order <tool order> [--amount 1.00] [--currency USD|EUR|RON] [--payer F] [--payer-ip IP]
//   pnpm billing:netopia-sandbox fixture --capture-dir D --order <tool order>   (within 14 days: the raw messages are purged after)
// On live, start, zero and charge refuse without --live --i-understand-this-charges-my-card (and need --payer; charge --payer-ip).
// D is a private 0700 folder outside the repository; every capture is a RAW 0600 file for scrub-netopia-fixture.ts, which this
// tool cannot import (tools/orphan-audit/src/index.ts:726 refuses an import path naming a fixture in tools/). Tokens are replaced
// by "[token]" before anything is written; the API key is never recorded; no secret is printed.
import { randomBytes } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import {
  paymentErrorCode, type CardPayments, type Payer, type PaymentEnvironment, type PaymentReport, type PriceCurrency, type SecretToken
} from "@debateai/billing-core";
import { BillingRepository } from "@debateai/db";
import { loadApiEnvironment, readNetopiaEnvironmentGroup } from "@debateai/register";
import { loadSecretKey, openRecord, readCustodyAuthorizationHeader } from "@debateai/crypto";
import {
  answeredOrderReused, isNetopiaPosSignature, loadTrustedKeys, netopiaAmountToMicros, netopiaEnvironmentOf, publishedIpnKeyFingerprint
} from "@debateai/payments-netopia";
import { createNetopiaPaymentsForRecording } from "../../packages/payments-netopia/src/client.js";
import { DEFAULT_REQUEST_FACTS, type NetopiaRequestFacts } from "../../packages/payments-netopia/src/requests.js";
import { productionTrustedKeyOwners, readTrustedKeyFile } from "../../apps/api/src/billing/connectors.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { openCardToken } from "../../apps/api/src/billing/records.js";

export const NETOPIA_CAPTURE_FORMAT = "debateai.netopia-capture.v1";
export const NETOPIA_SANDBOX_USAGE =
  "usage: billing:netopia-sandbox check | start|zero|status|charge|fixture --capture-dir <0700 folder> [options] (see the file header)";

const TOOL_ORDER = /^t-[0-9a-f]{30}$/u;
const MAX_TOOL_AMOUNT_MICROS = 5_000_000;
const MIN_TOOL_AMOUNT_MICROS = 10_000;
const RECORDING_DESCRIPTION = "DebateAI NETOPIA recording";
const SANDBOX_PAYER_IP = "192.0.2.10";
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}(?::[A-Za-z0-9_.-]{1,64})?$/u;
/** A string member whose key holds "token" in any letter case (token, Token, cardToken, token_id, authenticationToken, …). */
const TOKEN_MEMBER = /"([^"\\]*token[^"\\]*)"\s*:\s*"(?:[^"\\]|\\.)*"/giu;
/** A made-up payer for the sandbox (NETOPIA's sandbox needs a complete one; nothing here is a person's). */
const SANDBOX_PAYER: Payer = Object.freeze({
  firstName: "Sandbox", lastName: "Payer", email: "sandbox-payer@example.com", phone: "+40700000001", country: "RO",
  region: "Bucuresti", city: "Bucuresti", postalCode: "010011", street: "Strada Exemplu 1"
});

export type ToolCommand =
  | Readonly<{ command: "check" }>
  | Readonly<{ command: "start" | "zero"; captureDir: string; amountMicros: number; currency: PriceCurrency; clientIdAt: "order" | "instrument"; installments: 0 | 1; payerFile: string | null; live: boolean }>
  | Readonly<{ command: "status"; captureDir: string; orderId: string | null; withNtpId: boolean }>
  | Readonly<{ command: "charge"; captureDir: string; fromOrder: string; amountMicros: number; currency: PriceCurrency; payerFile: string | null; payerIp: string | null; live: boolean }>
  | Readonly<{ command: "fixture"; captureDir: string; orderId: string }>;

const WITH_VALUE: ReadonlySet<string> = new Set([
  "--capture-dir", "--amount", "--currency", "--client-id-at", "--installments", "--payer", "--order", "--from-order", "--payer-ip"
]);
const SWITCHES: ReadonlySet<string> = new Set(["--no-ntp-id", "--unknown-order", "--live", "--i-understand-this-charges-my-card"]);
function usage(why: string): never {
  throw new TypeError(`NETOPIA_SANDBOX_USAGE:${why.replace(/^-+/u, "")}`);
}

export function parseSandboxArguments(argv: readonly string[]): ToolCommand {
  const [command, ...rest] = argv;
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index]!;
    if (SWITCHES.has(name)) { switches.add(name); continue; }
    const value = rest[index + 1];
    if (!WITH_VALUE.has(name) || value === undefined || values.has(name)) usage(name);
    values.set(name, value);
    index += 1;
  }
  if (switches.has("--live") !== switches.has("--i-understand-this-charges-my-card")) usage("live-flags");
  const live = switches.has("--live");
  if (command === "check") return Object.freeze({ command });
  const captureDir = values.get("--capture-dir") ?? usage("capture-dir");
  const amountOf = (text: string): number => {
    let micros: number;
    try { micros = netopiaAmountToMicros(text); } catch { return usage("amount"); }
    return micros >= MIN_TOOL_AMOUNT_MICROS && micros <= MAX_TOOL_AMOUNT_MICROS ? micros : usage("amount");
  };
  // Part C (spec 2026-10-05 §2.16.4): the tool's orders are not charges; the flag only shows NETOPIA's answer per currency.
  const currencyOf = (): PriceCurrency => {
    const value = values.get("--currency") ?? "USD";
    return value === "USD" || value === "EUR" || value === "RON" ? value : usage("currency");
  };
  const toolOrderOf = (name: string): string => {
    const value = values.get(name) ?? usage(name);
    return TOOL_ORDER.test(value) ? value : usage(name);
  };
  if (command === "start" || command === "zero") {
    if (command === "zero" && values.has("--amount")) usage("amount");
    const clientIdAt = values.get("--client-id-at") ?? "order";
    const installments = values.get("--installments") ?? "0";
    if (clientIdAt !== "order" && clientIdAt !== "instrument") usage("client-id-at");
    if (installments !== "0" && installments !== "1") usage("installments");
    return Object.freeze({
      command, captureDir, amountMicros: command === "zero" ? 0 : amountOf(values.get("--amount") ?? "1.00"), currency: currencyOf(), clientIdAt,
      installments: installments === "1" ? 1 : 0, payerFile: values.get("--payer") ?? null, live
    });
  }
  if (command === "status") {
    if (switches.has("--unknown-order")) return Object.freeze({ command, captureDir, orderId: null, withNtpId: false });
    return Object.freeze({ command, captureDir, orderId: toolOrderOf("--order"), withNtpId: !switches.has("--no-ntp-id") });
  }
  if (command === "charge") {
    return Object.freeze({
      command, captureDir, fromOrder: toolOrderOf("--from-order"), amountMicros: amountOf(values.get("--amount") ?? "1.00"),
      currency: currencyOf(), payerFile: values.get("--payer") ?? null, payerIp: values.get("--payer-ip") ?? null, live
    });
  }
  if (command === "fixture") return Object.freeze({ command, captureDir, orderId: toolOrderOf("--order") });
  return usage("command");
}

export function newToolOrderId(): string {
  return `t-${randomBytes(15).toString("hex")}`;
}

/**
 * The string value of every member whose key holds "token", in any letter case and anywhere in the key (NETOPIA's
 * payment.token and binding.token, customerAction.authenticationToken, a cardToken, a token_id, …), becomes "[token]".
 * The key stays exactly as written, so a capture still shows NETOPIA's real key, its letter case and the token's PATH.
 */
export function redactTokens(text: string): string {
  return text.replace(TOKEN_MEMBER, '"$1":"[token]"');
}

export type CapturedExchange = Readonly<{ path: string; requestText: string; httpStatus: number | null; contentType: string | null; responseText: string | null }>;

/** A fetch that records each exchange, tokens redacted and never the Authorization header, and hands the client an equal answer. */
export function captureFetch(inner: typeof fetch, record: (exchange: CapturedExchange) => void): typeof fetch {
  const captured = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    const requestText = redactTokens(typeof init?.body === "string" ? init.body : "");
    let response: Response;
    try {
      response = await inner(input, init);
    } catch (error) {
      record(Object.freeze({ path, requestText, httpStatus: null, contentType: null, responseText: null }));
      throw error;
    }
    if (response.status < 200 || response.status > 599) {
      record(Object.freeze({ path, requestText, httpStatus: response.status, contentType: null, responseText: null }));
      return response;
    }
    const text = await response.text();
    record(Object.freeze({ path, requestText, httpStatus: response.status, contentType: response.headers.get("content-type"), responseText: redactTokens(text) }));
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  return captured as typeof fetch;
}

export type SandboxSession = Readonly<{
  environment: PaymentEnvironment; baseUrl: string; posSignature: string; publicAppUrl: string;
  /** What captureFetch has seen so far (the tool writes the new ones after each call). */
  exchanges: ReadonlyArray<CapturedExchange>;
  trustedKeys: ReadonlyArray<Readonly<{ fingerprint: string }>>;
  payments(facts: NetopiaRequestFacts): CardPayments;
  insertToolOrder(row: Readonly<{ orderId: string; paymentEnvironment: PaymentEnvironment; createdAt: Date; purpose: "SANDBOX_RECORDING" | "LIVE_TEST" }>): Promise<void>;
  toolOrder(orderId: string): Promise<Readonly<{ orderId: string; paymentEnvironment: string }> | null>;
  /** The newest unrevoked card the API stored for a tool order (N9's intake), opened. */
  latestCard(orderId: string): Promise<SecretToken | null>;
  /** What the API stored for an order: each verified message's raw bytes, oldest first. */
  storedNotices(orderId: string): Promise<ReadonlyArray<Readonly<{ receivedAt: Date; rawBody: Buffer }>>>;
  close(): Promise<void>;
}>;
export type SandboxOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;

type RunState = Readonly<{ orderId: string; run: string; ntpId: string | null; environment: PaymentEnvironment; amountMicros: number }>;

function codeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "NETOPIA_SANDBOX_FAILED";
}

function assertCaptureDir(path: string): void {
  let mode: number;
  try {
    const stats = statSync(path);
    if (!stats.isDirectory()) throw new TypeError("NETOPIA_SANDBOX_CAPTURE_DIR_UNSAFE");
    mode = stats.mode;
  } catch {
    throw new TypeError("NETOPIA_SANDBOX_CAPTURE_DIR_UNSAFE");
  }
  if ((mode & 0o077) !== 0) throw new TypeError("NETOPIA_SANDBOX_CAPTURE_DIR_UNSAFE");
}

function writeCapture(dir: string, session: SandboxSession, kind: string, orderId: string, at: Date,
  body: Readonly<{ httpStatus: number | null; contentType: string | null; bodyText: string }>): void {
  const capture = { format: NETOPIA_CAPTURE_FORMAT, kind, environment: session.environment, recordedAt: at.toISOString(), ...body };
  writeFileSync(join(dir, `${kind}-${orderId}-${at.getTime()}.json`), `${JSON.stringify(capture, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

/** The exchanges of one call: the first is the request we sent and its answer; a 56's follow-up status read comes after. */
function writeExchanges(dir: string, session: SandboxSession, from: number, kinds: Readonly<{ request: string | null; answer: string }>, orderId: string, at: Date): void {
  session.exchanges.slice(from).forEach((exchange, index) => {
    if (index === 0 && kinds.request !== null) writeCapture(dir, session, kinds.request, orderId, at, { httpStatus: null, contentType: "application/json", bodyText: exchange.requestText });
    if (exchange.responseText !== null) {
      writeCapture(dir, session, index === 0 ? kinds.answer : "charge-followup-answer", orderId, at,
        { httpStatus: exchange.httpStatus, contentType: exchange.contentType, bodyText: exchange.responseText });
    }
  });
}

function writeState(dir: string, state: RunState): void {
  writeFileSync(join(dir, `state-${state.orderId}.json`), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function readState(dir: string, orderId: string): RunState | null {
  try { return JSON.parse(readFileSync(join(dir, `state-${orderId}.json`), "utf8")) as RunState; } catch { return null; }
}

function payerFrom(file: string): Payer {
  const value = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const text = (name: string): string => (typeof value[name] === "string" && (value[name] as string).trim() !== "" ? value[name] as string : usage("payer"));
  const optionalText = (name: string): string | null => (typeof value[name] === "string" ? value[name] as string : null);
  return Object.freeze({
    firstName: text("firstName"), lastName: text("lastName"), email: text("email"), phone: text("phone"), country: text("country"),
    region: optionalText("region"), city: text("city"), postalCode: optionalText("postalCode"), street: text("street")
  });
}

/** Spec §2.20.3: on live, every command that can move money needs both flags and the owner's own details. */
function guardLive(session: SandboxSession, live: boolean, payerFile: string | null): void {
  if (session.environment !== "live") return;
  if (!live) throw new TypeError("NETOPIA_SANDBOX_LIVE_NOT_CONFIRMED");
  if (payerFile === null) throw new TypeError("NETOPIA_SANDBOX_PAYER_REQUIRED");
}

const purposeOf = (session: SandboxSession): "SANDBOX_RECORDING" | "LIVE_TEST" => (session.environment === "live" ? "LIVE_TEST" : "SANDBOX_RECORDING");
const notifyUrlOf = (session: SandboxSession): string => `${session.publicAppUrl}/api/v1/billing/netopia/notify`;

async function start(command: Extract<ToolCommand, { command: "start" | "zero" }>, session: SandboxSession, output: SandboxOutput, at: Date): Promise<number> {
  guardLive(session, command.live, command.payerFile);
  const payer = command.payerFile === null ? SANDBOX_PAYER : payerFrom(command.payerFile);
  const run = `${command.command}${command.clientIdAt === "instrument" ? "-client-id-instrument" : ""}${command.installments === 1 ? "-installments-1" : ""}`;
  const orderId = newToolOrderId();
  await session.insertToolOrder({ orderId, paymentEnvironment: session.environment, createdAt: at, purpose: purposeOf(session) });
  const from = session.exchanges.length;
  let kind = `${run}-answer-error`;
  try {
    const started = await session.payments({ clientIdLocation: command.clientIdAt, installments: command.installments }).startHostedPayment({
      orderId, amountMicros: command.amountMicros, currency: command.currency, description: RECORDING_DESCRIPTION, payer,
      clientId: randomBytes(16).toString("hex"), returnUrl: `${session.publicAppUrl}/`, notifyUrl: notifyUrlOf(session), language: "ro"
    });
    kind = `${run}-answer`;
    writeState(command.captureDir, { orderId, run, ntpId: started.providerPaymentId, environment: session.environment, amountMicros: command.amountMicros });
    output.stdout(`NETOPIA_SANDBOX_ORDER=${orderId}\nNETOPIA_SANDBOX_PAY=${started.redirectUrl}\n`);
    return 0;
  } finally {
    writeExchanges(command.captureDir, session, from, { request: `${run}-request`, answer: kind }, orderId, at);
  }
}

async function status(command: Extract<ToolCommand, { command: "status" }>, session: SandboxSession, output: SandboxOutput, at: Date): Promise<number> {
  const orderId = command.orderId ?? newToolOrderId();
  const state = command.orderId === null ? null : readState(command.captureDir, command.orderId);
  if (command.orderId !== null && state === null && (await session.toolOrder(command.orderId)) === null) throw new TypeError("NETOPIA_SANDBOX_TOOL_ORDER_UNKNOWN");
  const ntpId = command.withNtpId ? state?.ntpId ?? null : null;
  const from = session.exchanges.length;
  let read: PaymentReport | "NO_SUCH_ORDER" | null = null;
  let line: string;
  try {
    read = await session.payments(DEFAULT_REQUEST_FACTS).status({ orderId, providerPaymentId: ntpId });
    line = read === "NO_SUCH_ORDER" ? "NO_SUCH_ORDER" : `${read.state}:${read.providerStatus}`;
  } catch (error) {
    line = codeOf(error);
  }
  // The kind follows the command, not the parse: an --unknown-order read IS how NETOPIA says "no such order", whatever
  // the package made of the answer (a code or an HTTP status the build did not guess is exactly what the recording is for).
  const kind = command.orderId === null || read === "NO_SUCH_ORDER" ? "status-no-such-order" : ntpId === null ? "status-answer-without-ntp-id" : "status-answer";
  writeExchanges(command.captureDir, session, from, { request: null, answer: kind }, orderId, at);
  output.stdout(`NETOPIA_SANDBOX_STATUS=${line}\n`);
  return read === null ? 1 : 0;
}

async function charge(command: Extract<ToolCommand, { command: "charge" }>, session: SandboxSession, output: SandboxOutput, at: Date): Promise<number> {
  guardLive(session, command.live, command.payerFile);
  if (session.environment === "live" && command.payerIp === null) throw new TypeError("NETOPIA_SANDBOX_PAYER_IP_REQUIRED");
  const source = await session.toolOrder(command.fromOrder);
  if (source === null) throw new TypeError("NETOPIA_SANDBOX_TOOL_ORDER_UNKNOWN");
  if (source.paymentEnvironment !== session.environment) throw new TypeError("NETOPIA_SANDBOX_OTHER_ENVIRONMENT");
  const card = await session.latestCard(command.fromOrder);
  if (card === null) throw new TypeError("NETOPIA_SANDBOX_NO_SAVED_CARD");
  const payer = command.payerFile === null ? SANDBOX_PAYER : payerFrom(command.payerFile);
  const orderId = newToolOrderId();
  await session.insertToolOrder({ orderId, paymentEnvironment: session.environment, createdAt: at, purpose: purposeOf(session) });
  const from = session.exchanges.length;
  let kind = "charge-answer-error";
  try {
    const report = await session.payments(DEFAULT_REQUEST_FACTS).chargeSavedCard({
      orderId, amountMicros: command.amountMicros, currency: command.currency, description: RECORDING_DESCRIPTION, payer, cardToken: card,
      payerIp: command.payerIp ?? SANDBOX_PAYER_IP, returnUrl: `${session.publicAppUrl}/`, notifyUrl: notifyUrlOf(session), language: "ro"
    });
    kind = answeredOrderReused(report) ? "charge-answer-56" : report.state === "DECLINED" ? "charge-answer-declined" : "charge-answer";
    writeState(command.captureDir, { orderId, run: "charge", ntpId: report.providerPaymentId, environment: session.environment, amountMicros: command.amountMicros });
    output.stdout(`NETOPIA_SANDBOX_ORDER=${orderId}\nNETOPIA_SANDBOX_CHARGE=${report.state}:${report.providerStatus}:card=${report.savedCard === null ? "none" : "new"}\n`);
    return 0;
  } finally {
    writeExchanges(command.captureDir, session, from, { request: "charge-request", answer: kind }, orderId, at);
  }
}

async function fixture(command: Extract<ToolCommand, { command: "fixture" }>, session: SandboxSession, output: SandboxOutput): Promise<number> {
  const state = readState(command.captureDir, command.orderId);
  if (state === null) throw new TypeError("NETOPIA_SANDBOX_STATE_MISSING");
  const notices = await session.storedNotices(command.orderId);
  notices.forEach((notice, index) => {
    try {
      writeCapture(command.captureDir, session, index === 0 ? `notice-${state.run}` : `notice-${state.run}-${index + 1}`, command.orderId, notice.receivedAt,
        { httpStatus: null, contentType: "application/json", bodyText: redactTokens(notice.rawBody.toString("utf8")) });
    } catch (error) {
      // Already copied by an earlier run: the same order, kind and receivedAt name the same file ('wx' answers EEXIST).
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  });
  output.stdout(`NETOPIA_SANDBOX_NOTICES=${notices.length}\n`);
  return notices.length > 0 ? 0 : 1;
}

/** The check command's NETOPIA lines (spec §2.17.3), for this tool's own run: never a secret. */
async function check(session: SandboxSession, output: SandboxOutput): Promise<number> {
  const lines = [`✓ NETOPIA ${session.environment} at ${session.baseUrl}`, "✓ POS signature in NETOPIA's pattern"];
  for (const key of session.trustedKeys) {
    lines.push(`✓ trusted key ${key.fingerprint}${key.fingerprint === publishedIpnKeyFingerprint() ? " (NETOPIA's published key)" : ""}`);
  }
  let accepted = false;
  try {
    await session.payments(DEFAULT_REQUEST_FACTS).status({ orderId: newToolOrderId(), providerPaymentId: null });
    accepted = true;
  } catch (error) {
    const code = paymentErrorCode(error);
    accepted = code === "PAYMENT_CONFIGURATION_REFUSED";
    if (!accepted) lines.push(code === "PAYMENT_CREDENTIALS_REFUSED" ? "✗ NETOPIA refused the API key" : `✗ NETOPIA could not be asked (${codeOf(error)})`);
  }
  if (accepted) lines.push("✓ NETOPIA accepts the API key");
  output.stdout(`${lines.join("\n")}\n`);
  return accepted ? 0 : 1;
}

export async function runNetopiaSandbox(argv: readonly string[], output: SandboxOutput, open: () => Promise<SandboxSession>,
  clock: () => Date = () => new Date()): Promise<number> {
  let parsed: ToolCommand;
  try {
    parsed = parseSandboxArguments(argv);
  } catch (error) {
    output.stderr(`${codeOf(error)}\n${NETOPIA_SANDBOX_USAGE}\n`);
    return 2;
  }
  const command = parsed;
  let session: SandboxSession | null = null;
  try {
    if (command.command !== "check") assertCaptureDir(command.captureDir);
    session = await open();
    if (command.command === "check") return await check(session, output);
    if (command.command === "status") return await status(command, session, output, clock());
    if (command.command === "charge") return await charge(command, session, output, clock());
    if (command.command === "fixture") return await fixture(command, session, output);
    return await start(command, session, output, clock());   // start or zero (one union member, narrowed last)
  } catch (error) {
    output.stderr(`${codeOf(error)}\n`);
    return 1;
  } finally {
    await session?.close().catch(() => undefined);
  }
}

/** The API's own settings, database principal and keys (spec §2.20.3: "run by the owner with the API's settings"). */
export async function openProductionSession(): Promise<SandboxSession> {
  const environment = loadApiEnvironment();
  const group = readNetopiaEnvironmentGroup(environment);
  const paymentEnvironment = netopiaEnvironmentOf(group.netopiaApiBaseUrl);
  if (paymentEnvironment === null) throw new TypeError("BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL");
  if (!isNetopiaPosSignature(group.netopiaPosSignature)) throw new TypeError("BILLING_CONFIGURATION_INVALID:NETOPIA_POS_SIGNATURE");
  const keys = loadTrustedKeys(readTrustedKeyFile(group.netopiaIpnKeysPath, productionTrustedKeyOwners()));
  const apiKey = readCustodyAuthorizationHeader(group.netopiaApiKeyPath);
  const recordsKey = loadSecretKey(environment.RECORDS_KEY_PATH);
  const pool = await openBillingOperatorPool(environment.DATABASE_URL, { production: environment.NODE_ENV === "production", readOnly: false, max: 1 });
  const repository = new BillingRepository(pool);
  const exchanges: CapturedExchange[] = [];
  const recordingFetch = captureFetch(fetch, (exchange) => exchanges.push(exchange));
  return Object.freeze({
    environment: paymentEnvironment, baseUrl: group.netopiaApiBaseUrl, posSignature: group.netopiaPosSignature, publicAppUrl: group.publicAppUrl,
    exchanges, trustedKeys: Object.freeze(keys.map((key) => Object.freeze({ fingerprint: key.fingerprint }))),
    payments: (facts: NetopiaRequestFacts) => createNetopiaPaymentsForRecording(
      { baseUrl: group.netopiaApiBaseUrl, apiKey, posSignature: group.netopiaPosSignature }, { fetch: recordingFetch }, facts),
    insertToolOrder: (row) => repository.withTransaction((client) => repository.insertToolOrder(client, row)),
    toolOrder: async (orderId) => {
      const row = await repository.toolOrder(pool, orderId);
      return row === null ? null : Object.freeze({ orderId: row.orderId, paymentEnvironment: row.paymentEnvironment });
    },
    latestCard: async (orderId) => {
      const row = await repository.latestToolOrderTokenRow(pool, orderId);
      return row === null ? null : openCardToken(recordsKey, row);
    },
    storedNotices: async (orderId) => (await repository.storedNoticeRows(pool, orderId)).map((row) => Object.freeze({
      receivedAt: row.receivedAt,
      rawBody: openRecord(recordsKey, { table: "billing.payment_notice_raw", column: "raw_ciphertext", rowId: row.noticeId }, row.rawCiphertext)
    })),
    close: async () => {
      recordsKey.fill(0);
      await pool.end();
    }
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runNetopiaSandbox(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text)
  }, openProductionSession);
}
