import type { AdmissionPolicy } from "@debateai/register";

export type AdmissionScope = "asks" | "publicReads" | "recoveryStart";

export type AdmissionDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{
    allowed: false;
    reason: "LIMIT" | "CAPACITY";
    retryAfterMs: number;
    windowMs: number;
  }>;

interface AdmissionEntry {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
}

interface AdmissionBucket {
  readonly policy: AdmissionPolicy["asks"] | AdmissionPolicy["publicReads"]
    | AdmissionPolicy["recoveryStart"];
  readonly entries: Map<string, AdmissionEntry>;
}

const ALLOWED: AdmissionDecision = Object.freeze({ allowed: true as const });

function expired(entry: AdmissionEntry, windowMs: number, now: number): boolean {
  return entry.blockedUntil <= now && now - entry.windowStartedAt >= windowMs;
}

/**
 * A bounded, fail-closed admission limiter (PLAN B10, modelled on
 * MfaVerificationLimiter). Each key owns one fixed window; once its budget is
 * spent it is blocked for the remainder of that window and told how long to
 * wait. The key table is capped per scope so a caller minting fresh keys
 * cannot grow memory: at capacity, expired keys are evicted oldest-first and,
 * if none can be evicted, the new key is refused rather than admitted.
 */
export class AdmissionLimiter {
  private readonly buckets: ReadonlyMap<AdmissionScope, AdmissionBucket>;

  constructor(policy: AdmissionPolicy) {
    this.buckets = new Map<AdmissionScope, AdmissionBucket>([
      ["asks", { policy: policy.asks, entries: new Map() }],
      ["publicReads", { policy: policy.publicReads, entries: new Map() }],
      ["recoveryStart", { policy: policy.recoveryStart, entries: new Map() }]
    ]);
  }

  decide(scope: AdmissionScope, key: string, now: Date): AdmissionDecision {
    const bucket = this.buckets.get(scope);
    if (bucket === undefined) throw new TypeError(`ADMISSION_SCOPE_UNKNOWN:${String(scope)}`);
    if (typeof key !== "string" || key.length === 0) throw new TypeError("ADMISSION_KEY_REQUIRED");
    const instant = now.getTime();
    if (!Number.isFinite(instant)) throw new TypeError("ADMISSION_CLOCK_INVALID");
    const { policy, entries } = bucket;
    let entry = entries.get(key);
    if (entry === undefined) {
      if (entries.size >= policy.capacity) {
        // Map iteration is insertion order: the oldest keys are examined first.
        for (const [candidateKey, candidate] of entries) {
          if (expired(candidate, policy.windowMs, instant)) entries.delete(candidateKey);
        }
      }
      if (entries.size >= policy.capacity) {
        return Object.freeze({
          allowed: false as const, reason: "CAPACITY" as const,
          retryAfterMs: policy.windowMs, windowMs: policy.windowMs
        });
      }
      entry = { count: 0, windowStartedAt: instant, blockedUntil: 0 };
      entries.set(key, entry);
    } else if (instant - entry.windowStartedAt >= policy.windowMs) {
      entry.count = 0;
      entry.windowStartedAt = instant;
      entry.blockedUntil = 0;
    }
    if (entry.blockedUntil <= instant) {
      entry.count += 1;
      if (entry.count <= policy.limit) return ALLOWED;
      entry.blockedUntil = entry.windowStartedAt + policy.windowMs;
    }
    return Object.freeze({
      allowed: false as const, reason: "LIMIT" as const,
      retryAfterMs: entry.blockedUntil - instant, windowMs: policy.windowMs
    });
  }

  size(scope: AdmissionScope): number {
    const bucket = this.buckets.get(scope);
    if (bucket === undefined) throw new TypeError(`ADMISSION_SCOPE_UNKNOWN:${String(scope)}`);
    return bucket.entries.size;
  }
}
