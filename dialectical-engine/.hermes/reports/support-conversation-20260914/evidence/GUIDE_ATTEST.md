# GUIDE_ATTEST evidence

Node `GUIDE_ATTEST`, ticket `t_c6f60eaf`, session `/root/requirements` executed PG-5 from exact clean product base `af02290219c734d2ad2fe7df878356fec9043b15`. The scoped product commit is `cd4f6d62c64d0abe8df9061ac5869930425beb5e`.

## Change

The review manifest now binds the eight public-guide article/projection/fallback records to the separate Sol editorial recheck:

- reviewer: `SOL`
- native reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- reviewed on: `2026-09-17`
- evidence: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/reviews/GUIDE_EDITORIAL_RECHECK.md`
- component file SHA-256: `0c06363ee4409efe96807786ad96ed73e46659481f61c56e957eeb340fff3b94`
- catalog SHA-256: `fab7050104b5cab6f861c59a9e72e824ace40a27278573c09dddbe71e1b51acc`

The eight records are `app-navigation.{en,ro}`, `debate-workspace-menus.{en,ro}`, `settings-help-menus.{en,ro}`, and `support-status-limits.{en,ro}`. Every one retains `ratifiedBy: ""` and `ratifiedOn: ""`. A mechanical before/after comparison confirmed that all 24 unaffected article bindings and all 36 unaffected recovery bindings retain their prior values.

## Verification

All commands used the repository `run-capture.sh` with unique absolute logs and Vitest `--maxWorkers=1` only.

- START at the exact base: `GUIDE_ATTEST-start.log`, rc 1, 42 passed / 1 failed. The existing 38-record attestation expectation rejected the unadmitted current corpus.
- Meaningful RED after expressing the reviewed 44-record contract but before manifest mutation: `GUIDE_ATTEST-red.log`, rc 1, 42 passed / 1 failed.
- First post-manifest frame: `GUIDE_ATTEST-green.log`, rc 1, 41 passed / 2 failed. The two failures were pre-attestation transition assertions in `tests/unit/support-kb.test.ts` that still required 26 articles and a rejected current component set. This exact dependency was reported before edit and authorized by `GUIDE_ATTEST-scope-amendment1.json`.
- Final amended focused frame: `GUIDE_ATTEST-green-final.log`, rc 0, 43 passed / 0 failed across `support-recovery-attestation`, `support-recovery-components`, and `support-kb`.
- Exact custody probe: `GUIDE_ATTEST-corpus.log`, rc 0. It validated all eight real review bindings, blank guide owner fields, immutable strict loading, and the canonical digest relation.

The exact admitted corpus is 44 language records / 22 bilingual logical pairs, with 32 article review bindings, 16 peer-reviewed preview pairs, 6 owner-ratified pairs, zero ignored records, and zero recovery owner ratifications. The canonical corpus digest and `kbVersion` are both `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`. The manifest file SHA-256 is `6df66c5c9cdecde4a6eb2f38c6da2659310581b55f3bec130451040aa4c66849`.

## Limits

This node copied a real separate editorial decision into admission metadata. It did not edit guide content, catalog source, component source, navigation, runtime behavior, private records, credentials policy, model/provider behavior, or the unresolved Forgot-password destination. It does not claim owner ratification, checkpoint acceptance, whole-suite composition, preview readiness, or final correctness/security review.
