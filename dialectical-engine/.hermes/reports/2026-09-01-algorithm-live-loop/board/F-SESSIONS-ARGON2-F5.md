# [claude@opus-5] F-SESSIONS-ARGON2-F5 · the sessions lane's evidence narrative exceeds its evidence in three places

```yaml
state:
  ticket: F-SESSIONS-ARGON2-F5
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [agent-reports/sessions-argon2-self.md (append a CORRECTION section), tests/unit/sessions-risk-signal.test.ts (the binding-capture comment only), .hermes/TOOLING-TRAPS.md (append-only)], readonly: [logs/sessions-argon2/, agent-reports/sessions-argon2-codex-r1b.md], forbidden: all_others, verification: [the three claims corrected as codex r1b F5 states; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sessions-argon2-r1b-2026-09-07
```

**Filed from codex sessions-argon2 r1b F5 (2026-09-07, documentation, non-blocking).** Three claims exceed or contradict the evidence: (1) the self-report still recommends a blanket zero-argument-notifier rule with "zero false positives" while the main report withdrew it (the UI `notFound()` mapping and the throwing `poisoned()` normalizer show syntax alone does not identify an observer); (2) capturing the service's binding hash avoids duplicating its derivation in the fixture — it does NOT guarantee a derivation change fails the file (both calls use the same routine and the stub returns the captured value): describe it as fixture decoupling, correct the source comment; (3) the report attributes 19 ms / 2 ms to record 17, whose capture shows 15 ms / 2 ms. **Outcome:** a CORRECTION section appended to the self-report; the test's comment corrected; any TOOLING-TRAPS correction appended, never rewritten.
