// packages/payments-netopia/src/requests.ts
import { paymentError, type HostedPaymentStart, type Payer, type SavedCardCharge } from "@debateai/billing-core";
import { iso2ToNetopiaCountry } from "./countries.js";
import { NETOPIA_FACTS, netopiaLanguageOf } from "./facts.js";
import { isNetopiaPaymentId } from "./hosts.js";
import { microsToNetopiaAmount } from "./money.js";

/*
 * Spec 2026-10-05 §2.4.2: the three requests as exact JSON TEXT in NETOPIA's member order; the amount's digits are written
 * as they are (JsonNumberText). Every refusal happens before a byte is sent and names a FIELD, never its value.
 */
export type NetopiaRequestFacts = Readonly<{ clientIdLocation: "order" | "instrument"; installments: number }>;
export const DEFAULT_REQUEST_FACTS: NetopiaRequestFacts = Object.freeze({
  clientIdLocation: NETOPIA_FACTS.clientIdLocation, installments: NETOPIA_FACTS.installments
});
export type RequestContext = Readonly<{ posSignature: string; now: Date }>;

/** N-3: the indicator of a merchant-initiated payment, on saved-card charges only. */
const SCA_EXEMPTION_MIT = "MIT";
/** Our charge id (32 lower-case hex), or an N22 tool order (`t-` + 30 lower-case hex, 0109's CHECK). */
const ORDER_ID = /^(?:[0-9a-f]{32}|t-[0-9a-f]{30})$/u;
const CLIENT_ID = /^[0-9a-f]{32}$/u;
const E164 = /^\+[0-9]{8,15}$/u;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, "u");
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/u;

class JsonNumberText {
  constructor(readonly text: string) {}
}
type JsonValue = string | number | boolean | null | JsonNumberText | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function writeJson(value: JsonValue): string {
  if (value === null) return "null";
  if (value instanceof JsonNumberText) return value.text;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("NETOPIA_JSON_NUMBER_NOT_INTEGER");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(writeJson).join(",")}]`;
  return `{${Object.entries(value).map(([key, member]) => `${JSON.stringify(key)}:${writeJson(member)}`).join(",")}}`;
}

const filled = (value: string | null): boolean => typeof value === "string" && value.trim() !== "";

function checkCommon(orderId: string, facts: NetopiaRequestFacts): void {
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "orderId");
  if (!Number.isSafeInteger(facts.installments) || facts.installments < 0) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "installments");
}

/** The full payer NETOPIA needs ([SALES]); a missing field is the caller's programming error, named by field. */
function billingOf(payer: Payer): JsonObject {
  for (const field of ["firstName", "lastName", "email", "phone", "city", "street"] as const) {
    if (!filled(payer[field])) throw paymentError("PAYMENT_PAYER_INCOMPLETE", field);
  }
  if (!EMAIL.test(payer.email)) throw paymentError("PAYMENT_PAYER_INCOMPLETE", "email");
  if (!E164.test(payer.phone)) throw paymentError("PAYMENT_PAYER_INCOMPLETE", "phone");
  const country = payer.country.length === 2 ? iso2ToNetopiaCountry(payer.country) : null;
  if (country === null) throw paymentError("PAYMENT_PAYER_INCOMPLETE", "country");
  return {
    email: payer.email, phone: payer.phone, firstName: payer.firstName, lastName: payer.lastName, city: payer.city,
    country: country.numeric, countryName: country.name,
    // NETOPIA requires `state` on every address: the region when there is one, else the city.
    state: payer.region !== null && filled(payer.region) ? payer.region : payer.city,
    postalCode: payer.postalCode ?? "", details: payer.street
  };
}

/** No cancelUrl: NETOPIA's page sends every payer, paid or not, to it when one is set. */
function configOf(input: Readonly<{ notifyUrl: string; returnUrl: string; language: string }>): JsonObject {
  return { emailTemplate: "", notifyUrl: input.notifyUrl, redirectUrl: input.returnUrl, language: netopiaLanguageOf(input.language) };
}

function orderHead(input: Readonly<{ orderId: string; description: string; amountMicros: number; currency: string }>, context: RequestContext): JsonObject {
  if (!filled(input.description)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "description");
  return {
    ntpID: "", posSignature: context.posSignature, dateTime: `${context.now.toISOString().slice(0, 19)}Z`,
    description: input.description, orderID: input.orderId,
    amount: new JsonNumberText(microsToNetopiaAmount(input.amountMicros)), currency: input.currency
  };
}

/** `POST {base}/payment/card/start` for NETOPIA's page: no card data; the client id where the facts say. */
export function buildHostedStartBody(input: HostedPaymentStart, context: RequestContext, facts: NetopiaRequestFacts = DEFAULT_REQUEST_FACTS): string {
  checkCommon(input.orderId, facts);
  if (typeof input.clientId !== "string" || !CLIENT_ID.test(input.clientId)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "clientId");
  const billing = billingOf(input.payer);
  const head = orderHead(input, context);
  const onInstrument = facts.clientIdLocation === "instrument";
  return writeJson({
    config: configOf(input),
    payment: { options: { installments: facts.installments, bonus: 0 }, instrument: onInstrument ? { type: "card", clientID: input.clientId } : { type: "card" } },
    order: { ...head, ...(onInstrument ? {} : { clientID: input.clientId }), billing }
  });
}

/** The same route for a merchant-initiated charge of a saved card: the token, MIT, the payer's IP, no client id. */
export function buildSavedCardChargeBody(input: SavedCardCharge, context: RequestContext, facts: NetopiaRequestFacts = DEFAULT_REQUEST_FACTS): string {
  checkCommon(input.orderId, facts);
  if (!Number.isSafeInteger(input.amountMicros) || input.amountMicros <= 0) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "amount");
  const ip = typeof input.payerIp === "string" ? input.payerIp : "";
  if (!IPV4.test(ip) && !(IPV6.test(ip) && ip.includes(":"))) throw paymentError("PAYMENT_PAYER_INCOMPLETE", "payerIp");
  const billing = billingOf(input.payer);
  const head = orderHead(input, context);
  return writeJson({
    config: configOf(input),
    payment: {
      options: { installments: facts.installments, bonus: 0 },
      instrument: { type: "card", token: input.cardToken.reveal() },   // the one place the plaintext is read (rule 5)
      data: { IP_ADDRESS: ip }
    },
    order: { ...head, scaExemptionInd: SCA_EXEMPTION_MIT, billing }
  });
}

/** `POST {base}/operation/status`: the POS signature as posID, the best ntpID or "", and our order id. */
export function buildStatusBody(input: Readonly<{ orderId: string; providerPaymentId: string | null }>, posSignature: string): string {
  checkCommon(input.orderId, DEFAULT_REQUEST_FACTS);
  if (input.providerPaymentId !== null && !isNetopiaPaymentId(input.providerPaymentId)) throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "ntpID");
  return writeJson({ posID: posSignature, ntpID: input.providerPaymentId ?? "", orderID: input.orderId });
}
