/**
 * Preview practice: the same jobs at several thinking levels, side by side (spec 2026-10-12 §4.8).
 *
 * Plain words: `--levels "<model>=high,high,low;<model>=default,none"` asks each listed model every job once per
 * listed level. A level listed twice is run twice ("high#1", "high#2"), which shows how much the results move by
 * chance alone. The runs take turns per job, so a slow or busy hour falls on every level alike. Each level is checked
 * against the model's reviewed menu (preview-models.ts) before anything is sent. A model the plan does not name runs
 * once, at the server's own levels, exactly as without `--levels`.
 */
import { parsePreviewThinkingLevels, previewModelRow, type PreviewEffort, type PreviewProviderTestConfig } from "@debateai/providers";
import type { PracticeLane } from "./practice-lanes.js";
import { PracticeRefusal } from "./practice-settings.js";

/** Spec 2026-10-12 §4.8: one run of one model at one level; `run` names it ("high#1", "high#2", …). */
export type PracticeLevelRun = Readonly<{ model: string; level: PreviewEffort; run: string }>;
/** Spec 2026-10-12 §4.8: model -> its runs, in the order the operator listed them. */
export type PracticeLevelPlan = Readonly<Record<string, readonly PracticeLevelRun[]>>;

/** The refusal of a `--levels` value the tool cannot run. */
export const PRACTICE_LEVELS_INVALID = "PRACTICE_LEVELS_INVALID" as const;

function refuse(detail: string): never { throw new PracticeRefusal(PRACTICE_LEVELS_INVALID, detail); }

/**
 * Spec 2026-10-12 §4.8: the plan from `--levels`. Refuses (PRACTICE_LEVELS_INVALID) a part that is not
 * `<model>=<level>[,<level>…]`, a model that is not reviewed or not in this run, a model named twice, and a level that
 * is not on that model's menu.
 */
export function parsePracticeLevels(text: string, models: readonly string[]): PracticeLevelPlan {
  const plan: Record<string, readonly PracticeLevelRun[]> = {};
  for (const part of text.split(";")) {
    const match = /^([^=;]+)=([a-z,]+)$/u.exec(part.trim()) ?? refuse(part.trim() === "" ? "empty part" : part.trim());
    const row = previewModelRow(match[1]!.trim()) ?? refuse(`model ${match[1]!.trim()}`);
    if (!models.includes(row.model)) refuse(`model not in this run ${row.model}`);
    if (Object.hasOwn(plan, row.model)) refuse(`model twice ${row.model}`);
    const counts = new Map<string, number>();
    plan[row.model] = Object.freeze(match[2]!.split(",").map((level) => {
      if (!(row.efforts as readonly string[]).includes(level)) refuse(`level ${row.model} ${level}`);
      const n = (counts.get(level) ?? 0) + 1;
      counts.set(level, n);
      return Object.freeze({ model: row.model, level: level as PreviewEffort, run: `${level}#${String(n)}` });
    }));
  }
  return Object.freeze(plan);
}

/** Spec 2026-10-12 §4.8: the config one run uses: the server's config with only this model's level (no step overrides: a pure A/B). */
export function practiceLevelConfig(config: PreviewProviderTestConfig, run: PracticeLevelRun): PreviewProviderTestConfig {
  return Object.freeze({ ...config, thinking_levels: parsePreviewThinkingLevels({ [run.model]: { level: run.level } }) });
}

/** Spec 2026-10-12 §4.8: the runs in the order job `jobIndex` asks them: rotated by one per job (A B C, B C A, C A B, …). */
export function practiceInterleavedRuns(runs: readonly PracticeLevelRun[], jobIndex: number): readonly PracticeLevelRun[] {
  const shift = runs.length === 0 ? 0 : jobIndex % runs.length;
  return [...runs.slice(shift), ...runs.slice(0, shift)];
}

/**
 * One unit of the formats run's queue: a job (lane, sample), its index among the jobs, and which of a model's runs of it
 * this is (`slot`, 0 for a model without runs).
 */
export type PracticeLevelJob = Readonly<{ lane: PracticeLane; sample: number; jobIndex: number; slot: number }>;

/**
 * The formats run's queue: every job (lane by lane, the samples of a lane together), each repeated once per run slot,
 * the slots of a job one after another. Without a plan there is one slot, so the queue is exactly today's.
 */
export function practiceLevelJobs(lanes: readonly PracticeLane[], samples: number, plan: PracticeLevelPlan | undefined): readonly PracticeLevelJob[] {
  const slots = Math.max(1, ...Object.values(plan ?? {}).map((runs) => runs.length));
  return lanes.flatMap((lane) => Array.from({ length: samples }, (_unused, index) => ({ lane, sample: index + 1 })))
    .flatMap((job, jobIndex) => Array.from({ length: slots }, (_unused, slot) => Object.freeze({ ...job, jobIndex, slot })));
}

/**
 * The run a model makes of one queue unit: its run (a model in the plan), undefined (a model without runs: its one
 * implicit run, slot 0 only), or null when the model has nothing to do in this slot (fewer runs than the longest plan).
 */
export function practiceRunOfJob(plan: PracticeLevelPlan | undefined, model: string, job: PracticeLevelJob): PracticeLevelRun | undefined | null {
  const runs = plan?.[model];
  if (runs === undefined) return job.slot === 0 ? undefined : null;
  return practiceInterleavedRuns(runs, job.jobIndex)[job.slot] ?? null;
}
