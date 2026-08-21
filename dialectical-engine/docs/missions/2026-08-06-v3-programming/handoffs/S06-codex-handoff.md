# S06 · Codex handoff — evidence subsystem

Worker sessions: first pass `019fe1e3-0cd1-7c80-9b1a-22913c7ccdb1`; V-assigned rework continuation `019fe1fe-bc09-7541-9279-ad3b77871043`  
Ticket: `t_d68493d7`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (legacy DR-123 working-tree flow; no branch, commit, push, or other Git mutation)  
Comments read through: `#233 / 2026-08-08 18:42:29 codex COLLISION INVENTORY`.

## Rework round 1 correction

The first-pass handoff's claim that SQL already enforced “REJECTED cannot score” was false. Migration `0008_s06.sql` paired score/producer and bounded pipeline scores, but did not couple `admissibility = 'REJECTED'` to a null `base_score`.

This rework corrects all three blocking parts without changing the already-approved route vocabulary, ladder, dormant marks, or other DDL invariants:

- `EvidenceRepository.recordEvidenceItem` now consults `assessAdmissibility(...).scoreAllowed` and raises typed `SCORED_REJECTED_EVIDENCE_REFUSED` before score construction or persistence.
- Forward migration `0009_s06_rework.sql` adds and validates replay-safe `evidence_item_rejected_cannot_score`: `admissibility <> 'REJECTED' OR base_score IS NULL`.
- The firing tests assert the domain refusal and a raw real-PostgreSQL rejection in the same integration case. The five named R6 reasons now each fire in unit coverage, and the repository integration persists both R1 `NO_SOURCE_FOUND` and non-R1/R6 `EXACT_COMPARE_UNAVAILABLE` (`NO_SPAN_CITED`).

TDD rework evidence:

```text
RED: 33 passed / 2 failed
- recordEvidenceItem reached pool.connect instead of SCORED_REJECTED_EVIDENCE_REFUSED
- migrations/0009_s06_rework.sql did not exist

GREEN: 40/40 focused unit + architecture + replay-lint checks
Full non-DB: 154/154 GREEN
Typecheck: PASS
Lint: edgeRowsChecked=27, violations=0; source blocking=0
Build: PASS, static pages 7/7
```

## Inventory

- `packages/evidence/src/index.ts` — evidence aggregate and repository: immutable query freezing, typed amendments, categorical admissibility, provenance-cluster derivation, run-`as_of` freshness, evidence-pipeline-only base numbers, the closed citation ladder, tier-invariant shadow evaluation, probe certification, and append-only persistence seams.
- `packages/kernel/src/index.ts` — canonical access-depth, citation-outcome, eight-route, and five comparison-unavailability vocabularies.
- `migrations/0008_s06.sql` — the eight A-06 tables (`query_set`, `query_amendment`, `source_record`, `evidence_item`, `absence_row`, `probe_capture`, `instrument_certification`, `citation_route_record`), row-pair constraints, cross-row validation triggers, append-only triggers, and replay-safe indexes.
- `migrations/0009_s06_rework.sql` — replay-safe forward CHECK coupling `REJECTED` admissibility to a null `base_score`; separate because `0008` may already be in the applied-migration ledger.
- `packages/db/src/schema.ts` — Drizzle read/write carriers for every S06 table.
- `packages/battery/src/index.ts` — explicit activation-state reducer: policy-blocked rows remain `POLICY_BLOCKED`, a cache hit is `ACTIVE`, and unresolved predicates wait rather than becoming inactive.
- `tools/orphan-audit/src/index.ts`, `reports/orphan-audit.json`, `tests/architecture/scaffold.test.ts` — nine S06 attachment/owner rows plus generated FX-DEF-01/02 `NOT_SHIPPED` attestations. No hard-kill or dormant auto-activation implementation was added.
- `tests/unit/evidence.test.ts`, `tests/unit/battery.test.ts`, `tests/architecture/s06-contract.test.ts` — deterministic domain, route, shadow-mode, activation, DDL, and honesty-row coverage.
- `tests/integration/evidence-database.test.ts`, `tests/integration/graph-database.test.ts` — authored real-PostgreSQL fixtures behind the one mandatory database seam; migration-ledger coverage now includes `0008_s06.sql`.

## RED → GREEN

The first focused RED was real:

```text
pnpm exec vitest run tests/unit/evidence.test.ts tests/architecture/s06-contract.test.ts
Test Files  2 failed (2)
Tests       4 failed (4)
Causes: @debateai/evidence absent; migrations/0008_s06.sql absent; s06Surface absent
```

FX-S22-05 was then added separately and failed before its reducer existed:

```text
pnpm exec vitest run tests/unit/battery.test.ts
Test Files  1 failed (1)
Tests       1 failed | 2 passed (3)
Cause: resolveActivationState absent
```

The implementation turned the focused slice green without weakening the assertions:

```text
pnpm exec vitest run tests/unit/evidence.test.ts tests/architecture/s06-contract.test.ts tests/architecture/scaffold.test.ts
Test Files  3 passed (3)
Tests       33 passed (33)
```

## Gate and fixture evidence

