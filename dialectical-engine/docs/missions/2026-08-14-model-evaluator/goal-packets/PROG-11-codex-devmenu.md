# Goal packet PROG-11 — Codex lane: eval-11-devmenu (PROGRAMMING loop, tier 7, FINAL lane)

Mission: model-evaluator. Seat: Codex implementation lane. HITL lane: your output
is a working prototype V reacts to — build rough-but-real first, no gold-plating.
Worktree (work ONLY here): /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu
Working directory inside it: DebateAI-V3/. Branch: codex/eval-11-devmenu.
Base: ALL prior lanes merged (foundation, domains+seed, metering, tagger, harvest,
add-on, profiles, consumer, seat-share-dark).

Read first (ABSOLUTE paths, read-only):
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md (§7 tier-7 row, §8; §6 for what the status view may show)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md (§9 dev menu FRs, FR-0.x)
- /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/issues/11-dev-menu.md (its Programming-stage handoff is BINDING: expose parked/circuit-broken runs)

## Deliverables (lane row tier 7)

Dev-only menu surface in the V3 UI (decide placement per the repo's UI structure;
gate as dev-only per the FRs): (1) consumer-model picker — models the vLLM
container reports (enumerated-model FK; unavailable state when the container is
down); (2) evaluator status view — domains grown (starter vs grown provenance),
rows harvested, per-model profile peek (lane-07 cells/ranks), dark-launch switch
state READ-ONLY (display only; NO bind control anywhere — merge gate); (3)
parked/circuit-broken runs surface (runs excluded after 3 HARVEST failures —
visible with their receipts; no reset button, display only); (4) domain
starter-list view. Read paths only — the menu WRITES nothing except the
consumer-model selection (its one legitimate write, via the register/settings
mechanism the architecture names).

## Binding constraints

1. NO allocator call sites — the darkness guard now scans web/ and will fail
   your lane if you touch seat-share dispatch. Status DISPLAY of shadow
   decisions is fine (read-only).
2. NO bind control: the merge gate explicitly requires absence of any UI element
   that flips dark-launch state.
3. Dev-only gating; the menu must not appear in the normal ask flow.
4. Read queries go through evaluator-permitted read surfaces (grants), never
   admin connections in app code.

## Merge gate

Enumerated-model FK test; unavailable-state test; no-bind-control test (assert
absence); parked-runs surface test; dev-only gating test; the darkness guard and
all differentials stay green; repository typecheck. Real write paths in fixtures;
pinned clocks.

## Constraints

Commit locally on your branch; NO push; no board mutations; no BOUND state;
DR-179. Self-report to
/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/codex-PROG-11.md
When complete print exactly: READY FOR PEER REVIEW: codex/eval-11-devmenu

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE
condition.
