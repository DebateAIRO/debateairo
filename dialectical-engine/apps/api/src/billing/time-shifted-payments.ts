import type {
  CardPayments,
  HostedPaymentStart,
  HostedPaymentStarted,
  PaymentEnvironment,
  PaymentProvider,
  PaymentReport,
  SavedCardCharge
} from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";

const DAY_MS = 86_400_000;
const MAX_OFFSET_DAYS = 400;

/**
 * Spec 2026-10-05 §2.3 and §2.17.1: the sandbox clock over the payment port. OWNER-RUN sandbox only. The billing
 * runtime lives `offsetDays` ahead (BILLING_STAGE_CLOCK_OFFSET_DAYS) so a month renews in minutes; NETOPIA does not. The
 * port sends no time of its own (the NETOPIA package writes `order.dateTime` from the real clock), so nothing on the way
 * out moves; the one time read back, `PaymentReport.occurredAt`, moves FORWARD by the offset, so a plan's month starts
 * on the runtime's own clock, as StageShiftedXMoneyClient does for xMoney's `createdAt` (stage-clock.ts). It refuses a
 * live port with the stage clock's own codes. Every port method is wrapped (tests/unit/billing-payment-port.test.ts
 * pins the list against the CardPayments type), and `refund` exists here exactly when the inner port has it, so
 * RefundDesk's owner mode (§2.12.2) still sees it absent.
 */
export class TimeShiftedCardPayments implements CardPayments {
  readonly provider: PaymentProvider;
  readonly environment: PaymentEnvironment;
  declare readonly refund?: NonNullable<CardPayments["refund"]>;
  readonly #inner: CardPayments;
  readonly #offsetMs: number;

  constructor(inner: CardPayments, offsetDays: number) {
    if (inner.environment !== "sandbox") {
      throw new TypedDomainError("BILLING_STAGE_CLOCK_LIVE_REFUSED", "the billing clock moves only against NETOPIA's sandbox");
    }
    if (!Number.isInteger(offsetDays) || offsetDays < 1 || offsetDays > MAX_OFFSET_DAYS) {
      throw new TypedDomainError("BILLING_STAGE_CLOCK_OFFSET_INVALID", "the stage clock offset is a whole number of days from 1 to 400");
    }
    this.provider = inner.provider;
    this.environment = inner.environment;
    this.#inner = inner;
    this.#offsetMs = offsetDays * DAY_MS;
    const innerRefund = inner.refund;
    if (innerRefund !== undefined) {
      this.refund = async (i) => this.#forward(await innerRefund.call(inner, i));
    }
  }

  #forward(report: PaymentReport): PaymentReport {
    return report.occurredAt === null
      ? report
      : Object.freeze({ ...report, occurredAt: new Date(report.occurredAt.getTime() + this.#offsetMs) });
  }

  startHostedPayment(i: HostedPaymentStart): Promise<HostedPaymentStarted> {
    return this.#inner.startHostedPayment(i);
  }

  async chargeSavedCard(i: SavedCardCharge): Promise<PaymentReport> {
    return this.#forward(await this.#inner.chargeSavedCard(i));
  }

  async status(i: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    const found = await this.#inner.status(i);
    return found === "NO_SUCH_ORDER" ? found : this.#forward(found);
  }
}
