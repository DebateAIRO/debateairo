# REV3 pass 2 — product truth and working preview

**Verdict: REWORK.** The exact integrated revision `e0dcfe77f49655bea774bdfacf988b911be4ff06` is mechanically clean and its alias-to-canonical mapping is reviewable, but the current actual walkthrough supplies useful answers for only 3 of 7 required questions. Four benign product questions terminate in the generic safety fallback with no sources/actions. English creation therefore has no action to test by pointer. The exact Forgot-password destination remains separately UNVERIFIED and checkpoint-blocking.

## REV3-P2-F1 — P1 — four required product questions return no usable guidance

LIVE_P1 used the compiled UI, actual anonymous Support API, and unchanged preview relay. It sent each canonical question once with no retry:

| # | Surface | Question | Outcome | Evidence disposition |
|---:|---|---|---|---|
| 1 | Full EN | Creation | `REFUSE_SAFETY`; 0 sources/actions; `PATH_OR_ROUTE` | **FAIL:** no prerequisites, limits, sources, action, or pointer target |
| 2 | Full EN | Settings | `REFUSE_SAFETY`; 0 sources/actions; `PATH_OR_ROUTE` | **FAIL:** no reviewed Settings guidance |
| 3 | Full EN | JSON export | Grounded; 1 source | Useful and accurate in this finite oracle |
| 4 | Full RO | Creation | `REFUSE_SAFETY`; 0 sources/actions; `PATH_OR_ROUTE` | **FAIL:** no prerequisites, limits, sources, or action |
| 5 | Full RO | Settings | `REFUSE_SAFETY`; 0 sources/actions; `CREDENTIAL_OPERATION` | **FAIL:** no reviewed Settings guidance |
| 6 | Full RO | JSON export | Grounded; 2 sources | Useful and accurate in this finite oracle |
| 7 | Compact RO | Creation | Grounded; 3 sources, 1 action | Useful; keyboard Enter reached `/login?next=%2Fnew` |

This fails `SPEC-v2.md:64` (`CP1-A09`), which requires useful current creation, Settings, and export answers in both languages plus a compact repeat. All seven API text/source/action projections equal the DOM, so the interface accurately renders the failed server outcomes. English pointer navigation remains **UNVERIFIED** because the English creation response contains no action.

The four diagnostics are safely attributed to four unique sequential cursor windows. They prove rejection categories only. No discarded text or token was retained, so the review does not claim that the path/route or credential predicates were semantic false positives. The drafts may have contained text that must be rejected. The actionable product defect is that the current end-to-end architecture does not return required useful responses for four benign questions.

The affected committed path is concrete:

- `packages/support-kb/src/context.ts:72-109,150-214` supplies human capability/action labels and request-local references while preserving canonical mappings server-side.
- `apps/api/src/support/model-references.ts:24-54` creates a random request namespace and translates validated references to canonical IDs.
- `apps/api/src/support/answer.ts:209-223,293-343` builds that context, validates and translates a draft, substitutes the safe fallback for a rejected draft, and removes its sources/actions.
- `apps/api/src/support/response-policy.ts:135-167,182-208` recognizes credential operations and path/link forms before public projection.

The compact Romanian success proves one request can pass reference validation, canonical source/action projection, and the trusted resolver. It does not satisfy the complete bilingual visitor contract. The observed 3/7 result is lower than LIVE4's 6/7, but those runs are separate stochastic samples on different revisions; this review does not attribute the change in result to the alias implementation.

Required evidence after the final review union selects a supported architecture: at one new exact revision, run this same matrix once without retries and require 7/7 useful, accurate answers. Creation in both languages must include reviewed prerequisites/limits, sources, and the canonical guest action; Settings in both languages must describe the reviewed available and unavailable controls. Preserve API/DOM equality, compact Romanian keyboard navigation, and strict path/credential/internal-ID rejection. Activate the rendered English creation action by pointer. A prompt-only sampling loop cannot satisfy this finding.

## Prior finding dispositions

