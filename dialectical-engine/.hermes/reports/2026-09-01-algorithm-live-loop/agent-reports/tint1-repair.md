REWORK READY FOR REVIEW — TINT1 r2 · comments read through: tint1-codex-r1-2026-09-01
report sha256: 73c05e4e3a24d296df179b6b8b692ab7900e66c278b155a357cca45b0aa4984c

# TINT1 REPAIR r1 — five b7 cross-lane regressions

Seat TINT1 · PROGRAMMING loop · Opus 5 · session `opus-tint1-w5`.
Base: integration tip **`7433be7`** · branch `lane/tint1` · **tip `af58ac1`**.
Self-report `## r1` filed at `agent-reports/tint1-repair-self.md` before this marker.
Logs: `logs/tint1/`. **No live provider calls.**

RED = the five as dispatched; the readonly `logs/b7-solo-*.log` are cited as the
evidence throughout. **All five repaired. No landed lane's assertions weakened.
No product-behaviour conflict between lanes emerged, so no ruling is needed.**

---

## ROOT CAUSES — one structural, and it is why the other three existed

### THE STRUCTURAL ONE · `acceptance/` was never type-checked

`tsconfig.json` `include` was `apps · packages · tools · tests` — **`acceptance/`
is absent.** T5 made `edges` a REQUIRED field on `NodeReviewInput` and pinned the
`edge_bearings` response length, then verified it with a root typecheck and two
D16 surface gates, **none of which can see `acceptance/`**. Three of the five
regressions live there, and a fourth is a plain missing-argument type error that
no gate in the repository was positioned to catch.

Measured before taking it (`logs/tint1/probe-acceptance-typecheck.log`): adding
`acceptance/**/*.ts` to the include produces **exactly ONE error** — the DELIM-01
defect itself. Taken. The class is now closed at the compiler.

### The five

| # | failure | root cause | mine? |
|---|---|---|---|
| 1+2 | `panel-multi-maker` — both T3 acceptance tests, `NODE_REVIEW_UNAVAILABLE` | its review double returned `{outcome, reasons}` with no `edge_bearings`; T5's strict parser refused and the run died | **yes, T5** |
| 3 | `adversarial-corpus > DELIM-01` — `TypeError: Cannot read properties of undefined (reading 'length')` at `judgement/src/index.ts:368` | `judge.review({…})` called with **no `edges` argument at all** — a type error invisible because `acceptance/` is untypechecked | **yes, T5** |
| 4 | `ceremony > ACC-01`, `NODE_REVIEW_UNAVAILABLE` | same review-shape class as 1+2 — its `reviewDouble` factory predates the schema | **yes, T5** |
| 5 | `dev-database-principals` — nine SCRAM LOGINs, `CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED` | **unrelated to the review schema.** `0040_account_erasure.sql:6273` sweeps `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC` **once**; T5's `0052` minted `core.reject_edge_mutation_except_measurement()` twelve migrations later, so it kept PostgreSQL's default PUBLIC EXECUTE grant. That put a **seventh** core function inside the content-provision role's reach, and `assertContentProvisionDatabaseRole` requires **exactly** the six ruled provision signatures | **yes, T5** |

All five trace to the T5 lane. Failure 5's mechanism is the one nobody
hypothesised and is worth stating plainly: **a one-time `REVOKE … ON ALL
FUNCTIONS IN SCHEMA` sweep is not a standing policy** — every function minted
after it must revoke for itself, which every other post-0040 migration does and
`0052` did not.

---

## RED — as dispatched

