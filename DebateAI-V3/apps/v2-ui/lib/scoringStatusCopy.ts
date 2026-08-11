import type { ScoringStatus } from "./types";
import { v3ScoringStatusLabel } from "./v3/adapter";

export type ScoringStatusCopyInput = {
  enabled: boolean;
  scoringStatus: "idle" | "loading" | "loaded" | "unavailable" | "error";
  refreshStatus: "idle" | "starting" | "polling" | "error";
  responseStatus?: ScoringStatus | null;
  reason?: string | null;
  error?: string | null;
  cacheHit?: boolean | null;
  staleReason?: string | null;
  checkedAt?: string | null;
  provider?: string | null;
  model?: string | null;
};

export function formatScoringStatusCopy(input: ScoringStatusCopyInput): string {
  if (!input.enabled) return withMetadata("Scores unchecked", input);
  if (input.refreshStatus === "starting" || input.refreshStatus === "polling" || input.scoringStatus === "loading") {
    return withMetadata("Checking scores with Codex", input);
  }
  if (input.scoringStatus === "error") {
    return withMetadata(appendDetail("Scoring check failed", input.error), input);
  }
  if (input.scoringStatus === "unavailable") {
    if (isMissingJudgeOutputReason(input.reason)) {
      return withMetadata("Scoring pending", input);
    }
    // UI-01 (DR-115): V3 runs no per-node scoring check at all, so its typed
    // absence gets the V3 layer's own label. Narrow and additive — every other
    // unavailable reason keeps V2's original copy. The full reason keeps its
    // home in the scoring-insights strip, which has room for it.
    const v3Label = v3ScoringStatusLabel(input.reason);
    if (v3Label !== null) {
      return withMetadata(v3Label, input);
    }
    return withMetadata(appendDetail("Scoring check failed", input.reason), input);
  }
  if (isStaleInputHashMismatch(input)) {
    return withMetadata("Scores may be stale", input);
  }
  const cacheLabel = formatCacheLabel(input);
  if (cacheLabel) return withMetadata(cacheLabel, input);
  if (input.scoringStatus === "loaded" && input.responseStatus === "partial") {
    return withMetadata("Scores partially checked", input);
  }
  if (input.scoringStatus === "loaded") return withMetadata("Scores checked", input);
  return withMetadata("Scores unchecked", input);
}

export function formatScoringConfidenceCopy(): string {
  return "Model-assisted reasoning aid, not a truth verdict.";
}

function appendDetail(label: string, detail?: string | null): string {
  return detail ? `${label}: ${detail}` : label;
}

function isMissingJudgeOutputReason(reason?: string | null): boolean {
  return (reason || "").trim().toLowerCase() === "no scoring judge outputs are available for this debate.";
}

function isStaleInputHashMismatch(input: ScoringStatusCopyInput): boolean {
  return input.scoringStatus === "loaded" && input.staleReason === "input_hash_mismatch";
}

function formatCacheLabel(input: ScoringStatusCopyInput): string {
  if (input.scoringStatus !== "loaded" || typeof input.cacheHit !== "boolean") return "";
  if (input.cacheHit) return "Cached scores";
  if (input.responseStatus === "partial") return "Fresh scores partially checked";
  return "Fresh scores";
}

function withMetadata(label: string, input: ScoringStatusCopyInput): string {
  const parts = [formatProviderLabel(input.provider, input.model), formatCheckedAtLabel(input.checkedAt)].filter(Boolean);
  return parts.length > 0 ? `${label} - ${parts.join(" - ")}` : label;
}

function formatProviderLabel(provider?: string | null, model?: string | null): string {
  const safeProvider = sanitizeMetadataLabel(provider);
  const safeModel = sanitizeMetadataLabel(model);
  if (safeProvider && safeModel) return `${safeProvider}/${safeModel}`;
  return safeProvider || safeModel;
}

function sanitizeMetadataLabel(value?: string | null): string {
  const trimmed = (value || "").trim();
  if (!trimmed || looksSecret(trimmed)) return "";
  return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
}

function looksSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("bearer") ||
    lower.includes("key") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.startsWith("sk-")
  );
}

function formatCheckedAtLabel(checkedAt?: string | null): string {
  const formatted = formatCheckedAt(checkedAt);
  return formatted ? `Last checked ${formatted}` : "";
}

function formatCheckedAt(checkedAt?: string | null): string {
  if (!checkedAt) return "";
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = padUtcPart(date.getUTCMonth() + 1);
  const day = padUtcPart(date.getUTCDate());
  const hour = padUtcPart(date.getUTCHours());
  const minute = padUtcPart(date.getUTCMinutes());
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function padUtcPart(value: number): string {
  return value.toString().padStart(2, "0");
}
