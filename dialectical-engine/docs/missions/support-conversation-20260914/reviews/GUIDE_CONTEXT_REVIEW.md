# GUIDE_CONTEXT_REVIEW — bounded static failure diagnosis

## Verdict

**TEST FIXTURE REWORK.** All 14 failures in the frozen 33-file frame are explained by one stale synthetic relevance precondition in `tests/unit/support-answer-context.test.ts`. No production regression was observed in this static diagnosis. The smallest justified correction changes one test-helper string; production retrieval, answer, policy, KB, and expectations should remain unchanged.

Revision reviewed: clean immutable `9bf56f95711d19e6405fff5db06c4ad3d606bd68`. Four code files and 14 indexed evidence inputs matched their recorded hashes and byte counts. No test or executable probe was run.

## Common cause

The shared `request(snapshot)` helper sends `crosscap alpha beta gamma`. Every affected synthetic entry contains `crosscap` and only one of the other three terms. Under the corrected selector in `packages/support-kb/src/context.ts`, that produces `directWords.size = 4`, `projectionScore = 2`, and coverage `0.5`. The entry has no review alias, its common title contributes only `crosscap`, and its synthetic ID is absent from the production capability catalog. It therefore fails every `meaningful` branch and has no strong capability admission.

`apps/api/src/support/answer.ts` consumes the resulting empty `sourceIds` and returns `NO_SOURCE` at lines 231–250. It never constructs a system prompt, calls the completion port, parses a draft, reports a diagnostic, or exercises canonical assistant storage. This single early branch accounts for the empty system in the cap test, the five other `NO_SOURCE` results, all seven zero-call rejection rows, and the `0/2` attempt-diagnostic result.

The temporal evidence agrees: commit `141f0472` changed `context.ts` to require meaningful evidence and left `support-answer-context.test.ts` unchanged. The three files relevant to this diagnosis did not change between `141f0472` and `9bf56f95`. The fixture was not updated when its production precondition became stricter.

## Exact 14 dispositions

| # | Failed behavior | Intended property | Disposition |
|---:|---|---|---|
| 1 | Whole reviewed sections above 12,000 and below 24,000 | Selected sections remain whole and the full system stays within the cap | Fixture selects no source, so system is empty |
| 2 | Exact immutable route snapshot | Request snapshot wins over stale service lookup | Fixture selects no source before either marker reaches context |
| 3 | Closed rejected-completion diagnostic | Only the closed, secret-safe diagnostic schema is emitted | Completion and diagnostic are never reached |
| 4 | Reject internal identifier before storage | Hostile canonical ID never reaches return or assistant storage | Completion and policy boundary are never reached |
| 5 | Reject request alias in narrative text | Opaque request reference never becomes visitor prose | Completion and policy boundary are never reached |
| 6 | Reject prior-request source reference | References remain request-local | Current-request validation is never reached |
| 7 | EN password contradiction: “plus it could receive them” | Reject contradiction; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 8 | EN password contradiction: “in addition it accepts them” | Reject contradiction; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 9 | RO password contradiction: “plus le poate primi” | Reject contradiction; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 10 | RO password contradiction: “în plus le poate primi” | Reject contradiction; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 11 | RO authentication-code validation clause | Reject validation operation; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 12 | RO security-code verification clause | Reject verification operation; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 13 | Encoded backslash network path | Reject path prose; store/return reviewed fallback only | Completion spy remains at zero because of `NO_SOURCE` |
| 14 | Distinct opaque identities for two rejected attempts | Two rejected attempts receive distinct UUID diagnostics | Both calls stop at `NO_SOURCE`, yielding zero reports |

The machine-readable extract preserves the exact names, observations, intended properties, and source hashes in `.hermes/reports/support-conversation-20260914/probes/GUIDE_CONTEXT_REVIEW/failure-dispositions.json`.

## Smallest correction contract

Change only the shared default fixture request at `tests/unit/support-answer-context.test.ts:54`:

```ts
text: "crosscap",
```

`crosscap` is a synthetic sentinel present in every affected projection. With one direct word and one exact projection match, it satisfies the existing `directWords.size === 1 && projectionScore === 1` admission rule. The expected effect is that the source precondition becomes true and each test reaches the property it already asserts. This is a static inference; it has not been executed in this seat.

Preserve the three long sections, the 24,000 cap, the route-snapshot mismatch, hostile completions, exact response expectations, diagnostic schema, storage assertions, and request-local reference factories. Do not change `context.ts`, `answer.ts`, response policy, capability aliases, source/action expectations, or unsupported-topic controls for these failures.

The frozen RED is the existing exact 33-file log: 14 failures in this file, 1,454 passes elsewhere. After the one-line fixture change, use this bounded GREEN frame:

```sh
env TSX_DISABLE_CACHE=1 pnpm exec vitest run \
  tests/unit/support-answer-context.test.ts \
  tests/unit/support-context.test.ts \
  tests/support-eval/run.test.ts \
  --maxWorkers=1
```

The first file proves all 14 properties are actually reached. `support-context.test.ts` preserves the 26-case relevance and unsupported-topic matrix plus menu/product neighbors. `support-eval/run.test.ts` preserves production-equivalent immutable fixture and strict-envelope behavior. The later composed frame remains responsible for integration with the separately routed navigation correction.

## Production-regression disposition and limits

No production counterexample is established. The same composed run passed real or production-shaped identity, unsupported branded-topic, settings-menu, recovery, opaque-reference, and action-filtering controls in this file. At the unchanged selector revision, the prior bounded review also retained the exact 26-case A/B matrix, 40/40 menu-family source reachability, focused 83/83, and structural 60/60. Those measurements support the fixture diagnosis; they do not prove live answer quality or a whole-product PASS.

The proposed one-line effect is inferred directly from immutable source and failed output. No test, model, database, listener, HTTP, browser, private-data, product, Git, KB, metadata, or acceptance action occurred. The independent rubric remains `PENDING`, the concurrent navigation finding is outside this review, and no checkpoint verdict is made.

