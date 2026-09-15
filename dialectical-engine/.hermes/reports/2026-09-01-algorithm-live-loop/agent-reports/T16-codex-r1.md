CODEX REVIEW T16 r1 — CHANGES · comments read through: t16-r1-2026-09-01

# CODEX REVIEW T16 r1

## VERDICT

**CHANGES — 4 BLOCKING, 3 NON-BLOCKING.**

The five J1 defaults are numerically present, the band map is the existing
`["CAPPED","FULL"]` vocabulary with `FULL→CAPPED`, the OpenAI/Anthropic/xAI map carries
explicit UNKNOWN behavior, and `register.bootstrap.json` has the identical base/HEAD blob.
The lane nevertheless cannot be approved: it reuses already-sealed register versions, two
role rows falsely cite J1, the startup-warning test never exercises a startup path, and the
consumer grep-proof misses both consumers and seeded values.

## FINDINGS

### B1 · BLOCKING · Existing sealed registers cannot receive the new rows

- **WHAT:** Both seeders reuse the same register identity that existed at the base. Concrete
  input → wrong outcome: an existing dev database with the base's sealed version 4 starts
  the new seeder → the persisted historical row count is compared with the new expected
  count (`+15`) → `DEV_DEPLOYMENT_REGISTER_DRIFT`. An existing acceptance version 1 starts
  the new seeder → the fifteen inserts occur in the transaction, the old version row keeps
  its old count through `ON CONFLICT DO NOTHING`, and the transaction rolls back with
  `ACCEPTANCE_REGISTER_VERSION_CONFLICT`.
- **WHERE:** `apps/runner/src/dev-deployment-register.ts:48,388-418,421-448`;
  `acceptance/seed-register.ts:11,307-360`; `migrations/0050_t16_algorithm_register_rows.sql:18-34`.
- **WHY:** Goal 80-95 requires new *sealed* rows via migration + seeding. Reusing a sealed
  version either mutates its meaning or, as these guards correctly do, refuses the change.
  The worker self-report §2.2 explicitly calls a 4→5 bump the classic correct move, then
  declines it because three fixtures need repair. That fixture work cannot take precedence
  over sealed-version identity. The repository already documents the acceptance conflict
  on any added row at `docs/missions/2026-08-17-accounts-privacy-security/RESEARCH-CONCLUSIONS.md:75-79`.
- **EVIDENCE:** Static version probe printed `base dev=4 / acceptance=1` and `HEAD dev=4 /
  acceptance=1`; `readExactState` rejects any persisted count unequal to the new
  `rows.length`; acceptance lines 329-355 retain the old version record and compare it with
  the expanded row list. Fresh-database tests do not create this state.
- **SUGGESTED FIX:** RED first with historical-state fixtures: seed a base-shaped sealed dev
  v4 and acceptance v1, run the new seeders, and require the historical versions to remain
  byte-identical while a new current version carries all fifteen rows. Mint a new version
  for every profile (one simple option is a common v5 so the strict bootstrap v1 and dev v4
  remain historical), update `introduced_in_version`, and repair the three
  `REGISTER_VERSION=4` replacement fixtures rather than preserving the bug.

### B2 · BLOCKING · The synthesizer/evaluator rows falsely attribute their values to J1

- **WHAT:** `synthesizerRoleRef` and `evaluatorRoleRef` receive
  `algorithm-live-loop-DECISIONS.md#J1` as their ruling provenance. J1 rules exactly five
  omitted defaults: dispersion scale, disagreement threshold, repeated-family multiplier,
  downgrade bands, and the provider/model family map. It does not choose the two role
  identities.
- **WHERE:** `packages/register/src/algorithm-policy.ts:71-79,171-180` and
  `migrations/0050_t16_algorithm_register_rows.sql:24-32`. The exact-value test at
  `tests/integration/t16-algorithm-register.test.ts:136-156` checks only that every source
  contains the deployment prefix, so it cannot catch the false ruling suffix.
- **WHY:** The packet's highest-priority question is faithful ruling implementation; a
  sealed row with a false ruling ref makes the replay/audit trail claim that the judge chose
  values J1 never mentions. Goal 91-93 rules only that the refs differ by default and warn
  if identical; the packet supplies the dev-provisional selection from configured provider
  identities.
- **SUGGESTED FIX:** Give the role rows a dedicated truthful provenance ref citing goal
  80-96 plus the configured-provider derivation/source symbol (and the deployment prefix),
  update the migration manifest refs, and assert the exact ruling suffix per row. Keep J1
  only on its five ruled values.

