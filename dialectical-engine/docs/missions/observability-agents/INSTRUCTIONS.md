# observability-agents — mission compass

## S1 — Mission and Done

**Mission (V):** deliver a FixAgent that traces product errors to roots and proposes fixes, an ObservationAgent that tells V whether the product and its infrastructure work, and a SupportAgent that gives grounded help and escalates to V. Exclude the security-zone WIP and keep V in charge of every consequential action.

**Done (V):** all three products are standalone in C3's sense—separately deployable, startable and killable processes with their own switches—phase 1 remains approval-first, and each slice is Done only when V personally runs its acceptance and gives the veto. Green worker tests are milestones, never V acceptance. High-risk work always escalates to V.

## Slices — one line each

| Code | Name | What V will see first |
|---|---|---|
| [FIX-01](slices/FIX-01/) | First row — scheduler surface | A bad-DB liveness sweep exits 1; PSQL shows one safe row. |
| [FIX-02](slices/FIX-02/) | Root survives the wrapper | Cause-chain codes and `TypedDomainError.cause` preserve the root. |
| [FIX-03](slices/FIX-03/) | Runner job surface + real ids | A failed runner row joins real run/work-item ids and rethrows. |
| [FIX-04](slices/FIX-04/) | API request surface | A real 500 returns a correlation id that resolves to one row. |
| [FIX-05](slices/FIX-05/) | Provider call surface | One exhausted call yields exactly one registered provider row. |
| [FIX-06](slices/FIX-06/) | Browser client surface | Enum-only reports accept, unknowns reject, and floods count gaps. |
| [FIX-07](slices/FIX-07/) | Blind-period visibility + capture OFF | One query distinguishes QUIET/OFF/BLIND and counts disabled capture. |
| [FIX-08](slices/FIX-08/) | Secrets absent + nine chaos cases | Nine fault drills pass and a printed byte search finds no planted secret. |
| [FIX-09](slices/FIX-09/) | Listener alive | Cursor, fold and restart work while model-call count remains zero. |
| [FIX-10](slices/FIX-10/) | One switch | Kill works with Postgres down and leaves product behavior unchanged. |
| [FIX-11](slices/FIX-11/) | Root traced, ticket filed | One root-bearing ticket appears; recurrence becomes a comment. |
| [FIX-12](slices/FIX-12/) | Diagnosis proposal, notify, approve/deny | A hash-bound proposal notifies V without changing git state. |
| [FIX-13](slices/FIX-13/) | Approval-first fix; it waits | An approved code-root produces RED→GREEN PR evidence and waits for V. |
| [FIX-14](slices/FIX-14/) | QUICK arm behind V's switch | OFF waits; V's flip permits a bounded UNVALIDATED change and proved revert. |
| [FIX-15](slices/FIX-15/) | Hatchet failed-run ingest | A killed runner produces a structured Hatchet row without log text. |
| [FIX-16](slices/FIX-16/) | CI inventory gate + D6 check | Baseline passes; scratch bare-catch and zone-import defects fail by location. |
| [OBS-01](slices/OBS-01/) | Agent skeleton, infra liveness, notification, kill/mute | Hatchet stop opens a banner within 15 s; restart clears it. |
| [OBS-02](slices/OBS-02/) | Product liveness, restart witnesses, expected set | Killing the UI child opens one stack-root banner; restart clears it. |
| [OBS-03](slices/OBS-03/) | Stall, queue, progress detectors + FixAgent view | Isolated fixtures expose four SEVERE defect-view rows with suppression. |
| [OBS-04](slices/OBS-04/) | Capture health, blind periods, spool | Status says NOT WIRED; an isolated typed gap opens and clears. |
| [OBS-05](slices/OBS-05/) | Postgres, host and certificate capacity | Measured capacity crosses a lowered band and clears with exact units. |
| [OBS-06](slices/OBS-06/) | Throughput, provider health, Hatchet metrics | Counts move, unknown latency stays honest, and queue bands fire. |
| [OBS-07](slices/OBS-07/) | Channels, status page, routing, storm control | One fault reaches captured channels and five signals prove storm control. |
| [SUP-01](slices/SUP-01/) | Grounded help on `/help` | Anonymous help is sourced; zone and injection requests are refused. |
| [SUP-02](slices/SUP-02/) | Escalation to V: case, inbox, replies | A human request creates a case; V's reply returns to `/help`. |
| [SUP-03](slices/SUP-03/) | Own-debate context with consent | Consent reveals owned metadata only; foreign ids receive the same refusal. |
| [SUP-04](slices/SUP-04/) | Widget on product routes, absent from zone | Help appears on four product routes, never on zone routes. |
| [SUP-05](slices/SUP-05/) | V-published known incidents | Exact bilingual incident copy publishes; resolve restores honest NO_INCIDENT. |
| [SUP-06](slices/SUP-06/) | Abuse controls, caps, queue, degraded mode | Lowered limits yield queue/429; relay failure degrades within 1 s. |
| [SUP-07](slices/SUP-07/) | Crypto-shredding and retention | Shred leaves rows unreadable and audited; retention remains V-gated. |

