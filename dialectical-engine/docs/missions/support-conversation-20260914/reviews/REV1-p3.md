# REV1 pass 3 — CP1 correctness and functional architecture review

Verdict: **PASS for the named correctness scope**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_88683868`  
Reviewed product: `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`  
Production/runtime evidence revision: `606b2eabea1dc9212159e53c193cf69655424e77`  
Source authority: HEAD `446c685e977104ecf2b0b5ee0519f7123968429f`  
Evidence freeze: `bc0e85fc6013e0067cdb178a4bf7cc0526bdd72c`

No correctness blocker remains in the reviewed architecture or the late degraded-fixture correction. The exact Forgot-password destination remains unresolved and independently blocks CP1; this scoped PASS is not checkpoint acceptance.

## Correctness decision

The final implementation realizes the reviewed deterministic-recovery contract without weakening the one-attempt or output-screen boundaries.

`apps/api/src/support/answer.ts:200-225` uses the already resolved route snapshot for eligibility, ranking and model context. The structured context includes only `modelProjection` bytes (`packages/support-kb/src/context.ts:98-100,165-194`), preserves whole selected sections under the composed 24,000-code-point system ceiling, and exposes request-local references rather than canonical IDs/routes. Before the model call, `apps/api/src/support/answer.ts:252-257` fixes the deterministic top source and intersects its catalog capabilities with actions already available in the trusted request context.

The model is called once at `apps/api/src/support/answer.ts:267-300`. Exact-envelope parsing, reference validation and the shared content screen run before any model narrative reaches the assistant record. At `:335-358`, a rejected draft can produce only one of two outcomes:

1. If that same snapshot's deterministic top entry has an admitted fallback that passes the shared screen, the server returns those exact bytes as `ANSWER_GROUNDED`, with that canonical source and only pre-call source-appropriate trusted actions.
2. If the fallback is absent or invalid, the server returns the existing `REFUSE_SAFETY` template with empty sources and actions.

No rejected byte participates in the fallback, storage, returned response or case summary. Usage and spend remain those of the real single model attempt (`apps/api/src/support/answer.ts:359-375`), and successful screened transport restores relay health. Accepted drafts follow the existing alias-to-canonical path unchanged.

The recovery loader is fail closed. `packages/support-kb/src/recovery.ts:27-109` requires an exact five-key component schema, safe bounded UTF-8 text, ordered unique bilingual keys, article hashes and closed output invariants. `packages/support-kb/src/index.ts:567-635` requires complete component coverage and exact separate review hashes before adding projection/fallback bytes to the immutable snapshot; those hashes participate in `kbVersion`. Both production callers require reviewed recovery (`apps/api/src/main.ts:80-87`; `apps/runner/src/support-status-cli.ts:253-258`).

The exact current corpus contains 36 admitted entries, 18 English and 18 Romanian. Every entry has a nonempty separately reviewed projection and fallback. My bounded scan built all 22 capability-language context surfaces and found no closed canonical ID, catalog route or repository-path metadata in the produced context. This is a scan of the exact current shipped snapshot and catalog, not a claim about arbitrary future or legacy bytes; future bytes must pass the same loader and review contract.

## Assigned finding dispositions

1. **COR_C1 `t_32281522` — RESOLVED, retain closed.** `MAX_SYSTEM_CODE_POINTS` is 24,000. The retained composed-system oracle proves three whole sections survive above 12,000 and the final instruction/output contract remains at or below 24,000. Current assembly rejects overflow rather than silently truncating a selected section.

2. **COR_C2 `t_4f43d8c1` — RESOLVED, retain closed.** A request-supplied resolved snapshot takes precedence over a lookup by version and supplies entries through ranking, model context, provenance and recovery. The retained identity oracle passes mismatched lookup/current versions and observes only the route-resolved object.

3. **COR_C3 `t_e248c7cc` — RESOLVED as intentional fail-closed behavior, retain closed.** Actions are admitted from trusted request context before the call, represented by request-local references, translated only after validation, and intersected with the selected source for fallback. Generic text receives no guessed debate ID or dynamic destination. The actual English and compact Romanian creation controls resolve the trusted guest action to `/login?next=%2Fnew`.

4. **LIVE_GUIDANCE `t_8596ccbc` — RESOLVED for the reviewed functional architecture.** The frozen actual matrix at `606b2eab…` produced 7/7 useful grounded rows: six accepted model drafts and one exact reviewed English Settings fallback. All API/DOM bytes matched, and required pointer/keyboard navigation passed. This finite result is not model-improvement evidence and does not identify discarded text. The reliability claim comes from deterministic same-source recovery after one real attempt. Production bytes are unchanged between `606b2eab…` and `5cbfc6d…`.

5. **OBS_CORRELATION `t_f9e289db` — RESOLVED for the bounded observability contract.** Each attempt gets a distinct opaque UUID and the producer/consumer uses the fixed seven-field safe projection: attempt ID, code, predicate, source/action presence and counts. The LIVE_P2 windows were unambiguous. Exact rejected text and matching spans remain deliberately unavailable, so diagnostics support fixed-category attribution rather than semantic root-cause claims.

6. **TYPE_P2_REGRESSION `t_5bce1d7b` — RESOLVED.** The mission-added `TS2532` was removed. The final captured typecheck has the exact inherited 76 diagnostics and is byte-identical to the attributed baseline, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. The project typecheck still exits 1; this disposition removes only the mission regression. The later `5cbfc6d…` change is a two-added/one-removed-line integration fixture edit and does not touch the corrected TypeScript unit fixture or production.

7. **INT_P2_DEGRADED `t_480d1d11` — RESOLVED.** The original exact 25-file run at `606b2eab…` remains recorded as 24 files passed/one failed, 977 tests passed/one failed/one TODO. The failing casted fixture omitted `modelProjection`, so structured ranking correctly returned `NO_SOURCE` before calling the model. The only late change adds a safe projection and leaves fallback absent and all assertions unchanged. Author GREEN and this reviewer's independent rerun each passed the complete file, 8/8. The reviewer's discriminating control observed projection present → one screened call, `REFUSE_SAFETY`, exact `3/4/0.001` usage and healthy circuit; projection absent → zero calls, `NO_SOURCE`, no usage and retained degraded state.

Root alone changes ticket/finding states.

## Independent verification

The final targeted command used the repository capture wrapper and passed `tests/integration/support-degraded.test.ts`, 8/8. The first capture is retained as a substrate failure because package-local dependency links were absent; the second is the successful evidence.

The first direct control used the exact service with synthetic in-memory ports. It established the projection/no-projection branch and included a real screened credential-operation draft without contacting a provider. Its first `tsx` CLI capture failed because sandbox IPC creation returned `EPERM`; the same script passed with `node --import tsx`.

The final direct control passed in one run with `TSX_DISABLE_CACHE=1`. It covered:

- one valid exact-envelope draft, returned unchanged with canonical source/action and exact usage;
- rejected non-JSON, wrong-kind, extra-key schema, unknown-source and unsafe-text drafts, each with exactly one model call and exact reviewed recovery;
- missing and unsafe fallback controls, each preserving refusal and empty provenance/actions;
- rejected marker absence from the in-memory canonical assistant writes and returned values;
- strict loading of all 36 current recovery records, 18 per language, with frozen exact reviews and shared safety admission;
- 22 capability-language model-context surfaces, each bounded and free of known canonical IDs, catalog routes and repository-path metadata.

This reviewer did not exercise HTTP, a database, compiled UI, browser, actual relay or model. Stable HTTP/DOM bytes, persistence/lifecycle behavior, pointer and keyboard navigation come from the frozen author/attestor/LIVE_P2 evidence. The broader frozen suite supplies rating, resolution, E1/E2/E6, no-source, private-status, human-handoff, degraded and case-summary exclusions; this pass reviewed their changed dependencies and did not repeat the broad suite.

## Evidence boundaries and remaining gate

- Actual-model evidence remains attributed to `606b2eabea1dc9212159e53c193cf69655424e77`. The final commit changes only `tests/integration/support-degraded.test.ts`; it does not justify a new live attribution or a claim that the model improved.
- The LIVE_P2 console classifier retained fifteen HTTP 401 events with no raw origin. Their source and harmlessness remain unverified; they did not prevent the seven measured Support rows or required navigation.
- The exact Forgot-password URL/path or UI opener and both full/compact activations remain **UNVERIFIED**. No current action is exposed and no target was guessed. This owner-input gate blocks full CP1 independently of the named correctness PASS.
- The retained `DONE.md` step-9 sentence that maps every malformed/credential/reset completion to refusal is stale relative to `SPEC-v3` and `CP1-REVIEWED-RECOVERY`: an admitted same-version exact fallback may ground; absent/invalid fallback refuses. The frozen input was not edited. Root owns the owner-facing documentation correction.
- GATE is packaging, not acceptance. The 74-file correctness lens index, 180 immutable GATE inputs and 108 final product files matched their frozen hashes with zero mismatches. GATE_P3 manifest SHA-256 is `83c3d7e6e961464eb2baf2096b9ad4df5d24054c55ec81622de0732c6e8d5aa4`; final product manifest SHA-256 is `666236be2799d448df75a64ab8e3793c31fc67c4f803df297107d6d3040d60e2`.
- Final primary and detached product worktrees are clean at exact `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`. Source verification is HEAD-only at `446c685e977104ecf2b0b5ee0519f7123968429f`; source working-byte exactness is not claimed.
- No tracked product, Git, index, service, account, credential, reset or external-connector mutation occurred. Temporary dependency symlinks were removed. A transient out-of-packet `apps/runner/node_modules` symlink to the clean exact same-revision primary lane was used for the targeted test and then removed; this process scope mistake changed no tracked or dependency target byte and is disclosed in the self-report.
- Actual reviewer token/cost usage is **UNAVAILABLE**. I did not read another current pass-3 lens verdict.

## PREDICTIONS

1. On the frozen product, any accepted exact four-key draft using only current request references will make one model call and return its narrative unchanged with canonicalized provenance/actions.
2. Any rejected draft for a source-matched current entry will make one model call and return only that entry's exact reviewed fallback, canonical top source and pre-admitted source-appropriate actions; the rejected bytes will not occur in assistant persistence or HTTP output.
3. Removing or invalidating that fallback while keeping the same rejected draft will change the outcome to `REFUSE_SAFETY` with empty sources/actions while preserving call usage.
4. Removing `modelProjection` from a structured fixture will reproduce pre-call `NO_SOURCE`, zero model calls and no completion usage; restoring only the projection will restore the screened transport branch.
5. Changing any article, projection, fallback or recovery-review digest without the matching complete review data will fail strict loading or change `kbVersion`; it will not silently enter the current snapshot.
6. A future actual-model seven-row run may vary which rows use accepted drafts versus fallback, but source-matched rows should remain useful under the deterministic recovery contract. The still-unknown Forgot-password destination will remain unavailable until owner input is supplied and separately reviewed.
