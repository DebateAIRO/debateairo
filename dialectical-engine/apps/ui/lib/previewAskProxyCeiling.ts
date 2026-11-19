import { parsePreviewRosterFlag } from "./previewPlanRoster.js";

const PREVIEW_ORIGIN = "https://v3-preview.dezbatere.ro";
/**
 * The public names the preview website may answer as: its test name (the default) and the main site's. The list lives
 * in deploy/preview-auth-dev/v1/public-origins.mjs (the launcher's check); this is the website's own copy, and a unit
 * test pins the two equal.
 */
export const PREVIEW_ASK_ORIGINS: readonly string[] = Object.freeze([PREVIEW_ORIGIN, "https://dezbatere.ro"]);
/**
 * The API's model discovery probes run in parallel, so an ask waits for one 600 s High probe,
 * plus up to 60 s for a slot, plus overhead.
 */
const PREVIEW_ASK_ADMISSION_TIMEOUT_MS = 1_260_000;

/**
 * Public preview build metadata opts in only the protected website's ask POST. The model flag
 * must be a reviewed preview roster (the same check the new-debate form uses); a malformed one
 * returns undefined and never throws. The browser's Origin must be the name the website is
 * configured to answer as (its PUBLIC_APP_URL, read when the request is served), and that name
 * must be a listed one; with none given, it is the test name.
 */
export function previewAskProxyCeiling(
  input: Readonly<{ method: string; path: readonly string[]; origin: string | null }>,
  previewFreeModelIdsJson: string | undefined,
  configuredOrigin: string | undefined = PREVIEW_ORIGIN
): number | undefined {
  if (input.method !== "POST" || input.path.length !== 2 || input.path[0] !== "v1"
    || input.path[1] !== "asks" || !PREVIEW_ASK_ORIGINS.some(listed => listed === configuredOrigin)
    || input.origin !== configuredOrigin || previewFreeModelIdsJson === undefined) return undefined;
  return parsePreviewRosterFlag(previewFreeModelIdsJson) === undefined ? undefined : PREVIEW_ASK_ADMISSION_TIMEOUT_MS;
}
