/**
 * The Turn 15 legal pages as DATA (design 15a): the six pages the side navigation and both
 * footers link to, and the facts the cookie, provider and versions pages state.
 *
 * Every fact here describes the running product, and `tests/render/legal-pages.test.tsx` pins
 * each one to the code that makes it true — the cookie names and lifetimes to the API and the
 * locale switcher, the storage keys to the consent store and the mode toggle, the model
 * families to `lib/models.ts`, the terms version to the terms document. The design's own
 * tables (`de_session`, an analytics cookie, five terms versions) were illustrations of a
 * product that does not exist yet, so they are not reproduced.
 *
 * Square brackets follow the legal drafts' convention: what only the owner or counsel can
 * confirm is shown bracketed, so the page never claims a fact nobody has verified.
 */

import { CONSENT_KEY } from "../consent";
import { LOCALE_COOKIE } from "../i18n/locales";

export type LegalPageKey = "terms" | "versions" | "privacy" | "cookies" | "providers" | "health";

export type LegalPageLink = Readonly<{ key: LegalPageKey; href: string; labelKey: string }>;

/** The design's order (15a side navigation, footer LEGAL column, 15b line, 15c grid). */
export const LEGAL_PAGES: readonly LegalPageLink[] = Object.freeze([
  { key: "terms", href: "/terms", labelKey: "chrome.legal.terms" },
  { key: "versions", href: "/terms/versions", labelKey: "chrome.legal.versions" },
  { key: "privacy", href: "/privacy", labelKey: "chrome.legal.privacy" },
  { key: "cookies", href: "/cookies", labelKey: "chrome.legal.cookies" },
  { key: "providers", href: "/providers", labelKey: "chrome.legal.providers" },
  { key: "health", href: "/privacy/us-health-data", labelKey: "chrome.legal.health" }
]);

export type LegalCookie = Readonly<{ name: string; purposeKey: string; lifeKey: string }>;

/**
 * The cookies the product sets, all strictly necessary. The session and CSRF names are the
 * API's (`apps/api/src/index.ts`, 14-day idle Max-Age); the locale cookie is written by the
 * language switcher (`lib/i18n/localeChoice.ts`, Max-Age one year).
 */
export const LEGAL_COOKIES: readonly LegalCookie[] = Object.freeze([
  { name: "__Host-debateai-session", purposeKey: "legal.cookies.session.purpose", lifeKey: "legal.cookies.session.life" },
  { name: "__Host-debateai-csrf", purposeKey: "legal.cookies.csrf.purpose", lifeKey: "legal.cookies.csrf.life" },
  { name: LOCALE_COOKIE, purposeKey: "legal.cookies.locale.purpose", lifeKey: "legal.cookies.locale.life" }
]);

export type LegalStorageItem = Readonly<{ name: string; purposeKey: string }>;

/** The browser-storage keys the UI writes; neither is ever sent to a server. */
export const LEGAL_BROWSER_STORAGE: readonly LegalStorageItem[] = Object.freeze([
  { name: CONSENT_KEY, purposeKey: "legal.cookies.consent.purpose" },
  { name: "debateai.mode", purposeKey: "legal.cookies.mode.purpose" }
]);

export type ModelProvider = Readonly<{
  /** The family key in `lib/models.ts`. */
  family: string;
  provider: string;
  models: string;
  /** A message key when the value is prose, or null when the models column is a brand name. */
  modelsKey: string | null;
  locationKey: string;
  basisKey: string;
}>;

/** One row per model family the product runs, in the registry's order. */
export const MODEL_PROVIDERS: readonly ModelProvider[] = Object.freeze([
  { family: "claude", provider: "Anthropic", models: "Claude", modelsKey: null, locationKey: "legal.providers.unitedStates", basisKey: "legal.providers.usBasis" },
  { family: "gpt", provider: "OpenAI", models: "GPT", modelsKey: null, locationKey: "legal.providers.unitedStates", basisKey: "legal.providers.usBasis" },
  { family: "gemini", provider: "Google", models: "Gemini", modelsKey: null, locationKey: "legal.providers.unitedStates", basisKey: "legal.providers.usBasis" },
  { family: "grok", provider: "xAI", models: "Grok", modelsKey: null, locationKey: "legal.providers.unitedStates", basisKey: "legal.providers.usBasis" },
  { family: "qwen", provider: "Qwen", models: "Qwen", modelsKey: "legal.providers.ownServers", locationKey: "legal.providers.ownLocation", basisKey: "legal.providers.noTransfer" }
]);

export type TermsVersion = Readonly<{
  version: string;
  dateKey: string;
  noteKey: string;
  current: boolean;
  href: string;
}>;

/**
 * Every published version of the terms, newest first. Only one exists: the version the terms
 * document carries in its eyebrow. A new version is added here when the document changes.
 */
export const TERMS_VERSIONS: readonly TermsVersion[] = Object.freeze([
  { version: "2.0", dateKey: "legal.versions.v2.date", noteKey: "legal.versions.v2.note", current: true, href: "/terms" }
]);
