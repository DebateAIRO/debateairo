# SEALEDROWS — third and final V-authorized post-cap round (codex r6 B1 + B2)

## Could anything not be completed? NO

Both blockers closed, F1 repaired with D24 custody, F3 corrected.
**Test-only: one file, +35 −16, zero production files — verified by name filter before commit.**

Lane `lane/sealedrows`. Opened at `8a08f5e1`, **committed to `a694843995e2f538d067de2ca1f2e1c728abfcc5`**.
Not pushed, not merged, not marked Done. Porcelain clean. **Cap unchanged at 3 of 3; this is V's
third and last exception, and the lane stops here whatever r7 says.**

## B1 · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: CLOSED at the sealed cardinality. CONFIDENCE: high** — the second-repair-only mutant,
codex's own counterexample, dies at `attempt 2` under `mutate.sh` custody.

Both deployments seal `CONFORMANCE.maxAttempts: 3` — verified at
`acceptance/seed-register.ts` (`acceptanceOrganCostBounds`) and
`apps/runner/src/dev-deployment-register.ts` (`DEVELOPMENT_ORGAN_COST_BOUNDS`). Production
therefore permits **two** repairs, the second being the callback applied to an already-repaired
packet. My fixture capped it at 2, so that second callback and the third wire attempt did not
exist, and a helper that preserved the contract on its first call but not its second passed.

**Now: the shipped bound of 3, a fixture scripting invalid → invalid → valid, three evaluator wire
bodies required, and the leading-contract assertion applied to all three.**

## B2 · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: CLOSED — both shape pins deleted. CONFIDENCE: high.**

You were right and AMENDMENT 6 had already said it: the `+1 message` delta asserted the current
helper's *implementation*, not the invariant. A repair appending two context messages, or
reordering later ones, keeps the contract leading and would still have failed. It was also
redundant — `toHaveLength(N)` already prevents a vacuous pass. **Deleted.**

The first-user-message assumption is gone too: the evaluator envelope is found by scanning **all**
user messages for the serialised `role: "EVALUATOR"`, so a repair message placed before the
envelope cannot drop an attempt out of the selection.

**What remains is exactly the durable invariant and nothing else**: on every retained attempt, the
first message's `role` is `system` and its `content` equals the exported contract. The attempt
count is the only vacuity guard, and it is sufficient — a run that stopped early cannot satisfy it.

## F1 · the mutant record is now admissible

You are right that I repaired this class in r3 and did not carry it to the next test I wrote. The
r7 log invoked an unretained `/tmp` script and reported summaries — D24 testimony. **Re-captured
through `tools/mutate.sh`**, and the three mutants land on three different attempt indices, which
is itself the coverage-cardinality proof B1 asked for:

```
r8-mut-m1-initial-packet.log        1  0/1/0  ASSERTION  → attempt 0: expected 'An unrelated initial contract.' …
r8-mut-m2-every-repair.log          1  0/1/0  ASSERTION  → attempt 1: expected 'A repair contract.' …
r8-mut-m3-second-repair-only.log    1  0/1/0  ASSERTION  (see note)
TALLY: transcripts=3  killed=3  survived=0  invalid=0  not-run=0
CLEAN: every transcript well-formed, every outcome matches the manifest      [generator exit 0]
```

Every transcript carries the applied mutation, `0/1/0` custody gates, `HASHES MATCH`, the restore
command and clean porcelain.

**One cosmetic caveat, stated so nobody misreads the index:** m3's "FIRST FAILING FRAME" column
shows the mutation source rather than the assertion, because the injected closure contains `=>`
and matches the tool's frame regex first. The real frame is in the transcript:
`AssertionError: attempt 2: expected 'A second-repair contract.' to be 'Return only JSON {satisfied,objection…`.
Not worth a tool change in a round that is meant to stop.

## F3 · corrected

AMENDMENT 6 is dated **2026-09-05**; my previous report said 2026-09-04. Corrected in the markers
below. The r5 reviewer cursor stays **2026-09-04**, which is its own correct date.

## F2 · not mine this round, but I will not restate the claim as fact

Per your instruction I have not touched F22 or D.2. For my own record: the `5/5 solo` figure in my
previous report has **no retained artifact** — it was run in-session and not captured. I am marking
it **unverified testimony** here rather than repeating it as evidence. **The registration timeout
did not recur in any of this round's three runs**, so it has had no second independent observation.

