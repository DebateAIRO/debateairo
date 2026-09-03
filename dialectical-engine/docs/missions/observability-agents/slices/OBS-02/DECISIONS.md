# DECISIONS — OBS-02 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`. Before any seat asks V a question, it checks this file.

- 2026-09-01 | Is every agent action approval-first in phase 1? | Yes — the agent never restarts the dev stack or a container; it names the root and V acts. | Intake C1. | V (goal) / orchestrator (intake C1)
- 2026-09-01 | Standalone? | Own process; product processes are never children of, or waited on by, the agent. | Intake C3. | orchestrator (intake C3)
- 2026-09-01 | Is a stopped dev stack an alarm? | No — `IMPACT_DEV_STACK_NOT_RUNNING` is INFO, once per transition, digest only; an EXIT within 10 min of RUNNING is SEVERE. | A stopped stack is the designed resting state when V is not running it (same lesson as the watchdog's PARKED-vs-HUNG entry in TOOLING-TRAPS). | Requirements (REQ-OBS) — pick
- 2026-09-01 | One alarm or four when the supervisor exits? | One composite `dev_stack` signal; members listed in evidence. | `dev-auth-stack.ts:155-159, 185-204` stops every child when one exits — four banners would hide the root. | Requirements (REQ-OBS) — pick
- 2026-09-01 | How is the runner's presence probed? | `ps -Ao pid,command` text match on `apps/runner/src/main.ts`, never `pgrep -f`. | TOOLING-TRAPS: `pgrep -f` misses long argv; two healthy seats once read as dead. | Requirements (REQ-OBS) — pick
- 2026-09-01 | Does the agent run scheduler jobs? | No — `oactl witness` wraps a job V (or a V-installed launchd plist) runs and records completion; the agent itself never launches a job. | Jobs write product tables; the agent is read-only (Q4 G3); scheduling ownership is V row D10. | Requirements (REQ-OBS) — pick
- 2026-09-01 | Does this slice touch `compose.dev.yaml` to add a healthcheck/restart policy? | No — finding F2 is routed to V; the agent witnesses `restart_policy=no` and says so in the digest line. | `compose.dev.yaml` ownership is contested between missions (`docker-hatchet` Plan §1.3); a requirements seat does not edit config. | Requirements (REQ-OBS)
