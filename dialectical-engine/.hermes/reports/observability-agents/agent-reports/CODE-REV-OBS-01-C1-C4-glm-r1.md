# Self-report — CODE-REV-OBS-01-C1-C4-GLM-R1 (P1 + P2 phase, updated through P2 completion)

Seat: CODE-REV-OBS-01-C1-C4-GLM-R1 · board observability-agents · ticket t_00dbafc1 · work ticket t_9f418bcd.
Runtime Hermes glm-5.3-flash. Replacement-review round 1 of 3 (user-authorized after Grok 402s).
Work under review: 2b670d30..7f8a805f (33b78823 rework included) at HEAD 7f8a805f5732ed2de6fe11eb2750d69ebb1eebbe.
Scope executed THIS session: P1 (exact scope + architecture) and P2 (migration + privilege wall + independent mutants + one C1 run) only. P3–P7 not started. P6 formal three-run wrapper deferred by user instruction.

## P3 phase (added after P2; probes, lifecycle, configuration) — 46/46 independent checks GREEN

Log: .review-scratch-glm-r1/p3-probe-final-run.log (probe source .review-scratch-glm-r1/p3-probe.mts). Highlights:
- Postgres probe exercised against a REAL live PG 18.4 (tcp+select1 -> ok, lastStatus READY); dead port -> INFRA_DOWN/FAILED; unreachable host bounded by timeoutMs (306 ms vs 300 ms budget). statement_timeout verified code-level (probes.ts:71-72, SET precedes SELECT 1).
- Hatchet via real HTTP servers: live+ready 200 -> ok (INFRA_DOWN); live 200 + ready 503 -> INFRA_NOT_READY (lastStatus 503); live 500 -> INFRA_DOWN (live gate); connection refused -> lastStatus 0; HANGING server bounded by AbortSignal.timeout (403 ms @ 400 ms timeout); container 'exited' while HTTP 200 -> ok=false (container AND-gate). Headers on BOTH requests: Connection: close + User-Agent dialectical-engine-observation-agent (server-captured verbatim).
- Docker engine info ok/down paths; heartbeat file write exact ISO content; atomicity via temp-file+rename code-verified (probes.ts probeObservationAgent).
- State machine: OPEN exactly at 2nd failure with firstFailedProbeAt = FIRST failure; no duplicate OPEN while DOWN; 1 success -> RECOVERING; interrupted recovery (fail during RECOVERING) -> SUSPECT then UP with NO event (no premature CLEARED; flap sequence re-OPENs); clean 2-success recovery from DOWN -> CLEARED; updatePolicy mid-flight takes effect immediately in BOTH directions; 0/1 policy rejected OBSERVATION_LIVENESS_POLICY_INVALID.
- Class change composition: INFRA_NOT_READY failures tracked independently; inactiveClassRecoveries synthesizes ok=true for the obsolete class -> INFRA_DOWN CLEARED via 2 synthetic successes while not-ready independently opens. Matches SPEC R04/R05.
- Severity routing: exact (class.component) row wins; class fallback for unlisted components; INFRA_UNKNOWN -> SEVERE; INFRA_NOT_READY -> DEGRADED; unresolved -> OBSERVATION_ROUTING_UNRESOLVED. Threshold reload: version bump observed; read error -> fail-open keeps current (H3, matches G8).
- Malformed module outputs -> single stable codes each: OBSERVATION_MODULE_PROBE_INVALID / OBSERVATION_MODULE_SAMPLE_INVALID / OBSERVATION_MODULE_SIGNAL_INVALID (no silent no-op — the error propagates and kills the cycle). Invalid targets: missing dir and bad row -> OBSERVATION_TARGETS_INVALID; duplicate component across fragments -> OBSERVATION_DUPLICATE_TARGET. Discovery: duplicate module name -> OBSERVATION_DUPLICATE_MODULE; dir without module.ts skipped; empty module name -> OBSERVATION_MODULE_INVALID. Cadence gating: no re-probe inside intervalMs; re-probe after elapse.

## P3 mutant (cadence/transition/composition class)

Target: main.ts:224 silent overwrite of openSignals on re-OPEN after an interrupted recovery. Pre-hash main.ts 0eaf252e5a03ddaad0e70f782719ccf54ebe94c536efe291bf7fa6be3b10a0ce == post-hash == restored (file never modified; mutant is a behavioral discriminator harness driven by the REAL state.ts tracker; checkout HEAD no-op custody proof). HEAD semantics isolated: flap cycle emits 2 OPENs for the same key, the first OPEN row is ORPHANED (never CLEARED). Mutant (throw on overwrite) trips exactly at that point (OBSERVATION_REOPEN_WHILE_OPEN) — behavioral RED, not a crash (same sequence completes under HEAD). Log: .review-scratch-glm-r1/p3-mutant.mts output in session; 7/7 discriminator checks PASS.

## P3 findings (to carry into the verdict)

