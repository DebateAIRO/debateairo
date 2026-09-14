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

function normalizeWords(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("en")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
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
  return `\n\nSOURCE ${reference}\nTITLE: ${entry.title}\n${entry.body}`;
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

  const queryWords = normalizeWords(input.query);
  const matchedCapabilities = input.capabilities
    .map((item) => ({
      item,
      score: overlapScore(
        queryWords,
        `${item.labels[input.language]} ${item.searchTerms[input.language].join(" ")}`,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id, "en"));
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
  const ranked = input.entries
    .filter(({ lang }) => lang === input.language)
    .map((entry) => ({
      entry,
      score: (capabilityArticleScore.get(entry.id) ?? 0)
        + overlapScore(queryWords, `${entry.title}\n${entry.body}`),
    }))
    .filter(({ score }) => score > 0)
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
