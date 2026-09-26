declare module "@/lib/legal/*/privacyPolicy.js" {
  import type { LegalDocument, LegalJump, LegalSection } from "@/lib/legalDocument";
  export const POLICY_JUMP: readonly LegalJump[];
  export const POLICY_SECTIONS: readonly LegalSection[];
  export const PRIVACY_POLICY: LegalDocument;
}

declare module "@/lib/legal/*/termsOfService.js" {
  import type { LegalDocument, LegalJump, LegalSection } from "@/lib/legalDocument";
  export const TERMS_JUMP: readonly LegalJump[];
  export const TERMS_SECTIONS: readonly LegalSection[];
  export const TERMS_OF_SERVICE: LegalDocument;
}
