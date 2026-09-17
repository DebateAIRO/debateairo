WORKER DEV-HEALTH — REWORK READY FOR REVIEW · tip 4e5f93278809c42f098468623227a0918e9db91e · comments read through: dev-health-r1-2026-09-07
SKILLS LOADED: heartbeat (loader, Skill tool) · heartbeat-protocol (read as markdown at .claude/skills/heartbeat-protocol/SKILL.md — the loader hands off by path, I did not invoke it with the Skill tool) · heartbeat-worker (Skill tool — it did NOT refuse inside this Agent seat, contrary to the packet's warning; also read as markdown) · superpowers:test-driven-development · superpowers:verification-before-completion · superpowers:systematic-debugging · superpowers:receiving-code-review (loaded first thing in rework round 1, before reading the verdict). NOT loaded, declared per §3b rather than hidden: superpowers:using-superpowers (the router's §1 tells every seat to load it first — I went straight to the floor skills; a shortfall, and mine).

Lane `lane/dev-health`, worktree `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-dev-health`, base dev `80559019e68932fd16528fc82e9ba174b952e0cf`, three commits, tree clean at the filed tip.
Provisioning verified before acting: `logs/dev-health/01-provision.log` ends `PROVISIONED OK commit=80559019e68932fd16528fc82e9ba174b952e0cf`. STRENGTH: entailed (read from the file).

Packet facts checked against the tree before touching anything, all three confirmed (STRENGTH: entailed, each read by grep at the base tip): `tests/unit/s1-1-depth-contract.test.ts:376–378` carried the comment and `toBe(232)` / `toBe(59)`, with the instrument at :291–:293 · `apps/runner/src/index.ts:73` is the closing line of the `@debateai/valuation` import and `apps/runner/package.json` declared 16 `@debateai/*` deps without it · `packages/db/src/auth-risk.ts:71` declared `poisoned(category = "signal-shape")` with :84, :88, :116 defaulted and :246/:250 named.

## RED

Every frame below was taken BEFORE the corresponding implementation. Transcripts are in `logs/dev-health/red/` (a subdirectory, so the stamp comparator skips them — they are RED evidence at the base tip, not gate records at the filed tip).

**RED-1 — the inherited red row** (`red/01-red-s1-1-corpus.log`, at 80559019). `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` → exit=1, `Tests 2 failed | 1008 passed (1010)`.
```
AssertionError: expected 233 to be 232 // Object.is equality
 ❯ tests/unit/s1-1-depth-contract.test.ts:377:28
```
That is the ticket: the row fails with a number and names no path. STRENGTH: entailed.

**RED-2 — the property, not the symptom** (`red/02-red-manifest-names-the-added-path.log`). The manifest was seeded with the HISTORICAL 232-file set and the new set comparison run against it. exit=1:
```
AssertionError: expected { …(2) } to deeply equal { added: [], missing: [] }
+   "added": [
+     "apps/api/src/risk-signal-identity.ts",
+   ],
 ❯ tests/unit/s1-1-depth-contract.test.ts:392:56
```
The failure NAMES the file. STRENGTH: entailed.

**RED-3 — the poisoned categories** (`red/04-red-poisoned-categories.log`). Assertions written before the fix; `pnpm exec vitest run tests/unit/p2-auth-risk.test.ts` → exit=1, `Tests 3 failed | 9 passed (12)`:
```
→ expected 'signal-shape' to be 'policy-shape'
→ expected 'signal-shape' to be 'evaluated-at-shape'
→ expected [ Array(3) ] to deeply equal [ 'policy-shape', …(2) ]
```
STRENGTH: entailed. GREEN after the fix (`red/05-green-poisoned-categories.log`): exit=0, `Tests 12 passed (12)`.

**Ticket 2 has no RED frame, and I am not manufacturing one.** An undeclared dependency that resolves through hoisting has no failing test to show; the test file that could assert "every imported `@debateai/*` is declared" is not in my `allowed` list (only `s1-1-depth-contract.test.ts` and `p2-auth-risk.test.ts` are). Its evidence is the install gate and the lockfile diff below. STRENGTH: entailed for the contract bound; the missing-RED is a stated gap, not a claim.

## The fix

### F-ORACLE-CORPUS-COUNT — the corpus is named, not counted

