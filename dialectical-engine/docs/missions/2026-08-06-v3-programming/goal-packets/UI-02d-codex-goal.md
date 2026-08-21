# /goal packet — UI-02d (Codex seat, PROG-V3-R1) — the set's last coding ticket

**Board:** `debateai-v3` · **Ticket:** `t_94ac4a9d` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok).

Standing law: `CODING-LOOP-PROTOCOL.md` + ledger through DR-166-A. **Read the
ticket body AND its comments** (`hermes kanban --board debateai-v3 show
t_94ac4a9d`) — the DR-165(2) amendment there is part of scope.

## Scope (from UI-02c's approving diamond + V's DR-165(2))

1. **V's ruling DR-165(2): the exact model id joins the rendered card text.**
   V: *"I want to see if its sol, Sonnet, fable or Opus."* Extend
   `makerIdentityLabel` (the single-source seam stands — do not fork it) so
   rendered text carries the verbatim recorded `model_id`, e.g.
   `OpenAI · GPT · gpt-5.6-sol`. Typed absence unchanged. Update the killers.
2. **Pin the remaining six maker surfaces** (UI-02c A-4): dropping
   `maker={node.maker}` from tree/thread/outline/split/map/drawer (8 call
   sites) currently keeps everything green while a two-maker debate renders
   mono-model; only `DebateCanvas` is pinned. With the render layer now
   ENFORCED (LOAD-01), prefer rendered-behaviour pins; the six `toContain`
   lines are the floor, not the ceiling.
3. **Scope the render ratchet per function** (A-5) so an adversarial
   transplant cannot satisfy it.
4. **`aria-label` on the absence pill** (A-7) — the one product-code touch
   besides the label extension.

## Constraints

DR-115 (verbatim recorded id only — never inferred from the family hash);
the frozen `v3ScorePercentage` and the NUL ratchets stand; `vitest list`
discipline (prove new test files are COLLECTED — three dead runners this
mission); mutation-proof per the house standard, naming which assertion kills
which mutation.

## DONE WHEN

Cards render house · family · exact model id with typed absence intact; the
six surfaces pinned (mutation-proven); ratchet scoped; aria-label present;
every gate green with REAL pasted output EACH; handoff
`handoffs/UI-02d-codex-handoff.md`; progress log
`handoffs/UI-02d-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — UI-02d`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
