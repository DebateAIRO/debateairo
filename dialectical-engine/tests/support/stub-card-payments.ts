// tests/support/stub-card-payments.ts
// A port-level stub of CardPayments (spec 2026-10-05 §2.3) for the flow suites. What it answers is scripted per order; every call is recorded.
import type {
  CardPayments, HostedPaymentStart, HostedPaymentStarted, PaymentEnvironment, PaymentReport, PaymentState, SavedCardCharge
} from "@debateai/billing-core";

const STATUS_OF: Readonly<Record<PaymentState, string>> = Object.freeze({
  PENDING: "1", AUTHORIZED: "2", PAID: "3", VOIDED: "4", REFUNDED: "8", CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10",
  FAILED: "11", DECLINED: "12", ACTION_REQUIRED: "15", CHARGEBACK_REPRESENTED: "16", UNCLEAR: "17", EXPIRED: "23"
});

/** A NETOPIA report for `orderId`; its ntpID is derived from the order, so a probe and a resend agree. */
export function stubPaymentReport(orderId: string, state: PaymentState, overrides: Partial<PaymentReport> = {}): PaymentReport {
  return Object.freeze({
    orderId, providerPaymentId: `ntp-${orderId.slice(0, 12)}`, state, providerStatus: STATUS_OF[state], amountMicros: 24_200_000,
    currency: "USD", cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false,
    occurredAt: null, clientId: null, ...overrides
  });
}

type StatusRead = Readonly<{ orderId: string; providerPaymentId: string | null }>;
type RefundCall = Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>;

export class StubCardPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment: PaymentEnvironment;
  /** What a status read answers for an order when nothing is scripted; a charge's or refund's report is kept here too. */
  readonly reports = new Map<string, PaymentReport>();
  readonly hosted: HostedPaymentStart[] = [];
  readonly charges: SavedCardCharge[] = [];
  readonly statusReads: StatusRead[] = [];
  readonly refundCalls: RefundCall[] = [];
  /** Absent unless `withRefund` (spec §2.12.2: RefundDesk's owner mode needs the port without one). */
  declare readonly refund?: (input: RefundCall) => Promise<PaymentReport>;
  readonly #starts = new Map<string, Array<HostedPaymentStarted | Error>>();
  readonly #charges = new Map<string, Array<PaymentReport | Error>>();
  readonly #statuses = new Map<string, Array<PaymentReport | "NO_SUCH_ORDER" | Error>>();

  constructor(options: Readonly<{ environment?: PaymentEnvironment; withRefund?: boolean }> = {}) {
    this.environment = options.environment ?? "sandbox";
    if (options.withRefund === true) {
      this.refund = async (input: RefundCall): Promise<PaymentReport> => {
        this.refundCalls.push(input);
        const report = stubPaymentReport(input.orderId, "REFUNDED", { providerPaymentId: input.providerPaymentId });
        this.reports.set(input.orderId, report);
        return report;
      };
    }
  }

  get startCalls(): number { return this.hosted.length; }
  get chargeCalls(): number { return this.charges.length; }
  get statusCalls(): number { return this.statusReads.length; }

  scriptStart(orderId: string, ...outcomes: Array<HostedPaymentStarted | Error>): void {
    this.#starts.set(orderId, [...(this.#starts.get(orderId) ?? []), ...outcomes]);
  }
  scriptCharge(orderId: string, ...outcomes: Array<PaymentReport | Error>): void {
    this.#charges.set(orderId, [...(this.#charges.get(orderId) ?? []), ...outcomes]);
  }
  scriptStatus(orderId: string, ...outcomes: Array<PaymentReport | "NO_SUCH_ORDER" | Error>): void {
    this.#statuses.set(orderId, [...(this.#statuses.get(orderId) ?? []), ...outcomes]);
  }

  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    this.hosted.push(input);
    const next = this.#starts.get(input.orderId)?.shift()
      ?? { providerPaymentId: `ntp-${input.orderId.slice(0, 12)}`, redirectUrl: `https://secure-sandbox.netopia-payments.com/ui/card?p=${input.orderId}` };
    if (next instanceof Error) throw next;
    return next;
  }

  async chargeSavedCard(input: SavedCardCharge): Promise<PaymentReport> {
    this.charges.push(input);
    const next = this.#charges.get(input.orderId)?.shift() ?? stubPaymentReport(input.orderId, "PENDING");
    if (next instanceof Error) throw next;
    this.reports.set(input.orderId, next);
    return next;
  }

  async status(input: StatusRead): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    this.statusReads.push(input);
    const next = this.#statuses.get(input.orderId)?.shift() ?? this.reports.get(input.orderId) ?? "NO_SUCH_ORDER";
    if (next instanceof Error) throw next;
    // A scripted report becomes the order's current status, as NETOPIA's would stay until it changes.
    if (next !== "NO_SUCH_ORDER") this.reports.set(input.orderId, next);
    return next;
  }
}
