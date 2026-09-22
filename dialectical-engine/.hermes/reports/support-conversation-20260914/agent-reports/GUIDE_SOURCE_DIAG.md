# GUIDE_SOURCE_DIAG — self-report

## Identity and result

- Session: `/root/requirements`
- Ticket/run: `t_7ab39546` / root-persisted run `206`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Verdict: `ORACLE_PRIMARY_SET_INCOMPLETE_OBSERVED_PRODUCT_ANSWER_SOURCE_SUPPORTED`
- Product/harness/prior-evidence edits: none.
- Heavy lease: used for two bounded offline successful discriminators, then released. The first sandbox attempt failed before product execution because `tsx` could not open its IPC socket.
- Actual usage: unavailable; no token meter was exposed.

## Skills loaded

Actual retained BODY reads used by this original session: `superpowers:using-superpowers`, heartbeat protocol and worker contract, `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. This node applied the retained systematic-debugging and verification contracts. No new skill BODY was read or claimed.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The expensive run failed because production and the harness expressed different source contracts. Production offered three reviewed sources and allowed the model to cite a relevant subset. The harness manually duplicated a narrower primary list and did not check whether that list covered every semantically valid public source already supplied by production.

This mismatch survived pretraffic proof because the proof asked only whether at least one expected source existed somewhere in context. It did not compare the oracle set to every semantically sufficient primary candidate. Twenty answers completed and the twenty-first consumed another model request before the inconsistency became visible.

The main upgrade is to define purpose-specific source authority once and consume it from both production and the harness. A broad where-to-learn intent may use the landing Method/Transcripts authority; an explicit already-open-debate control intent must use the workspace guide authority. The harness should derive its accepted primary set from that shared declaration and add a negative showing that the broad allowance does not leak into the local-control intent.

The execution can become closer to one prompt by making the frozen input generate three things before live traffic: production context for every canonical row, the complete permitted-primary set, and a useful-answer fixture tied to reviewed facts. The preflight should fail if the manual oracle omits a production-authorized source, if it admits an unrelated source, or if a synthetic accepted response is empty or generic. Only then should the live runner consume capacity.

This would have caught the row 26 discrepancy offline. It avoids changing product behavior to satisfy a duplicated test expectation and reduces repeated model traffic without weakening source or answer quality.

## Limits

The retained answer is public and source-supported. Source membership is not a general proof of sentence-level quality, so the correction retains explicit useful-answer and unrelated-source negatives. No conclusion is drawn from historical capacity arithmetic, and no additional sample was requested.
