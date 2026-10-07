/**
 * Spec §2.5.6 withdrawal, when the person withdrew outside Settings — by email, or with the model form M1 attaches
 * (a consumer may withdraw by any clear statement). The owner carries it out:
 *
 *   pnpm billing:withdraw --owner <owner ref> [--received <UTC instant, e.g. 2026-10-12T08:30:00Z>]
 *   pnpm billing:withdraw --owner <owner ref> --refund <amount through RefundDesk, e.g. 12.10> [--dashboard <amount
 *     the owner refunded in the xMoney dashboard for this withdrawal, e.g. 5.00>]
 *
 * The first (R2 Q-9) records the withdrawal as of the instant the statement arrived — now, unless `--received` names
 * an earlier arrival — through P12d's `recordWithdrawal`; the second settles one P12d handed to the owner, and M8
 * names the sum of both amounts. On the host it runs under `systemd-run` with the API's EnvironmentFile and
 * writes as the API's own principal; it never calls xMoney (the API's outbox moves the money). It prints one plain
 * line; a refusal is ONE code on stderr (`BILLING_WITHDRAW_USAGE` exits 2, the others exit 1).
 */
import { pathToFileURL } from "node:url";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { PostgresModelSpendStore } from "@debateai/budget";
import { decimalToMicros, foldSubscription, microsToDecimal } from "@debateai/billing-core";
import {
  BillingJobQueries,
  BillingRepository,
  EntitlementRepository,
  type ChargeEventRow,
  type ChargeRow,
  type CustomerXMoneyEnvironment,
  type Pool
} from "@debateai/db";
import {
  loadBillingWithdrawEnvironment,
  readBillingPlans,
  readBillingPolicy,
  type BillingPlans,
  type BillingPolicy
} from "@debateai/register";
import { xmoneyEnvironmentOf, type XMoneyClient } from "@debateai/payments-xmoney";
import { consoleBillingAudit, type BillingAudit } from "./audit.js";
import { enqueueEmail } from "./email-job.js";
import { openBillingOperatorPool } from "./operator-connection.js";
import { allocateRefund, paidTransactions, RefundDesk } from "./refunds.js";
import { BillingRefusal } from "./refusal.js";
import { refuse } from "./subscription-core.js";
import { recordWithdrawal, type WithdrawalDeps } from "./withdrawal.js";

export type WithdrawArguments =
  /** `receivedAt` null: no `--received` was given, so the statement counts as received when the command runs. */
  | Readonly<{ kind: "RECORD"; ownerRef: string; receivedAt: Date | null }>
  /** `dashboardMicros`: what the owner refunded in the xMoney dashboard for this withdrawal (0 without `--dashboard`). */
  | Readonly<{ kind: "SETTLE"; ownerRef: string; refundMicros: number; dashboardMicros: number }>;
export type WithdrawResult =
  | Readonly<{ kind: "REFUNDING"; refundMicros: number }>
  | Readonly<{ kind: "NOTHING_DUE" }>
  | Readonly<{ kind: "OWNER_REVIEW" }>
  | Readonly<{ kind: "SETTLED"; refundMicros: number; dashboardMicros: number }>;
/** P12d's withdrawal inputs over the operator pool. */
export type WithdrawStores = WithdrawalDeps;
export type WithdrawCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenWithdrawCommand = () => Promise<Readonly<{
  run(input: WithdrawArguments): Promise<WithdrawResult>;
  close(): Promise<void>;
}>>;

