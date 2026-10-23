/**
 * Side-by-side spec §13, ADDITION D12-D20 (owner 2026-10-22): the preview's AI line-up becomes a settings value.
 *
 * Plain words: which AIs debate on Free and on Premium (the two rosters) and how hard each AI thinks (the thinking-level
 * table) move out of the server setting `PREVIEW_PROVIDER_TEST_CONFIG_JSON` into the sealed settings versions, so a
 * change is an activation, not an upload. The server setting keeps only the gate part: the deployment, the fixed wire
 * word, the gate sockets and the scope (D13). This file is the providers-level half: the line-up's own check, the env's
 * three accepted forms, the composition back into today's config shape (so every reader that takes that shape keeps its
 * code, D16), and the set of models a version can seat (D20). Providers stays below the register: no import of it here.
 */
import { TypedDomainError } from "@debateai/kernel";
import { previewModelRow, previewModelRowForRef, previewRostersHonourMakerRule, PREVIEW_MODEL_ROWS } from "./preview-models.js";
import {
  PREVIEW_PROVIDER_SOCKET_KEYS, PREVIEW_STRUCTURE_REPAIR_MODEL, readPreviewEnvironmentSource, validatePreviewProviderTestConfig,
  type PreviewProviderTestConfig
} from "./preview-test.js";
import { parsePreviewThinkingLevels, type PreviewThinkingLevels } from "./preview-thinking.js";

/**
 * Addition D12: one line-up, exactly the three members the owner already writes in the env (so the live table pastes in
 * unchanged). `thinking_levels: null` = every AI at its row's default (today's "no table").
 */
export type PreviewLineUp = Readonly<{
  free_model_ids: readonly string[];
  premium_model_ids: readonly string[];
  thinking_levels: PreviewThinkingLevels | null;
}>;
/** Addition D13-D14: the part of the preview configuration that stays in the env (no rosters, no table). */
export type PreviewGateSettings = Pick<PreviewProviderTestConfig,
  "deployment" | "requested_thinking_level" | "budget_socket" | "scope_id" | "anthropic_budget_socket">;
/**
 * Addition D14: the env, parsed. `envLineUp` is the line-up the two old forms carry (the fallback for a settings version
 * without the row); null for the sockets-only form.
 */
export type PreviewEnvironmentConfig = Readonly<{ gate: PreviewGateSettings; envLineUp: PreviewLineUp | null }>;
/** Addition D12: the one refusal of a bad line-up value (rosters, maker rule); the table keeps its own parser's error. */
export const PREVIEW_LINE_UP_POLICY_INVALID = "PREVIEW_LINE_UP_POLICY_INVALID" as const;
/** Addition D20: how a seat ref the preview never reviewed is named in the seatable set (so check-version can refuse it). */
export const PREVIEW_UNREVIEWED_REF_PREFIX = "unreviewed-ref:" as const;

const LINE_UP_MEMBERS = Object.freeze(["free_model_ids", "premium_model_ids", "thinking_levels"] as const);
function invalid(detail: string): never { throw new TypeError(`${PREVIEW_LINE_UP_POLICY_INVALID}:${detail}`); }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** One roster: a list of 1..(reviewed rows) reviewed model ids, each once. */
function lineUpRoster(value: unknown, member: "free_model_ids" | "premium_model_ids"): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PREVIEW_MODEL_ROWS.length) invalid(`${member}:list`);
  if (value.some(id => previewModelRow(id) === undefined)) invalid(`${member}:unreviewed`);
  if (new Set(value).size !== value.length) invalid(`${member}:duplicate`);
  return Object.freeze([...value as string[]]);
}

/**
 * Addition D12 (owner 2026-10-22): a line-up value checked as the env's rosters and table are checked today: exactly the
 * three members; each roster a non-empty list of unique reviewed ids; the two-maker rule (previewRostersHonourMakerRule);
 * the table through parsePreviewThinkingLevels (every level on its AI's reviewed menu), or null. Throws TypeError
 * `PREVIEW_LINE_UP_POLICY_INVALID:<detail>` (value | members | <roster>:list | <roster>:unreviewed | <roster>:duplicate |
 * maker_rule), or the thinking parser's own `PREVIEW_THINKING_LEVELS_INVALID:<detail>`, unwrapped.
 */
