# [claude@opus-5] W10 · a length failure must say it was a length failure

```yaml
state:
  ticket: W10
  risk_tier: medium          # changes failure classification and two sealed cost rows; no change to any served answer
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: no
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: token-audit-2026-09-03
```

Source: `../audits/token-budget-reasoning.md`. Measured, not estimated.

## 1 · Read `finish_reason`

`finish_reason` appears nowhere in the repository. A response cut off at `max_tokens` returns
partial `content`, fails `classifyStructuredContent`, and is recorded as `PARSE_FAILED` —
indistinguishable from a model that wrote bad JSON.

**Charge:** carry `finish_reason` through `responseSchema` and classify `length` as its own
status. RED first: a fake provider returning `finish_reason: "length"` with truncated content
must be recorded as a length failure and not as a schema failure.

## 2 · Stop appending on a truncation retry

`buildSchemaRepairPacket` (`apps/runner/src/index.ts:1250`) appends a correction message and
reuses the same bound. For a length failure that makes attempt 2 strictly worse: longer input,
identical `max_tokens`, same schema to satisfy. All three attempts burn producing the same
failure, and the run reports `COMPOSITION_CONTRACT_ERROR`.

**Charge:** the outcome is that a truncation must not be retried into the identical truncation.
The seat chooses the mechanism (D58).

## 3 · The SYNTHESIZER and EVALUATOR have no bounds of their own

They borrow COMPOSER and CONFORMANCE — two organs T9 retired. Both carry `deadlineMs: 60_000`
while the JUDGE, which answers about a single node, carries `180_000`. The synthesizer reads
the whole digest and writes the served answer; the evaluator reads digest, label and candidate
and must return a reasoned objection.

**Charge:** mint sealed SYNTHESIZER and EVALUATOR cost rows. Deadline no shorter than the
judge's. Leave `tokenCeiling` at 2048 for now — item 1 makes a hit visible, and the first
approved live run reports `usage.completion_tokens` per attempt, so the ceiling gets set from
data instead of from an estimate.

## Not in scope

The digest byte budget and its `DIGEST_CANNOT_EXIST` ladder are correct and stay. The
byte-versus-token denomination mismatch is recorded in the audit as latent, not fixed here.
