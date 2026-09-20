# ARCH-REV(S01) pass 1 — blind review of `PLAN.md` and packet `ARCH-S01.md`

- Seat `ARCH-REV-S01` (`claude-opus-5`), ticket `t_b82d832e`, pass **1 of 3**, 2026-09-20.
- Under review: `docs/missions/free-public-debates/slices/S01/PLAN.md` (999 lines, ARCH-S01) ·
  `.hermes/planning/free-public-debates/packets/ARCH-S01.md` · `ADR-0026` as the plan cites it.
- Oracle: `SPEC-v2.md` (SPEC of record) as corrected by `DECISIONS.md` §10 (N1-p2 … N3-p2);
  `V-DECISIONS-PACKET.md` rows V-1…V-6 at their defaults; intake I-1…I-4.
- Lane for every command: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine`
  @ `5b6cc9b1`, 0 dirty before and after. No git write, no product file written, nothing opened on V's desktop.

## VERDICT — **REWORK** (pass 1 of 3). Blocking: B1 B2 B3 B4 B5. Non-blocking: N1…N5. Packet defects: P5…P8.

---

## 1. What I verified, and how

### 1.1 Every cluster command re-run at base, scripted and inline

ARCH's four base scripts were **copied** into `.hermes/reports/free-public-debates/probes/ARCH-REV-S01/`
(`rev-c{1,2,3,4}-scripted.sh`, log paths rewritten) and run there; then the same four commands were run
**inline**, not from a file, into `rev-c{1,2,3,4}-inline.log`. Runner
`.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`, new files omitted per `PLAN.md` §8.

Verbatim, scripted (`probes/ARCH-REV-S01/rev-all-scripted.out`):

```
########## SCRIPTED C1 ##########
tests/integration/tiers-s02-run-plan-tier.test.ts rc=0 passed=6 failed=0 (expect 6/0)
tests/integration/plan-tiers-route-privileges.test.ts rc=0 passed=1 failed=0 (expect 1/0)
CLUSTER_GREEN
########## SCRIPTED C2 ##########
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
CLUSTER_GREEN
########## SCRIPTED C3 ##########
tests/unit/s8-publication-http.test.ts rc=0 passed=4 failed=0 (expect 4/0)
tests/unit/s7-authorization.test.ts rc=1 passed=30 failed=1 (expect 30/1)
CLUSTER_GREEN
########## SCRIPTED C4 ##########
tests/unit/s10-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
CLUSTER_GREEN
```

Inline (`rev-all-inline.out`) reproduces those eight lines and four markers exactly.
Named failures, verbatim from my logs:

```
× tests/unit/s7-authorization.test.ts > S7 deny-by-default authorization > keeps one complete, duplicate-free policy row per contract route
× tests/integration/s8-publication-database.test.ts > S8 publication on real PostgreSQL > preserves a committed corpus key when the publish result is transport-ambiguous
```

**Zero disagreements** with `PLAN.md` §8 across scripted, inline and ARCH's own recorded verdicts.
Lane dirty count after all eight runs: `0`.

### 1.2 My own both-ways trace parser

`probes/ARCH-REV-S01/trace-both-ways.py` (written here, not copied). Output:

```
A/B unique R ids: spec=25 plan-trace-rows=25
A missing in PLAN: none
B extra in PLAN  : none
B duplicate rows : none
C cited-but-undefined steps: none
D C1 declared C1-S1…C1-S14  defined=14  missing=none  beyond-range=none
D C2 declared C2-S1…C2-S22  defined=22  missing=none  beyond-range=none
D C3 declared C3-S1…C3-S10  defined=10  missing=none  beyond-range=none
D C4 declared C4-S1…C4-S12  defined=12  missing=none  beyond-range=none
```

The SPEC↔PLAN trace is complete in both directions and every cluster's declared step range is fully
defined. `SV-10`'s unique-R-id count is 25, matching `DECISIONS.md` §10 N3-p2.

### 1.3 Single-writer file map (packet charge 5)

`probes/ARCH-REV-S01/file-map-check.py` extracts the 19 map rows and every production path named in each
cluster's steps. **No parallel-write conflict:** the only parallel pair is C2 ∥ C4, and their write sets are
disjoint (C2: `apps/api/src/{index,publications}.ts`, `packages/db/src/publication.ts`,
`packages/contract/src/{index,client}.ts`, `migrations/0067`; C4: `migrations/0068` + two new test files).
`apps/api/src/index.ts` is correctly sequenced C2→C3. C4's mention of `index.ts` is an explicit non-edit.
**No step's done-criterion in C2 or C4 needs C3.** One file a step requires is absent from the map — see **B2**.

### 1.4 R-24 / SV-2 pathspec, positive control

`SV-2` is a gate that reads `0` whether or not it works, so I gave it a known-GOOD input:

```
git rev-parse --show-toplevel -> .../.worktrees/fpd-s01      show-prefix -> dialectical-engine/
git diff --name-only 5b6cc9b1..HEAD -- apps/ui | wc -l                  -> 0     (base, correct)
git diff --name-only <c>~1..<c> -- apps/ui | wc -l                      -> 26    (c=9da10917, positive control)
git diff --name-only <c>~1..<c> -- dialectical-engine/apps/ui | wc -l   -> 0     (the TRAPS:873 wrong form)
```

`SV-2` as written is sound. No step writes under `apps/ui`; `grep -c 'apps/ui' PLAN.md` finds only the five
prohibition lines. Zero banned words in any done-criterion.

### 1.5 SV-1 route-count gate, mutation-tested

Base: `awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'` → **52**. Mutant with a 53rd
row inserted at the end of the inventory: the gate reads **53**. The gate does catch an added row (the
residual is in **N3**).

