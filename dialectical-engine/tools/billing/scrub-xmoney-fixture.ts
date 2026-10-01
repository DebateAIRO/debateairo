// tools/billing/scrub-xmoney-fixture.ts
// X0 (paid plans): turns the owner's raw xMoney STAGE captures into scrubbed, committable fixtures.
// Run by the OWNER only:
//   pnpm exec tsx tools/billing/scrub-xmoney-fixture.ts --capture-dir <dir> --key-file <file> \
//     --out tests/fixtures/xmoney --recorded-on 2026-10-02
// The key is read from a 0600 file and never printed. Standalone on purpose: it runs before
// packages/payments-xmoney exists and must not share code with the thing its fixtures test.
import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const XMONEY_FIXTURE_FORMAT = "debateai.xmoney-fixture.v1";
/** Published, deliberately non-secret: fixtures carry notices re-encrypted, and orders re-signed, under it. */
export const XMONEY_FIXTURE_TEST_KEY = ["0123456789abcdef", "0123456789abcdef"].join(""); // a dummy test value, not a key; written as a join so the secret scanner does not read it as one (owner, 2026-09-30)
const FIXTURE_TEST_IV = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");

/** Every complete X0 run records these; P3b's recorded suite fails naming any that is missing. */
export const XMONEY_REQUIRED_FIXTURE_KINDS = Object.freeze([
  "key-shape", "sdk-result", "csp-report", "order-payload",
  "notice-success", "notice-failed", "notice-rebill",
  "transaction-initial", "transaction-list", "order", "card",
  "rebill-response", "transaction-rebill",
  "transaction-auth", "transaction-auth-released", "transaction-rebill-auth-order",
  "refund-response", "transaction-refund-partial", "transaction-list-after-refund",
  // X0 (g), second half: how (and how soon) the refund listing shows a partial refund, and a second one.
  "transaction-list-refund-after-partial", "transaction-refund-second-partial",
  "transaction-list-refund-after-second-partial",
  "transaction-refund-full", "refund-refused", "transaction-list-refund"
] as const);
/**
 * Recorded only when xMoney produces them: a refund's or a release's notice, a separate refund transaction, a second
 * payment, and a rebill declined by a stage test amount (its reply, `{httpStatus, reply}`, and its transaction).
 */
export const XMONEY_OPTIONAL_FIXTURE_KINDS = Object.freeze([
  "notice-refund", "notice-void", "transaction-refund", "transaction-second-payment",
  "rebill-declined-response", "transaction-rebill-declined"
] as const);
export type XMoneyFixtureKind =
  | typeof XMONEY_REQUIRED_FIXTURE_KINDS[number]
  | typeof XMONEY_OPTIONAL_FIXTURE_KINDS[number];
const FIXTURE_KINDS: ReadonlySet<string> = new Set<string>([
  ...XMONEY_REQUIRED_FIXTURE_KINDS, ...XMONEY_OPTIONAL_FIXTURE_KINDS
]);

/** How xMoney framed the REAL ciphertext text of a notice (P3a's decryptNotice accepts exactly this grammar). */
export type XMoneyNoticeFraming = Readonly<{
  ivBytes: 16; alphabet: "standard"; padded: boolean; lineBreaks: false; plusArrivedAsSpace: boolean;
}>;
/** A notice field beside opensslResult, described by its NAME's value length and character set — never its value. */
export type XMoneyOuterField = Readonly<{
  length: number; charset: "digits" | "hex" | "base64" | "base64url" | "printable" | "other";
}>;

export type XMoneyFixture = Readonly<{
  format: typeof XMONEY_FIXTURE_FORMAT;
  kind: XMoneyFixtureKind;
  recordedOn: string;
  environment: "stage";
  contentType: string | null;
  body: unknown;
  testKeyOpensslResult: string | null;
  framing: XMoneyNoticeFraming | null;
  outerFields: Readonly<Record<string, XMoneyOuterField>> | null;
  testKeySignature: Readonly<{ payload: string; checksum: string }> | null;
}>;

