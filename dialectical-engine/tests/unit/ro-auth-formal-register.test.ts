/*
 * Auth UI repair (2026-10-09): Romanian sign-in, sign-up, security and recovery screens address the reader
 * formally ("dumneavoastră": Introduceți, Continuați, Vă rugăm), the register most of ro/auth.json already
 * used. PR #82 mixed in the familiar form ("Încearcă din nou", "Folosește", "Verifică-ți emailul"), so one
 * screen spoke to people both ways.
 *
 * A Romanian 2nd-person-singular imperative is often spelt like the 3rd person ("un cont care așteaptă"),
 * so only unambiguous markers are checked: a familiar imperative opening a sentence or a button label,
 * and familiar pronouns, clitics and verb endings anywhere.
 *
 * The same voice holds on the V4 screens (ro/v4.json), the question-language pop-up (newDebate.languageCheck.*)
 * and the help chat's own labels (ro/support.json). A few of their lines are in the third person and are spelt
 * like a familiar imperative: a dig or a question that "waits" ("Așteaptă un loc liber") and the chat shortcut
 * that "opens" a conversation ("Deschide aici…"); those keys are left out by name.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = (name: string): Record<string, string> =>
  JSON.parse(readFileSync(`apps/ui/messages/ro/${name}.json`, "utf8")) as Record<string, string>;

const FAMILIAR_IMPERATIVE = "încearcă|folosește|introdu|alege|verifică|verifică-ți|verifică-le|creează|autentifică-te|arată|ascunde|copiază|descarcă|anulează|continuă|cere|solicită|pune|deschide|deschide-l|așteaptă|salvează|păstrează|pregătește|trimite|retrimite|configurează|adaugă|scanează|reia|închide|încheie|confirmă|recuperează|resetează|schimbă|generează|reîncarcă|include|revino|citește";
const OPENING = new RegExp(`(?:^|[.;:!?]\\s+|,\\s+apoi\\s+|\\s+sau\\s+|\\s+și\\s+)(?:${FAMILIAR_IMPERATIVE})(?![\\p{L}])`, "iu");
const FAMILIAR_ANYWHERE = /(?<![\p{L}-])(?:ai|vei|poți|știi|ești|dorești|tău|ta|tale|tăi|te|anulezi|schimbi|soliciți|repeți|treci|continui|începi|alegi|introduci|autentifici|aștepți)(?![\p{L}])/iu;

/** Lines in the third person that the markers above would mistake for a familiar imperative. */
const THIRD_PERSON: ReadonlySet<string> = new Set([
  "v4.report.digState.WAITING",
  "v4.state.WAITING_OWN",
  "v4.panel.digState.WAITING",
  "support.shortcutNote"
]);

const screens: Array<[string, (key: string) => boolean]> = [
  ["auth", () => true],
  ["mfa-recovery", () => true],
  ["password-reset", () => true],
  ["settings", (key) => /^settings\.(?:security|phone)\./u.test(key)],
  ["v4", (key) => !THIRD_PERSON.has(key)],
  ["newDebate", (key) => key.startsWith("newDebate.languageCheck.")],
  ["support", (key) => !THIRD_PERSON.has(key)]
];

describe("Romanian screens use the formal address", () => {
  it.each(screens)("ro/%s", (name, owned) => {
    const familiar = Object.entries(catalog(name))
      .filter(([key]) => owned(key))
      .filter(([, value]) => OPENING.test(value) || FAMILIAR_ANYWHERE.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(familiar).toEqual([]);
  });
});
