#!/usr/bin/env node
// S01-C02 · mail salad gate (PLAN C02.1). The value rule is the reference rule commands/auth_copy_rule.py, reproduced rule for
// rule: D-75 as amended by D-91 and D-94. C02.sh requires this file's FLOOR_MAX to equal the reference's within 0.001.
//   node scripts/mail-salad-check.mjs --locale <cc> [--root <dir>] [--en-root <dir>]        exit 0 PASS · 1 FAIL · 2 usage
//   node scripts/mail-salad-check.mjs --measure <cc,...> [--root <dir>] [--en-root <dir>]   prints FLOOR_MAX; exit 0
//   node scripts/mail-salad-check.mjs --all [--root <dir>] [--en-root <dir>]                the 34 catalogue locales
// --root defaults to the repository this file sits in; --en-root defaults to --root. The fixtures pass both.
//
// Readings of the packet, stated so a reviewer can check them.
//  - (b), (c), (d) run over the auth.* keys of en. (b) compares placeholders as a sorted list (a repeated one must repeat).
//  - (d) skips the product terms of the locale (F-C): an English content word counts as the locale's own term when the
//    locale's UI catalogue (apps/ui/messages/<cc>/*.json, placeholders excluded) uses it in at least PRODUCT_TERM_MIN_STRINGS
//    strings. The measure ignores product terms, so FLOOR_MAX stays the reference's.
//  - (e) and (f) read the version line with the legal generator's own parser (parseLegalChrome, parseSections, parsePreamble of
//    apps/ui/scripts/generate-legal-data.mjs): a line the generator cannot parse, or a version other than 3.4 or 2.3, fails.
//  - (e) and (g) fail the pre-3.4 purpose text of each locale (PRE_3_4_PURPOSE, read from the base commit): "differs from
//    English" alone let the 3.3 translation pass.
//  - (f) the §17 pointer is the sentence that names Privacy Policy section 13: the section must contain the number 13 (base §17
//    contains none) and must not repeat the English sentence that names it.
//  - An empty auth value is a class (a) failure; an en file with no auth.* key fails rather than passing on empty sets.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLegalChrome, parseSections, parsePreamble } from "../apps/ui/scripts/generate-legal-data.mjs";

