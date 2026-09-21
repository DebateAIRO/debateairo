# [claude@opus-5] F-FLAKE-SENDMAIL · registration test's sendmail deadline fails under full-suite load

```yaml
state:
  ticket: F-FLAKE-SENDMAIL
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/unit/registration.test.ts, apps/api/src/mail-channel.ts (deadline only)], readonly: [logs/t1-oracle-loginfp/ (the b14 log and the three isolated runs)], forbidden: all_others, verification: [the test passes under full-suite load three times, or the deadline is made load-independent; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-loginfp-r1-2026-09-05
```

Filed by lane/t1-oracle-loginfp (b14, the one appeared name not in any parent set). `tests/unit/registration.test.ts › S3 rework4 fold-in terminates sendmail options before the recipient` failed once under a full `pnpm test` with `MailDeliveryError: SENDMAIL_TIMEOUT` — a wall-clock deadline on a spawned external process (`apps/api/src/mail-channel.ts:90`). No import path from the test to the lane's changed file; three isolated re-runs on the lane tip pass 58/58. Same class as W5's `model-shim CODEX_CLI_TIMEOUT` flake. **Fix (worker):** make the deadline load-independent (fake clock or a spawned stub that cannot be starved), or mark and quarantine with the reason on the record. Not absorbed into any parent's set.

**Codex oracle r1 Q3 (19:09):** causality was OVERSTATED by the seat — three isolated passes show the test passes alone, not that the suite cannot influence it. The name STAYS in the lane's 79/1/0/1. **Required before choosing a remedy:** a local-process timing investigation with event/timing evidence (the mail channel spawns a local process with a wall-clock deadline; W5's model-shim flake is the same class with a local fake CLI). The oracle seat appends the accurate fixture, timeout, sample trees and a PROVISIONAL classification in round 2; this ticket carries the investigation.

**Related (codex evaluator r0 F1, 21:10):** `registration-database … S3d rework4 labels the shallow register handoff` — a 600 ms timing envelope blown to 4–10 s under a full-suite run, passes alone; host/resource contention consistent-with, exact cause undetermined. Same wall-clock-envelope class as F-REG-DEADLINE-MARGIN; carried here for the timing investigation.
