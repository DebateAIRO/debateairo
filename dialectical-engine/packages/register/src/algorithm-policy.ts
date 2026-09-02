import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import {
  ENGINE_BAND_ORDER,
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE
} from "./engine-shape.js";

/**
 * T16 — the sealed algorithm register rows.
 *
 * Sole owner of every new row, schema and migration for the live-loop mission
 * (goal-v4 lines 80-96). Consumers (T3, T7, T9, T11, T17) READ these rows; no
 * consumer may carry a code constant for any value below.
 *
 * Values: goal-v4 lines 80-96 seed δ=0.02, ε=0.01, γ=0.05, high=0.70, low=0.35
 * and the evaluator loop max = 3. Mission DECISIONS.md J1 rules the values the
 * goal omits: dispersion scale 1.0, disagreement threshold 0.25,
 * repeated-family multiplier 0.5, downgrade bands = the engine's existing band
 * vocabulary one step down, and the provider→family map as the relay layer
 * names its makers, with an unmapped provider yielding family kind UNKNOWN
 * (packages/judgement/src/s04.ts:289 exempts UNKNOWN from the discount).
 */

export const ADAPTIVE_STOPPING_ROW_KEYS = Object.freeze([
  "globalStopDelta",
  "branchFreezeEpsilon"
] as const);

export const VERDICT_LABEL_ROW_KEYS = Object.freeze([
  "verdictMarginGamma",
  "verdictHighCut",
  "verdictLowCut",
  "disagreementThreshold",
  "disagreementQuantity"
] as const);

export const SYNTHESIS_ROLE_ROW_KEYS = Object.freeze([
  "synthesizerRoleRef",
  "evaluatorRoleRef",
  "evaluatorLoopMaxRounds"
] as const);

export const PANEL_WEIGHTING_ROW_KEYS = Object.freeze([
  "dispersionScale",
  "repeatedFamilyMultiplier",
  "downgradeBands",
  "providerFamilyMap"
] as const);

export const ENVELOPE_FORMULA_ROW_KEYS = Object.freeze(["envelopeFormulaInputs"] as const);

/** Every T16 row, grouped by the family its reader resolves as one unit. */
export const ALGORITHM_REGISTER_ROW_FAMILIES = Object.freeze({
  stopping: ADAPTIVE_STOPPING_ROW_KEYS,
  verdictLabel: VERDICT_LABEL_ROW_KEYS,
  synthesisRoles: SYNTHESIS_ROLE_ROW_KEYS,
  panelWeighting: PANEL_WEIGHTING_ROW_KEYS,
  envelope: ENVELOPE_FORMULA_ROW_KEYS
} as const);

export type AlgorithmRegisterRowFamily = keyof typeof ALGORITHM_REGISTER_ROW_FAMILIES;

export const ALGORITHM_REGISTER_ROW_KEYS = Object.freeze(
  Object.values(ALGORITHM_REGISTER_ROW_FAMILIES).flatMap((keys) => [...keys])
);

/** Ruling provenance appended to each row's deployment source ref. */
export const T16_GOAL_RULING_REF = "goal-v4-2026-09-01:80-96" as const;
export const T16_JUDGE_RULING_REF = "algorithm-live-loop-DECISIONS.md#J1" as const;
/**
 * J1 rules EXACTLY five values and never mentions the role identities; ruling
 * J8 chose them. A sealed row must name the ruling that actually chose its
 * value — a false ref is audit poison (mission DECISIONS J8).
 */
export const T16_ROLE_RULING_REF =
  "algorithm-live-loop-DECISIONS.md#J8+configured-provider-set-derivation" as const;
export const T16_BAND_VOCABULARY_REF =
  "algorithm-live-loop-DECISIONS.md#J1+packages/register/src/engine-shape.ts#ENGINE_BAND_ORDER" as const;
export const T16_FAMILY_MAP_REF =
  "algorithm-live-loop-DECISIONS.md#J1+register:configuredProviderSet" as const;
export const T16_ENVELOPE_REF =
  "goal-v4-2026-09-01:285-295+packages/register/src/engine-shape.ts#ENGINE_BRANCHING_FACTOR" as const;

export const SYNTHESIS_ROLE_REFS_IDENTICAL_WARNING = "SYNTHESIS_ROLE_REFS_IDENTICAL" as const;

export interface AlgorithmRegisterRow {
  readonly rowKey: string;
  readonly value: unknown;
  readonly sourceRef: string;
}

