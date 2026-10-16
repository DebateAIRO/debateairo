/**
 * Contract A §5: the preview gate's read-only `POST /remaining`.
 *
 * Plain words: before a preview debate starts, the app asks the gate how much of today's team
 * money and how many of today's calls are left, which models the gate will serve, and how much
 * the gate may hold at once for calls in flight. The app never writes anything here and the gate
 * never reads its key for it. Any answer that is not exactly the contract's shape, and any
 * failure to get an answer, means "the gate cannot be asked": the caller must refuse to start.
 */
import { request as httpRequest } from "node:http";
import { TypedDomainError } from "@debateai/kernel";

/** The gate's answer, with both money figures as exact nano-USD (1e-9 USD). */
export type PreviewGateRemaining = Readonly<{
  state: "active" | "initialized" | "halted";
  windowOpen: boolean;
  remainingNanoUsd: bigint;
  remainingCalls: number;
  maxConcurrentCalls: number;
  largestReservationNanoUsd: bigint;
  enabledModels: readonly string[];
  /**
   * LG-B deviation 4: present only when the gate's GO names `max_final_writer_calls`: the largest hold of one final-writer
   * call among the enabled models, and how many such calls the gate lets through at once. Absent: no final-writer room.
   */
  largestFinalWriterReservationNanoUsd?: bigint;
  finalWriterMaxInFlight?: number;
}>;

export interface PreviewRemainingPort {
  remaining(signal?: AbortSignal): Promise<PreviewGateRemaining>;
}

/** The one code every failure to read the gate's answer carries. It never reaches a person. */
export const PREVIEW_GATE_UNREACHABLE = "PREVIEW_GATE_UNREACHABLE" as const;
/** The read is small and local: a gate that has not answered in this long is treated as down. */
export const PREVIEW_REMAINING_TIMEOUT_MS = 10_000 as const;
/** The answer is a few hundred bytes; anything above this is not the contract's answer. */
export const PREVIEW_REMAINING_REPLY_MAX_BYTES = 64 * 1024;

const REPLY_KEYS = Object.freeze([
  "enabled_models", "largest_reservation_usd", "max_concurrent_calls", "remaining_calls", "remaining_usd", "state", "window_open"
]);
/** LG-B: the same answer with the gate's final-writer room (a GO that names max_final_writer_calls). */
const FINAL_WRITER_REPLY_KEYS = Object.freeze([...REPLY_KEYS, "final_writer_max_in_flight", "largest_final_writer_reservation_usd"].sort());
const STATES = new Set(["active", "initialized", "halted"]);

function unreachable(detail: string): TypedDomainError {
  return new TypedDomainError(PREVIEW_GATE_UNREACHABLE, `Private preview gate remaining read failed: ${detail}`);
}

/** A non-negative decimal string with at most 9 decimals, as exact nano-USD; anything else is refused. */
export function previewUsdTextToNano(value: unknown): bigint | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,9}))?$/u.exec(value);
  if (match === null) return undefined;
  return BigInt(match[1]!) * 1_000_000_000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}

