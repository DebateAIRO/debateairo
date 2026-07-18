# Lifecycle Input Persistence Contract v1

Status: normative design contract; no product wiring in this document
Contract identifier: `lifecycle-input-persistence/v1`
Schema version: `1`

## 1. Purpose and scope

This contract defines the persisted score and evidence inputs that may be mapped into an exploration lifecycle decision. It closes the production gap demonstrated by the TS-T8 negative proof: the current orchestration seam constructs a fixed normative score with every numeric value set to `0.5` and passes `evidence=None`, so an authentic grounded abandonment decision cannot reach the lifecycle persistence writer.

This document specifies:

- a versioned, typed persistence envelope;
- authoritative score and evidence payloads;
- exact identity, provenance, freshness, and correlation requirements;
- distinct outcomes for missing, stale, malformed, mismatched, pending, unverifiable, and grounded inputs;
- deterministic legacy-row handling;
- a pure mapper boundary; and
- the fail-safe rule that unavailable or invalid inputs cannot independently abandon a path.

This document does not change product code, database schema, migrations, APIs, UI, providers, QBAF semantics, or orchestration wiring. Those are downstream work.

The key words MUST, MUST NOT, REQUIRED, SHOULD, and MAY are normative.

## 2. Domain terms

- **Decision subject**: the exact `(debate_id, node_id)` whose lifecycle state may change.
- **Decision timestamp**: an explicit UTC timestamp supplied to the mapper. It is the only clock value used for freshness evaluation.
- **Authoritative score**: a validated persisted `NodeScoringPayload` projection whose current input hash and scoring-contract identity match the decision subject.
- **Authoritative evidence**: a validated persisted evidence assessment tied to an identifiable source record and to the same decision subject.
- **Grounded component**: a component that is structurally valid, identity-matched, fresh, terminal, and traceable to authentic persisted provenance. This is a trust classification; the evidence payload's semantic `status` may still be `refuted`, `contradicted`, `retracted`, or `no_info`.
- **Legacy row**: a row written before this schema, or any row lacking one or more identities REQUIRED by this schema.
- **Current input hash**: the hash for the current normalized claim and active argument text. For the existing score domain this is the value produced under `node-scoring-input-v2`.
- **Scoring contract identity**: the immutable judge identity and semantic versions represented by `JudgeContract`, including its content hash.
- **Evidence source identity**: the persisted evidence node/source and content identity that prevents an assessment from being applied to a different citation or claim.

## 3. Normative type model

The following Python-like declarations are schema notation, not implementation code.

