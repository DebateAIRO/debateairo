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
  legalName: "DMS Merchandise Shop S.R.L.",
  tradingNames: Object.freeze(["Dialectical Engine"]),
  registeredOffice: "Str. 1 Decembrie 1918 nr. 80A, Piatra Neamț, județul Neamț, România",
  tradeRegisterNo: "J2022000426271",
  cui: "45935221",
  // The company is VAT-registered (owner, 29 September 2026; ANAF: VAT-registered since 1 February 2023).
  vat: Object.freeze({ kind: "registered", number: "RO45935221" }),
  shareCapital: "5.000 RON",
  representative: "Dedita Ionut Ciprian",
  phone: "+40 748 793 490",
  emails: Object.freeze({
    general: "support@dezbatere.ro",
    legal: "support@dezbatere.ro",
    privacy: "privacy@dezbatere.ro",
    reports: "support@dezbatere.ro",
    authorities: "office@dezbatere.ro"
  }),
  languages: Object.freeze<LocaleCode[]>(["ro", "en"])
});

/** True for a fact still waiting for the owner or counsel (it carries the R4 brackets). */
export const isUnverified = (value: string): boolean => value.includes("[");

/**
 * The alternative dispute resolution route Terms section 18 and Annex A.1 name (owner's worksheet,
 * 9 October 2026). The EU online dispute resolution platform closed on 20 July 2025 and is
 * deliberately not linked.
 */
export const ADR_URL = "https://www.onoratainstanta.ro";

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
 * Browser-storage keys the UI writes: two in local storage and five in session storage. The
 * export link token is sent to the Dialectical Engine server when redeemed; the link outcome stays in the
 * browser. The help-chat name is literal so this page does not pull in the support widget.
 */
export const LEGAL_BROWSER_STORAGE: readonly LegalInventoryItem[] = Object.freeze([
  { name: CONSENT_KEY, kindKey: "legal.cookies.consent.kind", purposeKey: "legal.cookies.consent.purpose", lifeKey: "legal.cookies.consent.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.mode", kindKey: "legal.cookies.mode.kind", purposeKey: "legal.cookies.mode.purpose", lifeKey: "legal.cookies.mode.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: LANGUAGE_OFFER_DISMISSED_KEY, kindKey: "legal.cookies.languageOffer.kind", purposeKey: "legal.cookies.languageOffer.purpose", lifeKey: "legal.cookies.languageOffer.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.support.conversation.v2", kindKey: "legal.cookies.supportConversation.kind", purposeKey: "legal.cookies.supportConversation.purpose", lifeKey: "legal.cookies.supportConversation.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.phone-completion-draft.v1", kindKey: "legal.cookies.supportConversation.kind", purposeKey: "legal.cookies.phoneDraft.purpose", lifeKey: "legal.cookies.phoneDraft.life", recipientKey: "legal.cookies.recipient.browser" },
  { name: "debateai.exportPending", kindKey: "legal.cookies.languageOffer.kind", purposeKey: "legal.cookies.exportPending.purpose", lifeKey: "legal.cookies.exportPending.life", recipientKey: "legal.cookies.recipient.server" },
  { name: "debateai.exportLinkOutcome", kindKey: "legal.cookies.languageOffer.kind", purposeKey: "legal.cookies.exportLinkOutcome.purpose", lifeKey: "legal.cookies.exportLinkOutcome.life", recipientKey: "legal.cookies.recipient.browser" }
]);

/** All current stored items, cookies first, in the order /cookies and the storage card list them. */
export const LEGAL_INVENTORY: readonly LegalInventoryItem[] = Object.freeze([...LEGAL_COOKIES, ...LEGAL_BROWSER_STORAGE]);

/** The kind/purpose/life strings of LEGAL_INVENTORY picked out of a legal catalogue (missing keys are left out). */
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
  /** The family key in `lib/models.ts`, "support" for the support chat's model, or an unchecked company's key (`host:<hostname>`, ruling R20). */
  key: string;
  /** The row heading: a brand name, or null when `nameKey` names the row. */
  provider: string | null;
  nameKey: string | null;
  /** The models this company serves us: a reviewed fact the page no longer shows (addition D24: providers, not models). */
  models: string;
  /** A message key when the value is prose, or null when the models fact is a brand name. */
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

/**
 * One row per model family the product runs, in the registry's order. `entity` is the contracting party the
 * provider's published API terms name for a business customer in the EEA (looked up 10 October 2026: Anthropic
 * Commercial Terms; OpenAI Services Agreement/DPA; Google Cloud contracting-entity table; xAI enterprise terms).
 * A `contact` is filled only where the provider's own privacy policy confirms it; the others stay bracketed.
 * The owner confirmed on 10 October 2026 that each family runs on the provider's direct API under those terms, so the
 * entities lost their brackets and `checkedOn` records that date. Location, retention, zero retention and training stay
 * "unconfirmed" until the production endpoints and account settings are fixed. Since addition D24 (owner 2026-10-22)
 * none of these hosted rows reaches `/providers`: the page lists the companies the API's declared targets reach
 * (`providerRegister`), and no declared target is one of these rows.
 */
export const MODEL_PROVIDERS: readonly ProviderRegisterEntry[] = Object.freeze([
  { ...UNCHECKED_CLOUD, key: "claude", provider: "Anthropic", models: "Claude", entity: "Anthropic Ireland, Limited", homeCountryKey: "legal.providers.ireland", contact: "privacy@anthropic.com", checkedOn: "2026-10-10" },
  { ...UNCHECKED_CLOUD, key: "gpt", provider: "OpenAI", models: "GPT", entity: "OpenAI Ireland Limited", homeCountryKey: "legal.providers.ireland", checkedOn: "2026-10-10" },
  { ...UNCHECKED_CLOUD, key: "gemini", provider: "Google", models: "Gemini", entity: "Google Cloud EMEA Limited", homeCountryKey: "legal.providers.ireland", checkedOn: "2026-10-10" },
  { ...UNCHECKED_CLOUD, key: "grok", provider: "xAI", models: "Grok", entity: "X.AI LLC", checkedOn: "2026-10-10" },
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
    basisKey: "legal.providers.ukAdequacy",
    contact: COMPANY.emails.privacy,
    checkedOn: null
  }
]);

