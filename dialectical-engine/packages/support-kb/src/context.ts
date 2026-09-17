import type { HelpCorpusEntry } from "./index.js";
import {
  SUPPORT_ACTION_CATALOG,type SupportActionId,type SupportCapability,type SupportLanguage
} from "./catalog.js";

export type SupportKnowledgeReference<CanonicalId extends string = string> = Readonly<{
  reference: string;
  canonicalId: CanonicalId;
}>;

export type SupportKnowledgeContext = Readonly<{
  text: string;
  sourceIds: readonly string[];
  requestedActionIds: readonly SupportActionId[];
  sourceReferences: readonly SupportKnowledgeReference[];
  actionReferences: readonly SupportKnowledgeReference<SupportActionId>[];
}>;

const POLICY: Readonly<Record<SupportLanguage, readonly string[]>> = Object.freeze({
  en: Object.freeze([
    "Use only the reviewed sources and capability catalog below.",
    "Never request, receive, repeat, or submit credentials or security codes.",
    "Never claim that Support changed account or security state.",
    "Use only the request references listed in the output contract; never invent a URL.",
    "Describe unavailable, local-only, conditional, and owner-only behavior honestly.",
  ]),
  ro: Object.freeze([
    "Folosește numai sursele verificate și catalogul de capabilități de mai jos.",
    "Nu solicita, primi, repeta sau trimite niciodată parole ori coduri de securitate.",
    "Nu afirma niciodată că Asistența a schimbat starea contului sau a securității.",
    "Folosește numai referințele cererii enumerate în contractul de ieșire; nu inventa un URL.",
    "Descrie corect comportamentele indisponibile, locale, condiționate și rezervate proprietarului.",
  ]),
});

const STOP_WORDS = new Set([
  "and", "are", "can", "for", "from", "how", "the", "this", "with",
  "care", "cum", "din", "este", "pentru", "prin", "sau", "unui",
]);

const PRODUCT_ALIAS_SOURCE = String.raw`\b(?:dialectical(?:[\s-]*engine)|debate\s*airo)\b`;
const PRODUCT_OVERVIEW_WORDS = new Set([
  "about","agent","answer","cannot","cant","define","describe","does","explain","feature","features",
  "identity","mean","meaning","overview","product","purpose","question","questions","support",
  "tell","use","used","what","why",
  "asistent","asistentul","capabilitati","despre","explica","face","folosit","folosita",
  "identitate","intrebare","intrebari","poate","prezentare","produs","raspund","raspunde",
  "scop","spune"
]);
const GENERIC_BRANDED_WORDS = new Set([
  ...PRODUCT_OVERVIEW_WORDS,
  "allow","allows","assist","assistance","help","helps","offer","offers","provide","provides",
  "service","services","tool","tools",
  "ajuta","ajutor","asistenta","ofera","serviciu","servicii"
]);

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en");
}

