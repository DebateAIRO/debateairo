// packages/payments-xmoney/src/notice.ts
import { createDecipheriv } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import { parseJsonKeepingNumberText } from "./json.js";
import { aesKeyFromPrivateKey } from "./signing.js";
import { XMONEY_STATUSES, type XMoneyNotice, type XMoneyStatus } from "./types.js";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const DIGITS = /^[0-9]{1,20}$/u;
const EXTERNAL_ORDER = /^[A-Za-z0-9_.-]{1,32}$/u;
const DECIMAL = /^[0-9]+(?:\.[0-9]+)?$/u;

function undecryptable(): never {
  throw new TypedDomainError("XMONEY_NOTICE_UNDECRYPTABLE", "the xMoney notice could not be decrypted");
}

function strictBase64(text: string): Buffer | null {
  const normalised = text.replaceAll(" ", "+");
  if (!BASE64.test(normalised)) return null;
  const decoded = Buffer.from(normalised, "base64");
  return decoded.toString("base64").replace(/=+$/u, "") === normalised.replace(/=+$/u, "") ? decoded : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function id(value: unknown): string {
  if (typeof value !== "string" || !DIGITS.test(value)) undecryptable();
  return value;
}

function readNotice(value: unknown): XMoneyNotice {
  if (!isRecord(value)) undecryptable();
  const status = value.transactionStatus;
  if (typeof status !== "string" || !(XMONEY_STATUSES as ReadonlyArray<string>).includes(status)) undecryptable();
  const amount = value.amount;
  if (typeof amount !== "string" || !DECIMAL.test(amount)) undecryptable();
  const currency = value.currency;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/u.test(currency)) undecryptable();
  const external = value.externalOrderId;
  const timestamp = value.timestamp;
  return Object.freeze({
    transactionStatus: status as XMoneyStatus,
    orderId: id(value.orderId),
    externalOrderId: typeof external === "string" && EXTERNAL_ORDER.test(external) ? external : null,
    transactionId: id(value.transactionId),
    customerId: id(value.customerId),
    amountDecimal: amount,
    currency,
    cardId: value.cardId === undefined || value.cardId === null ? null : id(value.cardId),
    timestamp: typeof timestamp === "string" && /^[0-9]{1,15}$/u.test(timestamp) ? Number(timestamp) : null
  });
}

export function decryptNotice(opensslResult: string, privateKey: Buffer): XMoneyNotice {
  const comma = opensslResult.indexOf(",");
  if (comma < 1) undecryptable();
  const iv = strictBase64(opensslResult.slice(0, comma));
  const ciphertext = strictBase64(opensslResult.slice(comma + 1));
  if (iv === null || ciphertext === null || iv.byteLength !== 16
    || ciphertext.byteLength === 0 || ciphertext.byteLength % 16 !== 0) {
    undecryptable();
  }
  const key = aesKeyFromPrivateKey(privateKey);
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return readNotice(parseJsonKeepingNumberText(plaintext.toString("utf8")));
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "XMONEY_NOTICE_UNDECRYPTABLE") throw error;
    return undecryptable();
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}
