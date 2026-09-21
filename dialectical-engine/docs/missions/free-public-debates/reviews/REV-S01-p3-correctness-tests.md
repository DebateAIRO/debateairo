# REV(S01) pass 3 (SCOPED to L1, the LAST pass) — lens **correctness / tests** · mission `free-public-debates`

- seat `REV-S01-p3-correctness-tests` (the pass-1/2 lens session resumed) · ticket `t_6199cf96` · pass **3 of 3**
- slice head `86b391a0`, previous head `c358d494`, base `5b6cc9b1` · read-only detached worktree
  `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine`, 0 dirty at start and at handoff
- oracle: `SPEC-v3.md` (unchanged) · scope: the live finding **L1** and its fix (`0071` + two tests)
- blind: no other lens's output was read. No stack started, no container touched, no listener bound.

## VERDICT — **PASS** (pass 3) for this lens

**L1 is ADDRESSED by measurement.** Two non-blocking findings, both about *what the loop failed to
run*, neither about the fix. Nothing here is a V row.

---

## 1. Charge 1 — L1 by measurement: would the API boot on a database migrated through 0071?

I did not re-run the FIX seat's test as my evidence. I wrote my own
(`.hermes/reports/free-public-debates/probes/REV-S01-p3-correctness-tests/rev-s01-p3-boot-roles-probe.test.ts`):
it migrates an embedded Postgres to head, provisions the development LOGIN catalogue, and connects as
the **real** principals — `current_user` asserted not to be `postgres`, no superuser pool anywhere.

**The raw facts behind `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED`** (`packages/db/src/account-erasure.ts:13-33`,
the `exactFunctionCount` clause at `:309`), measured at `86b391a0`:

| fact | measured |
|---|---|
| functions in `core`/`identity`/`serve` executable by `debateai_erasure_runtime` | **20** = `ERASURE_FUNCTION_SIGNATURES.length` |
| `has_function_privilege('debateai_erasure_runtime','core.run_is_free_public_bound(uuid)','EXECUTE')` | **false** |

**Every role assertion on the boot path resolves.** The six of the boot `Promise.all`
(`apps/api/src/main.ts:123-131`) — `assertAccountErasureDatabaseRole` ×2,
`assertPublicationDatabaseRoleSeparation`, `assertPublicationCleanupDatabaseRole`,
`assertContentProvisionDatabaseRole` ×2 — all resolve. **And the two the charge's wording does not
reach:** `assertSupportDatabaseRole` ×2 and `assertSupportKeyCoverage`, which `main.ts:573-576` runs
inside `startup.run("support-attestation")` on the same boot path; both resolve. The slice's own
regression test (`tests/integration/fpd-s01-l1-boot-role-assertions.test.ts`) covers the `Promise.all`
six exactly and stops there — see N1-p3.

My probe: **4 passed / 0 failed** in the ambient locale and under `LANG=LC_ALL=en_US.UTF-8`.

**L1: ADDRESSED.** The API boots on a database migrated through `0071`.

## 2. Charge 2 — the fix traded nothing away

| claim | how I measured it | result |
|---|---|---|
| a bound Free debate is still deletable while public under `debateai_erasure_runtime` | `tests/integration/fpd-s01-c4-delete-published.test.ts` in both locales, **and** under the L1 revert mutant | **17/0** in every run, including under the mutant — the delete path never depended on the direct grant, because the predicate is called inside the `SECURITY DEFINER` body of `core.prepare_private_run_erasure` |
| the erasure principal can still enter that path | my probe calls `core.prepare_private_run_erasure` as the real `ERASURE_DATABASE_URL` principal | returns the opaque `NOT_FOUND` for a run that exists nowhere — i.e. the call was **permitted**; the same principal calling `core.run_is_free_public_bound` directly raises SQLSTATE **42501** |
| the runtime role still reads the bound predicate | `has_function_privilege('debateai_runtime', …)` and a live call as the real `DATABASE_URL` principal | **true**, and the call answers (NULL for an unknown run) |
| the auto-publish path and the unpublish refusal still call it | `fpd-s01-c2-auto-publish` 14/0, `fpd-s01-c2-system-publication` 20/0, `fpd-s01-c3-unpublish-http` 11/0, `fpd-s01-c1-privileges` 3/0 | at their pairs in both locales |

## 3. Charge 3 — the new regression test is not a test that cannot fail

