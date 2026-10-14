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
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID",
    `--question (ro, en, or a comparison id: ${PRACTICE_COMPARISON_QUESTION_IDS.join(", ")})`);
}
