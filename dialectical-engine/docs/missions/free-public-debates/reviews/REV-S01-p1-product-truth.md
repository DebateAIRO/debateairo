# REV(S01) pass 1 — lens PRODUCT-TRUTH · verdict REWORK

- seat `REV-S01-p1-product-truth` · node REV(S01) lens product-truth, blind slice review, pass 1 of 3 · ticket `t_af8d9bb2`
- worktree (detached, read-only, 0 dirty at claim and at handoff): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-product-truth/dialectical-engine` · HEAD `db4758da` · base `5b6cc9b1`
- oracle: `SPEC-v2.md` §4 and V's words — intake `00-intake.md` goal line and rulings I-1…I-4; V rows V-1…V-7 as defaults
- **Verdict: REWORK (pass 1), findings B1 B2 B3, non-blocking N1…N5.** Two of the three blocking findings are holes in "only public"; one is V's own I-3 made unreachable in the product. B1 needs a V ruling, not a FIX seat — the row is in §7.

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Verified, each re-measured from my cwd:

| packet claim | measured | result |
|---|---|---|
| base `5b6cc9b1`, head `db4758da` | `git log --oneline -1` → `db4758da feat: erase bound published debates` | OK |
| `git diff --name-only 5b6cc9b1..db4758da -- apps/ui \| wc -l` = 0 (charge 5) | `0` from my cwd | OK |
| freeze pair `5b769877..9386a844`, three mission trees, CWD-relative pathspecs | 45 files, 5224 insertions — the pass's ledger rows, packets, folds, the review package, seats' handoffs | OK, non-empty |
| SPEC of record is `SPEC-v2.md`; R-ids are exactly 25 (DECISIONS §10 N3-p2) | `grep -oE '\*\*R-[0-9]+' SPEC-v2.md \| sort -u \| wc -l` → `25` | OK |
| R-23 route table unchanged at 52 (SV-1) | `awk 'NR>=100 && NR<=166' apps/api/src/index.ts \| grep -c '{ route: "'` → `52` | OK |
| five tests RED at base, named in the intake baseline table (charge 10) | intake `00-intake.md:79-93` names 5 | OK |
| every `allowed` path covers every deliverable the packet demands | verdict file, probes dir, self-report — all present in `allowed` | OK |
| the packet path and the cwd line resolve | both resolve | OK |

Packet defects are **N4** and **N5** below. I could not check the BUILD seats' `SKILLS LOADED` lines against their role floor (reviewer contract §1): those lines live in the READY comments on the BUILD tickets, which my `inputs` line does not name, and the four `agent-reports/BUILD-S01-C*.md` files carry no `SKILLS LOADED` line. Recorded under UNVERIFIED, not as a finding.

---

## 2. How I verified (probe, never read)

Three probe files, written from the SPEC/V text before I read any test in the diff. All three are promoted to
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-product-truth/`; none is wrapped, each runs bare (TOOLING-TRAPS "A promoted probe may be WRAPPED"). The worktree copies were deleted; the worktree ends byte-clean.