| # | log (readonly authority) | verbatim |
|---|---|---|
| 1+2 | `b7-solo-panel-multi-maker.log:105-128` | `PANEL_WORK_FAILED:ACCEPTANCE_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE:unclassified=[]` · `PANEL_DEGRADED_WORK_FAILED:…:NODE_REVIEW_UNAVAILABLE` — `Tests  2 failed (2)` |
| 3 | `b7-solo-adversarial-corpus.log:20-27` | `TypeError: Cannot read properties of undefined (reading 'length')` ❯ `Judge.review packages/judgement/src/index.ts:368:57` — `Tests  2 failed \| 9 passed (11)` |
| 4 | `b7-solo-ceremony.log:120-121` | `ACCEPTANCE_WORK_FAILED:ACCEPTANCE_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE` — `Tests  1 failed \| 1 passed (2)` |
| 5 | `b7-solo-dev-database-principals.log:173-180` | `Caused by: TypeError: CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED` ❯ `assertContentProvisionDatabaseRole packages/db/src/index.ts:241:11` — `Tests  1 failed \| 8 passed (9)` |

---

## THE REPAIR — contracts made to MEET, nothing weakened

**The default bearing policy is `cannot-assess`, and that is the load-bearing
choice.** Null bearings leave their edges UNKNOWN, contribute nothing to
propagation, and therefore leave **T3's panel numbers and the ceremony's numbers
byte-identical to the day those lanes landed**. Defaulting to a numeric bearing
would have silently moved numbers inside two lanes I do not own while the suite
went green — a weakening disguised as a repair.

| file | change |
|---|---|
| `tsconfig.json` | `acceptance/**/*.ts` joins the root include — the structural cause |
| `tests/support/reviewBearings.ts` *(new)* | one definition of the review wire shape: reads `edges_sourced_by_this_node` off the live request, expands a declared POLICY into one bearing per offered edge, honouring each edge's own polarity |
| `acceptance/panel-multi-maker.test.ts` | its review double answers `bearingsForRequest(body)` — the edges THAT call offered |
| `acceptance/ceremony.test.ts` | `reviewDouble` declares a policy; the double resolves it against the request, exactly as `database.test.ts` does |
| `acceptance/adversarial-corpus.test.ts` | DELIM-01 states `edges: []` — it reviews a bare statement that sources no graph edge, so empty is the true state, not a stand-in; its relay fixture returns `edge_bearings: []` |
| `migrations/0052_…sql` | `REVOKE ALL ON FUNCTION core.reject_edge_mutation_except_measurement() FROM PUBLIC;` with the 0040 sweep cited |

**DELIM-01 got STRONGER, not looser.** Its untrusted-fields assertion now also
pins `edges_sourced_by_this_node`, so the probe guards what it exists to guard:
the edge material is model-authored and must stay inside the versioned
untrusted-data envelope rather than being concatenated into instruction text.

---

## GREEN — solo

| # | command | result | log |
|---|---|---|---|
| 1+2 | `vitest run acceptance/panel-multi-maker.test.ts` | **`Tests  2 passed (2)`** | `green-1-2-panel.log` |
| 3 | `vitest run acceptance/adversarial-corpus.test.ts` | **`Tests  1 failed \| 10 passed (11)`** — the 1 is the boarded DB-01, left untouched as instructed | `green-3-adversarial.log` |
| 4 | `vitest run acceptance/ceremony.test.ts` | **`Tests  2 passed (2)`** | `green-4-ceremony.log` |
| 5 | `vitest run tests/integration/dev-database-principals.test.ts` | **`Tests  9 passed (9)`** | `green-5-principals.log` |

## GREEN — combined, ×3, set-equal

```
vitest run acceptance/panel-multi-maker.test.ts acceptance/adversarial-corpus.test.ts \
           acceptance/ceremony.test.ts tests/integration/dev-database-principals.test.ts

run 1:  Tests  1 failed | 23 passed (24)
run 2:  Tests  1 failed | 23 passed (24)
run 3:  Tests  1 failed | 23 passed (24)
```

**Set-identical across all three runs** (`diff` empty both ways). The single
failure in every run is `adversarial-corpus > DB-01`, the boarded pre-existing
one the ticket instructed me to leave.

### Paired-payload proof — the 23-authority file I entered

`acceptance/adversarial-corpus.test.ts` carries the boarded DB-01 failure, so
entering it requires proving its payload unmoved:

