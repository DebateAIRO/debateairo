// tools/billing/record-connector.ts
// P4/P5 (paid plans; spec §2.8 "one recorded sandbox run per connector"): OWNER-RUN recorder. It drives the REAL
// clients with a fetch that saves every request and reply of each step to a private capture folder, so the
// provider's own validation checks the exact requests we send. Credentials are read from 0600 files and are never
// printed or saved (the Authorization header is not recorded). Scrub the capture with scrub-connector-fixture.ts.
//   quaderno --key-file F --base-url https://<account>.sandbox-quadernoapp.com/api --vat-id <a valid EU VAT id>
//            --vat-country <its ISO2 country> --capture-dir D
// The Quaderno run books TWO sales and TWO refunds under two fresh transaction ids: a German consumer's sale and its
// refund, then a reverse-charge company sale (the --vat-id company, 0 VAT) and its refund. The second pair's lookups
// run while the first sale and credit already exist, so their recorded empty lists prove that Quaderno applies the
// processor_id filter. Only the booked document shows the reverse-charge wording, so after the run the owner OPENS
// that sandbox invoice and its credit note in Quaderno and confirms that each shows 0 VAT and says "Reverse charge"
// (the recorder prints a reminder line). If the wording is missing, the client must send Quaderno's reverse-charge
// marker before billing goes on.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RefundRecord, SaleRecord } from "@debateai/billing-core";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";

export const CONNECTOR_CAPTURE_FORMAT = "debateai.connector-capture.v1";

export type RecordedExchange = Readonly<{
  request: Readonly<{ method: string; path: string; query: Readonly<Record<string, string>>; body: unknown }>;
  response: Readonly<{ status: number; contentType: string; body: unknown }>;
}>;
export type RecordedStep = Readonly<{ step: string; outcome: string; exchanges: ReadonlyArray<RecordedExchange> }>;
export type ConnectorCapture = Readonly<{
  format: typeof CONNECTOR_CAPTURE_FORMAT; connector: "quaderno" | "smartbill"; steps: ReadonlyArray<RecordedStep>;
}>;

/** Every step a complete Quaderno recording holds; its recorded-fixture suite fails naming a missing one. */
export const QUADERNO_RECORDING_STEPS = Object.freeze([
  "calculate-ro", "calculate-vat-id", "calculate-us-tx", "calculate-jp", "validate-tax-id",
  "record-sale", "record-sale-again", "record-refund", "record-refund-again",
  // The second pair, under a second fresh transaction id: a reverse-charge company sale and its refund. Their lookups
  // run while the first pair's documents exist, so an empty recorded list proves the processor_id filter works.
  "record-company-sale", "record-company-refund"
] as const);

const RECORDING_CHARGE_ID = "c0ffee00c0ffee00c0ffee00c0ffee00";
const RECORDING_COMPANY_CHARGE_ID = "c0ffee11c0ffee11c0ffee11c0ffee11";

/** The content-free line the recorder prints after a Quaderno run: the reverse-charge wording is only on the document. */
export const QUADERNO_REVERSE_CHARGE_CHECK = "CONNECTOR_OWNER_CHECK=open the sandbox invoice of record-company-sale and "
  + "the credit note of record-company-refund in Quaderno; confirm each shows 0 VAT and says \"Reverse charge\"";

/** The four quotes (spec §2.5.7's cases); `vatCountry` and `vatId` are the owner's valid EU company id. */
export function quadernoRecordingQuotes(vatCountry: string, vatId: string): ReadonlyArray<Readonly<{
  step: typeof QUADERNO_RECORDING_STEPS[number]; country: string; postalCode: string | null; taxId: string | null;
}>> {
  return Object.freeze([
    { step: "calculate-ro", country: "RO", postalCode: null, taxId: null },
    { step: "calculate-vat-id", country: vatCountry, postalCode: null, taxId: vatId },
    { step: "calculate-us-tx", country: "US", postalCode: "75001", taxId: null },
    { step: "calculate-jp", country: "JP", postalCode: null, taxId: null }
  ] as const);
}

/** The synthetic sale the recording books (a German consumer at 19 %); the recorded suite replays the same one. */
export function quadernoRecordingSale(transactionId: string): SaleRecord {
  return {
    chargeId: RECORDING_CHARGE_ID, transactionId, issuedOn: new Date("2026-10-02T10:00:00.000Z"),
    customer: {
      name: "Test Person", email: "person@example.test", country: "DE", region: null, postalCode: "10115",
      city: "Berlin", street: null, taxId: null, locale: "de"
    },
    lines: [{ description: "DebateAI Plus, October 2026", netMicros: 20_000_000, taxMicros: 3_800_000, taxRateBasisPoints: 1900 }],
    taxCode: "saas",
    evidence: { billingCountry: "DE", ipAddress: "203.0.113.10", bankCountry: "DE" }
  };
}