```python
SchemaVersion = Literal["lifecycle-input-persistence/v1"]

LifecycleInputState = Literal[
    "missing",
    "stale",
    "malformed",
    "mismatched",
    "pending",
    "unverifiable",
    "grounded",
]

Availability = Literal[
    "absent",
    "present",
    "in_progress",
    "terminal_unverifiable",
]

Freshness = Literal["unknown", "fresh", "stale"]
ComponentKind = Literal["score", "evidence"]

ClaimType = Literal[
    "empirical",
    "causal",
    "normative",
    "definitional",
    "prediction",
    "comparative",
    "mixed",
    "unknown",
]

EvidenceStatus = Literal[
    "grounded",
    "missing",
    "unavailable",
    "refuted",
    "contradicted",
    "retracted",
    "no_info",
]

EntailmentLabel = Literal["SUPPORTS", "REFUTES", "NOINFO"]

@dataclass(frozen=True)
class ScoringContractIdentity:
    judge_id: NonEmptyStr
    judge_version: NonEmptyStr
    role: NonEmptyStr
    rubric_version: NonEmptyStr
    prompt_version: NonEmptyStr
    output_schema_version: NonEmptyStr
    reducer_version: NonEmptyStr
    contract_hash: Sha256Hex

@dataclass(frozen=True)
class RunIdentity:
    run_id: NonEmptyStr | None
    sequence: PositiveInt | None
    # At least one is required. If both are present, both MUST identify the
    # same persisted run.

@dataclass(frozen=True)
class PersistedProvenance:
    source_kind: Literal[
        "node_scoring_result",
        "judge_output_artifact",
        "scoring_analyzer_run",
        "evidence_verification_run",
    ]
    source_record_id: NonEmptyStr
    run: RunIdentity
    producer: NonEmptyStr
    recorded_at: AwareUtcDatetime
    checked_at: AwareUtcDatetime | None

@dataclass(frozen=True)
class EvidenceSourceIdentity:
    evidence_node_id: NonEmptyStr
    claim_node_id: NonEmptyStr
    generation_id: NonEmptyStr
    reference: NonEmptyStr
    content_sha256: Sha256Hex
    evidence_kind: NonEmptyStr

@dataclass(frozen=True)
class ScoreValues:
    strength: UnitInterval
    uncertainty: UnitInterval
    impact: UnitInterval
    evidence_quality: UnitInterval
    logical_validity: UnitInterval
    assumption_risk: UnitInterval
    counter_resilience: UnitInterval

@dataclass(frozen=True)
class AuthoritativeScore:
    node_id: NonEmptyStr
    claim_type: ClaimType
    values: ScoreValues
    holes: tuple[NonEmptyStr, ...]
    fatal_flags: tuple[NonEmptyStr, ...]
    recommended_actions: tuple[NonEmptyStr, ...]
    final_score_source: Literal["deterministic_reducer"]
    reducer_version: NonEmptyStr
    rubric_version: NonEmptyStr

@dataclass(frozen=True)
class AuthoritativeEvidence:
    source: EvidenceSourceIdentity
    status: EvidenceStatus
    base_score: UnitInterval
    uncertainty: UnitInterval
    entailment: EntailmentLabel
    caveats: tuple[NonEmptyStr, ...]
    evaluator_id: NonEmptyStr
    evaluator_version: NonEmptyStr

@dataclass(frozen=True)
class PersistedScoreInputV1:
    schema_version: SchemaVersion
    debate_id: NonEmptyStr
    node_id: NonEmptyStr
    input_hash: Sha256Hex
    scoring_contract: ScoringContractIdentity
    availability: Availability
    observed_at: AwareUtcDatetime | None
    provenance: PersistedProvenance | None
    value: AuthoritativeScore | None
    unavailability_reason: NonEmptyStr | None

@dataclass(frozen=True)
class PersistedEvidenceInputV1:
    schema_version: SchemaVersion
    debate_id: NonEmptyStr
    node_id: NonEmptyStr
    source_identity: EvidenceSourceIdentity | None
    availability: Availability
    observed_at: AwareUtcDatetime | None
    provenance: PersistedProvenance | None
    value: AuthoritativeEvidence | None
    unavailability_reason: NonEmptyStr | None

@dataclass(frozen=True)
class ExpectedLifecycleCorrelation:
    schema_version: SchemaVersion
    debate_id: NonEmptyStr
    node_id: NonEmptyStr
    current_score_input_hash: Sha256Hex
    active_scoring_contract: ScoringContractIdentity
    expected_evidence_source: EvidenceSourceIdentity | None
    decision_timestamp: AwareUtcDatetime
    score_max_age_seconds: PositiveInt
    evidence_max_age_seconds: PositiveInt

@dataclass(frozen=True)
class ComponentResolution:
    component: ComponentKind
    state: LifecycleInputState
    availability: Availability
    freshness: Freshness
    reason_code: NonEmptyStr
    provenance: PersistedProvenance | None

@dataclass(frozen=True)
class GroundedLifecycleInputs:
    schema_version: SchemaVersion
    state: Literal["grounded"]
    correlation: ExpectedLifecycleCorrelation
    score_resolution: ComponentResolution  # state == grounded
    evidence_resolution: ComponentResolution  # state == grounded
    score: AuthoritativeScore
    evidence: AuthoritativeEvidence
    decision_eligibility: Literal["eligible"]

@dataclass(frozen=True)
class UnavailableLifecycleInputs:
    schema_version: SchemaVersion
    state: Literal[
        "missing",
        "stale",
        "malformed",
        "mismatched",
        "pending",
        "unverifiable",
    ]
    correlation: ExpectedLifecycleCorrelation
    score_resolution: ComponentResolution
    evidence_resolution: ComponentResolution
    reason_codes: tuple[NonEmptyStr, ...]
    score: None
    evidence: None
    decision_eligibility: Literal["blocked"]
```

