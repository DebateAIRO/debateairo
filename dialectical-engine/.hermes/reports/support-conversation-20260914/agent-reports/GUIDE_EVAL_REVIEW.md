# GUIDE_EVAL_REVIEW self-report

## Assignment and result

- Node/ticket/session: `GUIDE_EVAL_REVIEW` / `t_92a636b6` / `/root/plan_review`
- Revision: clean detached `714c7aa9f649b3e1bff4c517cb69b7245f68d9a3`
- Verdict: **REWORK**
- Scope: immutable evaluation evidence, committed evaluator, 20 class-A and six class-B controls, six retained class-E controls, and their immediate context/answer/snapshot interfaces
- Product work: none

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Murder-case reconstruction

The visible victim was a deterministic 50/60 result. The first cause was fixture drift: the evaluator retained the legacy article-only corpus and prose model contract, while production had moved to an exactly reviewed recovery snapshot and strict JSON response. Ten positive cases named sources that production admits through reviewed projections but the legacy evaluator suppresses because their owner-ratification fields are blank.

The second cause was hidden by that mismatch. When the exact detached production context was fed the A/B queries, six positives lost a required source and five negatives gained irrelevant sources. The broad overlap and capability-sibling ordering in `context.ts` are the producer; `answer.ts` consumes any nonempty set as answerable and can ground rejected drafts from the first fallback. The result is a real structural retrieval defect, while the committed 50/60 score itself is not a production result.

## What cost tokens and how to improve it

The evaluator, production bootstrap, loader admission, snapshot boundary, context builder, answer policy, and case JSON each restate part of the same contract. The author had to try several temporary variants before the missing snapshot, corpus mode, strict response mode, and retrieval behavior became separable. A one-prompt runner should create both production and evaluation fixtures from one `createProductionSupportFixture(exactSnapshot)` factory and make the model stub consume the same opaque output contract as production.

The runner should emit a machine-readable row per case with selected canonical sources/actions, returned sources/actions, outcome, model-called flag and constraint failures. That would have exposed the six A and five B retrieval discrepancies without temporary instrumentation or three repeated full runs. One pure context matrix should precede the database-backed evaluator; if it fails, skip the expensive full frame.

The knowledge selector also needs an explicit invariant: a source requires meaningful query-to-article or query-to-capability evidence, and direct relevance outranks sibling catalog order. Negative price, model-count, verdict-truth, SLA and roadmap controls should ship with that invariant so adding menu articles cannot silently widen answerability.

## Evidence and limits

- Indexed custody: 32/32 exact.
- Discriminator: 20 A plus six B cases, 38 exact detached projection entries, rc 0.
- Result: six A source omissions; five B false-positive source sets; fourteen A source-subset passes; B04 remains empty.
- The probe imported only absolute detached context/catalog paths and recorded their hashes. It constructed entries from detached article/component bytes to avoid the mutable primary package symlink.
- No database, listener, model, HTTP, browser, network, product, Git, KB, metadata, or acceptance action occurred.
- Usage: **UNAVAILABLE**. User alone accepts CP1.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill body was read for this continuation.
