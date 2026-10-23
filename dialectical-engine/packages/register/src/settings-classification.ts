import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { effectiveCallConcurrency, type CallConcurrencyPolicyState } from "./call-concurrency-policy.js";
import { costEnvelopeBand, costEnvelopePolicyFromValue, type CostEnvelopePolicy } from "./cost-envelope-policy.js";
import {
  canonicalDecimal,
  canonicalRegisterJson,
  parseCanonicalRegisterJson,
  type CanonicalJsonAst,
  type CanonicalRegisterJson
} from "./register-publication.js";

/**
 * SETTINGS CHANGES WITHOUT AN UPLOAD (side-by-side spec §13): THE CODE-OWNED ROW CLASSIFICATION.
 *
 * One runner and one API serve several sealed settings versions at once. Every debate keeps the version it was
 * stamped with (`core.run.register_version`); the site keeps the release's own version (its `REGISTER_VERSION`).
 * This file says, for every register row the code knows, which of the two a row follows:
 *
 *  - DEBATE: follows the debate's stamp, so a newly activated version changes it for new debates only;
 *  - SITE: follows the release, and must be equal, member for member, in any version activated for it (§13
 *    condition 2): logins, rate limits, countries, plan prices, the toolchain, the provider set;
 *  - MIXED: split member by member by `MIXED_SETTINGS_ROW_MEMBERS`;
 *  - CODE_BOUND: a hash of code, compared with the code that runs the version by `check-version` (never with the
 *    site version): a settings version can never carry another release's prompts.
 *
 * The table is a frozen literal, not a derivation: a new register row is unclassified until someone decides its
 * kind here, on purpose, and the completeness test (`tests/unit/settings-classification.test.ts`) turns red until
 * they do. `compareSiteSettings` refuses an unclassified row by name (`SETTINGS_ROW_UNCLASSIFIED`).
 */
export type SettingsRowKind = "DEBATE" | "SITE" | "MIXED" | "CODE_BOUND";

/**
 * SITE rows (spec §13: "site rules follow the release"). The toolchain the bootstrap file resolves; every login,
 * recovery, staff and rate rule; countries, billing and tax; the publication check; the provider set and panel
 * discovery; the room estimate's starting figures (`costEstimateStartPolicy`, fresh-site estimate 2026-10-22: hosted
 * only, sealed with each release's kit, read once from the site version for every version's estimator). The sixteen
 * support keys and `supportActivation` live in SUPPORT_CONFIGURATION versions, which an activation refuses; they are
 * listed so a stray one is never unclassified.
 */
const SITE_ROW_KEYS = Object.freeze([
  "nodeRuntimeVersion", "pnpmVersion", "postgresMajorVersion", "typescriptVersion", "vllmImageDigest",
  "passwordPolicy", "auditSourceIpKdfPolicy", "verificationPolicy", "rateLimitPolicy", "channelPolicy",
  "mfaPolicy", "sessionPolicy", "admissionPolicy", "passwordResetPolicy", "backupEmailVerificationPolicy",
  "mfaRecoveryPolicy", "recoveryPolicy", "consumerRecoveryPolicy", "productRolePolicy", "staffAccessPolicy",
  "internalAllowancePolicy", "countryPolicy", "billingPolicy", "taxAuthorities", "publicationCheckPolicy",
  "configuredProviderSet", "panelDiscoveryPolicy", "costEstimateStartPolicy",
  "support_enabled", "support_model_ref", "support_relay_concurrency", "support_daily_call_cap",
  "support_limit_anon_msgs_10m", "support_limit_anon_msgs_24h", "support_limit_anon_sessions_1h",
  "support_limit_session_msgs", "support_limit_msg_chars", "support_limit_account_msgs_10m",
  "support_limit_account_msgs_24h", "support_queue_depth", "support_lock_after_injections",
  "support_ip_cooldown_minutes", "support_retention_policy", "support_retention_ratified_by",
  "supportActivation"
] as const);

