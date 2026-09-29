/**
 * The Turn 15 legal pages as DATA (design 15a): the seven pages the side navigation and both
 * footers link to, and the facts the legal notice, cookie, provider and versions pages state.
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
import { LOCALE_COOKIE, type LocaleCode } from "../i18n/locales";

export type LegalPageKey = "notice" | "terms" | "versions" | "privacy" | "cookies" | "providers" | "health";

export type LegalPageLink = Readonly<{ key: LegalPageKey; href: string; labelKey: string }>;

/**
 * The design's order (15a side navigation, footer LEGAL column, 15b line, 15c grid), with the
 * legal notice first: who we are comes before the documents.
 */
export const LEGAL_PAGES: readonly LegalPageLink[] = Object.freeze([
  { key: "notice", href: "/legal", labelKey: "chrome.legal.notice" },
  { key: "terms", href: "/terms", labelKey: "chrome.legal.terms" },
  { key: "versions", href: "/terms/versions", labelKey: "chrome.legal.versions" },
  { key: "privacy", href: "/privacy", labelKey: "chrome.legal.privacy" },
  { key: "cookies", href: "/cookies", labelKey: "chrome.legal.cookies" },
  { key: "providers", href: "/providers", labelKey: "chrome.legal.providers" },
  { key: "health", href: "/privacy/us-health-data", labelKey: "chrome.legal.health" }
]);

export type VatStatus = Readonly<
  { kind: "unconfirmed" } | { kind: "registered"; number: string } | { kind: "not-registered" }
>;

export type Company = Readonly<{
  legalName: string;
  /** The names the product is sold under, the main one first. */
  tradingNames: readonly string[];
  registeredOffice: string;
  tradeRegisterNo: string;
  /** Codul unic de înregistrare, the Romanian tax identification code. */
  cui: string;
  vat: VatStatus;
  shareCapital: string;
  /** The person responsible for the company (its administrator). */
  representative: string;
  phone: string;
  emails: Readonly<{ general: string; legal: string; privacy: string; reports: string; authorities: string }>;
  /** The languages a person answers the mailboxes in, in the order the page names them. */
  languages: readonly LocaleCode[];
}>;

/**
 * The company and seller details the legal notice (`/legal`) states, required by Romanian Law
 * 365/2002 Art. 5, the EU Digital Services Act Arts. 11–12, the Consumer Rights Directive Art. 6
 * and Japan's Specified Commercial Transactions Act Art. 11. Facts live here and never in the
 * message catalogues, so filling a value once updates all 35 locales.
 *
 * A bracketed value is one nobody has verified yet (R4) and renders exactly as written, brackets
 * included; a bracketed email is shown as text, never as a link. Only the privacy address is
 * confirmed by the legal documents; the other addresses and the office come from the terms'
 * draft company table (`apps/ui/legal/en/terms-of-service.md` §1).
 */
export const COMPANY: Company = Object.freeze({
  legalName: "DebateAIRO S.R.L.",
  tradingNames: Object.freeze(["DebateAI", "Dialectical Engine"]),
  registeredOffice: "[…], București, România",
  tradeRegisterNo: "[J40/…/…]",
  cui: "[…]",
  vat: Object.freeze({ kind: "unconfirmed" }),
  shareCapital: "[RON …]",
  representative: "[…]",
  phone: "[+40 …]",
  emails: Object.freeze({
    general: "[hello@dezbatere.ro]",
    legal: "[legal@dezbatere.ro]",
    privacy: "privacy@dezbatere.ro",
    reports: "[abuse@dezbatere.ro]",
    authorities: "[dsa@dezbatere.ro]"
  }),
  languages: Object.freeze<LocaleCode[]>(["ro", "en"])
});

/** True for a fact still waiting for the owner or counsel (it carries the R4 brackets). */
export const isUnverified = (value: string): boolean => value.includes("[");

/**
 * The Romanian consumer authority's (ANPC) alternative dispute resolution service. The EU online
 * dispute resolution platform closed on 20 July 2025 and is deliberately not linked.
 */
export const ANPC_ADR_URL = "https://reclamatiisal.anpc.ro";

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
