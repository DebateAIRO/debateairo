// packages/payments-xmoney/src/signing.ts
import { createHmac } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyEmbeddedOrder, XMoneyEnvironment } from "./types.js";

const CHARGE_ID = /^[0-9a-f]{32}$/u;
const AMOUNT = /^(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const COUNTRY = /^[A-Z]{2}$/u;

function invalidOrder(field: string): never {
  throw new TypedDomainError("XMONEY_ORDER_INVALID", `the embedded order has an invalid ${field}`);
}

/** Exactly 32 bytes, returned as a fresh copy the caller zeroes (the decipher key). */
export function aesKeyFromPrivateKey(privateKey: Buffer): Buffer {
  if (privateKey.byteLength !== 32) {
    throw new TypedDomainError("XMONEY_KEY_LENGTH_INVALID", "the xMoney private key is not 32 bytes");
  }
  const key = Buffer.allocUnsafeSlow(32);
  privateKey.copy(key);
  return key;
}

function canonicalOrder(order: XMoneyEmbeddedOrder): Record<string, unknown> {
  if (!CHARGE_ID.test(order.order.orderId)) invalidOrder("orderId");
  if (!AMOUNT.test(order.order.amount)) invalidOrder("amount");
  if (!COUNTRY.test(order.customer.country)) invalidOrder("country");
  if (order.customer.identifier.length < 1 || order.customer.email.length < 3) invalidOrder("customer");
  try {
    new URL(order.backUrl);
  } catch {
    invalidOrder("backUrl");
  }
  return {
    publicKey: order.publicKey,
    siteId: order.siteId,
    customer: { identifier: order.customer.identifier, email: order.customer.email, country: order.customer.country },
    order: {
      orderId: order.order.orderId, type: order.order.type, amount: order.order.amount,
      currency: order.order.currency, description: order.order.description
    },
    cardTransactionMode: order.cardTransactionMode,
    saveCard: order.saveCard,
    backUrl: order.backUrl,
    ...(order.customData === undefined ? {} : { customData: order.customData })
  };
}

export function signOrderPayload(order: XMoneyEmbeddedOrder, privateKey: Buffer): { payload: string; checksum: string } {
  const json = JSON.stringify(canonicalOrder(order));
  return {
    payload: Buffer.from(json, "utf8").toString("base64"),
    checksum: createHmac("sha512", privateKey).update(json, "utf8").digest("base64")
  };
}

/** A22: the SDK environment is derived from the API base URL, never configured twice. */
export function xmoneyEnvironmentOf(baseUrl: string): XMoneyEnvironment {
  return new URL(baseUrl).hostname === "api.xmoney.com" ? "live" : "stage";
}
