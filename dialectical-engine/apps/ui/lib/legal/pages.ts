/**
 * The Turn 15 legal pages as DATA (design 15a): the seven pages the side navigation and both
 * footers link to, and the facts the legal notice, cookie, provider and versions pages state.
 *
 * Every fact here describes the running product, and `tests/render/legal-pages.test.tsx` pins
 * each one to the code that makes it true — the lifetimes to the Max-Age the API, the contract
 * and the locale switcher set, the model families to `lib/models.ts`, the terms version to the
 * terms document. The complete current cookie and browser-storage inventory is the
 * inventory of record: `tests/unit/cookie-inventory-drift.test.ts` scans the source for every
 * cookie and storage write and fails when the product stores a name not listed here, or this
 * file lists a name nothing stores. The design's own
 * tables (`de_session`, an analytics cookie, five terms versions) were illustrations of a
 * product that does not exist yet, so they are not reproduced.
 *
 * Square brackets follow the legal drafts' convention: what only the owner or counsel can
 * confirm is shown bracketed, so the page never claims a fact nobody has verified.
 */

import { CONSENT_KEY } from "../consent.js";
import { LANGUAGE_OFFER_DISMISSED_KEY } from "../i18n/localeChoice.js";
import { LOCALE_COOKIE, type LocaleCode } from "../i18n/locales.js";
import type { MessageCatalog } from "../i18n/translate.js";

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
  // The company is VAT-registered (owner, 29 September 2026); the RO VAT code stays bracketed until the owner fills it.
  vat: Object.freeze({ kind: "registered", number: "[RO…]" }),
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

/**
 * One stored item /cookies and the storage card list: its name as the code writes it, and the
 * `legal.json` keys of its kind, purpose and lifetime (each item has its own), plus who receives it.
 */
export type LegalInventoryItem = Readonly<{
  name: string;
  kindKey: string;
  purposeKey: string;
  lifeKey: string;
  recipientKey: "legal.cookies.recipient.server" | "legal.cookies.recipient.browser";
}>;

/**
 * The cookies the product sets, all strictly necessary. The session and CSRF names are the
 * API's (`apps/api/src/index.ts`, 14-day idle Max-Age), the age-refusal cookie is set by the API
 * when an age check is refused (`AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS`, 30 days, in
 * `packages/contract`), and the locale cookie is written by the language switcher
 * (`lib/i18n/localeChoice.ts`, Max-Age one year).
 */
