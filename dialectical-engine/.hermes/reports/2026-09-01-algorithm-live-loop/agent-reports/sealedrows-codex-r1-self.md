# SEALEDROWS CODEX r1 — reviewer self-case

## Outcome

`CHANGES`, high confidence. The current feature behavior is substantially improved—the evaluator-only hash is correct on today's source, the m3 replacement expresses the property for both deployments, and the empty-basis band check is real—but the handoff still contains two product blockers, one inadmissible evidence claim, and three unadmitted packet defects.

## Causes, not symptoms

1. **The locator trades prompt wording for global source order.** Deriving criterion names from the parser is the right direction, but `String.match` is not anchored to the evaluator schema. That permits a successful wrong binding, which is worse than an obvious syntax-refactor refusal.
2. **The type/schema boundary confuses defense in depth with admission policy.** `deriveBandCeiling` should still refuse a missing floor, but that is no reason for the active strict schema to accept a row missing its new sealed member. Test-fixture writability leaked into product semantics.
3. **Runtime evidence was summarized rather than generated.** The m3 predicate can be proven discriminating statically, but the claimed mutation history has none of the D24/D42 custody fields.
4. **The packet inherited worker-state assertions without recomputing them.** That produced the 221/527 discrepancy, an unprovable byte-identity claim, and a class-repair task whose narrowed write set was only half authorized.

## Cost and round price

| item | likely repair cost | likely round price |
|---|---:|---:|
| B1 evaluator-schema anchoring + adversarial test | 1–2 hours | one focused rework round |
| B2 required member + current/historical fixture treatment | 2–4 hours; longer only if a version adapter is required | one focused rework round, possibly shared with F-T17-T9 |
| E1 generated mutation transcripts | 30–90 minutes of serial campaign time | evidence repair, no product round |
| P1/P2 handoff evidence correction | under 30 minutes if precommit evidence still exists; P2 otherwise remains explicitly unverified | packet correction |
| P3 contract correction | under 15 minutes to defer or widen, execution belongs with F-T17-T9 | orchestrator correction |

## What I nearly got wrong

- I nearly accepted the locator as merely “differently syntax-fragile.” The decisive counterexample was an unrelated earlier `criteria` schema plus its own prompt: the implementation returned that prompt with exit 0. The issue is silent misbinding, not cosmetic regex brittleness.
- I nearly let the worker's clean three-run arithmetic substitute for reading every artifact. Opening all four completed cluster logs confirmed the count and exact 13-name set; inspecting the logs directory separately exposed the absence of mutation transcripts.
- I nearly treated the exploratory fresh full-cluster run as corroboration after it reproduced the 13 names. Two later provider-server timeouts made it a different, incomplete run. I stopped it, named both extra failures, and did not manufacture a passed/total from partial output.
- I considered the read-only T17 fixture a practical reason for optionality. Following the ownership boundary showed the opposite: it is evidence that the packet needed wider authority or a historical adapter, not evidence that the active product schema should weaken.

## Checks that changed the verdict

- Synthetic locator source with an earlier unrelated schema: wrong prompt returned successfully → B1.
- Real acceptance rows with `emptyBasisFloor` removed: strict parser accepted them → B2.
- `rg --files --hidden --no-ignore logs/sealedrows`: complete gate set and probes, no mutation transcript → E1.
- `git diff --stat base..worker-tip`: 527 insertions, not 221; the two new files explain all 306 missing lines → P1.
- Artifact inventory: no precommit worker content digest → P2.
- Candidate/contract intersection for F-SEALEDROWS-B: four real occurrences, two writable and two outside/read-only → P3.

## Dead ends avoided

- I did not demand that a criterion addition or rename leave the hash unchanged. If the prompt follows the parser, evaluator contract text has changed and its hash should move; if the prompt does not follow, refusal is correct.
- I did not condemn the new band check as redundant. Named selection removes the old equality guarantee, so comparing the named entry's band to the floor is now a real falsifiable check.
- I did not rerun m3 by hand-editing committed reviewed source. Without the D42 driver/transcript that would create another testimony-grade result, not repair the evidence gap.
- I did not attribute the fresh provider timeouts to this lane. The run was incomplete and diverged only after the provider test server stopped.

## Residual uncertainty

No live database-backed acceptance chain or production empty-basis event was observed. No earlier sealed database was compared. The worker-to-commit byte identity cannot be reconstructed from the retained artifacts. The full fresh static cluster, integration suite, and full `pnpm test` remain unverified; the completed retained clusters and the focused 50/50 run are reported separately in the verdict.
