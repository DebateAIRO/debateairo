// Paid plans (spec 2026-09-29 §2.4): pure billing rules. No I/O lives in this package.
// R-1: the manifest lists @debateai/kernel only; register and budget are imported as types.
export { allowanceVsPlus, computeWindows, personWindowsFor, type TimeWindow } from "./windows.js";
export { BillingPersonAllowanceSource, type EntitlementPort, type EntitlementWindowBasis } from "./allowance-source.js";

// P2 (paid plans): money rules, calendar, the subscription fold and the connector ports.
export type { BillingPlan, BillingPlans, BillingPolicy, PlanId } from "@debateai/register";
export {
  decimalToMicros,
  microsToDecimal,
  upgradeProrationMicros,
  withdrawalRefundMicros
} from "./money.js";
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
