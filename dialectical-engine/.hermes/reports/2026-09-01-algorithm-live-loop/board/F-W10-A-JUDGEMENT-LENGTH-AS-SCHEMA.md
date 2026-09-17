# [unassigned] F-W10-A-JUDGEMENT-LENGTH-AS-SCHEMA · judgement records a length failure as a SCHEMA failure

```yaml
state:
  ticket: F-W10-A-JUDGEMENT-LENGTH-AS-SCHEMA
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) as **T-W10-A**, drafted in `task-15-report.md` §"Ticket drafts"
(SDD ledger :131). Class member **A** of W10 — named, with its seal, rather than forced.

`packages/judgement/src/index.ts:503` maps `lastParseStatus === "PARSE_FAILED"` to `PARSE_FAILURE` and
**everything else — now including `LENGTH_EXCEEDED` — to `SCHEMA_FAILURE`.** So the honest classification
W10 introduced is thrown away one layer up: a truncated panel member is recorded as a schema failure.

**Why it was not fixed inside W10, and this is the useful part:** the vocabulary is SEALED. The closed
union `PANEL_MEMBER_FAILURE_KINDS` (`packages/judgement/src/s04.ts:340-343`) has an exhaustive private
twin at `:276-285`, and the kind is **weighted** at `:280-281` — so adding a member is not a label
change, it is **panel arithmetic**, which is T3's surface.

**Scope:** add the kind, decide its weight, extend the note vocabulary. Risk: medium, because the weight
decision changes panel outcomes. STRENGTH: entailed.
