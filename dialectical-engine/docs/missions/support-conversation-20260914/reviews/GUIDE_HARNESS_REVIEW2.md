# GUIDE_HARNESS_REVIEW2

- Node: `GUIDE_HARNESS_REVIEW2`
- Ticket: `t_3edc6ad2`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T13:51:09Z`
- Immutable product revision: `c34c64d4e643e404cefe96dfaf167536ae364a94`
- Bound KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Frozen executable harness digest: `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Review mode: `immutableGitObjects`
- Verdict: **PASS_BOUNDED_C34_CORRECTIONS_REBIND_REQUIRED**

The copied FIX2 harness corrects GH-R1 and GH-R2. This is a finite static/inert review result for the harness at `c34`; it is not proof for the coming guard-corrected product, a live-preview result, checkpoint readiness, or owner acceptance. No browser, HTTP, database, Support, model, preview, product, Git, service, counter, or limit action occurred in this review.

## Prior finding dispositions

### GH-R1 — PASS at the reviewed harness bytes

The driver now realizes the declared five-session schedule instead of relying on same-origin remounts to create sessions.

- `session-lifecycle.mjs:7-16` classifies group 0 as `FRESH_PROFILE`, every language transition as `LANGUAGE_SELECTOR_RESET`, and every same-language transition as `STORAGE_RESET_BEFORE_REMOUNT`.
- `capture-public-guide.mjs:275-315` iterates the five declared groups directly. Same-language full/compact boundaries remove only `debateai.support.conversation.v1`, verify the key is absent, and remount the next surface. Language boundaries continue to exercise the product selector invalidation.
- The shared lifecycle observes the actual session ID from each create-session response, retains only its SHA-256, requires exactly one new distinct session by the first response in each group, and requires no later replacement inside that group (`session-lifecycle.mjs:18-83`; capture lines `113-126`, `299-315`). A persistence defect therefore fails on the first affected group response rather than after all 54 rows.
- The positive control proves five distinct sessions across group sizes `1,14,13,12,14`. Controlled negatives prove that same-origin navigation preserves the stale session without the reset, a failed storage removal stops before remount, stale-session reuse fails at the first group response, and an unexpected replacement inside a group fails immediately (`verify-guide-harness.mjs:108-172`). These controls call the same reset and lifecycle functions imported by the capture.
- The immutable product consumer is bound by the unchanged `Assistant.tsx` SHA-256 `5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3`, independently confirmed from Git object `c34c64d4...`. Static inspection retains the prior fact that this component restores `sessionStorage`, clears a session on language change, and otherwise reuses a matching stored session.

The proof is static/inert: it does not assert that a browser was launched in this node. The later one-shot receipt must show five `groupSessionEvidence` rows, five distinct identity hashes, exactly five create-session responses, and the expected group sizes.

### GH-R2 — PASS at the reviewed harness bytes

The proof is now mechanically bound to product revision, KB version, and the executable harness.

- `controls.mjs:14-20` defines an exact schema-2 proof and an ordered eight-file executable manifest.
- `controls.mjs:50-59` hashes path, byte count, and SHA-256 for those eight files into one deterministic harness digest.
- `controls.mjs:72-101` requires exact proof keys, `schemaVersion=2`, `result=PASS`, `revision===finalCommit`, `kbVersion===expectedSnapshotVersion`, `harnessSha256===the recomputed digest`, and a successful internally consistent control count.
- `pre-request-verifier.ts:193-206` reads the bound proof and performs these comparisons before product loading, Playwright launch, or Support traffic. It later compares the loaded corpus to the same expected KB (`236-242`).
- Known-bad controls reject a successful proof from a stale revision, wrong KB, or changed harness (`verify-guide-harness.mjs:552-571`). The emitted proof carries the actual branch verifier's revision and corpus KB (`584-606`).

All 25 indexed artifacts matched their frozen hashes and sizes. An independent manifest calculation reproduced `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917` from these exact files:

