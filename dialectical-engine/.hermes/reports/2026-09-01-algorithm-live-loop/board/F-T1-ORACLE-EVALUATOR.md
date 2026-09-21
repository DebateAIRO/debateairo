# [claude@opus-5] F-T1-ORACLE-EVALUATOR · a sound evaluator for the depth oracle's derivation arm (V-ruled, D68)

```yaml
state:
  ticket: F-T1-ORACLE-EVALUATOR
  risk_tier: high
  status: done # 14:06 2026-09-07 orchestrator review APPROVE at 1d3e2255 (D69); merged into dev 70647e7e (D70); the two S1-1 rows green on the lane's dev base with 0 appeared
  owner: { agent: codex, session: implementer-r3 }
  contract: { allowed: [PLAN first: agent-reports/t1-oracle-evaluator-plan.md (architecture seat); then, after codex approves the plan: tests/unit/s1-1-depth-contract.test.ts, tests/support/ (a new evaluator module if the plan says so)], readonly: [apps/ui/components/LoginFlow.tsx, the lane/t1-oracle-loginfp round-3 test (60641339) as the control corpus, agent-reports/t1-oracle-loginfp-codex-r{1,2,3}.md], forbidden: all_others, verification: [the plan reviewed by codex before any code; then RED on every class codex named (B1 terminal selection, B2 permutation-then-slice, B3 punctuation in strings/templates/regexes) → GREEN; the 27 layout classes and the three bare option-domain controls green; mutants; b14 four-count with zero unexplained; codex review], human_review: yes }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator, branch: lane/t1-oracle-evaluator, merge_status: merged-into-dev-70647e7e }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-loginfp-codex-r3-2026-09-06
```

V ruled on 2026-09-06 (D68): build the real evaluator rather than declare the heuristics' limits. **What it must be** (from codex r1–r3 on lane/t1-oracle-loginfp): a lexer that distinguishes strings, template literals and regex literals from syntax before any run is found; one occurrence decision per declaration with source correspondence to every reporting window; an evaluator over a DECLARED grammar of array-literal derivations (slice with integer literals, reverse, sort, map with a declared subset of callbacks, Set wrapping, spread/destructuring) that tracks actual order and terminal selection and reports `undetermined` — conservatively, as a site — for anything outside the grammar; the ruled bare domain 1..5 reported wherever it sits; dev's LoginFlow six login slots handled as a MODELLED case (a 0-based index run consumed by a terminal render callback), not an exclusion. **Sequence:** architecture seat writes the plan (grammar, module boundary, how the arm is replaced, the control corpus from 60641339, the mutants) → codex reviews the plan → worker rounds (max 3) → codex → V merges. Day-scale; outside the closing-run gate by V's choice.

**Named fact (V, 16:39 2026-09-06, D68 ADDENDUM 2):** Node 22.23.1 UNVERIFIED — the round-0 gate runs under Node 25.7.0 only; carried in every dependent round and review.
