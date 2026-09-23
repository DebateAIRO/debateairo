import { describe,expect,it } from "vitest";
import { LEGACY_DRAFT_SCREEN_PATTERNS } from "../../apps/api/src/support/draft-screens.js";
import { bindSupportDraftAuthority } from "../../apps/api/src/support/response-policy.js";
import { SUPPORT_LOCALES,type SupportLanguage } from "../../packages/support-kb/src/locale.js";
import { SUPPORT_DRAFT_SCREEN_FIXTURES } from "../fixtures/support-draft-screens.js";

type ScreenName = "caseEmail" | "financial";

function bind(text: string, language: SupportLanguage) {
  return bindSupportDraftAuthority({
    kind:"answer",text,sourceIds:["support-cases"],actionIds:[]
  },["support-cases"],[],language);
}

function withoutSentenceEnd(value: string): string {
  return value.replace(/[.!?\u3002\uff01\uff1f\u061f]+$/u,"");
}

describe("localized support draft claim screens", () => {
  it("keeps the legacy EN/RO regex bytes unchanged", () => {
    expect(Object.fromEntries(Object.entries(LEGACY_DRAFT_SCREEN_PATTERNS)
      .map(([name,pattern]) => [name,pattern.toString()]))).toEqual({
      EMAIL:"/\\b(?:e-?mail(?:ul)?|mail)\\b/u",
      CASE:"/\\b(?:human\\s+case|support\\s+case|case|caz(?:ul)?)\\b/u",
      CASE_CREATION:"/\\b(?:create[ds]?|open(?:s|ed)?|cre(?:eaza|at|are)|deschide)\\b/u",
      CASE_CREATION_NEGATION:"/\\b(?:does\\s+not|doesn['’]?t|did\\s+not|never|cannot|can['’]?t|nu)\\b[^.!?;\\n]{0,40}\\b(?:create|open|cre(?:eaza|a)|deschide)\\b/u",
      FINANCIAL_CAPABILITY:"/\\b(?:pay(?:ing|ment|ments|ed|s)?|paid|purchas\\p{L}*|buy(?:ing|s)?|bought|bill(?:ing|ed|s)?|charg\\p{L}*|transaction\\p{L}*|checkout\\p{L}*|plat(?!form)\\p{L}*|achit\\p{L}*|cump\\p{L}*|achiz\\p{L}*|factur\\p{L}*|tranzact\\p{L}*|debit(?:are\\p{L}*|at\\p{L}*)|tax(?:are\\p{L}*|at\\p{L}*))\\b/gu"
    });
  });

  it("defines both screen matrices for every supported locale", () => {
    expect(Object.keys(SUPPORT_DRAFT_SCREEN_FIXTURES)).toEqual([...SUPPORT_LOCALES]);
    for (const language of SUPPORT_LOCALES) {
      for (const screenName of ["caseEmail","financial"] as const) {
        const fixtures = SUPPORT_DRAFT_SCREEN_FIXTURES[language][screenName];
        expect(fixtures.caught,`${language}/${screenName} caught`).toHaveLength(3);
        expect(fixtures.benign,`${language}/${screenName} benign`).toHaveLength(3);
      }
    }
  });

  it("catches every enumerated forbidden claim in its locale", () => {
    const slippedText: string[] = [];
    const slipped = Object.fromEntries(SUPPORT_LOCALES.map((language) => {
      const counts = Object.fromEntries((["caseEmail","financial"] as const).map((screenName) => [
        screenName,SUPPORT_DRAFT_SCREEN_FIXTURES[language][screenName].caught
          .filter((text) => {
            const missed = bind(text,language) !== null;
            if (missed) slippedText.push(`${language}/${screenName}: ${text}`);
            return missed;
          }).length
      ])) as Record<ScreenName,number>;
      return [language,counts];
    })) as Record<SupportLanguage,Record<ScreenName,number>>;

    expect(slipped,slippedText.join("\n")).toEqual(Object.fromEntries(SUPPORT_LOCALES.map((language) => [
      language,{ caseEmail:0,financial:0 }
    ])));
  });

  it("preserves every enumerated benign mention in its locale", () => {
    const rejected: string[] = [];
    for (const language of SUPPORT_LOCALES) {
      for (const screenName of ["caseEmail","financial"] as const) {
        for (const text of SUPPORT_DRAFT_SCREEN_FIXTURES[language][screenName].benign) {
          if (bind(text,language) === null) rejected.push(`${language}/${screenName}: ${text}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it("does not let a denied phrase mask a later forbidden claim", () => {
    const slipped: string[] = [];
    for (const language of SUPPORT_LOCALES) {
      for (const screenName of ["caseEmail","financial"] as const) {
        const fixtures = SUPPORT_DRAFT_SCREEN_FIXTURES[language][screenName];
        const text = `${withoutSentenceEnd(fixtures.benign[0])}, ${fixtures.caught[0]}`;
        if (bind(text,language) !== null) slipped.push(`${language}/${screenName}: ${text}`);
      }
    }
    expect(slipped).toEqual([]);
  });

  it.each([
    "Please discard this draft.",
    "Your card number is held only by your bank."
  ])("does not treat an unrelated English word as a financial capability: %s", (text) => {
    expect(bind(text,"en")).not.toBeNull();
  });
});
