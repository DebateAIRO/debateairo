import type { SupportConfigurationValues } from "@debateai/register";

type AnonymousLimits = Pick<SupportConfigurationValues,
  "supportLimitAnonMessages10m" |
  "supportLimitAnonMessages24h" |
  "supportLimitAnonSessions1h" |
  "supportLimitSessionMessages" |
  "supportLimitMessageCharacters"
>;

type SessionMessageLimits = Pick<SupportConfigurationValues,
  "supportLimitSessionMessages" |
  "supportLimitMessageCharacters" |
  "supportLimitAccountMessages10m" |
  "supportLimitAccountMessages24h"
>;

type UniversalMessageLimits = Pick<SupportConfigurationValues,
  "supportLimitSessionMessages" |
  "supportLimitMessageCharacters"
>;

export type SupportAdmissionDecision = Readonly<{
  admitted: boolean;
  reason: "MESSAGE_CHARACTERS" | "SESSION_MESSAGES" | "IP_MESSAGES_10M" |
    "IP_MESSAGES_24H" | "IP_SESSIONS_1H" | "SESSION_CLOSED" |
    "ACCOUNT_MESSAGES_10M" | "ACCOUNT_MESSAGES_24H" |
    "TRACKING_CAPACITY" | "INVALID_TIME" | null;
}>;

type SessionCounter = Readonly<{ count: number; lastMessageAtMs: number }>;

const admitted = Object.freeze({ admitted: true, reason: null }) satisfies SupportAdmissionDecision;
const MAX_TRACKED_KEYS = 4_096;
const ONE_HOUR_MS = 60 * 60 * 1_000;
const TEN_MINUTES_MS = 10 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

function refused(reason: Exclude<SupportAdmissionDecision["reason"], null>): SupportAdmissionDecision {
  return Object.freeze({ admitted: false, reason });
}

function withinWindow(events: readonly number[], cutoffMs: number): number[] {
  return events.filter((atMs) => atMs >= cutoffMs);
}

function pruneExpired(map: Map<string, number[]>, cutoffMs: number): void {
  for (const [key, events] of map) {
    const active = withinWindow(events, cutoffMs);
    if (active.length === 0) map.delete(key);
    else if (active.length !== events.length) map.set(key, active);
  }
}

function pruneInactiveSessions(map: Map<string, SessionCounter>, cutoffMs: number): void {
  for (const [key, counter] of map) {
    if (counter.lastMessageAtMs < cutoffMs) map.delete(key);
  }
}

/**
 * C3 deliberately keeps ordinary admission counters in-process until encrypted
 * transcript writes exist. Only message/IP hashes cross the persistent boundary.
 */
export class SupportC3AdmissionWindow {
  readonly #ipMessages = new Map<string, number[]>();
  readonly #ipSessions = new Map<string, number[]>();
  readonly #sessionMessages = new Map<string, SessionCounter>();
  readonly #accountMessages = new Map<string, number[]>();
  #lastObservedAtMs: number | null = null;
  #clockPoisoned = false;

  observeTime(atMs: number): SupportAdmissionDecision {
    return this.#observe(atMs) ? admitted : refused("INVALID_TIME");
  }

