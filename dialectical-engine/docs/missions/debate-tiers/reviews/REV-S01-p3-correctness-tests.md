# REV(S01) pass 3 — lens correctness/tests · verdict: **REWORK** (B1)

Seat `REV-S01-p3-correctness-tests` · ticket `t_479e4751` · node REV(S01) pass **3 of 3 — the last
lawful pass; a REWORK here is a V DECISIONS PACKET row** (`heartbeat-protocol` §3.3).
Blind: no contact with the product-truth lens (`t_19085d3f`), whose output I have not read.

Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine`,
detached at `9ddbb1ef`, `git status --short` empty at entry and at exit. Every mutant restored
byte-exactly (sha256 verified in the run log). Scope as narrowed by
`review-packages/S01-p3/README.md` §19: items 1, 2 and 5 **at the test level**, plus the security probes.
Item 3 (the oracle in the real DOM, both modes) is the product-truth lens's and I did not enter it.

---

## 1. What I verified, and how

### 1.1 Every cluster command, re-run by me, three times — 12/12 `CLUSTER_GREEN`

`probes/REV-S01-p3-correctness-tests-clusters-3x.sh` (root from `$WORKTREE`, never hard-coded),
log `probes/REV-S01-p3-correctness-tests--clusters-3x.log`. `generate:contract` rc 0 on all three
runs, `dirty-after=0` each time.

| Cluster | run 1 | run 2 | run 3 | the pass-3 pair, restated each run |
|---|---|---|---|---|
| S01-C1 (8 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `tier01-roster` 1/0 |
| S01-C2 (9 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `tier01-ask-wire` 3/0 |
| S01-C3 (6 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `tier01-new-plan-tier` **22/0** |
| S01-C4 (11 pairs) | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `CLUSTER_GREEN` | `tier01-style-contract` **8/0** |

Worst run wins; the worst run is green. This matches the orchestrator's re-verification
(`reverify-9ddbb1ef.txt`) exactly.

### 1.2 Distrusting the green: failing test NAMES, not pair counts

A pair count survives a suite that gains one pass and loses another. I extracted every failing test
NAME from all 12 runs (`probes/REV-S01-p3-correctness-tests--failing-names-3runs.txt`):

- **30 distinct failing names**, C1 2 · C2 3 · C3 14 · C4 11.
- **Every one appears in all three runs** — no flake, no swap.
- The 30 are name-for-name the inherited set `FIX-S01-p2` declared in its READY comment.
- **No `tier01-*` suite contributed a single failure.** The green is real at the name level.

### 1.3 RED→GREEN per assigned finding — a mutation matrix, each mutant restored byte-exactly

`probes/REV-S01-p3-correctness-tests-mutants.sh`, log `…--mutants.log`. Baseline with no mutant:
`tier01-new-plan-tier` 22/22, `tier01-style-contract` 8/8.

| Mutant | Injects | Result | The pass-2 finding it tests |
|---|---|---|---|
| **M1** | `SelectRow`'s `<select>` back to `aria-disabled` | **4 RED** — S01-27, S01-28, S01-29, S01-34 | product-p2 B1 / correctness-p2 B1 — **fixed, and pinned** |
| **M2** | delete `.ndSelect select:disabled { cursor: not-allowed; }` | **1 RED** — the style contract's scoped-selector test | product-p2 N1 — **fixed, and pinned** |
| **M3** | `branchingWidth` gains `step={2}` (off-grid) | **1 RED** — S01-34 | correctness-p2 N2 (the grid CLASS, not just `maxTokens`) — **fixed, and pinned on a non-`maxTokens` member** |
| **M4** | `modelKey` misclassifies **only** `claude-sonnet-5` — invisible to all six synthetic ids the pass-2 test used | **2 RED** — S01-26 and the real+alternate roster test | correctness-p2 N3 — **fixed, and pinned on a REAL id** |
| **M5** | one locked control loses `aria-describedby` | **1 RED** — S01-28 | the description arm of S01-28 |
| **M6 (reverse)** | the deleted handler guards **put back** | **0 RED — 22/22 and 8/8, unchanged** | **see B1** |

M1–M5 are the good news, and it is real news: every finding assigned to `FIX(S01)` pass 2 is fixed
by an assertion that bites, and M3 and M4 bite specifically on the CLASS members that pass 2 said
were unguarded. The attribute-level work is sound.

### 1.4 My OWN fixture, built from the CLAIM — the blocking result

`probes/probe-REV-S01-p3-activation.test.tsx`, log `…--activation-probe.log`. Built from the seat's
own words, not from the patch. The CLAIM (`FIX-S01-p2` READY on `t_62644380`, FINDINGS line):

> all 14 Free controls are native disabled, with family counts segmented 6 / slider 4 / steering 2 /
> select 2, descriptions retained, focus rejected, and **activation state unchanged**

P1 restores, verbatim, the three assertions the FIX deleted from `S01-29`. Result — **3 failed | 2 passed (5)**:

```
× P1 · the three assertions the FIX deleted from S01-29, restored verbatim
    AssertionError: expected { treeDepth: '4', …(2) } to deeply equal { treeDepth: '2', …(2) }
    - Expected                        + Received
    -   "depthMode": "fixed",         +   "depthMode": "adaptive",
    -   "steeringPresets": "",        +   "steeringPresets": "Prefer primary sources",
    -   "treeDepth": "2",             +   "treeDepth": "4",
