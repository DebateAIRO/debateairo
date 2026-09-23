import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { TypedDomainError } from "@debateai/kernel";
import { SUPPORT_LOCALES,type SupportLanguage } from "./locale.js";

export type { SupportLanguage } from "./locale.js";

export const OUTCOMES = Object.freeze([
  "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION",
  "REFUSE_SAFETY", "DEGRADED", "DISABLED", "RATE_LIMITED", "CASE_OPENED",
  "CONSENT_NEEDED", "ANON_CONTEXT", "REFUSE_OTHER_USER", "ANSWER_OWN_STATE",
  "ANSWER_INCIDENT", "NO_INCIDENT"
] as const);
export type SupportOutcome = typeof OUTCOMES[number];

export const SUPPORT_TEMPLATE_IDS = Object.freeze([
  "DISCLOSURE", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
  "DEGRADED", "DISABLED", "RATE_LIMITED", "RATING", "CASE_OPENED_MINIMAL", "CASE_OPENED",
  "HUMAN_LABEL", "NOT_FOUND", "CLOSED_LABEL", "SUMMARY_LABEL", "SOURCE_LINE",
  "INCIDENT_ACTIVE", "NO_INCIDENT", "INCIDENT_NOTICE", "QUEUED"
] as const);

export type SupportTemplateId = typeof SUPPORT_TEMPLATE_IDS[number];
export type SupportTemplateTable = Readonly<
  Record<SupportTemplateId,Readonly<Record<SupportLanguage,string>>>
>;

export class SupportTemplateError extends TypedDomainError {
  constructor(locale: string,id?: string) {
    super("SUPPORT_TEMPLATE_MISSING",`${locale}${id === undefined ? "" : `:${id}`}`);
    this.name = "SupportTemplateError";
  }
}

function templateDirectory(): string {
  return fileURLToPath(new URL("../content/templates/",import.meta.url));
}

export function loadSupportTemplates(directory: string = templateDirectory()): SupportTemplateTable {
  const byLocale = new Map<SupportLanguage,Readonly<Record<string,unknown>>>();
  for (const locale of SUPPORT_LOCALES) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(directory,`${locale}.json`),"utf8"));
    } catch {
      throw new SupportTemplateError(locale);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new SupportTemplateError(locale);
    }
    byLocale.set(locale,parsed as Readonly<Record<string,unknown>>);
  }

  return Object.freeze(Object.fromEntries(SUPPORT_TEMPLATE_IDS.map((id) => [
    id,
    Object.freeze(Object.fromEntries(SUPPORT_LOCALES.map((locale) => {
      const value = byLocale.get(locale)?.[id];
      if (typeof value !== "string" || value.length === 0) {
        throw new SupportTemplateError(locale,id);
      }
      return [locale,value];
    })))
  ]))) as SupportTemplateTable;
}

export const SUPPORT_TEMPLATES = loadSupportTemplates();

export function supportTemplate(id: SupportTemplateId,language: SupportLanguage): string {
  const value = SUPPORT_TEMPLATES[id]?.[language];
  if (value === undefined) throw new SupportTemplateError(language,id);
  return id === "INCIDENT_ACTIVE"
    ? value.replace("{summary_en}","{summary}").replace("{summary_ro}","{summary}")
    : value;
}

const SHREDDED_NOTICE_COPY = Object.freeze({
  en: "This conversation was erased at the owner's request.",
  ro: "Această conversație a fost ștearsă la cererea proprietarului."
});

export const SHREDDED_NOTICE = Object.freeze(Object.fromEntries(
  SUPPORT_LOCALES.map((locale) => [
    locale,locale === "ro" ? SHREDDED_NOTICE_COPY.ro : SHREDDED_NOTICE_COPY.en
  ])
)) as Readonly<Record<SupportLanguage,string>>;

export async function readSupportContent(input: Readonly<{
  shreddedAt: Date | null;
  destroyedAt: Date | null;
  language: SupportLanguage;
  read: () => Promise<string>;
}>): Promise<
  | Readonly<{ kind: "SHREDDED"; terminal: "[SHREDDED]"; notice: string }>
  | Readonly<{ kind: "READABLE"; content: string }>
> {
  if (input.shreddedAt !== null || input.destroyedAt !== null) {
    return Object.freeze({
      kind: "SHREDDED",
      terminal: "[SHREDDED]",
      notice: SHREDDED_NOTICE[input.language]
    });
  }
  return Object.freeze({ kind: "READABLE",content: await input.read() });
}
