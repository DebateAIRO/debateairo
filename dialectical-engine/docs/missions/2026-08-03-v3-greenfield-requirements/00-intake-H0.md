# H0 Intake — V3 Greenfield Core (Requirements Engineering)

> **MISSION CLOSED — REQUIREMENTS SATISFIED (V, 2026-08-05, DR-067).**
> The four-artifact spec pack was accepted at gate 31 and landed as
> DebateAI-V3's founding commit `e32de26`
> (`/Users/vladmihaimiron/Documents/DebateAI-V3`, docs/founding/). Authority
> trail: 67 V rulings in `wayfinder/decisions-ledger.md`. Next: the
> ARCHITECTURE mission, opened by V's word in the new repository.

Mission opened: 2026-08-03
Orchestrator: Claude Code (Fable 5) — Claude-Router seat, per Graph Spine v2 §5.1
Invoked by: V, single mission prompt (One-Prompt Machine, surface 1)

## Mission statement (V's words, condensed)

Final direction ruling: **GREENFIELD** — a new repository will host V3. The V2 UI
is kept. This mission fires ONLY the REQUIREMENTS ENGINEERING loop, using the
wayfinder method (mattpocock-skills) to dig into what to build, how, and why.
Research starts from the two Round-2 reports of mission
`2026-08-02-battery-llm-vs-machine`:

- `../2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md`
- `../2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md`

V mandate: **interrogate V as much as possible at each step.**

## Standing V decisions recorded at intake

- **D-GREENFIELD (2026-08-03):** the V3 core is built in a NEW repository. This
  answers the reports' merged human decision #4 (replace / wrap / repair-in-place):
  none of the three — a new home for the new core. The V2 engine's role as frozen
  control arm is confirmed pending the race-scope grilling question.
- **D-KEEP-V2-UI (2026-08-03):** the V2 UI survives. The exact binding (drop-in
  API compatibility vs adapter vs negotiated contract) is a grilling question.
- **D-METHOD-WAYFINDER (2026-08-03):** requirements are charted as a wayfinder
  map of decision tickets; grilling one question at a time with orchestrator
  recommendations; decisions are V's alone.

## Typed state block

```yaml
state:
  ticket: REQ-V3-GREENFIELD-R1
  risk_tier: low            # docs/requirements round; no code, no product data, no board mutation
  planning_tier: n/a        # REQUIREMENTS loop, pre-planning
  status: working
  owner: { agent: claude-fable-5, session: orchestrator }
  contract:
    allowed: [docs/missions/2026-08-03-v3-greenfield-requirements/**]
    readonly:
      - docs/missions/2026-08-02-battery-llm-vs-machine/reports/*
      - docs/missions/2026-08-02-battery-llm-vs-machine/research/*
      - docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md
      - coordinator/** (read-only evidence for research tickets)
      - UI source (read-only evidence for the boundary-contract research ticket)
    forbidden: all_others
    verification: [map + tickets exist and are wired, handoff markers posted, contract respected]
    human_review: yes       # V is in the loop by design — grilling IS the mission
  authority_epoch: 1
  rework_round: 0
  comments_read_through: intake
```

## Loop-ownership election (ruling R7)

V answered inside the mission prompt — no separate election needed:

```yaml
loop_ownership:
  requirements:
    orchestrator: claude-fable-5          # grilling surface + map custody + routing
    worker_subagents: [opus-5]            # wayfinder research tickets (AFK), via Agent tool
    reviewers: [codex@gpt-5.6-sol, grok@grok-4.5, hermes@gpt-5.6-sol]
  architecture: not-elected-this-mission
  programming: not-elected-this-mission
  qa: not-elected-this-mission
```

Provider spend: authorized by V in the intake prompt (fleet explicitly named).
Reviewer CLI transports launch only at review gates, visible terminals per V's
standing steer from the previous mission.

## Fleet roster instantiation (this mission)

| Seat | Model | Transport | Fires when |
|---|---|---|---|
| Orchestrator | Claude Fable 5 | this session | whole mission |
| Research seats | Opus 5 | Agent tool subagents (SDK; compaction checkpoints N/A per spine) | wayfinder `research` tickets, parallel |
| Reviewer: Codex | gpt-5.6-sol (`-c model` override) | `codex exec`, visible Terminal | artifact review gates |
| Reviewer: Grok | grok-4.5 | `grok -p --permission-mode bypassPermissions`, visible Terminal | artifact review gates |
| Reviewer: Hermes | gpt-5.6-sol | `hermes -z`, visible Terminal | artifact review gates |

## Wayfinder integration (method note)

- **Map:** `wayfinder/map.md` in this mission directory; tickets at
  `wayfinder/issues/NN-<slug>.md` following the local-markdown tracker
  conventions (`Type:`, `Status:`, `Blocked by:` lines). Deviation recorded: the
  tracker default location `.scratch/<effort>/` is replaced by the mission
  directory for heartbeat artifact locality.
