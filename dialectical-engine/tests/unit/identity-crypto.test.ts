import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendAuditEvent,
  createEmailBlindIndex,
  decrypt,
  encrypt,
  generateDek,
  verifyChain
} from "../../packages/crypto/src/index.js";
import { loadApiEnvironment } from "../../packages/register/src/runtime-environment.js";

function auditPayload(ordinal: number) {
  const auditKey = Buffer.alloc(32, ordinal);
  const auditId = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
  const actorAad = [
    "identity", "audit_event", auditId, "run:none", "user:test",
    "audit-key:user:test", "1"
  ] as const;
  return {
    auditId,
    actorCiphertext: encrypt(auditKey, Buffer.from("user:test", "utf8"), actorAad),
    actorKeyRef: "audit-key:user:test",
    eventType: `identity.test.${ordinal}`,
    targetType: "identity.user",
    targetId: "user:test",
    occurredAt: `2026-08-19T09:00:0${ordinal}.000Z`,
    sourceContext: { asn: 64512, ip: "192.0.2.10", ua: "vitest" },
    decision: "ALLOW",
    success: true,
    justification: null
  } as const;
}

afterEach(() => vi.unstubAllEnvs());

describe("S2 tamper-evident audit chain", () => {
  it("verifies an intact chain and canonicalizes object key order", () => {
    const first = appendAuditEvent(null, auditPayload(1));
    const secondPayload = auditPayload(2);
    const second = appendAuditEvent(first, secondPayload);
    const reorderedSecond = appendAuditEvent(first, {
      ...secondPayload,
      sourceContext: { ua: "vitest", ip: "192.0.2.10", asn: 64512 }
    });

    expect(second.thisHash).toBe(reorderedSecond.thisHash);
    expect(verifyChain([first, second])).toBe(true);
  });

  it("detects a tampered row and a deleted middle row", () => {
    const first = appendAuditEvent(null, auditPayload(1));
    const second = appendAuditEvent(first, auditPayload(2));
    const third = appendAuditEvent(second, auditPayload(3));

    expect(verifyChain([first, { ...second, decision: "DENY" }])).toBe(false);
    expect(verifyChain([first, third])).toBe(false);
  });

  it("keeps the chain valid after the per-user actor key is destroyed", () => {
    const actorKey = generateDek();
    const payload = auditPayload(1);
    const aad = [
      "identity", "audit_event", payload.auditId, "run:none", "user:test",
      payload.actorKeyRef, "1"
    ] as const;
    const event = appendAuditEvent(null, {
      ...payload,
      actorCiphertext: encrypt(actorKey, Buffer.from("user:test", "utf8"), aad)
    });

    expect(decrypt(actorKey, event.actorCiphertext, aad).toString("utf8")).toBe("user:test");
    actorKey.fill(0);
    expect(() => decrypt(generateDek(), event.actorCiphertext, aad)).toThrowError(
      expect.objectContaining({ code: "CRYPTO_AUTHENTICATION_FAILED" })
    );
    expect(verifyChain([event])).toBe(true);
  });
});

describe("S2 email confidentiality and lookup", () => {
  it("uses deterministic HMAC-SHA-256 under a separate blind-index key", () => {
    const key = Buffer.alloc(32, 0x4b);
    const otherKey = Buffer.alloc(32, 0x5c);
    const first = createEmailBlindIndex(key, " Alice@Example.COM ");
    const same = createEmailBlindIndex(key, "alice@example.com");
    const different = createEmailBlindIndex(key, "bob@example.com");

    expect(first).toEqual(same);
    expect(first).not.toEqual(different);
    expect(first).toEqual(createHmac("sha256", key).update("alice@example.com", "utf8").digest());
    expect(createEmailBlindIndex(otherKey, "alice@example.com")).not.toEqual(first);
    expect(first.toString("utf8")).not.toContain("alice@example.com");
  });

  it("round-trips an email through AEAD without placing plaintext in the envelope", () => {
    const userId = "00000000-0000-4000-8000-000000000099";
    const aad = [
      "identity", "user", userId, "run:none", userId,
      "identity-confidentiality:test", "1"
    ] as const;
    const key = generateDek();
    const plaintext = Buffer.from("alice@example.com", "utf8");
    const envelope = encrypt(key, plaintext, aad);

    expect(JSON.stringify(envelope)).not.toContain("alice@example.com");
    expect(decrypt(key, envelope, aad)).toEqual(plaintext);
  });

  it("loads separate blind-index and per-user audit-key-store paths for the API", () => {
    const environment = {
      KEK_PATH: "/run/secrets/kek",
      BLIND_INDEX_KEY_PATH: "/run/secrets/email-blind-index",
      AUDIT_KEY_STORE_PATH: "/run/secrets/audit-users",
      AUDIT_SOURCE_IP_SALT_PATH: "/run/secrets/audit-source-ip-salt",
      USER_DEK_STORE_PATH: "/run/secrets/user-deks",
      MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
      MAIL_FROM: "noreply@debateai.test",
      PUBLIC_APP_URL: "https://debateai.test",
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/debateai",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      STRANGER_SAMPLE_RATE: "0.1",
      REGISTER_VERSION: "1",
      BATTERY_VERSION: "test",
      SETTLEMENT_WATCH_HANDLE: "test",
      HATCHET_CLIENT_TOKEN: "test",
      HATCHET_HOST_PORT: "127.0.0.1:7077",
      HATCHET_API_URL: "http://127.0.0.1:8080",
      HATCHET_TENANT_ID: "test",
      HATCHET_WORKFLOW_NAME: "test",
      HATCHET_TLS_STRATEGY: "none"
    } as const;
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);

    expect(loadApiEnvironment()).toMatchObject({
      BLIND_INDEX_KEY_PATH: environment.BLIND_INDEX_KEY_PATH,
      AUDIT_KEY_STORE_PATH: environment.AUDIT_KEY_STORE_PATH,
      AUDIT_SOURCE_IP_SALT_PATH: environment.AUDIT_SOURCE_IP_SALT_PATH
    });
  });
});
