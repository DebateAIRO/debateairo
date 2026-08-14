# HYG-01 — Opus 5 lens verdict (rev 1)

**Ticket:** `t_4a1f8654` · **Lane:** DR-153 dual diamond (Opus 5 + Grok) · **Route:** both lenses must greenlight
**Reviewer:** Opus 5 · **Date:** 2026-08-12
**Method:** verification by execution. Every claim below that says RED or GREEN was produced by
running the mutation, not by reading the diff. Restores are md5-verified.

**VERDICT: BLOCKING (3) + ADVISORY (6).**

The ticket exists because eight revisions were lost to checks that could not fail for the reason
someone believed. Three of the four headline items are genuinely delivered and mutation-proven.
The remaining three findings are all the same defect class, still open — including one guard that
survives its own deletion, and one live NUL byte sitting in the tree while the guard built to
catch it prints `=0`.

---

## 0. Method, and a process hazard the orchestrator must know about

**The Grok lens is mutating the same working tree, concurrently, right now.**
At 16:47 I copied `apps/runner/src/index.ts` and the copy did not match the file I had hashed two
minutes earlier: line 964 read `conditionMarkRecords = ([` — a mid-flight PANEL-01 call-site
mutation. `ps` confirms PID 38262, `grok -p "/goal Review HYG-01 …" --permission-mode
bypassPermissions`, cwd = the repo, applying the same four named mutations.

This is not a theoretical risk. The tree holds eight tickets of **uncommitted** work (573 tracked
paths; everything else untracked). Two agents mutating and restoring the same files can trivially
restore *each other's* mutation as "baseline" and silently corrupt work that has no commit to fall
back to. I did not review from that tree.

Instead I took an APFS clone (`cp -Rc`, 12s, verified byte-identical on all seven files under
review) and ran every mutation there. **I made zero writes to the real repository** other than this
verdict file; the ten relevant file hashes are unchanged from my first observation
(`apps/runner/src/index.ts` = `306343f727ee59a03ad1950f99674412` before and after).

Recommendation to the orchestrator: give concurrent lenses separate worktrees/clones, or serialise
them. This mission's own history says a review that observes "transient reds on the multi-maker
path mid-flight" (UI-02c) was probably observing exactly this.

**Tree coherence — asked and answered: the tree is coherent.** Measured on the real repo at
17:01–17:02 today:

```text
$ pnpm test
Test Files  67 passed (67)
Tests       468 passed (468)

$ pnpm exec vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

$ pnpm run typecheck && pnpm --dir apps/v2-ui run typecheck   → both clean
$ pnpm run lint  → {"edgeRowsChecked":27,"violations":[]} / {"blocking":[]}
```

The multi-maker disclosure path passes in all three places that assert it: the new fixture, the
`UNSERVED-MAKER-POSITION` record requirement in `acceptance/ceremony.test.ts:305,381`, and
`tests/unit/serve-s05.test.ts:302–326`. No transient reds observed across ~25 runs.

**Zero real model calls — confirmed.** The doubles are `node:http` servers bound to `127.0.0.1`
(`tests/integration/database.test.ts:146–171`); the endpoint is passed explicitly into
`createPostgresProviderGateway` with no env fallback; the fixture asserts `primary.calls() === 8`
and `secondary.calls() === 8`; the sibling guard tests assert `0` `MODEL_CALL` ledger rows. No CLI
is spawned anywhere on the path.

---

## 1. The M=2 fixture — three of four mutations genuinely killed

`tests/integration/database.test.ts:800–887`. All runs are the focused fixture unless noted.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| a | `if (leg.round > 1) break;` at `apps/runner/src/index.ts:752` | **RED** | `COMPOSITION_CONTRACT_ERROR` — see ADV-1 |
| b | `resolveExpansionDepth({ depth: 1 })` at `apps/runner/src/index.ts:456` | **RED** | `COMPOSITION_CONTRACT_ERROR` — see ADV-1 |
| c | call site at `:964` reverted to `Object.freeze([…])` (drop the preserve wrapper) | **RED** | `CONDITION_MARK_RECORD_REQUIRED` at `packages/serve/src/index.ts:796` |
| d | **delete** the `FIXED_SINGLE_ROOT_SERVE_VIOLATED` guard (`:825–827`) | **GREEN** | **nothing** — see BLOCKING-1 |

(c) is the real win. The PANEL-01 A-r3-1 inline-freeze regression — the one A-r3-1 said nothing
caught — now dies loudly, and it dies on a *production* guard that the fixture finally makes
reachable. That is the right shape.

### BLOCKING-1 · The `FIXED_SINGLE_ROOT_SERVE_VIOLATED` guard still has no test, and the fixture structurally cannot give it one

