"use client";

import { createContext, type ReactElement, type ReactNode } from "react";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { LegalDocument } from "@/lib/legalDocument";

export type LegalDocumentsContextValue = Readonly<{
  locale: LocaleCode;
  privacy: LegalDocument;
  terms: LegalDocument;
}>;

export const LegalDocumentsContext = createContext<LegalDocumentsContextValue | null>(null);

export function LegalDocumentsProvider(props: {
  locale: LocaleCode;
  privacy: LegalDocument;
  terms: LegalDocument;
  children: ReactNode;
}): ReactElement {
  const { children, ...value } = props;
  return <LegalDocumentsContext.Provider value={value}>{children}</LegalDocumentsContext.Provider>;
}