### 1.6 Attack on the system-publication path (packet charge 4)

- **Who can call it.** `core.transition_system_run_publication` is granted to `debateai_runtime` — the API's
  own role (`migrations/0040_account_erasure.sql:4157-4160` is the same grant on the owner function). Unlike
  the owner function it takes no session, no grant hash, no binding reservation, so *every* code path in the
  API process can call it. Its entire authorization is (i) `core.run_is_free_public_bound(p_run_id)` and (ii) a
  PREPARED system key-provision intent. `serve.prepare_system_publication_key_provision` checks
  `run_is_owned_by(run, owner_ref)` against **caller-supplied** `user_id`/`owner_ref` — it proves the pair is
  self-consistent, not that a requester is the owner. That is inherent to V's I-1 ruling and is not itself a
  defect; it does mean the binding predicate is the *only* authorization, which raises the price of B4(a).
- **Not-bound runs.** Guarded by the predicate — but removing that guard turns no named test RED: **B4(a)**.
- **Second publication of one run.** Not guarded inside the transition: **B4(c)**.
- **Erased runs.** Not guarded inside the transition and invisible to the erasure contention gate: **B4(b)**.
- **Audit of a failed attempt.** Has no callable path at all under `debateai_runtime`: **B1**.

---

## 2. Blocking findings

### B1 — the DENY audit C2 must write has no callable path under the runtime role (R-21, R-9)

`PLAN.md:373, 375, 376, 377` (C2-S6 steps 4, 6, 7, 8) and `PLAN.md:442` (C2-S10) require the **TypeScript
application** to "append DENY audit" for four failure modes. Three of them (null pseudonym, `prepareSystemKeyProvision`
false, `cipher.create` throw) never enter `core.transition_system_run_publication` at all.

- `identity.append_audit_event_internal` is revoked from the runtime role by name:
  `migrations/0040_account_erasure.sql:6211-6213` — `REVOKE ALL … FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;`
  A direct call from the application is SQLSTATE 42501 on the served database.
