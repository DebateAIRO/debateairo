# /goal — Report seat: Codex (gpt-5.6-sol) — Round 2
# Mission REQ-BATTERY-PARTITION-R2 · Requirements Engineering · Report generation

## 1. Ticket state

```yaml
ticket: REQ-BATTERY-PARTITION-R2-LLM
seat: Codex
status: working
contract:
  allowed:   [reports/report-for-llm-agents.md]  # the ONE file you may write
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

Write `reports/report-for-llm-agents.md`: the AI-CATERING report of this
requirements mission, written for other LLM agents that will consume or
implement the battery partition. The mission question (from V's launch prompt):
which parts of the Empirical Truth Battery should be LLM work and which machine
work, so the battery's substance survives while token cost per question falls
as far as possible.

Requirements for this report:
- Executable in spirit: for each of the 62 questions and 9 human rules, one
  merged verdict row with a stable ID — verdict (MACHINE | LLM | HYBRID |
  CONTESTED), what code computes, what (if anything) an LLM decides, its
  smallest output shape, the trigger predicate, and the enforcement/downgrade
  consequence.
- MERGE RULE (binding): where all three research artifacts agree, present the
  agreement as the merged verdict. Where they disagree (including
  LLM-vs-HYBRID boundary cases), mark the row CONTESTED and record each
  seat's position in one line. Never silently pick a winner — you have no
  adjudication authority this round.
- Include: the consolidated preflight architecture (typed state, order of
  operations — merge the seats' designs, mark divergent design choices);
  the merged, deduplicated token-saving mechanisms; human-parameter injection
  points with NO defaults for undecided values (list V's open decisions as
  typed unresolved parameters); unresolved mechanisms marked unresolved
  (coverage, citation gate, expiry); and a validation protocol section.
- Machine-parseable structure: consistent headings, one table per stage,
  stable IDs (Q1..Q62, R1..R9). Cite seat names for contested rows and the
  plan document (part/stage) for grounding.
- Length: as long as needed for completeness — this is the larger, thorough
  document; the human report is the concise one.

## 4. Handoff marker

First line of the artifact:

    REPORT HANDOFF COMPLETE: seat=Codex report=llm-agents ticket=REQ-BATTERY-PARTITION-R2

followed by: artifact path, sources read, assumptions/risks, comments read
through: round-2.

## 5. Stop conditions

- STOP after writing the report. No follow-up work.
- STOP and write `BLOCKED: <reason>` as first line if any readonly input is
  missing or unreadable.
- Budget guidance: stay under ~150k tokens.
- Do not come back to the Orchestrator unless you need its review — work the
  goal to the handoff marker, a genuine blocker, or an IMPORTANT OPERATION.
  Silence is normal; unchanged state needs no message.
