import { PERSONAL_DATA_KINDS, personalDataKinds, type PersonalDataKind } from "@debateai/kernel";

/**
 * THE SEARCH GUARD (web search plan W1-2, 2026-10-30; design §3.1, owner-approved).
 *
 * Every search the planner AI writes passes here, in code, before it can be sent:
 * - dates and instruction words are removed (R/35: dates in the words pulled in that week's opinion pieces; the
 *   look-back window, worked out by code from the pace word, does the dating instead);
 * - a search carrying personal data (an email, phone, IBAN, card or ID number, or a web address with a query string;
 *   the kernel's `findPersonalData`) is held back;
 * - a search with first-person words is flagged and held back too: "I'm a nurse from Cluj" never leaves us, while
 *   "nurse net salary Germany 2026" may (as "nurse net salary Germany").
 * A held search keeps no copy of its words (`text: null`), so nothing personal is stored either.
 *
 * The word lists cover English and Romanian, the two languages of the design's examples. A search written in another
 * language still goes through the personal-data scan, which is language-free.
 */
export type CleanedPart = "DATE" | "INSTRUCTION";
export type SearchHoldReason =
  | "PERSONAL_DATA"
  | "FIRST_PERSON"
  | "TOO_LONG"
  | "EMPTY_AFTER_CLEANING"
  | "PAIR_PARTNER_HELD"
  | "NO_LOCAL_TARGET";

export type GuardedSearch = Readonly<{
  outcome: "SEND" | "HOLD";
  reasons: readonly SearchHoldReason[];
  text: string | null;
  personalData: readonly PersonalDataKind[];
  firstPerson: boolean;
  removed: readonly CleanedPart[];
}>;

/** A search longer than this once cleaned is not a search of plain words; it is held back. */
const MAX_SEARCH_CHARACTERS = 300;

const WORD_START = "(?<![\\p{L}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{N}])";
const words = (pattern: string): string => `${WORD_START}(?:${pattern})${WORD_END}`;

/** A word list as a pattern that also matches each word with a capital first letter ("in" and "In"). */
const capitalisable = (list: readonly string[]): string =>
  list.map((word) => `[${word[0]}${word[0]!.toLocaleUpperCase("en")}]${word.slice(1)}`).join("|");
const PREPOSITION = `(?:${capitalisable([
  "in", "on", "since", "from", "during", "until", "till", "by", "before", "after", "as of", "în", "din", "pe", "până în",
  "până la", "de la", "începând cu"
])})`;
const EN_MONTH = "January|February|March|April|May|June|July|August|September|October|November|December"
  + "|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?";
const RO_MONTH = "[Ii]anuarie|[Ff]ebruarie|[Mm]artie|[Aa]prilie|[Ii]unie|[Ii]ulie|[Aa]ugust|[Ss]eptembrie|[Oo]ctombrie"
  + "|[Nn]oiembrie|[Dd]ecembrie";
const YEAR = "(?:19|20)\\d\\d";
const DAY = "(?:[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?";
const MONTH = `(?:${EN_MONTH}|${RO_MONTH})`;
/** Romanian "mai" is also "more": it counts as May only with a day before it or a year after it. */
const MAI = "[Mm]ai";

/** Each kind of date, with the preposition in front of it ("in 2025", "în octombrie 2025") taken away too. Month names
 * are matched with their capital (English "may" and "march" are ordinary words); the other patterns ignore case. */
const DATE_PATTERNS: readonly RegExp[] = ([
  [`\\d{4}-\\d{2}-\\d{2}`, "gu"],
  [`\\d{1,2}[./-]\\d{1,2}[./-](?:\\d{4}|\\d{2})`, "gu"],
  [`${DAY}\\s+(?:${MONTH}|${MAI})(?:,?\\s+${YEAR})?`, "gu"],
  [`${MONTH}\\s+${DAY}(?:,?\\s+${YEAR})?`, "gu"],
  [`(?:${MONTH}|${MAI})\\s+${YEAR}`, "gu"],
  [`Q[1-4]\\s+${YEAR}|${YEAR}\\s+Q[1-4]`, "gu"],
  [`${YEAR}\\s*[-–/]\\s*(?:${YEAR}|\\d\\d)`, "gu"],
  [YEAR, "gu"],
  ["(?:this|last|next|past) (?:week|month|year)|today|yesterday|tomorrow", "giu"],
  ["(?:anul|luna|săptămâna) (?:acesta|aceasta|trecut|trecută|viitor|viitoare)|azi|astăzi|ieri|mâine", "giu"]
] as const).map(([pattern, flags]) => new RegExp(`(?:${WORD_START}${PREPOSITION}\\s+)?${words(pattern)}`, flags));