```
BEFORE (logs/b7-solo-adversarial-corpus.log, readonly authority)
AssertionError: expected [ 'HOME', 'OLDPWD', 'PATH', …(2) ] to deeply equal [ 'HOME', 'LANG', 'OLDPWD', …(3) ]

AFTER  (logs/tint1/green-3-adversarial.log)
AssertionError: expected [ 'HOME', 'OLDPWD', 'PATH', …(2) ] to deeply equal [ 'HOME', 'LANG', 'OLDPWD', …(3) ]

diff → empty.  BYTE-IDENTICAL.
```

`logs/tint1/paired-db01-{before,after}.txt`. No other file I entered is in the
23-authority set.

---

## SUITES

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` **(now including `acceptance/`)** | **0 errors** | clean, and covering more than it did |
| T5 seal probe gate `-p t05-half-write-probes` | **5 errors, exit 1 — REQUIRED** | the T5 r4 half-write seal still holds |
| **D16** `apps/ui/tsconfig.json` | **1 error** — `apps/ui/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| **D16** `web/tsconfig.json` | **1 error** — `web/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| combined ×3 | `1 failed / 23 passed (24)` in all three, set-identical | the 1 is boarded DB-01 |
| regression sweep (all `acceptance/` + `tests/architecture` + the T5 zone) | `10 failed / 557 passed (567)` | every one pre-existing — see below |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | D13 `max_concurrent_heavy = 1`; host load 9.52 |

### The sweep's 10, proving "everything else untouched"

Nine are the boarded set (DB-01 · the four architecture class-A rows · both
`scaffold.test.ts` rows, payloads still exactly the three `obs-capture`
dependency edges and three `obs-capture` env reads · `database.test.ts`
happy-path base-red · `xrev01` envelope base-red).

The tenth is **`acceptance/dual-maker-proof.test.ts > FAIR-02`**, failing
`CODEX_CLI_MODEL_UNRESOLVED` — a live-CLI/host dependency. **It was already
failing in the b7 suite at `integration-suite-b7.log:4863`, with the same
cause**, and it is not one of my five. Untouched, and flagged below because it
was not on the dispatched list.

---

## FINDINGS

**F-TINT1-1 · `acceptance/` was outside every type gate (FIXED, and it is the
mission's cheapest structural win).** One tsconfig line, one pre-existing error,
and the entire class of "a lane changed a contract and acceptance never knew"
closes at the compiler. This is my own **F-T5-9** — which named `acceptance/` in
its proposed remedy — materialising because I wrote the remedy and never ran it.

**F-TINT1-2 · a one-time `REVOKE … ON ALL FUNCTIONS IN SCHEMA` sweep reads as a
standing policy and is not (non-blocking, class).** `0040:6273` protects only
what existed at 0040. Same shape as T5's one-way-door finding: a schema fact
that looks permanent and is a point-in-time statement. Proposed standing packet
clause: *any migration creating a function in a swept schema must revoke for
itself, and say so.*

**F-TINT1-3 · the bearings helper now exists twice (non-blocking).**
`tests/integration/database.test.ts` still carries the inline copy from T5 r2;
`tests/support/reviewBearings.ts` is the shared one. I did NOT consolidate,
because that file is green and the ticket says everything else stays untouched.
It will drift; it should be consolidated in a lane that owns that file.

**F-TINT1-4 · `acceptance/` importing `tests/support/` is a new precedent
(non-blocking, disclosed).** There was none before. One definition of the wire
shape beat three copies, and `acceptance/` is now type-checked so the import is
verified. Naming it so it is a decision rather than a discovery.

**F-TINT1-5 · the dispatched failing set was incomplete (non-blocking, process).**
`FAIR-02` fails in the same b7 run and was not among the five. A repair ticket
should state the **complete** failing set of the run it repairs, marking which
rows are in scope, so the seat can distinguish "not mine" from "not mentioned."

---

## COMMITS

Branch `lane/tint1`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `af58ac1` | `TINT1: make the merged lanes' contracts meet — five b7 regressions repaired` |

Six files: `tsconfig.json` · `migrations/0052_t5_reviewer_measured_edges.sql` ·
`acceptance/{panel-multi-maker,ceremony,adversarial-corpus}.test.ts` · new
`tests/support/reviewBearings.ts`. Working tree clean at close.

