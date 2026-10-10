import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SELLER_COMPANY, type SellerCompany } from "@debateai/billing-core";
import type { PriceCurrency } from "@debateai/billing-core";
import { MAIL_LOCALES, mailDirectionOf, mailLocaleOf, type MailLocale } from "./locales.js";
import {
  MAIL_TEMPLATES,
  type MailAttachmentFact,
  type MailParamCondition,
  type MailParamKind,
  type MailParamTest,
  type MailTemplateDefinition,
  type MailTemplateId
} from "./templates.js";

/** A refusal with a code; `detail` names a param or a catalogue key, never a value. */
export class MailTemplateError extends Error {
  readonly code: string;
  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}:${detail}`);
    this.name = "MailTemplateError";
    this.code = code;
  }
}

export type RenderedMail = Readonly<{ subject: string; text: string; html: string }>;

/**
 * The three company facts the emails print (Terms §1). Their one source is `COMPANY` (apps/ui/lib/legal/pages.ts,
 * ruling R3-4), which a package cannot import; the API and the mail read its one mirror, P6a's `SELLER_COMPANY`
 * (`@debateai/billing-core`), held equal to it by tests/unit/billing-seller-company.test.tsx.
 */
export type CompanyFacts = Readonly<{ legalName: string; registeredOffice: string; emailGeneral: string }>;

export function companyFactsOf(company: SellerCompany): CompanyFacts {
  return Object.freeze({
    legalName: company.legalName,
    registeredOffice: company.registeredOffice,
    emailGeneral: company.emails.general
  });
}

type Catalogue = Readonly<Record<string, string>>;
type Segment = Readonly<{ kind: "text" | "link" | "block"; value: string }>;

const PLAN_IDS: ReadonlySet<string> = new Set(["FREE", "PLUS", "PRO", "MAX"]);
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function mailMessagesDirectory(): string {
  return fileURLToPath(new URL("../messages/", import.meta.url));
}

/** One flat string table of this package's `messages/` (also read by order-text.ts); refuses anything else. */
export function readStringTable(directory: string, relativePath: string): Catalogue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(directory, relativePath), "utf8"));
  } catch {
    throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", relativePath);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    || Object.values(parsed).some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", relativePath);
  }
  return Object.freeze({ ...(parsed as Record<string, string>) });
}

export function loadMailCatalogues(directory: string = mailMessagesDirectory()): Readonly<Record<MailLocale, Catalogue>> {
  return Object.freeze(Object.fromEntries(
    MAIL_LOCALES.map((locale) => [locale, readStringTable(directory, `${locale}/mail.json`)])
  )) as Readonly<Record<MailLocale, Catalogue>>;
}

type LoadedCatalogues = Readonly<{
  mail: Readonly<Record<MailLocale, Catalogue>>;
  owner: Catalogue;
}>;

let loaded: LoadedCatalogues | null = null;

/**
 * The catalogues, read on the FIRST render and then kept. Never at import: apps/api imports this package in every
 * mode, and a malformed catalogue must only ever stop a billing email (the EMAIL job retries it), never the API's boot
 * in local mode or with billing off. A failed read is not kept, so the next render tries again once the file is fixed.
 */
function catalogues(): LoadedCatalogues {
  if (loaded === null) {
    const directory = mailMessagesDirectory();
    loaded = Object.freeze({
      mail: loadMailCatalogues(directory),
      owner: readStringTable(directory, "en/owner.json")
    });
  }
  return loaded;
}

/** The company facts the emails print (Terms §1), from SELLER_COMPANY, the one mirror of COMPANY (ruling R3-4). */
export function companyFacts(): CompanyFacts {
  return companyFactsOf(SELLER_COMPANY);
}

export type MailRenderOptions = Readonly<{
  /** What the message really carries (`mailAttachmentFactsOf`). Absent: nothing, so no sentence claims an attachment. */
  attached?: ReadonlySet<MailAttachmentFact>;
}>;

function invalid(name: string): MailTemplateError {
  return new MailTemplateError("MAIL_TEMPLATE_PARAM_INVALID", name);
}

/**
 * Spec 2026-10-05 §2.16.5: an email's amounts are in its charge's currency, `params.currency`, which any template with
 * an amount accepts without declaring it (one that prints the code, as O2_REFUND_DUE does, declares it too). An email
 * queued before Part C names none: it was in US dollars.
 */
const AMOUNT_CURRENCY_PARAM = "currency";
const PRICE_CURRENCIES: ReadonlySet<string> = new Set<PriceCurrency>(["USD", "EUR", "RON"]);

function amountCurrencyOf(params: Readonly<Record<string, string>>): PriceCurrency {
  const value = params[AMOUNT_CURRENCY_PARAM];
  if (value === undefined) return "USD";
  if (!PRICE_CURRENCIES.has(value)) throw invalid(AMOUNT_CURRENCY_PARAM);
  return value as PriceCurrency;
}

/**
 * The one url rule of the emails: an https link with no user or password, in its canonical form (`URL#toString`), at
 * most 2,048 characters. Returns that canonical form, or null when the value is not such a link. A url param renders
 * only when it already equals its canonical form, so a caller holding a foreign link passes it through this first.
 */
