import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PaymentReport } from "@debateai/billing-core";
import type { BillingRepository, ChargeRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { sealCardToken } from "./records.js";

/** What `storeReportedCard` needs: the three repository calls and the records key the token is sealed under. */
export type CardStoreDeps = Readonly<{
  repository: Pick<BillingRepository, "cardTokensFromCharge" | "customerByOwner" | "insertCardToken">;
  recordsKey: Buffer;
}>;

/**
 * Spec §2.9.2 step 4 / §2.15.1: a saved card NETOPIA's answer for a charge carries (a token payment's answer, or a status
 * read: B3, NETOPIA answers 2026-10-21 — only the FIRST notice of a payment carries the card, resent copies carry none,
 * so a lost first notice leaves the status read as the card's only other source) becomes a `card_token` row at once:
 * sealed under the records key with the AAD naming the row, sourced from this charge (`sourceNoticeId` and
 * `sourceToolOrder` null), dated by NETOPIA's operation time, else `at`. Adoption stays VERIFY_PAYMENT's settlement's
 * (§2.15.2). One row per charge: a charge that already has a stored token (from its first notice or an earlier read)
 * adds none. Run on the caller's transaction. Returns whether a row was inserted; never logs or returns the token.
 */
export async function storeReportedCard(
  deps: CardStoreDeps, client: PoolClient, charge: Pick<ChargeRow, "chargeId" | "ownerRef" | "paymentEnvironment">,
  report: Pick<PaymentReport, "savedCard" | "occurredAt" | "cardCountry">, at: Date
): Promise<boolean> {
  const card = report.savedCard;
  if (card === null) return false;
  if ((await deps.repository.cardTokensFromCharge(client, charge.chargeId)).length > 0) return false;
  const customer = await deps.repository.customerByOwner(charge.ownerRef, client);
  if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a charge without its customer");
  const tokenId = randomUUID();
  const sealed = sealCardToken(deps.recordsKey, tokenId, card.token);
  await deps.repository.insertCardToken(client, {
    tokenId, customerId: customer.customerId, paymentProvider: "netopia", paymentEnvironment: charge.paymentEnvironment,
    sourceChargeId: charge.chargeId, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: report.occurredAt ?? at,
    tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId, expMonth: card.expMonth, expYear: card.expYear,
    last4: card.last4, cardCountry: report.cardCountry, createdAt: at
  });
  return true;
}