- **Grilling rides the H0 design-question surface** — REQUIREMENTS may address V
  directly under the One-Prompt Machine law, so ticket-by-ticket interrogation
  of V is spine-legal and is this mission's core mechanism.
- **Charting session (today):** name the destination → breadth-first frontier
  grill → create map + tickets → wire blocking → fire Opus research subagents →
  stop. Charting hand-resolves nothing.
- **After charting:** decision tickets are worked one per session (wayfinder
  law) unless V overrides the pace in the map's Notes.
- **Reviewer gates:** Codex/Grok/Hermes review the charted map and the
  destination artifacts; protocol pinned during grilling.

## Inherited context (previous mission, binding here)

- V RULING — whole-graph stranger test: every generated node and the verdict
  must be restatable by a stranger; coverage knob unresolved.
- V STEER — preserve node-by-node reasoning and the scoring machinery
  (QBAF/DF-QuAD framework, per-node judging, trusted-run reconstruction,
  qbaf_debug view); replace only the four indicted semantics (unjudged-node
  fallback, hardcoded aggregation, exact-string dedup, provenance-blind serving).
- Reports' merged partition: 10 MACHINE / 27 HYBRID / 1 LLM / 24 CONTESTED of 62
  questions; rules 1,2,5,7,9 HYBRID, rules 3,4,6,8 contested. Contested rows are
  preserved, never adjudicated by agents.
- The 9 "decisions only V can make" (report-for-humans §"Decisions only V can
  make"): #4 is closed by D-GREENFIELD; the remaining 8 are wayfinder ticket
  candidates.

## Round closure

The charting round closes when the map exists with its frontier wired, research
subagents have posted their findings (or failed with evidence), and V holds the
first frontier. REQUIREMENTS SATISFIED is emitted only when V accepts the
destination artifact set — never by the orchestrator's own judgment.

## Charting rulings (2026-08-03 — grilling rounds 1–7, V answered live)

1. **Destination:** buildable spec pack — requirements spec, clean-room
   carryover manifest, V2-UI boundary contract, race/victory criteria. Done
   when ARCHITECTURE could start with no new V questions.
   [SUPERSEDED IN PART by DR-047, 2026-08-04: the race was retired; artifact
   #4 is now the V3 Quality Charter — see the decisions ledger.]
2. **UI binding:** MAY FLEX where the old contract genuinely can't express
   battery outputs; negotiated per-output in wayfinder ticket 16.
3. **Carryover:** CLEAN-ROOM from spec — nothing copied; golden vectors
   (ticket 03) protect equivalence and prove intentional divergence.
4. **Coverage (V custom ruling):** ALL 62 questions + ALL 9 rules receive
   concrete dispositions in the spec; the three experiments run only after a
   working prototype and never gate the spec.
5. **Stack:** behavior-only requirements; ARCHITECTURE proposes, V ratifies
   there.
6. **Review gates (V amendment):** three lenses — Codex
   machine-executability/spec-precision, Grok red-team, Hermes
   human-readability/stranger test. THE ORCHESTRATOR (Fable) merges verdicts
   and adjudicates lens disagreements: V ruled that at every multi-agent
   convergence point the orchestrator merges, never one of the workers.
   Recorded spine deviation (mission-scoped, V authority): review-gate
   reconciliation moves from Hermes-Verifier to Claude-Router, extending the
   spine's H3 orchestrator-merge pattern.
7. **Pace:** BLITZ SITTINGS — grilling tickets back-to-back while V's
   attention holds; V calls the halt; the map records it.

Charted: `wayfinder/map.md` + 17 tickets initially (6 research, 10 grilling,
1 task — arithmetic corrected per Hermes lens F5; blocking wired: 07←05,
08←06, 15←05, 16←01). Fleet fired: 6 Opus research seats (tickets 01–06,
parallel) + 3 reviewer lenses on the charted map. Board evolved during the
round — current authoritative inventory lives in the map's ticket index.

## Map-review round (2026-08-03)

All three lenses returned LENS CHANGES REQUESTED. Orchestrator merged per
DR-006 (V's convergence-point ruling): full per-finding dispositions in
`reviews/merge-verdict.md`. Agreed core accepted and repaired same-session by
the charting owner: authoring tickets 29/30 + assembly gate 31 created;
composition grilling 28 created (Grok F1); `wayfinder/GLOSSARY.md` with the
numbered defect register D1–D4 (Hermes F1/F6); `wayfinder/decisions-ledger.md`
DR schema (Codex F2/F7 adjudicated to decision-record granularity); map gains
ticket index, status vocabulary, sequencing law, race-layering separation,
ruling-ownership law; tickets 12/14/15/16/17/26/27 amended. Re-review
disposition offered to V: re-run lenses on repaired charting, or fold into the
scheduled per-artifact gates (orchestrator recommends folding).
