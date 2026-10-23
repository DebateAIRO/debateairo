import type { Pool } from "pg";
import {
  PREVIEW_UNREVIEWED_REF_PREFIX,
  previewCallBound,
  previewModelRow,
  previewProviderSocket,
  previewSeatableModels,
  type PreviewGateSettings,
  type PreviewModelRow
} from "@debateai/providers";
import { readSynthesisRoleControls } from "./algorithm-policy.js";
import type { SealedPreviewLineUp } from "./preview-line-up-policy.js";
import { readStoryPolicyFromRegister } from "./story-policy.js";

/**
 * Side-by-side spec §13 "Activation is refused unless", ADDITION D19-D21 (SA10) — EVERY MODEL A VERSION CAN SEAT.
 *
 * Plain words: on the preview a settings version can change who debates (the two rosters), how hard each AI thinks
 * (the thinking table), who writes and checks the answer and the story (the four seats) and the call bounds. Before such
 * a version is activated, check-version proves, from this code's own copy of the gates' reviewed rows (the parity files
 * tie it to the gates' helper), that every model it can seat is one the gates reviewed, at a level on that model's
 * menu, with no sealed ceiling above what the model may answer; and that this release's environment can reach each one
 * (a declared target serves it, its gate has a socket). The activation repeats the "is it switched on at its gate" half
 * live (settings-operator.ts, addition D21). This module holds the pure rules both check halves and the operator share,
 * and the one register read of the four seats the API half and the operator need.
 *
 * Every code is a REPORT code (returned, never thrown), content-free: model ids, provider refs, row keys and levels as
 * reviewed (the report's alphabet; anything else is caught by `settingsCheckReport`, FINAL-FIX 20).
 */

/** The one sealed bound the preview never sends (it sends the row's own story allowance instead): exempt from D20. */
export const SETTINGS_EXEMPT_CEILING_ROW_KEY = "storytellerCallBound" as const;

/** One sealed call bound the version holds: its row key (`<row>.<organ>` for the organ bounds) and its token ceiling. */
export type SettingsCallBound = Readonly<{ rowKey: string; tokenCeiling: number }>;

/**
 * Addition D14 (and SA10): the line-up a version runs on — its own row, else the env's (the two old env forms) — or null
 * when neither exists (a row-less version beside a sockets-only env: PREVIEW_LINE_UP_REQUIRED, the boot's own code).
 */
export function settingsVersionLineUp(
  row: SealedPreviewLineUp | null,
  envLineUp: SealedPreviewLineUp | null | undefined
): SealedPreviewLineUp | null {
  return row ?? envLineUp ?? null;
}

/**
 * Addition D20 (SA10): the seatable set of a version, by SA1's one rule (`previewSeatableModels`): both rosters, each
 * seat ref's reviewed model (an unreviewed ref as `unreviewed-ref:<ref>`), and the structure-repair model when one of
 * `declaredModels` serves it. Sorted, unique, frozen. Only the rosters of the line-up are read here.
 */
export function settingsSeatableModels(input: Readonly<{
  lineUp: SealedPreviewLineUp;
  seatRefs: readonly string[];
  declaredModels: readonly string[];
}>): readonly string[] {
  return previewSeatableModels({
    lineUp: { free_model_ids: input.lineUp.free_model_ids, premium_model_ids: input.lineUp.premium_model_ids, thinking_levels: null },
    seatRefs: input.seatRefs,
    declaredModels: input.declaredModels
  });
}

/** An entry of the seatable set that names a seat ref the preview never reviewed: that ref, else null. */
export function unreviewedSeatRef(entry: string): string | null {
  return entry.startsWith(PREVIEW_UNREVIEWED_REF_PREFIX) ? entry.slice(PREVIEW_UNREVIEWED_REF_PREFIX.length) : null;
}

/**
 * Addition D19 — condition 3 for the line-up, against ONE process's own environment (each check half passes its own:
 * the runner's `runner.env`, the API's `api.env`; the API half's TARGET check is also what keeps every seatable model's
 * company on the providers page, D24 item 5):
 *  - SETTINGS_NEEDS_ENV_CHANGE:TARGET:<model> — a seatable model no declared target serves;
 *  - SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:<provider> — a seatable model whose provider's gate has no socket in the env.
 * A seat ref the preview never reviewed is condition 6's (SETTINGS_GATE_UNREVIEWED), not this check's. Sorted, unique.
 */
export function settingsLineUpEnvironmentCodes(input: Readonly<{
  seatable: readonly string[];
  declaredModels: readonly string[];
  gate: PreviewGateSettings;
}>): readonly string[] {
  const served = new Set(input.declaredModels);
  const codes = new Set<string>();
  for (const model of input.seatable) {
    if (unreviewedSeatRef(model) !== null) continue;
    if (!served.has(model)) codes.add(`SETTINGS_NEEDS_ENV_CHANGE:TARGET:${model}`);
    const row = previewModelRow(model);
    if (row !== undefined && previewProviderSocket(input.gate, row.provider) === undefined) {
      codes.add(`SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:${row.provider}`);
    }
  }
  return Object.freeze([...codes].sort());
}

/**
 * Addition D20 — condition 6, the code copy: SETTINGS_GATE_UNREVIEWED:<model or ref> for every seatable model that is
 * not one of this code's reviewed rows (a roster id a newer code dropped, a seat ref never reviewed) and every model the
 * sealed thinking table names that is not one either. Sorted, unique.
 */
