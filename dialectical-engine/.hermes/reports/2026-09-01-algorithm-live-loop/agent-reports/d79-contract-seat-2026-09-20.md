SKILLS LOADED: superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging

# Architecture-contract and non-UI unit cluster — fix report

Seat: fixer (Claude Opus 5). Worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16`, engine root `dialectical-engine/`.
Base `5c0a42cd`, branch `mission/2026-09-16-algorithm-live-loop-continuation`, tip `b89b4528`. Node 26.8.2, vitest 5.0.1.

## Status

**4 of 9 fixed. 5 remain red, deliberately — none of them is mine to close.**

- Baseline at `5c0a42cd`, my eight files: **9 failed | 39 passed (48)** — name-identical to `four-count-53a09658-failures.txt`.
- Final tip `b89b4528`, same eight files: **5 failed | 43 passed (48)**, identical across three runs.
- **No product code was changed.** All four fixes are class-(2) test re-points, each proved with a citation, and each verified by a mutant that breaks the *product* and turns the *same* assertion red.
- Three of the five remaining are the other seat's (`apps/ui/**`); one is V's ticketed debt (F31); one is a real defect whose fix site is outside my allowed writes.

The headline, because it is easy to misread the count: **four contract tests were red while the safeguards they protect were fully in force.** A least-privilege refactor moved three safeguards into SECURITY DEFINER database capabilities and one register read behind a loader. The tests kept grepping for the SQL literals that the refactor deliberately deleted. One green sibling test (`s6-content-encryption-contract.test.ts:261-265`) already *required* the new form and *forbade* the old — so the suite was simultaneously asserting both sides of the same move.

## Commits

| SHA | Subject | Files |
|---|---|---|
| `119e37fd` | `test(contract): re-point s7/s13/s10 probes at the capabilities that replaced the inline SQL` | `tests/architecture/s7-authorization-contract.test.ts`, `tests/architecture/s13-contract.test.ts`, `tests/architecture/s10-carrier-erasure-red.test.ts` |
| `b89b4528` | `test(contract): pin the DR-128 loud read at its real site and prove the row reaches the runner` | `tests/architecture/s04-contract.test.ts` |

Staged by explicit path, `git status --short` checked before each. The other seat's `apps/ui/**` edits (`DebateCanvas.tsx`, `DebateMap.tsx`, `SupportWidget.tsx`) appeared in the tree mid-session and were never staged.

## The nine failures

| file:line | Failing frame (before) | Class | What I did / why not |
|---|---|---|---|
| `s04-contract.test.ts:36` | `expected 'import "@debateai/obs-capture/install…' to contain 'readClaimTypeCompositionMap'` | **(2)** deliberate move | **FIXED.** `2d1f86b8` moved the DR-128 loud read out of `main.ts` into `readDevelopmentRunnerPolicy` (`apps/runner/src/dev-runner-policy.ts:184`), which `main.ts` calls. Cited: DECISIONS.md T14a-G2. Re-pointed at the loader **and** added a pin that the row reaches the runner (`compositionRow: policy.compositionRow`) — which nothing asserted before. Restoring a direct call would add a second query, not a second safeguard. |
| `s7-authorization-contract.test.ts:98` | `expected -1 to be greater than -1` | **(2)** deliberate move | **FIXED.** See the dedicated paragraph below. Also de-vacuumed two assertions in the same file that were passing only because `indexOf` of a retired literal returns `-1`. |
| `s13-contract.test.ts:69` | `expected 402 to be less than -1` | **(2)** deliberate move | **FIXED.** Same lock move, in `#evaluateCandidate` and in `recordQuestionAndMatch`. The rest of the ordering chain (prepare → transaction → lock → ownership → fetch → decrypt → match) was already intact in the product; only the lock probe needed re-pointing. |
| `s10-carrier-erasure-red.test.ts:94` | `expected false to be true` | **(2)** deliberate move | **FIXED.** The completed-tombstone filter moved into `core.run_private_content_is_live`. Cited: DEV-11E item (3). The test was asserting that `liveness`/`memory` name `serve.private_run_erasure_tombstone` directly — which the restricted runtime principal is now **denied** (42501). Re-pointed at the predicate, pinned its `NOT EXISTS` over the tombstone on the function body, and pinned the direct carrier read **absent**. |
| `scaffold.test.ts:29` | `expected [ …(3) ] to deeply equal []` — `apps/{api,runner,scheduler} -> obs-capture is not a declared edge` | **(3)** product gap, owner's ticket | **NOT FIXED, deliberately.** DECISIONS.md:3571: *"The three `obs-capture` rows stay red, as F31's. … they are V's ticketed debt (F31), pinned by V's own test, and were not touched."* D15 ADDENDUM: *"F31 is the ticket that owns the architecture half's three violations."* The fix site (`tools/orphan-audit/src/index.ts`) is also outside my allowed writes. Reported, not built, not retired. |
| `text-control-bytes.test.ts:22` | `expected [ { …(3) }, { …(3) } ] to deeply equal []` | **(1)** real defect, **fix site blocked** | **NOT FIXED — needs your permission.** Two *tracked* files carry raw control bytes. The guard is correct and should stay red until they are fixed. Both paths (`.claude/**`, `.hermes/**`) are outside my allowed writes. Exact diagnosis below. |
| `s8-publication-contract.test.ts:169` | `expected 'import { notFound } from "next/naviga…' to contain 'PublicAnswerDisclosure'` | **(1)** real defect | **STOPPED — `apps/ui/**` is the other seat's.** `apps/ui/components/PublicAnswerDisclosure.tsx` **exists** but is not imported by `app/public/debate/[id]/page.tsx` or `PublicDebatePageClient.tsx`. The public page composes `PublicDebateOverview`, `PublicHonestyDrawer`, `SupportWidget` — not the disclosure. This one is worth escalating (see below). |
| `s14-contract.test.ts:14` | `expected 'export type DebateSummary = {…' to contain '@debateai/contract'` | **(1)** real defect | **STOPPED — `apps/ui/**`.** `apps/ui/lib/types.ts` is still a hand-written V2 wire mirror (`export type DebateSummary = { … }`) instead of re-exporting the generated contract types. |
| `s14-contract.test.ts:52` | `expected 'import type { InvestigationAction, Ma…' not to contain 'localeCompare'` | **(1)** real defect | **STOPPED — `apps/ui/**`.** `apps/ui/lib/recommendation.ts:31-32` sorts with `localeCompare`. The sibling half of the same assertion (`packages/register/src/index.ts`, which *is* mine) is already clean — I verified it. |

## s7 specifically: the lock-ordering safeguard was moved deliberately, not lost

**It was not lost. It was moved, for a stated reason, and it is still enforced — more strictly than before.**

The commit is **`2d1f86b8`** ("chore: checkpoint all local mission artifacts and in-flight tree", 2026-08-28), which in the same change deleted the inline `ORDER BY run_id FOR UPDATE` from `packages/memory/src/index.ts` and added `core.lock_owned_live_runs` to `migrations/0040_account_erasure.sql`.

The reason is recorded in `docs/missions/2026-08-17-accounts-privacy-security/reviews/DEV-11E-grok-review-packet.md`, item (4):

> "Memory persistence then reached its canonical run lock and failed because the runtime principal intentionally has no `UPDATE` privilege on `core.run`. `core.lock_owned_live_runs(uuid[],uuid,text)` is a bounded, deduplicated, mutually-exclusive owner-scope, `SECURITY DEFINER` capability. It locks only currently owned/live runs and grants only EXECUTE to `debateai_runtime`; runtime receives no table-write privilege. All MemoryRepository run-lock call sites use this capability and retain post-lock ownership/live revalidation."

So the inline form could not survive: a `SELECT … FOR UPDATE` on `core.run` needs an UPDATE privilege the runtime role is deliberately denied. The capability's body still ends exactly as the old inline SQL did:

```sql
  ORDER BY run.run_id
  FOR UPDATE;
```

and the caller still sorts the two run ids before handing them over (`[input.key.runId, selected.priorRunId].sort()`). Both halves of the fixed lock order are intact, so two processes still cannot deadlock. The capability is in fact *stronger* than the line it replaced: it folds the ownership predicate and the erasure-liveness predicate into the same locking statement, and it caps the batch at 128 deduplicated ids.

The decisive tell that this was a ruled move rather than a regression: **`tests/architecture/s6-content-encryption-contract.test.ts:261-265` is green and asserts the opposite of what s7 asserted** — it *requires* `FROM core.lock_owned_live_runs($1::uuid[],$2::uuid,$3::text)` and *forbids* the old inline `ORDER BY run_id FOR UPDATE` by regex. The suite has been holding both positions at once since August.

Two further findings while I was in there, both now closed: the s7 probe at `:73` (`recordQuery`) and the one in the `evaluateCandidate` block were **vacuously green** — `indexOf` of the retired literal returns `-1`, and `-1 < any index` passes. They asserted nothing. They are now real indices with explicit `> -1` guards, and mutant M4 below confirms they bite.

## Mutant matrix

One mutant per behaviour fixed. In every case the **product** was broken, the **same** assertion went red, and the file was restored **byte-identical** (sha256 verified against a pre-mutant baseline; `git status` clean on all product paths afterwards).

| # | Behaviour | Mutation (product) | Result | Restored |
|---|---|---|---|---|
| M1 | DR-128 row reaches the runner | `apps/runner/src/main.ts`: `policy.compositionRow` → `policy.MUTANT_compositionRow` | s04 RED — `expected … to contain 'compositionRow: policy.compositionRow'` | sha256 `e17733a5…` ✓ |
| M2 | Fixed lock **order** (deadlock safety) | `migrations/0040_account_erasure.sql`: delete `ORDER BY run.run_id` from `core.lock_owned_live_runs` | s7 RED — `expected 'CREATE OR REPLACE FUNCTION core.lock_…' to match /ORDER BY run\.run_id\s+FOR UPDATE/` | sha256 `17b45ec9…` ✓ |
| M3 | Completed-tombstone filter | `migrations/0040_account_erasure.sql`: delete the `NOT EXISTS … serve.private_run_erasure_tombstone` clause from `core.run_private_content_is_live` | s10 RED — `expected … to match /NOT EXISTS \(\s*SELECT 1 FROM serve\.private_run_erasure_tombstone/` | sha256 `17b45ec9…` ✓ |
| M4 | Ordered lock in `#evaluateCandidate` | `packages/memory/src/index.ts`: replace the capability call with `SELECT run_id FROM core.run WHERE run_id=$1` | s13 RED (`expected 402 to be less than -1`) **and** s7 RED (`expected -1 to be greater than 402`) — the latter is the de-vacuumed assertion | sha256 `64fe125b…` ✓ |

M2 is the one that matters most: it proves the deadlock safeguard is now genuinely guarded by the test that was nominally protecting it, which it had not been since August.

## Three runs at the final tip (`b89b4528`)

Same eight files, three consecutive runs:

| Run | Result | Remaining reds |
|---|---|---|
| 1 | `Tests  5 failed | 43 passed (48)` | scaffold, text-control-bytes, s14 ×2, s8 |
| 2 | `Tests  5 failed | 43 passed (48)` | scaffold, text-control-bytes, s14 ×2, s8 |
| 3 | `Tests  5 failed | 43 passed (48)` | scaffold, text-control-bytes, s14 ×2, s8 |

Identical and deterministic; worst run = best run. The five remaining are exactly the five classified as not-mine or not-closable here.

Because no product code changed, no other suite could be affected — but I ran the non-integration suites that cover the same symbols anyway (`grep -rl` over `lock_owned_live_runs`, `run_private_content_is_live`, `readClaimTypeCompositionMap`, `compositionRow`): **s6-content-encryption-contract, dev-runner-provider-set, register-s04, judgement-s04, evaluator-addon, load01-run-projection, pro01-runner-tree, xrev01-node-review — 8 files, 66/66 passed.** The integration suites in that grep start a database and belong to the third seat; I did not run them.

## Typechecks

| Command | Exit code |
|---|---|
| `pnpm run typecheck` | **0** |
| `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | **0** |

Both clean on the first run; no re-run needed, and nothing to attribute to the other seat.

## What still needs a decision from the owner

Five things. I have put them in the order I would deal with them.

**1. A public page is missing its disclosure, and the component for it already exists.** The file `apps/ui/components/PublicAnswerDisclosure.tsx` is written and ready, but the public debate page never puts it on screen. So a debate you publish is shown to the world without the disclosure text that was built to accompany it. The support articles already tell readers that disclosure is there. This is the one item on my list with a real-world consequence today, and it is a small fix — but the file belongs to the website seat, so I did not touch it. Worth telling that seat explicitly rather than leaving it in the queue.

**2. Two saved files contain invisible junk characters, and I need your permission to clean them.** A hygiene check finds two committed files with stray control characters: a bundled third-party diagram library under `.claude/skills/…/mermaid.min.js`, and an old recorded probe file under `.hermes/reports/debate-tiers/probes/`. In both cases the character should have been written as an escape (the neighbouring lines in the same files do exactly that) and a raw byte got saved instead. The repair is tiny and changes nothing about how either file behaves. I did not do it because those two folders are outside what this seat is allowed to write. Say the word and it is a two-line change.

**3. The three "obs-capture" architecture warnings are yours, and they are still open.** Your own records call these "V's ticketed debt (F31)" and say they were deliberately left alone. The situation is: the three background services genuinely use the observability component, but the architecture's list of permitted connections was never updated to say they may. So either the list should be updated to match reality, or the connection is not wanted and the code should change. That is an architecture call, not a test fix, so I left it exactly as your records say to.

**4. The website still carries a hand-written copy of the data shapes.** The site keeps its own hand-maintained description of what a debate looks like, instead of using the single generated one that the rest of the system shares. Two copies of the same thing will drift apart eventually. Also, one list on the site is sorted in a way that can come out in a different order on different machines. Both are in the website seat's files.

**5. A wider point about these tests, which I think matters more than the count.** Four of the nine were red for the same reason: back in August, a security change moved several safeguards from being written out longhand in the application code to being enforced inside the database itself — because the database user is deliberately not powerful enough to do it the old way. The safeguards never stopped working. The tests were simply still looking in the old place. One test had even been updated to the new arrangement, so the suite was quietly contradicting itself for weeks, and two checks had rotted into a state where they passed no matter what the code did. That happened because the change arrived inside a large "checkpoint" commit rather than a focused one. If you want one process change out of this, it is that a commit which moves a safeguard should not be allowed to be a bulk checkpoint — the tests that guard it need to move in the same commit, or they quietly stop guarding anything.

---

# Fix round 2

Coordinator granted write permission for the control-byte pair, with bounds: escape the bytes (do **not** strip them), prove the parsed values are unchanged rather than assuming it, confirm each byte really sits inside a string literal before touching it, record the vendoring note, and **do not widen the guard**. All bounds observed.

## Status

**Tip `6947fab9`. Seven of my nine now pass; I own five of those seven.**

| | Round 1 | Round 2 |
|---|---|---|
| My eight files | 5 failed / 43 passed (48) | **2 failed / 46 passed (48)** |

- **Closed by me: 5** — s04, s07, s10, s13 (round 1) and `text-control-bytes` (round 2).
- **Closed by the website seat: 2** — s8 and s14:52. **Important caveat: those two are green from that seat's UNCOMMITTED working-tree edits** (`apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`, `apps/ui/lib/recommendation.ts`), not from a landed commit. If that work is reverted or reworked, both rows return. I never staged them.
- **Still red: 2** — `scaffold` (deliberate, F31) and `s14:14` (apps/ui, that seat's).

## Commit

| SHA | Subject | Files |
|---|---|---|
| `6947fab9` | `fix(hygiene): escape the two raw control bytes HYG-01 found, keeping both parsed values` | the probe `.test.ts`, `mermaid.min.js`, `make-pages.py` |

Three files, exactly the extension granted. `git status --short` checked before staging; the website seat's three in-flight `apps/ui` files were present in the tree throughout and were never staged.

## What changed, and the literal-context check that preceded it

Both bytes were asserted to sit **inside a double-quoted string literal** before any write — left context, right context, and "exactly one such byte in the file". Neither replacement was made blind.

| File | Offset | Was | Now | Literal context, verified |
|---|---|---|---|---|
| `.hermes/…/REV-S01-p1-security--probe-a-contract-edge.test.ts` | 2181 | raw `NUL` | `\0` | `["nul-suffixed", "free\0"],` — one line above `["newline-suffixed", "free\n"]`, which already escaped |
| `.claude/…/graph-png/mermaid.min.js` | 1101060 | raw `0x01` | `\x01` | `_ge="\x01"` — the same minified statement already escapes two NULs as `Cst="\0",zm="\0"` |

## Equivalence proof (16 checks, all passing)

Run against the pre-fix bytes recovered from git, not against memory of them:

| Check | Probe | Bundle |
|---|---|---|
| Parsed value before | `U+0066 U+0072 U+0065 U+0065 U+0000` | `U+0001` |
| Parsed value after | `U+0066 U+0072 U+0065 U+0065 U+0000` | `U+0001` |
| **Parsed value unchanged** | PASS | PASS |
| **Still a NUL-suffixed string** (coordinator's asked-for assertion) | PASS — last code unit is `U+0000` | n/a |
| Source no longer carries the raw byte | PASS | PASS |
| Source now carries the escape | PASS (`"free\0"`) | PASS (`"\x01"`) |
| Already-escaped siblings untouched | PASS (the `\n` row) | PASS (`Cst`, `zm`) |
| **Rest of file byte-identical** once the byte/escape is removed | PASS | PASS |
| Parses after the change | n/a (typechecks below) | PASS — `node --check` on 3.5 MB, before **and** after |

To state the assertion the coordinator asked for explicitly: **the probe's literal still evaluates to a NUL-suffixed string.** `"free\0"` parses to the five code units `f r e e U+0000`, byte-for-byte the value the raw NUL produced; the probe's meaning as test data is untouched.

## Mutant (round 2)

| # | Behaviour | Mutation | Result | Restored |
|---|---|---|---|---|
| M5 | The guard still catches a raw control byte | Put the raw NUL back in the probe (escape → raw) | HYG-01 RED, **reproducing the original frame exactly**: `"byte": 0, "offset": 2181,` same path | `REPOSITORY_TEXT_CONTROL_BYTES=0`, all 16 equivalence checks re-run and passing |

M5 is the proof that I fixed the **data** and not the **guard**: the guard is byte-unchanged and bites exactly as before. (Worth noting: when I first tried to apply this mutant from a shell command, the harness refused it — "command contains control characters that would be hidden in the approval dialog". The same reasoning as HYG-01's, enforced one layer out.)

**The guard was not widened.** Excluding vendored files was considered and rejected, for the coordinator's reason: the value of HYG-01 is that *nothing* in the tree carries an invisible byte, and an exclusion is precisely the door someone would later hide one behind. Escaping keeps both the meaning and the guarantee.

## Vendoring note

`mermaid.min.js` is **hand-vendored** beside the script — there is no fetch step to repair. `make-pages.py:10` copies the local file verbatim into the output directory, so the note recording the escape, its date (2026-09-19), its reason, and the instruction *"if a future re-download reintroduces the raw byte, re-apply the same escape, do not exclude the file"* goes at that copy site. `python3 -c "ast.parse(...)"` confirms the file still parses.

## Three runs at the round-2 tip (`6947fab9`)

| Run | Result | Remaining reds |
|---|---|---|
| 1 | `Tests  2 failed | 46 passed (48)` | scaffold, s14:14 |
| 2 | `Tests  2 failed | 46 passed (48)` | scaffold, s14:14 |
| 3 | `Tests  2 failed | 46 passed (48)` | scaffold, s14:14 |

Identical and deterministic; worst run = best run.

## Typechecks (round 2)

| Command | Exit code |
|---|---|
| `pnpm run typecheck` | **0** |
| `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | **0** |

Both clean first time; nothing to attribute to the other seat.

## Decisions carried into round 2

- **`scaffold` is deliberately left red.** It is V's ticketed debt **F31**. DECISIONS.md:3571 — *"The three `obs-capture` rows stay red, as F31's. … they are V's ticketed debt (F31), pinned by V's own test, and were not touched."* D15 ADDENDUM names F31 as the ticket that owns the architecture audit's three violations and rules that until it lands the verdict reads as "the three known, plus anything new". The fix site (`tools/orphan-audit/src/index.ts`) is outside this seat's writes in any case, and whether the three services *may* depend on the observability component is an architecture call for the owner, not a test fix. One row is red on purpose, and this is why.
- **s8 and s14 are the website seat's**, handed over with the diagnosis; nothing further owed from me. s14:14 (`apps/ui/lib/types.ts` still hand-mirroring the contract types) is the one of those three still outstanding.
- **The control-byte pair is closed**, within the exact bounds granted.

## The process note, stated precisely for the ticket

On 2026-08-28, commit **`2d1f86b8`** — *"chore: checkpoint all local mission artifacts and in-flight tree"*, a bulk checkpoint spanning migrations 0040–0049 plus "the in-flight test and app-code state across missions" — moved three safeguards out of application code and into the database, correctly and for a stated reason (DEV-11E items 3 and 4: the restricted `debateai_runtime` principal is deliberately denied `UPDATE` on `core.run` and `SELECT` on the private erasure carriers, so the inline forms could not survive): the **fixed-order run lock** `ORDER BY run_id FOR UPDATE` became the `SECURITY DEFINER` capability `core.lock_owned_live_runs`, the **completed-tombstone filter** on `serve.private_run_erasure_tombstone` became the `SECURITY DEFINER` predicate `core.run_private_content_is_live`, and in the same commit the **DR-128 loud register read** `readClaimTypeCompositionMap` moved out of `apps/runner/src/main.ts` into the `readDevelopmentRunnerPolicy` loader that `main.ts` calls. Four contract tests that grep the shipped source for those literals should have moved in that same commit and did not — `tests/architecture/s7-authorization-contract.test.ts:98`, `tests/architecture/s13-contract.test.ts:69`, `tests/architecture/s10-carrier-erasure-red.test.ts:94` and `tests/architecture/s04-contract.test.ts:36` — while a fifth, `tests/architecture/s6-content-encryption-contract.test.ts:261-265`, *was* updated and now positively **requires** the new call form and **forbids** the old inline `ORDER BY run_id FOR UPDATE` by regex, so for roughly three weeks the suite asserted both sides of the same move and the four stragglers were recorded as owned reds rather than as stale tests. Worse than the four visible reds are the two checks that rotted into passing regardless of the code, because `String.prototype.indexOf` returns `-1` for a literal that no longer exists and `-1` is less than every real index: `s7-authorization-contract.test.ts:73` (`expect(recordQuery.indexOf("ORDER BY run_id FOR UPDATE")).toBeLessThan(recordQuery.indexOf("await allocateSequence(client)"))`) and the `candidateLock` probe in the same file's `evaluateCandidate` block (`expect(candidateLock).toBeLessThan(candidateOwnership)`) were both green while asserting nothing whatsoever about the product — they are now real indices with explicit `> -1` guards, and mutant M4 (replacing the candidate lock with a plain `SELECT`) confirms they bite. The generalisable rule: **a commit that relocates a safeguard must carry the tests that guard it, and an ordering assertion built on `indexOf` must assert `> -1` on every index it compares, or it degrades silently into a tautology the moment its needle moves.**

---

# Fix round 3 — the vacuous-ordering-assertion sweep

The second rule from round 2 names a CLASS, and the two members found in round 1 were found by accident. Per the standing law that a reported finding is a SAMPLE, the whole test tree was swept and every member recorded so the sweep can be re-checked mechanically.

## Status and commit

**Tip `bcb2adb2`.** 12 files × 3 runs: **2 failed | 77 passed (79)**, identical. Both typechecks exit 0.

| SHA | Subject | Files |
|---|---|---|
| `bcb2adb2` | `test(contract): guard every proven vacuous ordering assertion found by the class sweep` | s7-authorization-contract, register-support-publication, s9-dev-token-retirement-contract, sup-06-no-zone-limiter, graceful-shutdown |

Five files, of which **four are outside my original eight**. I read the instruction "then fix them", with only the website seat's files carved out, as extending my writes to test files that are neither that seat's nor the database seat's integration suites. Flagging it explicitly so it can be vetoed.

## Method

`grep -rn "indexOf\|lastIndexOf" tests acceptance` returns 410 matching lines / **449 occurrences across 478 files** — too many to eyeball honestly, and a line grep cannot see a line-wrapped assertion. So: a scan with comments and string/template literals blanked (length- and line-preserving) and balanced-paren extraction of both operands, resolving index-valued identifiers, index-returning local helpers, and inline `indexOf` calls; then hand-classification of every candidate. Scripts are in the scratchpad (`sweep2.cjs`, `classify.cjs`, `recheck.cjs`, `prove-vacuity.mjs`, `prove-vacuity2.mjs`, `prove-bite.mjs`).

**Which operand is dangerous depends on the matcher** — because `-1` is less than every real index but *not* less than itself:

| Matcher | `A=-1, B>=0` | `A=-1, B=-1` | Dangerous operand |
|---|---|---|---|
| `toBeLessThan` | **passes** | fails | **LEFT** |
| `toBeGreaterThan` | fails | fails | **RIGHT** (`A>=0, B=-1` passes) |
| `toBeLessThanOrEqual` | **passes** | **passes** | both |
| `toBeGreaterThanOrEqual` | — | **passes**; `(-1)` always true | both |

## The three counts

| Class | Count |
|---|---|
| **GUARDED** | **123** — of which 59 are the `> -1` / `>= 0` guard statements themselves and 64 are comparisons whose dangerous operand is guarded (directly, transitively along a chain, or by `toContain`) |
| **VACUOUS-CAPABLE** | **10 proven** (23 suspected, 13 withdrawn on evidence) |
| **NOT-AN-ORDERING-ASSERTION** | **3** candidates where the index operand sits on the safe side, plus the ~300 raw `indexOf` occurrences that never reach a comparison at all |
| | **149 candidates** total (`123 + 3 + 23`) |

## The members — every VACUOUS-CAPABLE hit, proven

Proof method: make the needle the **test** searches for unfindable (the product is never touched), run that file, and record that it **still goes green**. File restored, sha256 checked, every time.

| file:line | The assertion | Proof |
|---|---|---|
| `tests/architecture/s7-authorization-contract.test.ts:105` | lease preparation before the write transaction in `recordQuestionAndMatch` | GREEN with needle removed |
| `s7-authorization-contract.test.ts:143` | lease preparation before the transaction in `#evaluateCandidate` | GREEN |
| `s7-authorization-contract.test.ts:163` | lease preparation in `observeAnswerContradiction` | GREEN |
| **`s7-authorization-contract.test.ts:164`** | **ordered run lock in `observeAnswerContradiction`** | **no mutant needed — vacuous live, today** |
| `tests/architecture/register-support-publication.test.ts:193` | production CLI connection opened before the commit timestamp | GREEN |
| `tests/architecture/s9-dev-token-retirement-contract.test.ts:67` | legacy token cleared before the claim call | GREEN |
| `tests/architecture/sup-06-no-zone-limiter.test.ts:55` | `supportPool` declared before the relay-lease pool | GREEN |
| `tests/unit/graceful-shutdown.test.ts:117` | mail closes before the refusal audit | GREEN |
| `tests/unit/graceful-shutdown.test.ts:165` | durable refusal audit before the context hasher | GREEN |
| `tests/unit/graceful-shutdown.test.ts:269` | argon2 pool fails before the primary database closes | GREEN |

**s7:164 is the find of this round.** It needed no mutant because it is already vacuous in the shipped tree: `contradictionLock` probes `"ORDER BY run_id FOR UPDATE"`, the literal `2d1f86b8` retired, so it evaluates to `-1`, and `expect(-1).toBeLessThan(1904)` has passed on every run since August. It is the **third** site of the DEV-11E(4) lock move and the one round 1 missed — rounds 1 and 2 fixed `recordQuestionAndMatch` and `#evaluateCandidate` and never looked at `observeAnswerContradiction`, which takes the same ordered lock through `core.lock_owned_live_runs`. Re-pointed there and guarded, matching its two siblings. This is exactly the payoff of sweeping a class instead of patching its samples.

## Withdrawn on evidence — 13 suspected members that are actually guarded

Listed because an unproved claim is worth nothing, and so is a silently dropped one.

| file:line | Why it is actually safe |
|---|---|
| `v2ui-pages.test.ts:166, 184, 187` | `toContain` on a **superstring** of the needle (`"v3ScoringStatusLabel(input.reason)"` contains `"v3ScoringStatusLabel"`) |
| `s6-content-encryption-contract.test.ts:133, 134` | object-shaped presence check: `expect({prepared: prepareAt >= 0, …}).toEqual({prepared: true, …})` |
| `argon2-worker-pool.test.ts:386` | `expect(dispatchOrder[1]).toBe("hash-audit")` proves the element is present |
| `argon2-worker-pool.test.ts:409`, `obs-agent-01-routing.test.ts:64`, `t15-eval-harness.test.ts:1077`, `run-acceptance.test.ts:419` | a real guard on the adjacent line (the test still fails if the needle vanishes) |
| `consent-s02-style-contract.test.ts:246` | `expect(occurrences(css, MARKER)).toBe(1)` for both markers |
| `s7:144, 145, 146, 147, 165` | chain-protected: breaking the needle makes a **neighbour** fail first |
| `s13-contract.test.ts:87–92` | the loop at `:107` asserts `toBeGreaterThan(-1)` over `finalTransaction` and `candidateTransaction` — guarded, though written *after* the comparisons it protects |

**The `region()` helper at `tests/unit/v2ui-pages.test.ts:30`, which you asked about specifically, GUARDS.** It asserts `startIndex >= 0` and `endIndex > startIndex` before slicing. **Nothing from this class is routed to the website seat.**

## Routed to you

| file:line | Whose | Status |
|---|---|---|
| `tests/integration/dev-tls-readiness.test.ts:118` | database seat (integration) | **Suspected, not proven** — `source.indexOf("await startAttestedDevTlsFrontDoor")` is the left operand of a `toBeLessThan` and the preceding `toContain` pins a *different* string (`"setDefaultCACertificates"`). I did not run it: integration suites start a database and are the third seat's. The one-line repair is `expect(source).toContain("await startAttestedDevTlsFrontDoor");` above it. |

Two repairs I made carry **no product mutant**, stated rather than skipped quietly: `s9-dev-token-retirement` reads `apps/ui/components/LegacyRunClaimControls.tsx` and `register-support-publication` reads a `docs/` runbook. Neither is mine to edit even temporarily while the website seat has `apps/ui` in flight. Both repairs are a `toContain` on the exact literal, which fails iff that literal is absent.

## Mutant matrix — the repaired assertions bite

Product broken, restored byte-identically, sha256 checked.

| # | Repair | Product mutation | Result |
|---|---|---|---|
| M6 | s7:105 | drop the lease preparation in `recordQuestionAndMatch` | RED at s7:108 |
| M7 | s7:143 | drop it in `#evaluateCandidate` | RED at s7:147 |
| M8 | s7:164 | replace the contradiction lock with a plain `SELECT` | RED at s7:176 |
| M9 | sup-06:55 | rename `supportPool` in `apps/api/src/main.ts` | RED at sup-06:57 |
| M10 | graceful:117 | skip `drainMailDispatches()` in `apps/api/src/graceful-shutdown.ts` | RED at graceful:87, :111, :193 |

## Three runs at the round-3 tip (`bcb2adb2`)

Twelve files — the five repaired plus my original eight (s7 overlaps):

| Run | Result |
|---|---|
| 1 | `Tests  2 failed | 77 passed (79)` |
| 2 | `Tests  2 failed | 77 passed (79)` |
| 3 | `Tests  2 failed | 77 passed (79)` |

The two are `scaffold` (F31) and `s14:14` (website seat's).

**One honesty note on flakiness.** An earlier three-run set of the same twelve files reported `4 failed | 75 passed` three times, the extra two being s7 and s13. Both pass in isolation, and a clean re-run of all twelve returned `2 failed | 77 passed` and stayed there for three more runs. Two other seats were writing to this shared tree at that moment (the website seat in `apps/ui`, the database seat in `apps/runner/src/index.ts` and `tests/integration/**`). I could not reproduce it and I am not claiming a cause — recording it because a transient red that I cannot explain is a fact about the gate, not noise to drop.

## Typechecks (round 3)

| Command | Exit code |
|---|---|
| `pnpm run typecheck` | **0** |
| `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | **0** |

---

# Round 4

Tip **`ef98525c`**. Commit: `test(contract): amend the S14 wire-mirror rule to what it was protecting, and pin its failability` — one file, `tests/architecture/s14-contract.test.ts`.

**All nine of the original rows are now accounted for: eight pass, one is deliberately red.**

## 1. The amended S14 rule

**Why the old wording could not be met honestly.** It demanded `expect(types).toContain("@debateai/contract")` and `expect(types).not.toContain("export type DebateDetail")`. Measured:

- the shared contract has **no `DebateDetail` at all** — 0 occurrences across `packages/contract/src/{index,client,generate}.ts`;
- `apps/ui/lib/types.ts` declares it at line 714, carrying screen-side fields the wire never had (branch lineage, analyzer runs, agent outputs, provenance, lifecycle decisions);
- `apps/ui/lib/v3/adapter.ts` exists precisely *because* the two shapes differ.

Meeting it would mean pushing screen-shaped types into the wire contract, or relocating a declaration so a text search stops finding it. **A detail worth recording: the second assertion was also false and had simply never run** — the test died on the import check at `:14`, so `not.toContain("export type DebateDetail")` never executed against a file that declares it. Two dead assertions, one visible.

**What I implemented — the intersection rule.** The property "no V2 wire mirror" is that the UI must not silently **re-declare** a shape the contract already owns, because two declarations of one wire shape drift apart. That is now asserted structurally rather than by text search:

```ts
expect(redeclaredContractTypes([contractIndex, contractClient], types)).toEqual([]);
```

`redeclaredContractTypes` intersects the `export type` / `export interface` names of the shared contract with those of the UI module. **Measured today: the contract exports 32 type names, the UI declares 83, and the intersection is empty** — no mirror exists. A UI-only shape with no contract equivalent is permitted, which is the part the old wording got wrong. `ScoringRefreshState` stays pinned absent. The reason, V's ruling of 2026-09-20, and the adapter's path are in a comment at the assertion, so a future reader cannot mistake this for a rule relaxed because it was inconvenient.

I chose the intersection form over "assert the adapter is the only translation point" because it is decidable from the two sources alone, needs no hand-maintained exemption list, and tightens automatically: the moment the contract gains a type the UI already declares, the rule fires without anyone remembering to update it.

## 2. Its mutant — and a permanent one

| Mutant | Result |
|---|---|
| **Real tree:** append `export type PublicDebate = { id: string; drawerOpen: boolean };` to `apps/ui/lib/types.ts` (a type the contract really owns) | **RED** — `expected [ 'PublicDebate' ] to deeply equal []`; restored byte-identically, sha256 verified |

`apps/ui` is the website seat's, so that file was untouched apart from the restored probe. Because a one-off probe proves the rule bit *once*, the failability is also pinned **permanently** by a sibling test that feeds the rule a synthetic contract and three UI sources: one re-declaring `PublicDebate` (reported), one re-declaring `Answer` as an `interface` (reported), and a UI-only `DebateDetail` (silent). The rule that replaced a text search cannot now rot into a tautology the way that text search did — the round-3 class applied to my own repair.

## 3. Re-run on the quieter tree

The coordinator asked whether `2 failed` holds now. It does not — it improved, because the website seat's work landed:

| Run | Result |
|---|---|
| 1 | `Tests  1 failed | 79 passed (80)` |
| 2 | `Tests  1 failed | 79 passed (80)` |
| 3 | `Tests  1 failed | 79 passed (80)` |

The single red is `scaffold` — V's ticketed debt **F31**, deliberately left. Both typechecks exit **0**.

**The transient stands as recorded and is not withdrawn.** Three runs read `4 failed | 75 passed`, the extra two being s7 and s13; both passed in isolation; a clean re-run returned to `2 failed` and held for three runs, and now holds at `1 failed` for three more. I could not reproduce it and I am not claiming a cause.

## 4. What would finish the two unproved repairs

- **`tests/architecture/s9-dev-token-retirement-contract.test.ts:67`** — delete the `setLegacyToken("")` call from `apps/ui/components/LegacyRunClaimControls.tsx`, run the file, expect RED on the added `expect(control).toContain('setLegacyToken("")')`, restore. Owner: the website seat.
- **`tests/architecture/register-support-publication.test.ts:193`** — delete the `await withProductionSupportConfigCliConnection(...)` line from the `SUPPORT-CONFIG-INITIALIZER` block in `docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md`, run the file, expect RED on the added `toContain`, restore. Owner: whoever holds that runbook.

## Final state of the original nine

| # | Row | Outcome |
|---|---|---|
| 1 | `s04-contract:36` | fixed (round 1, class 2) |
| 2 | `s7-authorization-contract:98` | fixed (round 1, class 2) |
| 3 | `s13-contract:69` | fixed (round 1, class 2) |
| 4 | `s10-carrier-erasure-red:94` | fixed (round 1, class 2) |
| 5 | `text-control-bytes:22` | fixed (round 2, class 1) |
| 6 | `s14-contract:52` | fixed by the website seat |
| 7 | `s8-publication-contract:169` | fixed by the website seat |
| 8 | `s14-contract:14` | fixed (round 4, rule amended under V's ruling) |
| 9 | `scaffold:29` | **deliberately red** — V's ticketed debt F31; the fix site is `tools/**`, and whether the three services may depend on the observability component is an architecture call for the owner |

Beyond the nine, round 3 closed **10** vacuous ordering assertions found by sweeping the class, of which `s7:164` had been silently passing since August.

---

# Round 5 — the discarded test

Tip **`84f94f17`**. Commit: `test(contract): restore the two S8 structural laws a merge discarded, adapted to today's page` — one file, `tests/architecture/s8-publication-contract.test.ts`.

This is the worst shape of the night, and the reason it survived four rounds of gate work is structural: **a discarded test is never red.** Every defect before this one announced itself. This one could only be found by auditing merges.

## The recovered lines

Merge `690ebe14` resolved this file by taking one side whole, discarding 10 of 10 lines of the branch side. Recovered with `git diff 690ebe14^2 690ebe14 -- tests/architecture/s8-publication-contract.test.ts`:

```js
const disclosure =
  "Published debates may be indexed by search engines. Copies may persist after unpublishing.";
const applicationMapStart = applicationHome.indexOf("published.items.map");
const applicationCardEnd = applicationHome.indexOf("</article>", applicationMapStart);
expect(applicationHome.match(/Published debates may be indexed by search engines/g) ?? []).toHaveLength(1);
expect(applicationHome.indexOf(disclosure)).toBeGreaterThan(applicationCardEnd);

const webMapStart = webHome.indexOf("published.items.map");
const webPublicCard = webHome.slice(webMapStart, webHome.indexOf("</article>", webMapStart));
expect(webPublicCard).toContain("may be indexed by search engines");
expect(webPublicCard).toContain("Copies may persist after unpublishing");
```

The last four lines are the `web/` half, which retired legitimately with that surface. The first five are the loss: **exactly once**, and **after the card list**.

What survived at HEAD is presence only — `toContain("may be indexed by search engines")` and `toContain("Copies may persist after unpublishing")` — so a home page that printed the warning **five times, above the list**, satisfied this contract completely.

## What I restored, and what I adapted

Pasting the five lines back would have been the wrong repair, and would have produced precisely the defect swept in round 3. Both old anchors are gone for a real reason: the rows moved into `apps/ui/components/DebatesBuffer.tsx`, and the page now composes

```jsx
<div className="libList recentList">
  <PublicDebatesBuffer debates={published.items} />
</div>
<p className="libPublicNote">
  Published debates may be indexed by search engines. Copies may persist after unpublishing.
</p>
```

`published.items.map` and `</article>` no longer exist in `apps/ui/app/page.tsx`, so `applicationMapStart` and `applicationCardEnd` would both be `-1`, and `expect(disclosureAt).toBeGreaterThan(-1)` would pass on **any** page — a restored assertion that cannot fail, which is the same defect twice.

So the laws are restated against the list **container** that replaced the inline map, with every index pinned `> -1`:

| | Law | Assertion |
|---|---|---|
| **LAW 1** | the disclosure is stated **exactly once** | `expect(home.match(/Published debates may be indexed by search engines/g) ?? []).toHaveLength(1)` |
| **LAW 2** | the disclosure is stated **after the card list** | `cardListStart = home.indexOf("<PublicDebatesBuffer")`, `cardListEnd = home.indexOf("</div>", cardListStart)`, `expect(disclosureAt).toBeGreaterThan(cardListEnd)` — all three pinned `> -1` |

The comment at the assertion records the merge, what was discarded, why the anchors changed, and that the other guard is red — so the next reader cannot mistake an adaptation for a relaxation.

## Both mutants

| Mutant (product: `apps/ui/app/page.tsx`) | Result |
|---|---|
| Emit the disclosure **twice** | **RED** — `expected [ …(2) ] to have a length of 1 but got 2` |
| Move it **before** the card list | **RED** — `expected 5211 to be greater than 5444` |

Both restored **byte-identically**, sha256 verified against the bytes captured immediately before each write.

**A note on how these were run safely.** `apps/ui/app/page.tsx` is the website seat's and was *modified and actively being edited* while I probed it. The probe therefore backed the live bytes up to the scratchpad first, re-checked the hash immediately before each write and refused to proceed if it had moved, kept the mutation window to a single test-file run, and verified the restore by hash. It also locates the two blocks **by regex against the live file rather than hardcoding them** — which earned its keep: the seat renamed `libList` to `libList recentList` between my first and second attempt, the first attempt aborted cleanly rather than overwriting, and the restored laws were unaffected by the rename because they anchor on `<PublicDebatesBuffer`, not on a class name. Final check: the seat's file is byte-identical to the backup, their in-flight work intact.

**Nothing is needed from `apps/ui/**`.** Both laws are assertable against the page exactly as the seat has it.

## Why this one mattered tonight

The website seat restored the disclosure to the public page tonight (`22f131c0`), so the product is correct again — and this weakened test is the one that keeps it correct. The only other guard on the property, `tests/render/t3-library.test.tsx`, is red because the same merge also dropped the `data-library-row` attribute it selects on. That file is the website seat's; until they restore the attribute, **this contract is the only live guard on the disclosure's shape.**

## Verification

| Run (12 files) | Result |
|---|---|
| 1 | `Tests  1 failed | 79 passed (80)` |
| 2 | `Tests  1 failed | 79 passed (80)` |
| 3 | `Tests  1 failed | 79 passed (80)` |

The one red is `scaffold` — F31, deliberately left. `pnpm run typecheck` **0**; `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` **0**.

## The generalisation, for the same ticket as the round-2 note

A merge that resolves a test file by taking one side whole removes assertions **silently and permanently**: the file still exists, still passes, still looks maintained, and no gate will ever mention it. That is strictly worse than a safeguard moving without its tests, because a moved safeguard leaves a red test behind as evidence and a discarded assertion leaves nothing at all. The two defects share a cause — a bulk operation crossing a test boundary unsupervised — and the same control catches both: **a diff that touches a test file may not be resolved by taking one side whole; the discarded assertions must be enumerated and each one either re-applied or explicitly retired with a reason.** Worth sweeping the other merge resolutions the database seat found, on this evidence: one of them hid a real structural law for weeks.
