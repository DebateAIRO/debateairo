"use client";

import * as React from "react";

import type { CatalogLocaleCode } from "@/lib/i18n/locales";
import type { LegalLanguageSwitch } from "./canadaLegalLanguage";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { useLegalDocument } from "./useLegalDocument";

/**
 * The Terms of Service modal: the privacy policy modal's twin (design 10c), the shared
 * `LegalDocumentModal` over the Terms data. It owns no consent state, reads and writes no
 * storage, and holds no legal prose of its own — every string it shows comes from
 * `apps/ui/lib/termsOfService.ts`, which is generated from `apps/ui/legal/en/terms-of-service.md`.
 *
 * The prop type is the privacy modal's, member for member, so the sign-up card drives both
 * gates with one pattern. `locale` and `languageSwitch` are sign-up in Canada's only (owner
 * ruling, 2 November 2026): the document's own language, and the French/English switch at its top.
 */
export type TermsOfServiceModalProps = {
  open: boolean;
  mode: "read" | "consent";
  onClose: () => void;
  onAcknowledge?: () => void;
  locale?: CatalogLocaleCode;
  languageSwitch?: LegalLanguageSwitch;
};

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type _PropShapeIsExact = Expect<
  Exact<
    TermsOfServiceModalProps,
    { open: boolean; mode: "read" | "consent"; onClose: () => void; onAcknowledge?: () => void; locale?: CatalogLocaleCode; languageSwitch?: LegalLanguageSwitch }
  >
>;
type _PropKeysAreExact = Expect<
  Exact<keyof TermsOfServiceModalProps, "open" | "mode" | "onClose" | "onAcknowledge" | "locale" | "languageSwitch">
>;

export function TermsOfServiceModal(props: TermsOfServiceModalProps): React.ReactElement | null {
  return <LegalDocumentModal document={useLegalDocument("terms", props.locale)} {...props} />;
}
