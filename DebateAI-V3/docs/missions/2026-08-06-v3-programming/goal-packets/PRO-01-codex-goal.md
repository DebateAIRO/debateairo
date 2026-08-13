# /goal packet — PRO-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_19834503` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok), both must
greenlight. Day mode: questions route UP to the orchestrator, never to V.

Standing law: `CODING-LOOP-PROTOCOL.md`. **Read the ticket's FULL comment
history** (`hermes kanban --board debateai-v3 show t_19834503`) — it carries
V's rulings, the ratified numbers, and two trap warnings posted by approving
diamonds specifically for this ticket. Then read DR-149, DR-154, DR-157 and
DR-159 in `decisions-ledger.md`.

## V's rulings, assembled

- **DR-149:** *"There should always be defenders giving Pro arguments"* and
  *"each node needs its own Pro and Cons."* PRO cards come from REAL defender
  nodes joined by REAL `support` edges — never relabelling. The root question
  card stays NEUTRAL (no stance badge).
- **DR-157:** depth is an ASK-TIME dial, max 5, and **depth is INERT today** —
  `apps/runner/src/index.ts` contains zero occurrences of "depth". THIS TICKET
  OWNS WIRING IT: `depth_params.depth` must govern how far the tree expands.
- **DR-159 (B3-B):** depth counts EXPANSION ROUNDS — `2^(d+1)−1` authored
  nodes. Depth 1 = root position + its PRO + its CON. 3/7/15/31/63 nodes at
  depths 1–5.
- **Ratified ceilings (live in the register now):** 42/66/114/210/402. These
  are retry-tolerant TOTALS counting failed attempts too. Typical healthy
  spend ≈ a third of each.
- **V's ruled test:** a depth-3 debate — 15 authored nodes, expected healthy
  spend ~38, ceiling 114.

## The shape of the work

FAIR-01's critic leg is your pattern (`apps/runner/src/index.ts:456-508`): the
SAME shipped Judge organ at a distinct call site, entering the graph through
the shipped `GraphWriter` as a first-class child with a REAL edge, its own
stranger restatement, reduced judgement, and per-artifact maker lineage.

Build the DEFENDER leg symmetrically (support/`undercutting`-answering edge —
follow S07's shape vocabulary), then drive BOTH legs per node, per expansion
round, until `depth_params.depth` rounds are done: each round expands every
node authored in the previous round with one PRO child and one CON child.

Constraints that bind:
- **Serve stays B2-A** — the serve set remains the one primary root; do NOT
  expand it (that is PANEL-01's question, and V ruled the cheap serve shape
  knowingly). All new nodes still get judged/recorded honestly; they are
  simply not individually served.
- **Maker roster:** both makers exist (OpenAI codex-cli, Anthropic claude-cli
  at alias `opus`). How you alternate makers across the tree is YOURS to
  choose and justify — but per-artifact lineage must record what ACTUALLY ran
  (DR-115), and no maker may grade its own artifact (FX-HR-H6, if you touch
  panel machinery).
- **Envelope honesty:** if a depth's expansion would exceed the resolved
  ceiling mid-run, the run must stop LOUDLY on the typed
  `RUN_COST_ENVELOPE_EXHAUSTED` path — never silently truncate the tree and
  claim completion. If you truncate BY DESIGN (e.g. budget-aware planning),
  that is a V-visible design decision: stop and route it up instead.

## THE TWO TRAP WARNINGS (posted by approving diamonds, aimed at you)

1. **The memory-disclosure segment bypasses the ratified cap** (ENV-01 ADV-1):
   `apps/runner/src/index.ts:789-800` appends a `memory:disclosure` segment
   AFTER `parseComposerOutput` validation, and `packages/serve` has no count
   bound. At `strangerSampleRate >= 1` that makes S=3, so depth-1 spend
   becomes 48 > the ratified 42 — surfacing as a confusing
   `RUN_COST_ENVELOPE_EXHAUSTED` instead of a DR-159-naming failure. YOUR RUNS
   WILL HIT THIS. Fix it honestly (bound the conformed-segment set where the
   ratified number depends on it, or route the disclosure outside conformance
   if that is lawful) — and if neither is lawful without a V ruling, stop
   loudly and route up.
2. **The `onAuthRejected` socket** (POL-01 A-4): threaded through
   `DebateTree.tsx`, `NodeDetailDrawer.tsx`, `ArgumentFocusView.tsx`, never
   invoked, targeting an UNCONDITIONAL token clear. If you wire node actions,
   do NOT call it — delete the chain or route through
   `shouldClearStoredTokenAfterUnlockFailure`.

## Also in force

- The composer cap `.max(2)` naming DR-159 (ENV-01) — your expansion must not
  bypass `parseComposerOutput`.
- UI: the tree view already renders PRO/CON via `childNodeType()` on real
  edges (support→PRO, attack→CON) — if your edges are real, the UI lights up
  with NO adapter change. Verify that claim; if an adapter change IS needed,
  keep it minimal and behavioural-tested.
- Git V-gated · no `next build` into `.next-dev` · DR-115 absolute.

## COST — read this twice

A depth-2 test run spends ~22 REAL calls; depth-3 ~38. V's subscriptions.
Develop against depth 1 (~14 spend) and run ONE depth-2 proof yourself.
**Leave the depth-3 run for V's own test** — do not spend it on iteration.
Say in the handoff exactly how many model calls your work consumed.

## DONE WHEN

`depth_params.depth` demonstrably governs expansion (depth-1 → 3 authored
nodes with real support+attack edges; depth-2 proof run → 7 nodes, pasted REAL
run evidence with per-node maker lineage); ceilings respected with the loud
typed stop proven by test; the memory-segment trap resolved honestly; every
gate green with REAL pasted output EACH (the orchestrator re-runs all);
TDD RED→GREEN; handoff at `handoffs/PRO-01-codex-handoff.md`; progress log
`handoffs/PRO-01-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — PRO-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
