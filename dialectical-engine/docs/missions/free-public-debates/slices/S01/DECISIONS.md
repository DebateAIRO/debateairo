# DECISIONS — S01 · mission `free-public-debates`

Append-only. One row per decision. A question answered here is re-asked to nobody. Checked before any
question goes to V. V's intake rulings I-1…I-4 and rows V-1…V-4 are not re-decided here; they are
cited.

## 1. Decisions taken

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | One slice or several | ONE vertical slice, S01 | The three parts are not separately exercisable: the delete requirement exists only because unpublish is refused (intake C3), and the refusal is only reachable on a run the server published itself. V's walk is one continuous walk. | REQ-01 (intake default; charge 1) |
| 2026-09-20 | How "Free runs started after this ships" (I-2) is decided by a test | From the run's own persisted state, read once per run row (SPEC R-1) | A clock comparison has no value to compare against inside a test, moves under a redeploy, and answers differently in CI than in the lane. | REQ-01 |
| 2026-09-20 | Does `plan_tier IS NULL` bind | No — never bound (SPEC R-2) | ADR-0024 decision 1 keeps the column nullable and forbids a backfill; `migrations/0061_plan_tier_on_run.sql:1-5`. NULL is not `free`, and I-2 already says existing rows are left alone. | REQ-01, citing ADR-0024 |
| 2026-09-20 | Status code for the refused unpublish | 409 (SPEC R-12) | It is the status this API already returns for its one other visibility conflict, `409 DEBATE_MUST_BE_PRIVATE`, `apps/api/src/index.ts:787-789`. A second shape for the same class of answer costs a reader one more branch. | REQ-01 |
| 2026-09-20 | Typed error string for that refusal | `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` (SPEC R-12) | Names the tier and the refused verb, so a test asserts one literal and a log is greppable. Pinned by the SPEC so two seats cannot pick two strings. | REQ-01 |
| 2026-09-20 | Where the tier refusal sits relative to the grant preflight | After ownership and a live grant are proven (SPEC R-13) | Refusing earlier turns the unpublish route into a tier-and-existence oracle: any signed-in user could probe an arbitrary run id and read a typed Free refusal instead of today's uniform 404. The cost is one extra acceptance step for V (mint the grant first), paid once. | REQ-01 |
| 2026-09-20 | Is the step-up grant consumed by a refused unpublish | Not consumed (SPEC R-14) | Otherwise the second identical call answers 404 and the refusal becomes unreproducible — two seats would build the two behaviours. Pinned so the acceptance step 8 has one correct outcome. | REQ-01 |
| 2026-09-20 | How "never served as private by choice" (row V-2) is checked | The owner's visibility read distinguishes outstanding from never-published, without changing the meaning of the two existing `state` values (SPEC R-11) | A new value inside the existing `state` field is a wire change an older reader parses; the back-compat class that already bit this repo once (`docs/missions/public-debate-access/INTAKE.md:71-75`) is the same class. | REQ-01 |
| 2026-09-20 | Does the slice add a contract route | No (SPEC R-23) | V ruled backend-only with no UI (I-4); a new route also moves the already-RED `s7-authorization` count and would hide a real regression inside a moved baseline. Escape hatch is a V row, not a seat's judgement. | REQ-01, citing intake C6 and the baseline table |
| 2026-09-20 | How `s7-authorization` is asserted | DELTA on the named test, with the SAME expected/actual pair as base (expects 50, finds 52) | The suite counts policy rows per route and is RED at base; asserting the suite green would be asserting something this slice must not cause. Asserting only "still RED" would let a new mismatch hide. | REQ-01 (packet charge 4) |
| 2026-09-20 | Whether a BLOCKED Free answer is retried | No — outstanding work for it reaches 0 and stays 0 (SPEC R-8) | Row V-1's default says it is not published; an outstanding record that never clears is a retry loop that burns work forever and makes R-21's audit count meaningless. | REQ-01, extending row V-1's default to its mechanical consequence |
| 2026-09-20 | What the audit trail must show for a system publish | The four observables of SPEC R-20 | Charge 6: REQ states what is observable, ARCH picks the mechanism. The fourth observable (no phantom session id or grant hash) is the one a convenient design breaks: reusing the owner's last session id would make the row parse as a user action that never happened. | REQ-01 |
| 2026-09-20 | Acceptance in one display mode or two | Once (SPEC §4 preamble) | `ui: no`: the slice adds no screen, element or token, so there is nothing whose rendering differs by mode. Packet §2 sets the rule. | REQ-01, citing intake `ui: no` |

## 2. Alternatives rejected (the brainstorming record; `superpowers:brainstorming` has no human in a fleet seat, so the rejections are written here instead of waiting for a yes)

