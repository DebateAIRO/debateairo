# REV(S03) pass 3r — lens `correctness-tests` — the ONE V-authorized scoped re-check, at the merged head `b97985a8`

- seat REV-S03-p3r-correctness-tests · ticket `t_06b3ae45` · pass 3r (a REWORK here is a V row; there is no further pass)
- review tree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p3r-correctness-tests/dialectical-engine`, detached at **`b97985a8`**, porcelain **0** at start and **0** at handoff (measured both times)
- base for this node: `0fe14637` (the pass-3 slice head) · slice head **`a25c0d99`** = `0fe14637` + `ef302060` + `a25c0d99` — I re-derived the ancestry: `git log --oneline 0fe14637..a25c0d99` returns exactly those two commits, and `git merge-base --is-ancestor a25c0d99 b97985a8` is true
- every number below was measured by me in this session, in that worktree. Where I did not measure something, it is under §7 UNVERIFIED.

**VERDICT: PASS (pass 3r, lens correctness-tests).** V-47 and V-49 are met at `b97985a8`; neither guard moved. Five non-blocking findings (N12–N15 new, plus the three carried), each needing a ticket by end of pass. No new row for V.

---

## 1. The packet review (its author cannot review it; a defect here is a finding against the orchestrator)

What I checked and what held:

| Packet claim | Measured |
|---|---|
| review head `b97985a8`, worktree installed, porcelain 0 | `git rev-parse HEAD` = `b97985a87768b4aaef3314cdb8462e91f943a233`; `git status --porcelain` = 0 entries |
| slice head `a25c0d99` = `0fe14637` + `ef302060` + `a25c0d99` | exact, re-derived (above) |
| the FIX's guard diff is EMPTY | `git diff --stat 0fe14637 a25c0d99 -- apps/runner/src/dev-api-environment.ts packages/db` → no output |
| `DEVELOPMENT_REGISTER_VERSION` still `4` | `apps/runner/src/dev-deployment-register.ts:62` — `export const DEVELOPMENT_REGISTER_VERSION = 4 as const;` |
| the database's v4 digest is `120bdfea…`, v9's is `42b90bca…` | confirmed independently, and the mutant in §3.2 makes the code *produce* `42b90bca…` from the five-slot set |
| the merge delta over S03's files: 5 files, +156/−10 | re-derived exactly, after correcting the pathspec spelling (see the trap note below) |
| the pass-3 package and the oracle paths resolve | all read |

**The one defect — N13, below:** the stamped freeze pair `10ee9329..d7a3d478` does not contain what the packet says it contains.

**A packet line that saved me (worth keeping verbatim in every packet):** the TOOLING-TRAPS warning that a git-root-relative pathspec returns an EMPTY diff from inside `dialectical-engine/`. I hit it on my first re-derivation of the merge delta — `git diff --stat a25c0d99 b97985a8 -- $(cat s03-product-files.txt)` printed nothing, which reads exactly like "the merge changed nothing in S03's files". Stripping the `dialectical-engine/` prefix reproduced the package's stat to the byte. Without that line I would have reported a false clean.

**The author's `SKILLS LOADED` line.** The FIX seat's handoff (`board/FIX-S03-p3-F1-R4.t_877d51de.txt`) is a Codex seat's; I did not verify its skill bodies — not my instrument. Its numeric claims I did verify, and they match mine everywhere except C4 (N14).

---

## 2. Everything I re-ran, in MY worktree (charge 5)

All commands from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p3r-correctness-tests/dialectical-engine`, `env LANG=en_US.UTF-8 npx vitest run …`, sequentially (logs in my scratchpad `seats/REV-S03-p3r-correctness-tests/`).

**C3, the nine-suite command, three runs — worst = best, identical:**

| run | Test Files | Tests | failing titles |
|---|---|---|---|
| 1 (17:52:05→17:54:45) | 1 failed \| 8 passed (9) | **2 failed \| 93 passed (95)** | the two below |
| 2 (17:54:45→17:57:16) | 1 failed \| 8 passed (9) | **2 failed \| 93 passed (95)** | the two below |
| 3 (17:57:16→17:59:46) | 1 failed \| 8 passed (9) | **2 failed \| 93 passed (95)** | the two below |

