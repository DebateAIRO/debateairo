/**
 * Preview practice: the fixed practice questions.
 *
 * Plain words: a practice never carries anyone's real question. These are our own, fixed in code, never read from the
 * command line. Each comes with a little synthetic debate material (a position, an objection, and one statement with
 * an obvious fallacy, so a judge's "fatal flags" are exercised) that the "formats" mode hands the real prompt builders.
 */
import { OPENINGS_QUESTIONS } from "./practice-openings-questions.js";
import { PracticeRefusal } from "./practice-settings.js";

export type PracticeQuestion = Readonly<{
  id: "en" | "ro";
  /** The question exactly as a person would type it. */
  questionLine: string;
  /** The language name the runner would record (detectArgumentLanguage's English name). */
  languageName: string;
  languageTag: string;
  /** A plain position answering the question. */
  position: string;
  /** A plain objection to that position. */
  objection: string;
  /** A statement with an obvious fallacy (here: attacking the people instead of the argument, plus a false choice). */
  fallacy: string;
  /** A second maker's competing position (the cross-exchange lane). */
  otherPosition: string;
}>;

export const PRACTICE_QUESTIONS: readonly PracticeQuestion[] = Object.freeze([
  Object.freeze({
    id: "en",
    questionLine: "Should a mid-sized city make its central bus lines free to ride?",
    languageName: "English",
    languageTag: "en",
    position: "Yes: free central bus lines raise ridership and cut car traffic in the centre at a modest cost.",
    objection: "The lost fare income must be paid from the city budget, which can starve bus maintenance and frequency.",
    fallacy: "Free buses are obviously right, because everyone who opposes them is secretly paid by car dealers, "
      + "and the only other choice is a city choked by traffic forever.",
    otherPosition: "No: better frequency and reliability attract more riders than a zero fare does."
  }),
  Object.freeze({
    id: "ro",
    questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?",
    languageName: "Romanian",
    languageTag: "ro",
    position: "Da: liniile centrale gratuite cresc numărul de călători și reduc traficul auto din centru, cu un cost moderat.",
    objection: "Banii pierduți din bilete trebuie acoperiți din bugetul orașului, ceea ce poate lăsa fără bani întreținerea și frecvența autobuzelor.",
    fallacy: "Autobuzele gratuite sunt evident corecte, pentru că oricine se opune este plătit pe ascuns de dealerii de mașini, "
      + "iar singura altă variantă este un oraș sufocat de trafic pentru totdeauna.",
    otherPosition: "Nu: o frecvență mai bună și autobuze punctuale atrag mai mulți călători decât un bilet gratuit."
  })
]);

/** The question a practice DEBATE asks: Romanian by default (the site's language), English on request. */
export function practiceQuestion(id: string): PracticeQuestion {
  const found = PRACTICE_QUESTIONS.find((question) => question.id === id);
  if (found === undefined) throw new TypeError("PRACTICE_QUESTION_UNKNOWN");
  return found;
}

/**
 * The whole-debate comparison's four fixed questions (README step S-8): two Romanian, two English, a public policy, a
 * personal decision, a contested fact and an ethics question. Each is word for word the openings question of the same
 * id, so the Phase 1 data lines up question by question.
 */
export const PRACTICE_COMPARISON_QUESTION_IDS = Object.freeze(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"] as const);

/** What a practice DEBATE asks: the id and the question exactly as a person would type it. */
export type PracticeDebateQuestion = Readonly<{ id: string; questionLine: string }>;

/**
 * The question a practice debate asks: `ro` (the default), `en`, or one of the comparison's ids. Anything else is
 * refused before anything starts, and the refusal never repeats what was typed.
 */
export function practiceDebateQuestion(id: string): PracticeDebateQuestion {
  const practice = PRACTICE_QUESTIONS.find((question) => question.id === id);
  if (practice !== undefined) return Object.freeze({ id: practice.id, questionLine: practice.questionLine });
  if ((PRACTICE_COMPARISON_QUESTION_IDS as readonly string[]).includes(id)) {
    const comparison = OPENINGS_QUESTIONS.find((question) => question.id === id);
    if (comparison !== undefined) return Object.freeze({ id: comparison.id, questionLine: comparison.questionLine });
  }
  const language = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === id);
  if (language !== undefined) return Object.freeze({ id: language.id, questionLine: language.questionLine });
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `--question (ro, en, a comparison id: ${PRACTICE_COMPARISON_QUESTION_IDS.join(", ")}, `
    + `or a language case id: ${PRACTICE_LANGUAGE_CASES.map((entry) => entry.id).join(", ")})`);
}

