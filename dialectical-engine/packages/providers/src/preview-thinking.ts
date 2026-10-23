/**
 * The owner's thinking levels on the private preview (spec 2026-10-12 §4.2–§4.4).
 *
 * Plain words: the owner picks how hard each AI thinks, a usual level per AI and, if wanted, a different level for
 * named steps (for example a lighter story writer). Only levels on the AI's reviewed menu (preview-models.ts, the gate
 * holds the same menu) are accepted; anything else stops the app at boot. A step the table does not name runs at its AI's
 * usual level, and an AI the table does not name runs at its row's default, which is exactly today's request.
 */
import { THINKING_LEVEL_DEFAULT_ONLY, debateRoleFromCallSiteKey, exhaustive, lengthCallStepOf } from "@debateai/kernel";
import { previewModelRow, type PreviewEffort, type PreviewModelRow } from "./preview-models.js";

/** Spec 2026-10-12 §4.3: the step names a table may override (slip_fix = a repair POST inside a call). */
export const PREVIEW_THINKING_STEPS = Object.freeze(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
  "answer_writer", "answer_checker", "story_writer", "story_checker", "slip_fix"] as const);
/** Spec 2026-10-12 §4.3: one step name (see PREVIEW_THINKING_STEPS). */
export type PreviewThinkingStep = typeof PREVIEW_THINKING_STEPS[number];
/** Spec 2026-10-12 §4.2: one AI's entry in the table: its usual level and optional per-step levels. */
export type PreviewThinkingChoice = Readonly<{ level?: PreviewEffort; steps?: Readonly<Partial<Record<PreviewThinkingStep, PreviewEffort>>> }>;
/** Spec 2026-10-12 §4.2: the table, keyed by reviewed model id. */
export type PreviewThinkingLevels = Readonly<Record<string, PreviewThinkingChoice>>;
/** Spec 2026-10-12 §4.2: the one plain error the API and the runner refuse to boot with on a bad table. */
export const PREVIEW_THINKING_LEVELS_INVALID = "PREVIEW_THINKING_LEVELS_INVALID" as const;

function invalid(detail: string): never { throw new TypeError(`${PREVIEW_THINKING_LEVELS_INVALID}:${detail}`); }
/** One detail part as it may stand in a refusal code (the settings caches' alphabet); a part outside it is dropped. */
const CODE_PART = /^[A-Za-z0-9_./-]{1,200}$/u;
/**
 * Ruling R65 (SA10 fix round 1): a refusal's detail is code-shaped, `<what>[:<model>[:<step>]]`, so check-version records
 * the boot's own refusal as a code (a detail with a space made the half fail to check). A model or step name outside the
 * code alphabet is left out (the detail then names only what is printable).
 */
