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

describe("P22 the Billing runbook", () => {
  it("exists as §14 and names every setting, key file and code an operator needs", () => {
    expect(readme).toContain("## 14. Billing (paid plans)");
    for (const needle of [
      "XMONEY_PRIVATE_KEY_PATH", "XMONEY_PUBLIC_KEY", "XMONEY_SITE_ID", "XMONEY_API_BASE_URL",
      "QUADERNO_API_KEY_PATH", "QUADERNO_API_BASE_URL", "SMARTBILL_CREDENTIALS_PATH", "SMARTBILL_API_BASE_URL",
      "SMARTBILL_SERIES", "OWNER_REPORT_EMAIL_PATH", "PUBLIC_APP_URL",
      "RECORDS_KEY_PATH", "GEOIP_COUNTRY_DB_PATH", "TOR_EXIT_LIST_PATH", "XMONEY_SDK_ORIGIN",
      "RECORDS_KEY_PATH_MUST_BE_SEPARATE", "GEOIP_PATHS_REQUIRED",
      "--property=EnvironmentFile=/etc/debateai/api.env",
      "Country data — the GeoIP and Tor refresh",
      "/api/v1/billing/xmoney/notify", "Sites → Payment Page", "debateai-geoip-refresh.timer",
      "billingPlans", "billingPolicy", "countryPolicy", "taxAuthorities",
      "pnpm billing:tax-summary --quarter", "pnpm billing:dispute", "IP Geolocation by DB-IP",
      "BILLING_CONFIGURATION_INCOMPLETE", "BILLING_REQUIRES_ENVELOPE_MEMBERS", "same-origin-allow-popups",
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
      "r.xmoney_transaction_id = e.xmoney_transaction_id", "e.error_code", "DUPLICATE_PAYMENT",
      "STILL_DISPUTED", "BILLING_DISPUTE_AMBIGUOUS",
      // §14.8 (W2, P2-I2): a dispute xMoney reports as its own transaction is listed under the payment it names.
      "the list shows the xMoney transaction id of the payment the dispute is about",
      "is recorded under the payment it names, so match that payment's id, not the",
      // §14.8 (D5 5h): no sandbox plan or charge left open when the host moves to live.
      "Going from xMoney's sandbox to live on the same host", "BILLING_STAGE_RECORDS_OPEN",
      "open_sandbox_subscriptions", "open_sandbox_charges",
      // §14.8 (P2-I4): and no sandbox refund, invoice or credit-note job still queued (the start-up check counts them).
      "open_sandbox_jobs",
      // §14.8 (W14, P2-I19): never on a host whose billing clock moved; the live start's safety net and its limit.
      "**Never take this path on a host that has ever run with `BILLING_STAGE_CLOCK_OFFSET_DAYS`**",
      "BILLING_RECORDS_DATED_AHEAD", "That is only a safety net: a month after such a",
      // §14.8 step 4 (W14, P2-I20): the live site's id, public key and key files too, then the live notice address.
      "`XMONEY_SITE_ID` and\n     `XMONEY_PUBLIC_KEY` to the live site's id and public key",
      "remove `xmoney-private-key` and `quaderno-api-key` on purpose",
      "rm /etc/debateai/api/billing/xmoney-private-key", "rm /etc/debateai/api/billing/quaderno-api-key",
      "Finally, set the notification URL in the **live** xMoney dashboard",
      // §14.8 (W14, go-live rows 19 and 23): the read-back on the day, and the first live notice.
      "**Read the settings back before switching on.**",
      "grep -E '^(XMONEY_API_BASE_URL|XMONEY_SITE_ID|XMONEY_PUBLIC_KEY|QUADERNO_API_BASE_URL|SMARTBILL_API_BASE_URL)=' /etc/debateai/api.env",
      "stat -c '%y %n' /etc/debateai/api/billing/xmoney-private-key",
      "FROM billing.xmoney_notice WHERE xmoney_environment = 'live'",
      // §14.8 (W3 fix round 1): a sandbox withdrawal handed to the owner is settled before the switch, which refuses it.
      "If a sandbox withdrawal was handed to you", "while the host still points at the sandbox, with `pnpm billing:withdraw --owner",
      "After the switch the command refuses a sandbox plan (`NOT_SUBSCRIBED`), and the summary would list it for ever.",
      // §14.8 (W3 fix round 1): what closes by itself, and when; the refund that never closes without the sandbox key.
      "An invoice or credit note that keeps failing is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, and then given up.",
      "A payment check is given up after at most about 31 hours.",
      "A refund that xMoney's sandbox could not be reached for, or that it refused the sandbox key for, is never given up: it is tried again every 12 hours.",
      "The API's journal shows the line `billing.xmoney.credentials_refused` each time the key is refused.",
      "Such a refund closes only once the sandbox key and xMoney's sandbox work, so leave the sandbox key in place until the switch is done.",
      // §14.8 (W3 fix round 1): the third query counts the payment checks that name a sandbox charge, which the site
      // refuses beside a refund, invoice or credit note of the other system.
      "payment checks that name a sandbox charge",
      "(the site refuses a refund, invoice, credit note or payment check of the other xMoney system)",
      // §14.8: sandbox records stay but are never sales (P1b's quarter summary reads live charges only).
      "they never count as sales", "the quarterly tax summary and its email read only live charges",
      // §14.5 (ruling Q-2): the notice address's two non-200 answers, and the card pages' Payment Request policy.
      "What the notice address answers", "once it has stored the notice", "`429`", "`500`", "payment=()",
      // §14.5 (P19, X0 (e) item 6): today every page sends payment=() from apps/ui/next.config.mjs, and the middleware
      // sets only the security policy; only X0 (e) item 6's code change would read XMONEY_SDK_ORIGIN on each request.
      "The website's middleware sets this on each request from `XMONEY_SDK_ORIGIN`", "No rebuild is needed",
      // §14.8 (ruling Q-9, D6b P14c): a withdrawal sent by email, carried out by the owner's command.
      "A withdrawal sent by email or on the model form", "pnpm billing:withdraw --owner", "--received", "--refund",
      "WITHDRAWAL_BY_OWNER", "identity_owner_ref",
      // §14.8 (D6b P14c): the dashboard part is refunded there first, then recorded with --dashboard; M8 names the sum.
      "First, in the xMoney dashboard,", '--dashboard "$DASHBOARD"',
      // §14.8 (ruling Q-1): an outage at renewal keeps the plan quietly for up to 3 days.
      "When xMoney or the tax service is down at a renewal", "retried quietly for up to 3 days",
      // §14.8 (P11a judge, carried): the renewal pass's two journal signals, and what each means.
      "\"event\":\"billing.renewal.report\"", "taxRefused", "[BILLING_RENEWAL_PENDING]",
      // §14.8 (W13, P2-I18): the brief's eight signals and the listing line are in the journal table, each with what to
      // do; the three daily listings fail on their own; a CUSTOMER_MISMATCH reaches the operator with the hand refund.
      "What billing writes to the API's journal",
      "| `\"event\":\"billing.reconcile.listing_failed\"`, with `listing` and `code` |",
      "| `[BILLING_RECONCILIATION_PENDING]` (a bare marker) |", "| `[BILLING_OUTBOX_PENDING]` (a bare marker) |",
      "| `[BILLING_ERASURE_SWEEP_PENDING]` (a bare marker) |", "| `[BILLING_OWNER_JOBS_PENDING]` (a bare marker) |",
      "| `\"event\":\"billing.outbox.dead\"`, with `kind`, `code` and `attempts` |",
      "| `\"event\":\"billing.outbox.alert_failed\"`, with `kind` and `code` |",
      "| `\"event\":\"billing.outbox.settle_failed\"`, with `kind`, `outcome` and `attempts` |",
      "| `\"event\":\"billing.xmoney.credentials_refused\"`, with `operation` |",
      // P2-M27: a quote the tax service refuses is its own signal (a wrong Quaderno key), never read as an outage.
      "| `\"event\":\"billing.quote.refused\"`, with `code` `TAX_SERVICE_REFUSED` and `reason` |",
      "| `\"event\":\"billing.invoice.unknown\"`, with `issuer`, `kind` and `code` |",
      "| `\"event\":\"billing.payment.mismatch\"`, with `code` or `chargeKind` |",
      "this one is asked again on its own every hour", "A list xMoney refuses never causes it",
      "`REFUND_NOT_REQUESTED` or `CREDIT_NOTE_REFUND_MISSING`: do not refund and do not issue a credit note",
      "WHERE o.outcome = 'MISMATCH'", "refund it there by hand",
      // W13 fix round 1: the alert promise is exact (O3 never for a dead O3; O2 comes from the refund itself, not for
      // REFUND_PAYLOAD_INVALID or a refund the queue stopped), a refused key keeps a renewal only for its window, any
      // other listing code is reported, and only this host's xMoney system's mismatches are acted on.
      "except when the email that died is O3 itself", "(`REFUND_PAYLOAD_INVALID`)", "usually `OUTBOX_HANDLER_FAILED`",
      "lists every dead refund job whatever its code", "for up to 3 days past its due time (a payment retry: 24 hours)",
      "Fixing the key within that time", "Any other code (for example `UNKNOWN`",
      "SELECT n.received_at, n.xmoney_environment,", "Act only on rows of this host's xMoney system",
      // §14.8 (ruling Q-5): a refund that could not be completed reaches the owner at once.
      "A refund that could not be completed", "O2",
      // §14.8 (W9, P2-I11, P2-M8): the acknowledgement of receipt, the owner's alert for a withdrawal settled by hand,
      // and a dead withdrawal refund's deadline and one-refund rule.
      "M8_RECEIVED", "O2_WITHDRAWAL", "the date the refund is due by", "in one refund",
      // W9 fix round 1 (F1): look first, never refund twice, and refund exactly the named amount; a smaller or split
      // refund is not recorded (REFUND_UNRECORDED), so the owner confirms it and tells the accountant.
      "Look at that payment in the xMoney dashboard first", "never refund it again",
      "refund exactly the amount the email names", "is not recorded at all", "give its amount to the accountant",
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
      "billing.notice.undecryptable", "billing.mail.attachment_missing", "billing.renewal.stuck",
      "billing.renewal.price_missing", "billing.renewal.history_invalid", "billing.maintenance.report",
      "billing.reconcile.errors", "billing.reconcile.expired", "billing.reconcile.rows_rejected", "billing.refund.dead",
      "billing.refund.unrecorded", "billing.xmoney.row_rejected", "billing.outbox.other_system",
      "billing.refund.outcome_unknown", "billing.refund.refused", "billing.renewal.owner_stopped",
      "billing.renewal.dunning_unpriced", "billing.reconcile.no_transaction", "billing.cancel_link.failed",
      "billing.renewal.tax_refused", "billing.renewal.unknown", "billing.renewal.pending", "billing.chargeback",
      "billing.withdrawal.owner_review",
      // W13's rows, kept.
      "billing.renewal.report", "billing.reconcile.listing_failed", "billing.outbox.dead", "billing.outbox.alert_failed",
      "billing.outbox.settle_failed", "billing.xmoney.credentials_refused", "billing.quote.refused",
      "billing.invoice.unknown", "billing.payment.mismatch"
    ]) {
      expect(rowEvents, alarm).toContain(alarm);
    }
    // Each row says what to do: the third cell is never empty.
    for (const line of tableLines.slice(2)) expect((line.split(" | ")[2] ?? "").trim(), line).not.toBe("");

    // The rows the brief's sources ask for, word for word where the action matters.
    for (const needle of [
      // P2-W4 / P2-W3 (b) (the P4-B judge's forward): the other-system row covers a renewal notice too.
      "or a renewal notice (`RENEWAL_NOTICE`) of a plan of the other system",
      // The daily dead-refund count holds jobs that owe nothing; the summary's code says which.
      "Not every one is owed", "the summary's own names",
      // A notice the key cannot open is answered 200 and never stored, so its payment waits for the daily check.
      "this host's xMoney private key cannot decrypt",
      // The erasure stop that failed at scheduling is repeated by the sweep.
      "the sweep in front of the money check",
      "The page had already said a link is on its way"
    ]) {
      expect(billing.replace(/\s+/gu, " "), needle).toContain(needle);
    }
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
      "If any of them is not 0, do not switch billing off"
    ]) {
      expect(paragraph, needle).toContain(needle);
    }
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

  it("asks for every billing secret at a prompt, never through an editor, and never replaces one", () => {
    // Spec §2.2 rule 8: a custody-checked file. The value never appears on screen, on a command line, in shell
    // history or in an editor's temporary copy (the vendor procedure's rule, README §3).
    expect(billing).not.toMatch(/sudoedit \/etc\/debateai\/api\/billing/u);
    for (const file of ["xmoney-private-key", "quaderno-api-key", "smartbill-credentials", "owner-report-email"]) {
      expect(billing, file).toContain(`test ! -e /etc/debateai/api/billing/${file} && (umask 0177 && systemd-ask-password`);
    }
    // Re-review item 4 (vps-deployment-baseline): without bracketed paste a waiting prompt takes the NEXT pasted
    // line as its answer, so every prompting line is the last line of its block.
    for (const block of billing.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      const lines = (block[1] ?? "").split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
      lines.forEach((line, index) => {
        if (line.includes("systemd-ask-password")) expect(index, line).toBe(lines.length - 1);
      });
    }
  });

  it("names the same custody files as the API's example environment (P6a)", () => {
    const example = read("deploy/vps/env/api.env.example");
    for (const file of ["xmoney-private-key", "quaderno-api-key", "smartbill-credentials", "owner-report-email"]) {
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

  it("the go-live checklist carries the billing rows 14–54 after B11b's row 13, each with a way to prove it", () => {
    const checklist = read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md");
    const rows = [...checklist.matchAll(/^\| (\d+) \|/gmu)].map((match) => Number(match[1]));
    expect(rows).toEqual(Array.from({ length: 54 }, (_unused, index) => index + 1));
    // The needles must be in the table itself: the dated notes under it repeat some of these words (P16a's note names
    // the One-Stop Shop), and a note never stands in for a row.
    const table = checklist.split("\n").filter((line) => /^\| \d+ \|/u.test(line)).join("\n");
    for (const needle of [
      "xMoney has approved the merchant account", "sandbox end-to-end run", "One-Stop Shop",
      "payment-marks", "SELLER_COMPANY", "notice URL", "same-origin-allow-popups", "records key",
      "daily ceiling covers the subscribers", "XMONEY_SDK_ORIGIN", "Terms §13", "counsel",
      // D5 5k: the recorded suites cannot stay skipped by accident.
      "all 28 required X0 kinds present", "the X0 suites green", "Permissions-Policy",
      // W14 (P2-I3): X0 shows whether the card check's order's rebill takes the money; a hold changes A12 first.
      "transaction-rebill-auth-order-released", "only holds the money, A12 (the card change) is changed before billing is on",
      // W14 (P2-I20): row 19 needs a LIVE notice, row 23 the live site's id, public key and key files.
      "`xmoney_environment = 'live'`", "`XMONEY_SITE_ID` and `XMONEY_PUBLIC_KEY` are the live site's",
      "`xmoney-private-key`, `quaderno-api-key` and `smartbill-credentials` files hold the live keys",
      // W13 (P2-I18): X0 confirms the daily money check's dispute listing.
      "`dateType=charge-back` listing is accepted", "transaction-list-charge-back",
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
      // Row 23 (P23 fix G1): going live moves the invoicers' addresses too, not only xMoney's.
      "SMARTBILL_API_BASE_URL",
      // P24 (2026-10-02): billing stays off until every item of Part 2's final review is closed.
      "PART2-FINAL-REVIEW-OPEN-ITEMS.md",
      // W2 (P2-I2): row 15's proof includes the dispute fake stack.
      "billing-dispute-fake-stack.test.ts",
      // W16 (the W7, W10 and W15 judges' notes): row 36's reader also reads the keys Part 2b wrote.
      "`settings.erasure.paidPlan`", "`billing.checkout.rateLimited`", "`billing.cancelPage.nothingToCancel`",
      "`billing.checkout.refundedBeforeStart`",
      // W16 (P2-M34): the card marks are copied before the website's last start.
      "restart `debateai-ui`",
      // Part 3's final review (2026-10-03): billing stays off until every item of Part 3's final review is closed.
      "PART3-FINAL-REVIEW-OPEN-ITEMS.md"
    ]) {
      expect(table, needle).toContain(needle);
    }
    // W16: rows 40–54 hold the items the final review deferred to a ruling or a vendor fact that Part 2b did not build,
    // plus the "later" Minors (row 54); each names who decides and how it is proven. Every other open item is a row of
    // the open-items file whose status names the go-live rows that share its work, and row 38 holds them all.
    const row = (number: number): string => table.split("\n").find((line) => line.startsWith(`| ${number} |`)) ?? "";
    for (const [number, needles] of [
      [40, ["P2-I3", "A12 (the card change)", "`transaction-rebill-auth-order-released` reads `void-ok`"]],
      [41, ["P2-I5", "billing-only database role", "`runner-runtime`", "`scheduler-liveness`", "`email_ciphertext`",
        "(a) to (c)"]],
      [42, ["P2-I8", "Terms §13", "how an upgrade's own days are counted", "CRD art. 14(3)"]],
      [43, ["P2-I9", "public holiday", "Regulation 1182/71 art. 3(4)", "withdrawal-deadline.ts"]],
      [44, ["P2-I13", "`withdrawal_days`", "`billing.consent.immediateStart`", "country-neutral", "generate:legal:check"]],
      [45, ["P2-I15", "never took money", "`billing.purge_expired_records`", "Privacy Policy"]],
      [46, ["P2-M2", "refund transaction", "verify-payment.ts", "refunds.ts", "reconcile.ts", "`refund-ok`"]],
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
      expect(line, `row ${number} is open`).toMatch(/\| — \|$/u);
    }
    // W16 fix F1: the "later" Minors gate switching billing on, each fixed or accepted in writing.
    expect(row(54)).not.toContain("None blocks switching billing on alone");
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
    }
    // The mappings below describe rows still open; a row the controller has closed has done its job, but a missing
    // row is still a failure.
    const rowOf = (id: string): string[] | undefined => rows.find((cells) => cells[0] === id);
    const isClosed = (cells: readonly string[]): boolean => (cells.at(-1) ?? "").startsWith("closed");
    for (const [id, needle] of [
      ["P2-I1", "fixed in Part 2b (W1)"], ["P2-I3", "go-live rows 14 and 40"], ["P2-I5 (part 3)", "go-live row 41"],
      ["P2-I8", "go-live rows 24 and 42"], ["P2-I9", "go-live row 43"], ["P2-I13", "go-live row 44"],
      ["P2-I15", "go-live row 45"], ["P2-M34", "go-live row 17"], ["Later", "go-live row 54"],
      ["Owner items", "go-live rows 14, 16, 24 and 38"]
    ] as const) {
      const cells = rowOf(id);
      expect(cells, `no row ${id}`).toBeDefined();
      if (!isClosed(cells!)) expect(cells!.at(-1), id).toContain(needle);
    }
    const ruled = rows.find((cells) => cells[0] === "Minors" && cells[1]!.startsWith("P2-M2 "));
    expect(ruled, "no ruled Minors row").toBeDefined();
    if (!isClosed(ruled!)) {
      for (const needle of ["46 (P2-M2)", "47 (P2-M17)", "48 (P2-M21)", "49 (P2-M25)", "50 (P2-M26)", "51 (P2-M28)",
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
    expect(owner[2]).toBe("owner; xMoney (through the owner); counsel (go-live row 24); accountant (go-live row 16)");
    // W16 fix G1: the deletion screen's sentence is one of the owner's wording picks.
    const erasure = rowOf("P2-I10 (owner, accountant)") ?? [];
    expect(erasure[1]).toContain("(4) The owner picks the final wording of the deletion screen's sentence (`settings.erasure.paidPlan`)");
    expect(erasure[2]).toContain("the wording pick of the deletion screen's sentence");
    // The controller's note on the role split (the W8 judge): the API principal keeps the two reads billing mail needs.
    expect(items).toContain("the API principal keeps SELECT on `billing.customer` and on `identity.\"user\"` (`user_id`, `owner_ref`, `email_ciphertext`)");
  });

  it("§14.9 gives the owner the sandbox run: the test cards, the stage clock and the fake-stack proof", () => {
    for (const needle of [
      "### 14.9 The sandbox run, end to end (OWNER-RUN)", "4111 1111 1111 1111", "5168 4948 9505 5780",
      "BILLING_STAGE_CLOCK_OFFSET_DAYS=31", "BILLING_STAGE_CLOCK_LIVE_REFUSED",
      "pnpm exec vitest run tests/integration/billing-whole-flow.test.ts",
      // No stage payment reaches a live invoicer, and no sandbox purchase takes the Romanian route.
      "BILLING_STAGE_LIVE_INVOICER_REFUSED", "SMARTBILL_API_BASE_URL=https://smartbill.invalid",
      "made as a buyer outside Romania",
      // D5's R3-A: a stage boot builds the SmartBill connection from COMPANY too, so the CUI comes first.
      "Fill in the company's CUI first (§14.7)", "BILLING_COMPANY_FACTS_UNVERIFIED:cui",
      // The offset only goes up, and leaves only with the stage data.
      "The stage clock only ever goes up", "A host must never go live holding rows written on a",
      // P23 fix G1: a live payment never meets a sandbox invoicer (§14.8 step 4; this case searches all of §14).
      "BILLING_LIVE_SANDBOX_INVOICER_REFUSED",
      // P23 fix G2: the 3-D Secure try is a second purchase, so it needs a second account.
      "on a second test account (Germany again", "ALREADY_SUBSCRIBED",
      // P23 fix F1: the stage rule fails closed.
      "beside anything but", "Quaderno's sandbox and a `.invalid` SmartBill address",
      // P23 fix F2: what the moved clock does not reach.
      "its usage bars and a withdrawal's credit-used share", "the fake stack in step 6 proves the bars and the share",
      "`billing:efactura-status`, `billing:invoice`) also\nrun on the real clock", "so do not run them on this host while the line is set",
      // W13 (P2-I18): the first start with billing on is read for the billing failure lines, before step 1 and after
      // step 2's restart.
      "**Before step 1: read the journal of the first start with billing on.**",
      "_SYSTEMD_INVOCATION_ID=\"$(systemctl show --property=InvocationID --value debateai-api)\"",
      "run the journal command from **Before step 1** again; it should print nothing",
      // W13 fix round 1: the step says what the filter really prints.
      "the lines that say a list failed or our key was refused, and billing's bracketed\nmarkers", "Any other line it prints:",
      // W2 (P2-I2, P2-M39): the dispute case is part of the owner's proof, run after the whole-flow suite.
      "pnpm exec vitest run tests/integration/billing-dispute-fake-stack.test.ts",
      "a card dispute found by the daily money check: the plan paused once, with one email, counted",
      "Start the second only after the first has finished",
      // W14 (P2-I19, the owner's ruling of 2 October 2026): a separate throwaway server, with what it needs of its own.
      "Do this on a **separate, throwaway server**", "**Domain and `PUBLIC_APP_URL`**",
      "notification URL to the sandbox domain followed by `/api/v1/billing/xmoney/notify`",
      "**Register version with `countryPolicy`**", "`sandbox@example.invalid:not-a-token`",
      "7. **Destroy the sandbox server.**", "The line never comes out",
      // P2-M38: pay before the emailed cancel; the closing check lists each charge left with an unknown outcome.
      "pay for Plus first: a cancel link is\n   sent only for a plan that is paid",
      "u.kind = 'SUBMIT_UNKNOWN') AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED'))"
    ]) {
      expect(billing, needle).toContain(needle);
    }
    // Lowering the offset mid-run would stall jobs scheduled on the moved clock for a month.
    expect(billing).not.toContain("Remove the line and restart the API again");
    // W14 (P2-I19): no "stage host" that is rebuilt and could then go live, and no billing switch-on without countryPolicy.
    expect(billing).not.toContain("rebuild the stage host");
    expect(billing).not.toContain("on a **stage** host");
    expect(billing).not.toContain("Publish\n`billingPolicy` with `enabled: true` on that host only");
  });
});