/**
 * MIXED rows (spec §13, §9 money): one row holding both site and debate members, split by the member map below.
 */
const MIXED_ROW_KEYS = Object.freeze(["costEnvelopePolicy", "billingPlans", "callConcurrencyPolicy"] as const);

/**
 * DEBATE rows (spec §13: "debate settings follow the debate"). Everything the engine reads while it argues,
 * judges, writes the answer and tells its story: the algorithm rows, role refs and call bounds, the seven story
 * rows, the development runner rows, the scorecard, rotation, shape, language, length and engine choices, the
 * convergence controls, the operator variants, the evaluator rows and the preview's line-up (addition D12: which AIs
 * debate on Free and Premium and how hard each thinks).
 */
const DEBATE_ROW_KEYS = Object.freeze([
  "riskTier", "acceptanceOrganCostBounds", "runDeathPolicy", "globalStopDelta", "branchFreezeEpsilon",
  "verdictMarginGamma", "verdictHighCut", "verdictLowCut", "disagreementThreshold", "disagreementQuantity",
  "synthesizerRoleRef", "evaluatorRoleRef", "evaluatorLoopMaxRounds", "synthesizerCallBound", "evaluatorCallBound",
  "dispersionScale", "repeatedFamilyMultiplier", "downgradeBands", "providerFamilyMap", "envelopeFormulaInputs",
  "storytellerRoleRef", "storyCheckerRoleRef", "storyLoopMaxRounds", "storytellerCallBound", "storyCheckerCallBound",
  "storyMaterialBudget", "storyCostEnvelopePolicy",
  "livenessPolicy", "claimTypeCompositionMap", "wayOfKnowingCeiling", "compositionBundleBudget",
  "candidateConfidenceBand", "judgementSelectionPolicy", "scoringOperator", "hiddenNodeScoreThreshold",
  "modelScorecard", "answerRoleRotationPolicy", "debateShapePolicy", "questionLanguagePolicy",
  "lengthGuidancePolicy", "engineVersionPolicy", "convergenceEpsilon", "convergenceStopDefaults",
  "approvedOperatorVariants", "evaluatorDispatchBinding", "evaluatorProviderFamily", "evaluatorJudgeAddonPolicy",
  "evaluatorSeatSharePolicy", "previewLineUpPolicy"
] as const);

/**
 * CODE_BOUND rows (spec §13 condition 5): the prompt-contract hashes. Checked against the code by `check-version`
 * (plan D5: `mapContractHash` and `engineContractHash` always declared), never chosen and never compared with the
 * site version.
 */
const CODE_BOUND_ROW_KEYS = Object.freeze([
  "judgeContractHash", "composerContractHash", "conformanceContractHash", "propagationContractHash",
  "serveContractHash", "mapContractHash", "engineContractHash"
] as const);

function classificationTable(): Readonly<Record<string, SettingsRowKind>> {
  const table: Record<string, SettingsRowKind> = {};
  const groups: ReadonlyArray<readonly [SettingsRowKind, readonly string[]]> = [
    ["SITE", SITE_ROW_KEYS], ["MIXED", MIXED_ROW_KEYS], ["DEBATE", DEBATE_ROW_KEYS], ["CODE_BOUND", CODE_BOUND_ROW_KEYS]
  ];
  for (const [kind, keys] of groups) {
    for (const key of keys) {
      // A key in two lists is a classification nobody decided; refuse at module load rather than pick one.
      if (Object.hasOwn(table, key)) throw new TypeError(`SETTINGS_ROW_KINDS_INVALID: ${key}`);
      table[key] = kind;
    }
  }
  return Object.freeze(table);
}

/** Side-by-side spec §13 (plan D4): every register row key the code knows, with its kind. */
export const SETTINGS_ROW_KINDS: Readonly<Record<string, SettingsRowKind>> = classificationTable();

export type MixedSettingsRowKey = typeof MIXED_ROW_KEYS[number];

