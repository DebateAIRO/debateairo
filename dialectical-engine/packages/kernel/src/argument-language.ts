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
  cs: ["a", "ale", "by", "byl", "byla", "je", "jsou", "když", "má", "měl", "měla", "nebo", "pro", "protože", "se", "že"],
  da: ["af", "at", "de", "den", "det", "en", "er", "for", "ikke", "med", "og", "på", "som", "til"],
  de: ["aber", "als", "das", "den", "der", "die", "ein", "eine", "für", "ist", "mit", "nicht", "sollte", "und", "weil", "zu"],
  en: ["and", "are", "because", "for", "from", "government", "it", "of", "should", "that", "the", "to", "when", "with"],
  es: ["de", "debería", "el", "en", "es", "la", "las", "los", "para", "porque", "que", "una", "y"],
  et: ["aga", "et", "ja", "kas", "kui", "ning", "on", "peaks", "sest", "see", "või"],
  fi: ["että", "ja", "jos", "koska", "kun", "mutta", "on", "pitäisi", "se", "tai", "voi"],
  fr: ["au", "aux", "car", "ce", "de", "des", "devrait", "est", "et", "ils", "la", "le", "les", "pour", "que", "sont", "une"],
  ga: ["agus", "an", "ar", "ba", "bheith", "chun", "go", "gur", "is", "le", "mar", "ní", "nó"],
  hr: ["ali", "bi", "da", "i", "ili", "je", "jer", "koji", "na", "se", "treba", "za"],
  hu: ["a", "az", "de", "egy", "és", "hogy", "is", "kell", "mert", "mint", "nem", "vagy"],
  id: ["adalah", "agar", "atau", "dan", "dari", "dengan", "harus", "karena", "lebih", "pemerintah", "untuk", "yang"],
  it: ["che", "città", "dei", "del", "della", "dovrebbe", "è", "gli", "i", "il", "la", "nel", "per", "perché", "una", "utile"],
  lt: ["ar", "bet", "dėl", "ir", "kad", "nes", "reikia", "su", "tai", "turėtų", "už"],
  lv: ["ar", "bet", "ir", "jo", "ka", "lai", "par", "tas", "un", "vai", "vajadzētu"],
  mt: ["għal", "għandu", "għax", "hija", "huwa", "iżda", "jew", "li", "ma", "u", "biex"],
  nl: ["als", "dat", "de", "een", "en", "het", "is", "maar", "met", "niet", "om", "omdat", "voor", "zou"],
  pl: ["aby", "czy", "dla", "i", "jest", "ma", "on", "państwo", "ponieważ", "powinno", "więcej", "w", "z", "że"],
  pt: ["a", "cidade", "de", "deveria", "e", "é", "em", "melhor", "o", "os", "para", "porque", "uma"],
  ro: ["ar", "ca", "care", "deoarece", "este", "mai", "mult", "nu", "pentru", "să", "și", "trebui", "un", "o"],
  sk: ["a", "aby", "ale", "by", "je", "mal", "mala", "má", "na", "pre", "pretože", "sa", "že"],
  sl: ["ali", "bi", "da", "in", "je", "ker", "na", "naj", "se", "za"],
  sv: ["att", "av", "de", "den", "det", "en", "för", "inte", "med", "och", "på", "ska", "som", "är"],
  tr: ["bir", "bu", "daha", "devlet", "halkın", "için", "ile", "mi", "mı", "ve", "yatırım", "yapmalı"],
  vi: ["các", "chính", "cho", "có", "của", "để", "không", "nên", "phủ", "và", "vì", "với"]
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
  hr: /[čćđšž]/u,
  hu: /[áéíóöőúüű]/u,
  it: /[àèéìíîòóù]/u,
  lt: /[ąčęėįšųūž]/u,
  lv: /[āčēģīķļņšūž]/u,
  mt: /[ċġgħħż]/u,
  nl: /ĳ/u,
  pl: /[ąćęłńóśźż]/u,
  pt: /[ãõç]/u,
  ro: /[ăâîșțşţ]/u,
  sk: /[áäčďéíľĺňóôŕšťúýž]/u,
  sl: /[čšž]/u,
  sv: /[åäö]/u,
  tr: /[çğıöşü]/u,
  vi: /[ăâđêôơư]/u
});

function detected(tag: KnownArgumentLanguageTag): ArgumentLanguageDetection {
  return Object.freeze({ tag, nameEn: LANGUAGE_NAMES[tag], confidence: "high" });
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function scriptDetection(text: string): ArgumentLanguageDetection | null {
  const totalLetters = countMatches(text, /\p{L}/gu);
  if (totalLetters === 0) return null;
  const share = (count: number): boolean => count / totalLetters >= 0.2;
  const count = (script: RegExp): number => countMatches(text, script);

  if (share(count(/\p{Script=Arabic}/gu))) return detected("ar");
  if (share(count(/\p{Script=Hebrew}/gu))) return detected("he");
  if (share(count(/\p{Script=Devanagari}/gu))) return detected("hi");
  if (share(count(/\p{Script=Hangul}/gu))) return detected("ko");

  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  if (kana > 0 && share(kana + han)) return detected("ja");
  if (share(han)) return detected("zh");
  if (share(count(/\p{Script=Greek}/gu))) return detected("el");

  const cyrillic = count(/\p{Script=Cyrillic}/gu);
  if (share(cyrillic)) {
    const lower = text.toLocaleLowerCase();
    if (/[їєґі]/u.test(lower)) return detected("uk");
    if (/ъ/u.test(lower)) return detected("bg");
    return detected("ru");
  }
  return null;
}

function latinDetection(text: string): ArgumentLanguageDetection {
  const normalized = text.normalize("NFC").toLocaleLowerCase();
  const words = normalized.match(/\p{Script=Latin}+/gu) ?? [];
  if (words.length < 4) return FALLBACK;

  const scored = Object.entries(LATIN_FUNCTION_WORDS)
    .filter(([, functionWords]) => functionWords.length > 0)
    .map(([tag, functionWords]) => {
      const vocabulary = new Set(functionWords);
      const functionScore = words.reduce((score, word) => score + (vocabulary.has(word) ? 1 : 0), 0);
      const markerScore = LATIN_MARKERS[tag as KnownArgumentLanguageTag]?.test(normalized) === true ? 2 : 0;
      return { tag: tag as KnownArgumentLanguageTag, score: functionScore + markerScore };
    })
    .sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag));
  const winner = scored[0];
  const runnerUp = scored[1];
  if (winner === undefined || winner.score < 3 || winner.score <= (runnerUp?.score ?? 0)) return FALLBACK;
  return detected(winner.tag);
}

/**
 * Detects the language a debate should be argued in without consulting a model.
 * Script evidence wins first; Latin-script claims use conservative function-word
 * scoring and fall back rather than allowing a weak guess to override the claim.
 */
export function detectArgumentLanguage(text: string): ArgumentLanguageDetection {
  return scriptDetection(text) ?? latinDetection(text);
}

export function argumentLanguageDirective(name: string): string {
  const language = name.trim() || FALLBACK.nameEn;
  return `Write every natural-language field in ${language}. Keep JSON keys and enum tokens in English exactly as specified.`;
}
