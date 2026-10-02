import { readFileSync } from "node:fs";
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
      "apps/ui/public/payment-marks/visa.svg", "apps/ui/lib/legal/pages.ts", "COMPANY", "[RO…]",
      "packages/billing-core/src/company.ts", "SELLER_COMPANY", "BILLING_COMPANY_FACTS_UNVERIFIED",
      "The company's tax codes are not `api.env` settings", "as digits only, never with `RO`",
      "tests/unit/billing-seller-company.test.tsx",
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
      // §14.8 (D5 5h): no sandbox plan or charge left open when the host moves to live.
      "Going from xMoney's sandbox to live on the same host", "BILLING_STAGE_RECORDS_OPEN",
      "open_sandbox_subscriptions", "open_sandbox_charges",
      // §14.8: sandbox records stay but are never sales (P1b's quarter summary reads live charges only).
      "they never count as sales", "the quarterly tax summary and its email read only live charges",
      // §14.5 (ruling Q-2): the notice address's two non-200 answers, and the card pages' Payment Request policy.
      "What the notice address answers", "once it has stored the notice", "`429`", "`500`", "payment=()",
      // §14.5 (P19): the card pages' Payment Request policy is read at request time, never baked into the build.
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
      // §14.8 (ruling Q-5): a refund that could not be completed reaches the owner at once.
      "A refund that could not be completed", "O2",
      // §14.4 (D6a's recurring net): a new price reaches only new subscriptions.
      "reaches only new subscriptions",
      // §14.8 (D6a P10b, D6b P16b): nobody reads the e-Factura status for you; the summary lists what to check,
      // and the owner records ANAF's answer with P16b's command.
      "e-Factura", "Romanian e-Factura documents to confirm", "pnpm billing:efactura-status --invoice",
      // §14.2 (ruling Q-12): the records key is escrowed with the other five secrets.
      "sixth secret", "RESTORE_DRILL_RECORDS_KEY bytes=32",
      // §14.7 (ruling Q-3): the Terms archive M1 attaches from is never pruned.
      "apps/ui/legal/archive/",
      // §14.4 (G5, final review Part 1a I-3): the switches come from their own example, and only once §5's
      // conditions hold; taxAuthorities is copied only to correct the code-owned text (P16a judge, carried).
      "deploy/vps/register/country-policy.example.json", "only to correct the text"
    ]) {
      expect(billing, needle).toContain(needle);
    }
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

  it("the go-live checklist carries the billing rows 14–37 after B11b's row 13, each with a way to prove it", () => {
    const checklist = read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md");
    const rows = [...checklist.matchAll(/^\| (\d+) \|/gmu)].map((match) => Number(match[1]));
    expect(rows).toEqual(Array.from({ length: 37 }, (_unused, index) => index + 1));
    // The needles must be in the table itself: the dated notes under it repeat some of these words (P16a's note names
    // the One-Stop Shop), and a note never stands in for a row.
    const table = checklist.split("\n").filter((line) => /^\| \d+ \|/u.test(line)).join("\n");
    for (const needle of [
      "xMoney has approved the merchant account", "sandbox end-to-end run", "One-Stop Shop",
      "payment-marks", "SELLER_COMPANY", "notice URL", "same-origin-allow-popups", "records key",
      "daily ceiling covers the subscribers", "XMONEY_SDK_ORIGIN", "Terms §13", "counsel",
      // D5 5k: the recorded suites cannot stay skipped by accident.
      "all 25 required X0 kinds present and the X0 suites green", "Permissions-Policy",
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
      "app-navigation", "budget-tier-choice"
    ]) {
      expect(table, needle).toContain(needle);
    }
  });
});
