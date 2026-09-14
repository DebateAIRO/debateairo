export type SupportCredentialKind =
  | "password"
  | "passcode"
  | "otp"
  | "totp"
  | "mfa"
  | "authenticator"
  | "credentials"
  | "recovery-code"
  | "verification-code"
  | "security-code"
  | "authentication-code"
  | "reset-token";

export type SupportSecurityOperationKind =
  | "solicit"
  | "receive"
  | "repeat"
  | "transform"
  | "validate"
  | "security-change"
  | "use";

export type SupportTextSpan = Readonly<{ start: number;end: number }>;
export type SupportCredentialTermFact = SupportTextSpan & Readonly<{
  kind: SupportCredentialKind;scope: number;sentence: number;
}>;
export type SupportSecurityOperationFact = SupportTextSpan & Readonly<{
  kind: SupportSecurityOperationKind;scope: number;sentence: number;negated: boolean;
}>;
export type SupportScopedFact = SupportTextSpan & Readonly<{
  scope: number;sentence: number;
}>;
export type SupportCredentialFacts = Readonly<{
  credentialTerms: readonly SupportCredentialTermFact[];
  credentialValueSpans: readonly SupportTextSpan[];
  operations: readonly SupportSecurityOperationFact[];
  negations: readonly SupportScopedFact[];
  references: readonly SupportScopedFact[];
}>;

type NormalizedText = Readonly<{
  text: string;
  starts: readonly number[];
  ends: readonly number[];
}>;

type Scope = Readonly<{ start: number;end: number;sentence: number }>;

const TERM_PATTERNS: readonly Readonly<{
  kind: SupportCredentialKind;pattern: RegExp;
}>[] = Object.freeze([
  { kind: "recovery-code",pattern: /\b(?:recovery\s+codes?|cod(?:ul|urile)?\s+de\s+recuperare)\b/giu },
  { kind: "verification-code",pattern: /\b(?:verification\s+codes?|cod(?:ul|urile)?\s+de\s+verificare)\b/giu },
  { kind: "security-code",pattern: /\b(?:security\s+codes?|cod(?:ul|urile)?\s+de\s+securitate)\b/giu },
  { kind: "authentication-code",pattern: /\b(?:authentication\s+codes?|cod(?:ul|urile)?\s+de\s+autentificare)\b/giu },
  { kind: "reset-token",pattern: /\b(?:reset\s+tokens?|token(?:ul|urile)?\s+de\s+resetare)\b/giu },
  { kind: "credentials",pattern: /\b(?:credentials?|date(?:le)?\s+de\s+autentificare)\b/giu },
  { kind: "authenticator",pattern: /\b(?:authenticator(?:\s+codes?)?|autentificator(?:ul|ele|ului)?(?:\s+codes?)?)\b/giu },
  { kind: "passcode",pattern: /\bpasscodes?\b/giu },
  { kind: "totp",pattern: /\b(?:(?:cod(?:ul|urile)?\s+)?totp(?:\s+codes?)?)\b/giu },
  { kind: "mfa",pattern: /\b(?:(?:cod(?:ul|urile)?\s+)?mfa(?:\s+codes?)?)\b/giu },
  { kind: "otp",pattern: /\b(?:(?:cod(?:ul|urile)?\s+)?otp(?:s|ul|urile)?(?:\s+codes?)?)\b/giu },
  { kind: "password",pattern: /\b(?:password(?:s|ul|urile)?|parol(?:a|e|ele|ei|elor)?)\b/giu }
]);

const OPERATION_PATTERNS: readonly Readonly<{
  kind: SupportSecurityOperationKind;pattern: RegExp;
}>[] = Object.freeze([
  { kind: "solicit",pattern: /\b(?:send(?:ing)?|sent|shar(?:e|es|ed|ing)|provid(?:e|es|ed|ing)|giv(?:e|es|en|ing)|suppl(?:y|ies|ied|ying)|request(?:s|ed|ing)?|ask(?:s|ed|ing)?|submit(?:s|ted|ting)?|enter(?:s|ed|ing)?|typ(?:e|es|ed|ing)|past(?:e|es|ed|ing)|upload(?:s|ed|ing)?|tell(?:s|ing)?|told|show(?:s|ed|ing)?|solicit\p{L}*|cer\p{L}*|trimit\p{L}*|partaj\p{L}*|furniz\p{L}*|introduc\p{L}*|lip\p{L}*|incarc\p{L}*|spun\p{L}*|arat\p{L}*)\b/giu },
  { kind: "receive",pattern: /\b(?:receiv(?:e|es|ed|ing)|accept(?:s|ed|ing)?|prim\p{L}*|accept\p{L}*)\b/giu },
  { kind: "repeat",pattern: /\b(?:repeat(?:s|ed|ing)?|repet\p{L}*)\b/giu },
  { kind: "transform",pattern: /\b(?:transform(?:s|ed|ing)?|decod(?:e|es|ed|ing)|encod(?:e|es|ed|ing)|transform\p{L}*|decod\p{L}*|encod\p{L}*)\b/giu },
  { kind: "validate",pattern: /\b(?:validat(?:e|es|ed|ing)|verif(?:y|ies|ied|ying)|check(?:s|ed|ing)?|valid\p{L}*|verific\p{L}*)\b/giu },
  { kind: "security-change",pattern: /\b(?:reset(?:s|ting)?|chang(?:e|es|ed|ing)|replac(?:e|es|ed|ing)|regenerat(?:e|es|ed|ing)|enroll(?:s|ed|ing)?|disabl(?:e|es|ed|ing)|remov(?:e|es|ed|ing)|revok(?:e|es|ed|ing)|recover(?:s|ed|ing)?|reset\p{L}*|schimb\p{L}*|inlocu\p{L}*|regener\p{L}*|inscri\p{L}*|dezactiv\p{L}*|elimin\p{L}*|revoc\p{L}*|recuper\p{L}*)\b/giu },
  { kind: "use",pattern: /\b(?:us(?:e|es|ed|ing)|folos\p{L}*)\b/giu }
]);

