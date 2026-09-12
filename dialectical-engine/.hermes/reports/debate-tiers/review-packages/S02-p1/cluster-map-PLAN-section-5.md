## 5. Cluster map — BUILD units, ONE command each, with the base verdict this seat measured

**Header corrected at Revision 2 (finding N11).** Pass 1's header claimed that every command below
was run at base while the C2 row's own cell admitted the published C2 command had not been. Every
command in this table was **re-run AS WRITTEN at `7f89f7b7` in the `tiers-s02` lane by seat
ARCH-FIX-S02 on 2026-09-09 at 23:11–23:12 EEST**, from
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/9b3e06e9-75fb-4fd0-8561-04ca8aec6886/scratchpad/seats/ARCH-FIX-S02/clusters.sh`
(output `clusters.out`, per-command logs `C1.log`…`P4.log`), with
`git status --porcelain | wc -l` = **0** before and after. Nothing in the cell qualifies the header
any more.

**Every base verdict below is measured against a lane where the cluster's own new test file does not
exist yet, and vitest DROPS a filter matching no file in silence.** The dropped path is named in each
row; that is why the green verdict pins `Test Files` as well as `Tests`.

| Cluster | Steps | What it builds | The one command | Base verdict, RE-RUN as written 23:11–23:12 (TDD path silently dropped) | Green verdict | Depends on |
|---|---|---|---|---|---|---|
| **S02-C1** | C1-S2, S3, S1, S4…S8 (execution order) | migration 0061, the `plan_tier` column, both write paths, the R12 read-back command | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  1 passed (1)` · `Tests  21 passed (21)` · rc=0 · wall 14 s · dropped: `tests/integration/tiers-s02-run-plan-tier.test.ts` | `Test Files 2 passed (2)` · `Tests 25 passed (25)` — absolute, because C1 runs BEFORE the rebase | nothing — starts at once |
| **S02-C3** | C3-S1…S6 | the roster read-discipline suite (R1, R2, R5) | `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files  1 failed (1)` · `Tests  3 failed \| 2 passed (5)` · rc=1 · wall 1 s — `s14-contract` at its `BASELINE.md` value, RED at base, inherited · dropped: `tests/architecture/tiers-s02-rosters.test.ts` | `Test Files 1 failed \| 1 passed (2)` · the M3 base **+1 file, +4 passing tests**, the same three failures named (pre-rebase arithmetic: `3 failed \| 6 passed (9)`) | S02-M4 |
| **S02-C2** | C2-S1…S11 | the roster filter, the typed refusal in its pinned position, the message, the `api.test.ts` re-fixture | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files  2 passed (2)` · `Tests  45 passed (45)` · rc=0 · wall 14 s — **the published command, run whole; 45 = api 24 + evaluator-database 21** · dropped: `tests/unit/tiers-s02-admission.test.ts` | `Test Files 3 passed (3)` · the M3 base **+1 file, +9 tests** (pre-rebase arithmetic: `54 passed (54)`) | S02-M4 |
| **S02-C4** | C4-S1…S4 | `ask.plan_tier` → `StartRunInput.planTier`, and the single-production-caller guard | `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files  3 passed (3)` · `Tests  39 passed (39)` · rc=0 · wall 2 s · dropped: `tests/unit/tiers-s02-wire.test.ts` | `Test Files 4 passed (4)` · the M3 base **+1 file, +2 tests** (pre-rebase arithmetic: `41 passed (41)`) | S02-C1 ∧ S02-C2 |

No verdict above is BROKEN. C3's rc=1 is `s14-contract`'s inherited baseline and is stated as a
delta, not claimed. **The three post-rebase green verdicts are stated as base + delta, not as
absolutes**, because S01's own cluster S01-C1 adds one case to `tests/unit/api.test.ts` and one to
`tests/unit/contract.test.ts` before this lane rebases (`slices/S01/PLAN.md:242-252`, `:276-277`) —
finding **F-7**. The delta is what S02 owns and what a gate asserts; S02-M3 item 4 measures the base.

**The file-count gate.** A vitest filter that matches no file is ignored in silence: at base,
`pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/contract.test.ts` exits **0**
with `Test Files 1 passed (1)` (measured, §6 probe 3). Every cluster's green verdict therefore pins
the **Test Files** count as well as the test count, and a report that omits it is not evidence.

### Parallelism

```
                 ┌── S02-C1 (no S01 dependency) ──┐
 start ──────────┤                                ├── S02-C4 ── GATE(S02) ── REV(S02) ── V
                 └── S01 merge ─ M1..M4 ─┬─ S02-C3 ┘
                                         └─ S02-C2 ─┘
```
C1 and C3 have disjoint file surfaces and run at once. C2 shares no file with C1 or C3. C4 waits on
C1 (for `StartRunInput.planTier`) and C2 (it edits the same file, sequentially).

---