- Every audit write in this repository goes through a per-operation `SECURITY DEFINER` wrapper — e.g.
  `identity.audit_publication_preflight_denial` (`migrations/0040_account_erasure.sql:3884-3932`, granted at
  `:6411`), reached through `packages/db/src/publication.ts:349-365`, which first reserves refs in
  `identity.publication_event_binding`. That wrapper is unusable here: it requires a live `identity.session`
  row and a binding reservation, and **R-20.4 forbids both on the system path**.
- `PLAN.md:300-341` (C2-S4, the migration inventory) creates **no** system-audit wrapper and grants none.

Consequence: `PLAN.md:293` (C2-S3 case 6) forces two failures (cipher down / provision false) and asserts
exactly two `decision='DENY'` rows with `actor_key_ref='system:free-public-auto-publish'`. Neither failure can
write a row. **Cluster C2 cannot go green as specified, and R-21 is unbuildable.**

Class and members: every "append DENY audit" instruction — `PLAN.md:373, 375, 376, 377, 442` — plus `SV-9`'s
audit expectations (`PLAN.md:919-920`) and `ADR-0026` decision 4 (`ADR-0026…md:57-61`), which states the
actor literal without naming the function that may write it.

Smallest repair: add `identity.audit_system_publication_attempt(p_audit_id uuid, p_run_id uuid, p_reason text, p_occurred_at timestamptz, p_decision text)`
to `0067`, `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO debateai_runtime`, and name it in
C2-S4, C2-S6 and C2-S10. Add a case that the wrapper is 42501 for an unprivileged role (C2-S15's shape).

### B2 — `reconcileFreePublicAutoPublish` cannot call `tryAutoPublish`, and has no production caller in the file map (R-10)

1. `PLAN.md:367` pins `tryAutoPublish(input: { runId; answer; authenticated: AuthenticatedSession })`.
   `AuthenticatedSession` (`apps/api/src/sessions.ts:34-41`) carries a live `Session`, a `tokenHash` and a
   `csrfTokenHash`. A background reconciler has none, and fabricating one is R-20.4. `PLAN.md:380` leaves the
   answer source as "caller/test supplies answer **or** repository reads the served projection" and never
   resolves the session argument at all. As written, only a test can call the retry path.
2. `PLAN.md:504` (C2-S18) wires production retry to "`reconcileKeyCleanup`'s existing production callers".
   Measured: those callers are `apps/api/src/main.ts:297-305` (an `await` at boot plus a 30 s `setInterval`).
   `grep -c 'main.ts' PLAN.md` = **0** — the file appears in no Files block and in no row of the §1.1
   single-writer map. C2-S18's hedge ("if `reconcileKeyCleanup` has no periodic production caller…") resolves
   to the branch that requires editing a file no cluster owns.
3. R-10's covering steps (`PLAN.md:789`) are C2-S1 case 5 — a mock — and C2-S6. **No named case goes RED if
   the reconciler is omitted from production**, which packet §3 makes a finding on its own.

Smallest repair: give `tryAutoPublish` an owner-identity parameter the reconciler can read from the run
(`user_id`/`owner_ref`) instead of an `AuthenticatedSession`, let the HTTP hook pass those two fields from
`request.authenticatedSession`, add `apps/api/src/main.ts` to the C2 row of the map with the interval wiring,
and name the production case that goes RED when the interval call is removed.

### B3 — C3 depends on an interface method C2's own steps do not create

`PLAN.md:538` states "**C2-S6 includes `isFreePublicBound` on the interface**", and in the same paragraph also
says "if C2 did not put it on the interface, C3 adds `isFreePublicBound` to `PublicationApplication` in
`publications.ts`" **and** "C3 does not edit `publications.ts`." Three mutually exclusive instructions in one
paragraph. Meanwhile:

- C2-S6 (`PLAN.md:362-384`) lists only `tryAutoPublish` and `reconcileFreePublicAutoPublish`; its
  done-criterion (`PLAN.md:382`) is "`tryAutoPublish` is on the interface; unit tests C2-S1 1–5 go GREEN" —
  satisfiable without `isFreePublicBound`.
- `apps/api/src/publications.ts` is owned by **C2** in the §1.1 map; C3's Files block (`PLAN.md:540`) is
  `apps/api/src/index.ts` and one test file.
- The reading floor (`heartbeat-protocol` §3.8) says a BUILD node reads *its cluster's steps*. The C2 seat
  never reads `PLAN.md:538`, so it will not add the method; the C3 seat then meets `PLAN.md:587`
  (`await options.publications.isFreePublicBound(runId.data)`) with no lawful file to add it to.

C3 cannot go green inside its own file map. Repair: move `isFreePublicBound(runId): Promise<boolean>` into
C2-S6's "Extend `PublicationApplication` with" list and into C2-S6's done-criterion, and delete the two
contradictory sentences at `PLAN.md:538`.

### B4 — the system transition drops three in-transaction guards the owner function holds; two removals turn no test RED

`PLAN.md:325-327` pins the body of `core.transition_system_run_publication` as: no session/grant/binding reads
· require `core.run_is_free_public_bound` · require the system intent PREPARED · insert snapshot · insert
visibility · audit ALLOW · delete intent. The owner function, measured, additionally holds three guards
**inside the same transaction as the inserts**:

| guard | owner function | system function as planned |
|---|---|---|
| `SELECT … FROM core.run … FOR UPDATE` | `migrations/0040_account_erasure.sql:3996-3997` | absent |
| `IF … NOT core.run_private_content_is_live(p_run_id) THEN v_run_eligible := false` | `:4003-4004` | absent |
| `IF v_latest_state='PUBLISHED' … EXIT` | `:4061-4062` | absent |

**(a) Boundness removal is invisible.** The only guard the plan *does* carry is the boundness predicate, and no
named case exercises it at the SQL boundary: C2-S3's nine cases (`PLAN.md:288-296`) never call
`core.transition_system_run_publication` on a Premium, NULL-tier or pre-rule run (case 9 exercises the *owner*
function on Premium). Every non-bound assertion in the plan stops at the application's early return
(C2-S6 step 2). Delete `require core.run_is_free_public_bound` from the migration and cluster C2 stays green.
Repair: add a C2-S3 case "call the system function directly with a Premium run id and a PREPARED intent →
returns NULL, no snapshot row, no visibility row", and the same for `plan_tier IS NULL` and `free_public_rule=false`.

**(b) An erased run can be published.** `core.enforce_erasure_barrier` is installed on 14 tables
(`migrations/0040_account_erasure.sql:4238-4245`, installed by the loop at `:4234-4250`); `serve.publication_snapshot` and `core.run_visibility_event`
are **not** among them, so the trigger is not a backstop. `core.prepare_private_run_erasure`'s contention gate
reads only the *owner* intent table — `PERFORM 1 FROM serve.publication_key_provision_intent … WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT`
(`:4524-4526`) — and the plan's new `serve.system_publication_key_provision_intent` is invisible to it
(`PLAN.md:302-310` creates the table; `PLAN.md:691-719` (C4-S4) does not add it to that gate). Sequence:
prepare commits → delete commits (`CLEANED`) → transition runs, intent still PREPARED, run still bound →
snapshot and `PUBLISHED` visibility for a debate the owner just erased. Repair: `core.run_private_content_is_live(p_run_id)`
inside the system transition **and** the system intent table added to the erasure contention gate in `0068`.

**(c) Two concurrent publications of one run (R-5).** `PLAN.md:458` (C2-S12) asserts "system function exits if
latest state is PUBLISHED" — a check `PLAN.md:325-327` does not contain. The check it *does* describe lives in
`prepare_system_publication_key_provision`, a separate statement and therefore a separate transaction (the
owner precedent is `packages/db/src/publication.ts:299-313`, one `pool.query` per call). Two overlapping
`GET /v1/runs/:id/answer` requests (V's walk polls every 10 s; the reconciler can run against the same run)
both prepare, then both publish. `serve.publication_snapshot` has no unique constraint on `run_id`
(`migrations/0039_publication_visibility.sql:41-54`). The list survives — `listPublicRefs` is
`DISTINCT ON (event.run_id)` (`packages/db/src/publication.ts:531-540`) — but the first snapshot is orphaned
with its corpus key and **no** `publication_key_cleanup_intent`, and C4's carve-out only cleans the latest ref,
so R-17's "the public copy is gone" leaves undestroyed key material behind. Repair: re-check the latest
visibility state under the run row lock inside the transition, and add a concurrency case (two `tryAutoPublish`
calls raced, `SELECT count(*) FROM serve.publication_snapshot WHERE run_id=$1` = 1).

### B5 — 0066 makes every encrypted run creation fail during the migrate→deploy window, and C1-S9 pins that as correct

`PLAN.md:124` adds `free_public_rule boolean NOT NULL DEFAULT false`; `PLAN.md:130-134` adds
`(p_run->>'freePublicRule')::boolean` to `core.create_encrypted_run`'s VALUES list and states that a missing
key "yields NULL, hits `NOT NULL`, and the existing `EXCEPTION WHEN … not_null_violation THEN RETURN false`
path returns false". `PLAN.md:203-209` (C1-S9) makes that a **test**.

Measured: migrations are applied by a **separate CLI**, not by the API process — `package.json:23`
(`"db:migrate": "tsx apps/runner/src/migrate-cli.ts"`), `apps/runner/src/migrate-cli.ts:6`. Between
`db:migrate` and the code deploy, the running API sends the payload **without** `freePublicRule` (its
capability probe only knows `planTier`), so `create_encrypted_run` returns false and
`packages/db/src/index.ts:1280-1285` raises `TypedDomainError("RUN_OWNER_INVALID")`. **Every new debate by
every signed-in user fails** for the length of that window, Premium included.

The asymmetry names the fix. The legacy path is skew-safe because C1-S6 omits the column from the INSERT list
and lets the DEFAULT apply. `0061` was skew-safe because `plan_tier` is nullable
(`migrations/0061_plan_tier_on_run.sql:1`). Repair: `COALESCE((p_run->>'freePublicRule')::boolean, false)` —
old callers create unbound runs (which is R-3's own answer), new callers bind — and re-point C1-S9 at the
allow-list's *extra-key* rejection (`migrations/0061_plan_tier_on_run.sql:21-30`), which is the behaviour that
function actually pins.

---

## 3. Non-blocking findings (each is a ticket by end of pass; WHEN, never WHETHER)

**N1 — the `Test Files` assertion cannot be executed against the named runner.**
`run-suites.sh:15` runs `pnpm exec vitest run "$f"` **once per path**, so every run prints `Test Files 1`;
there is no aggregate count to compare with 4/4/3/3. The runner already reports a missing path as `BROKEN`
per suite (`:18-19`), so the assertion is redundant as well as unexecutable.
Members: `PLAN.md:239` (C1-S12), `:524` (C2-S20), `:635` (C3-S9), `:764` (C4-S10), `:966` (§7).
Repair: assert instead that the runner printed one `rc=… passed=… failed=…` line per path passed.

**N2 — R-16's HTTP oracle accepts a delete that did not happen.**
`apps/api/src/account-erasure.ts:110-112` maps `CONTENDED` to `"PENDING"`, and `apps/api/src/index.ts:793`
turns `PENDING` into **202**. `PLAN.md:667` (C4-S1, R-16) accepts "200 `{"status":"CLEANED"}` **or** 202
`{"status":"PENDING"}`" as success, so a carve-out that reaches the snapshot-cleanup-complete check
(`migrations/0040_account_erasure.sql:4547-4554`) without the exclusion `PLAN.md:711` describes returns
`CONTENDED` → 202 → the HTTP case passes while the debate stays public. Only C4-S2 case 1 catches it.
Repair: add "and a `serve.private_run_erasure_tombstone` row exists for the run" to the 202 branch.

**N3 — done-criteria that are counts or existence checks standing in for membership.**
Class members, each a step a stranger cannot mark done from the named command:
`PLAN.md:105` ("names those six cases. Command that decides it: `test -f …`" — existence ≠ six cases);
`PLAN.md:276` (`rg -c "it\(" … ≥ 6` — six `it(` of any names);
`PLAN.md:136` (`grep -c "free_public_rule" … ≥ 3` — and `grep -c` counts lines, TOOLING-TRAPS.md:236);
`PLAN.md:880-883` (SV-1 is titled "EXACT members" and then names the 52 only as a line span, so an
add-and-remove pair reads 52 — the single-add mutant *is* caught, measured in §1.5).
Repair: name the members (the six `it(` titles, the 52 route strings) and grep for those.

**N4 — the slice verification list omits the lens-worktree setup a named trap requires.**
`packages/contract/generated/**` is gitignored, C2 changes `packages/contract/src/index.ts`, and REV(S01)
lenses check out in their own worktrees. `TOOLING-TRAPS.md:294-301` records a reviewer that could not run
`tests/unit/s8-publication.test.ts` at all for exactly this reason. `PLAN.md` §6 (`:876-927`) lists no
`pnpm install` + `pnpm run generate:contract` step and no `test -f packages/contract/generated/client.ts` gate.

**N5 — the system visibility row's `actor_ref_version` is unspecified.**
The column is `NOT NULL DEFAULT 1` with `CHECK (actor_ref_version IN (1,2))`
(`migrations/0040_account_erasure.sql:388-393`); the owner path writes `2`
(`:4106-4113`, the literal `2` at `:4112`). `PLAN.md:327` names `state`, `warning_version` and `actor_audit_token` and not this column, so a
system row would silently read `1`. Harmless for R-20.1 (which only pins the warning field) and cheap to pin.

---

## 4. Packet defects — `ARCH-S01.md` (findings against the orchestrator's packet, not against ARCH-S01)

ARCH-S01 reported four (P1 binding-set V-1…V-5 vs V-1…V-6 · P2 the ADR README · P3 the traps index with no
headings · P4 the eight-line shape absent from the grok loader). All four reproduce. Four more:

- **P5 — a reading span that excludes the load-bearing lines.** `ARCH-S01.md:36` names
  `migrations/0061_plan_tier_on_run.sql:1-70`. The function runs to `:103`, and the fact the whole of C1-S3
  and C1-S9 rests on — `EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation
  THEN RETURN false` — is at `:100-101`, outside the named span. Under §3.8 the seat must either over-read or
  guess; ARCH cited `:100-101` and `:7-103`, so it over-read. (The other constants on that line check out:
  `schema.ts:100-134`, `ADR-0024…:1-75` is the whole 75-line file, and "two files already share the number
  0061" is true — `ls migrations | sed 's/_.*//' | sort | uniq -d` → `0025`, `0061`.)
- **P6 — an unbounded input.** `ARCH-S01.md:10` ends the inputs list with "the code surface the SPEC names
  (read-only)". `SPEC-v2.md` cites roughly thirty distinct `path:line` spans; §3.8 makes an unbounded reading
  instruction a packet defect. ARCH reported the ADR-README variant of this (P2) and not this one.
- **P7 — "the ONE artifact" names three.** `ARCH-S01.md:11` says "output (the ONE artifact this node
  produces): … PLAN.md filled … + DECISIONS.md lines", and `:15` allows a new ADR as well. ARCH correctly
  produced three; the line is wrong, not the output.
- **P8 — charge 4's runtime-role bullet stops one file short of the fact that decides B1.** `ARCH-S01.md:37`
  tells the seat to "name the role your plan's new SQL runs as and the GRANT it needs" and points at
  `tests/integration/plan-tiers-route-privileges.test.ts`. The decisive measurement for anything that writes
  an audit row is the REVOKE at `migrations/0040_account_erasure.sql:6205-6216`, which the packet never names;
  it is what makes an application-level `append_audit_event_internal` impossible.

All four cost a seat cycle apiece at most; none excuses a plan finding.

## 5. Checked and found sound (recorded so pass 2 does not re-derive it)

- Every `path:line` the PLAN cites in `apps/api/src/index.ts` (`:1078-1096`, `:1097-1102`, `:1148-1188`,
  `:1161-1171`, `:1178`, `:1179`, `:113-166`, `:786-795`, `:827-829`), in `apps/api/src/publications.ts`
  (`:382`, `:401-402`, `:409`), in `packages/db/src/index.ts` (`:652-662`, `:1241-1263`, `:1280-1285`,
  `:1312-1328`, `:807-818`), in `packages/contract/src/{index,client}.ts` (`:249-252`, `:271`, `:457-459`) and
  in `migrations/0040_account_erasure.sql` (`:4014-4022`, `:4067`, `:4088-4090`, `:4096-4103`, `:4157-4160`,
  `:4527-4529`, `:4534-4538`, `:4547-4554`) resolves to what the PLAN says is there. ADR-0026's extract and
  `:4067` citation are exact.
- The four database roles the plan names all exist in a migrated database
  (`0000_s00.sql:292`, `0039_publication_visibility.sql:30`, `0040_account_erasure.sql:775-783`), so the
  `SET ROLE` proofs C1-S8 / C2-S15 / C4-S8 are buildable; `plan-tiers-route-privileges.test.ts:41-42` is a live
  precedent that ran green here.
- R-11.4's residual (a UI bundle on an older `packages/contract`) **is** named by the plan — `PLAN.md:948`,
  refutation row C2-S8. Packet charge 6 is discharged.
- The route policy table is 52 rows at base, the awk window is unaffected by every edit this slice makes
  (all of them at `index.ts:1097+`), and no cluster adds a row.
- Migration numbers 0066/0067/0068 sort after `0065_fix11_trace.sql` under
  `packages/db/src/index.ts:807` (`/^\d+.*\.sql$/` sorted by filename).

## 6. UNVERIFIED

- Nothing was executed against a live database or a served stack; the no-touch listeners were never bound.
  B4(b) and B4(c) are read from the two function bodies and the call sites, not from a reproduction — a
  racing fixture is BUILD's to write, and C2 does not exist yet.
- The three-run worst-of-three rule is unverifiable before code exists; I ran each base command twice
  (scripted, inline), not three times, because §8's claim is a single recorded verdict per cluster.
- V's §4 walk (V personally), and whether a rolling deploy at this installation ever leaves an old API
  process running after `db:migrate` — B5's window length is deployment-procedure-dependent; its existence is
  not.
- `pnpm exec tsc --noEmit` was not re-run; the 70-diagnostic baseline is cited from COMMON §6, not measured
  by me.

## 7. Predictions (falsifiable; this is a one-pass planning review, so they are for the FIX seat and REV(S01))

I expect the FIX pass to accept B1, B3 and B5 quickly and to argue B4(c) — the counter will be "two concurrent
GETs on one run are not realistic". It is: `PLAN.md:504` puts a reconciler on the same run as the GET hook, and
V's own walk step 3 polls every ten seconds. I expect B2 to be answered by making `tryAutoPublish` take
`{userId, ownerRef}` rather than by adding `main.ts` to the map, and the `main.ts` half to survive into
REV(S01) as "R-10 has no production trigger". Of the three REV(S01) lenses, I predict security/data-safety
finds B4(b) independently and correctness/tests finds N1 within the first cluster it re-runs; I predict
product-truth accepts R-16 on the 202 and misses N2, because the HTTP body is the shape it reads. The first
thing I would check at REV(S01) is `SELECT count(*) FROM serve.publication_snapshot WHERE run_id=$1` after two
raced publishes, and the second is whether any DENY row exists at all after a forced cipher failure.
