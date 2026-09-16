# REV1 pass 1 — integrated CP1 correctness and architecture review

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_9cd91ee7`  
Reviewed product: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893..6e5ab5fc41acebbff4264efc7d481df3db8dce44`  
Source authority: `446c685e977104ecf2b0b5ee0519f7123968429f`  
Contract/evidence freezes: `de7138ffddff8109003d8b4617c509cae5fd8dd2` / `096638486c4f2eab450055c4b1d25ecd58a1ca54`

The integrated implementation is not correct enough to pass CP1. The exact LIVE4 matrix contains one useful-answer failure, and the owner-confirmed Forgot-password destination remains unavailable. The first failure now has enough safe attribution to require an architecture correction rather than a fifth prompt or lexical tuning cycle.

## B1 — canonical identifiers in the producer context can turn benign navigation into a refusal

Priority: **blocker**. Requirements: CP1-R14/R15/R17 and CP1-A09.

`packages/support-kb/src/context.ts:63-88` serializes canonical capability IDs, routes and available action IDs into the model context; `articleSection` also exposes canonical source IDs. `apps/api/src/support/answer.ts:128-132` tells the model both to copy allowed source/action IDs exactly into the four-key draft and never to put source, action or capability IDs in `text`. `apps/api/src/support/response-policy.ts:129-136,183-219` recognizes the closed hyphenated set in narrative text, and `apps/api/src/support/answer.ts:285-317` replaces any rejected completion with `REFUSE_SAFETY`, empty sources and empty actions.

That sink behavior is internally coherent and prevents an identifier leak. It is not functionally sufficient. LIVE4 sequence 1 asked the ordinary English question `How do I create a debate?` and received `REFUSE_SAFETY` with no sources or action. The isolated byte window contains exactly one valid diagnostic event with predicate `NARRATIVE_INTERNAL_IDENTIFIER`, three selected sources and one selected action. No retry occurred. The reply therefore failed the useful-guidance requirement in CP1-A09 and left the English pointer action unverified. The rejected completion and exact triggering token were not retained, so this review does not claim whether it copied `start-debate`, a source ID or another closed member.

The current tests prove that a synthetic identifier is rejected, absent from HTTP/storage, non-rateable and accounted as a successful relay call (`tests/unit/support-response-policy.test.ts:148-158`; `tests/integration/support-routes.test.ts:1967-2031`). They do not prove that the actual model can reliably produce ordinary navigation prose while it is shown the same canonical identifiers it must avoid in `text`. LIVE4 disproves that stronger functional claim.

### Architectural decision

Adopt **per-request opaque source/action aliases with a server-only canonical map**:

1. At context construction, create immutable one-to-one aliases for only the selected source IDs and requested action IDs, for example `S1..S3` and `A1..A3`. Keep the canonical IDs and routes only in the server map.
2. Render every model-visible surface through that representation. Capability and article headings use human labels or aliases; the output contract lists aliases; canonical IDs, routes, repository metadata and catalog keys do not appear elsewhere in the system prompt or selected corpus projection.
3. Keep the exact completion keys `kind`, `text`, `sourceIds`, and `actionIds`. In the model-facing draft, the two arrays contain allowed aliases. Reject unknown, duplicate, stale and cross-request aliases before mapping.
4. Screen narrative text against both the request aliases and the closed canonical identifier set. An alias in prose is still an invalid, unclickable instruction; ordinary verified human labels such as “Start a debate” and “Settings” remain usable.
5. Map valid aliases to canonical IDs, then run the existing canonical membership checks and server action resolver. Persist and return only screened text plus canonical server-owned source labels and action labels/hrefs.

This keeps one model attempt, the current model and relay, the exact four-key shape, reviewed source provenance, trusted action resolution, public response shape, canonical persistence and all usage/refusal accounting. It changes the internal value semantics of CP1-R14 from canonical IDs to ephemeral model-facing IDs, so it requires an explicit mission-contract amendment before implementation. It does **not** change an owner-visible product requirement or require owner product ratification: visitors still receive the same natural answer, reviewed canonical sources and first-party actions.

Rejected alternatives:

- Another prompt-only correction retains the measured representation conflict and is expressly prohibited by the failure ruling.
- Replacing identifier substrings with labels in server code is smaller but mutates arbitrary model prose without proving the resulting sentence is truthful or grammatical.
- Removing the narrative-ID screen would restore the LIVE3 visitor leak.
- Making all source/action arrays server-generated changes more of CP1-R14 than the alias map and removes the model’s explicit citation/selection signal.
- Native constrained output could improve JSON shape, but no capability proof exists for the current Hermes path and it would not stop identifiers from appearing in `text` by itself.