| alternative | why not |
|---|---|
| Split S01 into three slices (auto-publish · unpublish refusal · delete-while-public) | The refusal and the delete are unreachable until auto-publish exists, so two of the three would ship with acceptance steps V cannot run. Charge 1's default holds and I do not dissent from it. |
| Decide the I-2 boundary by comparing the run's `as_of`/creation time to a deploy timestamp | There is no deploy timestamp inside a test; CI, the lane and the served stack would each answer differently, and a redeploy would move which runs are bound. |
| Decide it from a migrations bookkeeping table | Couples product behaviour to migration bookkeeping; a squashed or replayed migration silently moves the boundary, and the answer is not readable from the run row the requirement is about. |
| Backfill existing Free runs to public | Directly refused by V at I-2 ("leave them alone"), and ADR-0024's rejected alternatives already name a backfill as a fabricated record. |
| Refuse unpublish with 403, or with today's uniform 404 | 403 invents a second conflict shape; 404 makes the refusal indistinguishable from "no such run", so V's acceptance step 7 would have no observable outcome and the UI could never tell a user why. |
| Refuse unpublish before the grant preflight so V needs no step-up | Cheaper for the walk, and it leaks tier and existence for any run id to any signed-in caller. Rejected on the security cost. |
| Let a Free debate be deleted by anyone with a grant, dropping the owner check | I-3 is explicit: only the creator. The route is already `resource: "run-owner"` (`apps/api/src/index.ts:132`); the requirement makes it checkable rather than changing it. |
| Extend delete-while-public to every tier, not only Free | Contested — routed as the V-ROW below, with the narrow default frozen in the SPEC. |
| Add a REQUIRED key to `PublicDebateSchema` to mark a system publish | Turns every snapshot published before this slice into a 404 through `catch { return null }` (`apps/api/src/publications.ts:301-321`). The marker belongs in the audit trail (R-20), which no public reader parses. |
| Add an admin route to trigger the retry reconciler | A new contract route moves the RED `s7-authorization` count (R-23) and adds surface V did not ask for. The retry is internal; R-10 checks it through its effect, not through a route. |
| Fail the run when the auto-publish fails | Refused by row V-2's default, and it would make a Free debate less reliable than a Premium one for a reason the asker has no part in. |
| Define done for this slice through a mock and a `DONE.md` | `ui: no`: no surface is added, so there is nothing for a mock to draw. The oracle is §4 of the SPEC, run by V. |

## 3. Rows for V

```
V-ROW: NEW · S01 · t_2e15bf90 · Delete-while-public: Free only, or every tier?
Intake C3 makes the creator able to delete a Free debate while it is public, because a Free debate can
never be made private again. A Premium owner keeps today's path: unpublish first, then delete, and a
published Premium debate still answers 409 DEBATE_MUST_BE_PRIVATE (SPEC R-19). That leaves two
different delete rules on one route, decided by the run's tier.
Recommended default: Free only. The SPEC is frozen on it (R-16, R-19).
Smallest yes/no for V: "Keep 'delete a published debate' for Free debates only, and leave Premium
owners unpublishing first?"
VERDICT: Free only / CONFIDENCE: medium / STRONGEST COUNTER: two delete rules on one route is a rule a
support agent will explain wrongly, and widening it to every tier would delete one branch instead of
adding one — but widening also changes Premium behaviour, which V ruled unchanged at I-1, so it cannot
be taken without V.
```

## 4. Contradictions found by REQ-01

None left open. C1–C3 were resolved by V at intake; C4–C7 bind as their row defaults and are written
as SPEC requirements R-8, R-9/R-11, R-24/R-12 and R-6/R-7. One new contested product question was
found and is the V-ROW in §3; the SPEC is frozen on its recommended default, as the law requires.

---

# APPENDED 2026-09-20 by REQ-FIX-02 (pass 2, after REQ-REV pass 1 REWORK)

Sections 1–4 above are REQ-01's and are not rewritten. This section is appended.

## 5. Re-pointing — every SPEC reference above now means `SPEC-v2.md`

`SPEC-v2.md` is the SPEC of record; `SPEC.md` stays byte-identical as the superseded first version.
Requirement numbers R-1…R-25 are unchanged, so every `R-n` cited in §1–§4 still names the same
requirement. Two references above are section pointers, not line pointers, and resolve against the
new file: §1's "Acceptance in one display mode or two | Once (SPEC §4 preamble)" → `SPEC-v2.md` §4.0;
§4's "SPEC requirements R-8, R-9/R-11, R-24/R-12 and R-6/R-7" → the same numbers in `SPEC-v2.md`.
Row V-5 in §3 was transcribed by the orchestrator into `V-DECISIONS-PACKET.md:11`; its default is
unchanged and still binds.

