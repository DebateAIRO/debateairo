import { describe, expect, it } from "vitest";
import { buildApi, type ApiOptions, type AskApplication } from "../../apps/api/src/index.js";
import { REGISTRATION_PUBLIC_RESPONSE, RESEND_PUBLIC_RESPONSE } from "../../apps/api/src/registration.js";
import { canonicalResend, canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";

/**
 * Auth API hardening (2026-10-09, item 4). Four public, browser-called account
 * routes lacked the exact-Origin rule every newer public route carries. They
 * are all called by the site's own pages with fetch POST (verify-email too: the
 * mailed link opens a page, and that page posts the token), so a browser always
 * sends Origin; anything but the site's exact origin is refused before work.
 */
const ORIGIN = "https://app.example.test";
const routes = [
  ["/v1/auth/register", canonicalSignup, 202],
  ["/v1/auth/verify-email", { token: "a".repeat(43) }, 200],
  ["/v1/auth/resend-verification", canonicalResend, 202],
  ["/v1/auth/recovery/start", { email: "alice@example.test" }, 202]
] as const;

function harness() {
  const work: string[] = [];
  const api = buildApi({
    application: {} as AskApplication,
    allowedOrigin: ORIGIN,
    turnstile: passedTurnstile,
    registration: {
      register: async () => { work.push("register"); return REGISTRATION_PUBLIC_RESPONSE; },
      verifyEmail: async () => { work.push("verify-email"); return { status: "mfa_required" as const }; },
      resendVerification: async () => { work.push("resend"); return RESEND_PUBLIC_RESPONSE; }
    },
    recovery: { start: async () => { work.push("recovery"); return { message: "fixture" }; } }
  } as unknown as ApiOptions);
  return { api, work };
}

describe("exact Origin on the public account routes", () => {
  it.each(routes)("refuses %s with no Origin before any account work", async (url, payload) => {
    const { api, work } = harness();
    try {
      const response = await api.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
      expect(work).toEqual([]);
    } finally { await api.close(); }
  });

  it.each(routes)("refuses %s from another site before any account work", async (url, payload) => {
    const { api, work } = harness();
    try {
      for (const origin of ["https://evil.example", "https://app.example.test.evil.example", `${ORIGIN}, https://evil.example`, "null"]) {
        const response = await api.inject({ method: "POST", url, payload, headers: { origin } });
        expect(response.statusCode, origin).toBe(403);
      }
      expect(work).toEqual([]);
    } finally { await api.close(); }
  });

  it.each(routes)("serves %s to the site's own origin", async (url, payload, status) => {
    const { api, work } = harness();
    try {
      const response = await api.inject({ method: "POST", url, payload, headers: { origin: ORIGIN } });
      expect(response.statusCode).toBe(status);
      expect(work).toHaveLength(1);
    } finally { await api.close(); }
  });
});
