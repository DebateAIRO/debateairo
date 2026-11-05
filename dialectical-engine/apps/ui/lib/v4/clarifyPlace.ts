import { purposeAnswerSentence, type ClarifyQuestion } from "@debateai/contract";

/*
 * V4 start step, Task 76d (r2-5, owner answer Q5 of 4 Nov): the site's country, put first by code among the answers of the clarifying
 * question that asks where (the small AI marks it, version 2 of its call), never ticked. Romania on the Romanian site, the visitor's
 * own country elsewhere (the edge's country hint), named in the question's language. Nothing here is kept in the browser.
 */

/** A country the page may add: its two-letter code and its name. */
export type SiteCountry = Readonly<{ code: string; name: string }>;

const REGION_CODE = /^[A-Z]{2}$/u;

/** A name as two answers are compared: spaces closed up, case and accents set aside (no locale's rules). */
function sameWords(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * The country this page puts first: the Romanian site's is Romania, whatever the visitor's country; otherwise the edge's hint (a
 * two-letter code). Its name is the question's language's (Intl.DisplayNames); none when no country is known or no name is found.
 */
export function siteCountryOf(input: Readonly<{ locale: string; countryHint: string | null; questionLanguage: string }>): SiteCountry | null {
  const site = input.locale.toLowerCase().split("-")[0];
  const code = site === "ro" ? "RO" : input.countryHint !== null && REGION_CODE.test(input.countryHint) ? input.countryHint : null;
  if (code === null) return null;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([input.questionLanguage], { type: "region", fallback: "none" }).of(code);
  } catch {
    name = undefined;
  }
  return name === undefined || name.trim().length === 0 ? null : Object.freeze({ code, name: name.trim() });
}

/**
 * r2-5: the place question (`about_place`) with the site's country first among its answers, when no answer already names it (case
 * and accents aside). The person's answers are not touched, so it is never ticked. Its sentence is today's pair ("Which region?
 * Romania."), placed first among the AI's sentences when the AI wrote them. Any other question, or no country: as it is.
 */
export function withSiteCountryFirst(question: ClarifyQuestion, country: SiteCountry | null): ClarifyQuestion {
  if (country === null || question.about_place !== true) return question;
  const name = sameWords(country.name);
  if (question.answers.some((answer) => sameWords(answer) === name)) return question;
  const pair = purposeAnswerSentence({ question: question.text, answer: country.name });
  return {
    ...question,
    answers: [country.name, ...question.answers],
    ...(question.sentences === undefined ? {} : { sentences: [pair, ...question.sentences] })
  };
}