export interface ProviderFamilyEntry {
  readonly familyRef: string;
  readonly providerRefs: readonly string[];
}

export interface AlgorithmRegisterRowsInput {
  /** Deployment-scoped provenance prefix — dev, acceptance or production. */
  readonly deploymentSourceRef: string;
  /** A configured provider identity. Identical refs are lawful but warn at startup. */
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  /** Family ↦ provider refs, as the deployment's own configured provider set names them. */
  readonly providerFamilies: readonly ProviderFamilyEntry[];
}

function requireRef(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypedDomainError("ALGORITHM_REGISTER_ROWS_INVALID", `${label} must be a nonempty ref`);
  }
  return value;
}

/** DECISIONS J1: one step down the engine's own band order; the weakest band is a floor. */
export function buildOneStepDownBands(
  bandOrder: readonly string[]
): Readonly<Record<string, string>> {
  if (bandOrder.length === 0 || new Set(bandOrder).size !== bandOrder.length) {
    throw new TypedDomainError("ALGORITHM_REGISTER_ROWS_INVALID", "The band order must be nonempty and unique");
  }
  return Object.freeze(Object.fromEntries(bandOrder.map((band, index) =>
    [band, index === 0 ? bandOrder[0]! : bandOrder[index - 1]!]
  )));
}

/**
 * Ruling J7: the SEEDING ENTRYPOINTS are T16's honest startup surface, because
 * at T16 time no consumer boot reads the role rows (T9 wires that later). Both
 * seeders call this on their real process path, so an operator who configures
 * identical refs — which stays LAWFUL under goal 91-93 — is told once, at the
 * moment the identity is sealed. Returns whether the warning fired.
 */
export function warnOnIdenticalSynthesisRoleRefs(input: {
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly deploymentRef: string;
}): boolean {
  if (input.synthesizerRoleRef !== input.evaluatorRoleRef) return false;
  console.warn(
    `${SYNTHESIS_ROLE_REFS_IDENTICAL_WARNING}: ${input.deploymentRef} seals the synthesizer and `
    + `evaluator role refs as the same configured provider identity "${input.synthesizerRoleRef}"; `
    + `the evaluator will grade a candidate written by its own provider identity`
  );
  return true;
}

/**
 * Every T16 row with its ruled default. Deployment-specific facts (provenance
 * prefix, role identities, the configured provider set the family map is read
 * off) arrive as input so no deployment name is invented here.
 */
