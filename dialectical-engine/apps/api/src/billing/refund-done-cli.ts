/**
 * Spec §2.12.2 item 4 (ruling C-3) — the owner records a refund they made in NETOPIA's admin:
 *
 *   pnpm billing:refund-done --charge <32-hex charge ref> --amount <decimal, e.g. 12.10> [--confirm] [--despite-chargeback]
 *
 * Without --confirm it only prints what it would record and what the customer's email will say. With it, it records
 * REFUNDED at that amount (never above the open request); a smaller amount keeps the rest open and reminded, and the
 * email and the credit note follow the part that closes the request. Runs under `systemd-run` with the API's
 * EnvironmentFile, as the API's principal. A refusal is ONE code on stderr (USAGE exits 2, the others exit 1).
 *
 * N15b (ruling PR-41): a refund held by a charge-back on its payment is refused (BILLING_REFUND_DONE_HELD_BY_CHARGEBACK)
 * unless --despite-chargeback says the owner had already made it in NETOPIA's admin before the dispute arrived.
 */
import { pathToFileURL } from "node:url";
import { decimalToMicros, microsToDecimal } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { netopiaEnvironmentOf } from "@debateai/payments-netopia";
import { loadBillingRefundDoneEnvironment, readBillingPolicy } from "@debateai/register";
import { consoleBillingAudit } from "./audit.js";
import { openBillingOperatorPool } from "./operator-connection.js";
import { RefundDesk, type OwnerRefundPlan } from "./refunds.js";

export type RefundDoneArguments = Readonly<{ chargeRef: string; amountMicros: number; confirm: boolean; despiteChargeback: boolean }>;
export type RefundDoneResult = "RECORDED" | "PART_RECORDED" | "ALREADY_RECORDED";
export type RefundDoneCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenRefundDoneRecorder = () => Promise<Readonly<{
  plan(input: RefundDoneArguments): Promise<OwnerRefundPlan>;
  record(input: RefundDoneArguments): Promise<RefundDoneResult>;
  close(): Promise<void>;
}>>;

const CHARGE_REF = /^[0-9a-f]{32}$/u;
const DECIMAL = /^[0-9]{1,7}(\.[0-9]{1,2})?$/u;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

export function parseRefundDoneArguments(args: readonly string[]): RefundDoneArguments {
  const values = new Map<string, string>();
  let confirm = false;
  let despiteChargeback = false;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--confirm") {
      if (confirm) throw new TypeError("BILLING_REFUND_DONE_USAGE");
      confirm = true;
      continue;
    }
    if (name === "--despite-chargeback") {
      if (despiteChargeback) throw new TypeError("BILLING_REFUND_DONE_USAGE");
      despiteChargeback = true;
      continue;
    }
    const value = args[index + 1];
    if ((name !== "--charge" && name !== "--amount") || value === undefined || values.has(name)) {
      throw new TypeError("BILLING_REFUND_DONE_USAGE");
    }
    values.set(name, value);
    index += 1;
  }
  const chargeRef = values.get("--charge");
  const amount = values.get("--amount");
  if (chargeRef === undefined || !CHARGE_REF.test(chargeRef) || amount === undefined || !DECIMAL.test(amount)) {
    throw new TypeError("BILLING_REFUND_DONE_USAGE");
  }
  const amountMicros = decimalToMicros(amount);
  if (amountMicros <= 0) throw new TypeError("BILLING_REFUND_DONE_USAGE");
  return Object.freeze({ chargeRef, amountMicros, confirm, despiteChargeback });
}

const money = (micros: number, currency: string): string => `${microsToDecimal(micros)} ${currency}`;

/** What the command will record and what the customer will read (spec §2.12.2 item 4, SR-29). */
export function renderRefundDonePlan(plan: OwnerRefundPlan, confirm: boolean): string {
  const lines = [
    `Charge ${plan.chargeId}, NETOPIA payment ${plan.providerPaymentId}: record a refund of ${money(plan.amountMicros, plan.currency)}`
      + ` (reason ${plan.reason}).`,
    `Open before: ${money(plan.openMicros, plan.currency)}. Still open after: ${money(plan.restMicros, plan.currency)}.`,
    plan.restMicros > 0
      ? "No email yet: the customer's email and the credit note follow when the rest is recorded."
      : plan.mail === null ? "No email follows this refund." : `The customer's email (${plan.mail.template}) will say:\n  ${plan.mail.text.replaceAll("\n", "\n  ")}`,
    ...(confirm ? [] : ["Nothing was recorded. Run the same command with --confirm to record it."])
  ];
  return `${lines.join("\n")}\n`;
}

export function renderRefundDoneResult(result: RefundDoneResult, plan: OwnerRefundPlan): string {
  switch (result) {
    case "RECORDED":
      return `Recorded. The refund on charge ${plan.chargeId} is complete; the customer's email and the credit note follow.\n`;
    case "PART_RECORDED":
      return `Recorded ${money(plan.amountMicros, plan.currency)} on charge ${plan.chargeId}. ${money(plan.restMicros, plan.currency)}`
        + " is still open and stays in the owner's reminders.\n";
    case "ALREADY_RECORDED":
      return `The refund on charge ${plan.chargeId} was already recorded; nothing was written.\n`;
    default:
      return exhaustive(result);
  }
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError && PRINTABLE_CODE.test(error.code)) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_REFUND_DONE_FAILED";
}

export async function runBillingRefundDoneCli(
  args: readonly string[], output: RefundDoneCliOutput, open: OpenRefundDoneRecorder
): Promise<number> {
  let input: RefundDoneArguments;
  try {
    input = parseRefundDoneArguments(args);
  } catch {
    output.stderr("BILLING_REFUND_DONE_USAGE\n");
    return 2;
  }
  try {
    const recorder = await open();
    try {
      const plan = await recorder.plan(input);
      output.stdout(renderRefundDonePlan(plan, input.confirm));
      if (input.confirm) output.stdout(renderRefundDoneResult(await recorder.record(input), plan));
      return 0;
    } finally {
      await recorder.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

const notHere = async (): Promise<never> => {
  throw new TypedDomainError("PAYMENT_PROVIDER_UNAVAILABLE", "the owner's command never calls a payment provider");
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingRefundDoneCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadBillingRefundDoneEnvironment();
    const paymentEnvironment = netopiaEnvironmentOf(environment.NETOPIA_API_BASE_URL.replace(/\/+$/u, ""));
    if (paymentEnvironment === null) throw new TypeError("BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM");
    const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
      production: environment.NODE_ENV === "production", readOnly: false, max: 2
    });
    try {
      const policy = await readBillingPolicy(pool, environment.REGISTER_VERSION);
      if (policy === null) throw new TypeError("BILLING_REFUND_DONE_REGISTER_UNRESOLVED");
      const billing = new BillingRepository(pool);
      const jobs = new BillingJobQueries(pool);
      const desk = new RefundDesk({
        repository: billing, jobs, policy, audit: consoleBillingAudit, clock: () => new Date(),
        netopia: { payments: { status: notHere }, paymentEnvironment, jobs }
      });
      const plan = (input: RefundDoneArguments) => desk.planOwnerRefund(input.chargeRef, input.amountMicros, {
        despiteChargeback: input.despiteChargeback
      });
      return Object.freeze({
        plan, record: async (input: RefundDoneArguments) => desk.recordOwnerRefund(await plan(input), new Date()), close: () => pool.end()
      });
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw error;
    }
  });
}
