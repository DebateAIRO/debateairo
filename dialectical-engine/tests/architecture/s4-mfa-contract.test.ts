import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { channelBinding, mfaFactor, recoveryCode } from "../../packages/db/src/schema.js";
import { MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue } from "../../packages/register/src/mfa-policy.js";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("S4 MFA architecture contract", () => {
  it("keeps S3 verification ownership on channel_binding and MFA fields on their own tables", async () => {
    for (const field of [
      "verificationTokenHash", "verificationExpiresAt", "verificationConsumedAt",
      "verificationLastSentAt", "deliveryStatus", "deliveryError"
    ]) {
      expect((channelBinding as unknown as Record<string, unknown>)[field]).toBeDefined();
      expect((mfaFactor as unknown as Record<string, unknown>)[field]).toBeUndefined();
    }
    expect((mfaFactor as unknown as Record<string, unknown>).lastAcceptedStep).toBeDefined();
    expect((recoveryCode as unknown as Record<string, unknown>).codeSlot).toBeDefined();
    const migration = await read("migrations/0035_mfa_enrollment.sql");
    expect(migration).toMatch(/pending_mfa/);
    expect(migration).toMatch(/last_accepted_step bigint/);
    expect(migration).toMatch(/recovery_code_one_live_slot/);
  });

  it("pins policy to SHA-1/6/30/160, ten Argon2id codes, ±1 drift, and temporary limits", () => {
    const policy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
    expect(policy.totp).toEqual({
      algorithm: "SHA1", digits: 6, periodSeconds: 30, secretBits: 160, driftSteps: 1
    });
    expect(policy.recoveryCodes).toMatchObject({
      count: 10, entropyBits: 128, storage: "ARGON2ID_HASH_ONLY",
      argon2id: { memoryCostKiB: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 }
    });
    expect(policy.verificationLimits).toMatchObject({
      windowMs: 300_000, perEnrollment: 5, perSourceAcrossAccounts: 20,
      temporaryLockMs: 300_000
    });
  });

  it("contains no Phase-1 passkey or WebAuthn behavior", async () => {
    const [api, mfa] = await Promise.all([
      read("apps/api/src/index.ts"),
      read("apps/api/src/mfa.ts")
    ]);
    const behavior = `${api}\n${mfa}`;
    expect(behavior).not.toMatch(/auth\/mfa\/passkey|webauthn/i);
    expect(behavior).toMatch(/auth\/mfa\/totp\/begin/);
    expect(behavior).toMatch(/auth\/mfa\/recovery-codes\/confirm/);
  });

  it("keeps provisioning local and same-origin with no browser persistence", async () => {
    const [page, client, qr] = await Promise.all([
      read("apps/ui/app/enroll-mfa/page.tsx"),
      read("apps/ui/lib/mfaEnrollment.ts"),
      read("apps/ui/lib/totpQr.ts")
    ]);
    expect(client).toMatch(/createSameOriginFetch\(API_BASE\)/);
    expect(qr).not.toMatch(/fetch\(|https?:\/\//);
    expect(`${page}\n${client}`).not.toMatch(/localStorage|sessionStorage|console\.(?:log|error)/);
    expect(page).toMatch(/Copyable setup key/);
    expect(page).toMatch(/setProvisioning\(null\)/);
  });
});