## Active roster and review route

- Requirements and code workers: **GPT-5.6-sol**. Reviewers: **Grok 4.6**. Architecture: controller-assigned by its packet. QA: **V personally**. This route governs new work; historical author/reviewer identity is not rewritten.

## Table of contents — pointers only

| Material | Pointer |
|---|---|
| Intake, verbatim goal and historical state | `docs/missions/observability-agents/00-intake-H0.md` |
| V decision packet | `docs/missions/observability-agents/V-DECISIONS-PACKET.md` |
| Fix requirement / compass block | `docs/missions/observability-agents/requirements/fixagent.md` · `docs/missions/observability-agents/requirements/fixagent-compass-block.md` |
| Observation requirement / compass block | `docs/missions/observability-agents/requirements/observationagent.md` · `docs/missions/observability-agents/requirements/observationagent-compass-block.md` |
| Support requirement / compass block | `docs/missions/observability-agents/requirements/supportagent.md` · `docs/missions/observability-agents/requirements/supportagent-compass-block.md` |
| Cross-product decisions and full S3 board shape | `docs/missions/observability-agents/requirements/cross-product-contradictions.md` |
| All slice artifacts | `docs/missions/observability-agents/slices/` (each directory is linked by code above) |
| Planning packets / agent reports | `.hermes/planning/observability-agents/packets/` · `.hermes/reports/observability-agents/agent-reports/` |
| Reviews / architecture outputs | `docs/missions/observability-agents/reviews/` · `docs/missions/observability-agents/architecture/` |
| Heartbeat spine | `docs/agent-protocols/debateai-heartbeat-protocol.md` |
| Requirements / architecture / reviewer contracts | `.claude/skills/heartbeat-requirements/SKILL.md` · `.claude/skills/heartbeat-architecture/SKILL.md` · `.claude/skills/heartbeat-reviewer/SKILL.md` |
| Predecessor mission | `docs/missions/2026-08-21-observability-loop/` |
| V-runnable predecessor demo log | `docs/missions/observability-agents/logs/d12-demo-2026-09-01.log` |

## Standing laws — names and pointers

Approval-first phase 1 · three independently controlled products · immutable high-risk escalation floor · excluded security zone · DR-179 no-API-keys hold · DR-188 data preservation · privacy posture · defensive-only · vertical-slice law · QA=V · no self-review · finding-is-a-finding · board-is-state · verbatim evidence · UNVERIFIED respected · no push/merge/Done by workers · rework cap 3. Full text: `docs/agent-protocols/debateai-heartbeat-protocol.md` and `.hermes/planning/observability-agents/packets/COMMON.md`.
