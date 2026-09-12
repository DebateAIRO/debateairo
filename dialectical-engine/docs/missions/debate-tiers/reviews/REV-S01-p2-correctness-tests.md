# REV(S01) pass 2 — lens **correctness/tests** · verdict **REWORK**

Seat `REV-S01-p2-correctness-tests` · ticket `t_f8494fff` · mission `debate-tiers` · 2026-09-10 05:41 EEST.
Blind: no contact with the product-truth lens (`t_4fcba563`), whose output I have not read.
Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine`,
detached at **`53b903d2`** (the FIX head = `f6c147cc` + F2 `f9b40d0f` + F1 `53b903d2`), base `7f89f7b7`.
**0 dirty at CLAIM and 0 dirty at handoff; every changed file sha256-identical to its pristine state
after the last mutant** (`backup/SHA256.txt`, diffed clean).

---

## 1. What I verified, and how

### 1.1 Every cluster command, re-run by me, three times

My own script (`probes/REV-S01-p2-correctness-tests-clusters.sh`), pass-2 pairs
(`tier01-new-plan-tier` now **22:0**, F1 added one case):

| run | started | S01-C1 (8 pairs) | S01-C2 (9) | S01-C3 (6) | S01-C4 (11) | dirty |
|---|---|---|---|---|---|---|
| 1 | 05:27:14 | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | 0 |
| 2 | 05:28:06 | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | 0 |
| 3 | 05:28:57 | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | 0 |

`generate:contract rc=0`, `dirty-after=0` on all three. **12/12 `CLUSTER_GREEN`** — the orchestrator's
`reverify-53b903d2.txt` reproduces in my worktree.

### 1.2 Distrusting the green: failing test **names**, not pair counts

Ten suites in this slice carry non-zero expected failures, so a pair can hold while the *membership*
of the failing set changes. I captured every failing test name across all ten, at `53b903d2` and again
with `page.tsx` + `globals.css` reverted to `f6c147cc`:

```
30 failing test names captured   (= 1+1+3+5+7+2+2+4+3+2, the exact sum of the expected pairs)
diff fails-f6c147cc.txt fails-53b903d2.txt
  IDENTICAL — no test swapped in or out of the failing set
```

**No hidden regression behind a stable pair count.**

### 1.3 RED→GREEN per assigned finding — mutants, each restored byte-exactly

| # | mutant | result | what it settles |
|---|---|---|---|
| M1 | `page.tsx` ← `f6c147cc`, tests at FIX head | **5 RED** / 17 pass | every F1 finding is pinned: roster-shape, S01-27, S01-28, S01-29, S01-34 |
| M2 | `globals.css` ← `f6c147cc` | **1 RED** | product N1 (`white-space: nowrap`) pinned |
| M3 | tests ← `f6c147cc`, source at FIX head | render **3 RED**; style contract **8/8 GREEN** | the page's behaviour genuinely changed |
| M4 | `step={32}` → `{128}` **isolated** | S01-34 RED, `AssertionError: expected 32 to be +0` | **B1 / correctness N2 fixed**, and the assertion is arithmetic |
| M5 | `--m-gpt: #B4552D` → `#B4552E` **isolated** | NEW contract **RED** (M7); OLD contract **8/8 GREEN** | **correctness N1 fixed** — exact proof the old test was value-blind |
| M8 | `SliderRow` hint loses its `id` | S01-28 RED | **seam (d)** — describedby resolution is pinned |
| M9 | `.ndTierModel` region emptied | NEW: `Error: Empty S01 CSS selector region: .ndTierModel`; OLD: opaque deep-equal RED | **correctness N4** is a *diagnostics* fix — see N4 below |

### 1.4 The seam at the test level (README §3 c/d) — the blocking result

