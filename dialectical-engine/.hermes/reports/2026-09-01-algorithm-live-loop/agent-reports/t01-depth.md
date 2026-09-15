REWORK READY FOR REVIEW — T1B r2 · comments read through: t1b-codex-r2-2026-09-03
report sha256: b7c8c7f5b1ff125b1aa7b8778301d9f167737dc13e0798752e14287f18879e7d

# T1 DEPTH r3 — FINAL ROUND

Seat: Opus 5, session `opus-t01-w1`. Worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1/dialectical-engine`,
branch `lane/t1`, base `1c9578a24d5aedd0302fbda5593f66277cd87b98`, HEAD `386efd3`.
Five commits, no push, no merge, no board write. **Rework round 2 of max 3 — round 4 is not
authorized; any residue goes to a V DECISIONS PACKET row.**
Self-report `## r3` filed at `agent-reports/t01-depth-self.md` before this marker.

**Cluster S02-C1 · ONE verification command:**
`npx vitest run tests/unit/s1-1-depth-contract.test.ts`
**Zone command:** `npx vitest run tests/unit tests/architecture tests/render` (161 files)

---

## CORRECTION IN PLACE — the r2 report's "Zero failures are mine" was FALSE

The r2 report stated, of its 13 zone failures, that **"Zero failures are mine."** That
sentence was false, and its falsity is provable from the logs r2 itself filed. Codex r2 B2/B3
caught it. It is corrected here rather than quietly restated.

**What was actually true at r2's HEAD.** My diff had introduced **three** architecture
violations, all hiding inside two already-red, correctly-named `scaffold.test.ts` failures:

```
budget -> contract is not a declared edge
apps/runner -> contract is not a declared edge
packages/contract/src/index.ts exports a numeric source literal instead of a register/law carrier
```

**Why r2 could not see them — two compounding errors, both mine.**

1. **The base fixture was under-scoped.** r2 restored four `.ts`/`.tsx` files.
   `auditArchitecture()` reads **`package.json` manifests**
   (`tools/orphan-audit/src/index.ts:51-56`), and both new edges live in exactly the two
   manifests r2 left at HEAD. r2's "base" was therefore HEAD-with-source-reverted, and it
   still contained the very violations it was being used to rule out.
2. **The comparison was at the wrong granularity.** r2 diffed failure *name sets*. Both
   `scaffold.test.ts` failures are red at base and at HEAD under identical names, so a
   name-set diff reports "no new failures" while the `violations` array inside has gained
   entries. **Equal test names are not an equal signature.**

**The honest measurement, taken this round** — base fixture built mechanically from
`git diff --name-only 1c9578a..HEAD`, all **nine** files restored, manifests included:

| audit output | true base (`r3-audit-base.log`) | r2 HEAD (`r3-audit-head.log`) | r3 HEAD (`r3-audit-head-fixed.log`) |
|---|---|---|---|
| `auditArchitecture().violations` | **3** (all obs-capture) | **5** | **3** |
| `auditSourceRules().blocking` | **3** (all obs-capture) | **4** | **3** |

After J10 the HEAD payload is **byte-identical to the true base** — `diff` over both lists
returns nothing. That is now a payload proof, not a name comparison.

---

## REVIEW RESPONSE — codex r2 (CHANGES)

| # | Disposition |
|---|---|
| **B1** | **Fixed.** Scanner rebuilt broad-by-construction; the three evading spellings are now caught (mutants m9/m10/m11). |
| **B2** | **Fixed** under J10(a). Both edges declared; base fixture rebuilt mechanically; the 13 rows re-classified against payloads. The false sentence is corrected above. |
| **B3** | **Fixed** under J10(b). Narrow by-name law-carrier recognition; narrowness proved by mutant m8. |
| **N1** | **Fixed.** SUITES now carries the `D15-DEFERRED` label with D15's actual location. |

Every finding was independently reproduced before any code changed — the `.lte(5)` /
`5 >= depth` evasions, the manifest reads at `index.ts:51-56`, and the purity regex against my
own two export lines. Nothing was taken on the reviewer's word.

---

## RED

### r1 — the packet's named RED (depth 9 → 400), unchanged across all three rounds

Written FIRST against the **unmodified base** `1c9578a`, when `depth_params` was
`z.record(z.string(), z.unknown())`:

```
 FAIL  tests/unit/s1-1-depth-contract.test.ts > S1-1 · depth enforced at the contract door > refuses depth 9 at POST /v1/asks with the parseRequest 400 envelope
AssertionError: expected 202 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 202

 ❯ tests/unit/s1-1-depth-contract.test.ts:98:35
```

`Tests 1 failed (1)` · `RED1_EXIT=1` · **Log:** `logs/t01/red1-depth9.log`. The asserted
machine code is `MALFORMED_REQUEST` (`apps/api/src/index.ts:265-274` → `:470-491`), and the
test also asserts `submitted === 0`.

### r3 — RED on the J10 audit assertions, with the constants present

Router §2.5 binds every rework round. Run at `7ccd1a7` **before** the audit reconciliation:

```
 FAIL  … (J10) > reports no T1-owned architecture or source-rule violation
AssertionError: expected [ …(2) ] to deeply equal []
+   "budget -> contract is not a declared edge",
+   "apps/runner -> contract is not a declared edge",

 FAIL  … (J10) > exempts exactly the two ruled depth exports, in exactly one file
AssertionError: expected '' to contain 'packages/contract/src/index.ts'
```

`Tests 2 failed | 29 passed (31)` · `R3_RED_EXIT=1` · **Log:** `logs/t01/r3-red-audit.log`.
The standalone audit probe at that commit is `logs/t01/r3-audit-head.log`
(`ARCH_VIOLATIONS=5`, `SRC_BLOCKING=4`).

### r3 — RED on the final scanner against alternate spellings

The tree carries no duplicate, so the scanner's RED is demonstrated by planting one in each
evading spelling. All three go RED (full transcripts in `logs/t01/r3-mut-m{9,10,11}.log`):

| planted spelling | scanner verdict |
|---|---|
| `depth: z.number().int().gte(1).lte(5),` | **RED** — 2 failed / 29 passed |
| `1 <= depth && 5 >= depth &&` | **RED** — 2 failed / 29 passed |
| `superRefine`-style `depth > 5` in the runner guard | **RED** — 2 failed / 29 passed |

Under the **r2** oracle all three were green (`VALIDATOR_LTE=[]`, `COMPARISON_REVERSED=[]`).

---

## GREEN

Cluster verification → **31 passed / 31 total, exit 0.** The r1 depth-9 test is byte-identical
to its RED form; no assertion was ever flipped.

| DoD row | Test | Result |
|---|---|---|
| depth 9 → 400 envelope (the RED test) | `refuses depth 9 …` | pass |
| reject `0` · `6` · missing · fractional · string · unknown-key | six `refuses … 400 envelope` cases | 6 pass |
| 1 and 5 accepted, live `apps/ui` client | `accepts depth {1,5} through the live apps/ui client` | 2 pass |
| 1 and 5 accepted, legacy `web/` client | `accepts depth {1,5} through the legacy web/ client` | 2 pass |
| runner guard intact | `keeps the runner … guard bound to the contract constants` | pass |
| bound is one schema | `exports the ruled bound as constants the ask schema enforces` | pass |
| single-source grep | `leaves no duplicate definition …` + `keeps the owning declaration as the only depth-bound site …` | 2 pass |
| oracle positive controls (adversarial) | `detects a duplicate written as $spelling` × 8 | 8 pass |
| oracle negative controls | `does not flag unrelated depth code` × 5 | 5 pass |
| J10 reconciliation | `reports no T1-owned architecture or source-rule violation` · `exempts exactly the two ruled depth exports, in exactly one file` | 2 pass |
| single source named | `names packages/contract as the exported single source` | pass |

### The scanner, rebuilt (B1)

Enumerating spellings is unwinnable — the author's imagination is the coverage limit. The
oracle now inverts the burden:

- **DEPTH_BOUND_LITERAL** — any line mentioning a depth that carries the literal `5`, or a
  `6` in an exclusive-bound position (`< 6`, `>= 6`, `.lt(6)`, `.gte(6)`).
- **DOMAIN_ENUMERATION** — any line spelling the whole domain `1,2,3,4,5`.

