# [unassigned] F-REGISTER-V3-REQUIRED-ROW-PROFILE · the ceremony's new register version is not on the list of versions that must carry the policy rows

```yaml
state:
  ticket: F-REGISTER-V3-REQUIRED-ROW-PROFILE
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed: [migrations/ (one NEW forward migration, the next free number, measured at write time), tests/integration/t16-algorithm-register.test.ts]
    readonly: [migrations/0050_t16_algorithm_register_rows.sql, migrations/0055_register_support_publication.sql, migrations/0061_algorithm_publication_profiles.sql]
    forbidden: all_others
    human_review: no
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator. Measured by the D77 refit's seat, re-measured independently by its
blind reviewer (`agent-reports/d77-refit-review-2026-09-18.md`, Minor 2), whose severity call was
"ticket it, do not block".

**The gap.** `migrations/0050_t16_algorithm_register_rows.sql:49-52` declares
`register.required_row_version` for `(5,'development')` and `(2,'acceptance')`. D77's refit moved the
ceremony's pin to version 3 (`acceptance/seed-register.ts:24`, commit `3a8193cb`), and 3 is not declared.
Version 3 gets a row profile only from the guard trigger
(`migrations/0061_algorithm_publication_profiles.sql:19-30`), whose first test is "does this version
already carry at least one required row", and whose second test cannot help on the historical path
because that path never sets `base_register_version` (`migrations/0055_register_support_publication.sql:1400-1401`).
So a version-3 register carrying **zero** policy rows seals without complaint, where version 2 refuses
(`REGISTER_REQUIRED_ROW_MISSING`). STRENGTH: entailed (two independent measurements).

**What still holds, and why this did not block the refit.** Every PARTIAL case is still refused at seal
(one policy row present and the guard declares the profile and asserts the rest). The shipped seeder
cannot produce the zero case — `buildAcceptanceRegisterPublicationRows` (`acceptance/seed-register.ts:400`)
always emits all fifteen rows. And the definition of done's "missing rows fail loudly" still holds end to
end: every reader refuses at READ, naming the missing keys (`packages/register/src/algorithm-policy.ts:496-500`),
so no ceremony can run on a deficient register — it fails later than it used to, not silently.

**Charge.** One forward migration adding `(3,'acceptance')` to `register.required_row_version` — and, in
the same migration, the two provenance cells of `F-T16-MANIFEST-PROVENANCE-STALE`. Then retarget the guard
test `tests/integration/t16-algorithm-register.test.ts:245-252` ("rolls back historical acceptance
publication when all required algorithm rows are missing") from its literal `2` to
`ACCEPTANCE_REGISTER_VERSION`, so it passes for the right reason. Decide with
`F-REGISTER-HISTORICAL-IMPORT-CAP` whether the list of versions should be maintained by hand at all.
