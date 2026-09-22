# [unassigned] F22 · registration S3b "separation ceiling" — load-coupled flake (T4 F-T4-8)

Source: T4 r3 classification (agent-reports/t04-wok.md). F13's CLASS (wall-clock/timing
sensitivity under load), different ticket: failed once in T4's r2-tree run, passes in
isolation on both trees. Third named member of the load-flake family (F13 relay-core,
F21 evaluator-DB, F22 registration S3b).
DISPOSITION: V DECISIONS PACKET row at closure with its siblings; never absorbed as a
lane failure. D15 quiet-host suites mitigate.
status: waiting_human (V) · membership extended by b456 solo discrimination (+2 S3d members) · escalation_target: v_packet
MEMBERSHIP EXTENDED (2026-09-02 12:35 EEST): + "S3d rework7 B4 measures healthy-MTA availability" —
failed in the b7 batch and in the 21-file replay on 6118d2d5 at host load 14-18; PASSED in
both solo runs on 362299d1 (logs/tint1-proof/registration-quiet-{1,2}.log; gate waived — the
host's baseline load is OneDrive/Defender daemons, attribution in registration-quiet-GATE.txt).
Load-coupled by the family's own definition; not a regression candidate; no paired base run
needed (the tip passes).
OBSERVATION (run 2, 2026-09-02 11:02-12:14, 72 min for one file at load ~9): five additional
timing-coupled names failed ONCE — S3b live-mail N=1/4/8 (the family's founding member), S3
rework4 B3 cooldown start, S3d D4 cooldown after delivery-receipt, S3d rework4 shallow register
handoff (already a member), T9/S4 channel-lock ordering. None failed in the b8 full suite
(set-equal) or in run 1. Recorded as F22-class observations, NOT admitted as members until each
passes/fails solo on its own name. The 72-minute duration itself is the anomaly to name at
closure (embedded-postgres file under OneDrive I/O contention).

## NEW OBSERVATION 2026-09-05 — lane/sealedrows, second post-cap round, cluster run 1 of 3

```
× tests/unit/registration.test.ts > … > terminates a hung local mail process at the ruled transport timeout
```

Run 1 of 3: `14 failed | 1528 passed`. Runs 2 and 3: `13 failed | 1529 passed`, hashing
identically to base. Solo: **5 of 5 passing.** In NEITHER of T0's authority lists (D.1 stable-red,
D.2 unstable), so newly observed rather than known.

The seat did not smooth it: it reported the worst run as the verdict and classified the cause
**CANNOT-ASSESS**, adopting T0's own ruling for this shape — five solo passes are consistent with
load sensitivity and equally consistent with a rarer defect. Its diff is in a file the cluster
never loads; the seat named that as an argument about reachability, not proof of innocence, and
declined to upgrade it.

**Orchestrator note:** a transport-*timeout* assertion flaking under a three-run cluster on a
loaded machine is the same family as this ticket's S3b. It is NOT added to the D.2 unstable
authority on one observation — the classifier keys on that section (D60) and widening it hides
real failures. If it appears in a second independent cluster run it is promoted; until then it is
recorded here and named in every classification that meets it.

**Codex r6 F2 (2026-09-05):** the disposition above is confirmed — CANNOT-ASSESS, not added to D.2,
promotion on a second independent sighting. **But `5 of 5 solo` has no retained artifact**: no
`r7-*` solo log exists under `logs/sealedrows/`. That fact is therefore **testimony**, and is so
marked here. The observation stands (the cluster log is retained); the solo-pass count does not,
until five scoped solo records are attached.
