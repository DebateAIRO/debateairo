<!-- REQ-01 zero-drift transcription. Quoted spans are byte-identical to goal-v4. -->
# S01 SPEC — Register rows + seeding

**FROZEN at creation (requirements contract §2).** No agent edits this file —
REQ-01 included. A scope change is a NEW spec version ratified by V, superseding
on the record. Mission law D7: any urge to reword the quoted text is a FINDING,
never an edit.

| field | value |
|---|---|
| slice | `S01-register` |
| goal tasks | T16 |
| goal line range | 80–96 |
| source | goal-v4 `../2026-08-31-algorithm-correctness/goal-prompt.md` sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986` |
| baseline | `dev @ 1c9578a` (every file:line below verified against it) |
| rulings implemented | cross-cutting prerequisite; sole owner of every new row/schema/migration |
| wave | W1 (see `../../PROGRESS.md`) |

## T16 — VERBATIM, goal lines 80–96

```
### T16 · Register rows + seeding (cross-cutting prerequisite — scheduled here, directly after T0)
Mechanism (corrected r1): new sealed rows land via MIGRATION + the deployment-register
seeding path (`apps/runner/src/dev-deployment-register.ts` + `dev-deployment-register-cli.ts`
for dev provenance; production seeding is T14's question). `register.bootstrap.json` is a
strict five-pin tool file and is NOT touched. T16 is the SOLE owner of every new
row/schema/migration; consumer tasks only read.
Rows: δ, ε (T7) · γ, high cut, low cut, disagreement threshold + the named disagreement
quantity (T11) · synthesizer + evaluator role refs, evaluator-loop max = 3 (T9) ·
dispersion scale, repeated-family multiplier, downgrade bands, provider/model→family map
incl. UNKNOWN-family behavior (T3, per s04.ts:268-317 input requirements) · envelope
formula inputs (T17).
Defaults seeded: δ=0.02, ε=0.01, γ=0.05, high=0.70, low=0.35, disagreement threshold on
the seeded dispersion scale; evaluator role ref ≠ synthesizer role ref (identical refs
permitted but emit a startup warning + test).
DoD: consumers read register only (no code constants; grep-proof in test); missing row
fails loudly (test per row family); startup warning test for identical roles.

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