| # | mutant | style contract | render suite | product effect |
|---|---|---|---|---|
| M6 | **delete** `globals.css:6264-6270` (the `:disabled` lock block) | **RED** — `Missing S01 CSS selector region` | **22/22 GREEN** | **none** |
| M7 | `FREE_LOCK_STYLE` opacity `0.45` → `0.9` | **8/8 GREEN** | S01-27 RED (`'0.9'` vs `'0.45'`) | **breaks ratified M8** |

Read together: the style contract is RED for a change with **zero** product effect and GREEN for the
change that breaks the M8 value it claims to assert. See **B1**.

### 1.5 Every promoted pass-1 probe, re-run at `53b903d2` — including the security lens's

The five `REV-S01-p1-security--probe-*.test.ts` and their `vitest.probe.config.ts` hard-code
`/…/.worktrees/rev-s01-p1-security/…`, **and that worktree is still parked at `f6c147cc`**
(`git worktree list`). Run as promoted they would have measured the pass-1 tree and reported green.
I re-pathed all six probe files to my worktree and rebuilt the config (`residual references to the
security lane: 0`). Result — **78 tests, 75 passed, 3 failed**, and the identical 75/3 with the same
three red names when I revert all four changed files to `f6c147cc`:

```
probe-sec-a … A3 rejects a __proto__ payload key                       (pass-1 state, probe-b dated it)
probe-sec-c … C2 1 MB string → 400, submit not called   expected 500 to be 400   (= T4, t_77100e37, pre-existing, open)
probe-sec-c … C3 the 400 body does not leak the schema  'plan_tier' echoed        (pass-1 state)
```

**No difference on the security surface** — as expected, since `f6c147cc..53b903d2` touches four files
(`page.tsx`, `globals.css`, and the two `tier01-*` tests; +148/−66) and none is imported by those probes.

### 1.6 My OWN fixture — built from the CLAIM, exceeding the author's parameters

`probes/REV-S01-p2-correctness-tests-seam.test.tsx`, **8/8 GREEN at `53b903d2`**. The author's helpers
set a value and assert React state; mine drives each control **the way the browser drives it** (assign
`.value` through the prototype setter, then dispatch `input`+`change`) and asserts what the **DOM node**
reads afterwards — the thing a user sees. It also covers what the author's suite does not: the
**collapsed nine** as well as the expanded fourteen, **all four** sliders' step grids, and the **real**
roster ids.

| probe | at `53b903d2` | at `f6c147cc` | discriminates? |
|---|---|---|---|
| P1 · all 14 locked controls RESTORE their value after a real-keystroke drive | GREEN | RED | **no** — see the honesty note below |
| P2 · the six pills ignore a real click AND keyboard Enter | GREEN | GREEN | no (confirmation) |
| P3 · the **nine collapsed** locks each carry a resolvable `aria-describedby` | GREEN | RED | **yes** |
| P4 · every locked control keeps `tabIndex >= 0` and carries no native `disabled` | GREEN | RED | **yes** |
| P5 · **class sweep** — every slider's value AND max sit on its own step grid | GREEN | RED | **yes** |
| P6 · the **real** roster ids get their house dot, none falls to `--m-default` | GREEN | GREEN | no (confirmation) |
| P7 · Premium clears the lock completely — no residual inline style | GREEN | GREEN | no (confirmation) |
| P8 · zero elements match the four `:disabled` lock selectors | GREEN | RED | **yes** |

**Honesty note on P1.** Its pre-FIX RED is an *artifact*, not evidence: assigning `.value` and
dispatching bypasses native `disabled` in jsdom, which a real browser never permits. P1 is a
**confirmation** probe — at the FIX head it shows React's controlled-input restore genuinely returns
every one of the 14 values — and I do not claim it as a discriminator.

**Class sweep for the B1 defect (§3.2 — recorded member by member so it can be checked mechanically):**
`treeDepth` 1..5 step 1 value 2 ✓ · `branchingWidth` 1..4 step 1 value 2 ✓ · `concurrency` 1..6 step 1
value 3 ✓ · `maxTokens` 128..4000 step 32 value 800 ✓ — `(value−min) % step == 0` and
`(max−min) % step == 0` for all four. **One member, fixed; no second member exists today.**