`NonEmptyStr` rejects empty and whitespace-only strings. `PositiveInt` rejects booleans, zero, and negative values. `UnitInterval` is a finite real number in `[0.0, 1.0]`; booleans, NaN, and infinities are invalid. `Sha256Hex` is exactly 64 lowercase hexadecimal characters. `AwareUtcDatetime` is an RFC 3339 timestamp with an explicit UTC offset normalized to `Z`.

Unknown fields MUST be rejected for the v1 persistence envelope and identity objects. An authoritative score payload MAY retain documented forward-compatible public scoring fields, but they MUST NOT affect the v1 mapper unless a later schema version names them.

## 4. Required-field and nullability rules

### 4.1 Terminal grounded component

A component may resolve to `grounded` only when all of these are non-null and valid:

- `schema_version`;
- `debate_id` and `node_id`;
- `availability == "present"`;
- `observed_at`;
- `provenance` with a valid `source_record_id`, producer, timestamp, and run identity;
- the component's complete value; and
- every component-specific identity.

For a grounded score, `input_hash` and every `scoring_contract` field are REQUIRED. For grounded evidence, `source_identity` is REQUIRED and MUST equal `value.source`.

### 4.2 Non-grounded component

A non-grounded component MUST carry an explicit `unavailability_reason` or mapper `reason_code`. It MUST NOT carry a partially populated authoritative value. `value` is either complete and valid or null.

Permitted envelope shapes are:

| Component state | Availability | Value | Provenance | Observed time |
| --- | --- | --- | --- | --- |
| `missing` | `absent` | null | null | null |
| `pending` | `in_progress` | null | optional run/job provenance | optional |
| `unverifiable` | `terminal_unverifiable` | null | required when a terminal attempt row exists | optional |
| `malformed` | derived from candidate | withheld | optional | optional |
| `mismatched` | `present` or `terminal_unverifiable` | withheld | required when parseable | required when parseable |
| `stale` | `present` | withheld | required | required |
| `grounded` | `present` | complete | required | required |

`withheld` means the mapper MUST return `None` for the public lifecycle value even if raw candidate fields were present. Invalid values must not leak into policy input.

## 5. Identity and correlation invariants

A component can be grounded only if all applicable comparisons are exact.

### 5.1 Debate and node

1. The score and evidence envelope `debate_id` MUST equal `ExpectedLifecycleCorrelation.debate_id`.
2. Their `node_id` MUST equal the expected `node_id`.
3. `AuthoritativeScore.node_id` MUST equal both envelope and expected node IDs.
4. `EvidenceSourceIdentity.claim_node_id` MUST equal the expected node ID.
5. The resolver outside the pure mapper MUST establish that `evidence_node_id` belongs to the same debate and is a source for the decision subject. The mapper receives those resolved identities and compares them; it does not query the database.

A mismatch in any of these fields resolves that component to `mismatched`; it is not treated as missing.

### 5.2 Scoring contract and score input

A grounded score requires exact equality for:

- `input_hash == current_score_input_hash`;
- `contract_hash == active_scoring_contract.contract_hash`; and
- every readable contract field: judge ID/version, role, rubric version, prompt version, output schema version, and reducer version.

A matching hash with conflicting readable fields is `mismatched`. A matching readable tuple with a conflicting hash is also `mismatched`. A null contract identity is never a match.

`AuthoritativeScore.reducer_version` and `rubric_version` MUST equal the corresponding contract versions. `final_score_source` MUST be `deterministic_reducer`.

### 5.3 Evidence source

A grounded evidence component requires an exact `EvidenceSourceIdentity` match against the expected persisted source. In particular, the content hash prevents a verdict for an older or edited citation from being reused.

