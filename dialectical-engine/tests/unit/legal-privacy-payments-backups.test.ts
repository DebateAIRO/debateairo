import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { legalEnglishTranslatedFrom, legalText } from "../support/legalText.js";

/**
 * What the Privacy Policy says about payments, the consent record, the backups and unfinished sign-ups: what NETOPIA
 * receives, sees and sends back, and where its own notice is; the sensitive-data consent record going with the
 * account; the backups as they really are; unfinished sign-ups deleted after 24 hours or once their last link
 * expires; the invoices we issue ourselves, the legal basis for taking payment, Cloudflare's bot check, HTTPS and no
 * trackers. English is pinned word for word; every language has English's rows and names NETOPIA's company in section
 * 5; Romanian and French, the other languages the release offers, have dropped what English dropped.
 */

const draft = (code: string): string => legalText("PRIVACY", code);
/** The English text a language is held to: English itself, or the English text the translations were made from. */
const englishFor = (code: string): string => (code === "en" ? draft("en") : legalEnglishTranslatedFrom("PRIVACY"));

const section = (text: string, no: number): string => {
  const body = new RegExp(`^## ${no}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${no}`);
  return body;
};
const rows = (body: string): string[] =>
  body.split("\n").filter((line) => line.startsWith("| ")).slice(1).filter((line) => !/^\|\s*-{3}/u.test(line));
const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());
const RELEASED = ["en", "ro", "fr"];

/** English, word for word: what section 5 says of NETOPIA. */
const NETOPIA =
  "Payments go through our payment provider, NETOPIA Payments, run by NETOPIA Financial Services S.A. in Romania. You type your card details on its page, not ours, and it keeps your card so that it can charge it at each renewal. Your full card number and security code go to NETOPIA and never reach us; on that page NETOPIA also sees your IP address and browser details. NETOPIA tells us whether a payment, or the check of a new card, went through, and sends us the card details listed in section 2. How NETOPIA itself uses your data, and in what role, is set out in its notice for payers at netopia-payments.com/nota-de-informare-gdpr-platitori. With each payment, and when you check a new card, we send it your name, email address and phone number, your billing address (street, city, region, postcode and country), a customer code that stays the same for all your payments, our reference for the order, the amount and the currency, and a short description of the payment, such as the name of your plan; when it charges your saved card at a renewal, we also send the IP address you last paid from yourself. NETOPIA asks for these details with every card payment. When a page shows the NETOPIA Payments logo, your browser loads that image directly from NETOPIA's server at mny.ro, which receives your IP address, your browser's details and our shop's identifier at NETOPIA, but not the address of the page you are on; we set no cookie for it.";
const UNFINISHED_SIGN_UP =
  "| An account whose sign-up was not finished: the email address not verified, or the second sign-in step (a passkey or an authenticator app) not set up | 24 hours after the sign-up began, or once the last link we sent expires if that is later (each link is valid for 24 hours) | Deleted, with everything that belongs to the account; its email address and pseudonym can be used again. The acceptance records and the security audit trail keep their entries, as their rows say |";
const ACCEPTANCE =
  "| Acceptance and consent records, except the sensitive-data consent: which Terms you accepted, which policy you were shown and what else you agreed to at sign-up and at checkout | Life of the account plus 6 years — the longest limitation period that applies to us | Deleted |";
const SENSITIVE_CONSENT =
  "| The record of your sensitive-data consent (section 3): the version of the wording you agreed to, your language and the time | While the account exists | Deleted with the account |";
const BACKUPS =
  "| Backups | On our server: a copy of the database made each night, of which we keep the last 7; and the copies of the database made when we upload a new version of the service, some of which also hold the keys to your account and your debates, which we keep until we remove them. At OVHcloud: the automated backups it makes of our server's disk for us, with everything on it, the keys included, each kept until newer ones replace it | We do not encrypt these copies ourselves, and we send none of them anywhere else. None of them is deleted when you close your account or delete a debate, so until a copy is gone, a closed account or a deleted debate it holds can come back if we restore the whole service from it. The other rows of this table describe the live service |";
