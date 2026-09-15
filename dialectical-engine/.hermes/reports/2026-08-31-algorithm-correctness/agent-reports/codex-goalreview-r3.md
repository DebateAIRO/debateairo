GOAL REVIEW r3 — codex · CHANGES · comments read through: goal-v3-2026-09-01
# CODEX GOAL REVIEW r3
## VERDICT
CHANGES — 2 blocking findings. The seven declared v3 edits are present, the packet state is byte-identical to the canonical T5 state, and T0/T11 resolve their r2 defects. The T9 schema repair is incomplete, and the regenerated ticket uses a syntactically valid tier that violates the immutable high-risk floor. This result opens the draft's final lawful rework round (3 of 3); another CHANGES round must route through the V DECISIONS PACKET.

## FINDINGS

B1. BLOCKING · WHAT: The canonical ticket and packet now mirror exactly, but `risk_tier: medium` is not lawful for this ticket's subject. The spine's immutable floor says any ticket touching scoring semantics is `high` regardless of size. T5 reviews a goal whose acceptance criteria make panel-reduced τ, propagated strengths, winner margins, and the three-state verdict label load-bearing. The board's reason—“internal planning artifact, no production data touched”—addresses mutation risk but does not override the separately named scoring-semantics trigger. · WHERE: `packets/codex-goalreview-r3.md:3-29`; `board/T5-codex-goalreview.md:2-33`; `goal-prompt.md:33-40,196-220`; `docs/agent-protocols/debateai-heartbeat-protocol.md:1176-1199` · WHY: A medium ticket takes the medium review lane; the binding rule requires the high review diamond for scoring semantics. D1 substitutes a file board for absent Hermes tooling but does not relax the risk floor. Exact mirroring therefore reproduces the same invalid classification in two places. · SUGGESTED FIX: classify T5 as `risk_tier: high`, record “scoring semantics” as the reason, regenerate the packet from the repaired canonical block, and rerun the byte-equality check.

B2. BLOCKING · WHAT: V3's per-role schema still does not close the evaluator feedback loop. It defines every synthesizer request as `instructions + digest + code label/numbers`, while only the evaluator schema receives “the prior objection on retries.” After evaluator round 1 disputes the candidate, synthesizer round 2 therefore receives the same named artifacts as round 1 and cannot know what to correct. The independent three-run probe produced:

```
run=1 written_retry_changed=false feedback_retry_changed=true
run=2 written_retry_changed=false feedback_retry_changed=true
run=3 written_retry_changed=false feedback_retry_changed=true
```

· WHERE: `goal-prompt.md:231-240`; `DECISIONS.md:122-132` · WHY: S6-4 requires a synthesizer→evaluator loop, not up to three unrelated regenerations. With the written schema, convergence can occur only accidentally; the evaluator's objection is never an input to the model expected to address it. This gap is introduced by v3's newly explicit schemas. · SUGGESTED FIX: define separate initial and retry schemas: initial synthesizer = instructions + digest + label/numbers; retry synthesizer = the same + prior evaluator objection (and prior candidate reference if needed); evaluator = digest + label/numbers + current candidate. Add a recorded-request assertion that round-2 synthesis contains the exact round-1 objection while still containing no debate transcript/provider history.
