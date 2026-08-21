# /goal — Report seat: Hermes (gpt-5.6-sol) — Round 2
# Mission REQ-BATTERY-PARTITION-R2 · Requirements Engineering · Report generation

## 1. Ticket state

```yaml
ticket: REQ-BATTERY-PARTITION-R2-HUMAN
seat: Hermes
status: working
contract:
  allowed:   [reports/report-for-humans.md]     # the ONE file you may write
  readonly:  [upstream/human-plan.md, 00-intake-H0.md,
              research/Research-Hermes.md, research/Research-Codex.md,
              research/Research-Grok.md]
  forbidden: all_others
```

## 2. Upstream artifacts

All three Round-1 research artifacts (three independent lineages: Hermes, Codex,
Grok — each a full 62-question + 9-rule LLM/machine partition), the mission
intake record, and the source plan document.

## 3. The task

Write `reports/report-for-humans.md`: the HUMAN-READABLE report of this
requirements mission. The mission question (from V's launch prompt): which parts
of the Empirical Truth Battery should be LLM work and which machine work, so the
battery's substance survives while token cost per question falls as far as
possible.

Requirements for this report:
- SMALLER and more concise than the LLM-agent companion, but thoroughly
  explained — every claim in ordinary human language, no jargon without a
  plain-words gloss. Human readability is a top mission constraint (V's words).
- First paragraph must pass the plan's own stranger test: a reader who knows
  nothing can say back what was decided, how sure we are, and what would
  change it.
- Cover: what the battery is (one paragraph, honest status: unrun candidate);
  what MACHINE / LLM / HYBRID mean with 2–3 concrete examples each; what the
  three lineages independently agreed on (this is the strong evidence — no
  contact between seats); where they disagree (mark contested, with each
  seat's position — do NOT adjudicate); the expected token savings and their
  honest status (directional, unmeasured); the decisions only V can make; and
  what happens next.
- MERGE RULE (binding): where all three research artifacts agree, present the
  agreement as the merged position. Where they disagree, present the
  disagreement as contested — never silently pick a winner. You have no
  adjudication authority this round.
- Cite the plan document (part/stage) and the research artifacts (seat name)
  for every load-bearing claim. Invent nothing.
- Target length: roughly 150–250 lines. Concision is part of the contract.

## 4. Handoff marker

First line of the artifact:

    REPORT HANDOFF COMPLETE: seat=Hermes report=human ticket=REQ-BATTERY-PARTITION-R2

followed by: artifact path, sources read, assumptions/risks, comments read
through: round-2.

## 5. Stop conditions

- STOP after writing the report. No follow-up work.
- STOP and write `BLOCKED: <reason>` as first line if any readonly input is
  missing or unreadable.
- Budget guidance: stay under ~120k tokens.
- Do not come back to the Orchestrator unless you need its review — work the
  goal to the handoff marker, a genuine blocker, or an IMPORTANT OPERATION.
  Silence is normal; unchanged state needs no message.