Goal-packet item 1 lists four deliverables; the fourth is *"give `FIXED_SINGLE_ROOT_SERVE_VIOLATED`
its missing test (A-r3-2)"*. It is not delivered.

**Evidence 1 — the guard survives its own deletion, against the full suite:**

```text
$ mut: delete apps/runner/src/index.ts:825-827 ; pnpm test
Test Files  67 passed (67)      ← the failure shown was a clone artifact (no .git); re-verified
Tests       467 passed          ← nothing in the enforced suite kills it
restored_md5=306343f727ee59a03ad1950f99674412 match=YES
```

**Evidence 2 — repo-wide, no test references the code at all.** The only occurrence in any test
file is a *comment*:

```
tests/integration/database.test.ts:881:      // fixture fails typed-loud at FIXED_SINGLE_ROOT_SERVE_VIOLATED.
```

**Evidence 3 — the decisive pair.** The handoff's evidence line ("widening the served set to both
roots — RED with `FIXED_SINGLE_ROOT_SERVE_VIOLATED`") is literally true, and proves nothing:

```text
D   widen servedNodes to both roots, guard IN PLACE   → RED  (FIXED_SINGLE_ROOT_SERVE_VIOLATED)
D'  widen servedNodes to both roots, guard DELETED    → GREEN (1 passed | 31 skipped)
```

Under D′ **both maker roots are served, DR-159 B2-A's single-root discipline is violated, and the
fixture passes.** The fixture does not observe single-root serving; it observes the guard's own
throw. A check whose only witness is itself is precisely the class this ticket was cut to kill.

**Why the fixture cannot fix this as designed — the mechanical reason.** `servedNodes` has exactly
four references:

```
apps/runner/src/index.ts:816   const servedNodes = Object.freeze([...])   ← construction
apps/runner/src/index.ts:825   if (servedNodes.length !== 1)             ← the guard
apps/runner/src/index.ts:1000  nodes: servedNodes,                       ← inside the else branch
apps/runner/src/index.ts:1026  availableNodes: servedNodes.map(...)      ← inside the else branch
```

The fixture deliberately exhausts the envelope at 16 calls, so it takes the `HARD_STOP` terminal
branch — and on that branch `servedNodes` is *never consumed by anything except the guard*. No
assertion on the persisted answer can distinguish one served root from two, because the served set
never reaches the serve gate or the composer.

**Concrete remedy (either is cheap):**
- add a second M=2 case that does **not** exhaust the envelope — queue composer + conformance
  doubles so `runServeGateChain` is reached — and assert the served/`availableNodes` set has exactly
  one member with the first-configured-provider root id; **or**
- extract the served-set construction (`:816–827`) into an exported pure function and unit-test it
  at M=2 directly, the way `preserveEnvelopeTerminalConditionMarkRecords` already is in
  `tests/unit/serve-s05.test.ts`.

Until one exists, the handoff's §1 bullet 4 should not be read as closing A-r3-2.

---

## 2. The dead v2-ui runner — the named file is genuinely live; 49 others are not

**What works, and works properly.** `apps/v2-ui/scripts/run-node-tests.mjs` exists, runs
`lib/scoringResponse.test.mjs` through `tsx`, and prints a discovery receipt. It is wired into the
enforced root suite by `tests/unit/v2ui-node-runner.test.ts`, and that wiring is real, not
decorative — I broke an assertion inside the `.mjs` suite and the **root** gate went red:

```text
$ mut: break `title: "Scoring unavailable"` in apps/v2-ui/lib/scoringResponse.test.mjs
$ pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts
× HYG-01 v2-ui Node test gate > executes the maintained 31KB scoring-response behavioral suite
Tests  1 failed (1)
```

The `Scoring unavailable` case flagged months of reviews ago is present
(`apps/v2-ui/lib/scoringResponse.test.mjs:150`) and executes; `pnpm --dir apps/v2-ui test` reports
`# tests 27 / # pass 27 / # fail 0`. Item 2's *named* instance is closed, and the
`UI-02a-codex-handoff.md` correction (A4) is present and honest — it now states both the compile
constraint **and** the missing runner.

### BLOCKING-2 · Phantom coverage remains, at six times the volume that was fixed

The goal packet: *"Do NOT leave tests that look like coverage and are not."* After HYG-01:

```text
$ find apps/v2-ui -name '*.mjs' … excluding next.config, the runner, and scoringResponse.test.mjs
49 files   190,586 bytes   ← none of these execute in any gate
```

Fourteen of them are plain `*.test.mjs` — unambiguously tests by name, not "source-contract review
tools":

