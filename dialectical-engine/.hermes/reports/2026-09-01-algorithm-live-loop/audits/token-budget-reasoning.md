# Token and deadline budgets — measured, then reasoned

Ordered by V, 2026-09-03: *"maybe we also need to see if we need more input/output tokens for
the SYNTHESIZER, or for a judge…. I don't know. But at least let's reason a little bit over it."*

## What the numbers actually are

Every organ bound in the system (`apps/runner/src/dev-deployment-register.ts:37-39`):

```
JUDGE:       maxAttempts 3, tokenCeiling 2048, deadlineMs 180_000
COMPOSER:    maxAttempts 3, tokenCeiling 2048, deadlineMs  60_000
CONFORMANCE: maxAttempts 3, tokenCeiling 2048, deadlineMs  60_000
```

`tokenCeiling` becomes `max_tokens` in the request body
(`packages/providers/src/index.ts:349`). **It caps OUTPUT only.** There is no input-side token
accounting anywhere in the system.

The input side is bounded separately, in BYTES: the digest is compressed until it fits
`compositionBundleBudget` = 10,000 / 20,000 / 30,000 bytes by tier
(`dev-deployment-register.ts:268`), through the summary ladder `[null, 480, 240, 120, 60, 24]`
characters. If it will not fit at maximum compression the outcome is a loud
`DIGEST_CANNOT_EXIST`, never a silent subset. That design is correct and I am not proposing to
change it.

## The input side is fine

30,000 bytes is roughly 7,500 tokens. Add the system prompt, the instructions, the code label,
the candidate statement on the evaluator's side, and a prior objection on a retry: call it
9,000 input tokens in the worst tier. Every model in the roster handles that comfortably.

One latent mismatch worth recording but not fixing: the input budget is denominated in bytes
and the model's limit is in tokens, and no code converts between them. It is harmless at
30,000 bytes. It stops being harmless if someone raises that row without checking the model.

## The output side has a real defect, and it is not the number

Three facts, each verified by reading:

1. **`finish_reason` is never read.** Zero occurrences in the repository. A response cut off at
   `max_tokens` arrives as a partial `content` string and is indistinguishable from a model
   that wrote bad JSON.

2. **A truncated response is classified as a schema failure.** Partial JSON fails
   `classifyStructuredContent`, is recorded as `PARSE_FAILED`, and routes to the repair path.

3. **The repair path makes truncation worse.** `buildSchemaRepairPacket`
   (`apps/runner/src/index.ts:1250`) APPENDS a correction message to the existing messages and
   reuses the same bound. So attempt 2 has a longer input, the identical `max_tokens: 2048`,
   and is asked to satisfy the same schema — which requires output at least as long as the one
   that was just cut. Attempt 3 is longer still.

Together: **a length failure is unrecoverable by construction, burns all three provider calls,
and is reported as a contract violation.** In the ledger it looks like the model cannot follow
a schema. This path has no test — `grep max_tokens` across the test tree returns only bound
literals in fixtures, never a truncation case.

## Why the synthesizer is the one most likely to hit it

Its output is JSON with up to two segments, each carrying `node_refs` — and node ids are
**UUIDs** (`packages/db/src/schema.ts:165`), 36 characters each. A segment citing fifteen
digest nodes spends ~600 characters on identifiers alone. Two broadly-citing segments spend
300+ tokens before a word of prose, leaving roughly 1,700 tokens — about 6,800 characters —
for the actual statement.

And the hypothesis branch of its instructions REQUIRES two segments (a provisional answer plus
a research plan), so the widest output is mandatory exactly where the evidence is weakest.

## The deadline is inverted

The SYNTHESIZER inherits COMPOSER's 60 seconds and the EVALUATOR inherits CONFORMANCE's. The
JUDGE gets 180. But the judge answers about one node, while the synthesizer reads the entire
digest and writes the served answer — the single longest generation in the system — and the
evaluator reads the digest, the label and the candidate and must produce a reasoned objection.
The two hardest calls have the shortest clock, because T9 changed who calls and what is asked
without minting bounds to match. **There is no SYNTHESIZER or EVALUATOR bound at all**; the
cost envelope still describes the retired architecture.

## Recommendation — make it visible, then measure, then set it

I am NOT recommending a bigger number now, because we do not have to guess.
`usage.prompt_tokens` and `usage.completion_tokens` are already recorded per attempt in
`raw_artifact.metadata` (`packages/providers/src/index.ts:391`). The first approved live run
will report the true distribution.

In order:

1. **Read `finish_reason`.** Classify `length` as its own parse status, distinct from a schema
   failure. This is small and it converts an invisible failure into a named one.
2. **On a truncation retry, stop appending.** Appending is strictly counterproductive for this
   failure class — retry the same prompt with a raised ceiling, or fail loudly and say why.
3. **Mint SYNTHESIZER and EVALUATOR bounds of their own** instead of borrowing two retired
   organs'. Deadline no shorter than the judge's 180s.
4. **Then set the ceiling from the run's own numbers**, not from an estimate.

Doing (4) before (1) would be setting a number without being able to tell whether it was hit.