## 6. Decisions taken at pass 2

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | B1 — R-8 (BLOCKED: nothing outstanding) and R-9 (never PRIVATE with nothing outstanding) cannot both hold | R-9, R-5 and R-7 are scoped to a **publishable bound run** (`terminal` other than `BLOCKED`); R-8 states that R-9 does not reach it | R-4 already carried that carve-out and R-9 did not. Scoping the general requirement is one sentence; narrowing R-8 would contradict row V-1, which V has not ruled on. | REQ-FIX-02 |
| 2026-09-20 | B2 — which wire carries "outstanding, not private by choice" | One optional key, `publish_pending: true`, on `PublicationTransitionSchema`, absent unless outstanding | V-2's words are about what the owner is *served*, so a test-only row would not discharge them. An optional key absent on every other run leaves every existing response byte-identical, which a new `state` value could not. The residual deploy-skew risk is written into R-11.4 rather than hidden. | REQ-FIX-02 |
| 2026-09-20 | N4 — R-21 also required an audit row for a refused unpublish | Dropped from the requirements; the failed-auto-publish half stays and is pinned to the audit path the denial branch already uses | The reviewer is right that it sits beyond I-1…I-4 and beyond this node's charge, which asked what a *system publish* records. Kept as residue in §8 so it is not lost. | REQ-FIX-02, accepting the finding |
| 2026-09-20 | B3 — V's walk returned 400 instead of the statuses it named | §4 rewritten with the exact `.strict()` bodies, the 202/`run_ref` pin, `DELETE_PRIVATE_DEBATE`, the step-up body, and `step_up_grant.token` | Six members of one class, all measured at `3f374361`. A walk whose first mutating call is a 400 tests nothing. | REQ-FIX-02 |
| 2026-09-20 | Where the pass-2 checker lives | `slices/S01/spec-v2-check.sh` | This seat's allowed list is exhaustive and does not include `.hermes/reports/.../probes/`, where the convention would put it. The slice directory is allowed and the file is genuinely handed forward — the next REV pass runs it. Named as a packet defect in the handoff. | REQ-FIX-02 |

## 7. Alternatives rejected at pass 2

