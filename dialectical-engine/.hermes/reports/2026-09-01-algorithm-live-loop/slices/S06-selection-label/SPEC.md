<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S06 SPEC — Winner selection + three-state label

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S06-selection-label` |
| goal tasks | T10, T11 |
| goal line range | 187–221 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | S6-1, S6-3; S7-1, S6-1 + confirm-items 3, 4, 6 |
| wave | W6 (see `../../PROGRESS.md`) |

## T10 — VERBATIM, goal lines 188–195

```
### T10 · Winner selection + served number (S6-1, S6-3)
Delete first-configured-provider selection (runner index.ts:934-944). Served number =
max-strength root's propagated strength; margins to runner-up recorded in the receipt;
deterministic tiebreak (documented; e.g. lexicographic node id — a tie is CONTESTED by
T11's ladder anyway); UNSERVED-MAKER-POSITION marks stay.
DoD: RED first — constructed run with reversed config order expects the higher-strength
root served and FAILS on baseline; margin in receipt; tiebreak test.

```

## T11 — VERBATIM, goal lines 196–221

```
### T11 · Three-state verdict label (S7-1, S6-1)
Code-only derivation, computed BEFORE synthesis from the propagated numbers (acyclic —
see confirm-item 3; the round-3 objection is a mark, not a label input, by default).
Ordered, total, disjoint ladder — defined over the RUNTIME domain, absent inputs included:
0. margin ABSENT (single root: no runner-up exists) OR disagreement ABSENT (dispersion
   reports fewer-than-two parseable judgements, s04.ts:270-271 — the mono-maker skeleton
   and the PANEL-DEGRADED-SINGLE-VOICE path both land here) → CONTESTED + mark
   `LABEL-BASIS-INCOMPLETE` (confirm-item 6: a solo voice can never print SUPPORTED)
1. winner < low cut → UNSUPPORTED
2. else margin ≤ γ OR disagreement ≥ threshold → CONTESTED
3. else winner ≥ high cut → SUPPORTED
4. else (mid-band: low ≤ winner < high with clear margin + low disagreement) → CONTESTED
Disagreement quantity NAMED: the recorded panel dispersion of the winning root's reduced
judgement (T3's `dispersion` field), compared on T16's seeded scale. Register values:
γ=0.05, high=0.70, low=0.35 (T16 defaults; tunable without code).
Live-UI mapping (confirm-item 4): SUPPORTED→endorsed, CONTESTED→endorsed_with_caveat,
UNSUPPORTED→suppressed_no_evidence (apps/ui/lib/types.ts:613, VerdictBanner.tsx:35) —
vocabulary wiring only, not a redesign.
DoD: replace the binary derivation at packages/serve/src/index.ts:662-668 (RED first —
a test expecting CONTESTED from a constructed near-tie FAILS on baseline); PROPERTY test
over the (winner, margin, disagreement) cube PLUS the absent-margin and
absent-dispersion arms (ABSENT/null are runtime values, not NaN) proving exactly one
label per point of the runtime domain; the mono-maker acceptance run asserts its label
is CONTESTED with the LABEL-BASIS-INCOMPLETE mark; all three states reachable, each
trigger tested; live banner renders each mapped state (test).

```

## Global obligations that also bind this slice (cited, not re-quoted)

- Scope law — goal 22–26, quoted in `../S12-closure/SPEC.md`.
- Global definition of done — goal 28–41, quoted in `../S12-closure/SPEC.md`.
  The RED-before-GREEN clause binds every task in this slice that says `RED first`.
- Non-goals — goal 321–331, quoted in `../S12-closure/SPEC.md`.
- Standing laws: `../../../../.claude/skills/heartbeat-protocol/SKILL.md` §2.

## Open findings against this slice

Filed in `../../agent-reports/req-01.md`. A finding is a finding (router §2.2):
each one carries a ticket and a fix; non-blocking changes WHEN, never WHETHER.

