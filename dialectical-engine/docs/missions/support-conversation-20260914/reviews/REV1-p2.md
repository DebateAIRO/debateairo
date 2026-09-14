# REV1 pass 2 — CP1 correctness and functional architecture review

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_b600a319`  
Reviewed correction: `6e5ab5fc41acebbff4264efc7d481df3db8dce44..e0dcfe77f49655bea774bdfacf988b911be4ff06`  
Source authority: HEAD `446c685e977104ecf2b0b5ee0519f7123968429f`  
Evidence freeze: `bb933856a4d8ca6781988a6cc548785da635fcff`  
GATE_P2 manifest SHA-256: `656c3390c7e65de70f3708eb38ac24e89efcbfaf7a0426e48686abe291b44949`

The selected alias architecture is correctly request-bound and correctly maps accepted references back to canonical server values. It does not satisfy its own whole-prompt invariant, and the exact actual matrix remains functionally below CP1-A09. The final permitted correction needs an explicit internal contract amendment for deterministic, reviewed recovery; another prompt or predicate-tuning cycle is not supported by the retained evidence.

## B1 — F1 is incomplete because selected article bodies still expose canonical routes

Priority: **blocker**. Requirements: amended CP1-R14, CP1-R17 and the F1 correction invariant.

The request-local reference mechanism itself is supported. `apps/api/src/support/model-references.ts:24-36` binds source/action aliases to a random per-request UUID namespace. `:39-54` rejects duplicate, stale and unknown references while translating accepted values. The answer service creates one factory for the request, gives only aliases to the parser/validator, and translates them before the canonical source/action resolver (`apps/api/src/support/answer.ts:209-225,293-343`). Focused service tests exercise canonical mapping, alias/canonical narrative rejection and cross-request failure (`tests/unit/support-answer-context.test.ts:45-85,209-274`); the factory tests cover distinct namespaces, duplicates and unknown references (`tests/unit/support-model-references.test.ts:7-50`).

The architecture nevertheless violates the amendment’s statement that “every model-visible surface” omits routes. `packages/support-kb/src/context.ts:98-100` appends `entry.body` verbatim under each request alias, and `:175-194` includes those whole sections in `context.text`. The shipped body at `packages/support-kb/content/getting-started-debate.en.md:18` contains `/new`; `packages/support-kb/content/account-settings.ro.md:16` contains `/settings`. A bounded scan of only the 24 frozen article bodies found route-like strings in **14/24** bodies, including `/new`, `/settings`, `/login`, `/sign-up`, `/public/debate`, `/help`, `/privacy` and `/terms`. This inventory does not enumerate legacy or in-code entries; the correction must validate every entry and language in each shipped snapshot.

The green projection tests do not cover this production input. Their asserted route absence is driven with a synthetic body that contains no route (`tests/unit/support-context.test.ts:235-267`; `tests/unit/support-answer-context.test.ts:45-85`). The initial 24,000-code-point test confirms whole-body retention, which means the real route strings are retained too (`tests/unit/support-answer-context.test.ts:87-119`). F1 is therefore **PARTIALLY RESOLVED / REOPENED**: aliases fix canonical source/action identity exposure in headings and arrays, but not canonical route exposure from the corpus projection.

This is a direct static invariant failure. It is not attribution for any discarded completion. LIVE_P1 did not retain draft text or a triggering span, so this review does not claim that any one corpus route caused a measured refusal.

## B2 — the one-attempt accepted-or-generic-refusal architecture still fails usefulness

Priority: **blocker**. Requirement: CP1-A09.

The exact LIVE_P1 run at `e0dcfe77f49655bea774bdfacf988b911be4ff06` passed the strict seven-key diagnostic consumer before traffic and then issued the seven canonical questions once each. Only **3/7** responses were useful. English creation, English Settings and Romanian creation returned `REFUSE_SAFETY` with `PATH_OR_ROUTE`; Romanian Settings returned `REFUSE_SAFETY` with `CREDENTIAL_OPERATION` (`.hermes/reports/support-conversation-20260914/evidence/LIVE_P1.md:24-40`). All four had zero sources and actions. The English pointer remains unverified.

This proves missing useful navigation and Settings guidance. It does not prove a validator false positive, unsafe draft, exact discarded token or exact causal link to B1. `apps/api/src/support/answer.ts:293-343` makes every rejected draft converge on the same generic refusal, empty provenance and empty actions, so a strict safe sink still exposes model variance as a visitor-visible dead end. Removing a known route from the prompt can reduce one hazard but cannot establish that one unconstrained attempt will satisfy every output predicate. A second attempt, favorable resampling or another prompt cycle would preserve the same nondeterministic contract and is outside the frozen rules.

## B3 — Forgot-password destination remains unresolved

Priority: **checkpoint blocker / owner input**. Requirements: CP1-R05/R06 and CP1-A05.

The exact destination or callable opener and both full/compact click paths remain **UNVERIFIED**. The current no-action behavior and explicit render TODO remain the correct fail-closed implementation for the unresolved state. This review neither guesses a target nor treats the missing external fact as a defect in `e0dcfe77f49655bea774bdfacf988b911be4ff06`.

## Required final-correction decision

Adopt one **reviewed deterministic recovery architecture** with two explicit KB projections:

1. Each shipped article carries a complete model-facing factual projection and a concise visitor-facing fallback for its language. Both are exact bytes in the immutable KB snapshot and editorial manifest. The model projection uses natural labels and contains no canonical capability/source/action IDs, catalog routes or repository metadata. The visitor fallback is written for display, contains no internal reference/path instruction and is admitted only under the final security lens's enforceable credential-output invariant. It is selected as an exact constant and never interpolates user or model text.
2. `buildSupportKnowledgeContext` uses only the model projection, never the raw visitor article body. The loader rejects a snapshot if any model projection intersects the complete closed canonical ID/route sets or contains repository-path metadata. Titles and capability sections undergo the same check. This is the mechanical F1 boundary that the current fixture-only assertion lacks.
3. Keep the current model, relay, exact four-key model envelope, request-local aliases, one attempt, input redaction and strict screen. A valid draft follows the current alias-to-canonical path unchanged.
4. After a successful model call, if the draft is rejected and the request already has a deterministic top-ranked reviewed source, discard the draft and return that source’s exact reviewed fallback as `ANSWER_GROUNDED`. Attach the canonical selected source and only actions already admitted by the trusted resolver for the current signed-in context. Preserve the model call’s usage/spend/degraded accounting and emit only the existing bounded rejection diagnostic. The rejected bytes never enter storage, HTTP, UI, logs or case summaries.
5. If the selected source lacks valid reviewed fallback bytes, retain `REFUSE_SAFETY`. Keep no-source, transport failure, degraded-mode and human-escalation behavior unchanged. The unresolved Forgot-password action remains unavailable.

This is a bounded server decision, not arbitrary rewriting: the only substitute is a pre-authored, hashed string tied to the same immutable source snapshot. It also enforces the credential restriction independently of prompt compliance because untrusted model bytes still pass the strict screen, while fallback bytes must pass corpus admission, the final security invariant and editorial review before deployment.

The decision requires a mission-contract amendment before implementation. `CP1-R14-ALIASES.md` currently says not to generate server-owned replacement answers, and CP1-R15/R16 currently treat rejection as `REFUSE_SAFETY` with empty provenance and non-rateable/non-resolution effects. The amendment should authorize the reviewed fallback branch and its grounded outcome/accounting semantics. This is an internal implementation choice only if the owner’s “model-backed” requirement permits a real single model attempt whose rejected narrative is replaced by reviewed source text. If the final visitor narrative itself must originate from the model, the owner must decide because no deterministic repair supported by this evidence fits that interpretation.

Rejected directions are prompt-only tuning, predicate relaxation based on category-only diagnostics, substring replacement inside model prose, a second model attempt and serving the raw article body. Each either keeps the measured nondeterminism, weakens an enforced output boundary or reintroduces the routes/markdown/credential phrasing that must remain controlled.

## Explicit verification oracle

- Load all shipped entries in both languages and build model context for every capability. Assert that no title, capability section or selected factual projection contains any canonical source/action/capability ID, catalog route, repository path or request alias in visitor prose. Reintroducing one route into a model projection must fail corpus admission.
- Preserve current valid-alias mapping and prove unknown, duplicate, stale and cross-request aliases fail before canonical resolution; prove both aliases and canonical IDs in model narrative are discarded before storage.
- Inject one rejected draft for each response-policy predicate against a source-matched EN and RO request. Assert exactly one model call, the exact hashed fallback bytes in cipher storage/HTTP/UI, canonical source provenance, only trusted current-context actions, unchanged usage accounting, the bounded diagnostic, and absence of rejected text from all sinks and case summaries.
- Assert a missing/invalid fallback retains the current `REFUSE_SAFETY`; no-source, relay failure, rate/spend/degraded and human handoff oracles remain unchanged. Assert no credential or reset operation is introduced.
- Run the affected focused suite, the one frozen integrated command, and the seven-row actual matrix exactly once. CP1-A09 requires 7/7 useful responses; English creation must render and activate its trusted pointer, and compact Romanian creation must retain keyboard activation. No rejected row is retried.

## Retained dispositions and evidence limits

- **C1 remains resolved.** The initial composed system ceiling is 24,000 code points and the whole-section oracle remains present.
- **C2 remains resolved.** The route-resolved immutable snapshot is used through context, model response and persistence.
- **C3 remains intentional fail-closed behavior.** Generic replies receive no guessed dynamic destination; trusted own-context resolution remains separately owned.
- F2-F6 security classes and UI product-truth are outside this lens. Their current evidence was not re-adjudicated here. After this report was drafted, root relayed a category-only security-pass2 interim describing remaining credential-value/relation and encoded-path gaps; REV1_P2 did not read or reproduce that evidence and does not connect it to any LIVE_P1 row. The fallback admission gate above must consume the final security invariant rather than reuse the current predicate set or enlarge a lexical word cap.
- The 21-input lens index, all 103 current product hashes, the evidence freeze and GATE_P2 manifest hash were mechanically checked with zero mismatches. GATE_P2 is packaging evidence, not acceptance.
- Author evidence reports 381 focused tests. LIVE_P1 reports 23/23 integrated files, 935 passing tests, one existing TODO and 79.78 seconds. REV1_P2 did not rerun them and makes no broader runtime claim.
- Final readback found product HEAD exactly `e0dcfe77f49655bea774bdfacf988b911be4ff06` with empty porcelain status. Source verification is HEAD-only at `446c685e977104ecf2b0b5ee0519f7123968429f`; source working-byte exactness is not claimed.
- No product/Git/index/stack/model/browser/database/account/credential/reset mutation or request occurred in this pass. Actual reviewer token/cost usage is **UNAVAILABLE**.
- Owner ratification and CP1 acceptance remain pending; CP2/CP3 remain locked.

## Prediction

I did not read another current lens report. My prediction before the relayed security interim was that product-truth would retain the 3/7 usefulness failure and security would reject any recovery branch that serves unreviewed or dynamically rewritten prose. The first correction risk remains a fallback that bypasses model screening but lacks exact-byte corpus admission, the final credential-policy invariant or a retained internal rejection diagnostic.
