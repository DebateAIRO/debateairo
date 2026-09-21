# Self-report — REV-S01-p3-security-data-safety

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REV(S01) security/data-safety, pass 3 (scoped to L1, the last lawful pass), ticket `t_6199cf96`, the p1/p2 session resumed. Verdict PASS; L1 ADDRESSED by measurement; one non-blocking finding, S-N10. Wall clock ~20 min.

## The cause, and it is mine as much as anyone's

**L1 is the finding my own lens should have produced at pass 1, and the reason it did not is that I measured the database and never measured the boot.** At pass 1 I ran a privilege grid, enumerated EXECUTE for every role, and wrote with confidence that "no new function is executable by PUBLIC or by a role the plan does not name." Every word of that was true. It was also beside the point: the defect was not a role holding a privilege it should not have, it was a role holding **one more privilege than a start-up attestation counts**, and a count is invisible to a grid. `migrations/0066_free_public_rule.sql:21` sat in my pass-1 evidence, printed in my own EXECUTE matrix as `debateai_erasure_runtime: true`, and I read it as correct — because it *is* correct, unless you know that `packages/db/src/account-erasure.ts:222-226` counts the whole set and `:308` pins it to 20.

The generalisable rule, and it is the one upgrade I would carry to every mission: **when a slice grants a privilege, find what ATTESTS that privilege set, not just what uses it.** A grant is safe against the question "may this role do this?" and unsafe against the question "does anything assert the exact shape of this role?" The second question is answered by one grep — `has_function_privilege|pg_proc|count(*)` over `packages/db/src` — and it would have caught L1 three passes and one live launch earlier. It is now the first thing I would run on any diff containing a migration, ahead of the privilege grid I ranked first after pass 1.

## What this pass did that the passes before it did not

I re-derived the class sweep from the five migrations instead of checking the FIX seat's list, and it paid twice. First, it confirmed the erasure half cheaply: exactly one grant to that role exists in 0066–0071, and 0071 revokes it. Second, it turned up something the FIX seat's self-report does not name — **`assertContentProvisionDatabaseRole` is a second exact-count attestation of the same shape** (`index.ts:211-214`, count over `core` pinned to 6 at `:276`). It is not violated, and the new regression test happens to cover it, but "the class has two members and the fix report names one" is the difference between a closed class and a class that looks closed.

The third thing I looked for and did not find is the one I am most glad I checked: `has_function_privilege` reads the ACL, and PUBLIC is in the ACL, so **a new function created without `REVOKE ALL … FROM PUBLIC` inflates both exact counts without any role appearing in any GRANT**. That is a defect this class would hide completely from a GRANT-based sweep. Measured `F2 functions in identity/core/serve executable by PUBLIC: 0`. Every new function in these migrations carries its revoke. If that number had been non-zero, the sweep everyone ran — mine included — would have been looking at the wrong column.

## What repeatedly cost tokens

1. **Three passes of fixture archaeology, and I predicted it twice.** This pass cost one retry: `core.run_is_free_public_bound` returns **NULL**, not `false`, for a run id that does not exist, so my "the runtime role can still read the predicate" assertion failed on `expected null to be false` and I had to seed a real bound run. That is the third consecutive pass where the only red I produced was a fixture fact, not a product fact. I ranked `tests/support/seedOwnedRun()` first after pass 1 and again after pass 2; it is still unbuilt and it has now cost this one seat four retries across three passes. I am no longer confident that ranking it in a self-report is what gets it built.
2. **Reading past the `Promise.all`.** Charge 1 named the start-up `Promise.all`; charge 6 asked the reverse question about *any* other start-up gate. Answering the second honestly meant reading `main.ts` to the end and then every assertion's implementation to see which pin a count and which pin a capability. That is ~6 files of reading to produce one table row per gate and one finding. It is the right work, and it is also exactly the work a generated attestation manifest would make free.
3. **No wasted double run this time.** The pass-2 lesson held: I passed all 21 specs inline rather than through a shell variable, and both locale runs were correct on the first attempt. That single habit change saved a four-minute run and the confusion of a `CLUSTER_GREEN` covering one suite.

