import { z } from "zod";
import { DEBATE_ROLES, MODEL_STRENGTHS } from "@debateai/kernel";

/**
 * THE SCORECARD FILE FORMAT (model-scorecard design, Part 1; interface contract 2026-09-26).
 *
 * One JSON document, validated whole before any of it is used. Plain `z.object` throughout
 * on purpose: zod 4 STRIPS a key it does not know, which is the format's rule that "an unknown
 * future field is ignored". Everything else is closed: a missing field, a wrong type, an
 * unknown tier, strength, subscription tool or ROLE key. `z.record` over an enum is exhaustive
 * in zod 4, so all seven role keys must be present; an EMPTY list means "not covered", and the
 * picker then falls back to today's behaviour for that role.
 *
 * Numbers must also be sealable by the register (`isRegisterSealableNumber`, ./parse.ts).
 * That rule is checked on the raw value, unknown fields included.
 *
 * Hosted publish (apps/runner/src/hosted-register-publish.ts, `firstUndefinedScorecardKey`)
 * compares this schema's parsed OUTPUT keys with the input document's to refuse a field the
 * format does not define before it is sealed; a transform, a rename or `.passthrough()` here
 * changes what that guard sees, so update the hosted check and its tests together with it.
 *
 * TOKEN UNITS (final review I3). A role entry's `typicalCall` counts VENDOR-STYLE tokens, as a
 * vendor's usage block reports them: about 4 characters of text each. The engine's context-window
 * wall counts differently — UTF-8 bytes / 2 (`estimateWindowTokens` in @debateai/providers), plus
 * the attempt's answer bound. The picker converts with ONE constant (./picker.ts,
 * `WINDOW_TOKENS_PER_VENDOR_TOKEN` = 4, read through `typicalCallWindowTokens`): the worst case of
 * the wall's rule for about 4 characters per token at no more than 2 UTF-8 bytes per character
 * (Romanian diacritics included), so the picker never seats a candidate the gateway would then
 * refuse on every call.
 */
export const TIERS = ["TOP", "GOOD_VALUE", "AVOID", "UNTESTED"] as const;
export type Tier = typeof TIERS[number];

/** The subscription tools the local relays reach (acceptance/*-relay.ts). */
export const SUBSCRIPTION_TOOLS = ["claude", "codex", "grok", "agy", "pi"] as const;
export type SubscriptionTool = typeof SUBSCRIPTION_TOOLS[number];

const nonBlankText = z.string().regex(/\S/u);
/** Machine identifiers: candidate ids and model ids. */
const identifierText = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$/u);
const dottedVersionText = z.string().regex(/^\d{1,9}(?:\.\d{1,9}){0,7}$/u);
const isoDateText = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u
);
const countInteger = z.number().int().min(0);
const qualityPoints = z.number().min(0).max(100);
const modelStrengthSchema = z.enum(MODEL_STRENGTHS);
const debateRoleSchema = z.enum(DEBATE_ROLES);

const QualityBandSchema = z.object({
  score: qualityPoints,
  low: qualityPoints,
  high: qualityPoints
}).superRefine((band, context) => {
  if (band.low > band.score || band.score > band.high) {
    context.addIssue({ code: "custom", message: "a quality band needs low <= score <= high" });
  }
});

const AccessRouteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("API") }),
  z.object({ kind: z.literal("SUBSCRIPTION"), tool: z.enum(SUBSCRIPTION_TOOLS) })
]);

const ApiPriceSchema = z.object({
  inputMicrosPerMTok: countInteger,
  outputMicrosPerMTok: countInteger,
  asOf: isoDateText,
  source: nonBlankText
});

export const ScorecardCandidateSchema = z.object({
  candidateId: identifierText,
  vendor: nonBlankText,
  maker: nonBlankText,
  /** The exact pinned model version (design Part 1): never a "latest" alias. */
  modelId: identifierText.superRefine((modelId, context) => {
    if (/(?:^|[-_.:@/+])latest$/iu.test(modelId)) {
      context.addIssue({ code: "custom", message: "a candidate pins a model version, never a latest alias" });
    }
  }),
  /**
   * The vendor's own level name, or DEFAULT_ONLY when the level cannot be set (ruling R7). The
   * same token the gateway (`THINKING_LEVEL_TOKEN`) and 0090's `ledger_entry_thinking_level_token`
   * accept, so a VALID scorecard never names a level that could not be seated or recorded
   * (pre-flight fix F36).
   */
  thinkingLevel: z.string().regex(/^(?:[a-z][a-z0-9_-]{0,31}|DEFAULT_ONLY)$/u),
  accessRoutes: z.array(AccessRouteSchema).min(1),
  /** Informational, for local users; hosted money always uses the operator's configured prices. */
  apiPrice: ApiPriceSchema.nullable(),
  /** Optional in the file (spec Part 1); an omitted window reads as null, "no window declared". */
  contextWindowTokens: z.number().int().min(1).nullable().default(null)
});

