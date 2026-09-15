# F-T1-ORACLE-EVALUATOR — WORKER, ROUND 0: the dependency and resolution gate

`SKILLS LOADED: heartbeat (loader, Skill tool) · heartbeat-protocol router (read as markdown at the path the loader resolved) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returned "Unknown skill: heartbeat-worker"; read at /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md as the packet's `skills` clause instructs) · superpowers:using-superpowers (Skill tool) · superpowers:test-driven-development (Skill tool) · superpowers:verification-before-completion (Skill tool) · superpowers:systematic-debugging (Skill tool) · superpowers:receiving-code-review (Skill tool)`

**comments read through:** `t1-oracle-evaluator-plan-r4-2026-09-06`

---

## NAMED FACT, carried verbatim (D68 ADDENDUM 2, plan §9.15 R4)

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

The runtimes actually used by every command in this round: **Node v25.7.0**, **pnpm 11.20.0**.
The repository's `engines.node` is `22.23.1`; every pnpm invocation printed
`[WARN] Unsupported engine: wanted: {"node":"22.23.1"} (current: {"node":"v25.7.0","pnpm":"11.20.0"})`.
No seat may describe this gate as discharged for 22.23.1. **STRENGTH: entailed** (versions read from
`node --version` / `pnpm --version` in the same shell that ran every gate; the warning is in each log).

The sentence is also carried in the smoke file's own header
(`tests/unit/depth-oracle-r0.smoke.test.ts:16-18`) and in the self-report. In the source file it is
**wrapped across comment lines**; stripping the leading `*` markers and joining the lines reproduces
it **exactly**, verified by string comparison — the same normalisation codex applied to the plan in
r4 F2. It is a faithful copy, not a paraphrase.

---

## Identity of the work

| | |
|---|---|
| working directory | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine` |
| branch | `lane/t1-oracle-evaluator` |
| base (packet's constant, verified) | `2af816f183247efefae65172bb7036eefd049fa1`, clean |
| **lane tip after this round** | **`0c4c34dfe3da6ade18301200368222311abf0529`** |
| commit contents | 4 files, **184 insertions, 0 deletions** |
| runtimes | Node v25.7.0 · pnpm 11.20.0 |
| smoke file | `tests/unit/depth-oracle-r0.smoke.test.ts` (new) |
| records | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r0/` |

