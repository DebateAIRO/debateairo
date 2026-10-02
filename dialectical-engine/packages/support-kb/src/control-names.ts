import type { HelpCorpusEntry } from "./index.js";
import type { SupportLanguage } from "./locale.js";
import { SUPPORT_CONTROL_NAMES } from "./ui-labels.js";

/**
 * cookie-compliance S05 (SPEC-v4 R03, V-18): the `context` strings of
 * docs/missions/cookie-compliance/slices/S05/checks/parity-exclusions.json as the orchestrator froze them at S05's
 * base. An en label inside one of these sentences is not the name of a control, so the sentence stays verbatim
 * English in every locale. Guard R03-PROTECTED (ARCH-CC-S05 guards-s05.py) compares this list with that file.
 */
export const SUPPORT_CONTROL_NAME_PROTECTED_PHRASES: readonly string[] = Object.freeze([
  "Export a debate as JSON",
  "The Privacy policy, Terms of service, Cookies and Legal notice pages",
]);

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const patterns = new Map<SupportLanguage, Readonly<{ pattern: RegExp; names: ReadonlyMap<string, string> }> | null>();

function compiled(language: SupportLanguage) {
  if (!patterns.has(language)) {
    const pairs = SUPPORT_CONTROL_NAMES[language];
    patterns.set(language, pairs.length === 0 ? null : Object.freeze({
      names: new Map<string, string>(pairs),
      pattern: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...SUPPORT_CONTROL_NAME_PROTECTED_PHRASES, ...pairs.map(([en]) => en)]
        .sort((left, right) => right.length - left.length).map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "gu")
    }));
  }
  return patterns.get(language)!;
}

/** Each lexicon control's en label in `text` becomes its screen label in `language`; en and ro are returned as is. */
export function localizeSupportControlNames(text: string, language: SupportLanguage): string {
  const table = compiled(language);
  return table === null ? text : text.replace(table.pattern, (match) => table.names.get(match) ?? match);
}
export function supportSourceLabel(entry: Pick<HelpCorpusEntry, "title">, language: SupportLanguage): string {
  return localizeSupportControlNames(entry.title, language);
}
export function supportSourceProjection(entry: Pick<HelpCorpusEntry, "modelProjection">, language: SupportLanguage): string {
  return localizeSupportControlNames(entry.modelProjection ?? "", language);
}
export function supportRecoveryFallback(entry: Pick<HelpCorpusEntry, "fallback">, language: SupportLanguage): string | undefined {
  return entry.fallback === undefined ? undefined : localizeSupportControlNames(entry.fallback, language);
}
