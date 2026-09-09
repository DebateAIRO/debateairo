import type { SupportLanguage, SupportOutcome } from "./templates.js";

export type SupportClassification = Readonly<{
  outcome: Extract<SupportOutcome,
    "REFUSE_ZONE" | "REFUSE_INJECTION" | "REFUSE_SAFETY"> | "INCIDENT" | null;
  language: SupportLanguage;
  link: "/login" | "/sign-up" | "/settings" | null;
}>;

type ZoneLink = Exclude<SupportClassification["link"], null>;
type ZoneRule = Readonly<{ pattern: RegExp; link: ZoneLink }>;

export type SupportSensitiveIntentFamily =
  | "account-erasure"
  | "coercion"
  | "self-harm"
  | "threat"
  | "minor"
  | "legal-data";

const ACCOUNT_ERASURE_PATTERN = /(?:(?:\bdelete|\berase|\bremove)\b.{0,40}\b(?:(?:my|this|the)\s+)?account\b|(?<!\p{L})(?:șterg|sterg)\p{L}*(?:-[\p{L}]+)?.{0,40}(?<!\p{L})cont\p{L}*(?!\p{L}))/u;

const ZONE_RULES: readonly ZoneRule[] = Object.freeze([
  Object.freeze({
    pattern: /(?:\brecovery codes?\b|\bcod(?:ul|uri)? de recuperare\b|\bcoduri(?:le)? de recuperare\b)/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:\brecover(?:y| my| an?) account\b|\baccount recovery\b|\brecuper(?:are|ez|a)\w* (?:unui |a?l? )?cont\w*\b)/u,
    link: "/login"
  }),
  Object.freeze({
    pattern: /(?:\bpasswords?\b|(?<!\p{L})parol(?:a|ă|e|ei|ele|elor)(?!\p{L}))/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:\bverification (?:codes?|links?)\b|\bverify (?:my )?(?:email|account)\b|\bcod(?:ul|uri)? de verificare\b|\blink(?:ul|uri)? de verificare\b)/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:\btwo[ -]factor\b|\b2fa\b|\btotp\b|\bmfa\b|\bautentificare(?:a)? în doi pași\b)/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:(?:\bchange|\bupdate|\bmodify|\breplace)\b.{0,48}\b(?:e-?mail|contact|phone number)\b|\b(?:schimb|modific|înlocui|actualiz)\w*\b.{0,48}\b(?:e-?mail|contact|telefon)\w*\b)/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:\bsign[ -]?out\b|\blog[ -]?out\b|\b(?:active |other |account )?sessions?\b|\bdeconect\w*\b|\bsesiun\w*\b)/u,
    link: "/settings"
  }),
  Object.freeze({
    pattern: ACCOUNT_ERASURE_PATTERN,
    link: "/settings"
  }),
  Object.freeze({
    pattern: /(?:\bdoes (?:an |the )?account\b.{0,32}\bexist\b|\baccount\b.{0,32}\bexist\b|(?<!\p{L})(?:există|exista)(?!\p{L}).{0,32}(?<!\p{L})cont\p{L}*(?!\p{L}))/u,
    link: "/sign-up"
  }),
  Object.freeze({
    pattern: /(?:\bsign[ -]?up\b|\bcreate (?:an? )?account\b|\bregister (?:an? )?account\b|(?<!\p{L})cre(?:ez|ează|eaza)(?!\p{L}).{0,24}(?<!\p{L})cont\p{L}*(?!\p{L})|(?<!\p{L})înregistr\p{L}*(?!\p{L}).{0,24}(?<!\p{L})cont\p{L}*(?!\p{L}))/u,
    link: "/sign-up"
  }),
  Object.freeze({
    pattern: /(?:\bsign[ -]?in\b|\blog[ -]?in\b|\blogin\b|\bautentific\w*\b)/u,
    link: "/login"
  })
]);

const SENSITIVE_INTENT_PATTERNS: Readonly<Record<
  SupportSensitiveIntentFamily,readonly RegExp[]
