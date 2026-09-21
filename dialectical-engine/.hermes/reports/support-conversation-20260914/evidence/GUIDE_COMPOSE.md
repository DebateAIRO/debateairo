# GUIDE_COMPOSE evidence

- Node/ticket/session: `GUIDE_COMPOSE` / `t_aa345824` / `/root/requirements`
- Product revision: `9bf56f95711d19e6405fff5db06c4ad3d606bd68`; product worktree remained clean and unchanged.
- Strict corpus snapshot: KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, 44 admitted language records (22 pairs), 0 ignored pairs, 44 separately reviewed recovery records, 0 owner-ratified recovery records. Every recovery owner field was blank.
- Frozen inputs: all 23 indexed files matched their declared SHA-256 and byte count; all 33 indexed suite files existed.

## Exact composed suite

The indexed 33-file Vitest command ran once with `--maxWorkers=1` through `run-capture.sh`.

- Exit: `1`
- Test files: 32 passed, 1 failed, 33 total
- Tests: 1454 passed, 14 failed, 1 todo, 1469 total
- Failing file: `tests/unit/support-answer-context.test.ts`
- Log: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_COMPOSE-suite.log`
- Log SHA-256: `3b565dd3eace1d9432dc59e9ea129b3cb3a9ed94598058e72c2e97c54287f950`

The failures form one observed boundary family: six fixtures do not select their expected source and return `NO_SOURCE` or an empty prompt; seven downstream rejection cases consequently never call the completion port; the diagnostic identity case consequently emits zero of two expected records. The evidence does not yet distinguish stale fixture construction from a production retrieval regression. It is an unresolved product/test integration defect at the frozen revision, not a successful final union.

Separately, the orchestrator routed a read-only preview finding at the same revision: menu-location prompts for active sessions and account deletion are classified as `REFUSE_ZONE /settings` despite the public-guide boundary treating them as public menu guidance. That correction must land before final composed verification.

## Deferred commands

The typecheck and `support:eval` commands were not started. The orchestrator explicitly directed that not-yet-started broad checks wait for the bounded product correction. No live relay, browser, model, preview, account, or recovery request ran in this node.

## Disposition

`BLOCKED_BY_ROUTED_PRODUCT_DEFECT`. This report does not approve correctness, security, product quality, owner acceptance, or a checkpoint. The valid snapshot receipt and failed suite receipt are retained for the correction and later recomposition.
