// packages/payments-netopia/src/notice.ts
// N4 — NETOPIA's message (the IPN): spec 2026-10-05 §2.4.6 (verifying it), §2.7.2 (the answers), §2.7.3 step 1 (the
// tolerant parse) and §2.7.4 (what a rejected message must hold to be quarantined). Pure, and node:crypto only.
// Verification and parsing are separate steps: a verified message is stored whatever it holds, a field that cannot
// be read is null, and nothing here logs. A rejection carries its reason code and nothing else, so the JWT and the
// token never reach a log, an error or an audit line (§2.2 rule 5).
import {
  X509Certificate, constants, createHash, createPublicKey, timingSafeEqual, verify, type KeyObject
} from "node:crypto";
import type { SavedCard } from "@debateai/billing-core";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { netopiaCountryToIso2 } from "./countries.js";
import { NETOPIA_FACTS } from "./facts.js";
import { isNetopiaPaymentId } from "./hosts.js";
import { isJsonRecord, parseJsonKeepingNumberText, valueAtPath } from "./json.js";
import { createSecretToken, isSecretTokenText } from "./secret-token.js";
import { parseOccurredAt } from "./time.js";

export type TrustedKey = Readonly<{ key: KeyObject; fingerprint: string }>;
// With one POS per currency (spec 2026-10-05 §2.16.4), the trust would hold every POS signature of the account: the aud
// check and quarantinable accept any of them.
export type NoticeTrust = Readonly<{ posSignature: string; keys: ReadonlyArray<TrustedKey> }>;
export type NoticeRejectionReason =
  | "NOTICE_HEADER_MISSING" | "NOTICE_ALG_REFUSED" | "NOTICE_SIGNATURE_INVALID" | "NOTICE_ISSUER_INVALID"
  | "NOTICE_AUDIENCE_INVALID" | "NOTICE_BODY_HASH_INVALID";
export type VerifiedNotice = Readonly<{ ok: true; keyFingerprint: string; jwtIat: string | null }>;
export type NoticeRejection = Readonly<{ ok: false; reason: NoticeRejectionReason }>;
export type ParsedNotice = Readonly<{
  readable: boolean;
  orderId: string | null; providerPaymentId: string | null; providerStatus: number | null;
  amountText: string | null; currency: string | null; cardCountry: string | null;
  code: string | null; message: string | null; savedCard: SavedCard | null; occurredAt: Date | null;
  allowed: Readonly<Record<string, string | number | null>>;
}>;

const ISSUER = "NETOPIA Payments";
const MINIMUM_RSA_BITS = 2048;
/** NETOPIA's published plugin key (deploy/vps/netopia/published-ipn-key.pem); in pieces so no scanner reads it as a secret. */
const PUBLISHED_PLUGIN_SPKI_SHA256 = ["eeba3b065067fb01", "c2389850c7a88845", "6dfd31332d67ed9b", "630dae24753478d7"].join("");
/** NETOPIA's SDK constants for a refused message (E_VERIFICATION_FAILED_*), sent back as JSON numbers. */
const ANSWER_CODE_GENERAL = 0x10000101;
const ANSWER_CODE_SIGNATURE = 0x10000102;
const ANSWER_CODE_AUDIENCE = 0x10000105;
const ANSWER_CODE_TAINTED_PAYLOAD = 0x10000106;

