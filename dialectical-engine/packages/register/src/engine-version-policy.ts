import type { Pool } from "pg";
import { z } from "zod";
import { START_STEP_LIMITS, TypedDomainError } from "@debateai/kernel";
import type { DebateShapePlanKey } from "./debate-shape-policy.js";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Engine redesign (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §3; INTERFACE §1): ONE optional row
 * in its own family, built like `debateShapePolicy`. It is NOT a register.required_row, not in the bootstrap and not in
 * the development rows, so every sealed version without it keeps parsing and reads ABSENT: engine 1, today's debate byte
 * for byte. A row that does not parse is loud: the boots refuse. A new value is a new register version, never an edit.
 *
 * Plain words: the row turns on engine 2 and holds its numbers: how a grade is scored, how much a disputed point or a
 * "cannot assess" link counts, how many investigations, comparing judges and reserve answers a debate may use, and how
 * many agreeing votes make a "Clear answer" or a "Close call".
 */
export const ENGINE_VERSION_POLICY_ROW_KEY = "engineVersionPolicy" as const;

/** The seven measures, in the composition row's order (packages/register/src/index.ts compositionMetricSchema). */
export const COMPOSITION_METRICS = Object.freeze([
  "steelman_fidelity", "counter_resilience", "evidence_quality", "evidence_relevance",
  "context_fit", "clarity", "fallacy_resilience"
] as const);
/** Equals judgement's `CompositionMetric` (packages/judgement/src/s04.ts); tests/unit/engine-version-policy.test.ts pins it. */
export type CompositionMetricName = typeof COMPOSITION_METRICS[number];

export const ENGINE_SCORING_COMBINES = Object.freeze(["MEDIAN"] as const);
export const ENGINE_RIVAL_REPLIES = Object.freeze(["EQUAL"] as const);
export const ENGINE_JUDGE_MAKER_RULES = Object.freeze(["PREFER_NON_ARGUING_ELSE_IGNORE_OWN"] as const);

/** The row's bounds (spec §3.4): comparing judges and agreeing votes, investigations, reserve answers, the weights' sum. */
export const ENGINE_VERSION_LIMITS = Object.freeze({ judgesMax: 5, investigationsMax: 5, answerCheckMax: 4, sumTolerance: 0.001 });

/**
 * The owners' start values (spec §3.4; rulings E7, E12, E13), in one frozen place so the start function and its test
 * cannot drift. `equalCoefficient` is 1/7 rounded to six decimals: the seven weights sum to 0.999999.
 */
export const ENGINE_VERSION_START = Object.freeze({
  equalCoefficient: 0.142857,
  clarityDecayPerAmbiguity: 0.1,
  fatalCap: Object.freeze({ minFlagSeverity: 0.5, to: 0.3 }),
  fidelityFloor: Object.freeze({ below: 0.5, to: 0.5 }),
  disputedWeight: 0.7,
  cannotAssessWeight: 0.66,
  maxInvestigationsPerDebate: 2,
  judges: 3,
  clearAgreeing: 3,
  closeCallAgreeing: 2,
  answerCheckCandidates: 3
});

export type EngineScoring = Readonly<{
  terms: readonly Readonly<{ metric: CompositionMetricName; coefficient: number }>[];
  clarityDecayPerAmbiguity: number;
  fatalCap: Readonly<{ minFlagSeverity: number; to: number }>;
  fidelityFloor: Readonly<{ below: number; to: number }>;
  combine: "MEDIAN";
  disputedWeight: number;
}>;
export type EngineLinks = Readonly<{ cannotAssessWeight: number; ownReplyCountsAsSupport: false; rivalReplies: "EQUAL" }>;
export type EngineInvestigate = Readonly<{ maxPerDebate: number }>;
export type EngineJudges = Readonly<{ count: number; makerRule: "PREFER_NON_ARGUING_ELSE_IGNORE_OWN" }>;
export type EngineLabel = Readonly<{ clearAgreeing: number; closeCallAgreeing: number }>;
export type EngineAnswerCheck = Readonly<{ candidates: number }>;