  admitAnonymousSession(input: Readonly<{
    ipSha256: string;
    atMs: number;
    limit: number;
  }>): SupportAdmissionDecision {
    if (!this.#observe(input.atMs)) return refused("INVALID_TIME");
    if (!this.#ipSessions.has(input.ipSha256) && this.#ipSessions.size >= MAX_TRACKED_KEYS) {
      pruneExpired(this.#ipSessions, input.atMs - ONE_HOUR_MS);
      if (this.#ipSessions.size >= MAX_TRACKED_KEYS) return refused("TRACKING_CAPACITY");
    }
    const events = withinWindow(
      this.#ipSessions.get(input.ipSha256) ?? [],
      input.atMs - ONE_HOUR_MS
    );
    if (events.length >= input.limit) {
      this.#ipSessions.set(input.ipSha256, events);
      return refused("IP_SESSIONS_1H");
    }
    events.push(input.atMs);
    this.#ipSessions.set(input.ipSha256, events);
    return admitted;
  }

  admitSessionMessage(input: Readonly<{
    ownerRef: string;
    sessionId: string;
    sessionCreatedAtMs: number;
    characterCount: number;
    atMs: number;
    limits: SessionMessageLimits;
  }>): SupportAdmissionDecision {
    if (!this.#observe(input.atMs)) return refused("INVALID_TIME");
    // DL1-F3: a session row dated ahead of the clock refuses this call only.
    if (!this.#validSessionCreatedTime(input)) return refused("INVALID_TIME");
    const universal = this.#universalMessageRefusal(input);
    if (universal !== null) return universal;
    if (!this.#accountMessages.has(input.ownerRef)
      && this.#accountMessages.size >= MAX_TRACKED_KEYS) {
      pruneExpired(this.#accountMessages,input.atMs-TWENTY_FOUR_HOURS_MS);
      if (this.#accountMessages.size >= MAX_TRACKED_KEYS) return refused("TRACKING_CAPACITY");
    }
    const last24h = withinWindow(
      this.#accountMessages.get(input.ownerRef) ?? [],
      input.atMs-TWENTY_FOUR_HOURS_MS
    );
    if (last24h.length >= input.limits.supportLimitAccountMessages24h) {
      this.#accountMessages.set(input.ownerRef,last24h);
      return refused("ACCOUNT_MESSAGES_24H");
    }
    if (last24h.filter((atMs) => atMs >= input.atMs-TEN_MINUTES_MS).length
      >= input.limits.supportLimitAccountMessages10m) {
      this.#accountMessages.set(input.ownerRef,last24h);
      return refused("ACCOUNT_MESSAGES_10M");
    }
    last24h.push(input.atMs);
    this.#accountMessages.set(input.ownerRef,last24h);
    this.#recordSessionMessage(input.sessionId, input.atMs);
    return admitted;
  }

  admitAnonymousMessage(input: Readonly<{
    ipSha256: string;
    sessionId: string;
    sessionCreatedAtMs: number;
    characterCount: number;
    atMs: number;
    limits: AnonymousLimits;
  }>): SupportAdmissionDecision {
    if (!this.#observe(input.atMs)) return refused("INVALID_TIME");
    // DL1-F3: a session row dated ahead of the clock refuses this call only.
    if (!this.#validSessionCreatedTime(input)) return refused("INVALID_TIME");
    const universal = this.#universalMessageRefusal(input);
    if (universal !== null) return universal;

    if (!this.#ipMessages.has(input.ipSha256) && this.#ipMessages.size >= MAX_TRACKED_KEYS) {
      pruneExpired(this.#ipMessages, input.atMs - TWENTY_FOUR_HOURS_MS);
      if (this.#ipMessages.size >= MAX_TRACKED_KEYS) return refused("TRACKING_CAPACITY");
    }

    const last24h = withinWindow(
      this.#ipMessages.get(input.ipSha256) ?? [],
      input.atMs - TWENTY_FOUR_HOURS_MS
    );
    if (last24h.length >= input.limits.supportLimitAnonMessages24h) {
      this.#ipMessages.set(input.ipSha256, last24h);
      return refused("IP_MESSAGES_24H");
    }
    const last10mCount = last24h.filter(
      (atMs) => atMs >= input.atMs - TEN_MINUTES_MS
    ).length;
    if (last10mCount >= input.limits.supportLimitAnonMessages10m) {
      this.#ipMessages.set(input.ipSha256, last24h);
      return refused("IP_MESSAGES_10M");
    }

    last24h.push(input.atMs);
    this.#ipMessages.set(input.ipSha256, last24h);
    this.#recordSessionMessage(input.sessionId, input.atMs);
    return admitted;
  }

  #universalMessageRefusal(input: Readonly<{
    sessionId: string;
    sessionCreatedAtMs: number;
    characterCount: number;
    atMs: number;
    limits: UniversalMessageLimits;
  }>): SupportAdmissionDecision | null {
    if (input.characterCount > input.limits.supportLimitMessageCharacters) {
      return refused("MESSAGE_CHARACTERS");
    }
    const cutoffMs = input.atMs - TWENTY_FOUR_HOURS_MS;
    const counter = this.#sessionMessages.get(input.sessionId);
    if (counter !== undefined && counter.lastMessageAtMs < cutoffMs) {
      this.#sessionMessages.delete(input.sessionId);
      return refused("SESSION_CLOSED");
    }
    if (counter === undefined && input.sessionCreatedAtMs < cutoffMs) {
      return refused("SESSION_CLOSED");
    }
    if ((counter?.count ?? 0) >= input.limits.supportLimitSessionMessages) {
      return refused("SESSION_MESSAGES");
    }
    if (!this.#sessionMessages.has(input.sessionId)
      && this.#sessionMessages.size >= MAX_TRACKED_KEYS) {
      pruneInactiveSessions(this.#sessionMessages, cutoffMs);
      if (this.#sessionMessages.size >= MAX_TRACKED_KEYS) {
        return refused("TRACKING_CAPACITY");
      }
    }
    return null;
  }

  #recordSessionMessage(sessionId: string, atMs: number): void {
    const count = this.#sessionMessages.get(sessionId)?.count ?? 0;
    this.#sessionMessages.set(sessionId, Object.freeze({ count: count + 1, lastMessageAtMs: atMs }));
  }

  #validSessionCreatedTime(input: Readonly<{
    sessionCreatedAtMs: number;
    atMs: number;
  }>): boolean {
    return this.#validTimestamp(input.sessionCreatedAtMs)
      && input.sessionCreatedAtMs <= input.atMs;
  }

  #validTimestamp(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
  }

  /**
   * DL1-F3. A backward wall-clock reading refuses only the call that carried
   * it: the per-source windows keep their high-water mark, nothing is recorded
   * for the refused call, and the next forward observation is admitted. One
   * structured line per regression makes the skew visible; an NTP step used to
   * answer every support route 429 until restart, silently. An unusable
   * timestamp (NaN, infinite, negative, unsafe) still latches closed — that is
   * a broken clock, not a step.
   */
  #observe(atMs: number): boolean {
    if (this.#clockPoisoned) return false;
    if (!this.#validTimestamp(atMs)) {
      this.#clockPoisoned = true;
      return false;
    }
    if (this.#lastObservedAtMs !== null && atMs < this.#lastObservedAtMs) {
      console.error(JSON.stringify(Object.freeze({
        event: "support.admission.clock_regression",
        skew_ms: this.#lastObservedAtMs - atMs
      })));
      return false;
    }
    this.#lastObservedAtMs = atMs;
    return true;
  }
}
