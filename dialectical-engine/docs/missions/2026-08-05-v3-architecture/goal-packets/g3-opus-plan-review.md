# Goal packet — Plan review, independent Opus lens (ARCH-V3-R1 / G3)

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned
lens. Construct the inputs, states, or sequences that would make it fail. If
you are unsure whether it holds, FAIL it and state exactly what proof would
change your verdict. Approve only when you have tried and failed to break it.
You are read-only for the reviewed artifact: report findings, never edit it.
You are NOT the plan's author; review with no loyalty to its choices.

## Lens: red-team / pack-coherence (the Grok-lens seat, adapted per intake)

Construct the case that breaks the plan. Hunt specifically:

1. **Architectural failure scenarios** — realistic runs (degraded modes,
   envelope exhaustion, replay eviction, multi-maker outage, concurrent
   writes, staleness wakes, WAIT-durable rows) under which the proposed
   module/data/API shape cannot honor a charter or spec obligation. Name the
   obligation and the failing sequence.
2. **Cross-artifact incoherence** — places where the plan satisfies one
   founding artifact by violating another (spec vs manifest vs UI contract vs
   charter), or where it silently picks a side of a flagged contradiction
   (e.g. undercut carrier A-1, lifting predicates A-3, charter §9 items).
3. **Replay/determinism holes** — any path where a served number could not be
   recomputed byte-identically from frozen records with no model in the path
   (DR-034, S1, C-13 determinism, contract-hash discipline).
4. **Orphan and dead-gate risk** — proposed components with no named caller,
   gates that could not demonstrably fire (charter G3/G5, D5's disease).
5. **One-of-each violations** — any second implementation of graph, scoring
   arithmetic, or serve truth hiding in the design (DR-030, A3.1).
6. **Stranger-law failures** — architecture artifacts whose planned form a
   stranger could not restate (charter clause 2 applied to the plan itself).
7. **Slicing realism** — G5 preview slices that could not each ship with
   their named charter gates, or whose dependency order is wrong.

## Inputs (read-only)

- docs/missions/2026-08-05-v3-architecture/architecture/Plan.md  (the reviewed artifact)
- docs/missions/2026-08-05-v3-architecture/research/digest-requirements-spec.md
- docs/missions/2026-08-05-v3-architecture/research/digest-carryover-manifest.md
- docs/missions/2026-08-05-v3-architecture/research/digest-ui-boundary-contract.md
- docs/founding/** (source of truth for spot checks)

Do NOT read the Codex lens review; your verdict must be independent.

## Output: exactly one artifact

Write `docs/missions/2026-08-05-v3-architecture/reviews/opus-plan-review.md`:

```text
LENS VERDICT: PASS | CHANGES REQUESTED
REWORK ROUND: 1 of 3
Findings (each): id O-n | severity BLOCKER|MAJOR|MINOR | Plan.md location |
                 breaking scenario or citation | required modification
Residual risks accepted under PASS (if any)
```

Severity law: BLOCKER = a named obligation provably cannot be met under the
plan as written; MAJOR = a credible failure scenario the plan must address;
MINOR = hardening. Do not edit any other file.
