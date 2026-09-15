# [claude@opus-5] F-T6B-1 · the T6 r4 gate logs carry no commit header, like r3's

```yaml
state:
  ticket: F-T6B-1
  risk_tier: low
  status: waiting_review # DELIVERED 2026-09-03 at audits/F-T6B-1-provenance-closure.md. Measured independently rather than restated: the ticket's own 17-of-21 count is wrong (it is 12/9), and the split turns out to be cosmetic — all twelve 'stamped' logs carry a hand-typed banner, not a tool signature, so ALL 21 are testimony-grade. Three mutant logs came from an unfiled hand-rolled driver, not tools/mutate.sh: CANNOT-ASSESS whether their SHA was computed or typed
  owner: { agent: claude, session: orchestrator }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [record correction only]
    human_review: no
  worktree: { path: n/a, branch: n/a, merge_status: n/a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t6b-2026-09-02
```

The T6B seat was charged with correcting ONE provenance sentence (the r3 gates). Sweeping the
class, it found the same defect one paragraph later: the report said "the r4 gates at
`7f513173`", and 17 of 21 r4 logs carry no commit token either. Corrected in the record on the
same terms as r3's.

The logs themselves cannot be re-stamped after the fact — a stamp added later is testimony, not
a machine record — so this ticket exists to say plainly that the r4 gate attribution is
testimony-grade, and that both T6 provenance sentences now say so. `tools/gate-run.sh` (D45,
amended D49) is what prevents the next occurrence.
