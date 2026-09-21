# REV(S01) pass 2 (SCOPED) — lens SECURITY / DATA-SAFETY — verdict **PASS** (new non-blocking S-N8, S-N9)

- seat `REV-S01-p2-security-data-safety` (the pass-1 lens, same session resumed) · pass **2 of 3** · ticket `t_d2c8d5fc`
- slice head `c358d494` read-only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-security-data-safety/dialectical-engine` · previous head `db4758da` · base `5b6cc9b1` · worktree 0 dirty at handoff, no git writes
- oracle: `SPEC-v3.md` (SPEC of record) with `DECISIONS.md` §31 and `V-DECISIONS-PACKET.md` V-1…V-11
- probes: `.hermes/reports/free-public-debates/probes/REV-S01-p2-security-data-safety/` (`README.md`, `run.sh`, two files, `logs/`). The pass-1 directory's missing `README.md` — the defect that BLOCKED FIX-S01-p1-B for one launch, ticket `t_ff155aeb` — is written this pass.
- **All six pass-1 findings of this lens that were in scope are ADDRESSED by measurement.** Two new non-blocking findings, both inside the diff since pass 1, both members of the class this pass closed elsewhere.

---

## 1. The packet, reviewed first

Correct against source: base `5b6cc9b1` · previous head `db4758da` → slice head `c358d494` (my `git rev-parse HEAD`) · freeze pair `5ffdfa13..3a953d5e` (79 files / 15357 insertions from my cwd, the mission record of the pass) · the landed pairs charge 2 quotes (C2 8/0→14/0, 16/0→20/0; C3 10/0→11/0; C4 integration 14/0→17/0) match both my runs · SPEC-v3 is the SPEC of record and `DECISIONS.md` §31 exists as named · the `allowed` list covers both deliverables and the probe tree.

**Charge 4 answered, and it closes pass-1 S-N6.** The pass-1 packet named no source for an author's `SKILLS LOADED` line; this packet names the FIX seats' agent-reports *and* their READY comments. The agent-reports carry none (`grep -in "SKILLS LOADED" FIX-S01-p1-A.md FIX-S01-p1-B.md` → 0 hits), but **both READY comments do**, and both cover the worker floor — FIX-B: `using-superpowers` (+ `references/codex-tools.md`), `heartbeat-protocol`, `heartbeat-worker`, `receiving-code-review`, `test-driven-development` (+ `writing-good-tests.md`), `verification-before-completion`, `systematic-debugging`, `executing-plans`; FIX-A: the same set plus `brainstorming` and `using-git-worktrees`. The orchestrator's CONSUMED comments record `skills-check.sh` verification against each Codex rollout jsonl. No line is missing. The half of the charge that points at the agent-reports is inaccurate but harmless, since the other half resolves; not raised as a finding.

One unchanged defect: `comment cursor at dispatch: 0 comments` while the DISPATCHED comment made it 1 — the same slip pass 1 reported (union C-N4), already on an orchestrator ticket. Not re-raised.

## 2. Each pass-1 finding, verdicted by measurement at `c358d494`

Run under `SET ROLE` on the repo's embedded Postgres, never a superuser pool. Verbatim lines are from `probes/REV-S01-p2-security-data-safety/logs/refix.log`.

| pass-1 finding | verdict | the line that decides it | measurement at `c358d494` (pass-1 value) |
|---|---|---|---|
| **S-N1** boundness at one layer — prepare half | **ADDRESSED** | `migrations/0070_fix_system_publication.sql:15` | `D3 prepare() on unbound runs: {"premium":false,"nullTier":false,"preRule":false}` (pass 1: all `true`) |
| **S-N1** — trigger half | **ADDRESSED** | `migrations/0069_fix_bound_erasure_and_trigger.sql:14` | `D3b f1 admission on an UNBOUND run: 55000:PUBLICATION_V2_REF_BINDING_REQUIRED latest = null` |
| **S-N2** f1 ignores the intent's lease | **ADDRESSED** | `0069:19` | `D4 f1 admission with an EXPIRED intent: 55000:PUBLICATION_V2_REF_BINDING_REQUIRED` · control `D4 control, LIVE intent: NO_ERROR` |
| **S-N3** f2 not tied to the run | **ADDRESSED** | `0069:30-33` (the snapshot join) | `D5 cross-run f2 (pass 1: NO_ERROR, attacker went PRIVATE): 55000:PUBLICATION_V2_REF_BINDING_REQUIRED attacker latest = PUBLISHED` · control `D5 control, own run: NO_ERROR victim latest = PRIVATE` |
| **S-N4** DENY audit for any run | **ADDRESSED** | `0070:130-134` | `D6 {"unboundPremium":false,"boundNoOutstandingWork":false,"boundWithOutstandingWork":true}` (pass 1: any existing run returned `true`) |
| **S-N5** locale-fragile C2 fixture | **ADDRESSED** | `tests/integration/fpd-s01-c2-system-publication.test.ts:225-229` now pins `--encoding=UTF8` | ambient run (`LANG`/`LC_ALL` unset): `fpd-s01-c2-system-publication rc=0 passed=20 failed=0 (expect 20/0)`, where pass 1 measured `0/0` BROKEN. **Class swept:** `grep -rln "new EmbeddedPostgres" tests/` returns exactly two files, and both pin the encoding. |
| **S-N7** R-6's oracle | **ADDRESSED** | `SPEC-v3.md:98-104` | R-6 now reads "the publish machinery adds no identifier of the owner that the owner did not write themselves", with an explicit *What this requirement does NOT govern* clause for `question` and `summary_segments`, and a three-assertion Check. The property is now the parity property my pass-1 N7 named. |
| **S-N6** packet carried no `SKILLS LOADED` source | **ADDRESSED** | this packet's charge 4 | §1 above. |

**Re-derivation, stated because the packet requires it.** Pass-1 cases `A5` and `A6` were *characterisations*, not assertions: `A5` hit `23503 run_visibility_event_publication_ref_fkey` before the trigger could decide, and `A6` printed `NO_ERROR` — the defect S-N3 reports. At this head the correct outcome inverts, so `D3b`/`D4`/`D5` assert refusal and each carries a **control** (the same shape with boundness, the live lease or the matching run restored) that must still be `NO_ERROR`. A tightened admission and a broken one are distinguished by the control, never by the refusal alone. `A5`'s foreign-key dead end is also fixed: the unbound run is now seeded unbound with a real snapshot and a live intent, because `core.run` is append-only (`core.reject_mutation()` raises on `UPDATE core.run`).

**The instrument.** Pass 1 measured that no product role holds INSERT on `core.run_visibility_event`, so a bare insert under `SET ROLE` always stops at `42501` and never reaches the trigger. This pass installs a test-only SECURITY DEFINER inserter **inside the probe's own ephemeral database** — never a file, never a migration, never a shared database — so the SQLSTATE reported is the trigger's own decision. The privilege layer is re-measured separately and independently: `D2 {"runtimeVisibility":"42501…","erasureVisibility":"42501…","runtimeAudit":"42501:permission denied for table audit_event"}`.

## 3. The new migrations (charge 7)

`D1` over every function `0069` and `0070` create or replace, plus the pass-1 set: **12 of 12 found · SECDEF without pinned `search_path`: `[]` · not SECURITY DEFINER: `[]` · executable by PUBLIC: `[]`.** No role outside `PLAN.md` §1.1's map gained EXECUTE.

Branch-by-branch diff of the trigger, `0068` → `0069`: **two hunks, `+4` lines, `−1`, nothing removed** — `COALESCE(core.run_is_free_public_bound(NEW.run_id),false)` and `intent.expires_at>clock_timestamp()` added to the f1 admission, and the f2 admission's `EXISTS` rewritten to join `serve.publication_snapshot` on `snapshot.run_id=NEW.run_id`. Every other branch, including the two `RAISE EXCEPTION` fallbacks and the whole audit half, is byte-identical.

`core.prepare_private_run_erasure`, `0068` → `0069`: the authorization preamble is byte-identical again (preauth `EXISTS`, `FOR UPDATE NOWAIT` run lock, account lock, `owner_ref` check, session `FOR KEY SHARE NOWAIT`, grant `FOR UPDATE NOWAIT`, first/last ownership, provision contention, grant consume, legacy check). One early return becomes a flag (`v_system_publication_contended := FOUND`) and the `PREPARED`/`CONTENDED` choice moves to the end, after the erasure work is durable. No branch removed, no predicate weakened.

**The charge's question — who completes a QUEUED erasure, as which role, and can it be triggered for a run the caller does not own?** The completion is the pre-existing `PrivateRunErasureCoordinator.reconcile()` path running as `debateai_erasure_runtime`; `D8` measured `core.finalize_private_run_erasure` and `core.resume_private_run_erasure` as `runtime:false, erasure:true, public:false`. It can only act on a `serve.private_run_key_cleanup_intent` row, and that row is created only inside `prepare_private_run_erasure` after the full authorization block. Measured directly: `D8 erasure role forging a queue row for a run it was never authorized for: 42501:permission denied for table private_run_key_cleanup_intent`, and `D8 prepare_private_run_erasure with no session and no grant: NOT_FOUND`. **A caller cannot put a run they do not own into the completion queue.**

## 4. The second answer-serving route (charge 8)

`SPEC-v3.md:44-47` widened the trigger to any route that returns the full answer to its owner; `apps/api/src/index.ts:434-450` centralises the hook and `:1024` attaches it to `GET /v1/answers/{id}`. Measured through `buildApi` with a schema-valid `Answer`:

| caller | `GET /v1/answers/{real}` | `GET /v1/answers/{missing}` |
|---|---|---|
| owner | `200` | — |
| second signed-in user | `404 {"error":"ANSWER_NOT_FOUND"}` | `404 {"error":"ANSWER_NOT_FOUND"}` |
| no session | `401 {"error":"SESSION_REQUIRED"}` | `401 {"error":"SESSION_REQUIRED"}` |

Byte-identical in both rows, so the new route tells a stranger nothing it did not tell them before this slice. `E2 tryAutoPublish calls after 4 non-owner/anonymous reads: 0` across **both** answer-serving routes, rising to exactly `1` on the owner's own read — a read by a non-owner never publishes someone else's run, because `readAnswer`/`readRunAnswer` are scoped by `ownershipFor(request)` and the hook is handed the same `authenticatedSession` those reads were scoped by. `E3 with a throwing hook: 200 200 identical to the healthy body: true` — a publish failure cannot change what either route serves.

## 5. Slice verification list, run twice (charge 3)

Both runs are the 19-suite list at the landed pairs, from my cwd, with every spec passed as its own argument.

- **ambient** (`LANG`/`LC_ALL` unset, via `env -u`): `CLUSTER_GREEN`, every suite at its pair, **0 skipped**.
- **`LANG=LC_ALL=en_US.UTF-8`**: `CLUSTER_GREEN`, `diff` against the ambient output is **empty — byte-identical**, **0 skipped**.

C2 integration `20/0` in both, C2 unit `14/0`, C3 `11/0`, C4 `8/0` and `17/0`, the three DELTA suites at `25/1`, `4/1`, `30/1`, `register-support-publication 12/2`. The only failures in either run are the five tests named RED at base.

**Charge 2's dropped-case check.** Three case names present at `db4758da` are absent at `c358d494`. All three are renames that state the tightened behaviour, and coverage is stronger, not thinner: *"returns NULL for a NULL tier with one DENY and no publication"* → *"…with **no forgeable DENY** and no publication"*; the same for the pre-rule Free case; and *"returns CONTENDED while a system publication intent is PREPARED"* → *"returns CONTENDED **only after queuing erasure during** a live system publication intent"*. The first two had to change because S-N4's fix makes the old "one DENY" assertion false by construction. Checked and cleared — not a finding.

## 6. Findings

No blocking findings. Both are new, both sit inside the diff since pass 1, and both are members of the very class this pass closed two members of.

**S-N8 — a new SECURITY DEFINER capability was added without the admission its two siblings just gained.** `migrations/0070_fix_system_publication.sql:45-77`, `core.ensure_free_public_auto_publish_work`, granted to `debateai_runtime` at `:147-148`, takes `(p_run_id, p_user_id, p_owner_ref)` and writes an uncleared work row with **no boundness check and no ownership check** — in the same file where `prepare_system_publication_key_provision` gained `core.run_is_free_public_bound` at `:15` and `audit_system_publication_attempt` gained it at `:130`. Measured (`D7`, under `SET ROLE debateai_runtime`, on a **Premium** run):

```
D7 ensure() on a PREMIUM run: true
   row: {"reason":"AUTO_PUBLISH_TRANSITION_NULL","cleared_at":null}
   owner visibility projection: {"state":"PRIVATE","publish_pending":true}
   claimed by the reconciler: true