>> = Object.freeze({
  "account-erasure": Object.freeze([ACCOUNT_ERASURE_PATTERN]),
  coercion: Object.freeze([
    /(?:\bi am being told what to (?:type|write) by someone\b|\b(?:they|someone) are forcing me to (?:type|write)\b|\bi am being (?:forced|made) to (?:type|write)\b)/u,
    /(?:cineva la telefon îmi spune ce să scriu|\bsunt obligat(?:ă)? să (?:scriu|tastez)\b|\bcineva mă obligă să (?:scriu|tastez)\b)/u
  ]),
  "self-harm": Object.freeze([
    /(?:\b(?:kill(?:ing)?|hurt(?:ing)?) myself\b|\bself[ -]?harm\b|\bsuicid(?:e|al)\b|\bi (?:want|might) to die\b)/u,
    /(?:mă gândesc să mă sinucid|ma gandesc sa ma sinucid|\bmă sinucid\b|\bma sinucid\b|(?:îmi|imi) fac rău|\bsinucidere\b|\bvreau s[ăa] (?:mor|îmi fac rău|imi fac rau)\b)/u
  ]),
  threat: Object.freeze([
    /(?:\b(?:someone|a person) (?:is )?threaten(?:ing|ed) me\b|\bsomeone (?:is )?threaten(?:ing|ed)(?: to)? (?:(?:hurt|kill) )?me\b|\bthreat(?:en|ened|ening)s? (?:to )?(?:hurt|kill) me\b)/u,
    /(?:cineva mă amenință că mă omoară|cineva ma ameninta ca ma omoara|(?:cineva|o persoană|o persoana) (?:mă|ma|m-a) amenin(?:ță|ta|țat|tat)|mă amenință|ma ameninta|mă omoară|ma omoara)/u
  ]),
  minor: Object.freeze([
    /(?:\bminor(?:'s)? account\b|\bchild(?:'s)? account\b|\baccount (?:of|for) a minor\b|\bthis (?:is about|concerns) a minor\b|\bmy child has an account here\b)/u,
    /(?:contul unui minor|cont de minor|contul copilului|este vorba despre un minor|copilul meu are un cont aici)/u
  ]),
  "legal-data": Object.freeze([
    /(?:\blegal complaint\b|\blaw enforcement\b|\bcourt order\b|\bsubpoena\b|\bpersonal data access\b|\bdata access request\b|\bgdpr request\b|\bcopy of my personal data\b|\blegal (?:help|advice).{0,48}\bpersonal data\b|\bcourt request.{0,32}\bmy data\b)/u,
    /(?:plângere legală|plangere legala|aplicarea legii|ordin judecătoresc|ordin judecatoresc|acces la date personale|cerere gdpr|(?:asistență|cerere) juridică.{0,48}datele mele)/u
  ])
});

const SENSITIVE_INTENT_ORDER = Object.freeze([
  "account-erasure","coercion","self-harm","threat","minor","legal-data"
] as const satisfies readonly SupportSensitiveIntentFamily[]);

const INCIDENT_PATTERNS = Object.freeze([
  /\bis (?:anything|something) broken\b/u,
  /\bsite (?:is )?down\b/u,
  /\bnot working\b/u,
  /\b(?:current )?known incidents?\b/u,
  /\bincidents? (?:right )?now\b/u,
  /\be stricat\b/u,
  /\bnu merge\b/u,
  /\be c[ăa]zut\b/u,
  /\bincident cunoscut\b/u
] as const);

type InjectionGrammarNode =
  | Readonly<{ kind: "word"; alternatives: readonly string[] }>
  | Readonly<{ kind: "literal"; value: string }>
  | Readonly<{ kind: "sequence"; parts: readonly InjectionGrammarNode[] }>
  | Readonly<{ kind: "choice"; options: readonly InjectionGrammarNode[] }>
  | Readonly<{ kind: "optional"; node: InjectionGrammarNode }>
  | Readonly<{ kind: "separator" }>
  | Readonly<{ kind: "gap"; maximum: number }>
  | Readonly<{ kind: "sentence-start" }>
  | Readonly<{ kind: "delimiter-gap"; maximum: number }>;

