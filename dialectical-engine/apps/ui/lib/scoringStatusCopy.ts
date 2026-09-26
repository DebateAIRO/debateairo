import type { ScoringStatus } from "./types";
import { v3ScoringStatusLabel } from "./v3/adapter";
import debateChromeEnglish from "../messages/en/debateChrome.json" with { type: "json" };
import composeEnglish from "../messages/en/compose.json" with { type: "json" };
import { t, type MessageCatalog } from "./i18n/translate.js";

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
  /** The reader's `compose` catalogue: V3's absence reason is recognised in the reader's locale. */
  composeCatalog?: MessageCatalog;
};

export function formatScoringStatusCopy(
  input: ScoringStatusCopyInput,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  if (!input.enabled) return withMetadata(t(catalog, "debateChrome.scoring.scoresUnchecked"), input, catalog);
  if (input.refreshStatus === "starting" || input.refreshStatus === "polling" || input.scoringStatus === "loading") {
    return withMetadata(t(catalog, "debateChrome.scoring.checkingWithCodex"), input, catalog);
  }
  if (input.scoringStatus === "error") {
    return withMetadata(appendDetail(t(catalog, "debateChrome.scoring.checkFailed"), input.error, catalog), input, catalog);
  }
  if (input.scoringStatus === "unavailable") {
    if (isMissingJudgeOutputReason(input.reason)) {
      return withMetadata(t(catalog, "debateChrome.scoring.pending"), input, catalog);
    }
    // UI-01 (DR-115): V3 runs no per-node scoring check at all, so its typed
    // absence gets the V3 layer's own label. Narrow and additive — every other
    // unavailable reason keeps V2's original copy. The full reason keeps its
    // home in the scoring-insights strip, which has room for it.
    const v3Label = v3ScoringStatusLabel(input.reason, input.composeCatalog ?? composeEnglish);
    if (v3Label !== null) {
      return withMetadata(t(catalog, "debateChrome.scoring.graphScoredNoV2Endpoint"), input, catalog);
    }
    return withMetadata(appendDetail(t(catalog, "debateChrome.scoring.checkFailed"), input.reason, catalog), input, catalog);
  }
  if (isStaleInputHashMismatch(input)) {
    return withMetadata(t(catalog, "debateChrome.scoring.mayBeStale"), input, catalog);
  }
  const cacheLabel = formatCacheLabel(input, catalog);
  if (cacheLabel) return withMetadata(cacheLabel, input, catalog);
  if (input.scoringStatus === "loaded" && input.responseStatus === "partial") {
    return withMetadata(t(catalog, "debateChrome.scoring.partiallyChecked"), input, catalog);
  }
  if (input.scoringStatus === "loaded") return withMetadata(t(catalog, "debateChrome.scoring.checked"), input, catalog);
  return withMetadata(t(catalog, "debateChrome.scoring.scoresUnchecked"), input, catalog);
}

export function formatScoringConfidenceCopy(catalog: MessageCatalog = debateChromeEnglish): string {
  return t(catalog, "debateChrome.scoring.confidenceDisclaimer");
}

function appendDetail(label: string, detail: string | null | undefined, catalog: MessageCatalog): string {
  return detail ? t(catalog, "debateChrome.scoring.detail", { label, detail }) : label;
}

function isMissingJudgeOutputReason(reason?: string | null): boolean {
  return (reason || "").trim().toLowerCase() === "no scoring judge outputs are available for this debate.";
}

function isStaleInputHashMismatch(input: ScoringStatusCopyInput): boolean {
  return input.scoringStatus === "loaded" && input.staleReason === "input_hash_mismatch";
}

function formatCacheLabel(input: ScoringStatusCopyInput, catalog: MessageCatalog): string {
  if (input.scoringStatus !== "loaded" || typeof input.cacheHit !== "boolean") return "";
  if (input.cacheHit) return t(catalog, "debateChrome.scoring.cachedScores");
  if (input.responseStatus === "partial") return t(catalog, "debateChrome.scoring.freshScoresPartiallyChecked");
  return t(catalog, "debateChrome.scoring.freshScores");
}

function withMetadata(label: string, input: ScoringStatusCopyInput, catalog: MessageCatalog): string {
  const parts = [
    formatProviderLabel(input.provider, input.model, catalog),
    formatCheckedAtLabel(input.checkedAt, catalog)
  ].filter(Boolean);
  return parts.length > 0
    ? t(catalog, "debateChrome.scoring.metadata", { label, metadata: parts.join(" - ") })
    : label;
}

function formatProviderLabel(
  provider: string | null | undefined,
  model: string | null | undefined,
  catalog: MessageCatalog
): string {
  const safeProvider = sanitizeMetadataLabel(provider);
  const safeModel = sanitizeMetadataLabel(model);
  if (safeProvider && safeModel) {
    return t(catalog, "debateChrome.scoring.providerModel", { provider: safeProvider, model: safeModel });
  }
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

function formatCheckedAtLabel(checkedAt: string | null | undefined, catalog: MessageCatalog): string {
  const formatted = formatCheckedAt(checkedAt);
  return formatted ? t(catalog, "debateChrome.scoring.lastChecked", { time: formatted }) : "";
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
