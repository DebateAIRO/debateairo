/**
 * Preview practice: the owner's private gate-figures file for Task 90 (V4 start step, Task 90b; the paid sitting of 9 Nov wrote it by
 * hand). Task 90 (tests/integration/r22-private-figures.test.ts) reads it through DEBATEAI_PRIVATE_GATE_FIGURES
 * (tests/support/private-figures.ts, schema `debateai-private-gate-figures-v1`).
 *
 * Plain words: the file is built on the Mac from four files the sitting already has in its practice folder, outside the
 * repository: each gate's status (README S-3: its pot, its paid calls a day and its models), each gate's two limits from its GO
 * file (README S-3b: calls at once and final-writer calls at once, which the status does not print) and the hosted billing (S-3b,
 * billing off, as the practice keeps it; Task 90's world runs it with billing on). Each gate's largest holds (what its /remaining
 * answers beside the pot) come from the code's own reviewed model rows and the tiers' caps (Task 90c), as the gate computes them. It never prints anything: the file is its only output, private (0600), and never written
 * over. A refusal names the file and the member that is wrong, never a value. The repository is public, so no figure is ever
 * written into it; the tests use made-up ones.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PREVIEW_CALL_TIER_LIMITS, previewModelRow, previewReservationNanoUsd, type PreviewCallTier } from "@debateai/providers";
import { PracticeRefusal } from "./practice-settings.js";

/** The schema of S-3b's limits file (gate-limits.json). */
export const PRACTICE_GATE_LIMITS_SCHEMA = "preview-practice-gate-limits-v1" as const;
/** The schema Task 90 reads (tests/support/private-figures.ts). */
export const PRACTICE_GATE_FIGURES_SCHEMA = "debateai-private-gate-figures-v1" as const;

/** The four input files, by their names in the practice folder (README S-3 and S-3b). */
export const PRACTICE_GATE_FIGURES_INPUTS = Object.freeze({
  deepinfraStatus: "deepinfra-status.json", anthropicStatus: "anthropic-status.json", limits: "gate-limits.json", hostedBilling: "hosted-billing.json"
} as const);

type Gate = "deepinfra" | "anthropic";
export type PracticeGateFigures = Readonly<{
  schema: typeof PRACTICE_GATE_FIGURES_SCHEMA;
  gates: Readonly<Record<Gate, Readonly<{
    daily_budget_usd: string; max_paid_posts_per_day: number; max_concurrent_calls: number; final_writer_max_in_flight?: number;
    largest_reservation_usd: string; largest_final_writer_reservation_usd?: string; enabled_models: readonly string[];
  }>>>;
  hosted_billing: Readonly<Record<string, unknown>>;
}>;

/** A dollar figure as the gates write it (the reader's own rule): a plain decimal, at most six places. */
const DECIMAL_USD = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/u;

const refuse = (file: string, member: string): never => {
  throw new PracticeRefusal("PRACTICE_GATE_FIGURES_INPUT_INVALID", `${file}:${member}`);
};
/** A JSON object from a file's text, else a refusal naming the file (`$`). */
function objectOf(file: string, text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return refuse(file, "$"); }
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : refuse(file, "$");
}
/**
 * Task 90c: the largest full-size hold of a tier among a gate's models, as the gate's /remaining answers it
 * (preview_budget_authority.py: largest_reservation, largest_final_writer_reservation): the tier's largest request at the
 * dearest prices the row can ever reserve at (an Anthropic row's upper step with its cache-write price), from the code's own
 * reviewed rows, rounded UP to a micro-dollar (the private file's six places; the gate's nine are rounded up too, never in the
 * app's favour). A model the code does not review, or another gate's, has no hold the gate would answer (its /remaining refuses).
 */
