# [claude@opus-5] F-T17T9-3-PROSE · two proof files still say DR-184-v3, and the 4×5 grid is pinned twice

```yaml
state:
  ticket: F-T17T9-3-PROSE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [acceptance/panel01-depth1-proof.ts (comments), acceptance/xrev01-depth1-proof.ts (comments), tests/integration/t17-envelope-ledger.test.ts:39 (comment), packages/register/src/index.ts:277 (comment), tests/unit/t17-envelope.test.ts:141 (comment)], readonly: [packages/register/src/index.ts], forbidden: all_others, verification: [the prose says v4; one grid pin reads the other or the register; suites unchanged; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-codex-r1-2026-09-05
```

Filed by lane/t17t9-3 round 2 (out of contract). `acceptance/panel01-depth1-proof.ts:37` and `acceptance/xrev01-depth1-proof.ts:37` say `DR-184-v3` in prose after the bump to v4; the 4×5 ceiling grid is pinned independently in two files (a second-definition smell — the same class the depth oracle exists for). **Fix (worker):** prose to v4; one grid pin derives from the other or from the register so a future re-derivation moves one place. Codex t17t9-3 r1 Q6 says whether this is one ticket or two.

**Expanded by codex t17t9-3 r1 F1 (18:41) — ONE documentation task, the grid consolidation moved to its own ticket F-T17T9-3-GRID:** the ledger test's opening comment (`:39`) still describes two composition rounds / seven sites; the register's comment (`:277`) and the envelope test's (`:141`) say the runner emits no `COMPOSER:` key — it DOES emit `COMPOSER:SYNTHESIZER:…`; the retired keys are the bare organ keys. The runner's own read-only comment at `apps/runner/src/index.ts:1166` still describes the old formula (production comment — grant it to the worker explicitly if it is to be touched). Distinguish retained namespace prefixes from retired organs; make historical explanations explicitly historical; keep versions out of generic acceptance prose.