---

# r2 — codex r1 B1: the PUBLIC revoke becomes a FORWARD migration

Seat TINT1 · PROGRAMMING loop · Opus 5 · session `opus-tint1-w5b` — a **FRESH seat**;
the r1 seat was killed by the opus-5 weekly limit (D22) mid-verification. Base
`7433be7` · inherited `af58ac1` + orchestrator checkpoint `eed6ebf` · **tip `fbd5f50`**.
Self-report `## r2` filed at `agent-reports/tint1-repair-self.md` before this marker.
Logs: `logs/tint1/r2b-*`. **No live provider calls.** Rework round 1 of 3.

**B1 accepted in full.** Landed `0052` is restored byte-identical; the revoke is now
forward migration `0054`; an upgrade fixture starting from a ledger that already records
`0052` is RED before `0054` and GREEN after. N1 is my own r1 F-TINT1-5, restated below;
N2 and N3 are orchestrator/packet items and are ledgered, not mine to fix.

## WHAT I INHERITED, AND WHAT I DID WITH IT

The killed seat left three files as wip commit `eed6ebf` (archived diff:
`logs/rl-checkpoint/tint1-uncommitted.diff`). **Migrations kept; fixture rewritten.**
It was green on the repaired tree and wrong in three ways, none of which a passing run
would show. All three are named in the self-report; the load-bearing one:

> the inherited fixture built its "already applied 0052" state by **replaying the
> migrations as they sit in the working tree**. On the `af58ac1` placement codex
> rejected, that applies the *amended* `0052`, which revokes — so the arm failed on its
> own premise, and would have gone **silently green** for anyone who amended `0052`
> again. An upgrade fixture must STATE the state it upgrades from, never re-derive it by
> replaying the tree under repair.

I now state it: `GRANT EXECUTE ON FUNCTION … TO PUBLIC`, which is PostgreSQL's default
for a newly created function and therefore exactly what the landed `0052` left behind.

## THE REPAIR

| file | change |
|---|---|
| `migrations/0052_t5_reviewer_measured_edges.sql` | **restored byte-identical to `7433be7`** — the r1 amendment reverted |
| `migrations/0054_tint1_reject_edge_mutation_public_revoke.sql` *(new)* | the signature-specific `REVOKE ALL ON FUNCTION core.reject_edge_mutation_except_measurement() FROM PUBLIC`, with the mechanism, the ledger argument, and the numbering argument in-file |
| `tests/integration/tint1-upgrade-migration.test.ts` *(new)* | the upgrade fixture, three arms |

**Why a forward migration.** The production migrator keys its ledger on the file NAME
and skips any already recorded (`packages/db/src/index.ts:730-732`). A database that
applied `0052` — every database carrying T5 — never re-executes that file, so an
amendment to it is **inert exactly where the exposure lives**. Repository precedent
agrees: `0005_s04_rework.sql` and `0009_s06_rework.sql` are both forward corrections to
landed files.

**Why `0054`, not the `0053` codex named.** `lane/t6` holds
`0053_t06_review_outcome_disclosure.sql` (`b479f7e`), unlanded at this base — verified by
sweeping every branch, not by trusting the inherited comment. Codex reading only
`7433be7` correctly saw `0053` free; the fleet's next free number is `0054`. Taking
`0053` would collide on merge.

### `0052` BYTE-IDENTITY — the proof, run from the worktree root

```
$ git ls-tree --name-only 7433be7 -- dialectical-engine/migrations/0052_t5_reviewer_measured_edges.sql
dialectical-engine/migrations/0052_t5_reviewer_measured_edges.sql
$ git diff 7433be7 -- dialectical-engine/migrations/0052_t5_reviewer_measured_edges.sql
$ git diff --exit-code 7433be7 -- dialectical-engine/migrations/0052_t5_reviewer_measured_edges.sql; echo exit=$?
exit=0
$ git show 7433be7:…0052… | shasum -a 256
8bac8db7f2091ae3689857afa060510a3ee44be427ec0d14e0ef78b65d03e8f3  -
$ shasum -a 256 dialectical-engine/migrations/0052_t5_reviewer_measured_edges.sql
8bac8db7f2091ae3689857afa060510a3ee44be427ec0d14e0ef78b65d03e8f3  …0052…
```