| probe | what it exercises | result (3 runs, worst counts) |
|---|---|---|
| `rev-s01-p1-product-truth.test.ts` (unit, in-process `buildApi` + the real `PostgresPublicationApplication`) | PT-1…PT-16 — acceptance steps 3,5,7,8,9,10,12,14,15 and the three holes | 16/16, ×3 |
| `rev-s01-p1-product-truth-ui.test.tsx` (render, JSDOM + the real `PublicationControl`) | UI-1…UI-3 — the owner's affordances on an auto-published Free debate | 3/3, ×3 |
| `rev-s01-p1-product-truth-db.test.ts` (integration, the repo's throwaway Postgres, read **under `SET ROLE debateai_runtime`**) | PTDB-1…PTDB-4 — I-2 "leave them alone" and V-2's "for how long" | 4/4, ×3 |

Suites I re-ran myself, three runs each, worst counts (`passed/total`):

- unit + render set (`fpd-s01-c2-auto-publish` 8/8, `fpd-s01-c3-unpublish-http` 10/10, `fpd-s01-c4-erasure-http` 8/8, `s8-publication` 26/26, `s8-publication-http` 4/4, `s10-erasure-http` 8/8, `api` 31/31, `tiers-s02-admission` 15/15, `s7-authorization` **30/31**, plus my probes): **159/160**, identical in all three runs. The one failure is the named pre-existing DELTA, `"keeps one complete, duplicate-free policy row per contract route"`, failing with the same pair as base — verbatim: `AssertionError: expected [ 'POST /v1/auth/register', …(51) ] to have a length of 50 but got 52`.
- integration set: `fpd-s01-c1-binding` 9/9, `fpd-s01-c1-privileges` 3/3, `fpd-s01-c4-delete-published` 14/14, `tiers-s02-run-plan-tier` 6/6, `plan-tiers-route-privileges` 1/1, `s8-publication-database` **25/26** (the named DELTA, and it fails for the *same* reason as base — base log `logs/base-red-s8-publication-database.log:265` and my run both print `Received: "Cannot read properties of undefined (reading 'map')"`), my DB probe 4/4 — and `fpd-s01-c2-system-publication` **0 passed / 16 SKIPPED** in all three runs. See **N3**: that is an environment defect in the suite, not a product failure; forced to a UTF-8 locale it is 16/16 in three runs.
- `pnpm exec tsc --noEmit` at head with my probes present: 71 diagnostics; exactly one of them is my own probe file's (`tests/unit/rev-s01-p1-product-truth.test.ts(217,43)`), so the slice's number is **70 — the base count — and no diagnostic names a file this slice wrote** (SV-6 clean).

No process outlived the run; nothing bound a no-touch port; nothing was opened on V's desktop.

---

## 3. Charge 2 — SPEC-v2 §4 walked step by step, as a stranger holding only the step text

§4 is written for **V personally against a served lane**; no stack was served for this pass (package README §5) and PLAN SV-11 says REV does not impersonate V. I executed each step's *decidable content* in-process and marked the rest UNVERIFIED. "EXECUTED" below always names the frame.

| step | what it asks | outcome |
|---|---|---|
| 1 | full-pagination baseline of `GET /v1/public/debates` | **UNVERIFIED** — needs the served lane and its real data. The route's pagination is untouched by the diff. |
| 2 | `POST /v1/asks`, eleven keys, `plan_tier: "free"` → 202 `{run_ref,status:"QUEUED"}` | **UNVERIFIED end to end** — an ask needs the engine. The binding half is EXECUTED: PTDB-1 shows a run row created with the rule reads `bound=true`, and `plan_tier` NULL or `premium` reads `false`. |
| 3 | poll the answer to 200 | **UNVERIFIED** — needs a real run. |
| 4 | the debate appears in the public list with **no publish request** | **EXECUTED (PT-1)**: `GET /v1/runs/{id}/answer` returns 200 and calls `tryAutoPublish({runId,userId,ownerRef})` exactly once, while `publications.publish` (the owner/grant path) is never called. The DB half of "it becomes PUBLISHED with no grant" is the C2 suite, which I could only run after forcing UTF-8 (N3): 16/16, including *"creates no identity session, publication binding, or PUBLISH grant"*. |
| 5 | `GET …/visibility` = `{"state":"PUBLISHED","public_ref":…}`, **two keys** | **EXECUTED (PT-2)**: the published read is byte-exactly two keys; the outstanding read is `{"state":"PRIVATE","public_ref":null,"publish_pending":true}`. `PublicationTransitionSchema` is `.strict()`, so a third key on any other run would fail the parse. |
| 6 | signed-out read of `/v1/public/debates/<ref>` and two `$WEB` pages | **UNVERIFIED** — needs the served web origin. |
| 7 | unpublish → **409** `{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}` | **EXECUTED (PT-9)**. |
| 8 | the **same grant** again → the same 409, not a 404 | **EXECUTED (PT-9)**: two identical 409 bodies, and `publications.unpublish` — the only consumer of the grant — is never called. The 409 sits after `preflightGrant` (`apps/api/src/index.ts:1175-1200`), so R-13/R-14 hold structurally. |
| 9 | a second user → `404 {"error":"NOT_FOUND"}`; no session → `401 {"error":"SESSION_REQUIRED"}` | **EXECUTED (PT-12)**: both, and the non-owner's body is byte-identical to the body for a run id that exists nowhere. |
| 10 | the creator deletes → **200 CLEANED** or **202 PENDING**, not 409 | **EXECUTED at the route (PT-13)**; the decision itself is in `core.prepare_private_run_erasure` (`migrations/0068_bound_published_erasure.sql:211-237`) and is covered by `fpd-s01-c4-delete-published` 14/14 in my three runs. **But see B1: V cannot reach this step from the product, only with a hand-made API call.** |
| 11 | the public copy is gone | **UNVERIFIED end to end** (needs the list); the erasure writes the PRIVATE visibility row and the key-cleanup intent (`0068:217-233`), which is what `listPublicRefs` reads. |
| 12 | a Premium run is not published by serving its answer; visibility two keys | **EXECUTED (PT-8, PT-2)**: with the predicate answering false, `tryAutoPublish` makes no other call at all. |
| 13 | Premium publish with a grant → 201 | **EXECUTED** — unchanged code path; `s8-publication-http` 4/4 and `s8-publication` 26/26 in my runs. |
| 14 | Premium unpublish → **200** `{"state":"PRIVATE","public_ref":null}` | **EXECUTED (PT-11)** — this is the step that proves step 7's refusal is about the tier, not the route. |
| 15 | delete a published Premium debate → **409 DEBATE_MUST_BE_PRIVATE** | **EXECUTED (PT-14)**. |
| 16 | a debate public before the slice still returns 200 | **UNVERIFIED end to end**; R-22's mechanical half is EXECUTED by the C2 suite's *"keeps the pre-slice public contract parseable"* (16/16 under UTF-8), and by the diff adding **no required key** to `PublicDebateSchema`. |

**A step V cannot run as written is a finding.** I found none in §4's wording — the bodies, the `step_up_grant.token` extraction, the CSRF/Origin note and the action literals all match the contract at head. §4's defect is one of *coverage*, not wording: step 10 tells V to call the API directly, which is exactly why B1 never surfaced.

---

## 4. Blocking findings

### B1 — the creator cannot delete an auto-published Free debate from the product; V's I-3 survives only as a curl command

- `apps/ui/components/PublicationControl.tsx:194` — the whole delete block is rendered under `visibility?.state === "PRIVATE" ? (…) : null`; `:77` also early-returns `if (… || visibility?.state !== "PRIVATE")`.
- Concrete inputs → wrong outcome: a Free run the server publishes (R-4) has `visibility.state === "PUBLISHED"`. The owner opens `/debate/<run>`. The delete affordance is **absent**, and the one control that is present, Unpublish, is now a 409 (R-12). The debate can never be removed by its creator through the product.
- Evidence (UI-2, JSDOM mount of the real component): with `readRunVisibility` → `{state:"PUBLISHED",public_ref:…}` no rendered button's label contains `Delete`, and the string `Delete this private debate` is absent from `document.body.textContent`; the control set is Publish/Unpublish only. UI-1 mounts the same component with `PRIVATE` and the delete button is there — so the difference is the slice's own new state, not the fixture.
- Why this is product-truth and not the UI's problem: V's I-3 is *"delete stays, but only the creator can delete a debate"*, and intake C3's disposition is *"the creator can delete a Free debate while it is public"*. The slice makes the second half false for every real user. Row V-3 rules only on the **Unpublish** control; V-5 rules on *which tier* may delete while public; nothing in V-1…V-7, the intake, `SPEC-v2` §5 or `DECISIONS.md` records that the **Delete** affordance disappears the moment the server publishes. It is not an accepted default — it was never put to V.
- The remedy is a UI change, which I-4 forbids. So this is a **V row** (§7), not work for a FIX seat. It is blocking for this lens because the slice ships a state in which V's own ruling is unreachable.

### B2 — a Free debate is served in full through a route the hook does not cover, stays PRIVATE, and is never queued

- `apps/api/src/index.ts:1101-1113` hooks **only** `GET /v1/runs/{id}/answer`. `apps/api/src/index.ts:996-1008` (`GET /v1/answers/{id}`, same policy row `auth:"user"`, `resource:"run-owner"`, `apps/api/src/index.ts:154`) returns the identical `AnswerSchema.parse(answer)` body with no `tryAutoPublish` call.
- Concrete inputs → wrong outcome (PT-3): as the owner, `GET /v1/answers/<answer_id>` → **200**, `run_ref` and `composed_text` are the full private answer, and `tryAutoPublish` is **not called**. The run's latest visibility state stays `PRIVATE`, no work row is written, and PT-16 shows the reconciler claims only rows the work table already holds — so nothing ever recovers it.
- This is not a hypothetical route. `apps/ui/lib/serverApi.ts:104` tries `readAnswer(id)` **first** and only falls back to `readRunAnswer` on `NOT_FOUND`; `apps/ui/lib/serverApi.ts:57` hydrates the owner's answer list through `readAnswer(item.answer_id)`; `apps/ui/lib/api.ts:177` falls through to `readAnswer(id)` whenever the id is an answer id. An owner who reaches their debate by answer id has their answer served and their Free debate stays private.
- Against V's words — *"free debates can only be public"* — that is a hole. It is not covered by V-1 (BLOCKED), V-2 (retry) or V-4 (pseudonym): there is no failure here, and nothing outstanding. The root cause is upstream of the build: `SPEC-v2` §1 defines the *served answer* as the state in which **`GET /v1/runs/{id}/answer`** first returns 200 (`apps/api/src/index.ts:1097-1102`), so the builder implemented the SPEC faithfully and the SPEC is narrower than V's sentence. The class to sweep is *every route that returns an `Answer` body for its owner*: `GET /v1/answers/{id}` (confirmed reachable), `GET /v1/answers/{id}/inspection` and `GET /v1/answers/{id}/nodes/{nodeId}` (partial projections — I did not confirm they carry the full answer; listed for the sweep, not asserted).

### B3 — any failure outside the four enumerated reasons leaves the run PRIVATE with nothing outstanding (R-9 violated)

- `apps/api/src/publications.ts:196-290`: the outstanding record exists **only** inside `tryAutoPublish`'s own enumerated branches (`AUTO_PUBLISH_NULL_PSEUDONYM`, `…_KEY_PROVISION_FAILED`, `…_CIPHER_FAILED`, `…_TRANSITION_NULL`). There is no enqueue-before-attempt: nothing writes a work row before the attempt starts.
- Every repository call before those branches can throw, and one demonstrably does: `core.transition_system_run_publication` ends with `RAISE EXCEPTION USING ERRCODE='40001'` (`migrations/0067_system_run_publication.sql:414-417`). `apps/api/src/index.ts:1109-1111` then swallows it with a bare `catch { }`.
- Evidence: **PT-4** — with `readAuthorPseudonym` rejecting, `tryAutoPublish` rejects and `upsertAutoPublishWork` and `auditSystemPublicationAttempt` are **both never called**; the answer route still returns 200. **PT-5** — same with `systemPublish` raising. **PT-6** is the control: when `systemPublish` merely *returns null*, the work row is upserted exactly once, so the difference is the throw, not my double.
- R-9 requires, after a publishable bound run's answer is served, exactly `PUBLISHED` **or** `PRIVATE` **with a readable outstanding record** — and states in terms: *"`PRIVATE` with nothing outstanding is a violation of this requirement."* This is that state, and the owner's `publish_pending` read (R-11) is absent too, so the run is served as private **by choice**. V-2's default — retried until it lands — never engages, because the retry queue is only ever written by the code path that failed.
- Smallest remedy the lens can name (not a design ruling): write the work row before the attempt and clear it on success, so the enqueue cannot be skipped by a throw. `VERDICT: enqueue before attempt / CONFIDENCE: high / STRONGEST COUNTER: the next successful read of the same run re-runs tryAutoPublish and heals it — true, but only if the owner reads it again through the one hooked route, which B2 shows is not guaranteed.`

---

## 5. Non-blocking findings (each sets WHEN, never WHETHER; each needs a ticket this pass)

**N1 — a permanently failing auto-publish is retried for ever, every 30 s, with no backoff and no cap.** `migrations/0067_system_run_publication.sql:399-405` re-arms `next_attempt_at=clock_timestamp()` on **every** conflict, and `:436-441` claims every row with `next_attempt_at<=now`; `attempt_count` is incremented and read by nothing. `apps/api/src/main.ts:300-308` ticks the reconciler every 30 s. Evidence (PTDB-4, under the real schema): after a second failure the row is immediately claimable again, `attempt_count=2`, `next_attempt_at<=clock_timestamp()`. Charge 3 asks what the owner's visibility read says and for how long — the answer is `publish_pending: true` for ever, and R-21's per-attempt DENY audit row makes that ≈2,880 audit rows per run per day. V-2's default authorises retrying; it does not authorise an uncapped loop.

**N2 — a BLOCKED answer writes to the auto-publish work table for every run, bound or not.** `apps/api/src/publications.ts:197-200` calls `clearAutoPublishWork(runId)` **before** it asks `isFreePublicBound`. Evidence (PT-7): on a BLOCKED answer `clearAutoPublishWork` is called once and `runIsFreePublicBound` is never called at all. Every Premium owner's read of a BLOCKED answer therefore issues an UPDATE against `core.free_public_auto_publish_work`. The outcome is unchanged (no row matches), so this is not a R-25 behaviour break, but it is a write on the path R-25 calls untouched.

**N3 — the C2 cluster's integration suite cannot run outside the lane, and its failure reads as a skip.** `tests/integration/fpd-s01-c2-system-publication.test.ts:218-226` constructs its own `EmbeddedPostgres` with **no `initdbFlags`**, unlike `tests/support/testDatabase.ts:93-98` (`--encoding=UTF8`) and `acceptance/standing-db.ts`. On a host whose locale is not UTF-8 — mine is `LC_CTYPE="C"` — the cluster is created SQL_ASCII and `migrate()` dies inside the evaluator-domain seed on `normalize(canonical_name, NFKC)` with `ERROR: Unicode normalization can only be performed if server encoding is UTF8`, SQLSTATE `42601`, routine `unicode_norm_form_from_string`. All 16 tests are then **SKIPPED**, and vitest's summary reads `1 failed | 61 passed | 16 skipped`, which looks like the one known DELTA. Three identical runs. With `LC_ALL=en_US.UTF-8`: **16/16, three runs.** Class sweep, member by member: three files construct `EmbeddedPostgres` — `tests/support/testDatabase.ts` (has the flag), `acceptance/standing-db.ts` (has the flag), `tests/integration/fpd-s01-c2-system-publication.test.ts` (does not). This is the only suite that proves R-4, R-5, R-6 and R-20 against a real database, so a lens that read its own summary and moved on would have graded the system-publish path unverified without noticing why.

**N4 — packet/plan defect: SV-0's lens setup is incomplete, and a suite-level `beforeAll` failure is invisible in the summary.** PLAN §6 SV-0 names `pnpm install` + `pnpm run generate:contract` as the lens-worktree gate. It also needs a UTF-8 locale (N3), and the gate `test -f packages/contract/generated/client.ts` cannot detect the difference. Packet charge 10 tells the lens that a failure outside the five named base-RED tests is its to explain, but a `beforeAll` that dies produces **zero** failures and sixteen skips.

**N5 — packet defect: charge 5 scoped the UI question to one control.** Charge 5 asks only what the existing UI shows a Free owner who clicks Unpublish, and labels it *"residue for V's test point, not a finding against the slice (V-3)"*. Measured (UI-3, the real component): the 409 and its typed error are discarded by the bare `catch` at `apps/ui/components/PublicationControl.tsx:70-72` and the owner is told **"Publication change was not authorized. Recheck your password and authenticator code."** — the word `Free` appears nowhere. That is the residue V-3 anticipated, and I agree it is not a finding against the slice. But the charge asked about **one** affordance, when the class is *every owner affordance keyed off `visibility.state`*; sweeping that class is what produced B1, and the packet's framing is why nobody swept it earlier.

---

## 6. Charges 3 and 4, answered directly

**Charge 3 — every way a NEW Free debate ends up not public and not deleted.** Each route, with its disposition:

| path | disposition |
|---|---|
| a BLOCKED answer (V-1) | **accepted default.** PT-7: no publish, no work row, `clearAutoPublishWork` once; R-8's "not retried forever" holds. |
| an auto-publish that keeps failing (V-2) | **accepted default in kind, hole in degree — N1.** The owner's read says `publish_pending: true`, and it says it for ever, with no backoff and no cap. |
| the reconciler never runs in production wiring | **wired.** `apps/api/src/main.ts:299-308` calls `reconcileFreePublicAutoPublish()` at boot and every 30 s beside the existing cleanups. The reconciler reads the answer through `application.readRunAnswer(runId, undefined as never, ownership)`; the production implementation ignores the session argument (`apps/api/src/index.ts:1472-1474`), so the `undefined as never` is not a runtime trap. **But** if `options.publications` is undefined (no publication cipher — `apps/api/src/main.ts:284`) there is neither hook nor reconciler: PT-15 shows the answer still serves 200 and nothing is queued. That deployment simply has no publication at all, so I record it as a deployment precondition, not a slice hole. |
| an answer served through a path other than the hooked route | **hole — B2.** |
| an owner-driven publish followed by unpublish before the answer is served | **not reachable.** `POST /v1/runs/{id}/publish` reads the answer first and returns 404 when it is null (`apps/api/src/index.ts:1142-1148`), so a Free run cannot be owner-published before its answer exists; once it is published, unpublish is the 409 (PT-9). |
| a run created through the legacy principal path | **not bound.** `plan_tier` is NULL for a legacy-principal run (intake `00-intake.md:64`), and PTDB-1 shows `plan_tier IS NULL` with `free_public_rule=true` reads `bound=false`. R-2 holds under the runtime role. |
| a failure that is not one of the four enumerated reasons | **hole — B3.** |

**Charge 4 — "leave them alone" (I-2) and "Premium stays as it is".** Both proven, and both measured under the product's role, not a superuser pool (TOOLING-TRAPS, V's TEST(S03) finding):