and then allows **exactly one line in the entire tree**, by exact text:
`packages/contract/src/index.ts` → `export const EXPANSION_DEPTH_MAX = 5;`. A new spelling
needs no new detector; it needs a new exemption, which is a visible diff.

`6` counts only in a bound position because the tree measurement showed a bare-`6` rule sweeps
in the observability logger's unrelated `maxDepth: 6`
(`apps/ui/lib/observability/logger.ts:77`). Neighbour mutant **n3** changes that line and the
suite stays green, proving the detector ignores it. A floor-only guard with no ceiling literal
(`depth < 1`, `web/app/new/NewQuestionForm.tsx:18`) still does not match — it holds no second
literal 5 and is not a second definition of the bound; it remains finding **F-T1-4** for T2,
pinned by a negative control rather than silently excluded.

### The J10 reconciliation

**J10(a) — edges.** `packages/budget` and `apps/runner` gain `contract` in their declared
edge rows (`tools/orphan-audit/src/index.ts`), the coherence consequence of J6's imports.
Nothing else in the audit tooling changed.

**J10(b) — law carrier.** The purity law refuses exported numeric literals outside
`published-arithmetic`; the goal orders an exported contract depth constant. Both rules are
correct and they collide on exactly two names. The whole-file `test()` became a per-export
`matchAll` filtered by a by-name table:

```ts
const GOAL_RULED_LAW_CARRIERS: ReadonlyMap<string, readonly string[]> = new Map([
  ["packages/contract/src/index.ts", ["EXPANSION_DEPTH_MIN", "EXPANSION_DEPTH_MAX"]]
]);
```

Not a path prefix, not a package exemption, and the law is untouched everywhere else. Mutant
**m8** adds a third numeric export to that same file and the law still fires.

> **Rejected as dishonest, recorded because it was tempting:** `= 1 as const` evades the
> purity regex in two characters with no audit change and would have gone green. The law's
> intent is that policy numbers come from a law carrier; dodging its regex while violating its
> intent is exactly the "green by accident" this contract exists to prevent.

### Three-run cluster verification (worker contract §3 — worst run wins)

**Cluster S02-C1 @ `386efd3`, tree clean. Worst run = GREEN (exit 0).**

| Run | Exit | Tests | Log |
|---|---|---|---|
| 1 | 0 | 31 passed / 31 | `logs/t01/r3-cluster-final-run1.log` |
| 2 | 0 | 31 passed / 31 | `logs/t01/r3-cluster-final-run2.log` |
| 3 | 0 | 31 passed / 31 | `logs/t01/r3-cluster-final-run3.log` |

---

## REFUTATION (worker contract §2)

Twelve mutants at `386efd3`, each on a clean tree, each reverted with
`git restore --source=HEAD --worktree`. Every log carries the whole episode — `AT=`, `HEAD=`,
pre-mutation porcelain, the `perl` command, `git diff -U0`, the vitest run, `VITEST_EXIT=`,
the restore, post-restore porcelain, `RESTORED_CLEAN=`. Logs: `logs/t01/r3-mut-*.log`.

| # | Mutant | Expected | Observed | restored |
|---|---|---|---|---|
| m0 | clean-tree control | GREEN | 31 passed / 31 | `[]` clean |
| **m9** | **budget duplicate as `.lte(5)`** | RED | **2 failed / 29 passed** | `[]` clean |
| **m10** | **UI duplicate as reversed `5 >= depth`** | RED | **2 failed / 29 passed** | `[]` clean |
| **m11** | **runner duplicate as a refinement `depth > 5`** | RED | **2 failed / 29 passed** | `[]` clean |
| m5 | budget duplicate as `.max(5)` | RED | 2 failed / 29 passed | `[]` clean |
| m7 | UI re-enumerates the domain | RED | 2 failed / 29 passed | `[]` clean |
| m1 | `depth_params` → open unknown record | RED | 8 failed / 23 passed | `[]` clean |
| m3 | drop `.strict()` | RED | 1 failed / 30 passed | `[]` clean |
| **m8** | **J10(b) narrowness: a THIRD numeric export in the same file** | RED | **1 failed / 30 passed** | `[]` clean |
| m12 | remove the declared `budget -> contract` edge | RED | 1 failed / 30 passed | `[]` clean |
| n1 | NEIGHBOUR: reword the runner error prose | GREEN | 31 passed / 31 | `[]` clean |
| n3 | NEIGHBOUR: unrelated logger `maxDepth: 6 → 7` | GREEN | 31 passed / 31 | `[]` clean |

`RESTORED_CLEAN=0` and post-restore `porcelain=[]` in all twelve; final tree `[]`.

**m9/m10/m11 are the direct refutation of codex B1** — the exact spellings that defeated the
r2 oracle. **m8 is the direct refutation of a package-wide exemption**: the narrow form still
catches a third export in the very file it exempts. **n3** proves the broadened detector did
not buy its coverage by sweeping in unrelated depth code.

---

## SUITES

**`D15-DEFERRED` — authoritative `pnpm test` is judge-run serially on the integration branch
after the applicable merge batch.** (D13 assigned it per-lane pre-merge; **D15 amends that
location** to the integration branch after each disjoint merge batch. The r2 report cited D13
without its amendment — codex N1 / J10(c).) Lane-local cluster and zone evidence is the
pre-merge gate; this seat did not produce a full-suite number and claims none.

| # | Command | Exit | Counts | Log |
|---|---|---|---|---|
| 1 | `pnpm run typecheck` | **0** | **0 errors** | `logs/t01/r3-typecheck.log` |
| 2 | `./node_modules/.bin/tsc --noEmit -p apps/ui/tsconfig.json` @ HEAD | **1** | **1 error** (pre-existing) | `logs/t01/r3-uitsc-head.log` |
| 3 | same @ base `1c9578a`, all 9 files reverted | **1** | **1 error — byte-identical** | `logs/t01/r2-uitsc-base.log` |
| 4 | `npx vitest run tests/unit tests/architecture tests/render` (161 files) | **1** | **13 failed / 1301 passed (1314)** · **11 failed / 150 passed (161 files)** · 403.55s | `logs/t01/r3-zone-head.log` |
| 5 | cluster ×3 | **0,0,0** | **31/31 in 3/3** | `logs/t01/r3-cluster-final-run{1,2,3}.log` |
| 6 | audit probe, true base vs HEAD | **0,0** | **ARCH 3=3, SRC 3=3, byte-identical** | `logs/t01/r3-audit-base.log`, `r3-audit-head-fixed.log` |

Pin 2's sole error, identical at base and HEAD, in a file I never touched:
`apps/ui/app/layout.tsx(3,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.`

### The 13 zone rows — corrected classification

**Owned by T1: 0. Pre-existing: 13.** Unlike r2, rows 5 and 6 are now classified on
**payload**, not on name: the audit lists they carry are byte-identical to the true base.

| # | Failure | Disposition |
|---|---|---|
| 1 | `s04-contract.test.ts > DR-128 mints only the claim-type composition structure…` | PRE-EXISTING — T0 C.1 |
| 2 | `s10-carrier-erasure-red.test.ts > filters completed private tombstones…` | PRE-EXISTING — T0 C.1 |
| 3 | `s13-contract.test.ts > lands append-only memory carriers…` | PRE-EXISTING — proved at base, `r2-base-check-four.log` |
| 4 | `s7-authorization-contract.test.ts > hardens every immutable memory scope carrier…` | PRE-EXISTING — T0 C.1 |
| 5 | `scaffold.test.ts > enforces purity, one provider gateway, source-constant…` | PRE-EXISTING **by payload** — 3 obs-capture env reads at base AND HEAD. **In r2 this row also carried a T1-owned violation; J10(b) removed it.** |
| 6 | `scaffold.test.ts > matches all 28 dependency-edge rows…` | PRE-EXISTING **by payload** — 3 obs-capture edges at base AND HEAD. **In r2 this row also carried TWO T1-owned violations; J10(a) removed them.** |
| 7 | `load01-run-projection.test.ts > reads the state only through the owning asker…` | PRE-EXISTING — T0 C.1 |
| 8 | `obs-l2-s04-zone.test.ts > calls the resolver over the real mount-list source…` | PRE-EXISTING — T0 C.1 |
| 9 | `obs-l2-s04-zone.test.ts > passes all 15 required falsification mutants` | PRE-EXISTING — T0 C.1 |
| 10 | `pro01-runner-tree.test.ts > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path` | PRE-EXISTING — proved at base, `r2-base-check-costenvelope.log` |
| 11 | `s6-content-encryption.test.ts > defaults content encryption off…` | PRE-EXISTING — T0 C.1 |
| 12 | `v2ui-node-runner.test.ts > keeps every active .test.mjs file in the explicit runner manifest` | PRE-EXISTING — T0 C.1 |
| 13 | `xrev01-node-review.test.ts > stops a review loudly when the ratified model-call envelope is exhausted` | PRE-EXISTING — proved at base, `r2-base-check-costenvelope.log` |

