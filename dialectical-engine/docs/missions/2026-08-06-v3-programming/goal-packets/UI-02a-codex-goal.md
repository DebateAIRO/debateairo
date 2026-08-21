# /goal packet — UI-02a (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_d4d7d993` · **Assignee:** codex
**Roster (DR-153):** Fable/Opus 5 orchestrates · **Codex implements** · dual
diamond (Opus 5 lens + Grok lens), BOTH must greenlight. Day mode: questions
route UP to the orchestrator, never to V.

Standing law: `CODING-LOOP-PROTOCOL.md` in full (TDD, DDD, SOLID, pattern
register, 27-row edge table, DR-115, AC-76/DR-039, DR-121, git is V-gated).
Ledger `decisions-ledger.md` overrides on conflict; read DR-148 through DR-155.

## Unusual situation — read this before you touch anything

**The code for this ticket is ALREADY WRITTEN** by a previous worker (a Claude
seat, under the older DR-140 roster). It shipped per-node score badges from the
contract's `base_score` / `final_strength`, a typed absence path, and a repaired
"Scoring unavailable" banner. It is in the working tree now and its tests pass.

What it never got: **a review**, and **V's display ruling**. Your job is those
two things, not a rewrite. Do not redesign work that is already correct.

Read first, to see exactly what exists:
- `docs/missions/2026-08-06-v3-programming/progress/UI-02a-progress.md`
- `apps/v2-ui/lib/v3/adapter.ts` — `v3NodeScoreState`, `v3ScorePresentation`,
  `v3ScoreAbsenceCopy`, `v3ScoringStatusLabel`, `SCORING_ABSENCE_REASON`
- `apps/v2-ui/components/DebateCanvas.tsx` — `V3ScoreBadges`
- `apps/v2-ui/components/NodeDetailDrawer.tsx`
- `tests/unit/v2ui-data-layer.test.ts`, `tests/unit/v2ui-pages.test.ts`

## DELIVERS

### 1. V's ruling: scores display as PERCENTAGES (DR-154(4))

The cards currently print the raw probability verbatim (`0.98`). V ruled
**percentage**. V chose this over both raw `0.98` and a bare `98`.

Lawful under AC-76 because ×100 with a `%` sign is a FAITHFUL RESTATEMENT of a
probability, not an invented number. But that makes precision your problem:

- Do NOT imply precision the value does not carry. `0.41000000000000003` must
  not render as `41.000000000000004%`. Decide the rounding, state it in the
  handoff, and make it consistent between the card badge, the drawer, and any
  tooltip — one decision read by all of them, never three formatters.
- Rounding must never turn a real distinction into a fake tie or a fake
  difference in a way that misleads. If two nodes differ, say whether your
  rounding can make them look identical, and whether that matters.
- The typed ABSENCE path must be untouched by this: a node with no score still
  shows typed absence, never `0%`.
- The full label chain (`kind`, `producer`, `source`, `replay_handle`) that the
  previous worker carried into the tooltip must survive.

### 2. Close the review it never had

Re-verify the existing work against its own contract before handing off — you
are the author now, so its defects are yours:
- Values reach the cards from the contract, with no fabricated or defaulted
  number anywhere (DR-115).
- The repaired banner states precisely what is absent (V2's separate per-node
  scoring ENDPOINT) and no longer implies V3 has no scores.
- The tests can actually FAIL for the right reason. **Specifically check for
  the defect class that cost EXEC-01 two extra revisions:** a test that asserts
  on SOURCE TEXT rather than behaviour cannot fail when the behaviour drifts.
  If any assertion here is of that kind, replace it with one that can fail.

## Out of scope

Maker/model attribution — that is UI-02b (`t_35a2b742`), and it needs a
served-contract change. Do not start it here.

## Environment

The full stack is UP and must stay up: PG 55432, shim 8791, API 8790, UI :3000
(`NEXT_DIST_DIR=.next-dev`), token `v-dev`. Three real debates exist with real
scores (0.98 / 0.88 on the two-node run) — **you can verify live in the
browser**, which the previous worker could not. Never run a production
`next build` into the dev server's dist dir.

## DONE WHEN

Percentages render correctly with a stated, consistent rounding rule; typed
absence preserved; tests can fail for the right reason; every gate green with
REAL pasted output (`npx tsc --noEmit`, v2-ui typecheck, both vitest suites,
architecture + source audits — the orchestrator re-runs all of them
independently and has already caught one claimed-green gate in this mission);
live browser evidence of a real percentage on a real node; handoff at
`handoffs/UI-02a-codex-handoff.md`; progress line per step in
`handoffs/UI-02a-progress.log`; ticket to `review` with comment
`READY FOR PEER REVIEW — UI-02a`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.
