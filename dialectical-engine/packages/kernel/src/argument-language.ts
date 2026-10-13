export type ArgumentLanguageConfidence = "high" | "low";

export interface ArgumentLanguageDetection {
  readonly tag: string;
  readonly nameEn: string;
  readonly confidence: ArgumentLanguageConfidence;
}

const FALLBACK = Object.freeze({
  tag: "und",
  nameEn: "the same language as the question",
  confidence: "low"
} as const);

const LANGUAGE_NAMES = Object.freeze({
  ar: "Arabic",
  bg: "Bulgarian",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  et: "Estonian",
  fi: "Finnish",
  fr: "French",
  ga: "Irish",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  lt: "Lithuanian",
  lv: "Latvian",
  mt: "Maltese",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  sl: "Slovenian",
  sv: "Swedish",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese"
} as const);

type KnownArgumentLanguageTag = keyof typeof LANGUAGE_NAMES;

const LATIN_FUNCTION_WORDS: Readonly<Record<KnownArgumentLanguageTag, readonly string[]>> = Object.freeze({
  ar: [], bg: [], el: [], he: [], hi: [], ja: [], ko: [], ru: [], uk: [], zh: [],
  cs: ["a", "ale", "by", "byl", "byla", "je", "jsou", "když", "má", "měl", "měla", "měli", "mělo", "mohou", "nebo", "pro", "protože", "se", "své", "že"],
  da: ["af", "at", "bør", "de", "den", "det", "en", "er", "for", "fordi", "ikke", "kan", "med", "når", "og", "på", "som", "til"],
  de: ["aber", "als", "das", "den", "der", "die", "ein", "eine", "für", "ist", "kann", "können", "mit", "nicht", "sollte", "sollten", "und", "weil", "wenn", "zu"],
  en: ["and", "are", "be", "because", "been", "can", "could", "does", "for", "from", "government", "has", "have", "if", "it", "its", "more", "not", "of", "or", "should", "than", "that", "the", "their", "these", "they", "this", "to", "when", "which", "will", "with", "would"],
  es: ["al", "como", "con", "cuando", "de", "debería", "deberían", "el", "en", "es", "la", "las", "los", "más", "para", "por", "porque", "pueden", "que", "si", "sus", "una", "y"],
  et: ["aga", "et", "ja", "kas", "kui", "ning", "oma", "on", "peaks", "peaksid", "saavad", "see", "sest", "seal", "või"],
  fi: ["että", "ja", "jos", "koska", "kun", "mutta", "ne", "on", "pitäisi", "se", "tai", "voi", "voivat"],
  fr: ["au", "aux", "bien", "car", "ce", "de", "des", "devrait", "devraient", "elle", "elles", "est", "et", "ils", "la", "le", "les", "leurs", "lorsque", "peu", "peuvent", "pour", "que", "sont", "une"],
  ga: ["agus", "an", "ar", "ba", "bheith", "cheart", "chun", "don", "féidir", "gan", "go", "gur", "is", "le", "mar", "mórán", "ní", "nó", "nuair", "siad"],
  hr: ["ali", "bi", "dobro", "ili", "je", "jer", "kada", "koji", "mogu", "od", "ona", "svoje", "trebala", "trebali", "uz"],
  hu: ["a", "az", "de", "egy", "és", "ha", "hogy", "is", "kell", "mert", "mint", "nem", "ott", "vagy"],
  id: ["adalah", "agar", "atau", "dan", "dapat", "dari", "dengan", "harus", "ini", "karena", "ketika", "lebih", "mereka", "pemerintah", "untuk", "yang"],
  it: ["che", "città", "dei", "del", "della", "dovrebbe", "dovrebbero", "è", "gli", "i", "il", "la", "loro", "nel", "per", "perché", "possono", "propri", "quando", "una", "utile"],
  lt: ["ar", "bet", "dėl", "gali", "iš", "ir", "ji", "jos", "kad", "kai", "nes", "reikia", "savo", "su", "tai", "turėtų", "už"],
  lv: ["ar", "bet", "ir", "ja", "jo", "ka", "lai", "no", "par", "savus", "tas", "tā", "tur", "un", "vai", "vajadzētu", "var"],
  mt: ["biex", "dawn", "din", "għal", "għandha", "għandu", "għax", "hija", "huwa", "iżda", "jew", "li", "ma", "meta", "min", "jistgħu", "u"],
  nl: ["als", "daar", "dat", "de", "die", "een", "en", "goed", "het", "hun", "is", "kan", "kunnen", "maar", "met", "moet", "moeten", "niet", "om", "omdat", "voor", "wanneer", "zou"],
  pl: ["aby", "czy", "dla", "dobrze", "gdy", "i", "jest", "ma", "mogą", "na", "on", "ona", "państwo", "ponieważ", "powinien", "powinna", "powinni", "powinno", "przy", "swoje", "w", "więcej", "z", "że"],
  pt: ["a", "cidade", "com", "conseguem", "de", "deveria", "deveriam", "e", "é", "ela", "eles", "em", "o", "os", "para", "porque", "quando", "uma"],
  ro: ["acest", "această", "ar", "atunci", "ca", "că", "care", "când", "cu", "dar", "deoarece", "este", "fi", "în", "lor", "mai", "mult", "nu", "pe", "pentru", "pot", "prin", "sau", "să", "și", "sunt", "trebui", "un", "o", "vă"],
  sk: ["a", "aby", "ale", "by", "dobre", "dokážu", "je", "keď", "mal", "mala", "mali", "malo", "má", "môžu", "na", "pre", "pretože", "sa", "svoje", "že"],
  sl: ["ali", "bi", "da", "doma", "dobro", "in", "je", "kadar", "ker", "lahko", "malo", "morala", "morali", "na", "naj", "ona", "se", "svoje", "v", "z", "za"],
  sv: ["att", "av", "bör", "de", "den", "det", "där", "eftersom", "en", "för", "inte", "kan", "med", "när", "och", "på", "sina", "ska", "som", "väl", "är"],
  tr: ["bir", "bu", "çünkü", "daha", "devlet", "düşük", "halkın", "için", "ile", "iyi", "mi", "mı", "ve", "yatırım", "yapmalı"],
  vi: ["các", "chính", "cho", "có", "của", "để", "khi", "không", "này", "nên", "phủ", "và", "vì", "với"]
});

