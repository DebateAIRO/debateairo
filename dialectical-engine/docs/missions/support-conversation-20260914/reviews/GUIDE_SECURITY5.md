# GUIDE_SECURITY5 — closed-navigation intent recheck

**Verdict: PASS for the finite implemented scope**  
**Node:** GUIDE_SECURITY5 (`t_2d56ae72`, `/root/forgot_destination`, gpt-5.6-sol)  
**Revision:** `f3be0af81f1691db6c23494f9e286bb6b10f13bf` over `c8784902f78ed4ba1d637d122e1f32f598415f4e`

The exact 18-case matrix that previously exposed seven unwanted public-link admissions and one Romanian source loss now passes 18/18 through the actual context module. The three changed authored files pass 183/183, including service-level checks that excluded the negated action reference from both the model contract and returned action sink. No new same-class failure appeared in this bounded recheck.

## Prior finding dispositions

| Preserved case | Required result | Observed result |
|---|---|---|
| Privacy preferences; do not open Active sessions | only `privacy-preferences` | passed |
| Settings; do not open account deletion controls | only `settings` | passed |
| Pricing, not Method | no action; reviewed source retained | passed |
| Help; do not open service status | only `help` | passed |
| Method; ignore Transcripts | only `method` | passed |
| Public library; do not open my debates | only `public-catalog` | passed |
| Romanian Privacy; do not open Active sessions | only `privacy-preferences` | passed |
| Romanian Pricing, not Method | no action; `app-navigation` retained | passed |

The four positive navigation controls retained their exact closed actions, four prose-only controls retained reviewed sources without actions, and the external-URL and operator-path controls emitted no actions. All 18 contexts excluded the 79 exact private custody markers harvested from the reviewed corpus.

## Source-to-sink assessment

The correction defines each visitor-visible label with an article and optional action binding in [catalog.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/catalog.ts:61) and keeps the destination set in the closed action catalog at [catalog.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/catalog.ts:105). `affirmativeQuery()` splits bounded clauses and removes each recognized negated tail before source and action matching at [context.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts:151). Action evidence is derived from that affirmative text and must share an article binding with a matched capability at [context.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts:333). The output contract contains only the resulting request-local references.

The unchanged answer consumer validates model references against that request-local set at [answer.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts:304) and resolves accepted action IDs through the unchanged closed resolver at [answer.ts](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts:355). The two service-level EN/RO negation controls passed. This establishes the bounded link-admission correction; it does not establish a complete natural-language negation grammar.

## Retained boundaries

The complete product delta from prior reviewed `91d17ae2` is exactly the five packet paths. The answer pipeline, public-guide boundary, recovery intent, response policy, security guidance, corpus loader, navigation resolver, recovery module, and all nine role/data-source defining files have exact object identity with `91d17ae2`. Their prior private-data, credential, boundary, safe-resolution, and genuine restricted-role evidence is therefore retained without repeating the 31+4 matrices or database probe. The changed catalog was rechecked directly by the matrix and architecture controls.

## Execution and custody

- Preserved context matrix: SHA-256 `ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad`, declared/observed count 18, **18/18**, `rc=0`.
- Changed authored controls: `support-catalog-coverage`, `support-context`, and `support-answer-context`, **183/183**, `rc=0`.
- Pre/post custody: 81 indexed inputs, 143 product files, and three expected deletions matched; detached and primary lanes were clean and exact at `f3be0af81f1691db6c23494f9e286bb6b10f13bf`.
- Package, lockfile, workspace, public corpus, recovery corpus, catalog, and navigation identities matched across lanes. All five temporary dependency links were removed before handoff.

## Limits

This PASS covers the preserved 18 cases, the five-path delta, three changed authored files, and unchanged immediate consumers. It is not a formal proof for every EN/RO clause, negation, or label paraphrase. No full33, typecheck, 31+4 rerun, database rerun, model, browser, UI click, live API, private record, credential, account action, or recovery traffic was used. The owner-confirmed Forgot destination remains unknown and actionless. Usage was unavailable. No checkpoint acceptance or readiness is claimed.

## Skills loaded

`superpowers:using-superpowers`; mission `heartbeat-protocol`; mission `heartbeat-reviewer`; `superpowers:verification-before-completion`; `superpowers:systematic-debugging`; `superpowers:test-driven-development`; `codex-security:attack-path-analysis`.
