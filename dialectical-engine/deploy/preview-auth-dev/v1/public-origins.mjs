import { PREVIEW_ORIGIN, PREVIEW_SITE_KEY } from './turnstile-custody.mjs';
/**
 * The public names this server setup may answer as, and nothing else: the test name, which is the default, and the main
 * site's name. A release's PUBLIC_APP_URL must be exactly one of these origins (no trailing slash, no www, no other
 * spelling). The main name is admitted only in hosted mode, where the spending gates and the per-person limits are in
 * the path. Both names use the same Turnstile widget, so the site key and its installed secret are the same.
 */
export const MAIN_ORIGIN = 'https://dezbatere.ro';
export const PUBLIC_SITES = Object.freeze([
  Object.freeze({ origin: PREVIEW_ORIGIN, hostname: 'v3-preview.dezbatere.ro', turnstileSiteKey: PREVIEW_SITE_KEY, hostedOnly: false }),
  Object.freeze({ origin: MAIN_ORIGIN, hostname: 'dezbatere.ro', turnstileSiteKey: PREVIEW_SITE_KEY, hostedOnly: true })
]);
export const PUBLIC_ORIGINS = Object.freeze(PUBLIC_SITES.map(site => site.origin));
/** The listed site whose origin is exactly this text, or undefined. */
export const publicSiteOf = value => PUBLIC_SITES.find(site => site.origin === value);