/** Search-engine operators: `site:`, `filetype:` and the like, quotes, and OR / AND / NOT in capitals. */
const OPERATOR_TOKENS = new RegExp(`${WORD_START}-?(?:site|inurl|intitle|intext|allintitle|allinurl|filetype|related|cache|before|after):\\S*`, "giu");
const QUOTES = /["“”„«»]/gu;
const BOOLEAN_WORDS = new RegExp(words("OR|AND|NOT"), "gu");
const POLITE_WORDS = new RegExp(words("please|pls|te rog|vă rog|va rog"), "giu");
/** An order at the start of a search ("search for", "find", "caută"). */
const LEADING_ORDER = new RegExp(
  `^(?:search(?: for)?|find(?: me| out)?|look (?:up|for)|show me|give me|tell me|list|google|caută|cauta|găsește|gaseste`
  + `|arată-mi|arata-mi|spune-mi|dă-mi|da-mi)${WORD_END}[:,]?\\s*`, "iu");

const ENGLISH_FIRST_PERSON = new Set([
  "i'm", "i've", "i'd", "i'll", "me", "my", "myself", "we", "we're", "we've", "we'd", "we'll", "our", "ours", "ourselves"
]);
const ROMANIAN_FIRST_PERSON = new Set([
  "meu", "mea", "mei", "mele", "nostru", "noastră", "noastra", "noastre", "noștri", "noştri", "nostri", "îmi", "mă"
]);
/** Words before which a capital "I" is a Roman one: World War I, Phase I, type I diabetes. */
const ROMAN_NUMERAL_NOUNS = new Set([
  "war", "phase", "type", "class", "schedule", "article", "title", "part", "stage", "grade", "level", "tier", "category",
  "chapter", "section", "volume", "book", "act", "henry", "elizabeth", "charles", "george", "james", "william", "louis"
]);

const normalised = (text: string): string => text.replace(/[’‘`]/gu, "'").replace(/\s+/gu, " ").trim();
const tidy = (text: string): string => text
  .replace(/\(\s*\)/gu, " ")
  .replace(/\s+([,;:.!?])/gu, "$1")
  .replace(/\s+/gu, " ")
  .trim()
  .replace(/^[\s,;:.\-–]+|[\s,;:\-–]+$/gu, "")
  .trim();

/** The search without its dates and instruction words, and which of the two were taken out. */
export function cleanSearchText(raw: string): Readonly<{ text: string; removed: readonly CleanedPart[] }> {
  const removed = new Set<CleanedPart>();
  let text = normalised(raw);
  const strip = (pattern: RegExp, part: CleanedPart): void => {
    const next = text.replace(pattern, " ");
    if (next !== text) removed.add(part);
    text = next;
  };
  strip(OPERATOR_TOKENS, "INSTRUCTION");
  strip(QUOTES, "INSTRUCTION");
  strip(BOOLEAN_WORDS, "INSTRUCTION");
  strip(POLITE_WORDS, "INSTRUCTION");
  text = tidy(text);
  for (;;) {
    const next = text.replace(LEADING_ORDER, "");
    if (next === text) break;
    removed.add("INSTRUCTION");
    text = tidy(next);
  }
  for (const pattern of DATE_PATTERNS) strip(pattern, "DATE");
  return Object.freeze({
    text: tidy(text),
    removed: Object.freeze((["DATE", "INSTRUCTION"] as const).filter((part) => removed.has(part)))
  });
}

/** `text` without its leading and trailing apostrophes, by index: no pattern, so a run of `'` costs one pass (CodeQL). */
function trimApostrophes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === "'") start += 1;
  while (end > start && text[end - 1] === "'") end -= 1;
  return text.slice(start, end);
}

/** The first-person words in a search, in order ("I'm", "my", "meu"); empty when there are none. */
export function firstPersonWords(raw: string): readonly string[] {
  const found: string[] = [];
  let previous = "";
  for (const match of normalised(raw).matchAll(/[\p{L}']+/gu)) {
    const word = trimApostrophes(match[0]);
    const lower = word.toLocaleLowerCase("en");
    const roman = word === "I" && ROMAN_NUMERAL_NOUNS.has(previous);
    // A word in capitals is a code, not a pronoun: US and EU, Portland ME, MY (Malaysia).
    const capitals = word.length > 1 && word === word.toLocaleUpperCase("en");
    if ((word === "I" && !roman)
      || (!capitals && (ENGLISH_FIRST_PERSON.has(lower) || ROMANIAN_FIRST_PERSON.has(lower) || lower === "us" || lower === "eu"))) {
      found.push(word);
    }
    previous = lower;
  }
  return Object.freeze(found);
}

/** Whether one search may leave us, and in which words. A held search keeps no copy of its words. */
export function guardSearch(raw: string): GuardedSearch {
  const cleaned = cleanSearchText(raw);
  const kinds = new Set<PersonalDataKind>([...personalDataKinds(raw), ...personalDataKinds(cleaned.text)]);
  const personalData = Object.freeze(PERSONAL_DATA_KINDS.filter((kind) => kinds.has(kind)));
  // Read on the cleaned words, so an order the guard already took out ("show me", "find me") flags nothing.
  const firstPerson = firstPersonWords(cleaned.text).length > 0;
  const reasons: SearchHoldReason[] = [];
  if (personalData.length > 0) reasons.push("PERSONAL_DATA");
  if (firstPerson) reasons.push("FIRST_PERSON");
  if (cleaned.text.length > MAX_SEARCH_CHARACTERS) reasons.push("TOO_LONG");
  if (!/[\p{L}\p{N}]/u.test(cleaned.text)) reasons.push("EMPTY_AFTER_CLEANING");
  const hold = reasons.length > 0;
  return Object.freeze({
    outcome: hold ? "HOLD" : "SEND",
    reasons: Object.freeze(reasons),
    text: hold ? null : cleaned.text,
    personalData,
    firstPerson,
    removed: cleaned.removed
  });
}
