# GOAL PACKET — H6 ticketization + Step-6 self-audit + LANE PLAN APPROVAL

```yaml
state:
  ticket: ARCH-OBS-H6
  mission: 2026-08-21-observability-loop
  risk_tier: high
  planning_tier: 2
  status: ready
  owner: { agent: claude-opus (ARCH seat per V amendment A4), session: SDK-subagent }
  loop: architecture (tail)
  contract:
    allowed:
      - the Kanban board `observability-loop` (ticket CREATION + bodies via `hermes kanban` CLI, store-only)
      - docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md
      - docs/missions/2026-08-21-observability-loop/planning/LANE-PLAN-APPROVAL.md
      - .hermes/reports/2026-08-21-observability-loop/agent-reports/h6-ticketize.md
    readonly:
      - docs/missions/2026-08-21-observability-loop/planning/{VerticalSlices.md,FinalPlan.md}
      - docs/missions/2026-08-21-observability-loop/reviews/H5-slices-gate-opus.md
      - docs/missions/2026-08-21-observability-loop/research/POST-SYNTHESIS-RULINGS.md
      - docs/missions/2026-08-21-observability-loop/00-intake-H0.md  (amendments A1-A4)
      - repo read-only
    forbidden:
      - creating worktrees or branches (H6 plans them; PROG creates them)
      - any code, migration, or config
      - mutating OTHER boards (global current-board pointer sits on the sibling
        docker-hatchet mission — ALWAYS pass `--board observability-loop` BEFORE
        the action, never `boards switch`)
      - marking anything Done
    verification:
      - every slice maps to exactly one ticket; no slice dropped, no ticket invented
      - each ticket's allowed/readonly/forbidden/verification contract matches its slice verbatim
      - risk_tier set per ticket with reason; routed review path matches the tier
      - the immutable high-risk floor holds; nothing tiered down
      - the Ready set is a deliberately small intentional set
    human_review: yes (V rules the LANE PLAN + planning-graph image)
```

## Your job (three artifacts)

### 1. Ticketize onto the board `observability-loop` (port 9119, store-only CLI)

One ticket per slice from `planning/VerticalSlices.md` (32 slices). Ticket
titles carry the assigned model in SQUARE BRACKETS at the start — V's
2026-08-15 order — e.g. `[codex@gpt-5.6-sol] S01 obs store foundation`.
Every implementation ticket is `[codex@gpt-5.6-sol]` (sole coder). Review /
gate / spike tickets are `[claude-opus]`; V-acted preconditions are
`[V]`.

Each ticket body carries, verbatim from its slice:
```
Lane / worktree / branch:
Deliverable(s):
Gate (G0-G6):
contract.allowed / readonly / forbidden:
tests: (the GLOBAL-TEST-SURFACE partition for this slice)
RED->GREEN obligation + the falsifiable acceptance criterion it maps to:
Depends-on:
Blocked-behind (if any):
risk_tier + reason:
Review path (matches tier):
Traceability: OBS-Rnnn / ruling ids
```
Use `hermes kanban --board observability-loop create ... --body ...` and wire
dependencies with `link <parent> <child>` (child waits on parent). Set
`--initial-status blocked` for anything behind a hard gate. Keep the READY set
deliberately SMALL — only what may lawfully start once ROW-GIT lands.

CLI facts (verified): pass `--board observability-loop` BEFORE the action; ids
are strings `t_xxxxxxxx`; `--json` returns the id; never `boards switch`.

### 2. Step-6 self-audit → `planning/H6-selfaudit.md`

Run the spine's H6 checklist and record PASS only when every line holds:
slice→ticket coverage (all 32, none invented); contracts verbatim; dependency
IDs and lineage match the merge order; create/modify/extend labels match;
NO ticket authorizes self-Done, ticket-splitting, push/merge, DB deletion, or
worktree ops outside the approved plan; the Ready set is small and intentional;
`risk_tier` set + reason per ticket; routed review path matches tier; the
high-risk floor holds (anything touching persistence/migrations, provider
spend, security/auth, scoring semantics, live data, destructive or
architectural work is `high` and was NOT tiered down); no ticket's file paths
contradict its tier. End with `HERMES STEP 6 SELF-AUDIT PASS` or
`... CHANGES REQUESTED` naming the exact ticket + failed line.

### 3. LANE PLAN APPROVAL packet → `planning/LANE-PLAN-APPROVAL.md`

The spine's LANE PLAN APPROVAL shape — ONE V DECISIONS PACKET row authorizing
every worktree create/use in the plan:
mission/epoch · authority_epoch · max_concurrent_heavy (laptop = 1) · per lane
{lane id, ticket(s), owner, risk_tier, worktree.path, worktree.branch,
contract.allowed/readonly/forbidden/verification} · merge order · closure
target · destructive git ops requested (NONE — the ROW-GIT reconciliation
commit is V's own act, listed as the Lane-0 precondition) · the single yes/no
V answers · evidence links.

## Handoff marker

```
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-observability-loop / H6-TICKETIZE
- owner CLI session: SDK-subagent (H6 ticketizer, Opus)
- artifact path: planning/H6-selfaudit.md + planning/LANE-PLAN-APPROVAL.md + board tickets
- upstream artifacts used:
- checks/evidence: (ticket count, board ids created, dependency edges wired, Ready-set contents)
- assumptions/risks:
- comments read through: not ticketed
```

Then stop. H6A (an independent Opus, different session) diff-checks your
tickets against the slices before any Codex launch.

## Stop conditions
- A slice you cannot ticketize without inventing scope → stop, name it.
- Any pressure to create worktrees/branches or write code → stop.
- A DECIDE-V item → record it in the LANE PLAN packet; never contact V.
