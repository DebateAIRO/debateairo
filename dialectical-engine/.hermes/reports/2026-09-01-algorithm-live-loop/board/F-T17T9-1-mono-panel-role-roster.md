# [claude@opus-5] F-T17T9-1 · mono-panel seals an evaluator role its own fixture does not configure

```yaml
state:
  ticket: F-T17T9-1
  risk_tier: medium          # blocks the demo path: mono-panel.test.ts cannot reach the served answer
  status: waiting_product_proof # MERGED into integration at ae35e9d2 (2026-09-05, post-merge.sh, tree == dry-run 2b64673f; 4 files +175 −27). Codex r1 APPROVE 0 blocking / 2 follow-ups (F-DEMOPATH-R1 orchestrator packet path, F-DEMOPATH-R2 report wording). Closes on a green D15 batch b13 after W3 r4 lands
  owner: { agent: claude, session: lane-demo-path }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-demo-path, branch: lane/demo-path, merge_status: merged, base: 7e8f1e51, tip: 193509a1 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-r1-2026-09-05
```

Found by lane/t17t9 the moment the claim-time gate stopped refusing. `acceptance/mono-panel.test.ts`
seals `evaluatorRoleRef = acceptance:claude-cli` (derived from the FULL roster) but its fixture
configures only `acceptance:codex-cli`, so the run now dies at `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED`
— which is CORRECT under J24 (a sealed identity is never substituted). The defect is the fixture's
roster, not the refusal.

**Fix:** the existing `ACCEPTANCE_*_ROLE_REF` overrides before seeding at `mono-panel.test.ts:87`,
plus extending its fixed 6-element provider double. Outside the t17t9 contract (acceptance test
files were not granted). Test-only.

## ORCHESTRATOR PACKET DEFECT #16 — admitted 2026-09-05 (demo-path seat, §1)

Three in one packet. "180-second per-test timeouts" — both vitest configs say `testTimeout: 120_000`;
I wrote the constant from memory. "The fixed 6-element provider double needs EXTENDING" — relayed
from t17t9's report; it needed shortening, six responses to four. `TOOLING-TRAPS.md` granted by
relative path with two copies (main checkout vs lane) — D61 fixed the grant, not the path, and the
second lane in a row spent thought on it; the traps went to the main checkout and will not arrive
with the merge. Sixteen. Rule: a packet constant is read from the tree at packet-write time
(D-lesson, again), and TOOLING-TRAPS.md is granted by its ABSOLUTE main-checkout path with the
note that lane copies are stale.
