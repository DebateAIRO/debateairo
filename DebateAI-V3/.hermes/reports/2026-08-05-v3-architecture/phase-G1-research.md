# Phase report — G1 Research (ARCH-V3-R1)

Stage: G1 (research), adapted seats per intake §Loop-ownership election.
Gate: H1 handoff-integrity check only (spine law — no substantive research review).

## Seats fired

| Seat | Model | Transport | Artifact | Size | Wall-clock | Tokens |
|---|---|---|---|---|---|---|
| Research A | Opus 5 | Agent tool (SDK) | research/digest-requirements-spec.md | 1002 lines | ~10.5 min | ~200k |
| Research B | Opus 5 | Agent tool (SDK) | research/digest-carryover-manifest.md | 1114 lines | ~10.3 min | ~158k |
| Research C | Opus 5 | Agent tool (SDK) | research/digest-ui-boundary-contract.md | 557 lines | ~6.8 min | ~121k |

All three ran in parallel. Codex reviewer transport smoke-tested separately
(gpt-5.6-sol, `CODEX TRANSPORT OK`, ~3.9k tokens).

## H1 handoff-integrity verdict: PASS

- All three artifacts exist, are readable, and name their sources with line
  counts and acceptance stamps.
- Each declares its evidence discipline (every claim cites spec section/DR;
  no architecture proposed; silences recorded, not filled).
- No safety/destructive-data decision surfaced.

## Research yield (counts, for the record — content lives in the digests)

- Hard architecture constraints catalogued: 33 (spec) + 30 (manifest) + the
  UI contract's constraint set — overlapping by design, union to be
  consolidated at C2.
- Open items: DEFERRED-BY-DESIGN 17 (spec) + 15 (manifest) + 30 UI mockup
  cells; GENUINELY-UNANSWERED 10 (spec OQ-G1..G10) + 5 (manifest U-1..U-5)
  + 4 UI contract cells (C2, C5, C6, C8).
- Ambiguities: 14 (spec AM-1..14) + 11 (manifest A-1..11) + 12 (UI digest).
- Notable cross-artifact findings: DR-066 undercut carrier vs Edge shape
  (manifest A-1 = UI digest ambiguity 2); "load-bearing" undefined though it
  gates seven subsystems (spec AM-1); missing `../research/*` normative
  sources not present in this repo (spec OQ-G9 = manifest A-10).

## Convergence counters

rework_round: 0 · escalations: 0 · deviations this phase: none beyond the
intake-recorded seat adaptations.

Next: C2 Plan.md (Opus author), then H2∥G3 review diamond (Codex lens ∥
independent-Opus lens), H3 merge by orchestrator (DR-006).