Name set is unchanged from the r2 zone (`comm` both directions empty); test count rose
1305 → 1314 as the new controls landed. T0's published pin is **pre-provisioning** and cannot
by itself classify post-D9 failures, so rows 3, 5, 6, 10 and 13 rest on base re-runs, not on
T0's list.

### One failure introduced and fixed during this lane

`v2ui-pages.test.ts > offers the ruled depth range without exposing the computed tripwire`
asserted the page source **contains** `"[1, 2, 3, 4, 5].map"` — the exact duplicate J6 orders
removed, so the repo required the literal both to exist and not to exist. Fixed at `7ccd1a7`
by pinning the contract-derived domain; green in every run since.

---

## COMMITS

Branch `lane/t1`, base `1c9578a`, HEAD `386efd3`. Nothing pushed, nothing merged.

| SHA | Subject |
|---|---|
| `612cd1a` | `T1: enforce the 1-5 expansion-depth bound at the contract door (S1-1)` |
| `1963530` | `T1: drop the non-existent runCreation option from the S1-1 cluster test` |
| `f6ccaa4` | `T1: remove the remaining duplicate definitions of the depth bound (J6)` |
| `7ccd1a7` | `T1: retarget the /new depth-range guard at the contract's single source` |
| `386efd3` | `T1: reconcile the depth bound with the architecture audit (J10)` |

```
$ git diff --stat 1c9578a..HEAD
 dialectical-engine/apps/runner/package.json        |   1 +
 dialectical-engine/apps/runner/src/index.ts        |  12 +-
 dialectical-engine/apps/ui/app/new/page.tsx        |   5 +-
 dialectical-engine/packages/budget/package.json    |   2 +-
 dialectical-engine/packages/budget/src/index.ts    |   3 +-
 dialectical-engine/packages/contract/src/index.ts  |  28 +-
 dialectical-engine/pnpm-lock.yaml                  |   6 +
 .../tests/unit/s1-1-depth-contract.test.ts         | 396 +++++++++++++++++++++
 dialectical-engine/tests/unit/v2ui-pages.test.ts   |   7 +-
 dialectical-engine/tools/orphan-audit/src/index.ts |  28 +-
 10 files changed, 476 insertions(+), 12 deletions(-)
```

### The single source, and every consumer

```ts
// packages/contract/src/index.ts — the one declaration
export const EXPANSION_DEPTH_MIN = 1;
export const EXPANSION_DEPTH_MAX = 5;
export const ExpansionDepthSchema = z.number().int().min(EXPANSION_DEPTH_MIN).max(EXPANSION_DEPTH_MAX);
export const EXPANSION_DEPTH_VALUES: readonly number[] = Object.freeze(Array.from(…));  // derived
export const DepthParamsSchema = z.object({ depth: ExpansionDepthSchema }).strict();
```

| Site | Before | After |
|---|---|---|
| `AskRequestSchema.depth_params` | `z.record(z.string(), z.unknown())` | `DepthParamsSchema` |
| `apps/runner/src/index.ts:995` | `depth < 1 \|\| depth > 5` | `depth < EXPANSION_DEPTH_MIN \|\| depth > EXPANSION_DEPTH_MAX` |
| `packages/budget/src/index.ts:41` | `z.number().int().min(1).max(5)` | `ExpansionDepthSchema` |
| `apps/ui/app/new/page.tsx:77` | `depth >= 1 && depth <= 5` | `depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX` |
| `apps/ui/app/new/page.tsx:196` | `[1, 2, 3, 4, 5].map` | `EXPANSION_DEPTH_VALUES.map` |

`RUN_DEPTH_PARAMS_INVALID` is unchanged and its message renders byte-identically to the old
literal. `apps/runner` and `packages/budget` each gained `"@debateai/contract": "workspace:*"`;
no cycle (contract depends only on `@debateai/kernel` and `zod`), and both edges are now
declared in the audit.

### Contract generation

Snapshot → `pnpm run generate:contract` → `diff -r`: `GEN_EXIT=0`, `DIFF_EXIT=0`,
byte-identical, full transcript in `logs/t01/r2-generate-contract-diff.log`. `generated/` is
gitignored (D9); nothing generated was committed.

---

## FINDINGS

