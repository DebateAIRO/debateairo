# GUIDE_HARNESS_REVIEW13 — full-view readiness and route-guard review

- Ticket: `t_e49fe2f9`; run `192`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T15:14:44.968438Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `496335c2bd042ee3a2df6ae7ab39ded4e2db6a92`
- Verdict: **PASS_BOUNDED_FULL_READINESS_AND_ROUTE_GUARD**

## Full-view readiness and state preservation

The exact BIND14 correction passes its bounded static review. The failed preflight established only that the first three transitions passed and the route-remount full-EN transition rejected the old React-private EN-button `__reactProps$` `onClick` predicate while a composer was visible. It did not establish a product defect or the cause of LIVE7. BIND14 replaces that harness predicate with supported public behavior and retains every substantive readiness guard.

`proveGuideFullReadiness` now requires the expected `/help` route, exactly two visible language controls, exactly one active requested locale, exactly one visible composer, and exactly one visible display-mode toggle. It proves interaction readiness by changing the public display mode once and restoring it, then reasserting the complete projection. This interaction affects document/local-storage display mode only. Current `ModeToggle.tsx` does not touch Support session or message state.

Language selection is conditional. `selectLanguageIfNeeded` returns without clicking when the desired locale is already active. This matches current `Assistant.tsx`: `chooseLanguage` immediately returns when `next === activeLanguage`; a real locale change resets the Support session, changes the language and maps the existing transcript. The harness therefore avoids using a destructive language action merely to prove hydration.

The regression controls are meaningful rather than empty-state-only:

- a same-locale fixture begins with `session: "nonempty-session"`, seven messages and locale EN, stubs language activation to reset the session, and requires zero activations plus exact state equality;
- a different-locale fixture requires exactly one activation and preserved transcript content;
- incomplete full projections, nonfunctional public toggles and full-readiness state mutation fail;
- the capture and the prepared probe import the same corrected readiness helper.

Every capture call site preserves the exact five-session plan. The fresh full-EN group uses the same-locale short circuit. The full-RO and later full-EN transitions perform language activation only at their planned group/reset boundaries. The compact groups retain the reviewed hydration-before-one-click helper at 390x844. The final capture invariant still requires `createSession === GUIDE_SESSION_GROUPS.length`; BIND14 does not add a session, message, retry or favorable reset.

## Support route classifier

The clarified classifier is exact and fail-closed. Current `CaseView.tsx` mounts `OwnCaseLookup`, which issues `GET /api/v1/support/cases`; `help/page.tsx` mounts that component. BIND14 classifies only that exact method and path as `pageCaseListRead`. It remains a Support API attempt, not public data, and the probe aborts it before transmission without fulfilling or substituting a response.

Status, session creation and message sending remain separate categories. Method mismatches, tokenized case paths and unknown `/api/v1/support/*` paths remain `otherSupport`. The fixed controls cover exact case-list recognition and method/token/unknown negatives. A passing probe requires zero create-session, send-message and other-Support attempts. Blocked status and case-list browser attempts are reported separately from `actualSupportRequestsForwarded`, which must be zero. Thus blocked browser attempts are not relabeled as zero attempts.

The historical `otherSupport: 3` aggregate cannot be retroactively attributed because the old projection did not retain per-route evidence. Unknown HTTP 401 and console origins also remain qualified. This pass confirms only that the corrected future classifier can record safe fixed counts and prevent transmission.

## Control and custody disposition

The prior 120 control names are retained as an exact ordered prefix. Seven new controls bring the sealed proof to 127/127 with 127 unique names and discriminate:

1. exact full projection shape and failures;
2. public display-toggle interaction and restore;
3. same-locale nonempty-session preservation;
4. different-locale behavior;
5. capture/probe consumption of the same helper;
6. exact case-list classification;
7. method, token and unknown-path rejection.

The ordered-eight digest independently recomputes to `ba72808c15fe611c1999e440c206cb41d637d064884dde856a82ee7865f6f0d6`. The control proof is `0a00372ab55a75debc4548a6510a8de46d68f72b20970b3fe0ee33d5d74293e0`; the matrix remains `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`, and the shared pre-request verifier remains `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`.

FINAL9, exact suite34, matrix54/branch proof, adapter 3/3 negatives, sources/outcomes/actions/API-DOM equality, privacy and credential boundaries, lifecycle, pacing, capacity, navigation, fixed diagnostic projections and numeric child failure remain retained. Static custody matched all 94 indexed inputs and found all 57 future outputs absent. The product checkout was clean at the exact revision.

## Prepared PROBE2 contract

Executable:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND14/probe-zero-request-ui.mjs`

Exact argv:

`node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND14/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`

CWD is the exact clean product checkout. Prerequisites are an independently verified exact-revision owned preview, ordinary system TLS at `https://localhost:3100`, pinned installed Playwright Chromium and an absent output path. Direct stdout/stderr redirection to `GUIDE_UI_TRANSITION_PROBE2-LIVE8.log` preserves child status.

The fresh profile performs exactly five transitions: fresh full EN, same-session full RO, storage-reset compact RO, route-remount full EN and storage-reset compact EN. The corrected helper proves both full transitions; both compact transitions retain the single-click guard. The route handler aborts every Support API request, records the exact fixed categories, never returns synthetic data and rejects success if any Support request reaches runtime. Failure sets `process.exitCode = 1`.

## Limits

PROBE2 is prepared but was not executed. The author node transmitted zero requests because it performed static work only; the future claim of zero forwarded Support requests depends on a successful real probe. No actual browser behavior, composer usability, real UI state, Support/model result or model quality is proved by this inert pass.

The exact LIVE7 failure cause remains unknown, and this review infers no product defect. There is no new 54-row run, capture, capacity measurement, readiness, acceptance or checkpoint claim. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 remains gated.

No test, browser, runtime, HTTP, DB, status, capacity, Support, model, product, KB, Git, harness or predecessor mutation ran. No heavy or Git lease was requested.
