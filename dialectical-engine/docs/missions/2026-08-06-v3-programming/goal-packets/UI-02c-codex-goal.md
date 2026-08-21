# /goal packet — UI-02c (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_0829cf81` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md`. Read the ticket body in full — it
carries the three findings (A1/A2/A5) from UI-02b's approving diamond.

## Why this ticket is the point of the whole arc

V, ruling DR-162 today: *"for now I want to see that two models bring better
answers than one model."* The SEEING is this ticket. The maker (house) is
resolved server-side and served on `maker_lineage` — and then the adapter
keeps only `model_id`. In the acceptance ceremony both houses' doubles answer
the same model string, so a two-maker debate RENDERS mono-model. Production
escapes by luck.

## DELIVERS (from the UI-02b diamond findings)

1. **A1 — surface the HOUSE.** Carry `maker_lineage.maker` through the
   adapter and show it in V2's existing vocabulary (`ModelBadge` /
   `ModelMetaLine` / `modelColor` — do NOT fork them, DR-145). The reader must
   be able to tell OpenAI's argument from Anthropic's at a glance on every
   card. An ABSENT maker renders TYPED ABSENCE (visible, like the scoring
   pills), not silence — make it consistent with the sibling scoring work.
2. **A2 — fix two misleading served names** while nothing renders them:
   `provider` is the hardcoded literal `"openai-compatible-http"` (a
   TRANSPORT, not a provider) and `model_version` is by construction either
   byte-identical to `model_id` or null. Rename honestly (e.g.
   `transport`, drop or honestly-null `model_version`) or justify keeping
   them in the handoff. They are pinned in
   `tests/integration/database.test.ts:835-837` — update the pins with the
   rename. Contract change → run `generate:contract` + architecture suite.
3. **A5 — close the mutation hole:** deleting the `provider: null` guard
   clause in `packages/serve`'s resolver leaves every gate green while the
   projection 500s at the API boundary. Add the behavioural case.

## Constraints

The PANEL-01 rev3 code is settled and dual-greenlit — build on it, do not
rework it. `maker_lineage` semantics are DR-115-bound: relay what was
recorded, never infer from the model-id string. The NUL-byte ratchets and the
frozen formatter in `adapter.ts` stand. Stack may be mid-restart — verify by
suite; the orchestrator handles live verification.

## DONE WHEN

House visible per node in V2 vocabulary with typed absence; renames landed
with pins updated (or justified); the A5 behavioural case red-under-mutation;
every gate green with REAL pasted output EACH; TDD RED→GREEN; handoff
`handoffs/UI-02c-codex-handoff.md`; progress log
`handoffs/UI-02c-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — UI-02c`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