export type EngineVersionPolicy = Readonly<{
  kind: "ENGINE_VERSION_POLICY";
  version: 1;
  engine: 2;
  /** Optional with NO default, so a row's bytes stay as written; `false` = no row on the ask side (`engineInForce`). */
  readonly enabled?: boolean;
  scoring: EngineScoring;
  links: EngineLinks;
  investigate: EngineInvestigate;
  judges: EngineJudges;
  label: EngineLabel;
  answerCheck: EngineAnswerCheck;
}>;

const LIMITS = ENGINE_VERSION_LIMITS;
const whole = (min: number, max: number) => z.number().int().min(min).max(max);
/** A share 0..1 with at most six decimals: the register's canonical decimal limit (as debate-shape-policy.ts). */
const share = z.number().min(0).max(1).refine((value) => Number(value.toFixed(6)) === value);

/** Each of the seven measures exactly once and the weights summing to 1 within the tolerance; null when they do. */
function termsProblem(terms: readonly Readonly<{ metric: CompositionMetricName; coefficient: number }>[]): string | null {
  const metrics = new Set(terms.map((term) => term.metric));
  if (terms.length !== COMPOSITION_METRICS.length || metrics.size !== COMPOSITION_METRICS.length) {
    return "each of the seven measures exactly once";
  }
  const sum = terms.reduce((total, term) => total + term.coefficient, 0);
  return Math.abs(sum - 1) > LIMITS.sumTolerance ? `the weights sum to ${String(sum)}, not 1` : null;
}

/** A close call never needs more agreeing votes than a clear answer, and a clear answer never more than the judges. */
function labelFits(closeCallAgreeing: number, clearAgreeing: number, judges: number): boolean {
  return closeCallAgreeing <= clearAgreeing && clearAgreeing <= judges;
}

const policySchema = z.object({
  kind: z.literal("ENGINE_VERSION_POLICY"),
  version: z.literal(1),
  engine: z.literal(2),
  enabled: z.boolean().optional(),
  scoring: z.object({
    terms: z.array(z.object({ metric: z.enum(COMPOSITION_METRICS), coefficient: share }).strict()).length(COMPOSITION_METRICS.length),
    clarityDecayPerAmbiguity: share,
    fatalCap: z.object({ minFlagSeverity: share, to: share }).strict(),
    fidelityFloor: z.object({ below: share, to: share }).strict(),
    combine: z.enum(ENGINE_SCORING_COMBINES),
    disputedWeight: share
  }).strict(),
  links: z.object({
    cannotAssessWeight: share,
    ownReplyCountsAsSupport: z.literal(false),
    rivalReplies: z.enum(ENGINE_RIVAL_REPLIES)
  }).strict(),
  investigate: z.object({ maxPerDebate: whole(0, LIMITS.investigationsMax) }).strict(),
  judges: z.object({ count: whole(1, LIMITS.judgesMax), makerRule: z.enum(ENGINE_JUDGE_MAKER_RULES) }).strict(),
  label: z.object({ clearAgreeing: whole(1, LIMITS.judgesMax), closeCallAgreeing: whole(1, LIMITS.judgesMax) }).strict(),
  answerCheck: z.object({ candidates: whole(0, LIMITS.answerCheckMax) }).strict()
}).strict().superRefine((policy, ctx) => {
  const terms = termsProblem(policy.scoring.terms);
  if (terms !== null) ctx.addIssue({ code: "custom", path: ["scoring", "terms"], message: terms });
  if (!labelFits(policy.label.closeCallAgreeing, policy.label.clearAgreeing, policy.judges.count)) {
    ctx.addIssue({ code: "custom", path: ["label"], message: "a close call <= a clear answer <= the row's judges" });
  }
});

const invalid = (path: string): never => { throw new TypeError(`ENGINE_VERSION_POLICY_INVALID:${path}`); };

