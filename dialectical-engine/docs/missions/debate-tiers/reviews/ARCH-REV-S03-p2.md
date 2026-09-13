# ARCH-REV(S03) — pass 2 of 3 (SCOPED) · blind re-review of `PLAN(S03)` Revision 2 · seat ARCH-REV-S03 · ticket `t_f06b97cf`

**Verdict: REWORK (pass 2).** ONE blocking finding (B1-p2), five non-blocking (N1-p2 … N5-p2), one
packet defect. **B1–B3 of pass 1 are all properly closed and none is re-opened. All six N folds are
retired.** The blocking finding is a *recurrence of B2's class inside B2's own remedy*, C3-scoped.

**Two explicit answers the packet asks for (charge 8):**
- **BUILD can start now on `S03-C1` ∥ `S03-C2`.** Neither cluster touches the defect: I verified C1's
  own command green at base and C2's one surface gap harmless (below). Only `S03-C3` is blocked, and
  `S03-C4` behind it. ARCH-FIX pass 3 and the C1/C2 BUILD nodes can run in parallel.
- **F-ARCH-4 needs NO V row.** It is closed by S23 as written. Evidence in §5.

- Reviewed at main-tree freeze `e0230656` (record of the pass `cd04f1e9..e0230656`). Measured in the S03
  lane, HEAD `9a000c37`, **0 dirty at start and at end**, read-only. No git writes, no stack, no provider.
  **Neither embedded-postgres suite was run** (`tests/integration/register-support-publication.test.ts`,
  `tests/integration/production-database-principals.test.ts`) — reasoned from their assertions, as instructed.
- New probes (prefixed `p2-`, pass-1 probes re-run but never edited):
  `p2-rev-base.sh` + `p2-c1..c4.log` + `p2-rsp-alone.log` · `p2-surfaces-myrun.log` · `p2-surface-attack.mjs/.log`
  · `p2-dropped-paths.mjs/.log` · `p2-trace2.log` · `p2-sweep.log`.

---

## 1. Charge 1 — the ARCH-FIX packet and the handoff's counts

| Claim | Measured | Verdict |
|---|---|---|
| PLAN.md 1203 lines | `wc -l` → **1203** | OK |
| DECISIONS.md 497 lines | `wc -l` → **497** | OK |
| the seat's self-report 176 lines | `wc -l agent-reports/ARCH-FIX-S03.md` → **176** | OK |
| lane 0 dirty at `9a000c37` | `git rev-parse --short HEAD` → `9a000c37`; `git status --porcelain \| wc -l` → `0` | OK |
| `SPEC-v3.md` untouched | `git diff 76ccb043 -- …/SPEC-v3.md` → **empty** | OK |
| the seat wrote only PLAN.md, DECISIONS.md, its self-report | `git diff --stat cd04f1e9..e0230656` → those three from the seat; `ARCH-REV-S03-p2.md`, `COMMON.md`, `LEDGER.md`, `00-intake-S03.md`, `V-DECISIONS-PACKET.md` from the orchestrator | OK — `allowed` respected |

The two packet defects the seat named against the orchestrator (charge 3 pinning "five sites" from my
pass-1 table when seven signatures change; charge 7 pre-supposing unchanged commands) are **recorded, not
re-litigated**, as instructed. Both are already fixed in the FIX templates.

## 2. Charge 6 — the four cluster commands AS THEY NOW STAND, re-run by me

From my own `p2-rev-base.sh`, capture-first, at base in the lane. **Zero disagreements** with
`c-base-rev2.log`:

| Cluster | Seat's Revision-2 record | **My re-run** | Agree? |
|---|---|---|---|
| `S03-C1` (gained `tests/architecture/dev-deployment-register.test.ts`) | `Tests 8 passed (8)` | `Test Files  3 passed (3)` · `Tests  8 passed (8)` · rc=0 | **yes** |
| `S03-C2` | `14 passed (14)` | `Test Files  2 passed (2)` · `Tests  14 passed (14)` · rc=0 | **yes** |
| `S03-C3` (gained `tests/architecture/register-support-publication.test.ts`) | `Test Files 2 failed \| 7 passed (9)` · `Tests 3 failed \| 67 passed (70)` | `Test Files  2 failed \| 7 passed (9)` · `Tests  3 failed \| 67 passed (70)` · rc=1 | **yes** |
| `S03-C4` | `64 passed (64)` | `Test Files  4 passed (4)` · `Tests  64 passed (64)` · rc=0 | **yes** |

