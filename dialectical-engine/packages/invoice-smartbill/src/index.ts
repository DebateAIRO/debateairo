// packages/invoice-smartbill/src/index.ts
import { setTimeout as delay } from "node:timers/promises";
import { TypedDomainError } from "@debateai/kernel";
import {
  microsToDecimal,
  type InvoiceIssuer,
  type IssuedDocument,
  type RefundRecord,
  type SaleRecord
} from "@debateai/billing-core";

// Paid plans (spec 2026-09-29 §2.5.8; X1 facts in docs/architecture/smartbill-api-facts.md; amendment A17).
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MIN_GAP_MS = 1_000;
const CONSUMER_VAT_CODE = "0000000000000";
/** Half a cent in micros × basis points: the widest quoted-tax rounding the gross-price proof allows. */
const HALF_CENT_TIMES_BASIS_POINTS = 5_000 * 10_000;
/**
 * Issuing is `POST /invoice/v2` (X1 row 3, re-checked 1 October 2026 against https://api.smartbill.ro/, "Facturi →
 * Emitere factura"): the reference documents `/invoice` only as DELETE. A partial credit is issued the same way.
 */
const ISSUE_PATH = "/invoice/v2";
const PRE_SEND_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"
]);
type Issued = IssuedDocument;
type Kind = "WRITE" | "READ";

function refused(detail: string): never {
  throw new TypedDomainError("INVOICE_SERVICE_REFUSED", `SMARTBILL_${detail}`);
}

