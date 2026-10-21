import { detectArgumentLanguage, foreignLatinLetterCount, matrixClause } from "./argument-language.js";

/**
 * REPLY LANGUAGE (2026-10-12). Every structured step is told to write its natural-language fields in the question's
 * language (`argumentLanguageDirective`), and until now nothing checked that it did. In two practice debates on an
 * English question MiMo-V2.6-Pro answered 9 of its 71 replies in Polish, French, Spanish, Catalan, German or
 * Portuguese; seven were accepted as normal, and a German position became material for three other models, the answer
 * writer and the story. No other model drifted.
 *
 * This file decides, with no model and no network, whether a reply's prose is in the question's language. It answers
 * "is this the expected language?", not "which language is this?", from evidence that works for every interface
 * language: the writing system first (a Latin-script reply to a Greek question), then the letters only one of a
 * script's languages uses (Russian ы/э against Ukrainian і/ї/є; kana in Japanese), then, for Latin-script languages, the
 * small words every sentence of a language is made of. A check that cannot tell says nothing: only clear evidence of
 * another language refuses a reply. A refusal is a typed issue at each failing member's machine path, so the step's
 * existing repair (the short follow-up, then the full re-ask) asks the model for the same answer in the question's
 * language. Nothing here translates or edits what a model wrote.
 *
 * STRAY LETTERS (2026-10-21). One rule reads letters rather than languages: Chinese characters, Japanese kana or Korean
 * Hangul inside a member whose expected script is another one (`replyTextHasStrayScript`). The R19 practice debate
 * served readers an English story whose paragraph said "hidden system costs are大于 the renewables camp admits", and
 * practice runs from 2026-10-14 on held seven more such slips, in English and Romanian, from four makers: GLM-5.3-Flash,
 * MiMo-V2.6-Pro, Qwen3.8-Flash and Claude Haiku 5.5 (a map statement, judges' attacks, summaries and flags), so about
 * eight slips in some 3,200 replies; the language reading above found each one EXPECTED, since a few foreign letters
 * never outweigh a sentence. Prose in a language written in another script never borrows these four scripts
 * unchanged, and a name from Chinese, Japanese or Korean is written in the reader's own letters, so one such letter is
 * enough. A quoted span is not read (a reply may quote a term), and the rule is off when the question line itself holds
 * such letters (`questionHasStrayScript`). The refusal reuses TEXT_NOT_IN_QUESTION_LANGUAGE, so the existing short
 * follow-up asks the model for that member again. Every other script keeps the rule above: names, sources and figures
 * in it are fine.
 */
export const TEXT_NOT_IN_QUESTION_LANGUAGE = "TEXT_NOT_IN_QUESTION_LANGUAGE" as const;

export type ReplyScript = "Latin" | "Cyrillic" | "Greek" | "Arabic" | "Hebrew" | "Devanagari" | "Hangul" | "CJK" | "Other";

/** What a reply is checked against: the question's language when the detector named it, else only its script. */
export interface ReplyLanguageExpectation {
  /** The question's language tag (`detectArgumentLanguage`), or "und". */
  readonly tag: string;
  /** The question's writing system, or null when the question is too short or too mixed to say. */
  readonly script: ReplyScript | null;
  /**
   * Present (2026-10-21) only when the question line holds Chinese, Japanese or Korean letters while its expected script
   * is another one: the question uses such a term, so a reply may too, and the stray-letter rule is off.
   */
  readonly questionHasStrayScript?: true;
}

/** One natural-language member of a reply, at its machine path (keys and array indices). */
export interface ReplyProseField {
  readonly path: readonly (string | number)[];
  readonly text: string;
}

/**
 * One refusal, in the form the story's and the answer writer's content checks already use (a zod-like issue whose
 * `message` is the code): the patch follow-up reads `message`, the practice reports read `code`.
 */
export interface ReplyLanguageIssue {
  readonly code: typeof TEXT_NOT_IN_QUESTION_LANGUAGE;
  readonly path: readonly (string | number)[];
  readonly message: typeof TEXT_NOT_IN_QUESTION_LANGUAGE;
}

export type ReplyLanguageVerdict = "EXPECTED" | "OTHER" | "UNSURE";