/** An own `__proto__` key (as JSON.parse makes one) is refused by name, never dropped by a parse. */
function protoKeyPath(value: unknown, path: readonly string[]): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (key === "__proto__") return [...path, key].join(".");
    const inner = protoKeyPath((value as Record<string, unknown>)[key], [...path, key]);
    if (inner !== null) return inner;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** Strict: any defect throws `ENGINE_VERSION_POLICY_INVALID:<path>` (`$` for the root). */
export function parseEngineVersionPolicy(value: unknown): EngineVersionPolicy {
  const proto = protoKeyPath(value, []);
  if (proto !== null) return invalid(proto);
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? [];
    return invalid(path.length === 0 ? "$" : path.map(String).join("."));
  }
  return deepFreeze(parsed.data) as EngineVersionPolicy;
}

/** ABSENT reads as null (engine 1); a malformed row throws, so the caller's boot refuses. */
export async function readEngineVersionPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<EngineVersionPolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ENGINE_VERSION_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseEngineVersionPolicy(row.value_json);
}

/**
 * The row as the ASK side must read it (INTERFACE §1.3): absent, or written with `enabled: false`, is no row: engine 1
 * and today's receipts. The runner reads the row raw, so a disabled row still needs its seal and the debates admitted
 * under engine 2 before the switch still finish.
 */
export function engineInForce(policy: EngineVersionPolicy | null): EngineVersionPolicy | null {
  return policy === null || policy.enabled === false ? null : policy;
}

/** The canonical AST: every number a DECIMAL node (whole numbers and the six-decimal shares alike); arrays kept arrays. */
function engineAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  if (Array.isArray(value)) return Object.freeze(value.map((inner: unknown) => engineAst(inner)));
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, engineAst(inner)])
  ));
}

/** The row a publisher seals (the preview kit; the hosted file's optional member), re-checked by the parser. */
export function engineVersionPolicyRow(policy: EngineVersionPolicy, sourceRef: string): Readonly<{
  rowKey: typeof ENGINE_VERSION_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseEngineVersionPolicy(policy);
  return Object.freeze({ rowKey: ENGINE_VERSION_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(engineAst(checked)), sourceRef });
}

/** The owners' start values, through the parser; `enabled` is never written. */
export function engineVersionPolicyStartValues(): EngineVersionPolicy {
  const start = ENGINE_VERSION_START;
  return parseEngineVersionPolicy({
    kind: "ENGINE_VERSION_POLICY",
    version: 1,
    engine: 2,
    scoring: {
      terms: COMPOSITION_METRICS.map((metric) => ({ metric, coefficient: start.equalCoefficient })),
      clarityDecayPerAmbiguity: start.clarityDecayPerAmbiguity,
      fatalCap: { minFlagSeverity: start.fatalCap.minFlagSeverity, to: start.fatalCap.to },
      fidelityFloor: { below: start.fidelityFloor.below, to: start.fidelityFloor.to },
      combine: "MEDIAN",
      disputedWeight: start.disputedWeight
    },
    links: { cannotAssessWeight: start.cannotAssessWeight, ownReplyCountsAsSupport: false, rivalReplies: "EQUAL" },
    investigate: { maxPerDebate: start.maxInvestigationsPerDebate },
    judges: { count: start.judges, makerRule: "PREFER_NON_ARGUING_ELSE_IGNORE_OWN" },
    label: { clearAgreeing: start.clearAgreeing, closeCallAgreeing: start.closeCallAgreeing },
    answerCheck: { candidates: start.answerCheckCandidates }
  });
}

/** Extra call sites the engine adds to this debate, frozen at admission (the ceiling and the estimate read them). */
export type EngineSites = Readonly<{
  /** min(judges.count, makers): the comparing judges are capped by the makers present. */
  comparingJudges: number;
  /**
   * investigate.maxPerDebate: the cap, so a ceiling never under-counts; on a paid path debate (V4 start step, Task 54e)
   * `pathRunInvestigations(cap, paths)`, set by the ceiling (`withPathDebateInvestigations`).
   */
  investigations: number;
  /** 1 when the map opens the debate (spec §5: the new shape only), else 0. */
  answerCheck: 0 | 1;
}>;