```
apps/v2-ui/app/api/[...path]/route.test.mjs        apps/v2-ui/lib/observability/logger.test.mjs
apps/v2-ui/components/DebateCanvas.accessibility.test.mjs   apps/v2-ui/lib/observability/logger.contract.test.mjs
apps/v2-ui/components/DebateCanvas.responsive.test.mjs      apps/v2-ui/lib/scoreBandTokens.test.mjs
apps/v2-ui/lib/api.test.mjs                        apps/v2-ui/lib/scoring/scoringResponseSpecification.test.mjs
apps/v2-ui/lib/debatePresentation.test.mjs         apps/v2-ui/lib/scoringFormat.test.mjs
apps/v2-ui/lib/debateTreeUtils.test.mjs            apps/v2-ui/lib/scoringStatusCopy.test.mjs
apps/v2-ui/lib/lensBranchRendering.test.mjs        apps/v2-ui/lib/serverApi.test.mjs
```

The handoff is honest that it declined this ("recursive discovery exposed 96 stale failures across
unrelated legacy source tests"), and I accept that making 96 stale assertions pass is not this
ticket's job. But "looks like coverage and is not" is exactly the state that survived four reviews
on one file; leaving 49 in place reproduces the condition at scale. The ticket asked to treat the
class.

**Concrete remedy — does not require fixing any stale test:** quarantine them so they cannot be
mistaken for coverage (rename to `*.mjs.disabled` / move under `apps/v2-ui/legacy-source-notes/`,
or delete), **and** add one assertion that the manifest is complete — e.g. in
`tests/unit/v2ui-node-runner.test.ts`, glob `apps/v2-ui/**/*.test.mjs` and require the set to equal
the manifest in `apps/v2-ui/scripts/run-node-tests.mjs:10`. Without that assertion the manifest is
a hardcoded one-element list (ADV-5): the next `.mjs` test anyone adds is silently phantom again,
and this ticket gets re-cut.

---

## 3. The control-byte guard — correct, and pointed away from the defect

**The guard itself is sound.** Verified by execution in an isolated clone:

- planted a NUL at offset 200 of the tracked `packages/kernel/src/index.ts` →
  CLI `packages/kernel/src/index.ts:200:0x00`, exit 1; the enforced vitest ratchet went **RED**
  (`+ "offset": 200`). Restored, md5 match.
- added a tracked 1×1 PNG containing **23** NUL bytes → `TRACKED_TEXT_CONTROL_BYTES=0`, exit 0.
  It correctly does **not** fire on binary assets.

### BLOCKING-3 · There is a raw NUL in the tree right now and the guard reports zero

`tools/check-text-control-bytes.ts:38` scans `git ls-files -z` — the **index only**. Under
`DebateAI-V3` that is 573 paths. The working tree holds 686 text-source candidates. The 113-path
gap is where the defect actually is:

```text
docs/missions/2026-08-06-v3-programming/reviews/ui02b-opus-rev1.md   offset 17229   0x00

context: …re-read with `grep -a` and a byte scan: **0 raw NUL bytes**, 25,430 bytes.
          The `<NUL>` at `:632` is a source escape inside a…

$ pnpm run audit:text-bytes
TRACKED_TEXT_CONTROL_BYTES=0
```

A review document *describing* NUL bytes has embedded a raw one — the exact infection the ticket
body narrates ("propagated into THREE separate documents that merely quoted the offending line (a
review file, …)"). The guard was built for this and does not see it, because the file is untracked.

It gets sharper: **every file HYG-01 created is untracked**, including the guard's own source.

```
UNTRACKED tools/check-text-control-bytes.ts        UNTRACKED apps/v2-ui/scripts/run-node-tests.mjs
UNTRACKED tests/unit/text-control-bytes.test.ts    UNTRACKED apps/v2-ui/lib/debateHeaderOverflow.ts
UNTRACKED tests/unit/v2ui-node-runner.test.ts      UNTRACKED tests/{unit,integration}/pol03-pool-resilience.test.ts
```

So today the guard guards none of the code this ticket added. In a mission whose entire V3 engine
is uncommitted, "tracked text sources" is not the population that matters.

**Concrete remedy — one line.** `tools/check-text-control-bytes.ts:38`:

```ts
execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], …)
```

I ran that population by hand over the current tree: **686 candidates, exactly 1 finding** — the
NUL above. So the fix is one line, costs ~200ms, and turns the guard green-for-the-right-reason
after that byte is repaired.

---

## 4. Ratchet upgrades — delivered, and mutation-proven

### 4a. Drawer (`tests/unit/v2ui-pages.test.ts:222–223`) — SOUND

`NodeDetailDrawer.tsx` contains zero `base_score`/`final_strength` tokens, so
`not.toContain("base_score")` passes as shipped. All four UI-02a variants inserted as executable
JSX, each run individually and restored:

| Variant | Result |
|---|---|
| `{  v3.base_score.value }` (extra space) | **RED** |
| `{String(v3.base_score.value)}` | **RED** |
| `{v3["base_score"].value}` | **RED** |
| `const { base_score } = v3; … {base_score.value}` | **RED** |

I then went looking for the escape the ratchet *can't* see — a literal-free access:

```tsx
<span>{v3["base" + "_score"].value}</span>   → v2ui-pages 39/39 GREEN
```

…but it is **not tsc-clean**, so the typecheck gate holds the line:

```text
components/NodeDetailDrawer.tsx(365,20): error TS7053: Element implicitly has an 'any' type
because expression of type 'string' can't be used to index type '{ … base_score: {…} … }'
```

(Control: variant 1 typechecks clean at exit 0 — confirming the four named variants were real,
shippable regressions.) **The A3 ratchet is complete.** I could not construct a tsc-clean escape.

### 4b. Header geometry — the named escape dies; the extraction is behaviourally real

| Mutation | Result |
|---|---|
| duplicate `setHeaderActionsCollapsed(false);` after the correct write (UI-01 A17) | **RED** — `expected length 1, received 2` at `:312` |
| `readDebateHeaderGeometry` always reports `layout: "row"` (behavioural) | **RED** at `:405` |

The extraction genuinely earns its keep: `:405` exercises `display:none` filtering, the
`debateOverflow` exclusion, grid→stacked, gaps and intrinsic widths against stub elements. Region
anchoring is safe — the file has exactly one `useLayoutEffect` (`:751`).

**Product behaviour is unchanged — verified, not asserted.** The pre-extraction effect is preserved
verbatim in `logs/HYG-01-codex.log:21500–21550`. Field by field against
`apps/v2-ui/lib/debateHeaderOverflow.ts:64–100`: `availableWidth`, `layout`, `headerPaddingInline`,
`headerGap`, `identityGap`, `claimGap`, `titleIntrinsicWidth`, `claimFixedWidths`,
`identityFixedWidths`, `controlGap`, `controlIntrinsicWidths` — identical expressions, identical
filters (`child !== titleMeasure && !contains("debateTopTitle") && isDisplayed`,
`child !== claim && isDisplayed`, `!contains("debateOverflow") && isDisplayed`), same
`getComputedStyle` call pattern. The only change is that the style read is now injected
(`(element) => window.getComputedStyle(element)`). This is a pure move. **The tests-only constraint
holds.**

### 4c. POL-03 — both A1 and A2 mutation-proven

| Mutation | Result |
|---|---|
| `describe.skip(` on `tests/integration/pol03-pool-resilience.test.ts` | **RED** in the enforced unit ratchet |
| `lc_messages=C` → `en_US.UTF-8` in `tests/support/testDatabase.ts:89` | **RED** — `expected 'en_US.UTF-8' to be 'C'` |

---

## 5. The records — present and honest

**DR-162-A N-genericity audit.** All four recorded findings check out against the code:

| Recorded claim | Verified at |
|---|---|
| `DebateMakerRole` is the closed `primary \| secondary` pair; the planner refuses every count but 2 | `apps/runner/src/index.ts:184`, `:258–263` |
| `buildCrossRootExchangePlan` returns exactly two ordered legs (`0→1`, `1→0`), not a rule over N | `:288–293` (both legs are literals) |
| runner takes only `authoredNodes[1]` as `unservedRoot`; record names one other maker | `:815`, `:934`, `:937` |
| `SERVED_ROOT_RULE = first-configured-provider` deterministic but cannot disclose every unserved root | `:226–228` |

Behaviour is correctly unchanged; the `> 2` refusal
(`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`, `:193–198`) remains the ratified cost boundary and is
tested at `tests/integration/database.test.ts:777`. See ADV-2 for the one omission.

**POL-02 sweep corrections** — recorded verbatim in the handoff as carry-forward advisories; the
ticket asked for records, not code, and no POL-02 behaviour was touched. I did not re-derive each of
the six (out of scope for this ticket).

**ENV-01 ADV-6** — closed. `acceptance/README.md:103` now credits DR-159 for the shipped run-level
`runCostEnvelope` members; `grep -rn DR-138 acceptance/` returns nothing.

---

## Advisories

**ADV-1 · The handoff mis-states how mutations (a) and (b) die.** It claims "RED: 16-node/round-2
assertions fail (only the depth-1 structure remains)". They do not. Both die earlier, at
`parseComposerOutput` → `COMPOSITION_CONTRACT_ERROR` (`apps/runner/src/index.ts:176`), because
fewer expansion calls leave envelope budget, the run proceeds into the composer, and the queued
*judgement* doubles fail the composer schema. `expect(nodes.rows).toHaveLength(16)`
(`tests/integration/database.test.ts:853`) and the `:r1:`/`:r2:` call-site counts at `:860–861`
**never execute**. The kill is real and deterministic, but it rests on the envelope arithmetic
(16 calls exactly), not on the tree structure. If anyone later enlarges the double queue or the
envelope, those three structural assertions become the sole defence — and they have never been
observed failing. Either queue composer/conformance doubles so the run reaches the assertions, or
state the true mechanism in the handoff.

**ADV-2 · The N-genericity record omits the most fundamental 2-assumption.**
`apps/runner/src/index.ts:458`: `const effectiveMakerCount = critiqueSettings !== undefined &&
criticJudge !== null ? 2 : 1;` — the count is a literal, derived from a settings shape
(`WalkingSkeletonSettings.critique`) that carries exactly **one** optional gateway. M=3 is
unreachable by *configuration*, not merely refused by the M-guard. The future M=3 ticket will hit
this before it hits any of the four recorded items; it belongs in the record.

**ADV-3 · The header ratchet is still lexical, and a tsc-clean alias defeats it.** `:312` counts
occurrences of `setHeaderActionsCollapsed(` in a source region. Inserted after the correct write:

```tsx
const forceExpanded = setHeaderActionsCollapsed;
forceExpanded(false);
```

→ `tests/unit/v2ui-pages.test.ts` **39/39 GREEN**, and `pnpm --dir apps/v2-ui run typecheck`
**exit 0**. Header actions would never collapse; DR-160 content-aware overflow is dead; every gate
is green. The ticket asked specifically for the duplicate-*line* escape to die and it does — item 4
is delivered as written — but UI-01 A17's class is narrowed, not closed. The behavioural extraction
covers the geometry *read*; the state *write* has no behavioural witness. Closing it properly means
extracting the decision→state step (e.g. a pure `resolveHeaderCollapseState` the effect applies) so
a second write is a behavioural failure rather than a grep count.

**ADV-4 · `audit:text-bytes` is not in `pnpm run lint`.** `package.json` `lint` =
`audit:architecture && audit:source`. The check is enforced (via `tests/unit/text-control-bytes.test.ts`
in the root suite), so this is presentational — but the handoff presents it as a CLI gate, and a
reader scanning `lint` will conclude it is not enforced.

**ADV-5 · Manifest drift.** `apps/v2-ui/scripts/run-node-tests.mjs:10` is a hardcoded
`const tests = ["lib/scoringResponse.test.mjs"]`. The comment defends this over a glob (fair — a
silent-zero glob is what caused the original bug), but nothing asserts the manifest is *complete*.
Fold the completeness assertion described under BLOCKING-2 into the same fix.

**ADV-6 · The scanner never sees dotfiles.** `extname(".gitignore") === ""`, so `.gitignore`,
`.gitattributes`, `.npmrc` and friends fall through both `TEXT_SOURCE_EXTENSIONS` and
`TEXT_SOURCE_NAMES` (`tools/check-text-control-bytes.ts:6–11,33–35`). Two tracked `.gitignore`
files are unscanned today. Relatedly, `".env"` in the extension set is dead code — it can only ever
match a file literally named `something.env`, never `.env`. Add the basenames you mean.

---

## What I would need to greenlight

1. `FIXED_SINGLE_ROOT_SERVE_VIOLATED` gets an assertion that fails when the invariant breaks and the
   guard is absent — i.e. mutation D′ (widen + delete guard) goes RED. Either route in BLOCKING-1.
2. The control-byte scan covers the population that matters (`--cached --others --exclude-standard`),
   and the live NUL at `reviews/ui02b-opus-rev1.md:17229` is repaired to the escaped form the
   sentence intended.
3. The 49 remaining `apps/v2-ui` `.mjs` files stop looking like coverage, and one assertion prevents
   the manifest from silently falling behind again.

Items 1(a)(b)(c), 4a, 4b, 4c and all of item 5 are accepted as delivered and mutation-proven.
Every mutation above was applied one at a time in an isolated clone and restored with an md5 match;
the real working tree is byte-identical to how I found it.

*Grok's independent verdict exists at `reviews/hyg01-grok-rev1.md`; I reached BLOCKING-1
independently by execution before reading any of it, and did not consult it while forming this one.*