`logs/tint1/r2b-0052-byte-identity.log`. **The `ls-tree` line and the hashes are not
decoration** — see F-TINT1-7: this command's success criterion is empty output, and it
also prints nothing, with exit 0, when the pathspec matches no file.

## THE FIXTURE — why it discriminates

`tests/integration/tint1-upgrade-migration.test.ts`, T8-shaped (`applyThrough` a cutoff,
then transition), with three deliberate strengthenings over the inherited draft:

1. **The continuation is the REAL `migrate()`**, not a local re-implementation — so the
   name-keyed skip that makes an amendment inert is the code under test.
2. **The verdict is the REAL `assertContentProvisionDatabaseRole`** against the REAL
   nine SCRAM LOGIN principals: the same attestation that threw in b7, not a paraphrase
   of its counting SQL. **No ruled function count is hardcoded** — the arm asserts
   `after === before − 1` and lets the attestation stay sole author of "exactly six".
   (The inherited draft hardcoded `6`, which drifts the day `CONTENT_PROVISION_SIGNATURES`
   gains a row.)
3. **Post-migrate assertions are ordered privilege → count → attestation → ledger**, so a
   tree with no forward revoke fails on a **VALUE**, as codex required — not on "a file
   is missing". The inherited draft asserted the `0054` ledger row first and therefore
   reported the same RED for a typo in the filename as for an unrepaired database.

## RED → GREEN

**RED — mutant = the reviewed `af58ac1` placement** (revoke inside landed `0052`, no
forward migration), reproduced with `git show <sha> > path` (never `git checkout --`,
which stages):