function normalizeWords(value: string): Set<string> {
  return new Set(
    normalizedText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

function productQuery(value: string): Readonly<{
  branded: boolean;
  identityOverview: boolean;
  normalized: string;
  preferredArticleId: string | null;
  substantiveWords: Set<string>;
  words: Set<string>;
}> {
  const normalized = normalizedText(value);
  const branded = new RegExp(PRODUCT_ALIAS_SOURCE,"u").test(normalized);
  const withoutBrand = branded
    ? normalized.replace(new RegExp(PRODUCT_ALIAS_SOURCE,"gu")," ") : normalized;
  const words = normalizeWords(withoutBrand);
  const substantiveWords = new Set([...words].filter((word) => !GENERIC_BRANDED_WORDS.has(word)));
  const identityOverview = branded && (
    words.size === 0 || [...words].every((word) => PRODUCT_OVERVIEW_WORDS.has(word))
  );
  const preferredArticleId = /\b(?:publish|publishing)\b/u.test(normalized)
    || /\bcum\s+public\p{L}*\b/u.test(normalized)
    ? "publish-a-debate" : null;
  return Object.freeze({
    branded,identityOverview,normalized,preferredArticleId,substantiveWords,words
  });
}

function overlapScore(query: Set<string>, value: string): number {
  const words = normalizeWords(value);
  let score = 0;
  for (const queryWord of query) {
    if ([...words].some((candidate) => candidate === queryWord
      || inflectedMatch(candidate,queryWord))) {
      score += 1;
    }
  }
  return score;
}

function inflectedMatch(left: string,right: string): boolean {
  const shorter = Math.min(left.length,right.length);
  if (shorter < 4) return false;
  let common = 0;
  while (common < shorter && left[common] === right[common]) common += 1;
  return common >= 4 && common / shorter >= 0.75;
}

function baseSection(
  capabilities: readonly SupportCapability[],
  language: SupportLanguage,
  availableActionIds: ReadonlySet<SupportActionId>,
): string {
  const policy = POLICY[language].map((line) => `- ${line}`).join("\n");
  const actionById = new Map(SUPPORT_ACTION_CATALOG.map((action) => [action.id,action]));
  const availability: Readonly<Record<SupportCapability["availability"],Readonly<Record<SupportLanguage,string>>>> = {
    public: { en:"available to all visitors",ro:"disponibilă tuturor vizitatorilor" },
    "signed-out": { en:"available to signed-out visitors",ro:"disponibilă vizitatorilor neautentificați" },
    "signed-in": { en:"available to signed-in visitors",ro:"disponibilă vizitatorilor autentificați" },
    owner: { en:"available only in verified owner context",ro:"disponibilă numai într-un context verificat de proprietar" },
    "public-reference": { en:"available with a verified public debate reference",ro:"disponibilă cu o referință verificată la o dezbatere publică" },
    unresolved: { en:"destination not yet verified",ro:"destinație încă neverificată" },
    excluded: { en:"not available through Support",ro:"indisponibilă prin Asistență" }
  };
  const catalog = capabilities.map((item) => {
    const available = item.actionIds.filter((id) => availableActionIds.has(id));
    const actions = available.length === 0 ? "none" : available
      .map((id) => actionById.get(id)?.labels[language])
      .filter((label): label is string => label !== undefined).join(", ");
    return `- ${item.labels[language]} | ${availability[item.availability][language]} | actions=${actions}`;
  }).join("\n");
  return `SUPPORT POLICY\n${policy}\n\nCAPABILITY CATALOG\n${catalog}`;
}

function articleSection(entry: HelpCorpusEntry,reference: string): string {
  return `\n\nSOURCE ${reference}\n${entry.modelProjection ?? ""}`;
}

function outputContract(
  sourceIds: readonly string[],actionIds: readonly string[]
): string {
  return [
    "\n\nOUTPUT CONTRACT",
    `sourceIds=${sourceIds.join(",") || "none"}`,
    `actionIds=${actionIds.join(",") || "none"}`,
  ].join("\n");
}

export function buildSupportKnowledgeContext(input: Readonly<{
  entries: readonly HelpCorpusEntry[];
  capabilities: readonly SupportCapability[];
  language: SupportLanguage;
  query: string;
  historyText: "";
  maxCodePoints: number;
  availableActionIds: readonly SupportActionId[];
  referenceFor(kind: "source" | "action",index: number): string;
}>): SupportKnowledgeContext {
  if (input.historyText !== "") throw new Error("SUPPORT_KB_HISTORY_NOT_AVAILABLE_IN_CP1");
  const availableActionIds = new Set(input.availableActionIds);
  const base = baseSection(input.capabilities,input.language,availableActionIds);

  const product = productQuery(input.query);
  const queryWords = product.words;
  const eligibleEntries = input.entries.filter(({ lang,modelProjection }) =>
    lang === input.language && modelProjection !== undefined
  );
  const identityEntryScore = Math.max(0,...eligibleEntries
    .filter(({ id }) => id === "product-identity")
    .map((entry) => overlapScore(product.substantiveWords,`${entry.title}\n${entry.modelProjection}`)));
  const identityFactQuestion = product.branded
    && /(?:^|\s)(?:what|why|is|este|define|defineste|definește|describe|descrie|explain|explica|explică)\b/u.test(product.normalized)
    && identityEntryScore >= Math.max(1,product.substantiveWords.size - 1);
  const identityRequest = product.identityOverview || identityFactQuestion;
  const scoringWords = product.branded ? product.substantiveWords : queryWords;
  const matchedCapabilities = (identityRequest
    ? input.capabilities.filter(({ id }) => id === "product-identity").map((item) => ({ item,score:1 }))
    : input.capabilities
    .map((item) => ({
      item,
      catalogScore: overlapScore(
        scoringWords,
        `${item.labels[input.language]} ${item.searchTerms[input.language].join(" ")}`,
      ),
      articleScore: Math.max(0,...eligibleEntries
        .filter(({ id }) => item.articleIds.includes(id))
        .map((entry) => overlapScore(scoringWords,entry.title) * 100
          + overlapScore(scoringWords,entry.modelProjection ?? "") * 10)),
    }))
    .filter(({ catalogScore,articleScore }) => catalogScore > 0
      && (!product.branded || articleScore > 0))
    .map(({ item,catalogScore,articleScore }) => ({
      item,
      score: product.branded
        ? articleScore * 1_000 + catalogScore
          + (product.preferredArticleId !== null
            && item.articleIds.includes(product.preferredArticleId) ? 1_000_000 : 0)
        : catalogScore,
    }))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id, "en")));
  const actionIds: SupportActionId[] = [];
  const seen = new Set<SupportActionId>();
  const bestCapabilityScore = matchedCapabilities[0]?.score ?? 0;
  for (const { item,score } of matchedCapabilities) {
    if (score !== bestCapabilityScore) break;
    for (const actionId of item.actionIds) {
      if (seen.has(actionId) || !availableActionIds.has(actionId)) continue;
      seen.add(actionId);
      actionIds.push(actionId);
      if (actionIds.length === 3) break;
    }
    if (actionIds.length === 3) break;
  }
  const actionReferences = actionIds.map((canonicalId,index) => Object.freeze({
    reference:input.referenceFor("action",index),canonicalId
  }));
  if ([...`${base}${outputContract([],actionReferences.map(({ reference }) => reference))}`].length
    > input.maxCodePoints) {
    throw new Error("SUPPORT_KB_CONTEXT_LIMIT_TOO_SMALL");
  }

  const capabilityArticleScore = new Map<string,number>();
  for (const { item,score } of matchedCapabilities) {
    item.articleIds.forEach((id,index) => {
      const weighted = score * 1_000 + item.articleIds.length - index;
      capabilityArticleScore.set(id,Math.max(capabilityArticleScore.get(id) ?? 0,weighted));
    });
  }
  const ranked = eligibleEntries
    .map((entry) => ({
      entry,
      score: (capabilityArticleScore.get(entry.id) ?? 0)
        + (entry.id === product.preferredArticleId ? 1_000_000_000 : 0)
        + (product.branded
          ? overlapScore(scoringWords,entry.title) * 100
            + overlapScore(scoringWords,entry.modelProjection ?? "") * 10
          : overlapScore(queryWords, `${entry.title}\n${entry.body}`)),
    }))
    .filter(({ entry,score }) => score > 0
      && (!product.branded || capabilityArticleScore.has(entry.id)))
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id, "en"));

  let text = base;
  const sourceIds: string[] = [];
  const sourceReferences: SupportKnowledgeReference[] = [];
  for (const { entry } of ranked) {
    if (sourceIds.length >= 3) break;
    const reference = input.referenceFor("source",sourceIds.length);
    const section = articleSection(entry,reference);
    if ([...`${text}${section}${outputContract(
      [...sourceReferences.map((item) => item.reference),reference],
      actionReferences.map((item) => item.reference)
    )}`].length
      > input.maxCodePoints) continue;
    text += section;
    sourceIds.push(entry.id);
    sourceReferences.push(Object.freeze({ reference,canonicalId:entry.id }));
  }
  text += outputContract(
    sourceReferences.map(({ reference }) => reference),
    actionReferences.map(({ reference }) => reference)
  );

  const aliases = [...sourceReferences,...actionReferences].map(({ reference }) => reference);
  const canonicalIds = new Set([
    ...input.capabilities.map(({ id }) => id),
    ...input.capabilities.flatMap(({ articleIds }) => articleIds),
    ...SUPPORT_ACTION_CATALOG.map(({ id }) => id)
  ]);
  if (new Set(aliases).size !== aliases.length
    || aliases.some((alias) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(alias)
      || canonicalIds.has(alias))) {
    throw new Error("SUPPORT_KB_MODEL_REFERENCE_INVALID");
  }

  return Object.freeze({
    text,
    sourceIds: Object.freeze(sourceIds),
    requestedActionIds: Object.freeze(actionIds),
    sourceReferences: Object.freeze(sourceReferences),
    actionReferences: Object.freeze(actionReferences)
  });
}
