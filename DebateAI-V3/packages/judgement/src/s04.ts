import { z } from "zod";
import { ABSTENTION_KINDS, CLAIM_TYPES, type AbstentionKind, type ClaimType } from "@debateai/kernel";
import type { CompositionMapRegisterRow } from "@debateai/register";

export { CLAIM_TYPES };
export type { ClaimType };
export type { CompositionMapRegisterRow } from "@debateai/register";

export function createTypedNonAnswer(input: {
  readonly unknownRef: string;
  readonly modelChoice: unknown;
  readonly provenanceRef: string;
}): {
  readonly kind: "ABSTENTION";
  readonly abstentionKind: AbstentionKind;
  readonly unknownRef: string;
  readonly chosenBy: "MODEL";
  readonly enforcement: "CLOSED_SPEC_12_3_SET";
  readonly provenanceRef: string;
} {
  if (input.unknownRef.trim() === "" || input.provenanceRef.trim() === "") throw new TypeError("A typed non-answer requires unknown and provenance references");
  if (typeof input.modelChoice !== "string" || !(ABSTENTION_KINDS as readonly string[]).includes(input.modelChoice)) {
    throw new TypeError("The model chose a non-answer outside spec §12.3 Home 1");
  }
  return Object.freeze({
    kind: "ABSTENTION",
    abstentionKind: input.modelChoice as AbstentionKind,
    unknownRef: input.unknownRef,
    chosenBy: "MODEL",
    enforcement: "CLOSED_SPEC_12_3_SET",
    provenanceRef: input.provenanceRef
  });
}

export interface NormalizedClaim {
  readonly claimType: ClaimType;
  readonly scope: { readonly timeframe: string | null; readonly geography: string | null; readonly population: string | null };
  readonly ambiguityFlags: readonly string[];
  readonly evidenceLocators: readonly string[];
  readonly substance: "code" | "model";
  readonly enforcement: "closed-claim-type-set";
}

const classificationPatterns: Readonly<Record<Exclude<ClaimType, "mixed" | "unknown">, RegExp>> = Object.freeze({
  empirical: /\b(?:observed|measured|study|data|evidence|rate|percent|increased|decreased)\b/i,
  causal: /\b(?:cause[sd]?|causing|because|leads? to|results? in|due to)\b/i,
  normative: /\b(?:ought|should|must|better to|wrong to|right to)\b/i,
  definitional: /\b(?:define[sd]?|means?|refers? to|is the definition of)\b/i,
  prediction: /\b(?:will|forecast|predict(?:s|ed)?|likely to|expected to)\b/i,
  comparative: /\b(?:more than|less than|better than|worse than|compared with|versus|vs\.?\b)\b/i
});

function extractScope(text: string): NormalizedClaim["scope"] {
  const timeframe = text.match(/\b(?:in|during|since|before|after)\s+(\d{4}(?:[-–]\d{4})?)\b/i)?.[1] ?? null;
  const geography = text.match(/\b(?:in|across)\s+([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+)*)\b/)?.[1] ?? null;
  const population = text.match(/\b(?:among|for)\s+([^,.;]+)/i)?.[1]?.trim() ?? null;
  return Object.freeze({ timeframe, geography, population });
}

export function classifyClaimText(text: string): NormalizedClaim {
  const matches = (Object.entries(classificationPatterns) as [Exclude<ClaimType, "mixed" | "unknown">, RegExp][])
    .filter(([, pattern]) => pattern.test(text)).map(([claimType]) => claimType);
  const claimType: ClaimType = matches.length === 0 ? "unknown" : matches.length === 1 ? matches[0]! : "mixed";
  return Object.freeze({
    claimType,
    scope: extractScope(text),
    ambiguityFlags: Object.freeze([]),
    evidenceLocators: Object.freeze([...text.matchAll(/https?:\/\/[^\s)\]}]+/g)].map((match) => match[0])),
    substance: "code",
    enforcement: "closed-claim-type-set"
  });
}

export async function resolveClaimType(input: { readonly text: string; readonly classifyUnknown: (text: string) => Promise<unknown> }): Promise<NormalizedClaim> {
  const codeResult = classifyClaimText(input.text);
  if (codeResult.claimType !== "unknown") return codeResult;
  const proposed = await input.classifyUnknown(input.text);
  if (proposed === undefined || proposed === null) return codeResult;
  if (typeof proposed !== "string" || !(CLAIM_TYPES as readonly string[]).includes(proposed)) {
    throw new TypeError("The model-proposed claim_type is outside the closed vocabulary");
  }
  return Object.freeze({ ...codeResult, claimType: proposed as ClaimType, substance: "model" });
}