C3's three failures, verbatim from my log, each dated:

```
 × tests/architecture/register-support-publication.test.ts > … > recognizes hostile static SQL concatenation, interpolation, and tagged builders 3ms
 × tests/architecture/register-support-publication.test.ts > … > classifies every register relation access and bans open writers, latest selection, and unsafe version coercion 51ms
 × tests/integration/dev-provider-panel.test.ts > real development CLI provider panel > loads the exact live CLI targets without changing the fixed maker order 5ms
```

The third is F-ARCH-1 (pre-existing, `6a05a0d0`, closed by S32). The first two are the
`register-support-publication` pair the intake dates 2026-09-12 in the LEDGER; `git log -1` on both that
suite and `tests/support/registerFixtures.ts` returns `6a05a0d0 2026-09-13`, so the *commit* is 2026-09-13
and the LEDGER's date is the observation date — **pre-existing either way**, which is the material fact.
I also ran that suite alone: `Test Files 1 failed (1)` · `Tests 2 failed | 12 passed (14)` — **12/14
confirmed**.

**Does adding a RED-at-base suite blind C3 to its own mutant?** Partly — filed as N3-p2. At base C3 is
`3 failed`. The intended end state is `2 failed` (S32 closes `dev-provider-panel`; the
`register-support-publication` pair stays by R27's delta-zero). A seat that closes S32 **and** skips
S23's digest sweep also reads `3 failed` — the same total over a different set. The plan mitigates this by
naming the three base failures by title in the C3 row; it does not name the expected *after* set.

## 3. Charge 2 — B1 (`t_492abb53`) closure: the signature table

**Closed, and correctly.** S21 `:462` now carries a **seven-row** table, one `path:LINE` → new signature
→ argument source per row. Every anchor re-measured by me in the lane at `9a000c37`:

| Cited | Measured |
|---|---|
| `dev-api-environment.ts:310` | `function isExactProviderRuntimeRefresh(existing: string, expected: string): boolean` — module scope ✓ |
| `:336` | `function isExactPublishedRegisterRefresh(existing: string, expected: string): boolean` ✓ |
| `:376` | `function isExactProviderRuntimeRefreshWithLegacyProbeTimeout(` ✓ |
| `:387` | `function isExactLegacyEnvironmentWithoutSupportModelTarget(` ✓ |
| `:409` / `:493` | `export async function assembleDevelopmentApiEnvironment(` / the predicate closure ✓ |
| `dev-runner-process.ts:55` | `function createRunnerEnvironment(` — takes `(commandEnvironment, apiEnvironment)`, no `repositoryRoot` ✓ |
| `dev-api-process.ts:159` | `function validateExactEnvironment(` — **does** take `repositoryRoot` as its 2nd parameter ✓ |

The step's claim that `:133`'s enclosing `startDevelopmentRunnerProcess` (`:125`) carries `repositoryRoot`
is **true** — I read its input type: `input: Readonly<{ repositoryRoot: string; commandEnvironment; operations }>`.
So the third parameter S21 adds to `createRunnerEnvironment` has a real source. Every caller of every
re-signed function has its argument source stated, including the four `*-cli.ts` at `:13`/`:15`/`:24`/`:18`
(`loadModelConfigConfiguredProviders(process.cwd())`), and S28's `heldConfiguredProviderSets` is threaded
through the same table (row `:336`, "both values" from the `:493` closure). **One build, not two.**

**The defaulted-parameter trap: it does not land where the packet aimed it, and where it could land the
plan closes it in prose, not by measurement.** The four predicates are module-private with exactly one
caller (the `:493` closure), so a default buys nothing there. The exposure is on the four *exported* panel
functions, where a `= <module const>` default would let the three CLIs compile untouched — and that is
closed by S21's own instruction that the module-level `const configuredProviders` *becomes a function of
the loaded config*, plus S25's ban on reading the file at module load. Not blocking → **N2-p2**, with the
one criterion that would close it by measurement.

## 4. Charge 3 — B2 (`t_32e0064f`) closure, and the finding it did not close

I ran the seat's `surfaces.mjs` **myself** against Revision 2:

```
S03-C1  (17 paths)   S03-C2  (5 paths)   S03-C3  (23 paths)   S03-C4  (5 paths)
=== DISJOINTNESS: a file in more than one cluster ===
   none — every file sits in exactly one cluster
```

`diff` against the seat's `surfaces.log`: **IDENTICAL**. The counts match §2's rows `:844-847`, and
disjointness holds among the paths the script sees. C4 is now `S24, S35, S36`, `apps/ui/app/new/page.tsx`
is in its column (B2.1 fixed), its dependency line reads `C1 + C3`, and its RED-first test (S24's Free-card
case) is still true.

Then I attacked the derivation, as charged. → **B1-p2, §6.**

## 5. Charges 4 and 5 — B3 and F-ARCH-4

**B3 (`t_3642e0f1`) is closed, on both halves.** S19 `:412-425` now states the corrected mechanism
explicitly — *"It DOES publish a new register version, and that is the intended behaviour"* — cites
`dev-deployment-register.ts:635` `computeRegisterSnapshotSha256(rows)` → `:639`
`developmentProviderSetPublicationId(…)`, and ties it to acceptance step 6 (`/new` can only show the
edited id if the row carrying the ids moved). It then narrows R14.2 correctly: *a key appearing* publishes
no version, because a key changes neither `configuredProviderSet` nor `planTierRosters`. This reads the
same way as SPEC-v3 R14.2 `:167` ("a key appearing is not a new register version"), R24 `:314` ("a key
appearing or disappearing is not an entry-set change and publishes no version") and acceptance step 6
`:429-430`. DECISIONS `:435-451` supersedes the pass-1 ruling rather than editing it.

**Case (2) pins both halves** (`:434-435`): the `configuredProviderSet` row byte-identical across a
`model:` edit **AND** the `planTierRosters` row not. **S29 `:727` pins the key-arrival deep-equal.**

**The seat's near-miss, answered:** the step that pins "`planTierRosters` is built from the FILE, never
from `providerPanel.targets`" is **S29** — its case builds the publication rows with no keys and with both
keys and asserts the two row lists deep-equal. A row derived from the panel's targets would carry the
sentinel model on a keyless machine and the real id once keyed, so **the two lists would differ and S29
goes RED**. §7's new `S23 (Rev 2)` row states exactly this. Verified reasoning, no gap.

**F-ARCH-4 (`t_4fdd4c5a`) — verified, and it needs no V row.** I counted the sites myself:

| Site | What it is | Moves? |
|---|---|---|
| `tests/support/registerFixtures.ts:22-23` | the constant's declaration and literal | **yes** |
| `tests/architecture/register-support-publication.test.ts:231` | a **name string** in a bindings list | no |
| `…/architecture/…:356-357` | `expect(CONST).toBe("42b90bca…")` — literal | **yes** |
| `…/architecture/…:368` | `expect(developmentRows).toHaveLength(32)` | **yes → 33** |
| `…/architecture/…:371` | `expect(computeRegisterSnapshotSha256(developmentRows)).toBe(CONST)` | follows the constant |
| `…/integration/…:322`, `:337` | reference the CONSTANT symbol | follow automatically |
| `tests/integration/production-database-principals.test.ts:2754` | references the CONSTANT symbol | follows automatically |

Only three edits are genuinely forced (the literal at `registerFixtures.ts:23`, the literal at `:357`, the
count at `:368`); the rest reference the symbol and follow. **S23 `:556-579`'s four-member sweep lists every
one of them** (member 4 groups the three symbol-referencing sites) and **correctly excludes `:231` as a name
string**. `LEGACY_REGISTER_V1_SNAPSHOT_SHA256` and the 14-row historical count are correctly named as NOT
moving — I confirmed against the suite's own assertions (`historicalRows` → 14, `LEGACY…` → the v1 hash).
`production-database-principals.test.ts:2754` is in C3's surface and in §5's list for `REV(S03)`.
**Inside R27's "delta zero", not a V row:** the constant's own comment records S02 moving it on 2026-09-12
for the same class of change, and delta zero for `register-support-publication` (12/14) holds *because*
members 2 and 3 move together — which S23 states as the failure mode (11/14) if they do not.

**Packet defect (charge 5's premise).** The packet says BASELINE.md `:18`/`:56` "records `15` for
`tests/architecture/register-support-publication.test.ts` while the seat reports 12/14". There is no
conflict: BASELINE's list sits under **`pnpm typecheck` rc=1; diagnostics by file (count · file)** —
`15` is a typecheck-diagnostic count, not a test count. My measurement of the suite is
`Tests 2 failed | 12 passed (14)`. **The seat is right; the packet compared two different quantities.**

## 6. B1-p2 (BLOCKING) — `tests/architecture/dev-deployment-register.test.ts` is written by C1, broken by C3, and owned by neither

**The write the derivation cannot see.** S10's Files line (`PLAN.md:222`) is

```
Files — Modify: `package.json` (the repository root's), `tests/architecture/dev-deployment-register.test.ts`.
```

`surfaces.mjs` walks tokens after a `Create:`/`Modify:` marker and continues only while the next non-`[\s,;]`
character is a backtick. The parenthetical `(the repository root's),` ends the walk, so the second path —
a **declared write** — never enters a surface. My run confirms it: C1's derived 17 paths contain
`package.json` and **not** `tests/architecture/dev-deployment-register.test.ts`, while §2's C1 row *prose*
lists it — **18 paths listed under the label "17 paths"**. I swept the class
(`p2-dropped-paths.mjs`): 43 paths appear in a Files paragraph without entering a surface, and I judged
each — 42 are genuine citations the marker rule is right to drop; **this one is the only declared write
among them.**

**Why it blocks.** `tests/architecture/dev-deployment-register.test.ts:14` is a source-text assertion:

```js
expect(cli).toContain("loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment())");
```

S21 changes `dev-deployment-register-cli.ts:13` to pass a second argument
(`loadModelConfigConfiguredProviders(process.cwd())`), so that exact substring — with `)` immediately after
`loadDevelopmentCommandEnvironment()` — **no longer occurs**, and the assertion fails. Therefore:

1. The file is run by **both** C1's and C3's commands (C1 gained it at Revision 2; C3 has always had it).
2. It is **written by S10 (C1)** and **broken by S21 (C3)** — two clusters must write one file, which is
   the single-writer rule, and no step in C3 declares it.
3. **`S03-C3`'s command cannot go green inside `S03-C3`'s file contract.** A C3 seat must either cross its
   `allowed` list or stop. This is a done-criterion unsatisfiable at its own boundary.
4. The disjointness check reports `none` **only because the file is absent from the derivation** — the
   mechanical guarantee Revision 2 rests on is void for exactly the file that needs it.
5. §5's integrated run (`:1008`) includes the suite, so the failure also lands at `REV(S03)`.

**Why a fold cannot fix it, and pass 3 must.** `PLAN.md:854` makes the script authoritative — *"a column
that disagrees with it is the defect, not the script."* A ticket-comment fold adding the file to C3's
column would be **overwritten by the next run of `surfaces.mjs`**, which will drop it again. The remedy has
to change the plan and the script together:

- give `surfaces.mjs` a completeness assertion (every backticked path in a `Files —` paragraph is either
  captured or explicitly classified a citation; exit non-zero otherwise) — I wrote this as
  `p2-dropped-paths.mjs`, ~15 lines, and it prints the S10 drop immediately;
- re-punctuate S10's Files line so the walk does not stop (move the parenthetical after both paths);
- add `tests/architecture/dev-deployment-register.test.ts` to **C3**'s Files line on S21 with the `:14`
  assertion update named, and settle its single writer between C1 and C3 (my recommendation: C3 owns it,
  since S21 is the breaking change and C3 runs after C1);
- re-derive and re-label C1's count.

**Scope: C3 only.** `S03-C1` and `S03-C2` are unaffected — see the header.

## 7. Non-blocking findings

- **N1-p2 — S21's done-criterion calls a function no test can import.** It requires *"a case asserts that
  `isExactProviderRuntimeRefresh` called with a configured set that does NOT contain the outgoing file's
  refs returns `false`"*. Measured: `dev-api-environment.ts` exports only `:29`
  `DEVELOPMENT_API_ENVIRONMENT_KEYS`, `:73` the receipt type and `:409`
  `assembleDevelopmentApiEnvironment`; all four predicates are module-private. Two builds: export the
  predicate (changing the module's public surface, which the plan does not authorise), or drive it through
  `assembleDevelopmentApiEnvironment` with a crafted `input.providerPanel.configuredProviders`. Name one.
  Related: §7's `S21 (Rev 2)` row claims the case catches *"a predicate that keeps a module-level
  configured set"* — it catches one that **ignores its parameter**, not one that keeps a module-level set
  as a **default**.
- **N2-p2 — nothing measures that the three CLIs pass their new argument.** The defaulted-parameter build
  is excluded by S21's prose and S25's module-load ban, not by a criterion. One source-text case would
  close it by measurement — and `tests/architecture/dev-deployment-register.test.ts:14`, updated, is
  already exactly that case for `dev-deployment-register-cli.ts`. Closing B1-p2 and N2-p2 is one edit.
- **N3-p2 — C3's aggregate can hide its own mutant.** Base `3 failed`; intended after `2 failed`; a seat
  that closes S32 and skips S23's digest sweep also reads `3 failed`. The C3 row names the three base
  failures by title; it should name the expected **after** set by title too.
- **N4-p2 — two more command-vs-surface gaps of B1-p2's class, both verified harmless.**
  `tests/architecture/dev-runner-provider-set.test.ts` (C3's command, no surface) references none of the
  symbols S21 re-signs — it imports `createRunnerProviderTopology` and builds its own targets.
  `tests/unit/provider.test.ts` (C2's command, no surface) never calls `normalizedProviderBaseUrl`; its
  `/v1` endpoints are gateway fixtures, so S14 cannot move it. Also: C3's row prose says *"the **eight**
  test files in the command"* — the command names **nine**, of which **seven** are in the derived surface.
- **N5-p2 — packet defect, charge 5's premise** (typecheck diagnostics vs test results). §5 above.

## 8. N folds from pass 1 — all six retired, verified at their lane lines

| Fold | Check | Verdict |
|---|---|---|
| N1 (seven citations) | `main.ts:65` = the drift `if`, `:70` = the throw · `hermes-relay.ts:33` = `readGlmCredential`, `:54` = `nlink !== 1` · `HERMES_SUPPORT_PORT` at `:19` · `dev-real-provider-only.test.ts:27` / `:41` · `dev-deployment-register.ts:503-505` = the duplication guard · R25 pin at `:348`. My `sweep.mjs` on Revision 2: **OUT OF RANGE = 0** (was 1 + 3 bare-form) | retired |
| N2 (labels) | S17's ABSENT record **CONTAINS**, S23's row **CONTAINS** `:532`, S28's map **EXACT** `:712` | retired |
| N3 (S19 guard order) | `:404-411` names S4's class 2 as the earlier guard and states the RED case hand-builds a `ModelConfig` | retired |
| N4 (C3 suite count) | the 23-path arithmetic is now coherent — but the "eight" prose is still off by the two files of N4-p2 | retired with a residue |
| N5 (S14) | `:279-298` is **one** instruction — KEEP `:127`, DELETE `:128-130` — and it adds a case for `…/paas/v4//`, naming the call-time consequence `…/paas/v4//chat/completions`. Better than I asked | retired |
| N6 (S12 comments) | five exact comment substrings asserted mechanically, labelled CONTAINS | retired |

**Trace on Revision 2** (my `trace2.mjs`): **R1..R33 33/33 · S1..S36 36/36 declared and reverse-traced ·
true orphans: none · the same 32 asymmetries** I recorded at pass 1 as not-a-gap, unchanged.
**Banned words: zero** in any step or criterion (the five hits at `:34-36` are the law's own statement).
**§7's three new rows refute rather than restate** — each names a concrete wrong build and the case that
catches it (see §5 for the `S23 (Rev 2)` row, which is the sharpest of the three).

## 9. Pass-1 predictions, scored

- **Prediction 3 — HIT, and it recurred inside the remedy.** I predicted that whoever checked the cluster
  table would check disjointness (which holds) and not completeness (which did not). Revision 2 replaced
  the hand-written column with `surfaces.mjs`, which checks disjointness mechanically and reports
  `none` — and whose marker-walk silently drops S10's second declared write. **B1-p2 is that prediction
  coming true a second time, one level deeper.**
- **Predictions 1 and 2 — untested.** No independent lens ran this pass; the same reviewer was resumed. S28
  was not contested and remains, on my pass-1 measurement, sound. The seat accepted B3 without dispute, so
  prediction 2 (that a reader trusting the citations would miss it) was never put to a reader.

**Predictions for pass 3.** If ARCH-FIX fixes only the C3 row and not `surfaces.mjs`, the next re-derivation
will drop the file again and the fix will silently revert — that is the first thing I would check. Second: the
completeness assertion, once added, will probably surface one or two *more* declared writes hidden behind
prose the same way (my class sweep found 43 candidates and I judged 42 to be citations by hand — a
machine-checkable classification will disagree with me somewhere, and that disagreement is worth reading
rather than suppressing). Third: I expect S28 to remain sound and to keep attracting attention it does not
need.