Both failing titles, in all three runs, verbatim:
```
× tests/architecture/register-support-publication.test.ts > REGISTER-SUPPORT-PUBLICATION schema source contract > recognizes hostile static SQL concatenation, interpolation, and tagged builders
× tests/architecture/register-support-publication.test.ts > REGISTER-SUPPORT-PUBLICATION schema source contract > classifies every register relation access and bans open writers, latest selection, and unsafe version coercion
```
These are the two **inherited** 2026-09-12 titles (SPEC R27 delta zero). Nothing else failed. This matches the orchestrator's re-verification and the FIX handoff exactly.

**§5, the integrated 17-file run, once:** `Test Files 1 failed | 16 passed (17)` · **`Tests 2 failed | 190 passed (192)`** — the same two inherited titles and only those. Matches `reverify-b97985a8.txt` lines 4–11 exactly.

**§5-1b, the two embedded-postgres suites, once:** `Test Files 2 passed (2)` · **`Tests 57 passed (57)`**, rc=0. Matches.

**C4, once:** `Test Files 4 passed (4)` · **`Tests 73 passed (73)`**, rc=0, over the cluster map's four files. The FIX handoff and the package record **79/79 over five files**; I reproduced that too — adding `tests/architecture/tiers-s02-rosters.test.ts` (6 tests) gives `Test Files 5 passed (5)` · `Tests 79 passed (79)`. Both green; the two records name different commands (**N14**).

**Route-contract pins, once:** `Test Files 1 failed | 1 passed (2)` · **`Tests 1 failed | 40 passed (41)`** — one failure:
```
× tests/unit/s7-authorization.test.ts > S7 deny-by-default authorization > keeps one complete, duplicate-free policy row per contract route
   → expected [ 'POST /v1/auth/register', …(51) ] to have a length of 50 but got 52   (tests/unit/s7-authorization.test.ts:151)
```
**The inherited RED, named once and closed:** I measured the cause rather than repeating the claim. `governed` is 52 and `contractInventory.routes` is 50; the two surplus rows are the observability branch's client-report pair, `apps/api/src/index.ts:145-146` (`GET /v1/obs/client-report/enums`, `POST /v1/obs/client-report`), and `grep -n 'obs/client-report' packages/contract/src/index.ts` returns **nothing** — they are governed and not in the contract inventory. S03's own row is in all three lists: `packages/contract/src/index.ts:685`, `apps/api/src/index.ts:149`, and the registration at `apps/api/src/index.ts:920`. **Not S03's.**

---

## 3. V-47's regression, re-derived — never trusted from the handoff (charge 2)

I am forbidden V's database, so I did not re-run `dev:auth:up` against it. What I did instead is stronger than trusting the handoff: **I proved that the historical v4 this head builds IS the row set V's database sealed**, using the orchestrator's read-only diagnostic as the oracle, and then drove the real start sequence against that sealed state in my own embedded postgres.

Probe: `.hermes/reports/debate-tiers/probes/REV-S03-p3r-correctness-tests-probe.test.ts` (promoted; runner below). Five frames, all measured at `b97985a8`:

### 3.1 The frames

| frame | property | outcome |
|---|---|---|
| **A** | the historical rows this head builds are V's sealed v4, **row by row** | **GREEN** — 32 rows; `computeRegisterSnapshotSha256` = `120bdfea9776cff519113d915694f02b1e4302a14a4282c8e6272a0bf09a5e96`; and after importing them at version 4, the *exact* SQL + digest the orchestrator's diagnostic ran (`register.canonical_json_text(value_json::text)`, sha256 first 12 hex) reproduces **all 32** `rowKey / sha12 / len / source_ref` triples of `live/serve-merged-diag-v4-rows-a49d9734.log`, including `configuredProviderSet sha=cfbd6996c10b len=363` |
| **B** | the **PRE-FIX** row set still drifts against that same sealed v4 (the RED, re-derived) | **GREEN** — `buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, realPanel, realRosters)` (which carries `planTierRosters`) rejects with `/historical replay drift/` |
| **C** | input-level mutant: the five-slot `configuredProviderSet` back in the v4 row | **GREEN** — drift returns |
| **D** | GREEN + publication + a **SECOND identical start** | **GREEN** — the seed returns `{registerVersion:"4", rowCount:32, snapshotSha256:120bdfea…}`, the 32 v4 rows are byte-identical before and after, and no version above 4 is created; the publication then lands version **5** with **33 rows** carrying `planTierRosters` = the file's ids and a `configuredProviderSet` of **5** providerRefs; the second start re-seeds, re-publishes, and the version list is **unchanged** and the receipt identical |
| **E** | a receipt that disagrees with the register is refused, not trusted | **GREEN** — `DEV_DEPLOYMENT_REGISTER_RECEIPT_REGISTER_MISMATCH` |