## What I nearly got wrong

I nearly declared L1 ADDRESSED on the strength of `fpd-s01-l1-boot-role-assertions.test.ts` being green in the gate. That is reading the author's test and nodding — the failure mode my own role contract names first. The test asserts six calls resolve to `undefined`; it does not tell me those six are *all* of them, and the whole of L1 is that somebody miscounted a set. Deriving the six from `main.ts:122-131` myself, running them myself against the real login principals, and then asking what runs *after* that block is what produced S-N10.

I also nearly filed S-N10 as blocking, on the reasoning that a test named "every role assertion executed by API startup" which omits three of them is exactly how L1 happened. It is not blocking: the three omitted assertions are scoped entirely to the `support` schema, no object of 0066–0071 lives there, and I measured the reachable one as OK. Blocking at pass 3 makes a V row, and V does not need a row about a test's name.

## Dead ends, named so nobody re-derives them

- **`apps/runner/src/dev-auth-data-plane.ts` pins nothing.** The packet named it as a candidate; it orchestrates migrate and service start, and its only `length`/`count` expressions are array sizes and exit codes. One grep, no finding.
- **There is no migration-count pin anywhere** in `packages/db/src`, `apps/api/src` or `apps/runner/src`. Adding migration 0071 could not have broken anything by count of migrations.
- **`assertSupportKeyCoverage` and `assertSupportDatabaseRole` cannot be moved by a `core`/`serve`/`identity` migration.** Every pin inside them is `nspname='support'`.

## Where this packet was unclear, exactly

Almost nowhere, and it is worth saying which change made the difference: **charge 6 asked a question instead of assigning a check.** "Is there any OTHER start-up gate … that counts or pins something migrations 0066–0071 changed?" is a question I could be wrong about, so it forced a derivation rather than a confirmation, and it is the charge that produced both of this pass's non-obvious results. Compare pass 1's charge 3, which told me which queries to run and got me exactly the answer it asked for.

Two small things. **Charge 1 says "run the API's own boot assertions … ADDRESSED means the API would boot"** — those are not the same claim, and I could not close the gap inside my contract (the packet forbids serving a stack, and `assertPublicationSecretDomains`, the Argon2 handshake and `listen` are outside what any assertion exercises). I answered the first and said so under UNVERIFIED. **The `comment cursor at dispatch` was finally correct** — 1, matching the DISPATCHED comment — after being wrong in both earlier packets.

## Upgrades, ranked by tokens saved

1. **On any diff containing a migration, grep for the attestations before the grid.** `has_function_privilege|pg_proc|count(*)` over `packages/db/src` finds every exact-count role in seconds. This is the check whose absence cost a live launch, a FIX node and a third review pass.
2. **Generate the GRANT-versus-attestation matrix in CI** (the FIX seat's own upgrade #2, and I agree with it from the other side). There are two exact-count attestations and neither fails at migration time; today the only detector is a suite somebody must remember to list, which is precisely how L1 survived a three-lens PASS.
3. **`tests/support/seedOwnedRun()` and a valid `Answer` fixture.** Third time ranked. Four retries in this seat alone.
4. **Every new SQL function ships with `REVOKE ALL … FROM PUBLIC` in the same statement block, enforced by a lint over `migrations/`.** PUBLIC is in the ACL, so a missing revoke breaks an exact-count attestation without naming a role — invisible to every sweep anyone ran this mission.
5. **Ask charges as questions, not checklists,** when the goal is to find what nobody listed. Pass 3 found more per token than pass 2 largely because of how one sentence was phrased.

## Toward one prompt

Across three passes this lens produced eleven findings, and the two that mattered most — L1's class and S-N8 — were both of the form *"a capability exists whose admission is weaker than the thing that attests it."* That sentence is machine-checkable. A build step that, for every role, emitted its attested set (from the TypeScript constant) beside its actual set (from `pg_proc`) and failed on a diff would have made L1 impossible and S-N8 visible at the moment the migration landed. The one-prompt machine here is not a smarter reviewer; it is making the invariants that reviewers rediscover by hand into artifacts the build already holds.