/**
 * The support chat calls one model of its own (`apps/api/src/support/model.ts`): Claude Haiku 5.5
 * on Anthropic's API (owner, 12 October 2026). Its facts are the ones checked against Anthropic's
 * published terms on 10 October 2026 for the preview's Anthropic row (`ANTHROPIC_PREVIEW_PROVIDER`
 * below; `docs/legal/2026-10-10-preview-provider-facts.md`): a customer in the EEA contracts with
 * Anthropic Ireland, Limited; API inputs and outputs are deleted within 30 days unless flagged for
 * misuse or the law requires more; zero data retention needs Anthropic's approval, which we do not
 * have; no training on customer content; transfers under standard contractual clauses.
 */
export const SUPPORT_PROVIDER: ProviderRegisterEntry = Object.freeze({
  key: "support",
  provider: null,
  nameKey: "legal.providers.supportName",
  models: "Claude Haiku 5.5",
  modelsKey: null,
  entity: "Anthropic Ireland, Limited",
  homeCountryKey: "legal.providers.ireland",
  purposes: Object.freeze<ProviderPurpose[]>(["support"]),
  purposesConfirmed: true,
  locationKey: "legal.providers.locationAnthropic",
  retentionKey: "legal.providers.retentionAnthropic",
  zeroRetention: "no",
  training: "no",
  basisKey: "legal.providers.sccBasis",
  contact: "privacy@anthropic.com",
  checkedOn: "2026-10-10"
});

/**
 * The four open-weight models DeepInfra serves on the private preview, each made by another company (named in
 * brackets). Kept as the DeepInfra row's `models` fact; the page no longer shows models (addition D24, owner
 * 2026-10-22: providers only, not the models). Facts checked against the vendors' published terms: see
 * `docs/legal/2026-10-10-preview-provider-facts.md`.
 */
const PREVIEW_DEEPINFRA_MODELS: ReadonlyArray<readonly [id: string, label: string]> = Object.freeze([
  ["zai-org/GLM-5.3-Flash", "GLM-5.3-Flash (Z.AI)"],
  ["deepseek-ai/DeepSeek-V4.1-Flash", "DeepSeek-V4.1-Flash (DeepSeek)"],
  ["XiaomiMiMo/MiMo-V2.6-Pro", "MiMo-V2.6-Pro (Xiaomi)"],
  ["Qwen/Qwen3.8-Flash", "Qwen3.8-Flash (Alibaba)"]
] as const);

