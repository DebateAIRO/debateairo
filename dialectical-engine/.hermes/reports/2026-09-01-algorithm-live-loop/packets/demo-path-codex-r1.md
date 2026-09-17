# CODEX REVIEWER PACKET — lane/demo-path r1 · F-T17T9-1 + F-SEALEDROWS-B · THE LAST TEST-ONLY LANE ON THE DEMONSTRATION PATH · gpt-6-astra (D65)

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-demo-path
base tip      : 7e8f1e51125f4b613a75c403262504641e2b895e   (integration after t17t9)
tip           : 193509a1bbdc0f8b03b2367ef938e0891c5041dd   (2 commits)
base..tip     : 4 files changed, 175 insertions(+), 27 deletions(-)   — four files, ALL under acceptance/, no product file (verified by name filter)
```

## Why this lane matters more than its size

With it merged, `acceptance/mono-panel`, `panel-multi-maker` and `ceremony` reach the served
answer for the first time since T9 landed. That is the first V-approved demonstration run's path.
So the question is not only "is it correct" but "does it prove what it claims" — the sealedrows
seat declined to write these fakes earlier because an unexercised fake is this ticket's own subject.

## What landed (seat-reported; verify by artifact)

- `acceptance/test-fixtures/evaluator-double.ts` — NEW, shared by all three doubles: a T9 EVALUATOR
  discriminator that IS the shipped `EVALUATOR_CONTRACT_TEXT`, and a satisfied verdict that goes
  through the runner's own `evaluatorVerdictSchema.parse`, so the next protocol move fails by name.
- `mono-panel.test.ts` — seals BOTH roles to the one provider it configures via the existing
  `ACCEPTANCE_*_ROLE_REF` overrides before seeding (restored in afterAll; precedent at
  `t16-algorithm-register.test.ts:528-539`); retired 3-response tail → one evaluator verdict.
- `panel-multi-maker.test.ts` — `conforms,findings` and `pass` branches → one EVALUATOR branch.
- `ceremony.test.ts` — EVALUATOR replaces the two retired classes; the evaluator entry moved to the
  provider that actually receives it (the seat instrumented the classifier once, filed
  `r1-DIAG-ceremony-classifier.log`, reverted byte-identical: the call arrives `GENERAL` on the
  CRITIC provider with an empty queue, and the three retired entries on the primary were never
  consumed); the unrecognised-request fallback now REFUSES across classes.

**RED → GREEN, by suite:** mono-panel 1 failed → 1 passed ×3; panel-multi-maker 2 failed → 2 passed ×3;
ceremony 1 failed | 1 passed → 2 passed ×3. Seat: "no assertion weakened — ceremony's queue lost
three entries T9 had already made unreachable and gained the one call that is actually made."

**Mutants (all `mutate.sh`, stamp-check 10/0):** M1 evaluator override → unconfigured provider:
KILLED; M2 verdict → retired shape: KILLED ×3; **M3 discriminator → drifted text: SURVIVED on
ceremony the first time** — the call fell through to GENERAL and the FIFO fallback served the
evaluator entry anyway, so the repair was green and pinned nothing. Cure: every class, GENERAL
included, consumes an entry of its own class or refuses by name. Re-run: KILLED. Both transcripts
filed. M3 still SURVIVES on mono-panel — filed as F-DEMOPATH-A (its double answers by position).

## The seat's own strongest counters — judge them

1. *"You made a mono-lineage fixture grade its own writer."* Seat accepts the description: a second
   relay would give the run a second lineage and destroy the SINGLE-LINEAGE / CRITIQUE-UNAVAILABLE /
   CAPPED assertions that are the file's subject; identical refs are lawful (goal 84-85) and the
   seeder warns on every run. **Is that the right trade?**
2. *"Three suites now share one fixture, so one edit breaks all three."* Seat: that is the trade it
   wants — silent separate drift produced this ticket. Residual: the shared fixture has no test of
   its own (F-DEMOPATH-B).
3. The ceremony fallback change — scope creep, or the repair of a hole in this round's own work?
   Before/after transcripts: 2 passed → 1 failed → (fix) → 2 passed.

## Findings filed by the seat, not to re-file

F-DEMOPATH-A (mono-panel double answers by position), F-DEMOPATH-B (shared fixture untested),
F-DEMOPATH-C (only panel-multi-maker records unanswered call bodies). Two pre-existing audit
failures dated byte-identical at base (obs-capture edges; `serve/synthesis.ts` numeric literal) —
F31 / F18.

## Questions

1. Does every assertion the three suites carry actually EXECUTE now, or does any still sit past a
   point the run cannot reach? Name one that does not run, if any.
2. Is the discriminator the shipped constant by IMPORT, or by copy?
3. Does the `process.env` override leak across files under the default pool? The seat argued from
   `forks` isolation + afterAll restore, not proved.
4. Is "refuse across classes, GENERAL included" safe for every other request the ceremony run makes?
5. **Packet audit.** `packets/demo-path-worker.md`, `dispatches/demo-path-1.txt`. The seat charged
   three: a "180-second" timeout constant that does not match the tree (both vitest configs say
   120_000); "the double needs extending" when it needed shortening; TOOLING-TRAPS.md granted by a
   relative path with two copies. Anything uncharged.
6. **MERGEABLE?** And: is the demonstration path now genuinely clear of test-only walls, or is there
   one more behind these?

## Method

Static; no mutating git; verify by artifact; scoped runs only (one acceptance file per call — 120s
per-test timeouts and embedded postgres); absolute paths — mission dir `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/demo-path-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/demo-path-codex-r1-self.md
```

Line 1 exactly:
`CODEX REVIEW DEMO-PATH r1 — <APPROVE|CHANGES> · comments read through: demo-path-r1-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required
fix**; `## Packet audit`; `## Not verified`; `## PREDICTIONS`; final line
`MERGEABLE: yes|no — <one sentence>`.
