import type { HelpCorpusEntry } from "./index.js";
import type { SupportActionId, SupportCapability, SupportLanguage } from "./catalog.js";

export type SupportKnowledgeContext = Readonly<{
  text: string;
  sourceIds: readonly string[];
  requestedActionIds: readonly SupportActionId[];
}>;

const POLICY: Readonly<Record<SupportLanguage, readonly string[]>> = Object.freeze({
  en: Object.freeze([
    "Use only the reviewed sources and capability catalog below.",
    "Never request, receive, repeat, or submit credentials or security codes.",
    "Never claim that Support changed account or security state.",
    "Name actions only by their closed action id; never invent a URL.",
    "Describe unavailable, local-only, conditional, and owner-only behavior honestly.",
  ]),
  ro: Object.freeze([
    "Folosește numai sursele verificate și catalogul de capabilități de mai jos.",
    "Nu solicita, primi, repeta sau trimite niciodată parole ori coduri de securitate.",
    "Nu afirma niciodată că Asistența a schimbat starea contului sau a securității.",
    "Numește acțiunile numai prin identificatorul lor închis; nu inventa un URL.",
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

function baseSection(capabilities: readonly SupportCapability[], language: SupportLanguage): string {
  const policy = POLICY[language].map((line) => `- ${line}`).join("\n");
  const catalog = capabilities.map((item) => {
    const actions = item.actionIds.length === 0 ? "none" : item.actionIds.join(", ");
    return `- ${item.id}: ${item.labels[language]} | route=${item.route} | availability=${item.availability} | actions=${actions}`;
  }).join("\n");
  return `SUPPORT POLICY\n${policy}\n\nCAPABILITY CATALOG\n${catalog}`;
}

function articleSection(entry: HelpCorpusEntry): string {
  return `\n\nSOURCE ${entry.id}\nTITLE: ${entry.title}\n${entry.body}`;
}

function outputContract(
  sourceIds: readonly string[],actionIds: readonly SupportActionId[]
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
}>): SupportKnowledgeContext {
  if (input.historyText !== "") throw new Error("SUPPORT_KB_HISTORY_NOT_AVAILABLE_IN_CP1");
  const base = baseSection(input.capabilities, input.language);

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
      if (seen.has(actionId)) continue;
      seen.add(actionId);
      actionIds.push(actionId);
      if (actionIds.length === 3) break;
    }
    if (actionIds.length === 3) break;
  }
  if ([...`${base}${outputContract([],actionIds)}`].length > input.maxCodePoints) {
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
  for (const { entry } of ranked) {
    if (sourceIds.length >= 3) break;
    const section = articleSection(entry);
    if ([...`${text}${section}${outputContract([...sourceIds,entry.id],actionIds)}`].length
      > input.maxCodePoints) continue;
    text += section;
    sourceIds.push(entry.id);
  }
  text += outputContract(sourceIds,actionIds);

  return Object.freeze({
    text,
    sourceIds: Object.freeze(sourceIds),
    requestedActionIds: Object.freeze(actionIds),
  });
}