export function buildAlgorithmRegisterRows(
  input: AlgorithmRegisterRowsInput
): readonly AlgorithmRegisterRow[] {
  const deployment = requireRef(input.deploymentSourceRef, "deploymentSourceRef");
  const synthesizerRoleRef = requireRef(input.synthesizerRoleRef, "synthesizerRoleRef");
  const evaluatorRoleRef = requireRef(input.evaluatorRoleRef, "evaluatorRoleRef");
  if (input.providerFamilies.length === 0) {
    throw new TypedDomainError("ALGORITHM_REGISTER_ROWS_INVALID", "At least one provider family is required");
  }
  const families = input.providerFamilies.map((family) => Object.freeze({
    familyRef: requireRef(family.familyRef, "familyRef"),
    providerRefs: Object.freeze(family.providerRefs.map((ref) => requireRef(ref, "providerRef")))
  }));
  if (new Set(families.map((family) => family.familyRef)).size !== families.length) {
    throw new TypedDomainError("ALGORITHM_REGISTER_ROWS_INVALID", "Provider family refs must be unique");
  }
  const providerRefs = families.flatMap((family) => [...family.providerRefs]);
  if (new Set(providerRefs).size !== providerRefs.length) {
    throw new TypedDomainError("ALGORITHM_REGISTER_ROWS_INVALID", "A provider may belong to one family only");
  }
  const ref = (ruling: string): string => `${deployment}+${ruling}`;
  const rows: readonly AlgorithmRegisterRow[] = [
    { rowKey: "globalStopDelta", value: { kind: "GLOBAL_STOP_DELTA", delta: 0.02 }, sourceRef: ref(T16_GOAL_RULING_REF) },
    { rowKey: "branchFreezeEpsilon", value: { kind: "BRANCH_FREEZE_EPSILON", epsilon: 0.01 }, sourceRef: ref(T16_GOAL_RULING_REF) },
    { rowKey: "verdictMarginGamma", value: { kind: "VERDICT_MARGIN_GAMMA", gamma: 0.05 }, sourceRef: ref(T16_GOAL_RULING_REF) },
    { rowKey: "verdictHighCut", value: { kind: "VERDICT_HIGH_CUT", highCut: 0.7 }, sourceRef: ref(T16_GOAL_RULING_REF) },
    { rowKey: "verdictLowCut", value: { kind: "VERDICT_LOW_CUT", lowCut: 0.35 }, sourceRef: ref(T16_GOAL_RULING_REF) },
    {
      rowKey: "disagreementThreshold",
      value: { kind: "DISAGREEMENT_THRESHOLD", threshold: 0.25, scaleRowKey: "dispersionScale" },
      sourceRef: ref(T16_JUDGE_RULING_REF)
    },
    {
      rowKey: "disagreementQuantity",
      value: {
        kind: "DISAGREEMENT_QUANTITY",
        quantityRef: "reducedJudgement.dispersion",
        scope: "WINNING_ROOT",
        scaleRowKey: "dispersionScale",
        absentReason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS"
      },
      sourceRef: ref(T16_GOAL_RULING_REF)
    },
    {
      rowKey: "synthesizerRoleRef",
      value: { kind: "SYNTHESIZER_ROLE_REF", providerRef: synthesizerRoleRef, provisional: true },
      sourceRef: ref(T16_ROLE_RULING_REF)
    },
    {
      rowKey: "evaluatorRoleRef",
      value: { kind: "EVALUATOR_ROLE_REF", providerRef: evaluatorRoleRef, provisional: true },
      sourceRef: ref(T16_ROLE_RULING_REF)
    },
    {
      rowKey: "evaluatorLoopMaxRounds",
      value: { kind: "EVALUATOR_LOOP_MAX_ROUNDS", maxRounds: 3 },
      sourceRef: ref(T16_GOAL_RULING_REF)
    },
    { rowKey: "dispersionScale", value: { kind: "DISPERSION_SCALE", scale: 1 }, sourceRef: ref(T16_JUDGE_RULING_REF) },
    {
      rowKey: "repeatedFamilyMultiplier",
      value: { kind: "REPEATED_FAMILY_MULTIPLIER", multiplier: 0.5 },
      sourceRef: ref(T16_JUDGE_RULING_REF)
    },
    {
      rowKey: "downgradeBands",
      value: {
        kind: "DOWNGRADE_BANDS",
        bandOrder: [...ENGINE_BAND_ORDER],
        oneStepDown: buildOneStepDownBands(ENGINE_BAND_ORDER)
      },
      sourceRef: ref(T16_BAND_VOCABULARY_REF)
    },
    {
      rowKey: "providerFamilyMap",
      value: {
        kind: "PROVIDER_FAMILY_MAP",
        families,
        unmappedFamilyKind: "UNKNOWN",
        unmappedReason: "PROVIDER_FAMILY_UNMAPPED",
        unknownFamilyBehavior: "EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT"
      },
      sourceRef: ref(T16_FAMILY_MAP_REF)
    },
    {
      rowKey: "envelopeFormulaInputs",
      value: {
        kind: "ENVELOPE_FORMULA_INPUTS",
        branchingFactor: ENGINE_BRANCHING_FACTOR,
        compositionSegmentCap: ENGINE_COMPOSITION_SEGMENT_CAP,
        fixedOrgansPerComposition: ENGINE_FIXED_ORGANS_PER_COMPOSITION,
        maxRecompose: ENGINE_MAX_RECOMPOSE,
        reviewerCallsPerNode: 1,
        synthesizerMaxRounds: 3,
        evaluatorMaxRounds: 3,
        panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE",
        // T17/B2: the SEALED maximum the admission formula refuses above. The
        // engine's own expansion rule is 1..5 (apps/runner resolveExpansionDepth,
        // and the stored-basis parser in packages/budget); sealing it here is what
        // lets ADMISSION refuse an over-bound ask instead of minting a ceiling the
        // runner rejects later, after the asker has been admitted.
        maxDepth: 5
      },
      sourceRef: ref(T16_ENVELOPE_REF)
    }
  ];
  const seeded = rows.map((row) => row.rowKey);
  const manifest: readonly string[] = ALGORITHM_REGISTER_ROW_KEYS;
  if (seeded.length !== manifest.length || seeded.some((rowKey) => !manifest.includes(rowKey))) {
    throw new TypedDomainError(
      "ALGORITHM_REGISTER_ROWS_INVALID",
      "The seeded row set does not match the declared T16 row manifest"
    );
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

const unitInterval = z.number().finite().min(0).max(1);
const positiveInteger = z.number().int().positive();
const nonemptyText = z.string().trim().min(1);

const rowSchemas = {
  globalStopDelta: z.object({ kind: z.literal("GLOBAL_STOP_DELTA"), delta: unitInterval }).strict(),
  branchFreezeEpsilon: z.object({ kind: z.literal("BRANCH_FREEZE_EPSILON"), epsilon: unitInterval }).strict(),
  verdictMarginGamma: z.object({ kind: z.literal("VERDICT_MARGIN_GAMMA"), gamma: unitInterval }).strict(),
  verdictHighCut: z.object({ kind: z.literal("VERDICT_HIGH_CUT"), highCut: unitInterval }).strict(),
  verdictLowCut: z.object({ kind: z.literal("VERDICT_LOW_CUT"), lowCut: unitInterval }).strict(),
  disagreementThreshold: z.object({
    kind: z.literal("DISAGREEMENT_THRESHOLD"),
    threshold: unitInterval,
    scaleRowKey: z.literal("dispersionScale")
  }).strict(),
  disagreementQuantity: z.object({
    kind: z.literal("DISAGREEMENT_QUANTITY"),
    quantityRef: nonemptyText,
    scope: nonemptyText,
    scaleRowKey: z.literal("dispersionScale"),
    absentReason: nonemptyText
  }).strict(),
  synthesizerRoleRef: z.object({
    kind: z.literal("SYNTHESIZER_ROLE_REF"),
    providerRef: nonemptyText,
    provisional: z.boolean()
  }).strict(),
  evaluatorRoleRef: z.object({
    kind: z.literal("EVALUATOR_ROLE_REF"),
    providerRef: nonemptyText,
    provisional: z.boolean()
  }).strict(),
  evaluatorLoopMaxRounds: z.object({
    kind: z.literal("EVALUATOR_LOOP_MAX_ROUNDS"),
    maxRounds: positiveInteger
  }).strict(),
  dispersionScale: z.object({ kind: z.literal("DISPERSION_SCALE"), scale: unitInterval }).strict(),
  repeatedFamilyMultiplier: z.object({
    kind: z.literal("REPEATED_FAMILY_MULTIPLIER"),
    multiplier: unitInterval
  }).strict(),
  downgradeBands: z.object({
    kind: z.literal("DOWNGRADE_BANDS"),
    bandOrder: z.array(nonemptyText).min(1),
    oneStepDown: z.record(nonemptyText, nonemptyText)
  }).strict(),
  providerFamilyMap: z.object({
    kind: z.literal("PROVIDER_FAMILY_MAP"),
    families: z.array(z.object({
      familyRef: nonemptyText,
      providerRefs: z.array(nonemptyText).min(1)
    }).strict()).min(1),
    unmappedFamilyKind: z.literal("UNKNOWN"),
    unmappedReason: nonemptyText,
    unknownFamilyBehavior: z.literal("EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT")
  }).strict(),
  envelopeFormulaInputs: z.object({
    kind: z.literal("ENVELOPE_FORMULA_INPUTS"),
    branchingFactor: positiveInteger,
    compositionSegmentCap: positiveInteger,
    fixedOrgansPerComposition: positiveInteger,
    maxRecompose: positiveInteger,
    reviewerCallsPerNode: positiveInteger,
    synthesizerMaxRounds: positiveInteger,
    evaluatorMaxRounds: positiveInteger,
    panelCallsPerNodeBasis: z.literal("PANEL_SIZE_MINUS_ONE"),
    maxDepth: positiveInteger
  }).strict()
} as const;

type RowSchemas = typeof rowSchemas;
type RowValue<K extends keyof RowSchemas> = z.infer<RowSchemas[K]>;

interface ResolvedFamily<K extends keyof RowSchemas> {
  readonly values: { readonly [P in K]: RowValue<P> };
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/**
 * Reads one row family. A missing row, a row that violates its declared member
 * type, or a row with no provenance each fail LOUDLY and name the row key —
 * never a code default (goal 39-40, DoD "missing row fails loudly").
 */
async function readFamily<K extends keyof RowSchemas>(
  pool: Pool,
  registerVersion: number,
  familyCode: string,
  rowKeys: readonly K[]
): Promise<ResolvedFamily<K>> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError(`A positive register version is required for ${familyCode}`);
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])`,
    [registerVersion, [...rowKeys]]
  );
  const persisted = new Map(result.rows.map((row) => [row.row_key, row]));
  const missing = rowKeys.filter((rowKey) => !persisted.has(rowKey));
  if (missing.length > 0) {
    throw new TypedDomainError(
      `${familyCode}_UNRESOLVED`,
      `Register version ${registerVersion} is missing mandatory T16 rows: ${missing.join(",")}`
    );
  }
  const values: Record<string, unknown> = {};
  const sourceRefs: Record<string, string> = {};
  for (const rowKey of rowKeys) {
    const row = persisted.get(rowKey)!;
    const parsed = rowSchemas[rowKey].safeParse(row.value_json);
    if (!parsed.success) {
      throw new TypedDomainError(`${familyCode}_INVALID`, `The ${rowKey} row violates its declared member type`);
    }
    if (row.source_ref.trim() === "") {
      throw new TypedDomainError(`${familyCode}_PROVENANCE_MISSING`, `The ${rowKey} row has no source_ref`);
    }
    values[rowKey] = parsed.data;
    sourceRefs[rowKey] = row.source_ref;
  }
  return Object.freeze({
    values: Object.freeze(values) as ResolvedFamily<K>["values"],
    sourceRefs: Object.freeze(sourceRefs)
  });
}

export interface AdaptiveStoppingControls {
  readonly registerVersion: number;
  readonly delta: number;
  readonly epsilon: number;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/** T7: global stop δ and branch-freeze ε. */
export async function readAdaptiveStoppingControls(
  pool: Pool,
  registerVersion: number
): Promise<AdaptiveStoppingControls> {
  const family = await readFamily(pool, registerVersion, "ADAPTIVE_STOPPING_CONTROLS", [
    "globalStopDelta", "branchFreezeEpsilon"
  ]);
  return Object.freeze({
    registerVersion,
    delta: family.values.globalStopDelta.delta,
    epsilon: family.values.branchFreezeEpsilon.epsilon,
    sourceRefs: family.sourceRefs
  });
}

export interface VerdictLabelControls {
  readonly registerVersion: number;
  readonly gamma: number;
  readonly highCut: number;
  readonly lowCut: number;
  readonly disagreementThreshold: number;
  readonly disagreementQuantityRef: string;
  readonly disagreementScope: string;
  readonly disagreementAbsentReason: string;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/** T11: γ, the high/low cuts, the disagreement threshold and the named quantity. */
export async function readVerdictLabelControls(
  pool: Pool,
  registerVersion: number
): Promise<VerdictLabelControls> {
  const family = await readFamily(pool, registerVersion, "VERDICT_LABEL_CONTROLS", [
    "verdictMarginGamma", "verdictHighCut", "verdictLowCut", "disagreementThreshold", "disagreementQuantity"
  ]);
  const lowCut = family.values.verdictLowCut.lowCut;
  const highCut = family.values.verdictHighCut.highCut;
  if (!(lowCut < highCut)) {
    throw new TypedDomainError("VERDICT_LABEL_CONTROLS_INVALID", "The low cut must sit strictly below the high cut");
  }
  return Object.freeze({
    registerVersion,
    gamma: family.values.verdictMarginGamma.gamma,
    highCut,
    lowCut,
    disagreementThreshold: family.values.disagreementThreshold.threshold,
    disagreementQuantityRef: family.values.disagreementQuantity.quantityRef,
    disagreementScope: family.values.disagreementQuantity.scope,
    disagreementAbsentReason: family.values.disagreementQuantity.absentReason,
    sourceRefs: family.sourceRefs
  });
}

export interface SynthesisRoleControls {
  readonly registerVersion: number;
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly evaluatorLoopMaxRounds: number;
  readonly identicalRoleRefs: boolean;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/**
 * T9 role refs + the evaluator loop bound. Identical synthesizer and evaluator
 * refs stay LAWFUL (goal 84-85) but emit a startup warning: every boot that
 * reads this family prints it once.
 */
export async function readSynthesisRoleControls(
  pool: Pool,
  registerVersion: number
): Promise<SynthesisRoleControls> {
  const family = await readFamily(pool, registerVersion, "SYNTHESIS_ROLE_CONTROLS", [
    "synthesizerRoleRef", "evaluatorRoleRef", "evaluatorLoopMaxRounds"
  ]);
  const synthesizerRoleRef = family.values.synthesizerRoleRef.providerRef;
  const evaluatorRoleRef = family.values.evaluatorRoleRef.providerRef;
  const identicalRoleRefs = synthesizerRoleRef === evaluatorRoleRef;
  if (identicalRoleRefs) {
    console.warn(
      `${SYNTHESIS_ROLE_REFS_IDENTICAL_WARNING}: the synthesizer and evaluator role refs are both `
      + `"${synthesizerRoleRef}" in register version ${registerVersion}; the evaluator will grade a `
      + `candidate written by its own configured provider identity`
    );
  }
  return Object.freeze({
    registerVersion,
    synthesizerRoleRef,
    evaluatorRoleRef,
    evaluatorLoopMaxRounds: family.values.evaluatorLoopMaxRounds.maxRounds,
    identicalRoleRefs,
    sourceRefs: family.sourceRefs
  });
}

export interface PanelWeightingControls {
  readonly registerVersion: number;
  readonly dispersionScale: number;
  readonly repeatedFamilyMultiplier: number;
  readonly bandOrder: readonly string[];
  readonly oneStepDown: Readonly<Record<string, string>>;
  readonly providerFamilies: readonly ProviderFamilyEntry[];
  readonly unknownFamilyBehavior: "EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT";
  readonly unmappedReason: string;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/** T3: the s04 panel inputs — scale, multiplier, downgrade bands, family map. */
export async function readPanelWeightingControls(
  pool: Pool,
  registerVersion: number
): Promise<PanelWeightingControls> {
  const family = await readFamily(pool, registerVersion, "PANEL_WEIGHTING_CONTROLS", [
    "dispersionScale", "repeatedFamilyMultiplier", "downgradeBands", "providerFamilyMap"
  ]);
  const bands = family.values.downgradeBands;
  if (bands.bandOrder.some((band) => bands.oneStepDown[band] === undefined)
    || Object.entries(bands.oneStepDown).some(([band, target]) =>
      !bands.bandOrder.includes(band) || !bands.bandOrder.includes(target))) {
    throw new TypedDomainError(
      "PANEL_WEIGHTING_CONTROLS_INVALID",
      "The downgrade map must be total over the seeded band vocabulary"
    );
  }
  return Object.freeze({
    registerVersion,
    dispersionScale: family.values.dispersionScale.scale,
    repeatedFamilyMultiplier: family.values.repeatedFamilyMultiplier.multiplier,
    bandOrder: Object.freeze([...bands.bandOrder]),
    oneStepDown: Object.freeze({ ...bands.oneStepDown }),
    providerFamilies: Object.freeze(family.values.providerFamilyMap.families.map((entry) =>
      Object.freeze({ familyRef: entry.familyRef, providerRefs: Object.freeze([...entry.providerRefs]) })
    )),
    unknownFamilyBehavior: family.values.providerFamilyMap.unknownFamilyBehavior,
    unmappedReason: family.values.providerFamilyMap.unmappedReason,
    sourceRefs: family.sourceRefs
  });
}

export interface EnvelopeFormulaInputs {
  readonly registerVersion: number;
  readonly branchingFactor: number;
  readonly compositionSegmentCap: number;
  readonly fixedOrgansPerComposition: number;
  readonly maxRecompose: number;
  readonly reviewerCallsPerNode: number;
  readonly synthesizerMaxRounds: number;
  readonly evaluatorMaxRounds: number;
  readonly panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE";
  /** T17/B2: the sealed maximum depth admission refuses above. */
  readonly maxDepth: number;
  readonly sourceRefs: Readonly<Record<string, string>>;
}

/** T17: the sealed inputs the extended structural-ceiling formula reads. */
export async function readEnvelopeFormulaInputs(
  pool: Pool,
  registerVersion: number
): Promise<EnvelopeFormulaInputs> {
  const family = await readFamily(pool, registerVersion, "ENVELOPE_FORMULA_INPUTS", ["envelopeFormulaInputs"]);
  const value = family.values.envelopeFormulaInputs;
  return Object.freeze({
    registerVersion,
    branchingFactor: value.branchingFactor,
    compositionSegmentCap: value.compositionSegmentCap,
    fixedOrgansPerComposition: value.fixedOrgansPerComposition,
    maxRecompose: value.maxRecompose,
    reviewerCallsPerNode: value.reviewerCallsPerNode,
    synthesizerMaxRounds: value.synthesizerMaxRounds,
    evaluatorMaxRounds: value.evaluatorMaxRounds,
    panelCallsPerNodeBasis: value.panelCallsPerNodeBasis,
    maxDepth: value.maxDepth,
    sourceRefs: family.sourceRefs
  });
}
