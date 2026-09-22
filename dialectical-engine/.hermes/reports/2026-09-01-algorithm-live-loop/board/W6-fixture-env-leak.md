# [claude@opus-5] W6 · the acceptance fixtures must stop serialising the environment (SECURITY)

```yaml
state:
  ticket: W6
  risk_tier: high            # writes live credential values into a persisted ledger
  status: done
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

## 2026-09-16 continuation
Moved `ready` → `done` by RECORDS(CONT-T19). Landed by **Task 16**, range `f0f9eeb2..f13dacc4`.
**Round 0 was not enough and the record should say so:** the seat's own F4 was CRITICAL —
`ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` were still echoed **by value**, so the original
incident's shape was still live after the first commit; and the class had **six** members, not the four
the packet asserted. Fix round 1 closed it: a credential-shaped VALUE is emitted only as
`sha256:<16 hex>`; `environmentKeyNames` (sorted, names only) restores the exact-set reach the allow-list
had removed; the credential-shape rule is one PATTERN stated identically in all six members rather than a
list in six places — *a list in six places is how the leak survived*. Orchestrator's review: **ACCEPTED,
W6 CLOSED** — 8 files / 87 / 0 ×3, both typechecks 0/0, three mutants killed at both layers, and
`grep -rn 'environment: process.env' acceptance` = **0 hits, re-measured by the orchestrator** (SDD ledger
:134–:139). STRENGTH: entailed.
**Deferred, now its own ticket:** the sweep is one literal — a member written `env: process.env` would
pass it. See `F-W6-ENV-SHAPE-AUDIT`.