```

Three consequences of one row. `publish_pending:true` on a Premium run contradicts `SPEC-v3.md` R-11.2 ("every response for every run that is not an outstanding bound run is byte-identical to today's") — `packages/db/src/publication.ts:584` only suppresses the key when the run is `PUBLISHED`, not when it is unbound. The reconciler claims the row, and `apps/api/src/publications.ts:203` returns early for an unbound run **without clearing it**, so the row is immortal and re-claimed every cycle. *Reachability:* the only caller is `tryAutoPublish`, which checks boundness at `:203` before reaching `:215`, so no caller produces this today and no requirement is violated at this head. *Remedy by shape, matching its two siblings in the same file:* `IF NOT core.run_is_free_public_bound(p_run_id) THEN RETURN false; END IF;` at the head of the function, plus either a clear or a bounded drop for an unbound row in the reconciler. **VERDICT: add the admission / CONFIDENCE: high / STRONGEST COUNTER:** the TypeScript caller already checks, so this is defence in depth — but a capability that is safe only because of its single current caller is exactly what S-N1 was, and S-N1 was fixed rather than argued.

**S-N9 — the class sweep stopped at the visibility half of the trigger.** `migrations/0069_fix_bound_erasure_and_trigger.sql:55-59`: the **audit** half's `debate.publication.published` admission still requires only `EXISTS (… intent WHERE publication_ref::text=NEW.target_id AND cleanup_state='PREPARED')` — no `expires_at>clock_timestamp()` and no `core.run_is_free_public_bound`, the two predicates the **visibility** half gained 41 lines above at `:14` and `:19` for findings S-N1 and S-N2. Law 3.2 asks for the class, and the class is *pinned system admissions whose preconditions are weaker than the function that writes the row*; the audit half is its third member and was not swept. *Impact:* an `ALLOW` audit row attributed to `system:free-public-auto-publish` could be admitted for an unbound run or against an expired lease. It is not reachable — re-measured this pass, `D2 runtimeAudit: 42501:permission denied for table audit_event`, and `identity.audit_system_publication_attempt` writes only `DENY` rows — so this is audit integrity, not privilege. *Remedy:* add the same two predicates at `:55-59`. **VERDICT: finish the sweep / CONFIDENCE: high / STRONGEST COUNTER:** the visibility row is the one that exposes content and it is now guarded twice over; an audit row alone exposes nothing, so this is the cheapest member of the class to leave for last — but leaving it silently is what turns a swept class back into an unswept one.

## 7. UNVERIFIED — stated, not assumed

1. **Three runs.** I ran the list twice as charge 3 requires — ambient and UTF-8 — not three times. Worst-of-three across identical runs is the correctness lens's charge.
2. **V's acceptance walk** (`SPEC-v3.md` §4, steps 1–16 with 3b/3c/11b, and step 4's total read as "plus 2" per `DECISIONS.md` §31). No stack was served this pass; REV does not impersonate V.
3. **The erasure completion end to end.** I measured that the completion's queue row cannot be forged and that the two completion functions are `debateai_erasure_runtime`-only. I did not drive `PrivateRunErasureCoordinator.reconcile()` to completion against a real key store, so "the 202 completes by itself" is verified as *durable work exists and only an authorized owner can create it*, not as *the key was destroyed*.
4. **Concurrency.** The publish/erase race the 0069 change opens (erasure proceeds while a system intent is live) was read, not stressed: both paths serialise on `core.run` and the erasure's lock is `NOWAIT`, so I expect `lock_not_available → CONTENDED` on one side, but I ran no parallel-load experiment.
5. **Which role `DATABASE_URL` resolves to in production.** `.local/**` is no-touch; the boot-time superuser rejection is measured, the deployment value is not.
6. **The other lenses' pass-1 findings.** I verdicted only my own rows, as charge 1 scopes.

## 8. Predictions about the other two lenses

I expect **correctness/tests** to spend this pass on mutants T8 and T10, which its own pass-1 report recorded as SURVIVED and which FIX-A claims are now caught (`T8 now fails the bound-PRIVATE unpublish case (10/1 instead of 11/0)`, `T10 … 13/1 instead of 14/0`); I predict it confirms both and then finds its real material in the same place I did — the reconciler's early return for an unbound run at `apps/api/src/publications.ts:203`, which it will frame as a liveness defect (an immortal claimed row) rather than as the admission gap I call S-N8, and it may well also notice that `ensure_free_public_auto_publish_work`'s `ON CONFLICT … WHERE cleared_at IS NOT NULL` silently returns `false` when a live row carries a different `user_id`, which I judged out of my lens. I expect **product-truth** to be occupied by V-8 (delete is unreachable from the screen, which no file of this slice can close) and by whether the widened `GET /v1/answers/{id}` trigger matches V-10's words, and I predict it checks acceptance step 4's "plus 2" against `DECISIONS.md` §31 and finds the SPEC text still reading "plus 1" — which is V-11 and correct, not a new finding. I predict neither lens re-measures the privilege grid, so if either treats S-N8 or the audit-half gap as **blocking**, it will be reasoning from the SQL text without `has_table_privilege`, and the measurement that settles the tier is `D2` in my probe. I also predict that neither lens reads the trigger's audit half at all this pass, because both fixes advertised themselves on the visibility half.

## 9. Rows for V

**None.** Every pass-1 row of this lens is ADDRESSED; S-N8 and S-N9 are engineering tightenings with a named one-line remedy each and no product question inside them. V-9's default (the 202 must be backed by durable work) is satisfied as far as authorization goes — the grant is consumed, the queue row is created only after the full authorization block, and no caller can queue a run they do not own.