/** Contract A §5's reply, read strictly; undefined for any other shape. */
export function parsePreviewGateRemaining(value: unknown): PreviewGateRemaining | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const expected = keys.length === FINAL_WRITER_REPLY_KEYS.length ? FINAL_WRITER_REPLY_KEYS : REPLY_KEYS;
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return undefined;
  const finalWriter = expected === FINAL_WRITER_REPLY_KEYS;
  const largestFinalWriterReservationNanoUsd = finalWriter ? previewUsdTextToNano(row.largest_final_writer_reservation_usd) : undefined;
  const finalWriterMaxInFlight = row.final_writer_max_in_flight;
  if (finalWriter && (largestFinalWriterReservationNanoUsd === undefined || typeof finalWriterMaxInFlight !== "number"
    || !Number.isSafeInteger(finalWriterMaxInFlight) || finalWriterMaxInFlight < 1)) return undefined;
  if (typeof row.state !== "string" || !STATES.has(row.state) || typeof row.window_open !== "boolean") return undefined;
  const remainingNanoUsd = previewUsdTextToNano(row.remaining_usd);
  const largestReservationNanoUsd = previewUsdTextToNano(row.largest_reservation_usd);
  if (remainingNanoUsd === undefined || largestReservationNanoUsd === undefined) return undefined;
  const remainingCalls = row.remaining_calls;
  const maxConcurrentCalls = row.max_concurrent_calls;
  if (typeof remainingCalls !== "number" || !Number.isSafeInteger(remainingCalls) || remainingCalls < 0) return undefined;
  if (typeof maxConcurrentCalls !== "number" || !Number.isSafeInteger(maxConcurrentCalls) || maxConcurrentCalls < 1) return undefined;
  // LG-B deviation 4: the gate's final-writer slots are 1..max_concurrent_calls; more is not the contract's answer.
  if (finalWriter && (finalWriterMaxInFlight as number) > maxConcurrentCalls) return undefined;
  const models = row.enabled_models;
  if (!Array.isArray(models) || models.some((model) => typeof model !== "string" || model.length === 0)
    || new Set(models).size !== models.length) return undefined;
  return Object.freeze({
    state: row.state as PreviewGateRemaining["state"],
    windowOpen: row.window_open,
    remainingNanoUsd,
    remainingCalls,
    maxConcurrentCalls,
    largestReservationNanoUsd,
    ...(finalWriter ? { largestFinalWriterReservationNanoUsd: largestFinalWriterReservationNanoUsd!,
      finalWriterMaxInFlight: finalWriterMaxInFlight as number } : {}),
    enabledModels: Object.freeze([...(models as string[])])
  });
}

/**
 * Pre-flight PF-B2.3 (controller ruling, 2026-10-16): whether this gate's answer offers the final-writer tier (LG-B):
 * only an answer that names `finalWriterMaxInFlight` (a gate activated with a GO that names max_final_writer_calls). No
 * answer, or today's seven-member answer: no tier, so the preview's final writers keep today's STANDARD caps and bodies.
 */
export function previewGateOffersFinalWriterTier(remaining: PreviewGateRemaining | undefined): boolean {
  return remaining !== undefined && remaining.finalWriterMaxInFlight !== undefined;
}

/** Local IPC only, on the same socket and allow-list as `/complete`. Read-only. */
export function createPreviewRemainingRpcPort(
  config: Readonly<{ budget_socket: string; scope_id: string }>,
  timeoutMs: number = PREVIEW_REMAINING_TIMEOUT_MS
): PreviewRemainingPort {
  const socketPath = config.budget_socket;
  const data = JSON.stringify({ scope_id: config.scope_id });
  return Object.freeze({ remaining(signal?: AbortSignal) {
    return new Promise<PreviewGateRemaining>((resolve, reject) => {
      const request = httpRequest({ socketPath, path: "/remaining", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, response => {
        const chunks: Buffer[] = []; let bytes = 0;
        // Settle on every path: a destroy without an error emits only 'close'.
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes <= PREVIEW_REMAINING_REPLY_MAX_BYTES) { chunks.push(chunk); return; }
          reject(unreachable("reply too large"));
          response.destroy();
        });
        response.on("error", () => reject(unreachable("reply unavailable")));
        response.on("close", () => { if (!response.complete) reject(unreachable("reply unavailable")); });
        response.on("end", () => {
          if (response.statusCode !== 200) { reject(unreachable(`status ${String(response.statusCode)}`)); return; }
          let parsed: unknown;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { reject(unreachable("reply invalid")); return; }
          const remaining = parsePreviewGateRemaining(parsed);
          if (remaining === undefined) { reject(unreachable("reply shape invalid")); return; }
          resolve(remaining);
        });
      });
      const canceled = () => request.destroy(new Error("Private preview remaining read canceled"));
      signal?.addEventListener("abort", canceled, { once: true });
      if (signal?.aborted) canceled();
      request.on("close", () => {
        signal?.removeEventListener("abort", canceled);
        // A request closed before any response settles here; after a response this is a no-op.
        reject(unreachable("closed"));
      });
      request.setTimeout(timeoutMs, () => request.destroy());
      request.on("error", () => reject(unreachable("unavailable")));
      request.end(data);
    });
  } });
}