| alternative | why not |
|---|---|
| Close B1 by narrowing R-8 instead of R-9 (let a BLOCKED run hold an outstanding record that never clears) | Row V-1's default is that a BLOCKED Free answer is not published; an outstanding record that never clears is a retry loop with no terminal state, and it would make R-21's audit count unbounded. |
| Close B2 by moving the distinction to a test-only row (the reviewer's second option) | No wire change and no deploy skew, and it is the cheaper build — but the owner's own read would still answer plain `PRIVATE`, which is the thing intake C5 names. Recorded as the V-ROW in §9 so V can take the cheaper build if the skew worries him more than the wording. |
| Close B2 with a third `state` value | `SPEC.md` R-11 already forbade it and `SPEC-v2.md` R-11.1 keeps the ban: an older reader parses two values and meets a third. Same class as the back-compat trap in R-22. |
| Close B3 by telling V to use the shipped contract client instead of typing bodies | The client already sends the acknowledgement flags (`packages/contract/src/client.ts:463-475`), so the walk would pass without proving the server refuses — and V's acceptance is meant to be a stranger's walk, not a call through code this mission may change. |
| Renumber requirements in `SPEC-v2.md` | Would invalidate `PLAN.md` §3's 25 trace rows and every `R-n` cited in §1–§4 above, for no gain. |
| Fix the packet defects P-A…P-F myself | They are N8, the orchestrator's, ticket `t_5b665910`. Named, not fixed. |

## 8. Residue — filed, not built in S01

- A refused unpublish (R-12) leaves no audit row of its own. Ticket at TEST(S01), beside the UI
  follow-up row V-3 already defers.
- `docs/missions/public-debate-access/INTAKE.md:57-75` carries drifted line numbers for
  `readPublicDebate` (it says `publications.ts:301`; that is `async unpublish` today). Another
  mission's document, outside this seat's contract — named here so the next seat does not copy it.

## 9. Rows for V

```
V-ROW: NEW · S01 · t_2e15bf90 · Where the "publish is still pending" signal lives
A Free run whose auto-publish has not landed yet must not look private-by-choice (intake C5, row V-2).
SPEC-v2 R-11 puts that signal on the owner's own read as one optional key, publish_pending, on
GET /v1/runs/{id}/visibility. The cheaper alternative is to keep the signal internal — only a database
row a test reads — leaving the owner's read saying plain PRIVATE until the publish lands.
Recommended default: the optional key. The SPEC is frozen on it (R-11).
Smallest yes/no for V: "Should the owner's own screen be able to tell 'publishing' from 'private'?"
VERDICT: the optional key / CONFIDENCE: medium / STRONGEST COUNTER: it changes a .strict() wire schema
that a UI built from an older bundle parses, so during a staggered deploy one outstanding run reads as
an unavailable publication status; the internal-only build has no wire risk at all and still satisfies
row V-2's literal text, which speaks about retrying rather than about what the owner sees.
```


## 10. Orchestrator folds — REQ-REV pass 2 (PASS; N1-p2 … N3-p2), 2026-09-20

Appended by the orchestrator (planning reviews are one pass by default: N-findings are folded here, not reworked). SPEC-v2.md is frozen and is not edited; where a pointer inside it is stale, THIS section is the correction every later seat reads.

- **N1-p2** — `INSTRUCTIONS.md:12,44` and `SPEC-v2.md:8` say rows V-1…V-5; row V-6 was transcribed after REQ-FIX's READY. **The binding set is V-1…V-6** (`V-DECISIONS-PACKET.md`), each default binding until V rules.
- **N2-p2** — `SPEC-v2.md:104-105` (R-11.4) points at DECISIONS §3 (that is V-5); the row R-11 depends on is **§9 = V-6**. `SPEC-v2.md:175` (R-21 residue) points at §4; the residue list is **§8**.
- **N3-p2** — `spec-v2-check.sh` does not forbid a new requirement id (a mutant adding `R-26` passes). The requirement set of S01 is **exactly R-1…R-25**; the check every later pass uses is the unique-R-id count (`grep -oE '\*\*R-[0-9]+' SPEC-v2.md | sort -u | wc -l` = 25), not the script alone.

---

# APPENDED 2026-09-20 by ARCH-S01 (pass 1)

Sections 1–10 above are not rewritten. Binding set is V-1…V-6 (section 10, N1-p2). SPEC of record is `SPEC-v2.md`. Pointers inside SPEC-v2 that section 10 corrects (R-11.4 → this file §9 = V-6; R-21 residue → §8) are used as corrected.

Classification of the work (`superpowers:brainstorming`): **architectural** — a new `SECURITY DEFINER` publication path, a new column on `core.run`, and a change to private-run erasure. The frozen SPEC is the approval gate; rejected directions are recorded here instead of waiting for a chat yes.

## 11. Decisions taken at ARCH-S01

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | How R-1's persisted "created after the rule" value is stored | Column `core.run.free_public_rule boolean NOT NULL DEFAULT false`, written `true` on both run-creation paths (encrypted `core.create_encrypted_run` and legacy `INSERT INTO core.run`) | R-1 forbids a clock, a deploy timestamp and a migration-bookkeeping table. DEFAULT false leaves every row that exists at apply unbound (I-2, R-3). Writing `true` in both paths is ADR-0024 decision 2 applied to a new column: a value written on only one path is absent for half the runs. | ARCH-S01 |
| 2026-09-20 | What `bound` is, given R-2 | `bound := (plan_tier = 'free') AND (free_public_rule = true)`. SQL `core.run_is_free_public_bound(uuid)` returns that boolean. Premium, NULL `plan_tier`, and `free_public_rule=false` are all `bound=false`. | R-2 is a conjunction. Putting the tier inside the column would make a later `plan_tier` update silently bind or unbind a run; the column records only "created after the rule existed". | ARCH-S01 |
| 2026-09-20 | How the system publish reaches the database | New `SECURITY DEFINER` function `core.transition_system_run_publication`, new table `serve.system_publication_key_provision_intent` (no `session_id`, no `grant_token_hash`), new `serve.prepare_system_publication_key_provision`. Owner-driven `core.transition_run_publication` signature is unchanged. | ADR-0024: `CREATE OR REPLACE` with the signature unchanged, never `DROP` then `CREATE` — a DROP of the owner function would discard `GRANT EXECUTE … TO debateai_runtime` at `migrations/0040_account_erasure.sql:4157-4160`. The grant lookup at `:4014-4022` has no system input to present; widening that function to accept NULL session/grant is a signature and an authorization change of the owner path. Recorded as ADR-0026. | ARCH-S01 |
| 2026-09-20 | What actor a system publish writes | Audit row `identity.audit_event.actor_key_ref` = the literal `system:free-public-auto-publish`. Visibility row `actor_audit_token` = the UUID `00000000-0000-4000-8000-0000000000f1` (column type is uuid; it is not the R-20.3 oracle). | R-20.3: classify system vs user by reading the audit row alone with no join. Owner-driven writes a UUID (`v_audit_actor_ref::text` at `:4114-4118`). A second UUID is not distinguishable without a join. The text literal is. | ARCH-S01 |
| 2026-09-20 | When auto-publish runs | `PublicationApplication.tryAutoPublish` is awaited from `GET /v1/runs/{id}/answer` after a non-null answer, inside try/catch so the GET still returns 200 (R-9). A SKIP LOCKED reconciler `reconcileFreePublicAutoPublish` retries outstanding rows with no user publish request (R-10). | The SPEC's observable is "after the answer first returns 200". Hooking the runner persist would touch `apps/runner` (not required by any R-n). GET-only without a reconciler cannot retry after the owner stops polling. | ARCH-S01 |
| 2026-09-20 | Where outstanding work lives | Table `core.free_public_auto_publish_work` (`run_id` PK). Present and not `cleared_at` ⇔ outstanding. Visibility `publish_pending: true` is derived from that row, never stored on `core.run_visibility_event`. | R-11 forbids a third `state` value. A visibility-event flag would be a new required reader of an append-only table. The work row is the R-9 readable record. | ARCH-S01 |
| 2026-09-20 | Where the unpublish 409 sits | In the HTTP handler, after `preflightGrant` returns true and `readRun` returns non-null, before `publications.unpublish()`. If `run_is_free_public_bound` and latest visibility is `PUBLISHED`, reply 409 `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` and return. | `core.transition_run_publication` consumes the grant at `:4088-4090` before inserting visibility. Calling it would fail R-14. `identity.publication_grant_is_live` (preflight) does not consume. | ARCH-S01 |
| 2026-09-20 | How delete-while-public is implemented | `CREATE OR REPLACE` `core.prepare_private_run_erasure` with the same 5-parameter signature. When latest visibility is `PUBLISHED` AND `core.run_is_free_public_bound(p_run_id)`, write a `PRIVATE` visibility event (`warning_version='COPIES_MAY_PERSIST_V1'`), insert `serve.publication_key_cleanup_intent` as the unpublish branch does, skip the `RETURN 'PUBLISHED'` and skip the snapshot-cleanup-complete `CONTENDED` check for those refs, then continue private erasure. Unbound published runs still `RETURN 'PUBLISHED'`. | The grant is already consumed at `:4527-4529` before the PUBLISHED gate at `:4536-4538`. The snapshot-complete check at `:4547-4554` would otherwise `CONTENDED` every live publication. Owner-driven unpublish is the wrong tool: it requires an `UNPUBLISH` grant the deleter did not mint (action is `DELETE_PRIVATE_DEBATE`). | ARCH-S01 |
| 2026-09-20 | Runtime database ROLE for new SQL | System publish functions: `GRANT EXECUTE … TO debateai_runtime` (same role as `core.transition_run_publication` at `:4157-4160`). Bound predicate: `GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_runtime, debateai_erasure_runtime`. Erasure remains `debateai_erasure_runtime` (`:6435-6436`). `REVOKE ALL … FROM PUBLIC` on every new function. Proof: `SET ROLE` pattern in `tests/integration/plan-tiers-route-privileges.test.ts`. | Packet charge 4 / TOOLING-TRAPS heading "Embedded postgres with a superuser pool is privilege-blind". A superuser-pool test cannot see 42501. | ARCH-S01 |
| 2026-09-20 | Cluster cut | Four clusters. C1 (binding) first. Then C2 (system publish) ∥ C4 (delete SQL). Then C3 (unpublish HTTP), because C2 and C3 both write `apps/api/src/index.ts`. | Disjoint write surfaces may run at once. `index.ts` is one file; C2 owns the answer-route hook, C3 owns the unpublish-route 409. | ARCH-S01 |
| 2026-09-20 | Next migration numbers | `0066_free_public_rule.sql` (C1), `0067_system_run_publication.sql` (C2), `0068_bound_published_erasure.sql` (C4). Newest existing file at write time: `0065_fix11_trace.sql`. Two files already share `0061`. | `ls migrations \| sort \| tail` at ARCH-S01 write. `migrate()` applies `^\d+.*\.sql$` sorted by filename (`packages/db/src/index.ts:807-818`). | ARCH-S01 |
| 2026-09-20 | Next ADR number | ADR-0026 (system publication without a session or grant). Highest existing at write time: ADR-0025. Binding column is mission-local law in this file, following ADR-0024's placement rules rather than minting a second ADR for a boolean. | `ls docs/architecture/01-decisions/ADR-*.md` at ARCH-S01 write. | ARCH-S01 |

## 12. Alternatives rejected at ARCH-S01

| alternative | why not |
|---|---|
| `CREATE OR REPLACE core.transition_run_publication` with extra/NULL-able session and grant parameters | Changes the 14-parameter signature. ADR-0024 forbids DROP/CREATE of the sibling function for the EXECUTE-grant reason; the same grant sits on this function at `0040_account_erasure.sql:4157-4160`. A NULL grant branch inside the owner function is an authorization change of the path V left unchanged (I-1 Premium / owner-driven). |
| PostgreSQL overload of `transition_run_publication` with a different arity | Same name, two GRANTs, and `DROP FUNCTION IF EXISTS core.transition_run_publication(...)` in a later migration is one arity-typo from discarding the owner grant. |
| Reuse `serve.publication_key_provision_intent` with a fabricated `session_id` / `grant_token_hash` | `session_id uuid NOT NULL REFERENCES identity.session` and `grant_token_hash text NOT NULL CHECK (…sha256:…)` (`0040_account_erasure.sql:1017-1023`). Satisfying those constraints requires inserting a session or grant that never existed, which is R-20.4. |
| Decide I-2 by `created_at_seq` vs a migration row | R-1: a test answers bound/not-bound from the run's own persisted state with no other input. A bookkeeping table is other input, and a squashed migration moves the boundary. |
| `free_public_rule=true` only when `plan_tier='free'` at insert | R-1's value is "created after the rule existed", not "was free at insert". Conjunction belongs in `run_is_free_public_bound` (R-2). |
| `NOT NULL DEFAULT true` on the new column | Would bind every existing row at apply — I-2 / R-3. |
| Auto-publish only inside `apps/runner` persist | Touches a surface no R-n names; the SPEC's check is the owner's GET 200. |
| Auto-publish only on GET, no reconciler | R-10: a retried outstanding publish lands with no user action. After the owner stops polling, GET never runs again. |
| A new contract route that triggers the reconciler | R-23: the policy table stays at 52 entries; a new route also moves the already-RED `s7-authorization` pair (expects 50, finds 52). |
| A third `state` value `PENDING` | R-11.1. Same class as R-22's back-compat trap. |
| Refuse unpublish before `preflightGrant` | R-13: that order turns the route into a tier-and-existence oracle. |
| Call owner `unpublish()` from delete to clear the public copy | Consumes an `UNPUBLISH` grant the delete body does not carry (`DELETE_PRIVATE_DEBATE` only, `packages/contract/src/index.ts:235-237`). |
| Add a REQUIRED key to `PublicDebateSchema` marking system publishes | R-22.1: `readPublicDebate` `catch { return null }` at `publications.ts:401-402` then 404 at `index.ts:827-829`. |
| Fold C2 and C3 into one cluster to avoid the `index.ts` sequence | Valid, and rejected to keep the unpublish refusal (HTTP 409, grant non-consumption) independently RED/GREEN from the system-publish SQL. The cost is C3 waits on C2's `index.ts` write. |

## 13. Rows for V

None new. V-1…V-6 bind; I-1…I-4 bind. No product question was found that those rows do not settle. The trigger location, the actor literal, the column name and the cluster cut are HOW.

---

# APPENDED 2026-09-20 by ARCH-FIX-S01-02 (pass 2, after ARCH-REV-S01-p1 REWORK)

Sections 1–13 above are not rewritten. Assigned findings B1–B5, N1–N5. P1–P8 named, not fixed.

## 14. Decisions taken at ARCH-FIX-S01-02

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | B1 — how TypeScript writes a system DENY audit | New `identity.audit_system_publication_attempt`, SECURITY DEFINER, GRANT EXECUTE TO debateai_runtime. Application never calls `append_audit_event_internal`. | Measured: `0040_account_erasure.sql:6211-6213` REVOKE ALL from debateai_runtime. The preflight wrapper at `:3884` requires a session and a binding (R-20.4). | ARCH-FIX-S01-02, accepting ARCH-REV-S01-p1 B1 |
| 2026-09-20 | B2 — reconciler identity and production caller | `tryAutoPublish({runId, answer, userId, ownerRef})`. Work row stores user_id/owner_ref. Production caller is `apps/api/src/main.ts:297-305` (boot + 30s interval), added to the C2 file map. | Measured: `AuthenticatedSession` at `sessions.ts:34-41` carries session/token hashes a background job does not have. `grep -c main.ts PLAN.md` was 0; the interval exists at `main.ts:297-305`. Reviewer's predicted skip of main.ts is rejected: R-10 has no production trigger without it. | ARCH-FIX-S01-02, accepting both halves of B2 |
| 2026-09-20 | B3 — who adds `isFreePublicBound` | C2-S6's interface list and done-criterion. The three contradictory sentences at the C3 intro are deleted. | A BUILD node reads its cluster's steps. C2-S6 was satisfiable without the method; C3 then had no lawful file. | ARCH-FIX-S01-02, accepting B3 |
| 2026-09-20 | B4(a)(b)(c) — in-transaction guards | FOR UPDATE on `core.run`; `run_is_free_public_bound`; `run_private_content_is_live`; latest visibility ≠ PUBLISHED under that lock; system intent table added to erasure contention in 0068. C2-S3 cases 10–14 go RED if any is omitted. | Measured: owner function holds the three guards (`:3996-3997`, `:4003-4004`, `:4061-4062`). `serve.publication_snapshot` is not in the erasure-barrier table list (`:4238-4245`). `listPublicRefs` is `DISTINCT ON (run_id)` (`publication.ts:531-540`). Two concurrent GETs plus the reconciler on the same run are the production shape (V's walk polls every 10s). | ARCH-FIX-S01-02, accepting B4; not contesting B4(c) |
| 2026-09-20 | B5 — missing `freePublicRule` key during migrate→deploy | `COALESCE((p_run->>'freePublicRule')::boolean, false)`. C1-S9 re-pointed at extra-key rejection (`0061_plan_tier_on_run.sql:21-30`). | Measured: `db:migrate` is a separate CLI (`package.json:23`, `migrate-cli.ts:6`). `plan_tier` is nullable (`0061:1`); this column is NOT NULL DEFAULT false. A missing-key → false test would pin the outage as correct. | ARCH-FIX-S01-02, accepting B5 |
| 2026-09-20 | N1 — Test Files assertion | One `rc=… passed=… failed=…` line per path. | Measured: `run-suites.sh:15` runs vitest once per path. | ARCH-FIX-S01-02, accepting N1 |
| 2026-09-20 | N2 — 202 PENDING as delete success | 202 is success only with a `serve.private_run_erasure_tombstone` row. CONTENDED is not success. | Measured: `account-erasure.ts:110-112` maps CONTENDED → PENDING → HTTP 202 (`index.ts:793`). | ARCH-FIX-S01-02, accepting N2 |
| 2026-09-20 | N3 — counts standing in for membership | Named `it(` titles, named COALESCE/INSERT sites, named 52 route strings. | `grep -c` counts lines (TOOLING-TRAPS:236). SV-1 add-and-remove mutant keeps 52. | ARCH-FIX-S01-02, accepting N3 |
| 2026-09-20 | N4 — REV worktree contract generation | SV-0: `pnpm install` then `pnpm run generate:contract`; `test -f packages/contract/generated/client.ts`. | TOOLING-TRAPS heading at `:294-301`. C2 edits `packages/contract/src/index.ts`. | ARCH-FIX-S01-02, accepting N4 |
| 2026-09-20 | N5 — `actor_ref_version` | System visibility insert writes `2`. | Column DEFAULT 1, CHECK IN (1,2) (`:388-393`); owner writes `2` at `:4112`. | ARCH-FIX-S01-02, accepting N5 |

## 15. Alternatives rejected at ARCH-FIX-S01-02

| alternative | why not |
|---|---|
| Contest B4(c) as "two concurrent GETs are not realistic" | PLAN C2-S18 puts the reconciler on the same run as the GET hook; SPEC §4.1 step 3 polls every 10s. The reviewer named this prediction; it is false. |
| Answer B2 with `{userId, ownerRef}` and leave `main.ts` unmapped | R-10 then has no production trigger. The hedge in pass-1 C2-S18 ("if no periodic caller, document GET as the trigger") is the branch the finding closed. |
| Keep C1-S9 as missing-key → false | That pins B5's outage as the intended contract. Extra-key rejection is the allow-list's actual pin. |
| Write DENY from TypeScript via `audit_publication_preflight_denial` | Requires a live session and a `publication_event_binding` row (`:3908-3922`). R-20.4. |

## 16. Rows for V

None new. No product question was opened by the review. P1–P8 remain the orchestrator's.

---

# APPENDED 2026-09-20 by ARCH-FIX-S01-03 (pass 3 of 3, after ARCH-REV-S01-p2 REWORK)

Sections 1–16 above are not rewritten. Assigned findings B1-p2, N1-p2, N2-p2, N3-p2. Last lawful pass: none left open, no new V-ROW.

## 17. Decisions taken at ARCH-FIX-S01-03

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | B1-p2 — GRANT on undefined cleanup + orphan intent undeletable | Name `serve.claim_system_publication_key_provision_cleanup(integer)` and `serve.complete_system_publication_key_provision_cleanup(uuid,uuid)` in C2-S4 with bodies; GRANT those signatures to `debateai_publication_cleanup`; repository methods; `reconcileSystemKeyProvisionCleanup` on the same `main.ts` boot+interval; C2-S3 case 16 and C4-S2 case 8. C4 waits on C2. | Measured: `PLAN.md` GRANT bullet named no functions; `0040:6373-6374` GRANTs named signatures; `migrate()` is one batch (`packages/db/src/index.ts:821`) so 42883 aborts C2-S4; `:775` contention gate turns a PREPARED orphan into HTTP 202 without tombstone (`account-erasure.ts:110-112`). Owner template is `claim_publication_key_provision_cleanup` at `:1355-1404` plus `reconcileKeyProvisionCleanup` at `publications.ts:360-380`. | ARCH-FIX-S01-03, accepting B1-p2 |
| 2026-09-20 | N1-p2 — reconciler answer source | Inject `readServedAnswer(runId, RunOwnershipAccess) => Answer \| null` into `PostgresPublicationApplication`'s constructor; wire in `main.ts` from `PostgresAskApplication.readRunAnswer` (`index.ts:1448-1449`). Call it only inside `reconcileFreePublicAutoPublish`. C2-S19.3: outstanding + no GET + one reconcile → PUBLISHED. | Measured: constructor is `(repository, cipher, clock, cleanupRepository)` (`publications.ts:142-148`); repository has no answer read. `readRunAnswer` ignores session. Not an answer-read on the boot path (reviewer's predicted shortcut). | ARCH-FIX-S01-03, accepting N1-p2 |
| 2026-09-20 | N2-p2 — second DENY unobservable | One rule: the transition writes DENY for every NULL after taking the lock; `tryAutoPublish` step 8 never writes DENY. C2-S3 case 10 pins DENY count = 1. | Measured: `systemPublish` returns NULL in both "entered and denied" and "never entered". TypeScript cannot distinguish. C2-S3 case 6 never enters the function, so R-21's count of 2 is safe either way; the step was not markable. | ARCH-FIX-S01-03, accepting N2-p2 |
| 2026-09-20 | N3-p2 — race case passes sequentially | Two pools; both `prepareSystemKeyProvision` complete before either `systemPublish`. Watched FAILING with body item 4 removed before GREEN is quoted. | Measured: sequential `tryAutoPublish` returns early at step 3 (`latest visibility already PUBLISHED`), so count=1 without the in-transaction guard. | ARCH-FIX-S01-03, accepting N3-p2 |
| 2026-09-20 | C2 ∥ C4 after B4(b)/B1-p2 | C4 waits on C2. | `0068` reads `serve.system_publication_key_provision_intent` created in `0067`. Parallelism was already false after Revision 2; B1-p2 makes it explicit. | ARCH-FIX-S01-03 |

## 18. Alternatives rejected at ARCH-FIX-S01-03

| alternative | why not |
|---|---|
| Pass the answer into `reconcileFreePublicAutoPublish` from `main.ts` boot | Reviewer's predicted shortcut. Puts an answer read on the boot path; a new unmapped dependency. Constructor injection is called only when work is claimed. |
| Leave C2 ∥ C4 and have 0068 `CREATE TABLE IF NOT EXISTS` the system intent | Invents a second writer of C2's table. Sequence is cheaper. |
| Contest B1-p2 as "expires_at will always be cleaned by abandon" | Abandon runs only on in-process failure (`PLAN` steps 6–8). Process death is the owner path's own comment at `main.ts:293-296`. |
| Leave N1-p2/N2-p2/N3-p2 as V-rows | Last pass: an open finding becomes a V row and blocks the cluster. None of them is a product question. |

## 19. Rows for V

None new. B1-p2, N1-p2, N2-p2, N3-p2 are HOW. P1–P8 remain the orchestrator's.

## 20. Orchestrator folds — ARCH-REV(S01) pass 3 (PASS; N1-p3 … N3-p3), 2026-09-20

Appended by the orchestrator. The plan cleared its review at pass 3 (blocking findings 5 → 1 → 0); these three non-blocking findings are FACTS every BUILD seat of the cluster they touch reads before its first edit. The remedy is the seat's; each is closed inside its cluster against a RED case the plan already names (verdict `reviews/ARCH-REV-S01-p3.md`).

- **N1-p3 (C2)** — the new system key-provision intent table, as the plan writes it, has no `cleanup_claim_token` / `cleanup_claimed_at` columns, and the plan's own claim/complete cleanup functions need them (the owner-side table carries both: `migrations/0040_account_erasure.sql:1028-1029`). RED case: C2-S3 case 16.
- **N2-p3 (C2)** — the plan says the boot path does not read an answer (PLAN "C2-S6"/"C2-S18" text) while C2-S18 itself awaits the reconciler at boot, and the reconciler reads a served answer. One of the two sentences is wrong; C2-S19.3 is the case that decides it.
- **N3-p3 (C4)** — the cluster order is **C1 → C2 → C3 ∥ C4** (PLAN §1, Revision 3). C4's own intro paragraph still says "Parallel with C2 after C1": that sentence is stale; C4 starts after C2 is green.
