# [claude@opus-5] F-SEALEDROWS-G · a private parser schema became an importable runtime API

```yaml
state:
  ticket: F-SEALEDROWS-G
  risk_tier: low             # the package is private and repo search finds no consumer but the test
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-codex-r4-2026-09-04
```

Codex r4 N2. `apps/runner/src/index.ts:178-194` now exports `evaluatorVerdictSchema`, and the
package entry is the whole index, so `import { evaluatorVerdictSchema } from "@debateai/runner"`
succeeds for every workspace consumer. A private parser and its zod `.shape` became an importable
runtime API, and a later zod-internals refactor can turn into a cross-package break.

**Not blocking, and the middle classification is the right one:** the package is `private: true`
and repository search finds no consumer except the one test. This is a real internal widening with
no present product consequence.

**The seat's reason holds and was disclosed, not buried:** the drift check needs the declared keys
at RUNTIME, and the alternative is scanning schema source inside the test whose job is proving
nothing scans source.

**Fix:** move the contract and schema to a non-package-exported internal module the test imports
directly, or expose only an immutable criterion-key view and keep the zod schema private. Preserve
the runtime-derived agreement check; do not return to scanning schema source.
