import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHostedRegisterFile } from "../../apps/runner/src/hosted-register-publish.js";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW,
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW
} from "@debateai/register";

const read = (path: string): string => readFileSync(resolve(path), "utf8");
const readme = read("deploy/vps/README.md");
const billing = readme.slice(readme.indexOf("## 14. Billing (paid plans)"));
/** §14.8's billing-on check (Part 4 final review C-10), exactly as its sh block holds it. */
const WAITING_PREMIUM_QUERY_LINE = String.raw`sudo -u postgres psql -d debateai -c "SELECT count(*) AS waiting_premium, count(*) FILTER (WHERE account.state <> 'active') AS of_accounts_not_active FROM core.run_wait w JOIN core.run r ON r.run_id = w.run_id JOIN identity.\"user\" account ON account.owner_ref = COALESCE((SELECT e.owner_ref FROM core.run_ownership_event e WHERE e.run_id = w.run_id ORDER BY e.at_seq DESC LIMIT 1), CASE WHEN r.asker_id LIKE 'owner:%' THEN substr(r.asker_id, 7)::uuid END) WHERE r.plan_tier IS DISTINCT FROM 'free' AND NOT EXISTS (SELECT 1 FROM core.run_wait_start s WHERE s.run_id = w.run_id) AND NOT EXISTS (SELECT 1 FROM core.work_item f WHERE f.run_id = w.run_id AND f.state = 'FAILED') AND NOT EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent i WHERE i.run_id = w.run_id) AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone t WHERE t.run_id = w.run_id)"`;

/** §14.8's fourth switch-off query (F6b, ops-2), the whole sh line. */
const OPEN_OWNER_REFUNDS_LINE = /^sudo -u postgres psql -d debateai -c "SELECT count\(\*\) AS open_owner_refunds [^\n]*"$/mu;