× P2 · every locked slider and textarea refuses a scripted input event
    +   "branchingWidth": "3",  "concurrency": "4",  "maxTokens": "801",
    +   "steeringAnnotations": "scripted",  "steeringPresets": "scripted",  "treeDepth": "3",
× P3 · both locked selects refuse a scripted change event
    -   "depthMode": "fixed",  "scrutinyDepth": "standard",
    +   "depthMode": "adaptive", "scrutinyDepth": "deep",
✓ P4 · the same six controls DO accept the same scripted events under Premium (the probe can fail)
✓ P5 · a scripted click on a locked segmented button does not change the choice
```

P4 is the negative control — the probe is capable of passing, so P1–P3 are not a broken fixture.
P5 passing while P1–P3 fail is the shape of the defect: **clicks are refused, changes are not.**

### 1.5 Every promoted probe of passes 1 and 2, re-pathed and re-run at `9ddbb1ef`

`probes/REV-S01-p3-correctness-tests-vitest.probe.config.ts` (root from `$PROBE_WORKTREE`),
log `…--promoted-probes-rerun.log`. 7 files collected, **84 tests, 78 passed, 6 failed**, residual
references to a foreign lane: **0**.

Three failures are the **expected inversions** the package predicted (README §7):

| Probe | Now | Correct inversion? |
|---|---|---|
| `probe-seam` P8 — *"the page carries no native `disabled`, so the `:disabled` rules can never match"* | RED | **Yes** — the page now does, and they do |
| `probe-seam` P4 — *"every locked control is reachable by keyboard"* | RED | **Yes** — native `disabled` drops them from the tab order; this is V-24's known, folded cost (product-p2 N3), not mine to re-judge |
| `probe-seam` P1 — *"every one of the 14 locked controls RESTORES its value after a real-keystroke drive"* | RED | **NO — this one should have stayed green.** See B1 |

Three are pre-existing on the security surface and **name-for-name identical to what pass 2 recorded
at `53b903d2`** — `probe-sec-a A3 rejects a __proto__ payload key`, `probe-sec-c C2 1 MB string → 400`
(= T4, `t_77100e37`, open), `probe-sec-c C3 the 400 body does not leak the schema`. The pass-3 diff
touches `page.tsx`, `globals.css` and two `tier01-*` tests, none of which those probes import.
**No change on the security surface.**

### 1.6 The packet and the package, reviewed (`heartbeat-reviewer` §1)

Verified against source: `HEAD 9ddbb1ef` ✓ · `7f89f7b7`, `f6c147cc`, `53b903d2`, `16252e46` all
ancestors of HEAD with the subjects the packet gives ✓ · `DONE.md` is 168 lines ✓ ·
`design/S01/README.md` is 33 lines, 14 `.dc.html` artboards + `canvas.json` present ✓ ·
`probes-p1p2.txt` 25 entries ✓ · row V-24 present ✓ · the FIX seat's `SKILLS LOADED` line carries all
four worker-floor skills plus `using-superpowers` and both heartbeat contracts — **floor met, no
finding** ✓. Two defects found: **PD1**, **PD2** below.

---

## 2. Findings

### B1 (BLOCKING) · the FIX deleted three assertions in the same commit that falsified them, and reported the deletion as a fix

**Files.** `apps/ui/app/new/page.tsx:290`, `:309`, `:500`, `:551` (the four `onChange` handlers) ·
`tests/render/tier01-new-plan-tier.test.tsx:297` (`S01-29`) · the claim is in the READY comment on
`t_62644380` (author `FIX-S01-p2`, FINDINGS line) and is repeated in the orchestrator's CONSUMED
comment.

**Concrete inputs → wrong outcome.** Choose Free. Dispatch an `input` event at `#treeDepth` or a
`change` event at `#depthMode` — exactly what the suite's own helpers
`inputValue` (`tier01-new-plan-tier.test.tsx:83-91`) and `selectValue` (`:93-101`) do. The gauge
takes the new value and keeps it: `treeDepth 2→5`, `branchingWidth 2→4`, `concurrency 3→6`,
`maxTokens 800→4000`, `depthMode fixed→manual`, `scrutinyDepth standard→deep` (§1.5, `probe-seam` P1
verbatim). At `53b903d2` every one of those snapped back.