/** The resolved, camelCase values the runner, the estimate and the story read (INTERFACE §3.1). */
export type EngineSettings = Readonly<{
  engine: 2;
  scoring: EngineScoring;
  links: EngineLinks;
  investigate: EngineInvestigate;
  judges: EngineJudges;
  label: EngineLabel;
  answerCheck: EngineAnswerCheck;
  sites: EngineSites;
}>;

const engineInvalid = (message: string): never => {
  throw new TypedDomainError("STRUCTURAL_CEILING_ENGINE_INVALID", message);
};

/** This debate's engine: the row's values (never its kind, version or switch) and the sites for `makers` makers. */
export function engineSettingsOf(policy: EngineVersionPolicy, input: Readonly<{ makers: number; mapOpening: boolean }>): EngineSettings {
  if (!Number.isSafeInteger(input.makers) || input.makers < 1) {
    return engineInvalid(`The engine needs a whole number of makers of at least one, not ${String(input.makers)}`);
  }
  const { scoring, links, label } = policy;
  return deepFreeze({
    engine: 2 as const,
    scoring: {
      terms: scoring.terms.map((term) => ({ metric: term.metric, coefficient: term.coefficient })),
      clarityDecayPerAmbiguity: scoring.clarityDecayPerAmbiguity,
      fatalCap: { minFlagSeverity: scoring.fatalCap.minFlagSeverity, to: scoring.fatalCap.to },
      fidelityFloor: { below: scoring.fidelityFloor.below, to: scoring.fidelityFloor.to },
      combine: scoring.combine,
      disputedWeight: scoring.disputedWeight
    },
    links: { cannotAssessWeight: links.cannotAssessWeight, ownReplyCountsAsSupport: links.ownReplyCountsAsSupport, rivalReplies: links.rivalReplies },
    investigate: { maxPerDebate: policy.investigate.maxPerDebate },
    judges: { count: policy.judges.count, makerRule: policy.judges.makerRule },
    label: { clearAgreeing: label.clearAgreeing, closeCallAgreeing: label.closeCallAgreeing },
    answerCheck: { candidates: policy.answerCheck.candidates },
    sites: {
      comparingJudges: Math.min(policy.judges.count, input.makers),
      investigations: policy.investigate.maxPerDebate,
      answerCheck: input.mapOpening ? 1 as const : 0 as const
    }
  });
}

/**
 * V4 start step, Task 54e (the owner's answer of 5 Nov, "One per path": every path gets one look-up, 3 paths = 3; every path is
 * checked, the debate costs a little more): a paid path debate's investigations, so every path holds at least one slot:
 * max(cap, paths). A cap of 0 (no investigation on that engine) stays 0.
 */
export function pathRunInvestigations(cap: number, paths: number): number {
  if (!Number.isSafeInteger(cap) || cap < 0 || !Number.isSafeInteger(paths) || paths < 0) throw new TypeError("PATH_RUN_INVESTIGATIONS_INVALID");
  return cap === 0 ? 0 : Math.max(cap, paths);
}

/**
 * Task 54e: the investigation sites a debate's receipt counts: the row's cap, and on a paid path debate (shape receipt v2, any
 * plan but Free; `pathDebate` its plan and chosen paths) `pathRunInvestigations(cap, paths)`. Free keeps the cap. The ceiling
 * mints by it (`withPathDebateInvestigations`) and the strict receipt parser checks by it.
 */
export function investigationSitesOf(cap: number, pathDebate: Readonly<{ plan: DebateShapePlanKey; paths: number }> | null): number {
  return pathDebate === null || pathDebate.plan === "free" ? cap : pathRunInvestigations(cap, pathDebate.paths);
}

/**
 * Task 54e: this debate's engine with its investigation sites as `investigationSitesOf` counts them; the very settings when
 * they do not change (every debate without paths, Free, a paid path debate of no more paths than the cap), so those
 * receipts keep their bytes.
 */
