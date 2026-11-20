import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Privacy Policy 3.11 names everyone who receives data for invoices, tax and backups. Section 5's "Other recipients"
 * paragraph listed OVHcloud, Cloudflare, Amazon SES and NETOPIA, but not:
 *   - SmartBill (Intelligent IT S.R.L., Romania), which issues the invoices of buyers whose tax country is Romania
 *     (invoiceIssuerFor, packages/billing-core/src/calendar.ts; packages/invoice-smartbill/src/index.ts);
 *   - Quaderno (Recrea Systems, S.L., Spain), which quotes the tax for every buyer and issues every other invoice, and
 *     receives the payer's IP address as tax-location evidence (packages/tax-quaderno/src/index.ts, `ip_address`);
 *   - RO e-Factura, the Romanian tax authority's (ANAF) e-invoicing system, which SmartBill sends every Romanian
 *     document to by account setting (apps/api/src/billing/invoice-smartbill.ts);
 *   - OVHcloud for the backups, beside the hosting.
 * 3.11 was never published, so the version stayed; section 14's 3.11 entry said what it also names, until launch
 * renumbered the text 1.0 and section 14 lost its history (tests/support/legalReset10.ts).
 *
 * Privacy 3.15: we issue the invoices ourselves, as the seller, through SmartBill or Quaderno, so the recipients
 * paragraph no longer reads as if another company sold the plan; and the OVHcloud backup is its own automated backup
 * of our server's disk, keys included, which we do not encrypt ourselves, where 3.11 said our backups were encrypted
 * before they left the server and OVHcloud could not read them.
 *
 * English and Romanian, the texts counsel reviews, are pinned word for word. Every locale: the names are in the right
 * paragraphs, OVHcloud is named for the backups beside the hosting, and the website's generated data carries them.
 */

const markdown = (locale: string): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "privacy-policy.md"), "utf8");

