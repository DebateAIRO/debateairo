# H0 Intake — V3 Architecture (ARCH-V3-R1)

Mission opened: 2026-08-05 (night session)
Orchestrator: Claude Code (Fable 5) — Claude-Router seat, per Graph Spine v2 §5.1
Invoked by: V, single mission prompt (`/goal` + `/heartbeat-protocol`, One-Prompt Machine, surface 1)
Predecessor: REQ-V3-GREENFIELD-R1 — CLOSED, REQUIREMENTS SATISFIED (DR-067, 2026-08-05).
This is the ARCHITECTURE mission that DR-067 and the V3 README name as the next phase.

## Mission statement (V's words, condensed)

Run the ARCHITECTURE loop ONLY, for setting up the DebateAI-V3 project. Fleet:
Fable 5 orchestrator; Opus 5 subagents for research and implementation (of
architecture artifacts); Codex as reviewer on model gpt-5.6-sol ("5.6 Sol on
MAX"). Reason through all files in the DebateAI-V3 folder and build the
architecture until done. **Night Mode**: pursue the goal purely autonomously; by
morning V wants (a) all the architecture built and (b) a consolidated set of
questions that have no answer anywhere in the DebateAI-V3 documents.

## Standing authority consumed at intake

- The founding pack (docs/founding/: requirements-spec, carryover-manifest,
  ui-boundary-contract, quality-charter, decisions-ledger DR-001..067, GLOSSARY)
  is the requirements contract. Where this mission's artifacts and a DR
  disagree, the DR wins.
- DR-005/DR-024: ARCHITECTURE proposes the stack, V ratifies — EXCEPT
  V-imposed constraints already ruled (first entry: **Postgres** persistence,
  including the observability layer).
- DR-047: acceptance bar = the Quality Charter (stranger law, no orphaned
  modules, firing fixtures, replay ceremony, research-upgradeable).
- Provider spend: authorized by V in the mission prompt (fleet explicitly
  named, same form as the predecessor mission's intake).

## Typed state block

```yaml
state:
  ticket: ARCH-V3-R1
  risk_tier: high            # architecture work — immutable high-risk floor (spine §9)
  planning_tier: 2           # full chain: H0,G1,C2,(H2∥G3),H3,C4,H4,G5,H5,H6,H6A
  status: working
  owner: { agent: claude-fable-5, session: orchestrator }
  contract:
    allowed:
      - docs/missions/2026-08-05-v3-architecture/**
      - docs/architecture/**            # the architecture deliverable set
      - .hermes/reports/2026-08-05-v3-architecture/**
    readonly:
      - docs/founding/**                # the requirements contract — never edited here
      - README.md
    forbidden: all_others               # no code, no founding-doc edits, no git commit/push (V-gated)
    verification: [digests cite sources, plan reviewed by independent lenses,
                   orchestrator merges verdicts (DR-006), rework cap 3,
                   morning report + open-questions register delivered]
    human_review: yes                   # V's morning read IS the human gate; nothing self-accepts
  authority_epoch: 1
  rework_round: 0
  comments_read_through: intake
```

## Loop-ownership election (ruling R7 — V answered in the mission prompt)

```yaml
loop_ownership:
  requirements: CLOSED (DR-067) — reopened only via the ARCH→REQ feedback edge,
                answered from the founding pack or queued for V's morning
  architecture:
    orchestrator: claude-fable-5        # routing, verdict merge (DR-006), reports
    worker_subagents: [opus-5]          # research digests + architecture artifact authoring
    reviewers: [codex@gpt-5.6-sol, opus-5-independent]
  programming: not-elected-this-mission
  qa: not-elected-this-mission
```

## Fleet roster instantiation (this mission)

| Seat | Model | Transport | Fires when |
|---|---|---|---|
| Orchestrator | Claude Fable 5 | this session | whole mission |
| Research seats | Opus 5 | Agent tool subagents (SDK; compaction N/A per spine) | founding-doc digests, parallel |
| Architecture author | Opus 5 | Agent tool subagent; rework via SendMessage to the SAME agent (sticky-session law) | C2 Plan, C4 FinalPlan, architecture artifacts, G5 slices |
| Reviewer: Codex | gpt-5.6-sol | `/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"'`, headless, log to mission logs/ | plan + artifact review gates |
| Reviewer: independent Opus | Opus 5 | separate Agent tool subagent (never the author's session) | second lens of each review diamond |

## Recorded deviations (Night Mode adaptations — all mission-scoped, reported to V in the morning)

1. **No "Night Mode" document found.** V's prompt says Hermes has a Night Mode
   document; exhaustive search of DebateAI-V3, DebateAIRO, and ~/.hermes found
   none. Proceeding on the prompt's plain meaning: purely autonomous, no V
   contact until morning; every V-owned decision is QUEUED in the open-questions
   register instead of interrupting V. → Morning question Q-PROC-1.
2. **Hermes-Verifier seat vacant.** No Hermes session is running and none can be
   launched under Night Mode without V. The spine's Hermes stage gates
   (H1/H2/H3/H4/H5) are substituted: independent review diamond = Codex lens +
   independent Opus lens; merge/adjudication = orchestrator (extends DR-006, V's
   standing convergence-point ruling from the predecessor mission). Board custody
   is N/A (no Kanban tonight; ticketization lands as VerticalSlices + a ticket
   pack for V). This mirrors the spine's outage principle: the mission continues
   on existing authorized channels with the deviation recorded.
3. **Grok not elected.** V's fleet names no Grok seat; G1/G3/G5 stage *roles*
   are filled by Opus (research), Codex+Opus (review), Opus (slices) per the
   election above. Roster law intact: this is a per-mission election, not a
   roster edit.
4. **V DECISIONS PACKET flush thresholds suspended until morning.** Packets
   cannot flush to an absent V; all rows accumulate into the morning report's
   open-questions register. Nothing self-approves; anything needing V simply
   waits (status waiting_human, escalation_target v_packet).
5. **No git commits.** Commit/push are V-gated important operations; the
   architecture lands as working-tree files for V's morning review.

## Mission route (Tier 2, adapted seats)

```text
H0  intake (this file)
G1  research: 3 parallel Opus digests of the founding pack        [research/]
C2  Plan.md — Opus author                                          [architecture plan]
H2∥G3 review diamond: Codex lens ∥ independent-Opus lens           [reviews/]
H3  merge — orchestrator adjudicates disagreements only (DR-006)
C4  FinalPlan.md + architecture artifact set — same Opus author    [docs/architecture/]
H4  review diamond on the artifact set (same two lenses)
G5  VerticalSlices.md — ticket slicing for the PROGRAMMING mission
H5  review of slices (same two lenses, merged by orchestrator)
H6  ticket pack assembled (no live board; lands as artifact for V)
H6A independent slices→ticket diff check (Opus session distinct from G5 author)
    → ARCHITECTURE SATISFIED emitted only if every gate passed and no
      GENUINELY-UNANSWERED blocker remains; else the closure report states
      exactly what blocks and why
Morning: phase reports + closure/morning report + open-questions register
         [.hermes/reports/2026-08-05-v3-architecture/]
```

## Convergence counters

rework cap 3 per stage (spine §10) · chatter breaker N/A (no two-party comment
channel tonight) · every waiting state carries waiting_since + escalation_target
= v_packet (flushes at morning).