- N-candidate 2 (composition edge, NEW): interrupted recovery + flap -> main.ts:224 overwrites the stale OPEN row; the orphaned OPEN row in observation.signal has no CLEARED successor and open_signal_ids in status.json inflates to 2 ids for one real fault window. Reachable only via the interrupted-recovery flap (fail during RECOVERING, then re-OPEN) — V's real stack window is 2 probes/10 s so this needs a flap mid-recovery; severity of impact low (observation store only; product untouched). Not copied from author tests; author suite has no flap-recovery coverage. Proposed fix: on OPEN with an existing row for the key, emit the synthetic CLEARED for the stale row first (or overwrite with clears_signal_id back-reference), or assert+drop stale row.
- P2's N-candidate 1 (4 extra impact_code values) unchanged.

## C2 (P3-required, single run; formal three runs remain P6)

tests/unit/obs-agent-01-discovery.test.ts + tests/integration/obs-agent-01-liveness.test.ts + tests/architecture/obs-agent-01-docker.test.ts: Test Files 3 passed (3); Tests 14 passed (14); anchored count guard matched. Log: .review-scratch-glm-r1/c2-run1.log.

## What P2 proved (all independent, not inherited)

- Fresh PostgreSQL 18.4 cluster per probe run via pg_ctl from the repo's own shipped binaries, ALL cluster files under .review-scratch-glm-r1, port 55499/55496, scram-sha-256, destroyed after each run.
- 57/57 PASS: full migrate() chain on a virgin cluster; 0057 replayed standalone twice (idempotent, replay safety); exactly 7 observation tables; agent role flags LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; mutation matrix exactly 7 INSERT + 2 UPDATE; zero DELETE/TRUNCATE; nothing outside observation/obs; obs.* SELECT-only.
- Effective writes proven by REAL LOGIN (scram over TCP): INSERT+UPDATE succeed and take effect (read-back verified) on heartbeat and sample_ring ONLY.
- Denials proven by REAL LOGIN: UPDATE x5 immutable tables, DELETE x7 all observation tables, TRUNCATE x5 guarded tables — all 42501. core.reject_mutation fires even for the table owner: DELETE on signal 55000; TRUNCATE on threshold_policy 55000. Out-of-schema: CREATE in observation/obs denied, INSERT/UPDATE/DELETE on a public probe table denied, INSERT into ledger denied. obs.component_health SELECT ok.
- Listener boundary proven BOTH by real login and by SET LOCAL ROLE: SELECT defect_signal_v OK; direct signal, open_signal_v, heartbeat, CREATE TABLE, CREATE SCHEMA all denied (42501).
- Closed enums: class 21/21 and component 17/17 exactly match requirements Q2 (no missing, no extra); severity, defect_kind exact; impact_code CHECK covers all 35 IMPACT_* codes named in requirements (DB carries 4 codes beyond requirements' current prose — see findings); behavioral 23514 on mutated class and component values.
- Both views exist WITH (security_barrier = true).

## Independent mutants (cluster-level, derived from defects' SHAPES, not from author tests)

- Pre-hash 0057: a813495df5ace49bd057f8d80b5b1218609322f40a517140e4c7f6e1750a4b3a (also verified = HEAD content hash before and after).
- Mutant A (grant-order class, mirrors 33b78823's blanket-revoke bug): revoke UPDATE on heartbeat,sample_ring after applying the HEAD migration tail → catalog matrix drops 9→7 (A1) AND behavioral RED: agent heartbeat UPDATE denied 42501 (A2). RED CONFIRMED.
- Mutant B (schema-USAGE class, mirrors grok-r1's finding): revoke USAGE ON SCHEMA observation from listener → listener SELECT defect_signal_v denied: 42501 "permission denied for schema observation". RED CONFIRMED.
- Restoration: migration file never modified on disk (mutants are cluster-level); `git checkout HEAD -- migrations/0057_observation_foundation.sql` run anyway as no-op custody proof; post-hash == pre-hash == restored; lane porcelain = only the permitted scratch dir.
- NOTE: both mutants FAIL the author's foundation tests too (they hard-fail on missing UPDATE / schema usage) — the mutation is a behavioral discriminator, not a crash. The A-mutant reproduces the exact historical 33b78823 defect, which is the strongest possible evidence the rework's regression test set has real teeth.

## C1 (protocol P2-required check; single run; formal three-run wrapper deferred)

- 3 files: tests/unit/obs-agent-01-environment.test.ts, tests/integration/obs-agent-01-foundation.test.ts, tests/architecture/obs-agent-01-boundaries.test.ts.
- `Test Files 3 passed (3)` · `Tests 10 passed (10)` · duration 2.95s · anchored grep guard matched exactly once. Log: .review-scratch-glm-r1/c1-run1.log.

## Findings so far (potential, to carry into the verdict once P3–P7 complete)

- N-candidate 1 (scope delta): impact_code CHECK carries 4 codes with no Q2 impact-sentence entry (IMPACT_HATCHET_DISPATCH_SLOW, IMPACT_RUNNER_GONE, IMPACT_SLOW, IMPACT_RUN_FAILURE). SPEC R06/R03 says the CHECK enumerates "every impact_code value listed in Q2" — these four are EXTRA beyond Q2's prose, i.e. forward-carry for later OBS slices. Strictly a spec-conformance nit (superset, not subset); likely N, not B. Needs P3–P7 context + requirements cross-check before tiering.
- No B-findings so far from P1/P2 evidence.

## Where the packet / tooling fought me (causes, prices)

1. Probe pwfile inside the initdb target dir → INITDB_FAILED. Cause: my mistake; initdb requires an empty target. Price: one probe iteration. Fix: pwfile outside dataDir, still under scratch. (User-directed fix.)
2. `SET ROLE ... PASSWORD` misconception (runs 1–2): password authentication failed while catalog checks passed. Cause: I assumed `SET debateai.observation_agent_password` + replay rewrites the password; actually migrate() had already created the role WITH a random password, so 0057's replay skipped its ALTER branch BY DESIGN (0034/0057 never clobber an existing credential). Price: two probe iterations + one controlled diagnostic on a manual pg_ctl cluster (provisioned via the migration's own DO-block shape; password then authenticated OK — root cause confirmed). Fix: `ALTER ROLE ... PASSWORD NULL`, then replay 0057 so ITS OWN provisioning path applies the reviewer password. This is also positive evidence FOR the migration: credential-existence check works as specified.
3. Node strip-only TS loader cannot parse parameter properties in packages/db (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Fix: run probes under repo's tsx. Price: one iteration.
4. No psql on this Mac (embedded-postgres ships initdb/pg_ctl/postgres only) — pre-recorded in TOOLING-TRAPS:1040; the pg-backed tsx one-shot remedy is exactly what these probes are.
5. `grep -o` with `{0,240}` bounded repetition → "maximum repetition exceeds 255" on macOS BSD grep. Price: one iteration.
6. Probe-logic false FAILs fixed across iterations: LIKE-based constraint lookup unreliable on pg18 rendering (switched to constraint lookup by name: signal_class_check / signal_component_check / signal_severity_check / signal_defect_kind_check / signal_impact_code_check); SAVEPOINT outside a transaction block throws 25P01 (wrapped enum probes in explicit BEGIN/ROLLBACK); missing ROLLBACK TO SAVEPOINT after denials cascaded 25P02 into later checks; extract regex `[A-Z0-9_.]+` missed lowercase/dash enum values (postgres, tls_front_door, scheduler.liveness-sweep) — widened to `[A-Za-z0-9_.-]+`. Owner-TRUNCATE probe on observation.signal hits the FK guard (0A000) BEFORE the append-only trigger; switched to threshold_policy to prove the trigger itself (55000).
7. Controller/tooling (context loss, NOT mine): prior sessions died mid-turn; per the controller the cause was resuming with top-level `-z` which ignored `--resume`. This session restored the actual conversation and completed P2.
8. Deviation disclosed: a pre-resume probe attempt created a throwaway cluster at /tmp/r2ctl-data (OUTSIDE the permitted scratch). It was stopped, and /tmp/r2ctl-data plus its logs were removed as soon as the deviation was noticed. Nothing else left the lane; no reviewed file was modified at any point.
9. Also read-only: to locate the operative protocol after context loss, .claude/projects/*.jsonl session files were searched read-only for "review-scratch-glm-r1" (no transcript contained it; the protocol was instead re-derived from the board ticket + packet files, which are the authoritative sources anyway).

## Nearly got wrong

- Nearly reported the listener mutant RED as a NEW finding; it is the exact round-1 blocker already fixed in 7f8a805f — the mutant only proves the fix's necessity.
- Nearly accepted "9 rows" in the grant matrix as 7 privileges; it is 9 (privilege,table) pairs = 7 INSERT + 2 UPDATE, matching the protocol's "seven INSERT and two UPDATE" wording.
- Nearly probed Q2 enums by parsing DB output with an uppercase-only regex — would have reported 17 missing components (a false B-finding). The lowercase/dash widening was verified against both Q2 text and constraint output before any conclusion was drawn.

## Dead ends (do not re-derive)

- embedded-postgres JS API always runs initdb itself; there is no supported way to pre-provision role passwords before its scram startup → abandoned in favor of direct pg_ctl control of the SAME shipped binaries (same version 18.4, same flags, data dir under scratch).
- LIKE '%component = ANY%' constraint lookup on pg18 returned rows for class/severity/defect_kind/impact_code but not component — root cause not worth chasing; by-name lookup is strictly more robust.
- Searching transcripts to recover the lost protocol: dead end (see 8 above).

## Packet ambiguities (named, exactly)

- glm-r1 packet §5 says "Send a concise heartbeat at meaningful milestones" but the grok-r2 protocol it inherits only defines CLAIM/verdict/pointer comments; heartbeat target ticket had to be inferred as the review ticket t_00dbafc1 (the user's instruction also names it).
- The protocol's P2 says "Create at least one independent privilege-wall mutant ... not copied from the author" — satisfied with two cluster-level mutants; the packet does not define whether cluster-level (SET ROLE inside a probe cluster) counts as "role-level". Treated as satisfied given the REAL-login plus SET ROLE dual proof; flagging for the orchestrator.
