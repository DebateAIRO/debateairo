# Task 1 — BLIND review (Claude Opus 5) — the two adaptive-stopping thresholds, refitted (δ 0.01, ε 0.005)

SKILLS LOADED: superpowers:verification-before-completion

Package: commits `8d41d4db`, `04406d03`, `3a8193cb` via `review-task1.diff`.
Read-only review: the working tree, index, HEAD and branch state were not touched;
no mutants were run; `acceptance/.pgdata` was never opened, listed, copied or served.

---

### Spec Compliance

**O1 — the two values, their ruling ref, the header comment, no consumer constant — ✅**

- `packages/register/src/algorithm-policy.ts:264-265` carries
  `delta: 0.01` / `epsilon: 0.005`, each `sourceRef: ref(T16_REFIT_RULING_REF)`.
  Matches D77 (c) verbatim (`DECISIONS.md:3714`: "`globalStopDelta` 0.02 → **0.01**;
  `branchFreezeEpsilon` 0.01 → **0.005**").
- `packages/register/src/algorithm-policy.ts:99` declares
  `T16_REFIT_RULING_REF = "algorithm-live-loop-DECISIONS.md#D77"`, shaped like its
  siblings (`:100` `T16_JUDGE_RULING_REF`) and carrying no machine path — V's
  2026-09-17 rule is respected everywhere in this diff (the one temp directory the
  new acceptance test needs is deduced: `mkdtemp(join(tmpdir(), …))`,
  `acceptance/runtime-policy.test.ts:350`).
- Header comment `packages/register/src/algorithm-policy.ts:20-38`: I checked every
  factual claim in it against D77 (b)/(c) — "SEEDED" vs "REFITTED", the 0.0113
  margin, "four of the six plan branches", δ = 2ε, and the explicit statement that
  the J2 companions are **not** refitted and keep J1. All true; nothing is
  overstated.
- No code constant for δ or ε outside the row. My own sweep, not the report's:
  `grep -rn "0\.005\b" packages apps acceptance --include='*.ts' | grep -v '\.test\.'`
  returns only `algorithm-policy.ts:265` (the row) plus two lines of that same
  file's provenance header. `GLOBAL_STOP_DELTA|BRANCH_FREEZE_EPSILON` across
  `packages apps acceptance tests` returns only the row, the two zod schemas
  (`:387-388`), the error codes, and the two new tests' deliberate old-value
  fixtures.

**O2 — the new values reach the next real run on this host — ✅ (this is the crux; traced end to end)**

I followed the whole path rather than trusting the report:

1. `acceptance/seed-register.ts:429` seeds through
   `createPostgresRegisterPublicationPort(pool).importHistorical({ registerVersion: <the pin> })`.
2. `packages/register/src/register-publication.ts:777-783` forwards to
   `register.import_historical_register_version`.
3. `migrations/0055_register_support_publication.sql:1343-1409`: if the version
   already exists it must replay byte-identically or raise
   `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` — so the seed can
   neither overwrite nor merge a sealed version. The implementer's central claim
   ("sealed means immutable per version, therefore a refit is a new version") is
   **correct**, and the ruled option (b) follows from it.
4. On a machine holding version 2 sealed with the old pair, the import of version 3
   inserts the rows first (`:1387-1394`) and the `register_version` row second
   (`:1400-1401`). The `BEFORE INSERT` trigger
   `register._algorithm_publication_profile_guard`
   (`migrations/0061_algorithm_publication_profiles.sql:19-30`) therefore sees the
   T16 rows already present, declares `(3,'algorithm')` and runs
   `assert_required_rows(3)`, which passes on the full fifteen. Version 2 is not
   read and not touched.
5. **Every reader is on the constant — I found no literal `2` at any reader site.**
   `grep -rn "ACCEPTANCE_REGISTER_VERSION"` over the engine: `acceptance/main.ts:488,503,598`,
   `acceptance/runtime-policy.ts:222,231,266,282,291-295,307,318`,
   `acceptance/review-catch-up.ts:115`, `acceptance/eval-harness-cli.ts:141`,
   `acceptance/ceremony.test.ts:346,351,361,696`,
   `acceptance/dual-maker-proof.test.ts:131`, `acceptance/panel-multi-maker.test.ts:322,442`
   — all the symbol. The only literals `2` are the two new tests' deliberately named
   `STANDING_ACCEPTANCE_REGISTER_VERSION`
   (`tests/integration/t16-algorithm-register.test.ts:540`,
   `acceptance/runtime-policy.test.ts:336`), which is the right call and is
   commented as such, and the pre-existing `tests/integration/t16-algorithm-register.test.ts:245-252`
   (see Minor 3).
6. Second-order effect nobody named, checked and cleared: the pin doubles as
   `factBundleVersion` → `answer_version` (`acceptance/main.ts:488`;
   `packages/serve/src/index.ts:2070`). Every consumer queries by an
   `(answer_id, answer_version)` pair it is handed (`acceptance/dod-facts.ts:487`,
   `packages/serve/src/index.ts:2379,2438,2698,…`); nothing assumes the value 2 and
   nothing joins across versions, so runs written at 3 are benign beside the
   owner's rows at 2.

**The operator paragraph is accurate.** An operator with tonight's `.pgdata` gets a
new sealed version 3 minted beside the untouched version 2, and the ceremony reads
δ 0.01 / ε 0.005 from it — no reset, the 2026-09-17 run database survives.

**O3 — tests, RED first — ✅**

Every new assertion is one a mutation would break, and I checked each for the
"cannot fail" failure mode:

- `tests/integration/t16-algorithm-register.test.ts:306-329` asserts D77's citation
  set in **both** directions (`citing(RULING_D77)` is exactly the two keys and
  `citing(RULING_GOAL)` is exactly the other five). Reverting either ref empties the
  first list. Real.
- `:542-577` constructs the genuine article, not a cousin: it seals a **complete**
  acceptance publication row-set at literal version 2 via
  `buildAcceptanceRegisterPublicationRows()` with only the two rows swapped back to
  0.02/0.01 and the superseded goal ref, then seeds. That is the owner's database
  shape. With the pin back at 2 the seed throws drift and the test goes red — which
  is the report's mutant 6, and is exactly what `0055:1343-1374` would do.
- `:579-596` (fresh database) asserts versions 1 and 2 are absent. The assertion
  bites: `readVersionSnapshot` (`:433-447`) returns `version: version.rows[0]`, i.e.
  `undefined`, and `rows: []` for a version that does not exist.
- `acceptance/runtime-policy.test.ts:338-378` is the end of the chain — the same
  standing shape, then `readAcceptanceRuntimePolicy`, asserting `delta`, `epsilon`,
  `registerVersion` **and** both `sourceRefs`, plus that version 2 still holds the
  old pair. It stands a real standing database up in a temp directory and tears it
  down in `finally`.
- `tests/architecture/t16-algorithm-register-rows.test.ts:41-49` is a positive
  control that fails if `0.005` leaves `SEALED_DECIMALS`.

**O4 — sweep classification — ✅.** I ran the sweeps independently and reached the
same split. The ~38 `epsilon: 0.01` hits in `tests/unit/t07-adaptive-stopping.test.ts`
are that test's own chosen thresholds (the file says so at `:18-22`) and correctly
stay. No sealed-default pin was left on the old pair: the only surviving
`delta: 0.02` / `epsilon: 0.01` in the tree are the two new tests' standing-database
fixtures. The two O5 suites I could most easily imagine hiding a stale pin —
`tests/unit/deployment-register-family-wiring.test.ts` and
`tests/integration/t17-envelope-ledger.test.ts` — contain no `0.02`/`0.01`/`0.005`
at all. No JSON/snapshot fixture carries the pair (the only non-TS hit for
`globalStopDelta` anywhere is `migrations/0050`, the manifest — see Minor 1).

**O5 — gate, three runs, both typechecks — ✅ (accepted on the implementer's
evidence, per my instructions not to re-run suites).** All five named suites plus 16
more, 3×, `Test Files 21 passed (21) / Tests 267 passed (267)`; `pnpm run typecheck`
exit 0 and `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` exit 0. The report
also discloses, correctly, that the four `acceptance/run-acceptance.test.ts` failures
seen in a probe run belonged to another seat mid-edit and were green by the gate —
that matches the dispatch's own warning and is not this task's.

**Extended charge — `ACCEPTANCE_REGISTER_VERSION` 2 → 3 — ✅.**
`acceptance/seed-register.ts:45`. The reasoning recorded at `:20-44` is verifiable
and true, including the two migration line cites. `ACCEPTANCE_HISTORICAL_REGISTER_VERSION`
correctly stays 1: I confirmed the claim "nothing reads it" independently —
`grep -rn "ACCEPTANCE_HISTORICAL_REGISTER_VERSION"` over the whole engine returns
**only** its own declaration (`acceptance/seed-register.ts:51`). So "a fresh database
seeds at the pin alone, versions 1 and 2 never exist" is harmless for every reader:
there are none, and the bootstrap rows ride in the pinned version itself
(`acceptance/seed-register.ts:400-416`), so no ceremony reader ever needs version 1
to exist. That behaviour is also unchanged by this diff — it was already true at pin 2.

**Risk (3), confirmed as asked, no change requested.** `importHistorical` refuses any
version above 4: `packages/register/src/register-publication.ts:777`
(`if (BigInt(registerVersion) > 4n) fail(...)`) and
`migrations/0055_register_support_publication.sql:1288`
(`OR p_register_version NOT BETWEEN 1 AND 4`). Both line cites in the code comment
are exact. After this bump **exactly one rung (4) is left**, and the fact is written
where the next person will meet it (`acceptance/seed-register.ts:39-44`,
`acceptance/README.md`).

**Risk (4), provenance — ✅.** Only the two refitted rows moved ref; the other
thirteen are untouched in the diff and are pinned in both directions by the new test.
The header comment is true. No consumer carries a constant for either value, and the
scanner now enforces it.

**⚠️ Could not verify from the diff (not defects — recorded so the gate knows what is
unwitnessed):**

- The real `acceptance/.pgdata` — correctly never opened. Every "standing database"
  claim is proved on a rebuilt shape. If the live directory differs in some other
  row, the version-3 import is unaffected (it reads nothing from version 2), but no
  one has seen it.
- No live ceremony ran. The chain is proved as far as `readAcceptanceRuntimePolicy`,
  the value `acceptance/main.ts:503,598` hands the runner — not through a real run.
- The three-run gate and both typechecks are report-sourced; I did not re-run them.
- All runs are on Node v26.5.0; the Node 22.23.1 run remains owed at mission level.
- D77 (b)(6)'s structural fact stands: at depth 2 the δ-stop cannot fire, so a
  depth-2 ceremony witnesses ε only, never the new δ. The implementer flagged this
  themselves (concern 3). Not a defect of this task; relevant to what the re-run can
  prove.

---

### Strengths

- **The hard question was answered correctly, and for the right reason.** "Sealed
  means immutable per version, so a refit is a new version" is not a convenience —
  it falls out of `0055:1343-1374`, and I verified it does. Choosing the bump over
  resetting the standing data directory protected the owner's 2026-09-17 run
  database, which was the whole point.
- **The BLOCKED report was correct and precise.** The brief genuinely mis-located the
  constant; the implementer measured it, named the exact line, explained why the two
  lines the brief *did* name are readers, and stopped instead of writing outside
  scope. That is the behaviour the process is for.
- **J8 is honoured in both directions.** The new test at `:306-329` does not merely
  assert that δ and ε cite D77; it asserts that *nothing else* does and that the
  other five still cite the goal. That is the shape a "false ref is audit poison"
  rule actually needs.
- **The literal `2` in the two new tests is right, and is explained.** Using the
  constant there would have made the tests vacuous the moment the pin moved again;
  the comments at `tests/integration/t16-algorithm-register.test.ts:536-539` and
  `acceptance/runtime-policy.test.ts:334-335` say exactly that. This is the
  difference between a test that constructs the real state and a convenient cousin,
  and this one constructs the real state — a complete publication row-set with only
  the two values reverted.
- **The mutant matrix reasons about its own weakness.** Mutant 4's note — that
  mutants 1 and 2 individually cannot refute the standing-database assertion because
  the row-sets still differ, so only reverting both values *and* both refs does —
  is a genuinely careful piece of refutation design.
- **The scanner extension was the right instinct.** Without `0.005` in
  `SEALED_DECIMALS` the O1 grep-proof would have passed for a consumer hard-coding
  the *new* ε. The regex is properly bounded
  (`tests/support/t16PolicyScanner.ts:96`: `(?<![\d.])0\.005(?![\d])`), so the added
  entry cannot false-positive on `0.0055` or `10.005`, and it collides with neither
  `0.05` nor `0.5`.
- **Self-disclosure was complete.** Both problems I found independently — the
  migration manifest's now-stale provenance and the version-3 profile gap — were
  already in the report, measured with real output, with the correct remedy named and
  correctly declined as out of scope. I found nothing the report concealed and
  nothing it overstated.

---

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

None.

#### Minor (Nice to Have)

**1. The required-row manifest now names a ruling that no longer chose those two
values.** `migrations/0050_t16_algorithm_register_rows.sql:32-33` declares
`('globalStopDelta','stopping','goal-v4-2026-09-01:80-96')` and the same for
`branchFreezeEpsilon`, under a comment at `:28-30` that reads "Each row cites the
ruling that ACTUALLY chose its value… A sealed row naming a ruling that never
mentioned its value is audit poison." After D77 (c) that is precisely the false-ref
shape, living in the manifest instead of in the sealed row. *Why it is Minor and not
Important:* nothing reads that column — `assert_required_rows`
(`migrations/0050:58-91`) selects only `row_family`/`row_key`, and no TypeScript
selects `required_row.source_ref` (I grepped). The sealed rows the readers actually
surface carry D77 correctly. *Fix:* a migration updating those two `source_ref`
values; `migrations/**` is out of scope tonight by the orchestrator's own ruling, so
this is a ticket. The implementer disclosed it (concern 2). **Already on the board**
as `F-T16-MANIFEST-PROVENANCE-STALE` (queued, unassigned).

**2. Version 3 is not declared in `required_row_version`, so the all-rows-missing
seal is no longer refused at seal time.** `migrations/0050:49-52` declares
`(5,'development')` and `(2,'acceptance')` — not 3. Version 3 gets a profile only
from `register._algorithm_publication_profile_guard`
(`migrations/0061_algorithm_publication_profiles.sql:19-30`), whose first test is
"does this version already carry at least one required row"; its second test,
`profile.register_version IN (NEW.base_register_version, NEW.register_version)`,
cannot help on the historical path because that path never sets
`base_register_version` (`migrations/0055:1400-1401`; the replay check at `:1352`
asserts it is NULL). **My severity call: ticket it, do not block this task.** I
reached the same measurement independently and it is narrow in exactly the way the
implementer reported: every PARTIAL case is still refused at seal (one T16 row
present ⇒ the guard declares the profile and asserts); the shipped seeder cannot
produce the zero case, since `buildAcceptanceRegisterPublicationRows`
(`acceptance/seed-register.ts:400`) always emits all fifteen; and the mission's
"missing rows fail loudly" still holds end to end, because every reader refuses
loudly at READ — `readFamily` throws `<FAMILY>_UNRESOLVED` naming the missing keys
(`packages/register/src/algorithm-policy.ts:496-500`), so no ceremony can run on a
deficient register, it merely fails later than it used to. What is lost is
belt-and-braces at the seal, and the only fix is a migration the orchestrator
forbade tonight. *Ticket:* add `(3,'acceptance')` to `register.required_row_version`
— same migration as Minor 1. **Not yet on the board:** no ticket in
`.hermes/reports/2026-09-01-algorithm-live-loop/board/` mentions
`required_row_version`, so unlike Minor 1 this one still needs filing (or folding
into `F-T16-MANIFEST-PROVENANCE-STALE`, whose migration would carry it for free).

**3. A pre-existing guard test silently stopped covering the ceremony's version.**
`tests/integration/t16-algorithm-register.test.ts:245-252`, "rolls back historical
acceptance publication when all required algorithm rows are missing", uses a
hard-coded `2` for what it calls the acceptance version. It still passes — because 2
is still declared in the manifest — but it no longer exercises the version the
ceremony seeds, and by Minor 2 the same scenario at the live pin would seal
silently. The test's name now claims coverage it does not have. *Fix (cheap and in
scope):* one line of comment at `:245` saying the literal is the manifest-declared
version and no longer the pin, cross-referencing the migration ticket; retarget it to
`ACCEPTANCE_REGISTER_VERSION` in the same change that lands `(3,'acceptance')`, at
which point it will pass for the right reason. (Related but *not* a defect:
`:347-353` "leaves a version the manifest does not govern untouched" names only dev 4
and ceremony 1 — still true, merely no longer exhaustive.)