---

## 2. Findings

### B1 (BLOCKING) · the style contract asserts a property it does not measure — and the ratified M8 value is unpinned at the stylesheet level

`tests/unit/tier01-style-contract.test.ts:159-164` · `apps/ui/app/globals.css:6264-6270` · `apps/ui/app/new/page.tsx:46`

```ts
const lockSelector =
  ".ndSegItem:disabled, .ndSlider:disabled, .ndSteerInput:disabled, .ndSelect:has(select:disabled)";
// PROPERTY S01-42b: all four Free-locked control families share only the ratified dim-and-cursor treatment.
expect(declarations(lockSelector)).toBe("opacity: 0.45; cursor: not-allowed;");
```

**Concrete inputs → wrong outcome.** F1 removed native `disabled` from all four families, so **no
element on `/new` can match any of those four selectors** — measured, not argued: P8 returns 0 matches
across the expanded 14. The stylesheet rule is therefore dead, and S01-42b's stated property is **false
of the product**. Both directions measured:

- **M6** — delete `globals.css:6264-6270`: style contract **RED** (`Missing S01 CSS selector region`),
  render suite **22/22 GREEN**, product paint unchanged. A cleanup with zero product effect reddens the
  slice's style gate.
- **M7** — `FREE_LOCK_STYLE` `opacity: 0.45` → `0.9`: style contract **8/8 GREEN**. DONE.md **M8**
  (`opacity: 0.45; cursor: not-allowed` — V's Q3 yes) breaks and the test whose comment names exactly
  that treatment does not notice.

M8's paint is today pinned *only* by `tier01-new-plan-tier.test.tsx:240-243` (the inline-style
assertion). The stylesheet-level gate protects nothing.

**Root cause, for the FIX seat.** `docs/missions/debate-tiers/slices/S01/DECISIONS.md:12` ratified the
lock mechanism as *"The native `disabled` attribute on the existing controls"*, with the recorded
rationale *"a disabled control drops out of the tab order without extra code"*; `DECISIONS.md:217` bound
C3 ∥ C4 to *"`.ndSegItem:disabled`, `.ndSlider:disabled`, `.ndSteerInput:disabled`,
`.ndSelect:has(select:disabled)` (MOCK F1 — no page-side hook needed)"*. Pass-1 product N3
(`t_7f4df45a`) attacks the very property that decision was chosen for. F1 resolved the contradiction by
reversing both rows unilaterally: its READY comment contains `DECISIONS`, `ratified`, `tab order` and
`V-ROW` **zero times**. The mechanism question therefore belongs to V (§6), and B1 is blocking whichever
way V rules, because the code and the test must agree with **one** of the two mechanisms and today they
agree with neither: the page locks by inline style, the stylesheet and its contract lock by `:disabled`.

**Smallest fix consistent with either ruling:** the lock treatment must be reachable from the
selector the page actually produces, and the style contract must pin *that*. If V keeps
`aria-disabled`, key the CSS on `[aria-disabled="true"]` (or a class the page sets), delete the dead
`:disabled` block, drop the inline literal, and repoint S01-42b — then **M7 must go RED**. If V restores
native `disabled`, product N3 returns and is V's to re-decide.

VERDICT: blocking / CONFIDENCE: **high** (M6 and M7 are mechanical and reproduce) / STRONGEST COUNTER:
*the M8 paint IS pinned somewhere (the render suite), so no user sees a wrong pixel today; this is dead
code plus a mislabelled assertion, which is classically non-blocking.* I reject it because the slice
ships a production CSS rule that provably cannot match, and because the assertion that the mission
relies on to defend a V-ratified measurement is inert — the same class as pass-1 correctness N1, now
recurring on the same slice one pass later.

### N1 (non-blocking) · SPEC-v2 §2 step 6's property lost its last test when S01-28 was renamed

