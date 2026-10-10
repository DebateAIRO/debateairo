// Paid plans (spec 2026-09-29 §2.4): pure billing rules. No I/O lives in this package.
// R-1: the manifest lists @debateai/kernel only; register and budget are imported as types.
export { allowanceVsPlus, computeWindows, personWindowsFor, type TimeWindow } from "./windows.js";
export { BillingPersonAllowanceSource, type EntitlementPort, type EntitlementWindowBasis } from "./allowance-source.js";

export { FundingAwarePersonAllowanceSource, type FundingEntitlementPort, type FundingAllowancePort } from "./internal-allowance-source.js";
// P2 (paid plans): money rules, calendar, the subscription fold and the connector ports.
export type { BillingPlan, BillingPlans, BillingPolicy, PlanId } from "@debateai/register";
export {
  decimalToMicros,
  microsToDecimal,
  upgradeProrationMicros,
  withdrawalRefundMicros,
  withdrawalRefundPerPaymentMicros,
  type WithdrawalPayment
} from "./money.js";
// P12c (A6): the month credit after an upgrade.
export { upgradeMonthCreditOverrideMicros } from "./upgrade-credit.js";
export { addBusinessDays, businessDaysBetween, invoiceIssuerFor, periodBoundary } from "./calendar.js";
export {
  SUBSCRIPTION_EVENT_KINDS,
  entitlementPlanOf,
  foldSubscription,
  type EndedCause,
  type SubscriptionEvent,
  type SubscriptionEventData,
  type SubscriptionEventKind,
  type SubscriptionState,
  type SubscriptionStatus
} from "./subscription.js";
export type {
  InvoiceErrorCode,
  InvoiceIssuer,
  IssuedDocument,
  RefundRecord,
  SaleLine,
  SaleRecord,
  TaxEngine,
  TaxErrorCode,
  TaxIdCheck,
  TaxLocation,
  TaxQuote,
  TaxStatus
} from "./ports.js";

// N1 (spec 2026-10-05 §2.3): the card payment port, its types and its error vocabulary.
export {
  paymentError,
  paymentErrorCode,
  paymentNothingSent,
  type CardPayments,
  type DeclineSide,
  type HostedPaymentStart,
  type HostedPaymentStarted,
  type Payer,
  type PaymentEnvironment,
  type PaymentErrorCode,
  type PaymentProvider,
  type PaymentReport,
  type PaymentState,
  type PriceCurrency,
  type SavedCard,
  type SavedCardCharge,
  type SecretToken
} from "./payments.js";

// P6a (paid plans, RULINGS-R3 R3-4): the mirror of the legal notice's company facts for the API and the mail.
export { SELLER_COMPANY, isUnverifiedCompanyFact, type SellerCompany, type SellerVatStatus } from "./company.js";

// P12b (paid plans, R2 Q-6): the 14 calendar days of the withdrawal right, in the consumer's own calendar; W6
// (P2-I9): a last day on a Saturday or Sunday moves to the next Monday.
export { withdrawalDeadline, withdrawalRefundDeadline, type WithdrawalDeadline } from "./withdrawal-deadline.js";