/** Owner refs are lower-case UUIDs (B5). */
const OWNER_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** A UTC instant, so the arrival is never read in the host's zone. */
const INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$/u;
const AMOUNT = /^(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

export function parseWithdrawArguments(args: readonly string[]): WithdrawArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if ((name !== "--owner" && name !== "--received" && name !== "--refund" && name !== "--dashboard")
      || value === undefined || values.has(name)) {
      throw new TypeError("BILLING_WITHDRAW_USAGE");
    }
    values.set(name, value);
  }
  const ownerRef = values.get("--owner");
  const received = values.get("--received");
  const refund = values.get("--refund");
  const dashboard = values.get("--dashboard");
  if (ownerRef === undefined || !OWNER_REF.test(ownerRef)) throw new TypeError("BILLING_WITHDRAW_USAGE");
  // R2 Q-9's form: `--owner <ref>` alone records the withdrawal as received now.
  if (received === undefined && refund === undefined && dashboard === undefined) {
    return Object.freeze({ kind: "RECORD" as const, ownerRef, receivedAt: null });
  }
  if (received !== undefined && refund === undefined && dashboard === undefined && INSTANT.test(received)) {
    const receivedAt = new Date(received);
    if (Number.isFinite(receivedAt.getTime())) return Object.freeze({ kind: "RECORD" as const, ownerRef, receivedAt });
  }
  // The dashboard part belongs to a settlement only, in the same whole-cents format.
  if (refund !== undefined && received === undefined && AMOUNT.test(refund)
    && (dashboard === undefined || AMOUNT.test(dashboard))) {
    return Object.freeze({
      kind: "SETTLE" as const, ownerRef, refundMicros: decimalToMicros(refund),
      dashboardMicros: dashboard === undefined ? 0 : decimalToMicros(dashboard)
    });
  }
  throw new TypeError("BILLING_WITHDRAW_USAGE");
}

const notHere = async (): Promise<never> => {
  throw new TypedDomainError("XMONEY_UNAVAILABLE", "the owner's command never calls xMoney: the API's outbox moves the money");
};
/**
 * RefundDesk only writes intents here (A4a); its handler runs in the API, which holds the xMoney key. Annotated with
 * the constructor's whole xMoney Pick, so a member P9b's desk adds later is reported here, at the definition.
 */
const NO_XMONEY_HERE: Pick<XMoneyClient, "refund" | "getTransaction" | "listTransactions"> = Object.freeze({
  refund: notHere, getTransaction: notHere, listTransactions: notHere
});

/**
 * The command's stores over its operator pool: the same classes the API composes, so the shipped setup is tested.
 * `xmoneyEnvironment` is the API's xMoney system, from the same EnvironmentFile (D5 5h, P2-I4): a plan of the other
 * system is refused, since the API's outbox could never refund it.
 */
