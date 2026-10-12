/**
 * Preview practice, mode "openings": the fixed questions and the arms.
 *
 * Plain words: the openings comparison (spec 2026-10-12 §2) asks the same 12 questions of the same AIs four ways. The
 * questions are our own, fixed here, plain and neutral; never read from the command line. --questions and --arms only
 * choose among these fixed ids and arm letters: anything else is refused, and the refusal never repeats what was typed.
 */
import { PracticeRefusal } from "./practice-settings.js";

export type OpeningsCategory = "PUBLIC_POLICY" | "ETHICS" | "HEALTH_PRACTICAL" | "PERSONAL_DECISION" | "CONTESTED_FACT";

export type OpeningsQuestion = Readonly<{
  id: string;
  questionLine: string;
  /** detectArgumentLanguage's English name. */
  languageName: "Romanian" | "English";
  languageTag: "ro" | "en";
  category: OpeningsCategory;
}>;

const ro = (id: string, category: OpeningsCategory, questionLine: string): OpeningsQuestion =>
  Object.freeze({ id, questionLine, languageName: "Romanian", languageTag: "ro", category });
const en = (id: string, category: OpeningsCategory, questionLine: string): OpeningsQuestion =>
  Object.freeze({ id, questionLine, languageName: "English", languageTag: "en", category });

export const OPENINGS_QUESTIONS: readonly OpeningsQuestion[] = Object.freeze([
  ro("ro-euro", "PUBLIC_POLICY", "Ar trebui România să adopte moneda euro în următorii cinci ani?"),
  ro("ro-autobuze", "PUBLIC_POLICY", "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?"),
  ro("ro-final-viata", "ETHICS", "Ar trebui să fie legal ca un adult cu o boală incurabilă să ceară ajutor medical pentru a-și încheia viața?"),
  ro("ro-ciuperci", "HEALTH_PRACTICAL", "Copilul meu de doi ani a mâncat o bucată dintr-o ciupercă găsită în parc și pare bine. Ce ar trebui să fac acum?"),
  ro("ro-strainatate", "PERSONAL_DECISION", "Merită să mă mut în străinătate pentru un salariu de două ori mai mare, dacă familia mea rămâne în România?"),
  ro("ro-hpv", "CONTESTED_FACT", "Este adevărat că vaccinul HPV reduce riscul cancerului cervical pentru femeile care au fost vaccinate în adolescență?"),
  en("en-nuclear", "CONTESTED_FACT", "Is new nuclear power cheaper than wind and solar with storage for cutting the emissions of a country?"),
  en("en-four-day-week", "PUBLIC_POLICY", "Should companies move to a four-day work week with the same pay?"),
  en("en-phones-school", "PUBLIC_POLICY", "Should schools ban students' phones for the whole school day?"),
  en("en-retirement-age", "PUBLIC_POLICY", "Should the state retirement age rise to 67 as people live longer?"),
  en("en-social-media-age", "ETHICS", "Should children under 16 be banned from having social media accounts, or should it be the choice of their parents?"),
  en("en-rent-caps", "CONTESTED_FACT", "Do rent caps help tenants more than they harm the supply of housing?")
]);

export const OPENINGS_ARMS = Object.freeze(["T", "A", "B", "C"] as const);
/** T: today's opening. A: snowball. B: blind lists. C: the angle map. */
export type OpeningsArm = typeof OPENINGS_ARMS[number];

function openingsIds(value: string): readonly string[] | null {
  const ids = value.split(",").map((id) => id.trim()).filter((id) => id !== "");
  return ids.length === 0 || new Set(ids).size !== ids.length ? null : ids;
}

/** The questions a run asks: all twelve, or the fixed ids named (in the fixed order). */
export function openingsQuestionsFromFlag(value: string | undefined): readonly OpeningsQuestion[] {
  if (value === undefined) return OPENINGS_QUESTIONS;
  const ids = openingsIds(value);
  if (ids === null || ids.some((id) => !OPENINGS_QUESTIONS.some((question) => question.id === id))) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--questions (only the fixed question ids, comma-separated, each once)");
  }
  return Object.freeze(OPENINGS_QUESTIONS.filter((question) => ids.includes(question.id)));
}

/** The arms a run uses: all four, or the letters named (in the order T, A, B, C). */
export function openingsArmsFromFlag(value: string | undefined): readonly OpeningsArm[] {
  if (value === undefined) return OPENINGS_ARMS;
  const ids = openingsIds(value);
  if (ids === null || ids.some((id) => !(OPENINGS_ARMS as readonly string[]).includes(id))) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--arms (only T, A, B, C, comma-separated, each once)");
  }
  return Object.freeze(OPENINGS_ARMS.filter((arm) => ids.includes(arm)));
}