export function mailLinkOf(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  const canonical = url.toString();
  return canonical.length <= 2_048 ? canonical : null;
}

/** The shown segment of a param, or null for a flag (checked, never printed). */
function formatParam(
  kind: MailParamKind, name: string, value: string, locale: MailLocale, catalogue: Catalogue, currency: PriceCurrency
): Segment | null {
  switch (kind) {
    case "plan": {
      const label = PLAN_IDS.has(value) ? catalogue[`mail.plan.${value}`] : undefined;
      if (label === undefined) throw invalid(name);
      return { kind: "text", value: label };
    }
    case "amount":
      if (!/^\d{1,9}\.\d{2}$/.test(value)) throw invalid(name);
      return { kind: "text", value: new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value)) };
    case "date": {
      const at = new Date(value);
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value) || !Number.isFinite(at.getTime())) throw invalid(name);
      return { kind: "text", value: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(at) };
    }
    case "url":
      // A canonical serialisation holds no whitespace, so this is the rule's whole check.
      if (mailLinkOf(value) !== value) throw invalid(name);
      return { kind: "link", value };
    case "count":
      if (!/^\d{1,4}$/.test(value)) throw invalid(name);
      return { kind: "text", value: new Intl.NumberFormat(locale).format(Number(value)) };
    case "text":
      if (value.length === 0 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw invalid(name);
      return { kind: "text", value };
    case "block":
      if (value.length === 0 || value.length > 65_536 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw invalid(name);
      return { kind: "block", value };
    case "flag":
      if (value !== "true" && value !== "false") throw invalid(name);
      // Left out of the values on purpose: a catalogue sentence that printed {flag} fails as CATALOGUE_INVALID.
      return null;
    default:
      return exhaustive(kind);
  }
}

function exhaustive(value: never): never {
  throw new MailTemplateError("MAIL_TEMPLATE_PARAM_INVALID", String(value));
}

/** A param condition. The params were already checked, so an amount's only zero spelling is 0.00. */
function paramHolds(test: MailParamTest, raw: string | undefined): boolean {
  switch (test) {
    case "present":
      return raw !== undefined;
    case "true":
      return raw === "true";
    case "nonzero":
      return raw !== undefined && !/^0+\.00$/.test(raw);
    default:
      return exhaustive(test);
  }
}

/** The sentence a param condition picks, following a nested `otherwise` condition (P2-W4); null shows nothing. */
function conditionKey(condition: MailParamCondition, params: Readonly<Record<string, string>>): string | null {
  if (paramHolds(condition.test, params[condition.ifParam])) return condition.then;
  const otherwise = condition.otherwise;
  return otherwise === null || typeof otherwise === "string" ? otherwise : conditionKey(otherwise, params);
}

function interpolate(template: string, values: ReadonlyMap<string, Segment>, where: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const segment = values.get(match[1]!);
    if (segment === undefined) throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", `${where}:${match[1]}`);
    segments.push({ kind: "text", value: template.slice(last, match.index) }, segment);
    last = match.index + match[0].length;
  }
  segments.push({ kind: "text", value: template.slice(last) });
  return segments;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const asText = (segments: readonly Segment[]): string => segments.map((segment) => segment.value).join("");
const asHtml = (segments: readonly Segment[]): string => segments.map((segment) =>
  segment.kind === "link"
    ? `<a href="${escapeHtml(segment.value)}">${escapeHtml(segment.value)}</a>`
    : escapeHtml(segment.value)
).join("");

function merchantValues(company: CompanyFacts): Array<[string, Segment]> {
  return [
    ["merchantName", { kind: "text", value: company.legalName }],
    ["merchantAddress", { kind: "text", value: company.registeredOffice }],
    ["merchantEmail", { kind: "text", value: company.emailGeneral }]
  ];
}

