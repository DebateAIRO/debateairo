# CODEX REVIEWER PACKET — lane/h-diag (fix round) r1 · F-H-2 + F-H-1

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag
base tip      : d08ee9283244dcfb76d68820360810c7749940d6   (integration, post-sealedrows)
fix tip       : a81ada2a
base..fix     : 2 files changed, 86 insertions(+), 3 deletions(-)
```

**Weigh this first: the same seat DIAGNOSED both defects and then FIXED them.** Its own report
says the instruction to verify the diagnosis independently "carries more weight than usual." You
are that independent verification. Read `agent-reports/h-diag.md` (both h1 sections) before
`agent-reports/h-fix.md`, and treat the diagnosis as a claim, not a premise. The orchestrator
verified four checkable facts (T11 not an ancestor of 1c9578a; the :4035 assertion; liveness zero
diff since T0; the 2d1f86b8 hunk) but did not re-run the instrumented probes.

## The two defects and the two fixes

**F-H-2 (product).** `packages/liveness/src/index.ts:144` called `core.run_private_content_is_live`
unguarded — a v1-encrypted-run predicate wearing a general name, so `recordQuery` found zero
candidates for any unencrypted run and a re-asked archived run never revived. Regressed in
`2d1f86b8` (2026-08-28), an ancestor of T0. Fix: `AND (run.content_encryption_version IS DISTINCT
FROM 1 OR core.run_private_content_is_live(run.run_id))`, mirroring `lock_owned_live_runs`.

The seat REJECTED two other routes and its reasons are the part to check hardest:
- *Revert to the pre-regression `NOT EXISTS` pair* — rejected because the helper ALSO checks
  `identity_user.state='active'`, which the inlined pair never did; a revert would loosen the
  encrypted path while fixing the plain one. **Verify that claim against the helper body and
  `970870f3`'s diff.**
- *Make the helper honest about its precondition* — rejected because it is `SECURITY DEFINER` and
  five callers in `migrations/0040` use it as `IF NOT … THEN refuse`; flipping it turns refusals
  into permits. **Verify the caller count and direction.**

**F-H-1 (test).** `verdict_state: 'SUPPORTED'` → `'CONTESTED'` with `LABEL-BASIS-INCOMPLETE`, with
the reason in a comment (rung 0, both limbs absent, T11 / goal 196-221). Fixture untouched.

## Evidence claimed — verify by artifact

RED 3/3 before (feature-missing reason, `expected +0 to be 1`); GREEN 3/3 after. Two mutants:
revert only the guard → lands on `ARCHIVED_REVIVED` at :4044; revert only the label → lands on the
label. Two blast-radius tests: with encryption OFF a query refreshes liveness. 20 gate records
under `logs/h-fix/`. `database.test.ts` **87/87** whole file (was 1 failed | 84 passed; +2 new,
+1 fixed). `s6-content-encryption-database` 48/48. `liveness-s11` 4/4. `tsc` 0.

**Orchestrator ran the suite the seat named as NOT verified**, `s7-authorization-database.test.ts`
(it also calls `recordQuery`), through `gate-run.sh`: **`Tests  1 failed | 11 passed (12)`** · `EXIT = 1` · `CLEAN-STATE: unchanged across the run (TRACKED paths only — see PROVISIONING)`. Log:
`logs/h-fix/orch-s7-authorization-database.log`.

**The s7 failure is PRE-EXISTING, verified by name:** `tests/integration/s7-authorization-database.test.ts > S7 real PostgreSQL ownership and IDOR boundary > locks every matching run before allocation whil` — in T0's stable-red authority and red in D15 b11 and b12 at tips that predate this lane. Not the fix's. Treat it as known-red, not as a finding against this diff.

Precommit manifest `logs/h-fix/precommit-manifest.txt`: 2/2 MATCH against the committed blobs.

## The seat's own new finding — ticketed as F-H-3, do not re-file

The neighbouring mutant `IS DISTINCT FROM 1` → `FROM 2` is caught by **nothing** — not the lane's
encryption-off tests (correct) and **not s6's 48 tests either**. The encrypted half of the new guard
is unpinned. Needs the s6 identity harness, outside the contract. **Assess whether an unpinned
half is acceptable to merge with F-H-3 open**, given the seat's claim that the encrypted path is
bit-for-bit unchanged by its edit.

## Questions

1. Is the diagnosis right? Specifically: is `SUPPORTED` genuinely unreachable for this fixture
   under T11, or could a fixture with two roots reach it and the test SHOULD have been changed that
   way instead?
2. Are the two rejected routes rejected for true reasons?
3. Does the `IS DISTINCT FROM 1 OR …` spelling leave the encrypted path bit-for-bit as before?
4. Do the two blast-radius tests actually exercise `sweep` / `decideRetirement` consumers, or only
   `recordQuery`'s event write?
5. Suite arithmetic; the s7 result above; anything the fix could break that no listed suite loads.
6. **Packet audit.** `packets/f-h-fix-worker.md` and the inline dispatch — including whether listing
   "restore the NOT EXISTS clauses" as a route was a defect when the seat found it unsafe.

## Method

Static; no mutating git; verify by artifact; scoped runs only. Absolute paths throughout — the
mission directory is `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-fix-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/h-fix-codex-r1-self.md
```

Line 1 exactly:
`CODEX REVIEW H-FIX r1 — <APPROVE|CHANGES> · comments read through: h-fix-r1-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required
fix**; `## Packet audit`; `## Not verified`; `## PREDICTIONS`; final line
`MERGEABLE: yes|no — <one sentence>`.


> **Orchestrator correction 2026-09-05:** the first version of this packet embedded three EMPTY strings on the line above, because the gate-run call had the wrong argument order, produced no log, and the empty grep was read as a result. The suite was then actually run and the real values substituted. The reviewer should treat that as evidence about the orchestrator, not the seat.
