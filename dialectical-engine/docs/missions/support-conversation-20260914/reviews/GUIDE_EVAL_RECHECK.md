# GUIDE_EVAL_RECHECK — bounded evaluation correction recheck

## Verdict

**PASS for the assigned B1/B2 correction.** Revision `141f04726e12e40c85fccfb75473cfd684bcf230` repairs the evaluator/corpus mismatch and the bounded retrieval defects reported in `GUIDE_EVAL_REVIEW`. This is a structural correction verdict only. The isolated evaluator intentionally exits `1` because its independent quality rubric remains `PENDING`; no full-evaluation, live-model, or answer-quality PASS is claimed.

Both the detached reviewer lane and the frozen primary product lane were clean at the exact revision before and after the checks. All 43 indexed review inputs matched their recorded SHA-256 and byte counts.

## Finding dispositions

### B1 — resolved: production-equivalent immutable fixture and strict response contract

`tests/support-eval/run.ts` now loads the exact reviewed manifest, recovery components, and article content with `requireReviewedRecovery:true`, pins the resulting snapshot, enables `requireStructuredDraft:true`, and reports the exact `kbVersion` `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`. The deterministic relay consumes the output contract's opaque source and action references and returns the strict four-key JSON object. It does not read case expectations or canonical identifiers to manufacture the answer.

Focused fixture and consumer tests passed 83/83. They cover discovery, immutable corpus use, strict draft shape, outcome/language/source/tool assertions, latency failure behavior, pending-rubric reporting, and the in-process API over disposable PostgreSQL. The first sandboxed attempt reached 82/83 and failed only because binding `127.0.0.1` was denied with `EPERM`; the approved rerun passed all 83 and shut PostgreSQL down cleanly.

### B2 — resolved for the frozen corpus and assigned controls

The exact producer is `packages/support-kb/src/context.ts`. It now requires meaningful article or capability evidence, ranks direct article relevance ahead of unrelated sibling order, and keeps the complete compact catalog available to the model contract. The exact immutable 26-case matrix passed: all 20 class-A prompts contained their required-source subsets, and all six class-B prompts returned empty source and action sets. This resolves the six positive omissions and five negative admissions from the prior review without weakening their expected outcomes.

The independent menu-family probe used the exact detached catalog, context, loader, manifest, recovery components, and article bytes. All 40 bilingual family rows selected their required source (`40/40`, rc `0`) at the exact `kbVersion`. The focused tests also cover eight representative bilingual menu prompts, required or allowed action sets, untrusted debate identifiers, operator paths, external URLs, product aliases, unsupported medical/investment/trading topics, and named-feature precedence.

The context test's owner/public action availability is a selector control, not a production grant. `packages/support-kb/src/navigation.ts` resolves `owner-debate` and `public-debate` only from trusted valid identifiers, and the production caller supplies only action IDs resolved for the current request. The negative action controls remained green.

## Retained class and runner evidence

The isolated one-run structural evaluator produced `60/60`: A `20/20`, B `6/6`, C `10/10`, D `12/12`, E `6/6`, F `3/3`, and G `3/3`. Class E therefore retains six fixed public-boundary refusals under the corrected fixture. No private calls were introduced by the four-file correction, and the controlled relay made no model or network request.

All printed deterministic latency thresholds passed. `real_first_token` remained `NOT_APPLICABLE`. The evaluator then correctly printed `rubric: PENDING (independent-eval-author)` and `VERDICT (worst run): PENDING (run 1)`, returning rc `1`. That nonzero result preserves the release gate: structural correctness is demonstrated, while independent answer quality is still unmeasured.

## Custody and limits

Before execution, matching hashes were proved across the detached and frozen primary copies of the context, catalog, loader, navigation, review manifest, recovery components, kernel, evaluator, and two focused test files. Five temporary read-only dependency links pointed only to the same frozen revision and were removed afterward; every allowed link path is recorded `ABSENT`. Both product lanes remained clean at `141f04726e12e40c85fccfb75473cfd684bcf230`.

No product, source, Git, index, KB, metadata, model, HTTP, browser, private-data, recovery, or acceptance action occurred. The 40-row reviewer probe establishes source reachability for those frozen menu-family rows; it is not a corpus-wide quality or action-safety audit. User acceptance and the independent quality rubric remain outside this verdict.

## Evidence

- Input custody: `.hermes/reports/support-conversation-20260914/logs/GUIDE_EVAL_RECHECK-input-custody.log`
- Dependency custody and cleanup: `.hermes/reports/support-conversation-20260914/logs/GUIDE_EVAL_RECHECK-dependency-custody.log`
- Sandboxed focused attempt: `.hermes/reports/support-conversation-20260914/logs/GUIDE_EVAL_RECHECK-focused.log`
- Approved focused rerun: `.hermes/reports/support-conversation-20260914/logs/GUIDE_EVAL_RECHECK-focused-escalated.log`
- Isolated structural evaluator: `.hermes/reports/support-conversation-20260914/logs/GUIDE_EVAL_RECHECK-isolated.log`
- Independent menu-family probe: `.hermes/reports/support-conversation-20260914/probes/GUIDE_EVAL_RECHECK/menu-neighbors.mts` and `menu-neighbors.json`

