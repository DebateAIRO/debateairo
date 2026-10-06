import { z } from "zod";
import { ABSTENTION_KINDS, CLAIM_TYPES, isRunLevelSpendStop, type AbstentionKind, type ClaimType } from "@debateai/kernel";
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
  type: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]*$/u),
  severity: z.number().min(0).max(1), description: z.string().trim().min(1)
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

/**
 * DL4-F1: a schema failure names the issue CODES and PATHS only. zod's own message embeds
 * the received values and the unrecognised keys - the model's text - and that message used
 * to travel into ledger parse_error columns, Hatchet failure payloads and stderr, outside
 * the AEAD boundary. Paths are the schema's names (and array indices); nothing the model
 * wrote is copied. Bounded so a pathological issue list cannot grow the message either.
 */
const MAX_SCHEMA_FAILURE_MESSAGE_CHARS = 512;

function schemaFailureMessage(error: z.ZodError): string {
  const rendered = error.issues
    .map((issue) => `${issue.code}@${issue.path.length === 0 ? "$" : issue.path.map(String).join(".")}`)
    .join(",");
  return rendered.length > MAX_SCHEMA_FAILURE_MESSAGE_CHARS
    ? `${rendered.slice(0, MAX_SCHEMA_FAILURE_MESSAGE_CHARS - 1)}…`
    : rendered;
}

function schemaResult<T>(decoded: unknown, strategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED", schema: z.ZodType<T>): ParseStructuredArtifactResult<T> {
  const parsed = schema.safeParse(decoded);
  return parsed.success
    ? Object.freeze({ kind: "PARSED", strategy, value: parsed.data })
    : Object.freeze({ kind: "SCHEMA_FAILURE", message: schemaFailureMessage(parsed.error) });
}

const FENCE = "```";

/**
 * CI-1b (CodeQL js/polynomial-redos, PR #8): the ONE_FENCE strategy used to be
 * `/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i`. Its adjacent `\s*`, `\n?`
 * and lazy body can split one run of blanks in quadratically many ways, and
 * `content` is model text — "```" and 100 000 newlines took about 4.6 s. This
 * returns the same capture in one linear pass, clause for clause:
 * - `^\s*` and `\s*$`: `trim()` strips exactly the `\s` set;
 * - the two fences: the trimmed text starts and ends with "```" and is at least
 *   six characters long, so no backtick belongs to both fences;
 * - `(?:json)?`: greedy, so a case-insensitive "json" right after the opening
 *   fence is always taken — the closing fence can never begin inside it;
 * - `\s*\n?`: greedy, so every blank after the tag goes (`trimStart()`);
 * - the lazy body and `\n?`: the body stops before one newline that sits
 *   against the closing fence, when the tag's blanks did not already take it.
 */
function oneFenceBody(content: string): string | null {
  const text = content.trim();
  if (text.length < 2 * FENCE.length || !text.startsWith(FENCE) || !text.endsWith(FENCE)) return null;
  const tagEnd = /^json$/i.test(text.slice(FENCE.length, FENCE.length + 4))
    ? FENCE.length + 4
    : FENCE.length;
  const body = text.slice(tagEnd, text.length - FENCE.length).trimStart();
  return body.endsWith("\n") ? body.slice(0, -1) : body;
}

