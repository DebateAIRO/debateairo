"use client";

import * as React from "react";

import { PRIVACY_POLICY } from "../../lib/privacyPolicy";
import { LegalDocumentModal } from "./LegalDocumentModal";

/**
 * The privacy policy modal (design 10c): the shared `LegalDocumentModal` over the Privacy Policy
 * data. It owns no consent state, reads and writes no storage, and holds no policy prose of its
 * own — every string it shows comes from `apps/ui/lib/privacyPolicy.ts`, which is generated from
 * `apps/ui/legal/privacy-policy.md`.
 *
 * The prop type is a cross-slice contract: `slices/S02/SPEC.md` R14 and `slices/S01/SPEC.md`
 * R20 state it byte-identically and neither slice may change it alone.
 */
export type PrivacyPolicyModalProps = {
  open: boolean;
  mode: "read" | "consent";
  onClose: () => void;
  onAcknowledge?: () => void;
};

/**
 * S02-S33's four-member closure, pinned WHERE A TYPECHECKER CAN SEE IT. Measured 2026-09-07:
 * `tsc --noEmit --listFiles` counts this file 1 in the `apps/ui` project and 0 in the root one,
 * and counts `tests/render/consent-policy-modal-render.test.tsx` **0 in BOTH** — so the two
 * type-level pins the plan places in that test file are inert, and the plan's sentence "a wrong
 * prop set produces a 9th diagnostic" cannot come true (`.hermes/TOOLING-TRAPS.md:1485-1499` is
 * the standing measurement of the same gap). Reported as a finding; pinned here as well so the
 * property has a gate that actually runs — `cd apps/ui && npx tsc --noEmit -p tsconfig.json`
 * fails on a renamed member, a removed one, a fifth one (optional or not), and on
 * `onAcknowledge` made required.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type _PropShapeIsExact = Expect<
  Exact<
    PrivacyPolicyModalProps,
    { open: boolean; mode: "read" | "consent"; onClose: () => void; onAcknowledge?: () => void }
  >
>;
type _PropKeysAreExact = Expect<
  Exact<keyof PrivacyPolicyModalProps, "open" | "mode" | "onClose" | "onAcknowledge">
>;

export function PrivacyPolicyModal(props: PrivacyPolicyModalProps): React.ReactElement | null {
  return <LegalDocumentModal document={PRIVACY_POLICY} {...props} />;
}