/**
 * THE MEMBER MAP (spec §13, plan D4): every schema member of each MIXED row in exactly one list (proved against the
 * row's exported member list by the completeness test).
 *
 *  - `costEnvelopePolicy`: the per-run ceiling and the answer's reserve and overrun follow the debate (§9: one
 *    debate's money); the currency, the day, provisional state and the band (close edge, finish edge, waiting line)
 *    follow the site (§9: the site's day and band are one wall for every debate).
 *  - `billingPlans`: every member is a price, a window or Free's fixed gauges, which the website sends; the rosters
 *    are code. So no debate member today (D4): condition 2 compares the whole row. A future per-debate member is
 *    added to the debate list in its own change.
 *  - `callConcurrencyPolicy`: a debate's own lanes follow the debate; the per-runner vendor limits are one runner's,
 *    shared by all its debates, so they follow the site.
 */
export const MIXED_SETTINGS_ROW_MEMBERS: Readonly<Record<MixedSettingsRowKey,
  Readonly<{ site: readonly string[]; debate: readonly string[] }>>> = Object.freeze({
  costEnvelopePolicy: Object.freeze({
    site: Object.freeze([
      "kind", "currency", "minor_units_per_unit", "daily_ceiling_micros", "provisional", "provisional_reason",
      "admission_close_basis_points", "finish_up_to_basis_points", "waiting_line_per_person"
    ]),
    debate: Object.freeze(["per_run_ceiling_micros", "serve_reserve_basis_points", "serve_overrun_basis_points"])
  }),
  billingPlans: Object.freeze({
    site: Object.freeze(["kind", "credit_currency", "currency_by_country", "minor_units_per_unit", "plans"]),
    debate: Object.freeze([])
  }),
  callConcurrencyPolicy: Object.freeze({
    site: Object.freeze(["kind", "perModelPerRunner"]),
    debate: Object.freeze(["perDebate", "perModelPerDebate"])
  })
});

/** A row's kind, or UNCLASSIFIED for a key this code has never decided (own keys only: `toString` is unknown). */
export function settingsRowKind(rowKey: string): SettingsRowKind | "UNCLASSIFIED" {
  return typeof rowKey === "string" && Object.hasOwn(SETTINGS_ROW_KINDS, rowKey)
    ? SETTINGS_ROW_KINDS[rowKey]! : "UNCLASSIFIED";
}

/** One row of one sealed version, its value in the register's canonical JSON text. */
export type SettingsComparisonRow = Readonly<{ rowKey: string; valueJsonText: CanonicalRegisterJson }>;

/**
 * One reason a candidate version cannot serve beside the release's site version (spec §13 condition 2). `member`
 * names the MIXED row's member when the difference is one member; it is absent for a whole-row difference.
 */
export type SiteSettingsDifference = Readonly<{
  code: "SETTINGS_SITE_MEMBER_DIFFERS" | "SETTINGS_ROW_UNCLASSIFIED";
  rowKey: string;
  member?: string;
}>;

/** One side's rows by key, each value re-read as canonical text, so a hand-built row's key order never matters. */
function rowsByKey(rows: readonly SettingsComparisonRow[]): ReadonlyMap<string, CanonicalRegisterJson> {
  const byKey = new Map<string, CanonicalRegisterJson>();
  for (const row of rows) {
    if (typeof row?.rowKey !== "string" || byKey.has(row.rowKey)) throw new TypeError("SETTINGS_COMPARISON_ROWS_INVALID");
    byKey.set(row.rowKey, parseCanonicalRegisterJson(Buffer.from(row.valueJsonText, "utf8")));
  }
  return byKey;
}

/**
 * A JSON value (from `JSON.parse` of canonical text) back to the canonical AST. Exact: canonical numbers are safe
 * integers or decimals of at most 15 significant and 6 fraction digits, which a double holds and `String` writes
 * back unchanged. Objects get no prototype, as the register's own parser builds them.
 */