## Suites

**Cluster, three runs, IDENTICAL — and identical to base by hash.**

| run | result | failure-name md5 |
|---|---|---|
| `r8-cluster-static-run1.log` | `Tests 13 failed \| 1529 passed (1542)` | `9c28c8f4a3d1c891…` |
| `r8-cluster-static-run2.log` | `Tests 13 failed \| 1529 passed (1542)` | `9c28c8f4a3d1c891…` |
| `r8-cluster-static-run3.log` | `Tests 13 failed \| 1529 passed (1542)` | `9c28c8f4a3d1c891…` |
| **worst run — the verdict** | **`13 failed \| 1529 passed (1542)`** | |
| base-tip baseline (`7dda3cc0`) | `Tests 13 failed \| 1505 passed (1518)` | `9c28c8f4a3d1c891…` |

**NEW failures versus base: ZERO in all three runs. Net +24 tests, all passing.** No variance to
explain this round — the run-1 intermittent of the previous round did not reappear.

**All 13 failures predate me**, name-for-name identical to base: `s04-contract` DR-128 ·
`s10-carrier-erasure-red` tombstones · `s13-contract` memory carriers ·
`s7-authorization-contract` scope carriers · `scaffold` purity gates · `scaffold` 28
dependency-edge rows · `load01-run-projection` owning asker · `obs-l2-s04-zone` ZI-1..ZI-4 ·
`obs-l2-s04-zone` 15 falsification mutants · `pro01-runner-tree` defender call ·
`s6-content-encryption` wrapping-key paths · `v2ui-node-runner` HYG-01 manifest ·
`xrev01-node-review` envelope exhausted.

Outside the cluster:

| suite | result |
|---|---|
| `r8-GREEN-database-integration-full.log` | `Tests 1 failed \| 84 passed (85)` — the pre-existing `F-SEALEDROWS-H`, established at the BASE tree two rounds ago |
| `r8-typecheck.log` | `tsc --noEmit` **EXIT 0** |

## Provenance

Precommit manifest over tracked and untracked paths: **1 path, MATCH** against the committed blob.
Whole lane against base: **15 files, +875 −64, 7 commits.**

## Not verified

- **Attempts beyond the third.** The sealed bound is 3 and the fixture now drives all three; a
  fourth is not reachable in production either.
- **`F-SEALEDROWS-H`** — still undiagnosed, pre-existing only.
- **`5/5 solo` for the registration timeout** — unretained testimony, marked as such above.
- **The SYNTHESIZER repair leg** — `F-SEALEDROWS-I`, deliberately untouched; V's authorization was
  evaluator-only and I did not widen it.
- **Full `pnpm test`, other integration files, acceptance DB suites, a deployed register value.**

## PREDICTIONS

1. `F-SEALEDROWS-I` is the same finding on the other leg and will read identically when someone
   takes it: the composer contract, the same repair helper, no wire test.
2. If r7 finds anything further on the evaluator, it will be about a path the sealed bound does not
   permit — and the honest answer will be that production cannot reach it.
3. The registration timeout will need a second sighting before F22 can promote it; it got none here.

## Findings for ticketing

- **F-SEALEDROWS-I** (existing) — SYNTHESIZER repair attempts unenforced. Not re-filed.
- **F-SEALEDROWS-H** (existing) — pre-existing integration failure. Not re-filed.
- **F22** (existing) — registration timeout; no second observation this round. Not re-filed.
- **Non-blocking, new:** `mutant-index.py`'s frame regex prefers the first `=>`-bearing line, so a
  mutant whose injected source contains an arrow shows the mutation instead of the assertion in the
  index. Cosmetic; the transcript is correct.

## Markers

`REWORK READY FOR REVIEW` — codex r6 B1 and B2 closed, F1 re-captured, F3 corrected.
`comments read through`: AMENDMENT 7 and `agent-reports/sealedrows-codex-r6.md`
(`comments read through: sealedrows-postcap2-2026-09-05`); AMENDMENT 6 dated **2026-09-05**; the
r5 reviewer cursor dated 2026-09-04.
**Rework rounds spent: 3 of 3 (cap unchanged). This was V's third and final exception; the lane
stops here.** Not pushed, not merged, not marked Done.
