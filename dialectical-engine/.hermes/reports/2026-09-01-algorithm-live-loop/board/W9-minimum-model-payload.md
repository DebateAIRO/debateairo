# [claude@opus-5] W9 · the model reads its task, not the machinery (V-MINIMUM-PAYLOAD)

```yaml
state:
  ticket: W9
  risk_tier: medium          # no behaviour change intended; it removes an inference channel and closes a stated-rule gap
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
  comments_read_through: v-minimum-payload-2026-09-03
```

## 1 · Send the model a PROJECTION, not the whole request

`apps/runner/src/index.ts:4038` and `:4114` do `{ role: "user", content: JSON.stringify(request) }`.
Replace with a projection that OMITS `roleRef`, `round`, `stage`, and `codeLabel.registerVersion`.

**Keep every field on the request object itself.** `assertFreshContextRequest` inspects the REQUEST,
not the prompt, so the frozen key sets in `synthesis.ts:341-346` do NOT change and the leak guard
stays satisfied. The runner still resolves the provider from `request.roleRef`
(`resolveSynthesisRoleMaker`, `:4032`/`:4110`), and the audit record keeps full provenance —
V's rule is RECORDED and WITHHELD, never forgotten.

**Kept in the projection, because the tasks depend on them:** `instructions`, `digest`, the code
label's real numbers, `candidateStatement` (the evaluator's entire job), and `priorObjection` on a
retry (without it a rewrite is blind).

**Why `round` matters more than it looks:** `evaluatorLoopMaxRounds` is configured, so "round 3" in
a 3-round loop means "last attempt". That changes the decision an evaluator faces — objecting now
ends the loop rather than continuing it — and it can make a synthesizer write defensively. Neither
task depends on the count.

## 2 · State the rule the synthesizer is judged on (F-W9-1)

The synthesizer receives `codeLabel` and its instructions never mention it. The evaluator is
instructed to check "agreement between the statement and the code label". A rule is enforced that
was never stated to the party bound by it.

Add the obligation to `SYNTHESIZER_INSTRUCTIONS`: the statement must agree with the supplied code
label and must not claim more confidence than it carries. **This is not extra information — it is
the minimum.** A party judged on agreement needs to know it is judged on agreement.

## Proving it

A test that FAILS if any model-facing payload contains `roleRef`, `round`, `stage` or
`registerVersion` — asserted over the payload actually sent, not over the request. The identity
leak in the review prompts (W7) survived because nothing checked the prompt surface; one guard
should cover both tickets' properties.