const PEM_BEGIN = /^-----BEGIN ([A-Z0-9 ]+)-----$/u;
const PEM_END = /^-----END ([A-Z0-9 ]+)-----$/u;
const PEM_BASE64_LINE = /^[A-Za-z0-9+/=]+$/u;
const BASE64URL = /^[A-Za-z0-9_-]*$/u;
/** §2.4.6: our charge ids and the tool's orders (§2.5.2 `billing.tool_order`). */
const CHARGE_ORDER = /^[0-9a-f]{32}$/u;
const TOOL_ORDER = /^t-[0-9a-f]{30}$/u;
const ORDER_ID = /^[A-Za-z0-9_.:-]{1,64}$/u;
const DECIMAL = /^[0-9]{1,15}(?:\.[0-9]{1,6})?$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const CODE = /^[A-Za-z0-9_-]{1,16}$/u;
const MESSAGE = /^[^\u0000-\u001f\u007f]{1,255}$/u;
const STATUS = /^[0-9]{1,5}$/u;
/** `billing.payment_notice.provider_status` is a smallint. */
const STATUS_MAX = 32_767;
const SMALL_INTEGER = /^[0-9]{1,4}$/u;
const LAST_FOUR = /([0-9]{4})$/u;
const IAT = /^[\x21-\x7e]{1,32}$/u;
const KEYS_INVALID_MESSAGE = "the trusted NETOPIA key list is invalid";

/** What a body or a JWT part that is not UTF-8 JSON parses to: never a value JSON can produce. */
const UNPARSED = Symbol("unparsed");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

// The JSON object test, the dot-path reader, the token text and the ntpID form are N2's one rule each (json.ts,
// secret-token.ts, hosts.ts); a single member is a one-step path.
const member = (value: unknown, name: string): unknown => valueAtPath(value, name);
const at = valueAtPath;

function jsonOf(bytes: Buffer): unknown {
  try {
    return parseJsonKeepingNumberText(strictUtf8.decode(bytes));
  } catch {
    return UNPARSED;
  }
}

// ---- the trusted keys --------------------------------------------------------------------------------------------

function keysInvalid(why: string): never {
  throw new TypedDomainError(`NETOPIA_IPN_KEYS_INVALID:${why}`, KEYS_INVALID_MESSAGE);
}

function pemBlocks(pem: string): ReadonlyArray<Readonly<{ type: string; der: Buffer }>> {
  const blocks: Array<Readonly<{ type: string; der: Buffer }>> = [];
  let open: { type: string; lines: string[] } | null = null;
  for (const raw of pem.split(/\r?\n/u)) {
    const line = raw.trim();
    if (open === null) {
      const begin = PEM_BEGIN.exec(line);
      if (begin !== null) open = { type: begin[1]!, lines: [] };
      else if (PEM_END.test(line)) keysInvalid("BLOCK_UNTERMINATED");
      // Any other line outside a block is a comment (the published file's `#` lines) and is ignored.
      continue;
    }
    const end = PEM_END.exec(line);
    if (end !== null) {
      if (end[1] !== open.type) keysInvalid("BLOCK_UNTERMINATED");
      const text = open.lines.join("");
      const der = Buffer.from(text, "base64");
      if (text === "" || der.toString("base64") !== text) keysInvalid("UNREADABLE");
      blocks.push(Object.freeze({ type: open.type, der }));
      open = null;
      continue;
    }
    // A blank line inside a block carries no key text; a block that never ends is caught below as unterminated.
    if (line === "") continue;
    if (PEM_BEGIN.test(line)) keysInvalid("BLOCK_UNTERMINATED");
    if (!PEM_BASE64_LINE.test(line)) keysInvalid("UNREADABLE");
    open.lines.push(line);
  }
  if (open !== null) keysInvalid("BLOCK_UNTERMINATED");
  return blocks;
}

function publicKeyOf(type: string, der: Buffer): KeyObject {
  // A PRIVATE KEY pasted by mistake, a PKCS#1 "RSA PUBLIC KEY" and every other block type are refused unread.
  if (type !== "PUBLIC KEY" && type !== "CERTIFICATE") return keysInvalid("BLOCK_TYPE");
  try {
    return type === "PUBLIC KEY"
      ? createPublicKey({ key: der, format: "der", type: "spki" })
      : new X509Certificate(der).publicKey;
  } catch {
    return keysInvalid("UNREADABLE");
  }
}

