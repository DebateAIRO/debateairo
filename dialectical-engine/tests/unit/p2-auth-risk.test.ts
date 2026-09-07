import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  encrypt,
  type AuditContextHasher,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  evaluateAuthenticationRiskSignals,
  type DecryptedAuthenticationRiskSignal
} from "@debateai/db";
// Direct source import: the new poison-category surface is not re-exported through
// `packages/db/src/index.ts`, which this lane's contract holds readonly.
import {
  authenticationRiskSignalAad,
  authenticationRiskSignalPoisonCategory,
  PostgresAuthenticationRiskSignalRepository
} from "../../packages/db/src/auth-risk.js";
import { RECOVERY_POLICY_REGISTER_ROW } from "@debateai/register";

const AUTHENTICATION_RISK_SIGNAL_RETENTION_MS=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.raw_signal_retention_ms;
const MAX_AUTHENTICATION_RISK_SIGNAL_SCAN=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.maximum_evaluator_signals;

const kinds = [
  "LOGIN_SUCCESS",
  "SESSION_CONTEXT_CHANGED",
  "RECOVERY_STARTED",
  "RECOVERY_PROOF_FAILED",
  "RECOVERY_COMPLETED"
] as const;

function signal(index: number): DecryptedAuthenticationRiskSignal {
  const observedAt = new Date(Date.UTC(2026,0,1,0,index));
  return Object.freeze({
    riskSignalId: randomUUID(),
    kind: kinds[index%kinds.length]!,
    observedAt,
    expiresAt: new Date(observedAt.getTime()+AUTHENTICATION_RISK_SIGNAL_RETENTION_MS),
    context: Object.freeze({
      v: 1 as const,
      networkRef: `argon2id-audit:v1:${(index%2===0?"1":"2").repeat(64)}`,
      clientRef: `argon2id-audit:v1:${(index%3===0?"3":"4").repeat(64)}`
    })
  });
}

