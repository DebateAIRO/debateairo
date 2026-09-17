GOAL REVIEW r4 — codex · APPROVE · comments read through: goal-v4-2026-09-01
# CODEX GOAL REVIEW r4
## VERDICT
APPROVE — 0 unresolved findings. The three scoped v4 repairs are complete.

The packet's typed state is byte-identical to the canonical T5 state (`diff` exit 0). T5 is now `risk_tier: high`, and its canonical note cites SCORING SEMANTICS as the immutable-floor reason (`board/T5-codex-goalreview.md:4-43`). The declared adjudication records the same correction for both review tickets (`agent-reports/judge-adjudication.md:166-172`); direct byte comparison was required and performed for T5, while T4's canonical file was outside this packet's readonly contract.

T9 now gives distinct recorded-request schemas to initial synthesis, retry synthesis, and evaluation. The retry includes the prior evaluator objection VERBATIM and a prior-candidate reference, while the DoD requires the round-2 request to contain the exact round-1 objection and forbids debate transcript/provider history beyond the named artifacts (`goal-prompt.md:231-243,263-269`). The R9 disposition knowingly retires the `protectedCoreVerified` guard and makes HARD_STOP with no served statement independent of restatement status; the enumerated crash-class DoD includes envelope exhaustion and asserts terminal, mark, and retired-guard behavior (`goal-prompt.md:246-269`).

Independent three-run probe output (worst run governs):

```text
run=1 mirror=true risk_record=true feedback=true envelope=true feedback_mutant_rejected=true feedback_neighbor_allowed=true envelope_mutant_rejected=true envelope_neighbor_allowed=true risk_mutant_rejected=true verdict=PASS
run=2 mirror=true risk_record=true feedback=true envelope=true feedback_mutant_rejected=true feedback_neighbor_allowed=true envelope_mutant_rejected=true envelope_neighbor_allowed=true risk_mutant_rejected=true verdict=PASS
run=3 mirror=true risk_record=true feedback=true envelope=true feedback_mutant_rejected=true feedback_neighbor_allowed=true envelope_mutant_rejected=true envelope_neighbor_allowed=true risk_mutant_rejected=true verdict=PASS
```

The probe rejected three in-memory mutants: omitted evaluator feedback, an envelope terminal restored to “only when restatement passes,” and a packet risk tier changed to `medium`. An unrelated appended note remained accepted, showing the assertions discriminate the scoped properties rather than arbitrary text identity.

Not verified: implementation or runtime behavior; this ticket reviews the final `/goal` artifact, not a product patch. Prediction: another lens could treat the short phrase “after protected-core verification” at `goal-prompt.md:260` as preserving the old guard; the controlling task text and DoD at lines 248-251 and 263-266 explicitly retire that guard and test the failed-restatement arm, so I expect that reading to be false.

## FINDINGS
None.