/**
 * Serving company for the private preview's open-weight models; terms reviewed 5 October 2026 and
 * rechecked 10 October 2026. Listed whenever the API's declared targets reach `api.deepinfra.com`
 * (company `deepinfra`, addition D24), and when the API gives no answer. Its jobs are confirmed: every
 * panel member writes and judges arguments, GLM writes the answer and the verdict story, DeepSeek
 * checks both (the first preview's GLM alone does all three).
 */
export const DEEPINFRA_PROVIDER: ProviderRegisterEntry = Object.freeze({
  ...UNCHECKED_CLOUD,
  key: "deepinfra",
  provider: "DeepInfra",
  models: PREVIEW_DEEPINFRA_MODELS.map(([, label]) => label).join(", "),
  entity: "Deep Infra Inc.",
  purposesConfirmed: true,
  // Published terms exclude model training. Endpoint-specific retention and transfer facts
  // remain explicitly unconfirmed until operational/contractual validation is complete.
  training: "no",
  basisKey: "legal.providers.unconfirmed",
  contact: "policy@deepinfra.com",
  checkedOn: "2026-10-05"
});

/**
 * Anthropic's API as the private preview uses it (Claude Haiku 5.5), checked 10 October 2026: a
 * customer in the EEA contracts with Anthropic Ireland, Limited (Commercial Terms); API inputs and
 * outputs are deleted within 30 days unless flagged for misuse or the law requires more (privacy
 * center); zero data retention needs Anthropic's approval, which the preview does not have; no
 * training on customer content (Commercial Terms B); transfers under standard contractual clauses
 * (Data Processing Addendum). Listed whenever the API's declared targets reach `api.anthropic.com`
 * (company `anthropic`, addition D24), and when the API gives no answer; the hosted-site placeholder
 * row for Claude never shows, so the page never shows Anthropic twice.
 */
export const ANTHROPIC_PREVIEW_PROVIDER: ProviderRegisterEntry = Object.freeze({
  ...UNCHECKED_CLOUD,
  key: "claude",
  provider: "Anthropic",
  models: "Claude Haiku 5.5",
  entity: "Anthropic Ireland, Limited",
  homeCountryKey: "legal.providers.ireland",
  // One of the five launch models (owner, 12 October 2026): role rotation gives it every debate job.
  purposesConfirmed: true,
  locationKey: "legal.providers.locationAnthropic",
  retentionKey: "legal.providers.retentionAnthropic",
  zeroRetention: "no",
  training: "no",
  basisKey: "legal.providers.sccBasis",
  contact: "privacy@anthropic.com",
  checkedOn: "2026-10-10"
});

/**
 * Google's Gemini API, paid tier only, as the private preview uses it (Gemini 3.8 Flash), checked
 * 10 October 2026: for a billing address in Romania the contracting entity is Google Cloud EMEA
 * Limited (Google Contracting Entity page, "Gemini API Paid Services"); paid prompts and responses
 * are not used to improve Google's products and are logged 55 days for abuse monitoring, in any
 * country where Google or its agents have facilities (Gemini API terms and usage policies); zero
 * data retention is guaranteed only on Vertex AI, not on this API. Google's EU–US Data Privacy
 * Framework listing could not be read, so the transfer basis stays bracketed. Kept for later: no
 * company the API answers maps to it (addition D24), so it shows nowhere today.
 */
export const GOOGLE_PREVIEW_PROVIDER: ProviderRegisterEntry = Object.freeze({
  ...UNCHECKED_CLOUD,
  key: "gemini",
  provider: "Google",
  models: "Gemini 3.8 Flash",
  entity: "Google Cloud EMEA Limited",
  homeCountryKey: "legal.providers.ireland",
  locationKey: "legal.providers.locationGoogle",
  retentionKey: "legal.providers.retentionGoogle",
  zeroRetention: "no",
  training: "no",
  basisKey: "legal.providers.usBasis",
  contact: "legal-notices@google.com",
  checkedOn: "2026-10-10"
});