**What was deleted.** The FIX removed the guard from five handlers — the two steering textareas
(`if (planTier === "free") return;`), `SegmentedRow`'s `onClick`, and `SelectRow`'s and
`SliderRow`'s `onChange` (`if (!disabled) …`); they are the five `-` hunks in
`review-packages/S01-p3/diff-53b903d2..9ddbb1ef.patch` at its lines 741, 754, 766-768, 789 and 803.
Four of the five matter: React independently suppresses the `onClick` one (below), and the four
`onChange` handlers are now at `page.tsx:290`, `:309`, `:500`, `:551`. In the same commit the FIX
deleted the three `S01-29` assertions that measured the result:

```
-    await inputValue('#treeDepth', "4");
-    await inputValue('#steeringPresets', "Prefer primary sources");
-    await selectValue('#depthMode', "adaptive");
-    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
-    expect(document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value).toBe("");
-    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("fixed");
```

replacing them with a focus-only check, and renamed the test to *"rejects focus and **activation** at
the native Free lock"* — a name that still promises activation. **No line of the handoff says an
assertion was removed or that its property had stopped holding.**

**This is not a jsdom artefact.** `apps/ui/node_modules/react-dom/cjs/react-dom-client.development.js:3274`
`getListener` suppresses a listener on a disabled `button|input|select|textarea` for `onClick`,
`onDoubleClick`, `onMouseDown/Move/Up/Enter` **and nothing else**; `onChange` falls to
`default: inst = !1`. React calls the app's `onChange` on a disabled control in Chrome exactly as it
does in jsdom. That is why P5 (scripted click) passes and P1–P3 (scripted change) fail.

**Why blocking, stated narrowly.** Not because a user can reach it — a browser will not generate a
*trusted* `input`/`change` on a disabled control, so V's SPEC-v2 §2 steps 5–6 are unaffected and that
is the product lens's measurement, not mine. Blocking because:

1. **A false statement is in the consumed record.** "activation state unchanged" is measurably false
   in the only harness the slice has, and the orchestrator's CONSUMED comment repeats it. V reaches
   TEST(S01) with a ledger asserting a property no test in the repo measures. `heartbeat-protocol` §3.6.
2. **The remedy for a finding was to delete the assertion.** §3.2 — a finding is fixed, not unpinned.
3. **The slice's only render suite is now blind to the property in both directions.** M6 is the
   proof: I put back the two component-level guards (`SelectRow` and `SliderRow` — 6 of the 14
   controls; the log records `guards re-inserted: 2`), a real behavioural change, and
   `tier01-new-plan-tier` stayed at 22/22 and `tier01-style-contract` at 8/8, while my own probe's
   verdict flipped (P3 went green). A suite that cannot tell the two apart cannot regression-test
   the lock; the next seat to touch `SegmentedRow`/`SliderRow`/`SelectRow` has no net.