function largestHoldUsd(gate: Gate, file: string, models: readonly string[], tier: PreviewCallTier): string {
  const bytes = PREVIEW_CALL_TIER_LIMITS[tier].requestBodyMaxBytes;
  let most = 0n;
  for (const model of models) {
    const row = previewModelRow(model);
    if (row === undefined || row.provider !== gate) return refuse(file, "enabled_models");
    let cacheWrite = 0n;
    try { cacheWrite = previewReservationNanoUsd(row, bytes, { tier, cacheWrite: true }); } catch { cacheWrite = 0n; }
    const plain = previewReservationNanoUsd(row, bytes, { tier });
    for (const hold of [plain, cacheWrite]) if (hold > most) most = hold;
  }
  const micros = (most + 999n) / 1000n;
  return `${String(micros / 1_000_000n)}.${String(micros % 1_000_000n).padStart(6, "0")}`;
}
const isCount = (value: unknown, min: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min
  && value <= 1_000_000_000;

/** One gate's figures: the status's pot, paid calls a day and models; the limits file's calls at once and final-writer calls. */
function gateOf(gate: Gate, statusText: string, limits: Record<string, unknown>): PracticeGateFigures["gates"][Gate] {
  const file = PRACTICE_GATE_FIGURES_INPUTS[gate === "deepinfra" ? "deepinfraStatus" : "anthropicStatus"];
  const status = objectOf(file, statusText);
  const budget = status.daily_budget_usd;
  if (typeof budget !== "string" || !DECIMAL_USD.test(budget)) refuse(file, "daily_budget_usd");
  if (!isCount(status.max_paid_posts_per_day, 0)) refuse(file, "max_paid_posts_per_day");
  const models = status.enabled_models;
  if (!Array.isArray(models) || models.length > 64 || !models.every((model) => typeof model === "string" && model.length >= 1 && model.length <= 200)) {
    refuse(file, "enabled_models");
  }
  const own = limits[gate];
  const goLimits = typeof own === "object" && own !== null && !Array.isArray(own) ? own as Record<string, unknown> : {};
  if (!isCount(goLimits.max_concurrent_calls, 1)) refuse(PRACTICE_GATE_FIGURES_INPUTS.limits, `${gate}.max_concurrent_calls`);
  const finalWriter = goLimits.max_final_writer_calls;
  if (finalWriter !== undefined && !isCount(finalWriter, 1)) refuse(PRACTICE_GATE_FIGURES_INPUTS.limits, `${gate}.max_final_writer_calls`);
  const enabled = models as string[];
  return Object.freeze({
    daily_budget_usd: budget as string, max_paid_posts_per_day: status.max_paid_posts_per_day as number,
    max_concurrent_calls: goLimits.max_concurrent_calls as number,
    largest_reservation_usd: largestHoldUsd(gate, file, enabled, "STANDARD"),
    // The gate answers its final-writer room only under a GO that names max_final_writer_calls (preview_budget_authority.py), and
    // always as a pair (Task 90c: the doubles refuse half of it, STUB_REMAINING_FINAL_WRITER_PAIR).
    ...(finalWriter === undefined ? {} : { final_writer_max_in_flight: finalWriter as number,
      largest_final_writer_reservation_usd: largestHoldUsd(gate, file, enabled, "FINAL_WRITER") }),
    enabled_models: Object.freeze([...enabled])
  });
}

/** The figures from the four files' texts (pure); a refusal names the file and the member, never a value. */
export function practiceGateFiguresOf(texts: Readonly<Record<keyof typeof PRACTICE_GATE_FIGURES_INPUTS, string>>): PracticeGateFigures {
  const limits = objectOf(PRACTICE_GATE_FIGURES_INPUTS.limits, texts.limits);
  if (limits.schema !== PRACTICE_GATE_LIMITS_SCHEMA) refuse(PRACTICE_GATE_FIGURES_INPUTS.limits, "schema");
  return Object.freeze({
    schema: PRACTICE_GATE_FIGURES_SCHEMA,
    gates: Object.freeze({ deepinfra: gateOf("deepinfra", texts.deepinfraStatus, limits), anthropic: gateOf("anthropic", texts.anthropicStatus, limits) }),
    hosted_billing: objectOf(PRACTICE_GATE_FIGURES_INPUTS.hostedBilling, texts.hostedBilling)
  });
}

/**
 * Writes Task 90's gate-figures file from the practice folder's four files (README S-3, S-3b): a new file only, private; nothing is
 * printed, the file is the only output. A missing input refuses PRACTICE_GATE_FIGURES_INPUT_UNREADABLE naming the file.
 */
export function writePracticeGateFiguresFile(folder: string, outPath: string): void {
  const read = (file: string): string => {
    try { return readFileSync(join(folder, file), "utf8"); } catch { throw new PracticeRefusal("PRACTICE_GATE_FIGURES_INPUT_UNREADABLE", file); }
  };
  const figures = practiceGateFiguresOf({
    deepinfraStatus: read(PRACTICE_GATE_FIGURES_INPUTS.deepinfraStatus), anthropicStatus: read(PRACTICE_GATE_FIGURES_INPUTS.anthropicStatus),
    limits: read(PRACTICE_GATE_FIGURES_INPUTS.limits), hostedBilling: read(PRACTICE_GATE_FIGURES_INPUTS.hostedBilling)
  });
  writeFileSync(outPath, `${JSON.stringify(figures, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}
