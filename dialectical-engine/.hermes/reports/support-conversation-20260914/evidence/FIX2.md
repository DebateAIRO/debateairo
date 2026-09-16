# FIX2 evidence

- Ticket/session: `t_5bea68d5` / `/root/requirements`
- Finding: `t_8596ccbc`
- Input revision: `085fff68f8b22743978d1efafd7ad9fd204e5a6f`
- Scoped correction commit: `82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0`
- Status: READY FOR PEER REVIEW. This author does not claim LIVE2 success, CP1 readiness, owner acceptance, or ticket completion.

## Diagnosis

The earlier LIVE matrix established six `REFUSE_SAFETY` outcomes and one `ANSWER_GROUNDED` outcome, but retained no secret-safe rejection category for the six refusals. Their exact rejection predicate remains **UNKNOWN**. The absence of a native model response-format option was not measured as a cause and `model.ts` was not changed.

The static context probe did establish an independent producer defect. Before correction, ordinary EN/RO creation queries omitted `getting-started-debate`; the selected action list could include lower-scoring unrelated capabilities; and the model received catalog routes without an explicit final list of allowed source/action IDs. The earlier successful EN export did include reviewed export sources. This evidence justified a deterministic selection and explicit-ID contract correction, but it does not retroactively identify the six rejection predicates.

The diagnostic boundary was implemented before the producer correction. `diagnoseSupportDraft` returns one closed enum plus booleans, counts, and an optional code-point length. The answer service reports only rejected structured completions, and production projects the report to `SUPPORT_DRAFT_<FIXED_ENUM>`. Synthetic hostile bytes and forged identifiers are absent from serialized diagnostic output. There is no public diagnostic response field and no raw completion persistence or logging.

One authorized actual pre-correction request used the actual Support API, normal TLS, ordinary admission, and unchanged relay with no synthetic override or credential/recovery operation. It returned HTTP 200 / `ANSWER_GROUNDED`, one source, and no actions; its inferred fixed category is `ACCEPTED`, so no rejection callback fired. This stochastic observation did not reproduce the prior failure and was not retried. Prompt-only structure remains a hypothesis.

## Correction

`buildSupportKnowledgeContext` now:

- detects ordinary EN/RO intent forms with a bounded common-prefix rule (minimum four characters and 75% of the shorter token);
- ranks reviewed capability `articleIds` ahead of lexical-only matches, using `capabilityScore * 1000 + articleCount - articleIndex` and lexical overlap as a secondary score;
- takes requested actions only from the highest-scoring capability cohort, deduplicated and capped at three;
- retains the complete compact policy/catalog, at most three whole immutable article sections, and the 24,000-code-point cap; and
- reserves space for a final `OUTPUT CONTRACT` containing the exact selected `sourceIds` and `actionIds` or `none`.

The structured EN/RO instruction tells the model to copy only identifiers from that final contract, cite at least one source, avoid placing routes/paths in text, and express navigation through `actionIds`. Strict four-key parsing, text screening, source/action membership validation, immutable snapshot use, no retry, usage and relay semantics, and deterministic safe replacement remain unchanged.

The corrected static probe resolves:

| Topic | Sources | Actions | Code points |
|---|---|---|---:|
| EN creation | getting-started-debate; debate-topic-and-description; risk-tier-choice | start-debate | 2923 |
| RO creation | getting-started-debate; debate-topic-and-description; risk-tier-choice | start-debate | 3256 |
| EN settings | account-settings; privacy-consent; unsupported-capabilities | settings; privacy-preferences | 3336 |
| RO settings | account-settings; privacy-consent; unsupported-capabilities | settings; privacy-preferences | 3724 |
| EN export | guide-how-it-works; export-json; publish-a-debate | owner-debate | 2868 |
| RO export | guide-how-it-works; export-json; publish-a-debate | owner-debate | 3177 |

Every probe context retained all 11 catalog route tokens. No catalog, article, model-adapter, migration, UI, credential, or owner-ratification bytes changed.

## TDD and verification

- Diagnostic RED: 1 file failed, 2 assertions failed and 32 passed. Corrected diagnostic GREEN: 1 file / 34 assertions passed. The intermediate GREEN attempt failed one category-order assertion before correction.
- Reporter RED: 1 file failed, 1 assertion failed and 2 passed. Reporter GREEN: 1 file / 3 assertions passed.
- Producer RED: 2 files failed, 21 assertions failed and 10 passed. First producer GREEN: 3 files / 65 assertions passed.
- Exact action-contract RED: 2 targeted assertions failed. GREEN: both targeted assertions passed with 28 unrelated assertions skipped.
- The first focused aggregate caught one Romanian false-positive while 100 assertions passed. After tightening the morphology boundary, the final focused aggregate passed 4 files / 101 assertions.
- The first final typecheck found seven introduced diagnostics in owned paths in addition to the inherited repository failures. After correction, `FIX2-typecheck-final2.log` is byte-identical to the attributed `UI-root-typecheck.log`: SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`, repository rc 1 with the same 76 inherited diagnostics and zero introduced diagnostics.
- `git diff --check` passed before the scoped commit. The commit contains exactly seven authorized product/test paths.

## Restored boundary mutations

- Removing capability article weighting failed 20 selection assertions while 4 passed and 6 were skipped.
- Omitting the final output contract failed 2 contract assertions with 31 unrelated assertions skipped.
- Suppressing the rejected-draft diagnostic callback failed 1 assertion with 2 unrelated assertions skipped.
- After restoration, 2 files passed 27 relevant assertions with 6 unrelated assertions skipped.

## Runtime custody and remaining evaluation

The single actual diagnostic ran against supervisor PID/PGID 95978, launched by the existing `support-preview` `pnpm dev:auth:up` lifecycle before producer behavior changed. That runtime therefore represented the diagnostic-only pre-correction producer. A handoff-time normal-TLS request to `https://localhost:3100/help` could not connect, so no running preview is claimed. LIVE2 must start or reload the supported isolated stack at commit `82f57f1e` before its finite actual matrix. No further actual request was made by FIX2.

Actual usage UNAVAILABLE.