export function settingsGateUnreviewedCodes(input: Readonly<{
  seatable: readonly string[];
  lineUp: SealedPreviewLineUp | null;
}>): readonly string[] {
  const codes = new Set<string>();
  for (const entry of input.seatable) {
    const ref = unreviewedSeatRef(entry);
    if (ref !== null) codes.add(`SETTINGS_GATE_UNREVIEWED:${ref}`);
    else if (previewModelRow(entry) === undefined) codes.add(`SETTINGS_GATE_UNREVIEWED:${entry}`);
  }
  for (const model of Object.keys(input.lineUp?.thinking_levels ?? {})) {
    if (previewModelRow(model) === undefined) codes.add(`SETTINGS_GATE_UNREVIEWED:${model}`);
  }
  return Object.freeze([...codes].sort());
}

/**
 * Addition D20 — condition 6, the code copy: SETTINGS_GATE_THINKING_UNREVIEWED:<model>:<level> for every level the
 * sealed table names (an AI's usual level or a step's) that is off that model's reviewed menu in THIS code. The row
 * parser refuses such a table at publish; this re-check covers a version sealed by an older code whose menu was wider.
 * A model that is no reviewed row is SETTINGS_GATE_UNREVIEWED's (above). Sorted, unique.
 */
export function settingsGateThinkingCodes(input: Readonly<{ lineUp: SealedPreviewLineUp | null }>): readonly string[] {
  const codes = new Set<string>();
  for (const [model, choice] of Object.entries(input.lineUp?.thinking_levels ?? {})) {
    const row = previewModelRow(model);
    if (row === undefined) continue;
    const menu: readonly string[] = row.efforts;
    const levels = [choice.level, ...Object.values(choice.steps ?? {})].filter((level): level is string => level !== undefined);
    for (const level of levels) if (!menu.includes(level)) codes.add(`SETTINGS_GATE_THINKING_UNREVIEWED:${model}:${level}`);
  }
  return Object.freeze([...codes].sort());
}

/**
 * Addition D20 — condition 6, the code copy: SETTINGS_GATE_TOKEN_CEILING:<rowKey>:<model> for every sealed ceiling the
 * preview actually sends (after `previewCallBound`: the preview's token floor) that is above a seatable model's reviewed
 * `outputBound`: the three organ bounds, the synthesizer, evaluator and story-checker bounds, against EVERY seatable
 * model (with role rotation any roster model may write). The storyteller's bound is exempt: the preview sends the row's
 * own story allowance instead (`SETTINGS_EXEMPT_CEILING_ROW_KEY`). Why refuse instead of clamp: a sealed value that is
 * not what is sent misleads the owner and over-prices the estimate. Sorted, unique.
 */
export function settingsGateTokenCeilingCodes(input: Readonly<{
  seatable: readonly string[];
  callBounds: readonly SettingsCallBound[];
  gate: PreviewGateSettings;
}>): readonly string[] {
  const rows = input.seatable.map((model) => previewModelRow(model)).filter((row): row is PreviewModelRow => row !== undefined);
  const codes = new Set<string>();
  for (const bound of input.callBounds) {
    if (bound.rowKey === SETTINGS_EXEMPT_CEILING_ROW_KEY) continue;
    // Only the token ceiling is compared; attempts and deadline are carried so previewCallBound reads a whole bound.
    const sent = previewCallBound({ maxAttempts: 1, tokenCeiling: bound.tokenCeiling, deadlineMs: 1 }, input.gate).tokenCeiling;
    for (const row of rows) if (sent > row.outputBound) codes.add(`SETTINGS_GATE_TOKEN_CEILING:${bound.rowKey}:${row.model}`);
  }
  return Object.freeze([...codes].sort());
}

/** A seatable model with the gate (provider) its calls go through, as the live condition 6 checks it (addition D21). */
export type SettingsSeatableGateModel = Readonly<{ gate: string; model: string }>;

/**
 * Addition D21 (SA10): the seatable set split for the live check: each reviewed model with its gate, and every entry
 * that is no reviewed row (a never-reviewed seat ref by its ref, a dropped roster id by its id) for
 * SETTINGS_GATE_UNREVIEWED. Frozen.
 */
export function settingsSeatableGateModels(seatable: readonly string[]): Readonly<{
  models: readonly SettingsSeatableGateModel[];
  unreviewed: readonly string[];
}> {
  const models: SettingsSeatableGateModel[] = [];
  const unreviewed: string[] = [];
  for (const entry of seatable) {
    const ref = unreviewedSeatRef(entry);
    const row = ref === null ? previewModelRow(entry) : undefined;
    if (row === undefined) unreviewed.push(ref ?? entry);
    else models.push(Object.freeze({ gate: row.provider, model: row.model }));
  }
  return Object.freeze({ models: Object.freeze(models), unreviewed: Object.freeze(unreviewed) });
}

/**
 * Addition D20 (SA10): the four seat refs one version names, by the register's own readers at the version: the
 * synthesis pair (`readSynthesisRoleControls`) and, when the version seals the story rows, the story pair
 * (`readStoryPolicyFromRegister`; absent rows = no story seats; a partly sealed family refuses with its own code). The
 * API half and the operator read them here; the runner half reads the same rows through its runner policy.
 */
export async function readSettingsSeatRefs(pool: Pool, version: number): Promise<readonly string[]> {
  const synthesis = await readSynthesisRoleControls(pool, version);
  const story = await readStoryPolicyFromRegister(pool, version);
  return Object.freeze([
    synthesis.synthesizerRoleRef, synthesis.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])
  ]);
}
