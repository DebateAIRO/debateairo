import { z } from "zod";
import { CatalogLocaleCodeSchema } from "./locale.js";

/*
 * V4 start step, Task 9: moved unchanged from index.ts (which re-exports this file), so the start step's contract
 * (start-paths.ts) can use the site language and the question-language choice without importing index.ts.
 * NamedLanguageSchema is now exported.
 */

/** The 35 site locales (apps/ui/messages/<locale>): the language the person's page is in (question-language spec 2026-10-13, L1). */
export const SiteLanguageSchema = CatalogLocaleCodeSchema;
export const SITE_LANGUAGE_CODES = CatalogLocaleCodeSchema.options;
export type SiteLanguage = z.infer<typeof SiteLanguageSchema>;
/** The person's answer to a real-mix offer: a reference the server signed and a choice; never a language or text of its own. */
export const QuestionLanguageChoiceSchema = z.object({
  check_ref: z.string().min(3).max(4096).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
  choice: z.enum(["USE_REWRITE", "KEEP_MINE"]),
  original_question_line: z.string().trim().min(1).max(8192).optional()
}).strict();
export type QuestionLanguageChoice = z.infer<typeof QuestionLanguageChoiceSchema>;

/**
 * Question language (spec 2026-10-13, D1): the languages of a real-mix offer. Pre-flight PF-L19 and ruling L-B64: two
 * to six languages, each primary code once, each name at most 64 UTF-8 bytes.
 */
const LANGUAGE_NAME_BYTES = Object.freeze({ max: 64 });
export const NamedLanguageSchema = z.object({
  code: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u),
  name: z.string().min(1).max(LANGUAGE_NAME_BYTES.max)
    .refine((name) => new TextEncoder().encode(name).length <= LANGUAGE_NAME_BYTES.max, "a language name is at most 64 bytes")
}).strict();
export const QuestionLanguageOfferSchema = z.object({
  check_ref: z.string().min(3).max(4096),
  main_language: NamedLanguageSchema,
  languages_seen: z.array(NamedLanguageSchema).min(2).max(6)
    .refine((seen) => new Set(seen.map((language) => language.code.split("-")[0])).size === seen.length,
      "each language is named once"),
  proposed_question: z.string().min(1)
}).strict();
export type QuestionLanguageOffer = z.infer<typeof QuestionLanguageOfferSchema>;