const ID_KEYS: ReadonlySet<string> = new Set([
  "id", "orderid", "transactionid", "customerid", "cardid", "siteid", "externalorderid", "identifier",
  "relatedtransactionids", "cardproviderid", "componentid"
]);
const NAME_KEYS: ReadonlyMap<string, string> = new Map([
  ["firstname", "Test"], ["lastname", "Person"], ["cardholdername", "Test Person"], ["nameoncard", "Test Person"]
]);
const SCRUBBED_KEYS: ReadonlySet<string> = new Set([
  "address", "city", "state", "cardholderstate", "zipcode", "phone", "customdata", "externalcustomdata", "publickey",
  "providerintref", "providerrc", "providermessage", "providerauth", "providerrrn", "providerarn", "providerird",
  "providereci", "providerc", "providernetworktransactionid", "carddescriptor"
]);
const EXPIRY_KEYS: ReadonlySet<string> = new Set(["cardexpirydate"]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
const IPV6 = /^[0-9a-f:]+$/iu;
const MASKED_CARD = /^\d{6}\*+\d{4}$/u;
const HEX32 = /^[0-9a-f]{32}$/u;
/** P3a's decoder grammar, restated (X0 may not import packages/payments-xmoney). */
const STANDARD_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;

export class XMoneyScrubber {
  readonly #pseudonyms = new Map<string, number>();
  #next = 1001;

  scrub(value: unknown, key = ""): unknown {
    const name = key.toLowerCase();
    if (Array.isArray(value)) {
      return value.map((item) => (name === "components" && isRecord(item)
        ? this.#scrubComponent(item)
        : this.scrub(item, name === "relatedtransactionids" ? key : "")));
    }
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, this.scrub(child, childKey)]));
    }
    if (ID_KEYS.has(name) && (typeof value === "number" || typeof value === "string")) return this.#pseudonym(value);
    if (NAME_KEYS.has(name) && typeof value === "string") return NAME_KEYS.get(name)!;
    if (EXPIRY_KEYS.has(name) && value !== null) return "12/99";
    if (SCRUBBED_KEYS.has(name) && value !== null) return "SCRUBBED";
    if (typeof value !== "string") return value;
    if (name === "backurl") return scrubBackUrl(value);
    if (name === "cardnumber") return MASKED_CARD.test(value) ? value : "411111******1111";
    if (EMAIL.test(value)) return "person@example.test";
    if (IPV4.test(value) || name === "ip") return value.includes(":") ? "2001:db8::10" : "203.0.113.10";
    if (IPV6.test(value) && value.includes(":") && value.split(":").length > 2) return "2001:db8::10";
    return value;
  }

  #scrubComponent(component: Record<string, unknown>): Record<string, unknown> {
    const scrubbed = this.scrub(component) as Record<string, unknown>;
    return "data" in scrubbed ? { ...scrubbed, data: {} } : scrubbed;
  }

  #pseudonym(original: number | string): number | string {
    const lookup = `${typeof original}:${String(original)}`;
    let replacement = this.#pseudonyms.get(lookup);
    if (replacement === undefined) {
      replacement = this.#next;
      this.#next += 1;
      this.#pseudonyms.set(lookup, replacement);
    }
    if (typeof original === "number") return replacement;
    if (HEX32.test(original)) return replacement.toString(16).padStart(32, "0");
    if (/^\d+$/u.test(original)) return String(replacement);
    return `scrubbed-${replacement}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubBackUrl(value: string): string {
  try {
    const url = new URL(value);
    return `https://debateai.test${url.pathname}${url.search === "" ? "" : "?charge=SCRUBBED"}`;
  } catch {
    return "https://debateai.test/";
  }
}

export function readXMoneyKeyFile(path: string): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new TypeError("XMONEY_KEY_FILE_MODE_UNSAFE");
  const text = readFileSync(path, "latin1");
  const line = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!/^[\x21-\x7e]+$/u.test(line)) throw new TypeError("XMONEY_KEY_FILE_INVALID");
  return Buffer.from(line, "latin1");
}

function framingUnexpected(rule: string): never {
  throw new TypeError(`XMONEY_CAPTURE_FRAMING_UNEXPECTED:${rule}`);
}

function framingPart(text: string, part: "IV" | "CIPHERTEXT"): Buffer {
  if (!STANDARD_BASE64.test(text)) framingUnexpected(`${part}_ALPHABET`);
  const decoded = Buffer.from(text, "base64");
  if (decoded.toString("base64").replace(/=+$/u, "") !== text.replace(/=+$/u, "")) framingUnexpected(`${part}_NOT_CANONICAL`);
  return decoded;
}