export const R29 = Object.freeze(["Dialectical Engine", "DebateAI", "dezbatere.ro", "PLUS", "PRO", "MAX"]);
export const FLOOR = 0.1;
// The 34 catalogue locales other than en. Hardcoded so a missing locale directory is a FAIL, never a silent cap.
export const CATALOGUE_LOCALES = Object.freeze(
  "bg hr cs da nl et fi fr de el hu ga it lv lt mt pl pt ro ru sk sl es sv uk zh hi id ja ko vi ar he tr".split(" ")
);
// F-C. An English content word that a locale's own product UI uses is that locale's product term, not English survival.
// The grants are the words the translation seats were forced to reword. Each is backed by its placeholder-free count in the
// locale's UI catalogue (apps/ui/messages/<cc>/*.json): de code 27, de link 40, de passkey 12, fr codes 17. A grant needs at
// least PRODUCT_TERM_MIN_STRINGS strings there, and checkLocale fails a grant that does not have them. The full sweep (every
// English auth word against every UI catalogue, 241 locale-word pairs at ten strings) was rejected: most pairs are ordinary
// words of the target language (plan, debate, data, text), which English survival must keep counting.
export const PRODUCT_TERM_MIN_STRINGS = 10;
export const PRODUCT_TERMS = Object.freeze({ de: Object.freeze(["code", "link", "passkey"]), fr: Object.freeze(["codes"]) });
// The Privacy Policy §13 cookie purpose of each locale as it stood at the base commit (3.3), before the 3.4 text. Identical in
// the cookie table and in apps/ui/messages/<cc>/legal.json at base for all 34 locales; a 3.4 translation must differ from it.
export const PRE_3_4_PURPOSE = Object.freeze({
  "bg": "Запомня избрания от Вас език на интерфейса.",
  "hr": "Pamti jezik sučelja koji ste odabrali.",
  "cs": "Pamatuje si, jaký jazyk rozhraní jste zvolili.",
  "da": "Husker det brugerfladesprog, du har valgt.",
  "nl": "Onthoudt de interfacetaal die u hebt gekozen.",
  "et": "Jätab meelde teie valitud liidese keele.",
  "fi": "Muistaa valitsemasi käyttöliittymän kielen.",
  "fr": "Mémorise la langue d’interface que vous avez choisie.",
  "de": "Speichert die von Ihnen gewählte Sprache der Benutzeroberfläche.",
  "el": "Θυμάται τη γλώσσα διεπαφής που επιλέξατε.",
  "hu": "Megjegyzi, milyen nyelvű felületet választott.",
  "ga": "Meabhraíonn sé teanga an chomhéadain a roghnaigh tú.",
  "it": "Ricorda la lingua dell’interfaccia che hai scelto.",
  "lv": "Atceras jūsu izvēlēto saskarnes valodu.",
  "lt": "Įsimena jūsų pasirinktą sąsajos kalbą.",
  "mt": "Tiftakar il-lingwa tal-interfaċċja li għażilt.",
  "pl": "Zapamiętuje wybrany przez Ciebie język interfejsu.",
  "pt": "Memoriza o idioma da interface que escolheu.",
  "ro": "Reține limba interfeței pe care ați ales-o.",
  "ru": "Запоминает выбранный вами язык интерфейса.",
  "sk": "Pamätá si, aký jazyk rozhrania ste si zvolili.",
  "sl": "Zapomni si jezik vmesnika, ki ste ga izbrali.",
  "es": "Recuerda el idioma de la interfaz que ha elegido.",
  "sv": "Kommer ihåg vilket gränssnittsspråk du har valt.",
  "uk": "Запам’ятовує вибрану вами мову інтерфейсу.",
  "zh": "记住您选择的界面语言。",
  "hi": "आपके द्वारा चुनी गई इंटरफ़ेस की भाषा याद रखती है।",
  "id": "Mengingat bahasa antarmuka yang Anda pilih.",
  "ja": "お客様が選択したインターフェース言語を記憶します。",
  "ko": "귀하가 선택한 인터페이스 언어를 기억합니다.",
  "vi": "Ghi nhớ ngôn ngữ giao diện bạn đã chọn.",
  "ar": "يتذكّر لغة الواجهة التي اخترتها.",
  "he": "זוכרת את שפת הממשק שבחרתם.",
  "tr": "Seçtiğiniz arayüz dilini hatırlar."
});
// Identical to the STOP list of salad-check.mjs:10 in the i18n worktree, and to auth_copy_rule.py:27-31.
const STOP = new Set(
  (
    "mfa totp httponly cookie cookies gdpr debateai debateairo api email json html http https v3 v2 null true false " +
    "register tier tiers free pro plus team id url css utc iso pdf csv markdown argon2 rss sha hmac postgres hatchet " +
    "anspdcp openai anthropic google gemini claude grok gpt llm runner token tokens terracotta"
  ).split(/\s+/u)
);
const PLACEHOLDER = /\{[^}]+\}/g;
const URL_TOKEN = /https?:\/\/\S+/g;
const EMAIL_TOKEN = /\S+@\S+/g;
const DIGIT_TOKEN = /\S*\p{Nd}\S*/gu;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const R29_PATTERNS = R29.map((token) => new RegExp(`(?<![A-Za-z])${escapeRegExp(token)}(?![A-Za-z])`, "g"));
const words = (text) => text.split(/\s+/u).filter((word) => word !== "");
const EMPTY_TERMS = new Set();
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COOKIE_NAME = "debateai.locale";
const COOKIE_PURPOSE_KEY = "legal.cookies.locale.purpose";
const PP13_KINDS = Object.freeze(["p", "table", "p", "p", "p", "p"]);
const SECTION_NUMBER_13 = /(?<!\d)13(?!\d)/;