`tests/render/tier01-new-plan-tier.test.tsx:247-267`

S01-28 was *"forwards the Free lock to every native control family"* and asserted
`.ndSegItem:disabled` 6, `.ndSlider:disabled` 4, `.ndSteerInput:disabled` 2, `.ndSelect select:disabled`
2. It is now *"keeps every Free lock reachable and described"* and asserts `aria-disabled` counts,
`tabIndex >= 0` and describedby resolution. SPEC-v2 §2 step 6 requires *"the dropdowns will not open and
the three sliders will not move"* — a **browser-enforced** property that native `disabled` gave for free
and that `aria-disabled` + a guarded handler does not. **No test in this slice pins it, and jsdom
cannot**: my P1 proves values are *restored*, which is not the same as a control that never moves.
UNVERIFIED at the test level by construction; it is the product lens's item 3(a) and V's step 6.

VERDICT: ticket + hand to the browser gate / CONFIDENCE: high / STRONGEST COUNTER: *step 6 is V's
acceptance step and needs no unit test.* True — but the slice's verification list should stop implying
coverage it no longer has.

### N2 (non-blocking) · the B1 grid assertion pins one member, not the class

`tests/render/tier01-new-plan-tier.test.tsx:391-393` asserts `(value−min) % step` and `(max−min) % step`
for `#maxTokens` **only**. §3.2 asks for the class. I swept all four sliders (§1.6) — no other member is
defective today, so this is a guard shape, not a live defect. My P5 is the class-shaped version.

VERDICT: fold into the FIX / CONFIDENCE: high / STRONGEST COUNTER: *only `maxTokens` has a non-1 step.*
Today. `step` is a `SliderRow` prop with default 1 (`page.tsx:527`); the next non-1 step is unguarded.

### N3 (non-blocking) · the roster-shape test never exercises the real roster ids

`tests/render/tier01-new-plan-tier.test.tsx:216-237` mocks `PLAN_TIER_ROSTERS` with six synthetic ids
(`openai-o3`, `sol-gpt-5`, `GPT-5.6-SOL`, `claude_opus`, `grok/4.6`, `gemini-3`) and asserts their dots.
Nothing ties the **five real** ids — `gpt-5.6-luna`, `claude-sonnet-5`, `gpt-5.6-sol`, `claude-opus-5`,
`grok-4.6` (`packages/contract/src/plan-tiers.ts:8-11`) — to DONE.md **M7**'s colours. Both green (my P6
checks the real five and that none falls to `--m-default`), so this is a coverage gap, not a defect.

VERDICT: fold into the FIX / CONFIDENCE: high / STRONGEST COUNTER: *the shape test is strictly stronger.*
It is stronger about shapes and silent about the only five ids V actually sees on screen.

### N4 (non-blocking) · correctness N4's remedy is diagnostic, not detective — record it as such

`tests/unit/tier01-style-contract.test.ts:12-18`, `:82-90`

The guarded region readers now throw named errors. Measured (M9): with `.ndTierModel` emptied, the NEW
reader throws `Empty S01 CSS selector region: .ndTierModel`; the OLD reader **also went RED**, with an
opaque deep-equal diff. The fix converts a confusing red into a named red — real value, but the pass-1
finding's stated risk (a *silent* pass) is not what was removed. Worth one line in the ledger so nobody
later credits this guard with catching a bug it cannot catch.

VERDICT: record / CONFIDENCE: high / STRONGEST COUNTER: *a missing region in a different member could
still pass silently.* I could not construct such a member; stated as UNVERIFIED.

### N5 (non-blocking, against the orchestrator) · promoted probes are not portable, and the stale lane still exists

`probes-p1.txt` (17 entries) · `REV-S01-p1-security--probe-{a,b,c,d,e}.test.ts` ·
`REV-S01-p1-security--vitest.probe.config.ts` · `REV-S01-p1-correctness-tests-probe.test.ts`