Run, verbatim: `Test Files 1 passed (1)` · `Tests 5 passed (5)`, rc=0 (three times: my working copy twice, then the promoted copy through its runner, which reported `porcelain before: 0` and `porcelain after: 0`).

**I exceeded the author's parameters where it mattered.** The author's own idempotence case uses `TEST_DEVELOPMENT_PROVIDER_PANEL` / `TEST_PLAN_TIER_ROSTERS`; frame D uses the panel and rosters the **real** start builds — `developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(root))` and `developmentPlanTierRosters(loadModelConfig(root))`, the exact expressions of `apps/runner/src/dev-provider-set-publish-cli.ts:23-28`. And the author's `preS03DevelopmentV4Rows()` derives the pre-S03 set from the *current* builder with a hand-written panel; frame A derives it from **V's database**, which is the only oracle that cannot be argued with.

**The answer to the charge's direct question: the fixture digest equals the database's `120bdfea…`.** Measured, not read: `tests/support/registerFixtures.ts:25` holds `120bdfea…`, and frame A computes the same digest from the product's own historical builder and reproduces every one of the 32 live row digests.

### 3.2 The source mutant the charge names — the five-slot set back in the historical constant

Not an input swap: I edited the product source. `DEVELOPMENT_HISTORICAL_V4_CONFIGURED_PROVIDER_SET_ROW` (`apps/runner/src/dev-deployment-register.ts:329-352`) got its two premium slots back — exactly `ef302060`'s constant.

