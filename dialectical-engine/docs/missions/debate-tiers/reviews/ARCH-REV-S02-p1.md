# ARCH-REV(S02) pass 1 — blind review of `slices/S02/PLAN.md` and of the packet that produced it

- **Verdict: REWORK (pass 1 of 3).** One blocking finding (B1), eleven non-blocking (N1…N11).
- seat ARCH-REV-S02 · ticket `t_08c8abe2` · session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`
- started 2026-09-09 22:35:26 EEST · main tree HEAD `681bc09d`, 103 dirty entries (other missions, untouched)
- lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine`
  @ `7f89f7b7` on `slice/tiers-s02`; `git status --porcelain | wc -l` = **0** before and after every probe
- blind: no contact with the ARCH-S02 seat, no other lens read, nothing under review edited
- under review: `docs/missions/debate-tiers/slices/S02/PLAN.md` (668 lines) and
  `.hermes/planning/debate-tiers/packets/ARCH-S02.md`

---

## 1. What I ran, and what it said

Every cluster command of `PLAN.md` §5 was re-run **by me**, at base, in the lane, from one script —
`.hermes/reports/debate-tiers/probes/ARCH-REV-S02/clusters-rerun.sh`, output
`clusters-rerun.out` beside it. Verbatim:

| Cluster | Command | PLAN.md §5 claims at base | I measured |
|---|---|---|---|
| S02-C1 | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 1 passed (1)` · `Tests 21 passed (21)` · rc=0 · 13 s | `Test Files  1 passed (1)` · `Tests  21 passed (21)` · rc=0 · 13.10 s — **agrees** |
| S02-C3 | `pnpm exec vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files 1 failed (1)` · `Tests 3 failed \| 2 passed (5)` · rc=1 | `Test Files  1 failed (1)` · `Tests  3 failed \| 2 passed (5)` · rc=1 — **agrees**, and the three failure titles match `S02-C3-S5` word for word |
| S02-C2 | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 1 passed (1)` · `Tests 24 passed (24)` · rc=0 *"(measured without the integration file; with it, + 21 passed (21) from the C1 probe)"* | `Test Files  2 passed (2)` · `Tests  45 passed (45)` · rc=0 — the assembled figure is arithmetically right (24 + 21 = 45, 1 + 1 = 2); the published command itself was never run by the author (**N11**) |
| S02-C4 | `pnpm exec vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files 3 passed (3)` · `Tests 39 passed (39)` · rc=0 | `Test Files  3 passed (3)` · `Tests  39 passed (39)` · rc=0 — **agrees** |
| §6 probe 3 (the file-count gate) | `pnpm exec vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/contract.test.ts` | exits 0 with `Test Files 1 passed (1)` | `Test Files  1 passed (1)` · `Tests  7 passed (7)` · rc=0 — **agrees**; the 7 is `contract.test.ts` alone, so the nonexistent filter was dropped in silence |
| §6 probe 4 / F-4 | `pnpm exec vitest run tests/integration/register-version-boundaries.test.ts` | `Tests 6 passed (6)` · rc=0 | `Test Files  1 passed (1)` · `Tests  6 passed (6)` · rc=0 — **agrees** |

**Zero numeric disagreements.** The three s14-contract failure titles I measured, verbatim:
"uses the generated contract client for both browser and SSR with no V2 wire mirror",
"FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory",
"carries the S04 orphan-audit wording fix and deterministic locale tiebreak".

The four green targets are arithmetically consistent with the base I measured: C1 25 = 4 + 21;
C3 `3 failed | 6 passed (9)` = 4 new + 5; C2 53 = 8 + 24 + 21; C4 41 = 2 + 1 + 31 + 7.

**My own both-ways trace parser** — `probes/ARCH-REV-S02/trace.py`, output `trace-out.txt` — derives the
requirement set from `SPEC-v2.md`'s own `- **Rn.**` definitions and the step set from `PLAN.md` §4's own
headings, then parses §3 and §3b separately and compares. Result: 15 requirements, 36 §4 steps + 4 merge
steps + 7 verification items; **no requirement is without a step** in the forward direction; **three steps
sit outside both tables** (N1).

