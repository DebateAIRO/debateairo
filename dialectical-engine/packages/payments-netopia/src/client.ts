// packages/payments-netopia/src/client.ts
import {
  paymentError, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted, type PaymentEnvironment,
  type PaymentReport, type SavedCardCharge
} from "@debateai/billing-core";
import { isNotFoundAnswer, readPaymentAnswer, readStartAnswer } from "./answers.js";
import { isNetopiaPosSignature, netopiaEnvironmentOf } from "./hosts.js";
import { isJsonRecord, parseJsonKeepingNumberText } from "./json.js";
import {
  DEFAULT_REQUEST_FACTS, buildHostedStartBody, buildSavedCardChargeBody, buildStatusBody, type NetopiaRequestFacts
} from "./requests.js";

/*
 * Spec 2026-10-05 §2.3 (the port and its errors), §2.4.1–2.4.3: the NETOPIA client over plain fetch. One request per call, no
 * retry, no redirect followed. Every error is one of N1's payment codes; its detail is an HTTP status, a transport code,
 * `timeout`, `transport`, `redirect`, `json` or `size` — never NETOPIA's text, our request, or the token.
 */
export type NetopiaConfig = Readonly<{ baseUrl: string; apiKey: string; posSignature: string }>;
export type NetopiaDeps = Readonly<{ fetch?: typeof fetch; now?: () => Date }>;

/** Spec §2.4.1: a hosted start 15 s, a saved-card charge 30 s (NETOPIA's own clients), a status read 10 s. */
export const NETOPIA_TIMEOUTS_MS: Readonly<{ start: number; charge: number; status: number }> =
  Object.freeze({ start: 15_000, charge: 30_000, status: 10_000 });

const MAX_ANSWER_CHARS = 1_048_576;
/** The protocol fake and the dev stack (N5, N8, N24): a loopback origin only, read as the sandbox. */
const LOOPBACK_BASE = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/u;
const API_KEY_TEXT = /^[\x21-\x7e]{1,4096}$/u;
const TRANSPORT_CODE = /^[A-Z][A-Z0-9_]{1,31}$/u;
/** Failures that prove nothing reached NETOPIA: no connection was ever made, or the TLS handshake failed. */
const PRE_SEND_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ENETDOWN", "EADDRNOTAVAIL", "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_TLS_HANDSHAKE_TIMEOUT", "EPROTO"
]);
const MAX_CAUSE_LEVELS = 4;

/** Reports a saved-card charge took from a `56` answer (spec §2.4.3); the caller knows whether the send was a first one. */
const REUSED_ORDER_REPORTS: WeakSet<PaymentReport> = new WeakSet();
export function answeredOrderReused(report: PaymentReport): boolean {
  return REUSED_ORDER_REPORTS.has(report);
}
function flagReused(report: PaymentReport): PaymentReport {
  REUSED_ORDER_REPORTS.add(report);
  return report;
}

/** The error, its cause chain and an AggregateError's members (undici wraps the system error in `cause`). */
function errorsOf(error: unknown): ReadonlyArray<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  let current: unknown = error;
  for (let level = 0; level < MAX_CAUSE_LEVELS && typeof current === "object" && current !== null; level += 1) {
    const value = current as Record<string, unknown>;
    found.push(value);
    if (Array.isArray(value.errors)) for (const member of value.errors) if (typeof member === "object" && member !== null) found.push(member as Record<string, unknown>);
    current = value.cause;
  }
  return found;
}

function transportDetail(error: unknown): string {
  for (const value of errorsOf(error)) {
    if (value.name === "TimeoutError" || value.name === "AbortError") return "timeout";
    if (typeof value.code === "string" && TRANSPORT_CODE.test(value.code)) return value.code;
  }
  return "transport";
}

function sentNothing(error: unknown): boolean {
  return errorsOf(error).some((value) => typeof value.code === "string" && PRE_SEND_CODES.has(value.code));
}

function parseQuietly(text: string): unknown {
  try { return parseJsonKeepingNumberText(text); } catch { return undefined; }
}

function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

type Exchange = "WRITE" | "READ";

class NetopiaPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment: PaymentEnvironment;
  readonly #base: string;
  readonly #apiKey: string;
  readonly #posSignature: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #facts: NetopiaRequestFacts;
  readonly #loopbackOrigin: string | null;

  constructor(config: NetopiaConfig, deps: NetopiaDeps, facts: NetopiaRequestFacts) {
    const known = netopiaEnvironmentOf(config.baseUrl);
    const loopback = known === null && typeof config.baseUrl === "string" && LOOPBACK_BASE.test(config.baseUrl);
    if (known === null && !loopback) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "baseUrl");
    if (!isNetopiaPosSignature(config.posSignature)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "posSignature");
    if (typeof config.apiKey !== "string" || !API_KEY_TEXT.test(config.apiKey)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "apiKey");
    this.environment = known ?? "sandbox";
    this.#base = config.baseUrl;
    this.#apiKey = config.apiKey;
    this.#posSignature = config.posSignature;
    this.#fetch = deps.fetch ?? fetch;
    this.#now = deps.now ?? (() => new Date());
    this.#facts = facts;
    this.#loopbackOrigin = loopback ? new URL(config.baseUrl).origin : null;
    Object.freeze(this);
  }

  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    const body = buildHostedStartBody(input, { posSignature: this.#posSignature, now: this.#now() }, this.#facts);
    const answer = await this.#exchange("/payment/card/start", body, "WRITE", NETOPIA_TIMEOUTS_MS.start, false);
    if (answer === "NOT_FOUND") throw paymentError("PAYMENT_RESPONSE_INVALID");
    return readStartAnswer(answer, { sameOriginAllowed: this.#loopbackOrigin });
  }

  async chargeSavedCard(input: SavedCardCharge): Promise<PaymentReport> {
    const body = buildSavedCardChargeBody(input, { posSignature: this.#posSignature, now: this.#now() }, this.#facts);
    const received = await this.#exchange("/payment/card/start", body, "WRITE", NETOPIA_TIMEOUTS_MS.charge, false);
    if (received === "NOT_FOUND") throw paymentError("PAYMENT_RESPONSE_INVALID");
    const answer = readPaymentAnswer(received, { orderId: input.orderId, now: this.#now(), purpose: "CHARGE" });
    if (answer.kind === "REPORT") return answer.orderReused ? flagReused(answer.report) : answer.report;
    if (answer.kind === "NO_SUCH_ORDER") throw paymentError("PAYMENT_RESPONSE_INVALID");
    // 56 without the payment in the answer: the order exists, so its report comes from one status read by orderID. If that
    // read cannot say, the outcome is unknown — never "nothing happened" (spec §2.9.3: a confirmed order is never closed).
    let read: PaymentReport | "NO_SUCH_ORDER";
    try {
      read = await this.status({ orderId: input.orderId, providerPaymentId: null });
    } catch {
      throw paymentError("PAYMENT_OUTCOME_UNKNOWN", "56");
    }
    if (read === "NO_SUCH_ORDER") throw paymentError("PAYMENT_OUTCOME_UNKNOWN", "56");
    return flagReused(read);
  }

  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    const body = buildStatusBody(input, this.#posSignature);
    const received = await this.#exchange("/operation/status", body, "READ", NETOPIA_TIMEOUTS_MS.status, true);
    if (received === "NOT_FOUND") return "NO_SUCH_ORDER";
    const answer = readPaymentAnswer(received, { orderId: input.orderId, now: this.#now(), purpose: "STATUS" });
    if (answer.kind === "REPORT") return answer.report;
    if (answer.kind === "NO_SUCH_ORDER") return "NO_SUCH_ORDER";
    throw paymentError("PAYMENT_RESPONSE_INVALID");
  }

  /** One POST; spec §2.3's error table. A status read's HTTP 400 carrying NETOPIA's not-found answer is NOT_FOUND. */
  async #exchange(path: string, body: string, exchange: Exchange, timeoutMs: number, statusRead: boolean): Promise<Record<string, unknown> | "NOT_FOUND"> {
    const send = this.#fetch;
    const afterSending = (detail: string) => paymentError(exchange === "WRITE" ? "PAYMENT_OUTCOME_UNKNOWN" : "PAYMENT_PROVIDER_UNAVAILABLE", detail);
    let response: Response;
    try {
      response = await send(`${this.#base}${path}`, {
        method: "POST",
        headers: { authorization: this.#apiKey, "content-type": "application/json", accept: "application/json" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw sentNothing(error) ? paymentError("PAYMENT_PROVIDER_UNAVAILABLE", transportDetail(error)) : afterSending(transportDetail(error));
    }
    const status = response.status;
    if (response.type === "opaqueredirect" || status === 0 || (status >= 300 && status < 400)) {
      discard(response);
      throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "redirect");
    }
    if (status === 401 || status === 403) {
      discard(response);
      throw paymentError("PAYMENT_CREDENTIALS_REFUSED", String(status));
    }
    if (status === 429) {
      discard(response);
      throw paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "429");
    }
    if (status === 408 || status >= 500) {
      discard(response);
      throw afterSending(String(status));
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw afterSending("transport");
    }
    if (status >= 400) {
      if (statusRead && status === 400 && isNotFoundAnswer(parseQuietly(text))) return "NOT_FOUND";
      throw paymentError("PAYMENT_CONFIGURATION_REFUSED", String(status));
    }
    if (status !== 200) throw paymentError("PAYMENT_RESPONSE_INVALID", String(status));
    if (text.length > MAX_ANSWER_CHARS) throw paymentError("PAYMENT_RESPONSE_INVALID", "size");
    const json = parseQuietly(text);
    if (!isJsonRecord(json)) throw paymentError("PAYMENT_RESPONSE_INVALID", "json");
    return json;
  }
}

/** The NETOPIA client behind the payment port (spec §2.3). No `refund` until NETOPIA confirms its refund call (N-10). */
export function createNetopiaPayments(config: NetopiaConfig, deps: NetopiaDeps = {}): CardPayments {
  return new NetopiaPayments(config, deps, DEFAULT_REQUEST_FACTS);
}

/** N22's owner-run recording only: the same client with the request facts overridden (N-2 client id, N-24 installments). */
export function createNetopiaPaymentsForRecording(config: NetopiaConfig, deps: NetopiaDeps, facts: NetopiaRequestFacts): CardPayments {
  return new NetopiaPayments(config, deps, facts);
}