function astOf(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map(astOf));
  if (typeof value === "object") {
    const object = Object.create(null) as Record<string, CanonicalJsonAst>;
    for (const [key, member] of Object.entries(value as object)) object[key] = astOf(member);
    return Object.freeze(object);
  }
  throw new TypeError("SETTINGS_COMPARISON_ROWS_INVALID");
}

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** A member's canonical text; an absent member (or an absent row) reads as `null` (spec §13). */
function memberText(value: Readonly<Record<string, unknown>> | undefined, member: string): CanonicalRegisterJson {
  return canonicalRegisterJson(value !== undefined && Object.hasOwn(value, member) ? astOf(value[member]) : null);
}

function mixedRowDifferences(
  rowKey: MixedSettingsRowKey,
  siteText: CanonicalRegisterJson | undefined,
  candidateText: CanonicalRegisterJson | undefined
): SiteSettingsDifference[] {
  const site = siteText === undefined ? undefined : JSON.parse(siteText) as unknown;
  const candidate = candidateText === undefined ? undefined : JSON.parse(candidateText) as unknown;
  // A MIXED row whose value is not an object has no members to split: compare it whole.
  if ((site !== undefined && !isPlainObject(site)) || (candidate !== undefined && !isPlainObject(candidate))) {
    return siteText === candidateText ? [] : [Object.freeze({ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey })];
  }
  const siteObject = site as Readonly<Record<string, unknown>> | undefined;
  const candidateObject = candidate as Readonly<Record<string, unknown>> | undefined;
  const { site: siteMembers, debate: debateMembers } = MIXED_SETTINGS_ROW_MEMBERS[rowKey];
  const members = new Set<string>([
    ...siteMembers, ...Object.keys(siteObject ?? {}), ...Object.keys(candidateObject ?? {})
  ]);
  const differences: SiteSettingsDifference[] = [];
  for (const member of [...members].sort()) {
    if (debateMembers.includes(member)) continue;
    if (memberText(siteObject, member) === memberText(candidateObject, member)) continue;
    // A member the map never decided cannot be proved to be the debate's: refuse it by name.
    const code = siteMembers.includes(member) ? "SETTINGS_SITE_MEMBER_DIFFERS" : "SETTINGS_ROW_UNCLASSIFIED";
    differences.push(Object.freeze({ code, rowKey, member }));
  }
  return differences;
}

/**
 * Spec §13 condition 2: a candidate version may serve beside the release only if every SITE row is equal, and every
 * MIXED row's site members are equal, in canonical form; an absent row or member compares as `null`, so
 * present-versus-absent is a difference. DEBATE and CODE_BOUND rows are never compared here (CODE_BOUND rows are
 * checked against the code by `check-version`). A row key this code has never classified, on either side, is a
 * difference of its own (`SETTINGS_ROW_UNCLASSIFIED`). Rows are walked in key order, members in name order.
 */
export function compareSiteSettings(input: Readonly<{
  site: readonly SettingsComparisonRow[];
  candidate: readonly SettingsComparisonRow[];
}>): readonly SiteSettingsDifference[] {
  const site = rowsByKey(input.site);
  const candidate = rowsByKey(input.candidate);
  const differences: SiteSettingsDifference[] = [];
  for (const rowKey of [...new Set([...site.keys(), ...candidate.keys()])].sort()) {
    const kind = settingsRowKind(rowKey);
    if (kind === "UNCLASSIFIED") {
      differences.push(Object.freeze({ code: "SETTINGS_ROW_UNCLASSIFIED", rowKey }));
    } else if (kind === "SITE") {
      if (site.get(rowKey) !== candidate.get(rowKey)) {
        differences.push(Object.freeze({ code: "SETTINGS_SITE_MEMBER_DIFFERS", rowKey }));
      }
    } else if (kind === "MIXED") {
      differences.push(...mixedRowDifferences(rowKey as MixedSettingsRowKey, site.get(rowKey), candidate.get(rowKey)));
    }
  }
  return Object.freeze(differences);
}

