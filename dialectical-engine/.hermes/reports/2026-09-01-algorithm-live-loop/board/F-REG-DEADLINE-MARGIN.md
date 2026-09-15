# [claude@opus-5] F-REG-DEADLINE-MARGIN · the registration suite passes with a 4–6 % margin under a wall-clock deadline

```yaml
state:
  ticket: F-REG-DEADLINE-MARGIN
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/integration/registration-database.test.ts, the mail-queue fixtures under tests/support/, apps/api/src/auth-policy.ts (only if the deadline is made fixture-driven — say so)], readonly: [apps/api/src/registration.ts, logs/t17t9-3/b1v2/], forbidden: all_others, verification: [the suite's slowest marker has ≥ 30 % headroom or the deadline is driven by the fixture clock; three full-suite runs with 0 unhandled AUTH_MAIL_BUSY; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-3-evidence-2026-09-05
```

Filed from lane/t17t9-3's V-authorised evidence round. The registration-database suite's slowest marker settles at 16.85–17.29 s against an 18 000 ms wall-clock deadline (auth-policy: 28 000 ms registration, 18 000 ms shared) — a 4–6 % margin at idle, measured on BOTH the dev-reconciled parent (16.845 s) and the tip (16.960 s): inherited, not a lane's doing. One second of scheduling delay flips a marker to rejected, drains the queue, starves `dispatch.records`, and produces b14's exact signature (19 unhandled `AUTH_MAIL_BUSY`). On this box OneDrive/FileProvider alone was measured driving loadavg past 100. **Fix (worker):** widen the margin or drive the deadline from the fixture's clock so suite load cannot flip it; prove with three full-suite runs. Retires the whole class of attribution question that consumed two rounds and a V decision.

**CORRECTION (22:40, codex t17t9-3 r3):** the numbers above are the seat's and were WRONG by route: the 16.8–17.3 s maxima belong to the 28 000 ms registration route (headroom ≈ 10.7–11.2 s); the 18 000 ms resend route's maxima are 15.6–15.8 s (headroom ≈ 2.2–2.4 s); both are API-call-to-settlement durations, not queue wait, so neither is a measured queue margin. What stands: the suite depends on wall-clock timers and a timeout can drop a grant record (source-supported); b14's 19 rejections named `register:marker-grants`. This ticket is an engineering OPTION (fixture-driven deadline or wider headroom) needing its own design and verification — it does not 'retire the class', and 'one second of scheduling delay yields b14's signature' is withdrawn as unestablished.
