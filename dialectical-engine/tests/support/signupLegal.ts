import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";

/**
 * Paid plans L3b: what SignUpFlow passes as `client.register`'s fifth argument when it displays the English
 * documents (render tests alias useChromeI18n to locale "en", tests/render/stubs/i18n-provider.tsx).
 */
export const DISPLAYED_LEGAL_EN = Object.freeze({
  terms: Object.freeze({ version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }),
  privacy: Object.freeze({ version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256 }),
  locale: "en"
});
