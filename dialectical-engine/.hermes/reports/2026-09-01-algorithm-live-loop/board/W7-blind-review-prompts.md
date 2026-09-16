# [claude@opus-5] W7 · the reviewer must not be told who authored the node (V-BLIND-CONTEXT)

```yaml
state:
  ticket: W7
  risk_tier: high            # it is the premise that makes same-model grading legitimate
  status: done
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

## 2026-09-16 continuation
Moved `ready` → `done` by RECORDS(CONT-T19). Landed by **Task 11**, range `e6477f64..f7b54d1d`
(`abb6b21b` the product change). Both `author_maker` payload sites removed; the *"authored by another
participant"* framing kept (the reviewer still knows the text is foreign, just not whose); `author_maker`
deleted from the `UntrustedPromptFieldName` union so a re-add **fails to compile**; a guard with a
coverage row over every `role: "system"` site; and no assertion anywhere that the reviewer differs from
the author. Orchestrator's review of the product change: the ruling exactly (SDD ledger :107–:112).
STRENGTH: entailed.
**What this ticket cost, and it belongs on the record:** editing one clause of two system prompts broke
**27 of 103** assertions across four provider doubles — and one suite (`t17-envelope-ledger`) went on
passing SILENTLY with its PANEL leg classified as JUDGE. Fix round 1 moved all four doubles from prose to
structure (PANEL = `fatalFlags && !restatement_text`, REVIEW = `edge_bearings`, both measured unique) and
made t17's PANEL leg observable.
**Deferred, now its own ticket:** `F-W7-ORGAN-MARKER` — the doubles still key on schema keys a schema
change can move; an explicit organ marker in the untrusted-fields envelope is the durable form.