const section = (locale: string, no: number): string => {
  const body = new RegExp(`^## ${no}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(markdown(locale))?.[1];
  if (body === undefined) throw new Error(`${locale}: no section ${no}`);
  return body;
};

const paragraphs = (body: string): string[] => body.split("\n").filter((line) => line.trim() !== "");

/** Section 5's processors paragraph: the only one naming NETOPIA. */
const recipientsParagraph = (locale: string): string => {
  const found = paragraphs(section(locale, 5)).filter((line) => line.includes("NETOPIA"));
  expect(found, `${locale}: one paragraph names NETOPIA`).toHaveLength(1);
  return found[0]!;
};

/** Section 5's last paragraph, on public authorities. */
const authoritiesParagraph = (locale: string): string => paragraphs(section(locale, 5)).at(-1)!;

/** Section 5 of the website's generated data (`pnpm run generate:legal`), which drops the draft's marks. */
const generatedSectionFive = async (locale: string): Promise<string> => {
  const module = (locale === "en"
    ? await import("../../apps/ui/lib/privacyPolicy.js")
    : await import(`../../apps/ui/lib/legal/${locale}/privacyPolicy.ts`)) as { PRIVACY_POLICY: LegalDocument };
  const blocks = module.PRIVACY_POLICY.sections.find((entry) => entry.no === "05")!.blocks;
  return JSON.stringify(blocks);
};

const PINNED = {
  en: {
    recipients: "We issue your invoices and credit notes ourselves, as the seller, through one of two invoicing services. If your tax country is Romania, we issue them through SmartBill, run by Intelligent IT S.R.L. in Romania; it receives your name, or your company's name and VAT number, your email address, your street, city and county, what you bought and what you paid. If you buy as a private person in Romania, we put no personal numeric code (CNP) on the invoice. For every other country, we issue them through Quaderno, run by Recrea Systems, S.L. in Spain; it receives your name, or your company's name and VAT number, your email address, your billing address, what you bought and what you paid, and, as evidence of where you are for tax purposes, the IP address you pay from, the country you told us you live in and the country where your card was issued. Quaderno also works out the tax at checkout and at each renewal for every buyer, Romania included, from your billing address and any VAT number, and checks a company's VAT number. OVHcloud also makes automated backups of our server's disk for us, with everything on it, including the keys to your data; we do not encrypt them ourselves (section 7).",
    authorities: "Every invoice and credit note we issue to a buyer in Romania goes, through SmartBill, to RO e-Factura, the e-invoicing system of the Romanian tax authority (ANAF), as Romanian law requires; ANAF receives what the invoice shows: your name, or your company's name and VAT number, your address, what you bought and the amounts."
  },
  ro: {
    recipients: "Facturile și facturile de stornare vi le emitem noi înșine, în calitate de vânzător, prin unul dintre cele două servicii de facturare. Dacă țara dumneavoastră fiscală este România, vi le emitem prin SmartBill, operat de Intelligent IT S.R.L. din România; acesta primește numele dumneavoastră sau denumirea și codul de TVA ale firmei, adresa de e-mail, strada, localitatea și județul, ce ați cumpărat și cât ați plătit. Dacă cumpărați ca persoană fizică în România, nu trecem pe factură codul numeric personal (CNP). Pentru toate celelalte țări, vi le emitem prin Quaderno, operat de Recrea Systems, S.L. din Spania; acesta primește numele dumneavoastră sau denumirea și codul de TVA ale firmei, adresa de e-mail, adresa de facturare, ce ați cumpărat și cât ați plătit, iar, ca dovadă a locului în care vă aflați în scopuri fiscale, adresa IP de la care plătiți, țara în care ne-ați spus că locuiți și țara în care a fost emis cardul dumneavoastră. Tot Quaderno calculează taxele la plată și la fiecare reînnoire pentru fiecare cumpărător, inclusiv din România, pe baza adresei de facturare și a codului de TVA, dacă există, și verifică codul de TVA al unei firme. De asemenea, OVHcloud face pentru noi copii de rezervă automate ale discului serverului nostru, cu tot ce se află pe el, inclusiv cheile datelor dumneavoastră; nu le criptăm noi înșine (secțiunea 7).",
    authorities: "Fiecare factură și factură de stornare pe care o emitem unui cumpărător din România ajunge, prin SmartBill, în RO e-Factura, sistemul de facturare electronică al autorității fiscale române (ANAF), așa cum cere legea română; ANAF primește ce apare pe factură: numele dumneavoastră sau denumirea și codul de TVA ale firmei, adresa, ce ați cumpărat și sumele."
  }
} as const;

describe("Privacy Policy 3.11 names SmartBill, Quaderno, RO e-Factura and the backup store", () => {
  it.each(Object.entries(PINNED))("%s: the two passages read exactly as written", (code, pinned) => {
    expect(recipientsParagraph(code)).toContain(pinned.recipients);
    expect(authoritiesParagraph(code)).toContain(pinned.authorities);
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the recipients are named where they belong, and the website carries them", async (code) => {
    const recipients = recipientsParagraph(code);
    for (const name of ["SmartBill", "Intelligent IT S.R.L.", "Quaderno", "Recrea Systems, S.L."]) {
      expect(recipients, `${code}: section 5 names ${name}`).toContain(name);
    }
    // ja and zh write brackets full-width, as the rest of their drafts do.
    expect(recipients, `${code}: no CNP on a private person's invoice`).toMatch(/[(（]CNP[)）]/u);
    // The invoicing sentences come after NETOPIA and before the Article 28 sentence that closes the processor list.
    expect(recipients.indexOf("NETOPIA"), `${code}: after NETOPIA`).toBeLessThan(recipients.indexOf("SmartBill"));
    // OVHcloud twice: the hosting sentence, and the backups after the invoicing sentences. No placeholder is left.
    expect(recipients.match(/OVHcloud/gu), `${code}: OVHcloud for hosting and for backups`).toHaveLength(2);
    expect(recipients.lastIndexOf("OVHcloud"), `${code}: the backups follow Quaderno`).toBeGreaterThan(recipients.lastIndexOf("Quaderno"));
    expect(recipients, `${code}: no placeholder`).not.toContain("\\[");

    const authorities = authoritiesParagraph(code);
    for (const name of ["SmartBill", "RO e-Factura", "ANAF"]) {
      expect(authorities, `${code}: public authorities name ${name}`).toContain(name);
    }

    // The 1.0 text carries no change history, so section 14 no longer repeats the names.
    expect(section(code, 14), `${code}: section 14 names no recipient`).not.toMatch(/SmartBill|Quaderno/u);

    const generated = await generatedSectionFive(code);
    for (const name of ["SmartBill", "Quaderno", "Recrea Systems, S.L.", "RO e-Factura", "ANAF"]) {
      expect(generated, `${code}: the generated data names ${name}`).toContain(name);
    }
    expect(markdown(code), `${code}: now version 1.0, the launch text`).toMatch(/v1\.0 /u);
  });

  it("every one of the 35 languages", () => {
    expect(LOCALES).toHaveLength(35);
  });
});