/** One typical call of a role, in VENDOR-STYLE tokens (see TOKEN UNITS above) and seconds. */
const TypicalCallSchema = z.object({
  inputTokens: countInteger,
  outputTokens: countInteger,
  thinkingTokens: countInteger.nullable(),
  seconds: z.number().min(0)
});

const TagSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u),
  strength: z.enum(["STRONG", "WEAK"]),
  text: nonBlankText
});

export const ScorecardRoleEntrySchema = z.object({
  candidateId: identifierText,
  tier: z.enum(TIERS),
  quality: QualityBandSchema,
  /** Optional in the file (spec Part 1: present only when measured per language); omitted reads as null. */
  qualityByLanguage: z.object({
    ro: QualityBandSchema.optional(),
    en: QualityBandSchema.optional()
  }).nullable().default(null),
  typicalCall: TypicalCallSchema,
  tags: z.array(TagSchema),
  promptVersion: nonBlankText,
  itemsMeasured: countInteger,
  measuredAt: isoDateText
});

const EconomyCapSchema = z.object({
  moneyMicrosPerCall: countInteger.nullable(),
  secondsPerCall: z.number().min(0).nullable()
});

/**
 * Paid plans S4b (final review P3-I2; the owner's ruling of 3 October 2026): Free's own, stricter
 * per-role money cap. Hosted money only (local mode sells no plans). `null` means "not set".
 */
const FreeCapSchema = z.object({
  moneyMicrosPerCall: countInteger.nullable()
});

export const PickerSettingsSchema = z.object({
  balancedMargin: qualityPoints,
  economyCap: z.record(debateRoleSchema, EconomyCapSchema),
  /**
   * S4b: on a site that sells plans (hosted, billing on) a Free ask's ECONOMY pick is the best
   * candidate under THIS cap, per role, instead of the Economy cap; publish and boot then refuse a
   * scorecard where a role's Free cap is unset or above that role's Economy cap
   * (`freeCapsFollowPaidSiteRule`, SCORECARD_FREE_CAPS_INVALID). Optional: a scorecard for a site
   * that sells no plans (billing off, local mode) need not carry it, and nothing reads it there.
   */
  freeCap: z.record(debateRoleSchema, FreeCapSchema).optional(),
  planStrengthCaps: z.object({
    free: modelStrengthSchema.optional(),
    premium: modelStrengthSchema.optional()
  }),
  defaultStrength: modelStrengthSchema,
  diversityShare: z.number().min(0).max(0.5),
  runnerUpCostTolerance: z.number().min(0)
});

export const ScorecardSchema = z.object({
  kind: z.literal("DEBATEAI_SCORECARD"),
  formatVersion: z.literal(1),
  /** Pinned in 0090's int4 `ledger_entry.scorecard_version`, so it must fit a PostgreSQL integer. */
  scorecardVersion: z.number().int().min(1).max(2_147_483_647),
  createdAt: isoDateText,
  testSetVersion: nonBlankText,
  engineCompatibility: z.object({
    minEngineVersion: dottedVersionText,
    maxEngineVersion: dottedVersionText.nullable()
  }),
  languages: z.array(z.enum(["ro", "en"])).min(1),
  candidates: z.array(ScorecardCandidateSchema).min(1),
  roles: z.record(debateRoleSchema, z.array(ScorecardRoleEntrySchema)),
  pickerSettings: PickerSettingsSchema
}).superRefine((scorecard, context) => {
  const listed = new Set<string>();
  for (const candidate of scorecard.candidates ?? []) {
    if (listed.has(candidate.candidateId)) {
      context.addIssue({ code: "custom", path: ["candidates"], message: `candidate ${candidate.candidateId} is listed twice` });
    }
    listed.add(candidate.candidateId);
  }
  for (const role of DEBATE_ROLES) {
    const entered = new Set<string>();
    for (const entry of scorecard.roles?.[role] ?? []) {
      if (entered.has(entry.candidateId)) {
        context.addIssue({ code: "custom", path: ["roles", role], message: `${role} lists candidate ${entry.candidateId} twice` });
      }
      entered.add(entry.candidateId);
    }
  }
});

export type ScorecardCandidate = z.infer<typeof ScorecardCandidateSchema>;
export type ScorecardRoleEntry = z.infer<typeof ScorecardRoleEntrySchema>;
export type PickerSettings = z.infer<typeof PickerSettingsSchema>;
export type Scorecard = z.infer<typeof ScorecardSchema>;