/** Placeholders, URLs, e-mail addresses, tokens with digits and the R-29 tokens go before any comparison (D-75). */
export function stripAll(text) {
  let out = text.replace(PLACEHOLDER, " ").replace(URL_TOKEN, " ").replace(EMAIL_TOKEN, " ").replace(DIGIT_TOKEN, " ");
  for (const pattern of R29_PATTERNS) out = out.replace(pattern, " ");
  return words(out).join(" ");
}

/** The English content words: ASCII runs of four or more letters, not in the STOP list. Duplicates are kept (D-75).
 *  A run that touches a letter or digit of another script is not one: pt "cancelá" is not "cancel" (F-T). */
export function contentWords(text) {
  return (text.toLowerCase().match(/(?<![\p{L}\p{N}_])[a-z][a-z'-]{3,}(?![\p{L}\p{N}_])/gu) ?? []).filter((word) => !STOP.has(word));
}

/** N12 (D-94): case and punctuation folded, no R-29 strip. Letters and digits of any script are kept. */
export function fold(text) {
  return words(text.replace(/[^\p{L}\p{N}_\s]/gu, " ").toLowerCase()).join(" ");
}

/** The value rule. productTerms are the locale's own product words: they do not count as English survival (F-C). */
export function verdictFor(english, value, productTerms = EMPTY_TERMS) {
  const e = stripAll(english);
  const t = stripAll(value);
  if (e === t && words(t).length >= 1) {
    return { verdict: "FAIL", clause: "c", why: "identical to English after the R-29 strip" };
  }
  if (fold(english) === fold(value) && words(fold(value)).length >= 1) {
    return { verdict: "FAIL", clause: "c", why: "identical to English after case and punctuation folding (N12: no strip)" };
  }
  const englishWords = contentWords(e).filter((word) => !productTerms.has(word));
  if (englishWords.length < 2) {
    return { verdict: "PASS", clause: null, why: "survival skipped (fewer than 2 English content words)" };
  }
  const kept = new Set(contentWords(t));
  const survival = englishWords.filter((word) => kept.has(word)).length / englishWords.length;
  if (survival > FLOOR) {
    return { verdict: "FAIL", clause: "d", why: `survival ${survival.toFixed(3)} > floor ${FLOOR}` };
  }
  return { verdict: "PASS", clause: null, why: `survival ${survival.toFixed(3)}` };
}

/** The number of strings in a locale's UI catalogue (apps/ui/messages/<cc>/*.json) that use `word` as a whole token. */
export function uiStringCount(root, cc, word) {
  const dir = join(root, "apps/ui/messages", cc);
  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return 0;
  }
  let count = 0;
  const visit = (value) => {
    if (typeof value === "string") {
      const tokens = value.replace(PLACEHOLDER, " ").toLowerCase().split(/[^\p{L}\p{N}']+/u);
      if (tokens.includes(word)) count += 1;
    } else if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) visit(child);
    }
  };
  for (const file of files) visit(JSON.parse(readFileSync(join(dir, file), "utf8")));
  return count;
}

/** The granted product terms of one locale (F-C). */
export function productTermsFor(cc) {
  return new Set(PRODUCT_TERMS[cc] ?? []);
}

const mailPath = (cc) => `packages/mail-templates/messages/${cc}/mail.json`;
const ppPath = (cc) => `apps/ui/legal/${cc}/privacy-policy.md`;
const tosPath = (cc) => `apps/ui/legal/${cc}/terms-of-service.md`;
const legalJsonPath = (cc) => `apps/ui/messages/${cc}/legal.json`;

/** The body between `## <from>.` and `## <to>.` (the PP §13 and the Terms §17 conventions), or null. */
export function sectionOf(markdown, from, to) {
  return new RegExp(`^## ${from}\\..*$([\\s\\S]*?)^## ${to}\\.`, "m").exec(markdown)?.[1] ?? null;
}

/** Section body to blocks: a run of pipe lines is one table, a blank-line-separated run of other lines one paragraph.
 *  Mirrors the blocks() of tests/unit/privacy-policy-cookie-table.test.ts:34-50. */
export function blocksOf(section) {
  const out = [];
  let current = [];
  let currentKind = null;
  for (const line of [...section.split("\n"), ""]) {
    const trimmed = line.trim();
    const kind = trimmed.startsWith("|") ? "table" : trimmed === "" ? null : "p";
    if (kind !== currentKind || kind === null) {
      if (currentKind !== null && current.length > 0) out.push({ kind: currentKind, text: current.join("\n") });
      current = kind === null ? [] : [line];
      currentKind = kind;
    } else {
      current.push(line);
    }
  }
  return out;
}

/** The purpose cell (third column) of the table row whose name cell is `name` (backticks ignored), or null. */
export function purposeCell(blockList, name) {
  const table = blockList.find((block) => block.kind === "table");
  if (!table) return null;
  for (const line of table.text.split("\n")) {
    const cells = line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
    if ((cells[0] ?? "").replaceAll("`", "") === name) return cells[2] ?? null;
  }
  return null;
}

/** The sentences of a section: a split after . ! ? only when whitespace follows, so "dezbatere.ro/privacy" stays whole.
 *  A period after a digit is an ordinal or a date ("section 13. ..."), not the end of a sentence (F-S). */
export function sentencesOf(section) {
  return section.split(/(?<=(?<!\d)[.!?])\s+/u).map((part) => part.trim()).filter((part) => part !== "");
}

/** The version the legal generator reads from a draft, or a problem when it cannot read one. */
function versionOf(markdown, problems, label, want) {
  let parsed;
  try {
    parsed = parsePreamble(parseSections(parseLegalChrome(markdown).markdown).preamble);
  } catch (error) {
    problems.push(`${label}: the legal generator cannot parse the version line (${error.message})`);
    return;
  }
  if (parsed.version !== want) problems.push(`${label} version is ${parsed.version}, want ${want}`);
}

const placeholdersOf = (text) => (text.match(PLACEHOLDER) ?? []).slice().sort();

function tryRead(base, rel, problems, label) {
  try {
    return readFileSync(join(base, rel), "utf8");
  } catch (error) {
    problems.push(`${label} unreadable: ${rel} (${error.code ?? error.message})`);
    return null;
  }
}

function tryJson(base, rel, problems, label) {
  const text = tryRead(base, rel, problems, label);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    problems.push(`${label} is not JSON: ${rel}`);
    return null;
  }
}

/** The gate for one locale: classes (a) to (g) of PLAN C02.1. Returns every problem, each prefixed by its class letter. */
export function checkLocale({ root, enRoot = root, cc }) {
  const problems = [];
  const productTerms = productTermsFor(cc);
  for (const word of productTerms) {
    const strings = uiStringCount(root, cc, word);
    if (strings < PRODUCT_TERM_MIN_STRINGS) {
      problems.push(`(d) ${cc} product term ${word} has ${strings} UI strings, want ${PRODUCT_TERM_MIN_STRINGS}`);
    }
  }

  // (a)-(d): the auth.* copy, key by key.
  const englishMail = tryJson(enRoot, mailPath("en"), problems, "(a) en");
  const localeMail = tryJson(root, mailPath(cc), problems, `(a) ${cc}`);
  if (englishMail && localeMail) {
    const englishKeys = Object.keys(englishMail).filter((key) => key.startsWith("auth.")).sort();
    const localeKeys = Object.keys(localeMail).filter((key) => key.startsWith("auth.")).sort();
    if (englishKeys.length === 0) problems.push("(a) en/mail.json holds no auth.* key, so the gate has nothing to check");
    for (const key of englishKeys) {
      if (!(key in localeMail)) {
        problems.push(`(a) ${cc} lacks auth key ${key}`);
        continue;
      }
      const value = localeMail[key];
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`(a) ${cc} ${key} is empty or not a string`);
        continue;
      }
      const englishPlaceholders = placeholdersOf(englishMail[key]);
      const localePlaceholders = placeholdersOf(value);
      if (JSON.stringify(englishPlaceholders) !== JSON.stringify(localePlaceholders)) {
        problems.push(`(b) ${cc} ${key}: placeholders [${localePlaceholders.join(" ")}] differ from en [${englishPlaceholders.join(" ")}]`);
      }
      const verdict = verdictFor(englishMail[key], value, productTerms);
      if (verdict.verdict === "FAIL") problems.push(`(${verdict.clause}) ${cc} ${key}: ${verdict.why}`);
    }
    for (const key of localeKeys) {
      if (!(key in englishMail)) problems.push(`(a) ${cc} has auth key ${key} that en lacks`);
    }
  }

  // (e): Privacy Policy §13, its version line, and the 3.4 purpose.
  const englishPP = tryRead(enRoot, ppPath("en"), problems, "(e) en");
  const localePP = tryRead(root, ppPath(cc), problems, `(e) ${cc}`);
  if (englishPP !== null && localePP !== null) {
    const englishS13 = sectionOf(englishPP, "13", "14");
    const localeS13 = sectionOf(localePP, "13", "14");
    if (englishS13 === null) problems.push("(e) en privacy-policy.md has no §13 between ## 13. and ## 14.");
    if (localeS13 === null) {
      problems.push(`(e) ${cc} privacy-policy.md has no §13 between ## 13. and ## 14.`);
    } else {
      const localeBlocks = blocksOf(localeS13);
      const englishBlocks = englishS13 === null ? [] : blocksOf(englishS13);
      const kinds = localeBlocks.map((block) => block.kind);
      if (JSON.stringify(kinds) !== JSON.stringify(PP13_KINDS)) {
        problems.push(`(e) ${cc} §13 block kinds ${kinds.join(",")} differ from ${PP13_KINDS.join(",")}`);
      }
      const purposeTr = purposeCell(localeBlocks, COOKIE_NAME);
      if (purposeTr === null) {
        problems.push(`(e) ${cc} §13 table has no ${COOKIE_NAME} row with a purpose cell`);
      } else if (purposeTr === PRE_3_4_PURPOSE[cc]) {
        problems.push(`(e) ${cc} cookie purpose cell is the pre-3.4 text`);
      } else if (purposeTr === purposeCell(englishBlocks, COOKIE_NAME)) {
        problems.push(`(e) ${cc} cookie purpose cell equals English`);
      }
      // A locale with fewer than three blocks already fails the block-kind check above, so no separate message is needed.
      const block2Tr = localeBlocks[2]?.text.trim();
      if (block2Tr !== undefined && block2Tr === englishBlocks[2]?.text.trim()) {
        problems.push(`(e) ${cc} §13 block 2 equals English`);
      }
    }
    versionOf(localePP, problems, `(e) ${cc} privacy-policy.md`, "3.5");
  }

  // (f): Terms version and the §17 pointer to Privacy Policy section 13.
  const englishTerms = tryRead(enRoot, tosPath("en"), problems, "(f) en");
  const localeTerms = tryRead(root, tosPath(cc), problems, `(f) ${cc}`);
  if (englishTerms !== null && localeTerms !== null) {
    versionOf(localeTerms, problems, `(f) ${cc} terms-of-service.md`, "2.4");
    const englishS17 = sectionOf(englishTerms, "17", "18");
    const localeS17 = sectionOf(localeTerms, "17", "18");
    if (englishS17 === null) problems.push("(f) en terms-of-service.md has no §17 between ## 17. and ## 18.");
    if (localeS17 === null) {
      problems.push(`(f) ${cc} terms-of-service.md has no §17 between ## 17. and ## 18.`);
    } else {
      if (!SECTION_NUMBER_13.test(localeS17)) problems.push(`(f) ${cc} §17 does not name Privacy Policy section 13`);
      const englishPointer = englishS17 === null ? undefined : sentencesOf(englishS17).find((sentence) => SECTION_NUMBER_13.test(sentence));
      if (englishPointer !== undefined && localeS17.includes(englishPointer)) {
        problems.push(`(f) ${cc} §17 pointer sentence is the English sentence`);
      }
    }
  }

  // (g): the /cookies purpose of the language cookie.
  const englishLegal = tryJson(enRoot, legalJsonPath("en"), problems, "(g) en");
  const localeLegal = tryJson(root, legalJsonPath(cc), problems, `(g) ${cc}`);
  if (englishLegal && localeLegal) {
    const value = localeLegal[COOKIE_PURPOSE_KEY];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`(g) ${cc} lacks ${COOKIE_PURPOSE_KEY}`);
    } else if (value === PRE_3_4_PURPOSE[cc]) {
      problems.push(`(g) ${cc} ${COOKIE_PURPOSE_KEY} is the pre-3.4 text`);
    } else if (value === englishLegal[COOKIE_PURPOSE_KEY]) {
      problems.push(`(g) ${cc} ${COOKIE_PURPOSE_KEY} equals English`);
    }
  }

  return { cc, pass: problems.length === 0, problems };
}

