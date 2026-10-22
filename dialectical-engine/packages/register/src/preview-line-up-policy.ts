import type { Pool } from "pg";
import { z } from "zod";
import {
  PREVIEW_LINE_UP_POLICY_INVALID, PREVIEW_MODEL_ROWS, parsePreviewLineUp, type PreviewLineUp, type PreviewThinkingLevels
} from "@debateai/providers";
import { canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Owner 2026-10-22: the preview's line-up and thinking levels are settings, not env; D12; absent = the env's line-up,
 * D14; preview-only, D15.
 *
 * Side-by-side spec §13, ADDITION D12: ONE optional row in its own family, classified DEBATE (settings-classification.ts:
 * every member decides how one debate runs; no site member, so no member map). Plain words: which AIs debate on Free and
 * on Premium, and how hard each one thinks, sealed in a settings version so a change is an activation, not an upload.
 * The members are exactly the env's (`free_model_ids`, `premium_model_ids`, `thinking_levels`), so the owner's live
 * table pastes in unchanged; `thinking_levels: null` = every AI at its row's default (today's "no table").
 *
 * It is NOT a register.required_row: every sealed version that exists today has no row and reads ABSENT (null), which
 * keeps the env's line-up (D14). The local runner's `developmentRows` never carry it (local mode has no preview
 * configuration; a row there refuses at boot, D15). A row that does not parse is loud.
 *
 * Checks, in order: the strict zod schema below (kind, exact members, the size bounds, a non-empty table), then the
 * providers-level line-up check SA1 owns (`parsePreviewLineUp`: every id a reviewed row, unique per roster, the
 * two-maker rule, each level on its AI's reviewed menu). Providers stays below the register (it imports nothing from
 * here); the register already reads the preview's env through providers (runtime-environment.ts).
 */
export const PREVIEW_LINE_UP_POLICY_ROW_KEY = "previewLineUpPolicy" as const;
const KIND = "PREVIEW_LINE_UP_POLICY" as const;
const roster = z.array(z.string().min(1)).min(1).max(PREVIEW_MODEL_ROWS.length);
const schema = z.object({
  kind: z.literal(KIND),
  free_model_ids: roster,
  premium_model_ids: roster,
  thinking_levels: z.record(z.string(), z.unknown()).refine(table => Object.keys(table).length > 0).nullable()
}).strict();

function invalid(detail: string): never { throw new TypeError(`${PREVIEW_LINE_UP_POLICY_INVALID}:${detail}`); }

/**
 * Addition D12: a sealed value, checked. Throws TypeError `PREVIEW_LINE_UP_POLICY_INVALID:<detail>` where the schema
 * names the fault (`value` | `members` | `kind` | `free_model_ids` | `premium_model_ids` | `thinking_levels`) or
 * parsePreviewLineUp does (`<roster>:unreviewed` | `<roster>:duplicate` | `maker_rule` | …), or the thinking parser's own
 * `PREVIEW_THINKING_LEVELS_INVALID:<detail>` for an off-menu level, unwrapped. The result is frozen.
 */
export function previewLineUpPolicyFromValue(value: unknown): PreviewLineUp {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue === undefined || issue.path.length === 0) return invalid(issue?.code === "unrecognized_keys" ? "members" : "value");
    return invalid(String(issue.path[0]));
  }
  return parsePreviewLineUp({
    free_model_ids: parsed.data.free_model_ids,
    premium_model_ids: parsed.data.premium_model_ids,
    thinking_levels: parsed.data.thinking_levels
  });
}

/** Addition D12, D14: the version's line-up, or null when the version has no row (ABSENT: the env's line-up). */
export async function readPreviewLineUpPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<PreviewLineUp | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, PREVIEW_LINE_UP_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : previewLineUpPolicyFromValue(row.value_json);
}

/** The table as canonical JSON: strings and objects only (the parser's output never holds a number or undefined). */
function thinkingLevelsAst(table: PreviewThinkingLevels): CanonicalJsonAst {
  return Object.freeze(Object.fromEntries(Object.entries(table).map(([model, choice]) => {
    const steps = choice.steps === undefined ? undefined : Object.freeze(Object.fromEntries(
      Object.entries(choice.steps).flatMap(([step, level]) => level === undefined ? [] : [[step, level]])));
    return [model, Object.freeze({ ...(choice.level === undefined ? {} : { level: choice.level }), ...(steps === undefined ? {} : { steps }) })];
  })));
}

/**
 * Addition D12, D23: the row a publisher seals (the preview's kit, SA9), in the house row shape the kit's row check
 * accepts (`rowKey`, `valueJsonText`, `sourceRef`). The line-up is checked again (parsePreviewLineUp), so a builder can
 * never seal a value the reader would refuse; the text is canonical register JSON, so the key order of the line-up it is
 * handed never changes the sealed bytes.
 */
export function previewLineUpPolicyRow(lineUp: PreviewLineUp, sourceRef: string): Readonly<{
  rowKey: typeof PREVIEW_LINE_UP_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("source_ref");
  const checked = parsePreviewLineUp({ free_model_ids: lineUp?.free_model_ids, premium_model_ids: lineUp?.premium_model_ids,
    thinking_levels: lineUp?.thinking_levels });
  const valueAst: CanonicalJsonAst = Object.freeze({
    kind: KIND,
    free_model_ids: Object.freeze([...checked.free_model_ids]),
    premium_model_ids: Object.freeze([...checked.premium_model_ids]),
    thinking_levels: checked.thinking_levels === null ? null : thinkingLevelsAst(checked.thinking_levels)
  });
  return Object.freeze({ rowKey: PREVIEW_LINE_UP_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(valueAst), sourceRef });
}
