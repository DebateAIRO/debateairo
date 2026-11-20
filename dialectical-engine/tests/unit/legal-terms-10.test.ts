import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { firstTerms10Sha256, TERMS_10_DAY, TERMS_10_SWAPS, withoutTerms10Corrections } from "../support/legalTerms10.js";
import { terms10Sha256, withoutTerms11 } from "../support/legalTerms11.js";

/**
 * Terms of Service 1.0 as corrected before launch (tests/support/legalTerms10.ts): who sells, section 12's title and
 * the plans on sale, how to withdraw, South Korea's consents, and what the backups keep: section 11 no longer says that
 * closing an account makes the data "permanently unreadable", section 9 says a deleted debate comes back only if the
 * whole service is restored from a backup, and section 8's licence does not end for the copies in the backups. Every
 * language is its first 1.0 draft plus the recorded swaps and nothing else; English is pinned word for word; 1.0
 * carries no change history. Terms 1.1 followed (tests/support/legalTerms11.ts); these checks read each draft with 1.1
 * undone.
 */

const root = process.cwd();
/** A language's Terms as 1.0 wrote them: the draft with 1.1 undone. */
const draft = (code: string): string =>
  withoutTerms11(code, readFileSync(resolve(root, "apps/ui/legal", code, "terms-of-service.md"), "utf8"));
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const messages = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "billing.json"), "utf8")) as Record<string, string>;
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));

const section = (text: string, no: number): string => {
  const body = new RegExp(`^## ${no}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${no}`);
  return body;
};
const heading = (text: string, no: number): string => new RegExp(`^## ${no}\\.[^\\n]*$`, "mu").exec(text)![0];
const paragraphs = (body: string): string[] => body.split("\n").filter((line) => line.trim() !== "");
const RELEASED = ["en", "ro", "fr"];

const DELETED_DEBATE =
  "No person reads the debate first, and it cannot be restored, unless we restore the whole service from a backup that still holds it (Privacy Policy, section 7).";
/** English, word for word: what the corrected 1.0 text says, each sentence exactly once. */
const ENGLISH_SENTENCES = [
  // Section 1: who sells.
  "Dialectical Engine is operated by **DMS Merchandise Shop S.R.L.**, a company registered in Romania. We are the merchant: we provide Dialectical Engine at dezbatere.ro, sell its paid plans in our own name and on our own account, and issue your invoices. We do not sell as a marketplace, or as an intermediary or agent for anyone else. The companies whose AI models and other services we use are our suppliers, and NETOPIA Payments processes card payments for us; none of them sells anything to you.",
  // Section 12: its title and its first sentence.
  "## 12. Paid plans: payment, delivery, cancellation and refunds",
  "Three paid plans, **Plus**, **Pro** and **Max**, are available;",
  // Section 13: how to withdraw.
  "Once signed in, open **Settings → Subscription**, press **“Withdraw from contract here”** and then **“Confirm withdrawal”**. You can also send the model form attached to your confirmation email, or any clear statement that you withdraw, to support@dezbatere.ro. The **Withdraw from contract** page at dezbatere.ro/withdraw explains both ways. A withdrawal sent before the 14 days end is in time, and we confirm receipt on a durable medium.",
  // Annex A.6: South Korea.
  "*South Korea:* we ask for each consent on its own, apart from what is needed to run the service: your consent to our processing sensitive information in your questions has a screen of its own (Privacy Policy, section 3), and we send no marketing messages;",
  // Section 8: the licence and the backups.
  "This licence ends when the content is deleted, except for the copies in our backups (Privacy Policy, section 7), or as section 9 or the law requires.",
  // Section 9: a debate our check deletes.
  "we delete the debate automatically and do not keep it in the live service, even if it was already published.",
  DELETED_DEBATE,
  // Section 11: what closure does.
  "When an account is closed we destroy, in the live service, the encryption keys for your account data and your private debates, which makes them unreadable there without a copy of those keys from our backups,",
  "records we are required by law to keep, including acceptance and consent records, except the record of the consent you give before your first debate (section 7), which is deleted with your account;",
  "the copies in our backups, on our server and at our hosting provider, which closing an account does not delete and some of which hold those keys, so your account and your private debates can be restored from them until those copies are gone (Privacy Policy, section 7);"
];

