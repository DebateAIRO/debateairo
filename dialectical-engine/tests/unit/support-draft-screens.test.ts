import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
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
  it("keeps dev's EN/RO screen bytes in response-policy.ts unchanged", () => {
    // en and ro run dev's original screens (orchestrator rule 1, 2026-09-25):
    // the five expressions and the two screen functions are dev's own lines.
    const source = readFileSync(resolve(process.cwd(),"apps/api/src/support/response-policy.ts"),"utf8");
    for (const line of [
      "const EMAIL = /\\b(?:e-?mail(?:ul)?|mail)\\b/u;",
      "const CASE = /\\b(?:human\\s+case|support\\s+case|case|caz(?:ul)?)\\b/u;",
      "const CASE_CREATION = /\\b(?:create[ds]?|open(?:s|ed)?|cre(?:eaza|at|are)|deschide)\\b/u;",
      "const CASE_CREATION_NEGATION = /\\b(?:does\\s+not|doesn['’]?t|did\\s+not|never|cannot|can['’]?t|nu)\\b[^.!?;\\n]{0,40}\\b(?:create|open|cre(?:eaza|a)|deschide)\\b/u;",
      "const FINANCIAL_CAPABILITY = /\\b(?:pay(?:ing|ment|ments|ed|s)?|paid|purchas\\p{L}*|buy(?:ing|s)?|bought|bill(?:ing|ed|s)?|charg\\p{L}*|transaction\\p{L}*|checkout\\p{L}*|plat(?!form)\\p{L}*|achit\\p{L}*|cump\\p{L}*|achiz\\p{L}*|factur\\p{L}*|tranzact\\p{L}*|debit(?:are\\p{L}*|at\\p{L}*)|tax(?:are\\p{L}*|at\\p{L}*))\\b/gu;",
      "function conflatesCaseAndEmail(value: string): boolean {\n"
        + "  return authorityText(value).split(/[.!?;\\n]+|\\b(?:while|whereas|iar|in timp ce)\\b/u).some((clause) =>\n"
        + "    EMAIL.test(clause) && CASE.test(clause) && CASE_CREATION.test(clause)\n"
        + "      && !CASE_CREATION_NEGATION.test(clause)\n"
        + "  );\n}",
      "function hasFinancialCapabilityClaim(value: string): boolean {\n"
        + "  FINANCIAL_CAPABILITY.lastIndex = 0;\n"
        + "  return FINANCIAL_CAPABILITY.test(authorityText(value));\n}"
    ]) expect(source).toContain(line);
  });

  it.each([
    // The scope-audit B1/B2 sentences: dev's verdict, not the per-locale one.
    ["en","Support cannot process payments in the debate creator.",null],
    ["en","We never charge your card.",null],
    ["ro","Asistența nu poate procesa plăți.",null],
    ["en","Emailing support creates a case.","PASSES"],
    ["en","Sending an email never automatically opens a human case for you.",null],
    // Dev's negative-financial rule: a boundary subject does not exempt money.
    ["en","Support does not process payments.",null],
    ["en","We cannot charge your card.",null],
    ["ro","Asistența nu procesează plăți.",null],
    ["ro","Nu putem factura cardul tău.",null]
  ] as const)("keeps dev's %s screen verdict: %s",(language,text,verdict) => {
    const bound = bind(text,language);
    if (verdict === null) expect(bound).toBeNull();
    else expect(bound).not.toBeNull();
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
        // en/ro run dev's case/e-mail screen, which clears a whole clause on any
        // negation (orchestrator rule 1); the masking guard is the new locales'.
        if (screenName === "caseEmail" && (language === "en" || language === "ro")) continue;
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
