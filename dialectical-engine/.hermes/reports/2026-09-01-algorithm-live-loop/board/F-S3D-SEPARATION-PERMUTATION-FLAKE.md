# [unassigned] F-S3D-SEPARATION-PERMUTATION-FLAKE · the timing-separation assertions reject about 1 % of the time with no signal present

```yaml
state:
  ticket: F-S3D-SEPARATION-PERMUTATION-FLAKE
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [tests/integration/registration-database.test.ts], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-19 by the orchestrator, from the Node 26 upgrade's gate (D78). **A flake family, not a
regression** — the disposition the V packet's §D reserves for exactly this shape.

**The finding.** `tests/integration/registration-database.test.ts > S3d rework3 B1/B3 probes deep-queue
slack and the following audit window` failed on a quiet host after the upgrade, at
`:2991 expect(assertion.auc).toBeLessThanOrEqual(assertion.aucCeiling)` with
`expected 0.78515625 to be less than or equal to 0.76953125`. It had passed before the upgrade.

**Why it is not the upgrade.** The ceiling is not a constant. It is computed inside the same run:
`empiricalQuantile([...nextExistingNull.auc, ...nextMissingNull.auc], 0.99)` over a null distribution the
test builds by randomly relabeling same-arm samples (`sameArmRelabelingNull`, `:2951-2963`). That makes
each comparison a **permutation test against its own 99th percentile — so it rejects about 1 % of the
time when there is no signal at all**, by construction and by design. The run makes roughly a dozen such
comparisons (`auc` and `classifier`, over several arms), so the probability that at least one lands above
its ceiling in a given full run is of the order of ten percent. Nothing in a runtime or test-runner
upgrade biases a statistic computed from the test's own samples. STRENGTH: entailed (the ceiling's own
expression; the assertion's form).

**Corroboration that the margin is routinely thin.** The pre-upgrade run's own log carries
`auc=0.7266 null_auc_q99=0.7617` — a comparison that passed with 0.035 to spare — beside four others
around 0.51 to 0.68. The post-upgrade quiet run reads 0.5469, **0.7852 (ceiling 0.7695 — the failure)**,
0.5459, 0.5508, 0.5391, 0.6016. The distribution is unchanged; one draw crossed. STRENGTH: entailed
(`closing-runs/` logs of both gates).

**Not to be confused with its neighbour.** The same test's `:2988`
`maximumNonTransportWork ≤ ruledSlackMs` (785.4 against 600) failed only in the CONTENDED run, and the
sibling test `keeps new-vs-existing timing within the ruled tolerance` failed there at
`delta_ms=617.1` and is green on a quiet host at `14.7 / 15.2 / 4.0`. Those two are host contention
against an argon2id hash — a different cause with a different cure (measure four-counts on a quiet
machine), recorded in D78.

**Charge — do NOT raise the ceiling.** The ceiling is the security property: a measured separation above
the null's 99th percentile is what "an observer can distinguish the two arms" means, and loosening it
would retire the test's purpose. Make the decision rule sound instead: repeat the comparison over
independent draws and require rejection in a majority (or apply a multiple-comparison correction across
the dozen assertions the run makes, which is what the 1 % is really being spent on). Then add the family
to the V packet's §D list with this arithmetic, so a future gate reads one of these as a known draw
rather than as a regression.
