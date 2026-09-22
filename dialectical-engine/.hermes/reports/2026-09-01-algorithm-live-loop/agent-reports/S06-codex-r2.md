CODEX REVIEW S06 r2 — CHANGES · comments read through: s06-r2-2026-09-02

VERDICT: REWORK — 1 blocking and 3 non-blocking findings. This opens worker rework round 2 of 3; it does not require a V DECISIONS PACKET row.

The r2 changes close r1 B1 and B3 and r1 N1-N2. R1 B2 is not closed: the migrated HYG consumer now queries real strengths, but its fixture makes the two root strengths equal, so the oracle cannot distinguish the retired provider-order selector and the remaining maker-name assertion is nondeterministic under the lawful UUID tiebreak. R1 N3's replacement transcript is also inadmissible under D24 ADDENDUM-2. Every N-finding below requires its named ticket and fix; none is a residual.

## Findings

### B1 — The HYG “strengths-not-order” oracle is non-discriminating and leaves the test flaky

File: `dialectical-engine/tests/integration/database.test.ts:1926-1937,2052-2084`.

Concrete failure case: this fixture gives every authored node the default `judgementDouble` input (`steelman_fidelity = 0.72`), gives every panel assessment fidelity 0, and leaves every edge bearing `cannot-assess`. `packages/propagation/src/index.ts:374-420` ignores `UNKNOWN` arrows, so the symmetric roots retain equal propagated strengths. `GraphWriter.addNode` assigns each root a random UUID (`packages/graph/src/index.ts:277-299`). Therefore:

- mutate selection back to “first configured provider”: the first root still satisfies every assertion at `database.test.ts:2067-2082`, because it is tied for maximum strength. The required oracle does not refute provider order.
- keep the correct selector and draw a secondary-root UUID that sorts before the primary-root UUID: the correct lexicographic tiebreak serves the secondary root, the record names the primary maker as unserved, and `database.test.ts:2084` wrongly requires the reason to contain `Secondary test maker`.

The three recorded C3 greens do not settle this: they are compatible with three runs in which the primary UUID happened to sort first. The already-existing strict-strength fixture at `database.test.ts:4042-4099` shows the needed shape: assert `strongest.strength > runnerUpStrength`, then assert the HYG record subject is that strict winner without assuming a configured maker loses.

Required fix: make the HYG fixture's root strengths strictly unequal (with the first configured root weaker), assert the strict inequality before the winner assertion, and derive any unserved-maker expectation from the selected root. Add a mutation that changes only the winner choice back to provider order while leaving the live rule literal intact; it must fail this HYG consumer.

Ticket: `F-S06-r2-B1` — blocking, S06 rework round 2/3.

### N1 — The root typecheck and three-run C3 record predate the final type-fix commit

Files: `agent-reports/s06-selection-label.md:464-466,520-545`; `logs/s06/r2/root-typecheck-r2.log:1-3`; `logs/s06/r2/cluster-three-runs-r2.log:1-38`.

The filed compiler record says verbatim:

```text
# root typecheck at r2 TIP 34de9dc8 · 2026-09-02 09:29:30 EEST
$ npx tsc --noEmit -p tsconfig.json
root typecheck exit=0
```

Final tip is `a10c22546987b549b11c2cfdb3c275d07a56858d`. That later commit changes the production projection type from `ServedRootRule` to `ServedRootRuleHistory` and adds the integration compile-level assignment that the report cites as B3's GREEN. All three-run clusters likewise identify `34de9dc8`; only the final zone identifies `a10c2254`, and that zone excludes the integration test containing the new compile pin. Thus the report's “Suites at r2 tip” and root `TIP exit 0` claims are not supported by a final-tip compiler run, and C3's 9/9 ×3 is not a three-run record of the final test.

Required fix: at the committed rework tip, re-run the root typecheck and C3 three times after B1 is corrected; file the actual tip in each record. D14/D16 need not be repeated unless the next diff touches a triggering type producer.

Ticket: `F-S06-r2-N1` — non-blocking evidence correction, mandatory this round.

### N2-PACKET — `M4-omitted` is not D24 ADDENDUM-2-admissible

Files: `logs/s06/refutation-d24.log:807-848`; `agent-reports/s06-selection-label.md:509-518`; orchestrator packet `packets/s06-codex-r2.md:47-52`.

The transcript's own required porcelain field is verbatim:

```text
--- porcelain (must be empty) ---
 M dialectical-engine/acceptance/README.md
 M dialectical-engine/tests/integration/database.test.ts
```

D24 ADDENDUM-2 requires every mutation campaign to begin at a committed, clean tip and the harness to abort before applying when porcelain is non-empty. The later `GUARD-DEMO-2` correctly records `harness exit=3`, but it cannot retroactively legalize this earlier dirty-tree block. Consequently r1 N3 remains unclosed. This is also an orchestrator packet defect: `s06-codex-r2.md:47-48` tells the reviewer that this exact transcript is “complete in D24 shape” while the same packet invokes ADDENDUM-2 at lines 51-52.

Required fix: re-run `M4-omitted` from the committed rework tip under the exit-3 guard, with pre=0, applied>0, restored=0, mutation diff, result, restore command, matching hashes, and empty porcelain. Packet lint must reject a D24 block whose “must be empty” section is not empty.