export function withPathDebateInvestigations(
  settings: EngineSettings,
  pathDebate: Readonly<{ plan: DebateShapePlanKey; paths: number }> | null
): EngineSettings {
  const investigations = investigationSitesOf(settings.investigate.maxPerDebate, pathDebate);
  if (investigations === settings.sites.investigations) return settings;
  return deepFreeze({ ...settings, sites: { ...settings.sites, investigations } });
}

/**
 * The receipt member `envelope_basis.engine` (INTERFACE §3.1): the settings in snake_case, version 1, strict at every
 * level, with the row's own rules re-checked and the sites tied to the values (the comparing judges never above the
 * row's judges, the investigations the row's cap, or on a paid path debate one per path above it: Task 54e). `added_model_attempts`
 * and a path debate's investigations are tied to the receipt's per-site attempts and paths by the strict receipt parser
 * (`parseCostEnvelopeBasis`), which can see them.
 */
export const engineReceiptSchema = z.object({
  version: z.literal(1),
  engine: z.literal(2),
  scoring: z.object({
    terms: z.array(z.object({ metric: z.enum(COMPOSITION_METRICS), coefficient: share }).strict()).length(COMPOSITION_METRICS.length),
    clarity_decay_per_ambiguity: share,
    fatal_cap: z.object({ min_flag_severity: share, to: share }).strict(),
    fidelity_floor: z.object({ below: share, to: share }).strict(),
    combine: z.enum(ENGINE_SCORING_COMBINES),
    disputed_weight: share
  }).strict(),
  links: z.object({
    cannot_assess_weight: share,
    own_reply_counts_as_support: z.literal(false),
    rival_replies: z.enum(ENGINE_RIVAL_REPLIES)
  }).strict(),
  investigate: z.object({ max_per_debate: whole(0, LIMITS.investigationsMax) }).strict(),
  judges: z.object({ count: whole(1, LIMITS.judgesMax), maker_rule: z.enum(ENGINE_JUDGE_MAKER_RULES) }).strict(),
  label: z.object({ clear_agreeing: whole(1, LIMITS.judgesMax), close_call_agreeing: whole(1, LIMITS.judgesMax) }).strict(),
  answer_check: z.object({ candidates: whole(0, LIMITS.answerCheckMax) }).strict(),
  sites: z.object({
    comparing_judges: whole(1, LIMITS.judgesMax),
    // Task 54e: a paid path debate's investigations run to one per stored path (b8) when that is above the row's cap.
    investigations: whole(0, Math.max(LIMITS.investigationsMax, START_STEP_LIMITS.storedPathsMax)),
    answer_check: z.union([z.literal(0), z.literal(1)]),
    added_model_attempts: z.number().int().min(0)
  }).strict()
}).strict().superRefine((receipt, ctx) => {
  const terms = termsProblem(receipt.scoring.terms);
  if (terms !== null) ctx.addIssue({ code: "custom", path: ["scoring", "terms"], message: terms });
  if (!labelFits(receipt.label.close_call_agreeing, receipt.label.clear_agreeing, receipt.judges.count)) {
    ctx.addIssue({ code: "custom", path: ["label"], message: "a close call <= a clear answer <= the row's judges" });
  }
  if (receipt.sites.comparing_judges > receipt.judges.count) {
    ctx.addIssue({ code: "custom", path: ["sites", "comparing_judges"], message: "more comparing judges than the row allows" });
  }
  // Task 54e: the row's cap, or above a cap that is not 0 (a paid path debate's one per path; the strict receipt parser ties the
  // number to the receipt's paths, which it can see).
  const { investigations } = receipt.sites;
  const cap = receipt.investigate.max_per_debate;
  if (investigations !== cap && (cap === 0 || investigations < cap)) {
    ctx.addIssue({ code: "custom", path: ["sites", "investigations"], message: "the investigation sites are not the row's cap" });
  }
});
export type EngineReceipt = z.infer<typeof engineReceiptSchema>;

/**
 * The member, parsed with its OWN schema before it is handed back: a receipt the strict parser would later refuse is
 * never minted. Each added call is one call bounded like a panel member: the caller passes that allowance.
 */