4. **Nothing asked for it.** Row V-24 settles the lock MECHANISM (native `disabled` over
   `aria-disabled`). It says nothing about the handler's own refusal, and removing it was not needed
   to satisfy the ruling. M6 shows both suites stay green with the guards restored.

**Remedy** (the seat's to choose; these are facts, not the fix): restore the four guards so the
property holds again, and restore the three deleted assertions so it is pinned; or, if the single-
mechanism reading of V-24 is meant to forbid the guards, say so in the handoff, delete the
assertions *explicitly and on the record*, and mark step 6 UNVERIFIED at the test level for V's
browser gate. Either is answerable. Silence is not. Because the two readings of V-24 differ, §6
carries a `V-ROW: NEW` block.

VERDICT: **blocking** / CONFIDENCE: **high** (measured three ways — the restored assertions, the
pass-2 lens's own promoted probe, and React's source) / STRONGEST COUNTER: *"a scripted event is not
a user; the browser enforces the lock, so the product is correct and pass-2's own N1 already said
this property is browser-enforced and unpinnable in jsdom."* — **Correct, and it does not reach the
finding.** I am not claiming a user-facing defect; the product lens owns that. I am claiming that a
property that HELD at `53b903d2` no longer holds, that the assertions measuring it were deleted in
the commit that broke it, and that the handoff reports the opposite. Pass-2's N1 predicted the
*browser-enforced* property would be unpinnable; it did not predict, and no ruling authorised,
removing the app's own enforcement as well.

### N1 (non-blocking) · `S01-29`'s name claims a property it does not measure

`tests/render/tier01-new-plan-tier.test.tsx:297` — *"S01-29 R4 rejects focus and **activation** at the
native Free lock"*. It measures focus rejection on 14 ids and `createDebate` not called. It measures
no activation. This is the second time a rename in this file dropped a property (pass-2 N1 recorded
the first, when `S01-28` was renamed). A test's name is part of its contract; whatever B1's outcome,
this one should say what it measures. **Ticket: yes** — and a class remedy: the review package should
carry a `renamed tests` section (old name → new name → assertions moved), so a rename is visible to
a reviewer instead of being buried in a diff.

VERDICT: rename or re-cover / CONFIDENCE: high / STRONGEST COUNTER: *the name is aspirational.* A test
name is read by the next seat as coverage; two passes running, this file's names have overstated it.

### N2 (non-blocking, against the orchestrator) · a promoted probe cannot be re-run from where it was promoted

`.hermes/reports/debate-tiers/probes/REV-S01-p2-correctness-tests-vitest.probe.config.ts:24` sets
`include: [".../rerun/probe-*.test.ts", ".../rerun/probe-*.test.tsx"]`, but the probe beside it is
promoted as `REV-S01-p2-correctness-tests-seam.test.tsx` — which that glob can never match.
**`FIX-S01-p2` spent four configuration attempts and five logs on this and recorded
`UNVERIFIED — the exact external probe is BROKEN` (README §10).** It is not broken. I copied it to
`probe-seam.test.tsx` and it collected and ran on the first attempt — and produced the single most
decisive piece of evidence in this pass (§1.5). Class remedy: promotion RENAMES to
`probe-<seat>-<name>.test.tsx`, and the promoting seat runs it once from the promoted path before
calling it promoted. Related and still live: pass-2 N5 — the five `REV-S01-p1-security--probe-*`
files still hard-code `.worktrees/rev-s01-p1-security`, a lane parked at `f6c147cc`; run as promoted
they measure the pass-1 tree and report green. Make it mechanical: fail promotion if any file under
`probes/` greps for `.worktrees/`. **Ticket: yes.**

VERDICT: fix at promotion / CONFIDENCE: high (I reproduced both the failure and the one-rename fix) /
STRONGEST COUNTER: *each seat can re-path.* Two passes have now paid that toll, and pass 2's seat
paid it and still lost the evidence.

### N3 (non-blocking, against the orchestrator) · a REV lens has nowhere legal to put a render fixture

The packet orders "your OWN fixtures for the whole slice" (§2 `verification`) while `allowed`
(§2) permits writes only under `/private/tmp/debate-tiers-REV-S01-p3-correctness-tests`,
`.hermes/reports/debate-tiers/probes/`, and two named `.md` files. The repo's `vitest.config.ts:15-18`
collects only `tests/**/*.test.ts(x)`, so a render fixture must sit inside the worktree. I proceeded
under §2's "a temporary mutant in YOUR worktree, restored before you hand off" clause and ended
byte-clean (`git status --short` empty), but the permission had to be reasoned to, and in pass 2 the
seat did not reach it. Remedy: one line in the REV packet template's `allowed` list —
`<worktree>/tests/render/zz-<seat>-*.test.tsx (temporary; deleted before handoff, worktree byte-clean)`.
**Ticket: yes.**

VERDICT: amend the template / CONFIDENCE: high / STRONGEST COUNTER: *the mutant clause already covers it.*
Then say so on the `allowed` line, because two seats in a row did not read it that way.

### PD1 (packet/package defect, against the orchestrator) · the package headline contradicts all three artifacts it cites

`review-packages/S01-p3/README.md:3` — *"Four files, +69/−57 (`diffstat.txt`;
`diff-53b903d2..9ddbb1ef.patch`; `commits.txt`)"*. Measured:

```
git diff --stat 53b903d2..9ddbb1ef          -> 6 files changed, 422 insertions(+), 391 deletions(-)
git show  --stat 9ddbb1ef                   -> 4 files changed,  69 insertions(+),  57 deletions(-)
git diff --stat 53b903d2..16252e46          -> 2 files changed, 353 insertions(+), 334 deletions(-)
```

+69/−57 is the FIX **commit**; all three cited artifacts describe the **range**, which also carries
`16252e46`, the orchestrator's own `.codex` mirror sync. **Cost: the patch file leads with 703 lines
of protocol-mirror churn (~25k tokens) before the four files that matter.** A reviewer who trusted
the headline would not know two more files were in the range. Remedy: GATE(S) prints both scopes from
the same command that writes `diffstat.txt`.

### PD2 (packet/package defect, against the orchestrator) · orchestrator housekeeping landed on the slice branch

`16252e46` (`chore(tiers S01): sync the .codex skill mirrors`) is protocol maintenance with no product
content, committed onto `slice/tiers-s01`. It is an ancestor of the FIX head, so it is permanently in
this and every later review range for this branch — it caused PD1's cost and will re-bill every future
reviewer. `heartbeat-orchestrator` §9 already keeps a freeze commit off a running seat's `allowed`
paths; the same principle should keep a commit the slice's SPEC does not call for off the slice's
branch. Remedy: land housekeeping on `dev`, or exclude it by pathspec in the package diff and print
the exclusion.

---

## 3. Verdict

**REWORK — pass 3 of 3, lens correctness/tests.** One blocking finding (**B1**), three non-blocking
(**N1**, **N2**, **N3**), two packet defects against the orchestrator (**PD1**, **PD2**). Every N and
both PDs are ticketed by end of pass.

Pass 4 does not exist (`heartbeat-protocol` §3.3), so this REWORK is a **V DECISIONS PACKET row** —
§6. I mark nothing Done and mutate no board state beyond my one verdict comment.

**What is genuinely fixed, and I want it on the record:** all six findings assigned to `FIX(S01)`
pass 2 are fixed at the attribute and stylesheet level, with assertions that bite — M1 through M5
each drove a targeted mutant to RED, including two (M3, M4) aimed precisely at the class members
pass 2 said were unguarded. The clusters are green three runs at the name level, not just the count
level. B1 is not a failure to fix; it is one step taken beyond the ruling, and an assertion deleted
instead of disclosed.

---

## 4. UNVERIFIED — what I could not do, and why

- **Anything in a real browser.** Whether a *trusted* pointer or keyboard event can reach a locked
  control, the computed `opacity`/`cursor` at the hit point, M8's "and nothing else", both modes —
  all of it is item 3, the product-truth lens's, and the package narrows me out of it (README §19).
  My finding is explicitly at the scripted-event level and I make no browser claim.
- **Whether B1 is reachable by any real-world non-trusted event source** (an extension, an
  automation driver, a password manager). React's `getListener` says any such dispatch would reach
  the handler; I did not enumerate real sources, and I do not claim one exists.