function codeDetail(what: string, ...parts: string[]): string {
  const printable: string[] = [];
  for (const part of parts) { if (!CODE_PART.test(part)) break; printable.push(part); }
  return [what, ...printable].join(":");
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onMenu(row: PreviewModelRow, value: unknown, where: string): PreviewEffort {
  if (typeof value !== "string" || !(row.efforts as readonly string[]).includes(value)) invalid(where);
  return value as PreviewEffort;
}

/**
 * Spec 2026-10-12 §4.2: the table as the owner wrote it, checked against every named AI's reviewed menu. Throws
 * `PREVIEW_THINKING_LEVELS_INVALID:<detail>` for an unknown model, step or level, an empty object, or any other key;
 * the detail is code-shaped (ruling R65): `table`, `model:<model>`, `entry:<model>`, `level:<model>`, `steps:<model>`,
 * `step:<model>:<step>` or `level:<model>:<step>`.
 */
export function parsePreviewThinkingLevels(value: unknown): PreviewThinkingLevels {
  if (!isPlainObject(value) || Object.keys(value).length === 0) invalid("table");
  const table: Record<string, PreviewThinkingChoice> = {};
  for (const [model, choice] of Object.entries(value)) {
    const row = previewModelRow(model) ?? invalid(codeDetail("model", model));
    if (!isPlainObject(choice) || Object.keys(choice).length === 0
      || Object.keys(choice).some(key => key !== "level" && key !== "steps")) invalid(codeDetail("entry", model));
    const level = choice.level === undefined ? undefined : onMenu(row, choice.level, codeDetail("level", model));
    let steps: Partial<Record<PreviewThinkingStep, PreviewEffort>> | undefined;
    if (choice.steps !== undefined) {
      if (!isPlainObject(choice.steps) || Object.keys(choice.steps).length === 0) invalid(codeDetail("steps", model));
      steps = {};
      for (const [step, stepLevel] of Object.entries(choice.steps)) {
        if (!(PREVIEW_THINKING_STEPS as readonly string[]).includes(step)) invalid(codeDetail("step", model, step));
        steps[step as PreviewThinkingStep] = onMenu(row, stepLevel, codeDetail("level", model, step));
      }
    }
    table[model] = Object.freeze({ ...(level === undefined ? {} : { level }), ...(steps === undefined ? {} : { steps: Object.freeze(steps) }) });
  }
  return Object.freeze(table);
}

/**
 * Spec 2026-10-12 §4.3: the step a call belongs to, from its call-site key (any `:seat:main|runnerUp` suffix removed) and,
 * for the two story sites, its lane. Any other call (health checks, the dormant evaluator lane) has no step: null.
 */
export function previewThinkingStepOf(request: Readonly<{ callSiteKey: string; lane?: string }>): PreviewThinkingStep | null {
  // LG-A (L32): the structure-repair call runs at the repair model's `slip_fix` level (owner's table; absent: its usual level).
  if (lengthCallStepOf(request.callSiteKey) === "structure_repair") return "slip_fix";
  if (request.lane === "story" && /^STORY:STORYTELLER:[1-8]$/u.test(request.callSiteKey)) return "story_writer";
  if (request.lane === "story" && /^STORY:CHECKER:[1-8]$/u.test(request.callSiteKey)) return "story_checker";
  // Debate shape (merge of dev into Phase 2, 2026-10-13): the map's calls (MAP:angles, MAP:list:N, MAP:merge, MAP:gap:N,
  // MAP:choose; packages/map) build the debate's opening, so they run at the owner's `opening` level, the closest step.
  if (/^MAP:/u.test(request.callSiteKey)) return "opening";
  const role = debateRoleFromCallSiteKey(request.callSiteKey);
  if (role === null) return null;
  switch (role) {
    case "POSITION": return "opening";
    case "SUPPORT_ATTACK": return "pros_cons";
    case "CROSS_EXCHANGE": return "cross_exchange";
    case "JUDGE": return "judge_panel";
    case "REVIEWER": return "reviewer";
    case "ANSWER_WRITER": return "answer_writer";
    case "ANSWER_CHECKER": return "answer_checker";
    default: return exhaustive(role);
  }
}

/**
 * Spec 2026-10-12 §4.4: the level a call runs at, as the step's override, else the AI's usual level, else the row's
 * reviewed default. A null step (no step for the call) skips the overrides.
 */
export function previewThinkingLevelFor(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow, step: PreviewThinkingStep | null): PreviewEffort {
  const choice = levels?.[row.model];
  return (step === null ? undefined : choice?.steps?.[step]) ?? choice?.level ?? row.defaultEffort;
}

/**
 * Spec 2026-10-12 §4.3–§4.4: the level a repair POST inside a call runs at, when the owner set `slip_fix` for this AI;
 * undefined means the repair runs at its step's own level, as today.
 */
export function previewSlipFixLevel(levels: PreviewThinkingLevels | undefined, row: PreviewModelRow): PreviewEffort | undefined {
  return levels?.[row.model]?.steps?.slip_fix;
}

/**
 * Length guidance L25 (spec 2026-10-15 §3.3): the level one below `level` on the row's strength order, or null when it is
 * the lowest (or not on the row's menu). A retry after thinking ate the answer's room runs at it.
 */
export function previewThinkingLevelBelow(row: PreviewModelRow, level: PreviewEffort): PreviewEffort | null {
  const at = row.effortsByStrength.indexOf(level);
  return at < 0 || at === row.effortsByStrength.length - 1 ? null : row.effortsByStrength[at + 1]!;
}

/**
 * Spec 2026-10-12 §4.4: a level as the request carries it. "default" travels as DEFAULT_ONLY, which the gateway sends as
 * no effort member at all (the vendor's own default).
 */
export function previewThinkingLevelOnRequest(level: PreviewEffort): string {
  return level === "default" ? THINKING_LEVEL_DEFAULT_ONLY : level;
}