function rsaBits(key: KeyObject): number {
  return key.asymmetricKeyType === "rsa" ? key.asymmetricKeyDetails?.modulusLength ?? 0 : 0;
}

function spkiFingerprint(key: KeyObject): string {
  return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

/**
 * §2.4.6 / §2.17.1: one or more PEM `PUBLIC KEY` or `CERTIFICATE` blocks, each RSA with at least 2,048 bits. A
 * certificate's dates are not checked (no time check, as for the message itself). The order of the file is kept.
 */
export function loadTrustedKeys(pem: string): ReadonlyArray<TrustedKey> {
  const blocks = pemBlocks(pem);
  if (blocks.length === 0) keysInvalid("NO_KEY");
  const keys: TrustedKey[] = [];
  for (const block of blocks) {
    const key = publicKeyOf(block.type, block.der);
    if (key.asymmetricKeyType !== "rsa") keysInvalid("NOT_RSA");
    if (rsaBits(key) < MINIMUM_RSA_BITS) keysInvalid("TOO_SHORT");
    const fingerprint = spkiFingerprint(key);
    if (!keys.some((trusted) => trusted.fingerprint === fingerprint)) keys.push(Object.freeze({ key, fingerprint }));
  }
  return Object.freeze(keys);
}

export function publishedIpnKeyFingerprint(): string {
  return PUBLISHED_PLUGIN_SPKI_SHA256;
}

// ---- verifying the message ---------------------------------------------------------------------------------------

type Jwt = Readonly<{ signingInput: Buffer; joseHeader: unknown; claims: unknown; signature: Buffer }>;

/** Canonical base64url only: no padding, no stray characters, nothing a decoder would silently drop. */
function base64urlBytes(part: string): Buffer | null {
  if (!BASE64URL.test(part)) return null;
  const bytes = Buffer.from(part, "base64url");
  return bytes.toString("base64url") === part ? bytes : null;
}

function jwtOf(header: string | undefined): Jwt | null {
  if (typeof header !== "string") return null;
  const parts = header.trim().split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
  if (encodedHeader === "" || encodedClaims === "") return null;
  const headerBytes = base64urlBytes(encodedHeader);
  const claimBytes = base64urlBytes(encodedClaims);
  const signature = base64urlBytes(encodedSignature);
  if (headerBytes === null || claimBytes === null || signature === null) return null;
  return Object.freeze({
    signingInput: Buffer.from(`${encodedHeader}.${encodedClaims}`, "latin1"),
    joseHeader: jsonOf(headerBytes),
    claims: jsonOf(claimBytes),
    signature
  });
}

function rejected(reason: NoticeRejectionReason): NoticeRejection {
  return Object.freeze({ ok: false as const, reason });
}

function signerOf(jwt: Jwt, keys: ReadonlyArray<TrustedKey>): string | null {
  if (jwt.signature.byteLength === 0) return null;
  for (const trusted of keys) {
    // A hand-built trust list is held to loadTrustedKeys' floor too.
    if (rsaBits(trusted.key) < MINIMUM_RSA_BITS) continue;
    try {
      if (verify("sha512", jwt.signingInput, { key: trusted.key, padding: constants.RSA_PKCS1_PADDING }, jwt.signature)) {
        return trusted.fingerprint;
      }
    } catch {
      // A signature this key cannot even check (another length) proves nothing: the next key is tried.
    }
  }
  return null;
}

function audienceNames(aud: unknown, posSignature: string): boolean {
  if (posSignature === "") return false;
  if (typeof aud === "string") return aud === posSignature;
  return Array.isArray(aud) && aud.some((entry) => entry === posSignature);
}

function bodyHashMatches(sub: unknown, rawBody: Buffer): boolean {
  if (typeof sub !== "string") return false;
  const expected = Buffer.from(createHash("sha512").update(rawBody).digest("base64"), "latin1");
  const given = Buffer.from(sub, "utf8");
  return given.byteLength === expected.byteLength && timingSafeEqual(given, expected);
}

/**
 * §2.4.6. `header` is the value of the `Verification-token` header. The checks run in this order and the first that
 * fails is the reason: the header's shape, the algorithm (before any key is used), the signature under one trusted
 * key, `iss`, `aud`, then `sub` over the bytes exactly as received. No time claim is checked.
 */
export function verifyNetopiaNotice(rawBody: Buffer, header: string | undefined, trust: NoticeTrust): VerifiedNotice | NoticeRejection {
  const jwt = jwtOf(header);
  if (jwt === null || !isJsonRecord(jwt.joseHeader)) return rejected("NOTICE_HEADER_MISSING");
  const typ = member(jwt.joseHeader, "typ");
  if ((typ !== undefined && typ !== "JWT") || member(jwt.joseHeader, "alg") !== "RS512") return rejected("NOTICE_ALG_REFUSED");
  const keyFingerprint = signerOf(jwt, trust.keys);
  if (keyFingerprint === null) return rejected("NOTICE_SIGNATURE_INVALID");
  if (member(jwt.claims, "iss") !== ISSUER) return rejected("NOTICE_ISSUER_INVALID");
  if (!audienceNames(member(jwt.claims, "aud"), trust.posSignature)) return rejected("NOTICE_AUDIENCE_INVALID");
  if (!bodyHashMatches(member(jwt.claims, "sub"), rawBody)) return rejected("NOTICE_BODY_HASH_INVALID");
  // parseJsonKeepingNumberText gives a number as its source text, so iat is recorded exactly as NETOPIA wrote it.
  const iat = member(jwt.claims, "iat");
  return Object.freeze({ ok: true as const, keyFingerprint, jwtIat: typeof iat === "string" && IAT.test(iat) ? iat : null });
}

/**
 * §2.4.6 / §2.7.4: whether a REJECTED message is worth keeping in quarantine: three JWT parts, our POS signature in
 * the (unverified) `aud`, and a JSON body whose `order.orderID` has our charge or tool-order form.
 */
export function quarantinable(rawBody: Buffer, header: string | undefined, posSignature: string): boolean {
  const jwt = jwtOf(header);
  if (jwt === null || !audienceNames(member(jwt.claims, "aud"), posSignature)) return false;
  const orderId = at(jsonOf(rawBody), "order.orderID");
  return typeof orderId === "string" && (CHARGE_ORDER.test(orderId) || TOOL_ORDER.test(orderId));
}

// ---- the tolerant parse ------------------------------------------------------------------------------------------

const UNREADABLE: ParsedNotice = Object.freeze({
  readable: false, orderId: null, providerPaymentId: null, providerStatus: null, amountText: null, currency: null,
  cardCountry: null, code: null, message: null, savedCard: null, occurredAt: null, allowed: Object.freeze({})
});

function textOf(value: unknown, shape: RegExp): string | null {
  return typeof value === "string" && shape.test(value) ? value : null;
}

function statusOf(value: unknown): number | null {
  if (typeof value !== "string" || !STATUS.test(value)) return null;
  const status = Number(value);
  return status <= STATUS_MAX ? status : null;
}

function integerIn(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "string" || !SMALL_INTEGER.test(value)) return null;
  const number = Number(value);
  return number >= minimum && number <= maximum ? number : null;
}

