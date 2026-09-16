# [unassigned] F-T10-MIGRATION-REDEFINE-AUDIT · no migration may redefine another migration's function

```yaml
state:
  ticket: F-T10-MIGRATION-REDEFINE-AUDIT
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from FIX(CONT-T10) round 1's U1 (SDD ledger :105;
`agent-reports/cont-t10-fix1-v-sec-1.md` §7).

**The sample is a Critical defect this continuation actually shipped and then caught.** Migration `0063`
`CREATE OR REPLACE`d two guard functions owned by `0038` and `0040`. Because the S6 suite replays `0040`
over a shared pool (`:780-784`), every later case silently got `0040`'s body back — and a `0038` replay
would have **dropped the `serve.answer` plaintext guard in production**, not just in the test. The repair
(`bb8c5b16`) gives `serve.answer` its own guard functions, which CALL but never redefine `0038`/`0040`'s.

**The property is corpus-wide and the current check is not.** The sweep that catches it lives in
`tests/architecture/s6-content-encryption-contract.test.ts` and is scoped to `0063` alone.

**Charge:** one regex per migration file, no database — for every `CREATE [OR REPLACE] FUNCTION`, assert
no earlier migration defines the same qualified name. Candidate home: `tools/orphan-audit`, or the
migration audit that `TOOLING-TRAPS.md:4665` already faults for being a keyword list (see
`F-T6-AUDIT-RULE-GAPS` row 3 — same instrument, same weakness). STRENGTH: entailed.