### Closed this lane
**F-T1-1 / F-T1-2** (budget + UI duplicates) — fixed under J6 at `f6ccaa4`.
**F-T1-6** (scaffold's edge rows missing the two new edges) — **fixed** under J10(a) at
`386efd3`; this was the finding I named in r2 and it turned out to be a violation I owned
rather than a residual for someone else.

### Open — carried to the V DECISIONS PACKET if not ticketed

**F-T1-3 · `apps/ui/lib/api.ts:388`** — `requiredInteger(config, "depth", 0)` accepts `0`,
which the contract rejects; depth 0 fails late with a server 400 instead of early with a field
message. Not a duplicate *definition* (a `0` is not the bound), so the scan correctly ignores
it. Fix by driving the minimum from `EXPANSION_DEPTH_MIN`.

**F-T1-4 · `web/app/new/NewQuestionForm.tsx:18`** — floor without a ceiling; depth ≥ 6
round-trips to a 400 rather than being caught locally. `web/` is T2's surface. Argued and
pinned as a negative control, not silenced.

**F-T1-5 · `TOOLING-TRAPS.md` append still owed.** Traps paid across r1–r3: (a) a >8-minute
suite killed by the 10-minute foreground cap; (b) zsh globbing `--include=*.ts` before grep
sees it; (c) a OneDrive checkout flipping a file's exec bit (100644→100755), showing as ` M`
with an empty content diff, cleared by `chmod 644`; (d) the scratchpad is shared between
lanes — my r1 mutant script was overwritten by another lane's at the same path; (e) **a
worktree is no longer exclusively its worker's** — under D13/D15 the judge runs suites there
too, so `pgrep -f "<lane-path>"` matches other sessions' processes and must never drive a
kill. The file sits outside my scope and concurrent lanes appending to one append-only file
conflict at integration (T0 hit this too, its finding 7). All five are written up in the
self-report with a proposed fix (per-seat trap fragments merged by the orchestrator).

**F-T1-7 · the architecture audit has no coverage for its own law-vs-goal collisions.**
`auditSourceRules()` forbade exactly what goal T1 ordered, and nothing surfaced that until
review round 2. A packet-time check — grep the audit's rules against the task's verbs — would
have caught it before a line was written. Non-blocking for T1; a real gap in how tasks are
dispatched.

---

## REPRO

```bash
cd /Users/.../V5/.worktrees/lane-t1/dialectical-engine
git rev-parse HEAD                                             # 386efd3…  (base 1c9578a)

npx vitest run tests/unit/s1-1-depth-contract.test.ts          # cluster: 31/31
pnpm run typecheck                                             # exit 0, 0 errors
./node_modules/.bin/tsc --noEmit -p apps/ui/tsconfig.json      # exit 1, 1 pre-existing
npx vitest run tests/unit tests/architecture tests/render      # zone: 13 failed / 1301 passed

# the honest base fixture — mechanical, never an author-selected subset
ALL=$(git diff --name-only 1c9578a..HEAD | sed 's#^dialectical-engine/##')
git restore --source=1c9578a --worktree -- $ALL
#   then run the probe, capture its PAYLOAD, and restore:
git restore --source=HEAD --worktree -- $ALL && git status --porcelain   # expect empty
```

The audit payload probe used for the base/HEAD comparison (written to a temporary
`t01-probe.mts` in the worktree root, run with `tsx`, deleted before commit):

```ts
import { auditArchitecture, auditSourceRules } from "./tools/orphan-audit/src/index.js";
const a = await auditArchitecture(); const s = await auditSourceRules();
console.log("EDGE_ROWS_CHECKED=" + a.edgeRowsChecked, "ARCH_VIOLATIONS=" + a.violations.length);
for (const l of a.violations) console.log("  ARCH| " + l);
for (const l of s.blocking)   console.log("  SRC | " + l);
```

**Logs** (`logs/t01/`, 70 files) — r3: `r3-red-audit.log` · `r3-audit-head.log` ·
`r3-audit-base.log` · `r3-audit-head-fixed.log` · `r3-green-cluster.log` ·
`r3-cluster-final-run{1,2,3}.log` · `r3-mut-*.log` (12) · `r3-typecheck.log` ·
`r3-uitsc-head.log` · `r3-zone-head.log`. Earlier rounds retained in full.

---

## HANDOFF

- **Rework round:** 2 of max 3. **Round 4 is not authorized** — residue goes to a V DECISIONS
  PACKET row. Rework returns to session `opus-t01-w1`.
- **Self-report:** `agent-reports/t01-depth-self.md`, `## r3`, filed before this marker.
- **Tree:** clean at `386efd3`; `git status --porcelain` empty.
- Not done, by contract: no push, no merge, no Done mark, no board write, no ticket split, no
  edit outside packet §4 as expanded by J6 and J10 (F-T1-3, F-T1-4, F-T1-5, F-T1-7 named, not
  fixed).
- **Owed:** the authoritative full `pnpm test`, `D15-DEFERRED` to the judge on the integration
  branch after the applicable merge batch.


---

# T1B — A LAYOUT-INDEPENDENT DEPTH-CEILING ORACLE (V-T1-r3-1)

Seat: Opus 5, session `opus-t01-w1b`. Ticket `board/T1B-layout-independent-oracle.md`.
V authorized this on 2026-09-03 as a **micro-ticket, explicitly not round 4 of T1**.
**Rework round 1 of 3**, against codex T1B r1 B1. Worktree `.worktrees/lane-t1`, branch `lane/t1`.

**On the r3 record above.** Line 1's marker is now T1B r1's; the r3 marker was
`REWORK READY FOR REVIEW — T1 r3 · comments read through: t01-codex-r2-2026-09-01`. The r3 body
hash on line 2 covers **lines 3–437** and still reproduces —
`sed -n '3,437p' agent-reports/t01-depth.md | shasum -a 256` =
`b7c8c7f5b1ff125b1aa7b8778301d9f167737dc13e0798752e14287f18879e7d`. Nothing in lines 3–437 was
edited.

| | |
|---|---|
| `7828d220` | merge of integration `19bbb4c4` into `lane/t1` (parents `386efd39` + `19bbb4c4`) |
| `3a579a68` | r0 oracle — declaration units replace the line scan |
| `ad44f507` | three tooling traps, worker contract §6 (`.hermes/TOOLING-TRAPS.md` only) |
| `42360f81` | **r1 fix — the two predicate arms get different windows.** TIP, tree `46571006`, porcelain empty |
| node / pnpm | `v25.7.0` / `10.33.0`, from every gate record's PROVISIONING block |

## 1. B1 — what was wrong, and why the fix is not the boundary I removed

Codex was right and the finding is inside my charge. r1 flushed a declaration unit at `&&`,
`||`, `??`. So:

```text
const ok = isDepthField(v) && v <= 5;    caught
const ok = isDepthField(v) &&
  v <= 5;                                returned []
```

Same expression, different layout, different verdict — the one thing this ticket exists to
remove. I had disclosed it as `df4` and traded it against a **measured** false positive: without
that boundary the widened unit paired `topic.trim().length > 6` with a `depth` a conjunct away in
`apps/ui/app/new/page.tsx:75`, which is correct code using the imported constants.

**The trade was not forced, and finding that out is the whole of this round.** I had been
treating the two arms of the frozen predicate as one thing needing one window. They are not the
same kind of evidence:

- **`5`, and the enumerated domain `1,2,3,4,5`, ARE the ceiling.** Wherever either appears inside
  a declaration that mentions a depth, the ceiling is there. Widening their window finds real
  ceilings that wrapping had hidden.
- **`6` is NOT the ceiling.** It is an *inference* from an exclusive comparison (`depth < 6`), and
  that inference is carried entirely by the `6` sitting next to its own operator. Widening its
  window does not find more ceilings — it manufactures pairings. The page.tsx false positive was
  that manufacture, and nothing else.

So the fix is: **nothing splits within an expression any more** (`&&`, `||`, `??` are ordinary
characters), and the **unit scan applies only the ceiling-literal arms** while the exclusive-`6`
arm keeps r3's line window. Both constraints hold.

**All four regexes and r3's `kindOf` are byte-unchanged**, and the line scan still applies the
full set — so the union can only grow relative to r3. `kindOfCeilingLiteral`
(`tests/unit/s1-1-depth-contract.test.ts:301`) is the narrower composition, applied at
`:444`; r3's `kindOf` is at `:273`, untouched.

**An operand-order rule was considered and rejected outright.** `&&` commutes, so a verdict that
depended on which conjunct came first would be layout dependence wearing a different hat. Both
orders are therefore asserted, positive and negative — four assertions, not two.

Anchors proven UNIQUE at `42360f81` by `tools/cite-check.py` (`logs/t01/t1b-cite-check.log`,
**12/12 unique, exit 0**). Its refusal arm re-proved on this tree: the anchor
`expect(duplicateBoundSites(planted)).not.toEqual([]);` is reported AMBIGUOUS across 3 sites
(`logs/t01/t1b-cite-check-refusal-probe.log`, exit 1).

## 2. RED first — the wrapped conjunct

Written before the fix, run at `ad44f507` (the tip immediately before `42360f81`). **The single
most useful frame is the combined one**, because it holds layout as the only variable:

```text
× detects a ceiling wrapped across a conjunct — 'depth token first'
× detects a ceiling wrapped across a conjunct — 'ceiling first'
✓ detects a ceiling wrapped across a conjunct — 'same expression on one line'
  Tests  2 failed | 1 passed | 37 skipped (40)
```

`logs/t01/t1b-r1-RED-wrapped-conjunct.log`. The same expression passes on one line and fails
both wrapped orders — layout dependence, isolated.

| control | RED @ `ad44f507` | GREEN @ `42360f81` |
|---|---|---|
| wrapped, depth token first | `logs/t01/t1b-r1-RED-o1-depth-first.log` — 1 failed \| 1 passed \| 38 skipped | `logs/t01/t1b-r1-GREEN-o1-depth-first.log` — 2 passed \| 38 skipped |
| wrapped, ceiling first | `logs/t01/t1b-r1-RED-o2-ceiling-first.log` — 1 failed \| 1 passed \| 38 skipped | `logs/t01/t1b-r1-GREEN-o2-ceiling-first.log` — 2 passed \| 38 skipped |
| same expression, one line (r3 parity) | `logs/t01/t1b-r1-RED-o3-one-line.log` — 1 passed (green before AND after; it is the control that makes the other two a *layout* claim) | `logs/t01/t1b-r1-GREEN-o3-one-line.log` — 1 passed |

The r0 evasion frames stand unchanged and were re-run GREEN at the new tip:
`t1b-RED-e{1,2,3}-*.log` @ `7828d220` → `t1b-GREEN-e{1,2,3}-*.log` @ `42360f81`.

## 3. The negative control is kept, and strengthened

The reviewer asked that the measured page.tsx control survive the fix. It does, and it is now
asserted in **both conjunct orders** so it pins something order-independent:

```text
✓ does not pair an unrelated ceiling with a depth a conjunct away — 'ceiling first'
✓ does not pair an unrelated ceiling with a depth a conjunct away — 'depth token first'
```

The false positive is not reintroduced anywhere: the whole-tree scan over all 254 shipped files
returns **exactly one site**, the owning declaration at `packages/contract/src/index.ts:112`.

## 4. Refutation (worker contract §2) — every assertion has a mutant

All via `tools/mutate.sh`; every transcript ends `HASHES MATCH` with empty porcelain.

| id | mutation | result |
|---|---|---|
| **m5** | put the r1 `&&`/`\|\|` cut back into `declarationUnits` | **CAUGHT** — 2 failed / 40: exactly the two wrapped orders, while the one-line form stays green. This is B1's pin, and it is exact. `logs/t01/t1b-mutants/m5-reintroduce-logical-boundary.log` |
| **m6** | give the unit scan the FULL frozen arm set (`kindOf` instead of `kindOfCeilingLiteral`) — i.e. widen the `6` arm's window | **CAUGHT** — 4 failed / 40: both page.tsx negative controls **and both real-tree assertions**, because `page.tsx:75` becomes a real reported site. The window-per-arm decision is pinned by real code, not only by a planted string. `…/m6-widen-six-arm-window.log` |
| **m1** | delete the unit half entirely (revert to r3's line scan) | **CAUGHT** — 6 failed / 40: the four r0 layout controls plus the two wrapped orders. `…/m1-line-scan-only.log` |
| **m4** | plant a real multiline duplicate in shipped source (`export const DepthAgainSchema = z.number()` / `.int()` / `.max(5);` in `packages/contract/src/index.ts`) | **CAUGHT** — 2 failed / 40. `…/m4-real-multiline-duplicate.log` |
| **m3** | NEIGHBOUR — flip the site sort comparator | **SURVIVES** — 40 passed / 40, exit 0, as it must. `…/m3-neighbour-sort-flip.log` |

### 4b. D51 — the causal claim, generated

With m4 applied, a comparator reports the two scans separately over all 254 files
(`logs/t01/t1b-scripts/scan-comparator.mjs`, transcript `…/m4b-causal-line-vs-unit.log`):

```text
LINE sites: 1
  L packages/contract/src/index.ts:115 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;
UNIT sites: 2
  U packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const DepthAgainSchema = z.number() .int() .max(5)
  U packages/contract/src/index.ts:115 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5
```

Call path: `duplicateBoundSitesInShippedCode()` → `duplicateBoundSites(source)` → the
`for (const unit of declarationUnits(source))` loop at `:443`. The r3 `source.split("\n")` loop
contributes nothing for that input.

## 5. D56 — what it still cannot see, re-measured after the fix

Each probe run **through the shipped oracle** by `mutate.sh`-swapping a control's planted text,
never through a copy of the algorithm.

| probe | input | detected? |
|---|---|---|
| `df0` | a different wrapped chain, `.max(5)` | **YES** — the control is not pinned to one spelling |
| `df4` | `const ok = isDepthField(v) &&` / `  v <= 5;` — **the blocking finding** | **YES — now caught** |
| `df6` | `if (!Number.isInteger(depth) \|\|` / `    depth < 6) …` | **YES** — the `6` arm still works across a wrap, because the `6` stays with its operator |
| `df5` | `if (depth <` / `  6) …` — the `6` split from its own operator | **NO** — the one residual layout case, see below |
| `df1` | `const CEILING = 5;` then `if (depth > CEILING)` | **NO** |
| `df2` | `const ok = depth` / `  <= 2 + 3;` | **NO** |
| `df3` | `const ok = depth` / `  <= 0x5;` | **NO** |

Transcripts: `logs/t01/t1b-defeat/df{0,1,2,3,4,5,6}-*.log`.

**Stated plainly.**

1. **`df5` is a real residual and it is mine to disclose, not to bury.** Because the exclusive-`6`
   arm keeps r3's line window, a `6` separated from its own operator by a newline is missed. It is
   much narrower than `df4` was — an operator and its operand are adjacent by nature, and `df6`
   shows the ordinary wrap is still caught — but it is the same *kind* of gap, and I am naming it
   rather than calling the fix complete. Closing it needs the `6` bound to its comparison's left
   operand, which is a **predicate** change and is frozen out of this ticket. Filed as F-T1B-4.
2. **`df1` indirection**, and **`df2`/`df3` ceilings that are not the literal `5`**, remain out of
   reach. Both are PREDICATE limits inherited from r3 — `BARE_FIVE` never matched `2 + 3`, `0x5`
   or `5.0` on one line either — and V froze predicate expansion out of a unit-only ticket.
3. **Scope is unchanged**: `packages`, `apps`, `web` only, skipping `node_modules`, `generated`,
   `.next`, `dist`, `build`, `__tests__`.
4. **Lexer desync is bounded.** Regex literals are not lexed, so `/it's/` reads as an apostrophe
   opening a string; single- and double-quoted strings close at the newline, so any such desync is
   confined to one line. An unterminated template literal would desync further, but that is a
   syntax error `typecheck` catches.

## 6. Verification

### Cluster — three runs, worst run wins

`pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`, all at tip `42360f81`:

| run | exit | result | record |
|---|---|---|---|
| 1 | 0 | **40 passed / 40** | `logs/t01/t1b-cluster-final-run1.log` |
| 2 | 0 | **40 passed / 40** | `logs/t01/t1b-cluster-final-run2.log` |
| 3 | 0 | **40 passed / 40** | `logs/t01/t1b-cluster-final-run3.log` |

**Worst run: 40/40.** (r3 31/31 → r0 36/36 → r1 40/40: +3 wrapped-conjunct positives, +1 second
order on the page.tsx negative control.) `typecheck`: **0 errors**, exit 0.

### Wider suite — `tests/unit` + `tests/architecture`

**Six runs are retained, and this is what they show — no more.**

| tip | run | result | record |
|---|---|---|---|
| `ad44f507` | 1 | 13 failed / 1431 | `logs/t01/t1b-suite-at-ad44f507/run1.log` |
| `ad44f507` | 2 | **14 failed / 1431** | `logs/t01/t1b-suite-at-ad44f507/run2.log` |
| `ad44f507` | 3 | 13 failed / 1431 | `logs/t01/t1b-suite-at-ad44f507/run3.log` |
| `42360f81` | 1 | 13 failed / 1435 | `logs/t01/t1b-lane-unit-arch-run1.log` |
| `42360f81` | 2 | 13 failed / 1435 | `logs/t01/t1b-lane-unit-arch-run2.log` |
| `42360f81` | 3 | 13 failed / 1435 | `logs/t01/t1b-lane-unit-arch-run3.log` |

**Worst run across everything retained: 14 failed / 1431.** At the tip itself the worst of three
is **13 failed / 1435** (1431 → 1435 is my four new assertions).

Five of the six runs fail **exactly the 13 names** in `logs/ci-known-red-mission-seed.txt`, the T0
stable-red pin scoped to these two directories. Across all six retained runs the union of failures
contains **exactly one** name beyond that seed:

> `tests/architecture/obs-l2-s05-boot-capture.test.ts > S05 fatal-boundary installers > runner
> falls back to Tier 0 when a Tier-1 exit sink throws` — present in 1 of 6 retained runs.

What the artifacts support about it, and nothing further: it passes **3/3 in isolation**
(`logs/t01/t1b-obs-s05-isolated-run{1,2,3}.log`, 3 passed | 50 skipped each);
`git log 386efd39..HEAD -- …/obs-l2-s05-boot-capture.test.ts` is **empty**, so my diff does not
touch it; and my oracle reads only `packages`, `apps` and `web`, never `tests/`, so it cannot
reach that file by any path. **I am not claiming which lane owns it** — I did not measure that.

**A correction to my previous filing, on the reviewer's instruction.** I earlier reported a second
flake (`registration.test.ts > … S3c B4 … RSS curve`) and attributed both to named lanes. The
registration observation came from a round of runs whose logs I then overwrote, so **it is not
supported by retained evidence and I withdraw it as a claim** — it is an unretained observation,
recorded here only so the next seat knows to watch for it. The ownership attributions were
inference, not measurement, and are withdrawn too. `logs/t01/t1b-registration-rss-run{1,2,3}.log`
show only that the test passes 3/3 in isolation at the tip.

### Records

Every gate through `tools/gate-run.sh` v3; every record checked with `tools/stamp-check.sh`:

```text
GREEN r0 evasions (3) · GREEN r1 orders (3) + combined (1) · green typecheck + full file (2)
· cluster ×3 · wide suite ×3 · cite-check (2) · merge records (3) · obs-s05 isolated ×3
· registration-rss ×3 · install · generate:contract · mutants (6) · defeat probes (7)
        →  every group: "OK: every record stamps the filed tip"  (tip 42360f81)
RED r0 (4) → stamp 7828d220 · RED r1 (4) → stamp ad44f507 · preserved suite (3) → ad44f507
        →  STALE against the tip BY DESIGN: RED evidence must stamp the tip at which it was RED,
           and 7828d220 / ad44f507 are the parents of 3a579a68 / 42360f81 respectively.
```

## 7. The merge — method claim corrected

The reviewer is right that comparing sorted added/deleted line sets in both directions is a
**content checksum, not a semantic proof**: equal line multisets can assemble into different code.
I withdraw the phrase "verification by meaning" for that check.

Replaced with an actual **assembly proof** (`logs/t01/t1b-merge-assembly-proof.log`, script at
`logs/t01/t1b-scripts/merge-assembly-proof.sh`): reconstruct each file as *integration's blob with
T1's base→lane patch applied*, then compare sha256 with the merged blob at HEAD.

```text
PROVEN          packages/contract/src/index.ts   sha256 f452279d5a98ce721ced771f3b622202c24288ad4a89ec6ada1f4ca392ce9b30
PROVEN          tools/orphan-audit/src/index.ts  sha256 2a3335cdc0a0aca85a46174302b08b668bfba671c608c741a21d2f461b8d1193
NOT-APPLICABLE  apps/runner/src/index.ts         (both sides edited the same line — the hand-resolved conflict)
```

The two auto-merged files are therefore **byte-identically** integration plus T1's patch, which is
a proof of assembly rather than of content. The third cannot be reconstructed by patch application
by construction, so the log prints all four versions of the conflicting line for direct
inspection; the resolution keeps T1's `@debateai/contract` import line **and** integration's
extended `@debateai/kernel` line. `git diff --name-status` against integration lists exactly
T1's ten files plus `.hermes/TOOLING-TRAPS.md`.

## 8. Findings

- **F-T1B-1 · non-blocking · not mine · NARROWED.** One name beyond the T0 known-red seed appears
  in 1 of 6 retained `tests/unit`+`tests/architecture` runs:
  `obs-l2-s05-boot-capture.test.ts > … falls back to Tier 0 when a Tier-1 exit sink throws`. It
  passes 3/3 in isolation and its file is untouched by my diff. It is **not** in
  `ci-known-red-mission-seed.txt`, so CI would read it as a new red. I do not name an owner.
- **F-T1B-2 · non-blocking · in my own file, deliberately left.** `keeps the owning declaration as
  the only depth-bound site in shipped code` hard-codes `packages/contract/src/index.ts:112`. It
  fails loudly rather than silently, so it is not a D53 expiry, but it is avoidable churn for the
  next lane that inserts above line 112.
- **F-T1B-3 · non-blocking · frozen out of this ticket.** Indirection (`df1`) and non-`5`
  spellings of the ceiling (`df2`, `df3`) are unreachable for a source-text oracle in any layout.
  Closing either needs symbol resolution or constant folding.
- **F-T1B-4 · NEW · non-blocking · the residual of this round's fix.** `df5`: an exclusive `6`
  separated from its own comparison operator by a newline is missed, because the `6` arm is
  line-scoped. Narrower than the `df4` gap it replaced, and `df6` shows the ordinary wrap is still
  caught — but it is a residual layout case and I am naming it rather than claiming completeness.
  Closing it requires binding the `6` to its comparison's left operand, a **predicate** change.

## 9. Dead ends

- **No TypeScript AST is available here.** `typescript@7.0.2` is the Go-native port:
  `ts.createSourceFile`, `ts.forEachChild` and `ts.SyntaxKind` are all `undefined` from its main
  entry; only `./unstable/sync` exists. `typescript@5.9.3` sits in the pnpm store as a transitive
  dep, reachable only through `.pnpm` internals.
- **Enumerating AST node kinds is spelling-enumeration in disguise**, ruled out for the same
  reason regex enumeration was.
- **`{`/`}` breaking only at the unit's own depth does not work** — an arrow-function body stays
  glued to its call.
- **An operand-order rule looked like it separated the df4 positive from the page.tsx negative,
  and is unsound.** `&&` commutes; a verdict depending on conjunct order is layout dependence
  again. Both orders are now asserted in both directions precisely to keep anyone from
  reintroducing it.

## HANDOFF — T1B r1

- **Marker:** `REWORK READY FOR REVIEW — T1B r1 · comments read through: t1b-codex-r1-2026-09-03`
- **Rework round:** 1 of max 3. T1B is a V-authorized micro-ticket, not round 4 of T1. Rework
  returns to session `opus-t01-w1b`.
- **Tip:** `42360f81b04234ef76f6a703256ababf7e9d7748`, tree `46571006`, porcelain empty. Four
  commits: `7828d220`, `3a579a68`, `ad44f507`, `42360f81`.
- **Scope kept:** the depth ceiling, the four regexes and r3's `kindOf` are byte-unchanged. One
  file edited for the fix: `tests/unit/s1-1-depth-contract.test.ts`.
- **Diff surface vs integration:** T1's original ten files plus `.hermes/TOOLING-TRAPS.md`.
- **Self-report:** `agent-reports/t01-depth-self.md`, `## T1B r1`.
- **Not done, by contract:** no push, no merge, no Done mark, no board write, no ticket split.
- **Owed:** codex review of this round; judge verdict; the D15 batch suite on integration.

---

# T1B r2 — THE EXCLUSIVE-SIX WINDOW (codex T1B r2 B1)

**Rework 2 of 3.** One round remains. Tip `d4a3eae9bdba4e846d824c3582479a441d54a97b`,
tree `857ef138`, porcelain empty.

| commit | |
|---|---|
| `7828d220` | merge of integration `19bbb4c4` into `lane/t1` |
| `3a579a68` | r0 — declaration units replace the line scan |
| `ad44f507` | tooling traps (worker contract §6) |
| `42360f81` | r1 — the two arms get different windows |
| `a6a87f49` | **r2 — the `6` arm gets a CONJUNCT unit, not a line** |
| `d4a3eae9` | **r2 — a control for the conjunct boundary's depth, which mutant m10 survived** |

## 1. The finding, and why the reviewer was right

r1 argued the `6` arm is **comparison-local** and then implemented it as **line-local**. Those
are not the same claim, and I did not notice I had substituted one for the other. My m6 mutant
refuted the too-wide *declaration* window; it said nothing whatever about the too-narrow *line*
one. The principled middle — a comparison or conjunct unit — was never built and never tested.
**Refuting one extreme is not evidence for the other**, and I presented it as though it were.

The line window was wrong in **both** directions, and I had evidence for neither:

- **split** — my own `df5` transcript showed the shipped oracle changing its answer when a
  newline is inserted inside a single comparison (`depth <` ⏎ `6`). I disclosed it and called it
  an acceptable scoped limit. It was not: it is the same defect as B1, at smaller scale.
  Disclosure makes a residual reviewable; it does not make it a *different* defect.
- **joined** — the reviewer found the inverse, which I had not looked for at all. Collapsing my
  own retained negative control onto one line makes the retained r3 line pass manufacture
  precisely the false site that control exists to forbid.

Both are now paired RED-first controls, and neither can be satisfied by a line window in either
direction.

## 2. The fix — the boundary was never wrong, it was on the wrong arm

The exclusive-`6` arm now gets the unit its own argument implies: **the conjunct**.

`declarationUnits(source, splitConjuncts)` (`tests/unit/s1-1-depth-contract.test.ts:375`) adds
one boundary — `&&`, `||`, `??` — at **any bracket depth** (`:445`). At any depth, not the unit's
own: a logical operator separates conjuncts inside `if (...)` exactly as it does at statement
level, and the shallower rule lets `if (topic.length > 6 && depth >= MIN)` join into one unit.
**That claim is not left in a comment — mutant m10 is the shallower rule, and a control kills
it.** r1's `&&` boundary was never wrong in itself; it was applied to the ceiling-literal arm,
where it did not belong.

**THREE WINDOWS**, each carrying the arms whose evidence fits it (`:469`–`:478`):

| window | arms | why |
|---|---|---|
| LINE | ceiling-literal | r3's own window. Kept so a `5` and a depth crowded onto one line still register where a unit boundary falls between them, and so comments stay covered. |
| DECLARATION | ceiling-literal | the ceiling is the ceiling wherever it sits in the declaration |
| CONJUNCT | exclusive-`6` | a `6` is evidence only about its own comparison |

`kindOfCeilingLiteral` is at `:312`, `kindOfExclusiveBound` at `:318`. **All four r3 regexes are
byte-unchanged and r3's `kindOf` is retained verbatim at `:273`.**

### The one deliberate narrowing, asserted rather than left silent

This is the single place the oracle is **not** a superset of r3, and it is load-bearing, so it is
a control rather than a footnote (`:681`):

```ts
it("narrows r3 in exactly one place: a six bound to something other than the depth", () => {
  expect(kindOf(collapsed)).toBe("DEPTH_BOUND_LITERAL");   // r3 reported a site here
  expect(duplicateBoundSites(collapsed)).toEqual([]);       // and it was a false one
});
```

Both halves are asserted, so restoring the `6` arm to the line pass fails this control and says
exactly what changed. That is also what keeps `kindOf` exercised rather than merely present.

All 14 report anchors proven UNIQUE at `d4a3eae9` (`logs/t01/t1b-cite-check.log`, 14/14, exit 0);
the refusal arm re-proved on this tree (exit 1, `…refusal-probe.log`).

## 3. RED first — both manifestations, paired

Written before the fix, run at `42360f81` (the parent of `a6a87f49`; ancestry verified).

```text
× detects an exclusive six however the comparison is wrapped — 'split after the operator'
✓ detects an exclusive six however the comparison is wrapped — 'same comparison on one line'
✓ detects an exclusive six however the comparison is wrapped — 'split after a logical operator'
× does not manufacture a site when the negative control is collapsed onto one line
× narrows r3 in exactly one place: a six bound to something other than the depth
  Tests  3 failed | 2 passed | 40 skipped (45)
```

`logs/t01/t1b-r2-RED-six-window.log`. The one-line forms pass and the split form fails — layout
isolated as the only variable, again.

| manifestation | RED @ `42360f81` | GREEN @ `d4a3eae9` |
|---|---|---|
| split comparison | `logs/t01/t1b-r2-RED-m1-split-comparison.log` — 1 failed \| 44 skipped | `logs/t01/t1b-r2-GREEN-m1-split-comparison.log` — 1 passed \| 45 skipped |
| collapsed negative control | `logs/t01/t1b-r2-RED-m2-collapsed-negative.log` — 1 failed \| 44 skipped | `logs/t01/t1b-r2-GREEN-m2-collapsed-negative.log` — 1 passed \| 45 skipped |
| combined | as above, 3 failed \| 2 passed | `logs/t01/t1b-r2-GREEN-six-window.log` — 6 passed \| 40 skipped |

Earlier rounds' frames stand and were re-run GREEN at this tip: r0 evasions
`t1b-RED-e{1,2,3}` @ `7828d220` → `t1b-GREEN-e{1,2,3}`; r1 wrapped conjuncts
`t1b-r1-RED-o{1,2,3}` @ `ad44f507` → `t1b-r1-GREEN-o{1,2,3}`.

## 4. Refutation — eight mutants, each with an exact victim list

All via `tools/mutate.sh`; every transcript ends `HASHES MATCH`, porcelain empty.

| id | mutation | kills | what it pins |
|---|---|---|---|
| **m9** | delete the conjunct pass | 4 — r3's own `exclusive six` control plus all three wrapped-six layouts | the conjunct pass now carries the whole `6` arm |
| **m7** | put the `6` arm back on the LINE window (r1's mistake) | 3 — the nested-conjunct control, the collapsed control, and the narrowing control | the **joined** direction |
| **m8** | give the `6` arm the DECLARATION window (too wide) | 7 — both real-tree assertions and all five negative controls | the **too-wide** direction |
| **m10** | conjunct boundary at the unit's own depth instead of any depth | 1 — exactly the control written for it | the boundary's depth |
| **m5** | put the `&&` cut back on the ceiling-literal arm | 2 — both wrapped-conjunct orders | r1's B1, still pinned |
| **m6** | widen the ceiling-literal arm to r3's full composition | 7 | the arm split itself |
| **m1** | delete the declaration pass | 6 — the four r0 layout controls and both wrapped orders | the declaration window |
| **m4** | plant a real multiline duplicate in shipped source | 2 real-tree assertions | it bites on real code |
| **m3** | NEIGHBOUR — flip the site sort comparator | **0 — survives**, 46/46 | discrimination |

**m10 is the round's own lesson.** I wrote the any-depth rationale into a comment, ran the
shallower rule as a mutant, and it **survived** — an unpinned claim, which is exactly the shape
D56 forbids. The control at `:664` was added for it and `d4a3eae9` is that commit; m10 now dies
to it alone.

### D51 — the causal claim, generated

With m4 applied, the comparator (`logs/t01/t1b-scripts/scan-comparator.mjs`, transcript
`…/m4b-causal-line-vs-unit.log`) reports the windows separately over all 254 shipped files:

```text
LINE sites: 1
  L packages/contract/src/index.ts:115 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;
UNIT sites: 2
  U packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const DepthAgainSchema = z.number() .int() .max(5)
  U packages/contract/src/index.ts:115 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5
```

## 5. D56 — the defeat set, re-measured

Each probe run **through the shipped oracle**, never a copy.

| probe | detected? |
|---|---|
| `df0` a different wrapped chain, `.max(5)` | YES |
| `df4` `isDepthField(v) &&` ⏎ `v <= 5;` — r1's finding | YES |
| **`df5` `if (depth <` ⏎ `6)` — r2's finding** | **YES — now closed** |
| `df6` `if (… ||` ⏎ `depth < 6)` | YES |
| `df7` `depth: z.number()` ⏎ `.lt(6);` | YES |
| `df1` constant indirection | NO |
| `df2` arithmetic `2 + 3` | NO |
| `df3` hex `0x5` | NO |

`logs/t01/t1b-defeat/df{0,1,2,3,4,5,6,7}-*.log`.

**What remains, and its status.** `df1`, `df2`, `df3` are **PREDICATE** limits inherited from r3 —
`BARE_FIVE` never matched `2 + 3`, `0x5` or `5.0` on one line either — and V froze predicate
expansion out of a unit-only ticket. I am not calling them acceptable on my own authority; I am
saying they are a different defect from B1 (they do not vary with layout) and they are outside the
unit boundary I was told to stay inside. **No layout-varying case is known to remain**: every
wrapped form in the matrix now agrees with its one-line form.

Scope is unchanged (`packages`, `apps`, `web`; skipping `node_modules`, `generated`, `.next`,
`dist`, `build`, `__tests__`). Regex literals are still not lexed, so a `/it's/` reads as an
apostrophe; single- and double-quoted strings close at the newline, so the desync is confined to
one line.

## 6. Verification

**Cluster, three runs, worst wins** — `46 passed / 46` in all three
(`logs/t01/t1b-cluster-final-run{1,2,3}.log`, exit 0). **Worst run 46/46.** Typecheck **0 errors**.
r3 31/31 → r0 36/36 → r1 40/40 → r2 46/46.

**Wider suite** — `tests/unit` + `tests/architecture`. **Nine runs retained across three tips:**

| tip | runs | result | extra beyond the seed |
|---|---|---|---|
| `ad44f507` | 3 | 13, **14**, 13 / 1431 | 0, 1, 0 |
| `42360f81` | 3 | 13, 13, 13 / 1435 | 0, 0, 0 |
| `d4a3eae9` | 3 | 13, 13, 13 / 1441 | 0, 0, 0 |

**Worst run across everything retained: 14 failed / 1431.** At this tip the worst of three is
**13 failed / 1441**. Eight of nine runs fail exactly the 13 names in
`logs/ci-known-red-mission-seed.txt`. Records: `logs/t01/t1b-suite-at-ad44f507/run{1,2,3}.log`,
`logs/t01/t1b-suite-at-42360f81/run{1,2,3}.log`, `logs/t01/t1b-lane-unit-arch-run{1,2,3}.log`.

Across all nine, the union of failures contains **exactly one** name beyond the seed:
`obs-l2-s05-boot-capture.test.ts > S05 fatal-boundary installers > runner falls back to Tier 0
when a Tier-1 exit sink throws`, in **1 of 9**. It passes **3/3 in isolation**
(`logs/t01/t1b-obs-s05-isolated-run{1,2,3}.log`); `git log 386efd39..HEAD` for that file is empty;
my oracle reads only `packages`, `apps`, `web`, never `tests/`. **I do not name an owner** — not
measured. The registration RSS observation withdrawn in r1 stays withdrawn: it has not recurred
in six further runs, and `logs/t01/t1b-registration-rss-run{1,2,3}.log` show only that it passes
in isolation.

**Records.** Every gate through `gate-run.sh` v3, every record checked with `stamp-check.sh`:
all fourteen groups report `OK: every record stamps the filed tip` at `d4a3eae9`. The RED groups
stamp earlier tips **by design** — `t1b-RED-` → `7828d220`, `t1b-r1-RED-` → `ad44f507`,
`t1b-r2-RED-` → `42360f81`, and the two preserved suite directories → their labelled tips. All
three are verified ancestors of the tip (`git merge-base --is-ancestor` = yes for each).

## 7. N1 — merge evidence, pinned and bounded

Both corrections made.

**Revision-pinned.** `logs/t01/t1b-scripts/merge-assembly-proof.sh` now takes every revision as an
argument, resolves each to a 40-hex object id with `git rev-parse --verify <rev>^{commit}`, and
**reads no ref at all** — r1's version named immutable inputs in prose while reading the mutable
branch `mission/2026-09-01-algorithm-live-loop`, so its record could not be reproduced once that
branch moved. The record now opens with the resolved ids and the merged commit's actual parents:

```text
base         1c9578a24d5aedd0302fbda5593f66277cd87b98
lane         386efd39118fdf1bcbbd4a82fd8d0ee83507b00e
integration  19bbb4c4f8c5128df4d1de9584bed4df4d283c22
merged       7828d22015b99cba05cf532e7e52b43364f9233c
merge parents of merged: 386efd39118fdf1bcbbd4a82fd8d0ee83507b00e 19bbb4c4f8c5128df4d1de9584bed4df4d283c22
```

**Bounded.** The script now states in its own output what each result is and is not:

```text
PROVEN          packages/contract/src/index.ts    sha256 f452279d…
PROVEN          tools/orphan-audit/src/index.ts   sha256 2a3335cd…
NOT-APPLICABLE  apps/runner/src/index.ts
                both parents edited the same line; no reconstruction exists.
                THE LINES BELOW ARE AN INSPECTION AID, NOT A PROOF:
SUMMARY: 2 file(s) PROVEN by assembly; 1 file(s) NOT-APPLICABLE (inspection only, no proof claimed).
```

### And the same defect once more, in my own prose

While checking the record I found that my r1 and r2 handoffs both wrote "**diff surface vs
integration**" without naming which integration commit. That phrase reads a mutable ref, which is
the very thing N1 charges. Measured and pinned (`logs/t01/t1b-integration-drift.log`, script
`logs/t01/t1b-scripts/integration-drift.sh`, all revisions passed as arguments):

```text
integration merged at       : 19bbb4c4f8c5128df4d1de9584bed4df4d283c22
integration now             : 58c4715e442486b4f50891923517ade7fa20163d
commits gained since merge  : 23
```

**Against `19bbb4c4`, the commit this lane actually merged, the diff surface is exactly eleven
files** — T1's original ten plus `.hermes/TOOLING-TRAPS.md`. That claim is true and now pinned.
Against integration's *current* tip it is 31 files, and the extra twenty are S09/T17B and S11/T15
work this lane does not contain. **The lane is 23 commits behind again.**

I did not chase it, deliberately: a second catch-up merge would invalidate every record filed this
round and consume the last of three, and it is not the finding. What I did instead was measure the
hazard, since the whole point of a catch-up is whether it can collide:

```text
apps/runner/src/index.ts          1 commits, 0 depth-bearing lines changed
packages/budget/src/index.ts      5 commits, 0 depth-bearing lines changed
```

Two of the eleven files were touched by the new commits and **neither changed a depth-bearing
line**, so nothing in the new integration work collides with this lane's subject. Filed as
F-T1B-6 so the judge decides whether the re-merge is owed before acceptance rather than inheriting
a silent gap. (Integration's own tip still shows six depth-bound sites — that is the pre-T1
baseline, not a regression: removing five of them is what T1 *is*.)

### What the three files' evidence is, and is not

So, plainly: **two of three files have a whole-file assembly proof** — the merged blob is
byte-identically integration's blob with this lane's patch applied. **The third has none.** Its
four versions of the import region are printed for a reader to check, the resolution is correct
(T1's `@debateai/contract` line kept **and** integration's extended `@debateai/kernel` line kept),
and no proof is claimed for it. Reviewer judgement is required there; the record no longer implies
otherwise.

## 8. Findings

- **F-T1B-1 · non-blocking · not mine · narrowed further.** One name beyond the known-red seed, in
  1 of 9 retained runs; passes 3/3 in isolation; file untouched by my diff. No owner named.
- **F-T1B-2 · non-blocking · in my own file.** `keeps the owning declaration as the only
  depth-bound site` hard-codes `packages/contract/src/index.ts:112`. Fails loudly, not silently.
- **F-T1B-3 · non-blocking · frozen out.** `df1`/`df2`/`df3` — indirection and non-`5` spellings —
  need symbol resolution or constant folding. Not layout-varying.
- **F-T1B-4 · CLOSED this round.** The `df5` split-comparison gap. Closed by the conjunct window,
  proved by `t1b-defeat/df5-*` flipping to CAUGHT and by mutants m9/m7.
- **F-T1B-6 · NEW · non-blocking · a re-merge is owed, and it is measured rather than feared.**
  Integration advanced from `19bbb4c4` to `58c4715e` (23 commits: S09/T17B, S11/T15) after this
  lane's catch-up. Two of this lane's eleven files were touched by them —
  `apps/runner/src/index.ts` (1 commit) and `packages/budget/src/index.ts` (5) — and **neither
  changed a depth-bearing line**, so no collision with T1's subject is known. Not merged this
  round on purpose: it would invalidate every record filed here and spend the last of three rework
  rounds on something that is not the finding. Judge/V to decide whether it is owed before
  acceptance. Record: `logs/t01/t1b-integration-drift.log`.
- **F-T1B-5 · NEW · non-blocking · process, not product.** Mutant m10 survived against a claim I
  had written into a comment. I found it by running the mutant, but only because the refutation
  duty made me run one per claim. **A rationale in a comment with no mutant behind it is an
  unpinned claim**, and this file had one for a full round. Worth a review-checklist line.

## 9. Dead ends

- **No TypeScript AST here** — `typescript@7.0.2` is the native port; `ts.createSourceFile`,
  `ts.forEachChild`, `ts.SyntaxKind` all `undefined` from its main entry.
- **Enumerating AST node kinds** is spelling-enumeration in disguise.
- **An operand-order rule** to separate the df4 positive from the page.tsx negative is unsound:
  `&&` commutes. Both orders are asserted in both directions to keep it from returning.
- **Conjunct boundary at the unit's own bracket depth** does not work — `if (a > 6 && depth >= x)`
  joins into one unit. This is mutant m10 and it now has a control.

## HANDOFF — T1B r2

- **Marker:** `REWORK READY FOR REVIEW — T1B r2 · comments read through: t1b-codex-r2-2026-09-03`
- **Rework round:** 2 of max 3. **One round remains.** Rework returns to session `opus-t01-w1b`.
- **Tip:** `d4a3eae9bdba4e846d824c3582479a441d54a97b`, tree `857ef138`, porcelain empty.
- **Scope kept:** the depth ceiling, the four r3 regexes and r3's `kindOf` are byte-unchanged.
  One file edited for the fix: `tests/unit/s1-1-depth-contract.test.ts`.
- **Diff surface vs integration commit `19bbb4c4`** (the commit merged): exactly eleven files —
  T1's original ten plus `.hermes/TOOLING-TRAPS.md`. **Not** measured against the branch ref:
  integration has since advanced 23 commits to `58c4715e` and this lane does not contain them
  (F-T1B-6; no depth-bearing line collides).
- **Self-report:** `agent-reports/t01-depth-self.md`, `## T1B r2`.
- **Not done, by contract:** no push, no merge, no Done mark, no board write, no ticket split.
- **Owed:** codex review of this round; judge verdict; the D15 batch suite on integration.
