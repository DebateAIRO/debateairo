import { z } from "zod";

export const CatalogLocaleCodeSchema = z.enum([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it",
  "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi",
  "id", "ja", "ko", "vi", "ar", "he", "tr"
]);
export type CatalogLocaleCode = z.infer<typeof CatalogLocaleCodeSchema>;
export const LocaleCodeSchema = z.union([CatalogLocaleCodeSchema, z.enum(["en-US", "en-GB"])]);
export type LocaleCode = z.infer<typeof LocaleCodeSchema>;