describe("P22 the Billing runbook", () => {
  it("exists as §14 and names every setting, key file and code an operator needs", () => {
    expect(readme).toContain("## 14. Billing (paid plans)");
    for (const needle of [
      "NETOPIA_API_BASE_URL", "NETOPIA_POS_SIGNATURE", "NETOPIA_API_KEY_PATH", "NETOPIA_IPN_KEYS_PATH",
      "QUADERNO_API_KEY_PATH", "QUADERNO_API_BASE_URL", "SMARTBILL_CREDENTIALS_PATH", "SMARTBILL_API_BASE_URL",
      "SMARTBILL_SERIES", "OWNER_REPORT_EMAIL_PATH", "PUBLIC_APP_URL",
      "RECORDS_KEY_PATH", "GEOIP_COUNTRY_DB_PATH", "TOR_EXIT_LIST_PATH",
      "RECORDS_KEY_PATH_MUST_BE_SEPARATE", "GEOIP_PATHS_REQUIRED",
      "--property=EnvironmentFile=/etc/debateai/api.env",
      "Country data — the GeoIP and Tor refresh",
      "debateai-geoip-refresh.timer",
      "billingPlans", "billingPolicy", "countryPolicy", "taxAuthorities",
      "pnpm billing:tax-summary --quarter", "pnpm billing:dispute", "IP Geolocation by DB-IP",
      "BILLING_CONFIGURATION_INCOMPLETE", "BILLING_REQUIRES_ENVELOPE_MEMBERS",
      // §14.2 and §14.7 (ruling R3-4, D5's R3-A): one source of the company facts, COMPANY, and its one mirror for
      // the API and the emails, SELLER_COMPANY; the CUI as digits only; the refusals while a tax code is bracketed.
      "apps/ui/public/payment-marks/visa.svg",
      // P2-M34 (W16 fix): the website reads the marks folder only at start, so copying the marks in needs a restart.
      "the list of files in that folder only when it starts, so after copying the files in, restart it with",
      "`systemctl restart debateai-ui`. Until then the footer shows them as broken images. No rebuild is needed.",
      "apps/ui/lib/legal/pages.ts", "COMPANY", "[RO…]",
      "packages/billing-core/src/company.ts", "SELLER_COMPANY", "BILLING_COMPANY_FACTS_UNVERIFIED",
      "The company's tax codes are not `api.env` settings", "as digits only, never with `RO`",
      "tests/unit/billing-seller-company.test.tsx",
      // P2-M35: the facts every billing email prints are refused while bracketed, like the CUI.
      "BILLING_COMPANY_FACTS_UNVERIFIED:registeredOffice", "BILLING_COMPANY_FACTS_UNVERIFIED:emails.general",
      "BILLING_COMPANY_FACTS_UNVERIFIED:legalName",
      // §14.8: billing off is only for a host with nothing live and nothing queued (the rule cannot silently go).
      "billing.subscription_latest_v", "open_billing_jobs", "Stopping sales, and switching billing off",
      // §14.8 (P14c judge, carried): a withdrawal handed to the owner and not settled yet also blocks billing off.
      "unsettled_owner_withdrawals", "billing.withdrawal_owner_settlement",
      // §14.8: the dispute list the owner reads the charge reference from.
      "billing.charge_event e JOIN billing.charge c",
      // §14.8 (P14b judge, carried): a charge-back is open while ITS OWN transaction has no CHARGEBACK_RESOLVED, a
      // second payment's charge-back is marked DUPLICATE_PAYMENT, and the command's two newer answers are named.
      "r.provider_payment_id = e.provider_payment_id", "e.error_code", "DUPLICATE_PAYMENT",
      "STILL_DISPUTED", "BILLING_DISPUTE_AMBIGUOUS",
      // §14.8 (D5 5h): no sandbox plan or charge left open when the host moves to live.
      "open_sandbox_subscriptions", "open_sandbox_charges",
      // §14.8 (P2-I4): and no sandbox refund, invoice or credit-note job still queued (the start-up check counts them).
      "open_sandbox_jobs",
      // §14.8 (W14, P2-I19): never on a host whose billing clock moved; the live start's safety net and its limit.
      "**Never take this path on a host that has ever run with `BILLING_STAGE_CLOCK_OFFSET_DAYS`**",
      "BILLING_RECORDS_DATED_AHEAD", "That is only a safety net: a month after such a",
      // §14.8 (W14, go-live rows 19 and 23): the read-back on the day (N25 pins its NETOPIA lines).
      "**Read the settings back before switching on.**",
      // §14.8 (W3 fix round 1): a sandbox withdrawal handed to the owner is settled before the switch, which refuses it.
      "If a sandbox withdrawal was handed to you", "while the host still points at the sandbox, with `pnpm billing:withdraw --owner",
      "After the switch the command refuses a sandbox plan (`NOT_SUBSCRIBED`), and the summary would list it for ever.",
      // §14.8 (W3 fix round 1): what closes by itself, and when; N25: a sandbox refund handed to the owner is recorded first.
      "An invoice or credit note that keeps failing is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, and then given up.",
      "A payment check is given up after at most about 31 hours.",
      "A refund handed to you in the sandbox (O2_REFUND_DUE) stays open until you record it",
      // §14.8 (W3 fix round 1): the third query counts the payment checks that name a sandbox charge, which the site
      // refuses beside a refund, invoice or credit note of the other system.
      "payment checks that name a sandbox charge",
      "(the site refuses a refund, invoice, credit note or payment check of another payment system)",
      // §14.8: sandbox records stay but are never sales (P1b's quarter summary reads live charges only).
      "they never count as sales", "the quarterly tax summary and its email read only live charges",
      // §14.5 (N25): the notify address's answers; the card marks' sentence holds "No rebuild is needed".
      "What the address answers", "`429`", "`503`", "No rebuild is needed",
      // §14.8 (ruling Q-9, D6b P14c): a withdrawal sent by email, carried out by the owner's command.
      "A withdrawal sent by email or on the model form", "pnpm billing:withdraw --owner", "--received", "--refund",
      "WITHDRAWAL_BY_OWNER", "identity_owner_ref",
      // §14.8 (D6b P14c): the dashboard part is refunded there first, then recorded with --dashboard; M8 names the sum.
      "First, in NETOPIA's admin,", '--dashboard "$DASHBOARD"',
      // §14.8 (ruling Q-1): an outage at renewal keeps the plan quietly for up to 3 days.
      "When NETOPIA or the tax service is down at a renewal", "retried quietly for up to 3 days",
      // §14.8 (P11a judge, carried): the renewal pass's two journal signals, and what each means.
      "\"event\":\"billing.renewal.report\"", "taxRefused", "[BILLING_RENEWAL_PENDING]",
      // §14.8 (W13, P2-I18): the brief's eight signals and the listing line are in the journal table, each with what to
      // do; the three daily listings fail on their own; a CUSTOMER_MISMATCH reaches the operator with the hand refund.
      "What billing writes to the API's journal",
      "| `[BILLING_RECONCILIATION_PENDING]` (a bare marker) |", "| `[BILLING_OUTBOX_PENDING]` (a bare marker) |",
      "| `[BILLING_ERASURE_SWEEP_PENDING]` (a bare marker) |", "| `[BILLING_OWNER_JOBS_PENDING]` (a bare marker) |",
      "| `\"event\":\"billing.outbox.dead\"`, with `kind`, `code` and `attempts` |",
      "| `\"event\":\"billing.outbox.alert_failed\"`, with `kind` and `code` |",
      "| `\"event\":\"billing.outbox.settle_failed\"`, with `kind`, `outcome` and `attempts` |",
      "| `\"event\":\"billing.payment.credentials_refused\"`, with `operation` |",
      // P2-M27: a quote the tax service refuses is its own signal (a wrong Quaderno key), never read as an outage.
      "| `\"event\":\"billing.quote.refused\"`, with `code` `TAX_SERVICE_REFUSED` and `reason` |",
      "| `\"event\":\"billing.invoice.unknown\"`, with `issuer`, `kind` and `code` |",
      "| `\"event\":\"billing.payment.mismatch\"`, with `code` or `chargeKind` |",
      "A status read that fails never causes it",
      // P4-H (the P4-B judge's forward, progress.md: P2-W4): REFUND_CHARGE_MISSING is backed by no record either.
      "`REFUND_NOT_REQUESTED`, `REFUND_CHARGE_MISSING` or `CREDIT_NOTE_REFUND_MISSING`: do not refund and do not issue a credit note",
      "`OTHER_PAYMENT_SYSTEM`, whatever the kind (a `RENEWAL_NOTICE` too): nothing to do on this host",
      "refund it there by hand",
      // W13 fix round 1: the alert promise is exact (O3 never for a dead O3; O2 comes from the refund itself, not for
      // REFUND_PAYLOAD_INVALID or a refund the queue stopped), a refused key keeps a renewal only for its window, and
      // only this host's environment's mismatches are acted on (N23 removed the listing row and its code needle).
      "except when the email that died is O3 itself", "(`REFUND_PAYLOAD_INVALID`)", "usually `OUTBOX_HANDLER_FAILED`",
      "lists every dead refund job whatever its code", "for up to 3 days past its due time (a payment retry: 24 hours)",
      "Fixing the key within that time",
      "Act only on rows of this host's environment",
      // §14.8 (ruling Q-5, N25): a refund owed reaches the owner at once, handed to them while the owner mode applies.
      "**A refund handed to you.**", "O2_REFUND_DUE",
      // §14.8 (W9, P2-I11, P2-M8): the acknowledgement of receipt, the owner's alert for a withdrawal settled by hand,
      // and a dead withdrawal refund's deadline and one-refund rule.
      "M8_RECEIVED", "O2_WITHDRAWAL", "the date the refund is due by", "in one refund",
      // W9 fix round 1 (F1): look first, never refund twice, and refund exactly the named amount (N25: the owner's
      // command records a part, so nothing is left for the accountant by hand).
      "Look at that payment in NETOPIA's admin first", "never refund it again",
      "refund exactly the amount the email names",
      // §14.4 (D6a's recurring net): a new price reaches only new subscriptions.
      "reaches only new subscriptions",
      // §14.8 (D6a P10b, D6b P16b): nobody reads the e-Factura status for you; the summary lists what to check,
      // and the owner records ANAF's answer with P16b's command.
      "e-Factura", "Romanian e-Factura documents to confirm", "pnpm billing:efactura-status --invoice",
      // §14.8 (W12, P2-I16, P2-I17): a dead invoice, credit note or email emails the owner (O3) and is listed; the
      // owner records a document found or issued by hand, or re-queues the job (SmartBill only once checked).
      "An invoice, a credit note or an email that was never sent", "O3", "Emails that never went out",
      "billing:invoice --charge \"$CHARGE_REF\" --kind \"$KIND\" --record \"$DOCUMENT\"",
      "billing:invoice --charge \"$CHARGE_REF\" --kind \"$KIND\" --requeue --confirm-not-issued",
      "that the document was NOT issued", "CREDIT_NOTE_REFUND_MISSING",
      "The changed amount is never charged until that notice has gone out",
      // P4-K (P2-W12, the owner's ruling of 3 October 2026, option (b)): a dashboard refund's line is settled by
      // recording the hand-made credit note with its amount; the quarter then subtracts it; one credit note per charge.
      "billing:invoice --charge \"$CHARGE_REF\" --kind CREDIT_NOTE --record \"$DOCUMENT\" --amount \"$AMOUNT\"",
      "- `--record` with `--amount`, for a `DASHBOARD_REFUND` line only",
      "tax summary subtracts the refund at that amount",
      "goes to your accountant",
      // §14.2 (ruling Q-12): the records key is escrowed with the other five secrets.
      "sixth secret", "RESTORE_DRILL_RECORDS_KEY bytes=32",
      // §14.7 (ruling Q-3): the Terms archive M1 attaches from is never pruned.
      "apps/ui/legal/archive/",
      // §14.4 (G5, final review Part 1a I-3): the switches come from their own example, and only once §5's
      // conditions hold; taxAuthorities is copied only to correct the code-owned text (P16a judge, carried).
      "deploy/vps/register/country-policy.example.json", "only to correct the text",
      // §14.8 (main.ts billing-runtime stage, the publish's boot check): billing on needs countryPolicy; a dry run does
      // not catch it, the publish seals the version and refuses it by name.
      "HOSTED_REGISTER_BOOT_CHECK_FAILED:BILLING_CONFIGURATION_INCOMPLETE"
    ]) {
      expect(billing, needle).toContain(needle);
    }
    // W12 fix F5: every code pnpm billing:invoice can print is explained, with what to do.
    const invoiceCli = read("apps/api/src/billing/invoice-cli.ts");
    const printed = [...new Set(invoiceCli.match(/BILLING_INVOICE_[A-Z_]+/gu) ?? [])];
    expect(printed.length).toBeGreaterThanOrEqual(15);
    for (const code of printed) expect(billing, code).toContain(`- \`${code}\``);
    expect(billing).not.toContain("(no such line for\nthat charge)");
    // P4-K: the command now settles a DASHBOARD_REFUND line; the runbook no longer says it cannot.
    expect(billing.replace(/\s+/gu, " ")).not.toContain("so this command cannot settle it");
    expect(billing.replace(/\s+/gu, " ")).not.toContain("has no job to record it on");
    // W13 (P2-I18): every bare marker billing can print has its row in the journal table.
    const markers = ["apps/api/src/billing/runtime.ts", "apps/api/src/billing/erasure-hook.ts"]
      .flatMap((path) => [...read(path).matchAll(/reportPending\("(BILLING_[A-Z_]+)"\)/gu)].map((match) => match[1]!));
    expect(new Set(markers).size).toBeGreaterThanOrEqual(5);
    for (const marker of markers) expect(billing, marker).toContain(`| \`[${marker}]\` (a bare marker) |`);
    // P4-H (P2-I18's open clause): the API's own one-off marker has its row too.
    expect(billing).toContain("| `[BILLING_ERASURE_STOP_PENDING]` (a bare marker) |");
    // W9 fix round 1 (F1): a dead refund is never settled with "at least" its amount.
    expect(billing).not.toContain("Refund at least");
    // R-7: the public origin is the existing PUBLIC_APP_URL; no second setting names it.
    expect(billing).not.toContain("PUBLIC_SITE_ORIGIN");
    // R3-4: the company facts have one source and one mirror; no _merchant.json, no second copy for the emails, no
    // CIF setting (D5's R3-A: P6a builds it from COMPANY) and no /contact page exist.
    expect(billing).not.toContain("_merchant.json");
    expect(billing).not.toContain("_company.json");
    expect(billing).not.toContain("SMARTBILL_COMPANY_CIF");
    expect(billing).not.toContain("/contact");
    // The owner summary lists no charge references; the runbook must not send the owner there for one.
    expect(billing).not.toContain("from the owner summary");
    // G5 and P16a: the hosted example carries neither the country switches nor a reason to keep taxAuthorities, so
    // the runbook never tells the operator to copy "the four members" from it.
    expect(billing).not.toContain("Copy those four members");
  });

  it("P4-H (P2-I18's open clause): every billing line the API can write has a journal row, or is named routine", () => {
    // The source list: the audit event union, the billing lines written straight to the journal, and every bracketed
    // billing marker (the runtime's reportPending codes and the API's own console markers).
    const sources = (dir: string): string[] => (readdirSync(resolve(dir), { recursive: true }) as string[])
      .filter((name) => name.endsWith(".ts")).map((name) => read(`${dir}/${name}`));
    const api = sources("apps/api/src");
    const audited = [...read("apps/api/src/billing/audit.ts").matchAll(/^\s*\|\s*"(billing\.[a-z_.]+)"/gmu)].map((m) => m[1]!);
    const direct = api.flatMap((text) => [...text.matchAll(/event:\s*"(billing\.[a-z_.]+)"/gu)].map((m) => m[1]!));
    const events = new Set([...audited, ...direct]);
    expect(audited.length).toBeGreaterThanOrEqual(50);
    expect(direct).toContain("billing.cancel_link.failed");
    const markers = new Set(api.flatMap((text) => [
      ...[...text.matchAll(/reportPending\("(BILLING_[A-Z_]+)"\)/gu)].map((m) => m[1]!),
      ...[...text.matchAll(/console\.error\("\[(BILLING_[A-Z_]+)\]"\)/gu)].map((m) => m[1]!)
    ]));
    expect(markers).toContain("BILLING_ERASURE_STOP_PENDING");

    const start = billing.indexOf("| Signal | What it means | What to do |");
    expect(start).toBeGreaterThan(0);
    const tableLines: string[] = [];
    for (const line of billing.slice(start).split("\n")) {
      if (!line.startsWith("|")) break;
      tableLines.push(line);
    }
    const firstCell = (line: string): string => line.split(" | ")[0] ?? "";
    const rowEvents = tableLines.flatMap((line) => [...firstCell(line).matchAll(/`"event":"(billing\.[a-z_.]+)"`/gu)].map((m) => m[1]!));
    const rowMarkers = tableLines.flatMap((line) => [...firstCell(line).matchAll(/`\[(BILLING_[A-Z_]+)\]`/gu)].map((m) => m[1]!));
    const routineAt = billing.indexOf("**Every other billing line records a normal event and needs nothing from you:**");
    expect(routineAt, "the routine sentence").toBeGreaterThan(start);
    const routineText = billing.slice(routineAt, billing.indexOf("\n\n", routineAt));
    const routine = [...routineText.matchAll(/`(billing\.[a-z_.]+)`/gu)].map((m) => m[1]!);

    // Every line has exactly one home, and no row or routine name is stale.
    for (const event of events) {
      expect(rowEvents.includes(event) || routine.includes(event), `${event} is neither a row nor routine`).toBe(true);
    }
    for (const event of routine) expect(rowEvents, `${event} is both a row and routine`).not.toContain(event);
    for (const event of [...rowEvents, ...routine]) expect(events, `${event} is not written by the API`).toContain(event);
    expect(new Set(rowEvents).size, "one row per line").toBe(rowEvents.length);
    for (const marker of markers) expect(rowMarkers, marker).toContain(marker);
    for (const marker of rowMarkers) expect(markers, `${marker} is not written by the API`).toContain(marker);

    // Each line that asks the owner to act (part4-scope.md §4.3, the open-items row "P2-I18 (X0)" and the W13
    // re-review's additions) is a row of its own, never only the routine sentence.
    for (const alarm of [
      "billing.mail.attachment_missing", "billing.renewal.stuck",
      "billing.renewal.price_missing", "billing.renewal.history_invalid", "billing.maintenance.report",
      "billing.reconcile.errors", "billing.reconcile.expired", "billing.refund.dead", "billing.outbox.other_system",
      "billing.refund.outcome_unknown", "billing.refund.refused", "billing.renewal.owner_stopped",
      "billing.renewal.dunning_unpriced", "billing.cancel_link.failed",
      "billing.renewal.tax_refused", "billing.renewal.unknown", "billing.renewal.pending", "billing.chargeback",
      "billing.withdrawal.owner_review",
      // W13's rows, kept.
      "billing.renewal.report", "billing.outbox.dead", "billing.outbox.alert_failed",
      "billing.outbox.settle_failed", "billing.payment.credentials_refused", "billing.quote.refused",
      "billing.invoice.unknown", "billing.payment.mismatch",
      // P4-H fix round 1 (finding 4): the same failure code on many renewals at once is reported at once.
      "billing.payment.failed",
      // N23: a setting of the previous card processor left in api.env, and an answer of NETOPIA's the site cannot read.
      "billing.setting.retired", "billing.payment.answer_rejected",
      // N25: NETOPIA's lines that ask the owner to look or act.
      "billing.notice.unverified", "billing.notice.parse_failed", "billing.notice.unknown_order",
      "billing.notice.store_failed", "billing.notice.recheck", "billing.payment.status_unexpected",
      "billing.payment.owner_review", "billing.renewal.outcome_open", "billing.renewal.retry_held",
      "billing.reconcile.status_failed", "billing.refund.owner_due", "billing.refund.seen_partial", "billing.card.reminder"
    ]) {
      expect(rowEvents, alarm).toContain(alarm);
    }
    // Each row says what to do: the third cell is never empty. The row's closing pipe is stripped first, so an empty
    // last cell ("| sig | meaning |  |") reads as empty, never as "|" (P4-H fix round 1, finding 3).
    for (const line of tableLines.slice(2)) {
      expect((line.replace(/\s*\|\s*$/u, "").split(" | ")[2] ?? "").trim(), line).not.toBe("");
    }

    // P4-H fix round 1: the rows whose wording the code settles, cell by cell.
    const rowOf = (event: string): string[] => {
      const line = tableLines.find((candidate) => firstCell(candidate).includes(`\`"event":"${event}"\``)) ?? "";
      return line.replace(/\s*\|\s*$/u, "").split(" | ").map((cell) => cell.replace(/\s+/gu, " "));
    };
    // Finding 1: the renewal holds a charge NETOPIA answered but whose payment check has not settled it, under its own
    // code, with the same pending line.
    const [, pendingMeans = "", pendingDo = ""] = rowOf("billing.renewal.pending");
    for (const needle of ["`PAYMENT_NOT_VERIFIED`", "its payment check has not settled it yet", "still in 3-D Secure"]) {
      expect(pendingMeans, needle).toContain(needle);
    }
    for (const needle of ["Nothing on its own", "`PAYMENT_NOT_VERIFIED`: its payment check settles it",
      "still without an outcome 30 days after it was made is counted by `billing.reconcile.expired`"]) {
      expect(pendingDo, needle).toContain(needle);
    }
    // Finding 2: the owner summary lists a stuck renewal only when a call may have reached NETOPIA (a SUBMIT_UNKNOWN,
    // BillingRepository.stuckRenewals), which is closeStuck's CHARGE_OUTCOME_UNKNOWN; an order NETOPIA holds stays open.
    const [, stuckMeans = ""] = rowOf("billing.renewal.stuck");
    for (const needle of ["Only with `CHARGE_OUTCOME_UNKNOWN` does the owner summary list it, as `RENEWAL_STUCK`",
      "A `CHARGE_NOT_SENT` one charged nothing and is not listed there",
      "An order NETOPIA confirms it holds is never closed this way"]) {
      expect(stuckMeans, needle).toContain(needle);
    }
    expect(stuckMeans).not.toContain("moves to Free. The owner summary lists it as `RENEWAL_STUCK`.");
    // Finding 4: a failed payment has its own row. N25: a NETOPIA renewal fails only on what NETOPIA reports of the
    // card (renewalFailureOf), a card the plan lacks, or NO_TRANSACTION; a request refused for our own setup is never
    // closed as failed (the renewal's not-sent CHARGE_CONFIGURATION_REFUSED), so no "request refused" code is named.
    const [failedSignal = "", failedMeans = "", failedDo = ""] = rowOf("billing.payment.failed");
    expect(failedSignal).toBe("| `\"event\":\"billing.payment.failed\"`, with `chargeKind` and `code`");
    for (const needle of ["From a payment check", "`PAYMENT_DECLINED`", "`VOIDED`", "`CARD_NOT_SAVED`",
      "From a renewal or a payment retry", "`AUTHENTICATION_REQUIRED`", "`PAYMENT_EXPIRED`", "`NO_TRANSACTION`",
      "follows a `billing.renewal.stuck` line", "the `billing.renewal.unknown` row's `CHARGE_CONFIGURATION_REFUSED`"]) {
      expect(failedMeans, needle).toContain(needle);
    }
    for (const needle of ["A decline: nothing", "`NO_TRANSACTION`: the `billing.renewal.stuck` row"]) {
      expect(failedDo, needle).toContain(needle);
    }
    expect(failedMeans).not.toContain("CHARGE_REFUSED`:");
    // The codes the renewal can close a charge with, read from the code (renewal.ts): every code renewalFailureOf maps
    // NETOPIA's states to (its own body, so a sixth one is seen), and every literal code a renewal is refused with.
    // The RenewalFailureCode union is not read: only what the code writes counts.
    const renewal = read("apps/api/src/billing/renewal.ts");
    const failureOfStart = renewal.indexOf("export function renewalFailureOf(");
    expect(failureOfStart, "renewalFailureOf").toBeGreaterThanOrEqual(0);
    const failureOfEnd = renewal.indexOf("\n}\n", failureOfStart);
    expect(failureOfEnd, "renewalFailureOf's closing brace").toBeGreaterThan(failureOfStart);
    const failureOf = renewal.slice(failureOfStart, failureOfEnd + 3);
    const stateFailures = new Set([...failureOf.matchAll(/return "([A-Z_]+)";/gu)].map((match) => match[1]!));
    expect(stateFailures.size, "renewalFailureOf's codes").toBeGreaterThanOrEqual(5);
    const refusedCodes = new Set([...renewal.matchAll(/this\.refused\(charge, "([A-Z_]+)"/gu)].map((match) => match[1]!));
    expect([...refusedCodes], "the literal codes of this.refused").toEqual(expect.arrayContaining(["CARD_NOT_SAVED", "NO_TRANSACTION"]));
    for (const code of [...stateFailures, ...refusedCodes]) expect(failedMeans, code).toContain(`\`${code}\``);
    // N25: a renewal whose answer was lost names every code the renewal writes for it (renewal.ts's markers).
    const [, unknownMeans = ""] = rowOf("billing.renewal.unknown");
    for (const code of ["CHARGE_NOT_SENT", "CHARGE_CREDENTIALS_REFUSED", "CHARGE_CONFIGURATION_REFUSED", "CHARGE_OUTCOME_UNKNOWN",
      "CHARGE_ORDER_EXISTS", "SUBMIT_INTERRUPTED"]) {
      expect(renewal, code).toContain(`"${code}"`);
      expect(unknownMeans, code).toContain(`\`${code}\``);
    }
    // N25 (ruling PR-36): the held retry names N11's three codes.
    const [, heldMeans = ""] = rowOf("billing.renewal.retry_held");
    for (const code of ["EARLIER_ATTEMPT_PAID", "EARLIER_ATTEMPT_PENDING", "EARLIER_ATTEMPT_UNREADABLE"]) {
      expect(read("apps/api/src/billing/maintenance.ts"), code).toContain(`"${code}"`);
      expect(heldMeans, code).toContain(`\`${code}\``);
    }
    // N25: the key refusal names every operation the code writes it for.
    const [, credentialsMeans = ""] = rowOf("billing.payment.credentials_refused");
    const operations = new Set(sources("apps/api/src/billing").flatMap((source) => [
      ...[...source.matchAll(/credentialsRefused\([^,]+, [^,]+, "([a-z_]+)"\)/gu)].map((match) => match[1]!),
      ...[...source.matchAll(/"billing\.payment\.credentials_refused", \{ operation: "([a-z_]+)" \}/gu)].map((match) => match[1]!),
      ...[...source.matchAll(/operation: "([a-z_]+)", now/gu)].map((match) => match[1]!)
    ]));
    expect(operations.size).toBeGreaterThanOrEqual(6);
    for (const operation of operations) expect(credentialsMeans, operation).toContain(`\`${operation}\``);
    // Ruling PR-40: a flood over the intake's budget writes only the admission line.
    const [, unverifiedMeans = ""] = rowOf("billing.notice.unverified");
    expect(unverifiedMeans).toContain("`api.admission.refused` for the route `POST /v1/billing/netopia/notify`");

    // The rows the brief's sources ask for, word for word where the action matters.
    for (const needle of [
      // P2-W4 / P2-W3 (b) (the P4-B judge's forward): the other-system row covers a renewal notice too (N25: the
      // row's words name NETOPIA's environments and the previous card processor; the rule is unchanged).
      "or a renewal notice (`RENEWAL_NOTICE`) of a plan of the other system",
      // The daily dead-refund count holds jobs that owe nothing; the summary's code says which.
      "Not every one is owed", "the summary's own names",
      // The erasure stop that failed at scheduling is repeated by the sweep.
      "the sweep in front of the money check",
      "The page had already said a link is on its way"
    ]) {
      expect(billing.replace(/\s+/gu, " "), needle).toContain(needle);
    }
  });

  it("P4-H (the P4-B and P4-C judges' forwards): a refund's three no-refund codes, and C1 in the hand calculation", () => {
    const flat = billing.replace(/\s+/gu, " ");
    const section = (from: string, to: string): string => flat.slice(flat.indexOf(from), flat.indexOf(to, flat.indexOf(from)));
    // P2-W4: O2 for REFUND_CHARGE_MISSING carries the not-requested sentences; OTHER_PAYMENT_SYSTEM has its own.
    const refund = section("**A refund handed to you.**", "**When NETOPIA or the tax service is down at a renewal.**");
    for (const needle of [
      "`REFUND_CHARGE_MISSING`: the job names a charge we do not have",
      "the owner summary lists both as `REFUND_NOT_REQUESTED`",
      "The reason code `OTHER_PAYMENT_SYSTEM`", "nothing was sent and nothing is owed on this host",
      "no refund reason and no deadline", "lists it as `REFUND_OTHER_SYSTEM`",
      "refund it in that system's admin; a sandbox test payment needs nothing",
      "`BILLING_REFUND_DONE_EXCEEDS_REQUEST`", "every third day",
      // Ruling PR-48: a refund on a disputed payment is held, and recorded despite it only when made before.
      "do not refund it: the site holds that refund while the dispute lasts and has emailed you once (O3 `REFUND_HELD_BY_CHARGEBACK`)",
      "record that with `pnpm billing:dispute --outcome won`, and the refund comes back into the reminder",
      "if it ends for the person, nothing is left to refund",
      "record that refund with `pnpm billing:refund-done … --despite-chargeback`"
    ]) {
      expect(refund, needle).toContain(needle);
    }
    expect(refund).not.toContain("The one exception is the reason code `REFUND_NOT_REQUESTED`");
    // C1 (P2-W6): a payment made after the withdrawal takes no share, and a later upgrade does not set the credit.
    const withdrawal = section("**A withdrawal sent by email or on the model form.**", "**A refund handed to you.**");
    for (const needle of [
      "takes no share: it gives back all it still holds",
      "its `SUCCEEDED` row in `billing.charge_event` is dated after",
      "an upgrade paid after that moment does not set it"
    ]) {
      expect(withdrawal, needle).toContain(needle);
    }
  });

  it("F6b fix round 1: the emailed refund command previews first, the held row's command is the host form, §3's refusal", () => {
    const flat = billing.replace(/\s+/gu, " ");
    const refund = flat.slice(flat.indexOf("**A refund handed to you.**"),
      flat.indexOf("**When NETOPIA or the tax service is down at a renewal.**"));
    // The O2_REFUND_DUE command carries no --confirm (refundDoneCommand, F6a): run as given it only previews.
    for (const needle of [
      "and the command that records it (needed for a part of a payment): run as given, it only shows what it would record;"
        + " run again with `--confirm` added at the end, it records.",
      "A part of a payment is recorded only when you run the command from the email with `--confirm` added at the end,"
        + " because NETOPIA has not said whether it reports the amount of a partial refund."
    ]) {
      expect(refund, needle).toContain(needle);
    }
    expect(refund).not.toContain("the one command that records it");
    const refundsSource = read("apps/api/src/billing/refunds.ts");
    expect(refundsSource).toContain("return `${ON_HOST} ${command}`;");
    expect(refundsSource).toContain(
      "return hostCommand(`billing:refund-done --charge ${chargeId} --amount ${microsToDecimal(amountMicros)}`);");
    // The O3 prints only the short form, which fails in a root shell (ops-4): the row points at the host form.
    const held = billing.split("\n").find((line) => line.startsWith("| `\"event\":\"billing.refund.held_by_chargeback\"`")) ?? "";
    expect(held).toContain("record that refund with `pnpm billing:refund-done … --despite-chargeback`: run it as"
      + " **A refund handed to you**, above, shows (`systemd-run` with the API's `EnvironmentFile`), with"
      + " `--despite-chargeback` after `--confirm`. |");
    expect(held).not.toContain("as the O3 shows");
    // §3: the setup checks the billing folder only when it exists (billing-setup.sh), and creates it on a fresh host.
    const folder = readme.split("\n").find((line) => line.startsWith("| `/etc/debateai/api/billing/` |")) ?? "";
    expect(folder).toContain("The setup refuses (`BILLING_SETUP_UNSAFE_FOLDER`) unless `/etc/debateai/api`, and this folder"
      + " if it exists, are real folders, not links, owned by `debateai-api` |");
  });

  it("P4-H (P2-M41, the owner's ruling of 3 October 2026): switching billing off once plans are live is unsupported", () => {
    const flat = billing.replace(/\s+/gu, " ");
    const off = flat.indexOf("*To switch billing off*");
    expect(off).toBeGreaterThan(0);
    const paragraph = flat.slice(off, flat.indexOf("**The tax summary.**", off));
    for (const needle of [
      "**Switching billing off once plans are live is not supported.**",
      "Nothing in the code refuses it",
      "Do it only with no live plan and no open billing job",
      // The queries that show it: no live plan, no open billing job, no withdrawal still owed by hand.
      "AS live_subscriptions FROM billing.subscription_latest_v", "AS open_billing_jobs FROM billing.outbox WHERE done_at IS NULL AND dead_at IS NULL",
      "AS unsettled_owner_withdrawals",
      "If any of them is not 0, do not switch billing off",
      // F6b (ops-2): a refund handed to the owner leaves the job list once its O2_REFUND_DUE is sent, so a fourth
      // query counts the open owner refunds (tests/integration/billing-refunds-netopia.test.ts runs it as written).
      "check that all four of these print 0", "AS open_owner_refunds", "Only when all four are 0",
      "A refund handed to you leaves that list once its O2_REFUND_DUE email is sent",
      "The fourth counts the refunds handed to you that are not recorded yet",
      // F6b fix round 1: live refunds only (openOwnerRefunds filters on the API's environment), and a lost dispute.
      "The fourth counts only what is owed to real people. A sandbox refund is test money, and after the same-host move to"
        + " live the live site refuses to record one (`BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM`), so the query leaves it out.",
      "A held refund whose dispute you recorded lost is never owed (nothing is left to refund). A lost dispute writes"
        + " nothing that closes it, so the refund stays in this count for good. From then on, billing cannot be switched"
        + " off this way: stop new sales instead."
    ]) {
      expect(paragraph, needle).toContain(needle);
    }
    expect(paragraph).not.toContain("all three");
    // The fourth query mirrors BillingRepository.openOwnerRefunds without its charge-back hold: a held refund is open.
    const query = OPEN_OWNER_REFUNDS_LINE.exec(billing)?.[0] ?? "";
    for (const needle of [
      "FROM billing.charge_event r WHERE r.kind = 'REFUND_REQUESTED' AND r.payment_provider = 'netopia' AND r.amount_micros > 0",
      "d.charge_id = r.charge_id AND d.kind = 'REFUNDED' AND COALESCE(d.refunds_transaction_id, d.provider_payment_id) = r.provider_payment_id",
      "< r.amount_micros",
      "AND r.payment_environment = 'live'"
    ]) {
      expect(query, needle).toContain(needle);
    }
    expect(query).not.toContain("CHARGEBACK");
    const repository = read("packages/db/src/billing.ts");
    expect(repository).toContain(
      "AND COALESCE(refunded.refunds_transaction_id, refunded.provider_payment_id) = requested.provider_payment_id");
    expect(repository).toContain("AND requested.payment_environment = $1 AND requested.amount_micros > 0");
  });

  it("F6b (ops-1): switching billing on asks for every go-live row from 13 to the checklist's last, the void rows excepted", () => {
    const checklist = read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md");
    const numbered = [...checklist.matchAll(/^\| (\d+) \| (.*)$/gmu)].map((match) => [Number(match[1]), match[2]!] as const);
    const last = Math.max(...numbered.map(([number]) => number));
    expect(last).toBeGreaterThanOrEqual(73);
    const voids = numbered.filter(([number, rest]) => number >= 13 && rest.startsWith("~~")).map(([number]) => number);
    expect(voids.length).toBeGreaterThan(0);
    const listed = voids.length === 1 ? String(voids[0]) : `${voids.slice(0, -1).join(", ")} and ${voids.at(-1)}`;
    const flat = billing.replace(/\s+/gu, " ");
    const from = flat.indexOf("**Switching billing on.**");
    const on = flat.slice(from, flat.indexOf("**Going from NETOPIA's sandbox to live on the same host.**", from));
    expect(from).toBeGreaterThan(0);
    const range = /every row of the go-live checklist from 13 to (\d+) is proven/u.exec(on);
    expect(range, "the switch-on range").not.toBeNull();
    expect(Number(range![1]), "the range ends at the checklist's last row").toBe(last);
    for (const needle of [
      `the void rows (${listed}) excepted`,
      "NETOPIA's written approval of the shop for AI subscriptions, with recurring payments switched on (go-live row 14)",
      "the small live test, with billing off, passed on this host (§14.9, \"The small live test, with billing off\"; go-live row 69)",
      "the sandbox run of §14.9 passed, on its own throwaway server, never on this host",
      // F6b fix round 1: the proofs read only after the switch-on are proven right after it.
      "Some proofs can be read only after the switch-on: they are proven right after it, and their Proof cells are filled"
        + " then. These are parts of four rows' \"How to prove it\" cells: row 17, the footer of `/pricing` on the live site;"
        + " row 18, the API's start with billing on; row 19, the first real payment's message; row 23, the check run again"
        + " after the publish"
    ]) {
      expect(on, needle).toContain(needle);
    }
    expect(on).not.toContain("rows 13–54");
  });

  it("F6b (ops-5, ops-6, ops-8): the live checks read the real charge, accept a resent message, allow countryPolicy's cross", () => {
    const flat = billing.replace(/\s+/gu, " ");
    // ops-5: the first live payment's message is read on our own live charge, applied, so the small live test's tool
    // orders (outcome TOOL_ORDER) never answer for it.
    const firstPayment = /```sh\n(sudo -u postgres psql -d debateai -c "SELECT n\.received_at, n\.order_id AS charge_ref[^\n]*)\n```/u
      .exec(billing)?.[1] ?? "";
    for (const needle of ["JOIN billing.charge c ON c.charge_id = n.order_id", "c.payment_environment = 'live'",
      "o.outcome = 'APPLIED'"]) {
      expect(firstPayment, needle).toContain(needle);
    }
    expect(billing).not.toContain(
      "FROM billing.payment_notice WHERE payment_environment = 'live' ORDER BY received_at DESC LIMIT 1");
    expect(flat).toContain("The small live test's messages name tool orders, never one of our charges, so they never show here.");
    // ops-6: a message NETOPIA sent again adds a DUPLICATE outcome to the same notice; the live test's query leaves it out.
    const liveTest = /```sh\n(sudo -u postgres psql -d debateai -c "SELECT n\.received_at, n\.provider_status, o\.outcome FROM[^\n]*)\n```/u
      .exec(billing)?.[1] ?? "";
    expect(liveTest).toContain("WHERE n.payment_environment = 'live' AND o.outcome <> 'DUPLICATE'");
    expect(flat).toContain("A message NETOPIA sent again adds a `DUPLICATE` row, which the query leaves out.");
    // ops-8: before the switch-on publish, countryPolicy's line is the only cross allowed; the check runs again after it.
    const readBack = flat.slice(flat.indexOf("**Read the settings back before switching on.**"),
      flat.indexOf("**No paid question may be waiting when billing goes on.**"));
    for (const needle of [
      "Until the version that switches billing on is published, the one cross allowed is the `countryPolicy` line",
      "run the check command again right after that publish, once its `REGISTER_VERSION=` line is in `api.env`",
      "every line must then show a tick"
    ]) {
      expect(readBack, needle).toContain(needle);
    }
    expect(flat).toContain("after the last run every line must show a tick, apart from the one cross that **Read the settings back before switching on** allows");
    const checklist = read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md").replace(/\s+/gu, " ");
    const row23 = /\| 23 \| [^\n]*?\| — \|/u.exec(checklist)?.[0] ?? "";
    expect(row23).toContain("before the publish that switches billing on, the one cross allowed is the `countryPolicy` line");
    expect(row23).toContain("the check is run again right after that publish, and then shows a tick on every line");
    // The check reads the version api.env names, which is why it runs again once that line is in api.env.
    expect(read("apps/api/src/billing/check-cli.ts")).toContain("const version = operator.REGISTER_VERSION;");
  });

  it("F6b (ops-9): no still-open item of Part 2's or Part 3's final review names the previous card processor unless voided", () => {
    // Its name is built from pieces, as tests/architecture/card-processor-removed.test.ts does, so this file never names it.
    const OLD_PROCESSOR = new RegExp(["x", "money"].join(""), "iu");
    for (const path of ["docs/missions/paid-plans/PART2-FINAL-REVIEW-OPEN-ITEMS.md", "docs/missions/paid-plans/PART3-FINAL-REVIEW-OPEN-ITEMS.md"]) {
      const rows = read(path).split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Id ") && !line.startsWith("|---"))
        .map((line) => line.slice(2, -2).split(" | "));
      expect(rows.length, path).toBeGreaterThan(5);
      for (const cells of rows) {
        if (!(cells.at(-1) ?? "").startsWith("open")) continue;
        const what = cells[1] ?? "";
        const left = what.includes(" are left.") ? what.slice(what.indexOf(" are left.")) : what;
        for (const item of left.split(/ \((?=\d+\) )/u)) {
          if (OLD_PROCESSOR.test(item)) expect(item, `${path} ${cells[0]}`).toContain("void: card processor changed to NETOPIA");
        }
      }
    }
    const erasure = read("docs/missions/paid-plans/PART2-FINAL-REVIEW-OPEN-ITEMS.md").split("\n")
      .find((line) => line.startsWith("| P2-I10 (owner, accountant) |")) ?? "";
    expect(erasure).toContain("§14.8 gives the hand path (refund in NETOPIA's admin, confirm in the reply)");
    // F6b fix round 1: M1's whole time limit, and the 2 business days kept until NETOPIA answers N-23 (go-live row 64).
    const dead = read("docs/missions/paid-plans/PART2-FINAL-REVIEW-OPEN-ITEMS.md").split("\n")
      .find((line) => line.startsWith("| P2-I16, P2-I17 (owner, native reader) |")) ?? "";
    for (const needle of [
      "(Directive 2011/83/EU art. 8(7): \"within a reasonable time after the contract is concluded, and at the latest before"
        + " the performance of the service begins\";",
      "the previous card processor's merchant rules wanted M1 within 2 business days; NETOPIA's merchant rules for"
        + " subscriptions are question N-23, go-live row 64, still open; so keep to 2 business days until NETOPIA answers,"
        + " as the build keeps A7's 7 business days)"
    ]) {
      expect(dead, needle).toContain(needle);
    }
    expect(dead).not.toContain("void: card processor changed to NETOPIA (2026-10-08).**), and M8_RECEIVED");
  });

  it("P4-H fix round 1 (the P4-F judge's route (a)): no paid question waits in line when billing goes on", () => {
    const flat = billing.replace(/\s+/gu, " ");
    // The check sits in "Switching billing on", before the step that publishes the version switching billing on.
    const from = flat.indexOf("**Switching billing on.**");
    const publish = flat.indexOf("Then set `billingPolicy.enabled` to `true` in the file and publish as in §14.4.");
    expect(from).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(from);
    const before = flat.slice(from, publish);
    for (const needle of [
      "**No paid question may be waiting when billing goes on.**",
      // Part 4 final review C-10: the count reads the line's own tables, whatever the account's state (the view
      // core.run_waiting_v hides every run of an account that is not active); tests/integration/
      // b3-holds-waiting-line.test.ts runs this exact query against the migrated schema.
      WAITING_PREMIUM_QUERY_LINE,
      "The first number it prints must be 0", "A question with no recorded plan counts as a paid one",
      // Why, in plain words.
      "the server takes the plan the browser sends", "everyone is on Free, because nobody could pay before",
      "`RUN_SETUP_FAILED:PLAN_CHANGED`", "Your paid plan ended or was paused while this question waited",
      "which is false for someone who never paid",
      "If the count is not 0, wait for the line to empty, check again, then publish",
      // §11's whole-line count is named only to say it does not do here; the band in the same version stays an option.
      "`SELECT count(*) FROM core.run_waiting_v`", "in the same version that switches billing on"
    ]) {
      expect(before, needle).toContain(needle);
    }
    // C-10: the view's count is no longer offered as the stricter check, and the old view-based query is gone.
    expect(before).not.toContain("is a stricter check that also does");
    expect(before).not.toContain("FROM core.run_waiting_v WHERE owner_ref IS NOT NULL");
    // The claims the paragraph makes stay true of the code: a NULL tier is premium to the waker's plan guard, and the
    // asker reads that sentence.
    expect(read("apps/api/src/ask-room.ts")).toContain("(run.planTier ?? \"premium\") === \"premium\"");
    expect(read("apps/ui/messages/en/home.json")).toContain("\"runFailure.PLAN_ENDED\": \"Your paid plan ended or was paused while this question waited");
  });

  it("Part 4 final review C-10: the billing-on check counts every account, runs again before the restart, names askRoomReads", () => {
    const flat = billing.replace(/\s+/gu, " ");
    const from = flat.indexOf("**No paid question may be waiting when billing goes on.**");
    const publish = flat.indexOf("Then set `billingPolicy.enabled` to `true` in the file and publish as in §14.4.");
    expect(from).toBeGreaterThan(0);
    const paragraph = flat.slice(from, publish);
    for (const needle of [
      "whatever the state of its asker's account",
      // The second number: suspended is only an account deletion's prepared state (0040), which ends by deleting the
      // account row, so its question drops out of the join by itself; nothing makes an age-frozen account active
      // again (0040's only write of state='active' comes from pending_mfa), so its question stays counted.
      "The second number counts the questions of accounts that are being deleted or were frozen by the age check.",
      "A question of an account being deleted leaves the count by itself when the deletion finishes, without ever starting.",
      "A frozen account's question never starts, but stays counted.",
      "it leaves out every question of an account that is not active",
      "If only questions of accounts that are not active keep the count above 0, check again later (for example the next day): a deletion under way finishes by itself.",
      "If the second number is still above 0, those questions belong to frozen accounts and never leave by waiting: do not switch billing on, and report the case.",
      // Not atomic with the switch: the same count again after the publish, before the version is pinned. A pinned
      // file is read by any restart (Restart=on-failure, a reboot), so nothing is pinned while the count is not 0.
      "Run the same check again after the publish, just before you copy its `REGISTER_VERSION=` line into both files and restart the two services (§14.4)",
      "If it is not 0 then, pin nothing yet: any restart, including systemd's own after a failure, starts the services on the version the files name.",
      "Wait for the line to empty, check again, then pin and restart.",
      // C7: a version with the band needs the room read's budget, so the band option names it.
      "with `askRoomReads`, the room read's budget, which every version with the band needs"
    ]) {
      expect(paragraph, needle).toContain(needle);
    }
    // The check reads the line's own tables, never the view that hides an inactive account's run.
    const query = /```sh\n(sudo -u postgres psql -d debateai -c "SELECT count\(\*\) AS waiting_premium[^\n]*)\n```/u.exec(billing)?.[1] ?? "";
    expect(query).toBe(WAITING_PREMIUM_QUERY_LINE);
    expect(query).not.toContain("run_waiting_v");
    expect(query).not.toContain("account.state = 'active'");
    // The words this round corrected stay gone: a not-active account's question is not ended later, and the services
    // are not said to keep their version until an operator restart.
    expect(paragraph).not.toContain("rests until the account is active again");
    expect(paragraph).not.toContain("they will not leave by waiting");
    expect(paragraph).not.toContain("until you restart them, the services keep the version they run");
    // The facts behind those words: the units read the pinned files and restart on failure by themselves.
    for (const unit of ["api", "runner"]) {
      const service = read(`deploy/vps/systemd/debateai-${unit}.service`);
      expect(service).toContain(`EnvironmentFile=/etc/debateai/${unit}.env`);
      expect(service).toContain("Restart=on-failure");
    }
  });

  it("Part 4 final review C-6, C-9, C-13: the --amount bullet, the dispute states and the retry days", () => {
    const flat = billing.replace(/\s+/gu, " ");
    const between = (from: string, to: string): string => {
      const start = flat.indexOf(from);
      expect(start, from).toBeGreaterThan(0);
      return flat.slice(start, flat.indexOf(to, start));
    };
    // C-6: a dashboard refund recorded with --amount is already subtracted, so it is never taken off again by hand.
    const C6 = "A refund transaction of a payment whose dashboard-refund credit note is recorded is already in the figures: do not take it off again.";
    const amountBullet = between("- `--record` with `--amount`, for a `DASHBOARD_REFUND` line only", "- `--requeue` to let the site");
    expect(amountBullet).toContain(C6);
    // The re-review's M-7: a payment refunded before its plan started owes no document, so no command clears its line.
    expect(amountBullet).toContain("A `REFUNDED_BEFORE_START` line (a payment refunded in NETOPIA's admin before its plan started) needs no command: no invoice or credit note is owed, and `--record` refuses such a charge");
    // N23: the billing.refund.unrecorded row left with the previous card processor's notices, its only writer.
    // C-9: a paused plan its person cancelled lists as CANCEL_REQUESTED and still waits; a won dispute's limit.
    const disputes = between("**Disputes (chargebacks).**", "**A withdrawal sent by email or on the model form.**");
    for (const needle of [
      "- `won` gives the plan back; a plan its person cancelled while it was paused comes back only until its period end, then ends; nobody is emailed;",
      "`CANCEL_REQUESTED` (the person cancelled while the plan was paused) is still waiting for its outcome"
    ]) {
      expect(disputes, needle).toContain(needle);
    }
    // C-13: beside billingPolicy in §14.4.
    const publishing = between("### 14.4 Publishing the billing settings", "### 14.5");
    expect(publishing).toContain(
      "- `billingPolicy`: `enabled`, the retry days and the withdrawal days. Never shorten `dunning_retry_days` while any plan is"
      + " PAST_DUE (a spent dunning then ends at once, before the retry date its last email promised);"
    );
  });

  it("Part 4 final review C-11: both READMEs say Free's answer models need the scorecard candidate's exact maker", () => {
    const needle = "be served through a connection whose maker is written exactly as the scorecard candidate's"
      + " (character for character, so `openai` and `OpenAI` do not match), with the same model id, at the thinking level"
      + " it was scored at, which that connection declares (a model scored at its default level only needs no declared"
      + " level), and have a typical call that fits its context window";
    for (const path of ["deploy/vps/register/README.md", "scorecards/README.md"]) {
      const text = read(path).replace(/\s+/gu, " ");
      const at = text.indexOf("is refused `SCORECARD_FREE_ANSWER_UNSCORED`");
      expect(at, path).toBeGreaterThan(0);
      expect(text.slice(Math.max(0, at - 700), at), path).toContain(needle);
    }
    // The claim stays true of the picker: the maker is compared character for character with the candidate's.
    expect(read("packages/scorecard/src/picker.ts")).toContain("target.maker === candidate.maker");
  });

  it("P4-H (§4.3's optional notes): the runner's looser Free check, and what §14.9's journal filter prints", () => {
    const flat = billing.replace(/\s+/gu, " ");
    // The S4b review's M-1: the runner never reads billingPolicy, so only the API's start and the publish are strict.
    for (const needle of [
      "the runner's own start-up check", "prices Free over every configured model",
      "the API's start-up and the publish price Free on the Free plan's models only"
    ]) {
      expect(flat, needle).toContain(needle);
    }
    // The W13 judge's minor: the filter prints only three kinds of line, and a second command shows every billing line.
    const before = flat.slice(flat.indexOf("**Before step 1: read the journal of the first start with billing on.**"),
      flat.indexOf("**Every purchase in steps 1–5"));
    for (const needle of [
      "This filter prints nothing else", "To read every billing line of that start",
      "grep -E '\"event\":\"billing\\.|\\[BILLING_'", "Every other billing line records a normal event"
    ]) {
      expect(before, needle).toContain(needle);
    }
  });

  it("enters every billing secret through the guided setup, never through an editor or a hand-made file", () => {
    // Spec §2.2 rule 8 and §2.17.2: the value never appears on screen, on a command line, in shell history or in an
    // editor's temporary copy; the runbook sends the owner to the setup for every key.
    expect(billing).not.toMatch(/sudoedit \/etc\/debateai\/api\/billing/u);
    expect(billing).not.toMatch(/> \/etc\/debateai\/api\/billing\//u);
    for (const section of ["netopia", "quaderno", "smartbill"]) {
      expect(billing, section).toContain(`bash /opt/debateai/dialectical-engine/deploy/vps/billing-setup.sh --replace ${section}`);
    }
  });

  it("names the same custody files as the API's example environment (P6a)", () => {
    const example = read("deploy/vps/env/api.env.example");
    for (const file of ["netopia-api-key", "netopia-ipn-keys.pem", "quaderno-api-key", "smartbill-credentials", "owner-report-email"]) {
      const path = `/etc/debateai/api/billing/${file}`;
      expect(example, path).toContain(path);
      expect(billing, path).toContain(path);
    }
  });

  it("puts only real commands in its sh blocks: no placeholder, no result line", () => {
    const blocks = [...billing.matchAll(/```sh\n([\s\S]*?)```/gu)].map((match) => match[1]!);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block, block).not.toMatch(/<[a-z-]+>/u);
      expect(block, block).not.toMatch(/->|→|^\$ /mu);
    }
  });

  it("the hosted example carries the billing rows, equal to the development values, with billing OFF", () => {
    const hosted = readFileSync(resolve("deploy/vps/register/hosted-register.example.json"));
    const file = parseHostedRegisterFile(hosted);
    // B11a wraps its two members (`{value}`, null when absent); G2's countryPolicy and P16a's taxAuthorities are the
    // raw values. The typed shape is read as it is, so a change to either convention fails here.
    expect(file.billingPlans?.value).toEqual(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value);
    expect(file.billingPolicy?.value).toEqual(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value);
    expect(file.taxAuthorities).toEqual(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value);
    expect((file.billingPolicy?.value as { enabled?: unknown }).enabled).toBe(false);
    // G5 (final review Part 1a I-3): the main example carries NO countryPolicy, so the file bring-up copies has no
    // country gate; the switches live in their own example, and a hosted file gains them by merging that one in.
    expect(file.countryPolicy).toBeNull();
    const switches = JSON.parse(read("deploy/vps/register/country-policy.example.json")) as Record<string, unknown>;
    expect(Object.keys(switches)).toEqual(["countryPolicy"]);
    const gated = parseHostedRegisterFile(new TextEncoder().encode(JSON.stringify({
      ...(JSON.parse(hosted.toString("utf8")) as Record<string, unknown>), ...switches
    })));
    expect(gated.countryPolicy).toEqual(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value);
  });

  it("the register README describes the four members, and what leaving each out means (A14)", () => {
    const registerReadme = read("deploy/vps/register/README.md");
    for (const member of ["| `billingPlans` |", "| `billingPolicy` |", "| `countryPolicy` |", "| `taxAuthorities` |"]) {
      expect(registerReadme, member).toContain(member);
    }
    // G2: a hosted file without the member publishes no countryPolicy row, so that version has no country gate.
    expect(registerReadme).toContain("Left out, no `countryPolicy` row is published and that register version has no country gate");
    expect(registerReadme).not.toContain("Left out, the engine's own row is sealed, and the country gate uses it");
    // P16a (D6b's sentence, the behaviour its test pins): a hosted file without the member keeps the code-owned text.
    expect(registerReadme).toContain("Left out, the code-owned `taxAuthorities` row is published unchanged; include the member to correct the text");
    // P21 shipped the DB-IP credit, so the register README no longer says the site lacks it (G5 condition 1).
    expect(registerReadme).not.toMatch(/the site does not show\s+it yet/u);
  });

  it("the go-live checklist carries the billing rows 14–73 after B11b's row 13, each with a way to prove it", () => {
    const checklist = read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md");
    const rows = [...checklist.matchAll(/^\| (\d+) \|/gmu)].map((match) => Number(match[1]));
    // Numbered in order with no gap: a void row keeps its number so the later lines keep theirs.
    expect(rows).toEqual(Array.from({ length: 73 }, (_unused, index) => index + 1));
    // The needles must be in the table itself: the dated notes under it repeat some of these words (P16a's note names
    // the One-Stop Shop), and a note never stands in for a row.
    const table = checklist.split("\n").filter((line) => /^\| \d+ \|/u.test(line)).join("\n");
    for (const needle of [
      // Spec 2026-10-05 §2.21: row 14 is NETOPIA's approval and answers; the answers that gate billing have rows 55–66.
      "NETOPIA Payments has approved the shop for AI subscriptions", "the gated ones have their own rows (55–66)",
      "only they keep billing off until NETOPIA answers (§2.24's Gate column); for the others the build's assumption stands meanwhile",
      // Row 38: the items Part 2's review left are the owner's, counsel's or the accountant's; the old recording's are void.
      "each item it leaves to the owner, counsel or the accountant decided and done",
      "sandbox end-to-end run", "One-Stop Shop", "payment-marks", "SELLER_COMPANY", "records key",
      "daily ceiling covers the subscribers", "Terms §13", "counsel",
      // Row 15: the throwaway server's run, the owner mode's refund, the fake-stack and NETOPIA suites.
      "on the throwaway sandbox server", "refunded in full by the owner mode", "`tests/integration/billing-*netopia*.test.ts`",
      // Row 17: NETOPIA's mark first, then the two card marks, in the footer and on the checkout.
      "`netopia.svg`, `visa.svg` and `mastercard.svg`", "in the footer and on the checkout",
      // Row 19: no notify setting at NETOPIA; a LIVE message reaching the site is the proof.
      "NETOPIA has no notify setting in its admin", "travels with every payment", "`payment_environment = 'live'`",
      // Row 23 (spec 2026-10-05 §2.17): the live values through the guided setup, named by setting, never by value.
      "`billing-setup.sh --replace netopia`", "`NETOPIA_API_BASE_URL` is a live address", "`NETOPIA_POS_SIGNATURE` is the live POS's",
      "`NETOPIA_API_KEY_PATH`", "`NETOPIA_IPN_KEYS_PATH`", "`pnpm billing:check` shows a tick on every line",
      // Row 24 (spec 2026-10-05 §2.22; N20's question): NETOPIA in the legal texts, the ANPC marks, the order button.
      "NETOPIA Payments as a recipient", "ANPC SAL", "the English order button",
      "Quaderno and SmartBill fixtures committed and their recorded-fixture suites green",
      "tests/unit/invoice-smartbill-recorded-fixtures.test.ts", "partial-credit shapes are still ⚠",
      // Ruling Q-12: the records key's proof is the drill line.
      "RESTORE_DRILL_RECORDS_KEY bytes=32",
      // Spec §2.12 items 6–8: Terms §8, the Provider Register, the Blocking Statute and the Annex A regions.
      "Gemini", "Entity List", "Blocking Statute", "Annex A",
      // G5 (controller note, 2026-09-30): the four conditions before any register version carries countryPolicy.
      "IP Geolocation by DB-IP", "the Terms' list of served countries", "looked up locally",
      "GEOIP_REFRESH_OK tor-list",
      // B11d (controller note, 2026-10-01): Part 1b's final review items to clear before line 13 or billing on.
      "WAITING", "GET /v1/asks/room", "PERSON_ALLOWANCE_REACHED", "cold-start estimate",
      "before Part 2 is deployed", "Free roster", "sentence C", "day lock",
      // P21's judge, ruling (a)2 (2026-10-02): the machine-written customer texts.
      "native or legal reader",
      // The owner's answer to P18 Step 0a, question 3 (2026-10-02): the two help articles reworded for paid plans.
      "app-navigation", "budget-tier-choice",
      // Row 23 (P23 fix G1): going live moves the invoicers' addresses too, not only the card processor's.
      "SMARTBILL_API_BASE_URL",
      // P24 (2026-10-02): billing stays off until every item of Part 2's final review is closed.
      "PART2-FINAL-REVIEW-OPEN-ITEMS.md",
      // W2 (P2-I2): row 15's proof includes the dispute fake stack.
      "billing-dispute-fake-stack.test.ts",
      // W16 (the W7, W10 and W15 judges' notes): row 36's reader also reads the keys Part 2b wrote.
      "`settings.erasure.paidPlan`", "`billing.checkout.rateLimited`", "`billing.cancelPage.nothingToCancel`",
      "`billing.checkout.refundedBeforeStart`",
      // Spec 2026-10-05 §2.18 and N20's note: row 36's reader reads the card-saving agreement first.
      "`billing.consent.renewal` first",
      // W16 (P2-M34): the card marks are copied before the website's last start.
      "restart `debateai-ui`",
      // Part 3's final review (2026-10-03): billing stays off until every item of Part 3's final review is closed.
      "PART3-FINAL-REVIEW-OPEN-ITEMS.md"
    ]) {
      expect(table, needle).toContain(needle);
    }
    const row = (number: number): string => table.split("\n").find((line) => line.startsWith(`| ${number} |`)) ?? "";
    const cells = (number: number): string[] => row(number).replace(/^\|\s*/u, "").replace(/\s*\|\s*$/u, "").split(" | ");
    // Every row cites where it comes from, and every row still in force says how it is proven; a void or removed row
    // keeps its text struck through, says "—" there, and its last cell says why.
    for (const number of rows) {
      expect(cells(number), `row ${number} has five cells`).toHaveLength(5);
      const [, mustBeTrue = "", comesFrom = "", howToProve = "", proof = ""] = cells(number);
      expect(comesFrom.trim(), `row ${number} cites its source`).not.toMatch(/^(—)?$/u);
      if (mustBeTrue.startsWith("~~")) {
        expect(howToProve, `row ${number} is closed`).toBe("—");
        expect(proof, `row ${number} says why it is closed`).toMatch(/^\*\*(Removed|Closed) /u);
      } else {
        expect(howToProve.trim(), `row ${number} has a way to prove it`).not.toMatch(/^(—)?$/u);
      }
    }
    // Spec 2026-10-05 §2.21: the rows only the previous card processor needed are void, dated, each with its reason.
    for (const [number, reason] of [
      [20, "void: card processor changed to NETOPIA — no card form on our pages, no 3-D Secure pop-up or Payment Request policy to decide"],
      [40, "void: card processor changed to NETOPIA (the card change is NETOPIA's 0 check, N-11)"],
      [46, "void: card processor changed to NETOPIA (one refund rule: `netopiaRefunded`, spec §2.12.4)"]
    ] as const) {
      expect(row(number), `row ${number} is void`).toMatch(new RegExp(`^\\| ${number} \\| ~~`, "u"));
      expect(row(number), `row ${number} is void`).toContain(`| — | **Closed 2026-10-08:** ${reason}`);
    }
    // W16: rows 41–54 hold the items the final review deferred to a ruling or a vendor fact that Part 2b did not build,
    // plus the "later" Minors (row 54); each names who decides and how it is proven. Every other open item is a row of
    // the open-items file whose status names the go-live rows that share its work, and row 38 holds them all.
    for (const [number, needles] of [
      [41, ["P2-I5", "billing-only database role", "`runner-runtime`", "`scheduler-liveness`", "`email_ciphertext`",
        "(a) to (c)"]],
      [42, ["P2-I8", "Terms §13", "how an upgrade's own days are counted", "CRD art. 14(3)"]],
      [43, ["P2-I9", "public holiday", "Regulation 1182/71 art. 3(4)", "withdrawal-deadline.ts"]],
      [44, ["P2-I13", "`withdrawal_days`", "`billing.consent.immediateStart`", "country-neutral", "generate:legal:check"]],
      [45, ["P2-I15", "never took money", "`billing.purge_expired_records`", "Privacy Policy", "phone number"]],
      [47, ["P2-M17", "`billing.checkout.total`", "31 January", "anchor day"]],
      [48, ["P2-M21", "the buyer's language", "packages/tax-quaderno/src/index.ts", "tax-quaderno-recorded-fixtures.test.ts"]],
      [49, ["P2-M25", "`mentions`", "debateai-charge:", "accountant"]],
      [50, ["P2-M26", "`taxAuthorities`", "`tax_statuses: null`", "REVERSE_CHARGE", "row 16"]],
      [51, ["P2-M28", "credit note gives back the VAT", "tests/unit/tax-quaderno-recorded-fixtures.test.ts"]],
      [52, ["P2-M36", "support@dezbatere.ro", "`COMPANY.emails.general`", "`SELLER_COMPANY`"]],
      [53, ["P2-M37", "PricingCards.tsx", "`home.pricingCopy`", "counsel"]],
      [54, ["Before billing is switched on", "PART2-FINAL-REVIEW-OPEN-ITEMS.md", "P2-M4, P2-M6, P2-M7, P2-M13, P2-M22, P2-M23, P2-M29, P2-M30, P2-M33, "
        + "P2-M39, P2-M40, P2-M41, P2-M43"]]
    ] as const) {
      const line = row(number);
      for (const needle of ["**Decided by:**", "**Proven by:**", ...needles]) expect(line, `row ${number}: ${needle}`).toContain(needle);
      // Row 41 is done (pull request #77, migration 0093, 2026-10-04): its proof names the merge, the migration and the
      // principals test. Row 54 is done once P2-M40, the last "later" Minor, is void (spec 2026-10-05 §2.21). Every
      // other row here is still open.
      if (number === 41) {
        expect(line, "row 41 is done").toMatch(
          /\| \*\*Done 2026-10-04\*\* by pull request #77 [^|]*0093_billing_runtime_role\.sql[^|]*production-database-principals\.test\.ts[^|]*\|$/u
        );
      } else if (number === 54) {
        expect(line, "row 54 is done").toMatch(/\| \*\*Done 2026-10-08:\*\* [^|]*P2-M40[^|]*void: card processor changed to NETOPIA[^|]*\|$/u);
      } else {
        expect(line, `row ${number} is open`).toMatch(/\| — \|$/u);
      }
    }
    // W16 fix F1: the "later" Minors gate switching billing on, each fixed or accepted in writing.
    expect(row(54)).not.toContain("None blocks switching billing on alone");
    // Spec 2026-10-05 §2.21 and §2.24: each question whose Gate column says yes has its own row, in the table's order,
    // saying what the build assumes until NETOPIA answers and what changes with another answer.
    const gated = ["N-2", "N-4", "N-5", "N-7", "N-8", "N-11", "N-14", "N-15", "N-17", "N-23", "N-24", "N-26"];
    gated.forEach((question, index) => {
      const line = row(55 + index);
      for (const needle of [`| ${55 + index} | Before billing is switched on: NETOPIA has answered ${question},`,
        "Until NETOPIA answers, the build assumes", "if the answer differs", `Spec 2026-10-05 §2.24 ${question}`,
        "**Decided by:**", "**Proven by:**"]) {
        expect(line, `row ${55 + index} (${question}): ${needle}`).toContain(needle);
      }
      expect(line, `row ${55 + index} is open`).toMatch(/\| — \|$/u);
    });
    // The owner's steps of spec 2026-10-05 §1.6 and the rulings that left the owner a decision, after the questions.
    for (const [number, needles] of [
      [67, ["`tests/fixtures/netopia/`", "twelve required kinds", "`tests/unit/payments-netopia-recorded-fixtures.test.ts` is green",
        "PR-47", "N-2, N-4, N-9, N-11, N-16 and N-24"]],
      [68, ["NETOPIA's own test of our flow has passed", "throwaway sandbox server", "N-26"]],
      [69, ["provider-only mode", "billing still off", "`start --live`", "`charge --live`", "refunded in NETOPIA's live admin",
        "`TOOL_ORDER`", "the live capture folder is deleted"]],
      [70, ["signed the support catalogue again", "Subscription checkout", "billing details", "NETOPIA payment page",
        "`catalog.sha256`", "§1.6 item 9"]],
      [71, ["native reader", "`apps/ui/lib/billing/callingCodes.ts`", "calling code"]],
      [72, ["PR-41", "keeps it or changes it", "`--despite-chargeback`", "`REFUND_HELD_BY_CHARGEBACK`"]],
      [73, ["Part C", "N-14"]]
    ] as const) {
      const line = row(number);
      for (const needle of [`| ${number} | Before billing is switched on`, "**Decided by:**", "**Proven by:**", ...needles]) {
        expect(line, `row ${number}: ${needle}`).toContain(needle);
      }
      expect(line, `row ${number} is open`).toMatch(/\| — \|$/u);
    }
    // The P19 note bound row 20 to the previous card form's six points; it is void with row 20.
    expect(checklist).toMatch(/\*Void since 2026-10-08:\* card processor changed to NETOPIA[^\n]*P19/u);
  });

  it("the final review's open items say, for each row, whether Part 2b fixed it or which go-live row holds it (W16)", () => {
    const items = read("docs/missions/paid-plans/PART2-FINAL-REVIEW-OPEN-ITEMS.md");
    const rows = items.split("\n").filter((line) => /^\| (P2-|Minors|Later|Owner items)/u.test(line))
      .map((line) => line.slice(2, -2).split(" | "));
    expect(rows.length).toBeGreaterThanOrEqual(40);
    // A status is never a bare "open": it names who fixed it or where it is held, so row 38 can be read row by row.
    // "closed" is the end state go-live row 38 and the file's intro ask for (the controller writes it at the merge).
    for (const cells of rows) {
      const status = cells.at(-1) ?? "";
      expect(status, cells[0]).toMatch(/^(fixed in Part 2b \(W\d+(, W\d+)*\)|open: go-live rows? \d+|closed)/u);
      // Spec 2026-10-05 §2.21: rows 20, 40 and 46 are void and row 14 is NETOPIA's, so nothing still open waits on them.
      if (status.startsWith("open")) expect(status, cells[0]).not.toMatch(/\b(14|20|40)\b|\b46 \(P2-M2\)/u);
    }
    // The mappings below describe rows still open; a row the controller has closed has done its job, but a missing
    // row is still a failure.
    const rowOf = (id: string): string[] | undefined => rows.find((cells) => cells[0] === id);
    const rowStarting = (prefix: string): string[] | undefined => rows.find((cells) => cells[0]!.startsWith(prefix));
    const isClosed = (cells: readonly string[]): boolean => (cells.at(-1) ?? "").startsWith("closed");
    for (const [id, needle] of [
      ["P2-I1", "fixed in Part 2b (W1)"], ["P2-I5 (part 3)", "go-live row 41"],
      ["P2-I8", "go-live rows 24 and 42"], ["P2-I9", "go-live row 43"], ["P2-I13", "go-live row 44"],
      ["P2-I15", "go-live row 45"], ["P2-M34", "go-live row 17"], ["Later", "go-live row 54"],
      ["Owner items", "go-live rows 16, 24 and 38"]
    ] as const) {
      const cells = rowOf(id);
      expect(cells, `no row ${id}`).toBeDefined();
      if (!isClosed(cells!)) expect(cells!.at(-1), id).toContain(needle);
    }
    // Spec 2026-10-05 §2.21: P2-I3's left-over change waited on rows 14 and 40 for the previous processor's recording; it is
    // void now, so its row says so instead of naming those rows.
    const rebill = rowOf("P2-I3");
    expect(rebill, "no row P2-I3").toBeDefined();
    expect(rebill!.at(-1), "P2-I3").toContain("void: card processor changed to NETOPIA (2026-10-08)");
    // Spec 2026-10-05 §2.21: an item only the previous card processor raised is closed as void, with the date; an item
    // that is not only its keeps its row open, with only its processor-only parts marked void.
    const VOID = "void: card processor changed to NETOPIA (2026-10-08)";
    for (const prefix of ["P2-I1 (X0)", "P2-I2 (", "P2-I18 (X0)"]) {
      const cells = rowStarting(prefix);
      expect(cells, `no row ${prefix}`).toBeDefined();
      const closedVoid = `closed: ${VOID}`;
      expect((cells!.at(-1) ?? "").slice(0, closedVoid.length), prefix).toBe(closedVoid);
    }
    for (const prefix of ["P2-I12 (X0, owner)", "P2-I3, P2-I19, P2-I20, P2-M38 (X0, owner)", "P2-I21, ",
      "P2-M1, P2-M3, P2-M5, P2-M27 (X0, owner)", "Owner items"]) {
      const cells = rowStarting(prefix);
      expect(cells, `no row ${prefix}`).toBeDefined();
      expect(cells![1], prefix).toContain(`**${VOID}.**`);
      expect(cells!.at(-1), prefix).toMatch(/^open: go-live rows? \d+/u);
    }
    expect(rowOf("Later")?.at(-1)).toMatch(/^closed: [^|]*P2-M40 void: card processor changed to NETOPIA \(2026-10-08\)/u);
    const ruled = rows.find((cells) => cells[0] === "Minors" && cells[1]!.startsWith("P2-M2 "));
    expect(ruled, "no ruled Minors row").toBeDefined();
    if (!isClosed(ruled!)) {
      for (const needle of ["46 (P2-M2: void", "47 (P2-M17)", "48 (P2-M21)", "49 (P2-M25)", "50 (P2-M26)", "51 (P2-M28)",
        "52 (P2-M36)", "53 (P2-M37)"]) {
        expect(ruled!.at(-1), needle).toContain(needle);
      }
    }
    // W16 fix F1: the "later" Minors are a billing-on gate, each fixed by a later task or accepted in writing.
    expect(rowOf("Later")?.[2]).toBe(
      "the owner, before billing is switched on (go-live row 38), each fixed by a later task or accepted in writing");
    // W16 fix G1: the final review's owner items that no other row holds, each with who decides it.
    const owner = rowOf("Owner items") ?? [];
    expect(owner[1]).toMatch(/^The final review's owner items that no other row holds\. /u);
    for (const needle of ["P2-I1's source order", "`--environment`", "429", "sandbox and live transaction ids can collide",
      "company buyers must be offered the withdrawal", "D390", "not registered for VAT", "outside the EU",
      "change their billing country or address", "before billing is switched on"]) {
      expect(owner[1], needle).toContain(needle);
    }
    expect(owner[2]).toBe("owner; counsel (go-live row 24); accountant (go-live row 16)");
    // W16 fix G1: the deletion screen's sentence is one of the owner's wording picks.
    const erasure = rowOf("P2-I10 (owner, accountant)") ?? [];
    expect(erasure[1]).toContain("(4) The owner picks the final wording of the deletion screen's sentence (`settings.erasure.paidPlan`)");
    expect(erasure[2]).toContain("the wording pick of the deletion screen's sentence");
    // The controller's note on the role split (the W8 judge): the API principal keeps the two reads billing mail needs.
    expect(items).toContain("the API principal keeps SELECT on `billing.customer` and on `identity.\"user\"` (`user_id`, `owner_ref`, `email_ciphertext`)");
  });

  it("§14.9 gives the owner the sandbox run: the test cards, the stage clock and the fake-stack proof", () => {
    for (const needle of [
      "### 14.9 The sandbox run, end to end (OWNER-RUN)", "9900 0048 1022 5098", "9900 0091 8421 4768",
      "BILLING_STAGE_CLOCK_OFFSET_DAYS=31", "BILLING_STAGE_CLOCK_LIVE_REFUSED",
      "pnpm exec vitest run tests/integration/billing-whole-flow.test.ts",
      "BILLING_STAGE_LIVE_INVOICER_REFUSED", "`https://smartbill.invalid`", "made as a buyer outside Romania",
      "Fill in the company's CUI first (§14.7)", "BILLING_COMPANY_FACTS_UNVERIFIED:cui",
      "The stage clock only ever goes up", "A host must never go live holding rows written on a moved clock",
      "BILLING_LIVE_SANDBOX_INVOICER_REFUSED", "on a second test account (Germany again", "ALREADY_SUBSCRIBED",
      "beside anything but Quaderno's sandbox and a `.invalid` SmartBill address",
      "its usage bars and a withdrawal's credit-used share", "the fake stack in step 6 proves the bars and the share",
      "so do not run them on this host while the line is set",
      "**Before step 1: read the journal of the first start with billing on.**",
      "_SYSTEMD_INVOCATION_ID=\"$(systemctl show --property=InvocationID --value debateai-api)\"",
      "run the journal command from **Before step 1** again; it should print nothing",
      // F6a fix round 1: each check run posts one unsigned message, so both journal reads name that one line as
      // expected; the filters themselves are unchanged, so a NETOPIA message that lost its header still shows.
      "It should print nothing except one `billing.notice.unverified` line with `NOTICE_HEADER_MISSING` for each run " +
        "of the check command since that start. That line is the check's own unsigned message (§14.2) and needs nothing",
      "Any other line it prints: look it up in the journal table of §14.8",
      "it should print nothing except one `billing.notice.unverified` line with `NOTICE_HEADER_MISSING` for each run " +
        "of the check command since the restart",
      "pnpm exec vitest run tests/integration/billing-dispute-fake-stack.test.ts",
      "Start the second only after the first has finished",
      "Do this on a **separate, throwaway server**", "**Domain and `PUBLIC_APP_URL`**",
      "**Register version with `countryPolicy`**", "`sandbox@example.invalid:not-a-token`",
      "8. **Destroy the sandbox server.**", "The line never comes out",
      "pay for Plus first: a cancel link is sent only for a plan that is paid",
      "u.kind = 'SUBMIT_UNKNOWN') AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED'))",
      "**NETOPIA's own test of our flow.**", "**The small live test, with billing off.**",
      "Every row must say `TOOL_ORDER`.",
      // Ruling PR-45: the setup asks the SmartBill user, then the token at a hidden prompt.
      "then `sandbox@example.invalid` as the API user and `not-a-token` at the hidden token prompt",
      // Ruling PR-47: every recording run is named, the fixtures are checked before they are committed, and the live
      // capture folder is deleted.
      "--order \"$ORDER\" --no-ntp-id", "status --capture-dir /var/tmp/netopia-capture --unknown-order",
      "billing:netopia-sandbox zero --capture-dir /var/tmp/netopia-capture",
      "charge --capture-dir /var/tmp/netopia-capture --from-order \"$ORDER\"",
      "fixture --capture-dir /var/tmp/netopia-capture --order \"$ORDER\"",
      "--out tests/fixtures/netopia --recorded-on \"$RECORDED_ON\"",
      "pnpm exec vitest run tests/unit/payments-netopia-recorded-fixtures.test.ts",
      "A red run means: do not commit, keep the raw folder private, and hand it to a developer session.",
      "rm -r /var/tmp/netopia-capture"
    ]) {
      expect(billing.replace(/\s+/gu, " "), needle).toContain(needle);
    }
    // Lowering the offset mid-run would stall jobs scheduled on the moved clock for a month.
    expect(billing).not.toContain("Remove the line and restart the API again");
    // W14 (P2-I19): no "stage host" that is rebuilt and could then go live, and no billing switch-on without countryPolicy.
    expect(billing).not.toContain("rebuild the stage host");
    expect(billing).not.toContain("on a **stage** host");
    expect(billing).not.toContain("Publish\n`billingPolicy` with `enabled: true` on that host only");
  });

  it("N25 (spec 2026-10-05 §2.21): §14 is NETOPIA's: the guided setup, the message, the owner's refunds, the live test", () => {
    const flat = billing.replace(/\s+/gu, " ");
    // No step of the previous card processor is left, and no hand-made key file.
    expect(billing).not.toMatch(new RegExp(["x", "money"].join(""), "iu"));
    expect(billing).not.toContain("SDK_ORIGIN");
    expect(billing).not.toContain("same-origin-allow-popups");
    expect(billing).not.toContain("systemd-ask-password");
    for (const needle of [
      // §14.1
      "A NETOPIA Payments merchant account with a point of sale (POS) for the site, in the sandbox first",
      "Nobody but you ever sees a key. You type each key at the guided setup's hidden prompt yourself, and no agent reads it.",
      // §14.2: the guided setup and the check command are the only way keys and values are entered.
      "bash /opt/debateai/dialectical-engine/deploy/vps/billing-setup.sh",
      "bash /opt/debateai/dialectical-engine/deploy/vps/billing-setup.sh --replace netopia",
      "# >>> billing settings (billing-setup.sh) >>>", "# <<< billing settings <<<",
      "/etc/debateai/api/billing/netopia-api-key", "/etc/debateai/api/billing/netopia-ipn-keys.pem",
      "deploy/vps/netopia/published-ipn-key.pem", "eeba3b06",
      "Check that fingerprint with NETOPIA before you choose it",
      "/usr/bin/pnpm billing:check", "It never prints a key.",
      "BILLING_IPN_KEYS_FILE_UNSAFE", "NETOPIA_IPN_KEYS_INVALID",
      "BILLING_CONFIGURATION_INVALID:NETOPIA_API_BASE_URL", "BILLING_CONFIGURATION_INVALID:NETOPIA_POS_SIGNATURE",
      "https://secure-sandbox.netopia-payments.com", "https://secure.netopia-payments.com/api",
      // §14.5: NETOPIA's message.
      "/api/v1/billing/netopia/notify", "NETOPIA needs no notification setting in its admin",
      "`PUBLIC_APP_URL` must be the site's exact public address", "NETOPIA does not follow a redirect",
      "`{\"errorType\":0,\"errorCode\":0,\"errorMessage\":\"OK\"}`", "kept for 14 days",
      "checked again at every start of the API", "O4",
      // §14.7: what NETOPIA checks on the site before it approves the shop.
      "apps/ui/public/payment-marks/netopia.svg", "ANPC",
      // §14.8: refunds in the owner mode, the one command, and the reminders.
      "**A refund handed to you.**", "O2_REFUND_DUE", "O2_REFUND_REMINDER",
      "refund exactly the amount the email names, on that payment, in one refund",
      "/usr/bin/pnpm billing:refund-done --charge \"$CHARGE_REF\" --amount \"$AMOUNT\" --confirm",
      "A whole refund is recorded by the site itself as soon as NETOPIA reports it",
      // §14.8: sandbox to live, with the guided setup.
      "Going from NETOPIA's sandbox to live on the same host", "BILLING_OTHER_SYSTEM_RECORDS_OPEN",
      "grep -E '^(NETOPIA_API_BASE_URL|NETOPIA_POS_SIGNATURE|QUADERNO_API_BASE_URL|SMARTBILL_API_BASE_URL)=' /etc/debateai/api.env",
      "stat -c '%y %U %a %n' /etc/debateai/api/billing/netopia-api-key /etc/debateai/api/billing/netopia-ipn-keys.pem",
      // F6b (ops-5): the first live payment's message is read on our own live charge, never on the environment alone.
      "FROM billing.payment_notice n JOIN billing.charge c ON c.charge_id = n.order_id",
      // §14.8: disputes are a status of the payment's own order.
      "NETOPIA reports a dispute as a status of the payment itself",
      "r.provider_payment_id = e.provider_payment_id",
      // §14.9: the sandbox run, NETOPIA's own test, and the small live test with billing off.
      "9900 0048 1022 5098", "9900 0091 8421 4768", "**NETOPIA's own test of our flow.**",
      "**The small live test, with billing off.**", "provider-only mode",
      "--live --i-understand-this-charges-my-card", "pnpm billing:netopia-sandbox",
      "8. **Destroy the sandbox server.**"
    ]) {
      expect(flat, needle).toContain(needle);
    }
    // Every prompting command (the guided setup, the owner commands' reads) is the last line of its block.
    for (const block of billing.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      const lines = (block[1] ?? "").split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
      lines.forEach((line, index) => {
        if (line.includes("billing-setup.sh") || line.startsWith("read -r")) expect(index, line).toBe(lines.length - 1);
      });
    }
    // The claims stay true of the script the runbook sends the owner to (ruling PR-44: the script's mask is 077).
    const setup = read("deploy/vps/billing-setup.sh");
    for (const needle of ["systemd-ask-password", "umask 077", "--replace", "# >>> billing settings (billing-setup.sh) >>>"]) {
      expect(setup, needle).toContain(needle);
    }
    // Every refusal billing:refund-done can print is explained (the command and its RefundDesk checks).
    const refundDone = ["apps/api/src/billing/refund-done-cli.ts", "apps/api/src/billing/refunds.ts"]
      .flatMap((path) => read(path).match(/BILLING_REFUND_DONE_[A-Z_]+/gu) ?? []);
    expect(new Set(refundDone).size).toBeGreaterThanOrEqual(7);
    for (const code of new Set(refundDone)) expect(flat, code).toContain(`\`${code}\``);
  });

  it("N25 fix round 1: every owner email §14 quotes as (O…, \"…\") is quoted by its template's English subject", () => {
    // The subject is the template's own (packages/mail-templates); a {param} part is written "…" in the runbook, so the
    // next change to a subject turns this red instead of leaving the runbook quoting an email nobody receives.
    const owner = JSON.parse(read("packages/mail-templates/messages/en/owner.json")) as Record<string, string>;
    const quotes = [...billing.replace(/\s+/gu, " ").matchAll(/\((O[0-9][A-Z0-9_]*), "([^"]*)"/gu)]
      .map((match) => ({ code: match[1]!, quote: match[2]! }));
    expect(quotes.map(({ code }) => code)).toEqual(expect.arrayContaining(["O2_WITHDRAWAL", "O2_REFUND_DUE", "O3"]));
    for (const { code, quote } of quotes) {
      const subject = owner[`owner.${code}.subject`];
      expect(subject, `owner.${code}.subject`).toBeTypeOf("string");
      expect(quote, code).toBe(subject!.replace(/\{[A-Za-z]+\}/gu, "…"));
    }
  });
});
