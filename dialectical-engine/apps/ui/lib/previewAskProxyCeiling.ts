import { parsePreviewRosterFlag } from "./previewPlanRoster.js";

const PREVIEW_ORIGIN = "https://v3-preview.dezbatere.ro";
/**
 * The API's model discovery probes run in parallel, so an ask waits for one 600 s High probe,
 * plus up to 60 s for a slot, plus overhead.
 */
const PREVIEW_ASK_ADMISSION_TIMEOUT_MS = 1_260_000;

/**
 * Public preview build metadata opts in only the protected website's ask POST. The model flag
 * must be a reviewed preview roster (the same check the new-debate form uses); a malformed one
 * returns undefined and never throws.
 */
export function previewAskProxyCeiling(
  input: Readonly<{ method: string; path: readonly string[]; origin: string | null }>,
  previewFreeModelIdsJson: string | undefined
): number | undefined {
  if (input.method !== "POST" || input.path.length !== 2 || input.path[0] !== "v1"
    || input.path[1] !== "asks" || input.origin !== PREVIEW_ORIGIN
    || previewFreeModelIdsJson === undefined) return undefined;
  return parsePreviewRosterFlag(previewFreeModelIdsJson) === undefined ? undefined : PREVIEW_ASK_ADMISSION_TIMEOUT_MS;
}
