# REV3 pass 2 product-truth self-report

## Identity, scope, and verdict

- Ticket: `t_ddd853bf`; slice: `t_e584e488`; reviewer: `/root/baseline`; final review pass 2 of at most 3.
- `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`; `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Reviewed revision: `e0dcfe77f49655bea774bdfacf988b911be4ff06`; correction base: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`; intended-product base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`; source HEAD: `446c685e977104ecf2b0b5ee0519f7123968429f`.
- Evidence freeze: `bb933856a4d8ca6781988a6cc548785da635fcff`; GATE_P2 manifest SHA-256: `656c3390c7e65de70f3708eb38ac24e89efcbfaf7a0426e48686abe291b44949`.
- Verdict: **REWORK**. LIVE_P1 returns useful answers for only 3 of 7 required questions, refuses the other 4, and cannot expose the required English creation pointer action. Forgot remains separately UNVERIFIED and checkpoint-blocking.
- SKILLS LOADED from actual reads in this session chain: `using-superpowers`; `heartbeat-protocol`; `heartbeat-reviewer`; `verification-before-completion`.

## Finding REV3-P2-F1 — P1 — four required product questions terminate in generic refusal

The actual compiled UI, anonymous Support API, and unchanged preview relay received the seven canonical prompts exactly once each with no retry. English creation, English Settings, Romanian creation, and Romanian Settings returned `REFUSE_SAFETY` with no sources or actions. English/Romanian export and compact Romanian creation were useful grounded replies. This is a direct product-level failure of CP1-A09 and a regression in the observed finite acceptance result from LIVE4's 6/7 to LIVE_P1's 3/7.

The two live runs are separate stochastic samples on different revisions, not a controlled A/B experiment. The evidence therefore does not prove that the alias/context correction caused the lower result. Likewise, three rejected windows report `PATH_OR_ROUTE` and one reports `CREDENTIAL_OPERATION`, but no discarded completion text or token was retained. Those categories do not prove a semantic false positive; the screened drafts may have contained content the policy correctly rejects. The supported conclusion is narrower: the current end-to-end product did not produce required useful answers for four benign questions.

The current source-to-runtime path is exact:

- `packages/support-kb/src/context.ts:72-109,150-214` renders human capability/action labels and per-request source/action references while retaining canonical IDs only in the server-side map.
- `apps/api/src/support/model-references.ts:24-54` creates a fresh request namespace and translates validated references back to canonical IDs.
- `apps/api/src/support/answer.ts:209-223,293-343` builds the request-local context, validates aliases and narrative text, translates accepted references, then substitutes `REFUSE_SAFETY` and removes sources/actions when the draft is rejected.
- `apps/api/src/support/response-policy.ts:135-167,182-208` classifies credential operations and path/link forms before canonical projection.

The code implements the approved alias mapping shape and the accepted compact response proves that one request can traverse alias validation, canonical translation, source labeling, and action resolution. It does not make the overall visitor contract reliable enough for the finite acceptance oracle.

Required result after the final review union chooses a bounded architecture: on a new exact revision, the same seven prompts must run once without retries and produce seven useful, accurate answers. Both creation languages must include current prerequisites/limits, reviewed sources, and the canonical guest action; both Settings languages must explain the reviewed controls and exclusions. API and DOM must remain equal, compact Romanian keyboard navigation must still work, and English creation pointer activation must reach the canonical destination. Do not relax path, credential, provenance, or narrative-ID screening based only on category events whose discarded text is unavailable.

## Current evidence and dispositions

- All 24 compact lens inputs match their indexed SHA-256 values. All 103 current product files match GATE_P2 and the product lane is clean at `e0dcfe77...`.
- GATE_P2 correction patch SHA-256: `e408f9a3b14204f5459f106ab74f28637774ae60bf85c6fa2259f8c92361cb9b`; FIX_P1 consumption: `c2033deb3afd14b79a0d1216ce50a169b14738c1e2463173b78cb93c16128f8d`; LIVE_P1 consumption: `911f10618b9c1c4d129465f2900a7935b70c6b97883d98d219b7e0e3dfa27759`.
- LIVE_P1 actual receipt SHA-256: `b2cc1d4c31ab873f9119b8c580adc4ae69bdb5276dbc5837480f0bec01cd64f4`; stack receipt: `5346de0c3ffbbe63ef7f00000dc30e03f0bc2a2065df83e76e41ba8e636fe5cc`.
- The strict seven-key diagnostic consumer passed 12 controls before actual traffic. Four sequential request windows each contain one valid unique event; three accepted windows contain no event; none are ambiguous. This is bounded cursor attribution, not an API join or proof of exact discarded content.
- The integrated author/live suite reports 23 files, 935 passing tests, and one Forgot TODO. FIX_P1 focused evidence reports 381 passing tests, restored mutation evidence, and a typecheck byte-identical to the attributed 76-diagnostic baseline. These results are consumed author evidence and do not override the failed actual product oracle.
- All seven API text/source/action projections equal the DOM. The three accepted answers are accurate in the finite oracle and expose no visible aliases or canonical machine IDs. Compact Romanian creation renders `Pornește o dezbatere` at `/login?next=%2Fnew`; keyboard focus and Enter reach that destination.
- English pointer remains **UNVERIFIED** because English creation renders no action. No credential or recovery operation occurred.
- The three LIVE_P1 screenshots were inspected at hashes `8cac78ec...`, `251b1e5f...`, and `30f6dce5...`. Full English visibly contains two refusals and the useful export answer; full Romanian contains its two refusals; compact Romanian retains the useful creation state. No clipping, layout break, or hydration failure was observed.
- The console classifier reports 11 `HTTP_401` entries and zero `HTTP_404`, JavaScript/hydration, or other categories. Exact origins and harmlessness are not established.
- Stable pass-one UI/editorial dispositions remain: the invalid privacy/cookie shortcuts are resolved; signed-in full/compact EN/RO evidence proves synthetic conditioning only; unchanged knowledge remains peer-reviewed but not owner-ratified. Status/SLA presentation remains CP3 scope.
- Union F1 remains open through REV3-P2-F1. Security findings F2-F6 and their affected sinks require the separate security reviewer; the product-truth lens does not close them or infer their status from four live category events.

## Unchanged blockers and custody limits

The exact existing Forgot-password destination/opener remains unknown. Its EN/RO deterministic action, pointer/keyboard activation, and zero Support-originated reset/credential operations remain UNVERIFIED. This missing owner input independently blocks CP1; it was not searched again and no substitute was invented.

Original-source custody also remains qualified. Forward evidence proves that source HEAD, empty index, the full-index diff SHA-256 `0a5e7ab8...`, and the path shape plus bytes of all 56 tracked dirty files matched from `17:04:07Z` through `17:23:05Z`. It does not fill the intake gap: the earlier default serialized-diff fingerprint change does not prove underlying byte drift, and intake-wide preservation, cause, actor, and exact time remain UNVERIFIED. All 12 BASE-selected hashes still match and the isolated 103-file product inventory is independently exact.

The supported preview state is consumed worker evidence: PID/PGID `45639`, PPID `1`, ordinary TLS 200, exact loaded revision, and preview/original listeners retained after browser exit plus ten seconds. This reviewer made no fresh runtime request.

No test, build, browser, provider/model request, preview/service action, product/source/Git/index change, account/reset operation, external connector call, or raw private-log read occurred. Actual model-token usage is **UNAVAILABLE**.

## Process improvement case

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The measured recurring cost is repeated architecture, suite, preview, and seven-question cycles that still end on stochastic draft-policy incompatibility. Token cost cannot be quantified because provider and agent token usage is unavailable; do not infer it from refusal counts or diagnostic fields. The operational evidence is concrete: pass 1 ended at 6/7 useful, the correction added 16 paths and 381 focused passes, the next integrated gate ran 935 passes, and the new actual matrix fell to 3/7 useful. The alias architecture reduced canonical-ID exposure in accepted text, but the current producer still emits drafts rejected for path/route or credential-operation predicates.

For a better one-prompt workflow:

1. Make the final architectural choice before another product edit. Compare keeping free-form model prose, constraining the provider output further, or composing deterministic reviewed answers for canonical product intents. Any public response-contract or owner-visible behavior change needs explicit owner treatment; another prompt-only patch is not enough evidence.
2. Treat the seven-row live matrix as one immutable final gate, never a search loop. Do not launch it until deterministic contract checks demonstrate that the chosen architecture can express every required answer without forbidden prose.
3. Preserve strict rejection at the sink and separate it from usefulness. Diagnostic categories should drive security review; product acceptance should count complete useful rows and required navigation, without guessing why discarded text failed.
4. Generate model-reference schema, runtime consumer, diagnostic projection, and evidence consumer from shared machine-readable definitions. This prevents schema drift and repeated receipt correction.
5. Carry external inputs such as Forgot as blocked dependencies outside implementation/review loops. Run independent review once, then resume only when the destination exists.
6. Keep the improved source custody format: full-index diff plus per-path hashes. Capture it at intake so forward equality has an anchored baseline.