/**
 * Addition D24 (owner's answer to Q-L6, 2026-10-22: providers only, not the models, listed automatically): the
 * reviewed catalogue, keyed by the company keys the API answers on `GET /v1/public/ai-providers`
 * (`providerCompaniesOfTargets`, `PROVIDER_COMPANY_HOSTS` in `@debateai/providers`), in the order the page shows
 * them. A person checks each row's facts; only the choice of rows is automatic.
 */
const REVIEWED_PROVIDER_COMPANIES = Object.freeze([
  ["anthropic", ANTHROPIC_PREVIEW_PROVIDER],
  ["deepinfra", DEEPINFRA_PROVIDER]
] as const);
const REVIEWED_COMPANY_KEYS: ReadonlySet<string> = new Set(REVIEWED_PROVIDER_COMPANIES.map(([company]) => company));
/** The prefix the API gives a public host no catalogue row knows yet (ruling R20). */
const HOST_COMPANY_PREFIX = "host:";

/**
 * Ruling R20: a company the catalogue does not know yet (a hosted vendor nobody has reviewed) is still shown, headed
 * by its host name, with every fact "[to confirm]" and "[not checked yet]" (existing keys only), so the page never
 * hides a company that receives text.
 */
function uncheckedCompanyEntry(company: string): ProviderRegisterEntry {
  const name = company.startsWith(HOST_COMPANY_PREFIX) ? company.slice(HOST_COMPANY_PREFIX.length) : company;
  return Object.freeze({
    ...UNCHECKED_CLOUD,
    key: company,
    provider: name,
    models: "",
    entity: "[…]",
    homeCountryKey: "legal.providers.unconfirmed",
    purposesConfirmed: false
  });
}

/**
 * The AI Provider Register, in the order `/providers` shows it (addition D24, owner 2026-10-22: "providers only,
 * not the models, listed automatically"). `companies` is the API's answer (`readAiProviderCompanies`): the
 * companies its declared provider targets reach. Each reviewed company it names gets its checked row, Anthropic
 * then DeepInfra; each other company (`host:<hostname>`) one unchecked row headed by its host name, sorted; the
 * support chat's model always last. No answer (`null`) or an empty list lists the whole reviewed catalogue: a legal
 * page discloses rather than hides. No row names a model, so a model or line-up change never changes the page, and
 * the hosted cloud rows (`MODEL_PROVIDERS`: OpenAI, xAI, Google, the own-servers Qwen) never show, since no
 * declared target reaches them. Never throws.
 */
export function providerRegister(companies: readonly string[] | null): readonly ProviderRegisterEntry[] {
  const named = companies === null || companies.length === 0
    ? null
    : new Set(companies.filter((company) => typeof company === "string" && company.length > 0));
  const reviewed = REVIEWED_PROVIDER_COMPANIES
    .filter(([company]) => named === null || named.size === 0 || named.has(company))
    .map(([, entry]) => entry);
  const unchecked = named === null ? [] : [...named].filter((company) => !REVIEWED_COMPANY_KEYS.has(company)).sort()
    .map(uncheckedCompanyEntry);
  return Object.freeze([...reviewed, ...unchecked, SUPPORT_PROVIDER]);
}

export type TermsVersion = Readonly<{
  version: string;
  dateKey: string;
  noteKey: string;
  current: boolean;
  href: string;
}>;

/**
 * Every published version of the terms, newest first. Each earlier row links to the exact text
 * that was current before the next revision.
 */
export const TERMS_VERSIONS: readonly TermsVersion[] = Object.freeze([
  { version: "2.4", dateKey: "legal.versions.v2.date", noteKey: "legal.versions.v2.note", current: true, href: "/terms" },
  { version: "2.3", dateKey: "legal.versions.v2.date", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/0535525218bb7c975ea4f8459bc2011a494efed363bee79d6382805ad5981f6c" },
  { version: "2.2", dateKey: "legal.versions.v2.date", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/fcffb706c7ab2dcbfa09594dd5b0686e274cc5ba3e3a4377573f5b771c07a660" },
  { version: "2.1", dateKey: "legal.versions.v2.date", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/34bab40dea5ccdcaba5dc167106e8b6d9bdc08c676f82a2c84e68fd9809c8b0c" },
  { version: "2.0", dateKey: "legal.versions.v2.date", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/0d1bc079eb2d5b054c1cfc7c0430f234ca5391bd6e6824ecc8958a294f6eaa0e" }
]);