/** English, word for word, each exactly once. */
const ENGLISH_SENTENCES = [
  // The summary, and section 3's health information.
  "Deleting your account destroys the keys to your private data in the live service, but it does not delete our backups, and some of them hold those keys (section 7);",
  "A debate with that result is deleted at once from the live service (section 6), and the result becomes unreadable with it there; section 7 says what trace remains and what our backups keep.",
  // Sections 2, 3 and 4: the consent record, and the legal basis for taking payment.
  "each consent you gave or withdrew and when. The record of the sensitive-data consent (section 3) holds only the version of the wording you agreed to, your language and the time, and it is deleted with your account |",
  "We record the version of the wording you agreed to, your language and the time, and we delete this record with your account.",
  "| **Payments** | Plan, price, billing period,",
  "| Meeting tax, accounting and legal obligations; taking payment for your plan, and at each renewal | Payments, acceptance records | **Legal obligation** — Art. 6(1)(c); for taking payment, **contract** — Art. 6(1)(b) |",
  // Section 5: the Register, the other recipients, NETOPIA, the invoices, the backups and Article 28.
  "The Register applies to every user, wherever you live. It also lists our payment provider, which is not an AI provider: its entry says what it receives for card payments, as \"Other recipients\" below does. For each provider",
  "Besides the AI providers, these companies also handle your data.",
  "Cloudflare runs the bot check (section 2); it is a US company",
  NETOPIA,
  "We issue your invoices and credit notes ourselves, as the seller, through one of two invoicing services. If your tax country is Romania, we issue them through SmartBill, run by Intelligent IT S.R.L. in Romania;",
  "For every other country, we issue them through Quaderno, run by Recrea Systems, S.L. in Spain;",
  "OVHcloud also makes automated backups of our server's disk for us, with everything on it, including the keys to your data; we do not encrypt them ourselves (section 7).",
  "Each of these companies except NETOPIA handles your data for us only on our documented instructions, under a data-processing agreement with the safeguards Article 28 requires. Cloudflare is also responsible in its own right for what its bot check collects (your IP address and browser details), which it uses to improve its bot detection, as its Turnstile privacy terms say. None of the others may use your data for its own purposes.",
  "Your account and your debates are stored on our hosting provider's servers in London, in the United Kingdom, and our hosting provider also keeps automated backups of our server (section 7).",
  "Cloudflare runs the bot check on its own network, and Amazon may handle account emails in the United States.",
  // Section 6: a debate our check deletes.
  "we delete it automatically and at once, and we do not keep it in the live service;",
  "No person reads the debate first, and it cannot be restored, unless we restore the whole service from a backup that still holds it (section 7). The first time",
  // Section 7: the rows that change, and what deletion actually does.
  "Keys destroyed when the debate is deleted or the account is closed, making the content unreadable in the live service; our backups keep copies longer (the row on backups below) |",
  "Our backups keep them as they keep everything else (the row on backups below) |",
  "| Payment records | 10 years, as Romanian accounting law requires | Deleted |",
  "Deleting your account destroys those keys in the live service, after which the encrypted records there cannot be read by us or anyone else without a copy of those keys from one of our backups, and we delete your account record.",
  "We describe this as deletion because that is its effect in the live service,",
  "Four things to know:",
  "and some of our backups hold the keys together with the records, so what a backup copy holds can be restored until that copy is removed, and the copies made when we upload a new version of the service are kept until we remove them (the row on backups above).",
  // Sections 8, 9 and 13, and Annex B.4.
  "nothing reviews it before it takes effect, and it cannot be undone, except by restoring the whole service from a backup that still holds the debate (section 6), so the promise in the paragraph above does not cover it.",
  "Every page of the site is served over HTTPS, so what passes between your browser and the site is encrypted in transit (TLS); a request made over plain HTTP is redirected to HTTPS. Passwords are hashed with Argon2id. Signing in always takes two checks.",
  "Access to production data in the live service is logged; we keep no such log for our backups (section 7).",
  "We use no advertising or analytics trackers, and we let no other party use Dialectical Engine to collect information about your online activities over time and across websites for such purposes. Two other companies do receive requests from your browser through our pages: NETOPIA, when a page shows its logo (section 5), and Cloudflare (sections 2 and 5).",
  "Overseas recipients of your personal information are the companies named in section 5,"
];

