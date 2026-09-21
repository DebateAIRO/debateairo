# GUIDE_CONTEXT_FIX evidence

- Ticket/session: `t_8a5af2ff` / `/root/requirements`
- Base: `3d0ad7acaab0ff90bd783a6948bf99f117d74fe2`
- Product commit: `8fb8e407`
- Scope: one authorized test file; one line changed; production files and original assertions unchanged.

## Confirmed cause and correction

The shared fixture query `crosscap alpha beta gamma` supplied four direct words while each synthetic entry matched only `crosscap` and one additional term. The production selector correctly rejected that 0.5-coverage synthetic request before the answer service could build context, call the completion port, parse a response, emit diagnostics, or write canonical storage.

The correction changes only the shared fixture query to the exact synthetic sentinel `crosscap`. This satisfies the existing single-direct-word relevance rule and causes every original test to reach the behavior it was written to verify. No threshold, expectation, production selector, answer service, policy, KB, or corpus byte changed.

## Captured verification

- Focused RED: `TSX_DISABLE_CACHE=1`; `support-answer-context.test.ts`; rc1; 14 failed and 17 passed.
- Specified bounded GREEN: `TSX_DISABLE_CACHE=1`; `support-answer-context.test.ts`, `support-context.test.ts`, and `tests/support-eval/run.test.ts`; `--maxWorkers=1`; rc0; 3/3 files and 114/114 tests passed.

The corrected answer-context file now exercises the original token-cap, immutable-snapshot, diagnostic, parser, credential/path rejection, request-local reference, storage, and opaque-attempt assertions. The neighboring files retain the production relevance/unsupported-topic matrix and strict production-equivalent evaluation fixture.

## Limits

No broad 33-file suite, typecheck, support evaluation command, live model, browser, HTTP, provider, private-record, account, or recovery operation ran. Final composition and separate technical review remain outside this node.

