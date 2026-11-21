import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legalText } from "../support/legalText.js";

/**
 * What the launch Terms of Service say: who sells, section 12's title and the plans on sale, how to withdraw, South
 * Korea's consents, and what the backups keep. Section 11 does not say that closing an account makes the data
 * "permanently unreadable", section 9 says a deleted debate comes back only if the whole service is restored from a
 * backup, and section 8's licence does not end for the copies in the backups. English is pinned word for word;
 * Romanian and French, the other languages the release offers, name the merchant and the buttons as the site shows them.
 */

const root = process.cwd();
const draft = (code: string): string => legalText("TERMS", code);
const messages = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "billing.json"), "utf8")) as Record<string, string>;

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

describe("Terms of Service: the launch text", () => {
  it("English says it in the approved words", () => {
    const text = draft("en");
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    expect(text).not.toContain("permanently unreadable");
    expect(text).not.toContain("separate backup storage");
    expect(text).not.toContain("will be available");
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
});
