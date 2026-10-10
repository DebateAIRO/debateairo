/**
 * The reviewed DeepInfra preview model ids and the maker of each. This mirrors
 * packages/providers/src/preview-models.ts (contract A §1); the UI keeps its own copy so the
 * browser bundle does not import the provider package. Change both together.
 */
const PREVIEW_MODEL_MAKERS: Readonly<Record<string, string>> = Object.freeze({
  "zai-org/GLM-5.3-Flash": "Z.AI",
  "deepseek-ai/DeepSeek-V4.1-Flash": "DeepSeek",
  "XiaomiMiMo/MiMo-V2.6-Pro": "Xiaomi"
});
const LEGACY_PREVIEW_MODEL = "zai-org/GLM-5.3-Flash";

export type PreviewRosters = Readonly<{ free: readonly string[]; premium: readonly string[] }>;

function reviewedRoster(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((id) => typeof id === "string" && Object.hasOwn(PREVIEW_MODEL_MAKERS, id))) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  return Object.freeze([...(value as string[])]);
}

function makers(roster: readonly string[]): Set<string> {
  return new Set(roster.map((id) => PREVIEW_MODEL_MAKERS[id]));
}

/**
 * Reads the public preview build flag (NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON) without throwing.
 * Two forms are accepted:
 * - the legacy array `["zai-org/GLM-5.3-Flash"]`: Free and Premium both run on that one model;
 * - an object `{"free":[...],"premium":[...]}` with exactly those two keys, each a non-empty list
 *   of unique reviewed ids. When the two lists together name two or more makers, each list must
 *   name at least two makers on its own.
 * Anything else returns undefined.
 */
export function parsePreviewRosterFlag(source: string): PreviewRosters | undefined {
  let decoded: unknown;
  try { decoded = JSON.parse(source); } catch { return undefined; }
  if (Array.isArray(decoded)) {
    if (decoded.length !== 1 || decoded[0] !== LEGACY_PREVIEW_MODEL) return undefined;
    // Step 1 (owner, 2026-10-08): Premium runs on the same single GLM on the private preview.
    return Object.freeze({ free: Object.freeze([LEGACY_PREVIEW_MODEL]), premium: Object.freeze([LEGACY_PREVIEW_MODEL]) });
  }
  if (decoded === null || typeof decoded !== "object" || Object.getPrototypeOf(decoded) !== Object.prototype) return undefined;
  const keys = Object.keys(decoded).sort();
  if (keys.length !== 2 || keys[0] !== "free" || keys[1] !== "premium") return undefined;
  const record = decoded as Record<string, unknown>;
  const free = reviewedRoster(record.free);
  const premium = reviewedRoster(record.premium);
  if (free === undefined || premium === undefined) return undefined;
  const allMakers = makers([...free, ...premium]);
  if (allMakers.size >= 2 && (makers(free).size < 2 || makers(premium).size < 2)) return undefined;
  return Object.freeze({ free, premium });
}

/** Public build metadata only. Normal builds preserve the contract's roster. */
export function previewPlanRoster<T extends PreviewRosters>(
  source: string | undefined,
  defaults: T
): PreviewRosters {
  if (source === undefined) return defaults;
  const rosters = parsePreviewRosterFlag(source);
  if (rosters === undefined) throw new TypeError("PREVIEW_FREE_MODEL_ROSTER_BUILD_FLAG_INVALID");
  return rosters;
}
