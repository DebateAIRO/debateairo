import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { PRIVACY_314_ENTRY } from "../support/legalPrivacy314.js";
import { PRIVACY_315_ENTRY, PRIVACY_315_SWAPS, privacy314Sha256, sha256Of, withoutPrivacy315 } from "../support/legalPrivacy315.js";

/**
 * Privacy Policy 3.15 (tests/support/legalPrivacy315.ts): four corrections so that the policy says what the code does —
 * what NETOPIA receives, the sensitive-data consent record going with the account, off-host backups that do not expire,
 * and unfinished sign-ups deleted after 24 hours or once their last link expires; section 5 also says the Register
 * lists the payment provider, and section 6 that a deleted debate comes back only with a whole-service restore. Every language is its 3.14 draft plus the recorded swaps and nothing
 * else; English is pinned word for word; every language has English's rows and names NETOPIA's company in section 5.
 */

const root = process.cwd();
const draft = (code: string): string => readFileSync(resolve(root, "apps/ui/legal", code, "privacy-policy.md"), "utf8");
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
const rows = (body: string): string[] =>
  body.split("\n").filter((line) => line.startsWith("| ")).slice(1).filter((line) => !/^\|\s*-{3}/u.test(line));
const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

/** English, word for word: what 3.15 says. */
const NETOPIA =
  "Payments go through our payment provider, NETOPIA Payments, run by NETOPIA Financial Services S.A. in Romania, once paid plans start. You type your card details on its page, not ours, and it keeps your card so that it can charge it at each renewal. With each payment we send it your name, email address and phone number, your billing address (street, city, region, postcode and country), a customer code that stays the same for all your payments, our reference for the order, the amount and the currency, and a short description of the payment, such as the name of your plan; when it charges your saved card at a renewal, we also send the IP address you last paid from yourself. NETOPIA asks for these details with every card payment.";
const UNFINISHED_SIGN_UP =
  "| An account whose sign-up was not finished: the email address not verified, or the second sign-in step (a passkey or an authenticator app) not set up | 24 hours after the sign-up began, or once the last link we sent expires if that is later (each link is valid for 24 hours) | Deleted, with everything that belongs to the account; its email address and pseudonym can be used again. The acceptance records and the security audit trail keep their entries, as their rows say |";
const ACCEPTANCE =
  "| Acceptance and consent records, except the sensitive-data consent: which Terms you accepted, which policy you were shown and what else you agreed to at sign-up and at checkout | Life of the account plus 6 years — the longest limitation period that applies to us | Deleted |";
const SENSITIVE_CONSENT =
  "| The record of your sensitive-data consent (section 3): the version of the wording you agreed to, your language and the time | While the account exists | Deleted with the account |";
const BACKUPS =
  "| Backups | On our server: up to 8 weeks after the live copy is deleted. On our separate backup storage: no time limit, because the encrypted copies there are not deleted automatically | On our server, overwritten. The other rows of this table describe our server. The copies on the separate backup storage hold the database together with the keys to your account and your debates (but not the keys to the questions you have not started yet), so until we remove them, a deleted debate or a closed account can still be restored from them |";
const ENGLISH_SENTENCES = [
  "Deleting your account destroys the keys to your private data on our server, but the encrypted copies on our separate backup storage are not deleted automatically (section 7); public debates stay public",
  "each consent you gave or withdrew and when. The record of the sensitive-data consent (section 3) holds only the version of the wording you agreed to, your language and the time, and it is deleted with your account |",
  "We record the version of the wording you agreed to, your language and the time, and we delete this record with your account.",
  NETOPIA,
  "Keys destroyed when the debate is deleted or the account is closed, making the content unreadable on our server; our backups keep copies longer (the row on backups below) |",
  "Our backups keep them as they keep everything else (the row on backups below) |",
  "Deleting your account destroys those keys on our server, after which the encrypted records there cannot be read by us or anyone else, and we delete your account record.",
  "We describe this as deletion because that is its effect on our server, and we hold a documented assessment behind it",
  "Four things to know:",
  "The Register applies to every user, wherever you live. It also lists our payment provider, which is not an AI provider: its entry says what it receives for card payments, as \"Other recipients\" below does. For each provider",
  "No person reads the debate first, and it cannot be restored, unless we restore the whole service from a backup that still holds it (section 7). The first time",
  "not by our deletion; and our backups hold the keys together with the records, so what a backup copy holds can be restored until that copy is removed, and the copies on our separate backup storage are not deleted automatically (the row on backups above)."
];