Required correction evidence is finite. Capture an answer-service model request and prove canonical IDs and routes are absent from all model-visible sections. Prove valid aliases map to the exact canonical source/action response; unknown, duplicate and cross-request aliases fail closed; aliases and canonical IDs in `text` are replaced before storage/HTTP/UI; natural EN/RO labels remain accepted; and dynamic actions still require trusted server context. Re-run the affected focused tests and then the single frozen seven-row live matrix once. Do not sample or retry until a favorable completion appears.

## B2 — Forgot-password destination and action remain unverified

Priority: **checkpoint blocker / unresolved owner input**. Requirements: CP1-R05/R06 and CP1-A05.

**V-1 destination: UNVERIFIED.** The exact existing destination or callable opener is still unknown. The current route therefore returns deterministic no-model guidance with no action, and the UI regression remains an explicit TODO at `tests/render/sup-01-help.test.tsx:723-754`. This is the correct fail-closed behavior for the frozen unresolved state, but it cannot satisfy CP1 completion. After the owner supplies the existing target, the changed catalog, deterministic branch and both full/compact click paths need scoped independent re-review with zero Support-originated credential/reset operations. This review does not invent a destination or classify the missing external fact as an implementation defect.

## Retained preparation dispositions

- **C1 resolved.** `apps/api/src/support/answer.ts:24-26,204-213` now composes against the required initial 24,000-code-point ceiling. `tests/unit/support-answer-context.test.ts:40-71` drives the answer service above 12,000 code points, below 24,000, and proves all three whole sections survive.
- **C2 resolved.** `apps/api/src/support/index.ts:360-367,760-769` passes the exact route-resolved snapshot object; `apps/api/src/support/answer.ts:193-217` prefers that object. Identity is asserted at `tests/integration/support-routes.test.ts:1908-1933` and in the answer-service divergence control beginning at `tests/unit/support-answer-context.test.ts:102`.
- **C3 closed as intentional fail-closed behavior.** The frozen summary contract confirms generic replies do not receive guessed or model-supplied owner/public debate identifiers. The existing consent-gated own-context service owns trusted projections; no new generic adapter is required.

## Integrated evidence and limits

- GATE records a clean exact `6e5ab5fc41acebbff4264efc7d481df3db8dce44`, 99 changed product paths, a 114-input manifest and patch SHA-256 `dc4b6087e944d96fc5ed9f9d4a7451c548fa39c70f7824d9770a33fd830e09ae`. GATE is packaging evidence, not acceptance.
- Author evidence reports the exact 21-file union passed 831 tests with one Forgot-password TODO. FIX4 also records five restored mutation classes. REV1 inspected the related source and oracles but did not rerun the suite.
- The UI validates server-returned source/action decorations against the browser-safe catalog (`apps/ui/components/support/Assistant.tsx:147-217`), retries an exact snapshot mismatch at most once (`:559-607`), and renders text with React escaping plus canonical labels/hrefs (`:676-700`). Its focused tests cover EN/RO full/compact decorations and the one-retry boundary (`tests/render/sup-01-help.test.tsx:499-693`).
- LIVE4 used the actual compiled UI, Support API and unchanged relay for seven sequential prompts. Six were useful and grounded; all API and DOM text/source/action projections matched; compact Romanian keyboard navigation reached `/login?next=%2Fnew`. The English creation row failed as B1 describes.
- The eleven observed console errors were classified as HTTP 401, but their exact origin and harmlessness were not established. This is retained as an evidence limitation rather than promoted to a new defect.
- The reviewed product was rechecked after static inspection and remained clean at exact HEAD `6e5ab5fc41acebbff4264efc7d481df3db8dce44`. Source verification established HEAD `446c685e977104ecf2b0b5ee0519f7123968429f` only: the source tree had 56 tracked dirty paths, and REV3 records a serialized-diff fingerprint gap. REV1 therefore makes no clean/exact claim for source working bytes. No product/Git/index/stack/provider/browser/database/account mutation, synthetic probe or actual request occurred in REV1.
- Actual token/cost usage is **UNAVAILABLE**. Owner ratification and CP1 acceptance remain pending.

## Evidence-wording amendment

This amendment supersedes only the source-state sentence above. Prior report SHA-256 `2c234b2fa5b91d8da0c2df63c317e81ce1279b84a665f885be99beda20305501` is retained for traceability; the **REWORK** verdict, B1/B2 findings and architectural decision are unchanged.
