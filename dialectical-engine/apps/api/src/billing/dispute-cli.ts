/**
 * A9 — the owner records a card dispute's outcome, which xMoney does not signal:
 *
 *   pnpm billing:dispute --charge <32-hex charge ref> --outcome won|lost
 *
 * On the host it runs under `systemd-run` with the API's EnvironmentFile and writes as the API's own principal.
 * It prints one plain line; a refusal is ONE code on stderr (`BILLING_DISPUTE_USAGE` exits 2, the others exit 1).
 */
import { pathToFileURL } from "node:url";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import { loadBillingOperatorEnvironment } from "@debateai/register";
import { openBillingOperatorPool } from "./operator-connection.js";
import { chargeEvent } from "./rows.js";
import { appendChecked, lockedSubscription } from "./subscription-core.js";

export type DisputeArguments = Readonly<{ chargeRef: string; outcome: "won" | "lost" }>;
/** SECOND_PAYMENT: the dispute was about a second payment of the order (D5 5f), which never changed the plan. */
export type DisputeResult = "RESUMED" | "RESOLVED_AFTER_END" | "ENDED_DISPUTE" | "ALREADY_SETTLED" | "SECOND_PAYMENT";
export type DisputeStores = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  entitlements: EntitlementRepository;
  clock: () => Date;
}>;
export type DisputeCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenDisputeRecorder = () => Promise<Readonly<{
  record(input: DisputeArguments): Promise<DisputeResult>;
  close(): Promise<void>;
}>>;

const CHARGE_REF = /^[0-9a-f]{32}$/u;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

export function parseDisputeArguments(args: readonly string[]): DisputeArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if ((name !== "--charge" && name !== "--outcome") || value === undefined || values.has(name)) {
      throw new TypeError("BILLING_DISPUTE_USAGE");
    }
    values.set(name, value);
  }
  const chargeRef = values.get("--charge");
  const outcome = values.get("--outcome");
  if (chargeRef === undefined || !CHARGE_REF.test(chargeRef) || (outcome !== "won" && outcome !== "lost")) {
    throw new TypeError("BILLING_DISPUTE_USAGE");
  }
  return Object.freeze({ chargeRef, outcome });
}