export function quadernoRecordingRefund(
  transactionId: string, original: Readonly<{ documentId: string; number: string }>
): RefundRecord {
  return {
    chargeId: RECORDING_CHARGE_ID, transactionId, issuedOn: new Date("2026-10-05T10:00:00.000Z"),
    refundTotalMicros: 11_900_000, original: { documentId: original.documentId, number: original.number },
    description: "Teilerstattung DebateAI Plus"
  };
}

/**
 * The recording's reverse-charge company sale (P10a's company shape: the company's name, its address in `street`,
 * its VAT id, and its country as the evidence): one line at 20.00 net with 0 tax at 0 %. `vatCountry` and `vatId` are
 * the owner's valid EU company id (`--vat-country`, `--vat-id`); every other value is synthetic.
 */
export function quadernoRecordingCompanySale(transactionId: string, vatCountry: string, vatId: string): SaleRecord {
  return {
    chargeId: RECORDING_COMPANY_CHARGE_ID, transactionId, issuedOn: new Date("2026-10-02T10:00:00.000Z"),
    customer: {
      name: "Test Company Ltd", email: "person@example.test", country: vatCountry, region: null, postalCode: null,
      city: null, street: "1 Test Street", taxId: vatId, locale: "en"
    },
    lines: [{ description: "DebateAI Plus, October 2026", netMicros: 20_000_000, taxMicros: 0, taxRateBasisPoints: 0 }],
    taxCode: "saas",
    evidence: { billingCountry: vatCountry, ipAddress: "203.0.113.10", bankCountry: vatCountry }
  };
}

/** A partial refund of the company sale, under its own transaction id and charge id. */
export function quadernoRecordingCompanyRefund(
  transactionId: string, original: Readonly<{ documentId: string; number: string }>
): RefundRecord {
  return {
    chargeId: RECORDING_COMPANY_CHARGE_ID, transactionId, issuedOn: new Date("2026-10-05T10:00:00.000Z"),
    refundTotalMicros: 10_000_000, original: { documentId: original.documentId, number: original.number },
    description: "Partial refund, DebateAI Plus"
  };
}

function bodyOf(body: unknown): unknown {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function replyOf(contentType: string, bytes: Buffer): unknown {
  if (contentType.includes("json")) {
    try {
      return JSON.parse(bytes.toString("utf8")) as unknown;
    } catch {
      return { nonJson: true, length: bytes.byteLength };
    }
  }
  // A document (SmartBill's PDF): its shape only, never its bytes.
  return { bytes: bytes.byteLength, startsWithPdf: bytes.subarray(0, 4).toString("latin1") === "%PDF" };
}

function outcomeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && error instanceof Error ? `${code}:${error.message}` : "ERROR";
}

export class ConnectorRecorder {
  readonly #basePath: string;
  readonly #inner: typeof fetch;
  readonly #steps: Array<{ step: string; outcome: string; exchanges: RecordedExchange[] }> = [];
  #current: { step: string; outcome: string; exchanges: RecordedExchange[] } | null = null;

  constructor(baseUrl: string, inner: typeof fetch = fetch) {
    this.#basePath = new URL(baseUrl).pathname.replace(/\/+$/u, "");
    this.#inner = inner;
  }

  /** What the client is given as its `fetch`: the real call, with the request and the reply kept (no headers). */
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const response = await this.#inner(input, init);
    const bytes = Buffer.from(await response.clone().arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const path = url.pathname.startsWith(this.#basePath) ? url.pathname.slice(this.#basePath.length) || "/" : url.pathname;
    this.#current?.exchanges.push({
      request: { method: init?.method ?? "GET", path, query: Object.fromEntries(url.searchParams), body: bodyOf(init?.body) },
      response: { status: response.status, contentType, body: replyOf(contentType, bytes) }
    });
    return response;
  };

  /** Runs one step; a refusal is recorded as the step's outcome (the client's code, content-free) and the run goes on. */
  async step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    const current = { step: name, outcome: "OK", exchanges: [] as RecordedExchange[] };
    this.#steps.push(current);
    this.#current = current;
    try {
      return await run();
    } catch (error) {
      current.outcome = outcomeOf(error);
      return null;
    } finally {
      this.#current = null;
    }
  }

  capture(connector: ConnectorCapture["connector"]): ConnectorCapture {
    return Object.freeze({ format: CONNECTOR_CAPTURE_FORMAT, connector, steps: this.#steps.map((step) => Object.freeze({ ...step })) });
  }
}

/** One printable line from a 0600 file (the API key, SmartBill's `e-mail:token`). */
function readTextSecret(path: string): string {
  const metadata = statSync(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new TypeError("CONNECTOR_KEY_FILE_MODE_UNSAFE");
  const text = readFileSync(path, "utf8");
  const line = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!/^[\x21-\x7e]+$/u.test(line)) throw new TypeError("CONNECTOR_KEY_FILE_INVALID");
  return line;
}

function argument(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index < 0 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`CONNECTOR_ARGUMENT_REQUIRED:${name}`);
  return value;
}

