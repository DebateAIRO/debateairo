/** Public build metadata only. Normal builds preserve the contract's roster. */
export function previewPlanRoster<T extends Readonly<{ free: readonly string[]; premium: readonly string[] }>>(
  source: string | undefined,
  defaults: T
): Readonly<{ free: readonly string[]; premium: readonly string[] }> {
  if (source === undefined) return defaults;
  let decoded: unknown;
  try { decoded = JSON.parse(source); } catch { throw new TypeError("PREVIEW_FREE_MODEL_ROSTER_BUILD_FLAG_INVALID"); }
  if (!Array.isArray(decoded) || decoded.length !== 1 || decoded[0] !== "zai-org/GLM-5.3-Flash") {
    throw new TypeError("PREVIEW_FREE_MODEL_ROSTER_BUILD_FLAG_INVALID");
  }
  return Object.freeze({ free: Object.freeze(["zai-org/GLM-5.3-Flash"]), premium: defaults.premium });
}