/** English-word survival per locale over every string key of en (the reference --measure), and the largest. */
export function measure({ root, enRoot = root, locales }) {
  const english = JSON.parse(readFileSync(join(enRoot, mailPath("en")), "utf8"));
  const lines = [];
  let floorMax = 0;
  for (const cc of locales) {
    const translated = JSON.parse(readFileSync(join(root, mailPath(cc)), "utf8"));
    let total = 0;
    let matched = 0;
    for (const [key, value] of Object.entries(english)) {
      if (typeof value !== "string") continue;
      const englishWords = contentWords(stripAll(value));
      const kept = new Set(contentWords(stripAll(typeof translated[key] === "string" ? translated[key] : "")));
      total += englishWords.length;
      matched += englishWords.filter((word) => kept.has(word)).length;
    }
    const survival = total ? matched / total : 0;
    floorMax = Math.max(floorMax, survival);
    lines.push(`${cc}: survival ${survival.toFixed(4)} over ${total} English content words`);
  }
  return { lines, floorMax };
}

const USAGE =
  "usage: node scripts/mail-salad-check.mjs (--locale <cc> | --measure <cc,...> | --all) [--root <dir>] [--en-root <dir>]";

function parseArgs(argv) {
  const options = { locale: null, measure: null, all: false, root: REPO_ROOT, enRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      index += 1;
      return value;
    };
    if (flag === "--locale") options.locale = takeValue();
    else if (flag === "--measure") options.measure = takeValue().split(",");
    else if (flag === "--all") options.all = true;
    else if (flag === "--root") options.root = resolve(takeValue());
    else if (flag === "--en-root") options.enRoot = resolve(takeValue());
    else throw new Error(`unknown argument ${flag}`);
  }
  return options;
}