- PTDB-2: `core.run.free_public_rule` carries `column_default = 'false'`, so **every row that existed when `0066` was applied is unbound by construction** — no backfill, no clock, no deploy-time comparison (R-1).
- PTDB-1, under `SET ROLE debateai_runtime`: a Free run with the column at its default reads `bound=false`; Free + rule reads `true`; Free with the rule explicitly false reads `false`; Premium + rule reads `false`; NULL tier + rule reads `false`; an unknown run id reads `false`.
- PTDB-3: a pre-rule Free run has zero `core.run_visibility_event` rows — R-3's "nothing changes visibility because of this slice".
- PT-8: for a run the predicate calls unbound, `tryAutoPublish` makes **no other repository call at all** — it does not read visibility, does not read a pseudonym, does not touch the work table.
- Premium: PT-11 (unpublish 200 `{"state":"PRIVATE","public_ref":null}`), PT-14 (delete while published 409 `DEBATE_MUST_BE_PRIVATE`), PT-2 (visibility two keys), and the unchanged publish path green at 26/26 + 4/4 in three runs. The one asterisk is N2, a write with no behavioural consequence.

**Charge 5 — "only a backend change".** `git diff --name-only 5b6cc9b1..db4758da -- apps/ui | wc -l` → **0** from my cwd. The 409 body the existing UI shows a Free owner is in N5.

