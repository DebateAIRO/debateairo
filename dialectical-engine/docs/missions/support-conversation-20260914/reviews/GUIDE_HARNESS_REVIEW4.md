# GUIDE_HARNESS_REVIEW4

- Node: `GUIDE_HARNESS_REVIEW4`
- Ticket: `t_35c31e86`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T18:02:24Z`
- Immutable product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Bound KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- FIX4 executable harness digest: `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Verdict: **PASS_BOUNDED_FIX4**

FIX4 resolves GHR3-R1. It can proceed to the separately gated fresh LIVE3 attempt. This verdict covers the corrected inert harness and copied adapter only; it is not actual 54-row evidence, preview readiness, checkpoint acceptance, or owner ratification.

## GHR3-R1 disposition — PASS

`controls.mjs` now exports `activateGuideNavigation`, and `capture-public-guide.mjs` imports and invokes that exact hashed helper after retaining the existing action-id, label, and href check.

The helper resolves the expected href against the configured base URL, validates the requested input kind and callback, and performs the real pointer or keyboard callback before evaluating the destination. When the normalized starting URL already equals the expected destination, it skips only the impossible transition wait and still reads and requires the exact final URL. When they differ, it waits for the exact expected URL and then independently reads and requires equality. Every successful result therefore has `performed:true` and an exact destination; a wrong destination fails closed.

The four new inert controls call the same exported helper consumed by the capture:

1. Same-destination pointer Help invokes the pointer callback once, performs no transition wait, and returns exact `/help` equality.
2. Changed-destination keyboard Help invokes the keyboard callback once and waits for the exact `/help` URL.
3. A final `/settings` URL is rejected when `/help` was expected, after proving one activation attempt.
4. A missing requested activation callback is rejected before any destination read.

These controls are discriminating for the prior defect. The existing exact-link check in the capture remains outside the helper and unchanged.

## Retained dispositions and bindings

- The 54-row matrix SHA-256 is unchanged from FIX3: `4614aae275462568eed6277c78193d252c441cd47c28bd37021de4d43ba91957`. The earlier rows 53/54 oracle, other 52 rows, genuine-recovery actionlessness, API/DOM, privacy, session, pacing, capacity, and no-retry dispositions remain in force.
- The other five executable files are byte-identical. The two changed executable consumers (`capture-public-guide.mjs`, `controls.mjs`) and changed verifier are included in the same ordered eight-file digest as every retained dependency. Independent recomputation produced `4768a8b5296ca5838fa6e2588be5cebc537b2613513239e434f0cd60bd7c7c9e`.
- The schema-2 proof binds exact product `f3be0af8…`, the 44-entry KB `fd3c63e4…`, the new harness digest, and 69/69 controls: 65 retained plus four navigation controls. Its SHA-256 is `9a80055910e14e988c76ebeaa4faf92eb57ddd84749443d0431e46fcd9ffa654`.
- The copied FIX4 adapter pins the unchanged matrix/verifier identities and new full-eight digest before dynamic imports, then requires constructor proof equality before successful projection. The copied mutation negative remains 3/3 with zero importer calls and zero successful rows.
- The capture profile is isolated under `GUIDE_HARNESS_FIX4`. The fixed actual receipt and screenshot namespace remains intentionally unchanged for the future one-shot consumer. Receipt, row screenshots, and profile were absent during this review.

All 59 REVIEW4 indexed inputs matched their frozen SHA-256 and byte counts. This recheck reused the sealed REVIEW3 dispositions and did not repeat its 71-input whole review.

No test, probe, browser, HTTP, database, Support, model, runtime-capacity, product, source, Git, or private-data action occurred. The author’s 69/69 proof is inert evidence at `f3`, not a valid-gate actual-product replay or live result. Existing Forgot navigation remains unresolved and actionless.