Mutant: `migrations/0071_isolate_erasure_role_from_free_public_predicate.sql` — the
`REVOKE EXECUTE … FROM debateai_erasure_runtime` turned back into the pre-fix
`GRANT EXECUTE … TO debateai_erasure_runtime`, restored byte-equal afterwards (worktree 0 dirty,
verified).

```text
mutant  tests/integration/rev-s01-p3-boot-roles-probe.test.ts   :: Tests  3 failed | 1 passed (4)
mutant  tests/integration/fpd-s01-l1-boot-role-assertions.test.ts :: Tests  1 failed (1)
mutant  tests/integration/dev-database-principals.test.ts        :: Tests  1 failed | 15 passed (16)
mutant  tests/integration/fpd-s01-c1-privileges.test.ts          :: Tests  1 failed | 2 passed (3)
mutant  tests/integration/fpd-s01-c4-delete-published.test.ts    :: Tests  17 passed (17)
```

Four independent detectors go red; the delete suite stays green, which is the correct discrimination.
The new test earns its place.

## 4. Charge 4 — the lists, twice

All 21 gate suites, cwd = my worktree, ambient (`env -u LANG -u LC_ALL`) and
`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. **Byte-identical**, both `CLUSTER_GREEN`, and the skipped-test
scan over both logs returns **0** in each:

```text
tests/integration/fpd-s01-c1-binding.test.ts rc=0 passed=9 failed=0 (expect 9/0)
tests/integration/fpd-s01-c1-privileges.test.ts rc=0 passed=3 failed=0 (expect 3/0)
tests/unit/fpd-s01-c2-auto-publish.test.ts rc=0 passed=14 failed=0 (expect 14/0)
tests/integration/fpd-s01-c2-system-publication.test.ts rc=0 passed=20 failed=0 (expect 20/0)
tests/unit/fpd-s01-c3-unpublish-http.test.ts rc=0 passed=11 failed=0 (expect 11/0)
tests/unit/fpd-s01-c4-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/integration/fpd-s01-c4-delete-published.test.ts rc=0 passed=17 failed=0 (expect 17/0)
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/unit/s8-publication-http.test.ts rc=0 passed=4 failed=0 (expect 4/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
tests/architecture/s8-publication-contract.test.ts rc=1 passed=4 failed=1 (expect 4/1)
tests/unit/s7-authorization.test.ts rc=1 passed=30 failed=1 (expect 30/1)
tests/unit/s10-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/unit/pda-s04-node-carrier-audit.test.ts rc=0 passed=2 failed=0 (expect 2/0)
tests/unit/tiers-s02-admission.test.ts rc=0 passed=15 failed=0 (expect 15/0)
tests/integration/tiers-s02-run-plan-tier.test.ts rc=0 passed=6 failed=0 (expect 6/0)
tests/integration/plan-tiers-route-privileges.test.ts rc=0 passed=1 failed=0 (expect 1/0)
tests/architecture/register-support-publication.test.ts rc=1 passed=12 failed=2 (expect 12/2)
tests/unit/api.test.ts rc=0 passed=31 failed=0 (expect 31/0)
tests/integration/dev-database-principals.test.ts rc=0 passed=16 failed=0 (expect 16/0)
tests/integration/fpd-s01-l1-boot-role-assertions.test.ts rc=0 passed=1 failed=0 (expect 1/0)
CLUSTER_GREEN
```

The five failures are the five named RED at base. `pnpm exec tsc --noEmit` → rc=1, **70**
diagnostics (the base count), **0** naming a file this slice wrote.
`git diff --name-only 5b6cc9b1..86b391a0 -- apps/ui | wc -l` → `0`.

## 5. Charge 6 — why two passes missed it, and the sweep

### 5.1 The cause

**Suite selection was FILE-based; the defect was a GLOBAL fact.** Every list this mission gave a
reviewer — `PLAN.md` §6, the pass-1 package, the pass-2 package — is a set of suites that touch the
slice's files. `tests/integration/dev-database-principals.test.ts` names no S01 file, so no
file-based rule could select it. But `migrations/0066_free_public_rule.sql:21`
(`GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_erasure_runtime`) does
not change a file's behaviour — it changes a role's privilege set, and the only suites that can see
that are the principal-attestation suites. The detector existed at base, and the package's own frame
records it as `15/1` at `c358d494` — **red, unrun, through a three-lens PASS**.

**My own share.** Across passes 1 and 2 I ran 37 mutants. Every one mutated a function body, a
guard, a projection or a route ordering. **Not one mutated a `GRANT` or `REVOKE` line**, including at
pass 1 when I had `0066` open and quoted `:12` from it. A mutation campaign confined to logic cannot
see a privilege defect.

### 5.2 The sweep (charge 6, run once each at `86b391a0`)

Class definition, since "under the real roles" has no mechanical test: a suite that **migrates the
whole `migrations/` directory** *and* **attests a role's privileges** (calls a boot assertion helper,
or `has_function_privilege`, or a principal provisioner). Members **not** in the gate:

| suite | passed/total | attribution |
|---|---|---|
| `tests/integration/production-database-principals.test.ts` | 32/32 | — |
| `tests/integration/support-config-principals.test.ts` | 8/8 | — |
| `tests/integration/s6-content-encryption-database.test.ts` | 48/48 | — |
| `tests/integration/dev-deployment-register.test.ts` | 16/16 | — |
| `tests/integration/support-shred.test.ts` | 20/20 | — |
| `tests/integration/register-support-publication.test.ts` | 25/25 | — |
| `tests/architecture/sup-01-boundary.test.ts` | 11/11 | — |
| `tests/integration/p2-auth-risk-database.test.ts` | 5/5 | — |
| `tests/integration/p2-recovery-start-database.test.ts` | 2/2 | — |
| `tests/integration/s7-authorization-database.test.ts` | **11/12** | **base `5b6cc9b1`** — see 5.3 |
| `tests/integration/session-database.test.ts` | **10/11** | **base `5b6cc9b1`** — see 5.3 |
| `tests/integration/registration-database.test.ts` | **UNVERIFIED** | no summary after 28 minutes; killed. See 5.4 |

(`tests/integration/dev-database-principals.test.ts`, the L1 detector, is now IN the gate at 16/0.)

**No suite outside the gate is turned red by this slice.** The class the charge names — "a suite the
slice turns RED that nobody ran" — has exactly one historical member, `dev-database-principals`, and
it is now in the gate.

### 5.3 Attributing the two failures — measured, not argued

Both fail **deterministically** at head, alone, on an idle machine, twice each:

```text
attempt 1  tests/integration/s7-authorization-database.test.ts :: Tests  1 failed | 11 passed (12)
attempt 1  tests/integration/session-database.test.ts          :: Tests  1 failed | 10 passed (11)
attempt 2  tests/integration/s7-authorization-database.test.ts :: Tests  1 failed | 11 passed (12)
attempt 2  tests/integration/session-database.test.ts          :: Tests  1 failed | 10 passed (11)
```

- `s7-authorization-database` → "locks every matching run before allocation while a rejected transfer
  is queued": `expected 1 to be greater than or equal to 2` (a `pg_stat_activity` lock-waiter poll,
  `tests/integration/s7-authorization-database.test.ts:940-950`).
- `session-database` → "runs the password-to-TOTP challenge through real Argon2 and creates one
  hash-only session": `UNEXPECTED_RISK_SIGNAL_FAILURE`.

Neither has a base frame (the intake baseline table lists neither), so I measured the attribution
rather than asserting it: I held migrations **0066–0071** out of `migrations/` in my worktree,
re-ran both, and restored (worktree 0 dirty, verified):

```text
no-S01-migrations  tests/integration/s7-authorization-database.test.ts :: Tests  1 failed | 11 passed (12)
no-S01-migrations  tests/integration/session-database.test.ts          :: Tests  1 failed | 10 passed (11)
```

Identical without the slice. **Both are the base's, dated `5b6cc9b1`; neither is this slice's.**

### 5.4 What I could not finish

`tests/integration/registration-database.test.ts` ran 28 minutes without producing a summary line
and I killed it by its own PID. It is Argon2-at-production-cost inside an integration suite. Reported
**UNVERIFIED** with the reason; it is not evidence either way, and it is not in the gate.

## 6. Findings

Both are non-blocking. Neither touches the fix; both are about what the loop runs.

### N1-p3 — the new regression test stops at the boot `Promise.all` (`tests/integration/fpd-s01-l1-boot-role-assertions.test.ts:73-82`)

The test asserts the six members of `apps/api/src/main.ts:123-131`. The boot path also runs
`assertSupportDatabaseRole(pool, supportPool)`, `assertSupportDatabaseRole(pool, supportRelayLeasePool)`
and `assertSupportKeyCoverage(supportPool)` inside `startup.run("support-attestation")`
(`apps/api/src/main.ts:573-576`). A migration that broke the **support** role instead of the erasure
role would leave this test green and the API still refusing to start — the exact shape of L1, one
role over.

**Measured:** my probe adds those three and they resolve at `86b391a0`, so nothing is broken today;
the gap is in the detector, not the product. The `SUPPORT_DATABASE_URL` principal is already in the
development catalogue the test provisions (`apps/runner/src/dev-database-principals.ts:67`), so the
remedy is three lines in the existing test.
VERDICT: non-blocking, ticket this pass / CONFIDENCE: high (measured both ways) / STRONGEST COUNTER:
the support attestation is covered by `tests/integration/support-shred.test.ts` and
`support-config-principals.test.ts`, which are green — the counter fails because neither is in any
slice's gate either, which is precisely how L1 survived.

### N2-p3 — two suites are RED at base with no baseline frame (`docs/missions/free-public-debates/00-intake.md`, "Baseline at `5b6cc9b1` in the lane")

`tests/integration/s7-authorization-database.test.ts` (11/12) and
`tests/integration/session-database.test.ts` (10/11) fail deterministically at base and are absent
from the intake baseline table, which lists 12 suites. A reviewer who runs either — as charge 6 made
me — has no frame and must invent an experiment to avoid filing a false regression against the slice
under review. I spent ~12 minutes and six runs doing exactly that.

**Remedy:** either the baseline table covers every suite a later pass may run, or a packet states the
rule I had to invent ("an unlisted suite's failure is attributed by measurement, not assumed"). The
class is "suites RED at base that no mission has ever framed"; the two above are the members this
sweep found.
VERDICT: non-blocking, ticket this pass / CONFIDENCE: high (measured) / STRONGEST COUNTER: framing
every suite in the repository at every intake is expensive — the counter fails because the frame is
only needed for the suites a pass actually runs, and that set is now known.

### Restated, not re-filed

- **C-N2** (`.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh:17-23`): raised at pass 1,
  restated at pass 2, still unchanged. My own sweep produced a `NO_SUMMARY` line — the same shape the
  runner would score `0/0` and read as RED rather than BROKEN. It is the protocol owner's file and
  remains correctly routed away from the slice.
- The packet's cursor defect I filed at passes 1 and 2 is **fixed**: line 8 says "1 comment (the
  orchestrator's DISPATCHED comment)", which matched `t_6199cf96` when I started.

## 7. What I did NOT verify

- `tests/integration/registration-database.test.ts` — see 5.4.
- The security/data-safety lens's items (privilege matrices beyond the erasure role, `R-20.4`).
- `SPEC-v3` §4 end to end, and V's real launch (`pnpm dev:auth:up`) — no stack was served and the
  packet forbids starting one; L1 was found on V's own launch, and only V can repeat that.
- The other lens's pass-3 output — not read.
- Whether `dev-database-principals` was red from the moment `0066` landed: the package frames it at
  `c358d494` (15/1) and I measure 16/0 at head; the C1-landing claim is INFERRED, not measured by me.

## 8. Predictions about the other lens

Security/data-safety is charged with the same L1 and will, I expect, verdict it ADDRESSED and then
push on the question I deliberately left in its lane: whether revoking the principal's direct EXECUTE
while the predicate still runs inside a `SECURITY DEFINER` body is a *narrowing* or merely a
*relocation* of the capability — I predict it concludes narrowing (correctly, since the definer body
is the audited entry point) but files an N asking for an explicit admission-matrix test under
`SET ROLE` for all six new `SECURITY DEFINER` functions of `0067`/`0070`, which is FIX-A's own
upgrade #2 restated. I also predict it notices that `0071` is a bare `REVOKE` with no accompanying
assertion that the *production* principal catalogue agrees — and that it will run
`production-database-principals.test.ts`, find it 32/32 as I did, and drop the point. My least
confident prediction: that it does not reach N2-p3, because attributing a base-red suite needs the
held-out-migrations experiment rather than a reading, and nothing in the packet suggests one.

## 9. Rows for V

None from this lens. L1 is ADDRESSED, the two findings are non-blocking and mechanical, and pass 3
closes without a REWORK.