const word = (...alternatives: readonly string[]): InjectionGrammarNode =>
  Object.freeze({ kind: "word", alternatives: Object.freeze(alternatives) });
const literal = (value: string): InjectionGrammarNode => Object.freeze({ kind: "literal", value });
const sequence = (...parts: readonly InjectionGrammarNode[]): InjectionGrammarNode =>
  Object.freeze({ kind: "sequence", parts: Object.freeze(parts) });
const choice = (...options: readonly InjectionGrammarNode[]): InjectionGrammarNode =>
  Object.freeze({ kind: "choice", options: Object.freeze(options) });
const optional = (node: InjectionGrammarNode): InjectionGrammarNode =>
  Object.freeze({ kind: "optional", node });
const separator = (): InjectionGrammarNode => Object.freeze({ kind: "separator" });
const gap = (maximum: number): InjectionGrammarNode => Object.freeze({ kind: "gap", maximum });
const sentenceStart = (): InjectionGrammarNode => Object.freeze({ kind: "sentence-start" });
const delimiterGap = (maximum: number): InjectionGrammarNode =>
  Object.freeze({ kind: "delimiter-gap", maximum });

const REQUEST_PREFIX = choice(
  sequence(word("please"), separator()),
  sequence(word("can", "could", "would", "will"), separator(), word("you"), separator()),
  sequence()
);
const DEVELOPER_ACTION = choice(
  word("enter", "enable", "activate", "use"),
  sequence(word("switch"), separator(), word("to"))
);
const FORWARD_ACTION = word(
  "print", "show", "reveal", "dump", "expose", "send", "upload", "return",
  "afișează", "afiseaza", "dezvăluie", "dezvaluie"
);
const FORWARD_TARGET = choice(
  sequence(word("system"), separator(), word("prompt")),
  sequence(word("hidden"), separator(), word("prompt", "reasoning", "instruction")),
  sequence(word("internal"), separator(), word("instruction")),
  word("environment", "environments"),
  sequence(word("environment"), separator(), word("variable", "variables")),
  sequence(word("api"), separator(), word("key", "keys")),
  word("cookie", "cookies", "key", "keys"),
  sequence(word("promptul"), separator(), word("de"), separator(), word("sistem")),
  sequence(word("variabile", "variabilele"), separator(), word("de"), separator(), word("mediu")),
  word("chei", "cheile")
);
const REVERSE_TARGET = choice(
  sequence(word("system"), separator(), word("prompt")),
  sequence(word("hidden"), separator(), word("prompt")),
  sequence(word("environment"), separator(), word("variable", "variables")),
  sequence(word("api"), separator(), word("key", "keys"))
);
const MARKED_ROLE = choice(
  sequence(literal("<"), optional(literal("/")), word("system", "assistant", "developer"), literal(">")),
  sequence(literal("["), word("system", "assistant", "developer"), literal("]")),
  sequence(literal("```"), optional(separator()), word("system", "assistant", "developer"))
);