1. `capture-public-guide.mjs`
2. `controls.mjs`
3. `matrix.mjs`
4. `pre-request-verifier.ts`
5. `runtime-capacity.mjs`
6. `session-lifecycle.mjs`
7. `verify-final-branches.ts`
8. `verify-guide-harness.mjs`

## Required final rebind before LIVE

The historical 62/62 proof is valid only for product `c34c64d4...` and KB `fd3c63e...`. The five separately reported guard-policy failures mean the final product will have another revision. Before any LIVE traffic:

1. Finish the guard correction and compose one exact clean final product revision `F`.
2. Keep the reviewed eight FIX2 executable files byte-identical. Their recomputed digest must remain `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`. Any harness-byte change requires a new separate harness review.
3. Run the frozen FIX2 frame once against clean `F`. Its new schema-2 proof must say `result=PASS`, `revision=F`, carry the corpus KB `K`, retain the reviewed harness digest, and report every declared control passed.
4. Generate final product inventory, attestation, and the required 33-file suite receipt for the same `F` and `K`.
5. Freeze the new proof path and SHA-256 into the static LIVE gate. After supported stack readiness, add only the fresh runtime-capacity path and SHA-256. The pre-request verifier must recompute the harness digest and prove equality across gate, proof, product revision, corpus KB, suite, attestation, inventory, and capacity before Playwright starts.

The `c34` proof cannot be copied, relabeled, or reused for `F`.

## Retained dispositions

| Area | Disposition | Boundary |
|---|---|---|
| Canonical matrix | PASS retained | Matrix is byte-identical to the reviewed predecessor: 54 unique rows; 20 families across EN/RO and full/compact; 2 private, 2 injection, 10 recovery. |
| Static branch derivation | PASS at `c34` only | 42 model, 2 private refusal, 2 injection refusal, 8 deterministic recovery. Public location failures are not normalized. Must rerun at `F`. |
| Session lifecycle | PASS corrected | Five direct group transitions; exact first-response creation and distinct-identity checks; no within-group replacement. |
| Pacing and capacity arithmetic | PASS retained | Five groups of `1,14,13,12,14`, 31,000 ms request-start spacing, and 42-model ceiling remain coherent. |
| Privacy and forbidden operations | PASS statically | Anonymous visitor; no private controls; zero answers/consent operations; deterministic private/injection and actionless recovery assertions. |
| Model/fallback attribution and API/DOM | PASS retained | Exact visible/API comparisons and diagnostic-window attribution; ambiguous evidence fails. |
| Navigation | PASS with receipt review required | Exact bound action id/label/href is checked before pointer/keyboard activation; later consumer must inspect recorded destination and sealed screenshots. |
| Runtime-capacity projection | PASS as inert contract | Fixed-key counts-only aggregate; no identifiers, rows, text, credentials, or private records; stale/missing/insufficient facts fail before Playwright. No values were measured here. |
| Runtime race | LIMITED retained | The fresh snapshot is not a reservation and unrelated traffic can consume capacity during the paced run. The one-shot failure receipt must be preserved without favorable retry. |
| Failure/evidence preservation | BOUNDED retained | Checkpoints preserve rows/failure and the existing receipt blocks rerun. The final consumer must seal the receipt and screenshots with hashes. |

## Evidence

- Author FIX2 proof: 62/62, `rc=0`, SHA-256 `a604c80cf9e8f359f6801ca8b55473e9f228a451b834fe3053227b730c97febc`, 3,741 bytes. It is explicitly historical at `c34`.
- Input-custody log: all 25/25 indexed inputs matched.
- Independent ordered-manifest recomputation: digest `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`, matching the proof.
- Local detached checkout remained clean at older `af02290219c734d2ad2fe7df878356fec9043b15`; product consumers were inspected through immutable Git objects.

No independent inert rerun was needed: the frozen proof, exact code paths, controlled negatives, immutable product consumer, and independent hash recomputation were sufficient for this bounded recheck. The product and source lanes remain unchanged.