- **Pass-one product finding / union F1:** still open and broadened by the current observed result. The request-local alias mechanism is implemented, but the actual usefulness criterion remains unsatisfied.
- **Invalid Help shortcuts:** remain resolved. The stable UI still omits invalid `/settings#privacy` and `/settings#cookies` destinations, uses the canonical signed-in privacy action, and invokes the existing cookie-preferences opener.
- **Signed-in visual evidence:** remains sufficient only for synthetic UI conditioning. It does not prove real ownership or private-data authorization.
- **Accepted content:** the three accepted LIVE_P1 answers are accurate in the named finite oracle and expose no visible request aliases or canonical machine IDs. The English and Romanian export limitations remain correct; compact Romanian creation retains the canonical guest action.
- **FIX_P1 deterministic evidence:** GATE_P2 binds all 16 correction paths. The focused author suite reports 381 passing tests; the integrated suite reports 23 files, 935 passing tests, and one Forgot TODO; typecheck is byte-identical to the attributed 76-diagnostic baseline. These are author/mechanical results, not live usefulness acceptance.
- **Security union F2-F6:** disposition belongs to the independent security lens. The four live diagnostic categories neither close those findings nor prove new security failures without discarded content.

## Visual and runtime evidence

The three current screenshots were inspected and match their indexed hashes. Full English visibly contains two fallbacks and the useful export answer. Full Romanian contains its creation and Settings fallbacks. Compact Romanian retains a readable creation answer, source labels, and action in the existing narrow layout. No clipping, broken layout, or hydration failure was observed.

The strict seven-field consumer passed 12 controls before the actual browser command. Four rejected request windows each contain one valid unique event, three accepted windows contain none, and no window is ambiguous. This is bounded cursor attribution rather than an API join or exact discarded-content evidence.

The console classifier records 11 `HTTP_401` entries and zero `HTTP_404`, JavaScript/hydration, or other categories. Their exact origins and harmlessness are not established. The supported preview receipt records PID/PGID `45639`, PPID `1`, revision `e0dcfe77...`, ordinary TLS 200, and preserved preview/original listeners after browser exit plus ten seconds. This reviewer made no fresh runtime request.

## Forgot and source custody

Forgot password remains owner-confirmed but its exact existing URL or opener is unknown. Resolver behavior, deterministic EN/RO actions, pointer/keyboard activation, and zero Support-originated reset/credential operations remain **UNVERIFIED**. The destination was not searched again and no Settings, MFA, or human-handoff substitute was invented. This independently blocks CP1 and owner verification.

Source custody remains a separate limitation. Forward receipts prove source HEAD `446c685e...`, empty index, full-index diff SHA-256 `0a5e7ab8...`, and the path shape plus bytes of all 56 tracked dirty files matched from `17:04:07Z` to `17:23:05Z`. The intake evidence did not preserve an equivalent full-index/per-path baseline, so intake-wide file-byte preservation, cause, actor, and exact time remain UNVERIFIED. All 12 BASE-selected hashes still match, and GATE_P2 independently verifies the clean 103-file product inventory.

## Exact custody and limits

- Compact lens inputs: 24/24 SHA-256 matches.
- Current product inventory: 103/103 SHA-256 matches; clean `e0dcfe77f49655bea774bdfacf988b911be4ff06`.
- GATE_P2 manifest: `656c3390c7e65de70f3708eb38ac24e89efcbfaf7a0426e48686abe291b44949`.
- Correction patch: `e408f9a3b14204f5459f106ab74f28637774ae60bf85c6fa2259f8c92361cb9b`.
- FIX_P1 consumption: `c2033deb3afd14b79a0d1216ce50a169b14738c1e2463173b78cb93c16128f8d`.
- LIVE_P1 consumption: `911f10618b9c1c4d129465f2900a7935b70c6b97883d98d219b7e0e3dfa27759`.
- LIVE_P1 actual receipt: `b2cc1d4c31ab873f9119b8c580adc4ae69bdb5276dbc5837480f0bec01cd64f4`.
- LIVE_P1 stack receipt: `5346de0c3ffbbe63ef7f00000dc30e03f0bc2a2065df83e76e41ba8e636fe5cc`.

No test, build, browser, provider/model request, preview/service action, product/source/Git/index mutation, account/reset operation, external connector call, or raw private-log read occurred in REV3 pass 2. Peer-reviewed knowledge remains unratified by the owner. Status and SLA presentation remain CP3 scope. Actual model-token usage is **UNAVAILABLE**. This verdict is not checkpoint acceptance or owner approval.