const LATIN_MARKERS: Readonly<Partial<Record<KnownArgumentLanguageTag, RegExp>>> = Object.freeze({
  cs: /[ěščřžýáíéůťďň]/u,
  da: /[æøå]/u,
  de: /[äöüß]/u,
  es: /[ñ¿¡]/u,
  et: /[õäöü]/u,
  fi: /[äö]/u,
  fr: /[àâçéèêëîïôùûüÿœ]/u,
  ga: /[áéíóú]/u,
  hr: /[ćđ]/u,
  hu: /[áéíóöőúüű]/u,
  it: /[àèéìíîòóù]/u,
  lt: /[ąčęėįšųūž]/u,
  lv: /[āčēģīķļņšūž]/u,
  mt: /[ċġħż]/u,
  nl: /ĳ/u,
  pl: /[ąćęłńóśźż]/u,
  pt: /[ãõç]/u,
  ro: /[ăâîșțşţ]/u,
  sk: /[áäčďéíľĺňóôŕšťúýž]/u,
  sv: /[åäö]/u,
  tr: /[çğıöşü]/u,
  vi: /[ăâđêôơư]/u
});

const LATIN_ENDINGS: Readonly<Partial<Record<KnownArgumentLanguageTag, readonly RegExp[]>>> = Object.freeze({
  cs: [/(?:ého|ích|ými|ovat|ují)$/u, /(?:nost|nosti|telé)$/u],
  da: [/(?:erne|ende|hed|ligt)$/u, /(?:ere|erne|ninger)$/u],
  de: [/(?:keit|heit|lich|ung|ungen)$/u, /(?:ieren|ische|ischen)$/u],
  et: [/(?:mine|mise|vad|takse)$/u, /(?:lt|ga|le|st)$/u],
  fi: [/(?:minen|misen|vat|vät)$/u, /(?:lla|llä|sta|stä|ssa|ssä)$/u],
  hr: [/(?:anje|enje|irati|avaju)$/u, /(?:cima|ovima|stvu)$/u],
  id: [/(?:kan|nya|lah)$/u, /(?:itas|asi)$/u],
  nl: [/(?:baar|heid|lijk)$/u, /(?:eren|ingen)$/u],
  pl: [/(?:ować|ują|enie|ności)$/u, /(?:ami|owego|ych)$/u],
  sk: [/(?:osť|osti|ovať|ujú)$/u, /(?:ého|ými|ateľ)$/u],
  sl: [/(?:anje|enje|ovati|ujejo)$/u, /(?:ljajo|ostjo|alci)$/u],
  sv: [/(?:ande|arna|erna|heten)$/u, /(?:ligt|ning|ningar)$/u],
  tr: [/(?:malı|meli|dır|dir|yor)$/u, /(?:ları|leri|ken)$/u]
});