### B3 · BLOCKING · The "startup warning" test does not test startup

- **WHAT:** The warning exists only inside `readSynthesisRoleControls`. No application or
  acceptance startup path calls that function. The test inserts three rows and calls the
  reader directly, so a real startup with identical refs can emit nothing while this test
  remains green.
- **WHERE:** `packages/register/src/algorithm-policy.ts:433-463` and
  `tests/integration/t16-algorithm-register.test.ts:216-242`.
- **WHY:** Goal 91-95 and packet lines 18-19/53-55 explicitly require the identical-role-ref
  *startup warning + test*. Naming a direct reader test "startup" does not establish the
  entrypoint behavior.
- **EVIDENCE:** `rg 'readSynthesisRoleControls|SYNTHESIS_ROLE_REFS_IDENTICAL'` over
  `apps/`, `acceptance/`, and `packages/` returned only the constant, the function body,
  and barrel exports—no startup call site.
- **SUGGESTED FIX:** RED first through the actual boot/seeding entrypoint with an identical
  role fixture; wire that entrypoint to resolve/validate the role rows and assert one coded
  warning. Preserve the differing-ref silence arm. If the required entrypoint is outside
  the current no-consumer-wiring fence, the orchestrator must make that precise in the r2
  packet rather than accepting a library-only surrogate.

### B4 · BLOCKING · The consumer grep-proof does not discriminate the stated invariant

- **WHAT:** The test claims to keep "every sealed value" out of "every consumer source",
  but scans only judgement/serve/propagation and only nine decimal literals. It omits the
  runner (T9/T17), API structural-ceiling caller (T17), evaluator-loop max `3`, envelope
  inputs, bands, family behavior, and other row members. Concrete mutations that remain
  green include `const repeatedFamilyMultiplier = 0.5` in `apps/runner/src/index.ts` and
  `const evaluatorLoopMaxRounds = 3` even inside a scanned package.
- **WHERE:** `tests/architecture/t16-algorithm-register-rows.test.ts:11-26,37-52`.
- **WHY:** Goal 94-95 requires consumers to read register only, with grep-proof in test.
  T16 is the cross-cutting prerequisite; a test that allows T9/T17 or entire row families
  to hardcode their policy cannot enforce the DoD it claims.
- **EVIDENCE:** Independent static discrimination probe printed:
  `runner_in_surface=false`, `literal_3_pinned=false`,
  `runner_repeated_family_example_detected=false`, and
  `scanned_evaluator_round_example_detected=false`.
- **SUGGESTED FIX:** Extract a scanner with committed positive controls per row family and
  consumer surface; include at least `apps/runner/src` and the T17 API caller as well as the
  three packages. Use identifier/value-shape checks for generic integers so legitimate
  unrelated numbers are not banned, and prove each T3/T7/T9/T11/T17 hardcode mutant is
  detected.

### N1 · NON-BLOCKING · Full-suite evidence is unfinished and the report contains placeholders

- **WHAT:** The READY report contains `SUITE_EXIT_PLACEHOLDER`,
  `SUITE_RESULT_PLACEHOLDER`, and `SUITE_DETAIL_PLACEHOLDER`; `test-final.log` has neither a
  Vitest summary nor `TEST_EXIT`. The report was filed while that log was still incomplete.
- **WHERE:** worker report `agent-reports/t16-register.md:206-224,365-371` and
  `logs/t16/test-final.log`.
- **WHY:** Packet report-format/evidence accuracy. Under ruling D13 (DECISIONS 222-231), the
  judge-stage serialized full run is authoritative, so this gap is recorded but is not a
  blocker by itself.
- **SUGGESTED FIX:** Replace placeholders and the inaccurate "suite of record" statement
  with an explicit `D13-DEFERRED / CANNOT-ASSESS`; let the judge append the authoritative
  passed/total result after its serialized run.

### N2 · NON-BLOCKING · Packet cites a pre-provisioning report as failure authority

- **WHAT:** The worker packet directs failure classification to `t00-baseline.md` without
  the D9 caveat.
- **WHERE:** `packets/t16-register.md:38-45` versus mission DECISIONS D12 at `:214-220`.
- **WHY:** D12 says the lane's own unmodified-base runs are authoritative and the T0
  pre-provisioning counts are a trap record. This is a packet defect, not a worker defect.
- **SUGGESTED FIX:** Correct r2/future packet language to D12's authority chain. The defect
  class is already ticketed as board F9.

### N3 · NON-BLOCKING · Packet does not enumerate the acceptance seeding surface

