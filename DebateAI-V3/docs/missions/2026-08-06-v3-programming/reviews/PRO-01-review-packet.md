# Review packet — PRO-01 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_19834503` (`review`) · READ-ONLY.
Both lenses must greenlight.

## What this ticket is — the biggest engine change since FAIR-01

Two V rulings converge here:
- **DR-149:** every node gets its own PRO and CON — real defender nodes joined
  by real `support` edges, never relabelling; the root question card stays
  neutral.
- **DR-157/DR-159:** depth is an ask-time dial (max 5, B3-B expansion rounds:
  `2^(d+1)−1` authored nodes) — and depth was INERT before this ticket:
  `apps/runner/src/index.ts` had zero occurrences of "depth". This ticket
  wired it.

The pattern it was ordered to follow: FAIR-01's critic leg — same shipped
Judge organ at a distinct call site, GraphWriter first-class children, real
edges, own stranger restatement, per-artifact maker lineage.

Constraints: serve stays B2-A (ONE primary root served; expansion nodes judged
and recorded but not individually served); ratified ceilings 42/66/114/210/402
respected with LOUD typed stop on exhaustion, never silent truncation; the
memory-disclosure segment trap (ENV-01 ADV-1) had to be resolved honestly; the
`onAuthRejected` unconditional-clear socket must not be wired (POL-01 A-4).

## Worker's claims

Depth-1 runtime RED (expected 3 authored nodes, got fewer) → GREEN; a REAL
depth-2 proof: run `9e39a95d…`, answer `13730d8a…`, **7 nodes**, with lineage
and call evidence pasted in the handoff. Full repo 449/449.

**Note:** the depth-2 proof ran against the worker's OWN composition — the
STANDING DB does not contain that answer (verified: the live index holds only
the ceremony's debate). Judge the pasted evidence for internal consistency;
do not expect to fetch that answer from :8790.

## Orchestrator's independent gates — do not re-run

root `tsc` clean · v2-ui `tsc` clean · root vitest **63 files / 449 tests** ·
acceptance **9 / 35** · architecture 27/0 · source 0 blocking.

## What to judge — this is engine-of-record work, be thorough

1. **Is the expansion real and B3-B-correct?** Depth d must produce
   `2^(d+1)−1` authored nodes: root position + PRO&CON per round. Check the
   round loop's arithmetic and termination. Off-by-one here spends 2× or
   refuses lawful runs. Does depth come from the RUN's persisted
   `depth_params` (the ask), not a default or an env var?
2. **Are the PRO edges real?** Support edges from the shipped GraphWriter with
   honest magnitude state (UNKNOWN unless judged), S07 shape vocabulary, own
   stranger restatement + reduced judgement + maker lineage per node. A PRO
   node whose edge or lineage is fabricated is a DR-115 blocker.
3. **The defender leg's independence.** Does any maker grade its own artifact
   (FX-HR-H6)? How are makers alternated across the tree — is the choice
   JUSTIFIED in the handoff, and does recorded lineage reflect what actually
   ran?
4. **Envelope honesty under exhaustion.** Force the arithmetic: at depth 1
   (ceiling 42) the healthy spend is ~14; at depth 2 (66) ~22. If a run hits
   the ceiling mid-expansion, is the typed RUN_COST_ENVELOPE_EXHAUSTED stop
   proven by a test? Any path that silently truncates the tree and reports a
   complete terminal is BLOCKING.
5. **The memory-segment trap.** What did the worker actually do about the
   post-validation `memory:disclosure` segment (runner:789-800) that makes
   S=3 and blows the depth-1 ceiling at strangerSampleRate>=1? Fixed
   honestly, or routed up, or — the forbidden case — left to surface as a
   confusing exhaustion?
6. **Serve set unchanged.** Confirm serve still carries ONE primary root
   (B2-A). An expanded serve set is PANEL-01's V-question, not this ticket's
   call.
7. **The depth-2 evidence.** Internally consistent? 7 nodes, edge relations
   summing correctly (support + attack per round), lineage naming real
   models, spend within 66? The worker was ORDERED not to burn the depth-3
   run — confirm the handoff discloses total call spend.
8. **The named defect class.** Would the new tests fail if expansion silently
   stopped at round 1, if edges were mislabeled, if depth were read from the
   wrong place? Mutation-argue the load-bearing ones.

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and the
concrete failing case. Write to `reviews/pro01-<yourname>-rev1.md` and print
to stdout.
