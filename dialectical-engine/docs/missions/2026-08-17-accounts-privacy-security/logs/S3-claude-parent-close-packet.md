# S3 parent closure — Claude Opus board-custody packet

## Authority

V ordered Hermes agents/models retired from this mission and transferred their
remaining custody work to visible Claude Opus seats. Codex-Router has obtained a
fresh GPT-5.6 Sol xHigh parent-close audit with the decisive verdict
`APPROVE CLOSE`. You are the independent board-custody seat. You may read and
mutate only the local `accounts-phase1` Kanban state described below. Do not edit
product code or tests, do not stage or commit, and do not push.

`~/.local/bin/hermes kanban` is permitted only as the local board client. Never
launch or resume a Hermes, Fable, or Grok agent/model. Grok is decommissioned for
the remainder of this mission.

## Target

- Board: `accounts-phase1`
- Parent: `t_3c875ffb` — S3 registration, verification, pseudonym, DEK creation
- Expected entry status: `running`
- Expected repository: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
- Expected branch / HEAD: `dev` / `694b8c06d7194ef5f3c3da5dee745beae847e605`
- Expected staged path count: zero

## Required read-only preflight

1. Read this packet in full and refresh the parent plus each listed card.
2. Verify every split child is `done`:
   - S3a `t_7fb9880c`
   - S3b `t_3f2a4c64`
   - S3c `t_86938dd1`
   - S3d `t_cc197ed2`
3. Verify T9 `t_6ff49601` is `done`.
4. Verify the commit ancestry on `dev`:
   - S3a checkpoint `6e58adc`
   - S3b `cff3dd5`
   - S3c `b2324d6`
   - S3d `dc9fd57f6adc10f24907f64f795951cbc2cee28a`
   - T9 `694b8c06d7194ef5f3c3da5dee745beae847e605`
5. Read the closing evidence named in the child cards, plus:
   - `logs/S3-packet.md`
   - `logs/T9-progress.log`
   - `logs/T9-router-full-suite-attempt2.status`
   - `logs/T9-final-repeat-{1,2,3}.status`
   - `agent-reports/codex-sol-S3-parent-closure-audit.md` if present
6. Confirm the current index is empty. The shared worktree has many unrelated
   pre-existing changes; do not touch them and do not require a clean worktree.

## Closure basis

The original S3 contract was re-cut by VR-9. S3a-S3d are all Done. The only
unsuperseded parent acceptance failure after S3d was the resend deadlock/status
enumeration channel, and T9 closes it on the exact current candidate:

- existing/missing resend arms: 32/32 HTTP 202 with byte-identical public bodies;
- zero `40P01`, deadlocks, rejected promises, or untyped 500s;
- null-calibrated timing gates pass;
- three consecutive final focused batteries: 11/11, exit 0, no unhandled errors;
- final full suite: 110/110 files, 831/831 tests, exit 0;
- final T9 code and test reviews approved;
- fresh Sol xHigh S3 parent audit: `APPROVE CLOSE`.

The future concurrent account-deletion `u -> c` cascade versus auth `c -> u`
lock edge is durably carried into S10 `t_8664dd93`; it is not an S3 acceptance
condition. Preserve accepted V rulings 1A, 2A (healthy reference capacity may
stop around 103 for now), 3A-prime (45 ms at N*=2 for now), and 4A.

## Authorized board transition

If and only if every preflight condition holds:

1. Post one concise comment as `Claude-Opus` stating `S3 PARENT CUSTODY
   APPROVED`, the exact HEAD, empty index, the five Done cards, T9 final gate
   totals, Sol xHigh approval, no-push, and the S10 carried prerequisite.
2. Mark only `t_3c875ffb` complete with a result/summary that says the VR-9
   split and T9 are closed and lists the local commit chain above.
3. Read back `t_3c875ffb` and confirm `status: done`.
4. Read the board and report which direct children were promoted to `ready`.
5. Write a 10-20 line self-report to
   `agent-reports/claude-opus-S3-parent-close.md` and return exactly
   `CLAUDE OPUS S3 PARENT CLOSED`.

If any expected condition differs, do not complete anything. Post no misleading
receipt; return `CLAUDE OPUS S3 PARENT CLOSE BLOCKED` with the exact mismatch.