/**
 * P3a's framing rules, checked on the REAL ciphertext text before anything is decrypted: split at the first comma,
 * a space back to `+` (a form decoder's work), the standard alphabet, canonical base64, a 16-byte IV and a
 * non-empty ciphertext in whole AES blocks. A notice outside this grammar would be refused by every live
 * decryptNotice, so X0 refuses to turn it into a fixture that re-encrypts it canonically and hides the difference.
 */
export function noticeFraming(opensslResult: string, plusArrivedAsSpace: boolean): XMoneyNoticeFraming {
  const comma = opensslResult.indexOf(",");
  if (comma < 1) framingUnexpected("NO_COMMA");
  const ivText = opensslResult.slice(0, comma).replaceAll(" ", "+");
  const dataText = opensslResult.slice(comma + 1).replaceAll(" ", "+");
  const iv = framingPart(ivText, "IV");
  const data = framingPart(dataText, "CIPHERTEXT");
  if (iv.byteLength !== 16) framingUnexpected("IV_LENGTH");
  if (data.byteLength === 0 || data.byteLength % 16 !== 0) framingUnexpected("CIPHERTEXT_LENGTH");
  return Object.freeze({
    ivBytes: 16, alphabet: "standard", padded: ivText.endsWith("="), lineBreaks: false, plusArrivedAsSpace
  });
}

export function decryptOpensslResult(opensslResult: string, key: Buffer): Buffer {
  const comma = opensslResult.indexOf(",");
  if (comma < 1) throw new TypeError("XMONEY_CAPTURE_NOT_A_NOTICE");
  const iv = Buffer.from(opensslResult.slice(0, comma).replaceAll(" ", "+"), "base64");
  const data = Buffer.from(opensslResult.slice(comma + 1).replaceAll(" ", "+"), "base64");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function encryptOpensslResult(plaintext: string, key: Buffer, iv: Buffer): string {
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64")},${data.toString("base64")}`;
}

function signUnder(order: unknown, key: Buffer): Readonly<{ payload: string; checksum: string }> {
  const json = JSON.stringify(order);
  return {
    payload: Buffer.from(json, "utf8").toString("base64"),
    checksum: createHmac("sha512", key).update(json, "utf8").digest("base64")
  };
}

function describeOuterField(value: string): XMoneyOuterField {
  const charset = /^[0-9]+$/u.test(value) ? "digits"
    : /^[0-9a-f]+$/iu.test(value) ? "hex"
      : STANDARD_BASE64.test(value) ? "base64"
        : /^[A-Za-z0-9_-]+={0,2}$/u.test(value) ? "base64url"
          : /^[\x20-\x7e]+$/u.test(value) ? "printable" : "other";
  return Object.freeze({ length: value.length, charset });
}

function captureKind(fileName: string): XMoneyFixtureKind {
  const stem = fileName.replace(/\.(?:raw|json)$/u, "").replace(/-\d+$/u, "");
  if (!FIXTURE_KINDS.has(stem)) throw new TypeError("XMONEY_CAPTURE_KIND_UNKNOWN");
  return stem as XMoneyFixtureKind;
}

type NoticeCapture = Readonly<{
  contentType: string; opensslResult: string; plusArrivedAsSpace: boolean;
  outerFields: Readonly<Record<string, XMoneyOuterField>>;
}>;

function readNoticeCapture(text: string): NoticeCapture {
  const split = text.indexOf("\n\n");
  if (split < 0 || !text.startsWith("content-type: ")) throw new TypeError("XMONEY_CAPTURE_NOT_A_NOTICE");
  const contentType = text.slice("content-type: ".length, text.indexOf("\n")).trim();
  const body = text.slice(split + 2);
  const fields = new Map<string, string>();
  if (contentType.includes("json")) {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) throw new TypeError("XMONEY_CAPTURE_NOT_A_NOTICE");
    for (const [name, value] of Object.entries(parsed)) {
      fields.set(name, typeof value === "string" || typeof value === "number" ? String(value) : "");
    }
  } else {
    for (const [name, value] of new URLSearchParams(body)) fields.set(name, value);
  }
  const opensslResult = fields.get("opensslResult");
  if (opensslResult === undefined || opensslResult === "") throw new TypeError("XMONEY_CAPTURE_NOT_A_NOTICE");
  fields.delete("opensslResult");
  return {
    contentType,
    opensslResult,
    // A form decoder turns an unescaped `+` into a space; P3a's decryptNotice puts it back.
    plusArrivedAsSpace: opensslResult.includes(" "),
    outerFields: Object.fromEntries([...fields].map(([name, value]) => [name, describeOuterField(value)]))
  };
}

