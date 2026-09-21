# GUIDE_NAVFIX evidence

- Ticket/session: `t_1369cb3c` / `/root/requirements`
- Base: `9bf56f95711d19e6405fff5db06c4ad3d606bd68`
- Product commit: `3d0ad7acaab0ff90bd783a6948bf99f117d74fe2`
- Scope: exactly five authorized files; product worktree clean after commit.

## Cause and correction

The deterministic classifier matched session and account-erasure nouns before the ordinary public answer path, while the public-guide boundary had no shared predicate for location guidance versus an account operation. The boundary also omitted sessions/devices from private record nouns, allowing “Show my active sessions” to look public.

The correction adds a shared clause-aware account-location predicate over the classifier's already prepared views. Only the session and account-erasure zone rules yield to that predicate. An affirmative operation in a separate clause remains a zone refusal; a negated operation followed by a location question remains public guidance. The private-record boundary now treats actual session/device reads as private. Recovery, credential, injection, current-message language, and unrelated zone rules are unchanged.

## Captured verification

- RED: 3 files, 9 failed / 542 passed. It reproduced the three reported route failures, five classifier failures, and the missing private-session record control.
- GREEN attempt 1: 4 files, 3 failed / 668 passed. It exposed one Romanian mixed-clause miss and two normalization-count invariants.
- GREEN attempt 2: 4 files, 3 failed / 668 passed. It isolated a Unicode word-boundary defect for Romanian `ș`.
- Final GREEN: 4 files, 671/671 passed. Membership: classifier, public-guide boundary, recovery-intent neighbor, and support routes; `--maxWorkers=1`.

The route tests prove that the three public menu questions call the bounded answer port and return grounded `settings-help-menus` provenance. Private session reads and affirmative/mixed account operations return `REFUSE_ZONE` with zero answer-port calls.

## Preserved boundaries and limits

- KB components SHA-256: `0c06363ee4409efe96807786ad96ed73e46659481f61c56e957eeb340fff3b94`
- Review manifest SHA-256: `6df66c5c9cdecde4a6eb2f38c6da2659310581b55f3bec130451040aa4c66849`
- No KB/content/manifest, model, prompt, evaluator, UI, preview, provider, account, or recovery operation changed or ran.
- The separate 14-case answer-context composition failure was not diagnosed or modified here.
- No 33-file union, typecheck, evaluation, acceptance, or readiness claim belongs to this node.