```
 FAIL  tests/integration/tint1-upgrade-migration.test.ts > … > finds the isolation
       attestation failing on the 0052-recorded state, and the production migrator closing it
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 ❯ tests/integration/tint1-upgrade-migration.test.ts:210:51
    210|     expect(await publicMayExecuteGuard(database)).toBe(false);

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

The pre-`migrate()` half all passed in that same run: the ledger records `0052`, PUBLIC
holds EXECUTE, and the real attestation **rejected** with
`CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED`. So the RED is precisely B1: the
production migrator ran against a ledger already recording `0052`, and the database
stayed exposed. **`logs/tint1/r2b-red-0054-upgrade.log`.**

**GREEN — repaired tree:** `Test Files 1 passed (1)` · `Tests 3 passed (3)`.
**`logs/tint1/r2b-green-0054-upgrade.log`.**

## REFUTATION — the mutants, per contract §2

**PROPERTY.** *On a database whose ledger already records `0052`, running the production
migrator must leave PUBLIC without EXECUTE on the T5 measurement guard, so that
`assertContentProvisionDatabaseRole` accepts the content-provision role again.*

| mutant | expectation | result | log |
|---|---|---|---|
| **A** — revoke inside landed `0052`, no `0054` (the reviewed `af58ac1` placement) | **caught**, on a value | arm 1 RED: `expected true to be false` at the PUBLIC-EXECUTE check | `r2b-red-0054-upgrade.log` |
| **C** — `0054` also drops the trigger (a repair with blast radius) | caught by **arm 3 only** | `1 failed \| 2 passed (3)`; arms 1–2 pass, arm 3 fails | `r2b-mutant-c-trigger-drop.log` |
| **D** — `REVOKE EXECUTE` instead of `REVOKE ALL` (equivalent spelling) | **NOT caught** — the test pins the property, not the statement text | `3 passed (3)` | `r2b-mutant-d-equivalent-spelling.log` |

Mutant C is what makes arm 3 earn its place: a "repair" that dropped the function would
satisfy every revoke assertion in arms 1–2. Mutant D is the neighbouring mutant — the
suite is indifferent to how the privilege is removed, which is correct.

`git status --porcelain` printed only my own in-flight test file after every restore, and
is empty at the tip.

### The class-closure claim, re-proved by measurement rather than by re-running r1's probe

Codex reasoned the mutant closes ("deleting `edges` from any typed `Judge.review` call in
`acceptance/` now enters the root compiler"). Measured:

```
$ perl -0pi -e 's/\n\s*edges: \[\],//' acceptance/adversarial-corpus.test.ts
$ npx tsc --noEmit
acceptance/adversarial-corpus.test.ts(240,24): error TS2741: Property 'edges' is missing
in type '{ runId: null; … }' but required in type 'NodeReviewInput'.
mutant_tsc_exit=1
```

Exactly one error, exactly `TS2741`, exactly the r1 defect — and **0 errors** with the
repair in place. `logs/tint1/r2b-class-closure-mutant.log`, `r2b-typecheck-root.log`
(which also carries the `tsconfig.json` base→lane diff proving `acceptance/**/*.ts` is in
the include). Line is `240,24` here vs codex's `238,24` because that file gained two lines
in r1; same call site.

## CLUSTER VERIFICATION — three runs, worst run wins

`acceptance/{panel-multi-maker,adversarial-corpus,ceremony}.test.ts` ·
`tests/integration/{dev-database-principals,tint1-upgrade-migration}.test.ts`

| run | result | failure set |
|---|---|---|
| 1 | `Tests  1 failed \| 26 passed (27)` | DB-01 only |
| 2 | `Tests  1 failed \| 26 passed (27)` | DB-01 only |
| 3 | `Tests  1 failed \| 26 passed (27)` | DB-01 only |

**Worst run = best run.** Failure sets set-identical, all three hashing to
`a2401df8f39e1ea0a95bc60778ba2c3e9c697369f4510a992669228b46ad3770`
(`r2b-combined-fail-{1,2,3}.txt`; `diff` empty both ways). The single failure is the
boarded pre-existing `adversarial-corpus > DB-01`, which the ticket instructs me to leave.
`r2b-combined-run-{1,2,3}.log`.

The upgrade fixture itself was GREEN in five separate runs at the repaired state (the
standalone GREEN, all three combined runs, and mutant D).

### DB-01 paired payload — re-proved, and with a wider payload than r1

Extracted the whole assertion frame (not just the header line) from the readonly b7
authority and from my run:

```
BEFORE  logs/b7-solo-adversarial-corpus.log      (readonly authority)
AFTER   logs/tint1/r2b-combined-run-1.log

AssertionError: expected [ 'HOME', 'OLDPWD', 'PATH', …(2) ] to deeply equal [ 'HOME', 'LANG', 'OLDPWD', …(3) ]
  [ "HOME", -"LANG", "OLDPWD", "PATH", "PWD", "TMPDIR" ]

