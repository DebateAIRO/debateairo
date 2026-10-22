import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * NETOPIA's eligibility conditions (netopia-payments.com/conditii-eligibilitate, confirmed in chat on 2026-10-22): the
 * Terms name the payment methods offered and carry a delivery policy. Terms 2.4, section 12: the accepted cards are Visa
 * and Mastercard (no American Express), and a digital service ships nothing — paid features open in the account as soon
 * as the payment is confirmed (checkout cannot continue without "Start my plan now", CheckoutFlow.tsx).
 *
 * Every locale: section 12 names the three brands in Latin script and names NETOPIA Payments exactly once (the
 * processing sentence moved from "Taxes, and who you pay" into "Payment methods"; it is not repeated). The block shape
 * of section 12 (two new paragraphs) is held to English by legal-locale-check in legal-documents-locale-complete.
 * English and Romanian, the texts counsel reviews, are pinned word for word.
 */

const termsSection12 = (locale: string): string => {
  const markdown = readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "terms-of-service.md"), "utf8");
  const section = /^## 12\.[^\n]*\n([\s\S]*?)^## 13\./mu.exec(markdown)?.[1];
  if (section === undefined) throw new Error(`${locale}: no section 12 before section 13`);
  return section;
};

const occurrences = (text: string, token: string): number => text.split(token).length - 1;

const PINNED = {
  en: [
    "**Taxes, and who you pay.** Prices include VAT, GST or sales tax, which depends on where you live and is shown before you pay. The seller is DMS Merchandise Shop S.R.L., which issues your invoice and remains responsible for the service itself and for these Terms.",
    "**Payment methods.** You pay by card. We accept Visa and Mastercard; we do not accept American Express. Card payments are processed by NETOPIA Payments (netopia-payments.com), and your full card number never reaches us.",
    "**Delivery.** Dialectical Engine is an online service, so nothing is shipped to you. The features of your paid plan are available in your account as soon as your payment is confirmed."
  ],
  ro: [
    "**Taxe și beneficiarul plății.** Prețurile includ TVA, GST sau taxa pe vânzări, în funcție de locul în care locuiți, iar acest lucru este afișat înainte de plată. Vânzătorul este DMS Merchandise Shop S.R.L., care emite factura dumneavoastră și rămâne responsabil pentru serviciul în sine și pentru acești Termeni.",
    "**Modalități de plată.** Plătiți cu cardul. Acceptăm Visa și Mastercard; nu acceptăm American Express. Plățile cu cardul sunt procesate de NETOPIA Payments (netopia-payments.com), iar numărul complet al cardului dumneavoastră nu ajunge niciodată la noi.",
    "**Livrare.** Dialectical Engine este un serviciu online, așa că nu vă expediem nimic. Funcțiile planului cu plată devin disponibile în contul dumneavoastră imediat ce plata este confirmată."
  ]
} as const;

describe("Terms section 12 names the payment methods and the delivery (NETOPIA eligibility, Terms 2.4)", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: names Visa, Mastercard and American Express, and NETOPIA Payments once", (code) => {
    const section = termsSection12(code);
    for (const brand of ["Visa", "Mastercard", "American Express"]) {
      expect(section, `${code} names ${brand}`).toContain(brand);
    }
    expect(occurrences(section, "NETOPIA Payments"), `${code}: NETOPIA Payments`).toBe(1);
    expect(occurrences(section, "netopia-payments.com"), `${code}: netopia-payments.com`).toBe(1);
  });

  it.each(Object.entries(PINNED))("%s: the three paragraphs read exactly as approved, in this order", (code, paragraphs) => {
    const blocks = termsSection12(code).split(/\n{2,}/u).map((block) => block.trim());
    const at = paragraphs.map((paragraph) => blocks.indexOf(paragraph));
    expect(at.every((index) => index >= 0), `${code}: ${JSON.stringify(at)}`).toBe(true);
    expect(at[1]).toBe(at[0]! + 1);
    expect(at[2]).toBe(at[1]! + 1);
  });
});
