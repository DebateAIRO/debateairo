# [claude@opus-5] T1-ORACLE-LOGINFP-R1-N2 · mutation and custody claims exceed their captures

```yaml
state:
  ticket: T1-ORACLE-LOGINFP-R1-N2
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [agent-reports/t1-oracle-loginfp.md (append), agent-reports/t1-oracle-loginfp-self.md (append)], readonly: [logs/t1-oracle-loginfp/*], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-loginfp-codex-r1-2026-09-05
```

Filed by codex (oracle r1, N2). The report says m4 'kills exactly them and nothing else' — m4's command selected ONE name and ran 2 failed | 48 skipped; the claimed common command for all four mutants and 'tree clean before and after' b14 are not what the files carry (b14 has porcelain BEFORE and no AFTER stamp; the three cluster logs lack per-run commit/tree stamps). m1/m2/m3 results stand. **Fix (worker, records only — folded into round 2):** append actual per-mutant selectors and counts, retract 'nothing else', distinguish recorded custody from later observation; never rewrite a historical log.