export function renderMail(
  id: MailTemplateId,
  locale: string,
  params: Readonly<Record<string, string>>,
  options: MailRenderOptions = {}
): RenderedMail {
  const template = (MAIL_TEMPLATES as Readonly<Record<string, MailTemplateDefinition | undefined>>)[id];
  if (template === undefined) throw new MailTemplateError("MAIL_TEMPLATE_UNKNOWN");
  const { mail: mailCatalogues, owner } = catalogues();
  const company = companyFacts();
  const attached: ReadonlySet<MailAttachmentFact> = options.attached ?? new Set();
  const mailLocale: MailLocale = template.catalogue === "owner" ? "en" : mailLocaleOf(locale);
  const catalogue: Catalogue = template.catalogue === "owner"
    ? Object.freeze({ ...mailCatalogues.en, ...owner })
    : mailCatalogues[mailLocale];
  const optional: Readonly<Record<string, MailParamKind>> = template.optional ?? {};
  const showsAmount = Object.values({ ...template.params, ...optional }).includes("amount");
  for (const name of Object.keys(params)) {
    if (showsAmount && name === AMOUNT_CURRENCY_PARAM) continue;
    if (!Object.hasOwn(template.params, name) && !Object.hasOwn(optional, name)) {
      throw new MailTemplateError("MAIL_TEMPLATE_PARAM_UNKNOWN", name);
    }
  }
  const currency = amountCurrencyOf(params);
  const values = new Map<string, Segment>(merchantValues(company));
  for (const [name, kind] of Object.entries(template.params)) {
    const raw = params[name];
    if (raw === undefined) throw new MailTemplateError("MAIL_TEMPLATE_PARAM_MISSING", name);
    const segment = formatParam(kind, name, raw, mailLocale, catalogue, currency);
    if (segment !== null) values.set(name, segment);
  }
  // An optional param left out has no value, so only a sentence shown when it is present may name it.
  for (const [name, kind] of Object.entries(optional)) {
    const raw = params[name];
    if (raw === undefined) continue;
    const segment = formatParam(kind, name, raw, mailLocale, catalogue, currency);
    if (segment !== null) values.set(name, segment);
  }
  const lookup = (key: string): string => {
    const value = catalogue[key] ?? mailCatalogues.en[key];
    if (value === undefined) throw new MailTemplateError("MAIL_TEMPLATE_CATALOGUE_INVALID", key);
    return value;
  };
  const subject = asText(interpolate(lookup(template.subject), values, template.subject));
  if (/[\r\n]/.test(subject)) throw new MailTemplateError("MAIL_TEMPLATE_SUBJECT_INVALID");
  const paragraphs = template.paragraphs.flatMap((paragraph): Segment[][] => {
    if (typeof paragraph === "string") return [interpolate(lookup(paragraph), values, paragraph)];
    if ("ifAttached" in paragraph) {
      // A26(b): a sentence may say "attached" only when the message carries the file.
      const key = attached.has(paragraph.ifAttached) ? paragraph.attached : paragraph.missing;
      return [interpolate(lookup(key), values, key)];
    }
    if ("ifParam" in paragraph) {
      const key = conditionKey(paragraph, params);
      return key === null ? [] : [interpolate(lookup(key), values, key)];
    }
    const block = values.get(paragraph.block);
    if (block === undefined) throw new MailTemplateError("MAIL_TEMPLATE_PARAM_MISSING", paragraph.block);
    return [[block]];
  });
  const greeting = lookup("mail.common.greeting");
  const signoff = lookup("mail.common.signoff");
  const footer = asText(interpolate(lookup("mail.common.footer"), values, "mail.common.footer"));
  const text = [greeting, ...paragraphs.map(asText), signoff].join("\n\n") + `\n\n-- \n${footer}\n`;
  const htmlParagraphs = paragraphs.map((segments) =>
    segments.length === 1 && segments[0]!.kind === "block"
      ? `<pre style="white-space:pre-wrap;font-family:monospace">${escapeHtml(segments[0]!.value)}</pre>`
      : `<p>${asHtml(segments)}</p>`
  );
  const html = [
    "<!doctype html>",
    `<html lang="${mailLocale}" dir="${mailDirectionOf(mailLocale)}">`,
    `<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">',
    `<p>${escapeHtml(greeting)}</p>`,
    ...htmlParagraphs,
    `<p>${escapeHtml(signoff)}</p>`,
    '<hr style="border:none;border-top:1px solid #dddddd">',
    `<p style="font-size:12px">${escapeHtml(footer)}</p>`,
    "</body></html>",
    ""
  ].join("\n");
  return Object.freeze({ subject, text, html });
}

/** The EU model withdrawal form (Directive 2011/83/EU Annex I(B)) as plain text, attached to M1. */
export function renderWithdrawalForm(locale: string): string {
  const { mail: mailCatalogues } = catalogues();
  const catalogue = mailCatalogues[mailLocaleOf(locale)];
  const values = new Map<string, Segment>(merchantValues(companyFacts()));
  const line = (key: string): string => asText(interpolate(catalogue[key] ?? mailCatalogues.en[key] ?? "", values, key));
  return [
    line("mail.withdrawalForm.title"), "",
    line("mail.withdrawalForm.instruction"), "",
    line("mail.withdrawalForm.to"), "",
    line("mail.withdrawalForm.notice"), "",
    line("mail.withdrawalForm.orderedOn"),
    line("mail.withdrawalForm.name"),
    line("mail.withdrawalForm.address"),
    line("mail.withdrawalForm.signature"),
    line("mail.withdrawalForm.date"),
    ""
  ].join("\n");
}
