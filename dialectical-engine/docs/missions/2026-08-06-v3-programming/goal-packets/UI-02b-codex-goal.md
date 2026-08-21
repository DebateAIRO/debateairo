# /goal packet — UI-02b (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_35a2b742` · **Assignee:** codex
**Roster (DR-153):** Fable/Opus 5 orchestrates · **Codex implements** · dual
diamond (Opus 5 lens + Grok lens), BOTH must greenlight. Day mode: questions
route UP to the orchestrator, never to V.

Standing law: `CODING-LOOP-PROTOCOL.md` in full. Ledger `decisions-ledger.md`
overrides on conflict — read DR-148 through DR-156, they are the last two days.

## Why this ticket exists — V has asked for it twice

V looked at a genuinely two-maker debate and asked *"this debate was
mono-model?"* — because the UI names the maker **nowhere**. Later: *"I wanna
see which model did what"* and *"the model tags visible once again"*.

The debate V was looking at (`8d2b4e5a`) really did have two houses in it:
`ledger.raw_artifact` decodes to OpenAI ×7 and Anthropic ×1, and the Anthropic
call was not a rubber stamp — it AUTHORED the counter-position node through the
shipped JUDGE organ at call site `JUDGE:critic`. The user could not tell.

## The hard part, stated plainly

**The served contract cannot express this today.** `packages/contract/src/index.ts`
`NodeSchema` is `.strict()` and has NO maker/model field. Neither does
`EdgeSchema`. Neither does `InspectionSchema`. The maker exists ONLY
server-side in `ledger.raw_artifact`, reachable from each node's
`provenance_ref`.

So this is not a mapping the last worker forgot — the API has no way to tell
the browser who wrote a node. **This ticket changes what the API is allowed to
say.** That is why it was split out of UI-02a and given its own review.

## V'S STEER — READ THIS BEFORE DESIGNING ANYTHING

> V, 2026-08-12: *"UI-02b is nice yes. But we already have the code for it
> inside the V2 UI."*

**V is right, and it makes this ticket much smaller than it looks.** Do NOT
design a new maker widget. V2 ALREADY SHIPS a complete model-presentation kit
and every view already renders it:

- `apps/v2-ui/components/ModelPresentation.tsx` — `ModelBadge`,
  `ModelMetaLine`, `modelColor`, `modelColorStyle`, `modelMeta`
- already consumed at `DebateCanvas.tsx:239`, `DebateTree.tsx:178,241`,
  `DebateThread.tsx:126`, `DebateSplit.tsx:67,282`, `DebateMap.tsx:98`,
  `DebateOutline.tsx:36`

Every one of those reads the SAME field: `node.active_generation.model_id`
(`Generation` is declared at `apps/v2-ui/lib/types.ts:10-24` —
`{ id, model_id, role, argument, worker_id, created_at, ... }`).

**And the V3 adapter sets `active_generation: null` on every node**
(`apps/v2-ui/lib/v3/adapter.ts:136-137` and `:196-197`). That single null is
why the entire model-attribution surface V2 already has renders nothing.

**So the UI half of this ticket is: populate the field V2 already reads, from
real recorded lineage.** Do that and badges, colours and meta lines light up
across canvas, tree, thread, split, map and outline at once — which also closes
UI-02a advisory A2 (thread/split/map currently carry no per-node metadata).

Consequences you must respect:
- Fill ONLY what V3 genuinely knows. `Generation` has required fields
  (`role`, `argument`, `worker_id`, `created_at`). If V3 has no honest value
  for one, **you may not invent it** (DR-115/AC-76) — say so and choose the
  lawful shape: either a narrowly-typed projection the V2 components can
  consume, or a typed absence that makes the components render nothing rather
  than something false. Justify the choice in the handoff. Do NOT stuff
  placeholder strings into required fields to make a badge appear.
- Do not restyle or fork the V2 components. They are the design authority
  (DR-145).

## DELIVERS

1. **A contract capability for per-node maker lineage.** `NodeSchema` is
   `.strict()` with no maker field, so the API cannot say this today. Either a
   field on the node or a dedicated inspection resource — **you choose and
   justify it in the handoff**, including the boundary cost (generated types,
   architecture tests, the 27-row dependency-edge table, orphan-audit rows, any
   migration).
2. **The serve path populates it from REAL recorded lineage** — the maker as
   recorded in `ledger.raw_artifact`, never re-derived by guessing from a model
   id string.
3. **Wire it into the field V2 already reads**, per V's steer above, so the
   existing `ModelBadge` / `ModelMetaLine` surfaces light up unchanged.

## Laws that bite hardest here

- **DR-115 (ABSOLUTE).** A node whose maker cannot be resolved shows TYPED
  ABSENCE — never a guessed label, never "unknown model", never `"shim"`. The
  FAIR-02 relay precedent is the standard: it relays the model id the CLI
  ITSELF reported, and refuses loudly on zero-or-several rather than picking.
  Match that discipline.
- **AC-76/DR-039.** No invented labels or identifiers. If a maker string must
  be normalised for display, the normalisation is a decision — state it; do not
  smuggle it.
- **Git is V-gated.** Never commit/push/branch/reset. Working tree only.

## Do not disturb (just landed, dual-approved)

- **UI-02a** shipped per-node scores as PERCENTAGES (DR-154(4)):
  `v3ScorePercentage` in `apps/v2-ui/lib/v3/adapter.ts` — exact values render
  bare (`98%`), rounded values carry `≈` and keep the exact recorded
  probability in the tooltip. A frozen hash pins it. **Do not touch the
  formatter or the absence paths.**
- `adapter.ts` NO LONGER contains raw NUL bytes — they were escaped so the file
  stops being binary to `grep`, and a two-sided ratchet at
  `tests/unit/v2ui-pages.test.ts:203-206` forbids both their return and the
  delimiter's deletion. **Do not reintroduce a raw control byte anywhere.**

## The defect class that has cost this mission the most

Four revisions on EXEC-01, two on UI-02a, all one class: **a check that cannot
fail for the reason its author believed.** Source-text assertions that survive
a behaviour change; a test that pins today's values instead of the rule; a
green suite mistaken for a green typecheck (vitest does NOT typecheck).

So: make the tests for this ticket BEHAVIOURAL wherever a behaviour exists to
execute. If you must assert on source text, say in the handoff why, and what
drift it cannot catch. And run each gate separately — a passing suite is not a
passing compiler.

## Environment

Full stack is UP and must stay up: PG 55432, shim 8791, API 8790, UI :3000
(`NEXT_DIST_DIR=.next-dev`), token `v-dev`. Three real debates exist, including
the two-maker one — **you can verify live**. Never run a production
`next build` into the dev server's dist dir. Embedded PostgreSQL cannot start
inside your sandbox: author DB-touching tests behind
`tests/support/testDatabase.ts` and say in the handoff when an outside run is
needed; the orchestrator runs those.

## DONE WHEN

A real node in a real debate shows the maker that actually produced it, proven
with REAL pasted output (not claimed); unresolvable makers show typed absence;
every gate green with REAL pasted output each (`npx tsc --noEmit`, v2-ui
typecheck, both vitest suites, architecture + source + orphan audits — the
orchestrator re-runs all of them independently and has already caught one
claimed-green gate this mission); TDD RED→GREEN evidence; handoff at
`handoffs/UI-02b-codex-handoff.md`; progress line per step in
`handoffs/UI-02b-progress.log`; ticket to `review` with comment
`READY FOR PEER REVIEW — UI-02b`.

## Return rule

Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
[STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message.