const SCRIPT_OF_TAG: Readonly<Record<string, ReplyScript>> = Object.freeze({
  ar: "Arabic", he: "Hebrew", hi: "Devanagari", ko: "Hangul", ja: "CJK", zh: "CJK", el: "Greek",
  ru: "Cyrillic", uk: "Cyrillic", bg: "Cyrillic"
});

/** The writing system a language tag's own table names (Russian → Cyrillic), or undefined for the rest. */
export function replyScriptOfTag(tag: string): ReplyScript | undefined {
  return Object.hasOwn(SCRIPT_OF_TAG, tag) ? SCRIPT_OF_TAG[tag] : undefined;
}

const SCRIPT_PATTERNS: readonly (readonly [ReplyScript, RegExp])[] = Object.freeze([
  ["Latin", /\p{Script=Latin}/gu],
  ["Cyrillic", /\p{Script=Cyrillic}/gu],
  ["Greek", /\p{Script=Greek}/gu],
  ["Arabic", /\p{Script=Arabic}/gu],
  ["Hebrew", /\p{Script=Hebrew}/gu],
  ["Devanagari", /\p{Script=Devanagari}/gu],
  ["Hangul", /\p{Script=Hangul}/gu],
  ["CJK", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu]
]);

/**
 * The small words a Latin-script language's prose is made of: articles, prepositions, conjunctions, pronouns and
 * auxiliaries, for each Latin-script interface language. They are read only as evidence for a whole reply or one
 * long member, never for a question (the question's detector keeps its own conservative lists). Words two languages
 * share are fine: a verdict needs one language's evidence to outweigh the expected language's several times over.
 */