diff → empty · cmp_exit=0 · both sha256 92d9019807157baabb3bfa0b075a1c025cc79c58fca14cdf24da937d2eb91cd2
```

`r2b-paired-db01-{before,after}.txt`. **Disclosed:** the assertion SITE moved,
`acceptance/adversarial-corpus.test.ts:443:17` → `:455:17` — a 12-line shift from r1's own
additions to that file, not a payload change. r1's narrower extraction re-hashes from my
r2 log to its recorded `371d4fe1…`, so the payload is unmoved across both rounds.

## SUITES

| gate | result | classification |
|---|---|---|
| root `npx tsc --noEmit` (include covers `acceptance/**`) | **0 errors** | clean |
| T5 seal probe gate `-p tests/architecture/t05-half-write-probes/tsconfig.probes.json` | **5 errors, exit 1 — REQUIRED** | the T5 r4 half-write seal still holds |
| **D16** `apps/ui/tsconfig.json` | 1 error — `apps/ui/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| **D16** `web/tsconfig.json` | 1 error — `web/app/layout.tsx(3,8) TS2882 './globals.css'` | PRE-EXISTING, base-identical |
| combined ×3 | `1 failed / 26 passed (27)`, set-identical | the 1 is boarded DB-01 |
| full `pnpm test` | **`D15-DEFERRED / CANNOT-ASSESS — judge-run on integration post-merge`** | D13 `max_concurrent_heavy = 1`; host load 8.40 |

`r2b-typecheck-root.log`, `r2b-typecheck-probes.log`. My r2 diff touches no
`packages/contract` or `packages/kernel` file, so D16 is not triggered by it; run anyway
and base-identical.

## FINDINGS

**F-TINT1-6 · the inherited fixture's idempotence arm was vacuous (FIXED).**
`expect(applyOne(…).catch(() => undefined)).resolves.toBeUndefined()` cannot fail — the
`.catch` swallows the throw the assertion exists to catch — and `applyOne`'s ledger
re-insert violated the `name` PRIMARY KEY, rolling back the REVOKE so the following
assertions passed against an unchanged state. Proof it was inert: the prior seat's own
`r2-red-0054-upgrade.log` fails at line **172**, never at 171; my form fails **at** the
apply line (`promise rejected "ENOENT" instead of resolving`). Class rule for the
checklist: **`expect(p.catch(() => x)).resolves` is never a test.**

**F-TINT1-7 · `git diff <sha> -- <path>` prints nothing AND exits 0 when the pathspec
matches no file (NEW, blocking-adjacent, needs a TOOLING-TRAPS entry).** Pathspecs
resolve relative to CWD. The packet's own mandated `0052` proof has exactly this
shape — **its success criterion is empty output** — so running it one directory deep
yields a false proof that reads perfectly. Demonstrated in
`r2b-0052-byte-identity.log`. Cure, which my filed proof uses: a `git ls-tree` pathspec
sanity line + `--exit-code` + an independent `shasum`/`cmp`. **I could not append this
to `.hermes/TOOLING-TRAPS.md`: that path is not in my `allowed` list** (see F-TINT1-9).

**F-TINT1-8 · replaying the tree to build an "upgrade from" state (NEW, class).** Named
above; the general rule belongs in the standing checklist next to F-TINT1-2's one-time
sweep: **a fixture that models a deployed database must state its premise, because the
tree is the thing under repair.**

**F-TINT1-9 · worker contract §6 orders an append to `.hermes/TOOLING-TRAPS.md`, which no
TINT1 packet or ticket has ever put in `allowed` (NEW, process/packet).** Every worker
must either cross its contract or drop the trap. I dropped it and filed F-TINT1-7 here
instead. Cure: add the traps file to the standard worker `allowed` list, or move the
append to the orchestrator's assembly step.

**Still open from r1, unchanged:** F-TINT1-2 (a one-time `REVOKE … ON ALL FUNCTIONS IN
SCHEMA` sweep reads as standing policy and is not — `0054`'s in-file comment now states
this for the next reader), F-TINT1-3 (the bearings helper exists twice;
`tests/integration/database.test.ts` still carries T5 r2's inline copy), F-TINT1-4
(`acceptance/` importing `tests/support/` is a new precedent, disclosed), F-TINT1-5
(the dispatched failing set omitted `FAIR-02` — **this is codex's N1**, same finding
from both sides).

**Codex N2/N3** are orchestrator packet items (stale quoted status; reviewer packet
lacking the ticket-comment surface). Ledgered by the orchestrator; nothing for this seat.

## COMMITS

Branch `lane/tint1`, local only — **not pushed, not merged**.

| sha | subject |
|---|---|
| `af58ac1` | `TINT1: make the merged lanes' contracts meet — five b7 regressions repaired` (r1) |
| `fbd5f50` | `TINT1 r2: the PUBLIC revoke becomes a FORWARD migration (codex r1 B1)` |

`fbd5f50` **amends** the orchestrator's checkpoint `eed6ebf`, whose own message invited
it ("seat resumes and may amend"); the inherited diff remains archived at
`logs/rl-checkpoint/tint1-uncommitted.diff`. Three files: `migrations/0052…` (restored)
· `migrations/0054…` (new) · `tests/integration/tint1-upgrade-migration.test.ts` (new).
Working tree clean at close.