/** Wordings that are gone, in each language the release offers: they must not come back. */
const GONE: Readonly<Record<string, readonly string[]>> = {
  en: ["once paid plans start", "these processors handle data for us", "Cloudflare delivers our pages", "Cloudflare carries traffic", "issues your invoices", "We do not permit any processor", "No other party collects", "the processors named in section 5", "separate backup storage", "which cannot read them", "Up to 8 weeks after the live copy is deleted", "and we do not send it your data", "will be available"],
  ro: ["odată ce încep planurile cu plată", "următoarele persoane împuternicite prelucrează", "Cloudflare distribuie paginile", "Cloudflare transportă traficul", "vă emite facturile", "Nu permitem niciunei persoane împuternicite", "Nicio altă parte nu colectează", "persoanele împuternicite menționate în secțiunea 5", "spațiul nostru separat de stocare", "care nu le poate citi"],
  fr: ["lancement des formules payantes", "les sous-traitants suivants traitent", "Cloudflare diffuse nos pages", "Cloudflare achemine le trafic", "émet vos factures", "Nous n'autorisons aucun sous-traitant", "Aucun autre tiers ne collecte", "les sous-traitants mentionnés à la section 5", "stockage de sauvegarde distinct", "qui ne peut pas les lire"]
};

describe("Privacy Policy: NETOPIA, the consent record, the backups, unfinished sign-ups and the plans on sale", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: section 5 names NETOPIA's company, and section 7 has English's rows", (code) => {
    const text = draft(code);
    const recipients = section(text, 5).split("\n").filter((line) => line.includes("NETOPIA"));
    expect(recipients, `${code}: one paragraph of section 5 names NETOPIA`).toHaveLength(1);
    expect(recipients[0]!.split("NETOPIA Financial Services S.A.").length - 1, `${code}: the company, once`).toBe(1);
    const retention = rows(section(text, 7));
    expect(retention, `${code}: section 7 rows`).toHaveLength(rows(section(englishFor(code), 7)).length);
    for (const row of retention) expect(cells(row), `${code}: ${row.slice(0, 40)}`).toHaveLength(3);
    // Two rows keep something 24 hours (the email links and the unfinished sign-up), and the acceptance records keep
    // their 6 years. The translations not offered yet write some numbers in words, so this counts rows, not places.
    const keeping = (number: number): number =>
      retention.filter((row) => new RegExp(`(^|\\D)${number}(\\D|$)`, "u").test(cells(row)[1]!)).length;
    expect(keeping(24), `${code}: rows that keep something 24 hours`).toBeGreaterThanOrEqual(2);
    expect(keeping(6), `${code}: rows that keep something 6 months or years`).toBeGreaterThanOrEqual(1);
  });

  it("English says it in the approved words", () => {
    const text = draft("en");
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    const retention = rows(section(text, 7));
    const at = (row: string): number => retention.indexOf(row);
    expect(at(UNFINISHED_SIGN_UP), "the unfinished sign-up row follows the email links row").toBe(retention.indexOf("| Email verification links | 24 hours | Deleted |") + 1);
    expect(at(SENSITIVE_CONSENT), "the consent record follows the acceptance row").toBe(at(ACCEPTANCE) + 1);
    expect(at(BACKUPS)).toBe(retention.length - 1);
    expect(text).not.toContain("| Acceptance and consent records | Life of the account plus 6 years");
    expect(text).not.toContain("Backups keep them for up to 8 weeks");
    expect(text).not.toContain("Three things to know");
    expect(text).not.toContain("and it cannot be restored. The first time");
    // Section 5 names NETOPIA in one paragraph only: the sentence on the Register does not name it.
    expect(section(text, 5).split("\n").filter((line) => line.includes("NETOPIA"))).toHaveLength(1);
  });

  it.each(RELEASED.map((code) => [code]))("%s: nothing English dropped is left, and the protected names stand as in English", (code) => {
    const text = draft(code);
    for (const phrase of GONE[code]!) expect(text, `${code}: ${phrase}`).not.toContain(phrase);
    const recipients = section(text, 5).split("\n").filter((line) => line.includes("NETOPIA"))[0]!;
    for (const token of ["NETOPIA Financial Services S.A.", "netopia-payments.com/nota-de-informare-gdpr-platitori", "mny.ro", "Turnstile"]) {
      expect(recipients.split(token), `${code}: ${token} once`).toHaveLength(2);
    }
    expect(recipients.match(/OVHcloud/gu), `${code}: OVHcloud for the hosting and for its backups`).toHaveLength(2);
    expect(text.split("Art. ").length, `${code}: as many Art. references as English`).toBe(englishFor(code).split("Art. ").length);
    expect(section(text, 9), `${code}: section 9 names HTTPS`).toMatch(/HTTPS[\s\S]*TLS/u);
    expect(section(text, 13), `${code}: section 13 names the two companies`).toMatch(/NETOPIA[^\n]*Cloudflare/u);
  });
});