// This grammar is the only injection vocabulary. Its compiler adds identical
// Unicode-control tolerance to every word and every explicit phrase boundary.
const INJECTION_GRAMMAR: readonly InjectionGrammarNode[] = Object.freeze([
  sequence(
    word("ignore", "disregard", "forget", "override"),
    gap(64),
    optional(sequence(word("previous", "prior", "product", "system", "hidden"), separator())),
    word("instruction", "instructions", "rule", "rules", "direction", "directions")
  ),
  sequence(
    word("ignoră", "ignora", "uită", "uita"),
    gap(64),
    word("instrucțiuni", "instrucțiunile", "reguli", "regulile")
  ),
  sequence(
    sentenceStart(),
    choice(
      sequence(optional(sequence(word("please"), separator())), word("act"), separator(), word("as")),
      sequence(
        optional(sequence(word("please"), separator())),
        word("pretend"),
        separator(),
        choice(sequence(word("to"), separator(), word("be")), sequence(word("you"), separator(), word("are")))
      ),
      sequence(
        optional(sequence(word("please"), separator())),
        word("assume"), separator(), word("the"), separator(), word("role")
      ),
      sequence(word("role"), optional(separator()), literal(":"))
    ),
    gap(80),
    word("assistant", "system", "admin", "administrator", "developer")
  ),
  sequence(
    sentenceStart(), REQUEST_PREFIX, DEVELOPER_ACTION, gap(32),
    choice(
      sequence(word("developer"), separator(), word("mode")),
      sequence(word("mod"), separator(), word("dezvoltator"))
    )
  ),
  sequence(sentenceStart(), REQUEST_PREFIX, FORWARD_ACTION, gap(96), FORWARD_TARGET),
  sequence(
    sentenceStart(), REVERSE_TARGET, gap(96),
    word("print", "show", "reveal", "dump", "send", "upload", "give", "return")
  ),
  sequence(
    sentenceStart(), REQUEST_PREFIX,
    word("decode", "decompress", "execute", "obey", "rulează", "ruleaza", "decodifică", "decodifica"),
    gap(48),
    word("base64", "hex", "encoded", "payload")
  ),
  sequence(
    sentenceStart(), MARKED_ROLE, delimiterGap(16),
    word("ignore", "forget", "override", "reveal", "dump", "obey", "execute", "show", "print")
  ),
  sequence(
    sentenceStart(), word("the"), separator(), word("admin", "administrator", "owner"), separator(),
    word("says", "said", "authorizes", "authorized", "instructs"), gap(96),
    word("ignore", "forget", "override", "reveal", "dump", "obey", "execute", "show", "print", "upload", "must")
  )
]);

const INJECTION_CONTROL_SENTINEL = "\u0000";
const CONTROL_PATTERN = `${INJECTION_CONTROL_SENTINEL}?`;
const SEPARATOR_PATTERN = `[\\s${INJECTION_CONTROL_SENTINEL}]+`;
const SENTENCE_PADDING_PATTERN = `[\\s${INJECTION_CONTROL_SENTINEL}]*`;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function compileWord(value: string): string {
  return [...value].map(escapeRegex).join(CONTROL_PATTERN);
}

function exhaustive(value: never): never {
  return value;
}

function compileInjectionGrammar(node: InjectionGrammarNode): string {
  switch (node.kind) {
    case "word":
      return `(?<![\\p{L}\\p{N}])(?:${node.alternatives.map(compileWord).join("|")})(?![\\p{L}\\p{N}])`;
    case "literal":
      return [...node.value].map(escapeRegex).join(CONTROL_PATTERN);
    case "sequence":
      return node.parts.map(compileInjectionGrammar).join(CONTROL_PATTERN);
    case "choice":
      return `(?:${node.options.map(compileInjectionGrammar).join("|")})`;
    case "optional":
      return `(?:${compileInjectionGrammar(node.node)})?`;
    case "separator":
      return SEPARATOR_PATTERN;
    case "gap":
      return `[\\s\\S]{0,${node.maximum}}`;
    case "sentence-start":
      return `(?:^${SENTENCE_PADDING_PATTERN}|[.!?]${SENTENCE_PADDING_PATTERN})`;
    case "delimiter-gap":
      return `[\\s${INJECTION_CONTROL_SENTINEL}:>\\-]{0,${node.maximum}}`;
    default:
      return exhaustive(node);
  }
}

const INJECTION_PATTERNS: readonly RegExp[] = Object.freeze(
  INJECTION_GRAMMAR.map((rule) => new RegExp(compileInjectionGrammar(rule), "u"))
);

const SUPPORT_MESSAGE_CODE_POINT_LIMIT = 2_000;

const ROMANIAN_WORDS = new Set([
  "acest", "această", "afisat", "afișat", "ale", "arată", "buget", "când", "ce",
  "cineva", "cont", "cum", "dezbatere", "dezbaterii", "dezbaterile", "disponibile",
  "este", "funcționează", "ghidul", "îmi", "început", "întâmplă", "nivelurile", "opțiuni",
  "persoană", "pot", "proprietarul", "publicarea", "răspunsul", "retrag", "să",
  "scriu", "sunt", "sursa", "telefon", "unde", "vizitatorii", "stricat", "merge", "nu"
]);