---

## 7. Row for V (the orchestrator transcribes and numbers it; I do not)

```
V-ROW: NEW · S01 · t_2e15bf90 · A creator cannot delete their auto-published Free debate from the product
Your ruling I-3 was "delete stays, but only the creator can delete a debate", and intake C3 resolved that the
creator can delete a Free debate while it is public. The API does exactly that (SPEC-v2 R-16; acceptance step 10
returns 200 CLEANED / 202 PENDING). The screen does not: apps/ui/components/PublicationControl.tsx:194 renders the
delete control only while the debate is PRIVATE, and this slice makes every Free debate PUBLISHED and refuses
unpublish with a 409. Measured on the real component (REV-S01-p1-product-truth probe UI-2): with visibility
PUBLISHED, no rendered control contains the word "Delete". Row V-3 only ruled on the Unpublish button, so this was
never put to you. Fixing it needs one apps/ui file, which your ruling I-4 ("it's only a backend change") forbids.
Recommended default: ship S01 as built and open a UI follow-up ticket at TEST(S01) beside V-3's, accepting that
until it lands a Free debate can be deleted only through a direct API call.
Smallest yes/no for V: "Is it acceptable that, until a follow-up UI ticket ships, a Free debate can be deleted only
through a direct API call and not from the screen?"
VERDICT: ship S01 and file the UI follow-up / CONFIDENCE: medium / STRONGEST COUNTER: "only public" and "delete
stays" were one package in your rulings, and shipping the first without the second leaves a user with a debate
they can neither hide nor remove — that argues for holding S01 until the one-line UI gate changes with it.
```