The security probes and their config embed `/…/.worktrees/rev-s01-p1-security/…`; `git worktree list`
shows that worktree **still at `f6c147cc`**. Package README §2 orders every promoted probe re-run at
`53b903d2`; executing that instruction as written measures the pass-1 tree and reports a confident
green. Separately, the correctness lens's promoted probe uses relative `../../apps/ui/...` imports that
resolve only from inside the worktree's `tests/` tree — a second, incompatible convention. Six of the 17
entries are `.log`/`.txt` artefacts that cannot be run at all.

VERDICT: promotion must rewrite the lane root to a parameter, or ship a `run-probes.sh <worktree>` /
CONFIDENCE: high / STRONGEST COUNTER: *a reviewer should notice.* I did — after ~20 minutes and three
failed harness attempts. The next one may not.

### N6 (non-blocking) · the `F20_S1` class remedy never reached the branch it governs

`t_e74b5bf1` is closed on `79fb2183` (both `.codex/skills` copies synced). Measured:
`git merge-base --is-ancestor 79fb2183 53b903d2` → **NO**. At the FIX head the lane still carries the
tracked `.codex/skills/heartbeat-protocol/SKILL.md` at `version: 3.1.0 / spine_version: 3.0.0`
(`# Codex Heartbeat Protocol`), **341 diff lines** from the v4.0.0 authority, and
`scripts/sync-codex-skills.sh` is **absent** at `53b903d2`. Both FIX seats' `SKILLS LOADED` lines cite
that mirror — contrary to COMMON §1 (*"never a `.codex/skills/…` copy inside a lane … cite only the
`.claude` path"*). Otherwise both seats meet the worker floor (TDD, verification-before-completion,
systematic-debugging, receiving-code-review). A pass-3 Codex FIX dispatched into this lane inherits the
superseded law again.

VERDICT: cherry-pick the sync onto `slice/tiers-s01` before any further Codex dispatch, and re-open or
supersede `t_e74b5bf1` / CONFIDENCE: high / STRONGEST COUNTER: *it will vanish at merge.* Not before
pass 3 runs in the lane.

### Packet defects (against the orchestrator)

- **PD1 · `packet:10`** describes the S01-p2 package as *"(diff vs base, … the cluster map, … the
  dev-stack recipe)"*. The directory carries only `diff-f6c147cc..53b903d2.patch` — vs the **pass-1
  head**, not base — and no cluster map or dev-stack recipe; those live in S01-p1, as its own README
  says. The packet describes the pass-1 package while pointing at the pass-2 directory.
- **PD2 · `packet:17` vs `README:20`** disagree on my scope. The packet demands, for every lens, *"one
  mount of every surface this slice shares … on UI: rendered DOM with the real compiled CSS … both
  modes"*; README §20 scopes this lens to items 1, 2, 4, 5, 6 and the seam's (c)/(d) **at the test
  level**, giving the real DOM in both modes to the product lens. I followed the README and declare the
  browser pass UNVERIFIED (§4). A seat following the packet would duplicate the other lens entirely.
- **PD3 · `packet:9` vs `COMMON:3`** disagree on cwd — the packet names the worktree, COMMON calls the
  repo root *"the cwd for every command"*. The packet is right for a detached review seat; COMMON's line
  should say "your lane".

Packet constants I checked and found **correct**: HEAD `53b903d2` detached, 0 dirty; base `7f89f7b7`;
`f6c147cc` is the pass-1 head; `DONE.md` is exactly 168 lines; `design/S01/README.md` is exactly 33
lines and maps **14** `.dc.html` artboards + `canvas.json`; `SPEC-v2.md:232-266` is §2 steps 1–12.

---

## 3. Verdict

