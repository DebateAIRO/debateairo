# Assertion: scoring-specification-seam

## Statement
Scoring suspicious-output rules are expressed as a scoring-context/domain specification and observability consumes the resulting observations instead of owning scoring invariants directly.

## Acceptance
- A pure scoring-side specification seam exists, proposed as `web/lib/scoring/scoringResponseSpecification.ts` or an equivalent scoring-context path.
- The seam inspects current raw DTOs (`node_id`, `node_ids`, `scored_node_count`) at the input boundary without changing wire/API types.
- The seam emits domain observations/findings using DDD language (`argumentClaimId`, `argumentClaimIds`, claim/scoring terms).
- `web/lib/observability/suspiciousScoring.ts` is reduced to recorder/serialization responsibility over those observations.
- Existing no-false-positive suspicious scoring behavior is preserved.

## Evidence
- Unit tests cover empty successful output, missing required fields, missing artifact-chain metadata, and normal output no false-positive.
- Source inspection shows observability no longer owns the core scoring validity predicates except as recorder glue.
- No product behavior change beyond developer observability logging.