/**
 * The question-language practice's fixed cases (question-language spec 2026-10-13; P2L cross-plan amendment P2d-3):
 * P2L's table word for word, then the two cases the P2L final review asked for (I3, I1), then the stray-letter case (the
 * reply-language check's rule for Chinese, Japanese and Korean letters, PR #194). Each says the site language
 * it is asked on, the lock the site must reach, and whether the one-language offer must be made. Our own questions,
 * never anyone's; mode `language` asks them all, and a practice debate may ask one of them by its id.
 */
export type PracticeLanguageCase = Readonly<{ id: string; site: string; questionLine: string; expectedLock: string; offerExpected: boolean;
  /**
   * "OFF": the lock is worked out as on a deployment with no fast check (a signed-out person, local mode, no gate). The
   * fast check is still asked, and its reading recorded, but the lock never uses it.
   */
  fastCheck?: "OFF" }>;

export const PRACTICE_LANGUAGE_CASES: readonly PracticeLanguageCase[] = Object.freeze([
  Object.freeze({ id: "lang-ro-plain", site: "ro", questionLine: "Ar trebui sa renuntam la leu si sa trecem la euro?", expectedLock: "ro", offerExpected: false }),
  Object.freeze({ id: "lang-ro-en-mix", site: "ro", questionLine: "Ar trebui România să adopte euro, or should it wait until wages catch up?",
    expectedLock: "ro", offerExpected: true }),
  Object.freeze({ id: "lang-en-on-ro", site: "ro", questionLine: "Should Romania adopt the euro before 2030?", expectedLock: "en", offerExpected: false }),
  Object.freeze({ id: "lang-short-code", site: "en", questionLine: "Is `rm -rf /` ever safe in CI?", expectedLock: "en", offerExpected: false }),
  Object.freeze({ id: "lang-sr-latn", site: "ro", questionLine: "Da li bi Srbija trebalo da uvede evro?", expectedLock: "sr-Latn", offerExpected: false }),
  Object.freeze({ id: "lang-id", site: "id", questionLine: "Apakah Indonesia harus menaikkan pajak karbon?", expectedLock: "id", offerExpected: false }),
  Object.freeze({ id: "lang-ro-borrowed", site: "ro", questionLine: "Merită să lucrez la un startup de AI în loc de o corporație?",
    expectedLock: "ro", offerExpected: false }),
  // P2L final review I3: a short Chinese question (13 Han letters, under eld's floor) with no fast check: its script
  // decides (decide.ts scriptLanguage: Han with no kana → zh), never the English site.
  Object.freeze({ id: "lang-zh-short", site: "en", questionLine: "人工智能会取代大多数工作吗？", expectedLock: "zh", offerExpected: false,
    fastCheck: "OFF" }),
  // P2L final review I1: Sorani Kurdish in Arabic letters, on the Arabic site (not an always-ask site). The lock is "ku"
  // (ISO 639-1), never "ckb"; the kernel then expects Arabic letters from the question's own script.
  Object.freeze({ id: "lang-ku-arab", site: "ar", questionLine: "ئایا دەبێت باجی کاربۆن زیاد بکرێت؟", expectedLock: "ku", offerExpected: false }),
  // The stray-letter rule (PR #194; its final review): an English question ABOUT an East-Asian topic, which invites an AI
  // to add a term in its own script, such as "hukou (户口)". The rule refuses Chinese, Japanese and Korean letters in
  // English text (outside quotation marks), so a gloss costs one short follow-up; no practice question had invited one.
  // The owners may reword it, but only in Latin letters: such letters in the question itself switch the rule off.
  Object.freeze({ id: "lang-en-hukou", site: "en",
    questionLine: "Should China abolish the hukou household registration system to reduce inequality between cities and the countryside?",
    expectedLock: "en", offerExpected: false })
]);
