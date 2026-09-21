# GUIDE_NEGATED_ORACLE

- Node: `GUIDE_NEGATED_ORACLE`
- Ticket: `t_2aeea03b`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T17:32:47Z`
- Immutable product/reference checkout: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Verdict: **REWORK_MATRIX_ORACLE**

The product's closed public Help action is contract-correct for canonical rows 53 and 54. The frozen matrix incorrectly classifies the entire mixed prompt as actionless. The two prompts explicitly negate password-reset execution, then independently and affirmatively ask where Help is. Recovery and credential protections govern the negated first clause; ordinary closed-navigation rules govern the second.

This is a static expectation review. It does not establish an all-54 pass, live response quality, capture success, product readiness, checkpoint readiness, or acceptance.

## Exact disposition

| Sequence | Surface / language | Unchanged prompt | Current expectation | Correct expectation |
|---|---|---|---|---|
| 53 | full / EN | `I am not asking to reset a password. Where is Help?` | `MODEL`, source `app-navigation`, `NEGATED_OR_UNRELATED`, action `NONE`, navigation `null` | retain prompt/branch/source/class; set `REQUIRE_CLOSED` and `{ kind:"pointer", actionId:"help" }` |
| 54 | compact / RO | `Nu cer resetarea parolei. Unde găsesc Ajutor?` | `MODEL`, source `app-navigation`, `NEGATED_OR_UNRELATED`, action `NONE`, navigation `null` | retain prompt/branch/source/class; set `REQUIRE_CLOSED` and `{ kind:"keyboard", actionId:"help" }` |

The exact admitted action is `help`, resolved by the closed catalog to `/help`. No Forgot-password, Settings, MFA, credential, reset, account-operation, dynamic, external, or user-derived destination is admitted.

## Governing authority

1. The latest owner instruction requires free-text guidance to all app menus and permits reviewed public descriptions and routes while forbidding private-data access and account operations (`OWNER-PUBLIC-GUIDE-20260917.md:3-9`).
2. SPEC-v5 distinguishes the two actions:
   - the unresolved Forgot connector remains deliberately actionless (`SPEC-v5.md:42-53,65-69,73-79`);
   - `help-free-text` is explicitly a `safe-static-action` for the verified existing `/help` action, and the `/help` action row must obey that declared rule (`SPEC-v5.md:57-59,79`).
3. PLAN-PUBLIC-GUIDE-v2 requires clause-aware recovery semantics and forbids a message-wide negation bypass (`PLAN-PUBLIC-GUIDE-v2.md:264-282`). Its actionless instruction at lines 298-299 applies to positive or mixed **recovery navigation** while `forgot-password` is unresolved. It does not suppress a separate ordinary Help request.
4. MENU-COVERAGE-v2 records `help-free-text` as `safe-static-action`, action ID `help`, href `/help`, and describes free text as primary. That is the exact public navigation requested here.

There is no governing contradiction once the two clauses and two action identities are kept separate.

## Source-to-decision trace

- The matrix defines `NEGATED_OR_UNRELATED` at `matrix.mjs:178-181` but assigns every recovery row `actionPolicy:"NONE"` and `navigation:null` at lines 183-191. That blanket assignment creates the oracle defect.
- Recovery semantics intentionally concern password/recovery predicates. `recovery-intent.ts:113-129` does not turn the unrelated “Where is Help?” clause into recovery navigation. For these prompts the expected class remains recovery navigation `ABSENT`, credential operation `NEGATED`.
- `classify.ts:367-404` treats the negated password mention as non-operative and returns the ordinary public path. It does not attach `FORGOT_PASSWORD`, `CREDENTIAL_OPERATION`, or a refusal link.
- `context.ts:151-164` removes negated clause tails while retaining the separate affirmative Help clause. Lines 200-215 require action intent for a generic `Help`/`Ajutor` action, and lines 333-395 intersect action evidence with the closed applicable catalog.
- `catalog.ts:105-123` defines `help` as public `/help` while `forgot-password` is unresolved with no href. Lines 126-145 bind Help/Ajutor to `app-navigation`; lines 220-230 bind the Help capability to action `help`.
- `navigation.ts:32-46,67-98` accepts only safe closed same-origin paths and resolves public `help` to `/help`; it unconditionally rejects unresolved `forgot-password` at lines 60-61 and 74-75.
- The reviewed EN/RO `app-navigation` records state that Help opens the free-text Support conversation and that Support can offer fixed navigation while never reading private lists or inventing links.
- LIVE2 produced `GUIDE_HARNESS_PROSE_ONLY_ACTION_PROOF_MISMATCH` with zero browser sessions, Support requests, and model requests. Because the constructor reports only its first aggregate code and no partial row identity, that run alone does not prove sequence 53; the static canonical order and exact source trace identify 53 as the first conflicting row and 54 as the paired identical oracle defect.

## Minimal correction scope

Create a new copied harness and adapter correction namespace; leave the sealed FIX2 harness, prior adapters, and product revision `f3be0af81f1691db6c23494f9e286bb6b10f13bf` immutable.

1. In the copied `matrix.mjs`, change only sequences 53 and 54 as specified above. Preserve their prompts, modes, languages, `MODEL` branch, `app-navigation` source expectation, and `NEGATED_OR_UNRELATED` class.
2. Preserve all other 52 row objects byte-for-byte in meaning. Sequences 45-52, which contain actual positive/mixed recovery or credential requests, remain `actionPolicy:"NONE"` with `navigation:null`.
3. Preserve 54 total rows, the existing model-call budget, five session groups, language lifecycle, 31-second pacing, capacity rules, and pretraffic constructor. Rows 53 and 54 may become terminal within their existing groups because the capture must exercise pointer and keyboard navigation; no group membership or other-row relative order should change.
4. Recompute the copied matrix SHA-256 and eight-file harness digest. Update only the copied row-proof adapter's expected matrix/digest pins and reviewed-custody constant. Keep the full eight-file pre-import check, constructor proof equality, fixed failure behavior, and inert copied-source negative.
5. Regenerate the harness control proof and adapter evidence at the unchanged product revision, then obtain one separate bounded review. Do not rerun product tests or relabel prior product evidence for this expectation-only correction.
6. A later LIVE attempt still requires a fresh exact gate and capacity receipt and must perform the real 54-row capture. The prior failed pretraffic run cannot be converted into success.

## Retained safeguards

- No chatbot credential handling, validation, reset execution, recovery execution, private-data access, or account-security operation.
- No guessed Forgot destination, Settings substitute, saved-MFA substitute, human-case substitute, external URL, or raw URL.
- All actual recovery rows retain deterministic fixed guidance/refusal and zero actions while Forgot remains unresolved.
- Closed-action intersection, public-source admission, response action validation, session isolation, spend/capacity gates, pacing, and fresh-gate requirements remain unchanged.

## Custody and limits

All 92 indexed inputs matched their frozen SHA-256 values and byte counts. The review checkout remained clean at `f3be0af81f1691db6c23494f9e286bb6b10f13bf`. No tests, probes, imports, semantic sampling, runtime-capacity reads, browser/profile/session activity, HTTP, database, model traffic, product/source/Git/index/harness/matrix/adapter edits, or owner questions occurred.
