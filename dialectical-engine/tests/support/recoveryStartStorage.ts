// In-memory STORAGE for the two public recovery starts (password reset and MFA recovery).
// Only the database repository and the user-DEK store are replaced: the real PasswordResetService /
// MfaRecoveryService decide what the caller sees, so a test built on this exercises the actual
// enumeration-resistance and timing-floor code, never a fake that already returns the generic message.
import { randomUUID } from "node:crypto";
import { createEmailBlindIndex, encrypt, normalizeEmailForBlindIndex, type Argon2Executor, type ReadableUserDekStore } from "@debateai/crypto";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue } from "@debateai/register";
import { PASSWORD_RESET_POLICY_REGISTER_ROW, passwordResetPolicyFromValue } from "../../packages/register/src/password-reset-policy.js";
import { MFA_RECOVERY_POLICY_REGISTER_ROW, mfaRecoveryPolicyFromValue } from "../../packages/register/src/email-mfa-policy.js";
import type { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import type { PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";
import { PasswordResetService } from "../../apps/api/src/password-reset.js";

export const recoveryAuthPolicy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
export const recoveryMfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
export const passwordResetPolicy = passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value, PASSWORD_RESET_POLICY_REGISTER_ROW.sourceRef);
export const mfaRecoveryPolicy = mfaRecoveryPolicyFromValue(MFA_RECOVERY_POLICY_REGISTER_ROW.value);
/** The ruled floor every public recovery start waits out, whoever the address belongs to. */
export const ENUMERATION_FLOOR_MS = recoveryAuthPolicy.verification.enumerationResponseFloorMs;

const SOURCE = Object.freeze({ ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` });
const addressAad = (userId: string) => ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"] as const;

type Candidate = Readonly<{
  userId: string;
  channels: readonly Readonly<{ channelId: string; channelType: "email"; addressCiphertext: ReturnType<typeof encrypt>; proof: boolean; cancelAuthorized: boolean }>[];
  bindingChannelIds: readonly string[];
}>;

export type StorageCostHooks = Readonly<{
  /** Called whenever storage resolves a lookup; `found` says whether an account matched. */
  onLookup?: (found: boolean) => Promise<void> | void;
}>;

export function recoveryStartStorage(hooks: StorageCostHooks = {}) {
  const blindIndexKey = Buffer.alloc(32, 41);
  const keys = new Map<string, Buffer>();
  const accounts = new Map<string, Candidate>();
  const starts: Array<Readonly<{ candidateId: string | null; channels: readonly string[]; notices: readonly unknown[] }>> = [];
  let admitted = true;

  const users: ReadableUserDekStore = {
    async store(id, key) { keys.set(id, Buffer.from(key)); },
    async load(id) {
      const key = keys.get(id);
      if (key === undefined) throw new Error("NO_DEK");
      return Buffer.from(key);
    },
    async exists(id) { return keys.has(id); },
    async destroy() { throw new Error("DEK_MUST_BE_RETAINED"); }
  };

  /** Enrol an account whose primary address can receive recovery mail. */
  function enrol(email: string) {
    const userId = randomUUID(), channelId = randomUUID(), key = Buffer.alloc(32, 77);
    keys.set(userId, key);
    const index = createEmailBlindIndex(blindIndexKey, normalizeEmailForBlindIndex(email));
    accounts.set(index.toString("hex"), {
      userId,
      channels: [{ channelId, channelType: "email", addressCiphertext: encrypt(key, Buffer.from(email), addressAad(userId)), proof: true, cancelAuthorized: true }],
      bindingChannelIds: [channelId]
    });
    return { userId, channelId };
  }

  async function lookup(index: Buffer): Promise<Candidate | null> {
    const candidate = accounts.get(index.toString("hex")) ?? null;
    await hooks.onLookup?.(candidate !== null);
    return candidate;
  }

  const shared = {
    async prepareSource() { return SOURCE; },
    async admit() { return admitted; },
    async start(input: Readonly<{ candidateId: string | null; channels: readonly string[]; notices: readonly unknown[] }>) {
      starts.push({ candidateId: input.candidateId, channels: [...input.channels], notices: [...input.notices] });
      return true;
    }
  };
  const passwordResetRepository = { ...shared, prepare: (index: Buffer) => lookup(index) } as unknown as PostgresPasswordResetRepository;
  const mfaRecoveryRepository = { ...shared, prepare: (index: Buffer) => lookup(index) } as unknown as PostgresMfaRecoveryRepository;

  return {
    blindIndexKey, users, enrol, starts, passwordResetRepository, mfaRecoveryRepository,
    refuseAdmission() { admitted = false; }
  };
}

/**
 * The REAL PasswordResetService over this storage, on a virtual monotonic clock. Storage charges the
 * clock for its work — a lookup that finds an account costs `knownCostMs` (DEK load, notice
 * encryption), a miss `unknownCostMs` — so only the floor can make the two paths take the same time.
 */
export function passwordResetOnVirtualClock(enrolled: readonly string[], costs = { knownCostMs: 180, unknownCostMs: 4 }) {
  let now = 0;
  const sleeps: number[] = [];
  const storage = recoveryStartStorage({ onLookup: (found) => { now += found ? costs.knownCostMs : costs.unknownCostMs; } });
  for (const email of enrolled) storage.enrol(email);
  const service = new PasswordResetService({
    repository: storage.passwordResetRepository, users: storage.users,
    argon2: {} as Argon2Executor, // start() never hashes
    authPolicy: recoveryAuthPolicy, mfaPolicy: recoveryMfaPolicy, passwordResetPolicy,
    blindIndexKey: storage.blindIndexKey, reportDiagnostic: () => undefined,
    monotonicNow: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; }
  });
  /** One start() and the virtual milliseconds it took, the floor included. */
  async function timed(email: string) {
    const began = now, response = await service.start({ email }, { ip: "203.0.113.9", userAgent: "unit", requestId: "r" });
    return { response, elapsed: now - began };
  }
  return { service, storage, sleeps, timed };
}
