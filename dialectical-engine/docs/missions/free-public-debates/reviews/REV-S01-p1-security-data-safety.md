# REV(S01) pass 1 — lens SECURITY / DATA-SAFETY — verdict **PASS** (non-blocking N1…N7)

- seat `REV-S01-p1-security-data-safety` · node REV(S01) blind lens, pass **1 of 3** · ticket `t_af8d9bb2`
- slice head `db4758da` checked out read-only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-security-data-safety/dialectical-engine` · base `5b6cc9b1` · worktree 0 dirty at handoff
- oracle: `SPEC-v2.md` R-1…R-25 and §4; `DECISIONS.md` §10, §20–§25; `V-DECISIONS-PACKET.md` V-1…V-7
- probes promoted to `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/probes/REV-S01-p1-security-data-safety/` (`run.sh`, four seat-named files, `logs/`)
- **No blocking finding.** Every attack in §2 that a product role can actually reach was refused. The seven N-findings are defence-in-depth, audit-fidelity, test-reproducibility and packet defects; each names WHEN, never WHETHER.

---

## 1. The packet, reviewed first

Checked against their sources and **correct**: base `5b6cc9b1` (`00-intake.md:4`, `COMMON.md:7`) · slice head `db4758da` (my `git rev-parse HEAD`) · the two fixed actor tokens `…00f1` (`migrations/0067_system_run_publication.sql:52`) and `…00f2` (`migrations/0068_bound_published_erasure.sql:22`) · "V-7 was NOT plan-reviewed" (`V-DECISIONS-PACKET.md:13`) · "Five tests are RED at base" — five named tests across four suites (`00-intake.md:79-93`), consistent with the package README's "four suites" · the cwd resolves · the `allowed` list covers both deliverables and the probe tree.

One defect, **N6** below: the packet's `inputs` line is exhaustive ("read these and nothing else") and contains no source for a BUILD seat's `SKILLS LOADED` line, which `heartbeat-reviewer` §1 makes a mandatory check.

`git diff --stat 5b769877..9386a844 -- docs/missions/free-public-debates .hermes/planning/free-public-debates .hermes/reports/free-public-debates` run from the cwd returns 45 files / 5224 insertions — the orchestrator's record of the pass, as the packet describes it. Nothing in it is a product file.

## 2. What I attacked, and what answered

All measurements are from **my own** fixtures on the repo's embedded Postgres, under `SET ROLE`, never a superuser pool. Probe files and verbatim logs are in the promoted probe directory.

### 2.1 Charge 3 — who may execute what (`rev-s01-p1-sec-privileges.test.ts`)

`has_function_privilege` for every function `0066`–`0068` creates or replaces, for **every** `debateai%` role plus `public` plus a purpose-built no-grant role:

| function | granted to |
|---|---|
| `core.run_is_free_public_bound(uuid)` | `debateai_runtime`, `debateai_erasure_runtime` |
| `serve.prepare_system_publication_key_provision`, `serve.abandon_system_publication_key_provision`, `identity.audit_system_publication_attempt`, `core.transition_system_run_publication`, `core.upsert_free_public_auto_publish_work`, `core.clear_free_public_auto_publish_work`, `core.claim_free_public_auto_publish_work` | `debateai_runtime` |
| `serve.claim_system_publication_key_provision_cleanup`, `serve.complete_system_publication_key_provision_cleanup` | `debateai_publication_cleanup` |
| `core.enforce_publication_v2_ref_binding()` | nobody but the owner |
| `core.prepare_private_run_erasure` | `debateai_erasure_runtime` |
| `core.create_encrypted_run` | `debateai_content_provision` (unchanged by `0066`) |

**`public` is false on all thirteen; no role outside `PLAN.md` §1.1's map holds EXECUTE on any of them.** All thirteen are `prosecdef=true` with `proconfig=["search_path=pg_catalog"]`; the probe's `SECDEF_WITHOUT_PINNED_SEARCH_PATH` list is `[]`.

### 2.2 Charge 2 — forging the two pinned admissions (`rev-s01-p1-sec-forge.test.ts`)

The decisive measurement is the table grid, not the trigger text:

```
core.run_visibility_event   debateai:SIUD  debateai_runtime:S  everyone else:-
identity.audit_event        debateai:SIUD  debateai_runtime:S  everyone else:-
serve.publication_snapshot  debateai:SIUD  debateai_runtime:S  everyone else:-
serve.publication_key_cleanup_intent / system_publication_key_provision_intent / publication_event_binding
                            debateai:SIUD  everyone else:-
