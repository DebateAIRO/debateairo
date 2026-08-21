<!--
Assembled 2026-07-24 by Claude Fable from 8 Opus-drafted sections, 2 Opus verification
passes, and 1 Opus surgeon pass. Spec: DebateV2/.hermes/prompts/claude-graph-harness-blueprint-v0.1.md
(Blueprint v0.2 + ruling D5, the One-Prompt Machine).
-->

# DebateAI Graph Harness Migration Plan

> **Status:** Implementation plan, ready for phase-by-phase execution.
> **Derived from:** `C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\claude-graph-harness-blueprint-v0.1.md` (Graph Harness Blueprint v0.2).
> **Authoring frame:** This is a **protocol-change** plan (docs only), not a product-code plan. Every task is a self-contained, Kanban-ready ticket. Execute in phase order; do not start a phase before the prior phase's gate clears.

**Goal:** Restructure the Heartbeat protocol family into a real graph — Node / Edge / Router / State pillars, diamond topology, true worktrees, verifiers on edges, guaranteed cycle convergence, and batched V approvals — while preserving every battle-tested safety law (blueprint §1.3).

**Architecture summary (3 sentences):** V prompts exactly one node (REQUIREMENTS); everything downstream flows through an ARCHITECTURE plan-diamond (Claude plans; Hermes ∥ Grok review in parallel; merge/reconcile), into N parallel PROGRAMMING lanes (Codex in true `git worktree` isolation), which loop concurrently with a QA node (parallel diverse-lens verifiers + product-truth gate) before an integration/closure gate reaches `HERMES DONE`. Every cycle in that graph carries a convergence bound and an escalation edge, and V is reached only through batched `V DECISIONS PACKET` rows or final acceptance — never as a manual transport. This plan migrates the existing single Lineage-A spine document in place into that shape across six ordered phases, transplanting Lite's correctness machinery and the Full body's worktree/stage-gate machinery into one normative Graph Spine.

---

## How to Execute This Plan (LLM Execution Contract)

This contract binds every agent that touches this mission — Claude Code (Fable), the Main Orchestrator holding the **Claude-Router** seat (launches everything, routes everything on typed state, runs the One-Prompt Machine, does no content judgment); Hermes, holding the **Hermes-Verifier** seat (independent evidence verification plus Kanban board custody, board crafting, and Manual QA runs); and the Codex, Claude, and Grok worker/reviewer instances. Router and Verifier now sit in **different model families** (ruling R1). You are executing **without** access to the conversation that produced this plan. This file plus the blueprint are the only context you need; do not seek or invent more.

### Source-of-truth precedence (standing rule)

1. **Blueprint v0.2** (`...\.hermes\prompts\claude-graph-harness-blueprint-v0.1.md`) is the WHY — audit verdict, target graph, design rationale, and V's rulings.
2. **This plan file** is the WHAT/HOW and is the **mission's single source of truth after the blueprint.** Where this plan and the blueprint differ on an *execution detail*, this plan wins for execution. Where either conflicts with a **preserved law** (Global Constraints below), the preserved law wins and you **STOP and escalate** — preserved laws are never weakened by any task.
3. The **current spine** and adapters being migrated are the artifacts you edit, not additional sources of authority; when the plan says to change them, change them.

### Reading order (do this before touching any ticket)

1. Read the blueprint §1–§6 once (verdict, target graph, design, migration phases, single-winner decision, V's rulings §6.3.1).
2. Read this plan's Global Constraints and this execution contract in full.
3. Read the phase you are assigned and the exact task within it — **only** that task's contract governs your edit surface.
4. Read your own node contract / adapter (Codex, Claude, or Grok) and the current spine section the task names, so your anchors are real quotes.

### One task = one Kanban ticket (mapping)

Every task in this plan is written to become **exactly one** Kanban card. Do not split, merge, batch, or reorder tasks on your own initiative. The task's embedded **Ticket contract (Kanban-ready)** block is authoritative for the card. When Claude-Router ticketizes a task, it seeds the §3.1 typed state block as the **first comment** on the card, populated directly from the task fields:

| Task field | Seeds state field |
|---|---|
| Task's **Risk tier** (low\|medium\|high) | `risk_tier` (set ONCE here; immutable thereafter — see high-risk floor) |
| Ticket contract → **Allowed to edit** | `contract.allowed` |
| Ticket contract → **Forbidden** | `contract.forbidden` = `all_others` |
| Ticket contract → **Verification** | `contract.verification` |
| Ticket contract → **Human review required** | `contract.human_review` (yes\|no) |
| Ticket contract → **Assigned agent** | `owner.agent` (Claude-Router routes; Hermes crafts/custodies the board; default worker Codex for docs-only edits) |
| Task's **Review gate** | routing path selected mechanically by `risk_tier` (§3.2/§3.3) |

At creation the card is `status: queued`; Claude-Router advances it to `ready` when its dependencies (prior tasks/phases) are satisfied. `authority_epoch`, `rework_round: 0`, `wakes_since_transition: 0`, `waiting_since`, `escalation_target`, and `comments_read_through` are initialized per §3.1. No agent writes `risk_tier` or `authority_epoch` except at the moments the spine authorizes (intake/H6 for `risk_tier`; V/cockpit only for `authority_epoch`).

**Verification-field resolution rule (binding — applies to every task's Ticket contract).** In every task's `Ticket contract (Kanban-ready)` block, the **Verification** field means: the task's **Verify** block below it, verbatim, with its real absolute paths substituted in. Shorthand tokens that appear inside a compact Verification line — `<SPINE>`, `<LITE>`, `<CODEX-ADAPTER>`, `<same>`, or any other `<...>` alias — are NOT literal shell strings; they resolve to the concrete paths named in that same task's **Files** and **Verify** sections (e.g. `<SPINE>` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`, `<same>` = the path used on the immediately preceding line). Hermes expands every such token to its real forward-slash absolute path when it seeds `contract.verification` at ticketization; a `<...>` token must never be persisted verbatim as a runnable command. When in doubt, `contract.verification` is exactly the task's **Verify** block.

### Review routing (proportional — deterministic on `risk_tier`)

The task's **Review gate** is not a judgment call; it is `risk_tier` read off the persisted state:

- **low** → direct Hermes-Verifier diff review, same-cycle `HERMES DONE`. (Protocol-doc edits default here.)
- **medium** → one independent reviewer (model-family-diverse where possible) **+** Hermes-Verifier.
- **high** → full review diamond (§3.5) + product-truth gate + escalation into the `V DECISIONS PACKET`.

The **immutable high-risk floor** (V's ruling §6.3.1.3) can never be tiered *down*: persistence/migrations, provider spend, security/auth, scoring semantics, live/product data, and destructive or architectural work are `high` regardless of surface size. (Most tasks in this docs-only mission are `low`; spine-law changes are `medium`; anything touching a safety law or the high-risk-floor definition itself is `high`.)

### Phase gates (hard barriers between phases)

Phases execute in order 1 → 6. **Each phase ends with a `HERMES PHASE REVIEW` + V approval before the next phase starts.** Concretely:

1. When every ticket in a phase reaches `done`, Claude-Router (not any worker) assembles a **`HERMES PHASE REVIEW`** from Hermes-Verifier's per-ticket verification outputs: the phase's acceptance criteria, each ticket's verification output, and any deviations. (Claude-Router packages and routes the review; Hermes-Verifier produced the verdicts it carries.) Per ruling R8, the review is written as a durable, append-only phase report under `.hermes/reports/<mission>/` — for this migration: `DebateV2/.hermes/reports/graph-harness-migration/phase-<N>-report.md`.
2. That review is submitted as **one row in the `V DECISIONS PACKET`** (card = the phase; decision = "approve phase N close, open phase N+1"; evidence link = the review; smallest yes/no). This is the phase's V-approval gate; it is the only sanctioned way to open the next phase.
3. No phase-N+1 ticket may move past `queued` until that packet row returns approved. A phase gate never auto-approves; if a phase's acceptance is unmet, it stays open and escalates.

Phase 5's kickoff additionally requires the **provisional worktree-gate reconfirmation** (V's ruling §6.3.1.2): before Phase 5 starts, present Phase 1–4 wall-clock data and re-obtain V's confirmation of the per-mission worktree gate.

### On task failure (never improvise scope)

If a task cannot be completed as written:

1. **Post a blocker per the spine**, not a workaround. Use the blocker taxonomy (preserved law §1.3.6): set `status` to the correct `waiting_*` value (`waiting_review`, `waiting_hermes`, `waiting_product_proof`, `waiting_human`, `waiting_dependency`, `waiting_resource`, or `failed_tooling`), stamp `waiting_since`, and set `escalation_target` (`hermes` or `v_packet`). Emit `HERMES BLOCKED` / `GOAL BLOCKED` per the spine template.
2. **Never widen `contract.allowed`.** Editing any file outside the task's Allowed list is a scope violation; if the task cannot be done within its file contract, that is a blocker, not a license to expand.
3. **Never invent scope, paths, or content.** No `TODO`/`TBD`/"add appropriate…"; if the plan text is insufficient, block and escalate rather than guessing.
4. **Convergence bounds apply to failures too.** `rework_round` increments on every `CHANGES REQUESTED` (peer, Hermes, stage, or human); at `rework_round = 3` the loop **freezes** and emits `V STEERING REQUIRED` into the packet. The chatter breaker (6 comment exchanges **OR** 24 router wakes with no `status`/`authority_epoch` transition) trips the same freeze+escalate. `unblock`/counter-reset is capped at **2 per ticket**; the third occurrence freezes and escalates. A frozen loop **escalates; it never auto-approves** (blueprint §5).

### Marker vocabulary (use these exact strings)

All existing spine markers remain in force, **plus** the union additions this migration introduces: `HERMES DONE`, `HERMES BLOCKED`, `HERMES AUTHORIZED NEXT`, `HERMES AUTHORIZED ROUTE`, `V DECISIONS PACKET`, `V STEERING REQUIRED`, `AUTHORITY EPOCH`, `HERMES LIVENESS REQUESTED`, `READY FOR EXTERNAL REVIEW`, `EXTERNAL REVIEW PASSED` | `EXTERNAL REVIEW CHANGES REQUESTED`. The unified stage numbering is `H0, G1, H1, C2, H2, G3, H3, C4, H4, G5, H5, H6, A7, C8, H9`. Do not coin synonyms or drift the spelling.

`H6A` is a formal **sub-stage of `H6`** (the independent Slices→ticket diff check installed by Phase 4 Task 4.5), not a new top-level stage: it does not alter the fifteen-ID unified list above, it hangs off `H6` exactly as a decimal refinement. `H6A` is the only sanctioned sub-stage ID; do not coin others.

### Canonical file map (all paths verified to exist as of 2026-07-23)

| Role | Path (Windows) | Note |
|---|---|---|
| Repo spine (migration target → Graph Spine v2) | `DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` | Edited in place; no version field today |
| Codex adapter | `DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md` | |
| Claude adapter | `DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md` | |
| Grok adapter | `DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md` | |
| AGENTS.md §Shared Agent Protocol | `DebateV2\apps\dialectical-engine\AGENTS.md` | |
| Codex vendor skill | `DebateV2\apps\dialectical-engine\.codex\skills\heartbeat-protocol\SKILL.md` | Symlink out of repo per blueprint §6.1 — a Phase-3 task makes it a real in-repo file |
| Claude vendor skill | `DebateV2\apps\dialectical-engine\.claude\skills\heartbeat-protocol\SKILL.md` | |
| Rogue session-root Claude skill | `C:\Users\vladm\Desktop\debate\.claude\skills\heartbeat-protocol\SKILL.md` | Shadow instance — do not invoke (Decision D1) |
| Hermes FULL alias (thin loader target) | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol\SKILL.md` | |
| Hermes FULL body (demote/transplant source) | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\SKILL.md` | + `references\` |
| Hermes LITE (retire-as-protocol, transplant-as-law source) | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md` | + `references\` |

---

## Global Constraints (unbreakable invariants)

These bind every task in every phase. A task may **move or reformulate** a preserved law but may **never weaken** it (blueprint §1.3, §5).

### Preserved laws — verbatim from blueprint §1.3 (never re-invent, never dilute)

1. Independent review before Done; reviewer never edits; worker never self-sends to Hermes; no self-Done.
2. No-fake-data / no-scaffold / RED→GREEN evidence law; "workflow evidence is not product evidence."
3. Per-ticket file contracts (Allowed / Read-only / Forbidden / Verification) — this IS a node contract; keep and extend.
4. Sticky worker/session ownership on rework + `WORKER CONTINUITY OVERRIDE`.
5. AUTHORITY EPOCH monotonic authority + compare-before-write / fresh-read-before-mutate.
6. Blocker-type taxonomy (already an enum in the BLOCKED template).
7. `wakeAgent:false` tokenless change gate (correct and keep — extend its fingerprint spec, §3.4).
8. Detector/reviewer/router separation of powers (already written for the watcher — generalize to Hermes itself).
9. Escalate-to-V-only-for-named-categories filter (provider spend, data writes, deletion, destructive git, architecture/scope, reconstructed evidence, waiver, final acceptance).
10. Product-truth gates requiring live app/API/DB/browser evidence.
11. Failed-test ticket fanout (a real diamond — becomes the template).
12. Sibling-lanes + one-closure-gate pattern; per-worktree Split→Verify→Merge checklist (promote from planning skill to spine).
13. Proportional review fast path low/medium/high (make it a persisted field, §3.3).
14. Human-block circuit breaker freeze rule (generalize its trigger, §3.4).
15. H1 research handoff-integrity-only gate (proof the team already knows how to right-size a gate).
16. **TDD law (preserved-law repair, 2026-07-24):** mandatory RED→GREEN→REFACTOR — failing test first, smallest green change, refactor under green, RED/GREEN evidence in every handoff; explicit V/Hermes waiver is the only escape and never itself evidence; tests-after theater is a violation. Installed by Task 4.8.
17. **DDD law (preserved-law repair, 2026-07-24):** domain language + bounded-context/invariant ownership; plans state DDD impact and the ARCHITECTURE loop verifies it at H2; implementation never crosses bounded-context ownership outside its ticket contract. Installed by Task 4.8.
18. **Worker-persistence law (preserved-law repair, 2026-07-24):** ordinary reversible problems belong to the worker — up to three evidence-based non-destructive approaches before blocking; local friction is not a goal blocker. Installed by Task 4.8.

**Convergence never overrides safety** (blueprint §5): a convergence cap or chatter breaker freezes and escalates a loop; it never auto-approves it, and it never bypasses a §1.3 gate.

### Scope constraint — docs only

This mission edits **protocol documents, skills, adapters, and Kanban tooling metadata only.** No product code, no application logic, no test-suite behavior changes. If a task appears to require product-code changes, that is a blocker (`failed_tooling` or `waiting_human`), not license to edit code. Every task's `contract.forbidden` is `all_others` — the file list in the ticket is the entire edit surface.

### No deletion before the post-final-push prune (V's ruling §6.3.1.4)

**Nothing is deleted or archived before the migration's final push.** This includes: `git worktree remove` of the merged skill-dev worktree, disposal of `ts-t1-proof` snapshots, and reference-archive moves. Old spine/skills are **demoted** (marked implementation notes / superseded), never removed, during the migration. After the final push, **Claude explicitly asks V for prune approval** before any deletion or archive move executes. No task in Phases 1–6 may delete a file.

### V's rulings (restated — full text in the Decision Register)

- **D1 — Claude skill: SUPERSEDED-BY-DESIGN.** A new Claude skill (Claude's cemented in-app role) is coming; the session-root rogue file retires the moment it lands. Until then the rogue is a known shadow instance: **do not invoke it;** any `[Claude]` routing follows the spine, not the rogue file.
- **D2 — Worktrees: IMPORTANT-OPERATION GATE STANDS (provisional).** Worktree operations remain V-gated, but the gate is satisfied **per-mission, not per-operation**: at **H6**, Hermes submits the complete lane plan (worktree paths, file contracts, merge order, closure/integration target) as **one** `V DECISIONS PACKET` row, and V's single approval covers every worktree create/use inside that approved plan. Destructive git operations (delete/rewrite/force) remain individually V-gated. Provisional — reconfirm at Phase 5 kickoff with Phase 1–4 wall-clock data.
- **D3 — Peer review: PROPORTIONAL.** Adopt proportional review with a **persisted, auditable `risk_tier`** set at ticketization, an **immutable high-risk floor** (persistence/migrations, provider spend, security/auth, scoring semantics, live/product data, destructive or architectural work can never be tiered down), an **H6 self-audit** verifying path-matches-tier, and the escalation edges of §3.4 wired in.
- **D4 — Pruning: DEFERRED TO POST-FINAL-PUSH.** See the no-deletion rule above.
- **D5 (2026-07-24): THE ONE-PROMPT MACHINE.** Inherited from the full protocol and cemented as spine law: exactly one V prompt starts a mission (H0). Thereafter only three V-facing surfaces exist: **(a)** design questions/steering, emitted ONLY by the REQUIREMENTS (H0) and ARCHITECTURE (planning diamond C2/H2/G3/H3/C4) nodes, during design; **(b)** IMPORTANT-OPERATION decisions (database deletion, data manipulation, security/auth, provider spend, destructive git/filesystem, architecture/scope expansion, reconstructed evidence, waiver) from any node, exclusively via the batched `V DECISIONS PACKET`; **(c)** final acceptance (H9). V never relays prompts or output; no other node addresses V; Claude-Router intercepts violations. Installed by Task 3.11(l); enforced as default operation by Task 6.3. All other rulings and decisions in this register remain unchanged.
- **R1–R6 (2026-07-24) — orchestrator-architecture second round (carry V's direct authority).** R1: Main Orchestrator = Claude (Fable), the Claude-Router seat; Hermes keeps board custody as Hermes-Verifier (verification + Kanban board custody/crafting + Manual QA); Router and Verifier in different model families. R2: token budget deferred. R3: orchestrator-outage fallback (Architecture-responsible agent relays to humans). R4: coding law parametrized as the versioned model-law roster (only V edits it). R5: mission/pilot falsification criteria. R6: the Four Loops and the Grand Loop stop condition. Full text and bindings in the Decision Register above; installed by Tasks 3.7, 3.8, 3.12, 4.6, 6.3, and 6.4.

### Resource constraint

`max_concurrent_heavy` is declared **once** in the Graph Spine and referenced by pointer everywhere; on the current laptop it is **`1`** (today's serialization behavior). Raising it to schedule more concurrent heavy commands is a single-number change on stronger hardware, not a protocol rewrite. No task hard-codes "one heavy command at a time" prose outside that single declaration.

---

## Decision Register

Rulings D1–D4 were recorded 2026-07-23 by V (blueprint §6.3.1); D5 (the One-Prompt Machine) and R1–R6 (blueprint §6.3.2, orchestrator-architecture second round) were recorded 2026-07-24 and **carry V's direct authority**. These are **closed** except where marked provisional or deferred; execution tasks must conform to them and may not reopen them without a new V ruling.

| ID | Topic | Ruling | Date recorded | Status | Binds |
|---|---|---|---|---|---|
| D1 | Rogue session-root Claude skill | **SUPERSEDED-BY-DESIGN.** New Claude skill (cemented in-app role) authored soon; rogue `C:\Users\vladm\Desktop\debate\.claude\skills\heartbeat-protocol\SKILL.md` retires the moment the replacement lands. Until then: do not invoke it; `[Claude]` routing follows the spine, not the rogue. | 2026-07-23 | Closed | Phase 3 (retire/resolve task); all routing |
| D2 | Worktrees vs IMPORTANT-OPERATION gate | **GATE STANDS (Lite's law wins) — PROVISIONAL.** Worktree ops remain V-gated, satisfied per-mission via one batched **H6** lane-plan approval row in the `V DECISIONS PACKET`; V's single approval covers all worktree create/use in that plan. Destructive git (delete/rewrite/force) stays individually gated. | 2026-07-23 | **Provisional** — reconfirm at Phase 5 kickoff with Phase 1–4 wall-clock data | Phase 5 (worktree isolation, integration node) |
| D3 | Peer review model | **PROPORTIONAL.** Persisted, auditable `risk_tier` set at ticketization; immutable high-risk floor (persistence/migrations, provider spend, security/auth, scoring semantics, live/product data, destructive/architectural — never tiered down); H6 self-audit verifies path-matches-tier; escalation edges per §3.4 (V explicitly endorses them). §6.3 closed pending only D2's Phase-5 reconfirmation. | 2026-07-23 | Closed | Phases 2, 3, 4 (routing table, H6 self-audit, review diamond) |
| D4 | Pruning of stale/merged artifacts | **DEFERRED TO POST-FINAL-PUSH.** Nothing deleted or archived before the migration's final push. After the final push, Claude explicitly asks V for prune approval (skill-dev worktree removal, `ts-t1-proof` disposal, reference-archive moves). | 2026-07-23 | Closed (deferred action) | All phases (no-delete); post-push prune step |
| D5 | The One-Prompt Machine | **ONE-PROMPT MACHINE.** Inherited from the full protocol and cemented as spine law: exactly one V prompt starts a mission (H0); thereafter only three V-facing surfaces exist — (a) design questions/steering from the REQUIREMENTS (H0) and ARCHITECTURE (C2/H2/G3/H3/C4) nodes only, (b) IMPORTANT-OPERATION decisions from any node via the batched `V DECISIONS PACKET`, (c) final acceptance (H9). V never relays prompts or output; no other node addresses V; Claude-Router intercepts violations. | 2026-07-24 | Closed — carries V's direct authority | Task 3.11(l) (install); Task 6.3 (default operation); all V-facing routing |
| R1 | Main Orchestrator assignment | **MAIN ORCHESTRATOR = CLAUDE (FABLE); HERMES KEEPS BOARD CUSTODY AS VERIFIER/QA.** Claude Code (Fable) is the Main Orchestrator (Claude-Router seat): launches everything, routes everything, runs the One-Prompt Machine. Hermes re-seats at the programming-orchestration -> QA corner (Hermes-Verifier seat): Kanban board custody, board crafting, Manual QA runs, and independent verification. The Router/Verifier split is now assigned across model families — Router = Claude, Verifier = Hermes (separation of concerns; battle-tested Hermes board machinery stays where it is proven). | 2026-07-24 | Closed — carries V's direct authority | Tasks 3.7, 3.8, 6.3; global router-token rename to `Claude-Router`; every task's Assigned-agent line |
| R2 | Token budget | **DEFERRED.** Out of scope for now; to be scoped in the near future. No task in this migration installs a token budget. | 2026-07-24 | Deferred — carries V's direct authority | (none this migration) |
| R3 | Orchestrator outage fallback | **ARCH-RELAY FALLBACK.** If the Claude (Main Orchestrator) session is down, the Architecture-responsible agent communicates directly with the humans ("us" = anyone using the harness). Legal because ARCHITECTURE already holds design-question authority under the One-Prompt Machine law — no new V-facing surface is created. | 2026-07-24 | Closed — carries V's direct authority | Task 6.3 (V-touchpoint / degraded-relay section) |
| R4 | Coding-agent identity | **CODING LAW PARAMETRIZED.** The Codex-only coding law does NOT survive unchanged. Coding-agent identity becomes a configurable, versioned **model-law roster** (explicit config/state, never hard-coded prose): only V edits the roster; agents read it as state; no protocol document may hard-code an agent identity outside the roster; roster changes are IMPORTANT OPERATIONS. Current roster values preserve today's assignments (Codex sole coder) until V edits it. | 2026-07-24 | Closed — carries V's direct authority | Task 3.12 (install roster in spine); all coding-agent references |
| R5 | Mission/pilot falsification criteria | **FALSIFICATION CRITERIA.** A pilot (and any mission) is falsified by any single occurrence of: scaffolded data; fake test runs; test cheating; TDD/DDD violations; anything specified NOT-to-do that is done; anything told TO-do that is not done; chain-of-command violations (an agent exercising an authority its seat does not hold, or bypassing a level of the authority lattice); and questions addressed directly to humans by loops that do NOT hold question authority (a One-Prompt Machine violation). | 2026-07-24 | Closed — carries V's direct authority | Task 6.4 (acceptance-run falsification checklist) |
| R6 | Four Loops / Grand Loop | **FOUR LOOPS / GRAND LOOP LAW.** REQUIREMENTS ENGINEERING, ARCHITECTURE, PROGRAMMING, and QA are each loops; the mission is the Grand Loop, terminating ONLY when REQUIREMENTS ENGINEERING and ARCHITECTURE are BOTH satisfied with the outcome. Inner loops keep their own §10 convergence bounds; satisfaction flows upward PROG/QA -> ARCH/REQ; V's final acceptance is exercised through the REQUIREMENTS surface. No loop other than REQ∧ARCH satisfaction closes a mission. | 2026-07-24 | Closed — carries V's direct authority | Task 4.6 (install loops + Grand Loop stop condition); Appendix B (two new markers) |
| R7 | Intake loop-ownership election | **LOOP-OWNERSHIP ELECTION AT INTAKE.** In the initial prompt that invokes Claude's Main Orchestrator skill, Claude prompts the user to answer which model(s) — one or more — own which loop (REQUIREMENTS ENGINEERING / ARCHITECTURE / PROGRAMMING / QA). The user answers; only then does Claude kick the Heartbeat Protocol off. Answers instantiate the mission's `loop_ownership` map in the model-law roster; the election is part of the H0 design-question surface (no new V-facing surface). Explicit delegation ("you pick") is legal and recorded. | 2026-07-24 | Closed — carries V's direct authority | Task 3.8 (Orchestrator intake sequence); Task 3.12 (roster `loop_ownership` block + election law) |
| R9 | Final-push approval (6.5) | **PUSH PRE-APPROVED, TARGET `origin/dev`.** V granted the Task 6.5 push approval in advance ("you can push it to origin/dev when done", 2026-07-24), conditional on the Phase 6 wave completing and 6.4's checklist verifying. Scope: repo files only (spine, adapters, node contracts, plan, blueprint, reports, packets) staged explicitly — the heavily dirty tree's unrelated files are NOT swept in; AppData/session-root changes are outside the repo and travel via their `.pre-v3.bak`-backed files, not the push. Claude-Router inspects live git state before choosing safe push mechanics; a materially ambiguous branch situation (e.g., the push would carry unrelated commits into dev) escalates to V with a recommendation instead of guessing. | 2026-07-24 | Closed — carries V's direct authority | Task 6.5 (approval-request packet becomes an approval RECORD documenting this grant) |
| R8 | Reporting & traceability | **REPORTING & TRACEABILITY LAW.** The new harness documents itself like the old one — reports mandatory, traceability non-negotiable. Ticket trace invariant (no trace, no Done); cockpit receipts after every board-mutation batch; mission/phase reports written by Claude-Router to `.hermes/reports/<mission>/` as append-only artifacts, with the R6 SATISFIED markers referencing the closure report; loop reports with convergence counters; incomplete report chains fail acceptance (R5 tie-in); fabricated/backfilled reports are evidence violations. | 2026-07-24 | Closed — carries V's direct authority | Task 4.7 (install R8 spine section); execution-contract phase-gate step 1 (durable phase reports); Task 6.4 (report-chain acceptance check) |

---

## Glossary

- **Node** (Pillar 1): a bounded job with **no graph knowledge** — it receives its ticket-state block, its immediate upstream artifact path(s), its handoff marker, and its stop conditions, and nothing else. A node never sees the full mission route or sibling missions. A per-ticket **file contract** (Allowed / Read-only / Forbidden / Verification) *is* the node contract.
- **Edge** (Pillar 2): a **data-flow** connection — it carries a specific artifact from one node to the next, not a vague "and then." A gate that consumes only an upstream artifact (not another reviewer's verdict) is an edge that can be parallelized.
- **Router** (Pillar 3): a dispatcher that **does no work.** In this graph, `Claude-Router` is the **Main Orchestrator** seat held by Claude Code (Fable): it launches everything, reads typed state only, picks the next edge, and writes only routing metadata (assignment, `status`, `authority_epoch`); it is forbidden from content judgment. Distinct from `Hermes-Verifier` (held by Hermes, a different model family per ruling R1), which performs independent evidence review, holds Kanban board custody/crafting and Manual QA runs, and writes a verdict field the Router consumes.
- **State** (Pillar 4): the single typed ticket-state object (§3.1) — one canonical block per ticket (native Kanban fields, or the first comment updated by replacement), holding `risk_tier`, `status`, `owner`, `contract`, `worktree`, `authority_epoch`, `rework_round`, `wakes_since_transition`, `waiting_since`, `escalation_target`, `comments_read_through`, and the two later-added additive fields `planning_tier` (planning-chain depth `0|1|2`, added by Phase 4 Task 4.2 — distinct from `risk_tier`) and `self_unblock_enabled` (V-toggled worker-self-unblock capability, default `false`, added by Phase 3 Task 3.11). The block is **forward-compatible**: additive fields may be appended by a later phase without breaking earlier readers, which key only on the fields present. All other carriers (`.hermes/live` files, host task lists) are **read-only projections** regenerated from it.
- **Diamond** (Pillar 5): a **split → parallel → merge** topology. The canonical case is the planning diamond — `C2` Plan.md → **{`H2` Hermes review ∥ `G3` Grok review}** → `H3` merge/reconcile (adjudicates disagreements only). The review diamond fans out 2–3 diverse-lens reviewers and merges disagreements rather than re-verifying everything.
- **Tier / `risk_tier`**: the persisted, set-once ticket classification **`low | medium | high`** that deterministically selects the review path (§3.2/§3.3) and is subject to the immutable high-risk floor (D3). Distinct from **`planning_tier`** (the **planning tiers 0/1/2** of §3.5.2: Tier 0 docs/mechanical → Plan→H6 direct; Tier 1 routine feature → plan + parallel review diamond; Tier 2 architecture/high-risk → full chain), which classifies *planning-phase* depth rather than a ticket's review path. `risk_tier` and `planning_tier` are separate state fields and must never be conflated into one persisted value; Phase 4 Task 4.2 assigns `planning_tier` at H0, `risk_tier` is assigned at H0/H6 for the review path.
- **worktree** (Pillar 6): an isolated `git worktree add` directory — a real, separate checkout for a parallel lane, tracked in state as `worktree: {path, branch, merge_status}`.
- **workdir**: the generic current dirty working tree (uncommitted changes in the main checkout). The corpus historically used one word for both; this migration keeps the terms **distinct** — "worktree" always means the isolated `git worktree` directory, "workdir" always means the ordinary dirty tree.
- **`max_concurrent_heavy`**: the single spine-declared semaphore parameter bounding concurrent heavy commands, referenced by pointer everywhere. Laptop = `1`.
- **V DECISIONS PACKET**: the batched consolidation of V-owned decisions, flushed as ONE packet when **≥3 decisions pending, OR any decision pending >4h, OR an entire lane is frozen on it, OR V asks.** Each row: card, decision needed, evidence link, smallest yes/no. It replaces the One-Prompt-at-a-Time Relay Law for decisions.

## Phase 1 — Convergence Fixes (stop the void-polling)

**Goal of this phase (blueprint §3.4, §4 Phase 1):** install the cycle-convergence bounds and batched-approval mechanics that end the Hermes↔worker void-polling, with no structural restructure. Six tasks add binding cycle laws to the shared spine and mechanism-level detail to the Hermes Lite skill and the Codex adapter.

**File legend (exact paths — every path below was read and verified to exist):**

- **SPINE** = `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- **LITE** = `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
- **CODEX-ADAPTER** = `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md`
- Git-Bash forms used in Verify commands: `"C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"`, `"C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"`, `"C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"`.

**Execution ordering (hard requirement):** run **Task 1.1 first**. Task 1.1 creates the new spine section `## Cycle convergence and escalation laws`. Tasks **1.2, 1.4 (spine edit), 1.5 (spine edit)** each append a `###` subsection into that section by inserting immediately before the pre-existing heading `## Blocked format`, so they must run after 1.1. LITE-only and Codex-adapter edits have no cross-task dependency.

**Fencing convention for this phase:** several insertion blocks below are shown wrapped in a **four-backtick** fence because their literal document content itself contains a three-backtick ` ```text ` template (the spine stores comment templates as ` ```text ` fenced blocks). When a step says "insert the block shown between the four-backtick fence," the executor reproduces everything inside it verbatim — including the nested ` ```text ` … ` ``` ` template, which is real document text.

---

### Task 1.1: Add REWORK ROUND cap to spine CHANGES REQUESTED templates and the escalation-at-cap law

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** medium (spine-law change: introduces a new binding convergence counter and escalation edge; does not touch or weaken any §1.3 preserved safety law).

**Review gate:** (proportional) medium → 1 independent reviewer (Claude or Grok, read-only) + Hermes diff review.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: grep -c "REWORK ROUND: n of 3" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md" (>=3); grep -c "## Cycle convergence and escalation laws" "<same>" (=1); grep -c "V STEERING REQUIRED" "<same>" (>=1)
Human review required: no
```

**Steps:**
- [ ] Read SPINE to confirm the anchors below are still exact quotes.
- [ ] **Edit A** — add the counter field to the `PEER REVIEW CHANGES REQUESTED` template. Replace this exact block:
```text
PEER REVIEW CHANGES REQUESTED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: RED
```
  with:
```text
PEER REVIEW CHANGES REQUESTED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: RED
- REWORK ROUND: n of 3
```
- [ ] **Edit B** — add the counter field to the `HERMES CHANGES REQUESTED` template. Replace this exact block:
```text
HERMES CHANGES REQUESTED:
- ticket:
- verdict: return_to_ready
- original worker/session:
```
  with:
```text
HERMES CHANGES REQUESTED:
- ticket:
- verdict: return_to_ready
- REWORK ROUND: n of 3
- original worker/session:
```
- [ ] **Edit C** — record the counter on the stage-review CHANGES REQUESTED. Replace this exact text:
```text
stage-contract verdict, exact findings/required changes, original owner/session,
and whether the next stage remains blocked. Step 6 records
```
  with:
```text
stage-contract verdict, exact findings/required changes, original owner/session,
current `REWORK ROUND: n of 3`, and whether the next stage remains blocked. Step 6 records
```
- [ ] **Edit D** — create the new convergence section and the rework-cap law. Insert the block shown between the four-backtick fence immediately **before** the heading line `## Blocked format` (that heading is unique in SPINE), leaving one blank line between the inserted block and `## Blocked format`:
````text
## Cycle convergence and escalation laws

Spine-level invariant: no cycle may exist without a convergence bound, and no
waiting state may exist without an owner, a deadline, and an escalation edge.
The laws in this section are universal; the agent adapters and the Hermes Lite
and Full skills reference them and add only mechanism-level detail.

### Rework round cap and escalation-at-cap

`rework_round` is a per-ticket counter that starts at 0 and increments by 1 on
every CHANGES REQUESTED of any kind — `PEER REVIEW CHANGES REQUESTED`,
`HERMES CHANGES REQUESTED`, `HERMES STAGE REVIEW CHANGES REQUESTED`, and
`HUMAN REVIEW CHANGES REQUESTED`. The current value is written as
`REWORK ROUND: n of 3` in every CHANGES REQUESTED comment.

- The cap is 3. When `rework_round` reaches 3 (`REWORK ROUND: 3 of 3`) the loop
  freezes: Hermes places a routing hold so no worker reclaims the card (in
  typed-state terms `status` becomes `waiting_human`,
  `escalation_target: v_packet`, `waiting_since` set) and posts
  `V STEERING REQUIRED` into the `V DECISIONS PACKET`.
- A frozen loop never auto-approves and never weakens any safety, product-truth,
  or human gate. Convergence caps only stop unbounded revise → re-review; a
  frozen loop escalates, it never self-clears.
- After V steers, Hermes may reset `rework_round` to 0 only under the unblock
  reset ceiling (at most twice per ticket) defined in the adapter blocked-ticket
  recovery.

```text
V STEERING REQUIRED:
- ticket:
- reason: rework_round cap (3 of 3) reached | unblock reset ceiling (2 of 2) exceeded | chatter breaker tripped
- rework_round: 3 of 3
- loop frozen: yes (routing hold placed)
- recurring findings that did not converge:
- last three CHANGES REQUESTED comment cursors:
- smallest steering question / yes-no for V:
- routed into: V DECISIONS PACKET
- comments read through:
```
````

**Verify:**
- `grep -c "REWORK ROUND: n of 3" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=3`
- `grep -c "## Cycle convergence and escalation laws" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -c "V STEERING REQUIRED" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "rework_round" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`

**Acceptance:**
- Both fenced spine CHANGES REQUESTED templates (`PEER REVIEW CHANGES REQUESTED`, `HERMES CHANGES REQUESTED`) and the stage-review CHANGES REQUESTED prose carry `REWORK ROUND: n of 3`.
- The spine has a new `## Cycle convergence and escalation laws` section whose first subsection defines the cap of 3, the freeze-and-escalate behavior, and the `V STEERING REQUIRED` template.
- The law states a frozen loop escalates and never auto-approves or weakens a safety/product/human gate (no §1.3 law weakened).
- `rework_round` is named as the per-ticket counter incremented on every CHANGES REQUESTED kind.

---

### Task 1.2: Add the chatter breaker as a universal spine cycle law

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Depends on:** Task 1.1 (creates the `## Cycle convergence and escalation laws` section header).

**Risk tier:** medium (spine-law change: new universal freeze/escalation trigger generalizing the Lite human-block circuit breaker; no §1.3 law weakened).

**Review gate:** (proportional) medium → 1 independent reviewer + Hermes.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: grep -c "### Chatter breaker" "<SPINE>" (=1); grep -c "6 comment exchanges" "<SPINE>" (>=1); grep -c "wakes_since_transition" "<SPINE>" (>=1)
Human review required: no
```

**Steps:**
- [ ] Read SPINE and confirm Task 1.1 has already created `## Cycle convergence and escalation laws` and that `## Blocked format` is still a unique heading.
- [ ] **Edit** — append the chatter-breaker subsection to the convergence section by inserting the block below immediately **before** the heading line `## Blocked format` (this places it after Task 1.1's rework-cap subsection and inside the `## Cycle convergence and escalation laws` section). Leave one blank line before `## Blocked format`:
```text
### Chatter breaker

The chatter breaker generalizes the Lite human-block circuit breaker to every
two-party exchange on a card (Hermes↔worker, Hermes↔reviewer, Hermes↔watcher).
It trips when a single card accumulates, with no `status` and no
`authority_epoch` transition:

- 6 comment exchanges between the same two parties, OR
- 24 router wakes — `wakes_since_transition` reaches 24.

On trip, Hermes freezes the card (routing hold; typed-state `status` becomes
`waiting_human`, `escalation_target: v_packet`, `waiting_since` set) and posts
`V STEERING REQUIRED` into the `V DECISIONS PACKET`. `wakes_since_transition`
resets to 0 on any real `status` or `authority_epoch` transition. This is the
law that catches an unproductive Hermes↔worker loop that the silence-only
liveness escalation never trips.
```

**Verify:**
- `grep -c "### Chatter breaker" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -c "6 comment exchanges" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "wakes_since_transition" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -ci "chatter breaker" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=2`

**Acceptance:**
- The spine defines a `### Chatter breaker` law with both thresholds: 6 comment exchanges OR 24 router wakes (`wakes_since_transition` reaches 24) with no `status`/`authority_epoch` transition.
- On trip it freezes the card and posts `V STEERING REQUIRED` into the `V DECISIONS PACKET`; it never auto-approves.
- The text states it generalizes the Lite human-block circuit breaker and covers Hermes↔worker/reviewer/watcher exchanges.
- `wakes_since_transition` is named as the counter and its reset condition (any real `status`/`authority_epoch` transition) is stated.

---

### Task 1.3: Amend the LITE wake-gate fingerprint spec — classify state-changing vs chatter comments and add wakes_since_transition

**Files:**
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`

**Risk tier:** medium (convergence-critical binding cycle mechanism — the wake gate is the void-polling root cause; a wrong fingerprint reintroduces "one review comment wakes another review forever").

**Review gate:** (proportional) medium → 1 independent reviewer + Hermes.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification: grep -c "wakes_since_transition" "<LITE>" (>=1); grep -c "state-changing" "<LITE>" (>=1); grep -c "chatter" "<LITE>" (>=1)
Human review required: no
```

**Steps:**
- [ ] Read LITE `### Tokenless change gate for the one-minute watcher` (numbered list, item 5) and the verification block that follows it; confirm both anchors below are exact.
- [ ] **Edit A** — replace item 5. Replace this exact line:
```text
5. Ignore the watcher's own routine comments in the base fingerprint or one review comment will wake another review forever. Status changes may intentionally cause one follow-up reconciliation tick.
```
  with this exact line (single physical line):
```text
5. Ignore the watcher's own routine comments in the base fingerprint, then classify every other new comment before waking the router. A comment is **state-changing** only when it transitions `status`, `authority_epoch`, or a handoff/stage marker (`WORKER CLAIM`, `READY FOR PEER REVIEW`, `READY FOR HERMES REVIEW`, `HERMES CHANGES REQUESTED`, `REWORK READY FOR HERMES REVIEW`, `HERMES DONE`, `HERMES BLOCKED`, `HERMES AUTHORIZED NEXT`, `HERMES AUTHORIZED ROUTE`, `V STEERING REQUIRED`, and the stage-gate markers). Every other comment — acknowledgements, restatements, discussion, status-quo pings — is **chatter** and must emit `{"wakeAgent": false}`; only a state-changing comment may set `{"wakeAgent": true}`, otherwise one review comment will wake another review forever. Maintain a per-card `wakes_since_transition` counter in detector state: increment it on every router wake that produced no `status`/`authority_epoch` transition, and reset it to 0 on any such transition. When `wakes_since_transition` reaches 24 on one card (or 6 two-party comment exchanges accumulate with no transition), stop waking and hand the card to the spine chatter breaker (`## Cycle convergence and escalation laws`) for freeze plus `V STEERING REQUIRED` escalation. A status change may still intentionally cause one follow-up reconciliation tick.
```
- [ ] **Edit B** — extend the wake-gate verification block. Replace this exact line:
```text
no new cron conversation/API-call entry appears for that unchanged tick
```
  with:
```text
no new cron conversation/API-call entry appears for that unchanged tick
chatter comment (no status/epoch transition) -> wakeAgent:false, wakes_since_transition increments
wakes_since_transition reaches 24 (or 6 no-transition exchanges) -> chatter breaker freeze + V STEERING REQUIRED
```

**Verify:**
- `grep -c "wakes_since_transition" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "state-changing" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "chatter" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -o "wakes_since_transition" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md" | wc -l` → expected `>=3`

**Acceptance:**
- LITE item 5 classifies each non-self comment as state-changing (enumerated markers) vs chatter, and only state-changing comments may set `{"wakeAgent": true}`.
- A per-card `wakes_since_transition` counter is defined with explicit increment (no-transition wake) and reset (any `status`/`authority_epoch` transition) rules.
- At 24 wakes / 6 no-transition exchanges the card is handed to the spine chatter breaker for freeze + `V STEERING REQUIRED`.
- The wake-gate verification block includes the two new chatter/transition assertions.

---

### Task 1.4: Define the V DECISIONS PACKET in the spine and carve decisions out of the LITE One-Prompt-at-a-Time law

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`

**Depends on:** Task 1.1 (spine section header) for the spine edit.

**Risk tier:** medium (spine-law change: introduces batched V-decision routing and repeals per-decision one-at-a-time relay; no §1.3 law weakened — the named-category escalation filter is preserved verbatim).

**Review gate:** (proportional) medium → 1 independent reviewer + Hermes.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md; C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification: grep -c "### V DECISIONS PACKET" "<SPINE>" (=1); grep -c "more than 4 hours" "<SPINE>" (>=1); grep -c "stage-prompt transport only" "<LITE>" (=1); grep -c "V DECISIONS PACKET" "<LITE>" (>=2)
Human review required: no
```

**Steps:**
- [ ] Read SPINE (confirm `## Cycle convergence and escalation laws` exists from Task 1.1 and `## Blocked format` is unique) and LITE `## One-Prompt-at-a-Time Relay Law` and `## Required Handoff Markers`.
- [ ] **Edit A (SPINE)** — append the V DECISIONS PACKET subsection to the convergence section by inserting the block shown between the four-backtick fence immediately **before** the heading line `## Blocked format` (after any earlier convergence subsections). Leave one blank line before `## Blocked format`:
````text
### V DECISIONS PACKET

V-owned decisions are not relayed one at a time. Hermes accumulates every
V-owned gate (the named-category escalation filter decides what qualifies:
provider spend, data writes, deletion, destructive git, architecture/scope,
reconstructed evidence, waiver, final acceptance, plus every rework-cap and
chatter-breaker `V STEERING REQUIRED` freeze and every H6 lane-plan approval)
and flushes them as ONE consolidated packet when any threshold is met:

- 3 or more decisions are pending, OR
- any single decision has been pending more than 4 hours, OR
- an entire lane is frozen on a pending decision, OR
- V asks.

```text
V DECISIONS PACKET:
- authority_epoch:
- flushed because: >=3 pending | pending >4h | lane frozen | V asked
- decisions:
  - card: <ticket id — title>
    decision needed: <one V-owned gate>
    evidence link: <artifact/comment path or URL>
    smallest yes/no: <the exact minimal question V answers>
    waiting_since: <timestamp>
  - card: <next...>
- lane-plan rows (H6 worktree approval): one row per lane —
  worktree path, branch, file contract (allowed/readonly/forbidden),
  merge order, closure/integration target
- comments read through:
```

A single V approval of an H6 lane-plan row covers every worktree create/use
inside that approved plan; destructive git operations (delete/rewrite/force)
remain individually V-gated. This packet replaces one-at-a-time relay for
decisions only — stage-prompt transport is unchanged.
````
- [ ] **Edit B (LITE)** — carve decisions out of the relay law. Replace this exact paragraph:
```text
At every external stage, Hermes gives V **one primary copy-paste prompt for the next necessary agent**. Do not flood V with prompts for all future stages.
```
  with:
```text
At every external stage, Hermes gives V **one primary copy-paste prompt for the next necessary agent**. Do not flood V with prompts for all future stages.

This law governs **stage-prompt transport only**. It does not apply to V-owned decisions: provider spend, data writes, deletion, destructive git, architecture/scope, reconstructed evidence, waiver, final acceptance, and rework-cap or chatter-breaker `V STEERING REQUIRED` freezes and H6 lane-plan approvals are never relayed one at a time. Hermes accumulates them and flushes a single `V DECISIONS PACKET` per the spine `## Cycle convergence and escalation laws` thresholds (>=3 pending, any pending more than 4 hours, a frozen lane, or V asks).
```
- [ ] **Edit C (LITE)** — register the new markers in the handoff list. Replace this exact block:
```text
HUMAN REVIEW PASSED | CHANGES REQUESTED
HERMES DONE | HERMES BLOCKED
```
  with:
```text
HUMAN REVIEW PASSED | CHANGES REQUESTED
HERMES DONE | HERMES BLOCKED
V DECISIONS PACKET
V STEERING REQUIRED
```

**Verify:**
- `grep -c "### V DECISIONS PACKET" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -c "more than 4 hours" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "lane-plan rows" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -c "stage-prompt transport only" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `1`
- `grep -c "V DECISIONS PACKET" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=2`

**Acceptance:**
- The spine defines a `### V DECISIONS PACKET` with all four flush thresholds (>=3 pending, any pending >4h, a frozen lane, or V asks) and a template with per-row fields card / decision needed / evidence link / smallest yes/no / waiting_since.
- The template includes the H6 lane-plan row and states one V approval covers all worktree create/use in that plan while destructive git stays individually gated (matches §6.3.1 ruling 2).
- LITE's One-Prompt-at-a-Time law is explicitly scoped to stage-prompt transport only and routes V-owned decisions to a single `V DECISIONS PACKET`.
- The named-category escalation filter is preserved (not narrowed) and `V DECISIONS PACKET`/`V STEERING REQUIRED` appear in the LITE marker list.

---

### Task 1.5: Add HERMES AUTHORIZED ROUTE batch authorization to spine, LITE, and the Codex adapter

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md`

**Depends on:** Task 1.1 (spine section header) for the spine edit.

**Risk tier:** medium (spine-law change: makes one route authorization cover an H6-approved DAG and demotes per-node `HERMES AUTHORIZED NEXT` to a risk-triggered exception; Codex is the claimant so its marker recognition must change. No §1.3 law weakened; per-node re-auth is still mandatory on any new risk signal or important operation).

**Review gate:** (proportional) medium → 1 independent reviewer + Hermes.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md; C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md; C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md
Forbidden: all other files
Verification: grep -c "### Batch route authorization: HERMES AUTHORIZED ROUTE" "<SPINE>" (=1); grep -c "HERMES AUTHORIZED ROUTE" "<LITE>" (>=2); grep -c "HERMES AUTHORIZED ROUTE" "<CODEX-ADAPTER>" (>=1)
Human review required: no
```

**Steps:**
- [ ] Read SPINE (confirm Task 1.1 section exists and `## Blocked format` is unique), LITE (`### Explicit one-prompt override` item 5, `## Required Handoff Markers`), and CODEX-ADAPTER (`## Comment markers Codex must recognize`). Confirm anchors below are exact.
- [ ] **Edit A (SPINE)** — append the batch-route subsection to the convergence section by inserting the block shown between the four-backtick fence immediately **before** the heading line `## Blocked format` (after earlier convergence subsections). Leave one blank line before `## Blocked format`:
````text
### Batch route authorization: HERMES AUTHORIZED ROUTE

When a DAG has already been approved at H6, Hermes issues ONE
`HERMES AUTHORIZED ROUTE` covering the whole approved chain instead of a
per-node `HERMES AUTHORIZED NEXT` for each card. A worker may claim any Ready
card named in a current `HERMES AUTHORIZED ROUTE` for the current
`authority_epoch`.

Per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal on
a specific card: a genuine RED, a file-contract drift, an architecture/scope
boundary, or an IMPORTANT OPERATION (provider spend, data write, deletion,
destructive git, push/merge, or worktree create/use outside the approved lane
plan).

```text
HERMES AUTHORIZED ROUTE:
- authority_epoch:
- approved at: H6 self-audit PASS <cursor>
- tickets (deterministic order): <id — title>, <id — title>, ...
- per-lane heads and file contracts: <lane — allowed / forbidden>
- re-authorization still required for: RED | contract drift | architecture boundary | important operation
- comments read through:
```
````
- [ ] **Edit B (LITE)** — allow batch authorization in the one-prompt override. Replace this exact line:
```text
5. Codex works one card at a time and may claim only when the card is Ready **and** its latest applicable Hermes comment says `HERMES AUTHORIZED NEXT: <slice> <id>`.
```
  with:
```text
5. Codex works one card at a time and may claim only when the card is Ready **and** either its latest applicable Hermes comment says `HERMES AUTHORIZED NEXT: <slice> <id>` **or** the card is named in a current `HERMES AUTHORIZED ROUTE: <ticket list> epoch=<n>` covering the H6-approved DAG. Per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal (RED, contract drift, architecture/scope boundary, or an important operation).
```
- [ ] **Edit C (LITE)** — register the markers in the handoff list. Replace this exact block:
```text
REWORK READY FOR HERMES REVIEW
READY FOR EXTERNAL REVIEW
```
  with:
```text
REWORK READY FOR HERMES REVIEW
HERMES AUTHORIZED NEXT
HERMES AUTHORIZED ROUTE
READY FOR EXTERNAL REVIEW
```
- [ ] **Edit D (CODEX-ADAPTER)** — make Codex recognize batch authorization. Replace this exact block:
```text
HERMES CHANGES REQUESTED
READY FOR HUMAN REVIEW
```
  with:
```text
HERMES CHANGES REQUESTED
HERMES AUTHORIZED NEXT
HERMES AUTHORIZED ROUTE
READY FOR HUMAN REVIEW
```

**Verify:**
- `grep -c "### Batch route authorization: HERMES AUTHORIZED ROUTE" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -c "HERMES AUTHORIZED ROUTE" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=2`
- `grep -c "HERMES AUTHORIZED ROUTE" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=2`
- `grep -c "HERMES AUTHORIZED ROUTE" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"` → expected `>=1`

**Acceptance:**
- The spine defines `### Batch route authorization: HERMES AUTHORIZED ROUTE` with a template (authority_epoch, H6-approval cursor, ordered ticket list, per-lane contracts, re-auth triggers).
- The spine and LITE both state per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal (RED / contract drift / architecture boundary / important operation).
- LITE item 5 accepts a card named in a current `HERMES AUTHORIZED ROUTE: <ticket list> epoch=<n>` as valid claim authority.
- The Codex adapter marker-recognition list includes `HERMES AUTHORIZED NEXT` and `HERMES AUTHORIZED ROUTE`.

---

### Task 1.6: Define the unblock reset ceiling (2 per ticket) in the LITE blocked-ticket recovery

**Files:**
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`

**Risk tier:** medium (convergence-critical binding bound: today `unblock` resets the failure streak with no ceiling — the documented void-polling amplifier; the ceiling must never weaken a safety gate, it only bounds retries).

**Review gate:** (proportional) medium → 1 independent reviewer + Hermes.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification: grep -c "Unblock reset ceiling" "<LITE>" (>=1); grep -c "twice per ticket" "<LITE>" (>=1)
Human review required: no
```

**Steps:**
- [ ] Read LITE `### Board-closure goals and review-loop Triage` and locate the paragraph that ends with the `blocked-ticket-approval-and-retry-recovery.md` reference (the only occurrence of that filename in LITE).
- [ ] **Edit** — add the ceiling rule. Replace this exact text:
```text
close an explicitly approved duplicate chain as provenance-preserving administrative Done only when no implementation is claimed; and authorize queued successors without creating a second writer. The full procedure is in [`references/blocked-ticket-approval-and-retry-recovery.md`](references/blocked-ticket-approval-and-retry-recovery.md).
```
  with:
```text
close an explicitly approved duplicate chain as provenance-preserving administrative Done only when no implementation is claimed; and authorize queued successors without creating a second writer. The full procedure is in [`references/blocked-ticket-approval-and-retry-recovery.md`](references/blocked-ticket-approval-and-retry-recovery.md).

**Unblock reset ceiling (2 per ticket).** `unblock` resets the dispatcher failure streak and, with it, the ticket's `rework_round`. It may do so at most **twice per ticket**; track the count durably per card. The third `unblock`/reset request must not be applied: instead freeze the card (place a routing hold; typed-state `status` becomes `waiting_human`, `escalation_target: v_packet`, `waiting_since` set) and post `V STEERING REQUIRED` into the `V DECISIONS PACKET`, naming the reset count and the recurring blocker. Never reset a counter to manufacture unbounded retries; the ceiling is a convergence bound, not a safety or product-truth waiver.
```

**Verify:**
- `grep -c "Unblock reset ceiling" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "twice per ticket" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -ci "reset ceiling" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`

**Acceptance:**
- LITE states `unblock` (which resets the failure streak and `rework_round`) may occur at most twice per ticket, tracked durably.
- The third reset is refused and instead freezes the card and posts `V STEERING REQUIRED` into the `V DECISIONS PACKET`.
- The rule explicitly states the ceiling is a convergence bound, not a safety/product-truth waiver (no §1.3 law weakened).

---

### Phase 1 exit criteria (blueprint §4 Phase 1 acceptance)

- A simulated non-converging rework loop reaches `REWORK ROUND: 3 of 3`, freezes, and emits `V STEERING REQUIRED` into a `V DECISIONS PACKET` — provably within the bound (Tasks 1.1, 1.4).
- A simulated Hermes↔worker chatter loop with no `status`/`authority_epoch` transition trips at 6 exchanges / 24 wakes (`wakes_since_transition`) and freezes + escalates (Tasks 1.2, 1.3).
- A pre-approved 5-ticket chain runs under a single `HERMES AUTHORIZED ROUTE` with no per-node `HERMES AUTHORIZED NEXT` unless a new risk signal fires (Task 1.5).
- Repeated `unblock` on one ticket is bounded at 2; the third freezes + escalates (Task 1.6).
- All six edits are additive; no §1.3 preserved law is weakened, and every freeze escalates rather than auto-approving.

## Phase 2 — Typed State

**Goal (blueprint §3.1, §4 Phase 2):** collapse the ≥8 parallel state carriers into one canonical typed ticket-state object, kill the 11-meaning overload of `blocked`, persist `risk_tier` at H6 with a path-matches-tier self-audit and an immutable high-risk floor, declare each node's reads/writes, and demote `.hermes/live` files and host task lists to regenerated projections.

**Files touched in this phase (all confirmed to exist):**
- `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (spine)
- `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md`
- `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md`
- `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md`

**V's rulings that bind this phase (blueprint §6.3.1):** risk_tier is proportional, persisted, auditable, set at ticketization, with an immutable high-risk floor and an H6 self-audit verifying path-matches-tier (ruling 3). Nothing is pruned or deleted in this phase (ruling 4) — Phase 2 only demotes live/task-list carriers to projections *in text*; it deletes no files.

**Preservation notes (blueprint §1.3):** the blocker-type taxonomy (§1.3.6) and the AUTHORITY EPOCH monotonic V/cockpit-only writer law (§1.3.5) are PRESERVED. Task 2.2 keeps the `blocker type:` enum verbatim and only layers a status mapping on top of it; task 2.4 restates (never modifies) the authority-epoch write-control law as a per-node declaration.

**Path shorthand used in Verify commands below (Git-Bash absolute, forward-slash):**
- `SPINE` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
- `CODEX` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md`
- `CLAUDE` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md`
- `GROK` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md`

Each Verify command spells the full path out; the shorthand is only for reading convenience.

---

### Task 2.1: Add the canonical Ticket state contract section to the spine

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** medium (spine-law change: introduces the single canonical state object; touches no safety law or the high-risk floor)

**Review gate:** medium → 1 independent reviewer + Hermes

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification:
  grep -cF "## Ticket state contract" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected: 1
  grep -cF "wakes_since_transition" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"      # expected: >=1
  grep -F "updated **by replacement**" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected: one matching line
Human review required: no
```

**Steps:**
- [ ] Open the spine and locate the section heading `## Binding stage and coding law` (it immediately follows the `## Operating model` section, whose last paragraph begins "V should only be interrupted for real product, architecture, security...").
- [ ] Insert the following complete new section **immediately before the heading `## Binding stage and coding law`** (i.e. between the Operating-model closing paragraph and that heading), so the state contract is the first thing after the operating model:

`````text
## Ticket state contract

Every ticket carries exactly one canonical typed state object. It is the single
source of truth for routing; every other carrier (`.hermes/live/` files, host
task lists, watcher fingerprints, compaction checkpoints) is a read-only
projection regenerated from it.

Storage rule: if Kanban exposes native custom fields, the state object lives in
those fields. If it does not, the state object is written as the ticket's FIRST
comment and is updated **by replacement** of that one comment — never appended,
never smeared across the thread, never duplicated in a later comment.

```yaml
state:
  ticket: <id>
  risk_tier: low | medium | high            # set ONCE at intake/H6; drives routing deterministically
  status: queued | ready | working
        | waiting_review | waiting_hermes | waiting_product_proof
        | waiting_human | waiting_dependency | waiting_resource
        | failed_tooling | changes_requested | done | archived
  owner: { agent: codex|claude|grok, session: <id> }
  contract:
    allowed: [...]
    readonly: [...]
    forbidden: all_others
    verification: [...]
    human_review: yes|no
  worktree: { path: <.worktrees/lane-x>, branch: <b>, merge_status: none|pending|merged }
  authority_epoch: <int>                     # monotonic; V/cockpit-only writer
  rework_round: <int>                        # convergence counter; cap = 3
  wakes_since_transition: <int>              # chatter counter
  waiting_since: <timestamp>                 # every waiting_* status carries it
  escalation_target: hermes | v_packet       # every waiting_* status carries it
  comments_read_through: <cursor>
```

The `status` enum replaces the overloaded word `blocked`. A ticket status is
never a bare `blocked`; every former "blocked" meaning maps to a specific
`waiting_*` status (or `changes_requested`/`failed_tooling`) per the mapping
table in "## Blocked format". Which node may read or write which field is
declared per node in each agent adapter; `risk_tier` and `authority_epoch` are
Hermes/cockpit-only writes.

This block is **forward-compatible**: it lists the twelve top-level fields
installed now, and later phases MAY append additional additive fields without
breaking earlier readers (which key only on the fields present). Two such fields
are added downstream — `planning_tier` (planning-chain depth `0|1|2`, added by
Phase 4 Task 4.2, distinct from `risk_tier`) and `self_unblock_enabled`
(V-toggled worker-self-unblock capability, default `false`, added by Phase 3
Task 3.11). Do not pre-add them here; they are named only so the schema is known
to be open for additive extension.
`````

**Verify:**
- `grep -cF "## Ticket state contract" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -cF "wakes_since_transition" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -cF "escalation_target: hermes | v_packet" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -F "updated **by replacement**" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected: one matching line

**Acceptance:**
1. A new top-level `## Ticket state contract` section exists in the spine, placed before `## Binding stage and coding law`.
2. The section contains the complete YAML state block with all **12 top-level field lines** (`ticket`, `risk_tier`, `status`, `owner`, `contract`, `worktree`, `authority_epoch`, `rework_round`, `wakes_since_transition`, `waiting_since`, `escalation_target`, `comments_read_through` — count them: twelve top-level keys). The block is forward-compatible; the two later additive fields `planning_tier` (Phase 4 Task 4.2) and `self_unblock_enabled` (Phase 3 Task 3.11) are NOT present at this task and are added by their own tasks.
3. The storage rule states native-fields-first, else first-comment-updated-by-replacement.
4. The section names the state object as the single source of truth and calls all other carriers projections.

---

### Task 2.2: Replace the `blocked` status vocabulary with `waiting_*` and add the 11-meaning mapping table

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md`

**Risk tier:** medium (spine-law change touching the safety-relevant BLOCKED mechanism, but the blocker-type taxonomy is preserved verbatim and the destructive/secret halt semantics are preserved via mapping row 11 → `waiting_human` + `v_packet`; no safety law is weakened)

**Review gate:** medium → 1 independent reviewer + Hermes

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md
Forbidden: all other files
Verification:
  grep -cF "Blocked-meaning → status mapping" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"                                             # expected: 1
  grep -cF "blocker type: dependency | process | safety | architecture | file_contract | verification | session_continuity" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected: 1 (taxonomy preserved)
  grep -cF "- state: working | awaiting_peer_review" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"                                        # expected: 0 (old enum gone)
  grep -c "mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"                                                                     # expected: >=1
  grep -c "mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md"                                                                    # expected: >=1
  grep -c "mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"                                                                      # expected: >=1
Human review required: no
```

**Steps:**

- [ ] **(spine) Replace the Heartbeat template status line.** In the `### Heartbeat` template, find the exact line:
  ```text
  - state: working | awaiting_peer_review | awaiting_hermes | awaiting_human | blocked | idle | stalled
  ```
  and replace it with (renames the label to the canonical `status` field and adopts the canonical enum):
  ```text
  - status: queued | ready | working | waiting_review | waiting_hermes | waiting_product_proof | waiting_human | waiting_dependency | waiting_resource | failed_tooling | changes_requested | done | archived
  ```

- [ ] **(spine) Extend the BLOCKED template.** In the `## Blocked format` section, find the exact line inside the template:
  ```text
  - proposed smallest unblock:
  ```
  and insert these three lines **immediately before** it (keep the existing `- blocker type:` line unchanged above it):
  ```text
  - resulting status: waiting_dependency | waiting_hermes | waiting_review | waiting_product_proof | waiting_human | waiting_resource | failed_tooling | changes_requested
  - escalation_target: hermes | v_packet
  - waiting_since: <timestamp>
  ```

- [ ] **(spine) Add the mapping subsection.** In the `## Blocked format` section, find the paragraph that begins:
  ```text
  Use Blocked only for a true blocker: forbidden files, destructive data,
  ```
  and insert the following complete new subsection **immediately after that paragraph** (after the sentence ending "Local friction is not a goal blocker."):

`````text
### Blocked-meaning → status mapping

`<AGENT> BLOCKED` is a **marker that requests a transition**, never a Kanban
status by itself. The word "blocked" previously carried eleven distinct
documented meanings; each now maps to exactly one typed `status`:

| # | Documented "blocked" meaning | New `status` | escalation_target |
|---|---|---|---|
| 1 | Missing/undone dependency or prerequisite ticket (`blocker type: dependency`; `GOAL BLOCKED` on an unmet prerequisite) | `waiting_dependency` | hermes |
| 2 | Contradictory or absent routing/process decision needing Hermes (`blocker type: process`) | `waiting_hermes` | hermes |
| 3 | Forbidden-file or file-ownership conflict needing a contract repair (`blocker type: file_contract`) | `waiting_hermes` | hermes |
| 4 | Lost CLI session continuity awaiting `WORKER CONTINUITY OVERRIDE` (`blocker type: session_continuity`) | `waiting_hermes` | hermes |
| 5 | "Waiting for Hermes review" mislabelled as BLOCKED | `waiting_hermes` | hermes |
| 6 | Intentional review gate after `READY FOR PEER REVIEW` (`review-required`/`needs_input`) | `waiting_review` | hermes |
| 7 | Recurrence-cap Triage or CHANGES REQUESTED rework return | `changes_requested` | hermes |
| 8 | Verification impossible with the current tooling/environment (`blocker type: verification`) | `failed_tooling` | hermes |
| 9 | Heavy-command or resource-contention wait (serialize heavy builds; `max_concurrent_heavy`) | `waiting_resource` | hermes |
| 10 | Product-truth gate awaiting live app/API/DB/browser evidence | `waiting_product_proof` | hermes |
| 11 | Human or important-operation decision gate — safety, architecture, provider spend, product-data write, destructive git, waiver, or final acceptance (`blocker type: safety`/`architecture`; `IMPORTANT OPERATION`; human-block circuit breaker) | `waiting_human` | v_packet |

Every `waiting_*` status records `waiting_since` and `escalation_target`. The
`blocker type:` taxonomy above is preserved unchanged; it now classifies *why*
the ticket entered its mapped `waiting_*` status.
`````

- [ ] **(Codex adapter) Add the marker-vs-status note.** In `## Non-negotiables`, find the exact bullet:
  ```text
  - Codex never marks Done, pushes without V approval, deletes database/product data without specific approval, or creates fake runtime data.
  ```
  and insert this bullet **immediately before** it:
  ```text
  - A `CODEX BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
  ```

- [ ] **(Claude adapter) Add the marker-vs-status note.** In `## Non-negotiables`, find the exact bullet:
  ```text
  - Claude never marks Done, pushes without V approval, deletes database/product data, creates fake runtime data, or crosses file contracts.
  ```
  and insert this bullet **immediately before** it:
  ```text
  - A `CLAUDE BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
  ```

- [ ] **(Grok adapter) Add the marker-vs-status note.** In `## Non-negotiables`, find the exact bullet:
  ```text
  - Grok never marks Done, pushes without V approval, deletes database/product data, creates fake runtime data, or crosses file contracts.
  ```
  and insert this bullet **immediately before** it:
  ```text
  - A `GROK BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
  ```

**Verify:**
- `grep -cF "Blocked-meaning → status mapping" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -cF "- state: working | awaiting_peer_review" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `0` (old heartbeat enum removed)
- `grep -cF "- status: queued | ready | working | waiting_review" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -cF "blocker type: dependency | process | safety | architecture | file_contract | verification | session_continuity" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1` (preserved taxonomy)
- `grep -cF "resulting status:" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "CODEX BLOCKED.*mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"` → expected `>=1`
- `grep -c "CLAUDE BLOCKED.*mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md"` → expected `>=1`
- `grep -c "GROK BLOCKED.*mapped .waiting_" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"` → expected `>=1`

**Acceptance:**
1. The spine's Heartbeat template no longer contains the old `state:` enum (`awaiting_peer_review | awaiting_hermes | ...`); it carries the canonical `status:` enum instead.
2. A `### Blocked-meaning → status mapping` subsection maps all 11 documented meanings to a `waiting_*`/`changes_requested`/`failed_tooling` status, with meanings 3, 4 (safety) and 11 routing to `v_packet`/`waiting_human`.
3. The `blocker type:` enum line is unchanged (7 values), proving the preserved taxonomy was not weakened.
4. Each of the three adapters carries a `<AGENT> BLOCKED`-marks-a-transition bullet pointing at the spine mapping table.

---

### Task 2.3: Persist `risk_tier` at H6 and add the path-matches-tier self-audit with the immutable high-risk floor

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** high (this edit *defines* the immutable high-risk floor and the review-path-matches-tier gate — it touches the high-risk floor definition, which the risk rubric classifies as high)

**Review gate:** high → full review ladder + V (per blueprint §6.3.1 ruling 3, V explicitly owns the high-risk floor and endorses the escalation edges; this change is presented to V in the V DECISIONS PACKET)

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification:
  grep -cF "immutable high-risk floor" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"          # expected: >=1
  grep -cF "risk_tier is set" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"                   # expected: >=1
  grep -F "the routed review path matches risk_tier" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected: one matching line
Human review required: yes
```

**Steps:**
- [ ] Open the spine and locate, in the `## Binding Hermes numbered-stage review gates` section, the exact paragraph:
  ```text
  The H6 self-audit verifies slice-to-ticket coverage, dependencies, Codex-only
  implementation ownership, file contracts, comment/rework rules, review/human
  gates, a deliberately small Ready queue, and the prohibition on database
  deletion without V's specific approval.
  ```
- [ ] Replace that entire paragraph with the following (it preserves the original sentence verbatim and adds the risk_tier assignment sentence plus the self-audit checklist):

`````text
At H6 Hermes assigns each ticket a persisted `risk_tier` (`low | medium | high`)
in its state object and records the reason. `risk_tier` is set once, is
auditable, and is a Hermes-only write; workers never write it.

The H6 self-audit verifies slice-to-ticket coverage, dependencies, Codex-only
implementation ownership, file contracts, comment/rework rules, review/human
gates, a deliberately small Ready queue, and the prohibition on database
deletion without V's specific approval. It additionally verifies, for every
ticket:

```text
[ ] risk_tier is set (low | medium | high) and its reason is recorded
[ ] the routed review path matches risk_tier:
      low    → direct Hermes diff review, same-cycle Done
      medium → 1 independent reviewer + Hermes
      high   → full review ladder + V (product-truth where applicable)
[ ] the immutable high-risk floor holds: any ticket touching persistence or
    migrations, provider spend, security/auth, scoring semantics, live/product
    data, or destructive/architectural work is risk_tier: high and was NOT
    tiered down
[ ] no ticket's file/contract paths contradict its assigned risk_tier
```

Record `HERMES STEP 6 SELF-AUDIT PASS` only when every line holds; otherwise
record `HERMES STEP 6 SELF-AUDIT CHANGES REQUESTED` naming the exact ticket and
the failed line.
`````

**Verify:**
- `grep -cF "immutable high-risk floor" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -cF "risk_tier is set (low | medium | high)" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -F "the routed review path matches risk_tier" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected: one matching line
- `grep -cF "provider spend, security/auth, scoring semantics" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -cF "prohibition on database" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1` (original preserved sentence still present)

**Acceptance:**
1. The H6 section states that Hermes assigns a persisted, auditable, Hermes-only `risk_tier` at H6 and workers never write it.
2. The H6 self-audit lists the four new checklist lines, including path-matches-tier and the immutable high-risk floor with its six protected categories.
3. The floor is worded as "is risk_tier: high and was NOT tiered down" (immutable, one-directional).
4. The original H6 assurances (slice-to-ticket coverage, database-deletion prohibition) survive verbatim — the change extends, never weakens, them.

---

### Task 2.4: Declare per-node state reads/writes in each adapter

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md`
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md`

**Risk tier:** medium (adds a per-node declaration to each adapter; it restates the existing AUTHORITY EPOCH V/cockpit-only write law and adds no new authority — it cannot tier down or weaken the epoch law, so it stays medium rather than high)

**Review gate:** medium → 1 independent reviewer + Hermes

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md
Forbidden: all other files
Verification:
  grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"    # expected: 1
  grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md"   # expected: 1
  grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"     # expected: 1
  grep -cF "never writes: { risk_tier, authority_epoch" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"    # expected: 1
Human review required: no
```

**Steps:**

- [ ] **(Codex adapter) Insert the reads/writes section.** Locate the heading `## Worktree and parallelism`. Insert this complete new section **immediately before that heading** (it follows the `## Comment markers Codex must recognize` section, which ends with the sentence "Do not skip earlier unresolved findings unless a newer comment explicitly supersedes them."):

`````text
## State reads/writes

Codex-worker declares its access to the typed ticket-state object:

```text
reads:  { contract, status, rework_round, authority_epoch }
writes: { status, worktree, evidence refs, comments_read_through, wakes_since_transition }
never writes: { risk_tier, authority_epoch, owner.agent }
```

Codex sets `owner.session` to its own CLI session only on `WORKER CLAIM`. It
moves `status` only among worker-legal values (`working`, and the `waiting_*` /
`changes_requested` / `failed_tooling` statuses it reaches via a `CODEX BLOCKED`
marker). It never writes `risk_tier` or `authority_epoch`; both are
Hermes/cockpit-only.
`````

- [ ] **(Claude adapter) Insert the reads/writes section.** Locate the heading `## Polling and live output`. Insert this complete new section **immediately before that heading** (it follows the `## Comment markers Claude must recognize` section):

`````text
## State reads/writes

Claude (planning-artifact worker or peer reviewer) declares its access to the
typed ticket-state object:

```text
reads:  { contract, status, rework_round, authority_epoch, risk_tier }
writes: { status, evidence refs (artifact paths), comments_read_through }
never writes: { risk_tier, authority_epoch, worktree, owner.agent }
```

Claude sets `owner.session` to its own CLI session only on `WORKER CLAIM`. As a
reviewer it records verdicts through comment markers, not by writing `risk_tier`.
It never writes `risk_tier`, `authority_epoch`, or `worktree`; all three are
Hermes/cockpit-only.
`````

- [ ] **(Grok adapter) Insert the reads/writes section.** Locate the heading `## Polling and live output`. Insert this complete new section **immediately before that heading** (it follows the `## Comment markers Grok must recognize` section):

`````text
## State reads/writes

Grok (research/review/slicing worker or peer reviewer) declares its access to
the typed ticket-state object:

```text
reads:  { contract, status, rework_round, authority_epoch, risk_tier }
writes: { status, evidence refs (artifact paths), comments_read_through }
never writes: { risk_tier, authority_epoch, worktree, owner.agent }
```

Grok sets `owner.session` to its own CLI session only on `WORKER CLAIM`. As a
reviewer it records verdicts through comment markers, not by writing `risk_tier`.
It never writes `risk_tier`, `authority_epoch`, or `worktree`; all three are
Hermes/cockpit-only.
`````

**Verify:**
- `grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"` → expected `1`
- `grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md"` → expected `1`
- `grep -cF "## State reads/writes" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"` → expected `1`
- `grep -cF "reads:  { contract, status, rework_round, authority_epoch }" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"` → expected `1`
- `grep -cF "writes: { status, worktree, evidence refs" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"` → expected `1`
- `grep -clF "never writes: { risk_tier, authority_epoch" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"` → expected: 3 files listed

**Acceptance:**
1. Each of the three adapters has one `## State reads/writes` section with an explicit `reads:` / `writes:` / `never writes:` block.
2. The Codex block matches the blueprint §3.1 exemplar exactly: reads `{contract, status, rework_round, authority_epoch}`, writes include `{status, worktree, evidence refs}`, and it never writes `risk_tier` or `authority_epoch`.
3. Claude and Grok (non-coding nodes) also read `risk_tier`, write no `worktree`, and never write `risk_tier`/`authority_epoch`.
4. Every adapter reaffirms that `risk_tier` and `authority_epoch` are Hermes/cockpit-only writes (the preserved epoch law restated, not modified).

---

### Task 2.5: Demote `.hermes/live` files and host task lists to regenerated projections in the spine

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** medium (spine-law change: reassigns source-of-truth authority away from live files/task lists; touches no safety law or the high-risk floor)

**Review gate:** medium → 1 independent reviewer + Hermes

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification:
  grep -cF "read-only projections regenerated" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected: >=1
  grep -F "the state object wins" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"                 # expected: one matching line
Human review required: no
```

**Steps:**
- [ ] Open the spine and locate, in the `## V-visible live-output channel` section, the exact closing sentence:
  ```text
  Live output does not replace comments. Claims, heartbeats, review requests, verdicts, Hermes decisions, and human verdicts still go to the ticket.
  ```
- [ ] Insert the following complete new subsection **immediately after that sentence** (and before the next heading `## Parallelism and file ownership`):

`````text
### Live files and host task lists are projections

Kanban plus the typed state object (see "## Ticket state contract") are the
sole authority for ticket state. `.hermes/live/` files and any host or desktop
task list are **read-only projections regenerated from that authority** — they
are never a source of truth, are never hand-authored as state, and may be
discarded and regenerated at any time. If a projection disagrees with the state
object, the state object wins and the projection is regenerated. No routing,
review, or Done decision may be made from a live file or a host task list.
`````

**Verify:**
- `grep -cF "read-only projections regenerated" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -F "the state object wins" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected: one matching line
- `grep -cF "sole authority for ticket state" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1`
- `grep -cF "Live output does not replace comments" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `1` (original text preserved above the new subsection)

**Acceptance:**
1. A `### Live files and host task lists are projections` subsection exists under `## V-visible live-output channel`.
2. It names Kanban + the typed state object as the sole authority and both `.hermes/live/` files and host/desktop task lists as read-only regenerated projections.
3. It states the conflict rule ("the state object wins and the projection is regenerated") and forbids routing/review/Done decisions from a projection.
4. The pre-existing live-output-does-not-replace-comments sentence is preserved directly above the new subsection.

---

### Phase 2 exit criteria (blueprint §4 Phase 2 acceptance)

- [ ] **Route-from-state-alone:** with the state object in place (2.1) and the `waiting_*` vocabulary + mapping table (2.2), Claude-Router can decide every routing action for a sample board by reading state blocks alone — no full-thread replay. Verify by walking a 5-ticket sample board and confirming each next-edge decision cites only fields from the state block.
- [ ] **At-a-glance distinguishability:** board rendering distinguishes `waiting_human` from `waiting_resource` (and from `waiting_review`, `waiting_dependency`, `waiting_product_proof`, `waiting_hermes`) — the single `blocked` bucket is gone. Verify: `grep -cF "waiting_human" SPINE` ≥ 1 and `grep -cF "waiting_resource" SPINE` ≥ 1 and `grep -cF "- state: working | awaiting_peer_review" SPINE` = 0.
- [ ] **Persisted risk_tier + floor (2.3):** every ticket in the sample board carries a `risk_tier`, and the H6 self-audit rejects any high-risk-floor ticket tiered below high.
- [ ] **Per-node write discipline (2.4):** no adapter authorizes a worker to write `risk_tier` or `authority_epoch`.
- [ ] **Single authority (2.5):** the spine states Kanban + state object are the sole authority; live files and task lists are projections.",
"notes_for_assembler": []

# Phase 3 — Graph Spine v2 + Thin Node Contracts + Infrastructure Repair

> **Prerequisite:** Phases 1 and 2 have executed. The convergence laws (REWORK ROUND, chatter breaker, wake-gate fingerprint, V DECISIONS PACKET, HERMES AUTHORIZED ROUTE, unblock ceiling) and the typed state block already exist in `debateai-heartbeat-protocol.md`. Phase 3 restructures that file **in place** into Graph Spine v2 (per blueprint §6.2.2: "authored as the evolution of `docs/agent-protocols/debateai-heartbeat-protocol.md`, in place" — the filename does **not** change, so no read-order pointer in any adapter, `AGENTS.md`, vendor skill, or loader breaks; only the document title becomes "Graph Spine v2").
>
> **Task order and coupling (binding):** Run the spine-population sequence `3.1 → 3.3 → 3.4 → 3.5 → 3.11` strictly in order — 3.1 restructures the spine in place and writes the twelve-section table of contents, and each later task inserts its section body at an anchor 3.1 created (3.3 inserts §4; 3.5 inserts §6 and §8; 3.4 inserts §9; 3.11 installs the §6.4 transplant sweep after the stage/marker sections exist). The node-contract/infrastructure tasks `3.6, 3.7, 3.8, 3.9, 3.10` operate on disjoint file sets and may run in any order once the spine sections they reference exist. **Task 3.2 runs LAST of all Phase-3 tasks:** it only normalizes version metadata, so it must follow 3.6 (which materializes `.codex`/`.agents` into real files) and every body-rewrite task (3.7 rewrites the FULL alias + creates `.hermes`; 3.8 rewrites `.claude`; 3.10 rewrites `.grok` and `.agents`) so it never issues an exact-match version replacement against a body a rewrite already stamped `3.0.0`. **Task 3.12** (parametrize the coding law as the model-law roster, ruling R4) edits the spine's `## Binding stage and coding law` section body; it runs after 3.1 (which preserves that section) and **before 3.2** (so 3.2's version stamp covers the final roster content), and it never touches a `##` heading so the "insert before `## Binding stage and coding law`" anchors of 3.11(l) still resolve. The spine's table of contents (written in 3.1) lists all twelve sections up front; sections 4 (Launch packet contract), 6 (Stage numbering), 8 (Marker vocabulary), and 9 (Review-lane applicability) have their bodies inserted by 3.3/3.5/3.5/3.4 respectively, and the §6.4 transplant blocks by 3.11. **The spine document is fully populated after 3.5 (plus the 3.11 transplant sweep and the 3.12 roster parametrization); Phase 3 as a whole completes only after all remaining Phase-3 tasks (3.2, 3.6–3.12) also reach `done`, and no rule is duplicated across sections.**
>
> All paths are Windows absolute or repo-relative to `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\`. Verify commands are Git-Bash-compatible (Git Bash accepts `C:/...` forward-slash paths).

---

### Task 3.1: Restructure the spine in place as Graph Spine v2
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (in-place restructure via a sequence of surgical Edits — section renames, section moves, and section insertions; filename unchanged; **NO full-file `Write`/overwrite** — a whole-file replacement would silently drop the Phase 1/2 additions and the preserved-law detail sections and is forbidden here)

**Risk tier:** high (relocates the §1.3 preserved safety-law set into a new section and declares the convergence-vs-safety precedence; per rubric, touching safety laws = high)

**Review gate:** high → full ladder + V. Peer review by a different agent/session (correctness lens: verify every §1.3 law is reproduced verbatim and not weakened), then Hermes-Verifier, then V acceptance.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the grep commands in the Verify block below
Human review required: yes
```

**Carry-forward manifest (nothing in this list may be dropped, weakened, or summarized-away by the restructure).** Task 3.1 is an *evolution in place* (blueprint §6.2.2). Before any Edit, read the current file (506 lines) in full and confirm every section below is present; after the restructure, every one MUST still be present with its content intact, either verbatim under its original heading (**PRESERVE**) or moved+renamed with its full body carried (**RELOCATE**). The new numbered graph-core sections (§1, §3, §5, §7, §11, §12, plus the §4/§6/§8/§9 headings whose bodies land in 3.3/3.5/3.5/3.4) are **INSERTED** around them and reference them; they never restate a preserved section's rule (no rule may live in two places).

| Existing section / addition (source) | Disposition | v2 home |
|---|---|---|
| `## Operating model` | PRESERVE (verbatim) | referenced by §1 Pillars |
| `## Ticket state contract` + full YAML state block (Task 2.1) | RELOCATE + rename | `## 2. State contract` (body incl. every field carried verbatim; source-of-truth text folded in) |
| `## Binding stage and coding law` | PRESERVE (verbatim) | referenced by §6 |
| `## Binding post-dialogue checkpoint compaction` | PRESERVE (verbatim) | referenced by §10 (PTY-vs-SDK note added by Task 3.11) |
| `## Binding Hermes numbered-stage review gates` + the H6 self-audit paragraph (extended by Task 2.3) | PRESERVE (verbatim; its serial plan-review fenced diagram is repointed to §7 by Phase 4 Task 4.1, not here) | H6 self-audit paragraph referenced by §6 / Task 4.5 |
| `## Roles` | PRESERVE (verbatim) | referenced by §3 |
| `## Ticket ownership and continuity` (preserved law 4) | PRESERVE (verbatim) | referenced by §3 / §11 law 4 |
| `## Source-of-truth order` | PRESERVE (verbatim) | referenced by §2 |
| `## Mandatory ticket-comment scan` | PRESERVE (verbatim) | referenced by §5 |
| `## Logical review state machine` | PRESERVE (verbatim) | referenced by §9 |
| `## Flow requirements` (subsections 1–6) | PRESERVE (verbatim) | referenced by §9 |
| `## Required comment templates` — every template incl. the `REWORK ROUND: n of 3` lines added by Task 1.1 | PRESERVE (verbatim) | referenced by §8 |
| `## Blocked format` — the `blocker type:` enum (§1.3 preserved law 6) **and** the `### Blocked-meaning -> status mapping` table (Task 2.2) | PRESERVE (verbatim) | §2 points here for the status mapping |
| `## Cycle convergence and escalation laws` (Task 1.1) — the Rework-cap subsection + `V STEERING REQUIRED` template, the `### Chatter breaker` law (Task 1.2), the `### V DECISIONS PACKET` subsection + template (Task 1.4), the `### Batch route authorization: HERMES AUTHORIZED ROUTE` subsection + template (Task 1.5) | RELOCATE + rename (full body incl. **every fenced template** carried verbatim) | `## 10. Convergence and batched-approval laws` |
| `## V-visible live-output channel` + `### Live files and host task lists are projections` (Task 2.5) | PRESERVE (verbatim) | referenced by §2 (projections) |
| `## Parallelism and file ownership` | PRESERVE (verbatim) | referenced by §7 / semaphore lands here in Phase 5 |
| `## Universal safety rules` | PRESERVE (verbatim) | §11.1 points here |
| `## Hermes cockpit responsibilities` | PRESERVE (verbatim) | referenced by §5 |
| `## Stop conditions` | PRESERVE (verbatim) | Phase 5.5 appends nothing before it is moved; kept last |

**Steps (surgical, in order — each is an `Edit`, never a `Write`):**
- [ ] Read the current file in full; confirm every carry-forward-manifest heading and every Phase 1/2 marker string is present before editing.
- [ ] **Rename the title.** Replace the single H1 line `# DebateAI Shared Heartbeat Protocol` with `# DebateAI Graph Spine v2`, and insert immediately below it the intro paragraph + `## Table of contents` shown in the core-content block below. (No frontmatter here — Task 3.2, the LAST Phase-3 task, prepends it.)
- [ ] **Insert the new graph-core framing sections** shown in the core-content block below — `## 1. Pillars`, `## 3. Node contracts index`, `## 5. Routers: Claude-Router and Hermes-Verifier`, `## 7. Edges, diamonds, and feedback edges`, `## 11. Preserved laws (verbatim)`, and `## 12. Glossary` — as new sections. They reference the preserved detail sections named in the manifest; they do not restate those sections' rules. (The `## 4`, `## 6`, `## 8`, `## 9` bodies are inserted by Tasks 3.3/3.5/3.5/3.4 and appear only in the table of contents at this point; the §6.4 transplant blocks are inserted by Task 3.11.)
- [ ] **Rename + relocate the two Phase 1/2 core sections** into the numbered scheme, carrying their FULL bodies verbatim (this is a heading rename plus a move, never a re-authoring):
  - `## Ticket state contract` -> `## 2. State contract`. Carry the entire YAML state block (all twelve fields) and the storage rule verbatim. Fold the `## Source-of-truth order` authority statement in by reference. Ensure the section states that each former `blocked` meaning maps to a typed `waiting_*` status **per the mapping table in the `## Blocked format` section** (that section is preserved by this manifest, so the pointer resolves).
  - `## Cycle convergence and escalation laws` -> `## 10. Convergence and batched-approval laws`. Carry EVERY subsection and EVERY fenced template verbatim: the rework-cap subsection with the `V STEERING REQUIRED` template, the `### Chatter breaker` law, the `### V DECISIONS PACKET` subsection with its template, and the `### Batch route authorization: HERMES AUTHORIZED ROUTE` subsection with its template. The §10 text shown in the core-content block below is an ABRIDGED INDEX of these laws for the table of contents; it does NOT replace the machine-usable template bodies, which are carried verbatim. Where the abridged index names an item not yet in the relocated section — the wake-gate fingerprint law (§10 item 4) and the `max_concurrent_heavy` semaphore (§10 item 7) — ADD that item.
- [ ] **Preserve every other manifest section verbatim** under its original heading, in place. Do not delete, summarize, or reword any of them. (Their exact anchors are relied on by Phases 4–6.)
- [ ] The core-content block below is the authoritative text for the INSERTED and RENAMED sections only. Reproduce its `# DebateAI Graph Spine v2` title, table of contents, and §1/§3/§5/§7/§11/§12 bodies exactly; treat its §2 and §10 entries as the abridged indices described above (their full bodies come from the relocated Phase 1/2 sections).

```markdown
# DebateAI Graph Spine v2

This is the single normative document for DebateAI multi-agent work — the graph
of nodes, edges, routers, and typed state. Hermes, Codex, Claude, and Grok load
this spine first, then their own thin node contract. Where an older per-agent
skill or the Hermes AppData FULL body disagrees with this spine, this spine wins;
those documents are demoted to implementation notes.

## Table of contents

1. Pillars
2. State contract
3. Node contracts index
4. Launch packet contract
5. Routers: Claude-Router and Hermes-Verifier
6. Stage numbering (H0–H9)
7. Edges, diamonds, and feedback edges
8. Marker vocabulary (union)
9. Review-lane applicability
10. Convergence and batched-approval laws
11. Preserved laws (verbatim)
12. Glossary

## 1. Pillars

The harness is a graph built on four pillars. Every rule in this spine serves one
of them.

- **Node** — a bounded job with a file contract and no graph knowledge. A node
  reads its own ticket state and its declared upstream artifacts; it never reads
  the whole board or a mission route.
- **Edge** — a data-flow, not an "and then". An edge carries a named artifact or
  a typed verdict from one node to the next. Status is not a message; edges signal
  through the typed state block and handoff markers.
- **Router** — dispatches, does no work. The router reads typed state, picks the
  next edge, and writes only routing metadata. Content judgment belongs to a
  verifier, never to the router (§5).
- **State** — one typed ticket-state object per ticket (§2). All other carriers
  (live files, host task lists) are read-only projections regenerated from it.

Operating model: **V prompts exactly one node (H0 intake).** Everything else
reaches V only through the V DECISIONS PACKET (§10) or final acceptance. Routine
routing and review communication live in ticket comments, never in V's inbox.

```text
V → Claude-Router (intake H0 only)
Claude-Router → assignment, status, epoch, route
Hermes-Verifier → evidence verdicts
Codex → sole coding worker while the current model law is active
Claude/Grok → planning-artifact workers and independent read-only reviewers
Kanban → durable shared state (the typed state block is its first comment)
```

## 2. State contract

Single canonical state block per ticket. If Kanban has no native fields, it is the
**first comment** on the ticket, updated by full replacement — machine-parseable,
one location, never smeared across the thread.

```yaml
state:
  ticket: <id>
  risk_tier: low | medium | high            # set ONCE at H0/H6; drives routing deterministically (§5)
  status: queued | ready | working
        | waiting_review | waiting_hermes | waiting_product_proof
        | waiting_human | waiting_dependency | waiting_resource
        | failed_tooling | changes_requested | done | archived
  owner: { agent: codex|claude|grok, session: <id> }
  contract:
    allowed: [...]
    readonly: [...]
    forbidden: all_others
    verification: [...]
    human_review: yes | no
  worktree: { path: <.worktrees/lane-x>, branch: <b>, merge_status: none|pending|merged }
  authority_epoch: <int>
  rework_round: <int>                        # convergence counter (§10)
  wakes_since_transition: <int>              # chatter counter (§10)
  waiting_since: <timestamp>                 # every waiting_* status carries it
  escalation_target: hermes | v_packet       # every waiting_* status carries it
  comments_read_through: <cursor>
```

`risk_tier` is immutable once set; a high-risk floor (§9) can never be tiered down.
Every `waiting_*` status MUST carry `waiting_since` and `escalation_target`; a wait
without an owner, a deadline, and an escalation edge is a spine violation.

The `status` enum replaces the overloaded word `blocked`: a ticket status is never a
bare `blocked`; each former blocked-meaning maps to exactly one typed `waiting_*`
status (or `changes_requested`/`failed_tooling`) **per the `### Blocked-meaning ->
status mapping` table in the `## Blocked format` section** — that section is
carried forward verbatim by this restructure (see the carry-forward manifest), so
this pointer resolves. The full state block, storage rule, and source-of-truth
authority are carried verbatim from the relocated `## Ticket state contract`
(Task 2.1); this §2 heading is that section, renamed.

## 3. Node contracts index

Each agent loads this spine, then exactly one thin node contract. A node contract
declares the node's role, its state reads/writes, and its markers. Nothing else.

```text
Codex node contract   → DebateV2/apps/dialectical-engine/.codex/skills/heartbeat-protocol/SKILL.md
                        (also .agents/skills/heartbeat-protocol/SKILL.md)
Claude node contract  → DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
Grok node contract    → DebateV2/apps/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md
Hermes node contract  → DebateV2/apps/dialectical-engine/.hermes/skills/heartbeat-protocol/SKILL.md
Doc adapters          → docs/agent-protocols/{codex,claude,grok}-heartbeat-adapter.md
```

Declared reads/writes (a node may read anything in its own state; the constraints
below name what it MUST NOT write):

- **Codex-worker** reads `{contract, status, rework_round, authority_epoch,
  worktree, comments_read_through}`; writes `{status, worktree, evidence refs,
  comments_read_through}`. Never writes `risk_tier` or `authority_epoch`.
- **Claude/Grok worker or reviewer** reads its stage/ticket state and upstream
  artifact paths; writes `{status (to waiting_review/waiting_hermes),
  comments_read_through}` and its own artifact. Never writes `risk_tier`,
  `authority_epoch`, or another node's files.
- **Claude-Router** reads typed state only; writes `{owner, status, route,
  authority_epoch}`. Never writes a verdict.
- **Hermes-Verifier** reads evidence; writes `{verdict, human_review routing}`.
  Never writes routing metadata or re-performs the router's dispatch.

## 5. Routers: Claude-Router and Hermes-Verifier

Routing and verification are split into two named seats held by **different model
families**, so dispatch latency is never coupled to review latency and the seat
that moves work can never grade its own dispatch (Decision D6 / ruling R1).
**Claude-Router** is the Main Orchestrator seat, held by Claude Code (Fable):
it launches everything and routes everything on typed state, and does no content
judgment. **Hermes-Verifier** is the independent verification + board-custody
seat, held by Hermes: it performs evidence review the router may never do, and it
owns the Kanban board. This is the same "may report/dispatch but may not do work"
separation already written for the 1-minute watcher, now applied across the
cockpit and along a model-family boundary.

### 5.1 Claude-Router (dispatch — Main Orchestrator)

- **Seat:** the Main Orchestrator, held by Claude Code (Fable). It launches every
  agent and fleet, runs the One-Prompt Machine (mission intake H0), decomposes
  the mission, and routes everything on typed state. It holds no verification or
  board-mutation authority — those are Hermes-Verifier's (§5.2) — and it respects
  the model-law roster (`## Binding stage and coding law`) for worker assignment.
- Reads: the typed state block only (§2). Never replays full comment threads to
  decide a routing action.
- Does: picks the next edge from classified state; assigns `owner`; sets `status`;
  advances `authority_epoch` on authority handover; emits the route marker.
- Writes: `{owner, status, route, authority_epoch}` — routing metadata only.
- **Forbidden:** content judgment of any kind. The Router never decides whether a
  diff, artifact, or test passes. It consumes a Verifier verdict; it does not
  produce one. It never mutates the board's review state (that is board custody,
  §5.2).
- Write-permission set: `owner`, `status`, `route`, `authority_epoch`,
  `escalation_target`, and the routing markers `HERMES AUTHORIZED NEXT`,
  `HERMES AUTHORIZED ROUTE`, `WORKER CONTINUITY OVERRIDE`.

### 5.2 Hermes-Verifier (evidence review + board custody)

- **Seat:** the independent verification + board-custody seat, held by Hermes.
  Beyond evidence review it holds **Kanban board custody, Kanban board crafting,
  and Manual QA runs** (ruling R1) — the incident-hardened board machinery stays
  where it is proven, in a different model family from the Router.
- Reads: the completed artifact/diff, RED→GREEN evidence, tests, live product
  evidence, reviewer evidence, and applicable comments.
- Does: performs the stage/ticket evidence review that cannot be delegated away;
  crafts and custodies the Kanban board; runs Manual QA.
- Writes: a `verdict` field and, on pass, the human-review routing decision.
- The Router consumes the verdict; the Router never re-performs verification, and
  the Verifier never re-dispatches.
- Write-permission set: `verdict`, `human_review` routing, and the verdict markers
  `HERMES STAGE REVIEW PASS`, `HERMES STAGE REVIEW CHANGES REQUESTED`,
  `HERMES CHANGES REQUESTED`, `HERMES DONE`, `HERMES BLOCKED`,
  `READY FOR HUMAN REVIEW` / `V MANUAL QA PACKET`.

### 5.3 Deterministic routing on classified state

`risk_tier` is persisted and set once (§2). It selects the review path mechanically
— the Router does not exercise judgment about which path to use:

```text
risk_tier = low
  → Hermes-Verifier direct diff review → same-cycle HERMES DONE
risk_tier = medium
  → one independent reviewer (peer-review-first, §9) → Hermes-Verifier
risk_tier = high
  → full review diamond (§7) + product-truth gate + V acceptance
```

The high-risk floor (§9) can never be tiered down. At H6 the Router self-audits
that the persisted `risk_tier` exists and that the routed path matches the tier;
a mismatch is a `HERMES STEP 6 SELF-AUDIT` failure.

## 7. Edges, diamonds, and feedback edges

Edges carry artifacts and verdicts, not "and then" sequencing. The default
planning topology is a diamond, not a serial chain.

- **Planning diamond (Tier ≥ 1):** `C2 Plan.md → {H2 Hermes review ∥ G3 Grok
  review} → H3 merge/reconcile`. Both reviewers consume only `Plan.md`; H3
  adjudicates disagreements only, it does not re-review from scratch.
- **Review diamond (medium/high tickets):** fan out 2–3 reviewers with distinct
  lenses — correctness/tests, security/data-safety, product-truth — in parallel
  from `READY FOR PEER REVIEW`; Hermes-Verifier merges, re-checking only
  disagreements. The **default reviewer prompt is adversarial**: "actively try to
  break or refute this work; if unsure, fail it."
- **Failed-test ticket fanout** is the canonical implementation diamond: one
  ticket per unique failed test node, parallel Codex lanes, one closure gate.
- **Feedback edges (routed by Claude-Router on typed findings, counted by the
  rework cap §10):**
  - `ARCHITECTURE → REQUIREMENTS`: a plan review may reopen intake with one
    bounded question.
  - `QA → ARCHITECTURE`: verifier findings that are plan defects route to the
    planning loop, not to a Codex rework loop.

Serial barriers remain only where a node genuinely needs the whole upstream set:
`H5` and `H6` stay serial.

This section is the SINGLE OWNER of the planning diamond, the review diamond, the
failed-test fanout, and the two feedback edges. Task 3.1 writes the skeleton above;
**Phase 4 completes each structure IN PLACE inside this §7** (Task 4.1 the planning
diamond, Task 4.3 the review diamond + adversarial reviewer prompt, Task 4.4 the two
feedback-edge templates) — Phase 4 adds no second `## Review diamond` or
`## Planning feedback edges` section, and the legacy serial plan-review fenced
diagram in `## Binding Hermes numbered-stage review gates` is repointed to this §7
by Task 4.1 (it is not duplicated here). No rule in this section exists anywhere
else in the spine.

## 10. Convergence and batched-approval laws

Spine-level invariant: **no cycle without a bound; no wait without an owner, a
deadline, and an escalation edge.** These laws (introduced in Phase 1) are carried
forward unchanged:

1. **Rework cap.** `rework_round` increments on every CHANGES REQUESTED of any kind
   (peer, Hermes, stage, human). At `rework_round = 3` the loop freezes and emits
   `V STEERING REQUIRED` into the V DECISIONS PACKET. No unbounded revise→re-review.
2. **Unblock reset ceiling.** `unblock` / counter-reset may occur at most **twice
   per ticket**; the third occurrence freezes and escalates.
3. **Chatter breaker.** Any two-party exchange (Hermes↔worker, Hermes↔watcher)
   producing **6 comment exchanges OR 24 router wakes on one card with no status or
   epoch transition** trips freeze + escalation. This generalizes the human-block
   circuit breaker.
4. **Wake-gate fingerprint.** Comments are classified *state-changing*
   (status/epoch/handoff-marker transitions) vs *chatter*; only state-changing
   comments wake the Router. `wakes_since_transition` implements the counter.
5. **V DECISIONS PACKET.** Hermes accumulates V-owned gates (the named-category
   filter in §11 law 9 decides what qualifies) and flushes ONE consolidated packet
   when: **≥3 decisions pending, OR any decision pending >4h, OR an entire lane is
   frozen on it, OR V asks.** Each row: card, decision needed, evidence link,
   smallest yes/no.
6. **Batch route authorization.** When a DAG was already approved at H6, Hermes
   issues one `HERMES AUTHORIZED ROUTE: <ticket list> epoch=<n>` for the chain.
   Per-node `HERMES AUTHORIZED NEXT` is required again only on a new risk signal
   (RED, contract drift, architecture boundary, important operation).
7. **Heavy-command semaphore.** `max_concurrent_heavy` is declared once here and
   referenced by pointer everywhere. Laptop: `max_concurrent_heavy = 1`. A
   stronger machine raises this one number with no protocol rewrite.

Convergence caps never override safety gates: a frozen loop escalates; it never
auto-approves.

The seven items above are an ABRIDGED INDEX. This section is the relocated
`## Cycle convergence and escalation laws` (Phase 1), and it carries verbatim the
machine-usable fenced templates authored there — the `V STEERING REQUIRED`
template (Task 1.1), the `### V DECISIONS PACKET` template (Task 1.4), and the
`### Batch route authorization: HERMES AUTHORIZED ROUTE` template (Task 1.5),
plus the `### Chatter breaker` law (Task 1.2). None of those template bodies is
summarized away; they remain in this section for machine use.

## 11. Preserved laws (verbatim)

These laws are reproduced verbatim from the audit's preserved-law set (blueprint
§1.3). They may be moved or reformulated but NEVER weakened. The parenthetical
"§3.x" pointers are the original blueprint references; in this spine they map to
§10 (convergence), §5.3/§9 (proportional review), and §12 (glossary).

1. Independent review before Done; reviewer never edits; worker never self-sends to Hermes; no self-Done.
2. No-fake-data / no-scaffold / RED→GREEN evidence law; "workflow evidence is not product evidence."
3. Per-ticket file contracts (Allowed / Read-only / Forbidden / Verification) — this IS a node contract; keep and extend.
4. Sticky worker/session ownership on rework + `WORKER CONTINUITY OVERRIDE`.
5. AUTHORITY EPOCH monotonic authority + compare-before-write / fresh-read-before-mutate.
6. Blocker-type taxonomy (already an enum in the BLOCKED template).
7. `wakeAgent:false` tokenless change gate (correct and keep — extend its fingerprint spec, §3.4).
8. Detector/reviewer/router separation of powers (already written for the watcher — generalize to Hermes itself).
9. Escalate-to-V-only-for-named-categories filter (provider spend, data writes, deletion, destructive git, architecture/scope, reconstructed evidence, waiver, final acceptance).
10. Product-truth gates requiring live app/API/DB/browser evidence.
11. Failed-test ticket fanout (a real diamond — becomes the template).
12. Sibling-lanes + one-closure-gate pattern; per-worktree Split→Verify→Merge checklist (promote from planning skill to spine).
13. Proportional review fast path low/medium/high (make it a persisted field, §3.3).
14. Human-block circuit breaker freeze rule (generalize its trigger, §3.4).
15. H1 research handoff-integrity-only gate (proof the team already knows how to right-size a gate).

### 11.1 Universal safety rules (agents must not)

The universal "agents must not" list is the carried-forward `## Universal safety
rules` section (preserved verbatim by this restructure, per the carry-forward
manifest; Phase 5 Tasks 5.1/5.3 anchor immediately before that heading). It is a
§1.3 preserved law and is never weakened or duplicated; consult it there. In
summary it forbids: self-Done; pushing without explicit V approval; deleting
database/product data without V's explicit approval for that deletion; crossing
file contracts; creating fake runtime product data; revealing secrets/tokens/
cookies/private prompts/raw provider payloads/private data; a reviewer editing the
change it reviews; and ignoring a newer ticket comment for an older, more
convenient prompt. The authoritative wording is the `## Universal safety rules`
section, not this summary.

## 12. Glossary

- **node** — a bounded job with a file contract and no graph knowledge.
- **edge** — a data-flow carrying an artifact or a typed verdict.
- **router** — dispatch-only function (Claude-Router); writes routing metadata,
  never a verdict.
- **verifier** — evidence-review function (Hermes-Verifier); writes a verdict,
  never routing metadata.
- **risk_tier** — persisted low|medium|high, set once, immutable, high-risk floor
  never tiered down.
- **authority_epoch** — monotonic integer; a write with a stale epoch is aborted.
- **chatter** — a comment that changes no status, epoch, or handoff marker; does
  not wake the Router.

(The `worktree` and `workdir` glossary entries are appended into THIS section by
Phase 5 Task 5.5 — the worktree phase owns those terms; do not define them here.)
```

- [ ] Save. Do not add frontmatter (Task 3.2 owns it).

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "# DebateAI Graph Spine v2" "$SPINE"            # expected 1 (title renamed)
grep -c "DebateAI Shared Heartbeat Protocol" "$SPINE"   # expected 0 (old title gone)
grep -c "Claude-Router" "$SPINE"                        # expected >=4
grep -c "Hermes-Verifier" "$SPINE"                      # expected >=4
grep -c "rework_round = 3" "$SPINE"                     # expected >=1
# renamed core sections present (positive assertions):
grep -c "## 2. State contract" "$SPINE"                          # expected 1
grep -c "## 10. Convergence and batched-approval laws" "$SPINE"  # expected 1
grep -c "## 11. Preserved laws (verbatim)" "$SPINE"              # expected 1
# old core headings renamed away (rename actually happened):
grep -c "## Ticket state contract" "$SPINE"             # expected 0 (renamed to §2)
grep -c "## Cycle convergence and escalation laws" "$SPINE"  # expected 0 (renamed to §10)
# all 15 preserved laws present verbatim under section 11:
grep -c "WORKER CONTINUITY OVERRIDE" "$SPINE"           # expected >=1
grep -c "workflow evidence is not product evidence" "$SPINE"  # expected 1

# CARRY-FORWARD ASSERTIONS — every preserved section heading survives (each expected >=1):
for H in \
  "## Operating model" \
  "## Binding stage and coding law" \
  "## Binding post-dialogue checkpoint compaction" \
  "## Binding Hermes numbered-stage review gates" \
  "## Roles" \
  "## Ticket ownership and continuity" \
  "## Source-of-truth order" \
  "## Mandatory ticket-comment scan" \
  "## Logical review state machine" \
  "## Flow requirements" \
  "## Required comment templates" \
  "## Blocked format" \
  "### Blocked-meaning" \
  "## V-visible live-output channel" \
  "### Live files and host task lists are projections" \
  "## Parallelism and file ownership" \
  "## Universal safety rules" \
  "## Hermes cockpit responsibilities" \
  "## Stop conditions" ; do
  printf '%s => ' "$H"; grep -c "$H" "$SPINE"           # each expected >=1
done

# PHASE 1/2 MARKER-STRING ASSERTIONS — every convergence/state marker survives (each expected >=1):
for M in \
  "REWORK ROUND" \
  "V STEERING REQUIRED" \
  "### V DECISIONS PACKET" \
  "### Chatter breaker" \
  "HERMES AUTHORIZED ROUTE" \
  "blocker type: dependency | process | safety | architecture | file_contract | verification | session_continuity" \
  "wakes_since_transition" \
  "risk_tier" \
  "authority_epoch" \
  "escalation_target" \
  "waiting_since" ; do
  printf '%s => ' "$M"; grep -c "$M" "$SPINE"           # each expected >=1
done
```
Expected: title renamed (new present once, old absent), router split >=4 each, the two Phase-1/2 core sections renamed to §2/§10 (old headings gone, new present), and every carry-forward heading and every Phase-1/2 marker string still present with count >=1 — proving the in-place restructure dropped nothing.

**Acceptance:**
1. The file's title is `# DebateAI Graph Spine v2`; the old title string is absent (grep count 0). The change was made by Edits, not a full-file `Write`.
2. All twelve TOC entries are listed; the INSERTED graph-core sections (1, 3, 5, 7, 11, 12) have full bodies; sections 4, 6, 8, 9 appear in the TOC and their bodies are inserted by Tasks 3.3/3.5/3.5/3.4; the §6.4 transplant blocks are inserted by Task 3.11.
3. Every one of the 15 §1.3 preserved laws appears verbatim under section 11; §11.1 points to the carried-forward `## Universal safety rules` section rather than restating it; a reviewer confirms no law was weakened.
4. Router-split section names Claude-Router and Hermes-Verifier with separate write-permission sets and the deterministic risk_tier routing table.
5. **Carry-forward verified:** every heading in the carry-forward manifest is still present (each grep >=1), and every Phase-1/2 marker string (`REWORK ROUND`, `V STEERING REQUIRED`, `### V DECISIONS PACKET` template, `### Chatter breaker`, `HERMES AUTHORIZED ROUTE`, the seven-value `blocker type:` enum, the `### Blocked-meaning -> status mapping` table, `wakes_since_transition`, and the state block fields) is still present (each grep >=1). Nothing added by Phases 1–2 was dropped or weakened.
6. **Renamed, not duplicated:** `## Ticket state contract` and `## Cycle convergence and escalation laws` no longer exist as headings (grep 0); their full bodies — including the state block and every fenced convergence template — now live under `## 2. State contract` and `## 10. Convergence and batched-approval laws` exactly once. `## Blocked format` (with its enum and mapping table) is preserved, so §2's status-mapping pointer resolves. No rule appears in two sections.

---

### Task 3.2: Add spine frontmatter and unify the version scheme to 3.0.0 (LAST Phase-3 task)
**Files (edited literally by this task):**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (prepend frontmatter)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.codex\skills\heartbeat-protocol\SKILL.md` (real file after Task 3.6; still carries the `.zenith`-sourced `2.2.0` body, so its version is bumped here)
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\SKILL.md` (FULL body; Task 3.7 forbids touching it except its version, which is set here)
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md` (LITE)

**Files (only READ + verified by this task — their bodies AND `version`/`spine_version` are already stamped `3.0.0` by a rewrite task, so this task must NOT re-replace their version):**
- Verify only: `...\.claude\skills\heartbeat-protocol\SKILL.md` (rewritten by Task 3.8)
- Verify only: `...\.agents\skills\heartbeat-protocol\SKILL.md` (rewritten by Task 3.10)
- Verify only: `...\.grok\skills\heartbeat-protocol\SKILL.md` (rewritten by Task 3.10)
- Verify only: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol\SKILL.md` (FULL alias; rewritten by Task 3.7)
- Verify only: `...\.hermes\skills\heartbeat-protocol\SKILL.md` (created by Task 3.7 already at `3.0.0`)

**Risk tier:** low (mechanical metadata edit; no rule change)

**Review gate:** low → direct Hermes diff review, same-cycle done.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: the four "edited literally" files above (spine, .codex, FULL body, LITE)
Forbidden: all other files, including the five "verify only" files (their version is owned by their rewrite task, not by 3.2)
Verification: the grep commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] **Order dependency (binding): this is the LAST Phase-3 task.** Run only after 3.6 (so `.codex`/`.agents` are real files), after 3.7 (FULL alias rewritten + `.hermes` created at `3.0.0`), 3.8 (`.claude` rewritten at `3.0.0`), and 3.10 (`.grok` and `.agents` rewritten at `3.0.0`). This task only normalizes version metadata on the files a rewrite task did NOT already stamp.
- [ ] Prepend the following frontmatter block as the very first lines of `debateai-heartbeat-protocol.md`, immediately above the line `# DebateAI Graph Spine v2`:

```markdown
---
name: debateai-graph-spine
title: DebateAI Graph Spine v2
version: 3.0.0
supersedes: debateai-heartbeat-protocol (pre-3.0.0), heartbeat-protocol-lite, debateai-kanban-heartbeat-review-loop
---
```

- [ ] Set the version on the three not-yet-stamped downstream files with these exact literal replacements (each string is present because no rewrite task touched these bodies):
  - `.codex` vendor skill (materialized `.zenith` body): replace `version: 2.2.0` with `version: 3.0.0`.
  - FULL body (`debateai-kanban-heartbeat-review-loop/SKILL.md`): replace `version: 1.5.2` with `version: 3.0.0`.
  - LITE (`heartbeat-protocol-lite/SKILL.md`): replace `version: 1.2.17` with `version: 3.0.0`.
  - Do **NOT** attempt a `version: 2.2.0 -> 3.0.0` replacement on `.claude`, `.agents`, `.grok`, or the FULL alias, and do **NOT** attempt `version: 1.5.2 -> 3.0.0` on the FULL alias: those bodies were already rewritten to `3.0.0` by Tasks 3.7/3.8/3.10, so no `2.2.0`/`1.5.2` string remains to match (an exact-match editor would error).
- [ ] In each of the three files you just version-bumped (`.codex`, FULL body, LITE), add one line directly under `version: 3.0.0`:

```markdown
spine_version: 3.0.0
```

so the shared version scheme is explicit and greppable. (The five "verify only" files already carry `spine_version: 3.0.0` from their rewrite task; do not add it again.)

**Verify:**
```sh
BASE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine"
APPDATA="C:/Users/vladm/AppData/Local/hermes/skills/software-development"
grep -c "version: 3.0.0" "$BASE/docs/agent-protocols/debateai-heartbeat-protocol.md"   # expected >=1 (frontmatter)
# literally-edited files:
grep -c "spine_version: 3.0.0" "$BASE/.codex/skills/heartbeat-protocol/SKILL.md"        # expected 1
grep -c "spine_version: 3.0.0" "$APPDATA/debateai-kanban-heartbeat-review-loop/SKILL.md" # expected 1
grep -c "spine_version: 3.0.0" "$APPDATA/heartbeat-protocol-lite/SKILL.md"               # expected 1
# rewrite-stamped files already at 3.0.0 (verified, not edited here):
for f in .claude .agents .grok; do grep -c "version: 3.0.0" "$BASE/$f/skills/heartbeat-protocol/SKILL.md"; done  # each 1
grep -c "version: 3.0.0" "$APPDATA/heartbeat-protocol/SKILL.md"                          # expected 1 (FULL alias, set by 3.7)
grep -c "version: 3.0.0" "$BASE/.hermes/skills/heartbeat-protocol/SKILL.md"              # expected 1 (created by 3.7)
# no stale versions anywhere in scope:
grep -rl "version: 2.2.0\|version: 1.5.2\|version: 1.2.17" "$BASE" "$APPDATA" | wc -l    # expected 0
```

**Acceptance:**
1. The spine carries YAML frontmatter with `version: 3.0.0` and `title: DebateAI Graph Spine v2`.
2. All nine node contracts/loaders in scope (spine, `.codex`, `.agents`, `.claude`, `.grok`, `.hermes`, FULL alias, FULL body, LITE) carry `version: 3.0.0` and `spine_version: 3.0.0` — three set literally by this task, the rest inherited from their rewrite task.
3. No file in scope still carries `2.2.0`, `1.5.2`, or `1.2.17`.
4. This task issued no literal version replacement against `.claude`, `.agents`, `.grok`, or the FULL alias (those are stamped by 3.7/3.8/3.10, avoiding the exact-match-fails contradiction).

---

### Task 3.3: Bound launch packets and replace the Codex board-listing boot step
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (insert section 4)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md` (boot step)

**Risk tier:** medium (spine-law change: caps packet contents and changes Codex boot behavior)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: docs/agent-protocols/debateai-heartbeat-protocol.md, docs/agent-protocols/codex-heartbeat-adapter.md
Forbidden: all other files
Verification: the grep commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] In the spine, insert the following section immediately **before** the line `## 5. Routers: Claude-Router and Hermes-Verifier` (this line was written by Task 3.1):

```markdown
## 4. Launch packet contract

A launch packet is a node contract, not a mission briefing. Its contents are
capped to exactly four things:

1. the ticket-state block (§2);
2. the immediate upstream artifact path(s);
3. the single handoff marker the node must emit;
4. the stop conditions.

Explicitly forbidden in a launch packet:

- full mission routes or DAGs;
- sibling-mission references ("LIP-01 and LIP-02 are logical siblings…");
- negative-space ticket lists ("do not touch these 6 unrelated tickets");
- pipeline role maps.

Route topology lives ONLY in Kanban and in Claude-Router (§5). A node never
receives, and never needs, the shape of the graph beyond its own ticket and its
declared upstream artifacts.
```

- [ ] In `codex-heartbeat-adapter.md`, replace the boot step at line 18. The current line reads exactly:

```text
4. List Kanban for the active tenant.
```

Replace it with:

```text
4. Fetch only your assigned ticket (its state block and declared upstream artifact paths). Do not list the board or other tenants' tickets — route topology lives in Kanban and Claude-Router, not in the worker.
```

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
CODEX="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"
grep -c "## 4. Launch packet contract" "$SPINE"        # expected 1
grep -c "negative-space ticket lists" "$SPINE"          # expected 1
grep -c "List Kanban for the active tenant" "$CODEX"    # expected 0 (old boot step removed)
grep -c "Fetch only your assigned ticket" "$CODEX"      # expected 1
```

**Acceptance:**
1. Spine section 4 exists, sits between section 3 and section 5, and forbids all four wide-context items by name.
2. The Codex adapter no longer contains "List Kanban for the active tenant".
3. The Codex adapter boot step now fetches only the assigned ticket.
4. No other adapter or file was modified.

---

### Task 3.4: Reconcile the two binding review documents into one applicability rule
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (insert section 9)
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\references\hermes-owned-triage-review-and-successor-routing.md` (add pointer)
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\references\ticket-comment-review-loop.md` (add pointer)

**Risk tier:** medium (reconciles two documents that BOTH claimed to be the binding review law; spine-law change)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: docs/agent-protocols/debateai-heartbeat-protocol.md, and the two named FULL reference files
Forbidden: all other files
Verification: the grep commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Order dependency: run **after** Task 3.5 (which inserts section 8 immediately before section 5's successors); insert this section 9 immediately **before** the line `## 10. Convergence and batched-approval laws` (written by Task 3.1). If 3.5 has not yet run, still anchor on `## 10. Convergence and batched-approval laws`.
- [ ] Insert the following section into the spine at that anchor:

```markdown
## 9. Review-lane applicability

Two documents historically each claimed to be the binding review law:
peer-review-first (spine / FULL `ticket-comment-review-loop`) and
Hermes-direct-triage (FULL `hermes-owned-triage-review-and-successor-routing`).
They do not contradict once scoped by `risk_tier` and lifecycle position:

```text
peer-review-first  = DEFAULT lane for first-pass work at risk_tier medium or high.
                     A different read-only reviewer verifies BEFORE Hermes-Verifier
                     (§5.2). Worker never self-sends to Hermes.

Hermes-direct-triage = applies ONLY to:
                     (a) risk_tier = low first-pass work (direct Hermes-Verifier
                         diff review, same-cycle Done, no peer reviewer), OR
                     (b) post-review Triage administration — routing an already-
                         reviewed card to Done / rework / human review / successor.
```

High-risk floor (immutable, can never be tiered down to skip peer review):
persistence/migrations, provider spend, security/auth, scoring semantics,
live/product data, destructive or architectural work. Any ticket touching these
is risk_tier = high regardless of size and takes the full review diamond (§7).
H6 self-audit verifies the routed lane matches the persisted `risk_tier`.
```

- [ ] In `hermes-owned-triage-review-and-successor-routing.md`, insert the following pointer immediately **after** the first line `# Hermes-Owned Triage Review and Successor Routing`:

```markdown

> **Applicability (Graph Spine v2 §9):** Hermes-direct-triage applies ONLY to
> risk_tier=low first-pass work OR to post-review Triage administration. First-pass
> work at risk_tier medium/high takes peer-review-first (see
> `ticket-comment-review-loop.md`). The spine's §9 is the authority on which lane
> applies.
```

- [ ] In `ticket-comment-review-loop.md`, insert the following pointer immediately **after** the first line `# Ticket-comment worker/reviewer/Hermes/human loop`:

```markdown

> **Applicability (Graph Spine v2 §9):** Peer-review-first is the DEFAULT lane for
> first-pass work at risk_tier medium/high. For risk_tier=low first-pass work and
> for post-review Triage administration, use Hermes-direct-triage
> (`hermes-owned-triage-review-and-successor-routing.md`). The spine's §9 is the
> authority on which lane applies.
```

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
REFS="C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/references"
grep -c "## 9. Review-lane applicability" "$SPINE"                      # expected 1
grep -c "Hermes-direct-triage" "$SPINE"                                 # expected >=2
grep -c "Graph Spine v2 §9" "$REFS/hermes-owned-triage-review-and-successor-routing.md"  # expected 1
grep -c "Graph Spine v2 §9" "$REFS/ticket-comment-review-loop.md"       # expected 1
```

**Acceptance:**
1. Spine section 9 states both lanes with explicit `risk_tier`/lifecycle applicability conditions and names the immutable high-risk floor.
2. Both Hermes reference files carry a pointer to spine §9 as the deciding authority.
3. The two documents no longer both claim to be THE binding review law; each defers to §9.
4. No other file was modified.

---

### Task 3.5: Marker vocabulary union and unified stage numbering H0–H9
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (insert sections 6 and 8)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md` (marker list)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md` (marker list)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md` (marker list)

**Risk tier:** medium (spine-law vocabulary + stage-numbering change)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: spine + the three doc adapters (codex/claude/grok-heartbeat-adapter.md)
Forbidden: all other files
Verification: the grep commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Order dependency: run **after** Task 3.3. Insert section 6 immediately **before** the line `## 7. Edges, diamonds, and feedback edges` (written by Task 3.1):

```markdown
## 6. Stage numbering (H0–H9)

One unified numbering. Every marker and packet references these stage IDs.

```text
H0  Hermes   Intake: request framing, contract skeleton, risk_tier set once
G1  Grok     Research.md (fresh Grok CLI PTY)
H1  Hermes   Research handoff-integrity check only (no substantive review)
C2  Claude   Plan.md (fresh Claude CLI PTY)
H2  Hermes   Plan review — runs ∥ G3 for risk_tier medium/high (planning diamond, §7)
G3  Grok     PlanReview.md (fresh Grok CLI PTY)
H3  Hermes   Plan-review merge/reconcile (adjudicate H2∥G3 disagreements only)
C4  Claude   FinalPlan.md (fresh Claude CLI PTY)
H4  Hermes   FinalPlan review
G5  Grok     VerticalSlices.md (fresh Grok CLI PTY)
H5  Hermes   VerticalSlices review (serial barrier)
H6  Hermes   Kanban ticketization + Step-6 self-audit + batched lane-plan/worktree
             approval submitted as one V DECISIONS PACKET row (serial barrier)
A7  Agents   Implementation wave — Codex-only lanes in isolated worktrees,
             parallel where file contracts are disjoint
C8  Closure  QA / product-truth + integration node: merge worktrees, closure gate
H9  Hermes   Done
```

The pre-3.0.0 chain H0…H6 is preserved exactly; A7/C8/H9 formalize the
implementation wave, the QA/integration closure gate, and Done that the old chain
left implicit.
```

- [ ] Insert section 8 immediately **before** the line `## 9. Review-lane applicability` (written by Task 3.4; if 3.4 has not yet run, anchor on `## 10. Convergence and batched-approval laws`):

```markdown
## 8. Marker vocabulary (union)

All markers below are binding. The pre-3.0.0 spine markers are kept; the new
markers are added (no marker is renamed or removed).

Existing (kept): WORKER CLAIM; CODEX/CLAUDE/GROK HEARTBEAT;
CODEX/CLAUDE/GROK BLOCKED; <AGENT> COMPACTION CHECKPOINT; COMPACTION BLOCKED;
RESEARCH HANDOFF COMPLETE; READY FOR PEER REVIEW; PEER REVIEW CHANGES REQUESTED;
PEER REVIEW APPROVED; READY FOR HERMES REVIEW; READY FOR HERMES STAGE REVIEW;
HERMES STAGE REVIEW PASS; HERMES STAGE REVIEW CHANGES REQUESTED;
HERMES CHANGES REQUESTED; HERMES STEP 6 SELF-AUDIT PASS; READY FOR HUMAN REVIEW;
V MANUAL QA PACKET; HUMAN REVIEW PASSED; HUMAN REVIEW CHANGES REQUESTED;
REWORK ACKNOWLEDGED; REWORK READY FOR HERMES REVIEW; REWORK ROUND;
WORKER CONTINUITY OVERRIDE; LIVE MONITORING ACTIVE.

Added (union): HERMES DONE; HERMES BLOCKED; HERMES AUTHORIZED NEXT;
HERMES AUTHORIZED ROUTE; V DECISIONS PACKET; V STEERING REQUIRED; AUTHORITY EPOCH;
HERMES LIVENESS REQUESTED; READY FOR EXTERNAL REVIEW;
EXTERNAL REVIEW PASSED | CHANGES REQUESTED.

Router-owned markers (written only by Claude-Router, §5.1): HERMES AUTHORIZED NEXT,
HERMES AUTHORIZED ROUTE, WORKER CONTINUITY OVERRIDE, AUTHORITY EPOCH.
Verifier-owned markers (written only by Hermes-Verifier, §5.2): HERMES DONE,
HERMES BLOCKED, all STAGE REVIEW verdicts, HERMES CHANGES REQUESTED,
READY FOR HUMAN REVIEW / V MANUAL QA PACKET.
```

- [ ] In each of the three doc adapters, extend the existing `Comment markers … must recognize` fenced list (the ```text block that currently ends with `WORKER CONTINUITY OVERRIDE`) by inserting these lines immediately before the closing ```text``` fence, so each worker recognizes the union:

```text
HERMES DONE
HERMES BLOCKED
HERMES AUTHORIZED NEXT
HERMES AUTHORIZED ROUTE
V DECISIONS PACKET
V STEERING REQUIRED
AUTHORITY EPOCH
HERMES LIVENESS REQUESTED
READY FOR EXTERNAL REVIEW
EXTERNAL REVIEW PASSED
EXTERNAL REVIEW CHANGES REQUESTED
REWORK ROUND
```

**Verify:**
```sh
BASE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols"
SPINE="$BASE/debateai-heartbeat-protocol.md"
grep -c "## 6. Stage numbering (H0–H9)" "$SPINE"        # expected 1
grep -c "## 8. Marker vocabulary (union)" "$SPINE"       # expected 1
grep -c "A7  Agents" "$SPINE"                            # expected 1
grep -c "HERMES AUTHORIZED ROUTE" "$SPINE"               # expected >=1
for a in codex claude grok; do grep -c "HERMES AUTHORIZED ROUTE" "$BASE/$a-heartbeat-adapter.md"; done  # each >=1
for a in codex claude grok; do grep -c "V DECISIONS PACKET" "$BASE/$a-heartbeat-adapter.md"; done       # each >=1
```

**Acceptance:**
1. Spine section 6 lists all fifteen stage IDs H0,G1,H1,C2,H2,G3,H3,C4,H4,G5,H5,H6,A7,C8,H9.
2. Spine section 8 lists the full union and assigns each new marker to Router-owned or Verifier-owned.
3. All three doc adapters' marker lists now include the added union markers.
4. No existing marker was renamed or removed.

---

### Task 3.6: Replace the .codex and .agents skill symlinks with real in-repo files
**Files:**
- Delete (symlink) + Create (real): `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.codex\skills` (currently a symlink to `C:\Users\vladm\.zenith\projects\20260701T111825Z-ddd-observability-language-remediation-for-debateai-goal-make-th\.zenith\skills`)
- Delete (symlink) + Create (real): `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.agents\skills` (same symlink target)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\AGENTS.md` (vendor-skills note)

**Risk tier:** medium (infrastructure repair; changes how Codex/agents resolve their node contract — currently into a stale, non-version-controlled `.zenith` snapshot)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: .codex/skills, .agents/skills (materialize), AGENTS.md
Forbidden: all other files; do NOT modify the .zenith symlink target
Verification: the commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Confirm the current state: `.codex/skills` and `.agents/skills` are symlinks (`ls -la` shows `skills -> /c/Users/vladm/.zenith/.../.zenith/skills`). The target holds a real `heartbeat-protocol/SKILL.md` plus 8 unrelated skill dirs.
- [ ] Materialize each symlink into a real, dereferenced in-repo directory (copy-then-swap; `cp -L` follows the symlink and copies real files). Run from the app directory:

```sh
cd "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine"
for d in .codex .agents; do
  cp -RL "$d/skills" "$d/skills.real"   # dereference target into a real tree
  rm "$d/skills"                        # remove the symlink (not the target)
  mv "$d/skills.real" "$d/skills"       # put the real tree in place
done
```

- [ ] Confirm the `heartbeat-protocol/SKILL.md` under each is now a real file (its content is the Codex node contract; Task 3.2 sets its `version: 3.0.0`). Do not delete or alter the `.zenith` target — only the in-repo symlinks are replaced.
- [ ] In `AGENTS.md`, replace the existing "Vendor skills are thin adapters" block. The current block reads exactly:

```text
Vendor skills are thin adapters:

```text
.codex/skills/heartbeat-protocol/SKILL.md
.claude/skills/heartbeat-protocol/SKILL.md
.grok/skills/heartbeat-protocol/SKILL.md
```
```

Replace it with:

```text
Vendor skills are thin node contracts that load the Graph Spine v2. As of
spine 3.0.0 they are REAL in-repo files (the `.codex` and `.agents` skill
directories were symlinks into an out-of-repo `.zenith` snapshot and were
materialized in place — no directory here is a symlink):

```text
.codex/skills/heartbeat-protocol/SKILL.md
.agents/skills/heartbeat-protocol/SKILL.md
.claude/skills/heartbeat-protocol/SKILL.md
.grok/skills/heartbeat-protocol/SKILL.md
```
```

**Verify:**
```sh
cd "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine"
test -L .codex/skills && echo STILL_SYMLINK || echo REAL     # expected REAL
test -L .agents/skills && echo STILL_SYMLINK || echo REAL    # expected REAL
test -f .codex/skills/heartbeat-protocol/SKILL.md && echo OK  # expected OK
test -f .agents/skills/heartbeat-protocol/SKILL.md && echo OK # expected OK
grep -c ".agents/skills/heartbeat-protocol/SKILL.md" AGENTS.md  # expected 1
test -d "C:/Users/vladm/.zenith/projects/20260701T111825Z-ddd-observability-language-remediation-for-debateai-goal-make-th/.zenith/skills" && echo TARGET_INTACT  # expected TARGET_INTACT
```

**Acceptance:**
1. Neither `.codex/skills` nor `.agents/skills` is a symlink (`test -L` reports REAL).
2. A real `heartbeat-protocol/SKILL.md` exists under both.
3. `AGENTS.md` documents that all four vendor node contracts are real in-repo files, and lists `.agents/skills/...` alongside the others.
4. The `.zenith` symlink target directory is untouched.

---

### Task 3.7: Create the Hermes repo-local node contract and re-point the AppData FULL alias at the repo spine
**Files:**
- Create: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.hermes\skills\heartbeat-protocol\SKILL.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol\SKILL.md` (FULL alias — full rewrite into a thin loader)

**Risk tier:** medium (ends the two-lineage split; makes Hermes load the same spine as everyone else)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: DebateV2/apps/dialectical-engine/.hermes/skills/heartbeat-protocol/SKILL.md (new),
  and C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol/SKILL.md
Forbidden: all other files; do NOT edit the FULL body debateai-kanban-heartbeat-review-loop/SKILL.md except its version (Task 3.2)
Verification: the commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Confirm `.hermes/skills/` exists but has NO `heartbeat-protocol` dir today (the Lineage-A gap). Create the directory and file.
- [ ] Create `.hermes/skills/heartbeat-protocol/SKILL.md` with exactly:

```markdown
---
name: heartbeat-protocol
description: Hermes node contract for DebateAI Graph Spine v2. Thin loader -> repo spine; Hermes is the Hermes-Verifier + Kanban board-custody node (routing/dispatch belongs to Claude-Router, ruling R1).
version: 3.0.0
spine_version: 3.0.0
---

# Hermes Node Contract

This contract is thin. The single source of truth is the repo Graph Spine v2.

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. The current Kanban ticket state block and its comments

The AppData `debateai-kanban-heartbeat-review-loop` FULL body is demoted to
implementation notes: consult it only through the spine's pointers, never as
competing law. Where it disagrees with the spine, the spine wins.

## Hermes is the Verifier + board-custody node (spine §5, ruling R1)

Hermes holds the **Hermes-Verifier** seat only. Routing/dispatch is NOT Hermes's
job -> it belongs to **Claude-Router** (the Main Orchestrator, a different model
family). Hermes never assigns owners, never picks the next edge, and never writes
routing metadata; it consumes routing, it does not produce it.

- **Independent evidence verification:** reads artifact/diff/tests/product
  evidence/reviewer evidence; writes a `verdict` and the human-review routing
  decision, plus the verifier-owned markers (HERMES DONE, HERMES BLOCKED, all
  STAGE REVIEW verdicts, HERMES CHANGES REQUESTED, READY FOR HUMAN REVIEW /
  V MANUAL QA PACKET). Never re-performs dispatch; never marks work Done without
  the tier-matched review path.
- **Kanban board custody + crafting:** owns the durable Kanban board — column
  structure, board machinery, and the integrity of every ticket's typed state
  block. Crafts the board for a mission and custodies it thereafter. Board
  mutation is Hermes's alone; Claude-Router reads the board and routes, it does
  not mutate review state.
- **Manual QA runs:** executes the Manual QA / V MANUAL QA PACKET runs that
  produce product-truth evidence.
- **Race machinery (spine §5 / §10):** enforces AUTHORITY EPOCH monotonicity and
  compare-before-write / fresh-read-before-mutate on every board write; aborts a
  stale write whose epoch is older than the current authority epoch.

## Review paths by classified state (spine §5.3)

Hermes reads the persisted `risk_tier` (set at intake/H6, never by Hermes) to know
which review path Claude-Router will route it down: low -> Hermes-Verifier direct
diff review + same-cycle HERMES DONE; medium -> one independent reviewer
(peer-review-first, spine §9) + Hermes-Verifier; high -> full review diamond +
product-truth gate + V. The high-risk floor (spine §9) is never tiered down.
Hermes self-audits tier-vs-path at H6 and fails the audit on a mismatch.

## Convergence and batching (spine §10)

Enforce the rework cap (3), unblock ceiling (2), and chatter breaker (6 exchanges /
24 wakes with no status/epoch transition) as verification gates: on trip, freeze
and escalate -> never auto-approve. Hermes produces the verdicts and blocks that
Claude-Router batches into the V DECISIONS PACKET (flush at >=3 pending OR any
pending >4h OR a lane frozen OR V asks); Hermes does not itself route the packet or
issue HERMES AUTHORIZED ROUTE. At H6, Hermes verifies the whole lane plan (worktree
paths, file contracts, merge order, closure target) before Claude-Router submits it
as ONE V DECISIONS PACKET row (worktree gate per V ruling, spine §9/§10).

## Non-negotiables

Owns verdicts (Done/Blocked), Kanban board custody/crafting, and Manual QA runs;
interrupts V only for the named escalation categories (spine §11 law 9); never
marks work Done without the tier-matched review path; never assigns owners or
writes routing metadata (that is Claude-Router); enforces AUTHORITY EPOCH +
compare-before-write on every board write; preserves the §11.1 universal safety
rules.
```

- [ ] Rewrite the AppData FULL alias `heartbeat-protocol/SKILL.md` (full overwrite) into a thin loader that names the repo spine as source of truth. Its current body loads `debateai-kanban-heartbeat-review-loop` as the authority; that is inverted. New content:

```markdown
---
name: heartbeat-protocol
description: Shortcut alias for DebateAI Graph Spine v2. Loads the repo spine as source of truth; the FULL review-loop body is demoted to implementation notes.
version: 3.0.0
spine_version: 3.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [debateai, heartbeat, graph-spine, kanban, alias]
    related_skills: [debateai-kanban-heartbeat-review-loop]
---

# Heartbeat Protocol (Graph Spine v2 loader)

When V says `heartbeat-protocol`, `invoke heartbeat protocol`, `Kanban-Reviewer`,
`run the Codex/Hermes heartbeat loop`, or similar, load in THIS order:

1. Repo Graph Spine v2 — SOURCE OF TRUTH:
   `DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
2. Hermes node contract:
   `DebateV2/apps/dialectical-engine/.hermes/skills/heartbeat-protocol/SKILL.md`
3. The current Kanban board/tenant (infer it; V need not name it).

The `debateai-kanban-heartbeat-review-loop` FULL body and its `references/` are
DEMOTED to implementation notes. Consult a reference only when the spine points to
it. Where the FULL body disagrees with the spine, the spine wins. Do not treat the
FULL body as competing law.

Default to Hermes verifier + board-custody mode: Hermes owns the Hermes-Verifier
seat (spine §5) — independent verification, Kanban board custody/crafting, and
Manual QA runs — plus the review-lane applicability rule (§9) and the convergence /
batched-approval gates (§10). Routing/dispatch belongs to Claude-Router (the Main
Orchestrator, ruling R1), NOT to Hermes; Hermes consumes routing, it does not
produce it. Direct external agents through Kanban comments, not through V as a relay.
```

**Verify:**
```sh
HN="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/.hermes/skills/heartbeat-protocol/SKILL.md"
ALIAS="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol/SKILL.md"
test -f "$HN" && echo OK                                 # expected OK
grep -c "Hermes-Verifier" "$HN"                          # expected >=1
grep -c "board custody" "$HN"                             # expected >=1 (Kanban board custody + crafting)
grep -c "Manual QA" "$HN"                                 # expected >=1
grep -c "compare-before-write" "$HN"                     # expected >=1 (race machinery)
grep -c "AUTHORITY EPOCH" "$HN"                          # expected >=1 (race machinery)
grep -c "Claude-Router" "$HN"                            # expected >=1 (routing disclaimed to Claude-Router)
grep -c "debateai-heartbeat-protocol.md" "$ALIAS"        # expected >=1 (spine is now source of truth)
grep -c "SOURCE OF TRUTH" "$ALIAS"                       # expected 1
grep -c "DEMOTED to implementation notes" "$ALIAS"       # expected 1
```

**Acceptance:**
1. A new real file `.hermes/skills/heartbeat-protocol/SKILL.md` exists and declares the **Hermes-Verifier + Kanban board-custody** contract (independent verification, board custody/crafting, Manual QA runs, and the AUTHORITY EPOCH / compare-before-write race machinery), and disclaims routing/dispatch to Claude-Router (ruling R1).
2. The AppData FULL alias names the repo spine as source of truth and demotes the FULL body to implementation notes.
3. Both files carry `spine_version: 3.0.0`.
4. Hermes now loads the same spine as Codex/Claude/Grok — the two-lineage split is closed.

---

### Task 3.8: Author the new Claude node contract and retire the rogue session-root skill
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.claude\skills\heartbeat-protocol\SKILL.md` (rewrite as the new Claude node contract)
- Move (non-destructive, no delete): `C:\Users\vladm\Desktop\debate\.claude\skills\heartbeat-protocol\` → `C:\Users\vladm\Desktop\debate\.claude\skills\_retired-heartbeat-protocol-rogue-20260723\`
- Create: `C:\Users\vladm\Desktop\debate\.claude\skills\_retired-heartbeat-protocol-rogue-20260723\RETIRED.md`

**Risk tier:** high (retiring the rogue touches the Codex-only coding-law / safety boundary — the rogue encodes Claude-as-coder, which every spine-legal instance forbids; per V ruling #1 the rogue retires the moment the replacement lands)

**Review gate:** high → full ladder + V (V ruling #1 governs the rogue's retirement timing).

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md;
  move the session-root .claude/skills/heartbeat-protocol/ directory to the _retired-* sibling and add RETIRED.md
Forbidden: all other files; do NOT delete the rogue content (deletion waits for prune approval, V ruling #4)
Verification: the commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] Rewrite the repo Claude vendor skill `DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md` (full overwrite) as the new Claude node contract. Per V ruling #1 (D1) and ruling R1, Claude's cemented role is the **Main Orchestrator** (the Claude-Router seat): it runs the One-Prompt Machine, decomposes and routes missions, and launches all agents/fleets, holding no verification or board-mutation authority (those are Hermes-Verifier's) and assigning workers per the model-law roster (ruling R4). New content:

```markdown
---
name: heartbeat-protocol
description: Claude node contract for DebateAI Graph Spine v2. The Main Orchestrator (Claude-Router seat) contract; thin loader over the repo spine.
version: 3.0.0
spine_version: 3.0.0
---

# Claude Node Contract (Main Orchestrator)

Thin. Source of truth is the repo Graph Spine v2. This contract cements Claude's
in-app role (Decision D1, ruling R1): Claude Code (Fable) is the **Main
Orchestrator**, the Claude-Router seat (spine §5.1).

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/claude-heartbeat-adapter.md`
4. The current mission intake (H0) and the board's typed state blocks

## Role: Main Orchestrator (Claude-Router seat, spine §5.1)

Claude Code (Fable) holds the Claude-Router seat and does the following, and only
the following:

- **Runs the One-Prompt Machine (mission intake H0):** exactly one V prompt starts
  a mission; thereafter only the three V-facing surfaces of D5 are open.
- **Runs the intake loop-ownership election (ruling R7):** before kicking off the
  Heartbeat Protocol, Claude prompts the user with the intake question: which
  model(s) — one or more — own which loop (REQUIREMENTS ENGINEERING /
  ARCHITECTURE / PROGRAMMING / QA)? The answers instantiate the mission's
  `loop_ownership` map in the model-law roster (Task 3.12); only then does the
  Heartbeat Protocol start. The election is part of the H0 design-question
  surface — no new V-facing surface is created.
- **Decomposes and routes missions:** breaks the mission into tickets, picks the
  next edge from classified state, assigns `owner`, sets `status`, and advances
  `authority_epoch` on handover — routing metadata only.
- **Launches all agents and fleets:** spawns every worker, reviewer, and fleet the
  mission needs.
- **Respects the model-law roster (spine `## Binding stage and coding law`, ruling
  R4):** worker assignment reads the versioned roster as state; Claude never
  hard-codes a coding-agent identity and never assigns itself to code unless the
  roster names Claude as a coding agent. Only V edits the roster.

Claude-Router holds **no verification and no board-mutation authority** — those are
Hermes-Verifier's (spine §5.2: independent verification, Kanban board custody +
crafting, Manual QA runs). Claude-Router consumes Hermes-Verifier's verdicts; it
never produces one, never marks work Done, and never mutates the board's review
state.

## Claude worker instances (spawned, not the orchestrator)

When the route assigns a Claude instance as a planning-artifact worker (C2 Plan.md,
C4 FinalPlan.md) or an independent read-only reviewer, that instance is a bounded
worker node: it authors only its assigned artifact or review verdict, reads its
stage/ticket state and declared upstream paths, writes `{status (to
waiting_review/waiting_hermes), comments_read_through}` and its own artifact only,
and never orchestrates, routes, or writes `risk_tier`/`authority_epoch`. Rework
stays in the same stage session (spine preserved law 4); a lost session posts
`CLAUDE BLOCKED` with `session_continuity` and needs `WORKER CONTINUITY OVERRIDE`.

## Markers

Recognize the full spine §8 union. As Claude-Router, emit the routing markers
HERMES AUTHORIZED NEXT / HERMES AUTHORIZED ROUTE / WORKER CONTINUITY OVERRIDE,
advance `authority_epoch` on handover, and assemble the V DECISIONS PACKET. As a
spawned worker, emit CLAUDE HEARTBEAT / CLAUDE BLOCKED / READY FOR PEER REVIEW /
READY FOR HERMES STAGE REVIEW / REWORK READY FOR HERMES REVIEW with the latest
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Never perform content judgment or produce a verdict (that is Hermes-Verifier);
never mark Done or mutate board review state; never push without V approval; never
code unless the model-law roster names Claude as a coding agent; never delete
product/database data, create fake runtime data, reveal secrets, cross file
contracts, or ignore ticket comments. If the orchestrator session is down, the
Architecture-responsible agent relays directly to the humans (ruling R3) — the only
sanctioned fallback, legal because ARCHITECTURE already holds design-question
authority.
```

- [ ] Retire the rogue session-root skill non-destructively. It currently wins the `heartbeat-protocol` name resolution for any work outside `DebateV2/apps/dialectical-engine` and encodes Claude-as-coder (forbidden). Rename its directory to a non-resolving sibling (this removes it from the `heartbeat-protocol` name without deleting content — deletion waits for prune approval, V ruling #4):

```sh
cd "C:/Users/vladm/Desktop/debate/.claude/skills"
mv heartbeat-protocol _retired-heartbeat-protocol-rogue-20260723
```

- [ ] Create `C:\Users\vladm\Desktop\debate\.claude\skills\_retired-heartbeat-protocol-rogue-20260723\RETIRED.md` with exactly:

```markdown
# RETIRED — session-root rogue heartbeat-protocol

Retired 2026-07-23 per V ruling #1 (blueprint §6.3.1): the new Claude node
contract landed at
`DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`,
so this session-root skill is retired the moment the replacement landed.

This directory is renamed (not deleted) so it no longer wins `heartbeat-protocol`
name resolution outside `DebateV2/apps/dialectical-engine`. It encoded
Claude-as-coder with implementer/verifier subagents, which violates the model-law
roster (spine `## Binding stage and coding law`, ruling R4 — currently Codex sole
coder). Do NOT invoke it. Any `[Claude]` routing follows the Graph Spine v2, not
this file.

Deletion is DEFERRED to post-final-push prune approval (V ruling #4). The
original SKILL.md is preserved unchanged alongside this note.
```

**Verify:**
```sh
CLAUDE_NC="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md"
ROGUE_OLD="C:/Users/vladm/Desktop/debate/.claude/skills/heartbeat-protocol"
ROGUE_NEW="C:/Users/vladm/Desktop/debate/.claude/skills/_retired-heartbeat-protocol-rogue-20260723"
grep -c "Main Orchestrator" "$CLAUDE_NC"                 # expected >=1 (cemented role)
grep -c "One-Prompt Machine" "$CLAUDE_NC"               # expected >=1 (runs H0 intake)
grep -c "no verification and no board-mutation authority" "$CLAUDE_NC"  # expected 1
grep -c "model-law roster" "$CLAUDE_NC"                 # expected >=1 (worker assignment per roster)
grep -c "spine_version: 3.0.0" "$CLAUDE_NC"              # expected 1
test -e "$ROGUE_OLD" && echo STILL_RESOLVES || echo RETIRED   # expected RETIRED
test -f "$ROGUE_NEW/SKILL.md" && echo PRESERVED          # expected PRESERVED (content not deleted)
test -f "$ROGUE_NEW/RETIRED.md" && echo NOTE_OK          # expected NOTE_OK
```

**Acceptance:**
1. The repo Claude node contract is the **Main Orchestrator** (Claude-Router) contract: it runs the One-Prompt Machine (H0), decomposes and routes missions, launches all agents/fleets, holds no verification or board-mutation authority (those are Hermes-Verifier's), and assigns workers per the model-law roster (ruling R4).
2. `C:\Users\vladm\Desktop\debate\.claude\skills\heartbeat-protocol` no longer exists (does not win name resolution); the content is preserved under the `_retired-*` sibling.
3. A `RETIRED.md` note records the V ruling #1 retirement and the V ruling #4 deletion deferral.
4. Nothing was deleted; the rogue content is fully recoverable.

---

### Task 3.9: Write the reference-archive tiering index (moves deferred to post-push prune)
**Files:**
- Create: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\references\archive\ARCHIVE-INDEX.md`
- Create: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\references\archive\ARCHIVE-INDEX.md`

**Risk tier:** low (writes an index only; moves and deletions are deferred to post-final-push prune approval per V ruling #4; no rule change)

**Review gate:** low → direct Hermes diff review, same-cycle done.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: the two ARCHIVE-INDEX.md files (create) and their new archive/ directories
Forbidden: all other files; do NOT MOVE, rename, or delete any reference postmortem (V ruling #4)
Verification: the commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Create the FULL index `debateai-kanban-heartbeat-review-loop/references/archive/ARCHIVE-INDEX.md`. It lists all 106 FULL references, splitting KEEP (reusable procedures merged into the spine, never archived) from ARCHIVE-by-spine-law (single-incident postmortems generalized by a named spine law). No file is moved by this task.

```markdown
# FULL reference tiering index (debateai-kanban-heartbeat-review-loop)

Status: INDEX ONLY. No file is moved, renamed, or deleted here. Physical moves
into `archive/` and any deletion are DEFERRED to post-final-push prune approval
(V ruling #4). This index records the plan: KEEP vs ARCHIVE-by-spine-law.

## KEEP — reusable procedures merged into Graph Spine v2 (18; not archived)

- ddd-worktree-integration-closure-gate.md
- failed-test-ticket-fanout.md
- harness-quality-degradation-and-cockpit-rot.md
- hermes-numbered-stage-review-gates.md
- hermes-owned-triage-review-and-successor-routing.md
- integrated-research-zenith-eve-continual-harness.md
- live-agent-monitoring.md
- post-dialogue-checkpoint-compaction.md
- product-truth-gate-after-codex-wave.md
- report-console-and-dev-run.md
- restarting-heartbeat-loops.md
- reusable-prompt-blocks.md
- shared-protocol-spine.md
- stage-terminal-agent-rotation.md
- ticket-comment-review-loop.md
- v2-worker-readiness-and-judge-lifecycle.md
- windows-codex-heartbeat-app-control-and-timeouts.md
- zenith-mission-mode.md

## ARCHIVE — postmortems, grouped by the spine law that generalizes them (88)

### Generalized by §10 wake-gate / change-driven wake (9)
- active-heartbeat-cadence-and-relaunch.md
- cron-process-manager-and-acceptance-fallbacks.md
- cron-silence-and-nonspawnable-ready.md
- heartbeat-cron-cli-comment-search-2026-06-23.md
- heartbeat-cron-delivery-and-routing-smoke-2026-06-25.md
- heartbeat-partial-wave-bootstrap-and-marker-filter-2026-06-26.md
- heartbeat-silent-empty-queue-python-sqlite-discovery.md
- overnight-review-only-change-gated-watcher.md
- silent-continuation-and-gate-cleanup.md

### Generalized by §5 router split / dispatch / triage (8)
- autonomous-review-loop-and-bounded-parallelism.md
- ddd-wave-kanban-cockpit-lessons.md
- debateai-claude-followup-ticket-triage.md
- heartbeat-review-precheck-routing-holds-2026-06-24.md
- heartbeat-review-prereq-tenant-recommendations-release-2026-06-24.md
- hermes-cockpit-agent-broker-and-self-blocking.md
- scdef-autonomous-review-loop.md
- scdef-cron-broker-lessons.md

### Generalized by §6 stage numbering / planning diamond (1)
- claude-fable-plan-mode-stage-handoff.md

### Generalized by §9 review-lane applicability / review diamond (10)
- claude-p-review-only-wave.md
- heartbeat-observability-pr1-pr2-final-gates.md
- heartbeat-observability-pr2-a-review-2026-06-26.md
- heartbeat-review-batch-2026-06-19.md
- heartbeat-review-dual-handoff-2026-06-19.md
- heartbeat-review-fe-audit-batch-2026-06-22.md
- heartbeat-review-noop-child-and-final-gate-2026-06-25.md
- heartbeat-review-option-b-fe-be-gate-2026-06-23.md
- heartbeat-review-option-b-noop-verification-2026-06-23.md
- heartbeat-review-option-b-wave-2026-06-23.md

### Generalized by Zenith-as-risk-dial (§9 high-risk floor + KEEP zenith-mission-mode) (9)
- cleanup-heartbeat-zenith-push-guardrails.md
- cleanup-wave-heartbeat-zenith-lessons.md
- heartbeat-zenith-before-after-stats.md
- zenith-direct-vs-mcp.md
- zenith-external-evidence-fallback.md
- zenith-kanban-fallback-and-agent-launch.md
- zenith-terminal-reviewer-mcp-repair.md
- zenith-terminal-reviewer-repair-and-gap-closure.md
- zenith-terminal-reviewer-repair-and-pause.md

### Generalized by §10 convergence caps (3)
- codex-launch-timeout-control.md
- review-block-relaunch-pattern.md
- serial-loop-until-testable.md

### Generalized by §11.1 safety rules / Windows ops (2)
- codex-side-skill-hardening.md
- windows-bracket-path-node-tests.md

### Generalized by §12 worktree/workdir + dirty-tree attribution (10)
- heartbeat-cross-tenant-dirty-ownership-2026-06-25.md
- heartbeat-cross-tenant-owned-dirt-review-2026-06-25.md
- heartbeat-idle-dirty-worktree-report-2026-06-25.md
- heartbeat-review-parallel-commit-hygiene-2026-06-22.md
- heartbeat-review-tree-shell-sibling-dirt-2026-06-24.md
- heartbeat-sqlite-comment-discovery-and-owned-dirt-2026-06-25.md
- heartbeat-stale-done-markers-and-nonsubstantive-dirt-2026-06-25.md
- heartbeat-worktree-path-reconciliation-2026-06-26.md
- parallel-fixing-lanes-and-clean-prompt-formatting.md
- worker-runtime-token-rotation-and-db-lock-2026-06-25.md

### Generalized by §4 launch-packet bound / §1 cockpit legibility / live monitoring (8)
- heartbeat-manual-qa-hold-silent-2026-06-24.md
- heartbeat-observability-done-and-stable-holds-silent-2026-06-25.md
- heartbeat-ready-queue-no-handoff-silent-2026-06-24.md
- hermes-owned-kanban-qa-and-steering-boundary-2026-06-25.md
- interactive-agent-tui-monitoring-and-permission-gates.md
- live-breakpoint-no-theater-mode.md
- live-observation-and-steering.md
- truthful-cockpit-state-and-kanban-launch-reporting.md

### Generalized by §11 law 10 product-truth gate (evidence) (28)
- debateai-scoring-live-state-triage.md
- heartbeat-review-evidence-truth-live-api-db-2026-06-24.md
- heartbeat-review-header-toolbar-cdp-cleanup-2026-06-24.md
- heartbeat-review-scoring-config-prereq-2026-06-24.md
- heartbeat-review-scoring-tree-closure-manual-hold-2026-06-24.md
- heartbeat-review-scoring-ui-headless-cdp-2026-06-24.md
- heartbeat-review-source-path-check-2026-06-22.md
- heartbeat-review-tree-usability-regression-2026-06-24.md
- observability-dev-logs-token-qa-2026-06-25.md
- observability-log-manual-probe-2026-06-25.md
- real-judges-heartbeat-cockpit-lessons.md
- scdef-heartbeat-verification-lessons.md
- scoring-audit-patterns.md
- scoring-backend-truth-no-code-review-2026-06-24.md
- scoring-default-feedback-wave.md
- scoring-default-review-pitfalls.md
- scoring-evidence-truth-review-timeout-2026-06-24.md
- scoring-final-manual-qa-gate.md
- scoring-final-qa-closure-review-2026-06-24.md
- scoring-fresh-debate-unavailable-live-debug-2026-06-25.md
- scoring-option-b-live-refresh-debugging-2026-06-23.md
- scoring-refresh-async-job-review-2026-06-24.md
- scoring-tree-augmentation-qa-failure-2026-06-24.md
- scoring-truth-correction-review-2026-06-24.md
- scoring-ui-browser-qa-devtools-2026-06-24.md
- scoring-visual-qa-miss-2026-06-24.md
- scoring-wave-loop-lessons.md
- vertical-slice-closure-qa-gate.md
```

- [ ] Create the LITE index `heartbeat-protocol-lite/references/archive/ARCHIVE-INDEX.md`. LITE's references are mostly law-sources (transplanted into the spine as universal law); only three single-incident/race narratives are archived.

```markdown
# LITE reference tiering index (heartbeat-protocol-lite)

Status: INDEX ONLY. No file is moved, renamed, or deleted here. Physical moves and
any deletion are DEFERRED to post-final-push prune approval (V ruling #4). LITE
carries zero dated postmortems; almost every reference is a transplanted law-source.

## KEEP — law-sources transplanted into Graph Spine v2 (26; not archived)

- authority-bound-watcher-rollover.md            (§5 epoch / §2)
- authority-epoch-board-reconciliation.md        (§2 authority_epoch)
- authority-freshness-and-route-retraction.md    (§5 compare-before-write)
- blocked-ticket-approval-and-retry-recovery.md  (§10 unblock ceiling)
- board-identity-and-auto-dispatch.md            (§5 router dispatch)
- change-driven-cron-wake-gate.md                (§10 wake-gate fingerprint)
- change-driven-heartbeat-and-target-fidelity.md (§10 wake gate)
- change-driven-routing-and-board-continuity.md  (§10 wake gate)
- closed-loop-review-routing.md                  (§5 verifier→router)
- cockpit-legibility-and-completion-handshake.md (§1 legibility / §8 markers)
- failed-test-ticket-fanout.md                   (§7 implementation diamond)
- file-scope-conflict-authority-repair.md        (§11 law 3 file contracts)
- kanban-first-visual-poll-handshake.md          (§4 / §1 legibility)
- large-handoff-folder-pattern.md                (§4 launch-packet bound)
- mid-chain-takeover-and-lost-session.md         (§11 law 4 continuity)
- native-kanban-dispatch-and-review-gates.md     (§5 router dispatch)
- one-prompt-goal-heartbeat-loop.md              (§10 batched approvals)
- overnight-closure-feasibility-and-waiting-gates.md (§10 waits carry owner/deadline)
- peer-red-autonomous-continuation.md            (§9 peer-review-first)
- post-prerequisite-route-hold-reconciliation.md (§5 router route holds)
- product-truth-gates-and-board-repair.md        (§11 law 10 product truth)
- provider-backed-product-proof-budgeting.md     (§11 law 9 named categories)
- provider-proof-defect-return-loop.md           (§10 rework cap)
- status-independent-kanban-change-detection.md  (§10 wake gate)
- triage-completion-status-reconciliation.md     (§5 / §9 triage administration)
- visible-cockpit-reporting-and-gpt-loop.md      (§1 legibility)

## ARCHIVE — single-incident / race narratives, grouped by generalizing spine law (3)

### Generalized by §5 router / auto-dispatch race (1)
- kanban-create-auto-dispatch-race.md

### Generalized by §9 review-lane / reviewer race (1)
- reviewer-claim-and-verdict-race.md

### Generalized by §11 law 10 product-truth (test determinism) (1)
- order-dependent-python-tests.md
```

**Verify:**
```sh
FULLIDX="C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/references/archive/ARCHIVE-INDEX.md"
LITEIDX="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/references/archive/ARCHIVE-INDEX.md"
test -f "$FULLIDX" && echo OK                            # expected OK
test -f "$LITEIDX" && echo OK                            # expected OK
grep -c "^- " "$FULLIDX"                                 # expected 106 (18 KEEP + 88 ARCHIVE)
grep -c "^- " "$LITEIDX"                                 # expected 29 (26 KEEP + 3 ARCHIVE)
# no postmortem was physically moved: the archive dir holds only the index
ls "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/references/archive/" | grep -vc "ARCHIVE-INDEX.md"  # expected 0
```

**Acceptance:**
1. Both `ARCHIVE-INDEX.md` files exist under a new `references/archive/` subdirectory.
2. The FULL index accounts for all 106 references exactly once (18 KEEP + 88 ARCHIVE-by-law); the LITE index accounts for all 29 (26 KEEP + 3 ARCHIVE).
3. Every ARCHIVE entry names the spine law that generalizes it.
4. No reference postmortem was moved, renamed, or deleted — the `archive/` directory contains only the index (moves deferred to prune approval, V ruling #4).

---

### Task 3.10: Rewrite the `.grok` and `.agents` vendor skills as Graph Spine v2 thin node contracts
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.grok\skills\heartbeat-protocol\SKILL.md` (rewrite as the Grok node contract)
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\.agents\skills\heartbeat-protocol\SKILL.md` (real file after Task 3.6; rewrite as the Codex-mirror node contract)

**Risk tier:** medium (ends the last stale vendor bodies; makes `.grok` and `.agents` load the same spine as their siblings; touches no safety law)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: DebateV2/apps/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md; DebateV2/apps/dialectical-engine/.agents/skills/heartbeat-protocol/SKILL.md
Forbidden: all other files; do NOT modify the .zenith symlink target
Verification: the commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Order dependency: run **after** Task 3.6 (so `.agents` is a real in-repo file, not a symlink) and after Task 3.1 (so the spine sections referenced below exist). `.grok` is already a real file today at version 2.2.0; `.agents` is materialized by 3.6.
- [ ] Rewrite `.grok/skills/heartbeat-protocol/SKILL.md` (full overwrite of this one vendor file) as the Grok node contract, mirroring the thin-loader pattern of Tasks 3.7/3.8. New content:

```markdown
---
name: heartbeat-protocol
description: Grok node contract for DebateAI Graph Spine v2. Research / plan-review / vertical-slices artifact worker and independent read-only reviewer; thin loader over the repo spine.
version: 3.0.0
spine_version: 3.0.0
---

# Grok Node Contract

Thin. Source of truth is the repo Graph Spine v2.

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/grok-heartbeat-adapter.md`
4. The current stage/ticket state block and its comments

## Role (current law: research / plan-review / slices / review)

```text
Grok G1 = Research.md artifact worker (spine §6)
Grok G3 = PlanReview.md independent plan reviewer (planning diamond, spine §7) — never reads H2's verdict
Grok G5 = VerticalSlices.md artifact worker
Grok reviewer = independent read-only peer/specialist reviewer (review diamond, spine §7)
Codex GPT-5.6 Sol = sole coding worker under the current model law
```

Grok does NOT implement production/test/migration/configuration code while the
Codex-only law is active; its role is research, plan-review, slicing, and
read-only review.

## State reads/writes (spine §3)

Reads its stage/ticket state, `risk_tier`, and declared upstream artifact paths.
Writes `{status (to waiting_review/waiting_hermes), comments_read_through}` and its
own artifact only. Never writes `risk_tier`, `authority_epoch`, `worktree`, or
another node's files.

## Node flow

Author only the assigned artifact -> `READY FOR HERMES STAGE REVIEW` (G1/G5), or
record a G3/review verdict through markers (`READY FOR PEER REVIEW` /
`PEER REVIEW APPROVED` / `PEER REVIEW CHANGES REQUESTED`). In a diamond, never read
another reviewer's verdict (G3 never reads H2's; spine §7). Stop editing after
handoff; Hermes-Verifier (spine §5.2) gates. Rework stays in the same stage session
(preserved law 4); on a lost session post `GROK BLOCKED` with `session_continuity`
and require `WORKER CONTINUITY OVERRIDE`.

## Worktree (read-only)

Grok never creates, merges, or deletes git worktrees (Codex-only coding law). When
reviewing a Codex lane, read inside the lane's `worktree.path`, never edit, and honor
the spine `max_concurrent_heavy` semaphore. Full read-only worktree rules:
`grok-heartbeat-adapter.md` -> `## Worktree and parallelism` (Phase 5 Task 5.4).

## Markers

Recognize the full spine §8 union. Emit `GROK HEARTBEAT` / `GROK BLOCKED` /
`RESEARCH HANDOFF COMPLETE` / `READY FOR PEER REVIEW` /
`READY FOR HERMES STAGE REVIEW` / `REWORK READY FOR HERMES REVIEW` with the latest
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Do not code under the current law, mark Done, push without V approval, delete
product/database data, create fake runtime data, reveal secrets, cross file
contracts, or ignore ticket comments.
```

- [ ] Rewrite `.agents/skills/heartbeat-protocol/SKILL.md` (full overwrite of this one vendor file) as the Codex-mirror node contract. The `.agents` mount resolves the same sole-coding-worker role as `.codex`. New content:

```markdown
---
name: heartbeat-protocol
description: Codex node contract for DebateAI Graph Spine v2 (the .agents mount mirrors the .codex Codex node contract). Sole coding worker; thin loader over the repo spine.
version: 3.0.0
spine_version: 3.0.0
---

# Codex Node Contract (.agents mirror)

Thin. Source of truth is the repo Graph Spine v2. This `.agents` node contract
mirrors the `.codex` Codex node contract exactly; both mounts resolve the same
sole-coding-worker role.

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/codex-heartbeat-adapter.md`
4. The current Kanban ticket state block and its comments

## Role (current law: sole coding worker)

```text
Codex GPT-5.6 Sol = sole coding worker; A7 implementation lanes in isolated worktrees
Claude / Grok     = planning-artifact workers and read-only reviewers (never code under the current law)
```

## State reads/writes (spine §3)

Reads `{contract, status, rework_round, authority_epoch, worktree,
comments_read_through}`. Writes `{status, worktree, evidence refs,
comments_read_through}`. Never writes `risk_tier`, `authority_epoch`, or
`owner.agent`.

## Node flow

Claim a Ready card only when authorized — its latest applicable
`HERMES AUTHORIZED NEXT`, OR the card is named in a current
`HERMES AUTHORIZED ROUTE` for the epoch; per-node re-auth is required again on any
new risk signal or important operation (spine §10). Fetch only the assigned ticket
(launch-packet bound, spine §4); never list the board. Work one card at a time in
its isolated worktree; run the Split -> Verify -> Merge lane checklist (spine
`## Worktree isolation`, Phase 5). Post `READY FOR PEER REVIEW` on first-pass
completion; a separate read-only reviewer advances GREEN work. Never self-Done,
never self-integrate.

## Worktree lanes (spine `## Worktree isolation`)

Create a worktree only after the H6 LANE PLAN APPROVAL row for the current
`authority_epoch` is approved. Destructive git (worktree remove, branch delete,
history rewrite, force push) stays individually V-gated.

## Markers

Recognize the full spine §8 union incl. `HERMES AUTHORIZED NEXT` /
`HERMES AUTHORIZED ROUTE`. Emit `CODEX HEARTBEAT` / `CODEX BLOCKED` /
`WORKER CLAIM` / `READY FOR PEER REVIEW` / `REWORK READY FOR HERMES REVIEW` with the
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Never mark Done, push/merge without V approval, delete database/product data without
specific approval, create fake runtime data, cross file contracts, or ignore ticket
comments.
```

**Verify:**
```sh
BASE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine"
GROK="$BASE/.grok/skills/heartbeat-protocol/SKILL.md"
AGENTS="$BASE/.agents/skills/heartbeat-protocol/SKILL.md"
grep -c "# Grok Node Contract" "$GROK"                  # expected 1
grep -c "Grok G3 = PlanReview.md" "$GROK"               # expected 1
grep -c "spine_version: 3.0.0" "$GROK"                  # expected 1
grep -c "version: 2.2.0" "$GROK"                        # expected 0 (stale body gone)
grep -c "Codex Node Contract (.agents mirror)" "$AGENTS"  # expected 1
grep -c "sole coding worker" "$AGENTS"                  # expected >=1
grep -c "spine_version: 3.0.0" "$AGENTS"                # expected 1
grep -c "debateai-heartbeat-protocol.md" "$GROK"        # expected >=1 (loads the spine)
grep -c "debateai-heartbeat-protocol.md" "$AGENTS"      # expected >=1
```

**Acceptance:**
1. `.grok` is a Grok node contract (research/plan-review/slices worker + read-only reviewer) that loads the spine and carries `version: 3.0.0` / `spine_version: 3.0.0`; no `2.2.0` body remains.
2. `.agents` is a Codex-mirror node contract (sole coding worker, worktree lanes) that loads the spine and carries `version: 3.0.0` / `spine_version: 3.0.0`.
3. Both declare the spine §3 reads/writes and the spine §8 marker union, and neither ships a stale pre-3.0.0 body under a 3.0.0 stamp.
4. Task 3.2 therefore issues no literal version replacement against `.grok`/`.agents` (they are stamped here).

---

### Task 3.11: §6.4 transplant completion sweep — install the remaining Lite/FULL best-formulation laws into the spine
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** medium (spine-law additions: installs the remaining blueprint §6.4 transplant laws as normative spine text; additive, weakens no §1.3 law)

**Review gate:** medium → 1 independent reviewer + Hermes-Verifier. The reviewer confirms every transplant is present verbatim and that none duplicates a rule already owned by another section.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: docs/agent-protocols/debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the grep commands in the Verify block below
Human review required: no
```

**Steps:**
- [ ] Order dependency: run **after** Task 3.1 (§1–§12 skeleton), Task 3.5 (§6/§8), and Task 3.4 (§9) so every anchor below exists. This task is part of the spine-population sequence and completes the §6.4 transplant set that Task 3.9's archive index only *indexed* as KEEP.

- [ ] **(a) IMPORTANT OPERATIONS enumeration.** In the `## Operating model` section, replace the vague V-interruption sentence — the one reading `V should only be interrupted for real product, architecture, security, destructive-action, scope, or human acceptance decisions.` — with Lite's precise enumeration (the sentence that follows it, `Routine routing and review communication belong in ticket comments.`, is preserved unchanged):
```text
V is interrupted ONLY for an **IMPORTANT OPERATION** or final acceptance. The
IMPORTANT OPERATIONS are, exactly: provider/model spend or external calls;
secrets/auth; product/live DB or product-data writes; any deletion; destructive
filesystem/Git/history; commit/push/merge/release/branch/worktree operations;
architecture or scope expansion; reconstructed-evidence acceptance/waiver; and
final human/product acceptance. Anything outside this list is not an important
operation and is handled inside Hermes and the ticket comments, never by
interrupting V.
```

- [ ] **(b)/(c)/(g) Cockpit legibility, Kanban visual-launch receipt, and orchestrator/never-writer law.** Append the following three subsections to the end of the `## Hermes cockpit responsibilities` section (preserved by Task 3.1):
```text
### Cockpit legibility (required V-facing status shape)

Internal rigor must not make the cockpit unreadable. The default V-facing status is
exactly four lines; when V signals confusion, stop narrating protocol ceremony and
restate in this shape:

```text
DONE: <last fully accepted ticket, or none>
RUNNING: <current ticket + plain-English activity, or none>
BLOCKED: <ticket + exact missing acceptance evidence, or none>
V ACTION: none | <one smallest important-operation decision>
```

For a binary question, lead with `Yes` or `No`, then the reason. Add test counts or
routing detail only when they explain the verdict.

### Kanban visual-launch three-layer receipt

Before reporting a Kanban/app surface as launched, prove it with all THREE layers;
a single green layer is not a launch:

1. **Health endpoint** — the service/health route returns OK.
2. **Plugin/API layer** — the Kanban plugin API (board list / card read) responds
   for the active tenant.
3. **Rendered route** — the actual board/app route renders in a browser (not just a
   200) with the expected board visible.

Report `prepared / not active` until all three pass; never claim a visual launch
from one layer.

### Main-thread orchestrator / never-writer subagent law (one law, two transports)

The orchestrating thread routes and reviews; it never writes product code or
artifacts itself. Writing is done only by a dispatched worker node (a Codex lane, or
a Claude/Grok artifact node). This is one law across both transports: PTY-hosted
agents and SDK-subagent workers. A router/orchestrator that edits the change it is
routing violates the detector/reviewer/router separation (spine §11 law 8) and the
independent-review law (§11 law 1).
```

- [ ] **(d) Zenith principles-vs-runtime risk dial.** Append the following subsection to the end of the `## 5. Routers: Claude-Router and Hermes-Verifier` section (after §5.3):
```text
### 5.4 Zenith principles-vs-runtime risk dial

Zenith rigor is a dial keyed on `risk_tier`, not an always-on ceremony. For ordinary
work (`risk_tier` low/medium) apply Zenith *principles* only — adversarial framing,
evidence-first, no-theater — without standing up a separate Zenith chamber. For a
high-risk mission (`risk_tier: high`, or anything on the immutable high-risk floor,
§9) run the real Zenith chamber (independent adversarial review environment with its
own evidence). The dial never lowers a high-risk mission below the real chamber.
```

- [ ] **(e) Batch/wave re-list-before-finalizing law.** Append the following item to the end of the `## 10. Convergence and batched-approval laws` section (a new item under the batched-approval laws):
```text
8. **Re-list before finalizing (batch/wave law).** Before closing a wave, batch, or
   `HERMES AUTHORIZED ROUTE`, Hermes re-lists the live board and re-reads each card's
   current state block; it never finalizes from a stale in-memory list. A close,
   Done, or route-completion recorded against a list that was not re-read at
   finalize-time is invalid and must be redone against a fresh read.
```

- [ ] **(f) Architecture-boundary stop-and-route trigger list.** Append the following subsection to the end of the `## 7. Edges, diamonds, and feedback edges` section (it is the enumerated trigger set consumed by the `ARCHITECTURE -> REQUIREMENTS` and `QA -> ARCHITECTURE` feedback edges that Phase 4 Task 4.4 completes in this section):
```text
### Architecture-boundary stop-and-route triggers

A worker must NOT cross a new architecture or architecture-phase boundary without V
discussion/approval. These are stop-and-route triggers (post a blocker/heartbeat
asking for V/Hermes routing instead of implementing, and route via the
`ARCHITECTURE -> REQUIREMENTS` feedback edge above):

- new subsystem/module boundary,
- provider interface changes,
- DB schema/migration changes,
- job orchestration/background worker changes,
- public API contract changes,
- cross-cutting frontend state architecture,
- ticket title/body terms such as `Decide`, `architecture`, `phase`, `strategy`, `adapter`, or `orchestration`.
```

- [ ] **(h) `[SILENT]` sentinel demoted below the wakeAgent gate.** In the `## 10. Convergence and batched-approval laws` wake-gate law (item 4, "Wake-gate fingerprint"), append this sentence:
```text
FULL's `[SILENT]` / `NOOP` / `GOAL WAITING — DORMANT` sentinel is DEMOTED to a
fallback tier strictly BELOW this wakeAgent gate: the change-driven fingerprint
decides whether to wake; the `[SILENT]` sentinel is consulted only as a
belt-and-suspenders suppressor when the fingerprint is unavailable, never as the
primary wake decision.
```

- [ ] **(i) `self_unblock_enabled` V-toggled capability field.** In the `## 2. State contract` YAML state block, add the field `self_unblock_enabled: false` (immediately above `comments_read_through`) with this comment, and add the governing sentence below the block:
```text
  self_unblock_enabled: false                # V-toggled worker-self-unblock capability; default false
```
```text
The Codex worker-self-unblock exception (Blocked -> In Progress recovery on the
worker's own active card) exists ONLY when `self_unblock_enabled: true`, which only V
sets, per-ticket. Default is `false`: with it false, no worker may self-recover a
Blocked card; an important-operation, human, safety, or product gate is never
self-cleared regardless of this flag.
```

- [ ] **(j) Compaction checkpoints: PTY-only, N/A for SDK-subagents.** Append this note to the end of the `## Binding post-dialogue checkpoint compaction` section (preserved by Task 3.1):
```text
Applicability by transport: compaction checkpoints apply to **PTY transports only**
(long-lived terminal agent sessions that accumulate context). They are **N/A for
SDK-subagent transports**, whose context is bounded per invocation and does not
accumulate across the mission. An SDK-subagent node never blocks on a
`COMPACTION CHECKPOINT`.
```

- [ ] **(k) Watcher-cadence contradiction resolved by the wake gate.** Append this sentence to the same `## 10. Convergence and batched-approval laws` wake-gate law (item 4):
```text
This also resolves FULL's watcher-cadence self-contradiction (1-minute mandatory
state detection vs 3–5-minute recovery cadence): cadence is irrelevant to cost once
unchanged ticks are tokenless — an unchanged fingerprint emits `wakeAgent:false`,
spends no model tokens, and produces no comment, so the detection interval may stay
at 1 minute while review wakes only on a real transition.
```

- [ ] **(l) The One-Prompt Machine law (V ruling, 2026-07-24).** Append this subsection at the END of the `## Operating model` section (immediately before the `## Binding stage and coding law` heading), after the IMPORTANT OPERATIONS enumeration installed by (a):
```text
### The One-Prompt Machine law

A mission starts with exactly ONE V prompt at REQUIREMENTS (H0). From that moment
the machine runs itself: V never relays prompts, pastes agent output, or presses
Resume. Exactly three V-facing surfaces exist for the entire mission:

1. DESIGN QUESTIONS: only the REQUIREMENTS node (H0 intake) and the ARCHITECTURE
   nodes (planning diamond C2/H2/G3/H3/C4) may address questions or steering
   requests to V directly, and only during design. No implementation, QA, watcher,
   or worker node ever addresses V.
2. IMPORTANT-OPERATION DECISIONS: from ANY node, a decision on the IMPORTANT
   OPERATIONS list above (database deletion, data manipulation, security/auth,
   provider spend, destructive git/filesystem, architecture or scope expansion,
   reconstructed evidence, waiver) reaches V exclusively as a row in the batched
   V DECISIONS PACKET. Cap-triggered V STEERING REQUIRED escalations
   (rework_round cap, chatter breaker, reset ceiling) travel the same way.
3. FINAL ACCEPTANCE (H9).

Any other V-facing message is a protocol violation: Claude-Router intercepts it
and re-routes it as a design question (if its origin is REQUIREMENTS/ARCHITECTURE),
a packet row (if it is an important operation or cap escalation), or an ordinary
ticket comment (everything else).
```

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "The IMPORTANT OPERATIONS are, exactly" "$SPINE"          # expected 1  (a)
grep -c "V should only be interrupted for real product" "$SPINE"  # expected 0  (a: vague sentence replaced)
grep -c "### Cockpit legibility (required V-facing status shape)" "$SPINE"  # expected 1  (b)
grep -c "V ACTION: none |" "$SPINE"                               # expected 1  (b)
grep -c "### Kanban visual-launch three-layer receipt" "$SPINE"   # expected 1  (c)
grep -c "Main-thread orchestrator / never-writer" "$SPINE"        # expected 1  (g)
grep -c "### 5.4 Zenith principles-vs-runtime risk dial" "$SPINE"  # expected 1  (d)
grep -c "Re-list before finalizing" "$SPINE"                      # expected 1  (e)
grep -c "### Architecture-boundary stop-and-route triggers" "$SPINE"  # expected 1  (f)
grep -c "DEMOTED to a" "$SPINE"                                    # expected 1  (h)
grep -c "self_unblock_enabled: false" "$SPINE"                    # expected >=1 (i)
grep -c "PTY transports only" "$SPINE"                            # expected 1  (j)
grep -c "watcher-cadence self-contradiction" "$SPINE"             # expected 1  (k)
grep -c "### The One-Prompt Machine law" "$SPINE"                 # expected 1  (l)
grep -c "exactly ONE V prompt" "$SPINE"                           # expected 1  (l)
```

**Acceptance:**
1. The vague operating-model V-interruption sentence is replaced by Lite's exact IMPORTANT OPERATIONS enumeration; the "Routine routing and review communication belong in ticket comments." tail is preserved.
2. The cockpit-legibility four-line format, the Kanban visual-launch three-layer receipt, and the orchestrator/never-writer law are installed under `## Hermes cockpit responsibilities`.
3. The Zenith risk dial is installed under §5 (keyed on `risk_tier`); the batch/wave re-list law and the architecture-boundary trigger list are installed under §10 and §7 respectively; the `[SILENT]` demotion and the watcher-cadence resolution are attached to the §10 wake-gate law; compaction PTY-vs-SDK applicability is attached to `## Binding post-dialogue checkpoint compaction`.
4. `self_unblock_enabled: false` is present in the §2 state block with the V-toggled governing sentence (default off; never clears a safety/human/product gate).
5. Every transplanted law appears exactly once; none duplicates a rule owned by another section.
6. The One-Prompt Machine law closes the `## Operating model` section: design-question emission is restricted to the REQUIREMENTS/ARCHITECTURE nodes, cap escalations route via the V DECISIONS PACKET, and any other V-facing message is intercepted by Claude-Router.

---

### Task 3.12: Parametrize the coding law as the model-law roster (ruling R4)

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (the Graph Spine v2 `## Binding stage and coding law` section only — preserved verbatim by Task 3.1's carry-forward manifest)

**Risk tier:** high (touches the coding law itself — the immutable high-risk floor category; per ruling R4 the coding-agent identity becomes state, and a roster change is an IMPORTANT OPERATION)

**Review gate:** high → full review diamond (§3.5) + product-truth gate + escalation into the `V DECISIONS PACKET`. The independent reviewer confirms the roster's current values preserve today's Codex-only assignment (no agent reassigned) and that no agent identity is hard-coded outside the roster; Hermes-Verifier confirms; V approves (roster edits are V-only and are IMPORTANT OPERATIONS).

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md (the `## Binding stage and coding law` section only)
Forbidden: all other files; do NOT change any agent's actual assignment — the roster's current values must preserve today's Codex-only coding
Verification: the commands in the Verify block below
Human review required: yes
```

**Execution ordering:** run after Task 3.1 (which authors/preserves `## Binding stage and coding law` in the Graph Spine v2) and before Task 3.2 (the LAST Phase-3 task, which stamps `version: 3.0.0` over the final content). This task edits only the section body, never its `##` heading, so Task 3.11(l)'s "insert before the `## Binding stage and coding law` heading" anchor still resolves.

**Steps:**
- [ ] In the Graph Spine v2, open the `## Binding stage and coding law` section. Inside its stage-list ` ```text ` fence, replace the hard-coded implementation line
  `Implementation             — Codex GPT-5.6 Sol only, fresh CLI PTY per ticket`
  with
  `Implementation             — coding_agents from the model-law roster (below); fresh CLI PTY per ticket`.
- [ ] Immediately after that stage-list fence — still inside the section, before the paragraph beginning `A revision stays with the original stage/ticket worker` — insert the model-law roster block and its law verbatim (shown below in a four-backtick fence because the inserted content itself carries a three-backtick ` ```text ` fence):

````text
The MODEL-LAW ROSTER is the single source of agent identity. Every stage above
names an agent *role*; the roster names the concrete agent filling each role.

```text
model_law_roster:
  roster_version: 1.0.0
  orchestrator: claude-fable          # Main Orchestrator / Claude-Router seat (ruling R1)
  verifier: hermes                    # Hermes-Verifier: verification + Kanban board custody/crafting + Manual QA (R1)
  coding_agents: [codex@gpt-5.6-sol]  # sole coder today; ONLY V may add/replace entries (ruling R4)
  planning_agents: [claude, grok]     # C2/C4 plan + G1/G3/G5 research/slice artifact workers
  review_agents: [claude, grok, hermes]  # independent reviewers + Hermes-Verifier
  loop_ownership:                     # per-mission election (ruling R7): asked at H0 intake
    requirements: [ask-at-intake]     # user answers which model(s) own each loop
    architecture: [ask-at-intake]     # one or more models per loop
    programming: [ask-at-intake]
    qa: [ask-at-intake]
```

Roster law (ruling R4): Only V edits the model-law roster; agents read it as state;
no protocol document may hard-code an agent identity outside the roster; roster
changes are IMPORTANT OPERATIONS (routed via the V DECISIONS PACKET, §10) and bump
`roster_version`. The current values preserve today's assignments (Codex is the
sole coder), so behavior is unchanged until V edits the roster. Coding-agent
assignment is volatile by design: future coding agents are added by editing the
roster, never by editing prose in this or any other document.

Loop-ownership election (ruling R7): at every mission intake (H0), the Main
Orchestrator prompts the user to answer which model(s) — one or more — own each
of the four loops (REQUIREMENTS ENGINEERING, ARCHITECTURE, PROGRAMMING, QA). The
user's answers instantiate this mission's `loop_ownership` map (a per-mission
roster instantiation under the user's authority — legal because only V/the user
edits the roster). Only after the election does the Main Orchestrator kick the
Heartbeat Protocol off. The `ask-at-intake` defaults above are placeholders, not
assignments: if the user explicitly delegates the election ("you pick"), the
Orchestrator fills the map from the roster's agent lists and records the
delegation on the mission ticket.
````

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "model_law_roster" "$SPINE"                        # expected >=1 (roster block installed)
grep -c "roster_version: 1.0.0" "$SPINE"                   # expected 1
grep -c "codex@gpt-5.6-sol" "$SPINE"                       # expected 1 (today's sole coder preserved in the roster)
grep -c "orchestrator: claude-fable" "$SPINE"              # expected 1
grep -c "verifier: hermes" "$SPINE"                        # expected 1
grep -c "Only V edits the model-law roster" "$SPINE"       # expected 1
grep -c "roster changes are IMPORTANT OPERATIONS" "$SPINE" # expected 1
grep -c "loop_ownership" "$SPINE"                          # expected >=1 (R7 election block installed)
grep -c "Loop-ownership election" "$SPINE"                 # expected 1 (R7 law prose installed)
grep -c "Codex GPT-5.6 Sol only" "$SPINE"                  # expected 0 (hard-coded identity removed from the stage line)
```

**Acceptance:**
1. The spine's `## Binding stage and coding law` section carries a fenced, versioned `model_law_roster` block naming `orchestrator` (claude-fable), `verifier` (hermes), `coding_agents` (`[codex@gpt-5.6-sol]`), `planning_agents`, and `review_agents`.
2. The hard-coded `Codex GPT-5.6 Sol only` identity is removed from the stage line and replaced by a pointer to the roster; the roster's current values preserve today's assignments (Codex sole coder), so behavior is unchanged until V edits the roster.
3. The roster law is present: only V edits the roster; agents read it as state; no protocol document hard-codes an agent identity outside the roster; a roster change is an IMPORTANT OPERATION and bumps `roster_version`.
4. No agent's actual assignment changed (Codex remains sole coder); the change is purely the ruling-R4 parametrization — coding-agent assignment is now volatile-by-design state, not law-in-prose.
5. The `loop_ownership` election block and the ruling-R7 law prose are present: intake prompts the user for loop ownership (one or more models per loop), answers instantiate the mission's map, and the Heartbeat Protocol starts only after the election (or an explicitly recorded delegation).

---

### Phase 3 exit criteria (blueprint §4 Phase 3 acceptance)

- The spine is authored as Graph Spine v2 **in place** (filename unchanged), with every Phase 1/2 addition and every §1.3 preserved law carried forward (Task 3.1 carry-forward manifest all-green) and no rule duplicated across sections.
- All node contracts load the same spine: `.codex`, `.agents` (3.6/3.10), `.claude` (3.8), `.grok` (3.10), `.hermes` (3.7), and the AppData FULL alias (3.7) — every one at `version: 3.0.0` / `spine_version: 3.0.0` after 3.2.
- The two binding review documents are reconciled to one applicability rule (3.4); launch packets are bounded (3.3); marker/stage vocabulary is unified (3.5); the reference-archive tiering is indexed with moves deferred (3.9); and the §6.4 transplant set is fully installed (3.11).
- The coding law is parametrized as the versioned model-law roster (3.12, ruling R4); the roster preserves today's Codex-only assignment and only V may edit it (roster changes are IMPORTANT OPERATIONS).
- The rogue session-root Claude skill is retired non-destructively (3.8, V ruling #1); nothing is deleted (V ruling #4).
- Phase 3 has **12 tasks** (3.1–3.12).

## Phase 4 — Diamonds

Phase 4 turns the linear planning/review chain into diamond topology: split → parallel → merge. It restructures the plan-review gate into a parallel diamond, adds planning risk tiers, replaces the serial peer-review double-gate with a diverse-lens review diamond and an adversarial default reviewer prompt, wires two missing feedback edges (both counted by the rework cap), adds an independent H6A ticketization check, and installs the Four Loops and the Grand Loop stop condition (ruling R6). Convergence caps from Phase 1 (`rework_round` cap = 3, chatter breaker, V DECISIONS PACKET) and the typed state block from Phase 2 (`risk_tier`, `rework_round`, `status`, `owner`, `worktree`, `waiting_since`, `escalation_target`) are assumed present and are referenced, not re-defined.

**Blueprint acceptance for this phase (measured at mission run, not by grep):** wall-clock for a Tier-1 mission's planning phase drops ≥30% vs the serial chain on the same content; review disagreements are adjudicated, not re-reviewed.

**v2 anchor map (binding — Phase 3 Task 3.1 restructured the spine; every Phase 4 spine edit targets a v2 section, NOT a pre-Phase-3 heading).** Phase 3 renamed/relocated the sections Phase 4 used to anchor on into the numbered Graph Spine v2 scheme, and made §7 the single owner of the diamond/edge topology. Phase 4 therefore targets these v2 sections:

| Pre-Phase-3 anchor (gone or repointed after 3.1) | v2 target section (Task 3.1/3.5/3.4 produced it) | Phase 4 task |
|---|---|---|
| `## Binding Hermes numbered-stage review gates` serial plan-review fenced block | `## 7. Edges, diamonds, and feedback edges` (planning-diamond subsection) + `## 6. Stage numbering (H0–H9)` (stage IDs); the legacy serial fenced block is repointed to §7 | 4.1 |
| `## Binding post-dialogue checkpoint compaction` (compaction anchor 4.2 inserted *before*) | `## 5. Routers: Claude-Router and Hermes-Verifier` -> new `### 5.5 Planning tiers` subsection | 4.2 |
| `## Logical review state machine` / `## Flow requirements` (4.3 inserted *after/before*) | `## 7. Edges, diamonds, and feedback edges` (review-diamond subsection) | 4.3 |
| `## Source-of-truth order` (4.4 inserted *before*) | `## 7. Edges, diamonds, and feedback edges` (feedback-edge subsections) | 4.4 |
| H6 self-audit paragraph "The H6 self-audit verifies slice-to-ticket coverage …" (preserved in `## Binding Hermes numbered-stage review gates`) | `## 6. Stage numbering (H0–H9)` (register `H6A` sub-stage) + the preserved paragraph as its input | 4.5 |
| (new — no pre-Phase-3 anchor; ruling R6) | `## 7. Edges, diamonds, and feedback edges` (Four Loops + Grand Loop subsection) + `## 8. Marker vocabulary (union)` (two new loop-owner markers) | 4.6 |

**Single-owner rule (binding).** Task 3.1 already installed the graph-core skeleton: §6 owns the stage numbering, §7 owns the planning diamond + review diamond + failed-test fanout + the two feedback edges, and §5.3 owns proportional `risk_tier` routing. Phase 4 tasks **UPDATE/COMPLETE those exact §6/§7/§5 sections in place** — they add NO second `## Review diamond`, `## Planning feedback edges`, or `## Planning risk tiers` top-level section, and no rule may exist in two places. Where a legacy preserved section (e.g. the serial fenced diagram in `## Binding Hermes numbered-stage review gates`) still shows a now-superseded serial flow, the Phase 4 task **repoints it to the owning §7 section** rather than restating the rule.

**`H6A` stage registration (binding).** `H6A` is a formal **sub-stage of `H6`** (independent Slices→ticket diff check), not a new top-level stage; it does not alter the canonical fifteen-ID list `H0,G1,H1,C2,H2,G3,H3,C4,H4,G5,H5,H6,A7,C8,H9`. Task 4.5 registers `H6A` under `H6` in the §6 stage-numbering block, and the contract's canonical stage list and Appendix B already note it as the sole sanctioned sub-stage ID.

**`planning_tier` state field (binding).** Planning tiers (Tier 0/1/2) are stored in a **separate** state field `planning_tier: 0|1|2` (planning-chain depth), NOT overloaded onto `risk_tier` (which is the review path). `planning_tier` is the additive field registered in Appendix A and the contract state block; Task 4.2 writes it.

**Files touched across Phase 4 (all edits are protocol-doc text; every spine edit targets a v2 section per the map above):**

| Task | Spine v2 target | LITE `heartbeat-protocol-lite/SKILL.md` region |
|---|---|---|
| 4.1 | complete the planning-diamond subsection IN `## 7. Edges, diamonds, and feedback edges`; repoint the legacy serial fenced block to §7 | Lightweight Stage Chain H2/H3 lines + "### H3 — Plan review" gate |
| 4.2 | new `### 5.5 Planning tiers` subsection inside `## 5. Routers` (writes `planning_tier`) | pointer under "## Stage Gates" |
| 4.3 | complete the review-diamond subsection IN `## 7. Edges, diamonds, and feedback edges` | new block before "### Context, process, and tool hygiene" |
| 4.4 | complete the two feedback-edge subsections IN `## 7. Edges, diamonds, and feedback edges` | none |
| 4.5 | register `H6A` sub-stage IN `## 6. Stage numbering (H0–H9)`; H6A contract detail | note under "### H6 — Kanban self-audit" |
| 4.6 | append the `### The Four Loops and the Grand Loop` subsection to `## 7. Edges, diamonds, and feedback edges`; register the two loop-owner markers in `## 8. Marker vocabulary (union)` | none |

**Absolute paths (verify these exist before editing):**
- Spine: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- LITE: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`

**Ordering within Phase 4:** the spine edits all land inside §5/§6/§7/§8, so run them in the recommended order 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 to avoid overlapping edits to §7 (4.6 appends its subsection at the END of §7 after 4.1/4.3/4.4 have completed their §7 subsections, and registers its markers in §8). Every task's first step is to Read the target file and confirm the v2 section from the anchor map above is present (Task 3.1 produced it); anchor only on v2 section headings, never on a pre-Phase-3 heading.

---

### Task 4.1: Restructure the plan-review gate into the C2 → H2 ∥ G3 → H3 planning diamond
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
**Risk tier:** medium (spine-law change: restructures the binding numbered-stage review gates; preserves the Hermes gate and independent review, weakens neither)
**Review gate:** medium → 1 independent reviewer + Hermes
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
  C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification:
  SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
  LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
  grep -ci "planning diamond" "$SPINE"      # expected >=2
  grep -ci "merge/reconcile" "$SPINE"        # expected >=2
  grep -c  "never reads H2" "$SPINE"         # expected >=1
  grep -ci "merge/reconcile" "$LITE"         # expected >=2
Human review required: no
```
**Steps:**
- [ ] Read the spine and confirm the v2 section `## 7. Edges, diamonds, and feedback edges` (Task 3.1) and `## 6. Stage numbering (H0–H9)` (Task 3.5) are present. §7 already carries a one-line **Planning diamond (Tier ≥ 1)** bullet from Task 3.1; this task COMPLETES that subsection in place (single-owner rule) — it does not create a new top-level section.
- [ ] In `## 7. Edges, diamonds, and feedback edges`, replace the single `- **Planning diamond (Tier ≥ 1):** … it does not re-review from scratch.` bullet with the full planning-diamond diagram AND the `### Planning diamond (C2 → H2 ∥ G3 → H3)` rules subsection below (diagram first, then the rules subsection). This is the only place the planning-diamond rule lives.

```text
H0 Hermes intake + risk-tier classification (sets risk_tier AND planning_tier; see §5.5 Planning tiers)
G1 Research.md
  → H1 Hermes handoff-integrity check only; no substantive Research review
C2 Plan.md
  → PLANNING DIAMOND (split → parallel → merge); H2 and G3 each consume ONLY Plan.md:
      ├─ H2 Hermes-Verifier direct Plan review    (writes an H2 verdict)
      └─ G3 Grok PlanReview.md                     (writes a G3 verdict; never reads H2's verdict)
  → H3 merge/reconcile: Claude-Router collects the H2 and G3 verdicts and adjudicates
      DISAGREEMENTS ONLY (agreements pass through unre-reviewed; a disputed finding goes to
      Hermes-Verifier for a single-finding re-check). PASS → C4; CHANGES REQUESTED →
      same C2 author/session, rework_round += 1.
C4 FinalPlan.md
  → H4 HERMES STAGE REVIEW PASS required before G5
G5 VerticalSlices.md
  → H5 HERMES STAGE REVIEW PASS required before H6
H6 Hermes Kanban ticketization
  → H6A independent Slices→ticket diff check (Claude or Grok; ordinary missions) — §6 H6A sub-stage
  → HERMES STEP 6 SELF-AUDIT PASS required before any Codex launch
```

- [ ] Insert the following `### Planning diamond (C2 → H2 ∥ G3 → H3)` rules subsection into `## 7. Edges, diamonds, and feedback edges`, immediately AFTER the diagram you just placed (so the diagram and its rules sit together inside §7). Insert verbatim:

```text
### Planning diamond (C2 → H2 ∥ G3 → H3)

The C2 → plan-review hop is a diamond, not a serial double-gate. On
`READY FOR HERMES STAGE REVIEW` from the C2 author, Claude-Router SPLITS: it
dispatches H2 (Hermes-Verifier direct Plan review) and G3 (independent Grok
`PlanReview.md`) as two concurrent reviews that each read only `Plan.md` plus its
approved upstream artifacts. Neither reviewer reads the other's verdict — G3
never reads H2's verdict and H2 never reads G3's — so the two lenses stay
independent. Both may run in parallel because both are read-only planning
reviews (see "Parallelism and file ownership": planning/audit can run in parallel
when read-only and cheap).

H3 is the MERGE/RECONCILE node. Claude-Router collects both verdicts and
adjudicates DISAGREEMENTS ONLY:

- Both PASS → record `HERMES STAGE REVIEW PASS`; advance to C4. No third
  re-review of the agreed content.
- Both CHANGES REQUESTED → union the findings into one
  `HERMES STAGE REVIEW CHANGES REQUESTED`, return `Plan.md` to the same C2
  author/session, and increment `rework_round`.
- Verdicts disagree on a finding → hand only the disputed finding to
  Hermes-Verifier, which re-checks it against `Plan.md`, records which reviewer
  it upheld with evidence, and issues one reconciled verdict. It does not
  re-verify the parts both reviewers already cleared.

Downstream barriers stay serial: H4 (FinalPlan) and H5 (VerticalSlices) each
need the whole reconciled upstream set and remain single `HERMES STAGE REVIEW
PASS` gates.
```

- [ ] **Repoint the legacy serial block (single-owner rule).** In the preserved `## Binding Hermes numbered-stage review gates` section, the plan-review portion of its fenced diagram is now superseded by §7. Replace the serial `C2 -> H2 -> G3 -> C4` plan-review lines in that legacy fenced block with a one-line pointer so the rule is not stated twice: `Plan-review is the C2 -> {H2 ∥ G3} -> H3 planning diamond — see §7 "Edges, diamonds, and feedback edges".` Leave the rest of that section (the H6 self-audit paragraph, Step-1 exemption, etc.) intact.
- [ ] Read the LITE `## Lightweight Stage Chain` fenced block and confirm the line `H2 — Hermes direct Plan review` and the line `H3 — Hermes review-of-review` are present.
- [ ] In LITE, replace the single line `H2 — Hermes direct Plan review` with `H2 — Hermes-Verifier direct Plan review          [Hermes; runs in parallel with G3, reads Plan.md only]`.
- [ ] In LITE, replace the single line `H3 — Hermes review-of-review` with `H3 — Claude-Router merge/reconcile: adjudicate H2 vs G3 disagreements only`.
- [ ] In LITE, replace the `### H3 — Plan review` heading and its paragraph (the paragraph beginning `The planning reviewer must be independent from the Plan author/session when practical.`) with the block below.

```text
### H3 — Plan-review merge/reconcile

H2 (Hermes-Verifier direct Plan review) and G3 (Grok `PlanReview.md`) run as a
parallel diamond on `Plan.md`; each is independent from the Plan author/session
and from each other, and G3 never reads H2's verdict. H3 is the merge node:
Claude-Router collects both verdicts and adjudicates disagreements only. Where H2
and G3 agree, H3 passes the agreed verdict through without a third review. Where
they disagree, H3 hands only the disputed finding to Hermes-Verifier, which
re-checks it against `Plan.md`, records which reviewer it upheld with evidence,
and issues one reconciled verdict. Findings are `BLOCKER`, `IMPROVEMENT`, or
`WATCH`, with evidence. A reconciled verdict with a real blocker sends `Plan.md`
back to the same C2 session (incrementing `rework_round`) and does not authorize
C4 until the blocker is resolved.
```

**Verify:**
```bash
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
grep -ci "planning diamond" "$SPINE"   # >=2 (diagram label + subsection heading)
grep -ci "merge/reconcile" "$SPINE"     # >=2 (diagram + subsection)
grep -c  "never reads H2" "$SPINE"      # >=1
grep -c  "Hermes-Verifier direct Plan review" "$SPINE"  # >=1
grep -ci "merge/reconcile" "$LITE"      # >=2 (chain line + gate heading)
grep -c  "## 7. Edges, diamonds, and feedback edges" "$SPINE"  # >=1 (the diamond lives in §7, single owner)
grep -c  "### Planning diamond (C2" "$SPINE"                    # >=1 (rules subsection completed in §7)
grep -c  "planning diamond — see §7" "$SPINE"                   # >=1 (legacy block repointed to §7, not duplicated)
```
**Acceptance:**
- [ ] The §7 planning-diamond subsection (diagram + `### Planning diamond (C2 → H2 ∥ G3 → H3)` rules) shows H2 and G3 fanning out from C2 in parallel, each reading only `Plan.md`, with H3 as an explicit merge/reconcile node that adjudicates disagreements only. It is the single owner of the planning-diamond rule.
- [ ] The legacy `## Binding Hermes numbered-stage review gates` fenced block now points to §7 for plan-review (one-line pointer present); no serial `C2 -> H2 -> G3 -> C4` plan-review flow remains there, so the rule is stated in exactly one place.
- [ ] LITE stage chain and `### H3` gate describe the same parallel-diamond + merge/reconcile behavior with the `never reads H2's verdict` independence invariant.
- [ ] H4/H5 remain single serial `HERMES STAGE REVIEW PASS` gates (unchanged).

---

### Task 4.2: Add planning risk tiers (Tier 0 / Tier 1 / Tier 2) with an H0 assignment rule
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
**Risk tier:** medium (spine-law change: introduces a persisted routing tier; preserves the immutable high-risk floor from V's §6.3.1 ruling)
**Review gate:** medium → 1 independent reviewer + Hermes
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
  C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification:
  SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
  LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
  grep -c "### 5.5 Planning tiers" "$SPINE"    # expected >=1
  grep -c "planning_tier" "$SPINE"             # expected >=1 (separate field, not risk_tier)
  grep -c "docs/mechanical" "$SPINE"           # expected >=1
  grep -c "never tierable down" "$SPINE"       # expected >=1
  grep -c "Planning tier (Tier 0/1/2)" "$LITE" # expected >=1
Human review required: no
```
**Steps:**
- [ ] Read the spine and confirm the v2 section `## 5. Routers: Claude-Router and Hermes-Verifier` (Task 3.1) is present, with `### 5.3 Deterministic routing on classified state` and `### 5.4 Zenith principles-vs-runtime risk dial` (Task 3.11) already inside it.
- [ ] In the spine, insert the `### 5.5 Planning tiers` subsection at the END of `## 5. Routers: Claude-Router and Hermes-Verifier` (after §5.4, before the next top-level `## ` heading). This is a routing subsection because the planning tier selects the planning route; it uses the separate `planning_tier` state field, never `risk_tier`. Insert the following verbatim.

```text
### 5.5 Planning tiers

Every mission is assigned a planning tier at H0 intake, at the same time as
`risk_tier`, and the tier is recorded in the planning ticket's own
`planning_tier` state field (`0 | 1 | 2` = Tier 0 / Tier 1 / Tier 2). `planning_tier`
is a SEPARATE field from `risk_tier`: `planning_tier` is the planning-chain depth
(which stages run), `risk_tier` is the review path (`low | medium | high`); the two
are never conflated into one persisted value. The tier is set ONCE at H0
and drives the planning route deterministically; a stage owner may not silently
change it. Raising the tier mid-flight is a Claude-Router action recorded as an
`authority_epoch` bump; it is never lowered below the immutable high-risk floor.

| Planning tier | Trigger (set at H0) | Planning route |
|---|---|---|
| Tier 0 — docs/mechanical | docs-only, formatting, deterministic non-runtime maintenance, or test-only contract repair; no new domain behavior | Plan → H6 direct. Skip G1/C2 dialogue, the plan-review diamond, C4, and G5 when the change carries no architecture, persistence, provider, security, scoring, or product-data effect. Hermes still runs the H6 self-audit + H6A diff check. |
| Tier 1 — routine feature | reversible feature work without persistence, providers/spend, security/auth, scoring semantics, or product/live-data effects | Plan (C2) → parallel review diamond (H2 ∥ G3 → H3) → merged FinalPlan+Slices: C4 and G5 collapse into ONE hop reviewed by a single combined H4/H5 gate. |
| Tier 2 — architecture/high-risk | persistence/migrations, providers or spend, security/auth, scoring semantics, product/live data, destructive actions, or architecture | Full chain: H0, G1, H1, C2, (H2 ∥ G3), H3, C4, H4, G5, H5, H6, H6A. No stage collapsed. Product-truth + V gates apply at H9. |

Assignment rule: at H0, Claude-Router classifies the mission against the
immutable high-risk floor FIRST (persistence/migrations, provider spend,
security/auth, scoring semantics, live/product data, destructive or
architectural work → Tier 2, never tierable down). If the floor does not fire,
classify docs/mechanical → Tier 0, else routine feature → Tier 1. Record the
result in the planning ticket's `planning_tier` field (the review-path `risk_tier`
is assigned separately and is never overwritten by the planning tier). The H6
self-audit verifies the planning route actually taken matches the recorded
`planning_tier`; a mismatch is `HERMES STEP 6 SELF-AUDIT CHANGES REQUESTED`.
```

- [ ] Read LITE and confirm the heading `## Stage Gates` is immediately followed by `### H1 — Research integrity`.
- [ ] In LITE, insert the following pointer between `## Stage Gates` and `### H1 — Research integrity`.

```text
> Planning tier (Tier 0/1/2) is set at H0 per the spine's `§5.5 Planning tiers`
> subsection and recorded in the planning ticket's own `planning_tier` field
> (distinct from `risk_tier`): Tier 0 routes Plan → H6 direct, Tier 1 collapses
> C4+G5 into one hop after the H2 ∥ G3 diamond, Tier 2 runs the full chain. The
> high-risk floor is never tierable down.
```

**Verify:**
```bash
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
grep -c "### 5.5 Planning tiers" "$SPINE"     # >=1 (inside §5 Routers)
grep -c "planning_tier" "$SPINE"              # >=1 (separate field)
grep -c "docs/mechanical" "$SPINE"            # >=1
grep -c "never tierable down" "$SPINE"        # >=1 (spine)
grep -c "Tier 2 — architecture/high-risk" "$SPINE"  # >=1
grep -c "Planning tier (Tier 0/1/2)" "$LITE"  # >=1
```
**Acceptance:**
- [ ] Spine §5 has a `### 5.5 Planning tiers` subsection (not a new top-level section) with a three-tier table, each tier with an explicit trigger and planning route.
- [ ] The assignment rule sets tier at H0, records it in the separate `planning_tier` field (never overwriting the review-path `risk_tier`), and states the high-risk floor is checked first and is never tierable down (matching V's §6.3.1 ruling).
- [ ] Tier 1's route collapses C4+G5 into one hop; Tier 0 routes Plan → H6 direct; Tier 2 keeps the full chain with H6A.
- [ ] LITE points to the spine §5.5 subsection so Claude-Router routes planning by `planning_tier` in Lite mode.

---

### Task 4.3: Replace the serial peer-review double-gate with a diverse-lens review diamond and adversarial default reviewer prompt
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
**Risk tier:** high (touches the preserved independent-review safety law, blueprint §1.3 #1 — restructures the peer-review gate; must preserve no-self-Done, reviewer-never-edits, and worker-never-self-advances verbatim)
**Review gate:** high → full ladder + V
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
  C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification:
  SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
  LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
  grep -ci "review diamond" "$SPINE"           # expected >=2
  grep -ci "actively try to break" "$SPINE"     # expected >=1
  grep -c  "DISAGREEMENTS ONLY" "$SPINE"        # expected >=1
  grep -ci "adversarial reviewer" "$LITE"       # expected >=1
Human review required: yes
```
**Steps:**
- [ ] Read the spine and confirm the v2 section `## 7. Edges, diamonds, and feedback edges` (Task 3.1) is present with its one-line **Review diamond (medium/high tickets)** bullet. This task COMPLETES that review-diamond subsection in place (single-owner rule); it does NOT create a new top-level section, and it does not touch the carried-forward `## Logical review state machine` (which remains the base review state machine).
- [ ] In `## 7. Edges, diamonds, and feedback edges`, replace the single `- **Review diamond (medium/high tickets):** … if unsure, fail it.` bullet with the `### Review diamond (medium/high implementation tickets)` subsection below (including its `#### Adversarial reviewer prompt (default)` sub-subsection). The payload contains a literal ```text fenced block for the reviewer prompt — insert it exactly, inner fences included.

````text
### Review diamond (medium/high implementation tickets)

For low-risk tickets the proportional fast path stands: direct Hermes-Verifier
diff review, same-cycle `HERMES DONE`, no mandatory peer layer. For medium- and
high-risk implementation tickets, the serial double-gate is replaced by a review
DIAMOND fanned out from `READY FOR PEER REVIEW`:

- Medium risk (`risk_tier: medium`): 2 parallel reviewers with distinct lenses —
  (1) correctness/tests and (2) security/data-safety — each a different
  agent/session from the worker and from each other, each read-only.
- High risk (`risk_tier: high`): 3 parallel reviewers with distinct lenses —
  (1) correctness/tests, (2) security/data-safety, (3) product-truth (live
  app/API/DB/browser evidence) — each a different agent/session, each read-only.

Each lens reviewer reads only the ticket diff/artifact, its file contract, and
the RED/GREEN evidence; none reads another reviewer's verdict. Reviewers post
`PEER REVIEW APPROVED` or `PEER REVIEW CHANGES REQUESTED` with lens-tagged
findings.

Hermes-Verifier is the MERGE node. It re-checks DISAGREEMENTS ONLY instead of
re-verifying every dimension:

- All lenses APPROVED → Hermes-Verifier records one `READY FOR HERMES REVIEW`
  disposition and proceeds to the Hermes/human gate per contract.
- Any lens CHANGES REQUESTED → the unioned findings return to the same
  worker/session as one `HERMES CHANGES REQUESTED`; `rework_round` increments
  once for the round regardless of how many lenses objected.
- Lenses disagree on the same finding → Hermes-Verifier re-checks only that
  finding against the diff/evidence, records which lens it upheld with evidence,
  and issues one reconciled verdict; it does not re-verify the dimensions all
  reviewers already cleared.

The independent-review safety laws are preserved unchanged: no self-Done, the
worker never self-advances to Hermes, and no reviewer edits the change it
reviews. The diamond adds parallel diverse lenses; it never removes the
independent gate.

#### Adversarial reviewer prompt (default)

Every lens reviewer is dispatched with this default framing, prepended to its
lens-specific checklist:

```text
You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens
(<correctness/tests | security/data-safety | product-truth>). Construct the
inputs, states, or sequences that would make it fail. Confirm the evidence is
real product/runtime evidence, not workflow or scaffold evidence. If you are
unsure whether it holds, FAIL it and state exactly what proof would change your
verdict. Approve only when you have tried and failed to break it. You are
read-only: report findings, never edit the change.
```
````

- [ ] Read LITE and confirm the heading `### Context, process, and tool hygiene` exists (it follows the `### Proportional review fast path` bullet list).
- [ ] In LITE, insert the following block immediately before `### Context, process, and tool hygiene`. It contains a literal ```text fence — insert exactly, inner fence included.

````text
### Review diamond and adversarial default (medium/high)

For medium- and high-risk tickets, do not run one serial reviewer and then
re-run the same dimension. Fan out parallel lenses from `READY FOR PEER REVIEW` —
medium: correctness/tests + security/data-safety; high: those two plus
product-truth — each a different read-only session. Hermes-Verifier merges and
re-checks disagreements only. When V invokes reviewers by copy-paste, give each
one this default adversarial framing prepended to its lens checklist:

```text
You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens.
If you are unsure whether it holds, FAIL it and state exactly what proof would
change your verdict. Approve only when you have tried and failed to break it.
You are read-only: report findings, never edit the change.
```
````

**Verify:**
```bash
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
grep -c  "### Review diamond (medium/high implementation tickets)" "$SPINE"  # >=1 (completed inside §7)
grep -ci "review diamond" "$SPINE"       # >=2
grep -ci "actively try to break" "$SPINE" # >=1
grep -c  "DISAGREEMENTS ONLY" "$SPINE"    # >=1
grep -c  "no self-Done" "$SPINE"          # >=1 (independent-review law preserved)
grep -c  "## Logical review state machine" "$SPINE"  # >=1 (base state machine still carried forward, not replaced)
grep -ci "adversarial reviewer" "$LITE"   # >=1
```
**Acceptance:**
- [ ] The review diamond is completed as the `### Review diamond` subsection INSIDE `## 7. Edges, diamonds, and feedback edges` (single owner); no second top-level `## Review diamond` section exists, and the carried-forward `## Logical review state machine` is untouched.
- [ ] Spine defines a medium=2-lens / high=3-lens parallel review diamond fanned from `READY FOR PEER REVIEW`, with lenses correctness/tests, security/data-safety, product-truth.
- [ ] The adversarial reviewer prompt appears verbatim as a fenced block and contains "Actively try to break, refute, or falsify" and "If you are unsure … FAIL it".
- [ ] Hermes-Verifier merges and re-checks disagreements only; `rework_round` increments once per round.
- [ ] The independent-review safety laws (no self-Done, worker never self-advances, reviewer never edits) are restated and not weakened.

---

### Task 4.4: Wire the architecture→requirements and QA→architecture feedback edges, both counted by the rework cap
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
**Risk tier:** medium (spine-law change: adds two routing edges and binds them to the existing `rework_round` cap; strengthens the convergence bound, weakens nothing)
**One-Prompt Machine note (ruling D5):** these edges are also the ONLY legal path by which mid-design questions reach V: a planning-diamond node needing V steering emits the question from the ARCHITECTURE surface (per the spine's `### The One-Prompt Machine law`); QA and implementation nodes never address V — their plan-defect findings travel the QA->ARCHITECTURE edge instead, and ARCHITECTURE decides whether a V design question is warranted.
**Review gate:** medium → 1 independent reviewer + Hermes
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification:
  SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
  grep -c  "### Planning feedback edges" "$SPINE"  # expected >=1 (inside §7)
  grep -ci "plan defect" "$SPINE"                  # expected >=1
  grep -c  "RETURN:" "$SPINE"                      # expected >=2
  grep -c  "rework_round" "$SPINE"                 # expected >=3
Human review required: no
```
**Steps:**
- [ ] Read the spine and confirm the v2 section `## 7. Edges, diamonds, and feedback edges` (Task 3.1) is present with its two one-line **Feedback edges** bullets (`ARCHITECTURE -> REQUIREMENTS`, `QA -> ARCHITECTURE`) and the `### Architecture-boundary stop-and-route triggers` subsection (Task 3.11). This task COMPLETES those feedback edges in place (single-owner rule); it does NOT create a new top-level section and it does not touch the carried-forward `## Source-of-truth order`.
- [ ] In `## 7. Edges, diamonds, and feedback edges`, replace the two one-line feedback-edge bullets with the `### Planning feedback edges` subsection below (its two `#### Architecture -> Requirements` and `#### QA -> Architecture` sub-subsections carry the templates). The payload contains two literal ```text fenced templates — insert exactly, inner fences included.

````text
### Planning feedback edges

The graph carries two feedback edges that the linear chain lacks. Both are routed
by Claude-Router on typed findings, and both increment `rework_round` (subject to
the rework cap = 3; at the cap the loop freezes and emits into the V DECISIONS
PACKET).

#### Architecture → Requirements (plan review may reopen intake)

When plan review (the H2 ∥ G3 diamond, the H3 merge, or any later planning gate)
surfaces a finding that cannot be resolved inside the current requirements — an
ambiguous or contradictory requirement, a scope gap, or a missing product
decision — Claude-Router routes ONE bounded question back to H0/REQUIREMENTS
rather than forcing the planner to guess. The return carries:

```text
ARCH→REQ RETURN:
- from stage:
- blocking question (single, bounded):
- why it cannot be resolved in-plan:
- options considered:
- rework_round: n of 3
```

Intake answers the single question (V is consulted only if the question is a
product/architecture/safety decision, via the V DECISIONS PACKET), then the plan
resumes at the returning stage with the same owner/session. Reopening intake for
an unbounded redesign is not this edge — that is a new mission.

#### QA → Architecture (verifier plan-defect findings skip Codex rework)

When a QA-loop verifier (peer reviewer, review-diamond lens, or Hermes-Verifier)
finds that a failure is a PLAN DEFECT — the slice contract, dependency order, or
acceptance criteria are wrong, not the code — Claude-Router routes the finding to
ARCHITECTURE (the C4/FinalPlan or G5/Slice owner), NOT into a Codex rework loop.
Rerouting a plan defect into code rework produces churn against a wrong target.
The return carries:

```text
QA→ARCH RETURN:
- from ticket:
- verifier + lens:
- defect is in: slice-contract | dependency-order | acceptance-criteria
- evidence the code is correct against the current (wrong) contract:
- rework_round: n of 3
```

Architecture corrects the plan artifact/slice, re-runs the affected planning
gate, and re-issues the corrected ticket. The implementation ticket stays parked
(`waiting_dependency`) until the corrected contract lands. Both edges count
toward the same `rework_round` cap so a defect cannot ping-pong between loops
unbounded.
````

**Verify:**
```bash
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c  "### Planning feedback edges" "$SPINE"  # >=1 (completed inside §7)
grep -ci "plan defect" "$SPINE"                  # >=1
grep -c  "REQ RETURN" "$SPINE"                   # >=1 (ARCH→REQ template)
grep -c  "ARCH RETURN" "$SPINE"                  # >=1 (QA→ARCH template)
grep -c  "waiting_dependency" "$SPINE"           # >=1
grep -c  "rework_round" "$SPINE"                 # >=3
grep -c  "## Source-of-truth order" "$SPINE"     # >=1 (carried-forward section untouched)
```
**Acceptance:**
- [ ] The two feedback edges are completed as the `### Planning feedback edges` subsection INSIDE `## 7. Edges, diamonds, and feedback edges` (single owner); no new top-level `## Planning feedback edges` section exists and `## Source-of-truth order` is untouched.
- [ ] Spine has both feedback edges: architecture→requirements (bounded question reopens intake) and QA→architecture (plan-defect findings route to ARCH, not a Codex rework loop).
- [ ] Both edge templates (`ARCH→REQ RETURN`, `QA→ARCH RETURN`) carry `rework_round: n of 3` and are stated to count toward the same rework cap.
- [ ] The implementation ticket parks in `waiting_dependency` while architecture corrects the plan.
- [ ] The architecture→requirements edge is explicitly bounded to a single question, not an unbounded redesign.

---

### Task 4.5: Add the independent H6A Slices→ticket diff check for ordinary missions
**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md`
**Risk tier:** medium (spine-law change: adds an independent verification gate on top of the H6 self-audit; strengthens the ticketization safety check, weakens nothing)
**Review gate:** medium → 1 independent reviewer + Hermes
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
  C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files
Verification:
  SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
  LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
  grep -c "H6A" "$SPINE"                  # expected >=4
  grep -c "H6A PASS" "$SPINE"             # expected >=1
  grep -c "H6A CHANGES REQUESTED" "$SPINE" # expected >=1
  grep -c "H6A PASS" "$LITE"              # expected >=1
Human review required: no
```
**Steps:**
- [ ] Read the spine and confirm the v2 section `## 6. Stage numbering (H0–H9)` (Task 3.5) is present with its fenced stage table containing the `H6  Hermes   Kanban ticketization …` line, and that the carried-forward H6 self-audit paragraph (`The H6 self-audit verifies slice-to-ticket coverage … without V's specific approval.`, extended by Task 2.3) is present in `## Binding Hermes numbered-stage review gates`.
- [ ] **Register `H6A` as a formal sub-stage of `H6`** in the §6 stage table: immediately below the `H6  Hermes   Kanban ticketization … (serial barrier)` line (and above `A7  Agents`), insert this line inside the same fenced block:
```text
H6A Hermes   Independent Slices→ticket diff check (Claude or Grok; sub-stage of H6,
             ordinary missions) — runs after HERMES STEP 6 SELF-AUDIT PASS, before A7
```
`H6A` is a sub-stage of `H6`; it does NOT change the canonical fifteen-ID list.
- [ ] In `## 6. Stage numbering (H0–H9)`, immediately after the fenced stage table (and after the "pre-3.0.0 chain …" note), insert the following `### H6A` contract subsection. The payload contains a literal ```text fenced contract — insert exactly, inner fences included.

````text
### H6A — independent Slices→ticket diff check

For ordinary missions (Tier 0 and Tier 1), the H6 self-audit is backed by an
independent H6A check so ticketization is not self-certified. After Hermes
records `HERMES STEP 6 SELF-AUDIT PASS`, Claude-Router dispatches one read-only
reviewer — Claude or Grok, a different agent/session from whoever ran H6 — that
reads ONLY the diff between the approved `VerticalSlices.md` and the created
Kanban tickets. It reads nothing else and writes no tickets.

H6A check contract:

```text
Assigned reviewer: Claude or Grok (read-only; different session from H6)
Inputs (read-only): approved VerticalSlices.md; the created ticket bodies/contracts
Forbidden: editing any ticket, artifact, or file; reading unrelated board state
Check, per slice → ticket:
  [ ] every approved slice maps to exactly one ticket (no slice dropped, no ticket invented)
  [ ] each ticket's allowed/forbidden/verification contract matches its slice verbatim
  [ ] dependency IDs and lineage match the final plan
  [ ] create/modify/extend file labels match the slice
  [ ] no ticket authorizes Codex self-Done, ticket-splitting, push/merge, or DB deletion
  [ ] the Ready set is the small intentional set the self-audit declared
Verdict: H6A PASS  or  H6A CHANGES REQUESTED (with the exact slice<->ticket mismatch)
```

On `H6A CHANGES REQUESTED`, Hermes returns to H6, corrects the tickets, and
re-runs both the self-audit and H6A; the mismatch counts toward `rework_round`.
No Codex launch occurs until `HERMES STEP 6 SELF-AUDIT PASS` AND `H6A PASS` are
both recorded. For Tier 2 (architecture/high-risk) missions the full
independent-review ladder + V already provides independent ticketization
verification; H6A's read-only diff check is included within that ladder and is
never skipped.
````

- [ ] Read LITE and confirm the line `Record \`HERMES STEP 6 SELF-AUDIT PASS\` or keep implementation blocked.` exists under `### H6 — Kanban self-audit`.
- [ ] In LITE, insert the following note immediately after that line.

```text
For ordinary (Tier 0/Tier 1) missions, back the self-audit with an independent
H6A check: after `HERMES STEP 6 SELF-AUDIT PASS`, have a different read-only
Claude or Grok session read ONLY the `VerticalSlices.md`→ticket diff and record
`H6A PASS` or `H6A CHANGES REQUESTED` (exact slice-to-ticket mismatch). No Codex
launch until both `HERMES STEP 6 SELF-AUDIT PASS` and `H6A PASS` are recorded; an
H6A mismatch counts toward `rework_round`.
```

**Verify:**
```bash
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
grep -c "H6A" "$SPINE"                   # >=4
grep -c "H6A Hermes" "$SPINE"            # >=1 (registered as a sub-stage line in the §6 stage table)
grep -c "## 6. Stage numbering" "$SPINE"  # >=1 (H6A lives under §6)
grep -c "H6A PASS" "$SPINE"              # >=1
grep -c "H6A CHANGES REQUESTED" "$SPINE" # >=1
grep -c "different session from H6" "$SPINE"  # >=1 (independence)
grep -c "H6A PASS" "$LITE"               # >=1
```
**Acceptance:**
- [ ] `H6A` is registered as a formal sub-stage of `H6` in the §6 stage-numbering block (an `H6A Hermes …` line under the `H6` line), without altering the canonical fifteen-ID list; the `### H6A` contract lives under §6.
- [ ] Spine defines H6A as an independent read-only Claude/Grok check that reads only the `VerticalSlices.md`→ticket diff, run after `HERMES STEP 6 SELF-AUDIT PASS`.
- [ ] The H6A contract lists the per-slice→ticket checks and yields `H6A PASS` / `H6A CHANGES REQUESTED`; a mismatch counts toward `rework_round`.
- [ ] No Codex launch occurs until both `HERMES STEP 6 SELF-AUDIT PASS` and `H6A PASS` are recorded; H6A is never skipped for Tier 2 (subsumed by the full ladder).
- [ ] LITE's H6 self-audit section carries the same H6A requirement for ordinary missions.

---

### Task 4.6: Install the Four Loops and the Grand Loop stop condition (ruling R6)

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` (the Graph Spine v2 `## 7. Edges, diamonds, and feedback edges` area — installed by Phase 3 Task 3.1 and elaborated by Phase 4 Task 4.4 — plus the `## 8. Marker vocabulary (union)` union list)

**Risk tier:** high (architectural: installs the mission-termination law — when a mission may close is the immutable high-risk floor; changes the closure contract)

**Review gate:** (per proportional law) high → full review diamond (§3.5) + product-truth gate + V final acceptance. The independent reviewer confirms no existing closure gate (product-truth, H9 acceptance) is weakened and that PROG/QA completion alone still cannot close a mission; Hermes-Verifier confirms; V approves.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md (the §7 edges/diamonds area and the §8 marker union list only)
Forbidden: all other files; do NOT weaken or remove any existing closure gate (product-truth §11 law 10, H9 final acceptance)
Verification: the commands in the Verify block below
Human review required: yes
```

**Execution ordering:** run after Task 4.4 (which wires the §7 architecture->requirements and QA->architecture feedback edges that satisfaction flows up) and after Task 3.5 (which authors `## 8. Marker vocabulary (union)`). Edits only §7 and §8 bodies, never their `##` headings.

**Steps:**
- [ ] In the Graph Spine v2, insert the following subsection at the END of `## 7. Edges, diamonds, and feedback edges`, immediately **before** the `## 8. Marker vocabulary (union)` heading, verbatim:

```text
### The Four Loops and the Grand Loop

The harness is four loops plus one outer loop (ruling R6):

- REQUIREMENTS ENGINEERING loop — owns the mission's intent (H0 / REQUIREMENTS).
- ARCHITECTURE loop — owns the design/plan (planning diamond C2/H2/G3/H3/C4).
- PROGRAMMING loop — owns the implementation (C8 Codex lanes + review diamond).
- QA loop — owns verification and product-truth (Hermes-Verifier + Manual QA).

Each inner loop keeps its OWN convergence bounds (§10: rework cap 3, chatter
breaker 6/24, unblock ceiling 2); a loop that hits a bound freezes and escalates,
it never auto-approves. Satisfaction flows UPWARD along the §7 feedback edges:
PROGRAMMING and QA report completion into ARCHITECTURE and REQUIREMENTS, never
straight to mission closure.

The Grand Loop is the mission itself. It terminates ONLY when BOTH upper loop
owners are satisfied and emit their markers:

- REQUIREMENTS SATISFIED — emitted ONLY by the REQUIREMENTS loop owner (H0 /
  REQUIREMENTS node).
- ARCHITECTURE SATISFIED — emitted ONLY by the ARCHITECTURE loop owner (the
  planning diamond).

Grand Loop termination law: a mission may close ONLY when REQUIREMENTS SATISFIED
AND ARCHITECTURE SATISFIED are both present on the mission's closure ticket, AND
every existing gate passes — the product-truth gate (§11 law 10) and V's final
acceptance, which V exercises through the REQUIREMENTS surface at H9. Neither
PROGRAMMING completion nor QA completion alone ever closes a mission: PROG/QA
satisfaction only flows up to ARCH/REQ, and only REQ AND ARCH satisfaction (plus
the product-truth and final-acceptance gates) closes the Grand Loop.
```

- [ ] In the spine's `## 8. Marker vocabulary (union)` section, append `REQUIREMENTS SATISFIED; ARCHITECTURE SATISFIED.` to the `Added (union):` list (after `EXTERNAL REVIEW PASSED | CHANGES REQUESTED.`), and add a loop-owner classification line after the Verifier-owned line:

```text
Loop-owner markers (Grand Loop closure, §7 "The Four Loops and the Grand Loop"):
REQUIREMENTS SATISFIED (REQUIREMENTS loop owner only), ARCHITECTURE SATISFIED
(ARCHITECTURE loop owner only); both consumed by Claude-Router and Hermes-Verifier
at mission closure.
```

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "### The Four Loops and the Grand Loop" "$SPINE"    # expected 1
grep -c "REQUIREMENTS ENGINEERING loop" "$SPINE"            # expected 1
grep -c "REQUIREMENTS SATISFIED" "$SPINE"                   # expected >=2 (subsection + §8 union)
grep -c "ARCHITECTURE SATISFIED" "$SPINE"                   # expected >=2
grep -c "Grand Loop termination law" "$SPINE"               # expected 1
grep -c "Neither PROGRAMMING completion nor QA completion alone" "$SPINE"  # expected 1
grep -c "Loop-owner markers (Grand Loop closure" "$SPINE"   # expected 1
```

**Acceptance:**
1. The spine §7 area carries a `### The Four Loops and the Grand Loop` subsection naming the four loops (REQUIREMENTS ENGINEERING, ARCHITECTURE, PROGRAMMING, QA), each bound by the §10 convergence laws, with satisfaction flowing upward along the §7 feedback edges.
2. Two new markers exist and are emitter-restricted: `REQUIREMENTS SATISFIED` (REQUIREMENTS loop owner only) and `ARCHITECTURE SATISFIED` (ARCHITECTURE loop owner only), registered in the §8 marker union as loop-owner markers.
3. The Grand Loop termination law is present and binding: a mission closes ONLY when both markers are present AND the product-truth gate (§11 law 10) and V's final acceptance (via the REQUIREMENTS surface, H9) pass; neither PROGRAMMING nor QA completion alone closes a mission.
4. No existing closure gate is weakened; both markers are recorded in Appendix B's marker table (emitted by REQ/ARCH loop owners; consumed by Claude-Router + Hermes-Verifier at mission closure).

---

### Task 4.7: Install the Reporting & Traceability law (ruling R8)

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
**Risk tier:** medium (spine-law change: adds reporting duties; weakens nothing — restates existing evidence law as an invariant and adds mission/phase report artifacts)
**Review gate:** medium -> 1 independent reviewer + Hermes
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the Verify block below, verbatim
Human review required: no
```
**Steps:**
- [ ] Read the spine section `## Hermes cockpit responsibilities` (preserved by Task 3.1's carry-forward manifest). Insert immediately AFTER that section (before the next `##` heading) this new section verbatim:
```text
## Reporting and traceability law (ruling R8)

Reports matter; traceability is non-negotiable. The harness documents itself,
exactly as the old harness did — that discipline is what makes every audit,
review, and rework checkable instead of vibes.

1. TICKET TRACE (invariant): a ticket may reach `done` only when its full chain
   is durable on the ticket itself — state block, handoff markers with evidence
   paths, independent reviewer verdict(s), Hermes-Verifier verdict, and (when
   required) the human verdict. No trace, no Done.
2. COCKPIT RECEIPTS: after every board-mutation batch, Hermes-Verifier posts a
   receipt: card ID + title, exact before -> after change, comment/instruction
   sent, evidence and reason, what runs next, and any V action needed. Grouped
   same-cycle mutations may share one receipt.
3. MISSION REPORTS: the Main Orchestrator (Claude-Router) writes durable report
   artifacts to `.hermes/reports/<mission>/` in the repo: one phase report at
   every phase gate (tasks applied, verdicts, deviations, wall-clock, escalations)
   and one mission closure report. The REQUIREMENTS SATISFIED and ARCHITECTURE
   SATISFIED markers must reference the closure report before the Grand Loop may
   close. Reports are append-only artifacts: never overwritten, never deleted
   (the prune law applies to report archives as to everything else).
4. LOOP REPORTS: each of the Four Loops records its convergence counters
   (rework_round totals, wakes_since_transition peaks, escalations emitted) in
   its section of the mission report. A loop that ran without reporting is a
   violation.
5. Falsification tie-in (ruling R5): a mission whose report chain is incomplete
   at closure FAILS acceptance; fabricated or after-the-fact-reconstructed
   reports are evidence violations under the no-fake-evidence law.
```
- [ ] Confirm the insertion did not split or displace any preserved section (the carry-forward greps from Task 3.1 must still pass).

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "## Reporting and traceability law" "$SPINE"   # expected 1
grep -c "No trace, no Done" "$SPINE"                   # expected 1
grep -c ".hermes/reports/" "$SPINE"                    # expected >=1
grep -c "append-only artifacts" "$SPINE"               # expected 1
grep -c "COCKPIT RECEIPTS" "$SPINE"                    # expected 1
grep -c "LOOP REPORTS" "$SPINE"                        # expected 1
```

**Acceptance:**
1. The R8 section exists with all five duties (ticket trace, cockpit receipts, mission reports, loop reports, R5 tie-in) and names `.hermes/reports/<mission>/` as the canonical report location.
2. The Grand Loop closure (Task 4.6) is now report-gated: both SATISFIED markers must reference the mission closure report.
3. No preserved section was displaced; carry-forward greps still pass.
4. Nothing was weakened: the existing evidence/marker laws are restated as invariant, not replaced.

---

### Task 4.8: Install the TDD, DDD, and worker-persistence laws (preserved-law repair, V's preservation check 2026-07-24)

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`
**Risk tier:** high (touches the coding-discipline safety laws — falsification-linked via R5; nothing may be weakened)
**Review gate:** high -> full ladder (independent reviewer + Hermes-Verifier adjudication; the R5 linkage makes this a safety-law install)
**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the Verify block below, verbatim
Human review required: no
```
**Context (why this task exists):** V's preservation check found that RED→GREEN *evidence* survived into the new spine but TDD-as-named-law had 0 spine occurrences, DDD had 0, and Lite's three-non-destructive-attempts discipline had 0 — while R5 makes "TDD/DDD violations" falsifying. A falsification criterion must reference an installed law. This task installs all three as spine law (preserved laws 16–18 in the blueprint §1.3 list).

**Steps:**
- [ ] Read the spine section `## Reporting and traceability law` (installed by Task 4.7). Insert immediately AFTER that section (before the next `##` heading) this new section verbatim:
```text
## TDD, DDD, and worker-persistence laws (preserved from the old harness)

1. TDD LAW — mandatory RED -> GREEN -> REFACTOR: every implementation ticket
   reproduces a failing behavior or regression test FIRST (RED), makes the
   smallest change that passes (GREEN), and refactors only under green. The
   failing-then-passing evidence is attached to every handoff marker. If TDD is
   genuinely impractical for a slice, the worker blocks for an explicit V/Hermes
   waiver — a waiver is recorded on the ticket and is never itself evidence.
   Tests-after theater without RED evidence is a violation (falsifying, R5).
2. DDD LAW — domain-driven design: all work uses the product's domain language
   and preserves bounded-context and invariant ownership. Plans (C2/C4) must
   state their DDD impact — affected bounded contexts, domain terms, and
   invariants — and the ARCHITECTURE loop's plan review (H2) verifies it before
   PASS. Implementation never crosses bounded-context ownership outside its
   ticket contract (falsifying, R5).
3. WORKER-PERSISTENCE LAW: ordinary reversible implementation problems belong
   to the worker — stale anchors, imports, environment isolation, failing
   tests, contract-preserving refactors. The worker performs root-cause
   investigation and up to three evidence-based non-destructive approaches
   before blocking. Local friction is not a goal blocker; important operations
   and safety gates are never "friction."
```
- [ ] Confirm no preserved section was displaced (Task 3.1 carry-forward greps still pass).

**Verify:**
```sh
SPINE="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "## TDD, DDD, and worker-persistence laws" "$SPINE"  # expected 1
grep -c "TDD LAW" "$SPINE"                                   # expected 1
grep -c "DDD LAW" "$SPINE"                                   # expected 1
grep -c "WORKER-PERSISTENCE LAW" "$SPINE"                    # expected 1
grep -c "Tests-after theater" "$SPINE"                       # expected 1
grep -c "bounded-context" "$SPINE"                           # expected >=2
grep -c "three evidence-based non-destructive approaches" "$SPINE"  # expected 1
```

**Acceptance:**
1. All three laws are installed as one spine section, each with its R5 falsification linkage where applicable.
2. The H2 plan-review gate's DDD-impact check is named inside the DDD law (the ARCHITECTURE loop verifies DDD impact before PASS).
3. No preserved section was displaced; carry-forward greps pass.
4. The R5 falsification criterion "TDD/DDD violations" now references installed spine law, closing the incoherence V's preservation check found.

---

## Phase 5 — True worktrees

Ordered per blueprint §4 (Phase 5) and §3.6, executing V's ruling #2 (§6.3.1): worktree operations remain a V-gated important operation, satisfied **per mission** via one batched LANE PLAN APPROVAL row at H6; destructive git operations stay individually gated. This phase promotes the Split -> Verify -> Merge lane checklist to universal spine law, declares the `max_concurrent_heavy` semaphore once, adds the integration node + mandatory closure-gate line, gives Claude and Grok read-only worktree sections, and adds the worktree/workdir glossary.

All tasks are protocol-document edits. Claude-Router routes each; Hermes crafts/custodies the board (default worker Codex; docs-only change). Recommended execution order: **5.2 -> 5.1 -> 5.3 -> 5.4 -> 5.5** (5.1 references the `max_concurrent_heavy` name that 5.2 declares; 5.3 inserts after the section 5.1 creates).

**Cross-phase dependencies (must already be landed before Phase 5 executes):** the `V DECISIONS PACKET` machinery and `HERMES AUTHORIZED ROUTE`/`authority_epoch` markers (Phase 1); the typed state block with `risk_tier`, `owner`, `contract`, and `worktree` fields (Phase 2). The LANE PLAN APPROVAL row in Task 5.1 emits into the Phase-1 V DECISIONS PACKET and references Phase-2 fields verbatim; do not restate or fork them.

---

### Phase 5 Entry Gate (blocking precondition — NOT a file edit)

Phase 5 starts only after V reconfirms ruling #2 (§6.3.1) with Phase 1–4 wall-clock data. V's ruling marked the per-mission worktree gate **provisional** ("if I were to take a guess"); this gate closes that provisionality with evidence.

- [ ] Hermes assembles a one-row V DECISIONS PACKET entry: "Reconfirm ruling #2 (worktree gate satisfied per-mission via batched LANE PLAN APPROVAL at H6). Evidence: Phase 1–4 mission wall-clock (planning + implementation cycle times, number of V interactions, any lane serialization stalls)." with the smallest yes/no: "Keep the per-mission LANE PLAN APPROVAL model for Phase 5? (yes/no)".
- [ ] V records `HERMES AUTHORIZED NEXT: Phase 5` (or an equivalent explicit approval comment) after reviewing the data.
- [ ] If V says no, Phase 5 does not execute; the LANE PLAN model is renegotiated before any task below runs.

**Acceptance of the gate:** a durable V approval comment exists that (1) cites Phase 1–4 wall-clock evidence and (2) explicitly authorizes the per-mission LANE PLAN APPROVAL model. No Task 5.x edit is claimed before this comment exists.

---

### Task 5.1: Add "## Worktree isolation" to the spine (universal lane mechanism, worktree state fields, LANE PLAN APPROVAL)

**Files:**
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`

**Risk tier:** high (reformulates how a V-gated important operation — worktree create/use — is approved; V personally ruled on this in §6.3.1 and marked it provisional).

**Review gate:** full ladder + V (per proportional law: high). The reviewer independently confirms the LANE PLAN APPROVAL does not weaken the V gate (it relocates it from per-operation to per-mission and keeps destructive ops individually gated); V confirms the reformulation matches ruling #2.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the Verify commands in this task
Human review required: yes
```

**Depends on:** Task 5.2 (declares `max_concurrent_heavy`, referenced by pointer here). Phase 1 (V DECISIONS PACKET). Phase 2 (typed `worktree`/`contract`/`owner`/`risk_tier`/`authority_epoch` fields).

**Steps:**
- [ ] Read the spine's "## Parallelism and file ownership" section and the following "## Universal safety rules" heading to confirm the insertion boundary is unchanged (the section still ends with the bullet `- A ticket returned for changes remains assigned to its original worker. Do not give it to an idle different worker merely for speed.`).
- [ ] Insert the following new section **immediately before the heading `## Universal safety rules`** (i.e., between that last Parallelism bullet and `## Universal safety rules`). Insert verbatim:

````markdown
## Worktree isolation

Every implementation lane runs in its own isolated git worktree. Isolation is the default lane mechanism for all sibling tickets whose file contracts do not overlap — not an optional optimization. Reviewers and planners never open a writer's worktree to edit; they read it.

### Worktree state fields

Each lane carries the typed `worktree` field on its ticket state:

```text
worktree:
  path: <.worktrees/lane-x>          # isolated `git worktree add` directory
  branch: <branch>                   # the lane's branch
  merge_status: none | pending | merged
```

`merge_status` starts `none`, becomes `pending` when the lane reaches its integration node, and `merged` only after the integration node confirms the commits landed in the closure/integration target. Only Claude-Router (or V) writes `merge_status`; the lane worker writes `path` and `branch` at claim.

### Universal Split -> Verify -> Merge lane checklist

This checklist is the universal per-lane mechanism (promoted from the planning skill; it applies to every implementation lane, not only Codex):

- [ ] Preflight: run `git status`; read the ticket body, all comments, dependencies, and the file-scope map; confirm the lane's `worktree.path`/`worktree.branch` and `authority_epoch`.
- [ ] Split: `git worktree add <worktree.path> <worktree.branch>` — one worktree per independent non-overlapping lane; never parallel-edit the same files/hunks.
- [ ] Guardrails: no pushes, no destructive git operations, no marking Done, no fake runtime data; heavy commands honor the `max_concurrent_heavy` semaphore (see `## Parallelism and file ownership`).
- [ ] Verify: run the ticket's focused checks inside that worktree and record exact output.
- [ ] Coordinate: post the lane's heartbeat and, on first-pass completion, `READY FOR PEER REVIEW` with `worktree.path`, commit SHA, files, checks, risks, and comment cursor. A separate read-only reviewer advances GREEN work.
- [ ] Merge/handoff: never integrate a lane yourself; wait for Claude-Router to route the lane to the integration node (see `## Worktree integration and closure gate`).

### LANE PLAN APPROVAL (H6)

Worktree creation and use remain a V-gated important operation. The gate is satisfied **per mission, not per operation**: at H6, Hermes submits the complete lane plan as ONE row in the V DECISIONS PACKET. V's single approval of that row authorizes every worktree create and use inside the approved plan for the mission. Destructive git operations (worktree remove, branch delete, history rewrite, force push) are never covered by this approval and always require their own individual important-operation approval when they arise.

```text
LANE PLAN APPROVAL (H6 — one V DECISIONS PACKET row):
- mission/epoch:
- authority_epoch:
- max_concurrent_heavy: <value from the spine; laptop = 1>
- lanes:
  - lane id:
    ticket(s):
    owner: { agent: codex|claude|grok, session: <id> }
    risk_tier: low | medium | high
    worktree.path: <.worktrees/lane-x>
    worktree.branch: <branch>
    contract.allowed: [...]
    contract.readonly: [...]
    contract.forbidden: all_others
    contract.verification: [...]
- merge order: <lane-a -> lane-b -> ... into the closure target>
- closure/integration target: <path/branch>
- destructive git ops requested in this plan: none | <explicit list — each still individually gated>
- decision needed: approve all worktree create/use in this plan? (single yes/no)
- evidence link: <VerticalSlices.md path + Kanban card ids>
```

A lane worker may run `git worktree add` for its lane only after the LANE PLAN APPROVAL row for the current `authority_epoch` is approved. If no approved lane plan covers the lane, stop and post a blocker; do not create a worktree speculatively.
````

**Verify:**
```bash
SP="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "## Worktree isolation" "$SP"                                   # expected 1
grep -c "LANE PLAN APPROVAL (H6" "$SP"                                  # expected >=1
grep -c "Split -> Verify -> Merge" "$SP"                               # expected >=1
grep -c "destructive git operations (worktree remove, branch delete, history rewrite, force push)" "$SP"  # expected 1
grep -c "merge_status: none | pending | merged" "$SP"                   # expected 1
```

**Acceptance:**
- A `## Worktree isolation` section exists in the spine containing the worktree state-field spec, the universal Split -> Verify -> Merge checklist, and the full LANE PLAN APPROVAL (H6) template.
- The section states the V gate is satisfied per mission via one V DECISIONS PACKET row, and that destructive git ops (remove/delete/rewrite/force) always stay individually gated — the gate is relocated, never removed.
- The LANE PLAN APPROVAL row carries worktree paths, per-lane file contracts, merge order, and the closure/integration target as ruling #2 requires.

---

### Task 5.2: Declare `max_concurrent_heavy` once in the spine; replace all duplicated one-heavy-command declarations with pointers

**Files:**
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md`
- Modify: `C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md`

**Risk tier:** medium (spine-law change to the Parallelism section; relaxes hard-coded topology serialization but preserves the heavy-command limit at laptop=1, so laptop behavior is unchanged; no data/security safety law touched).

**Review gate:** 1 independent reviewer + Hermes (per proportional law: medium). The reviewer confirms laptop behavior is unchanged (semaphore value = 1) and that no numeric limit survives outside the single spine declaration.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
  C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md
  C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md
Forbidden: all other files
Verification: the Verify commands in this task
Human review required: no
```

**Steps:**

*Spine — the single canonical declaration (in "## Parallelism and file ownership"):*
- [ ] Read the spine's "## Parallelism and file ownership" bullet list to confirm the exact line is present.
- [ ] Replace the bullet `- Avoid simultaneous heavy builds/tests on V's laptop; serialize them when in doubt.` with:

````text
- **`max_concurrent_heavy` (semaphore, declared once here):** the maximum number of heavy builds/tests/agents that may run at the same time. On V's laptop this value is **1** (today's behavior). Raising it to run more heavy commands in parallel is a one-number change on a stronger machine — no protocol rewrite. Every other document references this parameter by pointer instead of restating a numeric limit.
````

*Codex adapter — pointer (in "## Worktree and parallelism"):*
- [ ] Replace the bullet `- Serialize heavy builds/tests on V's current laptop when in doubt.` with:

````text
- Heavy builds/tests honor the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`; laptop = 1).
````

*LITE — replace each duplicated declaration with a pointer (6 edits):*
- [ ] Replace the standalone paragraph `Only one heavyweight agent or heavy test/build should run at a time on the laptop. Parallelize read-only reasoning only when V explicitly wants it and resource use is safe.` with:

````text
The concurrent-heavy limit is the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`); on V's laptop it is 1. Parallelize read-only reasoning only when V explicitly wants it and resource use is safe.
````

- [ ] In the "Resource rules:" list, replace the two consecutive bullets:

````text
- one Codex implementation ticket at a time by default;
- no simultaneous heavy builds/test suites;
````

with:

````text
- sibling implementation tickets with non-overlapping file contracts run as parallel lanes (topology), never force-serialized by ticket count;
- heavy builds/test suites are bounded by the spine `max_concurrent_heavy` semaphore (laptop = 1), not by a ticket count;
````

- [ ] In the "Parallelism is a live contract" bullet, replace the sentence `Keep one writer per lane and one heavy test/build command globally; a read-only reviewer may overlap disjoint edits when it does not consume the heavy slot.` with:

````text
Keep one writer per lane and honor the spine `max_concurrent_heavy` semaphore (laptop = 1) for heavy test/build commands globally; a read-only reviewer may overlap disjoint edits when it does not consume a heavy slot.
````

- [ ] In the Step 6 self-audit list, replace the bullet `- heavy commands are sequenced rather than run concurrently;` with:

````text
- heavy commands honor the spine `max_concurrent_heavy` semaphore (laptop = 1) rather than running concurrently;
````

- [ ] In the antipatterns list, replace `10. Running several heavy agents/builds concurrently on V's laptop.` with:

````text
10. Running heavy agents/builds beyond the spine `max_concurrent_heavy` semaphore (laptop = 1) on V's laptop.
````

- [ ] In the closing checklist, replace `- [ ] Heavy processes/tests are serialized for the laptop` with:

````text
- [ ] Heavy processes/tests honor the spine `max_concurrent_heavy` semaphore (laptop = 1)
````

- [ ] Leave these LITE inline enforcement references UNCHANGED (they reference honoring serialization procedurally, not a competing numeric limit; the single numeric value now lives only in the spine): the `serialized heavy check` clause in the RED/GREEN packet-requirements list; `one serialized cluster baseline` in the low-risk cluster procedure; `serialized heavy checks` in the continuation-prompt requirement; and `no concurrent writers/heavy commands were permitted` in the closing checklist.

**Verify:**
```bash
SP="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
CX="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/codex-heartbeat-adapter.md"
LITE="C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"
grep -c "max_concurrent_heavy" "$SP"                                        # expected >=1 (declaration; +1 more if 5.1 landed)
grep -c "declared once here" "$SP"                                          # expected 1
grep -c "Avoid simultaneous heavy builds/tests on V's laptop" "$SP"         # expected 0
grep -c "max_concurrent_heavy" "$CX"                                        # expected >=1
grep -c "Serialize heavy builds/tests on V's current laptop" "$CX"          # expected 0
grep -c "max_concurrent_heavy" "$LITE"                                      # expected >=6
grep -c "Only one heavyweight agent or heavy test/build should run at a time" "$LITE"  # expected 0
grep -c "no simultaneous heavy builds/test suites" "$LITE"                  # expected 0
grep -c "one Codex implementation ticket at a time by default" "$LITE"      # expected 0
grep -c "one heavy test/build command globally" "$LITE"                     # expected 0
grep -c "heavy commands are sequenced rather than run concurrently" "$LITE" # expected 0
grep -c "Running several heavy agents/builds concurrently on V" "$LITE"     # expected 0
grep -c "Heavy processes/tests are serialized for the laptop" "$LITE"       # expected 0
```

**Acceptance:**
- `max_concurrent_heavy` is declared exactly once with a numeric value (laptop = 1) in the spine's "## Parallelism and file ownership" section.
- The spine, codex adapter, and LITE contain no surviving standalone one-heavy-command numeric declaration; every removed declaration is replaced by a pointer to the spine semaphore.
- Laptop behavior is unchanged: heavy commands remain serialized at value 1; only topology serialization (ticket-count) is relaxed in favor of parallel non-overlapping lanes.

---

### Task 5.3: Add the integration node and mandatory closure-gate check to the spine

**Files:**
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`

**Risk tier:** medium (spine-law addition; it strengthens the closure/Done-evidence gate by adding a mandatory check — additive, never a weakening of the product-truth or Done-authority law).

**Review gate:** 1 independent reviewer + Hermes (per proportional law: medium). The reviewer confirms the closure-gate line is mandatory and that the integration node keeps rework returning to the original worker/session under the rework cap.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the Verify commands in this task
Human review required: no
```

**Depends on:** Task 5.1 (this section is inserted immediately after the `## Worktree isolation` section 5.1 creates, which now precedes `## Universal safety rules`).

**Steps:**
- [ ] Confirm Task 5.1 has landed: `grep -c "## Worktree isolation"` on the spine returns 1.
- [ ] Insert the following new section **immediately before the heading `## Universal safety rules`** (after Task 5.1's `## Worktree isolation` section, which now precedes it). Insert verbatim:

````markdown
## Worktree integration and closure gate

Merging lane worktrees is a real graph node, not an afterthought. It has a named owner, a conflict procedure, and its own evidence.

### Integration node

- **Owner:** Claude-Router assigns the integration node to a single named session once every parent lane is Hermes-approved. Lane workers do not self-integrate.
- **Conflict procedure:** integrate approved lane commits into one closure/integration target in the merge order from the approved LANE PLAN. Resolve conflicts deliberately, one lane at a time; a conflicting lane returns to its original worker/session (the rework cap counts the round), never to an idle different worker.
- **Evidence:** record `git worktree list`, the integration target branch/commit, the per-lane commit SHAs merged, and the exact conflict resolutions. Set each merged lane's `worktree.merge_status: merged` only after its commits are confirmed present in the closure target.

### Mandatory closure-gate check

Do not certify a final browser/API/DB closure gate from Kanban Done state or the active dev workdir alone: in this workflow "Done" can mean "approved in an isolated lane worktree," and the closure target may still be behind those commits. Every closure gate must record this line before it can pass:

```text
[ ] git worktree list run; all approved commits confirmed integrated into closure target
```

If `git worktree list` shows approved commits still isolated in per-lane worktrees/branches, the closure gate stays Blocked (or open) until they are integrated into one closure target and the final API/browser/DB proof is rerun against that integrated tree. Passing focused checks inside an individual lane worktree is not integrated proof.

### Dirty-worktree / pre-existing-dirt attribution

A dirty tree is not automatically the current lane's fault, and it is never silently adopted. Before a lane reports or a reviewer certifies, attribute uncommitted changes to their owner:

- Run `git status` in the exact worktree/workdir and separate **this lane's authorized edits** (inside its `contract.allowed`) from **pre-existing dirt** (changes present before the lane claimed, or outside its file contract).
- Pre-existing or cross-lane dirt is attributed to its original owner/lane, reported by path, and left untouched — a lane never commits, reverts, or claims ownership of dirt it did not create, and never blocks solely because an unrelated tree is dirty.
- A dirty RED test may be legitimate active TDD for a still-running lane; it is called out explicitly and is never certified as a green tree.
- The integration node integrates only the committed, attributed lane commits named in the approved LANE PLAN; unattributed dirt is not integrated and not certified.
````

**Verify:**
```bash
SP="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "## Worktree integration and closure gate" "$SP"   # expected 1
grep -c "git worktree list run; all approved commits confirmed integrated into closure target" "$SP"  # expected >=1
grep -c "Lane workers do not self-integrate." "$SP"        # expected 1
grep -c "### Dirty-worktree / pre-existing-dirt attribution" "$SP"  # expected 1
grep -ci "pre-existing dirt" "$SP"                         # expected >=1
```

**Acceptance:**
- A `## Worktree integration and closure gate` section exists with a named integration-node owner (Claude-Router), a conflict procedure that returns conflicts to the original worker under the rework cap, and required integration evidence.
- The exact mandatory closure-gate line `[ ] git worktree list run; all approved commits confirmed integrated into closure target` is present in the spine.
- The section forbids certifying closure from Kanban Done state or the active dev workdir alone.
- A `### Dirty-worktree / pre-existing-dirt attribution` law is present: it separates a lane's authorized edits from pre-existing/cross-lane dirt, attributes dirt to its owner (untouched, reported by path), treats a dirty RED as possible active TDD (never certified green), and integrates only committed, attributed lane commits (this is the spine destination the Phase 6.2 move-map expects for FULL's `## Dirty Worktree Rule`).

---

### Task 5.4: Add "## Worktree and parallelism" sections to the Claude and Grok adapters (read-only-reviewer-safe)

**Files:**
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md`
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md`

**Risk tier:** low (adapter docs; additive; read-only-reviewer-safe — Claude/Grok never write worktrees under the Codex-only coding law).

**Review gate:** direct Hermes diff review, same-cycle done (per proportional law: low).

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit:
  C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md
  C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md
Forbidden: all other files
Verification: the Verify commands in this task
Human review required: no
```

**Steps:**
- [ ] In the Claude adapter, confirm the line `A \`ready\` status may mean returned rework, not a new assignment. Comments determine which.` sits at the end of the "## Comment markers Claude must recognize" section, immediately before `## Polling and live output`.
- [ ] In the Claude adapter, insert the following section **immediately before the heading `## Polling and live output`**. Insert verbatim:

````markdown
## Worktree and parallelism

Claude does not create, merge, or delete git worktrees: under the current law only Codex writes code, and worktree lifecycle belongs to Codex lanes plus Claude-Router integration. Claude's role around worktrees is read-only.

- When reviewing a Codex lane, read inside the lane's declared `worktree.path`; never edit files there and never run `git worktree add/remove` or any merge/rebase/branch operation.
- Record the exact `worktree.path`, branch, and commit SHA you reviewed in the review verdict so Claude-Router can match your evidence to the right lane.
- Separate the committed range you reviewed from any uncommitted worktree state. A dirty RED test may be legitimate active TDD for a running lane; it is not a green tree and must be called out explicitly, never certified.
- Do not consume the heavy slot: read-only checks may overlap other lanes only when they honor the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`; laptop = 1).
- For planning/artifact work, stay in your assigned stage workdir; never open a Codex implementation lane's worktree to edit.
````

- [ ] In the Grok adapter, confirm the line `A \`ready\` status may mean returned rework, not a new assignment. Comments determine which.` sits at the end of the "## Comment markers Grok must recognize" section, immediately before `## Polling and live output`.
- [ ] In the Grok adapter, insert the following section **immediately before the heading `## Polling and live output`**. Insert verbatim:

````markdown
## Worktree and parallelism

Grok does not create, merge, or delete git worktrees: under the current law only Codex writes code, and worktree lifecycle belongs to Codex lanes plus Claude-Router integration. Grok's role around worktrees is read-only.

- When reviewing a Codex lane, read inside the lane's declared `worktree.path`; never edit files there and never run `git worktree add/remove` or any merge/rebase/branch operation.
- Record the exact `worktree.path`, branch, and commit SHA you reviewed in the review verdict so Claude-Router can match your evidence to the right lane.
- Separate the committed range you reviewed from any uncommitted worktree state. A dirty RED test may be legitimate active TDD for a running lane; it is not a green tree and must be called out explicitly, never certified.
- Do not consume the heavy slot: read-only checks may overlap other lanes only when they honor the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`; laptop = 1).
- For research/slicing/artifact work, stay in your assigned stage workdir; never open a Codex implementation lane's worktree to edit.
````

**Verify:**
```bash
CL="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/claude-heartbeat-adapter.md"
GR="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/grok-heartbeat-adapter.md"
grep -c "## Worktree and parallelism" "$CL"   # expected 1
grep -c "## Worktree and parallelism" "$GR"   # expected 1
grep -ci "worktree" "$CL"                      # expected >=4 (was 0)
grep -ci "worktree" "$GR"                      # expected >=4 (was 0)
grep -c "never open a Codex implementation lane's worktree to edit" "$CL"  # expected 1
grep -c "never open a Codex implementation lane's worktree to edit" "$GR"  # expected 1
```

**Acceptance:**
- Both the Claude and Grok adapters contain a `## Worktree and parallelism` section (previously zero `worktree` occurrences in each).
- Each section is read-only-reviewer-safe: it forbids `git worktree add/remove`, merge/rebase/branch, and editing inside a lane worktree, consistent with the Codex-only coding law.
- Each section requires reviewers to record the reviewed `worktree.path`/branch/SHA, to separate committed range from dirty state, and to honor the spine `max_concurrent_heavy` semaphore.

---

### Task 5.5: Add the worktree/workdir entries to the spine §12 Glossary

**Files:**
- Modify: `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`

**Risk tier:** low (definitional glossary; no law changed).

**Review gate:** direct Hermes diff review, same-cycle done (per proportional law: low).

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the Verify commands in this task
Human review required: no
```

**Steps:**
- [ ] Confirm the spine already has a `## 12. Glossary` section (created by Phase 3 Task 3.1) whose graph-vocabulary bullets end with `- **chatter** …` and which carries the note that `worktree`/`workdir` are appended here by this task. Do NOT create a second `## Glossary` section — append into the existing §12.
- [ ] Append the following two bullets to the END of the existing `## 12. Glossary` section (immediately after the `worktree`/`workdir`-deferral note line, and before the next `## ` heading). Insert verbatim:

````markdown
- **worktree** — an isolated `git worktree add` directory dedicated to one lane, with its own branch. Tracked by the `worktree: {path, branch, merge_status}` state field. Lane isolation, the Split -> Verify -> Merge checklist, the LANE PLAN APPROVAL gate, and the integration node all operate on worktrees.
- **workdir** — the generic working tree an agent runs in (for example a planning/artifact stage terminal, or the active dev tree). A workdir is not a per-lane isolated worktree; do not certify a closure gate from a workdir until `git worktree list` confirms the approved commits are integrated (see `## Worktree integration and closure gate`).
````

**Verify:**
```bash
SP="C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"
grep -c "## 12. Glossary" "$SP"             # expected 1 (the single canonical glossary)
grep -cE "^## .*Glossary" "$SP"             # expected 1 (NO duplicate Glossary section)
grep -c "^- \*\*worktree\*\*" "$SP"         # expected 1
grep -c "^- \*\*workdir\*\*" "$SP"          # expected 1
grep -ci "workdir" "$SP"                    # expected >=2 (was 0 before this task; Task 3.1 §12 deliberately omitted it)
```

**Acceptance:**
- The single `## 12. Glossary` section (created by Task 3.1) now also defines `worktree` (isolated `git worktree add` dir) distinctly from `workdir` (generic working tree); no second/duplicate glossary section exists.
- The `workdir` entry links closure certification back to `## Worktree integration and closure gate`, closing the one-word-for-both ambiguity the corpus had.
- `workdir` now appears in the spine (previously zero occurrences — Task 3.1's §12 deliberately deferred it to this task).

## Phase 6 — Retirement, Final Push, Prune Request

> **Preconditions (hard):** Phase 6 runs LAST. It assumes Phases 1–5 already landed every transplanted law into the spine (`C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`). Task 6.1 begins with a transplant-completeness gate that greps the spine; if any grep returns `0`, STOP — a Phase 1–5 task is incomplete and Lite must NOT be retired yet.
>
> **Execution order inside Phase 6 (strict):** 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6. Rationale: retire/demote the redundant documents (6.1, 6.2), finalize the default operating mode in the spine (6.3), validate the whole new spine end-to-end with a real mission (6.4), push only after validation + V approval (6.5), and request prune only after the push is confirmed (6.6).
>
> **Standing constraint (V ruling #4):** NOTHING in this phase deletes, removes, or archives anything before V's explicit per-item prune approval in 6.6. Tasks 6.1–6.5 only rewrite/redirect documents and commit/push; no `rm`, no `git worktree remove`, no `git mv` of references, no rogue-skill deletion happens until 6.6 is approved item-by-item.
>
> **Repo facts (verified 2026-07-23):** git top-level `C:/Users/vladm/Desktop/debate/DebateV2`; branch `lane/roadmap-p0-p3`; remote `origin` = `https://github.com/DebateAIRO/debateairo.git`. The Hermes AppData skill files (LITE, FULL body, Hermes alias) live under `C:/Users/vladm/AppData/Local/hermes/...` and are **outside version control** — their rewrites are local file edits, part of the migration snapshot but not part of the git push.

---

### Task 6.1: Retire Lite — rewrite the Lite SKILL into a tombstone/redirect

**Files:**
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md` (currently 874 lines → tombstone ≤ 45 lines)

**Risk tier:** high (architectural: retiring an entire law-bearing protocol document; per V ruling #3 the immutable high-risk floor covers "destructive or architectural work" — cannot be tiered down)

**Review gate:** (per proportional law) high → full ladder + V. Independent reviewer (Claude or Grok, whichever did NOT author the tombstone) runs the transplant-completeness grep table; Hermes-Verifier confirms; V sees the retirement as part of the 6.5 final-push approval.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md
Forbidden: all other files (references/ under it are NOT edited here; they are handled in the 6.6 prune request)
Verification: the exact grep/wc commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] Run the **transplant-completeness gate** against the spine FIRST. Every row must return `>=1`; if ANY returns `0`, STOP and open a `V STEERING REQUIRED` note (a Phase 1–5 law was not transplanted — do not retire Lite):

  | Lite-unique law (blueprint §6.2.3 / §6.4 "From Lite") | Canonical token | Transplanted by (blueprint §4 phase task) | Spine grep (expected `>=1`) |
  |---|---|---|---|
  | Rework cap `REWORK ROUND: n of 3` | `rework_round` / `REWORK ROUND` | Phase 1 Task 1.1 | `grep -c "REWORK ROUND" <spine>` |
  | Chatter breaker (6 exchanges / 24 wakes) | `chatter` | Phase 1 Task 1.2 | `grep -ci "chatter" <spine>` |
  | Wake-gate tokenless change gate | `wakes_since_transition` | Phase 1 Task 1.3 + Phase 2 Task 2.1 | `grep -c "wakes_since_transition" <spine>` |
  | V DECISIONS PACKET + flush thresholds | `V DECISIONS PACKET` | Phase 1 Task 1.4 | `grep -c "V DECISIONS PACKET" <spine>` |
  | Batch route authorization | `HERMES AUTHORIZED ROUTE` | Phase 1 Task 1.5 | `grep -c "HERMES AUTHORIZED ROUTE" <spine>` |
  | `unblock` reset ceiling (2 per ticket) | `reset ceiling` / `unblock` | Phase 1 Task 1.6 | `grep -ci "reset ceiling" <spine>` |
  | AUTHORITY EPOCH monotonic + compare-before-write | `authority_epoch` | Phase 2 Task 2.1 | `grep -c "authority_epoch" <spine>` |
  | `waiting_*` vocabulary replacing `blocked` | `waiting_since` | Phase 2 Task 2.2 | `grep -c "waiting_since" <spine>` |
  | Proportional review persisted risk tier | `risk_tier` | Phase 2 Task 2.3 + Phase 4 Task 4.2 | `grep -c "risk_tier" <spine>` |
  | IMPORTANT OPERATIONS enumeration | `IMPORTANT OPERATIONS` | Phase 3 Task 3.1 | `grep -c "IMPORTANT OPERATIONS" <spine>` |
  | Cockpit legibility DONE/RUNNING/BLOCKED/V ACTION | `V ACTION` | Phase 3 Task 3.1 | `grep -c "V ACTION" <spine>` |
  | Zenith principles-vs-runtime risk dial | `ZENITH PRINCIPLES` | Phase 3 Task 3.1 | `grep -ci "ZENITH PRINCIPLES" <spine>` |
  | Failed-test ticket fanout diamond | `fanout` | Phase 4 Task 4.1 (universal, §6.4 KEEP) | `grep -ci "fanout" <spine>` |
  | `max_concurrent_heavy` semaphore (constrained-HW parameter) | `max_concurrent_heavy` | Phase 5 Task 5.2 | `grep -c "max_concurrent_heavy" <spine>` |

  where `<spine>` = `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`.
- [ ] Only after every row is `>=1`, replace the **entire contents** of `heartbeat-protocol-lite\SKILL.md` with exactly this tombstone:
  ```text
  ---
  name: heartbeat-protocol-lite
  description: RETIRED. Lite's laws now live in the DebateAI graph spine. This file only redirects to the spine and records the degraded-hardware fallback.
  version: 2.0.0
  ---

  # Heartbeat Protocol Lite — RETIRED (tombstone)

  Lite is retired as a standalone protocol (graph-harness migration, 2026-07).
  Every Lite-only law was transplanted into the single source of truth and none
  was weakened. Do NOT operate from this file.

  ## Load this instead

  Spine (single source of truth):
  `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
  plus the Hermes node contract. If name resolution routed you here, load those.

  ## Where Lite's laws went (all in the spine now)

  - AUTHORITY EPOCH monotonic + compare-before-write -> spine typed state `authority_epoch`.
  - wakeAgent tokenless change gate + `wakes_since_transition` -> spine wake-gate law.
  - needs_input/block-loop circuit breaker -> spine chatter breaker + `rework_round` cap.
  - IMPORTANT OPERATIONS list -> spine IMPORTANT OPERATIONS enumeration.
  - Proportional review (low/medium/high) -> spine persisted `risk_tier` routing.
  - Cockpit legibility DONE/RUNNING/BLOCKED/V ACTION -> spine cockpit-legibility law.
  - Zenith principles-vs-runtime dial -> spine `risk_tier` Zenith dial.
  - V DECISIONS PACKET + HERMES AUTHORIZED ROUTE -> spine batched-approval law.

  ## Constrained hardware is a parameter, not a protocol

  Run the full spine everywhere. On a constrained machine set the spine semaphore
  `max_concurrent_heavy: 1` (one heavy agent/build/test at a time). No second
  protocol document is needed.

  ## Degraded-hardware V-relay fallback

  If the machine cannot host Hermes-managed agent PTYs at all, Hermes may fall
  back to V-as-relay (one copy-paste prompt per stage, V returns the artifact).
  This is a TRANSPORT fallback only; every spine law still binds. Full procedure:
  spine section "Degraded-hardware V-relay fallback".
  ```
- [ ] Leave `heartbeat-protocol-lite\references\` untouched (29 files). Their archival/removal is a 6.6 prune-request item, not this task.

**Verify:**
- `wc -l "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `<= 45` (was 874)
- `grep -c "RETIRED" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "debateai-heartbeat-protocol.md" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "max_concurrent_heavy" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- `grep -c "Degraded-hardware V-relay fallback" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/heartbeat-protocol-lite/SKILL.md"` → expected `>=1`
- Re-run the full transplant-completeness grep table above → every row `>=1`

**Acceptance:**
- [ ] The Lite SKILL is ≤ 45 lines, redirects to the spine by absolute path, and contains no operating instructions of its own.
- [ ] All 14 transplant-completeness greps against the spine return `>=1` (no Lite-unique law was lost).
- [ ] Constrained hardware is expressed only as `max_concurrent_heavy: 1` plus the relay-fallback appendix — no second full protocol survives.
- [ ] `references/` (29 files) is unchanged and explicitly deferred to the 6.6 prune request.

---

### Task 6.2: Demote the FULL body — rewrite into loader + Hermes-only operational notes

**Files:**
- Modify: `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\SKILL.md` (currently 990 lines → loader + ops notes)

**Risk tier:** high (architectural: demoting the FULL protocol body whose laws are now spine-owned; immutable high-risk floor)

**Review gate:** (per proportional law) high → full ladder + V. Independent reviewer confirms every law-bearing section was removed only after its spine destination is verified present; Hermes-Verifier confirms; V sees it in the 6.5 push approval.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\SKILL.md
Forbidden: all other files (references/ under it are NOT edited here; deferred to 6.6)
Verification: the exact grep/wc commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] **Section move-map (list exactly which sections move where).** Before deleting any section, confirm each law-bearing section's destination is already present in the spine (Phases 1–5). The mapping is:

  | FULL body section (exact heading) | Disposition | Destination |
  |---|---|---|
  | `## References` (16 pointers) | tier | Phase 3 Task 3.4 tiering (kept reusable vs `references/archive/`); the pointer list is not re-documented here |
  | `## Overview`, `## When to Use`, `## Core Doctrine` | delete-as-law | spine "Operating model" + "Binding stage and coding law" |
  | `## Kanban State Machine` | delete-as-law | spine "Logical review state machine" |
  | `## Manual QA / Product-Truth Gate` (incl. `V MANUAL QA PACKET:` template) | delete-as-law | spine product-truth gate + `V MANUAL QA PACKET` |
  | `## Binding Failed-Test Ticket Fanout` | delete-as-law | spine failed-test fanout diamond (Phase 4 Task 4.1) |
  | `## Codex Behavior Contract`, `### Codex continuous comment loop` | delete-as-law | Codex node contract (`codex-heartbeat-adapter.md`) |
  | `### Live Breakpoint / No-Theater Mode` | delete-as-law | spine product-truth / workflow-vs-product-evidence law |
  | `## Stage-Rotated Planning and Codex-Only Implementation` | delete-as-law | spine "Binding stage and coding law" + planning diamonds (Phase 4) |
  | `## Codex Worktree + Skeleton/Subagent Dispatch Rule` | delete-as-law | spine worktree section (Phase 5) + Codex node contract |
  | `## Hermes Behavior Contract`, `## Blocker Handling Without Fully Freezing Codex` | delete-as-law | Hermes node contract (Phase 3 §6.5) + spine "Blocked format" |
  | `## Dirty Worktree Rule` (attribution law) | delete-as-law | spine dirty-worktree/pre-existing-dirt attribution law |
  | `## Architecture Boundaries` | delete-as-law | spine architecture-boundary stop-and-route trigger list |
  | `## Heartbeat Protocol` (templates) | delete-as-law | spine "Required comment templates" |
  | `## Autonomous Heartbeat Watcher` | **KEEP-as-ops** | retained here (Hermes cron settings, delivery target, gateway) |
  | `## Preflight Before Firing Codex + Hermes` | **KEEP-as-ops** | retained here |
  | `## Stall Recovery`, `## Scope / Drift Recovery`, `## Dependency / Self-Block Recovery`, `### Hermes prerequisite insertion pattern`, `### Hermes routing command hygiene` | **KEEP-as-ops** | retained here (Hermes CLI recovery prompts + command hygiene) |
  | `## Windows/local pytest verification notes` | **KEEP-as-ops** | retained here (machine-specific verification) |
  | `## Bedtime / AFK stop-or-trust decision` | **KEEP-as-ops** | retained here |
  | `## Approval-gate expectations` | **KEEP-as-ops** | retained here (approvals.mode) |
  | `## Support Files` (106 refs) | tier | Phase 3 Task 3.4 tiering; not re-documented here |
  | `## Common Pitfalls`, `## Verification Checklist` | split | law items → spine checklist; Hermes-cron/CLI items kept-as-ops here |

- [ ] Replace the file's frontmatter + everything from `# DebateAI Kanban Heartbeat Review Loop` down through the end of `## Heartbeat Protocol` (i.e. all law-bearing sections above the retained ops sections) with this new loader header:
  ```text
  ---
  name: debateai-kanban-heartbeat-review-loop
  description: Hermes loader + Hermes-specific operational notes. All protocol LAW now lives in the DebateAI graph spine; this file only loads the spine and holds Hermes cockpit operational notes (cron, CLI hygiene, local verification).
  version: 2.0.0
  author: Hermes Agent
  license: MIT
  ---

  # DebateAI Kanban Heartbeat Review Loop — Hermes loader + operational notes

  ## Load first (law lives here, not below)

  The binding protocol is the graph spine:
  `C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
  plus the Hermes node contract. Everything below is Hermes-specific OPERATIONAL
  guidance (how Hermes runs on this machine), not protocol law. If anything below
  appears to conflict with the spine, the spine wins.

  ## What moved to the spine (do not re-document here)

  - Kanban state machine / logical review markers -> spine "Logical review state machine".
  - Manual QA / product-truth gate + `V MANUAL QA PACKET` -> spine product-truth gate.
  - Failed-test ticket fanout -> spine failed-test fanout diamond.
  - Stage-rotated planning + numbered-stage gates -> spine stage law + planning diamonds.
  - Worktree split->verify->merge + integrate-before-closure -> spine worktree section.
  - Dirty-worktree attribution -> spine dirty-worktree attribution law.
  - Architecture-boundary trigger list -> spine architecture-boundary stop-and-route.
  - Live Breakpoint / workflow-vs-product evidence -> spine product-truth law.
  - Codex behavior contract + continuous comment loop -> Codex node contract.
  - Comment templates (claim/heartbeat/review/rework/blocked) -> spine "Required comment templates".

  ## Hermes operational notes (retained below — NOT law)

  The sections below this point are machine-specific Hermes ops and stay: the
  autonomous heartbeat watcher (cron settings, delivery target, gateway),
  preflight, routing command hygiene, Windows/local pytest verification notes,
  bedtime/stall/scope recovery prompts, and approval-gate (approvals.mode)
  expectations. They carry no protocol law of their own.
  ```
- [ ] Delete every section marked **delete-as-law** in the move-map (their exact `##`/`###` headings and bodies), keeping only the sections marked **KEEP-as-ops**.
- [ ] In the retained `## Common Pitfalls` and `## Verification Checklist`, delete rows that restate spine law; keep only rows about Hermes cron, CLI hygiene, delivery targets, and local Windows verification.
- [ ] Leave `debateai-kanban-heartbeat-review-loop\references\` untouched (106 files) — tiering/archival is a 6.6 prune-request item.

**Verify:**
- `wc -l "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/SKILL.md"` → expected `< 300` (was 990)
- `grep -c "debateai-heartbeat-protocol.md" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/SKILL.md"` → expected `>=1` (loader points to spine)
- `grep -c "the spine wins" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/SKILL.md"` → expected `>=1`
- Law sections removed: `grep -c "## Kanban State Machine" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/SKILL.md"` → expected `0`; same expected `0` for `"## Architecture Boundaries"` and `"## Binding Failed-Test Ticket Fanout"`
- Ops sections retained: `grep -c "## Autonomous Heartbeat Watcher" "C:/Users/vladm/AppData/Local/hermes/skills/software-development/debateai-kanban-heartbeat-review-loop/SKILL.md"` → expected `>=1`; same expected `>=1` for `"## Windows/local pytest verification notes"`

**Acceptance:**
- [ ] The FULL body is a loader (points to the spine + Hermes node contract) plus only Hermes machine-ops sections; no protocol law remains in it.
- [ ] Every **delete-as-law** section's destination was confirmed present in the spine/adapters/Codex contract before deletion (the move-map's destination column).
- [ ] All 4 named law-section greps return `0`; both named ops-section greps return `>=1`.
- [ ] `references/` (106 files) is unchanged and explicitly deferred to the 6.6 prune request.

---

### Task 6.3: Make full-mode the spine default — write the V-touchpoint + degraded-relay sections

**Files:**
- Modify: `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md`

**Risk tier:** high (architectural: changes the default operating model and the V-involvement contract; immutable high-risk floor)

**Review gate:** (per proportional law) high → full ladder + V. Independent reviewer confirms no safety gate is removed (every reduction is balanced by V DECISIONS PACKETS + final acceptance + escalation edges); Hermes-Verifier confirms; V confirms at final push.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router routes; Hermes crafts/custodies the board (default worker Codex; docs-only change)
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md
Forbidden: all other files
Verification: the exact grep commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] Read the spine's `## Operating model` section (Phase 3 preserves this heading; Phase 3 Task 3.11(a) already replaced the old vague V-interruption sentence there with Lite's IMPORTANT OPERATIONS enumeration, keeping the tail `Routine routing and review communication belong in ticket comments.`). Locate that preserved tail sentence, `Routine routing and review communication belong in ticket comments.`, which now closes the IMPORTANT OPERATIONS paragraph.
- [ ] Locate the `### The One-Prompt Machine law` subsection installed at the end of `## Operating model` by Task 3.11(l). Insert immediately **after** that subsection (and before the `## Binding stage and coding law` heading) these two new sections verbatim:
  ```text
  ## Default full-mode operation and V touchpoints

  Default operation is FULL mode: Claude (the Main Orchestrator, the Claude-Router
  seat, ruling R1) launches and holds the agent sessions (managed PTYs or scripted
  CLI bridges), routes every agent on typed state, and drives them through ticket
  comments; Hermes-Verifier holds Kanban board custody and crafting, mutates the
  board, and runs verification and Manual QA. V does not paste prompts, relay
  output, or press Resume in full mode.

  V is touched exactly through the three One-Prompt Machine surfaces (law above):

  1. Intake and design questions: V states the mission at H0 with the single
     mission prompt; during design, the REQUIREMENTS and ARCHITECTURE nodes (and
     only those) may ask V questions or request steering. Claude-Router classifies
     and sets `risk_tier` at intake.
  2. V DECISIONS PACKETS: Claude-Router batches V-owned gates (the named-category
     filter decides what qualifies) from Hermes-Verifier's verdicts and blocks, and
     flushes one consolidated packet per the flush thresholds (>=3 pending, or any
     pending >4h, or a lane frozen, or V asks). This includes the per-mission
     worktree lane-plan approval submitted at H6.
  3. Final acceptance: V performs the final human/product acceptance at the
     mission's closure gate.

  Everything else — routing (Claude-Router), review and board custody
  (Hermes-Verifier), rework, successor dispatch — stays inside the orchestrator /
  verifier loop and the ticket comments. Reducing V touchpoints never removes a
  safety gate: a frozen loop (rework cap, chatter breaker, reset ceiling) escalates
  into the V DECISIONS PACKET; it never auto-approves.

  ## Orchestrator outage fallback (ruling R3)

  If the Claude (Main Orchestrator) session is down, the Architecture-responsible
  agent communicates directly with the humans ("us" = anyone using the harness)
  until the orchestrator is restored. This is legal WITHOUT creating a new V-facing
  surface: ARCHITECTURE already holds design-question authority under the One-Prompt
  Machine law (surface (a)), so the outage relay rides an existing authorized
  channel. It is a temporary continuity measure, recorded on the affected tickets;
  no other loop gains a human-facing channel, and every spine law still binds.

  ## Degraded-hardware V-relay fallback

  Full mode is the default. Only when the machine cannot host the orchestrator's
  managed agent sessions at all, the orchestrator falls back to V-as-relay:

  - Claude-Router emits exactly one copy-paste prompt for the next required
    agent/stage.
  - V pastes it into the external agent and returns the artifact/handoff.
  - Hermes-Verifier reviews, records the gate, and Claude-Router supplies the next
    single prompt.

  This is a TRANSPORT fallback only. Every law in this spine still binds:
  independent review, no self-Done, the `rework_round` cap, the chatter breaker,
  `risk_tier` routing, and the IMPORTANT OPERATIONS gates. Set the semaphore
  `max_concurrent_heavy: 1` on constrained hardware. V-relay is never the default
  and is recorded explicitly on the ticket whenever used.
  ```

**Verify:**
- `grep -c "## Default full-mode operation and V touchpoints" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "## Degraded-hardware V-relay fallback" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "Claude (the Main Orchestrator" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1` (Claude is named the launcher, ruling R1)
- `grep -c "## Orchestrator outage fallback (ruling R3)" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "the Architecture-responsible agent communicates directly with the humans" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1` (R3 installed)
- `grep -c "V does not paste prompts, relay output, or press Resume" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -c "TRANSPORT fallback only" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1`
- `grep -cE "1\. Intake and design questions" "C:/Users/vladm/Desktop/debate/DebateV2/apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md"` → expected `>=1` (the three-touchpoint list is present)

**Acceptance:**
- [ ] The spine states full mode as default with **Claude (the Main Orchestrator, Claude-Router)** named as the launcher of agent sessions (ruling R1) and Hermes-Verifier holding board custody/crafting, and enumerates the three One-Prompt Machine surfaces (intake/H0 + design questions from REQUIREMENTS/ARCHITECTURE only, V DECISIONS PACKETS, final acceptance), consistent with the law installed by Task 3.11(l).
- [ ] The `## Orchestrator outage fallback (ruling R3)` section installs the outage relay: if the Claude session is down, the Architecture-responsible agent communicates directly with the humans, legal because ARCHITECTURE already holds design-question authority (no new V-facing surface created).
- [ ] V-relay is documented only as a degraded-hardware transport fallback, explicitly non-default, with all spine laws still binding.
- [ ] The new `## Degraded-hardware V-relay fallback` heading matches the string the Lite tombstone (6.1) points at, so the redirect resolves.
- [ ] No existing safety gate was deleted or weakened; every reduction routes to escalation instead of auto-approval.

---

### Task 6.4: End-to-end acceptance run — one Tier-1 mission under the new spine

**Files:**
- Create: `C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-phase6-acceptance-evidence.md` (mission evidence artifact — input to V's final acceptance)

**Risk tier:** medium (validation run; no protocol-law edit; produces the evidence V's push decision depends on)

**Review gate:** (per proportional law) medium → 1 independent reviewer + Hermes. The independent reviewer (Claude or Grok, not the mission's implementer) re-derives the three measurements from the durable Kanban/log evidence; Hermes-Verifier confirms.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude-Router orchestrates and routes the Tier-1 mission (ruling R1); Hermes-Verifier custodies the board, verifies, and runs Manual QA; Codex implements the mission's tickets; independent reviewer (Claude or Grok) re-verifies the metrics
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-phase6-acceptance-evidence.md (evidence artifact only); the mission's own ticket files per that mission's contracts
Forbidden: editing any protocol document (spine/adapters/skills) during the run — the run validates them as-frozen
Verification: the exact commands in the Verify block below
Human review required: yes (V records the final acceptance verdict — this is one of the three measured touchpoints)
```

**Steps:**
- [ ] Select one real **Tier-1** (routine feature) mission (planning risk Tier 1 per §3.5.2: routine feature, plan + parallel review diamond). Do not use a Tier-0 docs mission or a Tier-2 architecture mission.
- [ ] Run it end-to-end under the frozen new spine in full mode: H0 → G1 → H1 → C2 → {H2 ∥ G3} → H3 → C4/FinalPlan → G5 → H5 → H6 (single batched lane-plan approval) → C8 Codex implementation → H9 closure/acceptance.
- [ ] Record the run into the evidence artifact using exactly this checklist (fill every `<...>`):
  ```text
  # Graph-Harness Phase 6 Acceptance Run — Evidence

  Mission: <id/title>   Planning tier: 1 (routine feature)   Date: <date>
  Spine commit under test: <git rev-parse HEAD of DebateV2 pre-push>

  ## Metric 1 — V interactions (target: <= 3, all within this mission)
  - [ ] intake (H0): 1
  - [ ] V DECISIONS PACKET flush(es): <n>  (list each: card, decision, when)
  - [ ] final acceptance (H9): 1
  - TOTAL V interactions = <n>   PASS if <= 3
  - evidence: Kanban comment IDs / packet links: <...>

  ## Metric 2 — Planning-diamond wall-clock vs old serial chain (target: >= 30% faster)
  - new diamond (C2 Plan -> {H2 || G3} -> H3 merge) wall-clock: <mm:ss>
  - old serial baseline (C2 -> H2 -> G3 -> H3, same content): <mm:ss>
  - delta = <-x%>   PASS if reduction >= 30%
  - evidence: stage-start/stop timestamps: <...>

  ## Metric 3 — Void-polling incidents (target: ZERO uncontrolled)
  - max wakes_since_transition observed on any card: <n>  (must be <= 24, else must have frozen+escalated)
  - max rework_round observed on any card: <n>  (must be <= 3, else must have frozen+escalated)
  - chatter breaker: [ ] never tripped  OR  [ ] tripped AND escalated correctly into V DECISIONS PACKET (no unbounded Hermes<->worker loop)
  - unbounded relaunch/unblock loops: NONE
  - PASS if zero uncontrolled void-polling (breaker never trips, or trips and escalates correctly)
  - evidence: router-wake log / comment cursors: <...>

  ## Overall verdict: PASS | FAIL  (all three metrics must PASS)
  ```
- [ ] Have the independent reviewer re-derive Metrics 1–3 from the durable Kanban/log evidence (not from the implementer's summary) and co-sign the verdict.

**Verify:**
- `test -f "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md" && echo OK` → expected `OK`
- `grep -c "TOTAL V interactions" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md"` → expected `>=1`
- `grep -cE "delta = -?[0-9]+%" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md"` → expected `>=1`
- `grep -c "void-polling" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md"` → expected `>=1`
- `grep -cE "Overall verdict: (PASS|FAIL)" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md"` → expected `>=1`

**Acceptance:**
- [ ] A real Tier-1 mission ran end-to-end under the frozen new spine in full mode, with all three metrics filled from durable evidence.
- [ ] V interactions ≤ 3 within the mission; planning-diamond wall-clock ≥ 30% faster than the old serial chain on the same content; zero uncontrolled void-polling (breaker never trips, or trips and escalates correctly).
- [ ] The independent reviewer co-signed the verdict from Kanban/log evidence, not from the implementer's summary.
- [ ] If any metric FAILs, Phase 6 stops here — do NOT proceed to 6.5; open a `V STEERING REQUIRED` note.

**Falsification criteria — any single occurrence fails the acceptance run (ruling R5).** This pilot (and every future mission) is FALSIFIED — the run is FAIL regardless of the three metrics — if any one of the following is observed in the durable evidence:

- [ ] scaffolded data (any placeholder/mock/hard-coded value passed off as real product data);
- [ ] fake test runs (a claimed run with no real execution evidence);
- [ ] test cheating (assertions weakened, tests skipped/xfailed, or code special-cased to pass the check);
- [ ] TDD/DDD violations (implementation before a failing test, or work outside the domain-driven contract);
- [ ] anything the agent is specified NOT to do and does;
- [ ] anything the agent is told TO do and does not;
- [ ] chain-of-command violations;
- [ ] questions addressed directly to humans by any loop that does NOT hold question authority (a One-Prompt Machine violation);
- [ ] an incomplete report chain at closure (ruling R8): the acceptance mission must have its phase reports and closure report present under `.hermes/reports/<mission>/`, with both SATISFIED markers referencing the closure report — a missing, overwritten, or after-the-fact-reconstructed report FAILS the run.

For this checklist, **a chain-of-command violation = any agent exercising an authority its seat does not hold (self-Done, unauthorized status mutation, reviewer editing a fix, subagent addressing V, acting against a newer authority epoch, bypassing Claude-Router or Hermes-Verifier) or any loop without question authority addressing humans.** The independent reviewer checks every item against the durable Kanban/log evidence; a single confirmed occurrence makes the acceptance run FAIL and Phase 6 stops (do NOT proceed to 6.5).

---

### Task 6.5: FINAL PUSH — single commit/push of the whole migration (V approval required)

**Files:**
- Create: `C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-final-push-approval-request.md` (the approval-request packet, durable + grep-able)
- Modify: (no protocol file is edited here; this task commits and pushes the already-modified migration files after V's yes)

**Risk tier:** high (irreversible/destructive-class operation: `git push`; an IMPORTANT OPERATION requiring explicit V approval per spine "Universal safety rules")

**Review gate:** (per proportional law) high → full ladder + V. Hermes-Verifier confirms the diff matches the migration scope and the 6.4 verdict is PASS; V gives the single push approval.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Hermes composes/posts the approval request and (only on V's yes) runs the commit + push
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-final-push-approval-request.md; git index/refs of DebateV2 (commit + push) only after V approval
Forbidden: force-push, history rewrite, pushing any branch other than lane/roadmap-p0-p3, any push before V's explicit yes
Verification: the exact commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] Confirm 6.4 Overall verdict = PASS. If not PASS, STOP.
- [ ] Write the approval-request packet to the Create path above using exactly this format (fill every `<...>` from live `git` output), and post the same as a `V DECISIONS PACKET` row in Kanban/chat:
  ```text
  FINAL PUSH APPROVAL REQUEST (V DECISIONS PACKET row)
  - decision: approve one commit + push of the graph-harness migration
  - branch: lane/roadmap-p0-p3
  - remote: origin (https://github.com/DebateAIRO/debateairo.git)
  - repo commit contents (git diff --stat): <paste git diff --stat output>
  - commit scope: <N> files, +<insertions>/-<deletions>
  - out-of-repo migration changes (NOT pushed; part of the same migration snapshot):
      - LITE tombstone: C:/Users/vladm/AppData/Local/hermes/.../heartbeat-protocol-lite/SKILL.md (874 -> <n> lines)
      - FULL body demoted: C:/Users/vladm/AppData/Local/hermes/.../debateai-kanban-heartbeat-review-loop/SKILL.md (990 -> <n> lines)
  - acceptance evidence: C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md
      (V interactions=<n<=3>; planning wall-clock delta=<-x%>; void-polling incidents=<0 | tripped+escalated-correctly>)
  - preserved-law check: Task 6.1 transplant grep-table all-green (14/14)
  - proposed commit message: "graph-harness migration: typed state, convergence caps, planning/review diamonds, worktrees, full-mode default (Phases 1-6)"
  - smallest yes/no: "Approve the final push? yes/no"
  - on YES, Hermes runs exactly:
      cd C:/Users/vladm/Desktop/debate/DebateV2
      git add -A
      git commit -m "<proposed commit message>"
      git push origin lane/roadmap-p0-p3
  - on NO: hold; migration stays local/uncommitted; no further action
  ```
- [ ] Wait for V's explicit `yes` (a per-action, per-session approval; no prior approval generalizes to this push).
- [ ] Only on `yes`: run the exact commit + push commands above. Do not force-push; do not touch any other branch.
- [ ] Record the resulting commit SHA and push confirmation back into the acceptance evidence artifact.

**Verify (after V yes + push):**
- `cd "C:/Users/vladm/Desktop/debate/DebateV2" && git log --oneline -1` → expected: the migration commit line
- `cd "C:/Users/vladm/Desktop/debate/DebateV2" && git status -sb` → expected: `## lane/roadmap-p0-p3...origin/lane/roadmap-p0-p3` with no `ahead` count (in sync after push)
- `grep -c "FINAL PUSH APPROVAL REQUEST" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-final-push-approval-request.md"` → expected `>=1`
- `grep -c "Approve the final push? yes/no" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-final-push-approval-request.md"` → expected `>=1`

**Acceptance:**
- [ ] The approval-request packet exists, enumerates the repo commit scope AND the out-of-repo doc changes AND the 6.4 evidence AND the preserved-law check, and asks one smallest yes/no.
- [ ] No commit or push happened before V's explicit `yes`.
- [ ] On `yes`, exactly one commit was pushed to `origin lane/roadmap-p0-p3` with no force-push and no other branch touched.
- [ ] The commit SHA and push confirmation are recorded in the acceptance evidence artifact.

---

### Task 6.6: POST-PUSH PRUNE REQUEST — present the prune packet (nothing deleted before V approves each item)

**Files:**
- Create: `C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-prune-request.md` (the prune-request packet, durable + grep-able)

**Risk tier:** high (packages destructive git/filesystem operations — worktree removal, snapshot deletion, reference moves, rogue-skill deletion — each on the immutable high-risk floor; every item is individually V-gated)

**Review gate:** (per proportional law) high → full ladder + V. Hermes-Verifier confirms each receipt is accurate before the packet reaches V; V approves each item independently. Per V ruling #4, **Claude** composes and presents this packet.

**Ticket contract (Kanban-ready):**
```text
Assigned agent: Claude composes and posts the prune packet (V ruling #4); Hermes routes; V approves each item independently
Allowed to edit: C:\Users\vladm\Desktop\debate\DebateV2\.hermes\prompts\graph-harness-prune-request.md
Forbidden: executing ANY prune item (no rm, no git worktree remove, no git mv, no rogue-skill deletion) before V's explicit per-item yes; nothing is deleted in this phase without that approval
Verification: the exact commands in the Verify block below
Human review required: yes
```

**Steps:**
- [ ] Confirm 6.5 push is confirmed (commit pushed, working tree in sync). If not, STOP — prune is post-final-push only (V ruling #4).
- [ ] Gather per-item receipts with live commands (do NOT execute any destructive action):
  - `cd "C:/Users/vladm/Desktop/debate/DebateV2" && git worktree list` (confirm the skill-dev worktree still present)
  - `cd "C:/Users/vladm/Desktop/debate/DebateV2" && git branch --merged` (prove `hermes/heartbeat-skill-dev-20260710-170226` is merged into the current integration target; if NOT listed, record "NOT merged — do not remove" instead of claiming merged)
  - `du -sh "C:/Users/vladm/Desktop/debate/ts-t1-proof"` (snapshot size)
  - check whether the new Claude application skill (V ruling #1) has landed; Item 4 is INCLUDED only if it has
- [ ] Write the prune-request packet to the Create path using exactly this format:
  ```text
  GRAPH-HARNESS PRUNE REQUEST (post final-push; V ruling #4)
  Nothing below is executed until V approves that exact item. Each item is separate.

  Item 1 — remove the merged skill-dev worktree
  - target: C:/Users/vladm/Desktop/debate/DebateV2-skill-dev-20260710-170226
  - receipt: worktree present (git worktree list); branch hermes/heartbeat-skill-dev-20260710-170226 @ 420d8be
  - merged proof: <paste git branch --merged line showing the branch merged | or "NOT merged — hold">
  - reversibility: removes the worktree dir only; branch ref retained; low risk
  - command on approval: git worktree remove "C:/Users/vladm/Desktop/debate/DebateV2-skill-dev-20260710-170226"
  - smallest yes/no: remove this worktree? yes/no

  Item 2 — dispose the ts-t1-proof snapshot
  - target: C:/Users/vladm/Desktop/debate/ts-t1-proof
  - receipt: disposable proof snapshot; size <du -sh>; not referenced by the repo
  - reversibility: destructive delete (V-gated)
  - command on approval: rm -rf "C:/Users/vladm/Desktop/debate/ts-t1-proof"
  - smallest yes/no: delete this snapshot? yes/no

  Item 3 — reference-archive moves (Phase 3 tiering, deferred to here)
  - scope: ~90 dated single-incident postmortems out of the Lite(29)+FULL(106) reference pool
  - receipt: attach the kept-vs-archived index (~14-18 reusable procedures kept; rest -> references/archive/)
  - reversibility: MOVE (git mv), not delete; fully reversible
  - command on approval: git mv <ref> <skill>/references/archive/<ref>  (per listed file)
  - smallest yes/no: perform the archive moves? yes/no

  Item 4 — rogue session-root Claude skill (CONDITIONAL, V ruling #1)
  - target: C:/Users/vladm/Desktop/debate/.claude/skills/heartbeat-protocol/SKILL.md
  - precondition: INCLUDE this item ONLY if the new Claude application skill has landed; otherwise OMIT it (ruling #1: retire the moment the replacement lands)
  - receipt: <replacement skill path + landing evidence, or "replacement not landed — item omitted">
  - reversibility: destructive delete of the rogue file (V-gated)
  - command on approval: rm "C:/Users/vladm/Desktop/debate/.claude/skills/heartbeat-protocol/SKILL.md"
  - smallest yes/no: retire the rogue skill now? yes/no
  ```
- [ ] Post the packet to V (via Kanban comment / chat). Wait for explicit per-item `yes`. Execute only the items V approves, each with its exact command; leave unapproved items in place. Do NOT batch-execute on a single blanket yes.

**Verify (packet presented; NOTHING deleted yet):**
- `test -f "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-prune-request.md" && echo OK` → expected `OK`
- `grep -c "PRUNE REQUEST" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-prune-request.md"` → expected `>=1`
- `grep -c "smallest yes/no:" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-prune-request.md"` → expected `>=3` (one per item; 4 if the conditional item is included)
- `grep -c "receipt:" "C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-prune-request.md"` → expected `>=3`
- Prove nothing was deleted pre-approval: `cd "C:/Users/vladm/Desktop/debate/DebateV2" && git worktree list | grep -c "DebateV2-skill-dev-20260710-170226"` → expected `1` (still present); and `test -d "C:/Users/vladm/Desktop/debate/ts-t1-proof" && echo STILL_PRESENT` → expected `STILL_PRESENT`

**Acceptance:**
- [ ] The prune packet exists with a separate, receipt-backed, individually yes/no-gated row per item (worktree remove, ts-t1-proof disposal, reference-archive moves, and — only if the new Claude skill landed — rogue-skill deletion).
- [ ] Item 1's receipt includes a real `git branch --merged` proof (or an explicit "NOT merged — hold").
- [ ] At packet-presentation time, nothing has been deleted, removed, or moved: the skill-dev worktree and `ts-t1-proof` are both still present.
- [ ] Each item is executed only on its own explicit V `yes`; there is no blanket batch deletion.

## Appendices

> **Status:** Reference material. These appendices are the normative data the Phase 1–6 tasks install and verify. They contain no standalone tasks; every row names the exact Phase task (`Phase <p>.<n>`) that installs it, so a task and its appendix row are cross-checkable. Task numbering used here: Phase 1 = 1.1–1.6, Phase 2 = 2.1–2.5, Phase 3 = 3.1–3.12, Phase 4 = 4.1–4.6, Phase 5 = 5.1–5.5, Phase 6 = 6.1–6.6.

**File legend (used by every appendix below):**

| Short name | Exact path | Git status |
|---|---|---|
| spine / graph-spine | `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\debateai-heartbeat-protocol.md` | tracked (`DebateV2\.git`) |
| (note) | Task 3.1 restructures this SAME file **in place** (title becomes "DebateAI Graph Spine v2"); the filename does NOT change and **no `debateai-graph-spine.md` file is created**. Wherever an appendix Verify command writes `<graph-spine>` or `<spine>`, both mean this one file. | — |
| codex-adapter | `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\codex-heartbeat-adapter.md` | tracked |
| claude-adapter | `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\claude-heartbeat-adapter.md` | tracked |
| grok-adapter | `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\docs\agent-protocols\grok-heartbeat-adapter.md` | tracked |
| AGENTS.md | `C:\Users\vladm\Desktop\debate\DebateV2\apps\dialectical-engine\AGENTS.md` | tracked |
| LITE | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol-lite\SKILL.md` | **out-of-repo** |
| FULL | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\debateai-kanban-heartbeat-review-loop\SKILL.md` | **out-of-repo** |
| alias | `C:\Users\vladm\AppData\Local\hermes\skills\software-development\heartbeat-protocol\SKILL.md` | **out-of-repo** |
| rogue | `C:\Users\vladm\Desktop\debate\.claude\skills\heartbeat-protocol\SKILL.md` | **out-of-repo** (above `DebateV2\.git`) |

---

### Appendix A — Canonical ticket-state block

This is the single canonical state object of §3.1, fully written out. It is installed by **Task 2.1** as native Kanban fields if the board supports them, otherwise as the FIRST comment on each ticket, updated by whole-block replacement (never smeared across the thread). Every field name is drawn verbatim from the canonical vocabulary — no synonyms are legal anywhere in the protocol family.

```yaml
state:
  ticket: <id>                                 # Kanban card id this block belongs to; immutable key
  risk_tier: low | medium | high               # set ONCE at intake/H6 (Task 2.3); drives review routing deterministically; immutable high-risk floor (Task 2.3) can never be tiered down
  planning_tier: 0 | 1 | 2                      # ADDITIVE (Task 4.2): planning-chain depth (0 docs/mechanical, 1 routine feature, 2 architecture/high-risk); set once at H0; DISTINCT from risk_tier (review path) — never conflate the two
  status: >-                                    # single lifecycle enum; replaces the 11-meaning 'blocked' (Task 2.2)
    queued                                      #   ticketized, not yet released to a worker
    | ready                                     #   released; may be new work OR a returned rework (read comments before acting)
    | working                                   #   claimed; owner is actively editing/authoring
    | waiting_review                            #   awaiting independent peer/diverse-lens reviewer
    | waiting_hermes                            #   awaiting Hermes-Verifier gate
    | waiting_product_proof                     #   awaiting live app/API/DB/browser product-truth evidence
    | waiting_human                             #   awaiting V verdict (routed via V DECISIONS PACKET)
    | waiting_dependency                        #   blocked on a parent ticket not yet Done
    | waiting_resource                          #   blocked on the max_concurrent_heavy semaphore or a busy lane
    | failed_tooling                            #   CLI/tool/session failure, not a content defect
    | changes_requested                         #   returned to owner with findings; increments rework_round
    | done                                      #   Claude-Router recorded HERMES DONE
    | archived                                  #   superseded/retired; excluded from routing
  owner:
    agent: codex | claude | grok               # assigned worker identity; Codex is sole coding worker under current law
    session: <id>                              # sticky CLI/session id; rework returns here (WORKER CONTINUITY OVERRIDE required to change)
  contract:                                    # the existing per-ticket file contract, unchanged (blueprint §1.3.3)
    allowed: [ <paths> ]                       # files this ticket may edit
    readonly: [ <paths> ]                      # files it may read but not write
    forbidden: all_others                      # everything not listed in allowed is forbidden
    verification: [ <exact check commands> ]   # commands that must pass; run and recorded with real output
    human_review: yes | no                     # whether V acceptance is mandatory for this ticket
  worktree:                                    # promoted from planning skill to universal lane mechanism (Phase 5)
    path: <.worktrees/lane-x>                  # isolated `git worktree add` directory (NOT the shared workdir)
    branch: <b>                                # branch checked out in that worktree
    merge_status: none | pending | merged      # integration-node state; 'merged' only after closure-gate worktree check
  authority_epoch: <int>                       # monotonic; V/cockpit-only writes; compare-before-write / fresh-read-before-mutate (KEEP AS-IS from LITE)
  rework_round: <int>                          # NEW convergence counter; +1 on every CHANGES REQUESTED of any kind; cap = 3 (Task 1.1)
  wakes_since_transition: <int>                # NEW chatter counter; +1 per router wake with no status/epoch transition; breaker at 24 (Task 1.3)
  waiting_since: <timestamp>                   # NEW; every waiting_* status carries it; feeds the >4h V-packet flush and staleness checks
  escalation_target: hermes | v_packet         # NEW; every waiting_* status carries it; where this wait escalates when a bound trips
  self_unblock_enabled: false                  # ADDITIVE (Task 3.11): V-toggled worker-self-unblock capability; default false; only V flips it true per-ticket; the Codex self-unblock exception exists ONLY when this is true
  comments_read_through: <cursor>              # latest comment id/timestamp the current actor has read; recorded at every boundary
```

**Verify (run by Task 2.1):** `grep -c "risk_tier\|wakes_since_transition\|escalation_target\|waiting_since" <spine>` → expected `>=4` after Phase 2 installs the schema into the spine.

---

### Appendix B — Marker vocabulary union table

Every spine marker plus every new/transplanted marker, with producer, consumer, the Phase task that makes it normative in the migrated protocol, and what it replaces. "Emitted by" is the authorized producer; a marker written by any other role is invalid. Read against spine §"Required comment templates"/§"Logical review state machine" and LITE §"Required Handoff Markers".

| Marker | Emitted by | Consumed by | Phase introduced | Replaces / supersedes |
|---|---|---|---|---|
| WORKER CLAIM | assigned worker (codex/claude/grok) | Claude-Router, reviewers | existing (spine); carried into graph-spine at Task 3.1 | — |
| CODEX/CLAUDE/GROK HEARTBEAT | worker/reviewer | Claude-Router (liveness), watcher | existing (spine); Task 3.1 | `state:` field enum replaces free-text heartbeat state (Task 2.2) |
| READY FOR PEER REVIEW | first-pass worker | peer reviewer, Claude-Router | existing (spine); Task 3.1 | — |
| PEER REVIEW CHANGES REQUESTED | peer reviewer | same worker/session, rework_round counter | existing (spine); +REWORK ROUND at Task 1.1 | — (kept; now increments rework_round) |
| PEER REVIEW APPROVED | peer reviewer | Hermes-Verifier | existing (spine); Task 3.1 | kept as a SEPARATE marker (§6.4 reconcile) — not merged into Hermes markers |
| READY FOR HERMES REVIEW | peer reviewer (advances first-pass work) | Hermes-Verifier | existing (spine); Task 3.1 | — |
| HERMES CHANGES REQUESTED | Hermes-Verifier | same worker/session | existing (spine); +REWORK ROUND at Task 1.1 | — (now carries `REWORK ROUND: n of 3`) |
| REWORK ACKNOWLEDGED | worker | Hermes | existing (spine); Task 3.1 | — |
| REWORK READY FOR HERMES REVIEW | worker | Hermes-Verifier | existing (spine); Task 3.1 | — |
| READY FOR HUMAN REVIEW | Hermes | V | existing (spine); folded into packet at Task 1.4 | becomes a ROW inside V DECISIONS PACKET |
| V MANUAL QA PACKET | Hermes | V | existing (spine); batched at Task 1.4 | batched into V DECISIONS PACKET rows |
| HUMAN REVIEW PASSED | Hermes (records V verdict) | Hermes-Verifier → HERMES DONE | existing (spine); Task 3.1 | — |
| HUMAN REVIEW CHANGES REQUESTED | Hermes (records V verdict) | same worker/session | existing (spine); +REWORK ROUND at Task 1.1 | — (now increments rework_round) |
| CODEX/CLAUDE/GROK BLOCKED | worker | Claude-Router | existing (spine); Task 3.1 | blocker-type enum → `waiting_*` status vocabulary (Task 2.2) |
| WORKER CONTINUITY OVERRIDE | Hermes | replacement worker, board | existing (spine); Task 3.1 | — |
| RESEARCH HANDOFF COMPLETE | Grok (G1) | Hermes stage gate | existing (spine); Task 3.1 | — |
| READY FOR HERMES STAGE REVIEW | stage owner (Steps C2/G3/C4/G5) | Hermes-Verifier | existing (spine); Task 3.1 | — |
| HERMES STAGE REVIEW PASS | Hermes-Verifier | Claude-Router, next stage | existing (spine); Task 3.1 | — |
| HERMES STAGE REVIEW CHANGES REQUESTED | Hermes-Verifier | same stage session | existing (spine); +REWORK ROUND at Task 1.1 | — (now increments rework_round) |
| HERMES STEP 6 SELF-AUDIT PASS | Hermes | Claude-Router | existing (spine); extended at Task 2.3 / 4.5 | self-audit now verifies `risk_tier` persisted + review-path-matches-tier |
| CLAUDE/GROK/CODEX COMPACTION CHECKPOINT | worker/reviewer | Hermes | existing (spine); scoped at Task 3.1 | kept for PTY transports; marked N/A for SDK-subagent transports |
| COMPACTION BLOCKED | worker | Hermes | existing (spine); Task 3.1 | — |
| LIVE MONITORING ACTIVE | Hermes | workers/reviewers | existing (spine); Task 3.1 | — (live-output channel law transplanted from FULL, Task 3.1) |
| HERMES DONE | Hermes-Verifier (sole Done authority) | board, worker | existing (LITE); unified into graph-spine at Task 3.1 | same-cycle Done handshake preserved (KEEP AS-IS); verdict marker (§5.2/§8), never Claude-Router (R1) |
| HERMES BLOCKED | Hermes-Verifier | board, V DECISIONS PACKET | existing (LITE); unified at Task 3.1 | pairs with `HERMES BLOCKED — IMPORTANT OPERATION` park; verdict marker (§5.2/§8), never Claude-Router (R1) |
| HERMES AUTHORIZED NEXT | Claude-Router | single Codex worker | existing (LITE); scoped at Task 1.5 | now required ONLY on a new risk signal after a ROUTE batch (§3.4.6) |
| HERMES AUTHORIZED ROUTE | Claude-Router | multiple workers along an H6-approved DAG | **NEW — Task 1.5** | supersedes per-node HERMES AUTHORIZED NEXT for pre-approved chains |
| V DECISIONS PACKET | Claude-Router | V | **NEW — Task 1.4** | repeals One-Prompt-at-a-Time Relay Law for decisions; absorbs READY FOR HUMAN REVIEW + V MANUAL QA rows |
| V STEERING REQUIRED | REQUIREMENTS/ARCHITECTURE design nodes (direct, design-time only, per the One-Prompt Machine law); Claude-Router / any node at a cap (via packet) | V | **NEW — Task 1.1** | emitted at rework_round=3, chatter-breaker trip, or 3rd unblock attempt |
| AUTHORITY EPOCH | Claude-Router / V (cockpit-only, monotonic); enforced by Hermes-Verifier on board writes | all nodes (compare-before-write) | existing (LITE); persisted as `authority_epoch` field at Task 2.1 | KEEP AS-IS from LITE; monotonic authority mechanism |
| HERMES LIVENESS REQUESTED | Claude-Router | worker/session (once per stale transition) | existing (LITE); wired to breaker at Task 1.2 | emitted once on first stale transition; no per-minute repeats |
| REWORK ROUND | whoever requests changes (peer/Hermes/human) — inside the CHANGES REQUESTED body | rework_round counter, Claude-Router | **NEW — Task 1.1** | new field-bearing marker; at `n of 3` triggers V STEERING REQUIRED |
| READY FOR EXTERNAL REVIEW | worker | external reviewer (e.g. external GPT) | existing (LITE); union-added to spine at Task 3.1 | — (union vocabulary) |
| EXTERNAL REVIEW PASSED \| CHANGES REQUESTED | external reviewer | Hermes-Verifier | existing (LITE); union-added at Task 3.1 | CHANGES REQUESTED increments rework_round (Task 1.1) |
| GOAL BLOCKED | worker/goal loop | Hermes wake gate | existing (LITE); wired edge-triggered at Task 1.3 | treated edge-triggered, never level-triggered; feeds chatter/wake gate |
| SILENT / NOOP / GOAL WAITING — DORMANT | watcher / goal loop | wake gate (suppresses model review) | existing (LITE); Task 1.3 | FULL's `[SILENT]` sentinel demoted to fallback tier (§6.4) |
| REQUIREMENTS SATISFIED | REQUIREMENTS loop owner (H0 node) — loop-owner only | Claude-Router + Hermes-Verifier (at mission closure) | **NEW — Task 4.6** | Grand Loop stop condition (ruling R6); PROGRAMMING/QA completion alone never closes a mission |
| ARCHITECTURE SATISFIED | ARCHITECTURE loop owner (planning diamond) — loop-owner only | Claude-Router + Hermes-Verifier (at mission closure) | **NEW — Task 4.6** | Grand Loop stop condition (ruling R6); pairs with REQUIREMENTS SATISFIED |

**Verify (run by Task 3.1):** `grep -c "HERMES AUTHORIZED ROUTE\|V DECISIONS PACKET\|V STEERING REQUIRED\|REWORK ROUND\|READY FOR EXTERNAL REVIEW" <graph-spine>` → expected `>=5`.

---

### Appendix C — Transplant-law index (blueprint §6.4)

Every law named in blueprint §6.4, its best-formulation source file, the exact Phase task that installs it, and the verdict. Verdict vocabulary: **KEEP AS-IS** (moved verbatim, never weakened), **PARAMETRIZE** (kept but a hardware/policy specific becomes a named parameter or field), **MERGE** (reconciled with a conflicting formulation into one rule), **RETIRE** (removed as a standalone rule; its substance survives elsewhere or is repealed).

#### C.1 Universal, zero-contradiction

| Law | Best-formulation source | Destination task | Verdict |
|---|---|---|---|
| Independent review / no-self-Done / reviewer-never-edits | spine §"Independent reviewer gate" / §"Universal safety rules" | Task 3.1 (preserved-laws §1.3 verbatim) | KEEP AS-IS |
| RED→GREEN→REFACTOR evidence, explicit-waiver-only escape | spine §"Universal safety rules" | Task 3.1 | KEEP AS-IS |
| File contracts + one-writer-per-file | spine §"Parallelism and file ownership" | Task 3.1 (state `contract{}`, Task 2.1) | KEEP AS-IS |
| Sticky session ownership + WORKER CONTINUITY OVERRIDE | spine §"Ticket ownership and continuity" | Task 3.1 (`owner{}`, Task 2.1) | KEEP AS-IS |
| Product-truth gate + V MANUAL QA PACKET | spine §"Hermes gate" / §"READY FOR HUMAN REVIEW" | Task 3.1; batched at Task 1.4 | KEEP AS-IS |
| Failed-test ticket fanout diamond | FULL (diamond template) | Task 3.1 (documented); wired at Task 4.3 | KEEP AS-IS |
| Sibling-lanes-by-default + one closure gate | FULL / spine §"Parallelism" | Task 3.1; worktrees at Task 5.1 / closure gate Task 5.3 | KEEP AS-IS |
| Self-blocking prevention ("local friction is not a goal blocker") | spine §"Blocked format" | Task 3.1 | KEEP AS-IS |
| Same-cycle HERMES DONE handshake | LITE §"Required Handoff Markers" | Task 3.1 | KEEP AS-IS |
| Hermes 4-way same-cycle Triage disposition | FULL / LITE | Task 3.2 (state applicability vs peer-review-first) | KEEP AS-IS (reconciled at 3.2) |

#### C.2 From Lite — transplant as universal law

| Law | Best-formulation source | Destination task | Verdict |
|---|---|---|---|
| AUTHORITY EPOCH (monotonic, V/cockpit-only) | LITE L51 | Task 2.1 (`authority_epoch` field) + Task 3.1 | KEEP AS-IS |
| compare-before-write / abort-stale-write | LITE | Task 3.1 | KEEP AS-IS |
| wakeAgent tokenless change gate | LITE L436 | Task 1.3 (fingerprint fix) + Task 3.11(h) (`[SILENT]` demotion) | MERGE (FULL's `[SILENT]` sentinel demoted to a fallback tier below the wakeAgent gate) |
| Edge-triggered GOAL BLOCKED | LITE L113 | Task 1.2 (chatter breaker) / Task 3.1 | KEEP AS-IS |
| needs_input / block-loop circuit breaker | LITE | Task 1.2 (generalized chatter breaker) | PARAMETRIZE (off native-tool specifics; thresholds → Appendix D) |
| IMPORTANT OPERATIONS enumeration | LITE L623 | **Task 3.11(a)** (replaces the spine's vague "V should only be interrupted for …" sentence in `## Operating model`) | MERGE (Lite's precise list wins) |
| Cockpit legibility DONE/RUNNING/BLOCKED/V ACTION format | LITE | **Task 3.11(b)** (installed under `## Hermes cockpit responsibilities`) | KEEP AS-IS |
| Kanban visual-launch three-layer receipt | LITE L661–662 | **Task 3.11(c)** | KEEP AS-IS |
| Zenith-principles-vs-runtime as a risk dial | LITE | **Task 3.11(d)** (§5.4, keyed on `risk_tier`) | PARAMETRIZE (principles-only for ordinary work; real chamber for high-risk) |

#### C.3 From FULL — transplant into spine / node contracts

| Law | Best-formulation source | Destination task | Verdict |
|---|---|---|---|
| Worktree split→verify→merge + integrate-before-closure checklist line | FULL | Task 5.1 (split→verify→merge checklist) + Task 5.3 (integration node + mandatory closure-gate line) | KEEP AS-IS (promoted from planning skill to spine) |
| Numbered-stage gates, non-delegable Hermes review | FULL / spine §"Binding Hermes numbered-stage review gates" | Task 3.1 (§7 skeleton) + Task 4.1 (planning diamond, §7) + Task 4.2 (planning tiers, §5.5) | MERGE (serial double-gate → parallel diamond; gate authority unchanged) |
| Batch/wave re-list-before-finalizing | FULL | **Task 3.11(e)** (§10 batched-approval law) | KEEP AS-IS |
| Dirty-worktree / pre-existing-dirt attribution | FULL | **Task 5.3** (`### Dirty-worktree / pre-existing-dirt attribution` under the integration/closure section) | KEEP AS-IS |
| Architecture-boundary stop-and-route trigger-word list | FULL | **Task 3.11(f)** installs the enumerated trigger list (§7); Task 4.4 wires the ARCH→REQ / QA→ARCH edges that consume it | KEEP AS-IS |
| Live-output channel law | FULL / spine §"V-visible live-output channel" | Task 3.1 (carried forward verbatim) | KEEP AS-IS |
| Main-thread-orchestrator / never-writer subagent law | FULL (converges with rogue's three-layer structure) | **Task 3.11(g)** | MERGE (one law, two transports: PTY and SDK-subagent) |

#### C.4 Reconcile during Phase 3 (contradictions the merge must resolve)

| Contradiction | Best-formulation source(s) | Destination task | Verdict |
|---|---|---|---|
| Triage-direct vs peer-review-first (two "binding" review docs) | FULL vs LITE/spine | Task 3.4 (§9 review-lane applicability rule + pointers in both FULL refs) | MERGE (one rule + explicit applicability conditions) |
| Marker vocabulary union | spine + LITE | Task 3.5 (§8 marker union; installed per Appendix B) | MERGE (HERMES DONE/BLOCKED, AUTHORIZED NEXT/ROUTE, EXTERNAL REVIEW added; PEER REVIEW APPROVED kept separate) |
| Stage numbering (two schemes) | spine H0–H9 vs adapters | Task 3.5 (§6 stage numbering) + Task 4.5 (`H6A` sub-stage) | MERGE (unify on H0,G1,H1,C2,H2,G3,H3,C4,H4,G5,H5,H6,A7,C8,H9; `H6A` sub-stage of `H6`) |
| Watcher cadence self-contradiction (1-min vs 3–5-min) | FULL | **Task 3.11(k)** (recorded on the §10 wake-gate law) | RETIRE (cadence irrelevant once unchanged ticks are tokenless) |
| Codex worker-self-unblock exception | FULL | **Task 3.11(i)** (`self_unblock_enabled: false` V-toggled field in the §2 state block) | PARAMETRIZE (explicit field, default off) |
| Compaction checkpoints (transport-dependent) | spine §"Binding post-dialogue checkpoint compaction" | **Task 3.11(j)** (PTY-only; N/A for SDK-subagents) | PARAMETRIZE (kept for PTY; marked N/A for SDK-subagent) |

#### C.5 Instance-level dispositions (from §6.2 / §6.3.1, for completeness)

| Item | Source | Destination task | Verdict |
|---|---|---|---|
| Lite as a standalone protocol document | LITE | Task 6.1 (full-mode default; Lite kept only as degraded-hardware fallback note) | RETIRE (as protocol; every Lite-only law transplanted per C.2) |
| FULL body (`debateai-kanban-heartbeat-review-loop`) | FULL | Task 3.7 (alias → thin loader over the spine) + Task 6.2 (FULL body demoted to loader + Hermes ops notes) + Task 3.9 (reference tiering index only) | MERGE→DEMOTED (alias becomes thin loader → spine + Hermes node contract) |
| Session-root rogue Claude skill | rogue | Task 3.8 (retire per V ruling §6.3.1.1) | RETIRE (do not invoke until replacement skill lands) |

#### C.6 V rulings installed as spine law (post-blueprint additions)

| Law | Ruled | Installed by | Enforced by |
|---|---|---|---|
| The One-Prompt Machine law: one V prompt starts a mission (H0); thereafter only three V-facing surfaces exist: design questions from the REQUIREMENTS/ARCHITECTURE nodes only, IMPORTANT-OPERATION decisions via the batched V DECISIONS PACKET, and final acceptance (H9); V never relays; Claude-Router intercepts any other V-facing message | 2026-07-24 | Task 3.11(l) (spine `## Operating model` closing subsection) | Task 6.3 (full-mode default + V touchpoints), Task 4.4 (feedback edges route design questions to REQ/ARCH surfaces) |
| Reporting & traceability law (R8): ticket trace invariant (no trace, no Done); cockpit receipts per board-mutation batch; append-only mission/phase reports at `.hermes/reports/<mission>/` referenced by the R6 SATISFIED markers; loop convergence-counter reports; incomplete/fabricated report chains fail acceptance | 2026-07-24 | Task 4.7 (spine `## Reporting and traceability law` section) | Execution-contract phase-gate step 1 (durable phase reports); Task 6.4 (report-chain falsification check); Task 4.6 (closure-report-gated SATISFIED markers) |
| TDD + DDD + worker-persistence laws (preserved-law repair after V's preservation check found 0 spine occurrences of TDD-as-law, DDD, and the three-attempts discipline while R5 makes TDD/DDD violations falsifying) | 2026-07-24 | Task 4.8 (spine `## TDD, DDD, and worker-persistence laws` section; blueprint §1.3 laws 16-18) | Task 6.4 falsification checklist (TDD/DDD row now references installed law); H2 gate DDD-impact check |
| R1 — Main Orchestrator = Claude (Fable), the Claude-Router seat (launches everything, routes everything, runs the One-Prompt Machine); Hermes keeps board custody as Hermes-Verifier (verification + Kanban board custody/crafting + Manual QA); Router and Verifier sit in different model families | 2026-07-24 | Tasks 3.7 (Hermes = Verifier + board custody), 3.8 (Claude = Main Orchestrator), 6.3 (Claude named launcher); global router-token rename to `Claude-Router` | Task 6.3 (full-mode V touchpoints), spine §5 Routers, every task's Assigned-agent line |
| R3 — Orchestrator outage fallback: if the Claude (Main Orchestrator) session is down, the Architecture-responsible agent communicates directly with the humans; legal because ARCHITECTURE already holds design-question authority (no new V-facing surface) | 2026-07-24 | Task 6.3 (spine `## Orchestrator outage fallback (ruling R3)` section) | Task 6.3; spine `## Operating model` design-question surface (a) |
| R4 — Coding law parametrized as the versioned model-law roster (config/state, never hard-coded prose); only V edits it; agents read it as state; no protocol document hard-codes an agent identity outside it; roster changes are IMPORTANT OPERATIONS | 2026-07-24 | Task 3.12 (spine `## Binding stage and coding law` roster block + law) | Task 3.12 roster law; Claude node contract (worker assignment per roster); all coding-agent references |
| R5 — Falsification criteria: scaffolded data, fake test runs, test cheating, TDD/DDD violations, do-what's-forbidden, skip-what's-required, chain-of-command violations, unauthorized-loop questions to humans — any single occurrence FAILS a pilot/mission | 2026-07-24 | Task 6.4 (acceptance-run falsification checklist) | Task 6.4 acceptance (independent reviewer checks each item against durable Kanban/log evidence) |
| R6 — The Four Loops (REQUIREMENTS ENGINEERING, ARCHITECTURE, PROGRAMMING, QA) and the Grand Loop: a mission closes ONLY when REQUIREMENTS SATISFIED and ARCHITECTURE SATISFIED are both present and all existing gates pass; PROG/QA completion alone never closes a mission | 2026-07-24 | Task 4.6 (spine §7 Four Loops + Grand Loop subsection; §8 loop-owner markers) | Task 4.6 Grand Loop termination law; §11 law 10 product-truth gate; H9 final acceptance |

**Verify (run by Task 3.1):** `grep -c "PRESERVED\|KEEP AS-IS\|§1.3" <graph-spine>` → expected `>=1`, confirming the preserved-laws block is present verbatim.

---

### Appendix D — Thresholds table

Every numeric cap and named parameter in one place, with the one-line rationale and the Phase task that sets it. Convergence caps never override a safety gate — a tripped cap freezes and escalates; it never auto-approves (blueprint §5).

| Threshold / parameter | Value | Set by | Rationale |
|---|---|---|---|
| `rework_round` cap | 3 | Task 1.1 | Bounds revise→re-review; at `3 of 3` the loop freezes and emits V STEERING REQUIRED — no unbounded rework |
| Chatter breaker — comment exchanges | 6 exchanges on one card with no status/epoch transition | Task 1.2 | Catches non-resolving two-party loops (the Hermes↔GPT void loop); generalizes the human-block circuit breaker |
| Chatter breaker — router wakes | 24 wakes with no status/epoch transition | Task 1.2 / Task 1.3 | Second trip condition; implemented by `wakes_since_transition`; freezes + escalates |
| `unblock` reset ceiling | 2 per ticket | Task 1.6 | Caps counter resets; the 3rd occurrence freezes + escalates (previously unbounded by design) |
| V DECISIONS PACKET flush — pending count | ≥ 3 pending decisions | Task 1.4 | Consolidates V-owned gates into one packet instead of drip-feeding prompts |
| V DECISIONS PACKET flush — age | any decision pending > 4h | Task 1.4 | Time-bounds a stuck decision (uses `waiting_since`) |
| V DECISIONS PACKET flush — lane freeze | any lane frozen on a pending decision | Task 1.4 | A frozen lane forces an immediate flush regardless of count/age |
| V DECISIONS PACKET flush — on demand | V asks | Task 1.4 | V can pull the packet at will |
| `max_concurrent_heavy` | 1 (laptop); raise on stronger machine | Task 5.2 | Single semaphore schedules heavy commands; replaces duplicated "one heavy command" prose in ≥4 docs (spine + codex adapter + LITE×6); no protocol rewrite to scale |
| Ready-queue size | deliberately small (H6 self-audit gate) | Task 2.3 / existing spine | Prevents over-release; qualitative, enforced by H6 self-audit |
| Phase 4 acceptance target (not a cap) | Tier-1 planning wall-clock drops ≥ 30% vs serial chain | Phase 4 acceptance | Confirms the plan diamond actually parallelizes |
| Phase 6 acceptance target (not a cap) | Tier-1 mission completes with ≤ 3 V interactions | Phase 6 acceptance | Confirms V-as-transport is retired |

**Verify (run by Task 1.1–1.6):** `grep -c "3 of 3\|rework_round\|max_concurrent_heavy\|> ?4h\|reset ceiling" <spine>` → expected `>=3` after Phase 1 lands the convergence caps.

---

### Appendix E — Rollback note per phase

The git boundary is `DebateV2\.git`. All spine/adapter/AGENTS.md/graph-spine/vendor-skill edits under `DebateV2\` are one git-revertable unit per phase. The AppData Hermes skills (LITE, FULL, alias) and the session-root rogue skill sit **outside** that repo, so each phase that touches them MUST snapshot a `<file>.pre-phase<p>.bak` copy before the first edit; rollback of those files is a file restore, not a git revert. Land each phase as one squash commit on its own branch so revert is atomic.

| Phase | Commit / branch boundary | In-repo revert (git) | Out-of-repo restore (backup) | Rollback command |
|---|---|---|---|---|
| Phase 1 — stop void-polling | one squash commit `phase-1-stop-void-polling` on branch `graph-harness/phase-1` | spine, codex-adapter | LITE (`SKILL.md.pre-phase1.bak`); Hermes launch-packet template if out-of-repo | `git -C DebateV2 revert <phase-1 sha>` + restore `LITE` from `.pre-phase1.bak` |
| Phase 2 — typed state | one squash commit `phase-2-typed-state` on `graph-harness/phase-2` | spine, codex-adapter, claude-adapter, grok-adapter, AGENTS.md | LITE, FULL (`.pre-phase2.bak`) | `git -C DebateV2 revert <phase-2 sha>` + restore LITE/FULL backups |
| Phase 3 — Graph Spine v2 + node contracts | one squash commit `phase-3-graph-spine` on `graph-harness/phase-3` (includes CREATE graph-spine; symlink→real-file for `.codex`/`.agents`; adapter/skill rewrites) | graph-spine (new), spine (demoted-to-notes), 4 adapters, `.codex`/`.claude`/`.grok`/`.agents` vendor skills | LITE, FULL, alias, rogue (`.pre-phase3.bak`) — rogue is retired (not deleted) at Task 3.8; reference-archive MOVES are deferred (V ruling §6.3.1.4), so no file moves in this commit | `git -C DebateV2 revert <phase-3 sha>` (git-managed symlink restore included) + restore LITE/FULL/alias/rogue backups |
| Phase 4 — diamonds | one squash commit `phase-4-diamonds` on `graph-harness/phase-4` | graph-spine (stage gates), reviewer-prompt templates | LITE, FULL (`.pre-phase4.bak`) | `git -C DebateV2 revert <phase-4 sha>` + restore backups |
| Phase 5 — true worktrees | one squash commit `phase-5-worktrees` on `graph-harness/phase-5` | graph-spine (worktree section + glossary), claude-adapter, grok-adapter, semaphore declaration | launch-packet template if out-of-repo | `git -C DebateV2 revert <phase-5 sha>` + restore backups. Note: real `.worktrees/lane-*` dirs are workspace artifacts, not commits — remove with `git worktree remove` (V-gated) |
| Phase 6 — retire V-as-transport + deferred prune | doc/config edits in one squash commit `phase-6-retire-v-transport` on `graph-harness/phase-6`; **prune is a SEPARATE V-gated commit** | graph-spine / Hermes loader defaults | alias, LITE (`.pre-phase6.bak`) | `git -C DebateV2 revert <phase-6 sha>` + restore backups. Prune commit (`git worktree remove` of skill-dev worktree; ts-t1-proof disposal; reference-archive moves) is reverted/withheld independently and only runs after explicit V prune approval |

**Verify (any phase):** `git -C "C:/Users/vladm/Desktop/debate/DebateV2" log --oneline -1 <branch>` shows exactly one squash commit for the phase, and `ls "<file>.pre-phase<p>.bak"` exists for every out-of-repo file the phase edited.