`tests/support/shipped-corpus.manifest.txt` (new, 233 entries, sorted, one repository-relative path per line, `#`/blank lines are documentation) and `tests/support/shippedCorpusManifest.ts` (new) replace the two literals in `tests/unit/s1-1-depth-contract.test.ts`. The row now compares the scanned SET to the manifest via `shippedCorpusDrift`, which returns `{ added, missing }` — so a new shipped file is a deliberate manifest edit that names the path, and a file that disappears is named too. The `.tsx` share is derived from the manifest instead of a second literal.

Manifest composition read from the artifact at write time: 233 entries — packages 75, apps 157, web 1 — of which 59 are `.tsx`. STRENGTH: entailed (`grep -vE '^\s*(#|$)'` over the committed file).

**The manifest diff, derived and not assumed.** The live filesystem scan (233, replicating the oracle's roots/exclusions/extensions exactly) was compared against git's tracked set at HEAD under the same filter: identical, `diff` rc=0 — so no untracked or ignored file participates. The same filter at `70647e7e`, the commit where the count was 232, yields 232 and the single difference to HEAD is:
```
12a13
> apps/api/src/risk-signal-identity.ts
```
That one line is the whole manifest diff against the era the `232` pin belonged to. STRENGTH: entailed (git, at write time).

**The instrument is untouched.** `SHIPPED_ROOTS`, `SKIPPED_DIRECTORIES`, `SHIPPED_EXTENSIONS` and `shippedSourceFiles()` stay exactly where they were in the test file, unchanged, and are deliberately NOT duplicated in the manifest module — a generator that re-declared them could drift from the oracle it is supposed to describe. Regeneration therefore runs the oracle's own scan: `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run …`, documented in the manifest's own header. The other oracle rows call the same untouched `shippedSourceFiles()`. STRENGTH: entailed (`git diff` of the test file is confined to one import block and the corpus row's assertions).

### F-RUNNER-MISSING-VALUATION-DEP — the edge declared

`apps/runner/package.json` gains one line, `"@debateai/valuation": "workspace:*"` — the neighbours' form, and the same form `packages/battery/package.json` and `packages/serve/package.json` already use for this package. `@debateai/*` deps went 16 → 17. STRENGTH: entailed (read from the file by python json at write time).

The lockfile was updated **by pnpm**, never by hand. `pnpm install` exit=0; the resulting `git diff -- pnpm-lock.yaml` is three lines and nothing else:
```
+      '@debateai/valuation':
+        specifier: workspace:*
+        version: link:../../packages/valuation
```
STRENGTH: entailed.

### F-POISONED-REQUIRED-CATEGORY — the category required, every site named

`packages/db/src/auth-risk.ts`: `poisoned(category: AuthenticationRiskSignalPoisonCategory)` — no default. All five call sites name their stage; `grep -c 'poisoned();'` over the file returns **0**. The vocabulary gains two constants and now reads `"policy-shape","evaluated-at-shape","signal-shape","context-decrypt","context-parse"`. STRENGTH: entailed (both read from the file at write time).

Names were chosen by reading what each site checks, not by copying the packet's examples:
- `:91` `!Number.isInteger(maxSignals) || maxSignals < 1` — the scan bound is a policy argument → **`policy-shape`** (the packet's suggestion, and it fits).
- `:95` `!(evaluatedAt instanceof Date) || !Number.isFinite(...)` — the evaluation instant → **`evaluated-at-shape`** (the packet's suggestion).
- `:123` the per-signal validation chain → **`signal-shape`**. I did NOT use the packet's example `row-shape`: `signal-shape` is the module's existing name for exactly this shape, and adding `row-shape` beside it would put two names on one thing. Disclosed as a deliberate deviation from an "e.g." list.

**The public message is untouched** — `AUTH_RISK_SIGNAL_POISONED`, still a `TypeError`, asserted on every new row. Only `cause` moved. STRENGTH: entailed (five assertions in `p2-auth-risk.test.ts`, all green).

**Disclosed constant choice:** I reordered `AUTHENTICATION_RISK_SIGNAL_POISON_CATEGORIES` into pipeline order rather than appending the two new names. Nothing consumes its order — the class sweep found exactly three consumers of the vocabulary (`poisonCategorySet`, a Set; the module's own type; and `p2-auth-risk.test.ts`, which uses `toContain`), and `grep` for the constant across `packages apps web tests tools acceptance` returns nothing else. STRENGTH: entailed (sweep output preserved in the transcript).

**Class sweep (§2.2), reported so it can be re-checked mechanically rather than re-derived.**
- Class "a whole-tree enumeration pinned to a magic number". Members found: `grep -n 'toBe([0-9]\+)\|toHaveLength([0-9]\+)\|length).toEqual([0-9]'` over the other two shipped-tree walkers (`tests/architecture/t8-strict-and-removed.test.ts`, `tests/architecture/t10-first-configured-provider-removed.test.ts`) and `tests/unit/v2ui-node-runner.test.ts` → **rc=1, no matches**. The class has exactly one member in the tree and it is the one fixed. STRENGTH: entailed.
- Class "a `poisoned()` call site with an unnamed category". `grep -rn 'poisoned(' --include='*.ts' packages apps` → six hits, all in `auth-risk.ts`: one declaration and five call sites. Three were defaulted, all three now named; the other two already named. No member elsewhere. STRENGTH: entailed.

## Mutants

Every mutant via `tools/mutate.sh` v3 with the project-local runner, each to a NEW file name, each transcript ending `RESULT: ok … porcelain=empty` with hashes matching. Lane clean and at `8252bca1` after all five.

| # | Mutant | Discriminating command | Outcome | Record |
|---|---|---|---|---|
| a | comment out the manifest entry `apps/api/src/risk-signal-identity.ts` | corpus row | **CAUGHT** — `added: ["apps/api/src/risk-signal-identity.ts"]`, `Tests 1 failed \| 1009 skipped`, cmd_exit=1 | `30-mutant-a-manifest-entry-removed.log` |
| a2 | insert a phantom manifest entry `apps/api/src/PHANTOM-NOT-ON-DISK.ts` | corpus row | **CAUGHT** — `missing: ["apps/api/src/PHANTOM-NOT-ON-DISK.ts"]`, cmd_exit=1 | `31-mutant-a2-phantom-manifest-entry.log` |
| b | restore the default on `poisoned()` (the packet's §5b) | `pnpm typecheck` + p2 suite | round 0: **SURVIVED** — no observer existed. Round 1: **KILLED**, see `## Rework round 1` | `33-mutant-b-restore-default-SURVIVES.log` · `r1-63-mutant-b-restore-default-NOW-KILLED.log` |
| b2 | strip the argument at the `:91` call site | `pnpm typecheck` | **CAUGHT** — 9 diagnostics, the new one `packages/db/src/auth-risk.ts(91,51): error TS2554: Expected 1 arguments, but got 0.` | `34-mutant-b2-strip-call-site-argument.log` |
| c | rename `MANIFEST_PATH` → `CORPUS_MANIFEST_PATH` consistently (3 occurrences, `MUT_EXPECT=3`) | corpus row | **SURVIVES, as required** — `Tests 1 passed`, cmd_exit=0 | `32-mutant-c-neighbour-consistent-rename.log` |

**Round-0 note, CORRECTED in rework round 1 — the claim below was wrong and codex r1 (R1) was right.** In round 0 mutant b survived and I concluded that packet outcome §5(b) prescribed a mutant that *could not* discriminate, because "a mutant on the DECLARATION cannot discriminate a property whose entire content is what the CALL SITES do". That is true of the RUNTIME layer only. It is false as stated: a compile-negative contract check observes a restored default, and §5(b) was not defective. The survival measurement was real; the generalisation drawn from it was not, and it was mine, not the packet's. Mutant b is **killed** in rework round 1 — see `## Rework round 1`. STRENGTH: entailed (the round-0 transcript survives at `33-mutant-b-restore-default-SURVIVES.log`; the round-1 kill at `r1-63-mutant-b-restore-default-NOW-KILLED.log`).

Note on reading b2's transcript: its `EXIT = 0` line is the exit of my compound `bash -c`, whose last command was a grep, not of `tsc`. The discriminating evidence is the diagnostic count (9 against the baseline's 8) and the named `auth-risk.ts(91,51)` line, both in the transcript.

**Properties stated before the assertions, and which mutant each falls out of:**
1. *The scanned set of shipped paths equals the committed manifest.* → caught by a (a file present but unlisted) and a2 (a file listed but absent); survives c.
2. *Every `poisoned()` rejection names the stage that produced it, and the three argument/row stages are mutually distinguishable.* → caught by b2 at compile time and by the RED-3 rows at runtime.
3. **Honest limit:** the `.tsx` assertion is ENTAILED by property 1 — if the sets are equal the counts must be — so it pins nothing the set comparison does not already pin. It is kept because the packet asks the tsx count to follow from the manifest, and it does. I could not build a mutant that it catches and the set comparison does not; saying so is better than implying it is an independent pin.
4. **Honest limit:** the row "categorises a malformed stored signal as a signal-shape rejection" passed BEFORE the fix too (the old default was `signal-shape`). It is a pin against a future mis-naming of that site, not evidence of this change. Its siblings carried the RED.

## Rework round 1

Round 1 of max 3. Codex r1 = CHANGES (R1, R2 required; A1/A2 charged to the packet; N1/N2 nonblocking). The corpus manifest and the runner dependency were cleared and are not reopened. New tip `4e5f93278809c42f098468623227a0918e9db91e`; one commit, `fix(dev-health): give poisoned()'s required category a persistent observer, and correct the impossibility claim`. Three files: `tests/unit/p2-auth-risk.test.ts`, `packages/db/src/auth-risk.ts`, `.hermes/TOOLING-TRAPS.md` — all in `allowed`.

### R1 — the required category now has a persistent observer, and my impossibility claim is withdrawn

**The finding is correct and my round-0 reasoning was wrong in a specific, nameable way.** Mutant b really did survive, and no runtime row could have caught it: a default is only visible at a call site that omits the argument, and the point of the ticket is that no such call site exists. From that I concluded requiredness was unpinnable at a declaration. That generalised one layer to the whole language. A TYPE-level observer sees it.

`tests/unit/p2-auth-risk.test.ts` now compiles the module's own committed source, in memory, with one appended call that omits the category, and requires a TS2554 whose position lies past the end of the real source. The helper stays private, nothing is exported for testing, no invalid call is executed, and the production signature is untouched — the probe is assembled in memory from the file on disk and discarded.

Two guards, both measured rather than assumed. The arity diagnostic is filtered **by position**, so a stray arity error inside the module cannot pass for the probe's. And no `cannot find name` diagnostic may mention `poisoned` — if the helper stopped resolving there would be no arity error either, and "no arity error" would read exactly like a restored default. Measured with `noResolve: true`: the omitting probe yields 85 semantic diagnostics of which exactly 1 is TS2554; the naming probe yields 84 of which 0 are. STRENGTH: entailed.

**Mutant b is now killed.** `r1-63-mutant-b-restore-default-NOW-KILLED.log`, `RESULT: ok … cmd_exit=1`:
```
 × F-POISONED-REQUIRED-CATEGORY the required category has a persistent observer > rejects a
   category-omitting call for arity — the error a restored default would remove
   → expected [] to have a length of 1 but got +0
      Tests  1 failed | 13 passed (14)
```
The arity error disappears when the default returns, exactly as the property requires. The neighbouring control — a call that NAMES its category must still be accepted — passes in the same run, so the check objects to the omission and not to calling the helper. STRENGTH: entailed.

**b2 is retained as complementary evidence**, and it is the half that speaks for the SHIPPED compiler. The contract check runs on `typescript-classic` (the repo's 5.9.3 alias, already used by the S1-1 oracle) because the shipped `typescript` 7.0.2 is the native port; b2 strips the argument at a real call site and reads `packages/db/src/auth-risk.ts(95,51): error TS2554: Expected 1 arguments, but got 0.` out of `pnpm exec tsc` (`r1-64-mutant-b2-strip-call-site-argument.log`; line 91→95 is my expanded comment). Contract check and call-site mutant are complementary, not alternatives. STRENGTH: entailed.

The trap carries an append-only **CORRECTION** (`.hermes/TOOLING-TRAPS.md`, last entry) restating the rule: *before writing "X cannot be pinned", name the LAYER — runtime, type, or build — and check the other two.* The round-0 entry is left standing, as an append-only file requires.

### R2 — both halves of the typecheck identity now carry the compiler, and both are ×3

The round-0 gate was invoked as `pnpm --dir dialectical-engine run typecheck`, a package-script name the emitter does not recognise, so it recorded no compiler identity; the baseline was hand-written with no tree and no clean-state; and only one final-head run existed against a stated ×3. All three are repaired.

Both halves are now emitted by `gate-run.sh` v3 with the **tool** named — `pnpm exec tsc --noEmit -p tsconfig.json`, which reproduces the package script (`"typecheck": "tsc --noEmit"`, run from the engine dir where it resolves `./tsconfig.json`) while putting the literal `tsc` where the emitter can see it.

| Half | Records | commit / tree | compiler recorded |
|---|---|---|---|
| Base, untouched | `baseline/r1-base-typecheck-run{1,2,3}.log` ×3 | `80559019…` / `2ed299a5…` | `typescript@7.0.2`, entry sha256 `2219f428…`, `Version 7.0.2` |
| Final head | `r1-53-gate-typecheck-run{1,2,3}.log` ×3 | `4e5f9327…` / `04b40920…` | `typescript@7.0.2`, entry sha256 `2219f428…`, `Version 7.0.2` |

**Same compiler binary on both halves** — identical entry-point sha256, which is what round 0 could not show. All six extracts, taken from between the emitter's `<<<OUTPUT` markers by the same command, are 8 lines and hash to `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. Lockfile hashes distinguish the halves correctly: base `203df4b7…`, head `cdd1a10e…`. Every record reports empty porcelain before and after and `CLEAN-STATE: unchanged`. STRENGTH: entailed.

**Method disclosure, because it deserves the reviewer's eye.** There is no untouched base checkout I may measure in: the main checkout is `dev` (forbidden to me, and its tree is dirty with mission files), and the worker contract §7 forbids me creating a worktree. I therefore took the baseline **inside my own lane worktree**, temporarily: `git checkout --detach 80559019` → `pnpm install --frozen-lockfile` (so the installed tree matches the base lockfile rather than the head's) → three gates → `git checkout lane/dev-health` → re-install. Restoration ran in the same shell invocation under an EXIT trap and is verified: branch `lane/dev-health`, HEAD `4e5f9327`, porcelain empty. No branch pointer moved and no worktree was created or removed. I read §7's "touch a branch or worktree" as forbidding creating, moving or destroying them, not a temporary detached checkout of my own lane that is returned to its branch — **if that reading is wrong, say so and I will take the baseline through the orchestrator instead.** STRENGTH: entailed for what was done and for the restoration; the contract reading is my judgment.

### N2 — the ordering comment corrected

`packages/db/src/auth-risk.ts`: the vocabulary comment claimed the constants are "listed in the order the stages run". They are not — reading a stored row decrypts and parses its context before the evaluator is called at all, so `context-decrypt` and `context-parse` can precede every other member on that path. The comment now says the list is a vocabulary, not an execution order, and scopes the argument-then-row order to the one function where it holds. The getter's comment no longer says "three constants". `grep -n 'three constants'` over the file returns nothing. STRENGTH: entailed.

### N1 — not mine

`retentionMs` validated inside the per-signal loop is ticketed as F-AUTH-RISK-RETENTION-LOOP. Untouched, as instructed.

### A1 / A2 — the packet's corrections, applied

A1: every acceptance gate this round is emitted by `gate-run.sh` with the tool named, never a package script and never a hand-rolled redirect. A2: the comparator is scoped to the final-round prefix `r1-`, and **provisioning is reported separately by name**: `logs/dev-health/01-provision.log` ends `PROVISIONED OK commit=80559019e68932fd16528fc82e9ba174b952e0cf`, which equals the base commit — correct for a provisioning record, and the reason the whole-directory run in round 0 necessarily flagged it. STRENGTH: entailed.

**One finding of my own from this round (S1-adjacent, non-blocking):** `stamp-check.sh` v3 dropped v2's `case "$f" in *stamp-check*) continue` skip, so writing the comparator's output into the directory it is about to glob makes it audit its own output file — I got `NO-STAMP … r1-90-stamp-check.log`, `records compared: 21 · failures: 1`, purely from the redirect. Re-run with the output at `90-r1-stamp-check.log` (outside the `r1-` prefix): 20 records, 0 failures. Worth either restoring the skip or documenting that the comparator's output must not live under the scanned prefix. STRENGTH: entailed (both runs).

## Gates

Rework-round-1 records, taken after the round's only commit. Three runs each, worst run is the verdict. **Every acceptance gate is emitted by `tools/gate-run.sh` v3 with the TOOL named** (`pnpm exec vitest run …`, `pnpm exec tsc --noEmit -p tsconfig.json`) — commit and tree of the measured checkout, a PROVISIONING block (node, pnpm, lockfile hash, generated-contract manifest hash, and the resolved vitest/tsc entry point with its sha256 and version), porcelain BEFORE, the exact unpiped command, raw output between `<<<OUTPUT` markers, the command's own exit, porcelain AFTER, and a clean-state verdict. All fifteen records stamp `commit=4e5f93278809c42f098468623227a0918e9db91e tree=04b40920737700d8119597b2f131d77e76306261` and all report `CLEAN-STATE: unchanged across the run`.

| Gate | Run 1 | Run 2 | Run 3 | Verdict (worst) | Record |
|---|---|---|---|---|---|
| `tests/unit/s1-1-depth-contract.test.ts` (whole file) | EXIT=1 · 1 failed \| 1009 passed (1010) | EXIT=1 · 1 failed \| 1009 passed (1010) | EXIT=1 · 1 failed \| 1009 passed (1010) | **1 failed / 1010, the failure inherited** | `r1-50-gate-s1-1-depth-contract-run{1,2,3}.log` |
| `tests/unit/p2-auth-risk.test.ts` | EXIT=0 · 14 passed (14) | EXIT=0 · 14 passed (14) | EXIT=0 · 14 passed (14) | **14/14 green** (12 + the two R1 rows) | `r1-51-gate-p2-auth-risk-run{1,2,3}.log` |
| runner smoke `tests/unit/env01-runner-policy.test.ts` | EXIT=0 · 1 passed (1) | EXIT=0 · 1 passed (1) | EXIT=0 · 1 passed (1) | **1/1 green** | `r1-52-gate-runner-smoke-env01-run{1,2,3}.log` |
| `tsc --noEmit` identity vs base | EXIT=1, 8 diagnostics | EXIT=1, 8 diagnostics | EXIT=1, 8 diagnostics | **IDENTICAL to the untouched base, same compiler** | `r1-53-gate-typecheck-run{1,2,3}.log` + `baseline/r1-base-typecheck-run{1,2,3}.log` |
| `pnpm install --frozen-lockfile` | EXIT=0 | EXIT=0 | EXIT=0 | **exit 0 at the tip** | `r1-54-gate-frozen-lockfile-run{1,2,3}.log` |

**The one red row on s1-1 is inherited and named.** `S1-1 · the architecture audit recognizes the ruled exports and edges (J10) > reports no T1-owned architecture or source-rule violation`, at `tests/unit/s1-1-depth-contract.test.ts:2146`, failing `ENOENT: no such file or directory, open '…/.worktrees/lane-dev-health/dialectical-engine/web/package.json'`. It is the same row that failed at the untouched base tip in RED-1 (there at :2129 — the +17 line shift is my diff), and `web/` exists as a directory in this worktree while `web/package.json` does not. It predates me and is unrelated to all three tickets. STRENGTH: entailed (present in the base-tip transcript before any edit of mine). The corpus row that WAS red at the base is green in all three runs.

**The typecheck gate is an identity across six records — three at the base, three at the head — compared as a hash.** Every extract is taken from BETWEEN the emitter's `<<<OUTPUT`/`OUTPUT>>>` markers by the same command (`grep '): error TS'`), so no prose in a record can reach the extractor:
```
r1-base-typecheck-run1     lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
r1-base-typecheck-run2     lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
r1-base-typecheck-run3     lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
r1-53-gate-typecheck-run1  lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
r1-53-gate-typecheck-run2  lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
r1-53-gate-typecheck-run3  lines=8 sha256=50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120
```
Extracts under `logs/dev-health/extracts/`. All 8 are the inherited `tests/unit/s14-ui.test.ts` lines; my new files add zero diagnostics. Both halves record the same compiler entry sha256 `2219f428…` (typescript@7.0.2), which is what makes the equal text mean equal compilers rather than merely equal strings. STRENGTH: entailed.

## Stamp check

Scoped to the final-round prefix per A2, run with `stamp-check.sh` v3 at the final tip. Output verbatim (`90-r1-stamp-check.log`, exit=0):
```
TIP=4e5f93278809c42f098468623227a0918e9db91e  (resolved with git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-dev-health rev-parse HEAD)
records compared: 20 · failures: 0
OK: every record stamps the filed tip
```
20 = 15 gate records + 5 mutant records, every one carrying a complete newest anchored emitter block at the filed tip. **Provisioning is reported separately by name, as A2 requires:** `logs/dev-health/01-provision.log` ends `PROVISIONED OK commit=80559019e68932fd16528fc82e9ba174b952e0cf`, and `git rev-parse 80559019…` resolves to that same commit — a provisioning record correctly binds the BASE, which is why a whole-directory comparison necessarily called it stale in round 0. The base typecheck baselines live in `baseline/` and are likewise reported by name above, not inside the scoped population. STRENGTH: entailed.

Preserved captures, all named: base-tip RED frames in `logs/dev-health/red/` (01–05) and the untouched typecheck in `logs/dev-health/baseline/`; the two learning probes in `logs/dev-health/probe/`; two superseded passes of gate records in `logs/dev-health/superseded/` — the first taken at `c4af525a` before the second traps commit moved the tip, the second hand-rolled at the right tip but not emitted by `gate-run.sh` (see self-charge 8). The round-0 `40`–`44` gate records and `30`–`34` mutants are ALSO kept in place, superseded by the `r1-` round but not deleted, as are the round-0 `92`/`93` stamp checks and the round-0 hand-written baseline `baseline/00-typecheck-untouched.log`. Nothing measured has been removed.

## Not verified

- **The wider suite was not run.** I ran the three named files only. That the `auth-risk` change affects no other suite is STRENGTH: **consistent-with**, resting on the sweep (nothing outside `auth-risk.ts` and `p2-auth-risk.test.ts` reads the vocabulary) and on the public message being asserted unchanged — not on a full-suite run.
- **The runner's runtime behaviour was not exercised beyond module resolution.** The smoke proves `@debateai/runner` loads, which evaluates `src/index.ts` and therefore its `@debateai/valuation` import; it does not prove any valuation code path runs correctly. STRENGTH: entailed for resolution, undetermined for behaviour.
- **`pnpm install` side effects beyond the lockfile were not audited.** I read the lockfile diff (3 lines) and the porcelain (empty); I did not inspect `node_modules`. STRENGTH: undetermined for anything below the lockfile.
- **The pre-existing `pro01-runner-tree` failure was not diagnosed** — out of contract. See below.
- **I did not confirm that `tests/support/*.ts` is invisible to every consumer**, only that no architecture test greps `tests/support` (`grep -rn 'tests/support' tests/architecture/` → rc=1) and that the oracle's roots exclude `tests/`. STRENGTH: consistent-with.

Added in rework round 1:
- **The R1 contract check does not exercise the shipped compiler.** It runs on `typescript-classic` 5.9.3; the shipped `typescript` 7.0.2 is the native port and does not expose the programmatic API this check needs. That 7.0.2 enforces the same arity rule is evidenced by mutant b2 alone, and b2 is a mutant rather than a standing check — if 7.0.2 ever diverged from 5.9.3 on arity, the standing check would not notice. STRENGTH: entailed for b2's diagnostic; undetermined for future divergence.
- **The base baseline is a fresh measurement, not a recovery.** Codex is right that the compiler identity in force during round 0's measurements cannot be recovered from the filesystem; I did not try. The `r1-base-*` records are new runs taken today at the base commit with the base lockfile installed, and they say so. STRENGTH: entailed.
- **CRLF/Windows path behaviour of the manifest is still unmeasured**, as codex noted; the separator handling is correct by source inspection only. STRENGTH: consistent-with.
- **The neighbouring control in the R1 check proves the probe compiles a valid call, not that every valid call shape compiles.** One control, not a survey. STRENGTH: entailed for the one shape.

## Self-charges

Findings and defects, blocking or not, each with a file and line so it can be ticketed.

1. **WITHDRAWN in rework round 1 — this was my error, not a packet defect.** I charged outcome §5(b) with prescribing a non-discriminating mutant. §5(b) was sound; what was missing was an observer, and I had not looked past the runtime layer for one. Codex r1 (R1) named it. The correction is filed in `## Rework round 1`, in an append-only TOOLING-TRAPS CORRECTION, and in the self-report. **The lesson I am keeping: a mutant that survives every runtime check is evidence that the runtime layer is blind to it, never evidence that nothing can see it.**
2. **TICKET vs TREE mismatch.** `board/F-POISONED-REQUIRED-CATEGORY.md`'s contract names call sites "at :50, :54, :82"; the tree at the base had them at :84, :88, :116 (now :91, :95, :123). The packet's own THE FACTS block was correct, so nothing was mis-cut, but the ticket line is stale. I never edit the board — reporting it. STRENGTH: entailed.
3. **PRE-EXISTING FAILURE, not mine.** `tests/unit/pro01-runner-tree.test.ts:225` — "stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path" fails with `expected Error: UNEXPECTED_CLIENT_QUERY:SELECT pg_… to match object { code: 'RUN_COST_ENVELOPE_EXHAUSTED' }`. Captured at the UNTOUCHED base tip before any edit (`baseline/02-p2-and-runner-untouched.log`, `Tests 1 failed | 16 passed (17)`), which is why I named `env01-runner-policy.test.ts` as the runner smoke instead. Deserves a ticket; out of my contract to diagnose. STRENGTH: entailed for the failure and its date; undetermined for its cause.
4. **DESIGN FINDING, out of contract, not fixed.** `packages/db/src/auth-risk.ts:113` validates `retentionMs` — a policy argument — from INSIDE the per-signal condition. Two consequences: a bad `retentionMs` is now categorised `signal-shape` although it is a policy defect, and it is never checked at all when `signals` is empty. Moving it beside the `:91` policy check would change when it fires, which is beyond "poisoned() and its call sites only". Named, not touched. STRENGTH: entailed (read from the file).
5. **NEARLY GOT WRONG.** My first typecheck identity gate reported `VERDICT: DIFFERENT` — 9 lines against 8. The cause was my own header comment containing the literal `error TS`, which the extractor's grep matched. On an identity gate that reads exactly like "your diff changed the diagnostics", and the tempting next move is to go hunting in the code. Diffing the two extracts named the cause in one look. Filed in TOOLING-TRAPS and re-taken with an uncontaminated extractor. Cost: ~2 minutes plus a full re-take of every gate record, because the traps append had to be committed before records (D64 ADDENDUM 5).
6. **SKILL FLOOR SHORTFALL, declared.** I did not load `superpowers:using-superpowers`, which the router's §1 asks of every seat. Stated on line 2 rather than left to a transcript grep.
8. **PACKET DEFECT, and the most expensive one I found.** The packet names `tools/mutate.sh` and `tools/stamp-check.sh` by absolute path but never names `tools/gate-run.sh`, and **D45 rules that every acceptance gate is run through it** (`DECISIONS.md:1755`). I hand-rolled thirteen gate records first, then found D45 while writing the self-report and re-took all thirteen through the tool. The irony prices it: my hand-rolled header is exactly what contaminated the identity extractor in charge 5, and `gate-run.sh`'s `<<<OUTPUT` markers make that class of mistake impossible. Cost: ~4 minutes of re-runs, and it would have been zero if the packet's `skills`/tools line had named the emitter the mission already rules mandatory. **Upgrade: the packet linter should refuse any packet that asks for gate records without naming `gate-run.sh`.** STRENGTH: entailed (D45 read from DECISIONS.md at write time; both record passes preserved).
9. **ROUND-1 METHOD, flagged for the reviewer rather than buried.** The base typecheck baseline required an untouched base tree; dev is forbidden to me and §7 forbids creating a worktree, so I detached my own lane worktree to the base, measured, and restored it under an EXIT trap. Verified restored: branch `lane/dev-health`, HEAD `4e5f9327`, porcelain empty, head lockfile re-installed. If that reading of §7 is wrong, the fix is for the orchestrator to take the baseline; the records themselves stand either way. STRENGTH: entailed for the actions and restoration; the contract reading is judgment.
10. **`stamp-check.sh` v3 audits its own output** if the comparator writes into the prefix it globs (v2's `*stamp-check*` skip is gone). Cost me one confusing `NO-STAMP` line. Named in `## Rework round 1`; not mine to fix.
11. **Two TOOLING-TRAPS entries appended in round 0, plus one CORRECTION in round 1** (both committed before any gate record): the declaration-vs-call-site mutation trap, and the self-contaminated identity-gate extractor.

Contract compliance: the seven touched paths are `tests/unit/s1-1-depth-contract.test.ts`, `tests/unit/p2-auth-risk.test.ts`, `tests/support/shippedCorpusManifest.ts` (new), `tests/support/shipped-corpus.manifest.txt` (new), `apps/runner/package.json`, `pnpm-lock.yaml` (tool-generated), `packages/db/src/auth-risk.ts`, plus `.hermes/TOOLING-TRAPS.md` (append-only) — every one in `allowed`. No push, no merge, no board or DECISIONS edit, no credential value, no change to the oracle's roots/exclusions/extensions, no change to any public error message, no other dependency change, no hand-edit of the lockfile. `tests/support/depthOracle.ts`, `apps/runner/src/index.ts`, `packages/valuation/` and every other test are unmodified. STRENGTH: entailed (`git diff --name-only 80559019..HEAD`).

WORK: ready — rework round 1 filed on `lane/dev-health` at `4e5f9327`; R1 and R2 addressed, N2 fixed, my round-0 impossibility claim withdrawn and corrected in the trap and both filings. Round 0 summary follows: three tickets landed: the corpus row now names its files instead of counting them (233 entries, the one added path derived from git and explained), the runner declares `@debateai/valuation` with a three-line tool-generated lockfile diff, and `poisoned()` requires its category with all five call sites named; gates are green except the one inherited architecture-audit ENOENT row, typecheck is byte-identical to the untouched lane, and the packet's own mutant (b) is reported as surviving rather than dressed up as a pass.
