# FIX-S01-p2-L1 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The defect was created when migration 0066 granted `core.run_is_free_public_bound(uuid)` directly to `debateai_erasure_runtime` without checking the API's startup invariant in `packages/db/src/account-erasure.ts`: the erasure role must have exactly the 20 functions in `ERASURE_FUNCTION_SIGNATURES`. Bound deletion did need the predicate, but only inside the SECURITY DEFINER `core.prepare_private_run_erasure`; the principal did not need direct EXECUTE. The defect survived because the 19-suite S01 gate omitted `tests/integration/dev-database-principals.test.ts`, the existing suite that executes the production role attestations against provisioned LOGIN principals.

## Price

- Product price: the API exited during startup, making every slice behavior unavailable despite the scoped S01 suites passing.
- Review price: one live FIX node after a three-lens PASS. Work took about 16 minutes from CLAIM through commit, including six full 21-suite gates, one focused gate, one mutant, and typecheck.
- Retry price: two test-fixture RED attempts failed before reaching the intended assertion. The first guessed a nonexistent `SERVER_ASK_ADMISSION_DATABASE_URL`; the second assumed the content-provision capability had a sibling LOGIN. The third reached the required `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED` failure.
- Token price: the runtime did not expose a trustworthy token counter, so an exact number is UNVERIFIED. The dominant avoidable context cost was reading large authorized source/test surfaces to recover a seven-pool startup mapping that the packet's named `main.ts:120-140` range did not define.

## What nearly went wrong

I nearly treated the launch prompt as a resumed BLOCKED node and read DECISIONS §31. The newest orchestrator comment correctly overrode that template text: this was a new node with no prior BLOCKED comment and no decision section to read. I also nearly accepted the first new-test failure as RED evidence; inspecting the log showed it was fixture wiring, not the product defect, so it was rejected and rerun until the expected erasure isolation failure appeared.

## Dead ends

- `SERVER_ASK_ADMISSION_DATABASE_URL` and `LEGACY_ASK_ADMISSION_DATABASE_URL` are not development-principal credential keys.
- Capability-role sibling discovery cannot supply the server-ask pool because the development principal catalog has only one `debateai_content_provision` LOGIN. A second pool using that real credential exercises the second startup call; `LIVENESS_DATABASE_URL` supplies a distinct real `debateai_runtime` LOGIN for the second erasure assertion.
- Adding `core.run_is_free_public_bound(uuid)` to the erasure allowlist would preserve boot but broaden the role beyond its intended fixed capability set. Revoking the unnecessary direct grant preserves both exact isolation and SECURITY DEFINER bound deletion.

## Packet ambiguity

The user prompt said to resume after a BLOCKED ruling and read the named DECISIONS section; the packet named DECISIONS §31; the ticket ruling said neither applied. The ticket resolved this, but the launch template should not emit mutually exclusive state. The packet also required an all-startup-assertions test while authorizing only `main.ts:120-140`, which names variables but not their credential mapping. Finally, “affected clusters THREE times” plus “both locales” can mean three total or three per locale; I chose the stricter three runs in each locale.

## Ranked upgrades by tokens saved

1. Add the production startup-attestation suite to the mandatory merge gate and fail the slice if any migrated role set violates it. This would have prevented the entire live FIX node and the largest token spend.
2. Generate a migration GRANT-versus-boot-assertion matrix in CI from the migrated database. A principal with an exact allowlist should fail on every unlisted privilege automatically.
3. Put the exact development credential-to-startup-pool mapping in the packet when a test must reproduce `main.ts` startup. This would remove both fixture retries and their log inspection.
4. Have the launcher reconcile NEW versus RESUMED/BLOCKED state before composing the prompt, and include exactly one governing DECISIONS instruction.
5. Publish one canonical S01 gate command that already includes locale, repetitions, no-skip check, development principals, and the new boot regression. This removes command reconstruction and pair drift.
