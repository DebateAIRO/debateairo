# Debate model evaluator integration

The existing evaluator is implemented but disconnected: worker exports have no process entry point or scheduler, profile derivation has no runtime caller, and the developer menu is in an unused settings component behind a retired operator policy.

## Intended behavior

A separate worker reconciles terminal debate runs, meters recorded calls, and derives append-only model profiles and rankings. It runs automatically with the development stack and also supports a standalone one-shot command. Failed runs remain isolated and use the existing three-failure harvest circuit breaker. Polling catches runs completed before startup and later settlement evidence. No evaluator outage changes a debate result.

Numeric evaluation does not require an LLM, private content keys, or paid calls. The harvest reads recorded numeric facts and skips review prose while retaining the existing erasure/content lease. It uses the evaluator worker database principal, never the product runtime principal. A new migration grants only the required liveness predicate and checkpoint permissions.

A refresh receipt names the exact observation sequence, derivation version, and completed snapshot timestamp. Unchanged input does not create repeated profiles. The signed-in rankings endpoint returns only model aggregates from the latest completed snapshot. It does not expose runs, questions, private artifacts, receipts, or other users' identifiers. It is shown in the active settings screen. Existing operator write routes stay restricted.

## Scoring

Version 2 preserves replay of explicit version-1 formulas. Argument strength is labeled a reasoning proxy. A high judgement probability is not evidence of judging skill; agreeing with an author is not evidence of reviewing skill. Those raw quantities may appear as process diagnostics but must not win capability rankings. Independent blind grades support judging quality. Settled forecast accuracy uses the recorded forecast against the resolved event, not the truth value alone. Missing evidence stays missing, and sample counts plus available uncertainty intervals accompany scores. Unclassified domains are labeled honestly.

Ranking is reporting only. The existing dispatch allocator remains unbound because this request concerns measurement and comparison, not a replacement selection policy. Optional local-model tagging and blind grading retain their existing isolated entry points; numerical evaluation works when that local provider is absent.

## Validation

Use focused scoring regression tests, a real temporary PostgreSQL end-to-end terminal-to-profile test under the evaluator role, repeated/concurrent refresh checks, authenticated HTTP read tests, UI rendering, and development process lifecycle tests. Compare repository typecheck diagnostics against the pre-existing baseline. Preserve unrelated working-tree changes.
