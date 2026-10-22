import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Privacy Policy 3.5 (owner-approved 2026-10-22, for counsel and NETOPIA's site check): section 2's "Payments" row
 * said card details are never held by us, but the card store keeps the saved card's last four digits, expiry and
 * issuing country with NETOPIA's sealed renewal token (billing.card_token, migration 0111), the raw NETOPIA message is
 * kept sealed for 14 days (payment_notice_raw: BIN and issuer included), and the checkout keeps the payer's name,
 * phone, billing address and payment IP (BillingProfile, records.ts). Section 7 gains two rows: how long the saved
 * card is kept (until a day after it stops paying for a live plan, card-custody.ts purge) and the 14-day messages.
 *
 * Every locale: the Payments row (the row before the last of section 2's table) and the second new section 7 row both
 * name the 14 days, and section 7's table has English's row count. English and Romanian, the texts counsel reviews,
 * are pinned word for word.
 */

const section = (locale: string, from: number): string => {
  const markdown = readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "privacy-policy.md"), "utf8");
  const body = new RegExp(`^## ${from}\\.[^\\n]*\\n([\\s\\S]*?)^## ${from + 1}\\.`, "mu").exec(markdown)?.[1];
  if (body === undefined) throw new Error(`${locale}: no section ${from} before section ${from + 1}`);
  return body;
};

/** The body rows of the section's one table, without the header and the separator. */
const tableRows = (locale: string, from: number): string[] =>
  section(locale, from).split("\n").filter((line) => line.startsWith("| ")).slice(1)
    .filter((line) => !/^\|\s*-{3}/u.test(line));

const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

const PINNED = {
  en: {
    payments: "| **Payments** (once paid plans start) | Plan, price, billing period, transaction references, tax location evidence. The billing details you give at checkout: your name, phone number and billing address and, if you buy as a company, its name, VAT number and address; and the IP address you pay from. You type your card details on our payment provider's page, so your full card number and security code never reach us. Of your card, we keep its last four digits, its expiry month and year and the country where it was issued — to tell which card a payment was made with, to remind you before the card expires and to apply the rules for that country — and, stored encrypted, a code from the payment provider that lets it charge the same card at each renewal. For 14 days we also keep, encrypted, each message the payment provider sends us about a payment, exactly as it arrived; it also shows the first digits of the card number, which identify the bank that issued the card, and that bank's name | You, and the payment provider |",
    retention: [
      "| Payment records (once paid plans start) | 10 years, as Romanian accounting law requires | Deleted |",
      "| Saved card: the payment provider's code, with the card's last four digits, expiry and country | Until one day after the card stops paying for a live plan — when the plan ends, you replace the card or you close your account | Deleted; the last four digits, expiry and country also stay in the record of each payment made with that card |",
      "| The payment provider's messages about payments, as they arrived | 14 days | Deleted |"
    ]
  },
  ro: {
    payments: "| **Plăți** (odată ce încep planurile cu plată) | Planul, prețul, perioada de facturare, referințele tranzacției, dovezile privind localizarea fiscală. Datele de facturare pe care le introduceți la plată: numele, numărul de telefon și adresa de facturare, iar dacă cumpărați în numele unei firme, denumirea, codul de TVA și adresa acesteia; adresa IP de la care plătiți. Datele cardului le introduceți pe pagina furnizorului nostru de plăți, așa că numărul complet al cardului și codul de securitate nu ajung niciodată la noi. Din datele cardului păstrăm ultimele patru cifre, luna și anul expirării și țara în care a fost emis — pentru a ști cu ce card s-a făcut o plată, pentru a vă anunța înainte să expire cardul și pentru a aplica regulile acelei țări — precum și, criptat, un cod primit de la furnizorul de plăți, cu care acesta poate debita același card la fiecare reînnoire. Timp de 14 zile păstrăm, tot criptat, fiecare mesaj pe care furnizorul de plăți ni-l trimite despre o plată, exact așa cum a sosit; mesajul conține și primele cifre ale numărului cardului, care identifică banca emitentă, precum și numele acestei bănci | Dumneavoastră și furnizorul de plăți |",
    retention: [
      "| Evidențe de plată (odată ce încep planurile cu plată) | 10 ani, conform cerințelor legislației contabile române | Șterse |",
      "| Cardul salvat: codul furnizorului de plăți, cu ultimele patru cifre, data expirării și țara cardului | Până la o zi după ce cardul nu mai plătește un plan activ — când planul se încheie, înlocuiți cardul sau vă închideți contul | Șterse; ultimele patru cifre, data expirării și țara rămân și în evidența fiecărei plăți făcute cu acel card |",
      "| Mesajele furnizorului de plăți despre plăți, așa cum au sosit | 14 zile | Șterse |"
    ]
  }
} as const;

describe("Privacy Policy 3.5 says what we keep about payments and cards", () => {
  const englishRetentionRows = tableRows("en", 7).length;

  it.each(LOCALES.map(({ code }) => [code]))("%s: the Payments row and the new message row name the 14 days", (code) => {
    const collected = tableRows(code, 2);
    const payments = cells(collected[collected.length - 2]!);
    expect(payments, `${code}: Payments row shape`).toHaveLength(3);
    expect(payments[1], `${code}: Payments row names the 14 days`).toMatch(/14/u);
    const retention = tableRows(code, 7);
    expect(retention, `${code}: section 7 rows`).toHaveLength(englishRetentionRows);
    const at = tableRows("en", 7).findIndex((row) => row.startsWith("| The payment provider's messages"));
    const messages = cells(retention[at]!);
    expect(messages, `${code}: message row shape`).toHaveLength(3);
    expect(messages[1], `${code}: message row keeps them 14 days`).toMatch(/14/u);
  });

  it.each(Object.entries(PINNED))("%s: the rows read exactly as approved, in this order", (code, pinned) => {
    expect(tableRows(code, 2)).toContain(pinned.payments);
    const retention = tableRows(code, 7);
    const at = pinned.retention.map((row) => retention.indexOf(row));
    expect(at.every((index) => index >= 0), `${code}: ${JSON.stringify(at)}`).toBe(true);
    expect(at[1]).toBe(at[0]! + 1);
    expect(at[2]).toBe(at[1]! + 1);
  });

  it("English no longer says card details are never held by us", () => {
    expect(section("en", 2)).not.toContain("never by us");
    expect(section("en", 2)).toContain("your full card number and security code never reach us");
  });
});