export function writeXMoneyFixtures(input: Readonly<{
  captureDir: string;
  key: Buffer;
  outDir: string;
  recordedOn: string;
}>): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.recordedOn)) throw new TypeError("XMONEY_RECORDED_ON_INVALID");
  const names = readdirSync(input.captureDir).filter((name) => !name.startsWith(".")).sort();
  const kinds = names.map(captureKind);
  const seen = new Set<string>();
  for (const kind of kinds) {
    // One file per kind: a second capture of a kind would silently overwrite the first.
    if (seen.has(kind)) throw new TypeError(`XMONEY_CAPTURE_KIND_DUPLICATE:${kind}`);
    seen.add(kind);
  }
  const scrubber = new XMoneyScrubber();
  const testKey = Buffer.from(XMONEY_FIXTURE_TEST_KEY, "latin1");
  mkdirSync(input.outDir, { recursive: true });
  const written: string[] = [];
  const base = { format: XMONEY_FIXTURE_FORMAT, recordedOn: input.recordedOn, environment: "stage" } as const;
  names.forEach((name, index) => {
    const kind = kinds[index]!;
    const text = readFileSync(join(input.captureDir, name), "utf8");
    let fixture: XMoneyFixture;
    if (kind.startsWith("notice-")) {
      const capture = readNoticeCapture(text);
      const framing = noticeFraming(capture.opensslResult, capture.plusArrivedAsSpace);
      const body = scrubber.scrub(JSON.parse(decryptOpensslResult(capture.opensslResult, input.key).toString("utf8")));
      fixture = {
        ...base, kind, contentType: capture.contentType, body,
        testKeyOpensslResult: encryptOpensslResult(JSON.stringify(body), testKey, FIXTURE_TEST_IV),
        framing, outerFields: capture.outerFields, testKeySignature: null
      };
    } else if (kind === "order-payload") {
      const capture = JSON.parse(text) as unknown;
      if (!isRecord(capture) || !isRecord(capture.order) || typeof capture.payload !== "string") {
        throw new TypeError("XMONEY_CAPTURE_NOT_AN_ORDER");
      }
      // The payload the stage form accepted must be exactly the JSON of the order beside it, field order included.
      if (Buffer.from(capture.payload, "base64").toString("utf8") !== JSON.stringify(capture.order)) {
        throw new TypeError("XMONEY_CAPTURE_ORDER_PAYLOAD_MISMATCH");
      }
      const order = scrubber.scrub(capture.order);
      fixture = {
        ...base, kind, contentType: null, body: { order }, testKeyOpensslResult: null, framing: null,
        outerFields: null, testKeySignature: signUnder(order, testKey)
      };
    } else {
      fixture = {
        ...base, kind, contentType: null, body: scrubber.scrub(JSON.parse(text)), testKeyOpensslResult: null,
        framing: null, outerFields: null, testKeySignature: null
      };
    }
    const target = `${kind}.json`;
    writeFileSync(join(input.outDir, target), `${JSON.stringify(fixture, null, 2)}\n`);
    written.push(target);
  });
  return written;
}

function argument(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index < 0 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`XMONEY_ARGUMENT_REQUIRED:${name}`);
  return value;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const key = readXMoneyKeyFile(argument(argv, "--key-file"));
  try {
    const written = writeXMoneyFixtures({
      captureDir: argument(argv, "--capture-dir"),
      key,
      outDir: argument(argv, "--out"),
      recordedOn: argument(argv, "--recorded-on")
    });
    console.log(`XMONEY_FIXTURES_WRITTEN=${written.join(",")}`);
  } finally {
    key.fill(0);
  }
}