export function engineReceipt(settings: EngineSettings, perSiteAttempts: number): EngineReceipt {
  if (!Number.isSafeInteger(perSiteAttempts) || perSiteAttempts < 1) {
    return engineInvalid(`The engine's calls need a whole number of attempts per site, not ${String(perSiteAttempts)}`);
  }
  const { scoring, links, sites } = settings;
  const receipt: EngineReceipt = deepFreeze({
    version: 1 as const,
    engine: settings.engine,
    scoring: {
      terms: scoring.terms.map((term) => ({ metric: term.metric, coefficient: term.coefficient })),
      clarity_decay_per_ambiguity: scoring.clarityDecayPerAmbiguity,
      fatal_cap: { min_flag_severity: scoring.fatalCap.minFlagSeverity, to: scoring.fatalCap.to },
      fidelity_floor: { below: scoring.fidelityFloor.below, to: scoring.fidelityFloor.to },
      combine: scoring.combine,
      disputed_weight: scoring.disputedWeight
    },
    links: {
      cannot_assess_weight: links.cannotAssessWeight,
      own_reply_counts_as_support: links.ownReplyCountsAsSupport,
      rival_replies: links.rivalReplies
    },
    investigate: { max_per_debate: settings.investigate.maxPerDebate },
    judges: { count: settings.judges.count, maker_rule: settings.judges.makerRule },
    label: { clear_agreeing: settings.label.clearAgreeing, close_call_agreeing: settings.label.closeCallAgreeing },
    answer_check: { candidates: settings.answerCheck.candidates },
    sites: {
      comparing_judges: sites.comparingJudges,
      investigations: sites.investigations,
      answer_check: sites.answerCheck,
      added_model_attempts: (sites.comparingJudges + sites.investigations + sites.answerCheck) * perSiteAttempts
    }
  });
  const parsed = engineReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    return engineInvalid("The engine's receipt does not parse: "
      + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return receipt;
}

/** The engine a run was admitted with, read back from its receipt (the runner's only source: it never reads the row). */
export function engineSettingsOfReceipt(receipt: EngineReceipt): EngineSettings {
  const { scoring, links, sites } = receipt;
  return deepFreeze({
    engine: receipt.engine,
    scoring: {
      terms: scoring.terms.map((term) => ({ metric: term.metric, coefficient: term.coefficient })),
      clarityDecayPerAmbiguity: scoring.clarity_decay_per_ambiguity,
      fatalCap: { minFlagSeverity: scoring.fatal_cap.min_flag_severity, to: scoring.fatal_cap.to },
      fidelityFloor: { below: scoring.fidelity_floor.below, to: scoring.fidelity_floor.to },
      combine: scoring.combine,
      disputedWeight: scoring.disputed_weight
    },
    links: {
      cannotAssessWeight: links.cannot_assess_weight,
      ownReplyCountsAsSupport: links.own_reply_counts_as_support,
      rivalReplies: links.rival_replies
    },
    investigate: { maxPerDebate: receipt.investigate.max_per_debate },
    judges: { count: receipt.judges.count, makerRule: receipt.judges.maker_rule },
    label: { clearAgreeing: receipt.label.clear_agreeing, closeCallAgreeing: receipt.label.close_call_agreeing },
    answerCheck: { candidates: receipt.answer_check.candidates },
    sites: { comparingJudges: sites.comparing_judges, investigations: sites.investigations, answerCheck: sites.answer_check }
  });
}

/** Engine 1: a run admitted without the member, today's debate byte for byte. */
export const ENGINE_ONE = Object.freeze({ engine: 1 } as const);
export type EngineOfRun = typeof ENGINE_ONE | EngineSettings;

/**
 * The ONE reader (INTERFACE §3.3): a structural parameter, so register never imports budget; pass the run's parsed
 * `CostEnvelopeBasis`. Every engine-2 branch asks `engineOfRun(basis).engine === 2`.
 */
export function engineOfRun(basis: Readonly<{ engine?: EngineSettings }>): EngineOfRun {
  return basis.engine ?? ENGINE_ONE;
}
