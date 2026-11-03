"use client";

import * as React from "react";

import type { CatalogLocaleCode } from "@/lib/i18n/locales";
import type { LegalLanguageSwitch } from "./canadaLegalLanguage";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { useLegalDocument } from "./useLegalDocument";

/**
 * The privacy policy modal (design 10c): the shared `LegalDocumentModal` over the Privacy Policy
 * data. It owns no consent state, reads and writes no storage, and holds no policy prose of its
 * own — every string it shows comes from `apps/ui/lib/privacyPolicy.ts`, which is generated from
 * `apps/ui/legal/en/privacy-policy.md` (or, for another interface locale, from that locale's
 * generated edition under `apps/ui/lib/legal/<locale>/`, exactly as the Terms twin does).
 *
 * The prop type is a cross-slice contract: `slices/S02/SPEC.md` R14 and `slices/S01/SPEC.md`
 * R20 state it byte-identically and neither slice may change it alone. The owner's ruling of
 * 2 November 2026 (Canada at sign-up) added `locale` and `languageSwitch` to it and to the Terms
 * twin together: the document's own language, and the French/English switch at its top.
 */
export type PrivacyPolicyModalProps = {
  open: boolean;
  mode: "read" | "consent";
  onClose: () => void;
  onAcknowledge?: () => void;
  locale?: CatalogLocaleCode;
  languageSwitch?: LegalLanguageSwitch;
};

/**
 * S02-S33's closure (four members then, six since the Canada ruling), pinned WHERE A TYPECHECKER CAN SEE IT. Measured 2026-09-07:
 * `tsc --noEmit --listFiles` counts this file 1 in the `apps/ui` project and 0 in the root one,
 * and counts `tests/render/consent-policy-modal-render.test.tsx` **0 in BOTH** — so the two
 * type-level pins the plan places in that test file are inert, and the plan's sentence "a wrong
 * prop set produces a 9th diagnostic" cannot come true (`.hermes/TOOLING-TRAPS.md:1485-1499` is
 * the standing measurement of the same gap). Reported as a finding; pinned here as well so the
 * property has a gate that actually runs — `cd apps/ui && npx tsc --noEmit -p tsconfig.json`
 * fails on a renamed member, a removed one, an extra one (optional or not), and on
 * `onAcknowledge` made required.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type _PropShapeIsExact = Expect<
  Exact<
    PrivacyPolicyModalProps,
    { open: boolean; mode: "read" | "consent"; onClose: () => void; onAcknowledge?: () => void; locale?: CatalogLocaleCode; languageSwitch?: LegalLanguageSwitch }
  >
>;
type _PropKeysAreExact = Expect<
  Exact<keyof PrivacyPolicyModalProps, "open" | "mode" | "onClose" | "onAcknowledge" | "locale" | "languageSwitch">
>;

export function PrivacyPolicyModal(props: PrivacyPolicyModalProps): React.ReactElement | null {
  return <LegalDocumentModal document={useLegalDocument("privacy", props.locale)} {...props} />;
}
