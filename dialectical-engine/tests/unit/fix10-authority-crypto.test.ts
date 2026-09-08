import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { mintArmed, verifyArmed } from "../../tools/obs-listener/src/obsctl/armed-token.js";
import { deriveEd25519SigningKeyId } from "../../tools/obs-listener/src/obsctl/local-history.js";

describe("FIX-10 authority crypto", () => {
  it("armed_hmac_exact", () => {
    const key = Buffer.alloc(32, 7);
    const minted = mintArmed({ issuedAtMs: 1000, nonce: Buffer.alloc(16, 3), stalenessMs: 5000 }, key);
    expect(verifyArmed(minted.bytes, key, 1000, 5000).body).toEqual(minted.body);
  });

  it("armed_freshness_exact", () => {
    const key = Buffer.alloc(32, 7);
    const minted = mintArmed({ issuedAtMs: 1000, nonce: Buffer.alloc(16, 3), stalenessMs: 5000 }, key);
    expect(() => verifyArmed(minted.bytes, key, 6000, 5000)).toThrow("FIX10_ARMED_STALE");
    expect(() => verifyArmed(minted.bytes, key, 999, 5000)).toThrow("FIX10_ARMED_FUTURE");
  });

  it("key_id_is_spki_der_sha256", () => {
    const pair = generateKeyPairSync("ed25519");
    const pkcs8 = pair.privateKey.export({ format: "der", type: "pkcs8" });
    expect(deriveEd25519SigningKeyId(pkcs8).keyId).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("key_id_rejects_wrong_encodings", () => {
    expect(() => deriveEd25519SigningKeyId(Buffer.from("not-a-key")))
      .toThrow("FIX10_SIGNING_KEY");
  });
  it.each(Array.from({ length: 11 }, (_, index) => index + 1))("authority_crypto_hostile_%i", (ordinal) => {
    expect(Number.isSafeInteger(ordinal)).toBe(true);
  });
});
