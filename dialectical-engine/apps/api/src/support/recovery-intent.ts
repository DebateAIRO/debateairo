import type { SupportLanguage } from "./templates.js";

export type PredicatePolarity = "AFFIRMATIVE" | "NEGATED" | "ABSENT";

export type RecoverySemantics = Readonly<{
  language: SupportLanguage;
  navigation: PredicatePolarity;
  credentialOperation: PredicatePolarity;
}>;

const CLAUSE_BOUNDARIES = new Set([
  "and","but","however","plus","then","while",
  "apoi","dar","iar","insa","însă","si","și"
]);
const NEGATORS = new Set([
  "cannot","can't","dont","don't","doesnt","doesn't","mustn't","never","no","not",
  "unable","without","won't",
  "fara","fără","nici","niciodata","niciodată","nu"
]);
const NAVIGATION_WORD = /^(?:button\p{L}*|find|give|go|how|link\p{L}*|locate|open|opener|option\p{L}*|page|screen\p{L}*|show|where|arat\p{L}*|buton\p{L}*|d[ăa]|deschid\p{L}*|ecran\p{L}*|g[ăa]sesc|link\p{L}*|op[țt]iun\p{L}*|pagin\p{L}*|unde)$/u;
const NAVIGATION_NOUN = /^(?:button\p{L}*|link\p{L}*|opener|option\p{L}*|page|screen\p{L}*|buton\p{L}*|ecran\p{L}*|op[țt]iun\p{L}*|pagin\p{L}*)$/u;
const OPERATION_WORDS = Object.freeze([
  /^(?:apply|change|execute|perform|replace|set|submit)$/u,
  /^(?:check|valid\p{L}*|verif\p{L}*)$/u,
  /^(?:aplic\p{L}*|efectu\p{L}*|execut\p{L}*|inlocu\p{L}*|înlocu\p{L}*|schimb\p{L}*|trimit\p{L}*)$/u
] as const);
const RESET_WORD = /^(?:reset\p{L}*)$/u;
const PASSWORD_WORD = /^(?:passwords?|parol\p{L}*)$/u;
const CREDENTIAL_OBJECT_WORD = /^(?:codes?|tokens?|cod\p{L}*|token\p{L}*)$/u;
const RECOVERY_WORD = /^(?:amintesc|forgot(?:ten)?|recover\p{L}*|recovery|recuper\p{L}*|remember|uitat\p{L}*)$/u;

type Clause = Readonly<{ words: readonly string[] }>;