/**
 * The letters beyond a-z each Latin-script language writes in its own lowercase words (a capitalised word is a name,
 * and names keep their own spelling: "Łódź" in an English reply is fine). English and Indonesian write none.
 */
const LATIN_ALPHABET_EXTRAS: Readonly<Record<string, string>> = Object.freeze({
  ca: "àçéèíïòóúü", cs: "áčďéěíňóřšťúůýž", da: "åæéø", de: "äéöüß", en: "", es: "áéíñóúü", et: "äõöüšž", fi: "äåöšž",
  fr: "àâæçéèêëîïôœùûüÿ", ga: "áéíóú", hr: "čćđšž", hu: "áéíóöőúüű", id: "", it: "àèéìíîòóù",
  lt: "ąčęėįšųūž", lv: "āčēģīķļņšūž", mt: "àèìòùċġħż", nl: "áéèëíïóöúü", pl: "ąćęłńóśźż",
  pt: "áâãàçéêíóôõú", ro: "ăâîșțşţ", sk: "áäčďéíĺľňóôŕšťúýž", sl: "čšž", sv: "åäéö", tr: "âçğıîöşüû",
  vi: "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
});
/**
 * How many letters of `text`'s lowercase Latin words `tag`'s language never writes (`LATIN_ALPHABET_EXTRAS`): ă, ș or ț
 * in a French reading, ř or ě in a Slovak one. Capitalised words are names and keep their own spelling; a letter run
 * touching a digit is a code, not a word. Zero for a tag with no Latin alphabet on record.
 */
export function foreignLatinLetterCount(text: string, tag: string): number {
  const alphabet = LATIN_ALPHABET_EXTRAS[tag];
  if (alphabet === undefined) return 0;
  const lowercaseWords = text.normalize("NFC").match(/(?<![\p{L}\p{M}\p{N}])\p{Ll}[\p{L}\p{M}]*(?![\p{L}\p{M}\p{N}])/gu) ?? [];
  return lowercaseWords.reduce((n, word) => n + [...word].filter((letter) =>
    /\p{Script=Latin}/u.test(letter) && !/[a-z]/u.test(letter) && !alphabet.includes(letter)).length, 0);
}

