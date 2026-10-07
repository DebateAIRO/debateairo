// tests/support/netopia-verify.ts — VERIFY_PAYMENT on NETOPIA (N10's path) with every settlement, for N12, N13, N16.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CardPayments } from "@debateai/billing-core";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, type OutboxJob
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import { createCardCheckSettlement } from "../../apps/api/src/billing/card-change.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";
import { createUpgradeSettlement } from "../../apps/api/src/billing/upgrade.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { testBillingPlans, testBillingPolicy, testCountryPolicy } from "./billingFixtures.js";
import { recordingAudit, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY, type RecordingAudit } from "./billingSubscriptionFixtures.js";

const unused = async (): Promise<never> => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "no xMoney in a NETOPIA suite"); };
const NO_XMONEY = Object.freeze({
  getTransaction: unused, getOrder: unused, getCard: unused, refund: unused, listTransactions: unused, rebill: unused
}) as unknown as XMoneyClient;

export function netopiaVerifyHandler(pool: Pool, input: Readonly<{
  payments: Pick<CardPayments, "status">; clock: () => Date; paymentEnvironment?: "sandbox" | "live";
}>): Readonly<{ verify: VerifyPaymentHandler; audit: RecordingAudit }> {
  const repository = new BillingRepository(pool);
  const jobs = new BillingJobQueries(pool);
  const entitlements = new EntitlementRepository(pool);
  const audit = recordingAudit();
  const refunds = new RefundDesk({
    repository, jobs, xmoney: NO_XMONEY, policy: testBillingPolicy, audit, clock: input.clock, xmoneyEnvironment: "stage"
  });
  const verify = new VerifyPaymentHandler({
    repository, jobs, xmoney: NO_XMONEY, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit, xmoneyEnvironment: "stage",
    netopia: { payments: input.payments, paymentEnvironment: input.paymentEnvironment ?? "sandbox", jobs }
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances: new AcceptanceRepository(pool), policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  verify.registerSettlement("RENEWAL", createRenewalSettlement({
    repository, entitlements, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  verify.registerSettlement("UPGRADE", createUpgradeSettlement({ repository, entitlements, plans: testBillingPlans }));
  verify.registerSettlement("CARD_CHECK", createCardCheckSettlement({
    repository, recordsKey: TEST_RECORDS_KEY, countryPolicy: testCountryPolicy, audit
  }));
  return Object.freeze({ verify, audit });
}

/** A claimed VERIFY_PAYMENT job for a NETOPIA charge (ref = our charge id). */
export function verifyJob(chargeId: string, now: Date, attempts = 1): OutboxJob {
  return {
    jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: chargeId, payload: { charge_id: chargeId }, attempts, notBefore: now,
    createdAt: now, claimedBy: "test", claimedAt: now
  } as unknown as OutboxJob;
}
