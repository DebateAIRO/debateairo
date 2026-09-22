"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LocaleCode } from "./locales";
import type { MessageCatalog } from "./translate";

export type I18nNamespace = "chrome" | "home" | "newDebate" | "time";

type I18nContextValue = Readonly<{
  locale: LocaleCode;
  catalog: MessageCatalog;
}>;

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  catalog,
  children
}: I18nContextValue & { children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, catalog }}>{children}</I18nContext.Provider>;
}

export function useChromeI18n(): Readonly<{
  locale: LocaleCode;
  catalog: MessageCatalog;
}> {
  const context = useContext(I18nContext);
  if (context === null) throw new Error("useChromeI18n must be used within I18nProvider");
  return context;
}
