# [claude@opus-5] W8 · restore the conformance scrape T9 broke (BLOCKS THE CLOSING RUN)

```yaml
state:
  ticket: W8
  risk_tier: high            # every acceptance entry point that seeds, including the demonstration
  status: done # CLOSED 2026-09-05 — this IS F-SEALEDROWS-A, found a third time (W4 from acceptance, W5 by bisection, then the sealedrows seat refuting F-S11-6) and FIXED there: the scrape is gone, the evaluator prompt is a named export the runner sends and both seeders digest, merged at d08ee928 after seven codex rounds. The ticket's own question — 'judge whether a SCRAPE is the right mechanism at all' — was answered NO by deletion. The orchestrator failed to connect W8 to F-SEALEDROWS-A for two days; board hygiene defect, recorded
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
  comments_read_through: w4-w5-2026-09-03
```

**Found INDEPENDENTLY from two directions, which is why it is trusted:** the W4 seat hit it from the
acceptance side (its fix could not turn FAIR-02 green on the mission branch), and the W5 seat hit it
from the reconciliation side and bisected it.

`seed-register.ts:123` scrapes `apps/runner/src/index.ts` for two conformance strings. T9 replaced
those two with one. **2 matches at the mission baseline and at dev; 0 at the mission tip.** Bisected
to `c1d8e09d`. Roughly 24 failures follow, and they break every acceptance entry point that seeds —
including the ceremony the Global DoD depends on.

**It was invisible because the last full batch (b11) predates T9, T9B, T15, T17B and T6B.** No lane
that landed after b11 re-ran the full suite, so nothing looked at this surface again.

**The outcome required** (mechanism yours): the seeding step resolves against the runner as T9 now
writes it, and every acceptance entry point that seeds works again. Prove it by the acceptance
suite, not by the scrape alone.

**Judge whether a SCRAPE is the right mechanism at all.** A seeding step that greps source text for
literal strings breaks silently whenever the source is legitimately reworded — which is exactly what
happened. If a structural source exists, say so; if replacing it is beyond this ticket, file the
recommendation rather than taking it.

**Alias (W4-R1-N2, 2026-09-05):** this ticket also closes **F-W4-1** — the codex rollout scrape filed by lane/w4 on 2026-09-03 under that name.