| Fixture / law | Evidence |
|---|---|
| FX-HR-H5 | `createEvidenceBaseScore` accepts only `EVIDENCE_PIPELINE`; model-asserted base scores fail typed-loud. Every non-evidence-free claim type reaches the same tier-independent evidence gate. |
| FX-LG-08 / DR-009 | Admissibility is categorical: on-subject is admitted; partly relevant is visibly downranked with an explicit off-subject share; off-subject is rejected before scoring. The repository raises `SCORED_REJECTED_EVIDENCE_REFUSED`; forward migration `0009` independently rejects a non-null score on `REJECTED`. (`0008` alone did **not** enforce this.) |
| FX-PT-D3 | Stable study/dataset identity wins; otherwise domain/publisher plus producing run/model family is used; unresolved provenance remains a per-node singleton. Both polarities therefore consume the same cluster-key law. |
| FX-SRV-12 / AC-91 | A failing evidence gate still publishes the unsuppressed band and appends an `EVIDENCE_GATE` shadow row containing what would have been suppressed and its explicit unlock condition. |
| DR-083 / FX-S22-05 / AC-83 | All 13 machine rows permit zero calls; a true predicate and cache hit are `ACTIVE`; false alone is `INACTIVE`; policy rows always remain `POLICY_BLOCKED`; unknown predicates remain `WAIT`. |
| DR-084 / Q16 | Kernel and SQL admit exactly `NO_SOURCE_FOUND`, `CITATION_UNBACKED`, `SOURCE_UNREACHABLE`, `PREVIEW_DEPTH_ONLY`, `SOURCE_SUPERSEDED`, `EXACT_COMPARE_UNAVAILABLE`, `SPAN_NOT_FOUND`, and `SPAN_MISMATCH`; no `OTHER` route exists. The pure ladder is deterministic and stores `VERIFIED` separately from routed failures. |
| DR-085 / P16 | Gate evaluation has no risk-tier input and no populated tier × claim-type cells. Normative, definitional, or value-laden claims are the exact evidence-free complement; empirical, causal, prediction, comparative, mixed, and unknown claims fail closed into observable shadow suppression. |
| DR-087 | `value_laden` remains the existing cross-cutting claim flag; no new claim type was minted. Mixed and unknown are explicitly covered as gated. |
| P17 | `PREVIEW_ONLY` source rows cannot supply a number or quote under an authoritative SQL `CHECK`. Citation route/outcome, attempt-depth, source, absence, comparison reason, preview, observed-version, and mismatch fields have paired constraints. |
| P18 | Certification is derived from distinct known-positive and known-negative probe receipts in both the domain and a database trigger. FX-DEF-01/02 are generated `NOT_SHIPPED` declarations; no dormant hard-kill path exists. |
| P4 | Probe capture requires both the gateway ledger-entry reference and unconditional raw-artifact reference; neither is synthesized by the evidence repository. Absence is persisted as a typed, scoped, timestamped finding. |
| AC-23 / AC-78 | Query sets require question-derived terms plus at least one disconfirming query and receive a deterministic content hash; semantic re-aims are exploration-only. Freshness is computed against frozen run `as_of` using a provenance-bearing register bound and returns a typed serve/refuse/staleness consequence. |

## Exact local verification

```text
pnpm exec vitest run tests/unit tests/architecture
Test Files  26 passed (26)
Tests       154 passed (154)

pnpm run typecheck
PASS

pnpm run lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

pnpm run build
Compiled successfully; static pages 7/7
```

## PostgreSQL environment tail

The authored S06 database suite and the complete test command were both attempted after rework. Embedded PostgreSQL reached `initdb`, then this sandbox exhausted/denied its SysV shared-memory allocation before any migration or test assertion executed:

```text
CI=true pnpm test:s00

FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)

Test Files  3 failed | 26 passed (29)
Tests       154 passed | 41 skipped (195)
```

The three failed suites share `EMBEDDED_POSTGRES_PROVISIONING_FAILED`; the new scored-REJECTED domain+raw-PostgreSQL assertion and non-R1 repository persistence assertion are among the 41 skipped checks. The orchestrator must run the real database suite outside this sandbox. This handoff does not claim a green database execution.

## Carry-forward dispositions

- S06 used the established S04/S05 honesty-row pattern: every new public evidence surface is attached to a concrete repository call or declared with its later owner, and FX-DEF-01/02 are explicit generated non-shipping evidence.
- The new migration satisfies the existing replay-safety audit; no unsafe bare constraint or index form was introduced.
- The S05 dead `BLOCKED` answer terminal and unreachable `OPERATOR` session branch were not touched because S06 does not alter the serve wire/DDL or session resolver. They remain acknowledged carry-forwards.
- S06 does not size composition, so the unruled UTF-8 composition-budget unit remains the recorded V-owned question; no unit or register value was invented here.
- The S04 UDF-in-`CHECK` dump/restore risk and the other review-assigned S14/S15 items remain with their recorded owners; S06 did not modify those seams.

## Value-pending boundary and questions for V

No risk-tier × claim-type eligibility cell, freshness duration, scoring weight, source-aging bound, or activation threshold was invented. The evidence gate runs in the ruled tier-invariant shadow mode with an intentionally unpopulated eligibility map; future values remain V-owned.

There are no new blocking questions for V. The outside-sandbox PostgreSQL run is the only remaining execution gate.
