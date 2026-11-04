import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The owner's V4 screen review (OWNER-PICKS-2026-11-03.md, "Answers given in the chat"): what a person can spend is
 * their "quota", everywhere: the header, dig buttons, notices and emails. read-f21: the team-funding notices on the ask
 * page use plain team words, not engine-like ones ("finite limit", "Recheck {time}"). wait-f20: the sign-in check says
 * "One moment…". Every one of these lines has its own words in each of the 35 languages.
 */
const root = resolve(import.meta.dirname, "../..");
const uiMessages = join(root, "apps/ui/messages");
const mailMessages = join(root, "packages/mail-templates/messages");
const json = (path: string): Record<string, string> => JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
const locales = readdirSync(uiMessages, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

/** Every English catalogue a person or the Owner reads: the site's (translator notes aside) and the emails'. */
function englishCatalogues(): Array<{ name: string; values: Record<string, string> }> {
  const site = readdirSync(join(uiMessages, "en")).filter((file) => file.endsWith(".json") && file !== "_notes.json")
    .map((file) => ({ name: `apps/ui/messages/en/${file}`, values: json(join(uiMessages, "en", file)) }));
  const mail = readdirSync(join(mailMessages, "en")).filter((file) => file.endsWith(".json"))
    .map((file) => ({ name: `packages/mail-templates/messages/en/${file}`, values: json(join(mailMessages, "en", file)) }));
  return [...site, ...mail];
}

/** The lines the review rewrote in the translated catalogues, by catalogue. */
const REWORDED: Readonly<Record<string, readonly string[]>> = Object.freeze({
  newDebate: ["newDebate.checkingSession", "newDebate.room.freeMonthFull"],
  billing: [
    "newDebate.room.internalGrantFull", "newDebate.room.internalTeamFull", "newDebate.room.internalWindowFull", "newDebate.room.internalClose",
    "billing.pricing.allowanceFree", "billing.pricing.allowancePlus", "billing.pricing.allowance"
  ],
  debateChrome: ["debateChrome.error.fundingEnded", "runFailure.CHOICE_GONE", "runFailure.SET_ASIDE"],
  home: ["runFailure.CHOICE_GONE", "runFailure.SET_ASIDE"]
});

const TEAM_ROOM_LINES = ["newDebate.room.internalGrantFull", "newDebate.room.internalTeamFull", "newDebate.room.internalWindowFull", "newDebate.room.internalClose"];

describe("the share word is quota (owner, 3 Nov)", () => {
  it("no English catalogue a person or the Owner reads says allowance", () => {
    const found = englishCatalogues().flatMap(({ name, values }) =>
      Object.entries(values).filter(([, value]) => /allowance/iu.test(value)).map(([key]) => `${name}: ${key}`));
    expect(found).toEqual([]);
  });

  it("read-f21: the team-funding notices use plain team words and keep their time", () => {
    const billing = json(join(uiMessages, "en/billing.json"));
    for (const key of TEAM_ROOM_LINES) {
      expect(billing[key], key).toMatch(/\bquota\b/u);
      expect(billing[key], key).not.toMatch(/internal|funding|finite|recheck|\blimit\b|\broom\b|window|grant/iu);
    }
    for (const key of ["newDebate.room.internalGrantFull", "newDebate.room.internalWindowFull"]) expect(billing[key], key).toContain("{time}");
    expect(json(join(uiMessages, "en/debateChrome.json"))["debateChrome.error.fundingEnded"]).not.toMatch(/internal|funding/iu);
  });

  it("wait-f20: the sign-in check says One moment…, with no technical word", () => {
    expect(json(join(uiMessages, "en/newDebate.json"))["newDebate.checkingSession"]).toBe("One moment…");
  });

  it("every language has its own words for the reworded lines, the same in both failure catalogues", () => {
    const untranslated: string[] = [];
    for (const [namespace, keys] of Object.entries(REWORDED)) {
      const english = json(join(uiMessages, "en", `${namespace}.json`));
      for (const locale of locales.filter((code) => code !== "en")) {
        const local = json(join(uiMessages, locale, `${namespace}.json`));
        for (const key of keys) if (typeof local[key] !== "string" || local[key] === english[key]) untranslated.push(`${locale}/${namespace}: ${key}`);
      }
    }
    expect(untranslated).toEqual([]);
    for (const locale of locales) {
      const home = json(join(uiMessages, locale, "home.json"));
      const chrome = json(join(uiMessages, locale, "debateChrome.json"));
      for (const key of REWORDED.home!) expect(home[key], `${locale}: ${key}`).toBe(chrome[key]);
    }
  });
});