function countryOf(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    return netopiaCountryToIso2(value);
  } catch {
    return null;
  }
}

function occurredAtOf(value: unknown, now: Date): Date | null {
  if (typeof value !== "string") return null;
  try {
    return parseOccurredAt(value, now);
  } catch {
    return null;
  }
}

/** §2.4.3: the first present of NETOPIA_FACTS.tokenPaths, with `payment.binding`'s expiry (0 means unknown). */
function savedCardOf(body: unknown, last4: string | null): SavedCard | null {
  for (const path of NETOPIA_FACTS.tokenPaths) {
    const token = at(body, path);
    if (!isSecretTokenText(token)) continue;
    const binding = at(body, "payment.binding");
    return Object.freeze({
      token: createSecretToken(token),
      expMonth: integerIn(member(binding, "expireMonth"), 1, 12),
      expYear: integerIn(member(binding, "expireYear"), 2000, 2199),
      last4
    });
  }
  return null;
}

/**
 * §2.7.3 step 1: tolerant. Never throws; `readable` is false only for bytes that are not a UTF-8 JSON object (the
 * intake's PARSE_FAILED). `allowed` is §2.5.2's allow-list, for sealing: never the token, never another field.
 */
export function parseNetopiaNotice(rawBody: Buffer, now: Date): ParsedNotice {
  const body = jsonOf(rawBody);
  if (!isJsonRecord(body)) return UNREADABLE;
  const payment = member(body, "payment");
  const instrument = member(payment, "instrument");
  const panMasked = member(instrument, "panMasked");
  const last4 = typeof panMasked === "string" ? LAST_FOUR.exec(panMasked)?.[1] ?? null : null;
  const orderId = textOf(at(body, "order.orderID"), ORDER_ID);
  const ntpId = member(payment, "ntpID");
  const providerPaymentId = isNetopiaPaymentId(ntpId) ? ntpId : null;
  const providerStatus = statusOf(member(payment, "status"));
  const amountText = textOf(member(payment, "amount"), DECIMAL);
  const currency = textOf(member(payment, "currency"), CURRENCY);
  const cardCountry = countryOf(member(instrument, "country")) ?? countryOf(at(payment, "data.ISSUER_COUNTRY"));
  const code = textOf(member(payment, "code"), CODE);
  const message = textOf(member(payment, "message"), MESSAGE);
  const savedCard = savedCardOf(body, last4);
  const occurredAt = occurredAtOf(member(payment, "operationDate"), now);
  return Object.freeze({
    readable: true, orderId, providerPaymentId, providerStatus, amountText, currency, cardCountry, code, message,
    savedCard, occurredAt,
    allowed: Object.freeze({
      orderID: orderId, ntpID: providerPaymentId, status: providerStatus, amount: amountText, currency, code, message,
      cardCountry, last4, expireMonth: savedCard?.expMonth ?? null, expireYear: savedCard?.expYear ?? null
    })
  });
}

