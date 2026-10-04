import type { TurnstileVerifier } from "../../apps/api/src/turnstile.js";
/** Controlled proof adapter for tests of country/age/transport behavior; no production bypass. */
export const passedTurnstile: TurnstileVerifier = { verify: async () => "passed" };
export const canonicalSignup = Object.freeze({
  email: "alice@example.test", password: "password-123", phone: "+40722123456", date_of_birth: "1990-01-01",
  terms: { version: "2.0", sha256: "a".repeat(64) }, privacy: { version: "3.0", sha256: "b".repeat(64) },
  locale: "en", ui_locale: "en-GB", time_zone: null, turnstile_token: "controlled-fixture-proof"
});
export const canonicalResend = Object.freeze({ email: "alice@example.test", locale: "en", ui_locale: "en-GB", time_zone: null, turnstile_token: "controlled-resend-proof" });
