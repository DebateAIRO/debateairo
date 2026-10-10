// packages/tax-quaderno/src/index.ts
import { TypedDomainError } from "@debateai/kernel";
import {
  decimalToMicros,
  microsToDecimal,
  type PriceCurrency,
  type RefundRecord,
  type SaleRecord,
  type TaxEngine,
  type TaxIdCheck,
  type TaxLocation,
  type TaxQuote,
  type TaxStatus
} from "@debateai/billing-core";

// Paid plans (spec 2026-09-29 §2.5.7): Quaderno over plain fetch. Never called from the runner.
const DEFAULT_TIMEOUT_MS = 5_000;
const STATUSES: ReadonlyMap<string, TaxStatus> = new Map([
  ["taxable", "TAXABLE"], ["non_taxable", "NON_TAXABLE"], ["not_registered", "NOT_REGISTERED"], ["reverse_charge", "REVERSE_CHARGE"]
]);
type Retry = "READ" | "RATE_LIMIT_ONLY";

function refused(detail: string): never {
  throw new TypedDomainError("TAX_SERVICE_REFUSED", `QUADERNO_${detail}`);
}

function unavailable(): TypedDomainError {
  return new TypedDomainError("TAX_SERVICE_UNAVAILABLE", "Quaderno could not be reached");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * JSON.parse that keeps every number as its exact SOURCE TEXT (the reviver's `context.source`), so "4.200" and an id
 * above 2^53 reach the parsers as written. A runtime that gives no source text throws instead of rounding the number
 * through a double (the same rule as `parseJsonKeepingNumberText` in packages/payments-netopia); `#send` turns it into
 * RESPONSE_INVALID.
 */
function parseKeepingNumberText(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") throw new TypeError("JSON_NUMBER_SOURCE_UNAVAILABLE");
    return context.source;
  });
}

/** Exact decimal text → micros; a trailing zero past two places is dropped; finer than a cent is refused. */
/** Drops every trailing "/" in one backward pass (CodeQL js/polynomial-redos: `/\/+$/` is quadratic on many "/"). */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

/** Drops every trailing "0" in one backward pass (CodeQL js/polynomial-redos: `/0+$/` is quadratic on many "0"). */
function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits.charCodeAt(end - 1) === 48) end -= 1;
  return digits.slice(0, end);
}

export function quadernoAmountMicros(text: unknown): number {
  if (typeof text !== "string") refused("AMOUNT_INVALID");
  const match = /^(-?[0-9]+)(?:\.([0-9]+))?$/u.exec(text);
  if (match === null) refused("AMOUNT_INVALID");
  const fraction = trimTrailingZeros(match[2] ?? "");
  if (fraction.length > 2) refused("AMOUNT_NOT_CENTS");
  try {
    return decimalToMicros(fraction.length === 0 ? match[1]! : `${match[1]!}.${fraction}`);
  } catch {
    return refused("AMOUNT_INVALID");
  }
}