export function withdrawStoresFor(pool: Pool, input: Readonly<{
  policy: BillingPolicy; plans: BillingPlans; audit: BillingAudit; clock: () => Date;
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>): WithdrawStores {
  const billing = new BillingRepository(pool);
  const jobs = new BillingJobQueries(pool);
  return Object.freeze({
    billing, jobs, entitlements: new EntitlementRepository(pool), plans: input.plans, policy: input.policy,
    ownerSpend: new PostgresModelSpendStore(pool),
    refunds: new RefundDesk({
      repository: billing, jobs, xmoney: NO_XMONEY_HERE, policy: input.policy, audit: input.audit, clock: input.clock,
      xmoneyEnvironment: input.xmoneyEnvironment
    }),
    audit: input.audit, clock: input.clock, xmoneyEnvironment: input.xmoneyEnvironment,
    // No outbox runs in this process: the API's worker takes the XMONEY_REFUND jobs at its next tick.
    kick: () => undefined
  });
}

/** `--received`: P12d's withdrawal as of the arrival; the owner's command is the authorization (no step-up grant). */
export async function recordOwnerWithdrawal(
  stores: WithdrawStores, input: Readonly<{ ownerRef: string; receivedAt: Date }>
): Promise<WithdrawResult> {
  if (input.receivedAt.getTime() > stores.clock().getTime()) throw new TypeError("BILLING_WITHDRAW_RECEIVED_IN_FUTURE");
  const outcome = await recordWithdrawal(stores, {
    ownerRef: input.ownerRef, withdrewAt: input.receivedAt, source: "OWNER", authorize: async () => undefined
  });
  if (outcome.refundMicros === null) return Object.freeze({ kind: "OWNER_REVIEW" as const });
  return outcome.refundMicros === 0
    ? Object.freeze({ kind: "NOTHING_DUE" as const })
    : Object.freeze({ kind: "REFUNDING" as const, refundMicros: outcome.refundMicros });
}

/**
 * `--refund` / `--dashboard`: the settlement of a withdrawal handed to the owner. The `--refund` amount goes back
 * through RefundDesk only on the payments no dashboard refund touched, newest first (more than they hold is
 * REFUND_EXCEEDS_CHARGE, and the transaction writes nothing: the owner refunds that part in the dashboard first). The
 * `--dashboard` amount — what the owner refunded in the xMoney dashboard for this withdrawal — is recorded once, in
 * P12a's `billing.withdrawal_owner_settlement`, in the same transaction; both together may not exceed what the
 * withdrawal's payments took (a typo, BILLING_WITHDRAW_EXCEEDS_PAID). M8 names the sum: RefundDesk's WITHDRAWAL
 * follow-up sends it after the last refund, or it goes now when nothing moves through RefundDesk. P2-M7: when both
 * parts are zero it carries `ownerSettled` "true", so it says only that nothing more is due back (the money had
 * usually gone back already); never P12d's "the part you already used covers the whole price".
 */
export async function settleOwnerWithdrawal(
  stores: WithdrawStores, input: Readonly<{ ownerRef: string; refundMicros: number; dashboardMicros: number }>
): Promise<WithdrawResult> {
  const now = stores.clock();
  const refunds = await stores.billing.withTransaction(async (client) => {
    await stores.jobs.lockOwner(client, input.ownerRef);
    const waiting = (await stores.billing.withdrawalsAwaitingOwner(input.ownerRef, client))[0];
    if (waiting === undefined) throw new TypeError("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    const events = await stores.billing.subscriptionEvents(waiting.subscriptionId, client);
    const folded = foldSubscription(events);
    // D5 5h (P2-I4): its payments live in the other xMoney system, where the API's outbox cannot refund them.
    if (folded.paymentProvider !== "xmoney" || folded.paymentEnvironment !== stores.xmoneyEnvironment) refuse(409, "NOT_SUBSCRIBED");
    const activatedAt = folded.activatedAt;
    const withdrawn = events.find((event) => event.kind === "WITHDRAWN");
    if (activatedAt === null || withdrawn === undefined) throw new TypeError("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    const charges: Array<ChargeRow & { events: ChargeEventRow[] }> = [];
    for (const row of await stores.billing.chargesForSubscription(waiting.subscriptionId, client)) {
      const read = await stores.billing.charge(row.chargeId, client);
      if (read !== null) charges.push(read);
    }
    const paid = paidTransactions(charges, activatedAt);
    const untouched = paid.filter((row) => !row.providerRefunded);
    const allocations = allocateRefund(input.refundMicros, untouched);
    const paidMicros = paid.reduce((total, row) => total + row.paidMicros, 0);
    if (input.refundMicros + input.dashboardMicros > paidMicros) throw new TypeError("BILLING_WITHDRAW_EXCEEDS_PAID");
    await stores.refunds.requestAll(client, { ownerRef: input.ownerRef, reason: "WITHDRAWAL", allocations, at: now });
    // The one mark of a settlement (a second one is refused by `withdrawalsAwaitingOwner` and the table's key).
    await stores.billing.recordWithdrawalOwnerSettlement(client, {
      subscriptionId: waiting.subscriptionId, withdrawnEventId: withdrawn.eventId, ownerRef: input.ownerRef,
      dashboardRefundMicros: input.dashboardMicros, settledAt: now
    });
    if (allocations.length === 0) {
      const customer = await stores.billing.customerByOwner(input.ownerRef, undefined, client);
      if (customer !== null) {
        await enqueueEmail(stores.billing, client, {
          template: "M8", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
          dedupeRef: waiting.subscriptionId,
          params: {
            plan: waiting.planId, refundAmount: microsToDecimal(input.dashboardMicros),
            ...(input.dashboardMicros === 0 && input.refundMicros === 0 ? { ownerSettled: "true" } : {})
          },
          notBefore: now
        });
      }
    }
    return allocations.length;
  });
  stores.audit("billing.withdrawal.settled", { refunds });
  if (refunds > 0) stores.kick();
  return Object.freeze({ kind: "SETTLED" as const, refundMicros: input.refundMicros, dashboardMicros: input.dashboardMicros });
}

export async function runWithdrawCommand(stores: WithdrawStores, input: WithdrawArguments): Promise<WithdrawResult> {
  return input.kind === "RECORD"
    ? recordOwnerWithdrawal(stores, { ownerRef: input.ownerRef, receivedAt: input.receivedAt ?? stores.clock() })
    : settleOwnerWithdrawal(stores, {
      ownerRef: input.ownerRef, refundMicros: input.refundMicros, dashboardMicros: input.dashboardMicros
    });
}

export function renderWithdrawResult(result: WithdrawResult, input: WithdrawArguments): string {
  const owner = `owner ${input.ownerRef}`;
  switch (result.kind) {
    case "REFUNDING":
      return `The withdrawal of ${owner} is recorded: the plan has ended and ${microsToDecimal(result.refundMicros)} USD`
        + " goes back to the card. M8 follows once the refund is done.\n";
    case "NOTHING_DUE":
      return `The withdrawal of ${owner} is recorded: the plan has ended and nothing was due back. M8 is queued.\n`;
    case "OWNER_REVIEW":
      return `The withdrawal of ${owner} is recorded and the plan has ended, but a refund made in the xMoney dashboard`
        + " touched a payment, so nothing was refunded. Check the dashboard: refund there what this command cannot take"
        + " back (a payment the dashboard refund touched), then, within 14 days of the withdrawal, run"
        + ` pnpm billing:withdraw --owner ${input.ownerRef} --refund <amount through this command>`
        + " --dashboard <amount refunded in the dashboard>. M8 names the sum.\n";
    case "SETTLED":
      if (result.refundMicros === 0) {
        return result.dashboardMicros === 0
          ? `The withdrawal of ${owner} is settled: nothing more goes back. M8 is queued.\n`
          : `The withdrawal of ${owner} is settled: ${microsToDecimal(result.dashboardMicros)} USD was refunded in the`
            + " dashboard. M8 is queued.\n";
      }
      return `The withdrawal of ${owner} is settled: ${microsToDecimal(result.refundMicros)} USD goes back to the card`
        + (result.dashboardMicros === 0 ? ""
          : ` and ${microsToDecimal(result.dashboardMicros)} USD was refunded in the dashboard`
            + ` (M8 says ${microsToDecimal(result.refundMicros + result.dashboardMicros)})`)
        + ". M8 follows once the refund is done.\n";
    default:
      return exhaustive(result);
  }
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError || error instanceof BillingRefusal) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_WITHDRAW_FAILED";
}

export async function runBillingWithdrawCli(
  args: readonly string[], output: WithdrawCliOutput, open: OpenWithdrawCommand
): Promise<number> {
  let input: WithdrawArguments;
  try {
    input = parseWithdrawArguments(args);
  } catch {
    output.stderr("BILLING_WITHDRAW_USAGE\n");
    return 2;
  }
  try {
    const command = await open();
    try {
      output.stdout(renderWithdrawResult(await command.run(input), input));
      return 0;
    } finally {
      await command.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingWithdrawCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadBillingWithdrawEnvironment();
    const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
      production: environment.NODE_ENV === "production", readOnly: false, max: 2
    });
    try {
      const policy = await readBillingPolicy(pool, environment.REGISTER_VERSION);
      const plans = await readBillingPlans(pool, environment.REGISTER_VERSION);
      if (policy === null || plans === null) throw new TypeError("BILLING_WITHDRAW_REGISTER_UNRESOLVED");
      const stores = withdrawStoresFor(pool, {
        policy, plans, audit: consoleBillingAudit, clock: () => new Date(),
        xmoneyEnvironment: xmoneyEnvironmentOf(environment.XMONEY_API_BASE_URL)
      });
      return Object.freeze({ run: (input: WithdrawArguments) => runWithdrawCommand(stores, input), close: () => pool.end() });
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw error;
    }
  });
}
