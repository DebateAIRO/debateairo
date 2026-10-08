const PREVIEW_ORIGIN = "https://v3-preview.dezbatere.ro";
const PREVIEW_MODEL = "zai-org/GLM-5.3-Flash";
/** Two serialized 600 s High discovery calls, with 60 s admission overhead. */
const PREVIEW_ASK_ADMISSION_TIMEOUT_MS = 1_260_000;

/** Public preview build metadata opts in only the protected website's ask POST. */
export function previewAskProxyCeiling(
  input: Readonly<{ method: string; path: readonly string[]; origin: string | null }>,
  previewFreeModelIdsJson: string | undefined
): number | undefined {
  if (input.method !== "POST" || input.path.length !== 2 || input.path[0] !== "v1"
    || input.path[1] !== "asks" || input.origin !== PREVIEW_ORIGIN
    || previewFreeModelIdsJson === undefined) return undefined;
  let models: unknown;
  try { models = JSON.parse(previewFreeModelIdsJson); } catch { return undefined; }
  return Array.isArray(models) && models.length === 1 && models[0] === PREVIEW_MODEL
    ? PREVIEW_ASK_ADMISSION_TIMEOUT_MS : undefined;
}