function detected(tag: KnownArgumentLanguageTag): ArgumentLanguageDetection {
  return Object.freeze({ tag, nameEn: LANGUAGE_NAMES[tag], confidence: "high" });
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function hasAtLeastWords(
  text: string,
  wordPattern: RegExp,
  evidence: readonly string[],
  minimum: number
): boolean {
  const words = new Set(text.match(wordPattern) ?? []);
  return evidence.reduce((score, word) => score + (words.has(word) ? 1 : 0), 0) >= minimum;
}

function hasAtLeastSignals(text: string, evidence: readonly RegExp[], minimum: number): boolean {
  return evidence.reduce((score, signal) => score + (signal.test(text) ? 1 : 0), 0) >= minimum;
}

function isAllCapsClaim(text: string): boolean {
  const casedLetters = (text.match(/\p{L}/gu) ?? [])
    .filter((letter) => letter.toLocaleLowerCase("en-US") !== letter.toLocaleUpperCase("en-US"))
    .join("");
  return casedLetters.length > 0
    && casedLetters === casedLetters.toLocaleUpperCase("en-US");
}

function scriptDetection(text: string): ArgumentLanguageDetection | null {
  const totalLetters = countMatches(text, /\p{L}/gu);
  if (totalLetters < 12) return null;
  const isMajority = (count: number): boolean => count * 2 > totalLetters;
  const count = (script: RegExp): number => countMatches(text, script);
  const lower = text.toLocaleLowerCase("en-US");

  if (isMajority(count(/\p{Script=Arabic}/gu))) {
    const hasPersianOrUrduMarker = /[گچپژٹڈھںے]/u.test(lower);
    return !hasPersianOrUrduMarker && hasAtLeastWords(
      lower,
      /[\p{Script=Arabic}\p{M}]+/gu,
      ["هل", "يجب", "ينبغي", "لأن", "لأنه", "على", "من", "أن", "إن", "في", "إلى", "هذا", "هذه", "الذي", "التي"],
      2
    ) ? detected("ar") : FALLBACK;
  }
  if (isMajority(count(/\p{Script=Hebrew}/gu))) return detected("he");
  if (isMajority(count(/\p{Script=Devanagari}/gu))) {
    const marathiEvidence = [/वरील/u, /ावे(?:\s|$)/u, /आहे/u, /आणि/u, /पाहिजे/u, /सरकारने/u];
    const nepaliEvidence = [/को(?:\s|$)/u, /पर्छ/u, /लाई/u, /सरकारले/u, /छ(?:\s|$)/u, /किनकि/u];
    return hasAtLeastSignals(lower, marathiEvidence, 2)
      || hasAtLeastSignals(lower, nepaliEvidence, 2)
      ? FALLBACK
      : detected("hi");
  }
  if (isMajority(count(/\p{Script=Hangul}/gu))) return detected("ko");

  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  if (kana > 0 && isMajority(kana + han)) return detected("ja");
  if (isMajority(han)) return detected("zh");
  if (isMajority(count(/\p{Script=Greek}/gu))) return detected("el");

  const cyrillic = count(/\p{Script=Cyrillic}/gu);
  if (isMajority(cyrillic)) {
    const cyrillicWords = /\p{Script=Cyrillic}+/gu;
    const hasUkrainianInventory = /[їєґі]/u.test(lower);
    if (hasUkrainianInventory && hasAtLeastWords(
      lower,
      cyrillicWords,
      ["чи", "має", "держава", "уряд", "більше", "інвестувати", "громадський", "повинен", "повинні", "щоб", "бо", "вони", "коли", "можуть", "свої", "вдома", "вона", "для"],
      2
    )) return detected("uk");
    if (/[ђћџјљњѓќѕўәғқңөұүһіӣӯҷ]/u.test(lower)) return FALLBACK;
    if (!/[ыэё]/u.test(lower) && hasAtLeastWords(
      lower,
      cyrillicWords,
      ["трябва", "следва", "държавата", "правителството", "работодателите", "повече", "обществения", "понеже", "защото", "когато", "могат", "хората", "тя", "намали", "намалява"],
      3
    )) return detected("bg");
    if (hasAtLeastWords(
      lower,
      cyrillicWords,
      ["должен", "должна", "должно", "должны", "государство", "государству", "правительство", "работодатели", "следует", "отменить", "больше", "общественный", "чтобы", "когда", "могут", "свои", "потому", "что", "они", "она", "ли", "так", "как"],
      3
    )) return detected("ru");
    return FALLBACK;
  }
  return null;
}

/**
 * Question language (2026-10-13): a language whose alphabet lacks letters the claim writes in its own lowercase words
 * (`foreignLatinLetterCount`) is not the claim's: one such letter costs it its marker, two rule it out. On the site's
 * translated legal pages this stopped Romanian being read as French (they share î and â, "de", "la" and "au") and
 * Czech or Croatian as Slovak.
 */
const MAX_FOREIGN_LETTERS = 1;

/**
 * A close sibling outside the interface languages, scored only so it can hold its neighbours back: Catalan shares
 * Spanish's alphabet and half its small words, so once French and Italian are ruled out by the letters ó and ú a
 * Catalan claim would read as Spanish. When the sibling wins, or comes within the margin, the claim falls back.
 */
const SIBLING_FUNCTION_WORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ca: ["aquest", "aquesta", "amb", "dels", "els", "és", "fer", "hauria", "haurien", "més", "molt", "pel", "per", "perquè", "seu", "seva", "també"]
});