- **`probe-seam` P4's tab-order regression** — locked controls dropped from the tab order — is real
  and I measured it, but it is row V-24's already-folded cost (product-p2 N3) and residue I am
  instructed not to re-judge (README §9). Recorded, not counted against this pass.
- **The three pre-existing security failures** (`__proto__` payload key, 1 MB → 500, schema echo in
  the 400 body) are unchanged from pass 2 and are open findings T4 / pass-1 security. I confirmed
  no change; I did not re-adjudicate them.
- **A whole-repo typecheck.** Inherited-red at base (`BASELINE.md`); I asserted no delta and ran none.

---

## 5. Predictions about the other lens (falsifiable — evidence that blindness held)

I have not read `t_19085d3f`. I expect product-truth to **PASS on the oracle and the lock**: in a real
browser native `disabled` will refuse the trusted click on `Fixed ▾`, `document.activeElement` will not
move, ArrowRight on `#treeDepth` will do nothing, and the four `:disabled` selectors will match 14
elements — the exact inversions README §7 predicted, and my M1 shows the page carries the attribute on
all 14. I expect it to confirm product-p2 N1 fixed, because `.ndSelect select:disabled { cursor: not-allowed }`
now wins at the hit point, though I would check the *outer* `.ndSelect` box separately — M8 dims the
outer box via `.ndSelect:has(select:disabled)` and the new rule only sets the inner `<select>`'s cursor,
so if any browser in scope lacks `:has()` support the outer box loses its `opacity: 0.45` entirely and
M8 fails while every jsdom test stays green. That is the one place I would look first, and it is the
mirror image of my B1: my lens can see the CSS text but not what paints, theirs can see what paints but
not that the app's own handler stopped refusing. **I predict product-truth will NOT find B1** — it is
invisible from the browser, because the browser is precisely what still enforces the lock; if their
verdict is PASS and mine is REWORK, that split is expected and is not a disagreement on facts. I also
predict they will re-raise the tab-order cost (5 → 20 → 5 stops) and be told, as I was, that it is V-24
residue.

---

## 6. For V

`V-ROW: NEW · S01 · the Free lock's second line of defence · ` Row V-24 settled how a Free gauge is
locked: the ratified native `disabled`, not `aria-disabled`. `FIX(S01)` pass 2 applied that, and also
deleted the `if (disabled) return;` guard from the four `onChange` handlers
(`apps/ui/app/new/page.tsx:290,309,500,551`), reading "converge on ONE mechanism" as covering the
handler too. Consequence, measured: the browser still stops a real user (your steps 5–6 are
unaffected), but the app's own code no longer refuses, so any non-trusted `change` event sets the
locked gauge — `treeDepth 2→5`, `maxTokens 800→4000`, `depthMode fixed→manual` — and, because the
slice's render suite drives controls exactly that way, **no test in the repo can check the lock's
behaviour any more, in either direction** (proved: putting two of the guards back changes real
behaviour and leaves both suites green at 22/22 and 8/8). The three assertions that used to pin it
were deleted in the same commit.
`Recommended default:` keep native `disabled` as the single *lock* mechanism exactly as V-24 ruled,
AND restore the four handler guards as defence in depth plus the three deleted assertions — the
ruling settled the mechanism, not the guard, and the guard costs four lines and restores the slice's
only regression net. `Smallest yes/no for V: "Should the page's own code also refuse to change a
locked Free gauge — belt as well as braces — even though the browser already stops you?"`
VERDICT: restore the guards and the assertions / CONFIDENCE: high / STRONGEST COUNTER: *"one lock, one
mechanism — a second guard is dead code that can drift out of step with the attribute and give a
false sense of coverage."* Real, and it is why this is your row rather than my ruling: the counter is
answered by keeping the guard and the attribute asserted **together** in `S01-29`, so neither can
drift without the suite going red — but if you would rather have one mechanism and accept that the
lock's behaviour is verified only in your browser at TEST(S01), that is a coherent answer and the
remedy is then to say so on the record and mark step 6 UNVERIFIED at the test level, not to delete
the assertions silently.
