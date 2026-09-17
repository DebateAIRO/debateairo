# [claude@opus-5] T9B · role becomes a PREDICATE in producer binding (V-S07-CODEX-r4-1 / r4-2)

```yaml
state:
  ticket: T9B
  risk_tier: high            # a synthesizer artifact can currently be committed as the evaluator verdict
  status: done # MERGED into integration at 7dda3cc0. Codex merge review 0 findings, fit to merge; four product reviews before it, each closed. Judge PASS
  owner: { agent: claude, session: opus-s07-w7b }
  contract:
    allowed:
      - the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07 (branch lane/s07; local commits, never push)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s07-synthesis.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s07-synthesis-self.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s07/**
    readonly:
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-r4.md (B1 and B2 verbatim)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md (J29 + ADDENDUM, D42, D43)
    forbidden: all_others (no widening of T9's synthesis scope; no assertion of a landed lane weakened)
    verification: [codex static review, judge verdict + D15 batch suite]
    human_review: yes         # V authorizes this lane's existence; it is a post-cap product change
  worktree: { path: .worktrees/lane-s07, branch: lane/s07, merge_status: merged_to_integration_7dda3cc0 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: 2026-09-02
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: s07-codex-r4-2026-09-02
```

## Why this ticket exists

T9's worker spent rework 3/3. Codex r4 then found two blocking defects. The judge did NOT
self-authorize a fix, because this is a product change after the cap rather than prose or
evidence repair, and that is V's call. The ticket is written and staged so that no time is
spent drafting it after V rules.

## Charge

1. **Role must act as a predicate, not as error text** (B1). Today a legitimate round-1
   synthesizer artifact submitted as BOTH candidate and verdict passes every check, because
   `bound.role` is only interpolated into an error message and never compared. A synthesizer
   response commits as the evaluator verdict. Derive the expected call-site key inside
   persistence from the typed role, `synthesizerRequest.stage` and `round` — through ONE
   shared builder used by both runner and serve — require equality, and only then resolve the
   ledger entry. Do not add a stored round column.
2. **Real-pair negative arms** (B1). The existing negative arm supplies NONEXISTENT keys, so
   it proves an invented pairing is rejected, not a real pairing for the wrong role. Add arms
   for evaluator-as-candidate, synthesizer-as-verdict, and one artifact/key used for both.
3. **Rebuild the two wrong-cause mutants** (B2). R5M1 died of a parameter-type error (42P18)
   and R5M2 of a work-item constraint (23514), so neither pins what it was credited with.
   Drive the writer through `ServeRepository.persist` BEFORE the unrelated `work.settle`, use
   a type-valid run-only producer mutant, and emit every transcript through `tools/mutate.sh`
   so it carries the D42 custody fields. The four R5 records are inadmissible as filed; the
   15 previously accepted mutants stand.

## Not in scope

The report's "nineteen mutants across five campaigns" claim must be corrected to what the
admissible evidence supports. That is a record correction travelling with this lane, not a
reason to re-run the four earlier campaigns.