describe("P2-08 bounded authentication risk evaluation", () => {
  it("summarizes exactly the maximum bounded signal set without returning refs", () => {
    const signals=Array.from({length:MAX_AUTHENTICATION_RISK_SIGNAL_SCAN},(_,index)=>signal(index));
    const summary=evaluateAuthenticationRiskSignals(
      signals,new Date(Date.UTC(2026,0,2)),AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    expect(summary).toEqual({
      signalCount:128,
      counts:{
        LOGIN_SUCCESS:26,
        SESSION_CONTEXT_CHANGED:26,
        RECOVERY_STARTED:26,
        RECOVERY_PROOF_FAILED:25,
        RECOVERY_COMPLETED:25
      },
      distinctNetworkRefs:2,
      distinctClientRefs:2,
      newestObservedAt:new Date(Date.UTC(2026,0,1,2,7))
    });
    expect(JSON.stringify(summary)).not.toContain("argon2id-audit");
  });

  it("rejects N+1 before evaluation", () => {
    const signals=Array.from({length:MAX_AUTHENTICATION_RISK_SIGNAL_SCAN+1},(_,index)=>signal(index));
    expect(()=>evaluateAuthenticationRiskSignals(
      signals,new Date(Date.UTC(2026,0,2)),AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    ))
      .toThrow("AUTH_RISK_SIGNAL_SCAN_SATURATED");
  });

  it("rejects poisoned kinds, refs, retention, expiry, duplicates, and extra context", () => {
    const now=new Date(Date.UTC(2026,0,2));
    const base=signal(0);
    const poisons: unknown[] = [
      {...base,kind:"ACCOUNT_CONTENT_MATCH"},
      {...base,context:{...base.context,networkRef:"192.0.2.1"}},
      {...base,expiresAt:new Date(base.expiresAt.getTime()+1)},
      {...base,expiresAt:now},
      {...base,context:{...base.context,debateText:"private"}},
      [base,base]
    ];
    for (const poison of poisons) {
      const rows=Array.isArray(poison)?poison:[poison];
      expect(()=>evaluateAuthenticationRiskSignals(
        rows as DecryptedAuthenticationRiskSignal[],now,
        AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
      )).toThrow("AUTH_RISK_SIGNAL_POISONED");
    }
  });
});

/**
 * F-AUTH-RISK-POISONED-CATCH. `evaluateForRecovery` wrapped BOTH the decrypt and the
 * JSON.parse of a stored signal's context in one `}catch{poisoned();}`, so a key/ciphertext
 * mismatch and a malformed plaintext arrived at the caller as the same indistinguishable
 * failure. The two stages must be distinguishable INTERNALLY while the PUBLIC classification
 * — a TypeError whose message is exactly AUTH_RISK_SIGNAL_POISONED — is preserved unchanged,
 * and nothing derived from the ciphertext, the plaintext, the key or the parser's own message
 * may ride along.
 */
const POISON_USER_ID = "9f1c0f3a-2c1e-4b7a-8d2b-5f6a7c8d9e01";
const RIGHT_DEK = 7;
const WRONG_DEK = 9;
/** Deliberately unparseable, and carrying a marker no rejection may echo. */
const MALFORMED_PLAINTEXT = '{"v":1,"networkRef":"PLAINTEXT_MARKER_MUST_NOT_ESCAPE"';

function poisonPool(row: unknown): Pool {
  return {
    query: async (text: string) => text.includes("prepare_authentication_risk_signal")
      ? { rows: [{ user_id: POISON_USER_ID }] }
      : { rows: [row] }
  } as unknown as Pool;
}

function poisonRow(envelope: CryptoEnvelope): unknown {
  const observedAt = new Date(Date.UTC(2026, 0, 1));
  return {
    user_id: POISON_USER_ID,
    risk_signal_id: randomUUID(),
    signal_kind: "LOGIN_SUCCESS",
    context_ciphertext: envelope,
    observed_at: observedAt,
    expires_at: new Date(observedAt.getTime() + AUTHENTICATION_RISK_SIGNAL_RETENTION_MS),
    evaluated_at: observedAt
  };
}

function poisonRepository(envelope: CryptoEnvelope): PostgresAuthenticationRiskSignalRepository {
  return new PostgresAuthenticationRiskSignalRepository(
    poisonPool(poisonRow(envelope)),
    // `evaluateForRecovery` never hashes; only `record` uses the hasher.
    {} as unknown as AuditContextHasher,
    // A fresh buffer per load: the repository zeroes the key it was handed.
    { load: async () => Buffer.alloc(32, RIGHT_DEK) } as unknown as ReadableUserDekStore,
    AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
    MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
  );
}

async function poisonRejection(envelope: CryptoEnvelope): Promise<unknown> {
  try {
    await poisonRepository(envelope).evaluateForRecovery("public-handle");
  } catch (error) {
    return error;
  }
  throw new Error("EXPECTED_A_POISONED_REJECTION");
}

describe("F-AUTH-RISK-POISONED-CATCH decrypt and parse are distinguished internally", () => {
  const aad = authenticationRiskSignalAad(POISON_USER_ID);
  const undecryptable = encrypt(
    Buffer.alloc(32, WRONG_DEK),
    Buffer.from(JSON.stringify({ v: 1, networkRef: null, clientRef: null }), "utf8"),
    aad
  );
  const unparseable = encrypt(
    Buffer.alloc(32, RIGHT_DEK), Buffer.from(MALFORMED_PLAINTEXT, "utf8"), aad
  );

  it("categorises a row whose ciphertext does not decrypt, keeping the public message", async () => {
    const error = await poisonRejection(undecryptable);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("AUTH_RISK_SIGNAL_POISONED");
    expect(authenticationRiskSignalPoisonCategory(error)).toBe("context-decrypt");
  });

  it("categorises a row that decrypts to invalid JSON, keeping the public message", async () => {
    const error = await poisonRejection(unparseable);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("AUTH_RISK_SIGNAL_POISONED");
    expect(authenticationRiskSignalPoisonCategory(error)).toBe("context-parse");
  });

  it("gives the two stages different categories rather than one collapsed failure", async () => {
    const [decryptFailure, parseFailure] = await Promise.all([
      poisonRejection(undecryptable), poisonRejection(unparseable)
    ]);
    expect(authenticationRiskSignalPoisonCategory(decryptFailure))
      .not.toBe(authenticationRiskSignalPoisonCategory(parseFailure));
  });

  it("carries no ciphertext, plaintext, key or parser text on either rejection", async () => {
    for (const [envelope, label] of [
      [undecryptable, "decrypt"], [unparseable, "parse"]
    ] as const) {
      const error = await poisonRejection(envelope);
      const rendered = `${String(error)} ${JSON.stringify(
        error, Object.getOwnPropertyNames(error as object)
      )}`;
      expect(rendered, `${label}: echoed the ciphertext`).not.toContain(envelope.ct);
      expect(rendered, `${label}: echoed the envelope nonce`).not.toContain(envelope.nonce);
      expect(rendered, `${label}: echoed the plaintext`).not.toContain("PLAINTEXT_MARKER_MUST_NOT_ESCAPE");
      // The parser's own message ("Unexpected end of JSON input", "Unterminated string…")
      // and the crypto class name must not ride along either.
      expect(rendered, `${label}: echoed a parser message`).not.toContain("JSON");
      expect(rendered, `${label}: echoed the key bytes`).not.toContain(Buffer.alloc(32, RIGHT_DEK).toString("base64"));
    }
  });
});