export async function recordDisputeOutcome(stores: DisputeStores, input: DisputeArguments): Promise<DisputeResult> {
  const charge = await stores.billing.charge(input.chargeRef);
  if (charge === null) throw new TypeError("BILLING_DISPUTE_CHARGE_NOT_FOUND");
  // D5 5f: a second payment of the order is a DUPLICATE_PAYMENT on this charge; its charge-back never suspended the
  // plan. The dispute to settle is the subscription's own charge-back (newest first), else a second payment's.
  const secondPayments = new Set(charge.events.filter((event) => event.kind === "DUPLICATE_PAYMENT")
    .map((event) => event.xmoneyTransactionId));
  const chargebacks = [...charge.events].reverse()
    .filter((event) => event.kind === "CHARGEBACK" && event.xmoneyTransactionId !== null);
  const chargeback = chargebacks.find((event) => !secondPayments.has(event.xmoneyTransactionId)) ?? chargebacks[0];
  if (chargeback === undefined || chargeback.xmoneyTransactionId === null) throw new TypeError("BILLING_DISPUTE_NO_CHARGEBACK");
  // One CHARGEBACK_RESOLVED per transaction: a dispute is settled when its own transaction has one.
  if (charge.events.some((event) => event.kind === "CHARGEBACK_RESOLVED"
    && event.xmoneyTransactionId === chargeback.xmoneyTransactionId)) {
    return "ALREADY_SETTLED";
  }
  const first = (await stores.billing.subscriptionEvents(charge.subscriptionId))[0];
  if (first === undefined) throw new TypeError("BILLING_DISPUTE_SUBSCRIPTION_NOT_FOUND");
  const now = stores.clock();
  if (secondPayments.has(chargeback.xmoneyTransactionId)) {
    // The plan never changed for it: a lost dispute writes nothing, a won one records the money on that transaction.
    if (input.outcome === "lost") return "SECOND_PAYMENT";
    return stores.billing.withTransaction(async (client): Promise<DisputeResult> => {
      await stores.jobs.lockOwner(client, first.ownerRef);
      const written = await stores.billing.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK_RESOLVED", now, {
        xmoneyTransactionId: chargeback.xmoneyTransactionId, amountMicros: chargeback.amountMicros ?? charge.totalMicros,
        errorCode: null
      }));
      return written === "DUPLICATE" ? "ALREADY_SETTLED" : "SECOND_PAYMENT";
    });
  }
  return stores.billing.withTransaction(async (client): Promise<DisputeResult> => {
    const locked = await lockedSubscription(stores, client, first.ownerRef);
    const suspended = locked !== null && locked.state.subscriptionId === charge.subscriptionId
      && locked.state.status === "SUSPENDED" ? locked : null;
    if (input.outcome === "won") {
      const written = await stores.billing.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK_RESOLVED", now, {
        xmoneyTransactionId: chargeback.xmoneyTransactionId, amountMicros: chargeback.amountMicros ?? charge.totalMicros,
        errorCode: null
      }));
      if (written === "DUPLICATE") return "ALREADY_SETTLED";
      // A8b, P11b's sweep check: a suspension whose paid period is over is ended (ENDED(DISPUTE)), never resumed,
      // even when the sweep has not run yet. Resuming it would make an unpaid, ended period read ACTIVE for ever.
      const periodEnd = suspended?.state.currentPeriodEnd ?? null;
      if (suspended === null || suspended.state.periodAnchorAt === null
        || periodEnd === null || periodEnd.getTime() <= now.getTime()) {
        return "RESOLVED_AFTER_END";
      }
      // A6: the credit this period had before the charge-back (an upgrade's prorated override), not the plan's full one.
      const override = suspended.state.currentPeriodStart === null ? null : await stores.billing.periodCreditOverride({
        subscriptionId: suspended.state.subscriptionId, planId: suspended.state.planId,
        since: suspended.state.currentPeriodStart, until: now
      }, client);
      await appendChecked(stores.billing, client, suspended, { kind: "RESUMED", at: now });
      await stores.entitlements.append(client, {
        ownerRef: suspended.state.ownerRef, planId: suspended.state.planId, periodAnchorAt: suspended.state.periodAnchorAt,
        cause: "RESUMED", effectiveAt: now, subscriptionId: suspended.state.subscriptionId,
        paidThrough: suspended.state.currentPeriodEnd, monthCreditOverrideMicros: override
      });
      return "RESUMED";
    }
    if (suspended === null) return "ALREADY_SETTLED";
    await appendChecked(stores.billing, client, suspended, { kind: "ENDED", at: now, data: { cause: "DISPUTE" } });
    return "ENDED_DISPUTE";
  });
}

export function renderDisputeResult(result: DisputeResult, input: DisputeArguments): string {
  switch (result) {
    case "RESUMED":
      return `The dispute on charge ${input.chargeRef} was won: the paid features are back until the period ends.\n`;
    case "RESOLVED_AFTER_END":
      return `The dispute on charge ${input.chargeRef} was won. The subscription's paid period had already ended, so it is not resumed; the person subscribes again to use a paid plan.\n`;
    case "ENDED_DISPUTE":
      return `The dispute on charge ${input.chargeRef} was lost: the subscription has ended and the person stays on Free.\n`;
    case "ALREADY_SETTLED":
      return `The dispute on charge ${input.chargeRef} was already settled; nothing was written.\n`;
    case "SECOND_PAYMENT":
      return `The dispute on charge ${input.chargeRef} was about a second payment of its order, which never changed the`
        + ` plan: ${input.outcome === "won" ? "the money is recorded as won back" : "nothing was written"}, and the plan is unchanged.\n`;
    default:
      return exhaustive(result);
  }
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_DISPUTE_FAILED";
}

export async function runBillingDisputeCli(
  args: readonly string[], output: DisputeCliOutput, open: OpenDisputeRecorder
): Promise<number> {
  let input: DisputeArguments;
  try {
    input = parseDisputeArguments(args);
  } catch {
    output.stderr("BILLING_DISPUTE_USAGE\n");
    return 2;
  }
  try {
    const recorder = await open();
    try {
      output.stdout(renderDisputeResult(await recorder.record(input), input));
      return 0;
    } finally {
      await recorder.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingDisputeCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadBillingOperatorEnvironment();
    const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
      production: environment.NODE_ENV === "production", readOnly: false, max: 2
    });
    const stores: DisputeStores = Object.freeze({
      billing: new BillingRepository(pool), jobs: new BillingJobQueries(pool),
      entitlements: new EntitlementRepository(pool), clock: () => new Date()
    });
    return Object.freeze({ record: (input: DisputeArguments) => recordDisputeOutcome(stores, input), close: () => pool.end() });
  });
}
