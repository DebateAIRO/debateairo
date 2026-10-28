import type { SupportConfigurationValues } from "../../../../packages/register/src/support-config.js";

const SUPPORT_MESSAGE_LIMITER_CAPACITY = 65_536;

export type SupportMessageLimits = Readonly<{
  anonymous10m: number;
  anonymous24h: number;
  account10m: number;
  account24h: number;
  lockAfterInjections: number;
  cooldownMinutes: number;
}>;

export function supportMessageLimitsFrom(values: SupportConfigurationValues): SupportMessageLimits {
  return Object.freeze({
    anonymous10m: values.supportLimitAnonMessages10m,
    anonymous24h: values.supportLimitAnonMessages24h,
    account10m: values.supportLimitAccountMessages10m,
    account24h: values.supportLimitAccountMessages24h,
    lockAfterInjections: values.supportLockAfterInjections,
    cooldownMinutes: values.supportIpCooldownMinutes
  });
}

const TEN_MINUTES_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type SourceState = {
  injections: number[];
  pausedUntilMs: number;
};

export class SupportMessageLimiter {
  private readonly messages = new Map<string, number[]>();
  private readonly sources = new Map<string, SourceState>();
  private keyCount = 0;

  admit(input: Readonly<{
    source: string;
    ownerRef: string | null;
    injection: boolean;
    atMs: number;
    limits: SupportMessageLimits;
  }>): "ADMITTED" | "RATE_LIMITED" {
    const sourceKey = `source:${input.source}`;
    const key = input.ownerRef === null ? sourceKey : `owner:${input.ownerRef}`;
    let sourceState = this.sources.get(sourceKey);
    if (sourceState !== undefined && sourceState.pausedUntilMs > 0) {
      if (input.atMs < sourceState.pausedUntilMs) return "RATE_LIMITED";
      this.deleteSource(sourceKey);
      sourceState = undefined;
    }

    const times = this.messages.get(key) ?? [];
    const dailyCutoff = input.atMs - DAY_MS;
    const recent = times.filter((time) => time > dailyCutoff);
    const shortCutoff = input.atMs - TEN_MINUTES_MS;
    const shortCount = recent.filter((time) => time > shortCutoff).length;
    const shortLimit = input.ownerRef === null ? input.limits.anonymous10m : input.limits.account10m;
    const dailyLimit = input.ownerRef === null ? input.limits.anonymous24h : input.limits.account24h;
    if (shortCount >= shortLimit || recent.length >= dailyLimit) return "RATE_LIMITED";

    const needsMessageKey = !this.messages.has(key) && !this.sources.has(key);
    const needsSourceKey = input.injection && !this.sources.has(sourceKey)
      && !this.messages.has(sourceKey) && sourceKey !== key;
    if (this.keyCount + Number(needsMessageKey) + Number(needsSourceKey)
      > SUPPORT_MESSAGE_LIMITER_CAPACITY) {
      this.sweep(input.atMs);
      const missingMessage = !this.messages.has(key) && !this.sources.has(key);
      const missingSource = input.injection && !this.sources.has(sourceKey)
        && !this.messages.has(sourceKey) && sourceKey !== key;
      if (this.keyCount + Number(missingMessage) + Number(missingSource)
        > SUPPORT_MESSAGE_LIMITER_CAPACITY) return "RATE_LIMITED";
    }

    if (!this.messages.has(key) && !this.sources.has(key)) this.keyCount += 1;
    recent.push(input.atMs);
    this.messages.set(key, recent);
    if (input.injection) {
      sourceState = this.sources.get(sourceKey);
      if (sourceState === undefined) {
        if (!this.messages.has(sourceKey)) this.keyCount += 1;
        sourceState = { injections: [], pausedUntilMs: 0 };
        this.sources.set(sourceKey, sourceState);
      }
      sourceState.injections = sourceState.injections.filter((time) => time > dailyCutoff);
      sourceState.injections.push(input.atMs);
      if (sourceState.injections.length >= input.limits.lockAfterInjections) {
        sourceState.pausedUntilMs = input.atMs + input.limits.cooldownMinutes * 60_000;
      }
    }
    return "ADMITTED";
  }

  sweep(atMs: number): number {
    const before = this.keyCount;
    const cutoff = atMs - DAY_MS;
    for (const [key, times] of this.messages) {
      const recent = times.filter((time) => time > cutoff);
      if (recent.length > 0) {
        this.messages.set(key, recent);
      } else {
        this.messages.delete(key);
        if (!this.sources.has(key)) this.keyCount -= 1;
      }
    }
    for (const [key, state] of this.sources) {
      state.injections = state.injections.filter((time) => time > cutoff);
      if (state.injections.length === 0 && state.pausedUntilMs <= atMs) this.deleteSource(key);
    }
    return before - this.keyCount;
  }

  keys(): readonly string[] {
    return [...new Set([...this.messages.keys(), ...this.sources.keys()])];
  }

  private deleteSource(key: string): void {
    if (!this.sources.delete(key)) return;
    if (!this.messages.has(key)) this.keyCount -= 1;
  }
}