/** A percent ("21.0", "8.875") → basis points (2100, 887.5). */
export function quadernoRateBasisPoints(text: unknown): number {
  if (typeof text !== "string") refused("RATE_INVALID");
  const match = /^([0-9]{1,3})(?:\.([0-9]{1,4}))?$/u.exec(text);
  if (match === null) refused("RATE_INVALID");
  const hundredthsOfBasisPoint = Number(match[1]) * 10_000 + Number((match[2] ?? "").padEnd(4, "0"));
  if (hundredthsOfBasisPoint > 1_000_000) refused("RATE_INVALID");
  return hundredthsOfBasisPoint / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A listed document is ours only when it names this transaction AND this charge (R-24: never adopt a stranger's). */
function isDocumentOf(value: unknown, transactionId: string, chargeId: string): boolean {
  return isRecord(value) && String(value.processor_id) === transactionId
    && isRecord(value.custom_metadata) && value.custom_metadata.charge_id === chargeId;
}

/**
 * The document of this charge in a lookup's answer, or undefined when there is none. An answer that is not a list is
 * refused: posting after it could book a second legal document for a sale Quaderno already holds (R-24).
 */
function findDocument(listing: unknown, transactionId: string, chargeId: string): unknown {
  if (!Array.isArray(listing)) refused("RESPONSE_INVALID");
  return listing.find((document) => isDocumentOf(document, transactionId, chargeId));
}

function documentOf(value: unknown): { documentId: string; number: string; url: string | null } {
  if (!isRecord(value)) refused("RESPONSE_INVALID");
  const documentId = text(value.id);
  const number = text(value.number);
  if (documentId === null || number === null) refused("RESPONSE_INVALID");
  const link = text(value.permalink) ?? text(value.pdf);
  return { documentId, number, url: link !== null && link.startsWith("https://") ? link : null };
}

export class QuadernoTaxEngine implements TaxEngine {
  readonly #baseUrl: string;
  readonly #authorization: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #now: () => Date;

  constructor(o: Readonly<{ baseUrl: string; apiKey: string; fetch?: typeof fetch; timeoutMs?: number; now?: () => Date }>) {
    this.#baseUrl = trimTrailingSlashes(o.baseUrl);
    this.#authorization = `Basic ${Buffer.from(`${o.apiKey}:`, "utf8").toString("base64")}`;
    this.#fetch = o.fetch ?? fetch;
    this.#timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = o.now ?? (() => new Date());
  }

  async quote(i: Readonly<{
    netMicros: number; currency: PriceCurrency; location: TaxLocation; taxId: string | null; taxCode: "saas" | "eservice"; date: Date;
  }>): Promise<TaxQuote> {
    const query = new URLSearchParams({
      to_country: i.location.country, amount: microsToDecimal(i.netMicros), currency: i.currency,
      tax_code: i.taxCode, tax_behavior: "exclusive", date: isoDate(i.date)
    });
    if (i.location.postalCode !== null) query.set("to_postal_code", i.location.postalCode);
    if (i.location.city !== null) query.set("to_city", i.location.city);
    if (i.location.street !== null) query.set("to_street", i.location.street);
    if (i.taxId !== null) query.set("tax_id", i.taxId);
    const reply = await this.#send("GET", `/tax_rates/calculate?${query.toString()}`, null, "READ");
    if (!isRecord(reply)) refused("RESPONSE_INVALID");
    const status = STATUSES.get(String(reply.status));
    if (status === undefined) refused("STATUS_UNKNOWN");
    const netMicros = quadernoAmountMicros(reply.subtotal);
    const taxMicros = quadernoAmountMicros(reply.tax_amount);
    const totalMicros = quadernoAmountMicros(reply.total_amount);
    if (netMicros !== i.netMicros) refused("SUBTOTAL_MISMATCH");
    if (taxMicros < 0 || totalMicros !== netMicros + taxMicros) refused("TOTAL_MISMATCH");
    // Spec 2026-10-05 §2.16.4: the tax is priced in the currency we asked for, or the quote is not ours to charge.
    if (reply.currency !== undefined && reply.currency !== null && reply.currency !== i.currency) refused("CURRENCY_MISMATCH");
    const country = text(reply.country);
    if (country === null || !/^[A-Za-z]{2}$/u.test(country)) refused("COUNTRY_INVALID");
    return Object.freeze({
      netMicros, taxMicros, totalMicros,
      taxRateBasisPoints: quadernoRateBasisPoints(reply.rate ?? "0"),
      taxName: text(reply.name) ?? "Tax",
      taxCountry: country.toUpperCase(),
      taxRegion: text(reply.region),
      status,
      reference: null
    });
  }

  async validateTaxId(country: string, taxId: string): Promise<TaxIdCheck> {
    const query = new URLSearchParams({ country, tax_id: taxId });
    const reply = await this.#send("GET", `/tax_ids/validate?${query.toString()}`, null, "READ");
    if (!isRecord(reply) || typeof reply.valid !== "boolean") refused("RESPONSE_INVALID");
    return Object.freeze({ valid: reply.valid, name: text(reply.name), checkedAt: this.#now(), reference: null });
  }

  async recordSale(i: SaleRecord): Promise<{ documentId: string; number: string; url: string | null }> {
    const processor = i.processor;
    const found = await this.#send("GET", `/invoices?${new URLSearchParams({ processor_id: i.transactionId }).toString()}`, null, "READ");
    const mine = findDocument(found, i.transactionId, i.chargeId);
    if (mine !== undefined) return documentOf(mine);
    const customer = i.customer;
    const created = await this.#send("POST", "/transactions", {
      type: "sale",
      currency: "USD",
      date: isoDate(i.issuedOn),
      customer: {
        // No invented name: a buyer who gave none is sent without one (P8 collects it where the law needs it).
        ...(customer.name === null ? {} : { first_name: customer.name }),
        email: customer.email,
        country: customer.country,
        ...(customer.region === null ? {} : { region: customer.region }),
        ...(customer.postalCode === null ? {} : { postal_code: customer.postalCode }),
        ...(customer.city === null ? {} : { city: customer.city }),
        ...(customer.street === null ? {} : { street_line_1: customer.street }),
        ...(customer.taxId === null ? {} : { tax_id: customer.taxId }),
        kind: customer.taxId === null ? "person" : "company"
      },
      items: i.lines.map((line) => ({
        description: line.description,
        quantity: 1,
        amount: Number(microsToDecimal(line.netMicros + line.taxMicros)),
        tax: {
          country: customer.country,
          ...(customer.region === null ? {} : { region: customer.region }),
          rate: line.taxRateBasisPoints / 100,
          tax_code: i.taxCode
        }
      })),
      payment: { method: "credit_card", processor, processor_id: i.transactionId },
      evidence: {
        billing_country: i.evidence.billingCountry,
        ip_address: i.evidence.ipAddress,
        bank_country: i.evidence.bankCountry
      },
      processor,
      processor_id: i.transactionId,
      custom_metadata: { charge_id: i.chargeId }
    }, "RATE_LIMIT_ONLY");
    return documentOf(created);
  }

  async recordRefund(i: RefundRecord): Promise<{ documentId: string; number: string }> {
    const processor = i.processor;
    const found = await this.#send("GET", `/credits?${new URLSearchParams({ processor_id: i.transactionId }).toString()}`, null, "READ");
    const mine = findDocument(found, i.transactionId, i.chargeId);
    if (mine !== undefined) {
      const document = documentOf(mine);
      return { documentId: document.documentId, number: document.number };
    }
    const created = await this.#send("POST", "/transactions", {
      type: "refund",
      currency: "USD",
      date: isoDate(i.issuedOn),
      // The line's text is the caller's, in the customer's language (P10a, from the catalogue) — never ours.
      items: [{ description: i.description, quantity: 1, amount: Number(microsToDecimal(i.refundTotalMicros)) }],
      payment: { method: "credit_card", processor, processor_id: i.transactionId },
      processor,
      processor_id: i.transactionId,
      custom_metadata: { charge_id: i.chargeId, original_document_id: i.original.documentId }
    }, "RATE_LIMIT_ONLY");
    const document = documentOf(created);
    return { documentId: document.documentId, number: document.number };
  }

  async #send(method: "GET" | "POST", path: string, body: unknown, retry: Retry): Promise<unknown> {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      let reply: string;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method,
          headers: {
            authorization: this.#authorization,
            accept: "application/json",
            ...(body === null ? {} : { "content-type": "application/json" })
          },
          ...(body === null ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(this.#timeoutMs)
        });
        reply = await response.text();
      } catch {
        if (retry === "READ" && attempt === 1) continue;
        throw unavailable();
      }
      if (response.status === 429 || response.status >= 500) {
        const retryable = response.status === 429 || retry === "READ";
        if (retryable && attempt === 1) continue;
        throw unavailable();
      }
      if (response.status >= 400) refused(`HTTP_${response.status}`);
      try {
        return parseKeepingNumberText(reply);
      } catch {
        return refused("RESPONSE_INVALID");
      }
    }
  }
}