const NEGATION = /\b(?:never|do\s+not|does\s+not|did\s+not|cannot|can\s+not|can't|must\s+not|will\s+not|should\s+not|nu|niciodata|nu\s+poate|nu\s+pot|nu\s+trebuie)\b/giu;
const REFERENCE = /(?:\b(?:it|them|this|that|these|those|acesta|aceasta|acestea|acestora|le|lor)\b|-o\b|-le\b)/giu;
const SCOPE_BOUNDARY = /(?:[.!?;\n]+|,?\s*\b(?:but|however|instead|except|unless|then|therefore|thus|so|as\s+a\s+result|because|while|although|yet|which\s+means|and\s+(?:also|then|generally|sometimes|later|still)|dar|insa|apoi|deci|asa\s+ca|prin\s+urmare|deoarece|fiindca|desi|totusi|ceea\s+ce\s+inseamna|si\s+de\s+asemenea)\b|\b(?:and|si)\s+(?=(?:you|the\s+visitor|support|i|we|they|should|must|will|can|please|send|share|provide|give|submit|enter|paste|upload|tell|show|receive|accept|repeat|transform|validate|decode|encode|reset|change|replace|regenerate|tu|vizitator|asistenta|trebuie|poti|vei|va|trim|partaj|furniz|introduc|lip|incarc|spun|arat|prim|accept|repet|transform|valid|decod|encod|reset|schimb|inlocu|regener)))/giu;
const SENTENCE_BOUNDARY = /[.!?;\n]+/gu;
const LABEL_CONNECTOR = /^\s*(?:(?:my|your|his|her|our|their|visitor(?:'s)?|meu|mea|mele|ta|tau|dvs|dumneavoastra|utilizatorului)\s+){0,2}(?:(?:is|are|este|e|sunt)\b|:|=)\s*/iu;
const VALUE_TOKEN = /^[^\s,;.!?]+/u;
const VALUE_STOP_WORDS = new Set([
  "and","but","because","keep","please","so","then","therefore","which","while",
  "asa","apoi","dar","deci","iar","pastreaza","pentru","si"
]);
const QUOTE_PAIRS = new Map([["\"","\""],["'","'"],["„","”"],["“","”"],["«","»"]]);
const MAX_VALUE_WORDS = 6;
const MAX_VALUE_CODE_UNITS = 160;
const NON_VALUE_WORDS = new Set([
  "available","disponibil","disponibile","encrypted","forgotten","invalid","missing","never","not","private","protected",
  "required","safe","secure","unavailable","unknown","niciodata","nu","necesara",
  "necesar","protejata","protejat","sigura","sigur","uitata","uitat"
]);

function normalizeWithMap(source: string): NormalizedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let sourceIndex = 0; sourceIndex < source.length;) {
    const codePoint = source.codePointAt(sourceIndex);
    if (codePoint === undefined) break;
    const original = String.fromCodePoint(codePoint);
    const width = original.length;
    const folded = /[\p{Cc}\p{Cf}]/u.test(original)
      ? ""
      : original.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en-US");
    for (let index = 0; index < folded.length; index += 1) {
      text += folded[index];
      starts.push(sourceIndex);
      ends.push(sourceIndex + width);
    }
    sourceIndex += width;
  }
  return Object.freeze({ text,starts:Object.freeze(starts),ends:Object.freeze(ends) });
}

function originalSpan(normalized: NormalizedText,start: number,end: number): SupportTextSpan {
  const sourceStart = normalized.starts[start];
  const sourceEnd = normalized.ends[end - 1];
  return Object.freeze({ start: sourceStart ?? 0,end: sourceEnd ?? sourceStart ?? 0 });
}

function scopesFor(text: string): readonly Scope[] {
  const sentenceStarts: number[] = [0];
  for (const match of text.matchAll(SENTENCE_BOUNDARY)) sentenceStarts.push(match.index + match[0].length);
  const sentenceAt = (offset: number) => Math.max(0,sentenceStarts.findLastIndex((start) => start <= offset));
  const scopes: Scope[] = [];
  let start = 0;
  for (const match of text.matchAll(SCOPE_BOUNDARY)) {
    const end = match.index;
    if (end > start) scopes.push(Object.freeze({ start,end,sentence:sentenceAt(start) }));
    start = match.index + match[0].length;
  }
  if (start < text.length) scopes.push(Object.freeze({ start,end:text.length,sentence:sentenceAt(start) }));
  return Object.freeze(scopes);
}

function scopeAt(scopes: readonly Scope[],offset: number): number {
  const exact = scopes.findIndex(({ start,end }) => offset >= start && offset < end);
  if (exact >= 0) return exact;
  return Math.max(0,scopes.findLastIndex(({ start }) => start <= offset));
}

function uniqueSpans(spans: readonly SupportTextSpan[]): readonly SupportTextSpan[] {
  const seen = new Set<string>();
  return Object.freeze([...spans]
    .sort((left,right) => left.start - right.start || left.end - right.end)
    .filter(({ start,end }) => {
      const key = `${start}:${end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
}

function labelledValueSpan(text: string,start: number): Readonly<{ start: number;end: number }> | null {
  const first = text[start];
  const closing = first === undefined ? undefined : QUOTE_PAIRS.get(first);
  if (closing !== undefined) {
    const end = text.indexOf(closing,start + 1);
    if (end <= start + 1 || end - start > MAX_VALUE_CODE_UNITS) return null;
    return Object.freeze({ start:start + 1,end });
  }
  let cursor = start;
  let end = start;
  for (let count = 0;count < MAX_VALUE_WORDS;count += 1) {
    const spacing = /^\s*/u.exec(text.slice(cursor))?.[0] ?? "";
    const tokenStart = cursor + spacing.length;
    const token = VALUE_TOKEN.exec(text.slice(tokenStart))?.[0];
    if (token === undefined || VALUE_STOP_WORDS.has(token) || tokenStart - start > MAX_VALUE_CODE_UNITS) break;
    end = tokenStart + token.length;
    cursor = end;
  }
  return end > start ? Object.freeze({ start,end }) : null;
}

export function analyzeSupportCredentialText(source: string): SupportCredentialFacts {
  const normalized = normalizeWithMap(source);
  const scopes = scopesFor(normalized.text);
  const terms: SupportCredentialTermFact[] = [];
  const normalizedTerms: Array<Readonly<{ start: number;end: number }>> = [];
  for (const { kind,pattern } of TERM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalized.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (normalizedTerms.some((term) => start >= term.start && end <= term.end)) continue;
      normalizedTerms.push(Object.freeze({ start,end }));
      const scope = scopeAt(scopes,start);
      terms.push(Object.freeze({
        kind,...originalSpan(normalized,start,end),scope,sentence:scopes[scope]?.sentence ?? 0
      }));
    }
  }
  terms.sort((left,right) => left.start - right.start || left.end - right.end);

  const values: SupportTextSpan[] = [];
  for (const term of normalizedTerms) {
    const suffix = normalized.text.slice(term.end,term.end + 120);
    const connector = LABEL_CONNECTOR.exec(suffix);
    if (connector === null) continue;
    const valueStart = term.end + connector[0].length;
    const span = labelledValueSpan(normalized.text,valueStart);
    if (span === null) continue;
    const firstWord = normalized.text.slice(span.start,span.end).split(/\s+/u)[0]!;
    if (NON_VALUE_WORDS.has(firstWord)) continue;
    values.push(originalSpan(normalized,span.start,span.end));
  }

  const negations: SupportScopedFact[] = [];
  NEGATION.lastIndex = 0;
  for (const match of normalized.text.matchAll(NEGATION)) {
    const scope = scopeAt(scopes,match.index);
    negations.push(Object.freeze({
      ...originalSpan(normalized,match.index,match.index + match[0].length),
      scope,sentence:scopes[scope]?.sentence ?? 0
    }));
  }

  const operations: SupportSecurityOperationFact[] = [];
  for (const { kind,pattern } of OPERATION_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of normalized.text.matchAll(pattern)) {
      const scope = scopeAt(scopes,match.index);
      const scopeStart = scopes[scope]?.start ?? 0;
      const negated = [...normalized.text.slice(scopeStart,match.index).matchAll(NEGATION)].length > 0;
      const span = originalSpan(normalized,match.index,match.index + match[0].length);
      if (terms.some((term) => span.start >= term.start && span.end <= term.end)) continue;
      operations.push(Object.freeze({
        kind,...span,
        scope,sentence:scopes[scope]?.sentence ?? 0,negated
      }));
    }
  }
  operations.sort((left,right) => left.start - right.start || left.end - right.end);

  const references: SupportScopedFact[] = [];
  REFERENCE.lastIndex = 0;
  for (const match of normalized.text.matchAll(REFERENCE)) {
    const scope = scopeAt(scopes,match.index);
    references.push(Object.freeze({
      ...originalSpan(normalized,match.index,match.index + match[0].length),
      scope,sentence:scopes[scope]?.sentence ?? 0
    }));
  }
  return Object.freeze({
    credentialTerms:Object.freeze(terms),credentialValueSpans:uniqueSpans(values),
    operations:Object.freeze(operations),negations:Object.freeze(negations),
    references:Object.freeze(references)
  });
}