const fatalFlagSchema = z.object({
  type: z.string().trim().min(1), severity: z.number().min(0).max(1), description: z.string().trim().min(1)
}).strict();

export const judgeAssessmentSchema = z.object({
  steelman: z.object({ summary: z.string().trim().min(1), fidelity: z.number().min(0).max(1) }).strict(),
  critic: z.object({
    summary: z.string().trim().min(1), counterargumentStrength: z.number().min(0).max(1),
    basis: z.enum(["REAL_ATTACK", "PLAUSIBLE_COUNTER"])
  }).strict(),
  evidence: z.object({ quality: z.number().min(0).max(1), relevance: z.number().min(0).max(1) }).strict(),
  context: z.object({ fit: z.number().min(0).max(1), ambiguityFlags: z.array(z.string().trim().min(1)) }).strict(),
  fallacy: z.object({ severity: z.number().min(0).max(1), fatalFlags: z.array(fatalFlagSchema) }).strict()
}).strict();
export type JudgeAssessment = z.infer<typeof judgeAssessmentSchema>;

export type ParseStructuredArtifactResult<T> =
  | { readonly kind: "PARSED"; readonly strategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED"; readonly value: T }
  | { readonly kind: "PARSE_FAILURE"; readonly message: string }
  | { readonly kind: "SCHEMA_FAILURE"; readonly message: string };

export type ParseJudgeAssessmentResult =
  | { readonly kind: "PARSED"; readonly strategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED"; readonly assessment: JudgeAssessment }
  | { readonly kind: "PARSE_FAILURE"; readonly message: string }
  | { readonly kind: "SCHEMA_FAILURE"; readonly message: string };

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function schemaResult<T>(decoded: unknown, strategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED", schema: z.ZodType<T>): ParseStructuredArtifactResult<T> {
  const parsed = schema.safeParse(decoded);
  return parsed.success
    ? Object.freeze({ kind: "PARSED", strategy, value: parsed.data })
    : Object.freeze({ kind: "SCHEMA_FAILURE", message: parsed.error.message });
}

export function parseStructuredArtifact<T>(content: string, schema: z.ZodType<T>): ParseStructuredArtifactResult<T> {
  try { return schemaResult(JSON.parse(content), "RAW", schema); } catch { /* advance only on parse failure */ }
  const fence = content.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence !== null) {
    try { return schemaResult(JSON.parse(fence[1]!), "ONE_FENCE", schema); } catch { /* next strategy */ }
  }
  const balanced = firstBalancedObject(content);
  if (balanced !== null) {
    try { return schemaResult(JSON.parse(balanced), "BRACE_BALANCED", schema); } catch { /* typed below */ }
  }
  return Object.freeze({ kind: "PARSE_FAILURE", message: "No parsing strategy produced a JSON object" });
}

export function parseJudgeAssessment(content: string): ParseJudgeAssessmentResult {
  const result = parseStructuredArtifact(content, judgeAssessmentSchema);
  return result.kind === "PARSED"
    ? Object.freeze({ kind: "PARSED", strategy: result.strategy, assessment: Object.freeze(result.value) })
    : result;
}

export type CompositionMetric = "steelman_fidelity" | "counter_resilience" | "evidence_quality" | "evidence_relevance" | "context_fit" | "clarity" | "fallacy_resilience";

interface Provenance { readonly rowKey: string; readonly registerVersion: number; readonly sourceRef: string }
function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be in [0,1]`);
}
function provenance(row: Provenance): Provenance {
  if (row.rowKey.trim() === "" || row.sourceRef.trim() === "" || !Number.isInteger(row.registerVersion) || row.registerVersion < 1) throw new TypeError("Register-row provenance is incomplete");
  return Object.freeze({ rowKey: row.rowKey, registerVersion: row.registerVersion, sourceRef: row.sourceRef });
}

export function reduceAssessment(input: { readonly claimType: ClaimType; readonly assessment: JudgeAssessment; readonly compositionRow: CompositionMapRegisterRow; readonly reducerVersion: string }):
  | { readonly kind: "UNAVAILABLE"; readonly reason: "COMPOSITION_UNRESOLVED"; readonly claimType: ClaimType; readonly compositionProvenance: Provenance }
  | { readonly kind: "REDUCED"; readonly tau: number; readonly branch: "EVIDENCE_AWARE" | "EVIDENCE_FREE"; readonly caps: readonly { readonly what: "tau"; readonly toWhat: number; readonly why: string; readonly byWhat: string }[]; readonly uncertaintyLadderPosition: string; readonly drivers: readonly { readonly kind: "FATAL_FLAG" | "AMBIGUITY"; readonly detail: string }[]; readonly holes: readonly { readonly kind: "FATAL_ASSESSMENT_HOLE"; readonly fatalType: string; readonly description: string }[]; readonly rationale: { readonly supports: string; readonly challenges: string; readonly weakestLink: string }; readonly reducerVersion: string; readonly compositionProvenance: Provenance } {
  const compositionProvenance = provenance(input.compositionRow);
  const composition = input.compositionRow.value.entries[input.claimType];
  if (composition === undefined) return Object.freeze({ kind: "UNAVAILABLE", reason: "COMPOSITION_UNRESOLVED", claimType: input.claimType, compositionProvenance });
  assertUnitInterval(composition.clarityDecayPerAmbiguity, "clarity decay");
  const metrics: Readonly<Record<CompositionMetric, number>> = Object.freeze({
    steelman_fidelity: input.assessment.steelman.fidelity,
    counter_resilience: 1 - input.assessment.critic.counterargumentStrength,
    evidence_quality: input.assessment.evidence.quality,
    evidence_relevance: input.assessment.evidence.relevance,
    context_fit: input.assessment.context.fit,
    clarity: Math.max(0, 1 - composition.clarityDecayPerAmbiguity * input.assessment.context.ambiguityFlags.length),
    fallacy_resilience: 1 - input.assessment.fallacy.severity
  });
  let tau = 0;
  for (const term of composition.terms) {
    assertUnitInterval(term.coefficient, `coefficient ${term.metric}`);
    tau += metrics[term.metric] * term.coefficient;
  }
  tau = Math.max(0, Math.min(1, tau));
  const appliedCaps: { what: "tau"; toWhat: number; why: string; byWhat: string }[] = [];
  for (const cap of composition.caps) {
    assertUnitInterval(cap.to, `cap ${cap.whenFatalType}`);
    if (!input.assessment.fallacy.fatalFlags.some((flag) => flag.type === cap.whenFatalType) || tau <= cap.to) continue;
    tau = cap.to;
    appliedCaps.push(Object.freeze({ what: "tau", toWhat: cap.to, why: cap.why, byWhat: cap.by }));
  }
  const uncertainty = Math.max(0, Math.min(1, input.assessment.fallacy.severity + composition.clarityDecayPerAmbiguity * input.assessment.context.ambiguityFlags.length));
  const ladder = composition.uncertaintyLadder.find((entry) => uncertainty <= entry.atMost);
  if (ladder === undefined) throw new TypeError("Uncertainty ladder does not cover the computed uncertainty");
  const drivers = Object.freeze([
    ...input.assessment.fallacy.fatalFlags.map((flag) => Object.freeze({ kind: "FATAL_FLAG" as const, detail: flag.type })),
    ...input.assessment.context.ambiguityFlags.map((flag) => Object.freeze({ kind: "AMBIGUITY" as const, detail: flag }))
  ]);
  const holes = Object.freeze(input.assessment.fallacy.fatalFlags.map((flag) => Object.freeze({ kind: "FATAL_ASSESSMENT_HOLE" as const, fatalType: flag.type, description: flag.description })));
  let weakestMetric = composition.terms[0]?.metric;
  let weakestValue = weakestMetric === undefined ? 1 : metrics[weakestMetric];
  for (const term of composition.terms.slice(1)) {
    if (metrics[term.metric] < weakestValue) { weakestMetric = term.metric; weakestValue = metrics[term.metric]; }
  }
  const strongestMetric = composition.terms.reduce((best, term) => metrics[term.metric] > metrics[best.metric] ? term : best).metric;
  return Object.freeze({
    kind: "REDUCED", tau, branch: composition.branch, caps: Object.freeze(appliedCaps), uncertaintyLadderPosition: ladder.label,
    drivers, holes,
    rationale: Object.freeze({ supports: `Strongest declared component: ${strongestMetric}.`, challenges: `Weakest declared component: ${weakestMetric ?? "none"}.`, weakestLink: weakestMetric ?? "none" }),
    reducerVersion: input.reducerVersion, compositionProvenance
  });
}

export async function runJudgePanel(input: {
  readonly artifactProducerRef: string;
  readonly primary: { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string };
  readonly members: readonly { readonly memberRole: string; readonly actorRef: string; readonly contractHash: string; readonly judge: () => Promise<{ readonly judgementRef: string; readonly assessment: JudgeAssessment }> }[];
}): Promise<{ readonly judgements: readonly { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string; readonly contractHash: string | null }[]; readonly notes: readonly { readonly memberRole: string; readonly contractHash: string; readonly kind: "MEMBER_FAILED" | "PRODUCER_GRADING_FORBIDDEN"; readonly failureKind: PanelMemberFailureKind; readonly reason: string }[] }> {
  const judgements = [{ ...input.primary, contractHash: null as string | null }];
  const notes: { memberRole: string; contractHash: string; kind: "MEMBER_FAILED" | "PRODUCER_GRADING_FORBIDDEN"; failureKind: PanelMemberFailureKind; reason: string }[] = [];
  for (const member of input.members) {
    if (member.actorRef === input.artifactProducerRef) {
      notes.push({ memberRole: member.memberRole, contractHash: member.contractHash, kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6" });
      continue;
    }
    try {
      const judged = await member.judge();
      judgements.push({ ...judged, memberRole: member.memberRole, contractHash: member.contractHash });
    } catch (error) {
      notes.push({
        memberRole: member.memberRole,
        contractHash: member.contractHash,
        kind: "MEMBER_FAILED",
        failureKind: error instanceof PanelMemberFailure ? error.failureKind : "PROVIDER_ERROR",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return Object.freeze({
    judgements: Object.freeze(judgements.map((entry) => Object.freeze(entry))),
    notes: Object.freeze(notes.map((note) => Object.freeze(note)))
  });
}

export const PANEL_MEMBER_FAILURE_KINDS = [
  "CONSTRUCTION_ERROR", "TIMEOUT", "PROVIDER_ERROR", "PARSE_FAILURE",
  "SCHEMA_FAILURE", "UNCONFIGURED_FAMILY", "PRODUCER_GRADING_FORBIDDEN"
] as const;
export type PanelMemberFailureKind = typeof PANEL_MEMBER_FAILURE_KINDS[number];

export class PanelMemberFailure extends Error {
  constructor(readonly failureKind: Exclude<PanelMemberFailureKind, "PRODUCER_GRADING_FORBIDDEN">, message: string) {
    super(message);
    this.name = "PanelMemberFailure";
  }
}

export function measureDispersion(judgements: readonly { readonly judgementRef: string; readonly tau: number }[], row: Provenance & { readonly scale: number }):
  | { readonly kind: "ABSENT"; readonly reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" }
  | { readonly kind: "MEASURED"; readonly value: number; readonly driver: { readonly kind: "DISPERSION"; readonly source: Provenance } } {
  if (new Set(judgements.map((entry) => entry.judgementRef)).size < 2) return Object.freeze({ kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" });
  assertUnitInterval(row.scale, "dispersion scale");
  let minimum = 1;
  let maximum = 0;
  for (const judgement of judgements) {
    assertUnitInterval(judgement.tau, `tau ${judgement.judgementRef}`);
    minimum = Math.min(minimum, judgement.tau); maximum = Math.max(maximum, judgement.tau);
  }
  return Object.freeze({ kind: "MEASURED", value: Math.max(0, Math.min(1, (maximum - minimum) * row.scale)), driver: Object.freeze({ kind: "DISPERSION", source: provenance(row) }) });
}

export type JudgeFamily = { readonly kind: "KNOWN"; readonly familyRef: string } | { readonly kind: "UNKNOWN"; readonly reason: string };
export function applyCorrelatedErrorDiscount(judgements: readonly { readonly memberRole: string; readonly earnedWeight: number; readonly family: JudgeFamily }[], row: Provenance & { readonly repeatedFamilyMultiplier: number }): readonly { readonly memberRole: string; readonly effectiveWeight: number; readonly family: JudgeFamily; readonly familyOrdinal: number | null; readonly weightProvenance: Provenance }[] {
  assertUnitInterval(row.repeatedFamilyMultiplier, "repeated-family multiplier");
  const seen = new Map<string, number>();
  const weightProvenance = provenance(row);
  return Object.freeze(judgements.map((judgement) => {
    assertUnitInterval(judgement.earnedWeight, `earned weight ${judgement.memberRole}`);
    if (judgement.family.kind === "UNKNOWN") return Object.freeze({ ...judgement, effectiveWeight: judgement.earnedWeight, familyOrdinal: null, weightProvenance });
    const familyOrdinal = (seen.get(judgement.family.familyRef) ?? 0) + 1;
    seen.set(judgement.family.familyRef, familyOrdinal);
    return Object.freeze({ ...judgement, effectiveWeight: familyOrdinal === 1 ? judgement.earnedWeight : judgement.earnedWeight * row.repeatedFamilyMultiplier, familyOrdinal, weightProvenance });
  }));
}

export interface JudgementSelectionRule extends Provenance { readonly kind: "MAXIMIZE_WEIGHTED_TAU" }
export function selectReducedJudgement(candidates: readonly { readonly judgementRef: string; readonly tau: number; readonly effectiveWeight: number }[], rule: JudgementSelectionRule):
  | { readonly kind: "UNAVAILABLE"; readonly reason: "NO_USABLE_JUDGEMENTS" }
  | { readonly kind: "SELECTED"; readonly selectedJudgementRef: string; readonly tau: number; readonly selectionScore: number; readonly rule: JudgementSelectionRule } {
  if (candidates.length === 0) return Object.freeze({ kind: "UNAVAILABLE", reason: "NO_USABLE_JUDGEMENTS" });
  const recordedRule = Object.freeze({ ...rule, ...provenance(rule) });
  let selected = candidates[0]!;
  assertUnitInterval(selected.tau, `tau ${selected.judgementRef}`); assertUnitInterval(selected.effectiveWeight, `weight ${selected.judgementRef}`);
  // DR-077: earned weight multiplies the selection arithmetic; the selected tau itself is never averaged or rescaled.
  let selectionScore = selected.tau * selected.effectiveWeight;
  for (const candidate of candidates.slice(1)) {
    assertUnitInterval(candidate.tau, `tau ${candidate.judgementRef}`); assertUnitInterval(candidate.effectiveWeight, `weight ${candidate.judgementRef}`);
    const candidateScore = candidate.tau * candidate.effectiveWeight;
    if (candidateScore > selectionScore) { selected = candidate; selectionScore = candidateScore; }
  }
  return Object.freeze({ kind: "SELECTED", selectedJudgementRef: selected.judgementRef, tau: selected.tau, selectionScore, rule: recordedRule });
}

export function applyDeclaredDisagreement(input: { readonly fires: boolean; readonly predicateRef: string; readonly observationRef: string; readonly certaintyBand: string | null; readonly downgradedBand: string | null }): { readonly flag: "DISAGREEMENT" | "NO_DISAGREEMENT"; readonly certaintyBand: string | null; readonly certaintyEffect: "DOWNGRADED" | "UNCHANGED"; readonly predicateRef: string; readonly observationRef: string; readonly abstention: false } {
  if (input.predicateRef.trim() === "" || input.observationRef.trim() === "") throw new TypeError("A disagreement decision requires declared predicate and observation provenance");
  if (input.fires && (input.certaintyBand === null || input.downgradedBand === null)) throw new TypeError("A firing disagreement requires a declared certainty downgrade");
  return Object.freeze({ flag: input.fires ? "DISAGREEMENT" : "NO_DISAGREEMENT", certaintyBand: input.fires ? input.downgradedBand : input.certaintyBand, certaintyEffect: input.fires ? "DOWNGRADED" : "UNCHANGED", predicateRef: input.predicateRef, observationRef: input.observationRef, abstention: false });
}

export function createUnmeasuredDisagreement(): {
  readonly kind: "NOT_MEASURED";
  readonly reason: "SINGLE_JUDGE_WALKING_SKELETON";
  readonly predicateRef: null;
  readonly observationRef: null;
  readonly certaintyEffect: "UNCHANGED";
  readonly abstention: false;
} {
  return Object.freeze({
    kind: "NOT_MEASURED",
    reason: "SINGLE_JUDGE_WALKING_SKELETON",
    predicateRef: null,
    observationRef: null,
    certaintyEffect: "UNCHANGED",
    abstention: false
  });
}