---

## 2. Rulings on the charges this pass carries

**Charge 1a — F-2 (`tests/unit/api.test.ts:169-177` keeps its envelope assertion; the new code goes in a
new case). UPHELD.** `grep -rn 'STRUCTURAL_CEILING_INPUTS_UNRESOLVED' tests apps packages` in the lane
returns exactly two test-layer hits, both inside that assertion (`tests/unit/api.test.ts:171` and `:175`).
It is the only test in the repository that proves an **envelope** throw is marked as an `AskRefusal`
rather than escaping as a 500; the 422 mapping itself is proven elsewhere (`:248`, `:381-385`). The
plan's remedy also works mechanically: with `admissionSettings`'s default panel re-fixtured to a complete
roster panel, `:169-177` overrides only `resolveEnvelopeBasis`, so the roster check passes and the
envelope throw is still reached. *VERDICT keep the assertion, new case elsewhere / CONFIDENCE high /
STRONGEST COUNTER: the case's title says "422 face" while the call is direct, so a reader could argue the
lens is weaker than claimed — the lens it uniquely holds is the AskRefusal marking, and that is real.*

**Charge 1b — F-3 (`tests/unit/api.test.ts:283-405` also turns RED; inside the R3/R6 cluster's command
and re-fixture). UPHELD, mechanism verified line by line.** `PostgresAskApplication.submit` awaits
`evaluateAskAdmission` at `apps/api/src/index.ts:1284`, immediately after the principal/session checks
and **before** `withOwnerAskAdmissionLease` at `:1289`; the saturated-history refusal is raised inside
that lease and mapped at `:1320-1322`. The default fixture panel is `model:1`/`model:2`
(`tests/support/discoveredPanel.ts:13`), neither a roster id, so the R3 filter empties the panel and R6
refuses at `:1284` — `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens, `connectCalls` is 0 not 1
(`:355`) and `leaseQueries` is empty (`:356`). The file is inside cluster C2's command and its
re-fixture. *VERDICT F-3 stands, one-line default-panel change covers it / CONFIDENCE high /
STRONGEST COUNTER: none found.*

**I swept the class F-2/F-3 belong to and it is closed.** I enumerated every `it()` block in
`tests/unit/api.test.ts` and tested each body for `admissionSettings`, `evaluateAskAdmission`,
`PostgresAskApplication`, `.submit(`, `fixtureDiscoveredPanel` and `resolveDiscoveredPanel`
(`probes/ARCH-REV-S02/api-test-cases.py`). **Exactly 3 of the file's 24 tests touch the admission
surface** — `:124-145`, `:146-187` (which contains the three sub-assertions `:159-167`, `:169-177`,
`:179-186`) and `:283-405`. The 24 reconciles as 20 `it()` blocks plus the 4 rows of the `it.each` at
`:96`, which tests `preserveSubmittedTierSource` and is untouched. **There is no fourth affected case**,
and `S02-C2-S8`'s table names all three. The plan's `24 passed (24)` target for that file therefore holds.

**Charge 1c — do rows V-15 and V-16 carry a default that binds a single build? YES, both.**
Both are in `docs/missions/debate-tiers/V-DECISIONS-PACKET.md:21` and `:22` with the orchestrator's
ruling at `:34` ("appended with their recommended defaults binding"), and each carries the
`VERDICT / CONFIDENCE / STRONGEST COUNTER` triple and a smallest yes/no. V-15's default binds exactly one
step — `S02-C3-S4`, "every roster has at least two members", with the maker half recorded as
deployment-determined; V-16's default binds one migration shape, and I checked it is carried consistently
through every place a build touches it: `S02-C1-S1` writes `plan_tier text` with
`CHECK (plan_tier IS NULL OR plan_tier IN ('free','premium'))`, `S02-C1-S4` adds the Drizzle line without
`.notNull()`, `S02-C1-S5` makes `StartRunInput.planTier` optional and writes `?? null` on both paths.
No fork is left for a build seat to choose in silence.

**Charge 1d — is the ADR renumber consistent? NO.** Four references still name `ADR-0023`. See **N5**.

**Charge 1e — packet defects.** The three already ticketed are real and I re-measured each:
- **F-5** (`ARCH-S02.md` charge 7, "roster-member `model_id`s in `fixtureDiscoveredPanel`"):
  `grep -rln 'support/discoveredPanel' tests | wc -l` = **23** in the lane. The literal reading edits a
  fixture 23 suites import. Ticketed; the plan's local helper is the right remedy.
- **the charge-1 range** (`ARCH-S02.md:23` cites `apps/api/src/index.ts:1170-1290`): the `startRun` call
  this slice edits runs `:1293-1317`, entirely outside the range; `:1170-1194` is the
  `RunCreationSettings` interface. Real. The seat's own restatement of it ("stops SEVEN LINES SHORT …
  `:1284-1310`") is itself imprecise — the call opens at `:1293` and closes at `:1317`.
- **the pre-assigned ADR number**: `ARCH-S01.md:15` and `ARCH-S02.md:15` allocate the SAME
  `ADR-0023-*.md` to two seats running blind and concurrently. Real, and the renumber that fixed it left
  four stale citations (N5).
- **new, and against the plan rather than the packet:** the §5 header claim (**N11**).

---

## 3. Findings

### B1 — BLOCKING · the step order writes two of R15's seven RED tests after the fix, and one recorded RED frame cannot fail for the reason it states

`PLAN.md:173-174` states the law this plan then breaks: *"RED-first: within a cluster, the test step
always precedes the implementation step, and the RED frame is recorded before any implementation is
written."* `SPEC-v2.md:159-162` (R15) requires a RED test that **"is shown failing"** for each of seven
named cases, one of which is no-run-on-refusal (R8). `heartbeat-protocol` §3.5: *a test written after the
fix, with no failing evidence, is not evidence.*

**The class is post-fix test authoring. I swept all four clusters; three carry a member.**

**(a) Cluster C2 — R15's frame 6 is never shown failing.** `PLAN.md:316-338` (S02-C2-S1) authors cases
1–6 and `PLAN.md:339-340` (S02-C2-S2) is the only RED run in the cluster. The build steps follow at
`PLAN.md:341-379` (S02-C2-S3/S4/S5). Only *then* does `PLAN.md:380-384` (S02-C2-S6) add case 7, the
`POST /v1/asks` 422 face for R7, and `PLAN.md:385-392` (S02-C2-S7) add case 8 — whose own text names it
**"RED frame 6 of R15's list"**. Both are written after the code that makes them pass. Concrete inputs →
wrong outcome: a BUILD seat follows the plan literally, hands off with `53 passed (53)`, and R15's frame 6
and R7's HTTP face have no failing evidence anywhere in the record; `REV(S02)` must then either reject the
slice or accept a §3.5 violation. Both cases are RED-able before the build — case 7 asserts a 422 with a
code that does not exist at base (`grep -rn 'ASK_PLAN_TIER_MODEL_UNAVAILABLE' apps packages tests
acceptance` returns **nothing** in the lane), and case 8 asserts no run provisioning under a refusing
roster, which the unfiltered path performs.

**(b) Cluster C1 — the implementation precedes the test, and the stated RED frame is unreachable.**
`PLAN.md:177-201` (S02-C1-S1) *creates* `migrations/0061_plan_tier_on_run.sql`. Only afterwards do
`PLAN.md:203-217` (S02-C1-S2) write the four-case suite and `PLAN.md:218-223` (S02-C1-S3) record the RED
frame, which the plan says *"fails with the column absent"*. Measured in the lane:
`migrate(pool)` reads the `migrations/` directory **from disk** and applies every unapplied
`^\d+.*\.sql` (`packages/db/src/index.ts:767-796` — `readdir(directory)`, `.sort()`, skip-if-applied,
`client.query(await readFile(...))`), and the C1 suite runs `migrate` on a fresh embedded Postgres
(`tests/support/testDatabase.ts:31-38` pins embedded-postgres; `tests/integration/evaluator-database.test.ts:74`
is the same call). With 0061 already on disk, **case 1** (the column exists and is nullable) and **case 2**
(`run_plan_tier_vocabulary` rejects `plan_tier='gold'`) are GREEN the moment they are written; only cases
3 and 4 can be RED, and never "with the column absent". The step's own refutation clause — *"the recorded
frame must name `plan_tier` in its failure text"* — would then be satisfied for the wrong reason.

**(c) Cluster C4 — one member, not an R15 case.** `PLAN.md:444-447` (S02-C4-S3) adds its second case,
the single-production-caller guard, inside the build step itself.

**(d) Cluster C3 — no member; it has no implementation step at all** (see N6).

**Remedy shape, the ARCH seat's to choose:** author cases 7 and 8 inside S02-C2-S1 so S02-C2-S2's one RED
run covers all eight frames; and put S02-C1-S2/S3 before S02-C1-S1 so migration 0061 is what turns the
suite green. *VERDICT rework the step order in C1 and C2 / CONFIDENCE high / STRONGEST COUNTER: the
orchestrator could discharge this as a `DECISIONS.md` fold that binds the BUILD seat to the order,
without a second ARCH pass — I state the verdict as REWORK because the defect makes a frozen requirement
unmeetable as written and the correction belongs in the file only ARCH may write, but the cheaper route
exists and is the orchestrator's to take.*

### N1 — three steps sit outside both trace tables while the plan asserts none do

`PLAN.md:164`: *"Zero steps serve nothing; zero requirements have no step."* My parser
(`probes/ARCH-REV-S02/trace.py`) finds **S02-C2-S11, S02-C3-S5 and S02-C3-S6** in neither §3 nor §3b.
Cause: §3b's ranges stop at `S02-C2-S1…S10` (`PLAN.md:159`) and `S02-C3-S1…S4` (`PLAN.md:160`) while §4
defines C2-S1…S11 and C3-S1…S6. C1's `S02-C1-S1…S8` and C4's `S02-C4-S1…S4` are complete, so the class
has exactly two members and I swept all four clusters to say so. The three orphans are the
"run the cluster command / three runs" steps, which serve R13. Forward direction is clean: all fifteen
requirements have at least one step.

### N2 — R15's forward row attributes RED frames to two implementation steps

`PLAN.md:151` names `S02-C2-S4` (build the refusal) and `S02-C2-S5` (build the message) among the
carriers of R15's frames 1–6. Neither authors a test. The frames live at S02-C2-S1 (cases 1–6),
S02-C2-S6 (case 7) and S02-C2-S7 (case 8). Same root cause as B1; listed separately because the trace
table is what a REV seat will read to check R15 mechanically.

### N3 — `.hermes/TOOLING-TRAPS.md:1041` does not exist in the lane the BUILD seats work in

Measured: main tree **3016** lines and `git status --short .hermes/TOOLING-TRAPS.md` = ` M` (dirty, another
mission's work); S02 lane at `7f89f7b7` **1034** lines. The trap
*"`acceptance/standing-db.ts` adopts and MIGRATES any server answering on its port"* is main-tree line
**1041** and is **absent from the lane copy entirely**. It is cited twice, as the evidence for the single
irreversible guard in this mission — `PLAN.md:207` (S02-C1-S2) and `DECISIONS.md:89` (D-A9, "nobody
applies migration 0061 to the live dev database"). A BUILD seat that opens `:1041` in its own lane reads
past end-of-file and may conclude the citation is invented.
**Class swept, member by member:** `:144` main 144 / lane 144 ✓ · `:816` main 816 / lane 816 ✓ ·
`:896-899` main 896 / lane 896 ✓ · `:1041` main 1041 / lane **absent** ✗. The decision itself is right and
is also stated in words at `PLAN.md:551-556` and `:206-207`, which is why this is not blocking.

### N4 — citation drift, eight members, each re-measured in the lane at `7f89f7b7`

1. `PLAN.md:318` — *"`evaluateAskAdmission` … imported from `apps/api/src/index.ts`, as
   `tests/unit/api.test.ts:13` does"*. Measured: the import is at `tests/unit/api.test.ts:5`, from the
   package specifier **`@debateai/api`** (`:10`); `:13` is the `fixtureDiscoveredPanel` import. A seat
   that copies the citation writes a relative import into `apps/api/src/index.ts` and gets a second
   module instance or a resolution failure. This is the costliest member.
2. `PLAN.md:388` — the `prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run` assertion is
   at `tests/unit/api.test.ts:365`; `:366` is blank.
3. `PLAN.md:540` — "the second answers **five** ask literals in three files" and then lists six; the grep
   returns six (`api.test.ts:125,147,327,473`, `load01-live-proof.test.ts:13`,
   `evaluator-database.test.ts:1320`).
4. `PLAN.md:428-430` and `DECISIONS.md:83` — `tests/integration/evaluator-database.test.ts:1378-1384` is
   the `PostgresAskApplication` construction; the legacy `submit` the claim rests on is `:1387-1389`.
5. `PLAN.md:419` — `agent_count = jsonb_array_length(discovered_panel)` is
   `migrations/0040_account_erasure.sql:4317`, not `:4318`.
6. `PLAN.md:237` — the hand-numbered placeholders are at `packages/db/src/index.ts:1249-1251`, not
   `:1247-1251`. More useful: the step says *"every later `$n` shifts"* and does not name that **`$13`
   appears twice** in that VALUES list (`jsonb_array_length($13::jsonb), $13::jsonb`, `:1250`) — 20
   columns against 19 parameters — so a mechanical renumber must move both occurrences together.
7. `DECISIONS.md:85` — "14 test files plus `acceptance/dual-maker-proof.ts:139`". Measured: 13 files under
   `tests/` carry `startRun(`, plus that acceptance file = 14 in all. The load-bearing halves are exact:
   `grep -rn 'startRun(' apps packages tests acceptance` = **49**, `acceptance/dual-maker-proof.ts:139` ✓,
   and `grep -rn '\.startRun(' apps packages` = **exactly one**, `apps/api/src/index.ts:1293`.
8. `PLAN.md:42` and `:442` — the `startRun` call is `apps/api/src/index.ts:1293-1317`, not `:1293-1310`.

Everything else I sampled is exact, and the high-risk citations are all correct: `migrations/0040` at
`:4255` (the three-argument DROP), `:4256-4352` (the function), `:4270-4275` (the exact-key allow-list,
`p_run - ARRAY[…] <> '{}'` → `RETURN false` for any extra key), `:4305-4311`/`:4312-4324` (columns and
values) and `:6366-6369` (`GRANT EXECUTE … TO debateai_content_provision`); `packages/db/src/index.ts`
`:837-856`, `:847`, `:973-979`, `:1214-1219`; `packages/db/src/schema.ts:120`;
`packages/critique/src/index.ts:328-340`, `:332-333`, `:334-339`, `:342-357`;
`packages/register/src/index.ts:181-183`; `packages/contract/src/client.ts:88-91`;
`apps/ui/app/new/page.tsx:135` and `:155`; `apps/ui/components/landing/cards.ts:27-28`;
`apps/api/src/index.ts:56`, `:506`, `:512-520`, `:530-533`, `:1284`, `:1289`, `:1293`, `:1303`, `:1305`;
`apps/api/src/provider-discovery.ts:143-153` and `:155-165`; `apps/runner/src/dev-auth-data-plane.ts:100`;
`compose.dev.yaml:7-9`; `.gitignore:7`; `packages/kernel/src/index.ts:114-132`;
`packages/db/package.json` (crypto, kernel, drizzle-orm, pg — no `contract`); `BASELINE.md:48-70` is still
the `tiers-s02` typecheck block and `BASELINE.md:90` is still the cite-by-heading rule;
`ls migrations | wc -l` = 61, highest `0060_observation_throughput_views.sql`, **`0061` free**, and `0056`
is the harmless gap the plan names.

**One additional hazard the D-A1 evidence understates, in the plan's favour:**
`migrations/0040_account_erasure.sql:6141-6143` also *revokes* ALL on
`core.create_encrypted_run(jsonb,uuid,uuid,jsonb)` from PUBLIC and six roles before the grant at `:6366`.
So a `DROP FUNCTION` would not only discard the grant — it would restore the default PUBLIC EXECUTE that
`:6141` exists to remove. The decision is right; the reason is stronger than recorded.

### N5 — the ADR renumber left four stale references

`ADR-0024-plan-tier-storage-and-layering.md:1`, `PLAN.md:664`, `DECISIONS.md:86` and `DECISIONS.md:97`
all read `ADR-0024` ✓. Stale:

- `PLAN.md:668` — *"`0021` and `0022` are taken; `0023` is free"*, four lines under the `ADR-0024` path at
  `:664`. `ADR-0023-globals-css-append-fence.md` is ARCH(S01)'s, so `0023` is **not** free; the sentence
  is self-contradictory with `:664` and would send the next ADR author into the same collision.
  *Re-measured at handoff:* that file was untracked in the main tree when I first measured it at 22:40 and
  is **committed** as of `19fe6735` (22:38 EEST, the ARCH(S01) freeze), so the sentence is now false
  against the committed tree as well as against the working one.
- `.hermes/reports/debate-tiers/agent-reports/ARCH-S02.md:159` — "ADR-0023 now carries these".
- `.hermes/reports/debate-tiers/handoffs/ARCH-S02-handoff.md:10` and `:28` — name
  `ADR-0023-plan-tier-storage-and-layering.md`, a path that does not exist. That file is a verbatim board
  extract, so an edit would falsify the record; an orchestrator annotation beside it is the honest form.

Measured cause: the lane at `7f89f7b7` does **not** contain `ADR-0023-globals-css-append-fence.md` (`git
log` for that path in the lane is empty; at the time ARCH(S02) wrote its plan the file was untracked in
the main tree and is committed as of `19fe6735`), so a seat measuring the free ADR number from inside its
lane sees `0023` free while the main tree — where the ADR is actually written — has it taken. That is a
lane/main-tree split, not carelessness, and the packet defect that allocated the same number to two
concurrent seats is what made it bite. It is the same cause as N3.

### N6 — cluster S02-C3 has no RED frame, and the plan does not say why

C1, C2 and C4 each carry a "run it and record the RED frame" step; C3 has none, because its four cases
(`PLAN.md:270-301`) are architecture guards over code S02 never writes. Measured at base, two of the four
already hold: the five-id scan over `apps/` and `packages/` finds exactly the two allowed non-roster hits
(`apps/ui/components/landing/cards.ts:27-28`, and zero hits for `gpt-5.6-luna`, `claude-sonnet-5`,
`grok-4.6`), and the `free` + `premium` + (`===` | `case `) scan finds **nothing**. So C3's cases go green
the moment S01's roster export exists. A REV seat reading §4's RED-first preamble will look for a C3 RED
frame that cannot exist; one sentence in the cluster heading closes it.

### N7 — the filter's shape can violate frozen R4, and the plan records that it can

`PLAN.md:344`: `roster.flatMap((modelId) => discoveredPanel.filter((m) => m.model_id === modelId))`
emits a member twice when two providers serve one model id. `PLAN.md:350-353` records the consequence —
`panelSize` and `agent_count` exceed the roster size — and calls it out of scope. SPEC R4 states an
equality: *"the number passed as `panelSize` … equals the number of model ids in that tier's roster"*.
Unreachable on today's fleet (three targets, three distinct model ids, `00-intake.md:52`), which is why
it is not blocking. Remedy: take the first match per roster id. *VERDICT close it in the expression /
CONFIDENCE medium / STRONGEST COUNTER: a duplicate model id may be a deployment fault worth surfacing
rather than silently de-duplicating — in which case R6's `missing` check is the wrong guard for it and a
V row is the honest route.*

### N8 — the plan says it does not guess S01's exports, then guesses their shape twice

`PLAN.md:116` (S02-M4): *"This plan does not guess them: it refers to them as the roster export and the
tier field."* `PLAN.md:343` then writes `const roster = <the roster export>[ask.plan_tier];` — an index
signature — and `PLAN.md:272-274` compares `free` and `premium` **properties** with `toEqual` on arrays.
A `ReadonlyMap`, or a `rosterFor(tier)` function, breaks both. Remedy: S02-M4 records the export's SHAPE
alongside its name, in the same ticket comment.

### N9 — SPEC R10 says "unchanged"; the measured path prefixes the code

`packages/contract/src/client.ts:88-91` builds the detail as `` `${serverCode}: ${serverMessage}` ``, so
`/new` renders `ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs …`. `PLAN.md:373-376` has this right
and derives the exact on-screen string — but it corrects a frozen SPEC word in passing instead of raising
it, and a product-truth lens at `REV(S02)` measuring "unchanged" against the screen will find the prefix.
It costs one line in `DECISIONS.md`; acceptance step 6 (which asks only that every missing member is
named) is unaffected.

### N10 — F-4 is a class; the plan reports one member, and that member is already closed

`PLAN.md:621-627` raises `tests/integration/register-version-boundaries.test.ts:172` as a suite inside
SPEC R13's grep class with no `BASELINE.md` row. Two corrections, both measured:

- **It is already discharged.** `BASELINE.md:118-120` carries the rows for both lanes (`Tests 6 passed
  (6)`, rc=0), appended by the orchestrator at 22:32 in the same commit `681bc09d` that froze this plan.
  A BUILD or REV seat reading §9 will re-raise a closed finding.
- **Three more members of the same class have no row.** The R13 grep answers seven paths in the lane
  (I re-ran it: `evaluator-database`, `register-version-boundaries`, `support/discoveredPanel.ts`,
  `api.test.ts`, `dr181-ceiling`, `dr184-review-resilience`, `register-s09`).
  `tests/unit/dr181-ceiling.test.ts`, `tests/unit/dr184-review-resilience.test.ts` and
  `tests/unit/register-s09.test.ts` have **no `BASELINE.md` row**, and `PLAN.md:542-544` schedules them to
  be "run once to confirm" with nothing to compare the result against. `BASELINE.md:88` makes a suite
  without a row a finding against the orchestrator, so the rows are the orchestrator's to append — which
  is why this is non-blocking on the plan.

### N11 — §5's header claim is broader than the measurement it stands on

`PLAN.md:459-460`: *"Every command below was RUN by ARCH-S02 at `7f89f7b7` in the `tiers-s02` lane from
`.../seats/ARCH-S02/*.sh`."* The C2 row then qualifies, inside the cell, *"measured without the
integration file; with it, + `21 passed (21)` from the C1 probe"* — the published C2 command was never
run. I ran it as written and the assembled figure survives (`Test Files 2 passed (2)` ·
`Tests 45 passed (45)` · rc=0 = 24 + 21). To the seat's credit the READY handoff prints the two-file
command it actually ran (`ARCH-S02-handoff.md:15`), so the drift is in the plan's header sentence, not in
the evidence trail. Under COMMON §4 and `heartbeat-protocol` §3.6 a header must not claim more than the
cell beneath it delivers.

---

## 4. What I tried to break and could not

Reviewer contract §2 — my posture was to refute. Six attempts failed, each recorded so nobody re-derives
them:

1. **A fourth affected `api.test.ts` case.** Enumerated all 20 `it()` blocks plus the 4 `it.each` rows
   (24 = the base count) and tested each body against six admission-surface tokens. Exactly three touch
   it; `S02-C2-S8` names all three. The class is closed and the `24/24` target holds.
2. **A closed error-code vocabulary that would make cluster C2 un-greenable.** `ASK_PLAN_TIER_MODEL_UNAVAILABLE`
   is new (`grep` over `apps packages tests acceptance` in the lane: zero hits), and
   `packages/obs-capture/src/registry/index.ts` looked like a registry a new code must join. It is not:
   `tests/unit/obs-l2-s02-registry.test.ts:94-99` pins a **sha256 of the registry's own payload** and its
   own count, not a scan of the codebase, and it is `23 passed (23)` at base. Four sibling ask-path codes
   are already absent from it (`OWNER_PRIVATE_HISTORY_SCAN_SATURATED`, `PROVIDER_PROBE_UNRESOLVED`,
   `RUN_OWNER_INVALID`, `RUN_PRINCIPAL_SESSION_MISMATCH`), so an unregistered code is the house norm. **No
   cluster is blocked and this is not a finding.**
3. **A later migration redefining `core.create_encrypted_run`, which the byte-for-byte copy from 0040
   would silently revert.** `grep -rn 'create_encrypted_run' migrations/` returns four hits, **all in
   0040** (`:4255`, `:4256`, `:6141`, `:6366`). The copy instruction is safe.
4. **A concurrent-cluster race on `tests/integration/evaluator-database.test.ts`** — C1's gate command
   runs a file C2 rewrites (S02-C2-S10), and §5 puts C1 in parallel with the merge branch. Closed by
   S02-M2's own precondition (`PLAN.md:102-104`): the rebase runs with `git status --porcelain` empty,
   which forces C1 to be committed — hence its three runs finished — before C2 can begin.
5. **`markAskRefusal` not terminating control flow**, which would let S02-C2-S4's snippet (no `throw`
   keyword) fall through into `makers` with a short panel. It is
   `function markAskRefusal(error: unknown): never` and throws on both branches
   (`apps/api/src/index.ts:299-302`); the existing `let envelopeBasis` at `:1220`, used unguarded at
   `:1230`, proves TypeScript already treats the call as a terminator. The snippet is sound.
6. **An incomplete "replace `discoveredPanel` with `filteredPanel`" enumeration.** Inside
   `evaluateAskAdmission`, `discoveredPanel` occurs at exactly `:1205` (declaration), `:1206`, `:1213`,
   `:1225` and `:1230`. The plan's four replacement sites are exhaustive, and they match SPEC R3's own
   list (`makers`, `makerAvailability`, `panelSize`, the returned key).

**What I did NOT verify (UNVERIFIED, honestly).** (a) Anything that depends on S01's merged exports —
their names and shapes do not exist yet, so S02-M3/M4 and every step that indexes the roster export are
unverifiable at this pass (N8 is the residue). (b) `S01/SPEC-v2.md` R11/R12, which this plan leans on
throughout — not in my packet's input list, and I did not read outside it. (c) The green verdicts
themselves: the four new test files do not exist, so only the base halves are measurable, exactly as the
author says. (d) `pnpm typecheck` — S02-V3's delta cannot be measured against a diff that does not exist,
and I ran no typecheck. (e) SPEC §2 acceptance — V's, in a browser, and steps 1–4 and 8–9 wait on row V-7.

---

## 5. Predictions for the other lenses

There is no second lens on this node — ARCH-REV runs one blind pass — so I record instead what I expect
`REV(S02)` and the BUILD seats to hit, as falsifiable evidence that this pass was blind and mechanical.
**First:** the RED evidence for R15's frame 6 will be missing from the C2 handoff, and the seat will
report `53 passed (53)` without noticing, because the plan's own trace table (N2) points R15 at build
steps. **Second:** the C1 seat will paste a RED frame that says `plan_tier` in its text but shows cases 1
and 2 already green, and will not flag it, because the step told it what the failure would say. **Third:**
the first real cost will be paid at `S02-C2-S3` on the roster export's shape (N8) — an index signature
against whatever S01 actually declared — and it will surface as a typecheck error, not a test failure.
**Fourth:** somebody will open `.hermes/TOOLING-TRAPS.md:1041` in the lane, find 1034 lines, and either
re-derive D-A9 or ignore it; the one thing I would check first on the merge candidate is whether anything
ran `pnpm db:migrate` against `:55432`. I would be surprised to be wrong about the first two and would
take an even bet on the last.

---

## 6. Verdict

**REWORK — pass 1 of 3.** B1 blocks: the plan's step order in clusters C1 and C2 cannot produce the seven
shown-failing RED tests SPEC R15 requires, and one of the RED frames it does record cannot fail for the
reason it states. Everything else — the direction, the boundary map, the cluster decomposition, the
migration decisions D-A1/D-A2/D-A3, the pinned refusal order, the file-count gate, and every number in §5
— I re-measured and it holds. N1…N11 are for the orchestrator to fold into `DECISIONS.md` and the
downstream ticket comments; N3, N4.1 and N10 are the three worth folding before any BUILD seat starts.
Two passes remain lawful after this one.
