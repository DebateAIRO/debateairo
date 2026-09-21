# GUIDE_HARNESS_REVIEW3

- Node: `GUIDE_HARNESS_REVIEW3`
- Ticket: `t_48fb1ac5`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T17:49:18Z`
- Immutable product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Bound KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- FIX3 executable harness digest: `77b47d705133486ad4d7f520b117c191524cebaaf4131431df512c470177e314`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Verdict: **REWORK_CAPTURE_SAME_DESTINATION**

The FIX3 matrix, branch assertions, proof binding, and copied adapter implement the two-row oracle correction accurately. One capture defect blocks the future LIVE3 run: full row 53 is already on `/help` when its pointer-bound Help action is activated, while the capture accepts an activation only if the URL changes. This is a harness-only finding; no product correction or product evidence rerun is indicated.

## Finding GHR3-R1 — same-destination action cannot complete

`openMode("full", ...)` loads `${gateInput.baseUrl}/help` (`capture-public-guide.mjs:173-175`). Row 53 is the unchanged full/EN `NEGATED_OR_UNRELATED` prompt. FIX3 correctly gives it `REQUIRE_CLOSED` and pointer navigation to action `help`; the exact bound Help action is `href="/help"`.

`activateBoundAction` verifies the action id, label, and href, performs the real pointer or keyboard activation, and then unconditionally waits for `window.location.href !== before` (`capture-public-guide.mjs:198-209`). For row 53, `before` and the resolved destination are both `${gateInput.baseUrl}/help`. A same-URL reload or router navigation still resolves to the same string, so the wait cannot establish success and eventually times out. Row 54 starts compact at the base URL and may change to `/help`; that does not make row 53 executable.

### Minimal correction contract

1. Resolve `expected.href` against the configured base URL before activation.
2. Keep the exact action id/label/href check and perform the requested pointer or keyboard operation.
3. Require the post-activation URL to equal the resolved expected destination. Wait for a URL transition only when `before !== expectedDestination`; explicitly support the same-location case.
4. Put this rule in a helper consumed by the actual capture and inert controls.
5. Add a positive control for same-destination pointer Help and retain a changed-destination keyboard control. Add a discriminating negative showing that a wrong final destination or a skipped activation fails.
6. Recompute the ordered eight-file digest, schema-2 proof, and copied-adapter pins in a new immutable namespace. Keep actual LIVE receipt, screenshots, and profile absent until the corrected harness is independently reviewed.

## Passing dispositions retained

| Area | Disposition | Evidence boundary |
|---|---|---|
| Rows 53/54 oracle | PASS static | Prompts, `NEGATED_OR_UNRELATED`, `MODEL`, and `app-navigation` remain unchanged. Row 53 is pointer Help; row 54 is keyboard Help; both are `REQUIRE_CLOSED`. |
| Other 52 rows | PASS static | The matrix delta is limited to the two oracle expectations. |
| Actual recovery safety | PASS static | The eight positive/operation/navigation recovery rows remain deterministic, `NONE`, and actionless; the verifier rejects an injected action. |
| Immediate response validation | PASS static | `REQUIRE_CLOSED` requires the exact bound action; API actions must be allowed; API and DOM actions must match. |
| Sessions/pacing/capacity | PASS retained | Five groups, exact early session creation/persistence controls, 31-second request-start spacing, 42 model rows, fixed-key count-only capacity, freshness, one-time gate construction, and no favorable retry are unchanged. |
| Proof binding | PASS static | Schema-2 proof reports 65/65 and binds exact product `f3`, KB, and ordered eight-file digest. The control-proof JSON is the author-designated duplicate of the raw schema-2 control log. |
| Copied adapter | PASS static | It hashes the full ordered eight files before dynamic import, pins the FIX3 matrix, and checks constructor digest equality before projection. Its copied-source negative preserves zero imports and zero successful rows. |
| Fixed output absence | PASS static | LIVE receipt, row 53/54 screenshots, and profile were absent during review. |

All 71 indexed inputs matched their frozen SHA-256 and byte counts. The author receipt is `7bd2e38b5546170076620cf25838dddcbb7190ee8cdc035af778a71851342f7e`; its consumption record is `e13ea4b9662873830453e74df0b34969addc2c95f29fbf25a0e249414ef81c79`. The harness digest was independently reproduced as `77b47d705133486ad4d7f520b117c191524cebaaf4131431df512c470177e314`.

No test, probe, browser, HTTP, database, Support, model, runtime-capacity, product, source, Git, or private-data action occurred. The 65/65 control proof is inert historical evidence at `f3`; it is not 54-row live proof, preview readiness, checkpoint acceptance, or evidence for later harness bytes.
