# [claude@opus-5] W6 · the acceptance fixtures must stop serialising the environment (SECURITY)

```yaml
state:
  ticket: W6
  risk_tier: high            # writes live credential values into a persisted ledger
  status: ready
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review, judge verdict]
    human_review: yes        # V is rotating the exposed key; this is the code half
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: w4-2026-09-03
```

`fake-claude-cli.mjs:62` and `fake-grok-cli.mjs:12` both serialise `process.env` in full as the
model's reply content, which is persisted to `ledger.raw_artifact`. With a real key set in the
environment, every run using these fixtures writes that key into the database and into any log
capturing the content.

**Charge:** the fixtures echo only the variables the tests actually assert on, named explicitly.
Never the whole environment. Add a test that would FAIL if a fixture serialised an unnamed variable
— the defect survived this long because nothing could see it: the content is opaque to every gate
that runs, so only an assertion about what the fixture emits can catch it.

**Do NOT** read, echo, or reproduce any credential value while working on this. If a value appears
in front of you, redact in place and say so, exactly as the W4 seat did.

V is rotating the exposed key. That is the operational half; this is the code half, and neither
substitutes for the other.
