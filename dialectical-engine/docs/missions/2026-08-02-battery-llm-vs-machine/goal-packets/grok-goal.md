# /goal — Research seat: Grok (grok-4.5)
# Mission REQ-BATTERY-PARTITION-R1 · Requirements Engineering · Round 1

## 1. Ticket state (read-only for you except where noted)

```yaml
ticket: REQ-BATTERY-PARTITION-R1
seat: Grok
status: working
contract:
  allowed:   [research/Research-Grok.md]        # the ONE file you may write
  readonly:  [upstream/human-plan.md]             # your ONE upstream artifact
  forbidden: all_others                           # no other file, no code, no board, no git
```

## 2. Upstream artifact

`upstream/human-plan.md` (relative to this mission directory) — "The Empirical
Truth Battery, explained for a person". 11 stages, 62 questions (appendix has the
full numbered list), 9 human-set rules, cost model in Part 9.

## 3. The research question

For the battery, decide and argue: **which parts should be LLM work (an AI making
a judgement at run time) and which parts should be machine work (a deterministic
algorithm, computed in preflight or inline, costing zero tokens)?**

The driving constraint: token cost per question must fall as far as possible
WITHOUT dropping any of the battery's substance. Two levers are in scope:
  a) algorithmize — move a check into deterministic code (preflight computation,
     schema validation, ledgers, counters, diffs, caches, string/date/provenance
     checks, arithmetic like the recombination operator);
  b) sharpen — where an LLM judgement is genuinely irreducible, restructure the
     question so a small, well-aimed prompt does the work efficiently (batching,
     structured output, reuse of upstream state instead of re-derivation).

Required artifact structure for `research/Research-Grok.md`:
  1. A per-question table covering ALL 62 questions (use the appendix numbering):
     columns = question #, stage, verdict (MACHINE | LLM | HYBRID), what the
     machine part computes, what the LLM part decides, token-saving mechanism.
  2. The same treatment for the 9 human-set rules.
  3. A preflight architecture sketch: what runs once per question before any
     LLM call, in what order, producing what typed state.
  4. Your top-10 token-cost reductions ranked by expected savings, each with a
     one-line justification traceable to the plan document (cite part/stage).
  5. Open questions only V (the human) can decide.
  6. A short section: implications for the two final documents (human-readable
     report + AI-catering companion) — what each needs that the other does not.

Ground every verdict in the plan document itself (cite stage/part). Do NOT
invent sources. External retrieval is not required this round; if you do browse,
log queries per the battery's own Stage 3/4 discipline.

## 4. Handoff marker (your single return surface)

When done, the FIRST line of your artifact must be:

    RESEARCH HANDOFF COMPLETE: seat=Grok model=grok-4.5 ticket=REQ-BATTERY-PARTITION-R1

followed by: artifact path, sections present (1-6), assumptions/risks,
comments read through: intake.

## 5. Stop conditions

- STOP after writing the artifact. One round only. No follow-up work.
- STOP and write `BLOCKED: <reason>` as the artifact's first line if you cannot
  read the upstream artifact or cannot write your file.
- Budget guidance: stay under ~120k tokens for the round.
- Do not come back to the Orchestrator unless you need its review — work the
  goal to the handoff marker, a genuine blocker, or an IMPORTANT OPERATION.
  Silence is normal; unchanged state needs no message.