- **WHAT:** The packet names only the dev deployment seeder/CLI although
  `acceptance/seed-register.ts` seals the ceremony register consumed by downstream
  acceptance DoDs. The worker had to infer ownership and extend a second seeder.
- **WHERE:** `packets/t16-register.md:31-37,60-61` and
  `acceptance/seed-register.ts:307-365`.
- **WHY:** Reviewer contract §1 requires unambiguous packet scope. The broad lane-worktree
  allowance made the edit legal, and the product now includes the acceptance rows, so this
  is not blocking the current diff; the packet still failed to state the real mandatory
  surface.
- **SUGGESTED FIX:** Future/rework packets must enumerate all register-version writers (or
  give the exact enumeration command and count) and state acceptance-seeder ownership
  explicitly.

## PACKET REVIEW

**NONCONFORMANT: N2 and N3.** The packet otherwise resolves from the seat cwd, its mandatory
deliverables fit the allowed surfaces, base `1c9578a` exists, the cited goal SHA-256 is
exact, goal lines 80-96 and the frozen S01 quote match, the s04/register anchors resolve,
and the five numeric/text J1 defaults are quoted correctly. Packet status `ready` is the
historical dispatch state; the board's current `waiting_review` state is authoritative and
consistent with this review.

## EVIDENCE CHECKED

- `git log --oneline 1c9578a..HEAD`: four `T16:` commits (`aa3f820`, `3e97449`,
  `414c734`, `ce20c4b`).
- `git diff --shortstat 1c9578a..HEAD`: `9 files changed, 1131 insertions(+), 25 deletions(-)`;
  scope is migration/register/dev seeder/acceptance seeder/tests only. `git status --short`
  was empty. `git diff --check` exited 0 with no output.
- Bootstrap probe: base and HEAD both resolve `register.bootstrap.json` to blob
  `b6b1cfe7409abdc642ae0b6548d0aad184da5531`; no bootstrap diff. Direct parse printed
  `bootstrap_version=1`, `bootstrap_key_count=5`, and exactly
  `nodeRuntimeVersion,pnpmVersion,postgresMajorVersion,typescriptVersion,vllmImageDigest`.
- Frozen goal SHA-256: `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`;
  SPEC quote and mission J1/D12/D13 checked line-by-line.
- J1 static probe: scale `1`, threshold `0.25`, multiplier `0.5`, bands
  `CAPPED→CAPPED`/`FULL→CAPPED`, families OpenAI/Anthropic/xAI, unmapped kind UNKNOWN,
  and unknown behavior `EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT` are present in both row
  builders' shared output.
- Worker RED log: `Test Files  1 failed (1)`, `Tests  7 failed (7)`, `RED_EXIT=1`.
  Its first failure is the desired fifteen-row seed expectation receiving `[]`; the other
  failures independently show missing manifest/function/module behavior on the base.
- Worker GREEN logs 1/2/3: each says `Test Files  4 passed (4)`,
  `Tests  20 passed (20)`, `GREEN_EXIT=0`; durations 84.57s/64.14s/66.07s.
- Missing-row DoD: green run 3 contains one named database rejection for each of
  `stopping`, `verdictLabel`, `synthesisRoles`, `panelWeighting`, and `envelope`; the reader
  arm enumerates the five corresponding typed `_UNRESOLVED` codes. The per-family loop is
  statically complete; B3 is specifically about the distinct startup-entrypoint promise.
- Typecheck log: `TYPECHECK_EXIT=0`. Full-suite attempt 1 says `TEST_EXIT=143`; final log
  has no summary/exit marker, governed by D13 as N1.
- Independent probes: unchanged version constants; historical-state data-flow trace;
  consumer-scanner discrimination output quoted in B4; startup call-site grep quoted in B3.

**NOT VERIFIED:** No pnpm/test command was run, as the packet expressly forbids it. The
judge's serialized full suite remains authoritative under D13. No external persistent
database or production deployment was mutated or inspected. Downstream consumer wiring is
not present in this lane and was evaluated only against T16's prerequisite surface.

## PREDICTIONS

I predict a judge concentrating on the five J1 values and the three 20/20 logs may miss B1
because every authored fixture starts from an empty database; the first check should be a
base-shaped sealed v4/v1 upgrade. I also predict a review may accept the words "startup
warning" and "every sealed value" at face value; the first refutations should be the
startup call-site grep and the two B4 synthetic hardcodes. Conversely, the incomplete full
suite may attract too much weight even though D13 explicitly moves that authority to the
judge stage.
