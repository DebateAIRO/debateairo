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
  "about","agent","answer","cannot","cant","define","describe","does","explain","feature","features","give",
  "debate","identity","mean","meaning","overview","product","purpose","question","questions","support",
  "tell","tool","use","used","what","why",
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
const GENERIC_EVIDENCE_WORDS = new Set([
  ...STOP_WORDS,
  "about","after","before","does","every","exactly","explain","give","here","many","new","next",
  "open","please","product","products","read","section","should","support","that","what","where","which",
  "debate","debates","model","models",
  "acest","aceasta","anumita","care","ce","cum","deschid","dupa","explica","gasesc","mai",
  "nou","noua","noi","poate","pot","produs","produsul","sectiune","spune","suport","unde",
  "dezbatere","dezbaterea","dezbateri","dezbaterii","asistenta","modelul","modele"
]);
const ARTICLE_EVIDENCE_TEXT: Readonly<Record<string,string>> = Object.freeze({
  "app-navigation":"pricing preturi functioneaza account settings theme tema method transcript home library acasa biblioteca public compact help ajutor conversatie varianta",
  "browse-public-debates":"browse browsing anonymous visitor rasfoire rasfoi anonim biblioteca public",
  "budget-tier-choice":"budget buget tier nivel",
  "debate-topic-and-description":"topic description subiect descriere informatii",
  "delete-a-private-debate":"delete deletion stergere sterg private privata",
  "getting-started-debate":"start first begin beginning inceput pornesc prima",
  "debate-workspace-menus":"thread split tree map scoring replay workspace honesty fir impartit arbore harta evaluare repeta spatiu transparenta work functioneaza",
  "guide-how-it-works":"process workflow happens submit works work intampla trimit proces functioneaza",
  "public-answer-disclosure":"before reading read public answer disclosure inainte citesc raspuns",
  "publish-a-debate":"publish publishing publica publicare public",
  "risk-tier-choice":"risk risc tier nivel",
  "settings-help-menus":"account settings active sessions privacy preferences legacy claim deletion human case guide different setari sesiuni confidentialitate revendica vechi stergere persoana ghid diferenta umana caz",
  "support-cases":"support case human separate email escalation guide different asistenta caz uman separat email escaladare ghid diferenta",
  "support-status-limits":"public service status indicators limits answer stare serviciu indicatori limite raspunde",
  "unpublish-a-debate":"unpublish private again retragere retrage privata fac",
  "unsupported-capabilities":"cannot unavailable unsupported limitations limits not yet things nu indisponibil limitari limite lucruri face inca",
  "view-public-debate":"view open shared link public vad deschid distribuit legatura"
});

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

function evidenceWords(value: string): Set<string> {
  return new Set([...normalizeWords(value)].filter((word) => !GENERIC_EVIDENCE_WORDS.has(word)));
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
  const directWords = product.branded ? product.substantiveWords : evidenceWords(input.query);
  const articleEvidence = new Map(eligibleEntries.map((entry) => {
    const titleScore = overlapScore(directWords,entry.title);
    const projectionScore = overlapScore(directWords,entry.modelProjection ?? "");
    const aliasScore = overlapScore(directWords,ARTICLE_EVIDENCE_TEXT[entry.id] ?? "");
    const coverage = directWords.size === 0 ? 0
      : Math.max(titleScore,projectionScore) / directWords.size;
    const meaningful = aliasScore >= 2 || aliasScore >= 1 && titleScore >= 1
      || aliasScore >= 1 && directWords.size <= 2 || titleScore >= 2
      || directWords.size === 1 && projectionScore === 1
      || projectionScore >= 2 && coverage >= 0.6;
    return [entry.id,Object.freeze({
      titleScore,projectionScore,aliasScore,
      meaningful,
      score:aliasScore * 1_000_000 + titleScore * 1_000 + projectionScore
    })] as const;
  }));
  const matchedCapabilities = (identityRequest
    ? input.capabilities.filter(({ id }) => id === "product-identity").map((item) => ({
      item,score:1,catalogScore:0,articleScore:1,catalogComplete:false
    }))
    : input.capabilities
    .map((item) => ({
      item,
      catalogScore: overlapScore(
        scoringWords,
        `${item.labels[input.language]} ${item.searchTerms[input.language].join(" ")}`,
      ),
      articleScore: Math.max(0,...eligibleEntries
        .filter(({ id }) => item.articleIds.includes(id))
        .map((entry) => {
          const evidence = articleEvidence.get(entry.id);
          return evidence?.meaningful === true ? evidence.score : 0;
        })),
      catalogComplete:(() => {
        const required = normalizeWords(
          `${item.labels[input.language]} ${item.searchTerms[input.language].join(" ")}`
        );
        return required.size > 0 && overlapScore(required,input.query) === required.size;
      })(),
    }))
    .filter(({ catalogScore,articleScore }) => catalogScore >= 2 || articleScore > 0)
    .map(({ item,catalogScore,articleScore,catalogComplete }) => ({
      item,
      score: articleScore * 1_000 + catalogScore
        + (product.preferredArticleId !== null
          && item.articleIds.includes(product.preferredArticleId) ? 1_000_000_000 : 0),
      catalogScore,articleScore,catalogComplete,
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

  const capabilityArticleScore = new Map<string,Readonly<{
    score:number;strong:boolean;completeOrder:number
  }>>();
  const hasCompleteCatalogMatch = matchedCapabilities.some(({ catalogComplete }) => catalogComplete);
  for (const { item,score,catalogScore,catalogComplete } of matchedCapabilities) {
    item.articleIds.forEach((id,index) => {
      const weighted = score * 1_000 + item.articleIds.length - index;
      const current = capabilityArticleScore.get(id);
      capabilityArticleScore.set(id,Object.freeze({
        score:Math.max(current?.score ?? 0,weighted),
        strong:current?.strong === true
          || identityRequest && item.id === "product-identity" || catalogScore >= 2,
        completeOrder:Math.max(
          current?.completeOrder ?? 0,catalogComplete ? item.articleIds.length - index : 0
        )
      }));
    });
  }
  const ranked = eligibleEntries
    .map((entry) => ({
      entry,
      evidence:articleEvidence.get(entry.id)!,
      capability:capabilityArticleScore.get(entry.id),
      score: (capabilityArticleScore.get(entry.id)?.score ?? 0)
        + (capabilityArticleScore.get(entry.id)?.completeOrder ?? 0) * 10_000_000_000_000
        + (entry.id === product.preferredArticleId ? 1_000_000_000 : 0)
        + (articleEvidence.get(entry.id)?.score ?? 0) * 1_000_000,
    }))
    .filter(({ entry,evidence,capability }) => {
      if (!hasCompleteCatalogMatch && product.preferredArticleId !== null
        && entry.id !== product.preferredArticleId) {
        return evidence.aliasScore >= 2 || evidence.titleScore >= 2;
      }
      return evidence.meaningful || capability?.strong === true;
    })
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
