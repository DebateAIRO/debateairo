# [claude@opus-5] F-SEALEDROWS-H · a stable-red test in T0's authority has never had a ticket

```yaml
state:
  ticket: F-SEALEDROWS-H
  risk_tier: medium          # the served label is wrong on the lifecycle path the demonstration run will take
  status: waiting_review # DIAGNOSED 2026-09-05 by lane/h-diag: VERDICT STALE TEST for the label, with the deciding measurement from the persisted receipt (both margin AND disagreement ABSENT; SUPPORTED unreachable by construction for a 1-maker/1-judge fixture). Orchestrator verified three claims independently: T11 postdates the T0 baseline, a second assertion at :3990 expects ARCHIVED_REVIVED, liveness unchanged since T0. ROUTED: F-H-1 (test-only label, blocked) and F-H-2 (product-side staleness, the ORIGINAL T0 cause). Review decision: the diagnosis is verified by the F-H-1 fix lane's codex review, which receives h-diag.md as input, rather than by a separate round
  owner: { agent: claude, session: lane-h-diag }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review, D15 batch], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag, branch: lane/h-diag, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-postcap-2026-09-04
```

Surfaced by the lane/sealedrows seat while proving its own change was not the cause of a
failure it ran into. Verbatim:

```
× tests/integration/database.test.ts > apps/runner — legal command lifecycle >
  claims, judges through the HTTP gateway, propagates, serves, and settles
  → CONTESTED + LABEL-BASIS-INCOMPLETE where SUPPORTED is expected
```

**Orchestrator disposition, measured three ways.** The seat established it fails alone, fails
with its own test skipped, and fails at the base tree. I then checked the mission record:
it is `×` in D15 batch b11 at `19bbb4c4`, `×` in b12 at `7dda3cc0`, and it sits in **T0's
stable-red authority at `agent-reports/t00-baseline.md:196` as `X | X | X`** — red in all three
baseline runs. So it is not new, and it is not the lane's.

**What IS new is the gap:** no board ticket names it. Router §2.2 says every finding gets a
ticket; a stable-red test that has lived in the authority since T0 without one is a residual
dropped on the floor, which is exactly the class §2.2 exists to prevent. The seat's "14
pre-existing, not 13" is the honest count for its own cluster; at mission level the honest
statement is "known-red since T0, never diagnosed, never owned."

**Why it is medium and not low:** the test is the *legal command lifecycle* — the path a real
run takes from claim to served answer — and it fails on the served LABEL. `CONTESTED` with
`LABEL-BASIS-INCOMPLETE` where `SUPPORTED` is expected means the label ladder is landing in arm 0
(absent margin or absent dispersion) on a fixture that expects a full basis. That is either a
fixture that no longer seeds enough panel voices, or a real regression in the S06/T11 label
derivation. **It is undiagnosed; this ticket asserts only that it predates the lane.** It should
be diagnosed before the demonstration run, because the run takes this path.

**Retained from the seat:** while establishing the base-tree result it nearly reported a false
one — `git checkout <base> -- <paths>` rejected the whole revert because three lane files are new,
and printed a lane-tree result labelled `AT BASE`. Recorded in `.hermes/TOOLING-TRAPS.md`.

## DIAGNOSIS ROUTED 2026-09-05 — and four orchestrator packet defects admitted

The seat's verdict and two unanticipated findings are carried by `F-H-1` and `F-H-2`. The
"stable-red since T0" framing in this ticket was **true of the name only**: at T0 the binary label
was still in place, so the failure T0 recorded was the staleness one, and the label cause was
stacked on top when T11 landed four days later. One red test, two independent causes, one of them
older than the mission.

**Packet defects, all mine:**
1. I described the 3 provider calls as "one author call plus a two-member panel." They are judge
   + SYNTHESIZER + EVALUATOR — one judge, one voice. Inferred, not read.
2. I wrote the hypothesis as margin OR disagreement absent. Measurement shows BOTH — which closes
   the "rung 0 over-fires" argument completely, a stronger result than I had framed.
3. The contract block quoted RELATIVE paths for the mission directory, which exists only in the
   main checkout. D41(b) already ruled absolute paths. Same habit, third mission-tool packet.
4. §6 of the packet required appending to `TOOLING-TRAPS.md`, which was not in `allowed`. The
   seat correctly did not write it and recorded the trap in its report. **Fourth time in two days
   I have required an outcome the contract could not reach.** Memory `outcome-needs-contract-reach`
   exists; it is not yet a habit.