function failedBeforeSending(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && PRE_SEND_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function bucharestDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function clientOf(customer: SaleRecord["customer"]): Record<string, unknown> {
  if (customer.name === null || customer.name.trim() === "") refused("CLIENT_NAME_REQUIRED");
  // R-15: e-Factura refuses a Romanian buyer without a city and a county, so we do before SmartBill does.
  if (customer.city === null || customer.city.trim() === "" || customer.region === null || customer.region.trim() === "") {
    refused("CLIENT_ADDRESS_REQUIRED");
  }
  const taxId = customer.taxId;
  return {
    name: customer.name,
    vatCode: taxId ?? CONSUMER_VAT_CODE,
    isTaxPayer: taxId !== null && /^RO/iu.test(taxId),
    address: customer.street ?? "",
    city: customer.city,
    county: customer.region,
    country: "Romania",
    email: customer.email,
    saveToDb: false
  };
}

/**
 * SmartBill (Romania). Implements the optional `creditPartial` and `pdf`; deliberately has NO `lookup` (X1 row 8),
 * so a call whose outcome is unknown is never repeated (A17b, R-24).
 */
export class SmartBillInvoiceIssuer implements InvoiceIssuer {
  readonly #baseUrl: string;
  readonly #authorization: string;
  readonly #companyCif: string;
  readonly #series: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #minGapMs: number;
  readonly #taxName: string;
  readonly #draft: boolean;
  #tail: Promise<void> = Promise.resolve();
  #lastFinishedAt = 0;

  constructor(o: Readonly<{
    baseUrl: string; username: string; token: string; companyCif: string; series: string;
    fetch?: typeof fetch; timeoutMs?: number; minGapMs?: number; taxName?: string;
    /** Drafts only (`isDraft: true`): P5 Step 9's recording when the accountant allows no real test invoice. */
    draft?: boolean;
  }>) {
    this.#baseUrl = o.baseUrl.replace(/\/+$/u, "");
    this.#authorization = `Basic ${Buffer.from(`${o.username}:${o.token}`, "utf8").toString("base64")}`;
    this.#companyCif = o.companyCif;
    this.#series = o.series;
    this.#fetch = o.fetch ?? fetch;
    this.#timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#minGapMs = o.minGapMs ?? DEFAULT_MIN_GAP_MS;
    this.#taxName = o.taxName ?? "Normala";
    this.#draft = o.draft ?? false;
  }

  /**
   * The line is the charged gross, tax included: with one line at quantity 1 and precision 2, SmartBill derives
   * exactly our net and our tax from it (task text), so the legal invoice equals what the card paid. Outside those
   * two conditions the invoice is refused here and goes to the owner, never to SmartBill's own rounding.
   */
  async issue(i: SaleRecord): Promise<Issued> {
    const line = i.lines[0];
    if (line === undefined || i.lines.length !== 1
      || Math.abs(line.taxMicros * 10_000 - line.netMicros * line.taxRateBasisPoints) > HALF_CENT_TIMES_BASIS_POINTS) {
      refused("TAX_MISMATCH");
    }
    const body = {
      companyVatCode: this.#companyCif,
      client: clientOf(i.customer),
      issueDate: bucharestDate(i.issuedOn),
      seriesName: this.#series,
      isDraft: this.#draft,
      currency: "USD",
      precision: 2,
      mentions: `debateai-charge:${i.chargeId}`,
      products: [{
        name: line.description, code: "DEBATEAI-PLAN", isDiscount: false, measuringUnitName: "buc", currency: "USD",
        quantity: 1, price: Number(microsToDecimal(line.netMicros + line.taxMicros)), isTaxIncluded: true,
        taxName: this.#taxName, taxPercentage: line.taxRateBasisPoints / 100, isService: true, saveToDb: false
      }]
    };
    return this.#document(await this.#json("POST", ISSUE_PATH, body));
  }

  async storno(i: RefundRecord & Readonly<{ series: string; number: string }>): Promise<Issued> {
    return this.#document(await this.#json("POST", "/invoice/reverse", {
      companyVatCode: this.#companyCif, seriesName: i.series, number: i.number, issueDate: bucharestDate(i.issuedOn)
    }));
  }

  async creditPartial(i: RefundRecord & Readonly<{
    series: string; number: string; taxRateBasisPoints: number; customer: SaleRecord["customer"];
  }>): Promise<Issued> {
    return this.#document(await this.#json("POST", ISSUE_PATH, {
      companyVatCode: this.#companyCif,
      client: clientOf(i.customer),
      issueDate: bucharestDate(i.issuedOn),
      seriesName: this.#series,
      isDraft: this.#draft,
      currency: "USD",
      precision: 2,
      mentions: `Storno partial al facturii ${i.series}-${i.number}; debateai-charge:${i.chargeId}`,
      products: [{
        name: `Rambursare partiala ${i.series}-${i.number}`, code: "DEBATEAI-PLAN", isDiscount: false,
        measuringUnitName: "buc", currency: "USD", quantity: -1, price: Number(microsToDecimal(i.refundTotalMicros)), isTaxIncluded: true, taxName: this.#taxName,
        taxPercentage: i.taxRateBasisPoints / 100, isService: true, saveToDb: false
      }]
    }));
  }

  async pdf(i: Readonly<{ series: string; number: string }>): Promise<Uint8Array> {
    const query = new URLSearchParams({ cif: this.#companyCif, seriesname: i.series, number: i.number });
    const bytes = await this.#paced(async () => {
      const response = await this.#fetchOnce("GET", `/invoice/pdf?${query.toString()}`, null, "READ", "application/octet-stream");
      if (response.status === 429 || response.status >= 500) {
        throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "SmartBill could not be reached");
      }
      if (response.status >= 400) refused(`HTTP_${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
    if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") !== "%PDF") refused("PDF_INVALID");
    return bytes;
  }

  #document(reply: Record<string, unknown>): Issued {
    const errorText = reply.errorText;
    if (typeof errorText === "string" && errorText.trim() !== "") refused("REFUSED");
    const number = typeof reply.number === "number" ? String(reply.number) : reply.number;
    const series = typeof reply.series === "string" && reply.series.length > 0 ? reply.series : this.#series;
    if (typeof number !== "string" || number.length === 0) refused("RESPONSE_INVALID");
    return { series, number, externalRef: `${series}-${number}` };
  }

  async #json(method: "POST", path: string, body: unknown): Promise<Record<string, unknown>> {
    return this.#paced(async () => {
      const response = await this.#fetchOnce(method, path, body, "WRITE", "application/json");
      // The status first: it decides whether an invoice may exist before the body is even looked at.
      if (response.status === 429) throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "SmartBill rate limit");
      if (response.status >= 500) throw new TypedDomainError("INVOICE_UNKNOWN", "the SmartBill outcome is unknown");
      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new TypedDomainError("INVOICE_UNKNOWN", "the SmartBill outcome is unknown");
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const reply = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
      if (response.status >= 400) {
        // The body is only a hint here: an HTML 404 from a wrong base URL is a refusal and never loops.
        if (reply !== null && typeof reply.errorText === "string" && reply.errorText.trim() !== "" && response.status !== 401) {
          refused("REFUSED");
        }
        refused(`HTTP_${response.status}`);
      }
      // X1 row 4 is ⚠: a 2xx reply without JSON may still have created an invoice, so it is INVOICE_UNKNOWN
      // (A17b; P10b sends it to the owner's list).
      if (reply === null) throw new TypedDomainError("INVOICE_UNKNOWN", "SmartBill answered without JSON");
      return reply;
    });
  }

  async #fetchOnce(method: "GET" | "POST", path: string, body: unknown, kind: Kind, accept: string): Promise<Response> {
    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          authorization: this.#authorization,
          accept,
          ...(body === null ? {} : { "content-type": "application/json; charset=utf-8" })
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
    } catch (error) {
      if (kind === "WRITE" && !failedBeforeSending(error)) {
        throw new TypedDomainError("INVOICE_UNKNOWN", "the SmartBill outcome is unknown");
      }
      throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "SmartBill could not be reached");
    }
  }

  /** One call in flight, and a gap of minGapMs after each call ends (X1 row 9). */
  #paced<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(async () => {
      const wait = this.#lastFinishedAt + this.#minGapMs - Date.now();
      if (wait > 0) await delay(wait);
      try {
        return await operation();
      } finally {
        this.#lastFinishedAt = Date.now();
      }
    });
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