If `ExpectedLifecycleCorrelation.expected_evidence_source` is null, the evidence component resolves to `missing`; the mapper MUST NOT invent a source identity. If a source is expected but the candidate references another evidence node, generation, reference, claim, content hash, or evidence kind, the component is `mismatched`.

An extracted evidence node or citation is not grounded merely because text exists. A grounded evidence value requires a terminal persisted assessment with authentic provenance.

### 5.4 Run and sequence

1. Every grounded component MUST identify its producing run by `run_id`, positive `sequence`, or both.
2. When both are present, they MUST refer to the same persisted run. Conflict is `mismatched`.
3. A run sequence is authoritative over wall-clock ordering. Random UUIDs and timestamps MUST NOT be used to break a tie between conflicting candidates.
4. Two candidates with the same component identity and same run sequence but different payloads are `mismatched`; neither is selected.
5. A newer correlated pending run supersedes an older terminal result for lifecycle use. The component resolves to `pending`, not to the older grounded value.
6. A newer terminal-unverifiable run supersedes an older grounded result. The component resolves to `unverifiable`.
7. A result for a different input hash, contract, evidence source, debate, or node never supersedes the expected identity; it is a mismatched candidate.

### 5.5 Decision timestamp

The decision timestamp MUST be supplied by the caller and persisted with the lifecycle decision request or record downstream. It MUST NOT be obtained from `now()`, system time, or database time inside the mapper.

A candidate with `observed_at` after the decision timestamp is `mismatched` with reason `artifact_after_decision_timestamp`.

## 6. Freshness

Freshness is calculated independently for score and evidence using the explicit decision timestamp and the corresponding positive maximum age.

- Age equal to the maximum age is `fresh`.
- Age greater than the maximum age is `stale`.
- A missing or unparsable observed timestamp cannot be grounded. An unparsable timestamp is `malformed`; a legacy null timestamp is `unverifiable`.
- Freshness does not repair an identity mismatch. Identity validation happens before age is trusted.
- A stale component's persisted payload MAY remain available for historical display, but MUST be withheld from lifecycle policy input.
- An older fresh row MUST NOT be used when a newer run for the same identity is pending or terminal-unverifiable.

Freshness policy values are inputs to the mapper. Changing a maximum age changes eligibility, not persisted source history.

## 7. State semantics and deterministic validation

Each component is validated independently. All component states and reason codes are retained. The aggregate result is `grounded` only when both components are grounded.

### 7.1 State meanings

| State | Exact meaning | Lifecycle value |
| --- | --- | --- |
| `missing` | No persisted candidate exists for the required component/source, and no correlated run is pending. | none |
| `pending` | A correlated current run exists but has not produced a terminal authoritative value, or a newer correlated pending run supersedes an older result. | none |
| `malformed` | A candidate exists but fails schema, type, enum, range, timestamp, hash-shape, or required-field validation. | none |
| `mismatched` | A structurally parseable candidate belongs to another debate, node, input hash, scoring contract, evidence source, run pairing, schema contract, or temporal decision context. | none |
| `stale` | A structurally valid, identity-matched terminal candidate exceeds its component freshness limit. | none |
| `unverifiable` | A terminal or legacy candidate cannot establish authoritative provenance or semantics, including provider failure, timeout, parse failure, no independent judge, missing run identity, or missing legacy provenance. | none |
| `grounded` | A terminal candidate is structurally valid, exactly correlated, fresh, authentic, and complete. | complete authoritative value |

`pending` and `unverifiable` are distinct: pending work may still complete; unverifiable work terminated without an authoritative result.

`missing` and `unverifiable` are distinct: missing means there is no candidate; unverifiable means a candidate or attempt exists but cannot support the claim.

`malformed` and `mismatched` are distinct: malformed cannot be interpreted under its declared schema; mismatched is interpretable but belongs to a different identity or contract.

### 7.2 Validation order per candidate

The mapper MUST apply this order:

