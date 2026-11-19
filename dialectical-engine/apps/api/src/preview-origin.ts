/**
 * The preview setup's second public name: besides its test name, it may answer as the main site, and only in hosted
 * mode, where the spending gates and the per-person limits are in the path. The list of names lives in
 * deploy/preview-auth-dev/v1/public-origins.mjs (the launcher's check); this is the API's own copy for its start guard,
 * and a unit test pins the two equal.
 */
export const PREVIEW_MAIN_ORIGIN = "https://dezbatere.ro";

/** Whether a preview API may start under the main site's name: exactly that origin, in hosted mode. */
export function previewMainOriginAdmitted(environment: Readonly<{ PUBLIC_APP_URL: string; DEPLOYMENT_MODE: string }>): boolean {
  return environment.PUBLIC_APP_URL === PREVIEW_MAIN_ORIGIN && environment.DEPLOYMENT_MODE === "hosted";
}