const REPLY_FUNCTION_WORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  cs: ["a", "ale", "bez", "by", "být", "do", "i", "jako", "je", "jeho", "jejich", "jen", "již", "jsou", "k", "když", "má", "mezi", "může", "na", "nebo", "není", "o", "od", "po", "pro", "protože", "při", "s", "se", "také", "tak", "tento", "této", "to", "v", "však", "z", "za", "že", "která", "které", "který"],
  da: ["af", "alle", "at", "bør", "da", "de", "deres", "den", "det", "efter", "eller", "en", "er", "et", "for", "fra", "har", "hvor", "i", "ikke", "kan", "med", "men", "mere", "mod", "når", "og", "også", "om", "på", "sig", "skal", "som", "så", "til", "uden", "under", "var", "være", "vil"],
  de: ["aber", "als", "am", "an", "auch", "auf", "aus", "bei", "bis", "das", "dass", "dem", "den", "der", "des", "die", "durch", "ein", "eine", "einem", "einen", "einer", "es", "für", "hat", "im", "in", "ist", "kann", "mit", "nach", "nicht", "noch", "oder", "sich", "sie", "sind", "sollte", "um", "und", "von", "vor", "weil", "wenn", "werden", "wie", "wird", "zu", "zum", "zur", "über"],
  en: ["a", "about", "also", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by", "can", "could", "does", "for", "from", "has", "have", "if", "in", "into", "is", "it", "its", "may", "more", "must", "not", "of", "on", "only", "or", "other", "should", "such", "than", "that", "the", "their", "there", "these", "they", "this", "those", "to", "was", "were", "what", "when", "which", "while", "who", "will", "with", "would"],
  es: ["a", "al", "como", "con", "cuando", "de", "debe", "del", "donde", "el", "en", "entre", "es", "esta", "este", "está", "están", "hay", "la", "las", "le", "lo", "los", "muy", "más", "no", "o", "para", "pero", "por", "porque", "puede", "que", "se", "ser", "si", "sin", "sobre", "son", "su", "sus", "también", "un", "una", "y", "ya"],
  et: ["aga", "ainult", "et", "ja", "juba", "ka", "kas", "kes", "kui", "kuid", "kõik", "mida", "mis", "nagu", "nad", "ning", "nii", "oli", "oma", "on", "peab", "peaks", "pole", "seda", "see", "selle", "sest", "siis", "tema", "veel", "või", "võib", "ei", "üle"],
  fi: ["ei", "eli", "että", "he", "hän", "ja", "jo", "joka", "jos", "jotka", "kaikki", "koska", "kuin", "kun", "mikä", "mukaan", "mutta", "myös", "niin", "nyt", "oli", "olla", "on", "ovat", "pitäisi", "se", "sekä", "sen", "siitä", "sitä", "tai", "tämä", "vain", "vielä", "voi"],
  fr: ["a", "au", "aussi", "aux", "avec", "ce", "ces", "cette", "comme", "dans", "de", "des", "doit", "du", "elle", "en", "entre", "est", "et", "il", "la", "le", "les", "leur", "leurs", "mais", "ne", "nous", "ou", "par", "pas", "peut", "plus", "pour", "que", "qui", "sa", "sans", "se", "ses", "si", "son", "sont", "sur", "très", "un", "une", "vous", "à", "être"],
  ga: ["a", "ach", "ag", "agus", "an", "aon", "ar", "as", "atá", "bheith", "bhí", "chun", "de", "do", "faoi", "féidir", "gach", "go", "gur", "i", "idir", "is", "le", "mar", "na", "nach", "ní", "níos", "nó", "seo", "siad", "sin", "sé", "sí", "tá", "ó"],
  hr: ["a", "ako", "ali", "bez", "bi", "biti", "da", "do", "također", "će", "iz", "ili", "između", "je", "jer", "kada", "kao", "koja", "koje", "koji", "može", "mora", "na", "ne", "o", "od", "po", "pri", "s", "sa", "se", "samo", "su", "svoje", "što", "to", "u", "za"],
  hu: ["a", "akkor", "az", "azt", "csak", "de", "egy", "el", "ez", "ezt", "ha", "hogy", "is", "kell", "kellene", "ki", "lehet", "lesz", "már", "meg", "mert", "még", "mint", "minden", "nagyon", "nem", "nélkül", "pedig", "sem", "szerint", "után", "vagy", "van", "volt", "és", "között"],
  id: ["ada", "adalah", "akan", "antara", "atau", "bahwa", "bisa", "dalam", "dan", "dapat", "dari", "dengan", "di", "harus", "ini", "itu", "jika", "juga", "karena", "kami", "ke", "kita", "lebih", "mereka", "namun", "oleh", "pada", "saja", "sebagai", "seperti", "sudah", "tanpa", "tetapi", "tidak", "untuk", "yang"],
  it: ["a", "al", "alla", "anche", "che", "come", "con", "da", "dei", "del", "della", "delle", "deve", "di", "e", "essere", "gli", "i", "il", "in", "la", "le", "lo", "ma", "molto", "nel", "nella", "non", "o", "per", "perché", "più", "può", "questa", "questo", "se", "senza", "si", "sono", "sua", "suo", "tra", "un", "una", "è"],
  lt: ["apie", "ar", "be", "bet", "buvo", "būti", "dar", "gali", "iš", "ir", "jei", "jo", "jos", "jų", "kad", "kai", "kaip", "kuri", "kuris", "labai", "ne", "nes", "o", "per", "prie", "savo", "su", "ši", "šis", "tai", "taip", "tarp", "tik", "turi", "turėtų", "už", "yra", "į"],
  lv: ["ar", "arī", "bet", "bez", "būt", "ir", "ja", "jo", "jābūt", "ka", "kas", "kā", "kura", "kurš", "lai", "nav", "no", "par", "pie", "pēc", "savu", "savas", "starp", "tas", "tikai", "tā", "un", "uz", "vai", "vajadzētu", "var", "vēl", "viņa", "viņu", "ļoti", "šis", "šī"],
  mt: ["aktar", "bejn", "biex", "bħala", "dan", "dawn", "din", "fil", "fuq", "għal", "għandha", "għandu", "għax", "hemm", "hija", "huwa", "il", "iżda", "jekk", "jew", "jista", "jistgħu", "kif", "kull", "li", "ma", "meta", "mhux", "minn", "ta", "tagħhom", "tal", "u", "ukoll", "wara"],
  nl: ["aan", "al", "als", "bij", "dan", "dat", "de", "deze", "die", "dit", "door", "een", "en", "er", "geen", "het", "hun", "in", "is", "kan", "maar", "meer", "met", "moet", "naar", "niet", "nog", "of", "om", "omdat", "ook", "op", "te", "uit", "van", "voor", "wel", "wordt", "worden", "zijn", "zou"],
  pl: ["a", "ale", "bez", "być", "co", "czy", "dla", "do", "gdy", "i", "ich", "jak", "jego", "jej", "jest", "jeśli", "już", "lub", "ma", "może", "na", "nie", "o", "od", "oraz", "po", "ponieważ", "powinno", "przez", "przy", "się", "są", "także", "tak", "ten", "to", "tylko", "w", "więc", "z", "za", "że", "która", "które", "który"],
  pt: ["a", "ao", "as", "com", "como", "da", "das", "de", "deve", "do", "dos", "e", "em", "entre", "essa", "esse", "esta", "este", "está", "isso", "mais", "mas", "muito", "na", "nas", "no", "nos", "não", "o", "os", "ou", "para", "pela", "pelo", "pode", "por", "quando", "que", "se", "sem", "ser", "seu", "sua", "são", "também", "um", "uma", "à", "é"],
  ro: ["a", "acest", "această", "al", "ale", "ar", "au", "ca", "care", "ce", "cu", "că", "când", "dacă", "dar", "de", "din", "este", "fi", "foarte", "fără", "iar", "la", "lor", "mai", "nu", "o", "pe", "pentru", "poate", "prin", "sau", "se", "sunt", "să", "trebui", "un", "unei", "unui", "între", "în", "și"],
  sk: ["a", "ako", "ale", "bez", "by", "byť", "do", "i", "ich", "je", "jeho", "k", "keď", "len", "medzi", "má", "môže", "na", "nie", "o", "od", "po", "pre", "pretože", "pri", "s", "sa", "sú", "tak", "tento", "tiež", "to", "táto", "už", "v", "z", "za", "že", "ktorá", "ktoré", "ktorý", "alebo"],
  sl: ["ali", "bi", "biti", "brez", "da", "do", "ga", "iz", "in", "je", "jih", "kadar", "ker", "ki", "kot", "lahko", "le", "med", "mora", "na", "ne", "o", "od", "pa", "po", "pri", "s", "se", "so", "ta", "ter", "to", "tudi", "v", "vendar", "z", "za", "zato", "če"],
  sv: ["alla", "att", "av", "bör", "de", "deras", "dess", "den", "det", "där", "efter", "eller", "en", "ett", "för", "från", "har", "i", "inte", "kan", "med", "men", "mer", "mot", "när", "och", "också", "om", "på", "sig", "ska", "skulle", "som", "så", "till", "under", "utan", "var", "vid", "är"],
  tr: ["ama", "ancak", "bir", "bu", "bunun", "çok", "çünkü", "da", "daha", "de", "değil", "eğer", "gerekir", "gibi", "göre", "her", "ile", "ise", "için", "kadar", "mi", "mı", "ne", "olabilir", "olan", "olarak", "olması", "onun", "sonra", "şey", "var", "ve", "veya", "ya", "yok"],
  vi: ["bị", "cho", "các", "có", "của", "cũng", "khi", "không", "là", "một", "như", "nhưng", "nên", "nếu", "này", "người", "những", "rất", "sẽ", "theo", "thì", "trong", "tại", "từ", "và", "vì", "với", "về", "đã", "đến", "để", "được", "hoặc", "hơn"]
});

