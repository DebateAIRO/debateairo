import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { REGISTRATION_PUBLIC_RESPONSE, RESEND_PUBLIC_RESPONSE } from "../../apps/api/src/registration.js";

const body = { ...canonicalSignup, email: "phone@example.test", password: "password-123", phone: "+40 722 123 456", date_of_birth: "1990-01-01" };
function harness() {
  const inputs: unknown[] = [];
  const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, turnstile: passedTurnstile, registration: {
    register: async input => { inputs.push(input); return REGISTRATION_PUBLIC_RESPONSE; },
    verifyEmail: async () => ({ status: "mfa_required" }), resendVerification: async () => RESEND_PUBLIC_RESPONSE
  } });
  return { api, inputs };
}

describe("manual phone public signup boundary", () => {
  it("forwards the canonical manual phone with absent recovery after the server age gate", async () => {
    const { api, inputs } = harness();
    try {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: body });
      expect(response.statusCode).toBe(202);
      expect(inputs).toEqual([{ email: body.email, password: body.password, phone: "+40722123456", recoveryEmail: null, adultAffirmed: true }]);
      expect(response.body).not.toContain("+40722123456");
    } finally { await api.close(); }
  });

  it.each(["phone_source", "phone_verification_status", "user_id", "owner_ref", "audit_token", "state", "grants", "adult_affirmed", "recovery_email"])(
    "rejects untrusted authority or legacy recovery field %s", async field => {
      const { api, inputs } = harness();
      try {
        const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: { ...body, [field]: field === "recovery_email" ? "recovery@example.test" : "untrusted" } });
        expect(response.statusCode).toBe(400);
        expect(inputs).toHaveLength(0);
      } finally { await api.close(); }
    }
  );

  it.each([undefined, "0722 123 456", "+40 722 123 456 ext. 9"])("rejects missing or invalid phone before signup: %s", async phone => {
    const { api, inputs } = harness();
    try {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: { ...body, phone } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "AUTH_INPUT_INVALID" });
      expect(inputs).toHaveLength(0);
    } finally { await api.close(); }
  });
});
