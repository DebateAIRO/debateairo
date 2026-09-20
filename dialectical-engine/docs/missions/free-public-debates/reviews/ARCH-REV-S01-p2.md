# ARCH-REV(S01) pass 2 — scoped re-review of `PLAN.md` Revision 2

- Seat `ARCH-REV-S01-02` (`claude-opus-5`, ARCH-REV-S01's session resumed), ticket `t_616ddb75`, pass **2 of 3**, 2026-09-20.
- Scope (packet charge 1): my own pass-1 findings B1…B5, N1…N5 (`reviews/ARCH-REV-S01-p1.md`) and
  `git diff 418926be..259ef2c7 -- docs/missions/free-public-debates/slices/S01/PLAN.md docs/architecture/01-decisions`
  (PLAN +190/−61, ADR-0026 ±11, DECISIONS +34, PROGRESS +1). New breakage in scope only inside that diff (charge 3).
- SPEC of record unchanged: `SPEC-v2.md` + `DECISIONS.md` §10. No plan change in this revision needs a
  requirement the SPEC does not carry (charge 4 — checked below).
- Lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine`
  @ `5b6cc9b1`, **0 dirty before and after**. No git write, no product file written, nothing opened on V's desktop.

## VERDICT — **REWORK** (pass 2 of 3). Blocking: **B1-p2**. Non-blocking: N1-p2, N2-p2, N3-p2.
## All ten pass-1 findings (B1…B5, N1…N5): **ADDRESSED**, each verified against the sentence, not the claim.

Pass 3 is the last lawful pass. B1-p2 is two sentences plus one test case; it is named exactly below.

---

## 1. Pass-1 findings — verdict each, against the revised text

| p1 finding | verdict | the sentence that closes it | my check |
|---|---|---|---|
| **B1** system DENY audit has no callable path | **ADDRESSED** | `PLAN.md:355` mints `identity.audit_system_publication_attempt(uuid,uuid,text,timestamptz,text)`, `SECURITY DEFINER`, `GRANT EXECUTE TO debateai_runtime`, "the **only** path `debateai_runtime` has to write a system-publish audit row from TypeScript" | Sweep is 5/5 + 3 more: `:270` Produces, `:355` function, `:373` GRANT, `:389` repository method, `:415/:417/:418` algorithm steps 4/6/7, `:483-487` C2-S10, `:324` C2-S3 case 15 (42501 proof), `:531` C2-S15, ADR-0026 decision 4. `:487` adds `grep append_audit_event_internal apps/api/src/publications.ts` is empty — a detector, not a promise. The wrapper calling `append_audit_event_internal` from inside a DEFINER body is legal and is the repo's own pattern (`0040_account_erasure.sql:3884-3932` does exactly that at `:3923-3928`). |
| **B2** reconciler cannot call `tryAutoPublish`; no production caller in the map | **ADDRESSED** | `PLAN.md:408` — `tryAutoPublish(input: { runId; answer; userId; ownerRef })` "— **no** `AuthenticatedSession` (B2)"; `:69` adds `apps/api/src/main.ts` to the C2 row of §1.1; `:545-566` C2-S18 quotes the real `main.ts:297-305` and adds the boot `await` + `Promise.all` member | Identity half is closed at the source: `:342-343` put `user_id`/`owner_ref` on the work row, `:367` returns them from the claim, `:369` stores them on upsert, `:422` passes them. `:564` gives a grep oracle (2 lines in `main.ts`) and `:573` makes it a named RED case. Residual on the *answer* half → **N1-p2**. |
| **B3** `isFreePublicBound` required by C3, absent from C2's steps | **ADDRESSED** | `PLAN.md:410` puts it in C2-S6's interface list — "Present on the interface in **this** step's list and in this step's done-criterion" — and `:424` repeats it in the done-criterion; `:599` replaces the three contradictory sentences with "C3 does not edit `publications.ts`. C3 does not add the method." | Also `:270` Produces and `:413` (step 2 now calls `this.isFreePublicBound`). A C2 BUILD seat reading only C2's steps now meets it twice. |
| **B4(a)** boundness removal invisible | **ADDRESSED** | `PLAN.md:360` body item 2 + `:319-321` C2-S3 cases 10/11/12 (Premium, NULL tier, pre-rule, each direct against the SQL function with a PREPARED intent) + `:326` "Cases 10–12 going GREEN after deleting `require core.run_is_free_public_bound` from the migration is a C2-S4 defect" | The mutant is named and the case is at the SQL boundary, not the application's early return. |
| **B4(b)** an erased run can be published; erasure gate blind to the system intent | **ADDRESSED** | `PLAN.md:361` body item 3 (`core.run_private_content_is_live`) + `:322` case 13; erasure side `:775` adds the `PERFORM 1 FROM serve.system_publication_key_provision_intent … FOR UPDATE NOWAIT` contention gate immediately after `:4524-4526`, + `:745` C4-S2 case 7 | Both halves present. The new gate is what creates **B1-p2**. |
| **B4(c)** double publication | **ADDRESSED** | `PLAN.md:359` body item 1 (`FOR UPDATE` on `core.run`) and `:362` item 4 ("If `v_latest_state='PUBLISHED'` return NULL without inserting a second snapshot … the prepare-time check is a different transaction and is not this guard") + `:501-503` C2-S12 | Guard correct and correctly reasoned. Its detector does not discriminate → **N3-p2**. |
| **B5** migrate→deploy window fails every run creation | **ADDRESSED** | `PLAN.md:145` — `COALESCE((p_run->>'freePublicRule')::boolean, false)` … "Do **not** let a missing key hit `NOT NULL`"; `:214-222` re-points C1-S9 at the allow-list's extra-key rejection with the new `it(` title `"create_encrypted_run rejects an extra payload key"` | Measured against the source: extra-key rejection is real at `migrations/0061_plan_tier_on_run.sql:21-30` (`p_run-ARRAY[…]<>'{}'::jsonb` → `RETURN false`), so the re-pointed case pins a behaviour that exists. `:222` explicitly records that a missing-key test would have pinned the outage as correct. |
| **N1** unexecutable `Test Files` assertion | **ADDRESSED** | 5/5 sites rewritten to "one `rc=… passed=… failed=…` line per path": `:252`, `:585`, `:696`, `:828`, `:1038`. `grep -n "Test Files" PLAN.md` now returns only the three explanatory mentions, none an assertion | Matches `run-suites.sh:15`. |
| **N2** R-16's HTTP oracle accepts a non-deletion | **ADDRESSED** | `PLAN.md:728` — 202 counts only "**and** a `serve.private_run_erasure_tombstone` row exists for the run … 202 without a tombstone is `CONTENDED` mapped at `account-erasure.ts:110-112` and is not success (N2)"; `:739` adds "not `'CONTENDED'`" to the SQL oracle | Both layers. |
| **N3** counts standing in for membership | **ADDRESSED** | `:108-117` six named `it(` titles + `grep -F` each; `:147` three named strings for 0066; `:289-298` six named `it(` titles for the C2 unit file; `:946-952` SV-1 lists all 52 route strings | Verified mechanically — see §2.2. |
| **N4** lens worktree contract generation | **ADDRESSED** | `PLAN.md:944` SV-0: `pnpm install` then `pnpm run generate:contract` (`package.json:22`), gate `test -f packages/contract/generated/client.ts` | `package.json:22` is the right line. |
| **N5** `actor_ref_version` unspecified | **ADDRESSED** | `PLAN.md:364` body item 6 — "**`actor_ref_version=2`** (N5; owner writes the literal `2` at `:4112`; DEFAULT 1 is the silent miss)" | Matches `0040_account_erasure.sql:4106-4113`. |

Packet defects P1–P8 are the orchestrator's; `DECISIONS.md` §14 records them as named-not-fixed, which is correct.

---

## 2. What I re-ran, and what it now measures

### 2.1 Every cluster command **as it now stands**, at base, from a `.sh` in my probe directory

`probes/ARCH-REV-S01-02/rev2-clusters-base.sh` → `rev2-clusters-base.out`, verbatim:

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

The §1 cluster-command table is byte-unchanged by the revision (only the per-step N1 assertion text moved), so
these are the same four commands, re-verified against Revision 2's §8 with **zero disagreements**. What the run
now measures is unchanged: that the four regression suites still stand at their recorded pairs at `5b6cc9b1`
with the seven TDD-created paths omitted. It measures nothing about the revision's new content, which is
entirely in files that do not exist yet — stated here rather than implied.

### 2.2 My pass-1 probes, re-run, and what each now measures

| probe | re-run result on Revision 2 | what it now measures |
|---|---|---|
| `trace-both-ways.py` | `spec=25 plan-trace-rows=25`, missing none, extra none, duplicates none, cited-but-undefined steps none; C1 14/14, C2 22/22, C3 10/10, C4 12/12 in range | The revision added covering steps to the R-5, R-10 and R-21 rows (`:848`, `:853`, `:864`) without breaking either direction or the cluster step ranges. |
| `file-map-check.py` | **The copy I handed forward at pass 1 was broken** (it split §1.1 on `---` and parsed zero rows, so every path printed `UNMAPPED`; ARCH-FIX reported exactly that in its UNVERIFIED line and was right). Repaired version in this directory: `MAP rows: 20`, `UNMAPPED count: 2`, both read-only references (`migrations/0061_plan_tier_on_run.sql`, the body C1-S3 copies **from**; `apps/api/src/account-erasure.ts`, named at `:708` as **not** edited). `apps/api/src/index.ts` under C4 is the explicit non-edit at `:706`. | Every file a step says it WRITES is in §1.1, including the new `apps/api/src/main.ts` row at `:69`. **Validated failing:** with that row deleted, the checker prints `C2 UNMAPPED apps/api/src/main.ts` and `UNMAPPED count: 3`. |
| `sv1-membership-check.py` (new) | `SV-1 listed: 52  inventory rows: 52`, listed-but-not-in-file none, in-file-but-not-listed none, duplicates none | SV-1's new 52-string list at `:950` is exact against `apps/api/src/index.ts:114-165`. **Validated failing:** on an add-and-remove mutant that keeps the count at 52 (`GET /v1/runs/{id}/answer` → `GET /v1/runs/{id}/smuggled`) the checker reports both sides, which is the precise mutant N3 named and the count gate cannot see. |

No parallel-write conflict is introduced: the only parallel pair is still C2 ∥ C4, and `main.ts` is C2-only.

---

## 3. Blocking finding

### B1-p2 — C2-S4 grants EXECUTE on two cleanup functions no step defines, and the new erasure gate turns the resulting orphan into a debate that can never be deleted

**The GRANT.** `PLAN.md:374` — "system key-provision claim/complete cleanup → `debateai_publication_cleanup`
(mirror `:6373-6377`)". The mirror it cites is
`migrations/0040_account_erasure.sql:6373-6377`, which grants EXECUTE on four **named** functions
(`serve.claim_publication_key_provision_cleanup(integer)`,
`serve.complete_publication_key_provision_cleanup(uuid,uuid)`, and the two key-cleanup siblings). The
revised function list for `0067` (`PLAN.md:353-369`) defines: `prepare_system_publication_key_provision`,
`abandon_system_publication_key_provision`, `identity.audit_system_publication_attempt`,
`core.transition_system_run_publication`, and the three work-table functions. **There is no
`claim`/`complete` for `serve.system_publication_key_provision_intent` anywhere in the plan**
(`grep -n 'claim/complete\|abandon_system\|SystemKeyProvision' PLAN.md` → `:354`, `:374`, `:386`, `:387` only).
A migration that contains `GRANT EXECUTE ON FUNCTION <undefined>` aborts with SQLSTATE 42883, and `migrate()`
runs each file as one statement batch (`packages/db/src/index.ts:821`), so C2-S4 cannot be written literally.
The step also forbids invention in the same breath ("signature pinned here; BUILD does not add a 15th",
`PLAN.md:356`), so the BUILD seat is left with an error or an unsanctioned design decision.

**Why it is not cosmetic — the new gate makes it user-visible.** Revision 2 added, at `PLAN.md:775`, a
contention gate that returns `'CONTENDED'` whenever a row exists in
`serve.system_publication_key_provision_intent` for the run. The intent is created by
`prepareSystemKeyProvision` (`PLAN.md:417`) and removed only by `abandon…` on the two in-process failure
paths (`:418`, `:419`) or by the transition's own delete (`:366`). Process death, a pod eviction or an
unhandled throw between prepare and those paths leaves the row **PREPARED forever**, and then:

`DELETE /v1/debates/{id}` → `prepare_private_run_erasure` → `'CONTENDED'` → `"PENDING"`
(`apps/api/src/account-erasure.ts:110-112`) → **HTTP 202 with no tombstone** (`apps/api/src/index.ts:793`),
on every attempt, forever. By the revision's own N2 oracle (`PLAN.md:728`) that is *not* success. The run is
also never published (each retry mints a fresh `publication_ref` and a fresh orphan). A bound Free debate is
then permanently public-or-pending and permanently undeletable — against V's I-3 ("delete stays") and R-16.

**No named case goes RED.** `PLAN.md:745` (C4-S2 case 7) asserts CONTENDED *while* an intent exists, which is
the correct in-flight behaviour. Nothing in C2-S3's fifteen cases or C4-S2's seven asserts that an orphaned or
expired intent is ever removed, so the omission is invisible to every command in the plan.

**Provenance, stated plainly.** The missing cleanup predates Revision 2 — the GRANT bullet and the
`expires_at`/`cleanup_state` columns were in Revision 1 and **I did not catch it at pass 1**. What is new, and
what puts it in charge 3's scope, is `:775`: the fix for B4(b) is what converts a dead row into an undeletable
debate. The owner-side precedent is complete and is the template: `serve.claim_publication_key_provision_cleanup`
/ `complete_…` → `packages/db/src/publication.ts:323-347` → `PostgresPublicationApplication.reconcileKeyProvisionCleanup`
(`apps/api/src/publications.ts:360-380`) → boot + 30 s interval at `apps/api/src/main.ts:297,301`, whose comment
at `:293-296` says in terms: "Crash-orphan publication keys are claimed and removed before the process can
accept traffic."

**Smallest repair (two sentences and one case).**
1. `PLAN.md:353-369` — name `serve.claim_system_publication_key_provision_cleanup(integer)` and
   `serve.complete_system_publication_key_provision_cleanup(uuid,uuid)` with their bodies' contract (claim
   `expires_at <= clock_timestamp()` rows `FOR UPDATE SKIP LOCKED`; complete deletes the intent), so `:374`'s
   GRANT names real functions.
2. `PLAN.md:386-395` add the two repository methods; `PLAN.md:545-566` (C2-S18) add the reconciler call to the
   **same** `main.ts` boot list and interval the revision already edits — no new timer, no new route.
3. `PLAN.md:306-326` add C2-S3 case 16: an expired orphan system intent is claimed and removed, and
   `prepare_private_run_erasure` for that run then returns a success outcome rather than `'CONTENDED'`.
   That case goes RED if the cleanup is omitted — which is the property `:775` now depends on.

---

## 4. Non-blocking findings (WHEN, never WHETHER — each is a ticket by end of pass)

**N1-p2 — the reconciler's *answer* source is still unnamed, and R-10 still has no production case that goes RED.**
`PLAN.md:422` says "read the served projection for `row.runId` (no session)". Measured: that is reachable —
`readRunAnswer(runId, _session, ownership)` ignores its session parameter (`apps/api/src/index.ts:1448-1449`,
delegating to `readRunAnswerProjection(runId, ownership)`), and `RunOwnershipAccess` is just
`{ ownerRef, legacyAskerId }` (`packages/db/src/index.ts:901-904`), constructible from the work row. But
`PostgresPublicationApplication`'s constructor takes only `(repository, cipher, clock, cleanupRepository)`
(`apps/api/src/publications.ts:142-148`) and `PostgresPublicationRepository` has no answer read at all, so the
step needs a new dependency that no step names — and C2-S5's repository list (`:386-395`) is the only place
methods are added. C2-S19.2 (`:573`) proves the *call site* exists with a grep; C2-S1 case 5 (`:286`) is a mock
that hands the answer in. A reconciler that returns 0 without reading anything passes both. Repair: name the
dependency (the run/answer reader injected into `PostgresPublicationApplication`, wired in the `main.ts` edit
C2 already owns) and add one integration case — outstanding work + no further GET + one
`reconcileFreePublicAutoPublish()` → `PUBLISHED`, which is R-10's own SPEC check.

**N2-p2 — "do not write a second DENY" is conditional on something the caller cannot observe.**
`PLAN.md:419` (step 8): "Do not write a second DENY here if the DEFINER function already wrote one; if the call
never entered the function, write DENY via the wrapper." `systemPublish` returns NULL in both situations, so
TypeScript cannot distinguish them. `PLAN.md:366` compounds it by leaving the in-function writer as a choice
("via `identity.audit_system_publication_attempt` (or the same `append_audit_event_internal` DENY shape inside
this DEFINER body)"). R-21's count is not harmed — C2-S3 case 6 (`:315`) forces cipher-down and provision-false,
both of which never enter the function, so the answer is exactly 2 either way — but the step cannot be marked
done without a judgement call. Repair: one rule, e.g. "the transition writes DENY for every NULL it returns
after taking the lock; step 8 never writes one", and one case pinning the DENY count for a transition-level
denial (case 10's Premium call should leave exactly one DENY row).

**N3-p2 — the B4(c) race case passes without exercising the guard it exists for.**
`PLAN.md:323` (C2-S3 case 14): "Two overlapping `tryAutoPublish` calls on one bound publishable run; after both
settle, `SELECT count(*) FROM serve.publication_snapshot WHERE run_id=$1` = 1." Two *sequential* calls also give
1, because the application returns early at step 3 (`:414`, latest visibility already PUBLISHED). So the case
passes with `PLAN.md:362`'s in-transaction guard deleted — the mutant the guard was added for. ARCH-FIX's own
handoff lists this as UNVERIFIED ("racing two `tryAutoPublish` against a real function is BUILD's fixture"),
which is honest but leaves the fixture shape undecided. Repair: name the shape — two pools/connections, both
`prepareSystemKeyProvision` completed before either `systemPublish` is issued — and state that the case must be
watched failing with body item 4 removed before its GREEN is quoted (the ARCH-FIX packet's own
"a checker ships with a failing fixture" rule, applied to a test).

## 5. Charge 4 — no plan change needs a requirement the SPEC does not carry

Each new element maps to an existing requirement: the audit wrapper → R-21/R-20.2; `{userId, ownerRef}` and the
`main.ts` interval → R-10; `isFreePublicBound` → R-12/R-2; the three in-transaction guards → R-2/R-5/R-3 and
R-20.4; `COALESCE` → R-3 (an unwritten key means "not created after the rule", which is R-3's own answer);
SV-0/SV-1 → R-23/R-24 verification only; `actor_ref_version=2` → R-20.1. Nothing in the revision asserts a
behaviour `SPEC-v2.md` does not already require, and no new V-ROW was opened (`DECISIONS.md` §16 — correct: the
review raised no product question).

## 6. UNVERIFIED

- Nothing run against a live database or a served stack; no no-touch listener bound. B1-p2's orphan sequence and
  N3-p2's race are read from the two function bodies, the call sites and `main.ts`, not reproduced — no code
  exists to reproduce them against.
- The four cluster commands were run **once** each as a scripted `.sh` this pass (not three times, and not
  inline as well): §8's claim is one recorded verdict per cluster, and my pass-1 run already established
  scripted/inline agreement on the identical commands. Stated rather than implied.
- `pnpm exec tsc --noEmit` not re-run this pass; the 70-diagnostic baseline is cited from COMMON §6.
- V's §4 walk (V personally), and the three-run worst-of-three rule, which needs code.
- I did not re-derive the pass-1 findings the revision did not touch; charge 1 scopes pass 2, and the packet
  defects P1–P8 are the orchestrator's.

## 7. Predictions (falsifiable)

I expect ARCH-FIX to accept B1-p2 without contest — the owner-side template is complete and the repair is
mechanical — and to close N3-p2 by naming two pools, which is the right shape. I predict the seat will be
tempted to close N1-p2 by passing the answer into `reconcileFreePublicAutoPublish` from its caller in `main.ts`;
that would work but puts an answer read in the boot path, so watch for a new unmapped dependency there. At
REV(S01) I predict the security/data-safety lens re-finds the orphan-intent class from the other end (a
`SELECT count(*) FROM serve.system_publication_key_provision_intent` that never drops to zero across a suite),
and that the correctness lens finds C2-S3 case 14 passing sequentially if N3-p2 is closed with prose instead of
a fixture. The first thing I would check at pass 3 is whether the two new cleanup functions are named with
argument types (a GRANT needs the signature, not the name), and the second is whether C2-S3's new case goes RED
with the cleanup call removed from `main.ts` rather than only with the SQL function removed.