export function parseStructuredArtifact<T>(content: string, schema: z.ZodType<T>): ParseStructuredArtifactResult<T> {
  try { return schemaResult(JSON.parse(content), "RAW", schema); } catch { /* advance only on parse failure */ }
  const fenced = oneFenceBody(content);
  if (fenced !== null) {
    try { return schemaResult(JSON.parse(fenced), "ONE_FENCE", schema); } catch { /* next strategy */ }
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

/**
 * F-DIAG-S04-PANEL-NOTE — the bounded alphabet a panel note's `reason` is drawn from.
 *
 * The note is not a debug string. `apps/runner/src/index.ts:2695-2699` copies
 * `reason` verbatim into `disagreement.panel.notes[]`, which is persisted and
 * read back off a database row (`tests/integration/database.test.ts:3845`). The
 * previous form forwarded `error.message` from the member's catch, so any text a
 * provider, a driver or a parser put in a message reached storage — the same
 * class as F-RISK-IDENTITY-LOG.
 *
 * What is bounded here is the OUTPUT ALPHABET, following the landed pattern in
 * `apps/api/src/risk-signal-identity.ts`: every string this can return is either
 * a member of the closed `PANEL_MEMBER_FAILURE_KINDS` list below or a literal
 * declared right here. Nothing is derived from the caught value — no substring,
 * no regex capture, no case transform. The caught value is only ever a LOOKUP
 * KEY, and a key that misses becomes the fallback.
 *
 * Why the map is this small. `runJudgePanel` takes a caller-supplied
 * `judge: () => Promise<...>`, so the type of what the catch receives is open
 * (`unknown`), and the router's shape rule for an open key set is to redact
 * wholesale rather than to enumerate. The one TYPED producer on the path is
 * `PanelMemberFailure` (`packages/judgement/src/index.ts:499,505,510,513,514`),
 * and its kind becomes the reason — but only after a RUNTIME membership check
 * against a vocabulary this module OWNS.
 * `instanceof` establishes ancestry, not membership: `PanelMemberFailureKind` is
 * a compile-time union and `readonly` is erased, so a subclass or a mutated
 * instance can carry any string in `failureKind` (codex r1 F1).
 * And the membership store must not be the EXPORTED array: `PANEL_MEMBER_FAILURE_KINDS`
 * is exported and never frozen — `as const` is a type-level assertion and
 * `readonly string[]` aliases rather than copies — so checking through it closes the
 * alphabet over that array's CURRENT CONTENTS, and a caller who pushes into the export
 * widens the reason alphabet (codex r1b F1 remainder). `CANONICAL_MEMBER_FAILURE_KINDS`
 * below is this helper's own copy, built from its own object literal, unreachable from
 * any exported binding. The eight public spellings (B9 added SPEND_REFUSED) are unchanged, and drift between the
 * two is a COMPILE error rather than a silent divergence: the literal carries
 * `satisfies Record<PanelMemberFailureKind, 0>`, which errors in BOTH directions —
 * TS2741 when a kind is missing, TS2353 when one is not in the union. (Measured on
 * this repo's tsc 7.0.2; a plain `as` assertion silences the missing-key error and
 * would NOT have given this guarantee.) The two codes below are the only other constants with a producer that
 * can reach this catch un-converted: `ProviderCallFailedError` and
 * `ProviderContentUnacceptedError` (`packages/providers/src/index.ts:53,69`),
 * both `TypedDomainError`s whose `code` is a fixed literal. `assess()` converts
 * both today, so they are listed for a caller that wires a judge closure
 * straight to `provider.call` — enumerating a subset of a typed vocabulary is
 * how a re-routed rejection silently degrades to the fallback.
 */
const UNCLASSIFIED_MEMBER_ERROR = "UNCLASSIFIED_MEMBER_ERROR";

/**
 * This helper's PRIVATE membership storage. Exhaustive against the declared union in
 * both directions at compile time; independent of the exported array at runtime.
 */
const CANONICAL_MEMBER_FAILURE_KINDS: ReadonlySet<string> = new Set(Object.keys({
  CONSTRUCTION_ERROR: 0,
  TIMEOUT: 0,
  PROVIDER_ERROR: 0,
  PARSE_FAILURE: 0,
  SCHEMA_FAILURE: 0,
  UNCONFIGURED_FAMILY: 0,
  PRODUCER_GRADING_FORBIDDEN: 0,
  SPEND_REFUSED: 0
} satisfies Record<PanelMemberFailureKind, 0>));

const MEMBER_FAILURE_CODES: ReadonlyMap<string, string> = new Map([
  ["PROVIDER_CALL_FAILED", "PROVIDER_CALL_FAILED"],
  ["PROVIDER_CONTENT_UNACCEPTED", "PROVIDER_CONTENT_UNACCEPTED"]
]);

function boundedMemberFailureReason(error: unknown): string {
  if (error instanceof PanelMemberFailure) {
    // ONE read. A getter or a mutated property that answers differently on a
    // second read would defeat a check performed on a different read, so the
    // value that is validated is the value that is returned — never a re-read.
    const failureKind: unknown = error.failureKind;
    return typeof failureKind === "string" && CANONICAL_MEMBER_FAILURE_KINDS.has(failureKind)
      ? failureKind
      : UNCLASSIFIED_MEMBER_ERROR;
  }
  if (!(error instanceof Error)) return UNCLASSIFIED_MEMBER_ERROR;
  // Same discipline: `code` is read once, and the value RETURNED is this
  // module's own map literal, never the string that was read.
  const code: unknown = (error as { readonly code?: unknown }).code;
  if (typeof code !== "string") return UNCLASSIFIED_MEMBER_ERROR;
  return MEMBER_FAILURE_CODES.get(code) ?? UNCLASSIFIED_MEMBER_ERROR;
}

/**
 * B9 (budget spec §2.9) — the codes of a seat left out for money, and the
 * reason its note carries. Like MEMBER_FAILURE_CODES above, the value RETURNED
 * is this module's own literal, never the string that was read.
 */
const LEFT_OUT_SEAT_SPEND_CODES: ReadonlyMap<string, string> = new Map([
  ["RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_MONEY_REACHED"],
  ["DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"],
  ["PERSON_ALLOWANCE_REACHED", "PERSON_ALLOWANCE_REACHED"]
]);

/**
 * Engine money rule (spec §14.4.1), Task M2 — what the panel does when a
 * run-level spend stop arrives. Either way no further member is asked: every
 * further member is another call for a run that has just been told it cannot
 * make one.
 *
 *  · "RETHROW" (the default): the stop leaves the panel exactly as it arrived,
 *    and whatever the panel had gathered is dropped with it — the caller's
 *    phase discards the node anyway.
 *  · "RETURN_HEARD": the panel ends where it stood and RETURNS what it had
 *    gathered — the author, every member voice already heard (paid for) and
 *    every note — with the stop as `stoppedBy`, so the caller can keep those
 *    voices. The runner asks for it on the first root's panel only.
 *
 * B9 (budget spec §2.9, the Panel seats row): `leaveOutMoneyRefusedSeats`
 * changes this for MONEY alone — the run's ceiling for arguing, the site's day
 * and a person's window. Such a seat is noted (MEMBER_FAILED, SPEND_REFUSED,
 * the stop's code as the reason) and the next member is asked, exactly as a
 * failed member is. The attempt ceiling and a vendor with no usage still follow
 * the rule above. The runner asks for it only with cheaper models on.
 */
export type PanelRunLevelSpendStopRule = "RETHROW" | "RETURN_HEARD";

/**
 * One panel note. `MEMBER_FAILED` is a member that fell over; the two FX-HR-H6
 * kinds are the author's own maker or route: `PRODUCER_GRADING_FORBIDDEN` is
 * the expected skip BEFORE any call, and `PRODUCER_GRADING_REFUSED_AFTER_CALL`
 * is a seat whose answer came back from the author (a backup) — a billed call
 * and a lost voice — naming the seat (`memberRole`) and who answered.
 */
type PanelNote =
  | { readonly memberRole: string; readonly contractHash: string; readonly kind: "MEMBER_FAILED" | "PRODUCER_GRADING_FORBIDDEN"; readonly failureKind: PanelMemberFailureKind; readonly reason: string }
  | { readonly memberRole: string; readonly answeringMemberRole: string; readonly contractHash: string; readonly kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL"; readonly failureKind: "PRODUCER_GRADING_FORBIDDEN"; readonly reason: string };

export async function runJudgePanel(input: {
  readonly artifactProducerRef: string;
  readonly primary: { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string };
  readonly members: readonly {
    readonly memberRole: string;
    readonly actorRef: string;
    readonly contractHash: string;
    /**
     * Model scorecard A15 (R5): a member may be answered by its seat's backup,
     * so its judge reports WHO answered — the route (`actorRef`) and its maker
     * (`memberRole`). Absent, the member's own values stand. The family
     * discount keys on this route, never on a maker name looked up in a list.
     */
    readonly judge: () => Promise<{
      readonly judgementRef: string;
      readonly assessment: JudgeAssessment;
      readonly actorRef?: string;
      readonly memberRole?: string;
    }>;
  }[];
  readonly onRunLevelSpendStop?: PanelRunLevelSpendStopRule;
  readonly leaveOutMoneyRefusedSeats?: boolean;
}): Promise<{
  readonly judgements: readonly { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string; readonly actorRef: string; readonly contractHash: string | null }[];
  readonly notes: readonly PanelNote[];
  readonly stoppedBy?: unknown;
}> {
  let stoppedBy: { readonly error: unknown } | null = null;
  const judgements: { judgementRef: string; assessment: JudgeAssessment; memberRole: string; actorRef: string; contractHash: string | null }[] = [
    { ...input.primary, actorRef: input.artifactProducerRef, contractHash: null }
  ];
  const notes: PanelNote[] = [];
  // FX-HR-H6 is "no MAKER grades its own artifact" — the law the database
  // enforces by maker (migrations 0019/0023/0026) and the evaluator checks by
  // maker. `memberRole` is the maker here, so the author's maker is
  // `input.primary.memberRole`; the author's route is `artifactProducerRef`.
  // A seat is refused on EITHER: the author's maker on another route (a second
  // endpoint a deployment configured, or a picker's runner-up of that maker)
  // is still the author's maker, and the author's route is the author.
  const isTheAuthor = (actorRef: string, memberRole: string): boolean =>
    actorRef === input.artifactProducerRef || memberRole === input.primary.memberRole;
  for (const member of input.members) {
    if (isTheAuthor(member.actorRef, member.memberRole)) {
      notes.push({ memberRole: member.memberRole, contractHash: member.contractHash, kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6" });
      continue;
    }
    try {
      const judged = await member.judge();
      const actorRef = judged.actorRef ?? member.actorRef;
      const memberRole = judged.memberRole ?? member.memberRole;
      // FX-HR-H6 holds for WHOEVER answered: a backup on the author's route or
      // of the author's maker is refused as the author's own seat is. It is not
      // the expected skip above — a call was made and a voice was lost — so it
      // has its own kind, naming the seat AND the maker that answered.
      if (isTheAuthor(actorRef, memberRole)) {
        notes.push({
          memberRole: member.memberRole,
          answeringMemberRole: memberRole,
          contractHash: member.contractHash,
          kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL",
          failureKind: "PRODUCER_GRADING_FORBIDDEN",
          reason: "FX-HR-H6"
        });
        continue;
      }
      judgements.push({
        judgementRef: judged.judgementRef,
        assessment: judged.assessment,
        memberRole,
        actorRef,
        contractHash: member.contractHash
      });
    } catch (error) {
      // V-28: a RUN-LEVEL spend stop is not this member's failure, it is the
      // run's, and noting it would carry the panel on to the next member — one
      // more billed call for a run that has just been told it cannot pay. It
      // leaves untouched, keeping the code that says which control spoke.
      // Task M2: or, when the caller asks, the panel ends here and returns the
      // voices it already heard, with the stop beside them.
      if (isRunLevelSpendStop(error)) {
        // B9: with the setting, a seat refused for MONEY is left out, as a failed
        // seat is, and the panel carries on. `code` is read once; the reason is
        // this module's own literal.
        const code: unknown = (error as { readonly code?: unknown }).code;
        const leftOut = input.leaveOutMoneyRefusedSeats === true && typeof code === "string"
          ? LEFT_OUT_SEAT_SPEND_CODES.get(code)
          : undefined;
        if (leftOut !== undefined) {
          notes.push({
            memberRole: member.memberRole,
            contractHash: member.contractHash,
            kind: "MEMBER_FAILED",
            failureKind: "SPEND_REFUSED",
            reason: leftOut
          });
          continue;
        }
        if (input.onRunLevelSpendStop !== "RETURN_HEARD") throw error;
        stoppedBy = { error };
        break;
      }
      notes.push({
        memberRole: member.memberRole,
        contractHash: member.contractHash,
        kind: "MEMBER_FAILED",
        failureKind: error instanceof PanelMemberFailure ? error.failureKind : "PROVIDER_ERROR",
        reason: boundedMemberFailureReason(error)
      });
    }
  }
  return Object.freeze({
    judgements: Object.freeze(judgements.map((entry) => Object.freeze(entry))),
    notes: Object.freeze(notes.map((note) => Object.freeze(note))),
    ...(stoppedBy === null ? {} : { stoppedBy: stoppedBy.error })
  });
}

export const PANEL_MEMBER_FAILURE_KINDS = [
  "CONSTRUCTION_ERROR", "TIMEOUT", "PROVIDER_ERROR", "PARSE_FAILURE",
  "SCHEMA_FAILURE", "UNCONFIGURED_FAMILY", "PRODUCER_GRADING_FORBIDDEN",
  // B9 (budget spec §2.9): a seat the run could not pay for, left out as a
  // failed seat is. Never PROVIDER_ERROR, which would bring back V-28's
  // misattribution of a money ceiling as a transport fault.
  "SPEND_REFUSED"
] as const;
export type PanelMemberFailureKind = typeof PANEL_MEMBER_FAILURE_KINDS[number];

export class PanelMemberFailure extends Error {
  /**
   * Model scorecard A16: the provider failure this wraps travels as `cause`,
   * so a seat can tell a dead transport or a usage cap (R4: switch to the
   * runner-up) from a refused answer (never switch). The reason text the panel
   * records is unchanged: it is still read from `failureKind` alone.
   */
  constructor(
    readonly failureKind: Exclude<PanelMemberFailureKind, "PRODUCER_GRADING_FORBIDDEN" | "SPEND_REFUSED">,
    message: string,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options);
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