const versionRefused = (detail: string): never => {
  throw new TypedDomainError("SETTINGS_VERSION_KIND_INVALID", `The register version ${detail}`);
};

/**
 * The rows of one sealed version in canonical text (`value_json::text` re-parsed by `parseCanonicalRegisterJson`),
 * sorted by key. Read by `register_version = $1` only (the register census's exact-version shape): this never
 * looks for the newest version. An unknown version, or one whose row count is not its sealed count, refuses
 * (`SETTINGS_VERSION_KIND_INVALID`).
 */
export async function readSettingsComparisonRows(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<readonly SettingsComparisonRow[]> {
  if (!Number.isSafeInteger(registerVersion) || registerVersion <= 0) versionRefused("is not a positive integer");
  const version = await pool.query<{ sealed: boolean; row_count: number }>(
    "SELECT sealed,row_count FROM register.register_version WHERE register_version=$1",
    [registerVersion]
  );
  const sealed = version.rows[0];
  if (sealed === undefined || sealed.sealed !== true) versionRefused(`${registerVersion} is not a sealed version`);
  const result = await pool.query<{ row_key: string; value_json_text: string }>(
    "SELECT row_key,value_json::text AS value_json_text FROM register.register_row WHERE register_version=$1",
    [registerVersion]
  );
  if (result.rows.length !== Number(sealed!.row_count)) versionRefused(`${registerVersion} does not hold its sealed row count`);
  const rows = result.rows.map((row) => Object.freeze({
    rowKey: row.row_key,
    valueJsonText: parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8"))
  }));
  rows.sort((left, right) => (left.rowKey < right.rowKey ? -1 : left.rowKey > right.rowKey ? 1 : 0));
  return Object.freeze(rows);
}

/**
 * Spec §9/§13: the envelope one debate runs under. Its per-run members (the per-run ceiling, the answer's reserve
 * and overrun) come from the debate's version; the currency, the day, provisional state and the band come from the
 * site's (one wall for every debate). The composition is re-validated by the row's own parser, so a debate-only
 * raise of the per-run ceiling that the site's day cannot hold (`daily < per_run x (1 + overrun)`) throws the row's
 * own refusal, `COST_ENVELOPE_POLICY_INVALID` (spec §13: "the owner should expect it").
 */
export function composeDebateCostEnvelope(site: CostEnvelopePolicy, debate: CostEnvelopePolicy): CostEnvelopePolicy {
  const band = costEnvelopeBand(site);
  const value = {
    kind: "COST_ENVELOPE_POLICY",
    currency: site.currency,
    minor_units_per_unit: site.minorUnitsPerUnit,
    per_run_ceiling_micros: debate.perRunCeilingMicros,
    daily_ceiling_micros: site.dailyCeilingMicros,
    provisional: site.provisional,
    provisional_reason: site.provisionalReason,
    serve_reserve_basis_points: debate.serveReserveBasisPoints,
    serve_overrun_basis_points: debate.serveOverrunBasisPoints,
    ...(band === null ? {} : {
      admission_close_basis_points: band.closeBasisPoints,
      finish_up_to_basis_points: band.finishBasisPoints,
      waiting_line_per_person: band.waitingLinePerPerson
    })
  };
  const sourceRef = site.sourceRef === debate.sourceRef
    ? site.sourceRef
    : `${debate.sourceRef}; day and band: ${site.sourceRef}`;
  return costEnvelopePolicyFromValue(value, sourceRef);
}

/**
 * The debate's call lanes (parallel calls spec §3.1, side-by-side spec §13): its own version's row, or one call at a
 * time when that version has none. `perModelPerRunner` is never read from it: the per-runner limits are the site's.
 */
export function debateCallLaneLimits(debate: CallConcurrencyPolicyState): Readonly<{
  perDebate: number;
  perModelPerDebate: number;
}> {
  const { perDebate, perModelPerDebate } = effectiveCallConcurrency(debate);
  return Object.freeze({ perDebate, perModelPerDebate });
}