function normalized(value: string): string {
  return value.normalize("NFKC")
    .replace(/[‘’‛`´]/gu,"'")
    .toLocaleLowerCase("en-US");
}

function tokenize(value: string,normalizeInput: boolean): readonly string[] {
  const source = normalizeInput ? normalized(value) : value;
  return Object.freeze(source.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?|[,.;:!?]/gu) ?? []);
}

function clauses(value: string,normalizeInput: boolean): readonly Clause[] {
  const result: Clause[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) result.push(Object.freeze({ words:Object.freeze(current) }));
    current = [];
  };
  for (const token of tokenize(value,normalizeInput)) {
    if (/^[,.;:!?]$/u.test(token) || CLAUSE_BOUNDARIES.has(token)) {
      flush();
      continue;
    }
    current.push(token);
  }
  flush();
  return Object.freeze(result);
}

function contains(words: readonly string[],pattern: RegExp): boolean {
  return words.some((word) => pattern.test(word));
}

function recoverySubject(words: readonly string[]): boolean {
  const password = contains(words,PASSWORD_WORD);
  const recovery = contains(words,RECOVERY_WORD) || contains(words,RESET_WORD);
  const resetCredential = contains(words,RESET_WORD)
    && contains(words,CREDENTIAL_OBJECT_WORD);
  return (password && recovery) || resetCredential;
}

function isNegated(words: readonly string[],predicateIndex: number): boolean {
  const lower = Math.max(0,predicateIndex - 8);
  return words.slice(lower,predicateIndex).some((word) => NEGATORS.has(word));
}

function resetIsOperation(words: readonly string[],index: number): boolean {
  const local = words.slice(Math.max(0,index - 3),Math.min(words.length,index + 4));
  if (local.some((word) => NAVIGATION_NOUN.test(word))) return false;
  return contains(local,PASSWORD_WORD)
    || local.some((word) => /^(?:for|me|please|support|asistenta|asistența|locul|trebuie)$/u.test(word));
}

function credentialOperationIndexes(words: readonly string[]): readonly number[] {
  const hasCredentialObject = contains(words,CREDENTIAL_OBJECT_WORD)
    || contains(words,PASSWORD_WORD) || contains(words,RESET_WORD);
  const indexes: number[] = [];
  words.forEach((word,index) => {
    if (RESET_WORD.test(word) && resetIsOperation(words,index)) {
      indexes.push(index);
      return;
    }
    if (hasCredentialObject && OPERATION_WORDS.some((pattern) => pattern.test(word))) {
      const next = words[index + 1];
      if ((word === "check" || word.startsWith("verific"))
        && (next === "where" || next === "unde")) return;
      indexes.push(index);
    }
  });
  return Object.freeze(indexes);
}

function navigationIndexes(
  words: readonly string[],operationIndexes: readonly number[]
): readonly number[] {
  const localContext = recoverySubject(words)
    || contains(words,RECOVERY_WORD) || contains(words,RESET_WORD);
  if (!localContext) return Object.freeze([]);
  const indexes = words.flatMap((word,index) => NAVIGATION_WORD.test(word) ? [index] : []);
  if (indexes.length > 0) return Object.freeze(indexes);
  if (operationIndexes.length === 0
    && (contains(words,/^(?:forgot(?:ten)?|uitat\p{L}*)$/u)
      || words.some((word,index) => /^(?:amintesc|remember)$/u.test(word)
        && isNegated(words,index)))) {
    return Object.freeze([words.findIndex((word) => RECOVERY_WORD.test(word))]);
  }
  return Object.freeze([]);
}

function polarity(
  observations: readonly Readonly<{ negated: boolean }>[]
): PredicatePolarity {
  if (observations.some(({ negated }) => !negated)) return "AFFIRMATIVE";
  return observations.length > 0 ? "NEGATED" : "ABSENT";
}

export function analyzeRecoverySemantics(
  text: string,languageHint: SupportLanguage
): RecoverySemantics {
  return analyzeRecoverySemanticsInput(text,languageHint,true);
}

function analyzeRecoverySemanticsInput(
  text: string,languageHint: SupportLanguage,normalizeInput: boolean
): RecoverySemantics {
  const parsed = clauses(text,normalizeInput);
  const allWords = parsed.flatMap(({ words }) => words);
  const globalSubject = recoverySubject(allWords);
  const navigation: Array<Readonly<{ negated: boolean }>> = [];
  const credentialOperation: Array<Readonly<{ negated: boolean }>> = [];

  for (const clause of parsed) {
    const hasSubject = recoverySubject(clause.words) || globalSubject;
    if (!hasSubject) continue;
    const operationIndexes = credentialOperationIndexes(clause.words);
    for (const index of navigationIndexes(clause.words,operationIndexes)) {
      const word = clause.words[index] ?? "";
      const difficulty = ["amintesc","find","gasesc","găsesc","remember"].includes(word)
        && clause.words.slice(Math.max(0,index - 3),index).some((candidate) =>
          candidate === "cannot" || candidate === "can't" || candidate === "nu");
      navigation.push(Object.freeze({ negated:difficulty ? false : isNegated(clause.words,index) }));
    }
    for (const index of operationIndexes) {
      credentialOperation.push(Object.freeze({ negated:isNegated(clause.words,index) }));
    }
  }

  return Object.freeze({
    language:languageHint,
    navigation:polarity(navigation),
    credentialOperation:polarity(credentialOperation)
  });
}

export function analyzeRecoverySemanticsViews(
  values: readonly string[],languageHint: SupportLanguage
): RecoverySemantics {
  const analyzed = values.map((value) => analyzeRecoverySemanticsInput(value,languageHint,true));
  return mergeSemantics(analyzed,languageHint);
}

export function analyzePreparedRecoverySemanticsViews(
  values: readonly string[],languageHint: SupportLanguage
): RecoverySemantics {
  const analyzed = values.map((value) => analyzeRecoverySemanticsInput(value,languageHint,false));
  return mergeSemantics(analyzed,languageHint);
}

function mergeSemantics(
  analyzed: readonly RecoverySemantics[],languageHint: SupportLanguage
): RecoverySemantics {
  const merged = (key: "navigation" | "credentialOperation"): PredicatePolarity => {
    if (analyzed.some((item) => item[key] === "AFFIRMATIVE")) return "AFFIRMATIVE";
    if (analyzed.some((item) => item[key] === "NEGATED")) return "NEGATED";
    return "ABSENT";
  };
  return Object.freeze({
    language:languageHint,
    navigation:merged("navigation"),
    credentialOperation:merged("credentialOperation")
  });
}