---

## 8. What I did NOT verify

- Acceptance steps 1, 3, 6, 11, 16 end to end, and step 2's ask — they need the served lane and V (package README §5, PLAN SV-11). Their mechanical halves are in §3.
- `GET /v1/answers/{id}/inspection` and `GET /v1/answers/{id}/nodes/{nodeId}` — named in B2's class sweep, not asserted; I did not confirm what of the answer they return.
- The four BUILD seats' `SKILLS LOADED` lines against their role floor — those lines are on the BUILD tickets, which my `inputs` line does not name, and the `agent-reports/BUILD-S01-C*.md` files carry none.
- Anything inside the security lens (the `…00f1`/`…00f2` trigger admissions, V-7) or the correctness lens (mutants, RED frames per cluster step). I stayed in product-truth.

---

## 9. Predictions about the other two lenses (blind; falsifiable)

I expect **correctness/tests** to arrive at REWORK on different grounds: the `catch {}` at `apps/api/src/index.ts:1109-1111` swallowing a real error is the shape that lens hunts, and I expect it to find the same B3 state from the test side — that no test in the diff drives a *throw* out of `tryAutoPublish`, only the four `return` branches, so R-9's "PRIVATE with nothing outstanding" is untested. I expect it to *miss* B2, because `/v1/answers/{id}` is outside the diff and its suites are all built from the hooked route; and I expect it to miss N3, because it will very likely run the suites in the lane or with a UTF-8 locale and see C2 green, or see the 16 skips and read the summary line rather than the log. I expect **security/data-safety** to spend its pass on V-7 — the second pinned actor token `…00f2` admitted by the redefined trigger in `0068:24-30` — and to test whether the `core.run_is_free_public_bound` guard in that admission can be bypassed on an unbound run; my guess is it finds the admission sound but files an N on the erasure audit trail, since `0068` deliberately writes no `debate.publication.unpublished` event and an auditor reading only publication events sees a debate leave the public list with no publication-side record. I expect neither lens to raise B1: it is in `apps/ui`, which the packet's charge 5 frames as residue and which `git diff -- apps/ui` reports as untouched — the file nobody diffed is the file that broke V's ruling. If a lens does raise it, I would check next whether `DebatePageClient.tsx:1519` has any other delete entry point I did not find.