**REWORK — pass 2 of 3, lens correctness/tests.** One blocking finding (**B1**), six non-blocking
(**N1–N6**), three packet defects (**PD1–PD3**). Every pass-1 finding assigned to FIX is genuinely
fixed and genuinely pinned — proved by isolated mutants, not by reading the seats' tests (M4 for B1 /
correctness N2, M5 for correctness N1, M2 for product N1, M1 for the whole F1 set, M8 for the seam's
(d), M9 for correctness N4 with the caveat in N4). B1 is not a regression in those fixes; it is the
seam the FIX itself referred here, and it is blocking because page, stylesheet and style contract now
disagree about which mechanism locks a gauge.

## 4. UNVERIFIED — what I could not do, and why

- **SPEC-v2 §2 steps 5–6 in a real browser**: whether the two `<select>`s refuse to open and the three
  sliders refuse to move under a real drag or arrow keys. Not expressible in jsdom, and README §21
  assigns the real DOM in both modes to the product-truth lens. My P1 shows values are *restored*; it
  cannot show a control never moves.
- **Both modes / rendered geometry and colour against the 14 artboards.** Product lens's, per README §21.
- **N4's silent-pass case**: I could not construct a region-reader member where the OLD code passed
  green and wrong. Stated as diagnostic-only rather than claimed either way.
- **Whether `t_e74b5bf1` should be re-opened or superseded** — a board decision, not mine to make.

## 5. Predictions about the other lens (falsifiable — evidence that blindness held)

The product-truth lens is running item 3(a)(b)(d) in the real DOM plus SPEC §2 steps 1–12 in both
modes. I predict it **fails step 6 and files its own blocking finding**: with only `aria-disabled`, a
real Chrome `<select>` opens on click and a real range input's thumb tracks a drag before React's
restore snaps it back — so *"the dropdowns will not open and the three sliders will not move"* is false
by looking, even though every value ends up unchanged. I predict it finds M8's **paint** correct
(inline `opacity: .45; cursor: not-allowed` wins on specificity, so all 14 dim exactly as the artboards
draw, and it will confirm the collapsed-nine / expanded-fourteen counts), and product N1 fixed
(`claude-sonnet-5` on one line at 135px). I predict it does **not** catch B1, because B1 is invisible
from the browser — the page paints correctly and only the *test* is mis-anchored; it needs the two
mutants. Conversely I predict it catches something I could not: a focus-ring or hover artefact on the
now-focusable locked controls, which DONE.md §5 says the artboards do not draw. If it reports step 6
passing, one of us drove the control wrong and the disagreement itself is the V question.

---

## 6. For V

`V-ROW: NEW · S01 · the lock mechanism · Recommended default: keep F1's `aria-disabled` + guarded
handlers, and make the stylesheet and its contract follow it (key the lock on `[aria-disabled="true"]`,
delete the unreachable `:disabled` block at `globals.css:6264-6270`, drop the inline `FREE_LOCK_STYLE`,
repoint S01-42b) — accepting that SPEC-v2 §2 step 6 then reads "nothing changes" rather than "the
dropdowns will not open". Smallest yes/no for V: "In Free, is it enough that a locked gauge never
CHANGES — even if the dropdown still opens and the slider thumb still follows your finger before
snapping back?" · VERDICT: yes keeps the keyboard-reachable lock explanation product N3 asked for; no
restores native `disabled` and returns product N3 as V's to re-decide / CONFIDENCE: high that the two
readings differ in the browser, medium on which V prefers / STRONGEST COUNTER: DECISIONS.md:12 already
ratified native `disabled` FOR its tab-order behaviour, so "yes" reverses a ratified row and the honest
route is to re-ratify it explicitly rather than let a FIX carry it.`

**Why this is V's and not a seat's:** pass-1 product N3 (`t_7f4df45a`) and `DECISIONS.md:12` are in
direct contradiction — the finding attacks the exact property the decision was chosen for. FIX(S01) F1
resolved that contradiction by reversing `DECISIONS.md:12` and `:217` without a decision row. Whichever
way V rules, B1's mechanical half (page, stylesheet and contract must name one mechanism) has to be
fixed.
