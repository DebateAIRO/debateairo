// packages/payments-xmoney/src/client.ts
import { TypedDomainError } from "@debateai/kernel";
import { parseJsonKeepingNumberText } from "./json.js";
import { XMONEY_STATUSES, type XMoneyStatus, type XMoneyTransaction } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAGES = 1_000;
const DIGITS = /^[0-9]{1,20}$/u;
const EXTERNAL_ORDER = /^[A-Za-z0-9_.-]{1,32}$/u;
const DECIMAL = /^[0-9]+(?:\.[0-9]+)?$/u;
/** Failures that prove nothing reached xMoney (connection refused, DNS, connect timeout). */
const PRE_SEND_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"
]);

export class XMoneyPaymentFailedError extends TypedDomainError {
  constructor(readonly transactionId: string | null, readonly xmoneyErrorCode: string | null) {
    super("XMONEY_PAYMENT_FAILED", xmoneyErrorCode === null ? "XMONEY_PAYMENT_FAILED" : `XMONEY_PAYMENT_FAILED:${xmoneyErrorCode}`);
    this.name = "XMoneyPaymentFailedError";
  }
}

export type XMoneyTransactionListQuery = Readonly<{
  from: Date;
  to: Date;
  dateType?: "creation" | "approval" | "refund" | "cancellation" | "charge-back";
  orderId?: string;
  transactionType?: "deposit" | "refund" | "credit" | "chargeback" | "representment";
  /**
   * Called once per listed row the parser refuses (its id when it has a readable one, else null); the row is skipped
   * and the listing goes on, so one odd row never costs the reconciler or the A2 adoption check the whole list.
   */
  onRejected?: (transactionId: string | null) => void;
}>;

/** One refund xMoney lists against a payment: its own transaction, its amount as written, and when it happened. */
export type XMoneyRefundRow = Readonly<{ transactionId: string; amountDecimal: string; createdAt: Date | null }>;
/** What the refund listing says was refunded from one payment (X0 (g)); `refundedDecimal` is the exact sum. */
export type XMoneyRefundsSeen = Readonly<{ refundedDecimal: string; rows: ReadonlyArray<XMoneyRefundRow> }>;

const WHOLE_CENTS = /^([0-9]+)(?:\.([0-9]{1,2}))?$/u;

function invalidResponse(): never {
  throw new TypedDomainError("XMONEY_RESPONSE_INVALID", "xMoney answered with an unexpected shape");
}

/** "12.10" → 1210. Integer cents, so a sum of refunds is exact; more than two decimals is not money xMoney moves. */
function centsOf(decimal: string): number {
  const match = WHOLE_CENTS.exec(decimal);
  if (match === null) return invalidResponse();
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : invalidResponse();
}

function decimalOfCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || !DIGITS.test(value)) invalidResponse();
  return value;
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && DIGITS.test(value) ? value : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dataOf(json: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!isRecord(json.data)) invalidResponse();
  return json.data;
}

function firstErrorCode(json: Readonly<Record<string, unknown>>): string | null {
  const errors = json.error;
  if (!Array.isArray(errors) || !isRecord(errors[0])) return null;
  const code = errors[0].code;
  return typeof code === "string" && /^[0-9]{1,10}$/u.test(code) ? code : null;
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

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "+00:00");
}

function relatedIds(value: unknown): ReadonlyArray<string> {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) invalidResponse();
  return Object.freeze(value.map(requiredId));
}

export function parseXMoneyTransaction(value: unknown): XMoneyTransaction {
  if (!isRecord(value)) invalidResponse();
  const status = value.transactionStatus;
  if (typeof status !== "string" || !(XMONEY_STATUSES as ReadonlyArray<string>).includes(status)) invalidResponse();
  const amount = value.amount;
  if (typeof amount !== "string" || !DECIMAL.test(amount)) invalidResponse();
  const currency = value.currency;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/u.test(currency)) invalidResponse();
  const external = value.externalOrderId;
  const created = typeof value.creationDate === "string" ? new Date(value.creationDate) : null;
  return Object.freeze({
    transactionId: requiredId(value.id),
    orderId: requiredId(value.orderId),
    externalOrderId: typeof external === "string" && EXTERNAL_ORDER.test(external) ? external : null,
    customerId: requiredId(value.customerId),
    cardId: optionalId(value.cardId),
    status: status as XMoneyStatus,
    amountDecimal: amount,
    currency,
    ip: optionalText(value.ip),
    transactionSource: optionalText(value.transactionSource),
    transactionType: optionalText(value.transactionType),
    createdAt: created !== null && Number.isFinite(created.getTime()) ? created : null,
    relatedTransactionIds: relatedIds(value.relatedTransactionIds)
  });
}

type Outcome = "READ" | "WRITE";

/** Drops every trailing "/" in one backward pass (CodeQL js/polynomial-redos: `/\/+$/` is quadratic on many "/"). */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