1. Detect absence or a correlated explicit in-progress marker (`missing` or `pending`).
2. Parse the envelope and declared schema (`malformed` on structural failure).
3. Validate exact schema version and all correlation identities (`mismatched` on conflict).
4. Validate terminal authenticity and provenance (`unverifiable` when authenticity cannot be established).
5. Evaluate freshness (`stale` when expired).
6. Validate the complete authoritative value and its internal identity (`malformed` or `mismatched` as applicable).
7. Return `grounded` only after every prior gate passes.

A candidate that claims `availability="present"` while omitting its value or provenance is `malformed`, not `missing`.

### 7.3 Aggregate state

When either component is not grounded, `UnavailableLifecycleInputs` retains both component resolutions and all reason codes. Its single aggregate `state` is selected by this fixed precedence:

```text
malformed > mismatched > stale > unverifiable > pending > missing
```

The precedence exists only to give callers a stable primary state. It MUST NOT discard the lower-precedence component result.

## 8. Authoritative score rules

The score projection maps only persisted, validated `NodeScoringPayload` fields already consumed by `ScoreSignal`:

- node ID and claim type;
- strength, uncertainty, impact, evidence quality, logical validity, assumption risk, and counter resilience;
- scoring holes;
- fatal flags; and
- recommended actions.

Every numeric score is REQUIRED and validated independently. Missing values MUST NOT be filled with `0.5`, `0`, averages, a previous contract's value, or any other neutral placeholder.

A public historical score from a legacy or mismatched scoring contract may be displayed as historical. It MUST NOT be re-reduced through the active reducer and MUST NOT become an authoritative lifecycle score.

The current orchestration helper that creates a normative all-`0.5` score without persisted scoring provenance is non-conforming input under this contract. It has no schema version, input hash, contract identity, source record, run identity, or authoritative evidence and therefore cannot map to `grounded`.

## 9. Authoritative evidence rules

A grounded evidence component requires both:

1. an authentic source identity tied to persisted source text; and
2. a terminal persisted evaluation with run provenance.

Evidence text extracted from a generation is unresolved until evaluated. Extraction MUST NOT fabricate, rewrite, summarize, or silently classify a source as verified. A provider timeout, provider error, parse failure, disabled verification path, unknown lineage, or lack of an independent judge MUST NOT produce supported or grounded evidence.

The evidence component's lifecycle resolution (`grounded`) states that the input is trustworthy. The evidence payload's semantic `status` remains separate:

- only `EvidenceStatus == "grounded"` can satisfy the evidence precondition for abandonment;
- `refuted`, `contradicted`, and `retracted` are authoritative adverse evidence and may support challenge behavior, never abandonment by themselves;
- `missing`, `unavailable`, and `no_info` remain unresolved for abandonment even if their provenance record is authentic.

No empty citation, fabricated reference, generated source hash, synthetic evidence node, or default `EvidenceSignal` may be introduced to satisfy the schema.

## 10. Legacy rows and schema evolution

Legacy data is preserved for audit and historical display. It is never silently upgraded in memory.

| Legacy condition | v1 lifecycle classification | Required reason |
| --- | --- | --- |
| No `schema_version` | `unverifiable` | `legacy_schema_version_missing` |
| Well-formed but unsupported schema version | `mismatched` | `unsupported_schema_version` |
| Null/missing scoring contract identity | `mismatched` | `legacy_scoring_contract_identity_missing` |
| Null/missing current input hash | `mismatched` | `legacy_score_input_hash_missing` |
| No run ID and no run sequence | `unverifiable` | `legacy_run_identity_missing` |
| No authoritative observed timestamp | `unverifiable` | `legacy_observed_at_missing` |
| Evidence assessment lacks source/content identity | `unverifiable` | `legacy_evidence_source_identity_missing` |
| Old stored public score with valid historical payload | `unverifiable` for lifecycle; MAY be historical in API/UI | `historical_score_not_lifecycle_authoritative` |
| Old all-`0.5` constructed signal with no persisted source | `unverifiable` | `neutral_placeholder_not_authoritative` |

A future migration MAY create v1 rows only from authentic persisted facts that supply every required identity. It MUST NOT guess a contract hash, source identity, run sequence, timestamp, score, evidence status, or grounded value. If a required fact cannot be proven, the row remains legacy/unverifiable.