function latinDetection(text: string): ArgumentLanguageDetection {
  const normalized = text.normalize("NFC").toLocaleLowerCase("en-US");
  const words = normalized.match(/\p{Script=Latin}+/gu) ?? [];
  if (words.length < 3) return FALLBACK;

  const scored = [...Object.entries(LATIN_FUNCTION_WORDS), ...Object.entries(SIBLING_FUNCTION_WORDS)]
    .filter(([, functionWords]) => functionWords.length > 0)
    .filter(([tag]) => foreignLatinLetterCount(text, tag) <= MAX_FOREIGN_LETTERS)
    .map(([tag, functionWords]) => {
      const vocabulary = new Set(functionWords);
      const functionScore = words.reduce((score, word) => score + (vocabulary.has(word) ? 1 : 0), 0);
      const markerScore = LATIN_MARKERS[tag as KnownArgumentLanguageTag]?.test(normalized) === true
        && foreignLatinLetterCount(text, tag) === 0 ? 2 : 0;
      const endingScore = Math.min(2, (LATIN_ENDINGS[tag as KnownArgumentLanguageTag] ?? [])
        .reduce((score, ending) => score + (words.some((word) => ending.test(word)) ? 1 : 0), 0));
      return {
        tag: tag as KnownArgumentLanguageTag,
        functionScore,
        markerScore,
        score: functionScore + markerScore + endingScore
      };
    })
    .sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag));
  const winner = scored[0];
  const runnerUp = scored[1];
  if (winner === undefined
    || Object.hasOwn(SIBLING_FUNCTION_WORDS, winner.tag)
    || winner.score < 3
    || (winner.markerScore === 2 && winner.score - winner.markerScore < 2)
    || winner.score < (runnerUp?.score ?? 0) + 2) return FALLBACK;
  return detected(winner.tag);
}

// Each opening quotation mark and the marks that close it („ closes with “ or ”).
const QUOTATION_CLOSERS: Readonly<Record<string, string>> = Object.freeze({
  "«": "»", "„": "“”", "“": "”", "‘": "’", "‹": "›", "「": "」", "『": "』", "\"": "\""
});

/**
 * Blanks every quoted span to one space, so only the claim's own words are scored.
 * It blanks exactly what `text.replace(/«[^»]*»|„[^“”]*[“”]|“[^”]*”|‘[^’]*’|‹[^›]*›|「[^」]*」|『[^』]*』|"[^"]*"/gu, " ")`
 * blanks, in one left-to-right pass: an opener's nearest closer is looked up once and
 * reused until the scan passes it, so a long run of unclosed openers costs linear time
 * where that pattern costs quadratic time (CodeQL js/polynomial-redos). Exported for its test.
 */
export function matrixClause(text: string): string {
  const nearestCloser = new Map<string, number>();
  const parts: string[] = [];
  let kept = 0;
  let at = 0;
  while (at < text.length) {
    const opener = text[at]!;
    const closers = QUOTATION_CLOSERS[opener];
    if (closers === undefined) {
      at += 1;
      continue;
    }
    let closer = nearestCloser.get(opener);
    if (closer === undefined || (closer !== -1 && closer <= at)) {
      closer = -1;
      for (let index = at + 1; index < text.length; index += 1) {
        if (closers.includes(text[index]!)) {
          closer = index;
          break;
        }
      }
      nearestCloser.set(opener, closer);
    }
    if (closer === -1) {
      at += 1;
      continue;
    }
    parts.push(text.slice(kept, at), " ");
    kept = closer + 1;
    at = closer + 1;
  }
  parts.push(text.slice(kept));
  return parts.join("");
}

/**
 * Detects the language a debate should be argued in without consulting a model.
 * Script evidence wins first; Latin-script claims use conservative function-word
 * scoring and fall back rather than allowing a weak guess to override the claim.
 */
export function detectArgumentLanguage(text: string): ArgumentLanguageDetection {
  const matrix = matrixClause(text);
  if (isAllCapsClaim(matrix)) return FALLBACK;
  return scriptDetection(matrix) ?? latinDetection(matrix);
}

/**
 * Reply language (owner approval 2026-10-12): a named language is called the question's, and every language holds
 * where the material quotes another one; the fallback already says "the same language as the question".
 */
export function argumentLanguageDirective(name: string): string {
  const language = name.trim() || FALLBACK.nameEn;
  const named = language === FALLBACK.nameEn ? `${language},` : `${language}, the language of the question,`;
  return `Write every natural-language field in ${named} even where the material quotes another language. Keep JSON keys, enum tokens, JSON literals (null, true, false), and identifier-shaped values (including claim_type, basis, outcome, fatalFlags[].type, segment_id, node_refs, and served_number_refs) in English exactly as specified; never translate an identifier or literal.`;
}
