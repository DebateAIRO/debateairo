import { createHmac, timingSafeEqual } from "node:crypto";

import { canonicalJson, nullRecord, parseUniqueJsonText } from "./action-wire.js";

const POSITIVE = /^[1-9][0-9]*$/u;
const NONCE = /^[0-9a-f]{32}$/u;
const MAC = /^[0-9a-f]{64}$/u;

export interface ArmedBody extends Readonly<Record<string, unknown>> {
  readonly custodian: "V";
  readonly expires_at_ms: string;
  readonly issued_at_ms: string;
  readonly nonce: string;
  readonly schema: "obsctl-armed/v1";
}

function fail(code: string): never {
  throw new TypeError(code);
}

function checkedPositive(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) fail("FIX10_ARMED_TIME");
}

function mac(body: ArmedBody, key: Uint8Array): Buffer {
  if (key.byteLength !== 32) fail("FIX10_ARMED_KEY");
  return createHmac("sha256", key)
    .update(Buffer.from("obsctl-armed/v1\0", "utf8"))
    .update(Buffer.from(canonicalJson(body), "utf8"))
    .digest();
}

export function mintArmed(
  input: Readonly<{ issuedAtMs: number; nonce: Uint8Array; stalenessMs: number }>,
  key: Uint8Array,
): Readonly<{ body: ArmedBody; bytes: Uint8Array }> {
  checkedPositive(input.issuedAtMs);
  checkedPositive(input.stalenessMs);
  const expiresAt = input.issuedAtMs + input.stalenessMs;
  if (!Number.isSafeInteger(expiresAt)) fail("FIX10_ARMED_TIME");
  if (input.nonce.byteLength !== 16) fail("FIX10_ARMED_NONCE");
  const body = nullRecord([
    ["schema", "obsctl-armed/v1"], ["custodian", "V"],
    ["issued_at_ms", String(input.issuedAtMs)], ["expires_at_ms", String(expiresAt)],
    ["nonce", Buffer.from(input.nonce).toString("hex")],
  ]) as ArmedBody;
  const completed = nullRecord([["body", body], ["mac_sha256", mac(body, key).toString("hex")]]);
  return Object.freeze({ body, bytes: Buffer.from(`${canonicalJson(completed)}\n`, "utf8") });
}

export function verifyArmed(
  bytes: Uint8Array,
  key: Uint8Array,
  nowMs: number,
  stalenessMs: number,
): Readonly<{ body: ArmedBody; sha256Input: Uint8Array }> {
  checkedPositive(nowMs);
  checkedPositive(stalenessMs);
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r") || Buffer.from(text, "utf8").length !== bytes.byteLength) {
    fail("FIX10_ARMED_BYTES");
  }
  const parsed = parseUniqueJsonText(text.slice(0, -1));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("FIX10_ARMED_SCHEMA");
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "body") || !Object.hasOwn(record, "mac_sha256")) {
    fail("FIX10_ARMED_SCHEMA");
  }
  if (record.body === null || typeof record.body !== "object" || Array.isArray(record.body)) {
    fail("FIX10_ARMED_SCHEMA");
  }
  const rawBody = record.body as Record<string, unknown>;
  if (Object.keys(rawBody).length !== 5 || rawBody.schema !== "obsctl-armed/v1" || rawBody.custodian !== "V" ||
      typeof rawBody.issued_at_ms !== "string" || typeof rawBody.expires_at_ms !== "string" ||
      typeof rawBody.nonce !== "string" || !POSITIVE.test(rawBody.issued_at_ms) ||
      !POSITIVE.test(rawBody.expires_at_ms) || !NONCE.test(rawBody.nonce) ||
      typeof record.mac_sha256 !== "string" || !MAC.test(record.mac_sha256)) fail("FIX10_ARMED_SCHEMA");
  if (canonicalJson(record) !== text.slice(0, -1)) fail("FIX10_ARMED_CANONICAL");
  const body = nullRecord([
    ["schema", rawBody.schema], ["custodian", rawBody.custodian],
    ["issued_at_ms", rawBody.issued_at_ms], ["expires_at_ms", rawBody.expires_at_ms],
    ["nonce", rawBody.nonce],
  ]) as ArmedBody;
  const expected = mac(body, key);
  const actual = Buffer.from(record.mac_sha256, "hex");
  if (!timingSafeEqual(expected, actual)) fail("FIX10_ARMED_MAC");
  const issued = Number(body.issued_at_ms);
  const expires = Number(body.expires_at_ms);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || expires - issued !== stalenessMs) {
    fail("FIX10_ARMED_DURATION");
  }
  if (issued > nowMs) fail("FIX10_ARMED_FUTURE");
  if (nowMs >= expires) fail("FIX10_ARMED_STALE");
  return Object.freeze({ body, sha256Input: Buffer.from(bytes) });
}