export function parsePreviewLineUp(value: unknown): PreviewLineUp {
  if (!isPlainObject(value)) invalid("value");
  if (Object.keys(value).sort().join(",") !== LINE_UP_MEMBERS.join(",")) invalid("members");
  const free = lineUpRoster(value.free_model_ids, "free_model_ids");
  const premium = lineUpRoster(value.premium_model_ids, "premium_model_ids");
  if (!previewRostersHonourMakerRule(free, premium)) invalid("maker_rule");
  const table = value.thinking_levels === null ? null : parsePreviewThinkingLevels(value.thinking_levels);
  return Object.freeze({ free_model_ids: free, premium_model_ids: premium, thinking_levels: table });
}

/**
 * Addition D14 (owner 2026-10-22): the env's three accepted forms, read through the same key check as
 * parsePreviewProviderTestConfig (readPreviewEnvironmentSource), so the two parsers cannot drift:
 * - the legacy five keys (free = premium = [GLM]) and the six keys (two rosters, optional Anthropic socket): their
 *   rosters and optional table become `envLineUp`, the fallback for settings versions without the line-up row;
 * - the sockets-only form (`budget_socket`, `deployment`, `requested_thinking_level`, `scope_id`, optional
 *   `anthropic_budget_socket`; no rosters, no table): `envLineUp: null`.
 * Undefined when the variable is unset; PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID otherwise (a table without rosters
 * included), or the thinking parser's own error for a bad table. Whether an env line-up may stand beside a site version
 * carrying the row (D15) is the boot's decision, not this parser's.
 */
export function parsePreviewEnvironmentConfig(source: string | undefined): PreviewEnvironmentConfig | undefined {
  if (source === undefined) return undefined;
  const read = readPreviewEnvironmentSource(source);
  return Object.freeze({ gate: read.gate, envLineUp: read.config === null ? null : previewLineUpOfConfig(read.config) });
}

/**
 * Addition D16 (owner 2026-10-22): the gate part plus a line-up, as today's PreviewProviderTestConfig, so every reader
 * that takes that shape (admission rosters, the room's maker count, the billing fit, the target checks, the estimate)
 * keeps its code. Only the gate members of `gate` are read (a whole config passed as the gate lends no roster or table).
 * The result is exactly the six-key parse of the same values: it is built by validatePreviewProviderTestConfig itself,
 * so it passes that check unchanged, and a roster model whose gate has no socket here is refused
 * (PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID, today's rule), as is any line-up today's parser would refuse.
 */
export function composePreviewProviderTestConfig(gate: PreviewGateSettings, lineUp: PreviewLineUp): PreviewProviderTestConfig {
  const sockets = Object.fromEntries(Object.values(PREVIEW_PROVIDER_SOCKET_KEYS).flatMap(key =>
    typeof gate[key] === "string" ? [[key, gate[key]]] : []));
  const composed = validatePreviewProviderTestConfig({ deployment: gate.deployment, requested_thinking_level: gate.requested_thinking_level,
    budget_socket: gate.budget_socket, scope_id: gate.scope_id, ...sockets,
    free_model_ids: lineUp.free_model_ids, premium_model_ids: lineUp.premium_model_ids,
    ...(lineUp.thinking_levels === null ? {} : { thinking_levels: lineUp.thinking_levels }) });
  // validatePreviewProviderTestConfig returns undefined only for an undefined value; the object above never is.
  if (composed === undefined) throw new TypeError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  return composed;
}

