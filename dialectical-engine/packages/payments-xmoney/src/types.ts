// packages/payments-xmoney/src/types.ts
export type XMoneyEnvironment = "stage" | "live";
export const XMONEY_STATUSES = Object.freeze([
  "start", "in-progress", "3d-pending", "complete-ok", "complete-failed", "refund-ok", "void-ok", "cancel-ok", "charge-back"
] as const);
export type XMoneyStatus = typeof XMONEY_STATUSES[number];
export type XMoneyTransaction = Readonly<{
  transactionId: string; orderId: string; externalOrderId: string | null; customerId: string; cardId: string | null;
  status: XMoneyStatus; amountDecimal: string; currency: string; ip: string | null; transactionSource: string | null;
  transactionType: string | null; createdAt: Date | null;
  /** The transactions this one belongs to, e.g. a refund's payment (empty when xMoney names none). */
  relatedTransactionIds: ReadonlyArray<string>;
}>;
export type XMoneyNotice = Readonly<{
  transactionStatus: XMoneyStatus; orderId: string; externalOrderId: string | null; transactionId: string;
  customerId: string; amountDecimal: string; currency: string; cardId: string | null; timestamp: number | null;
}>;
export type XMoneyEmbeddedOrder = Readonly<{
  publicKey: string;
  siteId: string;
  customer: Readonly<{ identifier: string; email: string; country: string }>;
  order: Readonly<{ orderId: string; type: "managed"; amount: string; currency: "USD"; description: string }>;
  /** A12: "auth" (an uncaptured 1.00 hold, released right after) is the card-change check. */
  cardTransactionMode: "authAndCapture" | "auth";
  saveCard: true;
  backUrl: string;
  customData?: string;
}>;