Unknown future major versions fail closed as `mismatched`. A reader must explicitly implement that version before using its values.

## 11. Persistence and candidate-selection rules

The persistence layer implemented downstream MUST obey these rules:

1. Lifecycle-input snapshots are immutable by full identity: schema version, debate ID, node ID, component kind, scoring contract or evidence source, input hash where applicable, and run identity.
2. Repeating the same full identity and byte-equivalent canonical payload is idempotent.
3. Repeating the same full identity with different content is a conflict and resolves to `mismatched`; last-write-wins is forbidden.
4. A new contract, input hash, evidence content hash, or run creates a new snapshot. It does not overwrite historical meaning.
5. Candidate selection uses the highest valid run sequence for the exact expected identity. If sequence is unavailable, an exact run ID may identify one candidate, but ambiguous multiple candidates are `unverifiable` rather than timestamp-sorted.
6. Timestamps and random record IDs are never semantic tie-breakers.
7. Pending and terminal-unverifiable records are persisted as explicit states with reason codes; they are not represented by neutral scores or empty grounded evidence.
8. The downstream lifecycle decision record MUST persist the correlation envelope, component resolutions, decision timestamp, schema version, and source/run identities used for the decision.

Database query mechanics are outside the pure mapper. A resolver loads candidate rows and serializes them into plain JSON-like mappings. The pure mapper parses those mappings into the v1 types, classifies malformed and legacy shapes, performs deterministic candidate selection, and returns only typed resolution values. Database model or session objects never cross the boundary.

## 12. Pure mapper boundary

The intended boundary is:

```python
def map_lifecycle_inputs(
    *,
    expected: ExpectedLifecycleCorrelation,
    score_candidates: tuple[Mapping[str, JsonValue], ...],
    evidence_candidates: tuple[Mapping[str, JsonValue], ...],
) -> GroundedLifecycleInputs | UnavailableLifecycleInputs:
    ...
```

`PersistedScoreInputV1` and `PersistedEvidenceInputV1` are the successfully parsed candidate shapes. Accepting raw mappings at the public pure boundary is REQUIRED so malformed, unsupported, and legacy rows can be classified rather than raising before a lifecycle resolution exists.

The mapper MUST be deterministic and referentially transparent. It may perform only:

- schema and type validation;
- deterministic candidate selection;
- exact identity comparison;
- freshness arithmetic against the supplied decision timestamp;
- state/reason derivation; and
- projection into authoritative score/evidence values.

The mapper MUST NOT perform:

- model, judge, LLM, CLI, or provider calls;
- network access;
- database or filesystem I/O;
- environment/config reads;
- system-clock reads;
- randomness or UUID generation;
- logging with raw provider/source payloads; or
- persistence or lifecycle mutation.

A loader/resolver outside the mapper owns database access and supplies expected current identities. A lifecycle service outside the mapper owns policy invocation and persistence. Neither boundary may reinterpret a non-grounded mapper result as grounded.

## 13. Fail-safe lifecycle invariant

The following invariant is absolute:

```text
Unavailable or invalid lifecycle input cannot independently cause abandonment.
```

Operationally:

1. `ExpansionAction == "abandon"` MAY be considered only from `GroundedLifecycleInputs`.
2. Even for `GroundedLifecycleInputs`, abandonment additionally requires `evidence.status == "grounded"` and the existing exploration policy's low-strength, low-impact, low-uncertainty, no-blocker conditions.
3. `UnavailableLifecycleInputs` has `decision_eligibility="blocked"` and both authoritative values set to null. It MUST NOT be converted into `ScoreSignal`, `EvidenceSignal`, or a synthetic decision using neutral `0.5` values.
4. Missing, stale, malformed, mismatched, pending, or unverifiable input MUST preserve the current active path state. A caller MAY record a non-abandon diagnostic, queue/await scoring, seek evidence, or continue under a separately defined rule, but this input alone cannot set `path_status="abandoned"`, `stopping_status="abandon"`, or an abandonment reason.
5. Invalid new input does not silently reopen or rewrite an already abandoned path. Existing lifecycle state is preserved until an independently valid transition contract applies.
6. An older grounded result MUST NOT be used to bypass a newer pending, unverifiable, mismatched, or stale current identity.