describe("Terms of Service 1.0: the corrections made before launch", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its first 1.0 text with only the recorded corrections", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v1.0 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v1\.0$/u);
    expect(lines[23]!.startsWith("**Version 1.0 · Effective "), `${code}: the version line`).toBe(true);
    // The effective day stands once in every language's own date words, in the eyebrow and in the version line.
    for (const date of [lines[4]!.split(" · ").at(-1)!, lines[23]!.split(" · ")[1]!]) {
      expect(date.match(new RegExp(`(?<!\\d)${TERMS_10_DAY}(?!\\d)`, "gu")), `${code}: ${date}`).toHaveLength(1);
      expect(date, `${code}: the year`).toContain("2026");
    }
    expect(sha(withoutTerms10Corrections(code, text)), `${code}: undoing the corrections gives back the first 1.0 draft byte for byte`)
      .toBe(firstTerms10Sha256(code));
    expect(sha(text), `${code}: the text the manifest held at 1.0`).toBe(terms10Sha256(code));
    // Sections 9 and 11 changed in every language, and no language gains a change history: section 14 is still its
    // heading and its three paragraphs on changes.
    expect(TERMS_10_SWAPS[code]!.swaps.length, `${code}: sections 9 and 11 changed`).toBeGreaterThanOrEqual(4);
    // The languages the release offers carry every correction; the others only the day and sections 9 and 11.
    expect(TERMS_10_SWAPS[code]!.swaps.length > 8, `${code}: the merchant, section 12, 13 and A.6 changes`).toBe(RELEASED.includes(code));
    const section14 = text.split(/^## 14\./mu)[1]!.split(/^## 15\./mu)[0]!;
    expect(section14.trim().split("\n\n"), `${code}: section 14 has no history entry`).toHaveLength(4);
  });

  it("English says it in the words of the corrected 1.0 text", () => {
    const text = draft("en");
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    expect(text).not.toContain("permanently unreadable");
    expect(text).not.toContain("separate backup storage");
    expect(text).not.toContain("will be available");
    expect(text.split("\n")[4]).toBe(`eyebrow: TERMS OF SERVICE · v1.0 · EFFECTIVE ${TERMS_10_DAY} NOVEMBER 2026`);
    expect(text.split("\n")[23]!.startsWith(`**Version 1.0 · Effective ${TERMS_10_DAY} November 2026 · `)).toBe(true);
  });

  it.each(RELEASED.map((code) => [code]))("%s: section 13 stays one paragraph naming the page, the address and the time limit once", (code) => {
    const first = paragraphs(section(draft(code), 13))[0]!;
    expect(paragraphs(section(draft(code), 13))).toHaveLength(paragraphs(section(draft("en"), 13)).length);
    expect(first.split("dezbatere.ro/withdraw"), `${code}: the page`).toHaveLength(2);
    expect(first.split("support@dezbatere.ro"), `${code}: the address`).toHaveLength(2);
    expect(first.match(/(?<!\d)14(?!\d)/gu), `${code}: the 14 days, and the in-time sentence`).toHaveLength(2);
  });

  it("Romanian names the merchant, the section 12 words a reader searches for, and the buttons as the site shows them", () => {
    const text = draft("ro");
    const merchant = paragraphs(section(text, 1))[0]!;
    for (const word of ["comerciant", "în nume propriu și pe cont propriu", "marketplace", "intermediar", "agent", "emitem facturile"]) {
      expect(merchant, word).toContain(word);
    }
    for (const word of ["livrare", "anulare", "rambursare"]) expect(heading(text, 12), word).toContain(word);
    const withdrawal = paragraphs(section(text, 13))[0]!;
    const billing = messages("ro");
    expect(withdrawal).toContain(`**„${billing["billing.subscription.withdraw"]!}”**`);
    expect(withdrawal).toContain(`**„${billing["billing.subscription.withdrawConfirm"]!}”**`);
    expect(withdrawal).toContain("**Setări → Abonament**");
    expect(withdrawal).toContain("**Retragere din contract**");
    expect(withdrawal).toContain("în termen");
  });

  it("French names the merchant, and quotes the English buttons, since French is not an interface language", () => {
    const text = draft("fr");
    const merchant = paragraphs(section(text, 1))[0]!;
    for (const word of ["commerçant", "en notre nom propre et pour notre propre compte", "place de marché", "intermédiaire", "mandataire"]) {
      expect(merchant, word).toContain(word);
    }
    for (const word of ["livraison", "résiliation", "remboursements"]) expect(heading(text, 12), word).toContain(word);
    const withdrawal = paragraphs(section(text, 13))[0]!;
    const billing = messages("en");
    expect(withdrawal).toContain(`**« ${billing["billing.subscription.withdraw"]!} »**`);
    expect(withdrawal).toContain(`**« ${billing["billing.subscription.withdrawConfirm"]!} »**`);
    expect(withdrawal).not.toContain("Renoncer au contrat ici");
    expect(withdrawal).toContain("**Se rétracter du contrat**");
  });

  it.each(["ro", "fr"].map((code) => [code]))("%s: no sentence still speaks of separate backup storage or of keys destroyed on our server", (code) => {
    const text = draft(code);
    for (const gone of ["spațiul nostru separat de stocare", "pe serverul nostru cheile", "stockage de sauvegarde distinct", "sur notre serveur, les clés"]) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it("lists 1.0 with a link to its archived text, the archive holds the corrected English, Romanian and French 1.0 texts, and nobody is asked to accept again", () => {
    expect(TERMS_VERSIONS.filter(({ version }) => version === "1.0"))
      .toEqual([{ version: "1.0", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${terms10Sha256("en")}` }]);
    const archive = manifest().archive.TERMS!;
    for (const code of ["en", "ro", "fr"]) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "1.0");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      expect(archive[code]![firstTerms10Sha256(code)], `${code}: the first 1.0 text is not archived`).toBeUndefined();
    }
    expect(Object.keys(TERMS_10_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