export function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.log(`${USAGE}\n${error.message}`);
    return 2;
  }
  const root = options.root;
  const enRoot = options.enRoot ?? root;

  if (options.measure) {
    const unknown = options.measure.filter((cc) => !CATALOGUE_LOCALES.includes(cc));
    if (unknown.length > 0) {
      console.log(`${USAGE}\nunknown locale ${unknown.join(",")}`);
      return 2;
    }
    try {
      const { lines, floorMax } = measure({ root, enRoot, locales: options.measure });
      for (const line of lines) console.log(line);
      console.log(`FLOOR_MAX ${floorMax.toFixed(4)}`);
      return 0;
    } catch (error) {
      console.log(`PROBLEM · measure: ${error.code ?? error.message}`);
      return 1;
    }
  }

  const locales = options.all ? [...CATALOGUE_LOCALES] : options.locale ? [options.locale] : null;
  if (locales === null) {
    console.log(USAGE);
    return 2;
  }
  const unknown = locales.filter((cc) => !CATALOGUE_LOCALES.includes(cc));
  if (unknown.length > 0) {
    console.log(`${USAGE}\nunknown locale ${unknown.join(",")}`);
    return 2;
  }
  let failing = 0;
  for (const cc of locales) {
    const result = checkLocale({ root, enRoot, cc });
    for (const problem of result.problems) console.log(`PROBLEM · ${problem}`);
    if (!result.pass) failing += 1;
    console.log(`RESULT ${result.pass ? "PASS" : "FAIL"} · ${cc} · ${result.problems.length} problem(s)`);
  }
  if (options.all) {
    console.log(`RESULT ${failing === 0 ? "PASS" : "FAIL"} · all ${locales.length} locales · ${failing} failing`);
  }
  return failing === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
