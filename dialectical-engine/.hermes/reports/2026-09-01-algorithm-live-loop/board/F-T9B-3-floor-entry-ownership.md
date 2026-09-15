# [claude@opus-5] F-T9B-3 · the row cannot name the REASON for a floored band — S01/T16 owns the cure

```yaml
state:
  ticket: F-T9B-3
  risk_tier: medium
  status: done # MERGED at d08ee928 with the lane. emptyBasisFloor REQUIRED on the sole type and both strict schemas; a floored band names its own reason; BAND_CEILING_FLOOR_UNDESCRIBED still fires on an undescribed floor. Codex r7 APPROVE
  owner: { agent: claude, session: lane-sealedrows }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [S01/T16 owns every new sealed row and schema]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows, branch: lane/sealedrows, merge_status: merged@d08ee928, tip: f9754701 }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t9b-rework1-2026-09-03
```

When citation tracing fails the basis is empty and the band is floored. The record now truthfully
names the band and its lift path, because the entry is selected by the band it actually names. It
still cannot name the true REASON: every entry in the `wayOfKnowingCeiling` row carries ONE label
serving as both its trigger and its outcome, so an entry whose band is `CAPPED` necessarily also
claims the trigger that normally produces `CAPPED` — a reasoning-share threshold that did not fire
on an EMPTY basis.

No selection over the existing entries can fix that. The cure is a new row entry with its own
trigger, which means two schemas and two seeders — and the mission's slice map makes **S01/T16 the
sole owner of every new sealed row and schema.**

**The seat filed this rather than taking it, and named the right reason:** written ownership, not a
size judgement. It also MEASURED rather than assumed the fact that makes deferral safe — the
acceptance harness never fails citation tracing, so production never reaches this route today.

What ships is strictly better than what it replaced and states its own limit in the code at the
site: the contradiction is gone, the lift path is truthful, band and label are both row-derived and
validated, and an undescribed floor now FAILS CLOSED with `BAND_CEILING_FLOOR_UNDESCRIBED`.