Ticket: `F-PACKET-S06-r2-N2` — non-blocking evidence and packet correction, routed to the orchestrator.

### N3 — The migration test still states the opposite of J17 and does not pin `VALIDATED`

File: `dialectical-engine/tests/architecture/t10-first-configured-provider-removed.test.ts:7-12,144-154`.

The test says deletion means the database no longer accepts the retired value, names its last case “stops the database accepting the retired rule,” and comments that only the new rule remains writable. J17 and migration 0055 require the opposite: the CHECK accepts the two-member history so catch-up can persist a preserved retired rule. The purported validation assertion is also layout-sensitive: `retirement!.text.toUpperCase().not.toContain("NOT VALID")` passes if the clause is formatted as `NOT\nVALID`, and the DB-backed B3-a arm only tests new inserts, which an unvalidated CHECK also constrains. No assertion reads `pg_constraint.convalidated`.

Current SQL is statically correct: it adds the two-member CHECK without a `NOT VALID` clause. The defect is the contradictory test contract and a non-discriminating validation pin.

Required fix: rewrite the test prose to say the database admits declared history while fresh application writes remain live-only, and pin `pg_constraint.convalidated = true` in the existing DB-backed B3 coverage (or use an equivalently layout-independent DDL assertion).

Ticket: `F-S06-r2-N3` — non-blocking test/documentation correction, mandatory this round.

## Static verification record

- Packet, reviewer contract, heartbeat protocol, J12/J16/J17/D24/D24 ADDENDUM-2/D25, r1 verdict, rework packet, ticket, SPEC, r2 report/self-report, changed source, and named logs were read. Both packet output paths resolve and are inside the allowed writable list.
- Read-only metadata matched: `HEAD = a10c22546987b549b11c2cfdb3c275d07a56858d`; base resolves to `7433be75ef2da9ccca452c067fdac4cded07dece`; seven commits; clean porcelain; `25 files changed, 2165 insertions(+), 65 deletions(-)`; zero mode-change summaries. The report's content hash recomputed to `63faa56adf912d4082e78032dd401eaeb6f7646f0da5357d7d6ba15c0de3f7f0`.
- R1 B1 is closed statically: `readDevelopmentRunnerPolicy` calls T16's `readVerdictLabelControls`, pins the development-deployment provenance prefix, returns the family, `main.ts` passes it, and the mandatory-entry-point list names it. The guard at `apps/runner/src/index.ts:1539-1551` precedes `claimNext`/`claimById` and therefore every provider call. The recorded RED says `expected 1 to be +0`; GREEN records `Tests 3 passed | 65 skipped (68)`.
- R1 B3 is closed under J17: kernel declares a live rule plus one retired history member; the contract is a nullable two-member enum; fresh and preserved write shapes are distinct; catch-up uses the preserved shape; `persist` refuses a retired value when `supersedes` is absent. Migration 0018's valid CHECK allowed only null or `first-configured-provider`, so no lawful existing row can contain a third value when 0055 validates the two-member history.
- My product-source search found no pre-existing read consumer that branches on `served_root_rule`; the only current discriminator is J17's new fresh-write guard. Both public API routes still parse through `AnswerSchema`.
- N1 acceptance evidence is adequate for the edited acceptance files: `acceptance/tsconfig.json` includes `./**/*.ts`; BASE and TIP logs contain the same sole TS2741 at `acceptance/adversarial-corpus.test.ts(238,24)` and `acceptance typecheck exit=1`. F-S06-6 is already routed. N2 README now describes strength selection and historical values.
- Recorded cluster counts are exactly C1 15/15 ×3, C2 24/24 ×3, C3 9/9 ×3, C4 5/5 ×3, but at `34de9dc8` as N1 records. The final-tip zone records `Test Files 11 failed | 160 passed (171)` and `Tests 13 failed | 1363 passed (1376)`; its 13 failure names are byte-equal to the 13-name BASE set. The BASE and r2 D14/D16 error payloads are byte-identical after removing the TIP header.
- The `panelPolicy` production-entry-point gap is confirmed: neither `main.ts` nor `dev-runner-policy.ts` names it, while the multi-maker claim guard requires it. It is already ticketed as F33 for T3C and is not double-counted among this verdict's four findings.
- I did not run tests, builds, installs, providers, or any mutating Git command. I did not independently verify runtime behavior, suite stability, or PostgreSQL execution; all runtime counts above are author-produced records. I did not assess the full suite because the packet forbids it and assigns the binding suite to the judge stage.

## PREDICTIONS

Another lens is likely to accept B2 because the query reads the real strength table and three C3 runs are green; I predict it will not trace the fixture far enough to notice that both roots are tied and the surviving `Secondary test maker` assertion depends on random UUID ordering. A log-focused lens is likely to catch the stale `34de9dc8` typecheck but miss that `M4-omitted` itself prints two dirty paths because the later exit-3 demo looks like global compliance. I would check first for a provider-order-only mutant against the HYG case, then force the secondary root's node id to sort first, and finally query `pg_constraint.convalidated` after 0055.