export const LEGAL_COOKIES: readonly LegalInventoryItem[] = Object.freeze([
  { name: "__Host-debateai-session", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.session.purpose", lifeKey: "legal.cookies.session.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-csrf", kindKey: "legal.cookies.csrf.kind", purposeKey: "legal.cookies.csrf.purpose", lifeKey: "legal.cookies.csrf.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-age-refusal", kindKey: "legal.cookies.ageRefusal.kind", purposeKey: "legal.cookies.ageRefusal.purpose", lifeKey: "legal.cookies.ageRefusal.life", recipientKey: "legal.cookies.recipient.server" },
  { name: LOCALE_COOKIE, kindKey: "legal.cookies.locale.kind", purposeKey: "legal.cookies.locale.purpose", lifeKey: "legal.cookies.locale.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-staff", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.staff.purpose", lifeKey: "legal.cookies.staff.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-staff-csrf", kindKey: "legal.cookies.csrf.kind", purposeKey: "legal.cookies.csrf.purpose", lifeKey: "legal.cookies.staff.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-password-reset", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.passwordReset.purpose", lifeKey: "legal.cookies.passwordReset.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-password-reset-csrf", kindKey: "legal.cookies.csrf.kind", purposeKey: "legal.cookies.csrf.purpose", lifeKey: "legal.cookies.passwordReset.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-mfa-recovery", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.mfaRecovery.purpose", lifeKey: "legal.cookies.mfaRecovery.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-mfa-recovery-csrf", kindKey: "legal.cookies.csrf.kind", purposeKey: "legal.cookies.csrf.purpose", lifeKey: "legal.cookies.mfaRecovery.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-social-flow", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.social.purpose", lifeKey: "legal.cookies.social.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-social-apple", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.social.purpose", lifeKey: "legal.cookies.social.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "__Host-debateai-social-browser", kindKey: "legal.cookies.session.kind", purposeKey: "legal.cookies.social.purpose", lifeKey: "legal.cookies.social.life", recipientKey: "legal.cookies.recipient.server" }
]);

/**
 * The four browser-storage keys the UI writes, none ever sent to a server: two in local storage
 * (the notice acknowledgement, the display mode) and two in session storage (the declined
 * language offer, the help-chat conversation — `components/support/conversation.ts`, named here
 * as a literal so the page does not pull the support widget in).
 */
export const LEGAL_BROWSER_STORAGE: readonly LegalInventoryItem[] = Object.freeze([
  { name: CONSENT_KEY, kindKey: "legal.cookies.consent.kind", purposeKey: "legal.cookies.consent.purpose", lifeKey: "legal.cookies.consent.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.mode", kindKey: "legal.cookies.mode.kind", purposeKey: "legal.cookies.mode.purpose", lifeKey: "legal.cookies.mode.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: LANGUAGE_OFFER_DISMISSED_KEY, kindKey: "legal.cookies.languageOffer.kind", purposeKey: "legal.cookies.languageOffer.purpose", lifeKey: "legal.cookies.languageOffer.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.support.conversation.v2", kindKey: "legal.cookies.supportConversation.kind", purposeKey: "legal.cookies.supportConversation.purpose", lifeKey: "legal.cookies.supportConversation.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.phone-completion-draft.v1", kindKey: "legal.cookies.supportConversation.kind", purposeKey: "legal.cookies.phoneDraft.purpose", lifeKey: "legal.cookies.phoneDraft.life", recipientKey: "legal.cookies.recipient.browser" }
]);

/** All current stored items, cookies first, in the order /cookies and the storage card list them. */
export const LEGAL_INVENTORY: readonly LegalInventoryItem[] = Object.freeze([...LEGAL_COOKIES, ...LEGAL_BROWSER_STORAGE]);

/** The 24 kind/purpose/life strings of LEGAL_INVENTORY picked out of a legal catalogue (missing keys are left out). */
export function inventoryCopy(legal: MessageCatalog): MessageCatalog {
  const copy: Record<string, string> = {};
  for (const { kindKey, purposeKey, lifeKey } of LEGAL_INVENTORY) {
    for (const key of [kindKey, purposeKey, lifeKey]) {
      if (Object.hasOwn(legal, key)) copy[key] = legal[key]!;
    }
  }
  return Object.freeze(copy);
}

/** The jobs a provider can be given, and so why it receives text (PP §5 "what it receives and for what purpose"). */
export type ProviderPurpose = "arguments" | "judging" | "story" | "support";

export const PROVIDER_PURPOSES: readonly ProviderPurpose[] = Object.freeze(["arguments", "judging", "story", "support"]);

/** A yes/no fact from the provider's contract, or "unconfirmed" until someone has read that contract. */
export type ContractFlag = "yes" | "no" | "unconfirmed";

/**
 * One row of the AI Provider Register, which the Privacy Policy (§5) makes part of the policy and
 * which Japan (APPI Art. 28) and South Korea (PIPA Art. 28-8) require for overseas transfers. It is
 * shown to every user, not only in those two countries.
 *
 * Bracketed facts and "unconfirmed" flags are placeholders (R4): the production roster and the
 * contracts are settled when the product is hosted, and a row is only filled in, and given a
 * `checkedOn` date, once someone has checked it against the provider's current terms.
 */
export type ProviderRegisterEntry = Readonly<{
  /** The family key in `lib/models.ts`, or "support" for the support chat's model. */
  key: string;
  /** The row heading: a brand name, or null when `nameKey` names the row. */
  provider: string | null;
  nameKey: string | null;
  models: string;
  /** A message key when the value is prose, or null when the models column is a brand name. */
  modelsKey: string | null;
  /** The legal entity we contract with — a fact, bracketed until the contract names it. */
  entity: string;
  homeCountryKey: string;
  /** Every job this provider can be given; `purposesConfirmed` is false until the roster is fixed. */
  purposes: readonly ProviderPurpose[];
  purposesConfirmed: boolean;
  locationKey: string;
  retentionKey: string;
  /** Zero data retention for the endpoint and features we use; "notNeeded" when the text never leaves our servers. */
  zeroRetention: ContractFlag | "notNeeded";
  training: ContractFlag;
  basisKey: string;
  /** Where to write to the provider about your data (Korea) — a fact, bracketed until confirmed. */
  contact: string;
  /** The ISO date (YYYY-MM-DD) the row was last checked against the provider's terms, or null. */
  checkedOn: string | null;
}>;

/** The fields a cloud model provider shares until its contract has been checked. */
const UNCHECKED_CLOUD = Object.freeze({
  nameKey: null,
  modelsKey: null,
  homeCountryKey: "legal.providers.unitedStates",
  purposes: Object.freeze<ProviderPurpose[]>(["arguments", "judging", "story"]),
  purposesConfirmed: false,
  /** Set by the endpoint and region chosen at hosting time, so unconfirmed until then. */
  locationKey: "legal.providers.unconfirmed",
  retentionKey: "legal.providers.unconfirmed",
  zeroRetention: "unconfirmed",
  training: "unconfirmed",
  basisKey: "legal.providers.usBasis",
  contact: "[…]",
  checkedOn: null
} as const);

/** One row per model family the product runs, in the registry's order. */
export const MODEL_PROVIDERS: readonly ProviderRegisterEntry[] = Object.freeze([
  { ...UNCHECKED_CLOUD, key: "claude", provider: "Anthropic", models: "Claude", entity: "[Anthropic …]" },
  { ...UNCHECKED_CLOUD, key: "gpt", provider: "OpenAI", models: "GPT", entity: "[OpenAI …]" },
  { ...UNCHECKED_CLOUD, key: "gemini", provider: "Google", models: "Gemini", entity: "[Google …]" },
  { ...UNCHECKED_CLOUD, key: "grok", provider: "xAI", models: "Grok", entity: "[xAI …]" },
  {
    key: "qwen",
    provider: "Qwen",
    nameKey: null,
    models: "Qwen",
    modelsKey: "legal.providers.ownServers",
    entity: COMPANY.legalName,
    homeCountryKey: "legal.providers.romania",
    purposes: Object.freeze<ProviderPurpose[]>(["arguments", "judging", "story"]),
    purposesConfirmed: false,
    locationKey: "legal.providers.ownLocation",
    retentionKey: "legal.providers.retentionAsDebate",
    zeroRetention: "notNeeded",
    training: "no",
    basisKey: "legal.providers.noTransfer",
    contact: COMPANY.emails.privacy,
    checkedOn: null
  }
]);

/**
 * The support chat calls one model of its own (`apps/api/src/support/model.ts`), chosen when the
 * product is hosted; until then every fact about it is a placeholder.
 */
export const SUPPORT_PROVIDER: ProviderRegisterEntry = Object.freeze({
  key: "support",
  provider: null,
  nameKey: "legal.providers.supportName",
  models: "[…]",
  modelsKey: null,
  entity: "[…]",
  homeCountryKey: "legal.providers.unconfirmed",
  purposes: Object.freeze<ProviderPurpose[]>(["support"]),
  purposesConfirmed: true,
  locationKey: "legal.providers.unconfirmed",
  retentionKey: "legal.providers.unconfirmed",
  zeroRetention: "unconfirmed",
  training: "unconfirmed",
  basisKey: "legal.providers.unconfirmed",
  contact: "[…]",
  checkedOn: null
});

/** The whole Register, in the order `/providers` shows it. */
/** Serving company for the selected private-preview GLM endpoint; terms reviewed 5 October 2026. */
export const DEEPINFRA_PROVIDER: ProviderRegisterEntry = Object.freeze({
  ...UNCHECKED_CLOUD,
  key: "deepinfra",
  provider: "DeepInfra",
  models: "GLM-5.3-Flash (Z.AI)",
  entity: "Deep Infra Inc.",
  purposesConfirmed: true,
  // Published terms exclude model training. Endpoint-specific retention and transfer facts
  // remain explicitly unconfirmed until operational/contractual validation is complete.
  training: "no",
  basisKey: "legal.providers.unconfirmed",
  contact: "policy@deepinfra.com",
  checkedOn: "2026-10-05"
});

export const PROVIDER_REGISTER: readonly ProviderRegisterEntry[] = Object.freeze([...MODEL_PROVIDERS, DEEPINFRA_PROVIDER, SUPPORT_PROVIDER]);

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