/** Letters outside the expected alphabet are clear evidence from this many on, and from 1 in 100 Latin letters. */
const MIN_FOREIGN_LETTERS = 4;

const REPLY_VOCABULARY: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(REPLY_FUNCTION_WORDS).map(([tag, words]) => [tag, new Set(words)])
);

/**
 * Too little text to judge on its own: the writing system needs this many letters (a short member wholly in another
 * script is still clear), the finer checks this many letters, and the Latin word checks this many words.
 */
const MIN_SCRIPT_LETTERS = 12;
const MIN_LETTERS = 20;
const MIN_LATIN_WORDS = 6;
/** Another language outweighs the expected one when it has at least this many hits and 3x + 2 the expected one's. */
const MIN_OTHER_HITS = 3;
/** A Cyrillic text this long with none of its language's own letters is in another Cyrillic language. */
const LONG_CYRILLIC_LETTERS = 200;
/** A text is in another writing system only when less than this share of its letters is in the expected one. */
const EXPECTED_SCRIPT_MIN_SHARE = 0.15;

/**
 * The Latin-script words of a text, lowercased: runs of letters that touch no digit, so a code, an id or a key
 * ("sk-ant-xxY7Y7", "B2B", "n12") is not read as words ("y" is Spanish for "and").
 */
function latinWords(text: string): readonly string[] {
  return text.normalize("NFC").toLocaleLowerCase("en-US").match(/(?<![\p{L}\p{M}\p{N}])\p{Script=Latin}+(?![\p{L}\p{M}\p{N}])/gu) ?? [];
}

