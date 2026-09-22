# GUIDE_HARNESS_REVIEW12 — compact precondition and UI-probe review

- Ticket: `t_ff1f66fa`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T14:38:57.303790Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `1f68a2eae641e4bce894bb51d99d09a75abaf74c`
- Verdict: **PASS_BOUNDED_COMPACT_PRECONDITION_AND_PROBE_CONTRACT**

## BIND13 correction

The exact bounded harness correction passes.

`openGuideSupportSurface` is the single opening contract used by both the actual capture and prepared UI probe. For compact mode it:

1. navigates and waits for the current toggle to become visible with an attached React `onClick` producer property;
2. records a fixed `BEFORE_INTERACTION` projection and requires exactly one visible toggle in `COLLAPSED`/`aria-expanded=false` state;
3. invokes the actual producer's `toggle.click()` once;
4. records `AFTER_INTERACTION`, waits for a visible composer, and then requires the `READY` projection to show `EXPANDED`/`aria-expanded=true`, one visible panel, one visible compact root, and one visible composer;
5. selects language only after the surface is ready.

There is no blind transition delay, repeated click, favorable retry, or weaker opening helper. The capture retains its earlier bounded diagnostic-log settling delays after responses; those delays are outside this UI transition and do not substitute for hydration or readiness predicates.

The observation has an exact key set and closed enums for phase, hydration, visibility, widget state, expanded state, URL class, and console categories. Missing or ambiguous state remains `UNKNOWN`. Counts are nonnegative integers. Failures record only a fixed code plus the last safe projection; arbitrary exception text, DOM, headers, cookies/storage, private records, capabilities, and response bodies do not enter the transition evidence.

## Control and custody disposition

The prior 116 proof names are retained as an exact ordered prefix. The four appended controls discriminate malformed/extra projection data, hydration and duplicate-toggle failures, exact hydrate-before-one-click ordering, and a closed failed-transition discriminator. The sealed proof is 120/120 with 120 unique names.

The ordered-eight digest independently recomputes to `4a73ade641ff12f9772aed1d858bf3694224b256d43babed528fa85120a58646`. Matrix bytes remain `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; the shared pre-request verifier remains `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`. FINAL9 binding, the exact 34-file suite, 54-row matrix/branch proof, adapter 3/3 negative controls, loader argv, response and diagnostic projection, sources/outcomes/actions/API-DOM equality, credential/private boundaries, lifecycle, pacing, capacity, navigation, and zero-retry rules remain retained.

All 139 REVIEW12 indexed inputs matched their frozen hashes and byte counts. All 57 future GUIDE13 receipt, screenshot, probe-output, and profile paths were absent.

## Prepared operational probe

Executable:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND13/probe-zero-request-ui.mjs`

Exact argv:

`node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND13/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json`

CWD is the exact clean product checkout. Prerequisites are an independently verified exact-revision owned preview, ordinary system TLS at `https://localhost:3100`, the pinned installed Playwright Chromium, and an absent output path. Direct stdout/stderr redirection to `GUIDE_UI_TRANSITION_PROBE-LIVE8.log` preserves the Node child status; the documented command has no `tee` pipeline.

The fresh isolated profile performs exactly: full EN, same-session full RO, storage-reset compact RO, route-remount full EN, storage-reset compact EN. Both compact transitions use 390x844 and one toggle click. The guard aborts Support status, create-session, send-message, and other Support routes before runtime and never fulfills or substitutes a response. A passing result requires zero create-session, send-message, and other-Support attempts, five transitions, visible composers, and no private controls. Blocked status attempts are counted separately: they are browser attempts, while `actualSupportRequestsForwarded: 0` means no Support request was transmitted to runtime. A failure is finite, fixed-shape, and exits nonzero without retries or application/private-storage mutation; only the probe-owned temporary profile and the specified session key are reset.

## Limits

The UI probe was prepared but not executed. No synthetic response or actual Support/model request was produced. The exact LIVE7 failure cause remains unknown, and this review infers no product defect. No new 54-row run, fresh capacity measurement, capture, readiness, acceptance, or checkpoint claim exists. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 gated.

No test, browser, runtime, HTTP, DB, status, capacity, Support, model, product, KB, Git, harness, or predecessor mutation ran. No heavy or Git lease was requested.
