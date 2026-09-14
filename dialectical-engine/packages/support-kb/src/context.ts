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
  for (const word of query) if (words.has(word)) score += 1;
  return score;
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
  if ([...base].length > input.maxCodePoints) throw new Error("SUPPORT_KB_CONTEXT_LIMIT_TOO_SMALL");

  const queryWords = normalizeWords(input.query);
  const ranked = input.entries
    .filter(({ lang }) => lang === input.language)
    .map((entry) => ({ entry, score: overlapScore(queryWords, `${entry.title}\n${entry.body}`) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id, "en"));

  let text = base;
  const sourceIds: string[] = [];
  for (const { entry } of ranked) {
    if (sourceIds.length >= 3) break;
    const section = articleSection(entry);
    if ([...text, ...section].length > input.maxCodePoints) continue;
    text += section;
    sourceIds.push(entry.id);
  }

  const actionIds: SupportActionId[] = [];
  const seen = new Set<SupportActionId>();
  const matchedCapabilities = input.capabilities
    .map((item) => ({
      item,
      score: overlapScore(queryWords, `${item.labels[input.language]} ${item.searchTerms[input.language].join(" ")}`),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id, "en"));
  for (const { item } of matchedCapabilities) {
    for (const actionId of item.actionIds) {
      if (seen.has(actionId)) continue;
      seen.add(actionId);
      actionIds.push(actionId);
      if (actionIds.length === 3) break;
    }
    if (actionIds.length === 3) break;
  }

  return Object.freeze({
    text,
    sourceIds: Object.freeze(sourceIds),
    requestedActionIds: Object.freeze(actionIds),
  });
}