describe("Privacy Policy 3.15: NETOPIA, the consent record, the backups and unfinished sign-ups", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its 3.14 text with only the recorded 3.15 changes", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v3.15 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v3\.15$/u);
    expect(lines[21]!.startsWith("**Version 3.15 · Effective "), `${code}: the version line`).toBe(true);
    expect(text, `${code}: no line names 3.14 as the current version`).not.toMatch(/ v3\.14( ·|$)|\*\*Version 3\.14 · /mu);
    expect(sha256Of(withoutPrivacy315(code, text)), `${code}: undoing 3.15 gives back the 3.14 draft byte for byte`).toBe(privacy314Sha256(code));
    expect(manifest().documents.PRIVACY![code], `${code}: the manifest`).toEqual({ version: "3.15", sha256: sha256Of(text) });
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: section 5 names NETOPIA's company, and section 7 has English's rows", (code) => {
    const text = draft(code);
    const recipients = section(text, 5).split("\n").filter((line) => line.includes("NETOPIA"));
    expect(recipients, `${code}: one paragraph of section 5 names NETOPIA`).toHaveLength(1);
    expect(recipients[0]!.split("NETOPIA Financial Services S.A.").length - 1, `${code}: the company, once`).toBe(1);
    const retention = rows(section(text, 7));
    expect(retention, `${code}: section 7 rows`).toHaveLength(rows(section(draft("en"), 7)).length);
    for (const row of retention) expect(cells(row), `${code}: ${row.slice(0, 40)}`).toHaveLength(3);
    // Two rows more than 3.14: the unfinished sign-up and the sensitive-data consent record.
    expect(retention, `${code}: two rows more than 3.14`).toHaveLength(rows(section(withoutPrivacy315(code, text), 7)).length + 2);
    const added = retention.filter((row) => !withoutPrivacy315(code, text).includes(row));
    expect(added.some((row) => /(^|\D)24(\D|$)/u.test(cells(row)[1]!)), `${code}: a new row keeps something 24 hours`).toBe(true);
    expect(added.some((row) => /(^|\D)6(\D|$)/u.test(cells(row)[1]!)), `${code}: the acceptance row keeps 6 years`).toBe(true);
  });

  it("English says it in the words of 3.15", () => {
    const text = draft("en");
    for (const sentence of ENGLISH_SENTENCES) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    const retention = rows(section(text, 7));
    const at = (row: string): number => retention.indexOf(row);
    expect(at(UNFINISHED_SIGN_UP), "the unfinished sign-up row follows the email links row").toBe(retention.indexOf("| Email verification links | 24 hours | Deleted |") + 1);
    expect(at(SENSITIVE_CONSENT), "the consent record follows the acceptance row").toBe(at(ACCEPTANCE) + 1);
    expect(at(BACKUPS)).toBe(retention.length - 1);
    expect(text).not.toContain("| Acceptance and consent records | Life of the account plus 6 years");
    expect(text).not.toMatch(/Up to 8 weeks after the live copy is deleted \| Overwritten/u);
    expect(text).not.toContain("Backups keep them for up to 8 weeks");
    expect(text).not.toContain("Three things to know");
    expect(text).not.toContain("and it cannot be restored. The first time");
    // Section 5 names NETOPIA in one paragraph only: the sentence on the Register does not name it.
    expect(section(text, 5).split("\n").filter((line) => line.includes("NETOPIA"))).toHaveLength(1);
    expect(text).toContain(`\nThis policy was last updated on 19 November 2026. ${PRIVACY_315_ENTRY} ${PRIVACY_314_ENTRY} Version 3.13 replaced`);
  });

  it("Romanian and French carry the 3.15 history entry; the other languages carry none, as for 3.14", () => {
    for (const code of ["ro", "fr"]) {
      const log = section(draft(code), 14);
      expect(log.indexOf("3.15"), code).toBeGreaterThan(-1);
      expect(log.indexOf("3.15"), `${code}: newest first`).toBeLessThan(log.indexOf("3.14"));
      expect(log, `${code}: names NETOPIA`).toContain("NETOPIA Payments");
    }
    for (const { code } of LOCALES.filter(({ code }) => !["en", "ro", "fr"].includes(code))) {
      expect(section(draft(code), 14), code).not.toMatch(/3\.15/u);
    }
  });

  it("the archive holds the English, Romanian and French 3.15 texts and their 3.14 texts, and asks nobody to accept again", () => {
    const archive = manifest().archive.PRIVACY!;
    for (const code of ["en", "ro", "fr"]) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "3.15");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      expect(archive[code]![privacy314Sha256(code)]?.version, `${code}: the 3.14 text the swaps undo to`).toBe("3.14");
    }
    expect(Object.keys(PRIVACY_315_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
