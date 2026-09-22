# [unassigned] F-PACKET-LINT-COUNT-HANDED · `tools/packet-lint.sh` prints the count of files HANDED as its "OK" summary, the shape `board-lint` just lost

```yaml
state:
  ticket: F-PACKET-LINT-COUNT-HANDED
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed:
      - .hermes/reports/2026-09-01-algorithm-live-loop/tools/packet-lint.sh (the summary line and the skip accounting only)
    readonly: [.hermes/reports/2026-09-01-algorithm-live-loop/tools/board-lint.sh]
    forbidden: all_others
    human_review: no
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by the orchestrator, from the whole-branch review's residual list (verdict file
`.superpowers/sdd/2026-09-16-algorithm-live-loop-continuation/final-review-report.md`, scoped re-check
section) and the FIX(WHOLE-BRANCH) seat's out-of-contract finding (`final-fix-report.md`).

**The defect.** `tools/packet-lint.sh:20` prints `OK (<n> files)` where `<n>` is the number of packets
handed on the command line, not the number validated — the same shape `tools/board-lint.sh` carried
until the review's F5 (commit `293db256`) made its summary say
`OK (validated 53 of 226; 173 F*-*.md finding tickets carry no state block, skipped by design)`.
`packet-lint` is honest today only by accident: its one `continue` also sets `rc=1`, so a skipped packet
cannot hide behind rc 0 — but a future `continue` without that assignment reintroduces the false floor
that F5 removed from the board's lint. STRENGTH: entailed (the reviewer read the script; the fix seat
named the line).

**Charge.** Make the summary state validated versus skipped, the way `board-lint.sh:33` now does, and
keep the exit-code semantics; prove it on one skipped input before and after. No other behaviour changes.