function letterCount(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** How many of a text's letters are in `script` ("Other": in none of the listed writing systems). */
function scriptLetterCount(text: string, script: ReplyScript): number {
  if (script !== "Other") return count(text, SCRIPT_PATTERNS.find(([name]) => name === script)![1]);
  return SCRIPT_PATTERNS.reduce((rest, [, pattern]) => rest - count(text, pattern), letterCount(text));
}

/** The writing system more than half of a text's letters are in, or null when none is. */
export function majorityScript(text: string): ReplyScript | null {
  const letters = letterCount(text);
  if (letters === 0) return null;
  for (const [script] of [...SCRIPT_PATTERNS, ["Other"] as const]) {
    if (scriptLetterCount(text, script) * 2 > letters) return script;
  }
  return null;
}

/**
 * The letters the stray-letter rule reads (2026-10-21): Chinese characters, Japanese kana and Korean Hangul. Other
 * scripts are left to the language reading, where a name or a symbol in them is fine (Газпром, σ).
 */
const STRAY_SCRIPT_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** The rule reads only members whose expected script is known and is not one of its own. */
function strayScriptRuleApplies(expected: ReplyLanguageExpectation): boolean {
  return expected.script !== null && expected.script !== "CJK" && expected.script !== "Hangul";
}

/**
 * The expectation for a question line, with `questionHasStrayScript` set (2026-10-21) when the whole line, quotes
 * included, holds a Chinese, Japanese or Korean letter while the rule applies; `expected` itself otherwise.
 */
export function withQuestionStrayScript(expected: ReplyLanguageExpectation, questionLine: string): ReplyLanguageExpectation {
  if (!strayScriptRuleApplies(expected) || !STRAY_SCRIPT_LETTER.test(questionLine)) return expected;
  return Object.freeze({ ...expected, questionHasStrayScript: true });
}

/**
 * Whether a member holds a Chinese, Japanese or Korean letter outside its quotes while its expected script is another
 * one (2026-10-21, R19's served story). Off for an unknown script, a CJK or Hangul expectation, and a question that holds
 * such letters itself.
 */
export function replyTextHasStrayScript(expected: ReplyLanguageExpectation, text: string): boolean {
  if (!strayScriptRuleApplies(expected) || expected.questionHasStrayScript === true) return false;
  return STRAY_SCRIPT_LETTER.test(matrixClause(text.normalize("NFC")));
}

/**
 * What a reply to `questionLine` is checked against. The language is the question detector's own
 * (`detectArgumentLanguage`, the same reading that stored the run's language tag); when it could not name one, only the
 * question's writing system is expected.
 */
export function replyLanguageExpectation(questionLine: string): ReplyLanguageExpectation {
  const detected = detectArgumentLanguage(questionLine);
  if (detected.tag !== "und") {
    return withQuestionStrayScript(Object.freeze({ tag: detected.tag, script: SCRIPT_OF_TAG[detected.tag] ?? "Latin" }), questionLine);
  }
  const clause = matrixClause(questionLine);
  const text = letterCount(clause) >= 12 ? clause : questionLine;
  return withQuestionStrayScript(Object.freeze({ tag: "und", script: letterCount(text) >= 12 ? majorityScript(text) : null }), questionLine);
}

/** The text a verdict reads: quoted spans blanked (a reply may quote another language), unless little is left. */
function readableBody(text: string): string {
  const clause = matrixClause(text);
  return letterCount(clause) >= MIN_SCRIPT_LETTERS ? clause : text;
}

/**
 * Russian, Ukrainian and Bulgarian share one alphabet but not all its letters: ы and э are frequent in Russian alone,
 * і, ї and є in Ukrainian alone, and Bulgarian has none of the five. A long text with none of its own letters (about
 * two in a hundred Russian letters are ы or э) is not in that language either.
 */
function cyrillicVerdict(tag: string, text: string): ReplyLanguageVerdict {
  const lower = text.toLocaleLowerCase("ru");
  const letters = letterCount(lower);
  const ukrainian = count(lower, /[іїєґ]/gu);
  const russian = count(lower, /[ыэё]/gu);
  if ((tag === "ru" && ((ukrainian >= 3 && russian === 0) || (letters >= LONG_CYRILLIC_LETTERS && russian === 0)))
    || (tag === "uk" && ((russian >= 3 && ukrainian === 0) || (letters >= LONG_CYRILLIC_LETTERS && ukrainian === 0)))
    || (tag === "bg" && (russian >= 3 || ukrainian >= 3))) return "OTHER";
  return "EXPECTED";
}

function cjkVerdict(tag: string, text: string): ReplyLanguageVerdict {
  const kana = count(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const all = count(text, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  if (all < MIN_LETTERS) return "UNSURE";
  if (tag === "ja" && kana === 0) return "OTHER";
  if (tag === "zh" && kana * 10 > all) return "OTHER";
  return "EXPECTED";
}

/**
 * Each other language is weighed against the expected one on the words only ONE of the two has, so neighbours that
 * share half their small words (Spanish and French "de la que", Czech and Slovak "a v na") are told apart by the rest
 * ("el los y" against "le les et"). A language whose own words outnumber the expected language's own words three to
 * one (and by at least two) is clear evidence.
 */
function latinVerdict(tag: string, text: string): ReplyLanguageVerdict {
  const expected = REPLY_VOCABULARY.get(tag);
  if (expected === undefined) return "EXPECTED";
  const normalized = text.normalize("NFC");
  const foreign = foreignLatinLetterCount(normalized, tag);
  if (foreign >= MIN_FOREIGN_LETTERS && foreign * 100 >= count(normalized, /\p{Script=Latin}/gu)) return "OTHER";
  const words = latinWords(normalized);
  if (words.length < MIN_LATIN_WORDS) return "UNSURE";
  const hits = (has: (word: string) => boolean): number => words.reduce((n, word) => n + (has(word) ? 1 : 0), 0);
  const own = hits((word) => expected.has(word));
  let strongestOther = 0;
  for (const [otherTag, vocabulary] of REPLY_VOCABULARY) {
    if (otherTag === tag) continue;
    const ownOnly = hits((word) => expected.has(word) && !vocabulary.has(word));
    const otherOnly = hits((word) => vocabulary.has(word) && !expected.has(word));
    if (otherOnly >= MIN_OTHER_HITS && otherOnly >= 3 * ownOnly + 2) return "OTHER";
    strongestOther = Math.max(strongestOther, hits((word) => vocabulary.has(word)));
  }
  return own >= 2 && own >= strongestOther ? "EXPECTED" : "UNSURE";
}

/** Latin words that are sentences rather than names: at least six, and one in seven of them some language's small word. */
function readsAsLatinProse(text: string): boolean {
  const words = latinWords(text);
  if (words.length < MIN_LATIN_WORDS) return false;
  let best = 0;
  for (const vocabulary of REPLY_VOCABULARY.values()) {
    best = Math.max(best, words.reduce((n, word) => n + (vocabulary.has(word) ? 1 : 0), 0));
  }
  return best >= MIN_OTHER_HITS && best * 7 >= words.length;
}

/**
 * Whether one text is in the expected language: OTHER only on clear evidence of another language or script, UNSURE
 * when the text is too short or the evidence too thin, EXPECTED otherwise.
 */
export function replyTextLanguageVerdict(expected: ReplyLanguageExpectation, text: string): ReplyLanguageVerdict {
  const body = readableBody(text);
  const letters = letterCount(body);
  if (letters < MIN_SCRIPT_LETTERS || expected.script === null) return "UNSURE";
  // Names, sources and figures in another script are fine here; a text with almost nothing in the question's is not.
  // (Chinese, Japanese and Korean letters inside another script's prose are the stray-letter rule's, not this one's.)
  if (scriptLetterCount(body, expected.script) < EXPECTED_SCRIPT_MIN_SHARE * letters) return "OTHER";
  if (letters < MIN_LETTERS) return "UNSURE";
  const majority = majorityScript(body);
  if (majority !== null && majority !== expected.script) {
    // A Latin majority inside a non-Latin language is often names, addresses and sources: other only when it reads as
    // prose, made of some language's small words.
    if (majority !== "Latin" || readsAsLatinProse(body)) return "OTHER";
    return "UNSURE";
  }
  if (expected.tag === "und") return "EXPECTED";
  if (expected.script === "Cyrillic") return cyrillicVerdict(expected.tag, body);
  if (expected.script === "CJK") return cjkVerdict(expected.tag, body);
  if (expected.script === "Latin") return latinVerdict(expected.tag, body);
  return "EXPECTED";
}

const pathKey = (path: readonly (string | number)[]): string => path.map(String).join(".");

/**
 * The members of a reply that are not in the question's language, as typed issues at their machine paths; empty when
 * the reply is fine or the evidence is not clear. Two readings:
 *  · the whole reply (every field's text together, the strongest evidence): when it is in another language and no
 *    member is clearly in the expected one, every member is refused, short ones included;
 *  · each member alone: a long member clearly in another language is refused even inside an otherwise good reply.
 * Then (2026-10-21) every member with a stray Chinese, Japanese or Korean letter (`replyTextHasStrayScript`) is refused
 * too; that rule never feeds the two readings, so a stray member never changes which members they refuse.
 * Every element of a string array refused at once is refused as the array (`context.ambiguityFlags`), so the short
 * follow-up names one member for it.
 */
export function replyLanguageIssues(
  expected: ReplyLanguageExpectation,
  fields: readonly ReplyProseField[]
): readonly ReplyLanguageIssue[] {
  const prose = fields.filter((field) => typeof field.text === "string" && field.text.trim() !== "");
  if (prose.length === 0) return Object.freeze([]);
  const verdicts = prose.map((field) => replyTextLanguageVerdict(expected, field.text));
  // A reply with any member clearly in the expected language is mixed: only its members clearly in another are refused.
  const whole = verdicts.includes("EXPECTED") ? "MIXED" : replyTextLanguageVerdict(expected, prose.map((field) => field.text).join("\n"));
  let refused = prose.filter((_, index) => whole === "OTHER" ? verdicts[index] !== "EXPECTED" : verdicts[index] === "OTHER");
  if (whole === "OTHER" && refused.length === 0) refused = prose;
  refused = prose.filter((field) => refused.includes(field) || replyTextHasStrayScript(expected, field.text));
  if (refused.length === 0) return Object.freeze([]);
  const refusedKeys = new Set(refused.map((field) => pathKey(field.path)));
  const paths: (readonly (string | number)[])[] = [];
  const seen = new Set<string>();
  for (const field of refused) {
    const last = field.path.at(-1);
    const parent = field.path.slice(0, -1);
    const siblings = typeof last === "number" && parent.length > 0
      ? prose.filter((other) => other.path.length === field.path.length && typeof other.path.at(-1) === "number"
        && pathKey(other.path.slice(0, -1)) === pathKey(parent))
      : [];
    const path = siblings.length > 0 && siblings.every((sibling) => refusedKeys.has(pathKey(sibling.path))) ? parent : field.path;
    const key = pathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(Object.freeze([...path]));
  }
  return Object.freeze(paths.map((path) => Object.freeze({
    code: TEXT_NOT_IN_QUESTION_LANGUAGE,
    path,
    message: TEXT_NOT_IN_QUESTION_LANGUAGE
  })));
}

/**
 * The string members of `value` at `patterns` (dotted keys; `*` is every element of an array), in pattern order, as
 * prose fields. A member that is missing or not a string is skipped: the step's schema has already judged the shape.
 */
export function replyProseFieldsAt(value: unknown, patterns: readonly string[]): readonly ReplyProseField[] {
  const fields: ReplyProseField[] = [];
  const walk = (node: unknown, segments: readonly string[], path: readonly (string | number)[]): void => {
    if (segments.length === 0) {
      if (typeof node === "string") fields.push(Object.freeze({ path: Object.freeze([...path]), text: node }));
      return;
    }
    const [head, ...rest] = segments;
    if (head === "*") {
      if (Array.isArray(node)) node.forEach((element, index) => walk(element, rest, [...path, index]));
      return;
    }
    if (typeof node === "object" && node !== null && !Array.isArray(node) && Object.hasOwn(node, head!)) {
      walk((node as Record<string, unknown>)[head!], rest, [...path, head!]);
    }
  };
  for (const pattern of patterns) walk(value, pattern.split("."), []);
  return Object.freeze(fields);
}

/**
 * A step's language check, ready for its content classifier: the reply's prose at `patterns`, checked against the
 * question's language. The expectation is read once, from the question line the step was given.
 */
export function replyLanguageCheck(questionLine: string, patterns: readonly string[]): (value: unknown) => readonly ReplyLanguageIssue[] {
  const expected = replyLanguageExpectation(questionLine);
  return (value) => replyLanguageIssues(expected, replyProseFieldsAt(value, patterns));
}