/**
 * Addition D14-D16 (owner 2026-10-22) — THE ONE RESOLUTION RULE of a settings version's preview line-up, written once
 * here so the runner's loader (apps/runner/src/run-settings.ts, resolvePreviewVersionConfig) and the API's admission
 * loader (SA6) cannot drift (ruling R17). `preview` is the env's parse (parsePreviewEnvironmentConfig: the gate part and
 * the old forms' line-up, or undefined without the variable); `row` is the version's previewLineUpPolicy (null without
 * it); `isSiteVersion` says whether the version is the release's own (its REGISTER_VERSION).
 *
 * - no preview, no row: undefined (hosted production, local mode: today's runner and API);
 * - a row without the preview: TypedDomainError PREVIEW_LINE_UP_WITHOUT_PREVIEW (D15: a boot refusal on the site
 *   version, an unsupported version otherwise);
 * - a row on the site version while the env still carries rosters or a table: PREVIEW_LINE_UP_ENV_CONFLICT (D15: one
 *   source of truth per release; an env member is refused, never silently ignored);
 * - a row: its composition over the env's gate part (on another version the row wins over the env's line-up, D14);
 * - no row and the env's line-up (the old forms): the env's composition, which is today's config byte for byte;
 * - no row and the sockets-only env: PREVIEW_LINE_UP_REQUIRED (D14).
 * The composition refuses as composePreviewProviderTestConfig does (a roster model whose gate has no socket here).
 */
export function resolvePreviewLineUp(input: Readonly<{
  preview: PreviewEnvironmentConfig | undefined;
  row: PreviewLineUp | null;
  isSiteVersion: boolean;
}>): PreviewProviderTestConfig | undefined {
  const { preview, row } = input;
  if (preview === undefined) {
    if (row === null) return undefined;
    throw new TypedDomainError("PREVIEW_LINE_UP_WITHOUT_PREVIEW",
      "A settings version carries the preview line-up, but this deployment has no preview configuration");
  }
  if (row !== null) {
    if (input.isSiteVersion && preview.envLineUp !== null) {
      throw new TypedDomainError("PREVIEW_LINE_UP_ENV_CONFLICT",
        "The site settings version carries the preview line-up, so the preview configuration may carry only its gate part");
    }
    return composePreviewProviderTestConfig(preview.gate, row);
  }
  if (preview.envLineUp === null) {
    throw new TypedDomainError("PREVIEW_LINE_UP_REQUIRED",
      "The preview configuration carries only its gate part, and this settings version carries no preview line-up");
  }
  return composePreviewProviderTestConfig(preview.gate, preview.envLineUp);
}

/**
 * Addition D23 (owner 2026-10-22): a config's line-up (its two rosters and its table, or null), for
 * `check-thinking-levels --print-line-up` and the first settings version's seed. Round-trips through
 * composePreviewProviderTestConfig.
 */
export function previewLineUpOfConfig(config: PreviewProviderTestConfig): PreviewLineUp {
  return Object.freeze({ free_model_ids: Object.freeze([...config.free_model_ids]),
    premium_model_ids: Object.freeze([...config.premium_model_ids]), thinking_levels: config.thinking_levels ?? null });
}

/**
 * Addition D20 (owner 2026-10-22): every model a settings version can seat on the preview, for condition 6
 * (check-version): both rosters, the model of each answer-seat ref (writer, checker, storyteller, story checker; with role
 * rotation any roster model may also write, which the rosters already cover), and the structure-repair model when a
 * declared target serves it (PREVIEW_STRUCTURE_REPAIR_MODEL). A seat ref the preview never reviewed is kept as
 * `unreviewed-ref:<ref>`, so the check can name it. Sorted, unique, frozen.
 */
export function previewSeatableModels(input: Readonly<{
  lineUp: PreviewLineUp;
  seatRefs: readonly string[];
  declaredModels: readonly string[];
}>): readonly string[] {
  const seatable = new Set<string>([...input.lineUp.free_model_ids, ...input.lineUp.premium_model_ids]);
  for (const ref of input.seatRefs) seatable.add(previewModelRowForRef(ref)?.model ?? `${PREVIEW_UNREVIEWED_REF_PREFIX}${ref}`);
  if (input.declaredModels.includes(PREVIEW_STRUCTURE_REPAIR_MODEL)) seatable.add(PREVIEW_STRUCTURE_REPAIR_MODEL);
  return Object.freeze([...seatable].sort());
}