## 14. Required executable test derivations

A downstream implementation is not conforming unless tests can derive at least the following assertions directly from this document.

### 14.1 Schema and version

- Accept exactly `lifecycle-input-persistence/v1`.
- Reject a missing schema version as legacy/unverifiable.
- Reject a malformed schema value as malformed.
- Reject a well-formed unsupported version as mismatched.
- Reject unknown envelope/identity fields under v1.
- Reject missing required grounded fields and invalid nullability combinations.

### 14.2 Types and ranges

- Reject empty IDs, booleans as numbers, non-finite values, and scores outside `[0, 1]`.
- Reject invalid enums, non-UTC/unaware timestamps, invalid SHA-256 strings, and non-positive run sequences/max ages.
- Require at least one run ID or sequence and reject conflicting run pairs.

### 14.3 Correlation and provenance

- Ground only exact debate and node matches.
- Ground only the current score input hash and full active scoring contract.
- Reject null/legacy contract hashes as mismatched.
- Ground evidence only for the exact claim node, evidence node, generation, reference, content hash, and evidence kind.
- Reject duplicate run sequence identities with conflicting content.
- Prefer explicit newer pending/unverifiable state over an older grounded result.

### 14.4 Freshness

- Treat age equal to the maximum as fresh.
- Treat age above the maximum as stale.
- Treat an artifact timestamp after the decision timestamp as mismatched.
- Treat unparsable time as malformed and legacy null time as unverifiable.
- Evaluate score and evidence freshness independently.

### 14.5 State distinctions

- Produce distinct component results for missing, stale, malformed, mismatched, pending, unverifiable, and grounded candidates.
- Preserve both component results and all reasons in the aggregate unavailable result.
- Apply the fixed aggregate precedence without discarding the other state.
- Distinguish an absent candidate from a failed terminal verification attempt.

### 14.6 No fabricated inputs and no false abandonment

- Never emit a `0.5` placeholder for any missing score field.
- Never emit grounded evidence from empty text, an extracted-unresolved source, provider failure, timeout, parse failure, disabled verification, or no independent judge.
- Return null authoritative values for every non-grounded aggregate result.
- Prove that every non-grounded state leaves an active path active and cannot persist `abandon`/`abandoned` by itself.
- Prove that only a fully grounded aggregate with semantic evidence status `grounded` can reach the policy's abandonment eligibility gate.

### 14.7 Legacy behavior

- Classify every legacy condition in section 10 with its exact reason code.
- Preserve legacy payloads for historical display without converting them into lifecycle inputs.
- Prove that the current constructed all-`0.5`, `evidence=None` path is non-authoritative and cannot abandon.

### 14.8 Purity

- Run the mapper repeatedly with identical values and assert identical output.
- Test the mapper with no database/session/provider objects.
- Enforce by dependency inspection that the mapper imports no provider, network, database, filesystem, clock, or randomness module.

## 15. Reference alignment

This contract deliberately aligns with current domain facts while defining a new boundary:

- `ScoreSignal.from_scoring_payload` identifies the score projection used by exploration policy.
- `NodeScoringResult`, `JudgeOutputArtifact`, `AnalyzerRun.seq`, score input hashes, and `JudgeContract.contract_hash` provide parts of the required score identity and provenance.
- Existing score hydration already treats contract-matched artifacts differently from historical rows; historical display does not make a row lifecycle-authoritative.
- Evidence extraction explicitly produces unresolved source text, not verified evidence.
- Evidence verification explicitly returns pending or unverifiable on disabled, failed, timed-out, unparseable, or same-lineage paths instead of fabricating support.
- `ExplorationPolicy` already blocks abandonment when evidence is absent/unresolved and requires semantic evidence status `grounded`.
- The current orchestration fixed-score helper is the negative example this contract replaces downstream; it is not an allowed compatibility fallback.
