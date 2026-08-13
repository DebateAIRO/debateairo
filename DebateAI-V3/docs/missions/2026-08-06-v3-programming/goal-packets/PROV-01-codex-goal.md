# /goal packet — PROV-01 (Codex seat, PROG-V3-R1) — the set's final ticket

**Board:** `debateai-v3` · **Ticket:** `t_779f40b3` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-166-C. Read the
ticket body (`hermes kanban --board debateai-v3 show t_779f40b3`).

## The defect (from UX-01's confirming diamond)

The form now defaults `riskTier` to the deployment floor — a cited machine
fact, honestly disclosed in the UI. But the ask POSTS
`tier_source: "ASKER"` / `tier_provenance_ref: "asker:ui-selection"` — **the
persisted record claims the user chose a value the machine chose.** DR-115 at
the provenance layer. The contract's `tier_source` vocabulary
(`packages/contract/src/index.ts:109`) admits only `"ASKER"` on this path, so
the fix is a CONTRACT MEMBER, not a UI patch.

## DELIVERS

1. A new `tier_source` member — `"MACHINE_DEFAULT"` (or justify a better
   name) — in the contract vocabulary, with a matching provenance-ref
   convention (e.g. `machine:deployment-floor`).
2. The form sends it when the user did NOT touch the risk tier, and keeps
   `"ASKER"` when the user actively chose (edited) the value — the
   distinction is the point; get it from real form state, never guess.
3. The engine accepts and persists it; the risk-escalation logic
   (`resolveRiskTier`) treats it correctly (a machine default at the floor
   escalates identically — verify no behaviour change beyond provenance).
4. Honesty surfaces render it (the drawer's provenance lines) in plain words.
5. Contract regenerated (`generate:contract`, zero-drift proof), architecture
   suite green, migrations if the DB constrains the vocabulary.
6. Mutation-proof: the form sending ASKER for an untouched machine default
   must go red; the user-edited path sending MACHINE_DEFAULT must go red.

## DONE WHEN

The persisted record tells the truth in both directions; every gate green
with REAL pasted output EACH; `vitest list` collection proof; handoff
`handoffs/PROV-01-codex-handoff.md`; progress log
`handoffs/PROV-01-progress.log`; `review` +
`READY FOR PEER REVIEW — PROV-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