```

Direct forgery attempts, verbatim:

```
A1 runtime direct f1 insert: 42501:permission denied for table run_visibility_event
A2 erasure direct f2 insert: 42501:permission denied for schema ledger
A2 runtime direct f2 insert: 42501:permission denied for table run_visibility_event
A2 nobody  direct f2 insert: 42501:permission denied for table run_visibility_event
A3 runtime direct audit insert: 42501:permission denied for table audit_event
```

**No role the product runs as can write a `core.run_visibility_event` or `identity.audit_event` row at all**, so neither pinned admission is reachable by a forged row from `debateai_runtime`, `debateai_erasure_runtime` or a role with no grant. `apps/api/src/main.ts:574` and `assertPublicationDatabaseRoleSeparation` (`packages/db/src/publication.ts:78-96`) reject a superuser publication pool at boot, so the owner role is not what the API runs as.

`0068`'s trigger against `0067`'s, body diff: **pure addition of the f2 branch, every other line byte-identical** (`diff` of `0067:43-119` against `0068:3-90` → one hunk, `+11` lines, `-0`). `0068`'s `core.prepare_private_run_erasure` against `0040_account_erasure.sql:4423`'s: the entire authorization preamble — preauth `EXISTS`, `FOR UPDATE NOWAIT` run lock, account lock, `owner_ref` check, session `FOR KEY SHARE NOWAIT`, grant `FOR UPDATE NOWAIT`, first/last ownership, provision contention, grant consume, legacy check — is byte-identical; the diff **adds** a `CONTENDED` guard on `serve.system_publication_key_provision_intent` (`0068:197-199`) and narrows the `PUBLISHED` branch to bound runs only. No branch of the previous definition was removed.

### 2.3 Charge 4 — every guard mutated, every named case RED (`rev-s01-p1-sec-exposure.test.ts` B5)

Mutants are applied to the function **in the ephemeral probe database** and restored from the `pg_get_functiondef` text captured at the head, never to a literal; the probe asserts the restored definition is byte-identical to the captured one (`B5 function restored byte-identical: true`).

| guard removed | baseline | mutant |
|---|---|---|
| `IF NOT core.run_is_free_public_bound(p_run_id)` (`0067:309`) | `{"premium":null,"nullTier":null,"preRule":null}` | `{"premium":"a8ca953f…","nullTier":"a7a5dc26…","preRule":"acf0bb04…"}` — **all three unbound runs published** |
| `IF NOT core.run_private_content_is_live(p_run_id)` (`0067:315`) | `null` | `THREW 55000:PRIVATE_CONTENT_ERASED` — the erased case is caught by a *second*, independent guard, `serve.enforce_publication_erasure_barrier()` |
| `IF v_latest_state='PUBLISHED'` (`0067:324`) | `null` | published a second `publication_ref`; `serve.publication_snapshot` for that run went **1 → 2**, i.e. R-5 breaks |

Each guard is load-bearing; the erased case is protected twice over.

### 2.4 Charge 5 — the refusal is not an oracle (`rev-s01-p1-sec-oracle.test.ts`)

`preflightGrant` is at `apps/api/src/index.ts:1175-1186`, **ahead of** the ownership read (`:1187-1192`) and the new 409 (`:1197-1202`). Measured through `buildApi`:

| caller | bound published run | run id that exists nowhere |
|---|---|---|
| owner, live grant | `409 {"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}` | `404 {"error":"RUN_NOT_FOUND"}` |
| owner, dead grant | `404 {"error":"RUN_NOT_FOUND"}` | `404 {"error":"RUN_NOT_FOUND"}` |
| second signed-in user | `404 {"error":"RUN_NOT_FOUND"}` | `404 {"error":"RUN_NOT_FOUND"}` |
| no session | `401 {"error":"SESSION_REQUIRED"}` | `401 {"error":"SESSION_REQUIRED"}` |

R-13 holds: every answer to a caller who is not the owner-with-a-live-grant is byte-identical to the answer for a run id that exists nowhere. R-14 holds: the 409 repeats identically with the same token, and the route returns before `publications.unpublish`, which is the only consumer of the grant. R-18: `DELETE /v1/debates/{id}` gives a second user `404 {"error":"NOT_FOUND"}` and an anonymous caller `401 {"error":"SESSION_REQUIRED"}`, each byte-identical to the missing-run answer; the route itself is untouched by the diff, and `0068`'s new branch sits after the full authorization block, so no non-owner reaches it.

### 2.5 Charge 6 — what a published Free snapshot exposes

Published through the product's own `PostgresPublicationApplication.tryAutoPublish`, read back through the product's own `readPublicDebate`, against a **clean** answer (nothing the owner typed carries an identifier):

```
author_pseudonym matches the account pseudonym : true
containsUserId / containsOwnerRef / containsSessionId / containsEmail / containsAuditToken / containsRunId : false
snapshot keys : ["public_ref","author_pseudonym","question","published_at","answer"]
```

R-6/R-7/V-4 hold, and they hold **structurally**: the system path and the owner path now share one builder, `publicDebateFromAnswer` (`apps/api/src/publications.ts:96-122`), which the diff extracted from the owner path unchanged. A divergence would have to be introduced deliberately.

R-20, read from the audit row the fixture produced:

```
{ actor_key_ref: "system:free-public-auto-publish", event_type: "debate.publication.published",
  target_type: "debate.publication_event_ref", decision: "ALLOW", success: true,
  justification: null, source_context: {"schema":"s10-publication-event-v2"},
  actor_ciphertext: null }
identity.step_up_grant WHERE action='PUBLISH' AND target_run_id=<run> : 0
identity.publication_event_binding WHERE run_id=<run>                 : 0
identity.session rows for that user                                   : 0
```

R-20.4 is satisfied structurally as well: `identity.audit_event` has no session or grant column at all (`["audit_id","prev_hash","this_hash","actor_ciphertext","actor_key_ref","event_type","target_type","target_id","occurred_at","source_context","decision","success","justification"]`), and `actor_ciphertext` is NULL on the system row. R-20.1: every `PUBLISHED` visibility row in the fixture carries `warning_version='PUBLIC_INDEXED_V1'`, the same literal the owner-driven `core.transition_run_publication` writes. R-8: a `BLOCKED` answer left `{"state":"PRIVATE","publicRef":null}` with outstanding work `0`.

### 2.6 Charge 7 — a pre-slice snapshot still parses

A snapshot built with the exact key set `PublicDebateSchema` carried at base, encrypted and stored, then read through `readPublicDebate`: **200**, and it appears in `listPublicRefs`. The contract diff adds a key only to `PublicationTransitionSchema` (`packages/contract/src/index.ts:251`, `publish_pending: z.literal(true).optional()`); `PublicDebateSchema` is untouched, so R-22.1 cannot fire. R-22.2: the system path writes `published_at` and `serve.publication_snapshot.created_at` from the **same** `occurredAt` value (`apps/api/src/publications.ts` `tryAutoPublish` → `publicDebateFromAnswer(…, occurredAt)` and `systemPublish({… occurredAt})`), so the `readPublicDebate` equality at `publications.ts:397-398` cannot drift.

### 2.7 Slice verification list, run by me

`run-suites.sh` over SV-1's DELTA suite, SV-4, SV-5 and all four cluster files, at the pairs the orchestrator's head frame names. **One run, not three** — the three-run table is the correctness lens's charge and is UNVERIFIED here.

- Run 1, ambient environment (`LANG` and `LC_ALL` unset): `CLUSTER_RED` — every suite at its pair **except** `tests/integration/fpd-s01-c2-system-publication.test.ts rc=1 passed=0 failed=0 (expect 16/0)`, BROKEN with `error: Unicode normalization can only be performed if server encoding is UTF8`. See N5.
- Run 2, `LANG=LC_ALL=en_US.UTF-8`: `CLUSTER_GREEN` — all nineteen suites at their expected pairs, including `fpd-s01-c2-system-publication 16/0`, the three DELTA suites at `25/1`, `4/1`, `30/1`, and `register-support-publication 12/2`.

SV-7's runtime-role proof is exceeded by §2.1–§2.2 above: every claim here was measured under `SET ROLE`, and the one privilege claim that matters (no INSERT on the two event tables for any product role) was measured for every `debateai%` role in the database.

---

## 3. Findings

No blocking findings. Every N is on a ticket by end of pass; the orchestrator routes them.

**N1 — the boundness rule is enforced at exactly one layer.** `migrations/0067_system_run_publication.sql:121-162` (`serve.prepare_system_publication_key_provision`) does not call `core.run_is_free_public_bound`, and the f1 trigger admission (`0067:51-60`, carried verbatim into `0068:11-20`) does not either — it checks the pinned token, state and warning plus the existence of a `PREPARED` intent for `(publication_ref, run_id)`. Measured: `prepare()` under `debateai_runtime` returned `true` for a Premium run, a NULL-tier run and a pre-rule Free run (`A4 prepare() on unbound runs: {"premiumPrepared":true,"nullTierPrepared":true,"preRulePrepared":true}`). The only thing standing between a `PREPARED` intent on an unbound run and a `PUBLISHED` row is `core.transition_system_run_publication`'s check at `0067:309`, which mutant M1 proves is load-bearing. *Class:* the f1 capability's preconditions are creatable for a run the rule does not bind. *Remedy by shape (fixed predicate, not confidence):* add `AND COALESCE(core.run_is_free_public_bound(NEW.run_id),false)` to the f1 admission — the f2 admission already carries exactly that clause (`0068:24`) — and the same call at the head of `prepare_system_publication_key_provision`. **VERDICT: tighten / CONFIDENCE: high / STRONGEST COUNTER:** no product role can insert the row, so today the single layer is sufficient; the cost of the extra predicate is one `STABLE` function call per admission.

**N2 — the f1 admission ignores the intent's lease.** `0067:54-58` / `0068:14-18` require `cleanup_state='PREPARED'` but not `intent.expires_at > clock_timestamp()`, while the function that writes the row does require it (`0067:349`). A crash-orphaned intent past its five-minute lease keeps the admission open until `serve.claim_system_publication_key_provision_cleanup` reaps it. Same class and same reachability caveat as N1; same one-line remedy. **VERDICT: add the expiry predicate / CONFIDENCE: high / STRONGEST COUNTER:** the reaper bounds the window, and the row still needs INSERT privilege nobody has.

**N3 — the f2 admission does not tie the cleanup intent to the row's run.** `migrations/0068_bound_published_erasure.sql:25-29` requires a `PENDING` `serve.publication_key_cleanup_intent` for `NEW.publication_ref` and nothing that links `NEW.publication_ref` to `NEW.run_id`. Compare the f1 branch at `0067:56`, which does bind `intent.run_id=NEW.run_id`. Measured (`A6`, as the table owner, to characterise what the trigger alone enforces): a `PRIVATE` row naming run **A** while carrying run **B**'s `publication_ref`, backed by B's PENDING cleanup intent, was **admitted** — `NO_ERROR`, and A's latest visibility became `PRIVATE` while B stayed `PUBLISHED`. Concretely: given any one bound run whose deletion is in flight, the trigger would admit a PRIVATE row silently unpublishing a *different* bound run. *Remedy by shape:* `AND EXISTS (SELECT 1 FROM serve.publication_snapshot AS s WHERE s.publication_ref=NEW.publication_ref AND s.run_id=NEW.run_id)`. **VERDICT: bind the ref to the run / CONFIDENCE: high / STRONGEST COUNTER:** the only writer of the f2 shape is `core.prepare_private_run_erasure`, which reads `v_latest_publication_ref` from the run's own latest visibility event and therefore cannot cross runs — this is the last line of defence being weaker than the line in front of it, not a live hole.

**N4 — a granted wrapper lets the runtime role attribute a failed publish to any run.** `migrations/0067_system_run_publication.sql:248-274` (`identity.audit_system_publication_attempt`, granted to `debateai_runtime` at `:469`) accepts any `p_run_id` that exists in `core.run` and any of the four reasons; it verifies no relationship between the caller, the run, and an actual attempt. Measured (`A3`): under `SET ROLE debateai_runtime`, a DENY audit row naming an unrelated Premium run with no auto-publish history was appended — `appended: true`. It cannot forge an `ALLOW` row: the trigger pins ALLOW to a `PREPARED` intent for that `target_id` (`0067:78-82`), and a direct `INSERT` is `42501`. The cost is audit fidelity: R-21's "after two forced failures on one run, a query over that audit event type returns exactly two rows" is not a lower bound on truth, because rows can be appended for runs that never failed. *Remedy by shape:* require `EXISTS (SELECT 1 FROM core.free_public_auto_publish_work WHERE run_id=p_run_id)` or an outstanding/bound predicate inside the wrapper. **VERDICT: constrain the wrapper / CONFIDENCE: medium / STRONGEST COUNTER:** the only caller is the reconciler, and an auditor reading an ALLOW/DENY pair can still distinguish the system actor from a user.

**N5 — C2's integration evidence is locale-dependent, and a clean environment reads BROKEN, not RED.** `tests/integration/fpd-s01-c2-system-publication.test.ts:219-227` constructs `new EmbeddedPostgres({…})` with **no `initdbFlags`**, unlike the shared helper `tests/support/testDatabase.ts:87-97`, which pins `"--encoding=UTF8"`. In my worktree with `LANG` and `LC_ALL` unset, initdb chose `SQL_ASCII` and the migration failed at a Unicode-normalization call: `rc=1 passed=0 failed=0 (expect 16/0)`, `error: Unicode normalization can only be performed if server encoding is UTF8` (`42601`, `varlena.c`). The same command with `LANG=LC_ALL=en_US.UTF-8`: `rc=0 passed=16 failed=0`. Under DECISIONS §21 a `0/0` is BROKEN and is never evidence — so the sixteen cases that carry C2's security claims, including the runtime-role proof `SV-7` names, are unreproducible on any machine or CI image without a UTF8 locale. *Class:* every test file that builds its own database instead of using `startTestDatabase`; this is the only member in this slice's diff (`grep -c "new EmbeddedPostgres" tests/integration/fpd-s01-c*.test.ts` → 1, in C2). *Remedy:* pass the shared helper's `initdbFlags`, or call `startTestDatabase`. **VERDICT: pin the encoding / CONFIDENCE: high / STRONGEST COUNTER:** every machine that has run it so far had a UTF8 locale, so nothing shipped is wrong — only the evidence is fragile.

**N6 — packet defect (against the orchestrator's packet, not the workers).** `heartbeat-reviewer` §1 makes "check the AUTHOR's `SKILLS LOADED` line against their role floor" a mandatory part of the review. The packet's `inputs` line says "read these and nothing else" and names the review package, `SPEC-v2.md`, `DECISIONS.md`, `V-DECISIONS-PACKET.md`, `PLAN.md` §1 and §6, and the slice head — none of which carries a BUILD seat's handoff comment, and the agent-reports the package does point at carry no such line (`grep -in "SKILLS LOADED" agent-reports/BUILD-S01-C*.md` → 0 hits). The BUILD tickets are outside my contract. *Remedy:* either quote each author's `SKILLS LOADED` line into the review package's §3, or name the BUILD ticket ids in the `inputs` line. Reported as UNVERIFIED in §4.

**N7 — oracle defect: R-6's check is unsatisfiable as written.** `SPEC-v2.md:63-66` decides R-6 by "the decrypted snapshot contains no user id, owner ref, session id or email address anywhere in it". The snapshot carries `question` and `summary_segments` verbatim from the answer, which is user-authored: a debate whose question line contains an email address fails that check on the **owner-driven** path too. Measured both ways — with a contaminated answer the scan returned `containsEmail: true` for the system path; with a clean answer every scan returned `false`. The property that is actually checkable, and that this slice satisfies structurally, is "the publish machinery adds no identifier the owner did not write", which the shared `publicDebateFromAnswer` (`apps/api/src/publications.ts:96-122`) guarantees for both paths. *Remedy:* re-word the R-6 check at the next SPEC revision as a parity assertion between the two paths. **VERDICT: re-word the check, not the code / CONFIDENCE: high / STRONGEST COUNTER:** as written the check still catches the failure it was aimed at, because a machinery leak would show up in a clean-answer scan.

## 4. UNVERIFIED — stated, not assumed

1. **The three-run table.** I ran the slice verification list twice (once ambient, once UTF8), not three times. Worst-run selection across three runs belongs to the correctness lens.
2. **Every author's `SKILLS LOADED` line** — no source inside my contract carries one (N6).
3. **V's acceptance walk** (`SPEC-v2.md` §4, steps 1–16) needs a served lane and V personally; no stack was served for this pass and REV does not impersonate V.
4. **The production role of the API pool.** I measured that `assertPublicationDatabaseRoleSeparation` rejects a superuser publication pool at boot and that `debateai_runtime` holds `SELECT` only on the two event tables. I did not read deployment configuration to confirm which role `DATABASE_URL` actually resolves to; `.local/**` is no-touch.
5. **Key destruction after a bound delete.** I verified the PRIVATE row, the `PENDING` cleanup intent and that `readPublic` gates on `core.run_is_published`, so the public read is 404 the moment the row lands. I did not drive `reconcileKeyCleanup` to completion against a real key store.
6. **Concurrency.** I did not run a parallel-load experiment on the `prepare` → `transition` window; the advisory account lock and the `FOR UPDATE OF intent` clause were read, not stressed.

## 5. Predictions about the other two lenses

I expect **correctness/tests** to land on the same C2 suite I hit but from the other side — either it runs on a UTF8 box and never sees N5 at all (in which case my run-1 log is the only record that the evidence is locale-bound, and that lens will under-report reproducibility), or it re-runs three times and reports the three-run table I owe. I predict it will also flag `reconcileFreePublicAutoPublish`'s `if (answer === null) continue;` (`apps/api/src/publications.ts`): the work row was already claimed with a five-minute lease and is neither cleared nor rescheduled, so an item whose answer is not yet servable burns a claim and is silently skipped — a liveness question I judged out of my lens. I expect **product-truth** to argue about `publish_pending` and R-11's residual risk with an older `packages/contract` bundle, and about whether the answer-route hook at `apps/api/src/index.ts:1101-1113` makes "the answer is served" observable in the way R-4 means — it swallows every exception, so a permanently failing publish is invisible at the route. I predict neither lens attempts a privilege matrix, and that if either claims a forged-row risk on the two pinned tokens it will be reasoning from the trigger text without measuring `has_table_privilege`, which is the measurement that settles it. If a lens returns REWORK on the f2 admission, I expect it to name the missing bound check, which is present (`0068:24`) — the actual gap is the missing run binding, N3.

## 6. Rows for V

**None.** V-7 asked one yes/no: *"May delete-while-public of a Free debate write PRIVATE through a second pinned system actor, rather than by minting an UNPUBLISH grant?"* Measured against the built code, the answer stays **yes**, and the security reasoning holds: no UNPUBLISH grant is minted or consumed, the erasure's own `DELETE_PRIVATE_DEBATE` grant is consumed before the branch (`0068:200-202`), boundness is checked in both the function (`0068:213`) and the trigger (`0068:24`), and `0068`'s redefinition removes no branch of `0040`'s. The row's own STRONGEST COUNTER — "a second hole in the binding trigger could admit PRIVATE on an unbound run if the bound check is omitted" — did not materialise; the bound check is present. N3 is a tightening **within** that yes, not a reversal of it, so it belongs on a ticket and not in V's packet.