- before: `shasum -a 256 apps/runner/src/dev-deployment-register.ts` = `81f13c28627d6d53d0f8356890c93b9299ccba4820052869b980a8f753da1497` (which independently corroborates the FIX seat's own restore proof, which reports the same digest)
- with the mutant: **`Tests 3 failed | 2 passed (5)`** — frame A fails with
  ```
  expected '42b90bca671d96d6e1c53de5c3115ca2ab7a5…' to be '120bdfea9776cff519113d915694f02b1e430…'
  ```
  frames D and E fail with it. **This is the decisive measurement of RULING 4:** with the five-slot set in the historical constant, the code produces exactly `42b90bca…` — which the live log records as register version **NINE**, `publication_kind: GENERAL`, `base_register_version: 4`, recorded 2026-09-12. `42b90bca…` was never v4. `ef302060` pinned v9's set as history, and that is why attempt 3 still drifted on V's database.
- after restore: digest back to `81f13c28…`, `git status --porcelain` shows only my untracked probe file, which the promoted runner then removed. **Porcelain 0 at handoff.**

### 3.3 V-49, measured in source rather than read

`package.json:36` → `apps/runner/src/dev-auth-stack-cli.ts:38` → `startDevelopmentAuthStack`, whose **first** fixed stage is `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED → operations.generateContract()` (`apps/runner/src/dev-auth-stack.ts:155-158`), before `checkModelConfig` (`:159-162`) and before `startDataPlane` (`:180-183`), which is what seeds. The real operation shells `pnpm generate:contract` in the repository root (`:296-305`). Two cases pin it — `tests/unit/dev-auth-stack.test.ts:189` (order: `["contract:generate","model-config"]` and generate < data:start) and `:203` (a generator failure stops the start with zero downstream calls) — and that suite ran **26/26** inside my C3 and §5 runs. **V-49 met.**

---

## 4. The class sweep — complete? (charge 3). Coherent yes; complete **no**

I did not take the handoff's sweep on trust; I enumerated the population myself.

**Command 1 — the builders**, over `apps packages tests acceptance tools config`, for `buildDevelopmentDeploymentRegisterHistoricalPublicationRows|buildDevelopmentDeploymentRegisterHistoricalRows|buildDevelopmentDeploymentRegisterPublicationRows|buildDevelopmentDeploymentRegisterRows`. **Command 2 — the digest**, for `120bdfea|42b90bca|DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256`.

Every consumer outside `dev-deployment-register.ts` itself:

| consumer | what it pins | in the handoff's sweep? | in a cluster command? | result |
|---|---|---|---|---|
| `tests/integration/dev-deployment-register.test.ts:111,203,218,275,320,353,358,633` | the split, the digest, the row count | yes | C3, §5 | 16/16 |
| `tests/architecture/register-support-publication.test.ts:229,355,362,369` | the builder name, the digest | yes | C3, §5 | 12/14, the two inherited |
| `tests/integration/register-support-publication.test.ts:315,318,333` | historical bytes + digest | yes | §5-1b | 57/57 |
| `tests/integration/production-database-principals.test.ts:2750,2754` | historical rows + shared constant | yes | §5-1b | 57/57 |
| `tests/architecture/dev-deployment-register.test.ts:43-44` | both builder names present | yes | C3, §5 | 3/3 |
| `tests/unit/api.test.ts:322` | `buildDevelopmentDeploymentRegisterRows` | — | C3? no · §5 yes · C4 yes | 30/30 |
| **`tests/architecture/p2-recovery-policy-register.test.ts:119`** | *the seed's builder call* | **NO** | **no command of this slice** | passes — see N12 |
| **`tests/architecture/p2-product-role-policy.test.ts:137`** | *the seed's builder call* | **NO** | **no command of this slice** | passes — see N12 |

Coherence of the members that ARE swept: the split is consistent — historical builders carry the three-provider set and `120bdfea…`; the current builder carries the five-slot set plus `planTierRosters` and reaches the database only by `publishGeneral`. I verified the shared constant is defined once (`tests/support/registerFixtures.ts:25`) and that `42b90bca…` survives only as a **comment** there naming the later five-slot set. Nothing in the repo still asserts `42b90bca…` as v4.

---

## 5. The guards, and the merge cross-check (charge 4)

**The guards did not move.**
- `git diff --stat 0fe14637 a25c0d99 -- apps/runner/src/dev-api-environment.ts packages/db` → **empty**, re-derived by me.
- `DEVELOPMENT_REGISTER_VERSION = 4` at `apps/runner/src/dev-deployment-register.ts:62`; the seal cap is not lifted.
- The drift detector still passes: the case carrying `await expect(importHistorical("4", changed)).rejects.toThrow(/historical replay drift/u)` is `tests/integration/register-support-publication.test.ts:896` (it was `:902` at the pass-3 head; the FIX's 18-line diff on that file moved it), inside the title *"imports historical bytes once and permits exact replay only"* — **✓ passed** in my §5-1b run. The SQL that raises it is `migrations/0055_register_support_publication.sql:1372`.

**The merge cross-check — and one thing the packet's framing does not cover.** The tree I reviewed is `integration/all`, not the lane. `diff-a25c0d99..b97985a8-S03-files.patch` is 5 files, +156/−10, which I re-derived exactly. Read hunk by hunk, all of it is the observability branch: `@debateai/obs-capture` imports, the two client-report policy rows, an `onRequest` obs-context hook, `captureHandled` in the error handler, a `registerClientReportRoutes(api)` call, and `packages/providers` + `pnpm-lock` additions. **No hunk changes anything I measured** — in particular the plan-tiers surface is untouched: I hashed the two blocks at four commits and `async readPlanTierRosters(session)` is byte-identical (`c79cb0f788cfe095`) at `3f488b3f`, `0fe14637`, `a25c0d99` and `b97985a8`, as is the `api.get("/v1/plan-tiers")` handler (`7a87172a14957fa4`) between `3f488b3f` and `b97985a8`.

**Beyond the packet's line:** the packet asks only about S03's files, but security's pass-3 ruling names `packages/db` as a guard, and `packages/db` **has** moved at the merged head — `git diff --stat 0fe14637 b97985a8 -- packages/db` is 3 files, +59/−10. I read it: `obs-schema.ts` columns and constraints, an `@debateai/obs-capture` dependency, and `createPool`'s pool-error path now calling `capturePoolFailure` instead of `console.error`. `git diff 0fe14637 b97985a8 -- packages/db | grep -i register` returns **nothing** — the register publication surface is untouched. The guard is intact; it moved for another mission's reasons, and the 57/57 in §5-1b was measured on that merged `packages/db`. One consequence worth recording for whoever reads a 5xx next: the merge changed the API's 5xx body from `{error, message}` to `{error, correlation_id}` (`apps/api/src/index.ts`, the error-handler hunk). No S03 assertion I ran depends on it.

---

## 6. Findings — none blocking

**N12 — the class sweep is incomplete: two assertions that pin how the seed builds the v4 rows were never swept, still pass, and now pass for the wrong reason.**
`tests/architecture/p2-recovery-policy-register.test.ts:119` and `tests/architecture/p2-product-role-policy.test.ts:137` each assert `expect(devSeed).toContain("buildDevelopmentDeploymentRegisterPublicationRows")` where `devSeed` is the whole text of `apps/runner/src/dev-deployment-register.ts`, under titles about what the **seed** persists. At `b97985a8` the seed calls `buildDevelopmentDeploymentRegisterHistoricalPublicationRows` (`:832`); the asserted string survives only at `:631` (an export) and `:777` (inside `publishDevelopmentDeploymentRegisterProviderSet`). Because the assertion is file-level `toContain`, it cannot tell the seed path from the publish path — so it passes while no longer pinning its own title. Measured: `Test Files 2 passed (2)` · `Tests 6 passed (6)`. **Neither file appears in C3, C4, §5 or §5-1b**, so had the FIX broken them, no command of record would have said so. **Cost if unfixed:** the repo keeps two green assertions that certify a property that is no longer true, in the exact area V just spent a rework round on. **Remedy:** point both at the seed's actual builder (`…HistoricalPublicationRows`), and add the two files to the register cluster command so the class is mechanically checkable. *file:line* `tests/architecture/p2-recovery-policy-register.test.ts:119`, `tests/architecture/p2-product-role-policy.test.ts:137`.

**N13 — packet defect: the stamped freeze pair brackets the package, not the pass.** The packet stamps `10ee9329..d7a3d478` and says the diff over the three mission trees is *"the orchestrator's record of the pass (ledger rows, packets, folds, the review package) and the seats' handoffs and self-reports"*. Run exactly as the packet spells it, it is **one commit, 20 files, +1735/−0, every one of them under `review-packages/S03-p3r/`**. Four of the five promised categories are absent: the FIX packet's RULING 4 (`67638e79`, `3a52154d`), V's rows (`415ff340`, `615ef3d0`), the LEDGER rows (`04c67725`, `20579304`, `8222f7aa`), the DECISIONS fold (`4793b4aa`) and the FIX seat's own self-report (`7cb27120`) all precede `10ee9329`. The pair a lens needs is `<the FIX's dispatch freeze>..d7a3d478`. I read those files anyway because the packet names them individually by absolute path — but a lens that trusted the pair would conclude the pass produced nothing but a package. **Cost:** one wrong `<previous>` sha silently turns the freeze line into decoration. **Remedy:** stamp `<previous>` from the freeze at which the seats under review were dispatched, and have `packet-check.sh` assert the range contains at least one commit outside `review-packages/`. *file:line* `.hermes/planning/debate-tiers/packets/REV-S03-p3r-correctness-tests.md:10`.

**N14 — two records of C4 name different commands.** The cluster map (`review-packages/S03-p1/cluster-map-PLAN-sections-2-and-5.md:19`) defines `S03-C4` over four files; I measured it **73/73 green, rc=0** (26 + 15 + 2 + 30). The FIX handoff and `S03-p3r/README.md` record **79/79 over five files**; I reproduced that by adding `tests/architecture/tiers-s02-rosters.test.ts` (6 tests) — also green. Both are green, so nothing is hidden today; but a future seat comparing "C4 79/79" against the cluster map's command will read a 73 and think six tests vanished. **Remedy:** one command of record per cluster, quoted from the cluster map, in every handoff. *file:line* `.hermes/reports/debate-tiers/review-packages/S03-p3r/README.md:7`.

**N15 — the seed CLI keeps a provider-panel validation whose only effect is its exception, with nothing pinning it.** `apps/runner/src/dev-deployment-register-cli.ts:16` now reads `loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment(), loadModelConfigConfiguredProviders(process.cwd()));` — the result is discarded (before the FIX it fed the seed). The call is load-bearing only through its throw on a bad `DEBATEAI_DEV_PROVIDER_TARGETS_JSON`, there is no comment saying so, and I found **no** test that drives that refusal through this CLI: every occurrence in `tests/` supplies a valid targets JSON (`tests/integration/dev-deployment-register.test.ts:162`, `tests/integration/fix07-off-switch.test.ts:1188`, `tests/integration/dev-provider-panel.test.ts:25`). **Cost if unfixed:** a lint pass or a tidy-minded reader deletes an unused expression and the seed silently stops validating the panel environment. **Remedy:** either a one-line comment plus a case that pins the refusal, or drop the call and let the stage that owns the panel own the validation. *file:line* `apps/runner/src/dev-deployment-register-cli.ts:16`.

### Carried findings — status at `b97985a8`

| # | Still holds? | Evidence re-measured this pass |
|---|---|---|
| **N9** (reader-side projection drops an unknown member where the seam used to refuse) | **YES**, line numbers moved 1539→**1536-1547** | the `readPlanTierRosters` block is byte-identical (`c79cb0f788cfe095`) at `3f488b3f`, `0fe14637`, `a25c0d99`, `b97985a8`; the allow-list `{ free: value?.free, premium: value?.premium }` is unchanged at `apps/api/src/index.ts:1542-1545`. The behavioural set (probe Y1, two shapes) is carried from pass 3 — see §7 |
| **N10** (`planTierRosters` is the only published row kind whose discriminant nobody validates) | **YES** | same byte-identical block; nothing in `readPlanTierRosters` reads `kind`, and the route re-parse at `:927-929` is `PlanTierRostersSchema.parse` over `{free, premium}` |
| **N11** (the pass-2 F1 handoff recorded a sweep over the wrong population) | **YES**, unchanged | a record finding about `review-packages/S03-p3/board/FIX-S03-p2-F1.t_2ab42655.txt:54`; nothing at this head touches it. **It recurred in a new form this pass — N12** |
| N1–N7 (pass 1/2 carried) | not re-measured this pass | out of this node's scope; the packet narrows the re-check to V-47/V-49, the guards, the frames and N9/N10/N11 |

---

## 7. UNVERIFIED — what I could not do, and why

- **V's live database, the running `:3000`/`:3001`/`:8790–8796`/`:55432` stack, a browser, V's desktop.** No-touch for this seat. So **I did not run `pnpm dev:auth:up` against V's database.** The live frame in `live/serve-merged-up-b97985a8.log` is the orchestrator's measurement, not mine. What I contribute instead is that the 32-row set the code replays is provably V's sealed v4 (frame A, every row digest matched), that the pre-fix set drifts against it (frame B), and that the mutant reproduces `42b90bca…` (§3.2). If the orchestrator's live log were somehow wrong, frames A–E would still stand.
- **The runner-readiness failure the live log ends on** (`DEV_AUTH_STACK_RUNNER_FAILED:DEV_RUNNER_PROCESS_READINESS_INVALID`, row V-51). I read the package's account and did not measure it; it is outside S03's surface and outside this lens's charge.
- **N9's and N10's behavioural set at this head.** I proved the seam is byte-identical to my pass-3 head, so the pass-3 measurements (probes Y1/Y2 at `3f488b3f`) carry — but I did not re-run those probes at `b97985a8`. If anyone needs the disagreement set re-derived here, the pass-3 probe is promoted and travels.
- **The wire body of `GET /v1/plan-tiers` for an authenticated user, and `/new`'s rendered lists.** Product-truth's charge this pass, not mine.
- **Whether the two `p2-*` suites (N12) belong in the register cluster** — I measured that they are absent from every S03 command and that they pass; which command should own them is the architecture seat's call.
- **Any real provider or CLI call**, and the `42b90bca…`/`120bdfea…` values as they stand in V's database *right now*. My oracle is the orchestrator's 2026-09-16 read-only diagnostic, not a live query.
- **The FIX seat's `SKILLS LOADED` bodies** (a Codex transcript I do not hold).

---

## 8. Verdict

**PASS — pass 3r, lens `correctness-tests`.**

The bar this node sets is blocking only if V-47 or V-49 is unmet at `b97985a8`, or a guard moved. Measured:

- **V-47 met.** The seed replays the database's own sealed v4 and nothing else: 32 rows, `120bdfea…`, every row digest equal to the live log's, the v4 rows byte-identical before and after the seed, and no version above 4 created by it. Growth arrives by publication — version 5 in my fixture, 33 rows, the roster row and the five-slot set — and an identical second start publishes nothing. The pre-fix row set still drifts (RED re-derived), and the source mutant restores the drift and produces v9's digest, which is what made attempt 3 fail.
- **V-49 met.** `generate:contract` is the first fixed stage of `dev:auth:up`, before the model check and before the data plane that seeds, pinned by two cases in a suite that ran 26/26.
- **Neither guard moved.** The FIX's diff over `dev-api-environment.ts` and `packages/db` is empty; the version cap is still 4; the drift detector passes; the api.env predicates were not widened (the pre-S03 custody remains an acceptance addendum, not a code change).
- **The frames match the orchestrator's re-verification** everywhere they overlap: C3 ×3 `2 failed | 93 passed (95)`, §5 `2 failed | 190 passed (192)`, §5-1b `57/57`, pins `1 failed | 40 passed (41)`. Every failure is inherited and named, with its cause measured.

Five non-blocking findings (N12–N15 plus the three carried), each of which needs a ticket by end of pass. **No `V-ROW: NEW` from this lens.**

---

## 9. Probes promoted

- `.hermes/reports/debate-tiers/probes/REV-S03-p3r-correctness-tests-probe.test.ts` — the five V-47 frames, with V's 32 live v4 row digests **inlined** as the oracle so it carries no external file.
- `.hermes/reports/debate-tiers/probes/REV-S03-p3r-correctness-tests-run-probe.sh` — takes the root from `$WORKTREE`, else argv[1], else cwd; copies the probe into `<root>/tests/integration/`, runs it, removes it, prints the porcelain before and after. **Verified end to end in this session** from a clean tree: `porcelain before: 0` · `Tests 5 passed (5)` · `rc=0` · `porcelain after: 0`.
- The source mutant of §3.2 is recorded here rather than scripted: it is a three-slot→five-slot edit of one frozen literal, and its restore proof is the file digest `81f13c28627d6d53d0f8356890c93b9299ccba4820052869b980a8f753da1497`, captured before the edit and re-measured after.

---

## 10. Rows for V

**None from this lens this pass.** V-47 and V-49 are met; N12–N15 are ticket work, not decisions. The rows already open and untouched by me: V-34 (the OpenAI key), V-41, V-42, V-48 (ruled NO), V-51 (the runner readiness gate), and the one-time custody step.

---

## 11. Predictions about the other lens (written before any contact; falsifiable)

Product-truth is the only sibling this pass. I predict it reports **PASS**, and that its `/new` join re-run at `b97985a8` still lists the file's ids — because the entire merge delta over S03's files is observability plumbing and the `readPlanTierRosters` block is byte-identical to the head it measured at pass 3, so nothing between the file and the card moved. Where I expect it to be *less* sure than it sounds: the live `dev:auth:up` log it is asked to read against R32 and §2 steps 6–10 ends on `DEV_RUNNER_PROCESS_READINESS_INVALID`, so a literal reading of step 6 ("run `pnpm dev:auth:up`, wait for it to finish… it succeeds") is **not** satisfied by that log — the register half is, the stack half is not, and the difference is V-51, which is not S03's. If product-truth calls that a blocking failure of R32 it will have mistaken an inherited runner gate for S03's promise; if it calls R32 satisfied without naming V-51 it will have overclaimed. The honest verdict names both halves, which is what I would check first. Second, I expect it to carry N1/N2 unchanged, and I would bet against it noticing N12 — the two `p2-*` suites are invisible from a product-truth lens because they assert source text, not behaviour, and they are in no cluster command anyone runs. Third, if it re-measures the 5xx face of `/v1/plan-tiers` it will find the body changed shape under the merge (`correlation_id` replacing `message`); that is the observability branch's, not S03's, and it would be a mis-attribution to file it against this slice.