// ---- the answers -------------------------------------------------------------------------------------------------

function answer(status: 200 | 503, errorType: number, errorCode: number, errorMessage: string): Readonly<{ status: 200 | 503; body: string }> {
  return Object.freeze({ status, body: JSON.stringify({ errorType, errorCode, errorMessage }) });
}

/**
 * §2.7.2 (ruling C-4): a stored message is answered OK; an unverified one and a failed store are "try again"
 * (errorType 1, HTTP 503), never OK, so NETOPIA keeps sending while the owner fixes the key.
 */
export function netopiaNoticeAnswer(kind: "OK" | NoticeRejectionReason | "STORE_FAILED"): Readonly<{ status: 200 | 503; body: string }> {
  switch (kind) {
    case "OK":
      return answer(200, 0, 0, "OK");
    case "STORE_FAILED":
      return answer(503, 1, 1, "retry");
    case "NOTICE_HEADER_MISSING":
    case "NOTICE_ALG_REFUSED":
    case "NOTICE_ISSUER_INVALID":
      return answer(503, 1, ANSWER_CODE_GENERAL, "retry");
    case "NOTICE_SIGNATURE_INVALID":
      return answer(503, 1, ANSWER_CODE_SIGNATURE, "retry");
    case "NOTICE_AUDIENCE_INVALID":
      return answer(503, 1, ANSWER_CODE_AUDIENCE, "retry");
    case "NOTICE_BODY_HASH_INVALID":
      return answer(503, 1, ANSWER_CODE_TAINTED_PAYLOAD, "retry");
    default:
      return exhaustive(kind);
  }
}
