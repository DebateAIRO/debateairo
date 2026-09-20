# ARCH-REV(S01) pass 3 — FINAL scoped re-review of `PLAN.md` Revision 3

- Seat `ARCH-REV-S01-03` (`claude-opus-5`, ARCH-REV-S01's session resumed), ticket `t_cfd2f03b`, pass **3 of 3** — the last lawful pass.
- Scope (charge 1): my pass-2 findings B1-p2, N1-p2, N2-p2, N3-p2 (`reviews/ARCH-REV-S01-p2.md`) and
  `git diff 55e0f6c1..b665d91e -- docs/missions/free-public-debates/slices/S01/PLAN.md docs/architecture/01-decisions`
  (PLAN +52/−18, DECISIONS +29, PROGRESS +1; ADR-0026 untouched this pass). New breakage in scope only inside that diff (charge 3).
- SPEC of record unchanged: `SPEC-v2.md` + `DECISIONS.md` §10 (charge 4 — checked in §4).
- Lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine`
  @ `5b6cc9b1`, **0 dirty before and after**. No git write, no product file written, nothing opened on V's desktop.

## VERDICT — **PASS** (pass 3 of 3). No blocking findings. Three non-blocking: N1-p3, N2-p3, N3-p3.
## B1-p2, N1-p2, N2-p2, N3-p2: all **ADDRESSED**, each checked against the sentence and, where a mutant was possible, against a mutant.

No V row is opened by this pass. All three N-findings are closed by a line BUILD writes anyway, each against a RED case the plan already
names (C2-S3 case 16; C2-S19.3; C4-S2 cases 7–8) — charge 5's own test for non-blocking.

---

## 1. Pass-2 findings — verdict each

### B1-p2 (was blocking) — **ADDRESSED**, and the class is now mechanically detectable

The revision closes all five limbs I named, and one I did not:

| limb | sentence | line |
|---|---|---|
| the two functions exist, **with argument types** | `serve.claim_system_publication_key_provision_cleanup(p_limit integer)` … `RETURNS TABLE(publication_ref uuid, run_id uuid, user_id uuid, owner_ref uuid, claim_token uuid)` … "matching `serve.claim_publication_key_provision_cleanup` at `0040_account_erasure.sql:1355-1404`"; `serve.complete_system_publication_key_provision_cleanup(p_publication_ref uuid, p_claim_token uuid) RETURNS boolean` | `PLAN.md:358`, `:359` |
| the GRANT names signatures, not bare names | `GRANT EXECUTE ON FUNCTION serve.claim_…(integer), serve.complete_…(uuid,uuid) TO debateai_publication_cleanup` "(B1-p2; signatures named, matching `0040_account_erasure.sql:6373-6374`)" | `:379` |
| repository | `claimSystemKeyProvisionCleanup(limit)`, `completeSystemKeyProvisionCleanup(publicationRef, claimToken)` | `:393-394` |
| application + production caller | `reconcileSystemKeyProvisionCleanup(limit?)` "same loop shape as `reconcileKeyProvisionCleanup` (`apps/api/src/publications.ts:360-380`)… Called from the same `main.ts` boot list and interval", wired at C2-S18 with a two-line grep oracle | `:420`, `:573`, `:575` |
| a case that goes RED | C2-S3 case 16 (expired PREPARED intent → claim returns it → complete returns true → count 0; "goes RED if either function is omitted from `0067`"), and the done-criterion at `:329`/`:383` | `:327`, `:329`, `:383` |
| **the limb I missed** | the cluster order: `:35` now reads "**C1 first. Then C2. Then C3 ∥ C4.** … C4 waits on C2 because `0068`'s contention gate and C4-S2 cases 7–8 read `serve.system_publication_key_provision_intent` (created in `0067`) and C2-S4's claim/complete cleanup" — my pass-2 verdict did not notice that the B4(b) gate had already made C2 ∥ C4 false | `:35`, `:51` |

The erasure end is closed too: C4-S2 case 8 (`:759`) asserts that after claim+complete an expired orphan no
longer makes `prepare_private_run_erasure` answer `'CONTENDED'`, and is RED if the pair is omitted. Precedents
verified in the lane: `0040_account_erasure.sql:1355-1362` is that exact `RETURNS TABLE` shape, `:1400-1403`
carries the stale-`RECONCILING` clause the plan mirrors, and `:6373-6374` is the two-signature GRANT.

**Detector, built this pass and validated failing** — `probes/ARCH-REV-S01-03/grant-defines-check.py`: every
schema-qualified function on a C2-S4 GRANT bullet must be defined by a function bullet of the same step.

```
### live Revision 3 (must be clean, exit 0)
granted in C2-S4 : ['identity.audit_system_publication_attempt', 'serve.claim_system_publication_key_provision_cleanup', 'serve.complete_system_publication_key_provision_cleanup']
GRANTED BUT NOT DEFINED: none
exit=0
### mutant = the Revision-2 shape (definitions deleted, GRANT kept) — must FAIL
GRANTED BUT NOT DEFINED: ['serve.claim_system_publication_key_provision_cleanup', 'serve.complete_system_publication_key_provision_cleanup']
exit=1
```

That is the Revision-2 defect reproduced on demand and the Revision-3 text clearing it.

### N1-p2 — **ADDRESSED**

`PLAN.md:414-416` gives `PostgresPublicationApplication` a fifth constructor argument,
`readServedAnswer: (runId: string, ownership: RunOwnershipAccess) => Promise<Answer | null>`, "wired in
`apps/api/src/main.ts` (C2 already owns that file) as a closure over the existing
`PostgresAskApplication.readRunAnswer` (`apps/api/src/index.ts:1448-1449`, which ignores its session
parameter)". Both citations are the ones I measured at pass 2 and both are exact; `RunOwnershipAccess` is
`{ownerRef, legacyAskerId}` at `packages/db/src/index.ts:901-904`, and `:433` builds it from the work row's
`owner_ref`. The missing production case is now named: **C2-S19.3** (`:585`) — outstanding work, *no*
subsequent GET, one `reconcileFreePublicAutoPublish()`, latest visibility `PUBLISHED`, "If `readServedAnswer`
is omitted or the method returns 0 without reading, this case is RED." That is R-10's own SPEC check, and the
trace row at `:867` now cites it. The stub-reconciler hole is closed. Residue about the boot path → **N2-p3**.

### N2-p2 — **ADDRESSED**

One rule replaces the unobservable condition. `PLAN.md:371`: "**One DENY rule (N2-p2):** every NULL this
function returns *after taking the run lock* (items 2–5 failing) writes exactly one DENY via
`identity.audit_system_publication_attempt` inside this DEFINER body… `tryAutoPublish` step 8 never writes a
DENY." `:430` states the application side as an imperative with its reason. `:321` (case 10) pins the count at
**1** for a transition-level denial. I checked the arithmetic against R-21's oracle: C2-S3 case 6 (`:317`)
forces cipher-down and provision-false, neither of which enters the transition, so the application writes both
and the total stays exactly 2 — the two cases do not collide.

### N3-p2 — **ADDRESSED**

`PLAN.md:325` (case 14) now specifies the fixture instead of the outcome: "Two database connections (two
pools). Both call `prepareSystemKeyProvision` to completion — two PREPARED intents, two `publication_ref`s —
**before** either calls `systemPublish`… Sequential `tryAutoPublish` (application step 3) is **not** this case.
This case must be watched FAILING with C2-S4 body item 4 … removed before its GREEN is quoted." `:329` repeats
the mutant as a done-criterion. This is the shape that exercises the window; the sequential run that passed for
the wrong reason is explicitly excluded.

---

## 2. What I re-ran, and what it now measures

### 2.1 Every cluster command as it now stands — scripted **and** inline

`probes/ARCH-REV-S01-03/rev3-clusters-base.sh` and the same four commands typed inline. Both blocks are
byte-identical; the scripted half, verbatim:

```
### C1
tests/integration/tiers-s02-run-plan-tier.test.ts rc=0 passed=6 failed=0 (expect 6/0)
tests/integration/plan-tiers-route-privileges.test.ts rc=0 passed=1 failed=0 (expect 1/0)
CLUSTER_GREEN
### C2
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
CLUSTER_GREEN
### C3
tests/unit/s8-publication-http.test.ts rc=0 passed=4 failed=0 (expect 4/0)
tests/unit/s7-authorization.test.ts rc=1 passed=30 failed=1 (expect 30/1)
CLUSTER_GREEN
### C4
tests/unit/s10-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
CLUSTER_GREEN
### lane dirty
       0
```

**Zero disagreements** between scripted, inline, Revision 3 §8 and my pass-1 and pass-2 runs. The four cluster
commands are byte-unchanged by this revision (only C4's *notes* cell moved, `:51`), so what they measure is
unchanged: the four regression suites at their recorded pairs at `5b6cc9b1` with the seven TDD-created paths
omitted. They measure nothing about the revision's new content, which lives entirely in files that do not exist
yet — stated rather than implied.

### 2.2 My pass-2 probes, re-run

| probe | result on Revision 3 | what it now measures |
|---|---|---|
| `trace-both-ways.py` | `spec=25 plan-trace-rows=25`; missing/extra/duplicate none; cited-but-undefined steps none; C1 14/14, C2 22/22, C3 10/10, C4 12/12 in range | The revision added C2-S19.3 to the R-10 row (`:867`) and changed no step id; both directions still close. |
| `file-map-check.py` (the version I repaired at pass 2) | `MAP rows: 20`, `UNMAPPED count: 2` — both read-only (`migrations/0061_plan_tier_on_run.sql`, the body C1-S3 copies **from**; `apps/api/src/account-erasure.ts`, named at `:721` as **not** edited). One new `OTHER(C1)` line: C2 names `packages/db/src/index.ts` at `:416`, which is the `RunOwnershipAccess` **type citation**, not a write — the checker cannot distinguish reads from writes, and I confirmed the line by reading it. | No new file is written by a step without a §1.1 row. `apps/api/src/main.ts` remains C2's. |
| `sv1-membership-check.py` | `listed 52 / inventory 52`, none missing, none extra, no duplicates | SV-1's route list is still exact against `apps/api/src/index.ts:114-165`; the revision did not touch §6. |
| `grant-defines-check.py` (new this pass) | clean on Revision 3, **fails on the Revision-2 shape** (above) | B1-p2's class cannot come back unnoticed. |

### 2.3 The cluster-order change, checked for new breakage (charge 3)

`C1 → C2 → C3 ∥ C4` (`:35`). C3 writes `apps/api/src/index.ts` + `tests/unit/fpd-s01-c3-unpublish-http.test.ts`;
C4 writes `migrations/0068_bound_published_erasure.sql` + its two test files. **Disjoint** — the new parallel
pair has no shared file. No C2 or C3 step's done-criterion needs C4, and C4's own command (`:51`) still lists
only its two new files plus `tests/unit/s10-erasure-http.test.ts`. The dependency the change encodes is real
and was already true in Revision 2: `0068`'s gate and C4-S2 cases 7–8 read a table `0067` creates.

---

## 3. Non-blocking findings

**N1-p3 — the new intent table is missing the two columns its own cleanup pair needs.**
`PLAN.md:333-340` defines `serve.system_publication_key_provision_intent` as `publication_ref`, `run_id`,
`user_id`, `owner_ref`, `requested_at`, `expires_at`, `cleanup_state`. But `:358` has the claim function return
a `claim_token` and set `cleanup_state='RECONCILING'`, `:359` has complete "delete the intent where
`publication_ref` and `cleanup_claim_token` match", and C2-S3 case 16 (`:327`) passes a `claim_token` to
complete. The owner table carries exactly the two missing columns — `cleanup_claim_token uuid`,
`cleanup_claimed_at timestamptz` (`migrations/0040_account_erasure.sql:1028-1029`) — and the sibling work table
in this same step *does* list its claim columns (`:350`). A BUILD seat writing the table literally from
`:333-340` cannot then write `:358`/`:359`.
*Non-blocking under charge 5:* C2-S3 case 16 is the RED case the plan already names, it fires at
migration-authoring time, and the repair is one bullet — add `cleanup_claim_token uuid`,
`cleanup_claimed_at timestamptz`, mirroring `0040:1028-1029`.

**N2-p3 — two sentences assert a boot-path property the step's own wiring contradicts.**
`PLAN.md:416`: "**Do not** read an answer on the boot path." `PLAN.md:573`: "Boot does **not** call
`readServedAnswer`." But `:573` also has C2 add `publications.reconcileFreePublicAutoPublish()` to the boot
`await` list, and `:433` has that method call `readServedAnswer` for every row it claims. With outstanding work
present at boot — the one situation in which a boot reconcile does anything — boot *does* read served answers.
`DECISIONS.md` §18 shows the intent was to avoid an *eager* boot read ("Constructor injection is called only
when work is claimed"), which is true and is a real difference from the shortcut I predicted; the two absolute
sentences overstate it.
*Non-blocking:* no done-criterion gates on the claim (C2-S18's done-criterion is the two greps at `:575`), and
either repair is one line — soften the two sentences to "boot performs no *eager* answer read; the reader runs
only for rows the reconciler claims", or drop `reconcileFreePublicAutoPublish()` from the boot `await` and keep
it on the interval. A gate written later against the literal sentence would be false, which is why it is a
finding rather than a wording preference.

**N3-p3 — the cluster-order sweep missed C4's own intro: `:719` still says "Parallel with C2 after C1".**
`:35` was rewritten to "C1 first. Then C2. Then C3 ∥ C4. … C4 waits on C2", and the C4 notes cell at `:51` was
updated to "After C2 (0067 table + cleanup)". The C4 section's first sentence (`:719`) was not: it still reads
"Parallel with C2 after C1", which is the order Revision 3 exists to change. This is the class that was
blocking at pass 1 (B3): the seat that needs the truth reads its own cluster's text (`heartbeat-protocol` §3.8)
and not §1, so a C4 BUILD seat reading `:719` would believe it may start before C2 and meet a
`serve.system_publication_key_provision_intent` that `0067` has not created.
*Non-blocking, and the difference from B3 matters:* dispatch order is not the C4 seat's to choose — the
orchestrator schedules from §1 and the board's parent edges — and if C4 did run early, C4-S2 cases 7 and 8
(`:758`, `:759`) are RED immediately against a missing table, so nothing ships wrong. The repair is deleting
five words and is `git grep -n 'Parallel with C2'` to find (one hit).

## 4. Charge 4 — no plan change needs a requirement the SPEC does not carry

The cleanup pair serves R-16 (a delete the gate would otherwise block forever) and R-9/R-10; `readServedAnswer`
serves R-10; the one-DENY rule serves R-21; the two-pool fixture serves R-5. The cluster-order change is
sequencing, not behaviour. `DECISIONS.md` §19 opens no V row, correctly — none of the four findings was a
product question. Zero banned words in any done-criterion (the only hit is the prohibition line itself, `:26`).

## 5. UNVERIFIED

- Nothing was run against a live database or a served stack; no no-touch listener was bound. Case 14's race,
  case 16's orphan cleanup and C2-S19.3's reconcile are read from the step text and the precedents in
  `0040_account_erasure.sql`, not reproduced — no code exists yet, and the fixtures are BUILD's.
- The four cluster commands were run twice (scripted, inline), not three times: §8 records one verdict per
  cluster and the three-run rule needs code.
- `pnpm exec tsc --noEmit` was not re-run this pass; the 70-diagnostic baseline is cited from COMMON §6.
- V's §4 acceptance walk, which is V's alone.
- I did not re-derive the pass-1 or pass-2 findings the revision did not touch (charge 1 scopes this pass), and
  the packet defects P1–P8 remain the orchestrator's.

## 6. Predictions (falsifiable — for BUILD and REV(S01))

I expect the C2 BUILD seat to hit N1-p3 within minutes of writing `0067` and to close it by copying
`0040:1028-1029`; if it instead invents a single `claim_token` column, C2-S3 case 16 still passes and the
divergence from the owner table survives to REV(S01), which is the one way this becomes expensive. I expect
C2-S3 case 14 to be the hardest case in the slice to write — two pools inside one embedded-postgres fixture —
and I predict it is the case most likely to be quietly weakened to a sequential run; the plan's "watched
FAILING with body item 4 removed" is the only thing standing in front of that, so REV(S01)'s correctness lens
should demand the RED frame for it by name rather than the GREEN pair. Of the three lenses, I predict
security/data-safety spends its time on the system function's five ordered guards and finds them sound, and
that the most likely real defect at REV(S01) is not in C2 at all but in C4's snapshot-cleanup-complete
exclusion (`:787`), which is the one place in the plan where a correct implementation and an incorrect one both
produce a green `prepare_private_run_erasure` for the happy path and differ only for a run with an older,
already-cleaned publication. That is what I would probe first.