async function recordQuaderno(argv: readonly string[]): Promise<ConnectorCapture> {
  const baseUrl = argument(argv, "--base-url");
  if (!/^https:\/\/[a-z0-9-]+\.sandbox-quadernoapp\.com\/api\/?$/u.test(baseUrl)) throw new TypeError("CONNECTOR_SANDBOX_ONLY");
  const vatId = argument(argv, "--vat-id");
  const vatCountry = argument(argv, "--vat-country");
  const recorder = new ConnectorRecorder(baseUrl);
  const engine = new QuadernoTaxEngine({ baseUrl, apiKey: readTextSecret(argument(argv, "--key-file")), fetch: recorder.fetch });
  // Digits, like an xMoney transaction id, and new on every run so the sandbox books a fresh sale.
  await recordQuadernoRun({ recorder, engine, vatCountry, vatId, transactionId: String(Date.now()) });
  return recorder.capture("quaderno");
}

/**
 * Every Quaderno step, in QUADERNO_RECORDING_STEPS order, through `engine` (whose fetch is `recorder.fetch`). Each
 * refund is booked only when its sale was; the company pair uses the id after `transactionId` (a second fresh id).
 */
export async function recordQuadernoRun(i: Readonly<{
  recorder: ConnectorRecorder; engine: QuadernoTaxEngine; vatCountry: string; vatId: string; transactionId: string;
}>): Promise<void> {
  const { recorder, engine, vatCountry, vatId, transactionId } = i;
  for (const quote of quadernoRecordingQuotes(vatCountry, vatId)) {
    await recorder.step(quote.step, () => engine.quote({
      netMicros: 20_000_000, currency: "USD", taxId: quote.taxId, taxCode: "saas", date: new Date("2026-10-02T10:00:00.000Z"),
      location: { country: quote.country, region: null, postalCode: quote.postalCode, city: null, street: null, ip: "203.0.113.10" }
    }));
  }
  await recorder.step("validate-tax-id", () => engine.validateTaxId(vatCountry, vatId));
  const sale = await recorder.step("record-sale", () => engine.recordSale(quadernoRecordingSale(transactionId)));
  await recorder.step("record-sale-again", () => engine.recordSale(quadernoRecordingSale(transactionId)));
  if (sale !== null) {
    await recorder.step("record-refund", () => engine.recordRefund(quadernoRecordingRefund(transactionId, sale)));
    await recorder.step("record-refund-again", () => engine.recordRefund(quadernoRecordingRefund(transactionId, sale)));
  }
  // A second fresh id, so this pair's lookups run while the first sale and credit exist (the processor_id filter).
  const companyTransactionId = String(BigInt(transactionId) + 1n);
  const companySale = await recorder.step("record-company-sale",
    () => engine.recordSale(quadernoRecordingCompanySale(companyTransactionId, vatCountry, vatId)));
  if (companySale !== null) {
    await recorder.step("record-company-refund",
      () => engine.recordRefund(quadernoRecordingCompanyRefund(companyTransactionId, companySale)));
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const connector = argv[0];
  const capture = connector === "quaderno" ? await recordQuaderno(argv) : undefined;
  if (capture === undefined) throw new TypeError("CONNECTOR_COMMAND_UNKNOWN");
  const target = join(argument(argv, "--capture-dir"), `${capture.connector}-capture-${Date.now()}.json`);
  writeFileSync(target, JSON.stringify(capture), { mode: 0o600 });
  for (const step of capture.steps) console.log(`CONNECTOR_STEP=${step.step}:${step.outcome}`);
  console.log(`CONNECTOR_CAPTURE=${target}`);
  if (capture.connector === "quaderno") console.log(QUADERNO_REVERSE_CHARGE_CHECK);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