**4. The standing-database fixture is duplicated verbatim across two files.**
`tests/integration/t16-algorithm-register.test.ts:543-552` and
`acceptance/runtime-policy.test.ts:339-348` build the same pre-refit row-set with the
same two swaps. They must move together the next time the pin or the pair changes. A
shared helper beside `registerFixtureRow` would keep them in step. In the same spot,
`acceptance/runtime-policy.test.ts:339` writes the goal ruling as a bare string
literal where its sibling file uses the named `RULING_GOAL`
(`tests/integration/t16-algorithm-register.test.ts:54`) — worth a named constant for
consistency.

**5. `SEALED_DECIMALS` no longer means what its name says.**
`tests/support/t16PolicyScanner.ts:44-48` now holds "every decimal T16 seals **plus**
`0.02`, the superseded δ seed". Keeping `0.02` banned is the right decision — a
consumer restating the value the refit moved off is exactly as wrong — and the
comment says so, but the constant's name now under-describes it. Consider
`BANNED_POLICY_DECIMALS`, or splitting sealed from superseded. Purely cosmetic; the
positive control at `tests/architecture/t16-algorithm-register-rows.test.ts:34-40`
depends on the entry either way.

**Scope check (no issue found).** Every write in the package is inside the extended
allowed list: `packages/register/src/algorithm-policy.ts`;
`tests/integration/t16-algorithm-register.test.ts`;
`acceptance/seed-register.ts` (the version constant and the comments stating it —
nothing else in that file changed); `acceptance/runtime-policy.test.ts` (a test that
pins the version); `acceptance/README.md:44-46,163-165,168-183` (the version and the
two "reset the standing data directory" passages, exactly as extended);
`tests/support/t16PolicyScanner.ts` (the accepted `0.005` addition) and its positive
control in `tests/architecture/t16-algorithm-register-rows.test.ts`. **No write to
`migrations/**`** — I confirmed the diff touches none, and the two findings that
would need one were correctly declined. `acceptance/main.ts` was not modified and did
not need to be.

---

### Assessment

**Task quality: Approved**

The refit is correct against D77 (c), the provenance discipline J8 demands is
enforced in both directions, and the genuinely hard part — proving the new pair
reaches a ceremony on a machine already holding version 2 sealed with the old pair —
is solved the way the register's own design requires and is tested on the real
database shape rather than a convenient cousin; I traced that path independently
through the seeder, the migration function, the profile trigger and every reader, and
found no reader carrying a literal version. The two real gaps left behind (the
manifest's stale ruling ref, and version 3's missing static row profile) are both
inert today, both fixable only in `migrations/**` which was forbidden tonight, and
both were measured and disclosed by the implementer before I looked — they belong in
one migration ticket, not in a fix round.
