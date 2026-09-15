# [claude@opus-5] W7 · the reviewer must not be told who authored the node (V-BLIND-CONTEXT)

```yaml
state:
  ticket: W7
  risk_tier: high            # it is the premise that makes same-model grading legitimate
  status: ready
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
  comments_read_through: v-blind-context-2026-09-03
```

Three sites in `packages/judgement/src/index.ts` — `:219`+`:225`, `:372`+`:376`, `:462`+`:466` —
pair a system prompt saying the node was "authored by a different maker" / "by another maker" with a
user payload field `{ name: "author_maker", content: input.authorMaker }`.

**Charge:** remove the identity from what the model reads. Its required output is
`{ outcome: "agree"|"dispute"|"cannot-assess", reasons: [...] }` and needs no author.

**Keep the foreign-text framing, drop the identity.** Say the node was authored by another
participant without naming which. The framing's likely purpose is prompt-injection defence — marking
the content as not the model's own prior turn — and that survives anonymisation. Under V-S11-GRADER
"a different maker" may also be FALSE now, since the same model may review.

**Do NOT touch `authorMaker` anywhere else.** It is used correctly at `runner:121` to select a
different reviewer, in `readLatestReviewerMaker` for rotation, and in `evaluator:2576` for recorded
lineage analysis. None of those reaches a model. The database must keep full provenance — V's rule
is RECORDED and WITHHELD, not forgotten.

**Add a test that fails if any prompt payload carries an authorship token.** The defect survived
because nothing checked; a guard over the whole prompt surface is what stops the next one.
