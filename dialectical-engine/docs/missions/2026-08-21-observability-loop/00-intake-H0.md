# H0 INTAKE — Observability layer + error-listener loop agent

- **Mission slug:** `2026-08-21-observability-loop`
- **Date:** 2026-08-21
- **Orchestrator:** Claude Code (Fable 5) — Claude-Router seat, spine §5.1
- **Spine:** DebateAI Graph Spine v2, version 3.0.0
- **Loops firing:** ALL FOUR, in order. REQUIREMENTS ENGINEERING starts now;
  ARCHITECTURE opens only after V rules on the synthesized requirements;
  PROGRAMMING gates on the planning-graph image + lane-plan approval;
  QA runs per spine.

## V's goal (verbatim, from the /heartbeat-protocol /goal intake)

> Since observability has been dismantled and not taken into account by the
> coding agents when the rework of the algorithm has been created, we need to
> create a new observability layer for this version of the algorithm. Apart
> from the W.I.P security features that are NOT in scope for an observability
> loop, we need to be able to observe every time the system throws an error,
> and if something does not work. Each error must be traceable to the root. We
> will have an agent that sits in a permanent loop and listens for the moment
> errors are thrown (After the implementation of the tables that throw those
> errors). That agent, after listening to the error and traces its root,
> determines the magnitude of the fix. For very quick fixes, no approval will
> be needed of us. Other than very quick and easy fixes that do not compromise
> architecture or tamper with security, the looped agent will be able to
> create its own pull requests with the fixes.
>
> Requirements Engineering fleet : Claude Opus Agents, Grok Agents, Codex Agents
> Architecture: Claude
> Coding: Codex
> QA: Grok and Claude Opus subagents

## Classification (set ONCE at H0 — spine §5.5)

```yaml
risk_tier: high          # immutable high-risk floor fires on THREE categories:
                         #  - persistence/migrations (the error tables are new schema)
                         #  - architecture (new cross-cutting subsystem + a standing autonomous agent)
                         #  - provider spend (a permanently looping LLM agent)
planning_tier: 2         # architecture/high-risk — full chain, no stage collapsed
never_tierable_down: true
reason: >
  The mission creates new Postgres schema, a new cross-cutting observability
  subsystem, and a permanent autonomous agent with self-merge/PR authority over
  the codebase. Each of these alone trips the spine §9 floor. The loop agent's
  authority design additionally borders security governance, which stays
  escalate-only for it.
```

## R7 loop-ownership election (ruling R7 + v3.2.0 amendment 1)

V answered the election inline in the intake /goal — recorded verbatim, no
preset used. Concrete agents resolved against the roster and live probes:

```yaml
loop_ownership:
  requirements: [claude-opus, grok-4.6, codex@gpt-5.6-sol]   # parallel blind seats + separate synthesis
  architecture: [claude]                                      # C2 Plan.md / C4 FinalPlan.md worker instances
  programming:  [codex@gpt-5.6-sol]                           # sole coder, per roster and V's answer
  qa:           [grok-4.6, claude-opus]                       # independent reviewer subagents
```

Seat-law notes (not elected, fixed by ruling R1): Hermes holds Hermes-Verifier
— verification, Kanban board custody/crafting on port 9119, Manual QA. Claude
Code (Fable) holds Claude-Router — routing only, no content judgment, no code.
The 2026-08-20 Codex-Router seat inversion was mission-scoped to
`2026-08-17-accounts-privacy-security` (stopped by V 2026-08-20) and does not
apply here: this /goal came through Claude's One-Prompt Machine with V naming
Claude for orchestrator-side loops explicitly.

