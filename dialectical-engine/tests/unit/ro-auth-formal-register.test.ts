/*
 * Auth UI repair (2026-10-09): Romanian sign-in, sign-up, security and recovery screens address the reader
 * formally ("dumneavoastră": Introduceți, Continuați, Vă rugăm), the register most of ro/auth.json already
 * used. PR #82 mixed in the familiar form ("Încearcă din nou", "Folosește", "Verifică-ți emailul"), so one
 * screen spoke to people both ways.
 *
 * A Romanian 2nd-person-singular imperative is often spelt like the 3rd person ("un cont care așteaptă"),
 * so only unambiguous markers are checked: a familiar imperative opening a sentence or a button label,
 * and familiar pronouns, clitics and verb endings anywhere.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = (name: string): Record<string, string> =>
  JSON.parse(readFileSync(`apps/ui/messages/ro/${name}.json`, "utf8")) as Record<string, string>;

const FAMILIAR_IMPERATIVE = "încearcă|folosește|introdu|alege|verifică|verifică-ți|verifică-le|creează|autentifică-te|arată|ascunde|copiază|descarcă|anulează|continuă|cere|solicită|pune|deschide|deschide-l|așteaptă|salvează|păstrează|pregătește|trimite|retrimite|configurează|adaugă|scanează|reia|închide|încheie|confirmă|recuperează|resetează|schimbă|generează|reîncarcă|include|revino|citește";
const OPENING = new RegExp(`(?:^|[.;:!?]\\s+|,\\s+apoi\\s+|\\s+sau\\s+|\\s+și\\s+)(?:${FAMILIAR_IMPERATIVE})(?![\\p{L}])`, "iu");
const FAMILIAR_ANYWHERE = /(?<![\p{L}-])(?:ai|vei|poți|știi|ești|dorești|tău|ta|tale|tăi|te|anulezi|schimbi|soliciți|repeți|treci|continui|începi|alegi|introduci|autentifici|aștepți)(?![\p{L}])/iu;

const screens: Array<[string, (key: string) => boolean]> = [
  ["auth", () => true],
  ["mfa-recovery", () => true],
  ["password-reset", () => true],
  ["settings", (key) => /^settings\.(?:security|phone)\./u.test(key)]
];

describe("Romanian auth screens use the formal address", () => {
  it.each(screens)("ro/%s", (name, owned) => {
    const familiar = Object.entries(catalog(name))
      .filter(([key]) => owned(key))
      .filter(([, value]) => OPENING.test(value) || FAMILIAR_ANYWHERE.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(familiar).toEqual([]);
  });
});