Nothing pushed. Nothing merged. No evaluator code. `integration`, `lane-devsync` and
`lane-t1-oracle-loginfp` were not touched (the loginfp corpus was not read this round either — it is
round 1's import, per outcome 6 below).

---

## OUTCOME 1 — baselines FIRST, on the clean base

### 1(a) the selected group — **31 static instances**, before any change

`04-baseline-selected-group-BEFORE.log`, `04b-selected-names-BEFORE.txt`

```
$ pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source" --reporter=verbose
 Test Files  1 failed (1)
      Tests  2 failed | 29 passed | 13 skipped (44)
EXIT STATUS: 1
```

The selected describe `S1-1 · the depth bound has a single source` holds **31** instances
(29 passed + 2 failed). The 13 skipped are the file's *other* describes, which the `-t` filter
excludes — they are not part of the selected group. This is **31, not 66**: 66 is the parked
loginfp corpus at `60641339`, a different population on a different base, and it was not used.
**STRENGTH: entailed** (counted from the verbose markers; `✓`=29, `×`=2, `↓`=13, summing to the
file's 44).

The two failing names, verbatim:

1. `tests/unit/s1-1-depth-contract.test.ts > S1-1 · the depth bound has a single source > keeps the owning declaration as the only depth-bound site in shipped code`
2. `tests/unit/s1-1-depth-contract.test.ts > S1-1 · the depth bound has a single source > leaves no duplicate definition of the ruled ceiling anywhere in shipped code`

**D68's "three s1-1 names stay red" is reconciled, not contradicted.** The parent's own
`27-suite-run2.log` carries exactly three failing `s1-1` names: the two above, plus
`S1-1 · the architecture audit recognizes the ruled exports and edges (J10) > reports no T1-owned architecture or source-rule violation`,
which lives in a **different describe** and is therefore outside this selected group by construction.
My baseline of 2 is complete *for the selected group*. **STRENGTH: entailed** (all three names
extracted from the parent log into `26-parent-failing-names.txt`).

### 1(b) typecheck — **8 diagnostics, recorded by identity**

`05-baseline-typecheck-BEFORE.log`, `05b-typecheck-identities-BEFORE.txt`

`pnpm exec tsc --version` from this directory → **Version 7.0.2** (the invocation directory is pinned
to the package root, per the recorded two-compilers trap). `pnpm typecheck` → **EXIT STATUS: 1**,
with these eight, every one in `tests/unit/s14-ui.test.ts`:

| path(line,col) | code | subject |
|---|---|---|
| `tests/unit/s14-ui.test.ts(19,8)` | TS2307 | cannot find `../../web/lib/v3Presentation.js` |
| `tests/unit/s14-ui.test.ts(131,38)` | TS18046 | `'label'` is of type `'unknown'` |
| `tests/unit/s14-ui.test.ts(137,71)` | TS18046 | `'label'` is of type `'unknown'` |
| `tests/unit/s14-ui.test.ts(208,18)` | TS2339 | `'nodes'` does not exist |
| `tests/unit/s14-ui.test.ts(209,18)` | TS2339 | `'placeholderEdges'` does not exist |
| `tests/unit/s14-ui.test.ts(239,58)` | TS2307 | cannot find `../../web/lib/api.js` |
| `tests/unit/s14-ui.test.ts(241,55)` | TS7006 | `'input'` implicitly `any` |
| `tests/unit/s14-ui.test.ts(241,62)` | TS7006 | `'init'` implicitly `any` |

These are recorded **by identity/code/path**, not as "eight errors". Codex's standing objection is
honoured: the comparison below is set equality on these identities, so a *different* eight would
fail it. **STRENGTH: entailed** (captured verbatim with `EXIT STATUS` per the gate-log trap).

### 1(c) the NAMED package-resolution failure, before installation

`06-resolution-BEFORE.log` (direct probe) and `07-RED-smoke-cannot-load.log` (from the test context)

Direct probe from the repo root:

```
FAILED    typescript-classic -> MODULE_NOT_FOUND: Cannot find module 'typescript-classic'
RESOLVED  typescript -> .../node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/version.cjs
```

From the **root test context**, which is the form the packet requires — the smoke file existed and
could not load:

```
$ pnpm exec vitest run tests/unit/depth-oracle-r0.smoke.test.ts
Error: Cannot find package 'typescript-classic' imported from .../tests/unit/depth-oracle-r0.smoke.test.ts
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }
 Test Files  1 failed (1)
      Tests  no tests
EXIT STATUS: 1
```

This single record is **both** outcome 1(c) and the round's **TDD RED frame**: the suite-load failure
is a failure, not a skip, and it is named by module specifier and error code.
**STRENGTH: entailed.**

The root cause of the whole grant is also recorded here: `node_modules/typescript/lib/` at the root
contains only `getExePath.{js,d.ts}`, `tsc.js`, `version.cjs`, `version.d.cts` — **there is no
`lib/typescript.js`**, so root `typescript@7.0.2` cannot serve as a compiler API at all. It is a
native-binary wrapper. **STRENGTH: entailed** (directory listed).

---

## OUTCOME 2 — the ONE dependency change

### The manifest line

`git diff --numstat -- package.json` → **`1  0`**. The whole diff:

```
     "typescript": "7.0.2",
+    "typescript-classic": "npm:typescript@5.9.3",
     "vitest": "4.1.10"
```

### The commands, in the order run

| # | command | log | exit |
|---|---|---|---|
| 0 | `pnpm install --frozen-lockfile` (**setup**, see packet defect P1) | `02-baseline-install-frozen.log` | 0 |
| 0b | `pnpm run generate:contract` (**setup**, gitignored output) | `03-generate-contract.log` | 0 |
| 1 | `pnpm install` — **the granted install, the only run without `--frozen-lockfile`** | `08-install-alias.log` | 0 |
| 2 | `pnpm install --frozen-lockfile` — the verification | `09-frozen-lockfile.log` | **0** |

Step 1 reported `devDependencies: + typescript-classic <- typescript 5.9.3 (7.0.2 is available)`.
Step 2 reported `Already up to date` and **exit 0**, which is the claim the packet asks for: the
committed lockfile satisfies the committed manifest. **STRENGTH: entailed.**

### The lockfile delta, line by line

`10-lockfile-delta.log`, `11-no-unrelated-upgrade.log`. `git diff --numstat` → **`3  0`**, one hunk,
`@@ -119,0 +120,3 @@ importers:`:

```
+      typescript-classic:
+        specifier: npm:typescript@5.9.3
+        version: typescript@5.9.3
```

**It contains no unrelated upgrade.** Four independent grounds, each mechanically checkable:

1. **Zero removals.** The delta removes nothing.
   > **SUPERSEDED (codex r0 F4, restated after codex r1 F3).** The sentence that stood here —
   > "an upgrade rewrites an existing line and therefore *always* produces a removal" — is a
   > universal I cannot support, and it survived my first correction sweep. **Replacement rule:**
   > a zero-removal count is *corroboration* that no unrelated upgrade rode along, never a
   > standalone proof; the proof is the inspected changed content and the resulting resolved
   > versions, which are recorded in `11-no-unrelated-upgrade.log`. Same rule as appended to
   > `TOOLING-TRAPS.md`.
2. **Root `typescript` is still 7.0.2** — unchanged at lockfile lines 117–119 (`specifier: 7.0.2` /
   `version: 7.0.2`), and it appears only as diff *context*.
3. **One importer touched.** The single hunk is inside the root importer stanza. No other importer,
   and no `packages:` block, is in the diff.
4. **No `packages:` entry was needed, and that is correct** — `typescript@5.9.3` already existed in
   the lockfile at lines 3319 and 5690, resolved for `apps/ui` (which pins `^5.6.0`). The alias
   reuses that resolution. I flag this explicitly because a reviewer expecting a new `packages:`
   block could read a 3-line delta as truncated; it is complete. (Appended to `TOOLING-TRAPS.md`.)

**STRENGTH: entailed** for all four.

Pre-change lockfile snapshot and hash are kept at `08a-pnpm-lock.BEFORE.yaml`
(sha256 `a4450df480d0712175aafddb1255b75148fbbe19ed7aa8e8b429451eb5c6b67c`, 5843 lines) so the delta
can be recomputed by a reviewer without trusting my diff.

---

## OUTCOME 3 — package-name resolution from the root test context

`12-resolution-AFTER.log`

```
RESOLVED  typescript-classic  version=5.9.3
          entry -> .../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js
RESOLVED  typescript          version=7.0.2
          entry -> .../node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/version.cjs
```

Both resolve **by package name**. No relative import into `apps/ui` or `.pnpm` is used anywhere —
the forbidden mechanism is not present in the smoke file, which imports the bare specifier
`"typescript-classic"`. The link farm confirms it:
`node_modules/typescript-classic -> .pnpm/typescript@5.9.3/node_modules/typescript`.
The alias ships the compiler API (`typeof ts.createSourceFile === "function"`); the root package
still does not (`node_modules/typescript/lib/typescript.js` → `false`).
**STRENGTH: entailed.**

---

## OUTCOME 4 — the counted smoke, five named instances

**File:** `tests/unit/depth-oracle-r0.smoke.test.ts` — exactly the granted location, and a **separate
describe** from `S1-1 · the depth bound has a single source`. Five tests in a different file do not
make the selected group 36; the selected group is unchanged at 31 (outcome 5).

**Command:** `pnpm exec vitest run tests/unit/depth-oracle-r0.smoke.test.ts`
**Result: `Tests  5 passed (5)` — passed/total = 5/5, exit 0.** (`13-GREEN-smoke.log`)

| # | instance | what it pins |
|---|---|---|
| i | resolves typescript-classic by package name at version 5.9.3 and exposes the API surface the evaluator uses | `ts.version === "5.9.3"`; `createSourceFile`, `forEachChild`, `getLineAndCharacterOfPosition`, `isArrayLiteralExpression`, `isNumericLiteral`, `isPrefixUnaryExpression`, `ScriptTarget`, `ScriptKind.TS/TSX`, `SyntaxKind.ArrayLiteralExpression` |
| ii | parses TypeScript with zero parse diagnostics, sets parent links, and reports the array literal's source position | 0 diagnostics; `parent` → `VariableDeclaration` → `VariableDeclarationList`; position line 1 (0-based) and the column of `[` |
| iii | parses TSX with zero parse diagnostics and sets parent links through the JSX container | 0 diagnostics under `ScriptKind.TSX`; parent chain walkable; a `JsxExpression` is present |
| iv | normalises numeric literal text and carries the sign as a separate prefix node (plan M14) | `1_0`→`10`, `0x10`→`16`, `0o10`→`8`, `0b10`→`2`, `1.5`→`1.5`; `-1` is a `PrefixUnaryExpression` with `MinusToken` over a literal whose text is `"1"` |
| v | detects a deliberately malformed input through the single test-local diagnostic accessor | `parseDiagnostics` non-empty on `const broken = [1, 2, ;`, with a usable `file`, numeric `start` and non-empty message |

**The diagnostic accessor, and where it moves in round 1.** `parseDiagnostics` is not part of
TypeScript's documented public surface. It is read behind **one** function,
`parseDiagnosticsOf(file)`, defined in this test file and nowhere else. **In round 1 it moves into
`tests/support/depthOracle.ts`, behind `parseModule`** (plan §1.5 R2 / §1.9 R3), which returns
`{ ok:false, diagnostics }` from it; this file's copy is then deleted, so the lane reads the property
in exactly one place and a future TypeScript bump touches one line. This is stated in the file's own
comment, not only here. **STRENGTH: entailed** for today's behaviour (measured); **consistent-with**
for the property's long-term stability.

### Cluster verification — three runs, worst run wins (heartbeat-worker §3)

`20-smoke-cluster-3runs.log`

| run | exit | anchored-summary guard | summary |
|---|---|---|---|
| 1 | 0 | 0 | `Tests  5 passed (5)` |
| 2 | 0 | 0 | `Tests  5 passed (5)` |
| 3 | 0 | 0 | `Tests  5 passed (5)` |

**Worst run: 5 passed (5), exit 0.** The guard is the capture-first, anchored, nonzero-pass-count
form the traps file mandates — it rejects the `N skipped / exit 0` false green and cannot have its
status stolen by a live pipe.

---

## The refutation duty (heartbeat-worker §2) — five mutants caught, one neighbour correctly not caught

Every mutant was applied by literal string replacement with a **nonzero anchor count checked**
> **SUPERSEDED (codex r0 F5, restated after codex r1 F3).** This paragraph originally said the
> anchor *occurrence count* was asserted. Round 0's harness only checked that an anchor existed and
> replaced **every** occurrence. **Replacement rule:** a declared multiplicity must be asserted —
> which is what `mutate.sh` v3's `MUT_EXPECT` now does, and every round-1 transcript declares
> `MUT_EXPECT=1`.
The round-0 harness applied the replacement with
(a mutant whose anchor is missing is reported VOID and not run), the applied diff printed before the
verdict, and the file restored from a pristine copy whose **sha256 was re-verified after every
restore** — `346a067177212b72268b443895d9a2cc06227d531a6ad8414dafa74668bdf27a`. `git status --porcelain`
was printed after each restore and showed only the round's own three contract files.
Harness: `mutants/run-mutant.sh`; pristine: `mutants/PRISTINE.ts`.

| id | mutation | property it exists to catch | result | log |
|---|---|---|---|---|
| M-A | `import ts from "typescript-classic"` → `"typescript"` | the lane is wired to the **pinned** parser, not merely to some TypeScript | **RED — 5 failed (5)** | `14-mutant-A-wrong-package.log` |
| M-B | `setParentNodes` `true` → `false` | parent links are set; plan §1.5 R2 calls a parse without them unusable | **RED — 2 failed \| 3 passed**, exactly instances ii and iii | `15-mutant-B-no-parent-links.log` |
| M-C | TSX parsed as `ScriptKind.TS` (**this is plan K23's own mutation**) | the extension→ScriptKind mapping is load-bearing | **RED — 1 failed \| 4 passed**, exactly instance iii | `16-mutant-C-wrong-scriptkind.log` |
| M-D | `literal.text` → `literal.getText(file)` | the value comes from the parser's **normalised** text, not the written form (M14) | **RED — 1 failed \| 4 passed**, exactly instance iv | `17-mutant-D-raw-text.log` |
| M-E | malformed input → well-formed input | the accessor detects real malformation and is not vacuously non-empty | **RED — 1 failed \| 4 passed**, exactly instance v | `18-mutant-E-wellformed.log` |
| **M-N** | `ScriptTarget.Latest` → `ScriptTarget.ES2015` (**neighbour**) | the smoke pins the parse *contract*, **not** the language target | **GREEN — 5 passed (5), exit 0 — correctly NOT caught** | `19-neighbour-mutant-N.log` |

M-B, M-C, M-D and M-E each failed **only** the instances that exist to catch them and left the others
green. That is the discrimination the contract asks for: the assertions are derived from the
properties, not fitted to one demo mutant. M-N confirms the converse — the smoke does not over-pin
incidental settings, so it will not manufacture false failures in later rounds.
**STRENGTH: entailed** for every row (each is a recorded run with its applied diff).

---

## OUTCOME 5 — after the change

### 5(a) the selected group is unchanged

`21-baseline-selected-group-AFTER.log`, `21b-selected-names-AFTER.txt`, `22-selected-names-diff.txt`

```
      Tests  2 failed | 29 passed | 13 skipped (44)
EXIT STATUS: 1
```

`diff` of the **full marker+name set** before vs after: **IDENTICAL** — 44 lines, 31 selected
instances, same two failing names, same 29 passing names, same 13 skipped. Not a count comparison: a
line-by-line set comparison, so a swap of one name for another would fail it.
**STRENGTH: entailed.**

### 5(b) typecheck — no NEW attributable diagnostic

`23-baseline-typecheck-AFTER.log`, `23b-typecheck-identities-AFTER.txt`, `24-typecheck-identities-diff.txt`

`diff` of the identity sets before vs after: **IDENTICAL** — the same 8 `path(line,col) + code`
records, exit 1, `tsc` still **Version 7.0.2**. The new smoke file **contributes zero diagnostics**,
which is a real check rather than a vacuous one: `tsconfig.json`'s `include` carries `tests/**/*.ts`,
so `tests/unit/depth-oracle-r0.smoke.test.ts` **is** compiled by this gate, under `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`.
**STRENGTH: entailed.**

### 5(c) the full suite four-count — every failing name attributed, NONE unexplained

ONE `pnpm test` on the tip `0c4c34df`, porcelain empty before and after.
`25-full-suite-tip.log`; accounting `27-fourcount-tip.log`; script `fourcount.sh`.
Duration **3075.65s**; started 17:48:55Z, finished 18:40:11Z.

```
FOUR-COUNT GATE ACCOUNTING — 25-full-suite-tip.log
  1. test failures        : 82   (parsed distinct names: 82)
  2. suite-load failures  : 1   (files that could not load; their tests are NOT in count 1)
       - tests/unit/s14-ui.test.ts
  3. skips                : None
  4. unhandled errors     : 1   (from vitest's own 'Errors N error' summary line)

  passed 2341 · total 2423 · test FILES 35 failed of 261 · exit 1
  PARSE CHECK: summary failed 82 vs parsed names 82 -> MATCH
```

**The accounting script was validated on known-good input before use.** Run against the parent's own
`logs/w5/27-suite-run2.log`, it reproduces the parent's recorded `31-fourcount-run2.log` exactly on
all six fields (`80 / 1 (tests/unit/s14-ui.test.ts) / None / 1`, `passed 2338 · total 2418 · test
FILES 34 failed of 260 · exit 1`, `PARSE CHECK … MATCH`). **STRENGTH: entailed.**

| | parent `31-fourcount-run2.log` | this tip | delta |
|---|---|---|---|
| test failures | 80 | **82** | **+2** |
| suite-load failures | 1 (`tests/unit/s14-ui.test.ts`) | 1 (`tests/unit/s14-ui.test.ts`) | 0 — same file |
| skips | None | None | 0 |
| unhandled errors | 1 | 1 | 0 |
| passed | 2338 | 2341 | +3 |
| total | 2418 | **2423** | **+5** |
| test FILES | 34 failed of 260 | 35 failed of 261 | +1 file, +1 failed |
| exit | 1 | 1 | same |

**The `+5` total is exactly my five smoke instances** (2418 + 5 = 2423), and the smoke **passed 5/5
inside the full run** — it appears zero times as a `FAIL` file. This was predicted before the run and
confirmed after. **All 80 of the parent's failing names recurred**; none disappeared
(`30-gone-vs-parent.txt` is empty). **STRENGTH: entailed.**

#### The two appeared names, each attributed

`29-new-vs-parent.txt` isolates them; neither is mine.

**A1 — `tests/integration/registration-database.test.ts > S3 registration and verification on real PostgreSQL > S3d rework4 labels the shallow register handoff by the successor address arm`**
A wall-clock envelope assertion: *"scored arms exceeded the ruled 600 ms healthy-storage envelope"*,
with six overruns at `elapsed_ms` 5419, 5535, 9765, 4078, 5408, 5501 against `budget_ms=600`.
> **CORRECTED after codex r0 F1 (2026-09-06).** My original wording claimed host load was *proven*,
> labelled the attribution *entailed*, said the host misses the asserted budget *even in the passing
> run*, and implied every seat would see it. All four overstated the evidence and are withdrawn.

**Attribution: an unchanged timing assertion with a context-sensitive failure. Not attributable to
this diff.** Re-run alone on the same tip it **PASSES** (`1 passed | 68 skipped`, exit 0, guard 0;
`31-attribution-isolation-rerun.log`). The raw parent measurement has `scored_pretransport_overruns=0`
and the raw tip has 6; total duration rose 2834.86 s → 3075.65 s (+240.79 s), with transform and
import time also higher.

**What I got wrong:** the passing isolated run's 727/974/982 ms messages are **not** evidence that the
host misses the budget in the scored interval. The test clears its console spy after the seed/filler
burst, so those earlier messages need not be scored at all; a passing `.toEqual([])` means there were
**no captured scored overruns** in that run. The compressed isolation log does not place those three
messages inside the scored interval, and I should not have said it did.

**STRENGTH: entailed** for the recorded counts and the isolated pass; **consistent-with** — not
entailed — for non-attribution to this delta (codex r1b F3-R: an absent or unchanged failing identity
is weaker than establishing that nothing in the delta could have caused it);
**consistent-with** for load/timing sensitivity — the evidence does not distinguish external host
contention from inherited run-order or resource effects; **undetermined** for the exact cause. Vitest
runs `fileParallelism:false` and the smoke appears later in the raw log, so this is *not* evidence of
concurrent smoke CPU load. No claim is made that every seat or run must see it. The 600 ms requirement
is not changed by this lane.

**A2 — `tests/integration/session-database.test.ts > S5 sessions on real PostgreSQL > runs the password-to-TOTP challenge through real Argon2 and creates one hash-only session`**
Fails with `UNEXPECTED_RISK_SIGNAL_FAILURE`. This one **reproduces in isolation**, so it is not load
flake and I did not treat it as such. Its cause is unreadable from the log by construction:
`apps/api/src/sessions.ts:439` is `}catch{this.dependencies.onRiskSignalFailure();}` — a bare catch
that discards the error, and the test turns any such failure into a fatal throw.

> **CORRECTED after codex r0 F2 (2026-09-06).** I classified this as "pre-existing on this base and
> host". That is wrong in a way that matters: my experiment established **reproduction without the
> alias**, not **failure in the September 5 parent run**. Codex supplied the actual mechanism.

**Classification: an inherited, date-dependent FIXTURE defect exposed in this run; reproduced without
the alias.** The mechanism is calendar arithmetic, not a native binding and not host load: the test
fixes `currentTime` at **2026-08-23T10:00:00Z**, the policy grants **14 days** of idle lifetime, so the
session's idle expiry is **2026-09-06T10:00:00Z**. The risk-signal scope query uses PostgreSQL's
`clock_timestamp()`, independent of the injected service clock; after that instant its strict expiry
predicate excludes the session, `auth-risk.ts` returns `scope_unresolved`, `sessions.ts:438` turns it
into `LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED`, the bare `catch` discards it, and the test's callback throws
`UNEXPECTED_RISK_SIGNAL_FAILURE`. The parent's PostgreSQL start stamp is September 5 — *before* the
expiry; my run is September 6 — *after* it.

**The Argon2 name in the test title is not evidence of a native-binding failure**, and I should not
have let it colour the diagnosis. My experiment (`32-…log`, `33-…log`) remains sound for its limited
contrast — base manifests restored, alias link absent, same failure, then tip restored and the smoke
re-verified 5/5 — but it is not a fresh parent checkout and does not roll back time state.

**Ticketed elsewhere as F-ARGON2-SESSION-ENV; not mine to fix.** **STRENGTH: entailed** for the
timestamp arithmetic, the control flow, the unchanged blobs and the no-alias reproduction;
**consistent-with** for this being the hidden cause in the recorded run; **undetermined** for the
discarded exception's actual value, since no database-clock or caught-error probe was run.

Restoration is recorded in `33-attribution-experiment-restore.log`: `git checkout HEAD -- …` plus
`git reset -q` (the `HEAD~1` checkout **stages**, which is the recorded trap — porcelain showed `M `
in the index column), then porcelain **empty**, tip still `0c4c34df`, the alias reinstalled, and the
smoke re-verified **5 passed (5), exit 0** on the restored tip.

Two independent supports for both attributions:
1. `typescript-classic` is referenced by exactly **three** files repo-wide — `package.json`,
   `pnpm-lock.yaml`, `tests/unit/depth-oracle-r0.smoke.test.ts`. Neither failing test references it.
2. The lockfile delta has **zero removals** (corroboration, not proof — see the superseded universal
   above); the inspected content shows no other package's resolution changed, and the only
   filesystem addition under `node_modules` is one root symlink to a `typescript@5.9.3` that was
   already in the store.

#### File-level accounting closes exactly

`260 → 261` total files is my smoke file. `34 → 35` failed files is
`tests/integration/session-database.test.ts`, which carried **0** failing names in the parent and
**1** now (A2); `tests/integration/registration-database.test.ts` was **already** a failed file in the
parent, so A1 adds a name but not a file. **STRENGTH: entailed.**

**Unexplained names: none.**

---

## OUTCOME 6 — what the LATER rounds owe, so no one pretends it exists at round 0

These are **not** established by this round, and this round claims none of them:

- **The 27 + 3 control floor does not exist on this base.** It is imported/adapted from
  `lane/t1-oracle-loginfp @ 60641339` onto the `2af816f1` base **in round 1**, via the authorised
  oracle-test co-touch (plan §5.5–§5.6 R4, §8.15–§8.18 R4). The parked corpus holds 66 static
  instances in *its* selected describe; this base holds 31. **The two populations are not
  interchangeable and no count may be carried across.** I did not read the parked corpus this round.
- **The corrected mutation MANIFEST is round 1's, and codex-gated before round 2** (D68 ADDENDUM 3):
  K16 → OTHER; K21's explicit edit and result; K31 isolated from the depth limit; K43; K45 bound to
  literal bytes/offsets; and a stated disposition for K8/K9/K10. Each row needs a precise rule edit,
  a fixture or named shipped assertion, an observable, a baseline, a mutant, its first usable round,
  and a restoration obligation — written against **real parser output**, which only now exists.
- **Display/identity assertions are compulsory** (codex F3): a correct candidate *count* does not
  establish correct displayed text or address, and a line-based DOMAIN key collapses A3's two
  same-line occurrences. Exact text, line, start/end and the A3 cardinality must be asserted, staged
  against the real discovery/evaluated/site APIs — fields must not be invented by inference.
- **The test-local `parseDiagnostics` accessor moves** into `tests/support/depthOracle.ts` in round 1
  and is deleted from the smoke file.

**STRENGTH: entailed** that these are unmet today (nothing in this round touched them);
**consistent-with** for the round assignment (read from plan R4 and codex r4 F2 item 7).

---

## Packet defects and findings (heartbeat-worker §1 and §5)

**P1 — BLOCKING-ADJACENT, resolved without consuming the grant; the packet should say this itself.**
The packet orders "Baselines FIRST on the clean base" and separately grants exactly **one**
`pnpm install`. But this worktree had **no `node_modules` at all**
(`ls -ld node_modules` → *No such file or directory*), so `pnpm exec vitest` and `pnpm typecheck`
could not run until something installed. Read literally, a seat must either burn its single grant on
setup or declare itself blocked. I resolved it by **observing the resulting state**, not by appealing to a flag's guarantee.
> **CORRECTED after codex r0 F4:** I originally wrote that `--frozen-lockfile` **cannot** modify the
> manifests, as though the flag were an immutability boundary. It is not one — my own setup log shows
> the install executing package scripts. The honest ground is the evidence, not the slogan: after the
> setup install `git status --porcelain` was **empty**, and the complete recorded diff shows the two
> manifests unchanged.
The frozen install is therefore distinguishable from the granted dependency-resolution install by what
it *did*, which is recorded, rather than by what the flag promises. The grant's install is the one *without* `--frozen-lockfile`, run later and once.
A second setup step was also required and is not in the packet: `pnpm run generate:contract`, because
`packages/contract/generated/client.ts` is gitignored and absent from every fresh worktree.
**Requested fix:** a packet that says "baselines first" **and** "exactly one install" must name the
command that establishes the toolchain. **STRENGTH: entailed** (the absence, the two setup runs and
the clean porcelain are all recorded).

**P2 — non-blocking, packet wording.** The packet says the lockfile delta must be shown "line by line
with no unrelated upgrade", which invites the reading that a `packages:` entry should appear. It does
not, and should not, because `typescript@5.9.3` was already resolved for `apps/ui`. Stated
affirmatively above with the pre-existing line numbers so the 3-line delta is not read as truncated.
**STRENGTH: entailed.**

**F1 — CORRECTED after codex r0 F3 (2026-09-06); the original claim was false.** I wrote that
`pnpm typecheck` is "blind to `acceptance/`". It is not: the root `tsconfig.json` **includes**
`acceptance/**/*.ts` and does not exclude that directory, and a nested tsconfig does not by itself
cancel a root include. **Retracted.** The actual configuration, read from the file this round:
**include** = `apps/**/*.ts`, `packages/**/*.ts`, `tools/**/*.ts`, `acceptance/**/*.ts`,
`tests/**/*.ts`, `vitest.config.ts`, `drizzle.config.ts`; **exclude** = `node_modules`, `web`,
`apps/ui`, `packages/contract/generated`, `tests/architecture/t05-half-write-probes`. So `apps/ui` and
`web` are excluded, and there is no direct `tests/**/*.tsx` include — though I no longer claim that an
omitted glob alone keeps an imported file out of the program. My smoke file is `.ts` and therefore *is* covered, so outcome 5(b) is sound as
written — but a future round adding a `.tsx` oracle test would get **no** type coverage from this
gate and a green typecheck would not be evidence for it. Already in `TOOLING-TRAPS.md` from earlier
seats; repeated here because round 1 creates test files. **STRENGTH: entailed** (read from
`tsconfig.json` include/exclude).

**F2 — observation, reconciling D68 with this base.** D68 says "the three s1-1 names stay red". On
this base the *selected group* has **two** red names; the third red `s1-1` name is in the
`(J10)` describe, outside the group. Anyone comparing "3" against my "2" without reading the describe
boundary will file a false finding. **STRENGTH: entailed** (all three names extracted from the
parent's own suite log).

**F3 — finding, out of my contract to fix, named with file and line.**
`apps/api/src/sessions.ts:439` is `}catch{this.dependencies.onRiskSignalFailure();}` — a **bare catch
that discards the error object**. Two distinct causes route into it (a `recordForSession` throw, and
the `LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED` `TypeError` raised inside the same `try`), and neither is
recoverable from any log. This is why A2 above could only be attributed by experiment: the diagnostic
was never emitted. **Requested fix (someone else's ticket): bind the caught error and pass it to
`onRiskSignalFailure`.** **STRENGTH: entailed** (source read at that line).

**F4 — finding, environmental fragility on this host.**
> **SUPERSEDED IN PLACE (codex r0 F1 and r1b F3-R).** The heading originally read "will recur for
> **every seat** on this host", and the body said the host "misses the asserted budget **even when the
> test passes**". Both are withdrawn, and the evidence against them is my own: the registration
> failure was **absent from the pre-rework round-1 run and absent again from the rework run** — two
> consecutive runs on this host without it. **Replacement rule:** a context-sensitive timing failure is
> reported as *may recur*, never *will recur for every seat*; and the messages printed in a **passing**
> run are not evidence that the scored interval missed its budget, because the test clears its console
> spy after the seed/filler burst and a passing `.toEqual([])` means no captured scored overruns.
> **STRENGTH:** the recorded counts are entailed; recurrence is **consistent-with**; the exact cause
> is **undetermined**.

Two integration assertions are marginal here and may keep producing "new" failures that are not
anyone's diff: `tests/integration/registration-database.test.ts:3748` asserts a **600 ms**
healthy-storage envelope this host sits close to (727/974/982 ms were logged during a *passing*
isolated run, outside the scored interval), and `tests/integration/session-database.test.ts` S5 fails
**reproducibly on this date** on this base, independent of
the alias.
> **WITHDRAWN IN PLACE (codex r1c F3-R2).** The instruction that stood here — "*Any lane running a
> full suite here **will** see both and must not spend a round re-attributing them*" — is withdrawn.
> Changing "every seat" to "Any lane" changed the wording, not the reasoning, and the correction block
> above did not reach this sentence. **The evidence refutes it:** the registration failure was absent
> from BOTH round-1 full runs (pre-rework and rework). **Replacement rule:** a context-sensitive
> timing failure **may recur**; it is never asserted as one every lane will see, and its **exact cause
> remains undetermined**. A lane that meets either failure should attribute it against these records
> rather than assume it. **STRENGTH: entailed** for both measurements; **undetermined** for the S5 root cause, which F3
makes unreadable.

---

## Marker

Every fact the packet asks for is proven by a record under
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r0/`,
the named fact is carried verbatim, and no failing name is unexplained.

`READY FOR PEER REVIEW`

`comments read through: t1-oracle-evaluator-plan-r4-2026-09-06`

---

## Contract compliance

Files changed, and nothing else:

| file | change | in `allowed`? |
|---|---|---|
| `package.json` | +1 line (the alias devDependency) | yes — "the ONE devDependency line" |
| `pnpm-lock.yaml` | +3 lines (alias entry, root importer only) | yes — "the alias entry and its importer only" |
| `tests/unit/depth-oracle-r0.smoke.test.ts` | new, 154 lines | yes — named exactly |
| `.hermes/TOOLING-TRAPS.md` | +26 lines, appended at the end | yes — append-only |

No evaluator code. No board edit. No `DECISIONS.md` edit. No credential value. No push, no merge, no
branch or worktree operation beyond one commit on the lane. `apps/ui/package.json` and the parked
corpus were treated as read-only (the parked corpus was not opened at all). The TS 7 scanner was not
used; no relative import into `apps/ui` or `.pnpm` exists in anything I wrote.

---
---

# ROUND 1 — parser, discovery, addresses · the 27 + 3 floor · the corrected manifest

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r0-2026-09-06`

## NAMED FACT, carried verbatim (D68 ADDENDUM 2)

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

Runtimes actually used by every round-1 command: **Node v25.7.0**, **pnpm 11.20.0**, **tsc 7.0.2**
(from the package root). **STRENGTH: entailed.**

## Identity

| | |
|---|---|
| working directory | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine` |
| base (round-0 tip, verified) | `0c4c34dfe3da6ade18301200368222311abf0529`, clean |
| round-1 tip | `be12d9ba6bbd1904cb0e59ace21fc84f0e931b72` |
| records | `…/logs/t1-oracle-evaluator/r1/` |
| manifest | `…/agent-reports/t1-oracle-evaluator-manifest.md` |

Conditional setup (codex F4): `node_modules` **present**, `packages/contract/generated/client.ts`
**present**, `typescript-classic` **resolves** → **no provisioning run**. Clean tracked state verified
**before** any baseline (`01-preconditions.log`). Nothing pushed, nothing merged.

## Baselines, before any edit

| gate | result | log |
|---|---|---|
| selected s1-1 describe | `2 failed \| 29 passed \| 13 skipped (44)` → **31 selected instances**, exit 1 | `02-baseline-selected-BEFORE.log` |
| the round-0 smoke | `5 passed (5)`, exit 0 | `03-baseline-smoke-BEFORE.log` |
| `pnpm typecheck` | **8** diagnostics, all `tests/unit/s14-ui.test.ts`, exit 1, tsc 7.0.2 | `04-baseline-typecheck-BEFORE.log` |

## The corpus is ENUMERATED, not assumed

`05-corpus-measurement.log`, `05b-corpus-files.txt`. `shippedSourceFiles()` returns **232** files —
**159 `.ts`, 59 `.tsx`, 13 `.mjs`, 1 `.mts`**. The prior 232 figure is therefore *confirmed by
enumeration on this base*, not carried. The gate asserts both totals, so a corpus that changes size
fails it. **STRENGTH: entailed.**

## K23 — RED first, by named parse diagnostics

`06-K23-RED-wrong-scriptkind.log`, `06b-K23-RED-named-diagnostics.txt`. With `scriptKindFor` mapping
`.tsx → ScriptKind.TS`, the corpus gate failed and **named 57 distinct `.tsx` files with their actual
diagnostics** — distribution **48 `'>' expected.` · 7 `Type expected.` · 2 `Property assignment
expected.`**, every path a member of the enumerated 232-file corpus
> **CORRECTED (codex r1 B7).** This said **47**. The raw transcripts always carried **57**; my
> *derived* list was built with the character class `[a-z0-9/_.-]`, which excludes `[`, `]` and
> uppercase, so paths like `apps/ui/app/debate/[id]/DebatePageClient.tsx` matched from the middle and
> `sort -u` collapsed the fragments. Recounted with paths intact into
> `30-K23-diagnostics-RECOUNTED.txt`; the defective derivation carries a SUPERSEDED banner and the
> raw logs are unmodified. — `'>' expected.`, `Property assignment expected.`, e.g.
`apps/ui/app/layout.tsx: 34: '>' expected.` The RED observation is the **diagnostic list**, not a
candidate count. Correcting the mapping to `ScriptKind.TSX` turned it GREEN at 232/232
(`07-K23-GREEN-corpus-enumerated.log`). **STRENGTH: entailed.**

## Addresses were MEASURED before they were asserted

`08-fixture-address-measurement.log`. Every A1–A11 literal in the test was measured with the pinned
parser first. The plan's two predicted constants reproduced exactly — A3's `(10,21)` and `(33,44)` —
and A1's ASI statement line is **2** while A2's JSX-container statement line is **1** with the element
on line 2, which is the whole reason the walk climbs `parent` instead of scanning punctuation.
A10a/A10b/A11 yield **0** candidates: a computed property name, an element access and a tuple *type*
are not array-literal expressions. **STRENGTH: entailed.**

## What the module implements (round 1 only)

`tests/support/depthOracle.ts` — one implementation module, 307 lines at first commit:

- `parseModule` with `setParentNodes: true` and the explicit extension→`ScriptKind` mapping, holding
  **the lane's single `parseDiagnostics` accessor**;
- `candidatesOf` returning `DiscoveredCandidate` — `start`, `end`, `elementLine`, `statementLine`, and
  **nothing else**: no evaluation fields, no consumed span, no placeholder a later reader could believe;
- `domainSites` — `[]` on a clean parse, **exactly one** `INCONCLUSIVE` on a rejected one;
- the ceiling arms, extracted **byte-identical** (below), with their inherited regex limitation intact.

No transfer rules, no abstract domain, no verdicts. No DOMAIN verdict changes: the old emitter still
owns every DOMAIN site.

## The accessor move

`12-smoke-after-accessor-move.log`. The round-0 smoke's local `parseDiagnosticsOf` is **deleted**;
`grep -rn parseDiagnostics tests/` now finds the property read in **exactly one place**,
`tests/support/depthOracle.ts`. Malformed input stays observable in the smoke **through that shared
path** — instance (v) now calls `parseModule` and asserts `ok === false` plus a usable line and
message. Smoke: **5 passed (5)**, exit 0. One instance was renamed (`single test-local diagnostic
accessor` → `single shared diagnostic accessor`), which is a disclosed consequence of the move.

## The floor: 27 ceiling + 3 bare DOMAIN, counted from the file

Source-to-destination inventory. The base's 31 selected instances decompose exactly:

| Group | Base | Destination |
|---|---:|---|
| "written as" spellings, minus the 2 bare DOMAIN | 6 | → `ceilingSites`, asserting `["DEPTH_BOUND_LITERAL"]` |
| "laid out as" layouts, minus the 1 bare DOMAIN | 3 | → `ceilingSites` |
| wrapped conjuncts | 3 | → `ceilingSites` |
| unrelated-ceiling negatives | 2 | → `ceilingSites`, `toEqual([])` |
| exclusive-six layouts | 3 | → `ceilingSites` |
| oracle **952** `does not pair a six with a depth in another conjunct` | 1 | → `ceilingSites` |
| oracle **956** `does not manufacture a site when the negative control is collapsed` | 1 | → `ceilingSites` |
| `narrows r3 in exactly one place` — **both halves**, `kindOf` preserved | 1 | → `kindOf` + `ceilingSites` |
| unrelated-depth negatives | 5 | → `ceilingSites` |
| **depth-in-reach controls** | **0** | **IMPORTED from the donor** |
| **base ceiling subtotal** | **25** | |
| bare DOMAIN controls (2 spellings + 1 layout) | 3 | **stay on the old emitter** (§5.6 R4) |
| shipped assertions (2, both inherited-red) + exported-source check (1) | 3 | unchanged |
| **total** | **31** | |

**The import.** The donor at `60641339b983365952dd6cd61ed2f379aef6dc8a`, line 1128, supplies the two
missing controls — `index run with a depth token in reach` and `past the ceiling with a depth token in
reach`. Adapted (donor asserted through the old emitter; here they assert `ceilingSites` with the exact
kind), not duplicated. **25 + 2 = 27 ceiling, + 3 bare DOMAIN = 30, counted from the file.**
I did **not** import the donor's heuristic implementation or its 66-test population: 66 describes the
donor, 31 described this base, and the two are different populations.

Positives assert the **kind**, never non-emptiness — `expect(ceilingSites(planted).map(s => s.kind))
.toEqual(["DEPTH_BOUND_LITERAL"])`.
> **NARROWED (codex r1 F1).** I wrote that *every* migrating control's output was measured first.
> `09-ceilingsites-control-measurement.log` actually holds **17 rows = 14 positive ceiling cases +
> 3 bare DOMAIN cases**, including the two donor additions. It does **not** contain the three
> exclusive-six positive layouts, nor the ten negative/narrowing ceiling cases — and negatives do
> not each yield one site; they yield **none**, which is their assertion. The remaining controls are
> evidenced by the final selected run (`19-gate-selected.log` and its rework successor), not by
> record 09.
Of the controls record 09 does cover, each yields exactly one site of the expected kind. No
malformed ceiling fragment was rewritten into parseable source, and the three bare DOMAIN controls run
through a **text-only** path that never parses.

## The extraction defect I introduced, and the control that caught it

**This is the most important finding of the round.** I reproduced `declarationUnits` in the new module
from the first ~12 lines I had read, rather than copying it. The real function also handles line and
block comments, string and template literals with nested `${}`, braces as unit boundaries, closing
brackets below the start depth, commas as separators, and splits conjuncts at `&&`/`||`/`??` at **any**
bracket depth. Mine split only at the unit's own depth.

The inherited control `does not pair a six with a depth in another conjunct of the same condition` went
**RED**, reporting a `DEPTH_BOUND_LITERAL` where `[]` was required
(`10-selected-after-migration.log`). I did not adjust the control. I replaced my reconstruction with
the **verbatim** original and then verified mechanically that the extracted items match their source
under a stated normalization (codex r1 F1: the original claim of six byte-identical items was too
strong). **Five are literal matches** once the added `export` keyword is excluded — the three
predicates, `declarationUnits`, and the four-regex block. **The sixth, `ceilingSites`'s body, matches
after ONE further explicit substitution**: the map's type parameter `new Map<string, DuplicateSite>()`
became `new Map<string, Site>()`, because the site type was renamed in the module. That is a
type-name substitution, not a byte-for-byte match, and the runtime composition is unchanged by it — `kindOf`, `kindOfCeilingLiteral`, `kindOfExclusiveBound`, `declarationUnits`, the four
regexes, and `ceilingSites`'s body against the original `duplicateBoundSites`'s body: `verbatim: True`
for every one. `11-selected-after-verbatim-fix.log` then shows only the two inherited failures.

**THE RULE, now in `TOOLING-TRAPS.md`:** *code carried between files is COPIED and proven byte-identical
mechanically, never retyped from a partial read; and a behaviour-preserving extraction is proven by
migrating its inherited controls in the same step and running them.* **STRENGTH: entailed.**

## The three gates, separately, with stamps

| gate | command | result | log |
|---|---|---|---|
| smoke | `pnpm exec vitest run tests/unit/depth-oracle-r0.smoke.test.ts` | **5 passed (5)**, exit 0 | `18-gate-smoke.log` |
| selected describe | `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"` | **2 failed \| 50 passed \| 13 skipped (65)** → **52 selected instances**, exit 1 | `19-gate-selected.log` |
| typecheck | `pnpm typecheck` | **8** diagnostics, **identical to baseline by identity/code/path**, exit 1, tsc **7.0.2** | `20-gate-typecheck.log` |

**The selector recount: 31 → 52 (+21)**, enumerated: corpus gate 1 · parse-context fixtures 6 ·
A1–A11 addressing 10 · truncated `INCONCLUSIVE` 1 · clean-parse-no-domain-site 1 · donor depth-in-reach
2. The smoke's five instances are in a **separate file** and are not part of this count.

**The two inherited failures stay red, by design** — `leaves no duplicate definition…` and `keeps the
owning declaration…`. They are the shipped assertions the old emitter still owns, and "nothing left
red" does not apply to them while it runs. The third inherited `s1-1` failure lives in the `(J10)`
describe, outside this selector. No round-1 test was written or rewritten to make them green.

## The three round-1 mutation transcripts

All three via `tools/mutate.sh` v2, each applied and restored individually, each gated
pre `0` → applied `1` → restored `0`, sha256 equal before and after (`HASHES MATCH`), porcelain `[]`.
**Evidence is the declared observable, not a nonzero exit.**

| # | Observable | Baseline | Observed under the mutant | Log |
|---|---|---|---|---|
| **K23** | DIAGNOSTIC | 0 failures | the gate named **57 distinct `.tsx` files** (48 `'>' expected.` · 7 `Type expected.` · 2 `Property assignment expected.`) | `14-K23-transcript.log` (v2) · `37-K23-transcript-v3.log` (v3) |
| **K25** | ADDRESS | A1 `statementLine` **2** | **1** — `start`/`end`/`elementLine` unchanged, so the row discriminates the walk and nothing else | `15-K25-transcript.log` |
| **K27** | SITES | **1** `INCONCLUSIVE` | **0** (`expected [] to have a length of 1`) | `16-K27-transcript.log` |

Round-0's M-C does **not** replace K23: M-C moved one hand-written TSX fixture; K23 moves the corpus
gate over 232 real files. K28/K38 are scheduled for round 2; the remaining manifest mutations plus m6's
survival for round 3.

## The corrected manifest

Filed at `…/agent-reports/t1-oracle-evaluator-manifest.md`, against real parser output, for codex to
gate before round 2. All six required corrections are made and each carries its reason: **K16** →
`UNDETERMINED→OTHER` (identity on `[1,2,3]` is `[1,2,3]`, not the ruled domain); **K21**'s stop *and*
its `UNKNOWN` fallback named; ~~**K31** given a **flat** fixture measured at **73 nodes, depth 2**, so
no depth bound can independently reject it;~~ **K43** rebased on a **known** receiver; **K45** bound to
one literal source with measured discovery offsets **`(64,77)`**; and ~~**K9 demoted to a control**
because it is an equivalent mutant of K48's rule over K35's fixture~~.

> **THIS PARAGRAPH IS HISTORICAL, NOT OPERATIVE — the operative statements are the manifest's and the
> rework sections below** (codex r1b F3-R: a later correction is insufficient while an earlier
> instruction still reads as operative). Two of its claims were refuted:
> - **K31's 73-node/depth-2 fixture was itself invalid** (codex r1 B1): an array literal and an
>   element access put it outside the §3.9 purity gate, so the callback is rejected whatever the
>   budget is. **Replacement:** `n` plus a balanced sum of 32 literal zeroes — **128 nodes, depth 11**,
>   in-grammar. **Rule:** grammar admission is checked before any count.
> - **K9 is NOT an equivalent mutant** (codex r1 B4): on the shared fixture
>   `[0,1,2,3,4,5].filter(n => n)`, K9 (`+0` truthy) changes `RULED → OTHER` while K48 (`-0` alone)
>   leaves it `RULED`. **Replacement:** K9 restored as a separate mutation. **Rule:** equivalence is a
>   claim about behaviour on inputs, established only by showing no input separates two mutants.

**The recount, mechanical: 48 mutations** (0 duplicates), split **3 / 2 / 43** by first usable round,
**7 control-only**, 1 merged, 1 survival → **49 transcripts** (`35-manifest-recount.log`).
> **CORRECTED (codex r1 B4).** The pre-rework filing said 47 mutations / 8 control-only / 48
> transcripts, on the ground that K9 was "an equivalent mutant" of K48. **That was false**: on the
> shared fixture `[0,1,2,3,4,5].filter(n => n)`, K9 (numeric `+0` truthy) kills the assertion
> `RULED → OTHER` while K48 (negative zero alone) leaves it `RULED`. K9 is restored as a separate
> mutation and the inventories are recomputed.

## The full suite, and the four-count against BOTH baselines

ONE `pnpm test`. `21-full-suite-tip.log`; accounting `26-fourcount-r1-tip.log`; reconciliation
`28-fourcount-reconciliation.log`. Started 2026-09-06T19:32:51Z, finished 20:21:19Z, **2905.68 s**.

**Measured at tip `be12d9ba`, porcelain empty at start.** The final tip is `2dfc76b1`; the only change
between them is the append to `.hermes/TOOLING-TRAPS.md`, a Markdown file that is outside the vitest
`include` (`tests/**`, `acceptance/**`), outside the oracle's `SHIPPED_ROOTS` (`packages`, `apps`,
`web`) and outside the tsconfig `include` — so no gate in this round reads it. The run's
`porcelain AFTER` shows that one file dirty for exactly that reason; it was committed immediately
afterwards. **STRENGTH: entailed** (the three scopes were read from `vitest.config.ts`, the test source
and `tsconfig.json`).

```
FOUR-COUNT GATE ACCOUNTING — 21-full-suite-tip.log
  1. test failures        : 81   (parsed distinct names: 81)
  2. suite-load failures  : 1   (files that could not load; their tests are NOT in count 1)
       - tests/unit/s14-ui.test.ts
  3. skips                : None
  4. unhandled errors     : 1   (from vitest's own 'Errors N error' summary line)

  passed 2363 · total 2444 · test FILES 35 failed of 261 · exit 1
  PARSE CHECK: summary failed 81 vs parsed names 81 -> MATCH
```

| | parent | round-0 | **round-1** |
|---|---|---|---|
| test failures | 80 | 82 | **81** |
| suite-load failures | 1 (`s14-ui`) | 1 (`s14-ui`) | **1 (`s14-ui`)** |
| skips | None | None | **None** |
| unhandled errors | 1 | 1 | **1** |
| passed | 2338 | 2341 | **2363** |
| total | 2418 | 2423 | **2444** |
| test FILES | 34 of 260 | 35 of 261 | **35 of 261** |
| exit | 1 | 1 | **1** |

**The arithmetic, stated rather than asserted:**
`2423 + 21 = 2444` (round-0 total plus this round's 21 new selected instances) ·
`2341 + 21 + 1 = 2363` (round-0 passed, plus 21 new all passing, plus one that stopped failing) ·
`82 − 1 = 81`.

### Every failing name attributed; none unexplained

| vs | appeared | disappeared |
|---|---|---|
| **round-0 (82)** | **0** | 1 — `registration-database … S3d rework4 labels the shallow register handoff` |
| **parent (80)** | 1 — `session-database … S5 … password-to-TOTP … Argon2` | 0 |

- **No new failing identities relative to round 0** — zero names appeared against round-0's set.
  **STRENGTH: entailed** for the name-set comparison itself. Causal non-attribution to this diff is
  **consistent-with**, not entailed: a name-set comparison shows no new identity, which is weaker
  than establishing that nothing in the round could have caused a failure (codex r1 F3).
- **The registration timing failure did not recur.** This is direct confirmation of codex r0 **F1** —
  an unchanged timing assertion with a context-sensitive failure, host/resource contention
  *consistent-with*, exact cause *undetermined* — and it refutes the "every seat would see it" reading
  my round-0 report implied, which is now withdrawn above. **STRENGTH: entailed** (absent from this
  run's name set).
- **The S5 session failure recurred, exactly as codex r0 F2 predicted.** The fixture's session idle
  expiry is **2026-09-06T10:00:00Z**; this run started **2026-09-06T19:32:51Z**, after it, so
  PostgreSQL's `clock_timestamp()` excludes the session and the scope resolves unresolved. Inherited,
  date-dependent fixture defect, reproduced without the alias in round 0; ticketed
  **F-ARGON2-SESSION-ENV**; out of this lane's scope. **STRENGTH: entailed** for the timestamp
  arithmetic.
- **`s14-ui`** remains the single suite-load failure and the source of the eight inherited typecheck
  diagnostics. Ticketed elsewhere, untouched.

**Unexplained names: none.**

### The accounting tool was hardened before it was used (codex r0 F5)

`fourcount2.sh`, validated in `22-fourcount-tool-validation.log`. It **requires** the `Tests`,
`Test Files` and `EXIT STATUS` lines and exits **2** when any is missing, and exits **3** on a
summary/name mismatch instead of printing `MISMATCH` and returning success — both defects codex found
in round 0's version. Validated on **known-good** input (it reproduces the parent's `80/1/None/1` and
round-0's `82/1/None/1` exactly) **and** on three malformed inputs — empty, truncated mid-run, and
summary-present-but-`EXIT STATUS`-stripped — each correctly refused with exit 2. Round 1's mutation
transcripts used the mission's own `tools/mutate.sh` v2 rather than my round-0 harness.

## Codex r0 findings — disposition

| # | Finding | Disposition |
|---|---|---|
| **F1** | registration attribution overstated causation and the scored interval | **Accepted and corrected in place** above; the round-1 run then confirmed the correction by not reproducing the failure |
| **F2** | S5 is a calendar-dependent fixture defect, not a native-binding diagnosis | **Accepted and corrected in place**; reclassified as inherited and date-dependent, reproduced without the alias; recurred this round as predicted |
| **F3** | the typecheck-scope claim was false | **Accepted and retracted**; the actual include/exclude lists are now quoted from `tsconfig.json`, printed into `04-baseline-typecheck-BEFORE.log` rather than paraphrased |
| **F4** | provisioning/evidence wording too strong | **Accepted**; the report now cites observed state and the recorded diff instead of the flag's promise, and `TOOLING-TRAPS.md` carries an appended correction narrowing both round-0 slogans |
| **F5** | evidence tools too weak to promote | **Accepted**; `fourcount2.sh` hardened and validated against malformed input, "anchor occurrence count asserted" corrected to "nonzero anchor count checked", M-N recorded as a visible two-site mutation, and round 1 used the mission harness |

## Marker

Every outcome the packet names is proven by a record under
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r1/`,
the named fact is carried verbatim, the manifest is filed for codex to gate before round 2, and no
failing name is unexplained.

`READY FOR PEER REVIEW`

`comments read through: t1-oracle-evaluator-r0-2026-09-06`

---
---

# ROUND 1 — REWORK 1 of 3, after codex r1 (CHANGES; MANIFEST GATE CLOSED)

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r1-2026-09-06`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

The parser extraction and the 27 + 3 floor are verified and stay. Every one of B1–B7 and F1–F3 is
accepted; none is argued down. **History is preserved:** each superseded claim keeps its original
text with a `SUPERSEDED` / `NARROWED` / `WITHDRAWN` annotation naming the finding and the replacement
rule, rather than being silently rewritten.

## B1 — K31's fixture moved INSIDE the callback grammar

My fixture used an **array literal** and an **element access**, both excluded by §3.9 R2 clause 3.
The purity gate rejects that callback outright, so raising the node budget could never have produced
the promised `RULED` — and my claim that "only the node budget can reject this input" was false. The
73-node/depth-2 measurement described a tree without establishing admission.

Replacement, measured (`32-B1-K31-fixture.log`): `n` plus a **balanced sum of 32 literal zeroes** —
241 bytes, **0 parse diagnostics**, **128 counted nodes** (> the 64 budget), **max depth 11** (< the
32 limit), node kinds `Identifier` ×1 / `NumericLiteral` ×32 / `BinaryExpression` ×32 /
`ParenthesizedExpression` ×31 / **`PlusToken` ×32** — the operator tokens are `forEachChild` children
and are counted, which is how the total reaches 128 *(corrected in place, codex r1c F3-R2: the earlier
list said four kinds "only" while its own count included them; the operative manifest already listed
all five)*, native value `[1,2,3,4,5]`. Both work limits are now **recorded** (node budget 64, recursion
depth 32) with their **counter and depth semantics stated exactly**, and the baseline is replayed
against the **purity gate as well as** the evaluator. The grammar was not enlarged.

## B2 — K43 given a candidate that fails rule 1

`[[1,2,3,4,5]].at(0)` discovers the **inner** array, whose distinct set is exactly the ruled set, so
**rule 1 decided it `RULED` before `at` was ever reached**: the declared `RULED → OTHER` was really
`RULED → RULED`. Replacement `const choices = [0,1,2,3,4,5].map(n => "x").at(0);` — measured: one
candidate at `(16,29)`, distinct set `{0,1,2,3,4,5}` so **rule 1 does not fire**, receiver cells six
known `str`. The row asserts the **cells as well as the verdict**.

## B3 — K10 given a discriminating fixture

The old fixture was `OTHER → OTHER`: R4 retains and deduplicates boolean payloads, so a
boolean-returning `||` gives `Set → [true] → slice(1) → []`, still `OTHER`. Replacement
`const choices = [0,1,2,3,4,5].map(n => n || 1);` — baseline cells `[1,1,2,3,4,5]` → **RULED**,
mutant cells `[true×6]` → **OTHER**. The edit is stated exactly (return the boolean result of the
operation rather than the selected operand `Prim`), and the row asserts cells.

## B4 — K9 restored; my equivalence claim was false

**This is the most serious error of the round**, because it would have permanently deleted a
discriminating mutation. On the very fixture I cited, `const choices = [0,1,2,3,4,5].filter(n => n);`,
**K9** (numeric `+0` truthy) yields `[0,1,2,3,4,5]` → `OTHER` and kills the assertion; **K48**
(negative zero alone) leaves it `[1,2,3,4,5]` → `RULED` because the fixture contains no `-0`. The
input separates them. And K35 is an **assertion**, not a mutant. K9 is restored as a separate
mutation, K48 keeps the signed-zero discriminator, K35 remains the control, and the false-equivalence
instruction is removed from **both** filings.

**Recount, mechanical (`35-manifest-recount.log`): 48 mutations** (0 duplicates), **3 / 2 / 43**,
**7 control-only**, 1 merged, 1 survival → **49 transcripts**. Recounted from the repaired table, and
it agrees with codex's conditional arithmetic.

## B5 — a canonical source inventory for every row

The manifest now carries **complete parseable source for all 48 mutation rows, the 7 control rows and
m6** (Part 2). No `const choices = <expr>` shorthand, no `[0..5]` ranges, no receiverless suffixes.
Declaration fixtures (K18, K19, K40, K51) are marked as declarations. K7c and K7d must each violate
**exactly one** purity clause with all others satisfied.
> **CORRECTED (codex r1b B5-R).** K7c does; **K7d did not**. Its fixture
> `map(n => { let m = 0; m = n; return m; })` fails clause 2 (body shape) *as well as* clause 3
> (assignment) — the canonical table said "clauses 2 + 3" while this sentence claimed isolation, a
> contradiction inside one filing. With two clauses failing, removing assignment rejection would still
> leave the body-shape gate rejecting the callback, so the control could stay `UNDETERMINED` **without
> testing assignment rejection at all**. **Replacement:** `const choices = [0,1,2,3,4,5].map(n => (n = n));`
> — measured: clauses 1, 2 and 4 **SATISFIED**, clause 3 the **only** violation, 5 nodes at depth 2 so
> no work-limit confound, one candidate at `(16,29)`, rule 1 does not fire. **Rule:** an isolation
> control must be checked against *every* clause it does not intend to violate, not only the one it does. K32 restores the plan's explicit *"evaluate
only the final `return`"*. K47 is bound to the SAME-sentinel source **with the sentinel duplicated**,
because on an all-numeric sentinel source the edit provably has no effect (`34-K47-binding.log`) —
its direction is corrected to `RULED → OTHER` for that reason. K3–K5, K29, K30 and m6 name the two
shared shipped assertions explicitly. m6 carries baseline **1 → 1** and the same restoration
obligation as every kill-expected row. Mechanically verified: **every mutation id has a canonical
source; none missing**.

## B6 — the missing parse contexts and the five original prefixes

Added (`31-B6-measurements.log`, measured before assertion):

| context | path | candidate |
|---|---|---|
| a regex literal after a **control-condition parenthesis** | `planted.ts` | `(46,57)`, lines 1/1 |
| **JSX text that resembles a line comment** | `planted.tsx` | `(48,59)`, lines 1/1 |
| a **template nested inside another template's substitution** | `planted.ts` | `(18,29)`, lines 1/1 |

Each asserts a **clean parse** and the literal offsets. A7's regex is a variable initializer and A4
is a single template — different inputs, as codex said.

The **five original LoginFlow truncated prefixes** are imported from the donor at `60641339`,
lines **1048–1052** *(corrected in place, codex r1c F3-R2: this sentence still said 1047–1051; the
`it.each([` opens at 1047 and the five literal rows are 1048–1052)*, with their wrapping and comment
bytes preserved — the 18-space indent, the
`/* first slot */` block comment, the `// first slot` line comment and the newline positions. Each
asserts **failed parse**, **zero discovery candidates**, and **exactly one narrowed `INCONCLUSIVE`**
with path, line and message (all five: one diagnostic, `"Expression expected."`, at lines 1/2/1/2/2).
The synthetic malformed case and the floor are retained.

**The selector goes 52 → 60** (+3 contexts, +5 prefixes), still with only the two inherited failures.

## B7 — K23 has 57 diagnostic files, not 47

**Recounted from the raw transcripts with paths intact** (`30-K23-diagnostics-RECOUNTED.txt`):
**57 complete rows, 57 distinct `.tsx` paths**, distribution **48 `'>' expected.` · 7 `Type
expected.` · 2 `Property assignment expected.`**, and **every path verified a member of the
enumerated 232-file corpus** (0 outside it).

**Cause of my 47.** The derived list was built with the character class `[a-z0-9/_.-]`, which
excludes `[`, `]` and uppercase letters. Paths such as
`apps/ui/app/debate/[id]/DebatePageClient.tsx` matched from the middle, leaving fragments like
`lient.tsx` and `rawer.tsx`, and `sort -u` then collapsed distinct files into them. **The raw
transcripts always held the correct observable — only my derivation was defective.** The defective
file now carries a SUPERSEDED banner explaining exactly this; the raw logs are unmodified. 47 is
corrected to 57 throughout the report and the manifest.

**The rule:** *a derived list is evidence only if its extraction is lossless; when the thing extracted
is a path, prove membership in the enumerated population and prove uniqueness of the whole path, not
of a suffix.*

## F1 — extraction and premeasurement claims narrowed

- **Extraction.** Not six byte-identical items. **Five** are literal matches once the added `export`
  keyword is excluded; the sixth, `ceilingSites`'s body, matches **after one further explicit
  substitution** — `Map<string, DuplicateSite>` → `Map<string, Site>`, the site type having been
  renamed. The normalization is now stated with the claim. Runtime composition is unchanged by a type
  rename, and the inherited controls are what establish preservation.
- **Premeasurement.** `09-ceilingsites-control-measurement.log` holds **17 rows = 14 positive ceiling
  + 3 bare DOMAIN**, not every migrating control: it omits the three exclusive-six positive layouts
  and the ten negative/narrowing cases, and **negatives do not each yield one site — they yield
  none**, which is their assertion. The remaining controls are evidenced by the final selected run.

## F2 — the four-count tool rejects inconsistent summaries

`fourcount2.sh` reached MATCH/exit 0 on codex's counterexample (`Test Files 1 passed (1)`,
`Tests 1 passed (2)`, `EXIT STATUS: 0`) because it never checked totals. **`fourcount3.sh`** adds
**summary arithmetic** (`passed+failed+skipped+todo == total`, exit 4), **file arithmetic**
(`failed+passed+skipped == files total`, exit 4) and **numeric validation** of every extracted
heading (exit 2). Validated 9/9 with every exit **captured directly** (`36-fourcount3-validation.log`):
three known-good logs → 0; empty, truncated, `EXIT STATUS` stripped, non-numeric total → 2;
codex's summary counterexample and a file-arithmetic counterexample → 4.

*During that validation I first read an exit through `| tail -2` and recorded 0 where 4 was required
— the pipeline status-stealing trap, in my own checker. Corrected in place, in the same record, by
capturing first.*

## F3 — the surviving contradictions, annotated rather than rewritten

Four claims survived my earlier sweep and are now annotated in place, each linked to its replacement
rule: the "an upgrade **always** produces a removal" universal (replacement: zero removals is
corroboration, never standalone proof); "anchor occurrence count **asserted**" (replacement: a
declared multiplicity must be asserted — `MUT_EXPECT`, now used by every round-1 transcript); the
passing registration run "missing the scored budget"; and the implication that every lane sees both
integration failures. Attribution language is corrected throughout to **"no new failing identities
relative to round 0"**, with causal non-attribution held at **consistent-with**, F2's expiry mechanism
at **consistent-with**, and the discarded exception and exact timing cause at **undetermined**. The
same distinctions are carried into the self-report.

## The three round-1 transcripts, re-run under `mutate.sh` v3

Every one declares `MUT_EXPECT=1` and ends `RESULT: ok`.

| # | v3 log | RESULT | Declared observable, OBSERVED |
|---|---|---|---|
| K23 | `37-K23-transcript-v3.log` | `ok — pre=0 applied=1 restored=0 hashes=match porcelain=empty cmd_exit=1` | DIAGNOSTIC — **57** distinct `.tsx` paths, 48/7/2 |
| K25 | `38-K25-transcript-v3.log` | `ok — …` | ADDRESS — A1 `statementLine` **2 → 1** |
| K27 | `39-K27-transcript-v3.log` | `ok — …` | SITES — **6** INCONCLUSIVE assertions fall, each **1 → 0** (the five donor prefixes plus the synthetic case) |

K27's observable is strictly stronger than before the rework: the block it discriminates grew from
one synthetic input to six, five of which are the donor's original bytes.

## The rework gates and the full suite

| gate | result | log |
|---|---|---|
| smoke | **5 passed (5)**, exit 0 | `40-rework-gate-smoke.log` |
| selected describe | `2 failed \| 58 passed \| 13 skipped (73)` → **60 selected instances**, exit 1 | `41-rework-gate-selected.log` |
| typecheck | **8** diagnostics, **identical to the pre-edit baseline by identity/code/path**, exit 1, tsc 7.0.2 | `42-rework-gate-typecheck.log` |

The two red names are the inherited shipped assertions, which stay red while the old emitter runs.

ONE `pnpm test` on the rework tip, `43-rework-full-suite.log`; accounting `44-fourcount-rework.log`;
reconciliation `46-rework-reconciliation.log`. Started 2026-09-06T21:33:34Z, finished 22:21:27Z,
**2871.70 s**. **Porcelain empty before and after.**

```
FOUR-COUNT GATE ACCOUNTING — 43-rework-full-suite.log
  1. test failures        : 81   (parsed distinct names: 81)
  2. suite-load failures  : 1   (files that could not load; their tests are NOT in count 1)
       - tests/unit/s14-ui.test.ts
  3. skips                : None
  4. unhandled errors     : 1   (from vitest's own 'Errors N error' summary line)

  passed 2371 · total 2452 · test FILES 35 failed of 261 · exit 1
  SUMMARY ARITHMETIC: passed+failed+skipped+todo = 2452 == total 2452 -> OK
  FILE ARITHMETIC   : 261 == files total 261 -> OK
  PARSE CHECK: summary failed 81 vs parsed names 81 -> MATCH
```

| | parent | round-0 | r1 pre-rework | **r1 REWORK** |
|---|---|---|---|---|
| test failures | 80 | 82 | 81 | **81** |
| suite-load (`s14-ui`) | 1 | 1 | 1 | **1** |
| skips | None | None | None | **None** |
| unhandled | 1 | 1 | 1 | **1** |
| passed | 2338 | 2341 | 2363 | **2371** |
| total | 2418 | 2423 | 2444 | **2452** |
| FILES | 34/260 | 35/261 | 35/261 | **35/261** |
| exit | 1 | 1 | 1 | **1** |

**Arithmetic:** `2444 + 8 = 2452` (the eight B6 instances: three parse contexts, five donor
prefixes) · `2363 + 8 = 2371` (all eight pass) · failures unchanged at 81.

### Attribution — none unexplained

| vs | appeared | disappeared |
|---|---|---|
| **r1 pre-rework (81)** | **0** | **0** — the failing identity set is unchanged by the rework |
| round-0 (82) | 0 | 1 — `registration-database … S3d rework4` |
| parent (80) | 1 — `session-database … S5 … Argon2` | 0 |

- **No new failing identities** relative to round 0 or to the pre-rework run. **STRENGTH: entailed**
  for the name-set comparison; causal non-attribution to this diff is **consistent-with**, not
  entailed.
- **registration S3d** absent again: a context-sensitive timing assertion; host/resource contention
  **consistent-with**, exact cause **undetermined**.
- **session S5** present again: inherited, date-dependent fixture defect — idle expiry
  2026-09-06T10:00:00Z, run started 21:33:34Z. Ticketed **F-ARGON2-SESSION-ENV**, out of scope. The
  hidden-expiry mechanism is **consistent-with**; the discarded exception's value **undetermined**.
- **`s14-ui`** remains the single suite-load failure and the source of the eight inherited typecheck
  diagnostics. Ticketed elsewhere, untouched.

**Unexplained names: none.**

## Codex r1 findings — disposition

| # | Finding | Disposition |
|---|---|---|
| **B1** | K31 outside the callback grammar | **Fixed** — balanced sum of 32 zeroes; 128 nodes, depth 11, in-grammar; both limits recorded with their semantics; purity gate replayed |
| **B2** | K43 decided before `at` | **Fixed** — `[0,1,2,3,4,5].map(n => "x").at(0)`; rule 1 does not fire; cells asserted |
| **B3** | K10 baseline = mutant | **Fixed** — `map(n => n \|\| 1)`; `[1,1,2,3,4,5]` RULED vs `[true×6]` OTHER; edit stated; cells asserted |
| **B4** | K9 not equivalent | **Fixed** — K9 restored as a mutation; K48 and K35 kept; false equivalence removed from both filings; inventories recomputed to **48 / 7 / 1 / 1 → 49** |
| **B5** | incomplete literal contract | **Fixed** — canonical source inventory for all 48 mutations, 7 controls and m6; ranges and receivers expanded; K7c/K7d isolated; K32's final-return restored; K47 bound; shipped assertions named; m6 given 1 → 1 and the restoration obligation |
| **B6** | missing contexts and prefixes | **Fixed** — 3 parse contexts with literal offsets + the 5 donor prefixes byte-exact; selector 52 → 60 |
| **B7** | 57 diagnostic files, not 47 | **Fixed** — recounted with paths intact, 48/7/2, all corpus members; defective derivation banner-marked; 47 → 57 corrected throughout |
| **F1** | extraction/premeasurement overstated | **Narrowed** — five literal + one after a named type substitution; record 09's actual 17-row coverage stated |
| **F2** | fourcount2 accepts inconsistent summaries | **Fixed** — `fourcount3.sh` adds summary and file arithmetic and numeric validation; 9/9 validation |
| **F3** | contradictory conclusions survived | **Fixed** — four surviving claims annotated `SUPERSEDED`/`NARROWED` in place with their replacement rules; attribution language corrected; distinctions carried into the self-report |

## Marker

`REWORK READY FOR REVIEW`

`comments read through: t1-oracle-evaluator-r1-2026-09-06`

---
---

# ROUND 1 — REWORK 2 of 3, after codex r1b (CHANGES; one gating defect)

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r1b-2026-09-06`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

B1–B7 are disposed and the count is accepted (**48 rows · 57 disposition IDs · 49 transcripts**).
**No lane source changed this round** — B5-R, F1-R, F2-R, F3-R and F4 are manifest, record and report
repairs. The worktree is **byte-identical** to the r1b-reviewed tip `90cf5089`
(`git diff --stat 90cf5089..HEAD` empty, porcelain empty), so the reviewed suite evidence stands.
The three fast gates were re-run on that same tip for freshness (`50-round2-state-and-gates.log`):
smoke **5 passed (5)**; selected **2 failed | 58 passed | 13 skipped (73)** = **60 instances**, only
the two inherited failures; typecheck **8 diagnostics, identical to the pre-edit baseline**.

## B5-R — K7d now isolates purity clause 3, and the contradiction inside my own filing is named

**The defect.** `map(n => { let m = 0; m = n; return m; })` fails **clause 2** (its body is neither a
single expression nor exactly `{ return e; }`) **and clause 3** (assignment). My canonical table said
"clauses 2 + 3" while the sentence introducing it claimed each control isolates exactly one — a
contradiction inside one section, and **the table was the honest half**. With two clauses failing,
removing assignment rejection would still leave the body-shape gate rejecting the callback, so the
control could remain `UNDETERMINED` **without ever testing assignment rejection**.

**The replacement**, measured (`48-B5R-F3R-measurements.log`, probe command recorded in the log):
`const choices = [0,1,2,3,4,5].map(n => (n = n));`

| property | value |
|---|---|
| parse diagnostics | 0 |
| clause 1 (one plain identifier parameter) | **SATISFIED** |
| clause 2 (single expression body) | **SATISFIED** |
| clause 4 (not async/generator) | **SATISFIED** |
| **clause 3 (no assignment)** | **VIOLATED — the only violation** |
| body node kinds | `ParenthesizedExpression` 1 · `BinaryExpression` 1 · `Identifier` 2 · `FirstAssignment` 1 |
| counted nodes / depth | **5 / 2** — far inside the 64/32 limits, so no work-limit confound |
| discovery | one candidate `[0,1,2,3,4,5]` at `(16,29)`; rule 1 does not fire |
| intended control result | **`UNDETERMINED`, because assignment rejection fired** |

K7d stays control-only, K7b keeps the combined-effect case, the grammar is not loosened, and the
count is unchanged: **48 mutations (3/2/43) · 7 active controls · 1 merged · 1 survival = 57
disposition IDs, 49 transcripts** (recounted, `35-manifest-recount.log`).

**The rule:** *an isolation control must be checked against every clause it does not intend to
violate, not only the one it does.*

## F4 — serialized lengths published as source bytes; the donor range; what `cands` counted

| layout | **source bytes (decoded)** | serialized-literal length |
|---|---:|---:|
| the real six-slot login array | **53** | 55 |
| wrapped after the sentinel | **71** | 74 |
| block comment after the sentinel | **70** | 72 |
| commented AND wrapped | **88** | 91 |
| line comment after the sentinel | **85** | 88 |

I published the right-hand column as "bytes". They are **JSON string representations** — two quotes
plus each newline written as the two characters `\n`. The decoded source lengths are
**53, 71, 70, 88, 85**, measured by reading the five `planted` literals out of the committed test,
`json.loads`-ing each and taking `len(decoded.encode("utf-8"))` (`47-F4-lengths-and-range.log`).
Cause: a probe that printed `JSON.stringify(src).length`.

**The donor range is 1048–1052**, not 1047–1051: the `it.each([` opens at 1047 and the five literal
rows follow it. Verified by `grep -n`.

**What record 31's `cands=1` counted:** its own probe's tree walk, which collects numeric-only array
literals **regardless of parse diagnostics**. It is *not* `candidatesOf`, which short-circuits on a
failed parse and returns **zero** for all five prefixes. The API's behaviour is evidenced by the five
passing `expect(candidatesOf(...)).toEqual([])` assertions and the static failed-parse guard, not by
that field. **Record 31 is preserved unaltered with a correction block appended**, naming all three
items and the probe command.

**The rule adopted:** *every measurement record states the probe command, the source it measured, and
which representation any length refers to.*

## F2-R — the four-count tool now validates complete syntax and reconciles failed-file identities

`fourcount3.sh` reached MATCH/exit 0 on codex's counterexample because `num` silently extracted
nothing from a **malformed present** field and defaulted it to zero:

```text
Tests  1 passed | banana skipped (1)      Errors  banana error      EXIT STATUS: 0
```

**`fourcount4.py`** replaces it and **fixes rather than limits**: it validates the *complete* grammar
of the `Tests`, `Test Files`, `Errors` and `EXIT STATUS` lines; **distinguishes an absent optional
field (fine) from a malformed present one (fatal)**; and **reconciles failed-file identities** —
`|{files owning a failing test} ∪ {files that failed to load}|` must equal the reported failed-file
count, which summing file categories never checked.

Validated **13/13**, every exit captured directly (`49-fourcount4-validation.log`): four known-good
logs → 0, each reconciling its failed-file identity exactly (**34 · 35 · 35 · 35**); empty, truncated,
`EXIT STATUS` stripped, non-numeric total, **malformed present `skipped`/`Errors`**, and
**`EXIT STATUS: bad0`** → 2; **unreconciled failed-file identity** → 5; summary and file arithmetic
counterexamples → 4.

## F1-R and F3-R — the annotations completed, then both reports re-read

Annotated **in place**, each with its replacement rule, and each marked historical where an earlier
instruction still read as operative:

| claim | where | replacement rule |
|---|---|---|
| "every migrating control was measured first" | self-report | record 09 covers **17 rows = 14 positive ceiling + 3 bare DOMAIN**; the three exclusive-six layouts and ten negatives are **not** in it, and negatives yield **no** site; the rest are evidenced by the final selected run |
| "every literal was measured first" | self-report | scoped to the A1–A11 offsets, the three B6 contexts, the five prefixes and record 09's 17 rows |
| "`--frozen-lockfile` **cannot** modify the manifests" | self-report | cite the observed state and the recorded diff, never the flag's promise |
| "only the node budget can reject that" (the 73-node fixture) | self-report | grammar admission is checked **before** any count; the operative fixture is the balanced 128-node/depth-11 one |
| "a left-associative chain **cannot** test a node budget" | self-report | **false, and measurement refutes it**: `n` plus **22** additions of literal zero is **67 nodes at depth 22** — over the 64 budget, under the 32 limit. Compare measured node count and depth against the two recorded limits; never generalise from associativity |
| "will recur for **every seat**" / "misses the budget even when passing" | report | *may* recur; a passing `.toEqual([])` means no captured scored overruns — the console spy is cleared after the seed burst. **My own two runs both omit the failure** |
| causal non-attribution marked *entailed* | report | **consistent-with** only |
| "K9 is an equivalent mutant" (historical paragraph) | report | marked **historical, not operative**; equivalence requires showing no input separates the mutants |
| "K7c and K7d each violate exactly one clause" | report | K7c did; K7d did not — see B5-R |

Both complete reports were then re-swept for surviving universals
(`always produces a removal`, `cannot modify`, `only the node budget`, `every seat`, `will recur`,
`equivalent mutant`, `anchor occurrence count asserted`, `cannot test a node budget`): **no
unannotated survivor remains.** The hidden-exception uncertainty is preserved as **undetermined**, and
the exact timing cause remains **undetermined**.

## Marker

`REWORK READY FOR REVIEW`

`comments read through: t1-oracle-evaluator-r1b-2026-09-06`

---
---

# ROUND 2 — THE COMPLETE EVALUATOR (manifest gate OPEN)

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r1c-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

| | |
|---|---|
| base | `90cf50891d8a60bfb36d51651eb49de528834889` (gate-opening tip), clean |
| round-2 tip | **`23ec6717b32b6fc9509b573da32bd5dda9e5d7f8`** |
| runtimes | Node v25.7.0 · pnpm 11.20.0 · tsc 7.0.2 |
| evidence | `…/logs/t1-oracle-evaluator/r2/` |

Setup was **conditional**: `node_modules`, the generated contract and `typescript-classic` were all
present, so nothing was provisioned. Clean tracked state was verified **before** any baseline.
`apps/ui/components/LoginFlow.tsx` was **not touched** — production mutation is round 3's.

## Baselines, before any evaluator edit

| gate | result |
|---|---|
| selected describe | **60** instances (2 failed, 58 passed) + 13 unrelated file skips |
| smoke | **5 passed (5)**, separately |
| `pnpm typecheck` | **8** diagnostics, all `tests/unit/s14-ui.test.ts`, tsc 7.0.2 |

Carried forward: the two inherited selected failures, the separate **J10** failure, and round 1's raw
**81/1/None/1** with **2371/2452**, plus the round-0 (82/…/2423) and parent (80/…/2418) comparisons.

## The evaluated record is a real extension

`candidatesOf` stays **discovery-only**. `evaluatedCandidatesOf` returns `EvaluatedCandidate`, which
extends `DiscoveredCandidate` with `consumedStart`, `consumedEnd`, `value`, `verdict` and `reason`.
**No placeholder fields and no casts** — a round-1 test still cannot read an evaluation field, because
`candidatesOf`'s return type does not carry one.

## The semantic stub RED came first

`05-stub-RED.log`. With the declared stub — *every operation and wrapper yields `UNKNOWN`, rule-1
precedence retained* — the run was `17 failed | 73 passed | 13 skipped (103)`. The five named cases
failed **by wrong verdict**:

| case | expected | stub gave |
|---|---|---|
| `[0,1,2,3,4,5].slice(1)` | RULED | `expected 'UNDETERMINED' to be 'RULED'` |
| the even filter, cells `[0,2,4]` | OTHER | `expected 'UNDETERMINED' to be 'OTHER'` |
| `reverse().slice(1)` | OTHER | same assertion (vitest **deduplicates** identical errors — the recorded trap; the `❯` markers name the three distinct sites) |
| `Array.from(new Set(map(n=>n\|\|1))).slice(1)` | OTHER | same assertion |
| `[1,2,3,4,5,6].slice(0,-1)` | RULED | `expected 'UNDETERMINED' to be 'RULED'` |

Green under the stub and still green after, exactly as predicted: bare `0–5` and `1–6` → OTHER; the
rule-1 controls → RULED; **K50** → UNDETERMINED; and the expected-UNKNOWN controls K7b, K7c, K34, K37.
"Five named cases" was not a promise of five failures — there were **15** semantic failures plus the
two inherited, because the controls and repaired fixtures are written before the transfer rules too.

## The complete declared evaluator

`tests/support/depthOracle.ts` (+722 lines). **No source callback is executed**: the evaluator walks
the syntax tree over finite known cells.

- **Purity gate (§3.9 R2)** — the four clauses reported **independently**, each with its own reason
  string: parameter shape, body shape (the exact `{ return e; }` form), the in-grammar check, and
  async/generator.
- **Recorded work limits** — **node budget 64**, **depth limit 32**, counted **body-inclusive by
  `ts.forEachChild`**, exactly the semantics the manifest records.
- **Cells keep their primitive (§3.17 R4)** — `Cell → Prim` is total and the identity on the six
  constructors, so the unary chain is exact while the binary string chain stays conservative. A
  numeric literal that is not finite yields `unknown`, so a `num` cell is finite by construction.
- **Operations by return contract (§3.15 R3)** — boolean/number/string/undefined returns →
  `NOT_ARRAY`; element-returning → `NOT_ARRAY` only if every cell is a known number, else `UNKNOWN`;
  `reduce` always `UNKNOWN`; declared-unsupported array methods `UNKNOWN`; arities enforced
  (`slice`/`splice` 0–2 integer literals, `reverse`/`sort` zero-arg, `map`/`filter`/`flatMap` exactly
  one callback).
- **NOT_ARRAY continuation** — a chain that *ends* at `NOT_ARRAY` is `OTHER`; any further operation
  over it is `UNKNOWN`.
- **Collection kinds** — `new Set` dedupes by **SameValueZero** and is `UNKNOWN` when any cell is
  `jsx`/`arr`/`unknown`; array methods over a Set are `UNKNOWN`; `Array.from` and spread convert back.
- **Ownership walk (§3.16 R3)** — transparent wrappers, the comma role (right transparent, left
  discarded), receiver-vs-callee membership, `Object.freeze` identity, spread folding, nested `{arr}`
  cells, binding elisions with any-`RULED` aggregation, and the unmodelled-enclosing-call row.
- **§3.18 R4** — a modelled member invocation requires the member to be the **callee**.
- **`Object.freeze`, `includes` and the JSX model are in this round**, as required.

Result: `2 failed | 90 passed | 13 skipped (105)` — every evaluator row green, only the two inherited
shipped assertions red.

## K45's spans, from its own bytes

Asserted, not inherited: the literal at **`(64,77)`**; the outer call **textually `(16,87)`**, verified
by `source.slice(16, 87)` matching the call text exactly; the consumed span ends at **87**. The
computed-member twin via `["includes"]` has literal `(64,77)` and call **textually `(16,90)`**, consumed
span **90**. **M17's `(16,94)` belongs to a different source and is not inherited.** The member is an
**argument**, not the callee, so the walk takes the unmodelled-call row and the verdict is
`UNDETERMINED`.

## K7d's real assertion

Codex warned that a generic UNKNOWN stub also makes K7d green. The row therefore asserts **candidate
identity and reason**, not just the verdict: `start` 16, `end` 29, `elementLine` 1, `statementLine` 1,
`verdict` UNDETERMINED, `value.kind` UNKNOWN, and `reason` matching `/assignment/i` — so the rejection
must be attributable to **purity clause 3** and nothing else.

## K28 and K38, run under v3

| # | Gates | Declared observable, OBSERVED |
|---|---|---|
| **K28** (admit mixed arrays) | pre 0 · applied 1 · restored 0 · HASHES MATCH · porcelain `[]` · `RESULT: ok` | baseline `[]` → **`[ 'UNDETERMINED' ]`**, one candidate at `(38,63)` |
| **K38** (admit empty literals) | same | baseline `[]` → **`[ 'UNDETERMINED' ]`**, one candidate at `(16,18)` |

Both rows assert the **verdict list before the cardinality**, so the failure message *is* the
observable. `mutate.sh` v3 **appends** to its out-log, so `07-K28-transcript-v3.log` holds a first
attempt correctly refused at the pre-gate (my NEW token was a substring of OLD) followed by the valid
run; the `-final` logs are single clean transcripts.

**Remaining obligation, recounted from the gated manifest: 5 of 48 discharged (K23, K25, K27, K28,
K38); round 3 owes 43 mutations + m6 = 44 transcripts.** Never "42".

## The three gates and the full suite

| gate | result |
|---|---|
| smoke | **5 passed (5)**, exit 0 |
| selected describe | `2 failed \| 90 passed \| 13 skipped (105)` → **92 instances** (60 → 92), exit 1 |
| typecheck | **8** diagnostics, **identical to baseline by identity/code/path**, exit 1, tsc 7.0.2 |

ONE `pnpm test` on the tip, porcelain empty before and after, 2831.93 s:

```
  1. test failures        : 82   (parsed distinct names: 82)
  2. suite-load failures  : 1   - tests/unit/s14-ui.test.ts
  3. skips                : None
  4. unhandled errors     : 1
  passed 2402 · total 2484 · test FILES 36 failed of 261 · exit 1
  SUMMARY ARITHMETIC OK · FILE ARITHMETIC OK · FAILED-FILE IDENTITY 36 == 36 OK · PARSE CHECK MATCH
```

`2452 + 32 = 2484` · `2371 + 32 − 1 = 2402` · `81 + 1 = 82` · `35 + 1 = 36`.

### The one appeared name, attributed

`tests/integration/pol03-pool-resilience.test.ts > POL-03 real PostgreSQL backend reset > survives an
idle backend termination and reports in-flight and subsequent failures typed`. Zero disappeared.

- **The direct-import and diff facts, as facts.** The evaluator module is imported by exactly two
  files — the oracle test and the smoke. `pol03` contains **zero** textual references to
  `depthOracle`/`candidatesOf`/`evaluatedCandidatesOf`, and the round-2 diff touches only those two
  test-tree files; `packages/db` is unchanged. **STRENGTH: entailed** — for those observations.
  > **NARROWED (codex r2 F2).** I previously called this "mechanically unreachable from this diff"
  > and labelled it *entailed*. That over-reaches: zero textual references and an unchanged package
  > exclude neither timing/resource effects during a full-suite run nor an unobserved indirect
  > dependency. **Replacement rule: a zero grep is evidence of no DIRECT import; it is not a proof of
  > causal non-reachability.** Attribution is therefore held at **consistent-with context sensitivity,
  > exact cause undetermined, may recur.**
- **Passes in isolation on the same tip**: 3/3, exit 0, including the exact failing instance.
  **STRENGTH: entailed.**
- **The assertion that actually failed**, named precisely: `pol03-pool-resilience.test.ts:27`,
  `expect(child.exitCode, child.stderr).toBe(0)` — a **child-process exit code of 1 where 0 was
  expected**, not an event count. The child's stderr carried
  `TypedDomainError DATABASE_POOL_FAILED "terminating connection due to administrator command"`.
  The test deliberately terminates an idle backend and asserts the resulting failures are typed. Context-sensitive under
  full-suite load and ordering. **STRENGTH: consistent-with; exact cause undetermined. It MAY
  recur — it is not asserted as something every lane will see.**

The two inherited s1-1 shipped assertions are red **by design** (the old emitter and the
`WHOLE_DOMAIN` fallback stay active through round 2); J10 and `s14-ui` are inherited and ticketed;
registration S3d remains absent for a third consecutive run and S5 remains present as
F-ARGON2-SESSION-ENV. **Unexplained names: none.**

## F2-R2 and F3-R2 — the carried records duties

**F2-R2 — fixed, not limited.** `fourcount5.py` adds what codex's four executed counterexamples
exposed: at least one nonempty category segment (rejects `Tests (0)`), no empty segment from a
leading/trailing/doubled separator (rejects `Tests 1 passed | (1)`), no duplicate category name
(rejects `Tests 999 passed | 1 passed (1)`, which previously overwrote 999 with 1), and a **present**
`Errors` heading recognised before validation (rejects a bare `Errors` line, previously treated as
absent and reported as zero). Validated **17/17** with every exit captured directly
(`11-fourcount5-validation.log`).

**F3-R2 — the surviving instruction withdrawn, the stale facts reconciled in place.**
The sentence *"Any lane running a full suite here **will** see both and must not spend a round
re-attributing them"* is **withdrawn in place**: changing "every seat" to "Any lane" changed the
wording, not the reasoning, and my own evidence refutes it — registration was absent from **both**
round-1 full runs and from this one. Replacement rule: **may recur; exact cause undetermined.** Also
corrected at the claim: the donor range (**1048–1052**), K31's kind list (**`PlusToken` ×32** included,
which is how the count reaches 128), and the round-3 total (**43 + m6 = 44**, never 42) at all four
surviving occurrences.

**The sweep claim is corrected too.** I had written that a scripted phrase sweep is "how I confirmed
no unannotated survivor remains", and advised scripting it *instead of* re-reading. Both are wrong:
D67 ADDENDUM 3 requires text search **and** a whole-record re-read, and my sweep omitted
`will see both`. This round ran the **broader** search over all three filings and then **read every
hit in context**: 17 flagged, 16 correction-context or correct statements about the donor, and **one
genuine survivor** — a fourth "42" the targeted fix had missed — repaired.
**The search narrows the reading; it never replaces it.**

## Marker

`READY FOR PEER REVIEW`

`comments read through: t1-oracle-evaluator-r1c-2026-09-07`

---
---

# ROUND 2 — REWORK (the ticket's third and last authorised rework), after codex r2

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r2-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

**Rework tip `ef66e59b4a26551f105ba3ce6814fac0a2dbfee7`** from `23ec6717`. Two files, both in
contract. Every one of B1–B11 and both follow-ups accepted; none argued down. The cleared sections —
the stub RED, controls-first, K28/K38 custody, the gate reconciliation — are untouched.

## The eleven, each with its measured evidence

Every value below was measured before it was asserted (`22-rework-measurements.log`,
`23-worklimit-measurements.log`).

| # | Defect | Repair, and what it now does |
|---|---|---|
| **B1** | `isIdentifier(name)` admitted defaults and rest | clause 1 rejects an **initialiser**, a **rest token**, an **optional marker** and a **binding pattern**, in *every* callback operation, with the reason naming which. `map((n=1)=>n)` → UNDETERMINED *"the parameter has a default initialiser"*; `filter((...n)=>n)` → *"the parameter is a rest parameter"* |
| **B2** | flatMap bypassed the purity contract | flatMap runs through the **same gate** with its declared array-shape exception. `flatMap(async …)` → clause 4; `flatMap(n => true ? [n] : [(n = 1)])` → clause 3 **from the untaken branch**; `flatMap(n => { return n ? [n] : []; })` → **RULED [1,2,3,4,5]**, the admitted return-only block |
| **B3** | the grammar was a partial blacklist | **positive admission** of the declared forms and operators; JSX atomic. `true ? n : ++n` → *"the unary operator PlusPlusToken"*; `true ? n : void n` → *"void"* — rejected from an **untaken** branch, without evaluating both |
| **B4** | limits measured on the extracted expression | measured on the **original body node** (body = 0, `forEachChild`), flatMap included. **66/11 → UNDETERMINED** · **64/9 → RULED** · **depth 34 → UNDETERMINED** · **depth 28 → RULED** · **flatMap 129/12 → UNDETERMINED**. Node and depth exhaustion are asserted **independently**; K31 alone could not establish either boundary |
| **B5** | two Prim transfers missing | `ToBoolean(jsx) = true` → six `{t:"num",v:1}` / OTHER; `"" + null` → six `{t:"str",v:"null"}`; `undefined + ""` → six `{t:"str",v:"undefined"}`. **Payloads pinned, not tags.** Unknown/unavailable object coercions stay conservative |
| **B6** | `splice()` returned the whole array | zero, one and two arguments are three contracts. `slice(1).splice()` → **OTHER with `[]`**, after a ruled derivation so the error changes the verdict; `splice(1)` still RULED |
| **B7** | binding syntax silently ignored | nested and defaulted binding forms are **rejected to UNKNOWN before outputs are classified**, each with its reason. Elision offsets, `{arr}` extraction into a plain name and any-`RULED` aggregation unchanged |
| **B8** | `consumedStart` never moved | **both** boundaries move to the consumed owner. K45 **(16,87)**, its twin **(16,90)** — *my test asserted the wrong 64 and now asserts 16* — plus a wrapper `(6,49)` and a binding `(6,36)`. Literal identity unchanged; rule 1's early stop preserved |
| **B9** | exact sibling spreads always rejected | folded **in order**. `[...[1,2,3], ...[4,5]]` → **RULED [1,2,3,4,5]**; `[...[0,1,2], ...[3,4,5]]` → **OTHER [0,1,2,3,4,5]**; an unmodelled sibling stays UNDETERMINED |
| **B10** | freeze bypassed NOT_ARRAY continuation | the **receiver-state rule runs first**: `Object.freeze(join(""))` → UNDETERMINED *"continuation yields UNKNOWN"*; `Object.freeze([0..5]).slice(1)` → RULED |
| **B11** | assertions did not cover the round-2 rows | 33 new rows with complete source, discovery identity, **full Cell payloads**, whole Value kind, **both** consumed boundaries and reasons; **K43's known-receiver prefix** asserts six `{t:"str",v:"x"}`, so an earlier map failure can no longer satisfy it; plus default sort order, the Set-sentinel contrast, freeze/includes/JSX in their modelled contexts, and the independent depth boundary |

Selected describe: **60 → 125** instances, only the two inherited shipped assertions red.

## F1 — the shipped population, reconciled by CONTRACT AMENDMENT A1

Codex's fresh scan found 33 candidates as **32 OTHER + 1 UNDETERMINED**: `tokenUnlock.ts:36`,
`[502, 503, 504].includes(error.status)` inside an `||` inside an `if`. `includes` gives
`NOT_ARRAY`, and the enclosing `||` matched no walk row, so it fell to *"unmodelled owner"*. The
present fallback follows §3.16 literally — this is a **specification gap**, and it is recorded as a
**contract amendment**, not a deviation.

**Amendment A1 — terminal consumption of a decided scalar.** The chain ends with the value it
already has when **both**: (a) that value is already `NOT_ARRAY` — a *decided scalar*, never
`UNKNOWN`, never `EXACT`; and (b) the enclosing node consumes it where an array cannot arise — an
operand of `&&`/`||`/`??`, the operand of `!`, or the condition of `if`/`while`/`do`/`for`/a
conditional.

**It is not a blanket exemption, and the counter-controls are assertions, not prose:**

| control | verdict |
|---|---|
| positive: `if (a \|\| [502,503,504].includes(s)) { }` | **OTHER**, `NOT_ARRAY`, reason *terminal consumption* |
| conservative: `new Set([0,1,2,3,4,5].join(""))` | **UNDETERMINED** — a Set over a string is an array of characters |
| conservative: `[0,1,2,3,4,5].join("").split("")` | **UNDETERMINED** — a member over a scalar can still yield an array |
| conservative (K50, retained): `join("").split("").map(n => +n).slice(1)` | **UNDETERMINED** |

**Measured effect** (`25-F1-shipped-population.log`, the oracle's exact roots/extensions/exclusions):
**232/232 files parsed, 59 `.tsx`, 33 candidates, 33 OTHER, 0 UNDETERMINED.** No candidate is
exempted by path. The predicted zero-DOMAIN population is restored, so round 3's **total 1** and the
**K3/K4/K5 models (24 / 2 / 2)** rest on a reconciled contract — and those remain **conditional
emission predictions that must be remeasured at the round-3 emission stage**. Recorded as Part 8 of
the manifest. **STRENGTH: entailed** for the corpus counts and each control's verdict;
**consistent-with** for the conditional emission totals.

## F2 — the POL-03 claim, narrowed

I had called POL-03 *"mechanically unreachable from this diff"* and labelled it **entailed**. That
over-reached, and the correction is in place at the claim. Now:

- **Entailed, as observations:** the evaluator module is imported by exactly two files; `pol03`
  contains **zero** textual references to it; the diff touches only those two test-tree files;
  `packages/db` is unchanged.
- **The failed assertion, named precisely:** `pol03-pool-resilience.test.ts:27`,
  `expect(child.exitCode, child.stderr).toBe(0)` — a **child-process exit code of 1 where 0 was
  expected**, not an event count.
- **Attribution: consistent-with context sensitivity · exact cause undetermined · may recur.**
  **The general "a zero grep is decisive" rule is withdrawn** from both filings: a zero grep
  establishes no *direct import*; it excludes neither timing/resource effects under full-suite load
  nor an indirect dependency I did not observe.

**And it did recur** — POL-03 is now present in **both** round-2 full runs and absent from **both**
round-1 runs. I state that plainly rather than smoothing it over; it does not change the strength of
the attribution, and the isolation record still shows 3/3 exit 0 on the same tip.

## Gates and the full suite

| gate | result |
|---|---|
| smoke | **5 passed (5)**, exit 0 |
| selected describe | `2 failed \| 123 passed \| 13 skipped (138)` → **125 instances**, exit 1 |
| typecheck | **8** diagnostics, **identical to baseline**, exit 1, tsc 7.0.2 |

K28 and K38 **re-run under v3** on the reworked tip: both `RESULT: ok`, both showing baseline `[]` →
**`[ 'UNDETERMINED' ]`**.

ONE `pnpm test`, porcelain empty before and after, 2867.12 s:

```
  1. test failures : 82 (parsed distinct names: 82)   2. suite-load : 1 - tests/unit/s14-ui.test.ts
  3. skips : None                                     4. unhandled errors : 1
  passed 2435 · total 2517 · test FILES 36 failed of 261 · exit 1
  SUMMARY ARITHMETIC OK · FILE ARITHMETIC OK · FAILED-FILE IDENTITY 36 == 36 OK · PARSE CHECK MATCH
```

`2484 + 33 = 2517` · `2402 + 33 = 2435` · failures and failed files **unchanged at 82 / 36**.

**Against the pre-rework round-2 run: 0 appeared, 0 disappeared — the rework changed no failing
identity.** Against round-1: POL-03 only. **Unexplained names: none.**

**Remaining obligation: 5 of 48 discharged; round 3 owes 43 mutations + m6 = 44 transcripts.**

## Marker

`REWORK READY FOR REVIEW`

`comments read through: t1-oracle-evaluator-r2-2026-09-07`

---
---

# ROUND 2 — REWORK 2 (V-authorised), after codex r2b

`SKILLS LOADED: heartbeat (Skill tool) · heartbeat-protocol router (markdown) · heartbeat-worker (READ AS MARKDOWN — the Skill tool returns "Unknown skill: heartbeat-worker") · superpowers:using-superpowers · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (all five by Skill tool)`

**comments read through:** `t1-oracle-evaluator-r2b-2026-09-07`

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

**Tip `255a1e85580940b57dae7de0d7b152c4d4a7e378`** from `ef66e59b`. Two files, both in contract.
This round exists by V's authority — *"I authorize one more rework with the current setup, but please
make it worth it."* The three defects are fixed and the four mandated additions are done.

## R1 — amendment A1 was UNSOUND, and is narrowed to a proved condition context

**The error, stated plainly: `NOT_ARRAY` decides the OPERAND's type; it never decides the enclosing
OPERATOR's result.** My A1 terminated whenever a decided scalar was an operand of `&&`/`||`/`??` or
of `!`. A logical operator may return *the other* operand — and that operand may be an array.

The sound rule fires only when **both**: (a) the value is already `NOT_ARRAY`; and (b) it is
**provably discarded** in a **condition slot** — the condition of `if`/`while`/`do`/`for`, or the
condition operand of `c ? a : b`. Logical operators, `!` and parentheses are traversed **upward** to
the outermost node of that envelope, and A1 fires only if *that* node is in a condition slot. If the
envelope's value is used instead, the walk continues — which over a decided scalar is `UNKNOWN`.

All seven of codex's counterexamples now report (`35-R1-R2-verification.log`):

| input | now |
|---|---|
| `([0,1,2,3,4,5].join("") \|\| "").split("").map(n => +n).slice(1)` | UNDETERMINED |
| the same with `??`, and the `&&` right-operand variant | UNDETERMINED |
| `includes(7) \|\| Array.from(…)` · `includes(0) && Array.from(…)` · `at(99) ?? Array.from(…)` | UNDETERMINED |
| `f(![0,1,2,3,4,5].includes(0))` | UNDETERMINED |
| **the shipped** `if (a \|\| [502,503,504].includes(s))` | **OTHER** — still terminates |

**And the control codex said was missing is now present:** a pair differing from K50 **only by the
`||` wrapper**, both UNDETERMINED. The Part 8 counter-controls never entered A1 at all; these do.

## R2 — sibling spread operands are evaluated, not pattern-matched

`valueOfExpression` obtains each sibling's value under the bounded admitted grammar — array literals
(including nested spreads), parentheses, `as`/`satisfies`, `new Set`, `Array.from`, `Object.freeze`
and modelled member invocations — stopping at that operand. Exact **array or set** cells fold in
order and the enclosing result is `coll: "array"`. All six compositions codex named now give **RULED
`array[1,2,3,4,5]` on both occurrences**: parenthesised, `new Set`, slice-derived, `as const`,
`Object.freeze`, `Array.from`. The decided negative gives `OTHER array[0,1,2,3,4,5]`; an unmodelled
sibling still reports.

## R3 — the complete evaluated-record table, with derived expectations

Twelve rows assert the **whole** record — discovery identity, both display lines, **both** consumed
boundaries, the whole `Value` (kind, collection, every `Cell` payload), the verdict and the reason.
**Identity and spans are derived from the source text** by `spanOf`/`lineOf`; the row names which
literal it is about and the candidate is selected by that derived offset. Nothing is copied from
evaluator output — B8's lesson, applied.

Plus **admitted/exhausted original-body pairs for map AND flatMap**, expression and return-only
bodies, asserted **at the operation prefix** so a later `.slice(1)` cannot overwrite the reason; and
two boundary tests that **locate** the crossing with this test file's own independent walker rather
than pinning a constant.

**Writing those rows found four wrong expectations of mine and one wrong test** — and in every case
the implementation was following the spec and I was not:

| my expectation | the spec |
|---|---|
| a rule-1 candidate's consumed span is the declaration | rule 1's **early stop** (codex B8) — the span is the literal |
| the `||` row's consumed span includes the parentheses | the walk extends to the **rejected parent**, the `||` expression |
| a sibling-spread row's span is the initialiser | a terminal `VariableDeclaration` extends to the **declaration** |
| `new Set([1,2,3,4,5])` exercises the Set path | rule 1 fires on the literal first — the row tested nothing |
| paren-nesting can locate the **node** budget | it raises depth ~1:1, so it crosses the **depth** limit first |

## Mandated: the boundary sweep of §3 R4

**32 rules, each with one admitted-boundary and one rejected-boundary assertion derived from the spec
text** — purity clauses 1–4 (count, default, rest, pattern, body form, async), the grammar, both work
limits, every operation's arity, the return kinds, `NOT_ARRAY` continuation, Set equality, collection
kinds, `Array.from`, `Object.freeze`, wrappers, the comma role, bindings, nested payloads, sibling
spreads, A1's context, the callee role, finiteness, payload retention, the logical operators and rule 1.

**The sweep found two more wrong readings of mine** — both cases where the implementation is *more
precise* than I assumed:

- **a comma's LEFT operand is provably discarded**, so terminating there is sound (unlike `||`, which
  may return its operand). I had expected it to continue.
- **`??` short-circuits**: with a `num` left operand the right is never evaluated, so an unresolved
  right operand does not make the result unknown. I had expected UNDETERMINED.

Both rows were replaced with boundaries that actually cross.

## Mandated: the reviewer's attack list, re-run as a checklist

**38 classes from r1, r1b, r2 and r2b**, filed as *class · input · spec-expected · observed ·
STRENGTH* in `36-attack-checklist.log`, generated by reading the rows out of the committed test so
the table cannot drift from the assertions. **38/38 match.**

**Two spec-silent points are stated rather than smoothed** (STRENGTH: UNKNOWN in the plan text): the
consumed span when rule 1 fires — the plan assigns none, and it is resolved by codex's "preserve
rule-1's early stop"; and whether an **EXACT** array in a condition slot terminates — A1 requires
`NOT_ARRAY`, so it stays UNDETERMINED, and the plan does not decide it.

## Mandated: the census, remeasured after R1

`37-census-after-R1.log`: **232/232 files parsed, 59 `.tsx`, 33 candidates, 33 OTHER, 0 UNDETERMINED,
23 freeze-identity candidates.** `tokenUnlock.ts:36` is OTHER because it genuinely **is** an `if`
condition — under the sound rule, not the unsound one. `LoginFlow.tsx:252` is OTHER with six JSX
cells. No path exemption. The zero-DOMAIN conclusion and the 1/24/2/2 models remain **conditional**
and must be remeasured at round 3's emission stage.

## Gates and the full suite

| gate | result |
|---|---|
| smoke | **5 passed (5)**, exit 0 |
| selected describe | `2 failed \| 215 passed \| 13 skipped (230)` → **217 instances** (125 → 217), exit 1 |
| typecheck | **8** diagnostics, **identical to baseline**, exit 1, tsc 7.0.2 |

ONE `pnpm test`, porcelain empty before and after, 2896.76 s:

```
  1. test failures : 81 (parsed distinct names: 81)   2. suite-load : 1 - tests/unit/s14-ui.test.ts
  3. skips : None                                     4. unhandled errors : 1
  passed 2528 · total 2609 · test FILES 35 failed of 261 · exit 1
  SUMMARY ARITHMETIC OK · FILE ARITHMETIC OK · FAILED-FILE IDENTITY 35 == 35 OK · PARSE CHECK MATCH
```

`2517 + 92 = 2609` · `2435 + 92 + 1 = 2528` · `82 − 1 = 81` · `36 − 1 = 35`.

**Against round-1's rework: 0 appeared, 0 disappeared — the failing identity set is exactly
round-1's.** POL-03 **did not recur**: across this ticket's five full runs it is present in 2 and
absent in 3. That is the strongest evidence yet for the classification already filed —
**consistent-with context sensitivity · exact cause undetermined · may recur** — and against any
deterministic link to the evaluator. No causal exclusion is claimed, and no fresh isolation run is
claimed (the recorded one was taken at `23ec6717`).

**Unexplained names: none.** Round 3 owes **43 mutations + m6 = 44 transcripts**.

## Marker

`REWORK READY FOR REVIEW`

`comments read through: t1-oracle-evaluator-r2b-2026-09-07`
