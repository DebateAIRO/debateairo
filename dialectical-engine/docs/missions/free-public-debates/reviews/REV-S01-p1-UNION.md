# REV(S01) pass 1 — UNION (2026-09-21 04:21) · slice head `db4758da` · base `5b6cc9b1`

- **verdict: REWORK** (pass 1 of 3). PASS needs every lens to pass: correctness/tests = **REWORK** · security/data-safety = **PASS** · product-truth = **REWORK**.
- lens verdicts (each is the record; this file only unions and assigns): `reviews/REV-S01-p1-correctness-tests.md` · `reviews/REV-S01-p1-security-data-safety.md` · `reviews/REV-S01-p1-product-truth.md`. Finding ids below are prefixed by lens: **C-** correctness, **S-** security, **P-** product-truth.
- The orchestrator holds no verdict authority: nothing here re-judges a finding. Two findings of different lenses that name one defect are listed once with both ids.

## Blocking

| id | file:line | the failing outcome (the lens's words, shortened) | assigned to |
|---|---|---|---|
| C-B1 | `apps/api/src/publications.ts:96-119,229-231` | R-6's own Check is asserted nowhere: a mutant that builds the system snapshot from `ownerRef` instead of the pseudonym leaves all suites green | FIX-A |
| C-B2 | `apps/api/src/publications.ts:276-283` (same guard missing `:238-244`) | a losing concurrent serve upserts outstanding work without re-reading visibility → the owner's read answers PUBLISHED **with** `publish_pending:true` (R-9, R-11, acceptance step 5) | FIX-A |
| P-B3 | `apps/api/src/publications.ts:196-290` + `apps/api/src/index.ts:1109-1111` | no enqueue-before-attempt: any throw (0067:414-417 raises 40001) leaves the run PRIVATE with nothing outstanding and the bare `catch` swallows it (R-9; V-2's retry never engages) | FIX-A |
| C-B4 = P-N3 = S-N5 | `tests/integration/fpd-s01-c2-system-publication.test.ts:218-226` | the suite hand-rolls EmbeddedPostgres without `--encoding=UTF8`; with no UTF-8 locale all 16 tests SKIP (0/0) — three lenses measured it independently | FIX-A |
| C-B3 | `migrations/0068_bound_published_erasure.sql:197-199` | the new CONTENDED branch answers `202 {"status":"PENDING"}` while nothing is erased, no grant consumed, nothing retries (R-17 fails for up to ~5.5 min) — **V row V-9** carries the product half; its default binds FIX-B | FIX-B |
| P-B2 | `apps/api/src/index.ts:996-1008` | `GET /v1/answers/{id}` returns the identical answer to its owner with no auto-publish; the run stays PRIVATE and is never queued; the UI uses that route first. Root cause upstream: SPEC-v2 §1 defines "served answer" as ONE route — **V row V-10**, then REQ-FIX (SPEC-v3) and its scoped review | REQ-FIX p3 → REQ-REV p3 → FIX-A |
| P-B1 | `apps/ui/components/PublicationControl.tsx:194` (and `:77`) | the existing UI renders Delete only while PRIVATE, so a bound Free debate cannot be deleted from the product; the remedy needs an `apps/ui` file, which V's I-4 forbids — **V row V-8**; no FIX node (no file of this slice can close it) | V |

## Non-blocking (each is ticketed this pass; the tier sets WHEN, never WHETHER)

| id | file:line | outcome | assigned to |
|---|---|---|---|
| S-N1 | `migrations/0067_system_run_publication.sql:121-162`, `:51-60` | boundness is enforced at one layer: `prepare()` and the f1 admission skip `run_is_free_public_bound` | FIX-A (prepare) · FIX-B (the trigger admission) |
| S-N2 | `0067:54-58` vs `:349` | the f1 admission ignores `intent.expires_at` | FIX-B (owner of the trigger's newest definition) |
| S-N3 | `migrations/0068_bound_published_erasure.sql:25-29` | the f2 admission does not tie the cleanup intent / `publication_ref` to `NEW.run_id`: a PRIVATE row naming run A with run B's ref was admitted in the lens's fixture | FIX-B |
| S-N4 | `0067:248-274` | `identity.audit_system_publication_attempt` appends a DENY row for ANY existing run (weakens R-21's count) | FIX-A |
| P-N1 | `0067:399-405,436-441` · `apps/api/src/main.ts:300-308` | a permanently failing auto-publish is retried every 30 s for ever, no backoff, no cap, one DENY audit row per attempt | FIX-A |
| P-N2 = C-N3 | `apps/api/src/publications.ts:197-206` | the BLOCKED branch writes to the work table before the bound check (every Premium owner's read of a BLOCKED answer writes) | FIX-A |
| C-N1 | `apps/api/src/index.ts:1197-1202` | mutant T8 survives (the C3 refusal block) | FIX-A |
| S-N7 | `slices/S01/SPEC-v2.md:63-66` | R-6's Check is a property of user-authored text and fails on the owner path too | REQ-FIX p3 |
| C-N2 | `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh:17-23` | a fully SKIPPED suite is read as RED, not BROKEN | orchestrator ticket (protocol owner's file) |
| C-N4 · S-N6 · P-N4 · P-N5 | the lens packets | cursor said 0 comments, was 1 · no input carries an author's SKILLS LOADED line · SV-0 cannot detect a skipped suite · charge 5 pre-tiered the UI question | orchestrator tickets |

## Rows for V raised this pass (transcribed and numbered in `V-DECISIONS-PACKET.md`)
V-8 (from P-B1) · V-9 (from C-B3) · V-10 (from P-B2).

## Sequencing (file surfaces)
FIX-B owns a new migration (the trigger's newest definition + the erasure function) and the C4 tests. FIX-A owns `apps/api/src/publications.ts`, `apps/api/src/index.ts`, `apps/api/src/main.ts`, a second new migration (the 0067 functions other than the trigger) and the C2/C3 tests. Two seats writing migrations in ONE lane would each migrate the other's half-written file, so they run one after the other: **FIX-B ∥ REQ-FIX p3 → REQ-REV p3 → FIX-A → REV(S01) pass 2**. Each goes to its author's session (FIX-B: the C4 seat; FIX-A: the C2 seat, which also carries C3's one finding — same file).

## The next pass
REV(S01) pass 2 is SCOPED to these findings plus the pass-1 probes, which each lens promoted under `.hermes/reports/free-public-debates/probes/REV-S01-p1-<lens>/`.
