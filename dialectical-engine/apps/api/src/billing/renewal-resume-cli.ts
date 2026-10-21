/**
 * B1 part 2 (NETOPIA answers 2026-10-21, Q22: at most 3 saved-card tries a day) — the owner releases the renewals held
 * by our own setup's refusal:
 *
 *   pnpm billing:renewal-resume
 *
 * No arguments. A renewal NETOPIA refused for our API key or a setting of our account is not tried again by itself
 * (its O3, CHARGE_CREDENTIALS_REFUSED or CHARGE_CONFIGURATION_REFUSED, prints this command); once the cause is fixed,
 * this marks every such renewal for ONE more send (`resumeHeldRenewals`), which the API's renewal tick makes within a
 * minute. Runs under `systemd-run` with the API's EnvironmentFile, as the API's principal (README §14.2). Plain English
 * on stdout; exit 0. A refusal is ONE code on stderr (USAGE exits 2, the others exit 1).
 */
import { pathToFileURL } from "node:url";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { netopiaEnvironmentOf } from "@debateai/payments-netopia";
import { loadBillingRenewalResumeEnvironment } from "@debateai/register";
import { consoleBillingAudit } from "./audit.js";
import { openBillingOperatorPool } from "./operator-connection.js";
import { resumeHeldRenewals, type RenewalResumeResult } from "./renewal-resume.js";
import { billingClock } from "./stage-clock.js";

export type RenewalResumeCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenRenewalResumer = () => Promise<Readonly<{
  resume(): Promise<RenewalResumeResult>;
  close(): Promise<void>;
}>>;

const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

/** What the owner reads (owner-facing English, counts only). */
export function renderRenewalResumeResult(result: RenewalResumeResult): string {
  const lines = [
    result.resumed > 0
      ? `Sent again: ${result.resumed} held renewal(s) will each be tried once more within a minute`
        + " (later if that card was already tried twice in the last 24 hours)."
      : "Nothing to resume: no renewal is waiting for you.",
    ...(result.busy > 0 ? [`Busy: ${result.busy} renewal(s) were being worked on; run the command again in a minute.`] : [])
  ];
  return `${lines.join("\n")}\n`;
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError && PRINTABLE_CODE.test(error.code)) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_RENEWAL_RESUME_FAILED";
}

export async function runBillingRenewalResumeCli(
  args: readonly string[], output: RenewalResumeCliOutput, open: OpenRenewalResumer
): Promise<number> {
  if (args.length > 0) {
    output.stderr("BILLING_RENEWAL_RESUME_USAGE\n");
    return 2;
  }
  try {
    const resumer = await open();
    try {
      output.stdout(renderRenewalResumeResult(await resumer.resume()));
      return 0;
    } finally {
      await resumer.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingRenewalResumeCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadBillingRenewalResumeEnvironment();
    const paymentEnvironment = netopiaEnvironmentOf(environment.NETOPIA_API_BASE_URL.replace(/\/+$/u, ""));
    if (paymentEnvironment === null) throw new TypeError("BILLING_RENEWAL_RESUME_OTHER_PAYMENT_SYSTEM");
    // C6: the API's own billing clock (main.ts), so CHARGE_RESUMED is dated on the same clock as the charge it releases
    // (the OWNER-RUN sandbox's BILLING_STAGE_CLOCK_OFFSET_DAYS; refused against live, as the API refuses it).
    const { clock } = billingClock({ paymentEnvironment, offsetDays: environment.BILLING_STAGE_CLOCK_OFFSET_DAYS ?? null });
    const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
      production: environment.NODE_ENV === "production", readOnly: false, max: 2
    });
    const repository = new BillingRepository(pool);
    const jobs = new BillingJobQueries(pool);
    return Object.freeze({
      resume: () => resumeHeldRenewals({
        repository, jobs, paymentEnvironment, clock, audit: consoleBillingAudit
      }),
      close: () => pool.end()
    });
  });
}
