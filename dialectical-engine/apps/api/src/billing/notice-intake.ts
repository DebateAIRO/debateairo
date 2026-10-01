import { createHash, randomUUID } from "node:crypto";
import type { BillingRepository, NoticeRow } from "@debateai/db";
import type { XMoneyEnvironment, XMoneyNotice } from "@debateai/payments-xmoney";
import type { BillingAudit } from "./audit.js";

export type NoticeReceipt = "STORED" | "DUPLICATE" | "UNDECRYPTABLE";

export interface NoticeIntakePort {
  receive(opensslResult: string): Promise<NoticeReceipt>;
}

/**
 * The idempotency key of a notice: its decrypted fields in a fixed order. A retried notice may be re-encrypted
 * under a new IV, so the ciphertext would not do.
 */
export function noticeDigest(notice: XMoneyNotice): string {
  return createHash("sha256").update(JSON.stringify([
    notice.transactionStatus, notice.orderId, notice.externalOrderId, notice.transactionId, notice.customerId,
    notice.amountDecimal, notice.currency, notice.cardId, notice.timestamp
  ]), "utf8").digest("hex");
}

export class NoticeIntake implements NoticeIntakePort {
  constructor(private readonly deps: Readonly<{
    repository: Pick<BillingRepository, "withTransaction" | "insertNotice" | "enqueue">;
    decrypt: (opensslResult: string) => XMoneyNotice;
    audit: BillingAudit;
    clock: () => Date;
    kick: () => void;
    /** D5 5h: the xMoney system whose key decrypts these notices (`connectors.xmoneyEnvironment`). */
    xmoneyEnvironment: XMoneyEnvironment;
  }>) {}

  async receive(opensslResult: string): Promise<NoticeReceipt> {
    let notice: XMoneyNotice;
    try {
      notice = this.deps.decrypt(opensslResult);
    } catch {
      this.deps.audit("billing.notice.undecryptable", {});
      return "UNDECRYPTABLE";
    }
    const now = this.deps.clock();
    const noticeId = randomUUID();
    const stored = await this.deps.repository.withTransaction(async (client) => {
      const inserted = await this.deps.repository.insertNotice(client, Object.freeze({
        noticeId, receivedAt: now, payloadSha256: noticeDigest(notice), transactionId: notice.transactionId,
        orderId: notice.orderId, externalOrderId: notice.externalOrderId, status: notice.transactionStatus,
        xmoneyEnvironment: this.deps.xmoneyEnvironment
      }) satisfies NoticeRow);
      await this.deps.repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: notice.transactionId, notBefore: now,
        payload: { notice_id: inserted === "INSERTED" ? noticeId : null, order_id: notice.orderId, external_order_id: notice.externalOrderId }
      });
      return inserted;
    });
    this.deps.kick();
    return stored === "INSERTED" ? "STORED" : "DUPLICATE";
  }
}
