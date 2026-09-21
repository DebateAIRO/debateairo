# REV(S01) pass 2 (scoped) — UNION (2026-09-21) · slice head `c358d494` · base `5b6cc9b1`

- **verdict: PASS** (pass 2 of 3). Every lens passed: correctness/tests = **PASS** · security/data-safety = **PASS** · product-truth = **PASS**.
- lens verdicts (each is the record; this file only unions): `reviews/REV-S01-p2-correctness-tests.md` · `reviews/REV-S01-p2-security-data-safety.md` · `reviews/REV-S01-p2-product-truth.md`.
- The orchestrator holds no verdict authority: nothing here re-judges a finding.

## Pass-1 findings, as each owning lens verdicted them by measurement

| pass-1 id | lens verdict at `c358d494` |
|---|---|
| C-B1 · C-B2 · C-B3 · C-B4 · C-N1 · C-N3 | ADDRESSED (mutants T8 and T10 now caught RED; 12 of 14 mutants caught) |
| C-N2 | open — `run-suites.sh:17-23` is the protocol owner's file (ticket `t_e9b790e0` class); not a slice finding |
| C-N4 | recurs in the pass-2 packet (orchestrator packet defect) |
| S-N1 (both halves) · S-N2 · S-N3 · S-N4 · S-N5 · S-N7 | ADDRESSED (the cross-run PRIVATE row admitted at pass 1 now raises 55000) |
| P-B2 · P-B3 · P-N1 · P-N2 · P-N3 · P-N4 · P-N5 | ADDRESSED (P-B3's residue = P2-N1 below) |
| P-B1 | WITH V — row V-8 (the existing UI shows no delete control on a PUBLISHED debate; `apps/ui` delta is 0 by V's I-4) |

## New at pass 2 — all non-blocking, each ticketed; residue shown to V at TEST(S01)

| id | file:line | outcome (the lens's words, shortened) |
|---|---|---|
| C N1-p2 | `apps/api/src/publications.ts:417-419` | SPEC-v3 R-6's Check assertion 2 (system/owner snapshot parity) is asserted nowhere — a mutant diverging the owner path leaves five suites green |
| C N2-p2 | `apps/api/src/index.ts:1026,1123` | SPEC-v3 §1's count equality (`AnswerSchema.parse(` send sites == trigger sites) is not pinned by a test of the slice — a third answer route with no trigger passes everything |
| S-N8 | `migrations/0070:45-77` | `core.ensure_free_public_auto_publish_work` has no boundness admission; unreachable today (its one caller checks first); on a Premium run it would yield `publish_pending:true` and an immortal work row |
| S-N9 | `migrations/0069:55-59` | the trigger's AUDIT half was not swept with the visibility half's two tightenings; not reachable (runtime has no INSERT on `audit_event`, 42501 re-measured) — audit integrity, not privilege |
| P2-N1 | `apps/api/src/publications.ts:203`,`:207-209` · `apps/api/src/index.ts:446-448` | two ordinary queries still run before the enqueue and their throw is swallowed — a DB blip at that instant leaves the run PRIVATE with nothing queued until the owner's next read of either answer route |
| P2-N2 | `slices/S01/DECISIONS.md` §31 N4-p3 | names the public list where acceptance step 3b reads the answers index (mission doc) |
| P2-N3 · C-N4 | the pass-2 packets | cursor said 0 comments while the ticket had 1 (the DISPATCHED comment landed after the cursor was read); charge 4 said the FIX agent-reports carry the SKILLS LOADED lines — they are on the READY comments (orchestrator packet defects) |

## Gate facts the three lenses measured independently (frames in their files)

19 suites at their pairs in BOTH locales, 0 skipped; the only failures are the five tests RED at base; tsc 70 = base; `apps/ui` delta 0; all three lens worktrees and the lane 0 dirty at `c358d494`; every `SKILLS LOADED` line verified against the transcript body (4/4 each).

## Next node

TEST(S01) — V's. No ELEMENT node (the roster names none). V rows V-1…V-11 stand with their binding defaults.
