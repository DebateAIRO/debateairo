# [unassigned] F-CLOSING-RUN-OUTDIR-OVERRIDE · the run tool's log folder cannot be pointed elsewhere, so its refusals are tested against the real one

```yaml
state:
  ticket: F-CLOSING-RUN-OUTDIR-OVERRIDE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the credential task's fix round 1.

`tools/closing-run.sh:41` fixes `OUTDIR` to the mission's `logs/closing-run/` with no override. The fix
round that made the tool refuse a credential on its own command line had to prove "nothing was written
to a log" by listing that real folder before and after (2 files, then 2 files) instead of running the
tool against a temporary folder. The proof holds; the method does not scale, and a test that writes into
the evidence folder by accident would be worse than no test. STRENGTH: entailed (the seat's report, fix
round 1).

**Charge.** Let `OUTDIR` be overridden from the environment (deduced default unchanged), and move the
tool's refusal checks into a small test that runs it against a temporary folder.