function boundedUnicodeSlice(message: string): string {
  let bounded = "";
  let count = 0;
  for (const codePoint of message) {
    if (count === SUPPORT_MESSAGE_CODE_POINT_LIMIT) break;
    bounded += codePoint;
    count += 1;
  }
  return bounded;
}

function normalized(message: string, controlReplacement: "" | " "): string {
  return message
    .replace(/[\p{Cc}\p{Cf}]/gu, controlReplacement)
    .replace(/\s+/gu, " ")
    .trim();
}

type PreparedMessage = Readonly<{
  injectionText: string;
  ordinaryViews: readonly string[];
}>;

function prepareMessage(message: string): PreparedMessage {
  const canonicalText = boundedUnicodeSlice(message).normalize("NFKC").toLocaleLowerCase("en-US");
  const injectionText = canonicalText.replace(
    /[\p{Cc}\p{Cf}]+/gu,
    INJECTION_CONTROL_SENTINEL
  );
  const deleted = normalized(injectionText, "");
  const separated = normalized(injectionText, " ");
  return Object.freeze({
    injectionText,
    ordinaryViews: Object.freeze(Array.from(new Set([deleted, separated])))
  });
}

function sensitiveIntentFamilyFromViews(
  views: readonly string[]
): SupportSensitiveIntentFamily | null {
  return SENSITIVE_INTENT_ORDER.find((family) =>
    SENSITIVE_INTENT_PATTERNS[family].some((pattern) =>
      views.some((text) => pattern.test(text)))) ?? null;
}

/** Shared bounded intent source for classifier and escalation side effects. */
export function supportSensitiveIntentFamily(message: string): SupportSensitiveIntentFamily | null {
  return sensitiveIntentFamilyFromViews(prepareMessage(message).ordinaryViews);
}

function detectPreparedLanguage(prepared: PreparedMessage): SupportLanguage {
  if (prepared.ordinaryViews.some((text) => /[ăâîșşțţ]/u.test(text))) return "ro";
  const tokens = prepared.ordinaryViews.flatMap((text) => text.match(/[\p{L}]+/gu) ?? []);
  return tokens.some((token) => ROMANIAN_WORDS.has(token)) ? "ro" : "en";
}

export function detectSupportLanguage(message: string): SupportLanguage {
  return detectPreparedLanguage(prepareMessage(message));
}

export function classifySupportMessage(message: string): SupportClassification {
  const prepared = prepareMessage(message);
  const views = prepared.ordinaryViews;
  const language = detectPreparedLanguage(prepared);
  const zone = ZONE_RULES.find((rule) => views.some((text) => rule.pattern.test(text)));
  if (zone !== undefined) {
    return Object.freeze({ outcome: "REFUSE_ZONE", language, link: zone.link });
  }
  const sensitiveFamily = sensitiveIntentFamilyFromViews(views);
  if (sensitiveFamily !== null && sensitiveFamily !== "account-erasure") {
    return Object.freeze({ outcome: "REFUSE_SAFETY",language,link: null });
  }
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(prepared.injectionText))) {
    return Object.freeze({ outcome: "REFUSE_INJECTION", language, link: null });
  }
  if (INCIDENT_PATTERNS.some((pattern) => views.some((view) => pattern.test(view)))) {
    return Object.freeze({ outcome: "INCIDENT", language, link: null });
  }
  return Object.freeze({ outcome: null, language, link: null });
}

export function supportIntentSurface(message: string):
  "debates" | "publishing" | "sign-in" | "whole-site" | null {
  const views = prepareMessage(message).ordinaryViews;
  if (views.some((view) => /\b(?:publish|publishing|unpublish)\b|\bpublic(?:a|are)\b/u.test(view))) {
    return "publishing";
  }
  if (views.some((view) => /\b(?:sign[ -]?in|log[ -]?in|login|autentific)\w*\b/u.test(view))) {
    return "sign-in";
  }
  if (views.some((view) => /\b(?:debate|debates|dezbatere|dezbateri|dezbaterile)\b/u.test(view))) {
    return "debates";
  }
  if (views.some((view) => /\b(?:site|whole site|everything|tot site-ul)\b/u.test(view))) {
    return "whole-site";
  }
  return null;
}
