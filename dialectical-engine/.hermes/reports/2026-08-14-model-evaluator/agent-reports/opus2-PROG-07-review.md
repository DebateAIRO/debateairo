# opus2 self-report — PROG-07 peer review (second independent reviewer)

- **Seat:** opus2, substituting the Grok review seat during its outage (V's ruling).
- **Target:** `codex/eval-07-profiles`.
- **Round 1:** `a2b1f4e` → **REWORK** (4 blockers, 9 minors) — `PROG-07-opus2-review-1.md`
- **Round 2:** `6a05f47` + migration 0027 → **PASS** (0 blockers, 9 carried findings) — `PROG-07-opus2-review-2.md`
- **Date:** 2026-08-15.

## Independence

Judgement formed from scratch in both rounds. I did not open any `PROG-07-*-review-*.md` file.
Binding inputs read: the PROG-07 goal packet, `architecture/Architecture.md` (§3.4, §3.5, §5, §6,
§7 tier-5 row, §8), `requirements/Requirements.md` (FR-0.6, FR-0.7, §3.x, §5.x, traceability matrix),
wayfinder issue 07, plus the lane source, migrations 0019/0023/0027, and the lane-05/06 and runner
code the derivation depends on.

## Round 2 — what I executed

- `pnpm run typecheck` — exit 0.
- Full repository suite `npx vitest run` — **96 files / 693 tests passed**, exit 0.
- **My own round-2 pure suite** (22 assertions): every bias formula recomputed by hand against the
  *new* definitions (the rework redefined leniency, contradiction, and lineage residue, so round-1
  numbers were no longer a valid oracle), plus re-runs of both round-1 blocker proofs, the full
  replace-not-pool attack set, degenerate panels, typed-refusal edges, and determinism-under-shuffle.
- **My own round-2 live-Postgres suite** (embedded PostgreSQL, DR-121): per-metric ladder persistence
  and the shared-ordinal-1 property that migration 0027 enables; the B3 conflict scenario checked four
  ways (no false positive, typed refusal, atomic rollback, correct value after a version bump); a
  constructed **rank-level** conflict proving `EVALUATOR_RANK_DERIVATION_CONFLICT` is reachable rather
  than dead code; and v1-vs-v2 byte-stability with a SQL-side invariant sweep.
- **My own migration-0027 constraint probe**: enumerated `pg_constraint` on live Postgres — `at_seq`
  uniqueness preserved, exactly two metric-aware unique keys, zero surviving non-metric `rank_kind`
  unique keys, and no drift when the migration runs twice.
- Repo-wide greps for selector/derivation call sites, `BOUND`, API keys, and unpinned clocks.

Scratch suites were written under the gitignored `DebateAI-V3/coverage/` path and deleted afterwards;
the worktree is clean (`git status` empty, HEAD `6a05f47`). No commits, no pushes, no board mutations,
nothing written outside my two output files in either round.

## Blocker resolution (each verified by my own fixture, not the lane's)

1. **Cross-metric prowess ladder** → fixed. Ranks keyed `(domain, step, metric)`; `metricPriority`
   deleted; `metric` persisted via 0027. Two models now legitimately hold ordinal 1 in one
   `(rank_kind, domain, step, as_of, version)` group — impossible under the old unique key. The judge
   composite self-declares as `bias.composite-rank.v1`.
2. **Automatic consensus discount** → fixed. My two-unsettled-0.99-vs-one-0.4 fixture now puts the
   consensus evidence at the head of its own ladder with n=2 instead of discarding it.
3. **Silent stale re-derivation** → fixed. Hash-aware upsert: unchanged re-run still `0/0` with no
   throw; changed inputs raise `EVALUATOR_PROFILE_DERIVATION_CONFLICT`; the refusal rolls back
   atomically (rows byte-identical, count unchanged); a version bump yields the corrected `0.75 / n=2`.
   The rank guard raises `EVALUATOR_RANK_DERIVATION_CONFLICT` on a displaced ordinal.
4. **Wrong-range bias intervals** → fixed. Radius scaled by the support width; hand-computed n=10
   leniency 0.8 gives lower bound −0.0589388, matching to 6 dp, and my test explicitly excludes the
   old +0.3705312.

## Beyond the blockers

The rework repaired a defect neither review had named: the round-1 leniency formula ("grade vs panel
median on the same item") is structurally vacuous against the production runner, which records one
reduced judgement per node attributed to the node's author artifact
(`apps/runner/src/index.ts:1496`) — so a per-item panel always has exactly one grade. I confirmed this
in the runner and judgement packages before accepting the run-level replacement, and hand-verified the
new formula on a 3-identity / 2-run fixture. The lane's new integration suite also builds fixtures
through the real harvest repository, which is the right standard.

## Carried findings (documentation / disclosure / bind-readiness; none blocking)

Sparse contradiction coverage from the new identity linkage (and that rule is missing from the
disclosed `formula:` string); review-only identities landing on `step='JUDGING'`; the composite rank
placing two absence-of-evidence states at opposite ends of the ladder; metric names and
`PROFILE_DERIVATION_VERSION` unchanged despite redefined formulas; no runbook for recovering from a
derivation conflict; `itemKey` now dead; a non-deterministic `LIMIT 1` in the rank conflict lookup;
Architecture §3.5 DDL/metric-name drift; and the selector-unbound test covering `apps/**` but not
`packages/**`. Full detail in `PROG-07-opus2-review-2.md` §4.
