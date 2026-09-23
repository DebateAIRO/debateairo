# [unassigned] F-BOOTSTRAP-REGISTER-V2-RUNTIME-PINS · the machine-resolved pins still record 2026-08-07, and recording today's needs a version 2

```yaml
state:
  ticket: F-BOOTSTRAP-REGISTER-V2-RUNTIME-PINS
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: [register.bootstrap.json, packages/register/src/index.ts, tests/support/registerFixtures.ts]
    forbidden: all_others
    human_review: yes
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the Node 26 upgrade (D78) — the seat measured the problem and
correctly refused to solve it inside that task.

**The situation.** `register.bootstrap.json` carries five machine-resolved pins (`nodeRuntimeVersion`
`v22.23.1`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`, `vllmImageDigest`), each with a
resolution note of the form `<command> on 2026-08-07`. The host's runtime moved to Node 26.8.2 on
2026-09-18 and `package.json` engines now declares it, so the register's row is **stale, not false**: it
is a dated measurement that was true on its date.

**Why it cannot simply be edited.** The file IS sealed register version 1. `persistBootstrapRegister`
(`packages/register/src/index.ts:669-693`) seals it through `importHistorical`, which is replay-only and
raises `FX-REG-SEALED_VERSION_MISMATCH` against any database that already holds v1. The production
runbook's step 2
(`docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md:161-169`)
is headed "Validate immutable v1/v4 history" and tells the operator to confirm the exact v1 snapshot
SHA-256 `8fde270c…` and "unchanged row/value/source bytes". The upgrade's seat edited the two lines, the
snapshot hash moved to `db282408…`, and two tests went red; the orchestrator ruled the edit REVERTED,
on the same law as the acceptance register's refit (D77 ADDENDUM 1 a/1: a sealed value is never edited;
a change is a new version). STRENGTH: entailed (the runbook, the replay-only path, and
`git log --follow -- register.bootstrap.json`: the values have never changed since 2026-08-09).

**Charge (a design decision first).** Decide where a CURRENT machine-pin snapshot lives: a bootstrap
register version 2 sealed beside v1 (then: which version number is free — the acceptance register took 3
on 2026-09-18 and development allocates from 5; and `importHistorical` caps at 4, see
`F-REGISTER-HISTORICAL-IMPORT-CAP`), or a separate current-pins file that is explicitly NOT sealed
history, with v1 kept as the frozen fixture the runbook verifies. Then re-measure all five pins on the
day it lands (`vllmImageDigest` needs one registry manifest request — it was not re-measured on
2026-09-18, UNVERIFIED), and amend the runbook step so the operator validates both versions.
`human_review: yes` because it changes a production provisioning instruction.