export class XMoneyClient {
  readonly #baseUrl: string;
  readonly #privateKey: Buffer;
  readonly #siteId: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(o: Readonly<{ baseUrl: string; privateKey: Buffer; siteId: string; fetch?: typeof fetch; timeoutMs?: number }>) {
    this.#baseUrl = trimTrailingSlashes(o.baseUrl);
    this.#privateKey = o.privateKey;
    this.#siteId = o.siteId;
    this.#fetch = o.fetch ?? fetch;
    this.#timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Idempotent per identifier. After any failure of the POST that may have left the customer created (a refusal of
   * any 4xx — xMoney's duplicate answer is not recorded — an unknown outcome, an unreadable 2xx), the customer is
   * looked up by identifier and adopted only when a listed row carries exactly that identifier. Only
   * XMONEY_UNAVAILABLE and XMONEY_CREDENTIALS_REFUSED skip the lookup: they prove nothing was processed. When the
   * lookup fails or lists no exact match, the POST's own error is thrown, unchanged.
   */
  async createCustomer(i: Readonly<{ identifier: string; email: string; country: string | null }>): Promise<{ customerId: string }> {
    const body = new URLSearchParams({ identifier: i.identifier, email: i.email, siteId: this.#siteId });
    if (i.country !== null) body.set("country", i.country);
    try {
      return { customerId: requiredId(dataOf(await this.#call("POST", "/customer", body, "WRITE")).id) };
    } catch (error) {
      const mayExist = error instanceof TypedDomainError
        && error.code !== "XMONEY_UNAVAILABLE" && error.code !== "XMONEY_CREDENTIALS_REFUSED";
      if (!mayExist) throw error;
      try {
        const query = new URLSearchParams({ identifier: i.identifier });
        const found = (await this.#call("GET", `/customer?${query.toString()}`, null, "READ")).data;
        const match = Array.isArray(found) ? found.find((row) => isRecord(row) && row.identifier === i.identifier) : undefined;
        if (isRecord(match)) return { customerId: requiredId(match.id) };
      } catch {
        // The lookup proves nothing either way; the POST's own failure is the answer.
      }
      throw error;
    }
  }

  async getTransaction(transactionId: string): Promise<XMoneyTransaction> {
    return parseXMoneyTransaction(dataOf(await this.#call("GET", `/transaction/${encodeURIComponent(transactionId)}`, null, "READ")));
  }

  /** A1: our charge id lives on the ORDER (externalOrderId), not on a transaction. */
  async getOrder(orderId: string): Promise<{ orderId: string; externalOrderId: string | null }> {
    const data = dataOf(await this.#call("GET", `/order/${encodeURIComponent(orderId)}`, null, "READ"));
    const external = data.externalOrderId;
    return {
      orderId: requiredId(data.id),
      externalOrderId: typeof external === "string" && EXTERNAL_ORDER.test(external) ? external : null
    };
  }

  async getCard(cardId: string, customerId: string): Promise<{ cardId: string; countryCode: string | null }> {
    const query = new URLSearchParams({ customerId });
    const data = dataOf(await this.#call("GET", `/card/${encodeURIComponent(cardId)}?${query.toString()}`, null, "READ"));
    const bin = isRecord(data.binInfo) ? data.binInfo : {};
    const country = bin.countryCode;
    return {
      cardId: requiredId(data.id),
      countryCode: typeof country === "string" && /^[A-Za-z]{2}$/u.test(country) ? country.toUpperCase() : null
    };
  }

  async rebill(i: Readonly<{ orderId: string; customerId: string; amountDecimal: string }>): Promise<{ transactionId: string; orderId: string }> {
    const body = new URLSearchParams({ customerId: i.customerId, amount: i.amountDecimal });
    const data = dataOf(await this.#call("PATCH", `/order-rebill/${encodeURIComponent(i.orderId)}`, body, "WRITE"));
    return { transactionId: requiredId(data.transactionId), orderId: requiredId(data.id) };
  }

  /** A refund, or — on an uncaptured `auth` hold — its release (A12). */
  async refund(i: Readonly<{
    transactionId: string; amountDecimal: string | null; reason: "customer-demand" | "fraud-confirm"; message: string;
  }>): Promise<void> {
    const body = new URLSearchParams({ reason: i.reason, message: i.message });
    if (i.amountDecimal !== null) body.set("amount", i.amountDecimal);
    await this.#call("DELETE", `/transaction/${encodeURIComponent(i.transactionId)}`, body, "WRITE");
  }

  async listTransactions(i: XMoneyTransactionListQuery): Promise<ReadonlyArray<XMoneyTransaction>> {
    const found: XMoneyTransaction[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        createdAtFrom: iso(i.from), createdAtTo: iso(i.to), page: String(page), perPage: "100", reverseSorting: "0"
      });
      if (i.dateType !== undefined) query.set("dateType", i.dateType);
      if (i.orderId !== undefined) query.set("orderId", i.orderId);
      if (i.transactionType !== undefined) query.set("transactionType", i.transactionType);
      const json = await this.#call("GET", `/transaction?${query.toString()}`, null, "READ");
      const data = Array.isArray(json.data) ? json.data : invalidResponse();
      for (const row of data) {
        try {
          found.push(parseXMoneyTransaction(row));
        } catch (error) {
          if (!(error instanceof TypedDomainError && error.code === "XMONEY_RESPONSE_INVALID")) throw error;
          i.onRejected?.(isRecord(row) ? optionalId(row.id) : null);
        }
      }
      const pagination = isRecord(json.pagination) ? json.pagination : {};
      const pageCount = typeof pagination.pageCount === "string" ? Number(pagination.pageCount) : 1;
      if (data.length === 0 || page >= pageCount) return Object.freeze(found);
    }
    return invalidResponse();
  }

  /**
   * X0 (g), A4 (c): the refunds xMoney LISTS against one paid transaction — the `dateType=refund` listing of its
   * order (`from`/`to` bound the refund date), rows of type `refund` whose relatedTransactionIds name the payment (the
   * payment listed again under its refund date is not one of its own refunds; a row listed twice counts once),
   * summed exactly in cents. `null` when no such row is listed: xMoney then said nothing, which is UNKNOWN, never
   * "nothing refunded", so a caller that must not refund twice stays fail-closed. `null` too when the listing holds
   * ANY row the parser refuses (the caller's `onRejected` still hears each one): that row may be one of this
   * payment's refunds, so the listing is UNKNOWN, never a smaller sum. Rows in two currencies are refused
   * (XMONEY_RESPONSE_INVALID), never summed. The recorded suite fails if xMoney's listing reads differently from the
   * fake's, so a caller relies on what X0 recorded, not on a guess.
   */
  async refundsOf(i: Readonly<{
    transactionId: string; orderId: string; from: Date; to: Date; onRejected?: (transactionId: string | null) => void;
  }>): Promise<XMoneyRefundsSeen | null> {
    let unreadable = false;
    const listed = await this.listTransactions({
      from: i.from, to: i.to, dateType: "refund", orderId: i.orderId,
      onRejected: (transactionId) => {
        unreadable = true;
        i.onRejected?.(transactionId);
      }
    });
    if (unreadable) return null;
    const byId = new Map<string, XMoneyTransaction>();
    for (const transaction of listed) {
      if (transaction.transactionType === "refund" && transaction.transactionId !== i.transactionId
        && transaction.relatedTransactionIds.includes(i.transactionId)) {
        byId.set(transaction.transactionId, transaction);
      }
    }
    const rows = [...byId.values()];
    if (rows.length === 0) return null;
    if (new Set(rows.map((row) => row.currency)).size !== 1) return invalidResponse();
    const refundedCents = rows.reduce((sum, row) => sum + centsOf(row.amountDecimal), 0);
    return Object.freeze({
      refundedDecimal: decimalOfCents(refundedCents),
      rows: Object.freeze(rows.map((row) => Object.freeze({
        transactionId: row.transactionId, amountDecimal: row.amountDecimal, createdAt: row.createdAt
      })))
    });
  }

  async #call(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body: URLSearchParams | null,
    outcome: Outcome
  ): Promise<Readonly<Record<string, unknown>>> {
    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.#privateKey.toString("latin1")}`,
          accept: "application/json",
          ...(body === null ? {} : { "content-type": "application/x-www-form-urlencoded" })
        },
        ...(body === null ? {} : { body: body.toString() }),
        signal: AbortSignal.timeout(this.#timeoutMs)
      });
      text = await response.text();
    } catch (error) {
      throw this.#transportFailure(outcome, failedBeforeSending(error));
    }
    // Statuses that say nothing about the customer's card come first: a rate limit (nothing processed), a request
    // timeout (a write may have gone through) and a refused key (our problem) are never a decline.
    if (response.status === 429) throw new TypedDomainError("XMONEY_UNAVAILABLE", "xMoney rate-limited the call");
    if (response.status === 408) throw this.#transportFailure(outcome, false);
    if (response.status === 401 || response.status === 403) {
      throw new TypedDomainError("XMONEY_CREDENTIALS_REFUSED", `XMONEY_CREDENTIALS_REFUSED:${response.status}`);
    }
    if (response.status >= 500) throw this.#transportFailure(outcome, false);
    // A refund or a release may answer 2xx with no body at all (X0 (g) records which).
    if (method === "DELETE" && response.status < 300 && text.trim() === "") return {};
    let json: unknown;
    try {
      json = parseJsonKeepingNumberText(text);
    } catch {
      return invalidResponse();
    }
    if (!isRecord(json)) return invalidResponse();
    if (response.status === 402) {
      throw new XMoneyPaymentFailedError(optionalId(isRecord(json.data) ? json.data.transactionId : undefined), firstErrorCode(json));
    }
    if (response.status >= 400) {
      throw new TypedDomainError("XMONEY_REFUSED", `XMONEY_REFUSED:${response.status}:${firstErrorCode(json) ?? "NONE"}`);
    }
    return json;
  }

  #transportFailure(outcome: Outcome, beforeSending: boolean): TypedDomainError {
    return outcome === "WRITE" && !beforeSending
      ? new TypedDomainError("XMONEY_OUTCOME_UNKNOWN", "the xMoney call may have been processed")
      : new TypedDomainError("XMONEY_UNAVAILABLE", "xMoney could not be reached");
  }
}
