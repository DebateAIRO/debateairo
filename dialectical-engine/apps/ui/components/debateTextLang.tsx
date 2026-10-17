"use client";

import { createContext, useContext } from "react";
import { localeDirection } from "@/lib/i18n/questionLocale";

/**
 * The language a debate was argued in (its question's locale), for the debate's own text: the
 * topic, every claim and argument. Tagged with `lang` and `dir`, that text is read by a screen
 * reader in its own language's voice while the buttons, scores and labels around it keep the
 * interface's. Undefined outside a debate page, where nothing is tagged and text inherits.
 */
const DebateTextLocale = createContext<string | undefined>(undefined);

export const DebateTextLocaleProvider = DebateTextLocale.Provider;

/** Spread onto an element that holds the debate's own text. Empty outside a debate page. */
export function useDebateTextLang(): { lang?: string; dir?: "ltr" | "rtl" } {
  const locale = useContext(DebateTextLocale);
  return locale === undefined ? {} : { lang: locale, dir: localeDirection(locale) };
}
