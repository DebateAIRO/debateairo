import { describe, expect, it } from "vitest";
import {
  ARGUMENT_LANGUAGE_NAMES, QUESTION_LANGUAGE_FIELD, argumentLanguageDirective, detectArgumentLanguage, languageDirectiveFor,
  lockedReplyLanguageExpectation, questionLanguageField, questionLanguageForBounds, questionLanguageFromRun, questionLanguageOf,
  questionLanguageSentence, replyLanguageCheck, replyLanguageCheckFor, replyScriptOfTag, withQuestionLanguageField
} from "@debateai/kernel";
import { readdirSync } from "node:fs";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const RO = Object.freeze({ code: "ro", name: "Romanian" });
const FRENCH_REPLY = { statement: "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays." };

describe("the locked question language (question-language spec 2026-10-13, ruling L6)", () => {
  it("names our 35 site languages exactly as the runs already store them, and other ISO 639-1 codes in English", () => {
    expect(Object.keys(ARGUMENT_LANGUAGE_NAMES).sort()).toEqual(SITE_LOCALES);
    for (const code of SITE_LOCALES) expect(questionLanguageOf(code)).toEqual({ code, name: ARGUMENT_LANGUAGE_NAMES[code] });
    expect(questionLanguageOf("EN")).toEqual({ code: "en", name: "English" });
    expect(questionLanguageOf("ca")).toEqual({ code: "ca", name: "Catalan" });
    expect(questionLanguageOf("ms")).toEqual({ code: "ms", name: "Malay" });
    for (const refused of ["xx", "unknown", "und", "", "en-US", "e", "eng"]) expect(questionLanguageOf(refused)).toBeNull();
  });

  it("adds the script for a two-script language from the question's own letters", () => {
    expect(questionLanguageOf("sr", "Da li bi Srbija trebalo da uvede evro umesto dinara?"))
      .toEqual({ code: "sr-Latn", name: "Serbian (Latin script)" });
    expect(questionLanguageOf("sr", "Да ли би Србија требало да уведе евро уместо динара?"))
      .toEqual({ code: "sr-Cyrl", name: "Serbian (Cyrillic script)" });
    expect(questionLanguageOf("sr")).toEqual({ code: "sr", name: "Serbian" });
    expect(questionLanguageOf("ro", "Да ли би Србија требало да уведе евро?")).toEqual(RO);
  });

  it("reads a run's stored language; und and the fallback name are no lock", () => {
    expect(questionLanguageFromRun("ro", "Romanian")).toEqual(RO);
    expect(questionLanguageFromRun("sr-Latn", "Serbian (Latin script)")).toEqual({ code: "sr-Latn", name: "Serbian (Latin script)" });
    expect(questionLanguageFromRun("und", "the same language as the question")).toBeNull();
    expect(questionLanguageFromRun("ro", "")).toBeNull();
    expect(questionLanguageFromRun("ro", "the same language as the question")).toBeNull();
  });

  it("is ONE named sentence: never the fallback form, never today's question-language wording", () => {
    const sentence = questionLanguageSentence(RO);
    expect(sentence.startsWith("Write every natural-language field in Romanian, the language this debate was set to and named in question_language, even where the material quotes another language.")).toBe(true);
    expect(sentence).toContain("never translate an identifier or literal.");
    expect(sentence).not.toContain("the same language as the question");
    expect(sentence).not.toContain("the language of the question");
    expect(() => questionLanguageSentence({ code: "ro", name: " " })).toThrow(/QUESTION_LANGUAGE_NAME_REQUIRED/u);
    expect(languageDirectiveFor("Romanian", null)).toBe(argumentLanguageDirective("Romanian"));
    expect(languageDirectiveFor(undefined, undefined)).toBe(argumentLanguageDirective(""));
    expect(languageDirectiveFor("French", RO)).toBe(sentence);
  });

  it("puts the field last in the material, only when a language is locked", () => {
    const material = [{ name: "question_line", content: "Q?" }];
    expect(withQuestionLanguageField(material, null)).toBe(material);
    expect(withQuestionLanguageField(material, undefined)).toBe(material);
    expect(withQuestionLanguageField(material, RO)).toEqual([
      { name: "question_line", content: "Q?" }, { name: QUESTION_LANGUAGE_FIELD, content: '{"code":"ro","name":"Romanian"}' }]);
    expect(questionLanguageField(RO)).toEqual({ name: "question_language", content: '{"code":"ro","name":"Romanian"}' });
  });

  it("the locked expectation reads the code (and its script), never the question's guess", () => {
    expect(replyScriptOfTag("ru")).toBe("Cyrillic");
    expect(replyScriptOfTag("ro")).toBeUndefined();
    expect(lockedReplyLanguageExpectation(RO, "Ar trebui sa renuntam la leu?")).toEqual({ tag: "ro", script: "Latin" });
    expect(lockedReplyLanguageExpectation({ code: "sr-Cyrl", name: "Serbian (Cyrillic script)" }, "x")).toEqual({ tag: "sr", script: "Cyrillic" });
    expect(lockedReplyLanguageExpectation({ code: "ja", name: "Japanese" }, "x")).toEqual({ tag: "ja", script: "CJK" });
    expect(lockedReplyLanguageExpectation({ code: "ca", name: "Catalan" }, "Hauria Barcelona de limitar els pisos turístics?"))
      .toEqual({ tag: "ca", script: "Latin" });
    expect(lockedReplyLanguageExpectation({ code: "ca", name: "Catalan" }, "?")).toEqual({ tag: "ca", script: null });
  });

  it("replyLanguageCheckFor: today's check without a lock, the locked check with one", () => {
    const question = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
    expect(replyLanguageCheckFor(question, null, ["statement"])(FRENCH_REPLY))
      .toEqual(replyLanguageCheck(question, ["statement"])(FRENCH_REPLY));
    expect(replyLanguageCheckFor(question, RO, ["statement"])(FRENCH_REPLY)).toEqual([
      { code: "TEXT_NOT_IN_QUESTION_LANGUAGE", path: ["statement"], message: "TEXT_NOT_IN_QUESTION_LANGUAGE" }]);
    expect(replyLanguageCheckFor(question, RO, ["statement"])({ statement: "Guvernul trebuie să păstreze moneda națională pentru cetățeni și firme." })).toEqual([]);
    // Review Focus 5 (pre-flight PF-L5): today's guesser cannot name this question, so today's check lets French through;
    // only the locked check refuses it.
    expect(detectArgumentLanguage(question).tag).toBe("und");
    expect(replyLanguageCheck(question, ["statement"])(FRENCH_REPLY)).toEqual([]);
  });

  it("questionLanguageForBounds: no lock the kernel can make frames longer (pre-flight PF-L38: B9 prices with it)", () => {
    const size = (language: { code: string; name: string }) =>
      new TextEncoder().encode(questionLanguageSentence(language) + questionLanguageField(language).content).length;
    const bound = size(questionLanguageForBounds());
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const lines = [undefined, "Da li bi Srbija trebalo da uvede evro umesto dinara?", "Да ли би Србија требало да уведе евро уместо динара?"];
    for (const first of letters) for (const second of letters) for (const line of lines) {
      const language = questionLanguageOf(`${first}${second}`, line);
      if (language !== null) expect(size(language), language.code).toBeLessThanOrEqual(bound);
    }
  });
});