Seat shape for REQUIREMENTS: **parallel blind, then synthesis** — the proven
MFA-mission shape (V's R7 answer there). Three seats answer the same brief
independently; divergence is signal; a fourth, separate Opus instance
synthesizes. Recorded as an orchestrator instantiation under V's fleet naming;
V may re-shape at any time.

### Seat roster — verified live at intake, 2026-08-21

| V's name | Concrete agent | Transport | Liveness evidence |
|---|---|---|---|
| Claude Opus Agents | Claude Opus (opus) | SDK subagent (orchestrator-hosted) | orchestrator session live |
| Grok Agents | `grok-4.6` | `~/.grok/bin/grok -p` visible Terminal | probe returned `ALIVE`, exit 0, 2026-08-21 |
| Codex Agents | `codex@gpt-5.6-sol`, `model_reasoning_effort=xhigh` | `codex exec` (v0.147.0-alpha.6.5) visible Terminal | probe returned `XHIGH-OK`, 10,050 tokens, session 01a02366-d57a-7f50-a553-f1c8a6ba25f1 |
| Hermes | `hermes` | `~/.local/bin/hermes` + dashboard | dashboard serving 9119 → HTTP 200 at intake |

## Orchestrator reading of the goal (scope decomposition)

1. **Observability layer** for the current algorithm version: capture every
   thrown error AND "something does not work" (silent failures, hangs, stalls),
   server-side, with every error traceable to its root.
2. **The error store** — "the tables that throw those errors": new Postgres
   tables recording error events. The listener agent activates only AFTER these
   exist (V's explicit sequencing).
3. **The listener loop agent** — permanent loop; listens the moment errors
   land; traces root; classifies fix magnitude:
   - QUICK-FIX: applied autonomously, no human approval (V's grant);
   - PR-FIX: agent opens its own pull request;
   - NEVER: anything compromising architecture or tampering with security.
4. **Excluded zone:** the W.I.P. security features are NOT in scope for the
   observability loop — no instrumentation inside them, no fixes to them.

## Verified current-state facts (intake evidence)

- Only surviving observability code: `apps/ui/lib/observability/` (logger.ts,
  suspiciousScoring.ts) — developer-only redacted JSONL to
  `logs/developer-events.jsonl`; its README forbids DB persistence for those
  diagnostics. The dismantling trail is in
  `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log`
  (`apps/v2-ui/lib/observability/logger*.test.mjs` deleted / `.disabled`).
- No dedicated error tables exist; only `raw_artifact.parse_error`
  (migrations/0004_s04.sql) and `delivery_error`
  (migrations/0031_registration_verification.sql — security zone).
- Excluded W.I.P. security zone: migrations 0030..0033, apps/api/src/registration.ts,
  the accounts-mission S-series surface; S3b/S3c/S3d KNOWN-DEFECTIVE per commit
  6e58adc; mission `2026-08-17-accounts-privacy-security` STOPPED by V
  2026-08-20 with sessions preserved — nothing here may disturb its resume
  points.
- CONCURRENT MISSION THREADS live at intake (recorded 11:26 local, corrects the
  first pgrep sweep which used too narrow a pattern and reported a clean slate):
  (1) `2026-08-21-docker-hatchet` — fired 11:18 by V under the Grok-Router seat
  (contract `.grok/skills/heartbeat-orchestrator/`, V-order 2026-08-20 family);
  its grok+codex REQ seats live since 11:20-11:21. (2) The accounts mission
  S3d final-gate verification (`run-hermes-verifier.sh --run S3d`) live since
  11:20:15. (3) This mission three blind seats, 11:23. Isolation holds: every
  mission writes only its own docs/missions/<slug>/ + reports paths; codebase
  reads are read-only; no heavy builds/tests fired by any REQ seat.
- INTER-MISSION DEPENDENCY (feeds synthesis + V packet): docker-hatchet will
  containerize the app and introduce Hatchet job orchestration. Capture
  points, worker/queue wrappers, log drains, and the listener agent runtime
  placement must be specified against the POST-containerization topology (or
  explicitly against both). Contested-decision row for V at synthesis:
  target topology + sequencing between the two missions.

## Banked constraints carried in

- **DR-179 no-API-keys hold** — CLI-relay is the only lawful model access; the
  listener agent's runtime must comply until V lifts the hold.
- **DR-188 data-preservation law** — no deletion of product data; error-data
  retention must be a lawful V-gated policy.
- **Privacy posture** — private-by-default, crypto-shredding erasure; error
  events must never leak private debate content, secrets, tokens, private
  prompts, or raw provider payloads (spine §11.1).
- **Defensive-only** (V's standing security posture, 2026-08-17).
- **No pushes without V approval** binds every MISSION worker. The loop
  agent's QUICK-FIX/PR authority is a PRODUCT capability V grants by this
  goal; its exact lawful mechanics are a REQUIREMENTS deliverable (brief
  RQ-D5/E2), and its always-escalate set is bounded below by the spine §9
  high-risk floor.
- Naming: the product is `dialectical-engine`; say "current algorithm
  version" (no V2/V3 naming).

## Deliverable of the REQUIREMENTS loop

Three independent blind research artifacts (`research/{opus,grok,codex}-requirements.md`)
+ one synthesized requirements spec with ranked recommendations and a
contested-decisions table, presented to V. **No architecture, no code in this
loop.** V's ruling on the contested decisions opens ARCHITECTURE (Claude C2).

## Stop conditions for the REQUIREMENTS loop

- Any seat writing code, schemas, migrations, or configuration → stop.
- Any seat touching the excluded security zone beyond boundary mapping → stop.
- Any offensive/pen-testing activity → stop (V posture).
- A product decision only V can make → collected under RQ-E, never asked
  directly; V receives them as one packet with the synthesis.
- Fabricated citations/behaviour → evidence violation (spine §11 law 2, R5).

## Amendments

### A1 — 2026-08-21, V ruling via wayfinder T01 (in-session): Hermes seat struck

V: "Do not use Hermes as it is on Qwen and runs really slowly. I also
specified that Hermes is not part of the fleet for this mission, only the
Hermes Kanban is needed." Mission-scoped consequences:

- **No Hermes agent sessions for this mission.** The seat-roster row for
  Hermes above is void here; the spine's Hermes-Verifier machinery re-lands
  on this mission's elected QA seats (Grok + Claude Opus subagents) for
  verification, with Claude-Router still holding routing only (never
  verdicts).
- **The Hermes KANBAN STORE stays** as the board surface (port 9119), operated
  via the `hermes kanban` CLI as store operations — no Qwen inference, no
  Hermes model session. Wayfinder ticket T05 stands the board up.
- The H1-style integrity gate over the three blind artifacts was re-dispatched
  to a read-only Claude Opus QA reviewer; verdict lands at
  `reviews/H1-integrity-qa.md` (the wedged Hermes one-shot was killed and its
  log annotated; sibling missions' sessions untouched).
- V-decision routing continues through the wayfinder map
  (`wayfinder/map.md`) + in-session questions per V's standing order.

### A2 — 2026-08-21, V steer (mid-turn): dual-source listening

V verbatim: "Basically, Hatchet will store some logs and errors yes, but we
need our own observability as well, and an agent that listens to both and
creates pull requests in order to fix them errors." Binding reading: (1)
Hatchet's stored logs/errors are acknowledged as one error source; (2) the
mission still builds OUR OWN observability layer + error tables; (3) the
listener agent listens to BOTH Hatchet's failure surface AND our error store,
and its PR-fix authority covers errors from either source. Cross-source
incident dedup becomes a first-class requirement; residual Hatchet-guarantee
unknowns stay tagged for ARCH.

### A3 — 2026-08-21, V order: Grok decommissioned for this mission

V verbatim: "Grok has been decommissioned for this mission for now as the
limit has been reached. use only the opus reviewers." Mission-scoped roster
edit (R4, V's authority):

```yaml
loop_ownership:            # amended
  requirements: [claude-opus, grok-4.6, codex@gpt-5.6-sol]  # grok's blind seat COMPLETED pre-decommission; artifact stands
  architecture: [claude]
  programming:  [codex@gpt-5.6-sol]
  qa:           [claude-opus]        # was [grok-4.6, claude-opus]
```

Consequences: the plan-review diamond runs as TWO independent Claude Opus
instances with distinct lenses (requirements-fidelity ∥ adversarial
red-team), blind to each other, Router merging disagreements only; the G5
slices stage re-seats from Grok to a third fresh Opus instance; any later
review lens that would have been Grok's is an Opus instance in a fresh
session. Distinct-session independence law unchanged.

### A4 — 2026-08-21, V order: ARCHITECTURE re-seats to Claude Opus; carry on to PROGRAMMING

V verbatim: "Carry on with the architecture loop followed by the programming
loop. Codex Codex, Claude Opus reviews. Architecture done by Claude Opus agents
as well." Mission-scoped roster edit (R4, V's authority):

```yaml
loop_ownership:            # amended (supersedes A3's map)
  requirements: [claude-opus, grok-4.6, codex@gpt-5.6-sol]   # closed; artifacts stand
  architecture: [claude-opus]        # was [claude] (Fable instances)
  programming:  [codex@gpt-5.6-sol]  # sole coder, unchanged
  qa:           [claude-opus]        # unchanged since A3
```

Consequences:
- Every NEW architecture-loop seat is a Claude Opus instance: the H6 ticketizer,
  the H6A independent diff check, and any further ARCH authorship.
- COMPLETED ARCH artifacts stand as authored: C2 `Plan.md` and C4 `FinalPlan.md`
  were written by Fable instances and independently passed (plan-review diamond;
  H4 gate 5/5). A4 is not retroactive and does not invalidate passed work.
- Same-terminal rework law is preserved for work already in flight: the G5
  slicer session continues its own rework rounds. Any NEW stage opens as Opus.
- PROGRAMMING is authorized to follow ARCHITECTURE without a fresh V order,
  subject to the gates that already bind it: the planning-graph IMAGE gate
  (V yes), LANE PLAN APPROVAL, and the ROW-GIT reconciliation commit
  immediately before the first coding lane.
