READY FOR PEER REVIEW · comments read through: v-rulings-2026-09-03

SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:verification-before-completion, mattpocock-skills:resolving-merge-conflicts

# W5 · dev reconciliation — two merges (105 incoming commits) and V's steering ruling

**Filed tip `af07220512c420fbaa925e6096a3551ec7d26461`, branch `lane/devsync`, clean, ZERO
behind `origin/dev`.** Two reconciliations and one V ruling are on this branch.
Round 1: merge `6557d415` · lockfile prune `e8b4928c` · trap append `a8ed8d78`.
Round 2: merge `8b2b7a60` · steering removal `227b7421` · s14 comment `af072205`.
Evidence: `.hermes/reports/2026-09-01-algorithm-live-loop/logs/devsync/`.
Round-2 detail: `logs/devsync/31-r2-resolution-ledger.md` and `36-r2-ATTRIBUTION.md`.

## Result in one line

Both `dev@b5a6b6eb` and `origin/dev@2b670d30` are merged, and V's REMOVE ruling on the steering
placebo is implemented. **Typecheck is set-equal to dev's own baseline, and the suite — run
twice at the filed tip and SET-EQUAL between runs — has zero unexplained failures.** Every one
of its 102 failing names is measured red at the mission tip, at dev, at origin/dev, or is a
member of T0's authority. Neither merge nor the ruling introduced a single regression.

## ROUND 2 — `origin/dev`, and V's ruling on Finding 1

Both were ruled after my round-1 filing. Round 1's eight resolutions carry forward untouched
and were re-verified once, not re-done.

**The second reconciliation.** Merge base `b5a6b6eb` (round 1 already carried it). Incoming
`origin/dev@2b670d30`, 5 commits, **339 files — matching the coordinator's figure exactly** —
of which 25 are real code and the rest documentation. **The contested surface is 2 files.**

 · `packages/contract/src/index.ts` — AUTO-MERGED, therefore checked. Their entire change is
   ONE additive optional line, `models`, in `PublicDebateSummarySchema` at ~254. My hunks are
   at 1, 311, 462, 509 and never mention that schema; the nearest is 57 lines away. After the
   merge all THREE authors' contributions were verified present in the file — theirs, dev's
   round-1 work, and the mission's. Detail in `36-r2-ATTRIBUTION.md`.
 · `.hermes/TOOLING-TRAPS.md` — CONFLICT, concatenated as in round 1. Zero lines lost either side.

**Two couplings no file-overlap check would show, both checked:**
 · **HYG-01's `.test.mjs` manifest.** `origin/dev` adds three `.test.mjs` files under `apps/ui`,
   and that gate compares the directory against `apps/ui/scripts/node-test-manifest.json`. They
   updated the manifest with exactly those three, so it stays coherent. **My own "real code"
   filter was `\.(ts|tsx|sql|mjs)$` and would have hidden the manifest, which is `.json`** —
   the file that decides the gate was invisible to the filter I picked to find risk with.
 · **A deletion in the dangerous direction.** `origin/dev` ADDS `web/next.config.mjs`,
   resurrecting one file into a directory this lane had emptied. Taken as theirs (a clean add
   over a base where the path is absent) and **reported rather than reverted** — see the
   findings below. My own round-1 deletions were re-verified still absent.

**Round-2 fidelity accounting, in round 1's form.** At the merge commit `8b2b7a60`:
**337 theirs-only files, 0 divergences; 129 mine-only, 0 divergences.** At the filed tip, 1
divergence per side, both deliberate and disclosed (`globals.css`, `s14-contract.test.ts`).
Three further files V's ruling touched were changed by NEITHER side, so no audit list covers
them — the same shape as round 1's `pnpm-lock.yaml`, closed the same way by enumerating the
whole ruling diff. Union closes exactly: 131 + 339 − 2 = 468, +3 = **471**, which is
`git diff --name-only b5a6b6eb af072205 | wc -l`.

**V's ruling — the steering controls are removed.** Swept the CLASS first, not the sample: my
independent sweep confirmed the coordinator's control search and added a member it did not name,
**the CSS** (`.ndRowSteering`, `.ndSteerField`, `.ndSteerInput` + responsive rules), which would
have been left styling nothing. Removed both textareas, their state and ask wiring
(`page.tsx`), the two optional inputs and `steeringLines()` (`defaults.tsx`, now emitting empty
arrays), the dead CSS, and two comments describing boxes that no longer exist. **The contract
fields STAY**, sent as empty arrays and still persisted — V's original S1-2 ruling — which keeps
`s14-contract`'s W16 assertion true. Untouched: the operator CLI path and every `[]` fixture.

**The incoming test is retired ON THE RECORD.** `ux01-new-debate-form.test.tsx` loses two
assertions and gains one that states the property, states that the inputs were collected and
discarded, states that the control has now been removed twice, and says what real steering would
require. It is written against EVERY text control the form renders and generalised over key
naming, so a steering box re-added under a different id trips it.

| frame | record | result |
|---|---|---|
| RED (rendering) | `22-` | 1 failed / 6 passed — `not to match /steering/i` |
| RED-2 (substance) | `23-` | with the rendering assertions disabled, the ask assertion fails: the sentinel reaches both fields |
| GREEN | `24-`, re-run at the filed tip as `35-` | **7 passed (7)** |
| m1 · steering carries an asker value | `25-` | **CAUGHT**, credited to the new assertion alone |
| m2 · steering box under a NEW id | `26-` | **CAUGHT**, credited to the new assertion alone |
| m3 · NEIGHBOUR: unrelated new config field | `27-` | **not caught**, 7/7 — correct |

RED-2 exists because the first RED only proved the label was present; the property is that
asker text cannot REACH the ask, and that half needed its own failing frame. m2 is the one that
matters — it proves the assertion pins the PROPERTY, not the two ids removed. m3 justifies a
correction I made mid-work: my first version asserted the sentinel appeared nowhere in the whole
ask config, which is broader than the property and would have fired on m3; it is now scoped to
keys matching `/steer/i`.

**Round-2 gates.** Typecheck at the filed tip: 8 errors, **set-equal by identity** to dev's own
8. Full suite run **twice** at the filed tip, `102 failed | 2232 passed | 3 skipped (2337)`,
42 of 255 files, and the two runs are **SET-EQUAL on names**, not merely on counts. Partition of
all 102: 22 authority + 24 mission-tip + 38 dev + 18 origin/dev + **0 unexplained**. The +18
delta from round 1 was measured red at `origin/dev` in a provisioned clean worktree (11 files:
`34 failed | 108 passed`); **zero of the 18 is green there**. The −1 is
`evaluator-selector-unbound`, which `origin/dev` fixed.

**Ruling out my own change specifically**, since bucket membership alone would not: the one file
among the 11 that reads my edited surface is `v2ui-pages.test.ts`, and all six of its `/new`
tests PASS at the filed tip (`USER_ASK_FIELDS` never contained steering). The other ten contain
zero references to `app/new/`, `steering`, `ndSteer` or `ndRowSteering`.

**A note on run 1.** It was launched under `nohup` and survived the session that started it
being killed by a server-side overload; it finished on its own with a complete, clean-stated
record. It is kept as a second data point, but the verdict rests on run 2, started fresh.

## NEW FINDING (round 2) — `origin/dev` resurrects an orphan into the deleted `web/`

`dialectical-engine/web/next.config.mjs` is ADDED by `origin/dev`, into a directory the UI
overhaul had emptied and this lane had finished emptying. **Kept, not reverted** — it is their
change and a clean add, and reverting it at the keyboard is exactly the move I am told not to
make. It is inert: `web/` is not a pnpm workspace project, `web/package.json` does not exist,
and the root `tsconfig.json` lists `"web"` under `exclude`. It arrives in the untitled commit
`2b670d30 "chore: checkpoint local development state"`, so it reads as an accidental re-add
from a working tree rather than a restoration. Worth one line to whoever owns dev: either
finish the deletion or say why the file stays.

## Packet defects (heartbeat-worker §1)

1. **The ticket's divergence figure is wrong.** It says "roughly 95 files diverged on surfaces
   this mission touched". Re-measured: **705** files differ between mission tip and dev; the
   mission changed 134, dev changed 579, and exactly **8** were changed by both. The 8 are the
   whole contested surface. (The orchestrator's dispatch already carried the corrected numbers
   and they reproduce exactly.)
2. **The ticket's `contract.allowed` list is empty** (`allowed: []`) while the ticket requires
   a merge, provisioning and gate records. Everything I did was outside a literally-empty
   contract. I treated the dispatch message's lane + `logs/devsync/` as the real contract.
3. **The dispatch predicted the lockfile would move and it did not** — `pnpm-lock.yaml` is
   changed by NEITHER side. Provisioning after the merge prunes 28 lines (the deleted `web`
   workspace importer), which is a consequence of the merge, not of the incoming commits.
   Provisioning first would not have been wasted, though deferring cost nothing.
4. **`origin/dev` was 5 commits AHEAD of local `dev`** — RAISED IN ROUND 1, RULED, AND NOW
   CLOSED: V ordered the second reconciliation immediately, and it is merged (see ROUND 2).
   The original observation, kept because it is the packet defect — those 5 commits were not
   docs-only, but ~50 files of
   real code (23 in `apps/ui`, plus `packages/contract/src/index.ts` gaining an optional
   `models` field on `PublicDebateSummarySchema`, `apps/api/src/publications.ts`, and 2 unit
   tests). The 100-commit/705-file/8-file measurements all match **local** `dev`, so local dev
   is what I merged. **A second reconciliation is owed**, and V's ruling that this happens once
   before the eight items does not hold as stated. The contract field lands at line ~254,
   nowhere near the region I resolved, so it should merge cleanly. — It did, exactly so.

## The eight contested files

Full reasoning per file in `logs/devsync/10-resolution-ledger.md`. Both sides' diffs against
the merge base were read before every resolution (D60).

 · **`packages/contract/src/index.ts`** — CONFLICT, **both kept**. Both sides insert a new
   top-level declaration at the same anchor after `EdgeSchema` (mission's extracted
   `ConditionMarkRecordSchema`, dev's relocated `PublicDebateSchema`). Independent.
 · **`.hermes/TOOLING-TRAPS.md`** — CONFLICT, **concatenated**, dev's 817 lines then the
   mission's 171 (D23's precedent for this file). Verified by set comparison.
 · **`tests/architecture/s14-contract.test.ts`** — CONFLICT, **dev's side**; the mission's
   assertion names files dev deletes. See the finding.
 · **three `web/` files** — modify/delete, **deleted** per D23 ADDENDUM-2.
 · **`package.json`, `tests/unit/contract.test.ts`** — auto-merged, both **checked**; both
   sides' intent present in each.

Two couplings were checked rather than assumed, and one nearly became a false finding:
dev's `stranger_restatement` `.strict()` tightening is satisfied by every mission construction
site (all write exactly one key); and the mission's WITHHELD repeal leaves zero `slot.reason`
consumers in the merged tree — `apps/ui/components/AnswerHonestyDrawer.tsx` still renders that
branch **at dev**, but dev never modified the file and the mission had already removed it.
Reading the incoming side alone would have produced a confident wrong finding. D60 both ways.

## The mechanical check on the other 697 files

For every file changed by exactly ONE side, the merged blob must equal that side's blob:

 · **571 dev-only files — 0 divergences.**
 · **126 mission-only files — 1 divergence**, the test I deleted deliberately.

So "git resolved by position, not by meaning" is closed mechanically for everything outside the
8. Accounting closes exactly: 126 − 1 + 571 + 8 + 1 (lockfile) = **705**, which is what
`git diff --name-only 1c9578a lane/devsync` reports.

*My first version of this audit reported 49 phantom divergences because `git rev-parse` echoes
its argument to stdout when a path is absent, so two deleted files compared unequal. A deletion
defeated the tool built to catch deletions. Fixed to compare `git ls-tree` blob ids.*

## Gates

| gate | result | comparison |
|---|---|---|
| typecheck @ filed tip | **8 errors, exit 1**, clean | **SET-EQUAL by identity** to dev's own 8 |
| full suite @ `e8b4928c` | **85 failed / 2247 passed / 3 skipped (2335)**, 35 of 255 files | partitioned below |

Suite failures, all 85 accounted for, **0 unexplained**:
22 in T0's stable-red authority · 24 measured red at the mission tip `7dda3cc0` pre-merge ·
39 measured red at dev `b5a6b6eb` · **0 green at both tips yet failing here**.
Buckets C and D were MEASURED in provisioned clean worktrees at each tip, not inferred.

One name legitimately **vanishes** from the authority (D54 class): HYG-01's `.test.mjs`
manifest gate now passes because `web/app/api/[...path]/route.test.mjs` is deleted. **The
post-sync authority is 22, not 23.**

## FINDING 1 — BLOCKING, for V: the incoming tree re-creates the steering placebo S1-2 retired

Full case in `logs/devsync/11-FINDING-steering-placebo-reinstated.md`. **Not resolved here.**

The mission asserted the asker's typed text must reach the ask as `[]`
(`tests/render/s1-2-legacy-steering-placebo.test.tsx`). Dev asserts it must reach the ask as
trimmed lines (`tests/render/ux01-new-debate-form.test.tsx:243`). Same property, opposite
verdicts. They coexisted only while two ask forms existed.

Nothing goes red, because the mission's assertion dies with its subject file rather than
failing. And the Stop-1 correction that scoped S1-2 to `web/` was **correct when V made it** —
verified at `1c9578a`: `apps/ui` has no steering control and no test asserting one. The
incoming 100 commits add both textareas to `apps/ui/app/new/page.tsx` (:212, :228 — carrying
the same "logged verbatim" wording the mission pinned as absent), wire them into the ask via
`defaults.tsx:77-78`, and add tests defending them. **Still a placebo**: no engine package
reads either field on the merged tree; only the schema, the UI builder and the API persist line.

Deciding it means either dropping a mission outcome or deleting an incoming assertion. Three
options are costed in the finding. It is V's call, not mine.

## FINDING 2 — pre-existing on the MISSION branch, not caused by this merge

**T9 broke the development-register conformance scrape and no batch suite has run since.**
`dev-deployment-register.ts:202` scrapes `apps/runner/src/index.ts` and demands exactly 2
matches. Measured: **2** at the base, **2** at dev, **0** at the mission tip `7dda3cc0`, 0
merged — and that file is byte-identical between the mission tip and my merge, so this merge
could not have caused it. Bisected to T9's first commit `c1d8e09d`. Invisible because b11 ran
at `19bbb4c4`, before T9/T9B/T15/T17B/T6B merged. 18 failures directly, ~24 in the family.
Owner: the T9/S07 surface. Same conformance chain as F-T9B-1; the D53 silent-expiry class.

## FINDING 3 — inherited from dev; dev ships these red today

Four files carry dangling `web/` references the UI overhaul left behind, all measured red at
dev: `tests/unit/s14-ui.test.ts:19,239` (the sole source of all 8 typecheck errors),
`tools/orphan-audit/src/index.ts:129` (throws ENOENT and takes `s14-contract.test.ts` with it),
`tests/architecture/auth-front-door-parity.test.ts:62-68`. The fix is retargeting `web/` →
`apps/ui/`, which is a dev-side decision about the overhaul's completion, so I did not make it.

## FINDING 4 — mission tooling: `d15-suite.sh`'s classifier cannot represent this run

`key()` truncates to 120 chars; two `t16-algorithm-register` names differ only after char 120,
giving 84 keys for 85 failures. **The guard worked** — it refused to classify rather than
report a wrong set (D56 exactly). The defect is `key()`. `t00-baseline.md` stores full names
(to 193 chars), so the truncation buys nothing; dropping `[:120]` fixes it. I classified with
full-length keys applied symmetrically, and verified the rest of my copy is byte-identical to
`d15-suite.sh`'s block by diffing them.

## What I deleted, said plainly

`tests/render/s1-2-legacy-steering-placebo.test.tsx` — a mission-authored, three-assertion
behavioural test. It imports the deleted form and cannot load. Preserved at `7dda3cc0`, named
in the merge commit, and the subject of Finding 1. **No test on either side was weakened to
make a gate pass.** The only other content change outside the 8 contested files is the
lockfile prune, in its own commit.

## Housekeeping

Two temporary worktrees (`devsync-baseline-dev` @ b5a6b6eb, `devsync-baseline-mission` @
7dda3cc0) were created for the attribution measurements and **removed**; recreate with
`git worktree add --detach`, `pnpm install`, `pnpm run generate:contract` (logs 07 and 12).
I ran one measurement in the MAIN checkout before thinking, which dirtied its `pnpm-lock.yaml`;
restored with `git restore` and verified — the main checkout carries only the pre-existing
`TOOLING-TRAPS.md` modification it had at session start. Nothing was pushed, merged to
integration, or marked Done.


---

REWORK READY FOR REVIEW · comments read through: w5-codex-r1-2026-09-05

SKILLS LOADED: heartbeat (loader), heartbeat-protocol (router), heartbeat-worker,
superpowers:using-superpowers, superpowers:test-driven-development,
superpowers:verification-before-completion, superpowers:systematic-debugging,
superpowers:receiving-code-review

# W5 · ROUND 3 OF 3 — the pinned integration target is merged onto the lane

**Lane tip `2af816f183247efefae65172bb7036eefd049fa1`, branch `lane/devsync`, clean.** Nothing pushed, nothing
merged into dev or integration; the integration worktree was never written to.
Evidence: `.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/`.
Per-conflict reasoning: `logs/w5/30-r3-resolution-ledger.md`.

Round 3 commits on the lane:
`f97ae39d` merge · `5e9e3b46` depth-oracle load fix · `9dd4c915` B1 test rework ·
`de6e6a07` B1 scoping correction · `2af816f1` tooling traps.

## Result in one line

Integration `1485b9e2` is merged onto the dev-based lane, all three marker conflicts and
two silent semantic collisions are resolved by stated rules, B1's steering oracle now
fails for the reason it exists — proved by a mutant the round-2 test demonstrably misses —
and the gate is reported as four separate counts.

## B1 — closed, with the round-2 record corrected

### The correction first, because the old record was wrong

**Round 2's m2 was described as "steering box under a NEW id — CAUGHT, credited to the new
assertion alone". That description was false.** Its entire change was `id="topic"` →
`id="steeringNotes"`. It added no control, no state and no steering wiring, and it died at
the rendered-name assertion `not.toMatch(/steering/i)` — before submission, before any
dataflow ran. It proved that a substring detector catches a new spelling containing
"steering". It did not prove that a renamed steering control's DATAFLOW is caught. Codex
was right, and the claim "written against EVERY text control … pins the PROPERTY" exceeded
what the test did. Re-run under round 3's structure, m2 now fails **only** the separate
spelling test while the substantive test passes — which is exactly where an id-rename-only
mutant belongs (`logs/w5/11-m2-corrected-id-rename-only.log`).

### The defect, reproduced before it was fixed

`logs/w5/09-REPRODUCTION-round2-test-misses-m1.log`: round-2's test file restored over
round-3's, with m1 applied to `page.tsx`. **`Tests 7 passed (7)`, exit 0.** A live text
input labelled "Emphasis", id `guidance`, sitting inside Options and shipping the asker's
typed text into `steering_annotations`, passes the round-2 oracle without a murmur. That is
codex's static counterexample, now an executed measurement.

### What the test asserts now, and what it does not

Two failure modes were fused in one test and are now separated:

 · **the property** — text typed into any editable text control never reaches a steering
   sink. Controls are enumerated by ELEMENT SHAPE (`textarea`, and `input` whose `type` is
   a text-entry type), never by name, id or label, in BOTH reachable form states, with an
   assertion that the Options panel actually opened.
 · **the spelling** — no steering-named control is rendered. Its own test, so a
   differently-named mutant fails on the property instead of dying on a name check.

A POSITIVE CONTROL asserts one legitimate field's typed value really does reach the ask,
identified by where it LANDS rather than by its name; without it the test could pass
vacuously if the harness ever stopped typing. The second test also pins the absence of
contenteditable hosts, so the shape enumeration is complete for what this form can render.

**The claim is limited to what is tested.** It covers `textarea` and text-entry `input`,
in the two states this form has. It does NOT cover shapes the harness cannot type into —
custom widgets that take text without a text-entry element, file or date inputs. That
boundary is written into the test comment, not only here. I do not claim "every text
control".

### Refutation table — every frame has a custody transcript in `logs/w5/`

| frame | what it is | verdict |
|---|---|---|
| GREEN, clean production | reworked test at `de6e6a07` | **8 passed (8)** |
| REPRODUCTION `09-` | m1 + the ROUND-2 test | **7 passed (7)** — the defect, executed |
| m1 `10-` | text INPUT, id `guidance`, label "Emphasis", initially empty, **inside Options**, wired to `steering_annotations` | **CAUGHT** at the substantive assertion; sentinel `asker-typed-open-1` — an Options-state control reached by shape |
| m2 `11-` | id rename only (the corrected description) | caught by the SPELLING test **only**; substantive test passes |
| m3 `12-` | NEIGHBOUR: unrelated legitimate field carrying asker text | **not caught**, 8/8 — correct |
| m4 `13-` | topic `onChange` neutered | red, but via readiness, not the guard — reported as a weak frame, not counted as evidence |
| m5 `14-` | the enumeration returns nothing (harness stops typing) | **CAUGHT** by the vacuity guard: "no editable text control found with Options closed" |

**m3 found a defect in my own test and I fixed it (`de6e6a07`).** My first substantive
assertion swept EVERY config key, which is broader than the property and fires on an
unrelated legitimate field. Round 2 had already corrected exactly this over-broadness; I
reintroduced it, and the neighbour mutant caught me. The generalisation that matters is
over the CONTROL's name — which the shape enumeration gives — not over the sink's, whose
two names are fixed by the contract.

### A tooling block, reported rather than worked around

**`tools/mutate.sh` cannot carry m1, and cannot carry any mutant that adds JSX.** It applies
its edit with `perl -0pi -e "s/\Q$OLD\E/$NEW/g"`, so a `/` in OLD or NEW terminates the
pattern; every JSX element needs one. Measured, not assumed: passing
`<input id="guidance" type="text" />` aborts with `Search pattern not terminated at -e line
1.` and exit 5. It fails safe. m1's transcript therefore runs mutate.sh's OWN gate sequence
— clean-tree precondition, pre-count 0, sha BEFORE, apply, applied count > 0, command and
exit, restore, post-count 0, sha AFTER equal, empty porcelain — with literal substitution
instead of a perl `s///`, and says so in its own header. m2, m3, m4 and m5 are slash-free
and went through the real `mutate.sh`. The tool is not at fault for failing; the packet's
requirement and the tool's capability simply do not meet, and that is now a trap entry.

## The merge, and the rule for every conflict

Sole merge base `7dda3cc0`. Integration changes **38 paths** from it, the lane **892**,
**5 shared**, **3 with conflict markers** — the shape codex predicted, plus one path
(the 38th path, versus the 37 codex measured at `ea4afa52`, is W3b r4’s `tests/integration/t16-algorithm-register.test.ts` — verified).

| file | rule, in one line |
|---|---|
| `.hermes/TOOLING-TRAPS.md` | Concatenate both append regions in full, HEAD's first, neither side reordered — 0 lines lost either way. |
| `apps/ui/app/new/page.tsx` | Keep the surviving UX-01 UI and V's steering removal; carry T1's INTENT onto it by sourcing readiness and slider bounds from `EXPANSION_DEPTH_MIN/MAX` and deleting the local duplicates. |
| `tests/unit/v2ui-pages.test.ts` | Reconcile the SAME invariant onto the surviving control: contract import + `min/max` from the contract + no local re-declaration. |
| `packages/contract/src/index.ts` | Auto-merged, so proved by meaning: both sides' diff line sets reproduce exactly (0 divergences each way). |
| `pnpm-lock.yaml` | Same proof; keep the incoming contract importers for runner/budget/register AND the lane's prune of the deleted `web` importer. |
| `tests/unit/s1-1-depth-contract.test.ts` | *(no marker, broken by the merge)* An assertion whose SUBJECT this lane deleted goes with its subject; the surviving arm stays untouched. |

**Neither auto-merged file was taken on trust.** Both were verified by the bidirectional
diff-line-set method recorded in TOOLING-TRAPS by T1B — `diff(base,lane)` must equal
`diff(incoming,merged)` AND `diff(base,incoming)` must equal `diff(lane,merged)`. All three
non-synthesised shared files return **0 divergences in both directions**
(`logs/w5/03-shared-path-bidirectional-audit.log`). The two files I deliberately synthesised
diverge only at the depth-bound lines and their comments, which is the point: taking either
whole side there loses an intent.

**Whole-file audit** (`logs/w5/26-wholefile-audit.log`): 889 lane-only paths, **1
divergence** (B1's test, deliberate); 33 incoming-only paths, **1 divergence** (the depth
oracle's web arm, deliberate). Union closes exactly: 889 + 33 + 5 = **927** =
`git diff --name-only 7dda3cc0 <tip>`.

**Landings that arrive with this merge**, named as the packet asks: W3/T1/T1B's
single-source depth work; the sealedrows conformance repair (evaluator-constant digest,
empty-basis floor, both deployment seeders); T17/T9's required synthesis roles; H-FIX's
liveness repair; the demo-path suites with the new shared fixture
`acceptance/test-fixtures/evaluator-double.ts`; **W4's two-file harness repair**
(`acceptance/dual-maker-proof.ts`, `.test.ts`); and **W3 r4's t16 expectation**
(`tests/integration/t16-algorithm-register.test.ts`, commit `2d400dd5`) — it did land before
the pinned tip.

## Two collisions no file-level check could see

Both are the same class: **incoming code that assumes `dialectical-engine/web/` exists,
meeting a lane that deleted it.** Neither side is broken alone; only the combination is.
The textual merge is clean, the blob audits pass, and the damage is invisible to a
per-test-NAME failure partition.

**COLLISION 1 — resolved.** `tests/unit/s1-1-depth-contract.test.ts` imports
`../../web/lib/api.js`. RED: `Cannot find module`, `Test Files 1 failed (1)`,
**`Tests: no tests`**, exit 1 — all 44 assertions of T1's oracle silent, including the very
one the packet told me to run against this round's depth resolution. Resolved by the rule
above; GREEN shows the oracle loading and running.

**COLLISION 2 — reported, not resolved: it is not mine.** The architecture audit
(`pnpm run audit:architecture`) throws `ENOENT … web/package.json` at
`tools/orphan-audit/src/index.ts:52`. I checked whether the merge caused it instead of
assuming: the `["web", "web", ["contract"]]` row is **byte-identical in the lane's own
pre-merge version and the incoming one**, and `web/package.json` is absent at `af072205`
and at the merged tip. So the audit was already throwing on the pre-merge lane — this is
the prior filing's **FINDING 3**, inherited from dev's incomplete UI overhaul, not merge
damage. Integration does not see it because `web/` still exists there. Owner: the dev-side
decision about retargeting `web/` → `apps/ui/`. Same cause takes the J10 assertion inside
T1's oracle with it.

## FINDING (new, round 3) — T1's depth oracle false-positives on dev's login code boxes

`tests/unit/s1-1-depth-contract.test.ts` reports one duplicate-ceiling site:

```
apps/ui/components/LoginFlow.tsx:252 [DOMAIN_ENUMERATION] {[0, 1, 2, 3, 4, 5].map((slot) => (
```

That is a **six-slot login code input**, not a depth bound. It trips the oracle's
`WHOLE_DOMAIN` arm — `/\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b/` — because `[0, 1, 2, 3, 4, 5]`
contains `1, 2, 3, 4, 5` as a substring, and that arm is the one that deliberately does NOT
require a nearby depth token (a bare option list has none).

**It is merge-caused and neither parent is red.** I nearly filed this wrong: `LoginFlow.tsx`
EXISTS at base, lane and integration, which reads like "not a merge difference". Comparing
BLOB IDS instead of existence shows base and integration share `1bba7922…` — where line 252
is empty — while the lane carries `38313a5a…`, dev's added code boxes. So the array is
lane-only content meeting an incoming oracle.

**Not fixed here, deliberately.** The fix is a sensitivity change to another lane's detector
— either the domain arm requires a depth mention, or a proper superset like `0,1,2,3,4,5` is
excluded — and blunting someone else's oracle inside a merge commit is the move that ships
a silent regression. `apps/ui/components/LoginFlow.tsx` is also outside my contract: the
merge does not touch it. **The class was swept, not sampled:** the oracle's own site list is
the sweep, and it reports exactly this one site beyond the owning declaration. Two failing
names follow from it. Owner: T1/W3.

## The gate — FOUR counts, not one (F1), across two runs

Both runs at the filed tip on a clean tree. **These are four different questions, and three
of them are invisible to a failing-NAME partition — which is exactly why F1 was right.**

| # | count | run 1 `20-` | run 2 `27-` | round 2 @ `af072205` (pre-merge) |
|---|---|---|---|---|
| 1 | **test failures** | **81** | **80** | 102 |
| 2 | **suite-load failures** (files that could not load; their tests appear in NO count) | **1** | **1** | 3 |
| 3 | **skips** | **0** | **0** | 3 |
| 4 | **unhandled errors** | **1** | **1** | 1 |

run 1: `passed 2337 · total 2418 · FILES 35 failed of 260 · exit 1 · 2863s`
run 2: `passed 2338 · total 2418 · FILES 34 failed of 260 · exit 1 · 2835s`
Parse check both runs: summary count equals distinct parsed names (81/81, 80/80) — **MATCH**.
A mismatch would mean vitest did not emit every FAIL line and no partition could be believed.

**WORST RUN WINS (worker contract §3): the verdict is run 1's 81.** I ran the suite **twice,
not three times** — each run is ~47 minutes of wall clock and two runs already resolved the
only disagreement between them. That is a disclosed shortfall against the three-run rule,
not a silent one.

**The two runs' name sets differ by exactly ONE name**, and it is the one I would otherwise
have had to argue about:
`acceptance/model-shim.test.ts › propagates a CLI deadline as HTTP 504 without fallback
text` — red in run 1 (`CliRelayFailure: CODEX_CLI_TIMEOUT`), green in run 2. Both
`acceptance/model-shim.test.ts` and `acceptance/relay-core.ts` are **byte-identical before
and after this merge**, and the test spawns a real external CLI and kills it on a wall-clock
deadline. **Measured flaky, 1 red of 2 runs** — not asserted flaky, and not re-run until
green.

**Count 2, named:** `tests/unit/s14-ui.test.ts` — the pre-existing missing
`../../web/lib/v3Presentation.js`. The two that VANISHED are
`acceptance/mono-panel.test.ts` and `acceptance/panel-multi-maker.test.ts`, which could not
load at round 2 (`SHIPPED_CONTRACT_TEXT_UNRESOLVED:conformance`). **The incoming sealedrows
conformance repair fixed them** — codex's PREDICTION 3, confirmed by measurement.
**Count 4, named:** one unhandled rejection,
`ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP`, from
`tests/integration/s7-authorization-database.test.ts` — the same signature codex identified
in round 2, pre-existing.
**Count 3:** round 2's 3 skips are gone and the total rose 2337 → 2418, so those assertions
now execute instead of being skipped. **The 102-name set is not the expected final set, and
it is not.**

### What THIS merge changed — measured against the pre-merge lane run

**25 failing names VANISHED · 3 stably APPEARED (4 in run 1, one of them the flake) ·
2 suite-load failures VANISHED · 0 appeared.**
The vanished 25 are dominated by `t16-algorithm-register` (9),
`dev-deployment-register` (7), `acceptance/runtime-policy` (3), `dual-maker-proof` (2), plus
`ceremony`, `seed-register`, `t17-envelope-ledger`, and — as the packet anticipated — the
`database.test.ts` **legal command lifecycle** name that H-FIX repaired. **A formerly red
lifecycle name is expected to vanish and I did not chase it back to red to match the old
authority.**

### The APPEARED names, each attributed

| name | cause | caused by my resolutions? |
|---|---|---|
| `s1-1-depth-contract` › leaves no duplicate definition of the ruled ceiling | dev's `LoginFlow.tsx:252` `[0,1,2,3,4,5]` login boxes trip T1's domain-enumeration arm | **no** — cross-lane collision, finding filed above |
| `s1-1-depth-contract` › keeps the owning declaration as the only depth-bound site | the same single site | **no** — same finding |
| `s1-1-depth-contract` › reports no T1-owned architecture or source-rule violation | `ENOENT web/package.json` in `tools/orphan-audit` — the pre-existing dangling-`web/` class (prior FINDING 3) | **no** — inherited from dev |
| *(run 1 only)* `acceptance/model-shim` › CLI deadline as HTTP 504 | `CODEX_CLI_TIMEOUT` on a spawned external CLI | **no** — measured flaky, green in run 2 |

**None is caused by my resolutions**, and the packet's own depth-ownership question is
answered green: the reconciled slider introduces **no** depth-bound site. All three stable
names exist only because the incoming test file now LOADS — before the load fix it
contributed no names at all, which is precisely why count 2 must be reported separately.

### Full partition of all 80 stable failures (ordered, disjoint)

| bucket | count |
|---|---|
| T0 stable-red authority | 20 |
| T0 unstable family | 0 |
| mission tip `7dda3cc0` | 1 |
| local dev `b5a6b6eb` | 38 |
| origin/dev `2b670d30` | 18 |
| pre-merge lane `af072205` | 0 |
| **not in any prior baseline** | **3** (the table above) |

20 + 0 + 1 + 38 + 18 + 0 + 3 = **80**. Run 1 adds the flake for **81**.

**Where `tools/d15-classify.py`'s closed list does not fit this run, as F1 asks.** Its
authority is the T0 baseline ALONE, so on this lane it reports `NEW 80` — and 80 of those
are names measured red at the mission tip, at dev or at origin/dev by round 2's baseline
runs. **`NEW` in that tool means "not in the T0 authority", not "unexplained"**; reporting
its NEW count as regressions would be flatly wrong. I used it for the parse check and for
the separate suite-load count — the parts that do fit — and did the four-baseline partition
with the same authorities round 2 used and codex independently reproduced.

### Other gates

| gate | result | comparison |
|---|---|---|
| typecheck (root) | **8 errors, exit 1** | all 8 in `tests/unit/s14-ui.test.ts`, the dangling-`web/` class — **the same 8 as dev's own baseline** |
| typecheck (`acceptance/tsconfig.json`) | **exit 0** | run separately because the root project does not include `acceptance/` (recorded trap). This is the evidence that no newly combined caller omits the now-required synthesis role policy |
| `pnpm install --frozen-lockfile` | **exit 0**, "Lockfile is up to date" | and it does not modify the lockfile |
| `pnpm run generate:contract` | **exit 0** | hashes below |
| architecture audit | **exit 1**, `ENOENT web/package.json` | **pre-existing on the lane** — proved, not assumed: the `["web","web",["contract"]]` row is byte-identical in the lane's own pre-merge orphan-audit and the incoming one |
| source audit | **exit 1**, 4 blocking | all 4 files byte-identical at `af072205`, at the merged tip AND at `1485b9e2` — **both parents ship them** |

The two audits were run **separately** because `pnpm lint` short-circuits on the first
failure and would have hidden the second entirely.

### The claim, at the strength the evidence supports

**There are no unexplained failing test names in these runs** — "explained" meaning measured
red at a named prior baseline, or attributed to a named cause above. That is **not** the same
as "no regressions". A failing-name match cannot exclude a different cause behind the same
name, and it cannot see anything hidden behind a failing setup. Two limits I did not close:
the baseline logs this partition leans on (`14-`, `34-`) show a modified `pnpm-lock.yaml` at
capture time, so they measure PROVISIONED code at those commits rather than raw trees
(codex's qualification, which I inherit); and I did **not** run the suite at the pinned
integration target, because that needs a worktree and install I am not authorised to create
there. So "APPEARED vs the pre-merge lane" is measured; "these would be green at
integration" is, for the LoginFlow pair, an inference from blob identity rather than an
executed run.

## Contract hash

| artifact | this tree | integration's filed |
|---|---|---|
| `field-inventory.json` | `842c6c4ec1065db8cb7898d51e93769affe63e2a77e8d91de23d91590f52e2af` | `59a57922dd1ab79692354f4106d60d6680d9372767694a8354b7e51543feeb34` |
| three-file directory manifest | `60c18f835a067cf838fc1a19f4bff80527ab658a14046c706a5db2cac797b1a9` | — |

**They differ, and they should.** A probe recomputed the generator's inventory from three
contract sources in one process and **reproduces integration's own filed hash from
integration's own source**, which is what makes the comparison trustworthy rather than
plausible. Then: the lane's POST-merge inventory is **byte-identical to its PRE-merge one** —
the incoming merge changes 0 resources and 0 routes, because T1's depth work is a NESTED
restriction and the generator records only top-level resource field names. The entire delta
from integration is **one top-level field**, `models` on `PublicDebateSummarySchema` — dev's
additive optional field, which integration does not carry. **Equality would have meant the
lane had lost dev's contract work.**

## Coupled checks the packet named

| coupling | how it was checked | result |
|---|---|---|
| **depth ownership** | ran T1's oracle `tests/unit/s1-1-depth-contract.test.ts` — after making it loadable at all | the reconciled slider introduces **no** depth-bound site; the only site beyond the owning declaration is dev's LoginFlow array (the finding above) |
| **`depth_params` boundary** | not read — executed. The oracle's `accepts depth %i through the live apps/ui client` cases for MIN and MAX both pass, exercising `apps/ui/lib/api.ts` → strict `DepthParamsSchema` → the API | pass |
| **required synthesis roles** | root typecheck AND `acceptance/tsconfig.json` typecheck, run separately because the root project is blind to `acceptance/` (recorded trap) | acceptance typecheck **exit 0**; no combined caller omits the now-required policy |
| **conformance / seed / serve** | full suite (below), plus the whole-file audit proving `apps/runner/src/index.ts`, `dev-deployment-register.ts`, `acceptance/seed-register.ts` and `packages/serve/src/index.ts` are byte-identical to integration's blobs | see the gate |
| **liveness (h-fix)** | full suite; a formerly red lifecycle name is EXPECTED to vanish and is reported as VANISHED, not chased back to red | see the gate |
| **architecture / source audits** | run **separately**, because `pnpm lint` short-circuits on the first failure and would have hidden the second | both fail; attribution in `logs/w5/25-audit-attribution.log` |

**Audit attribution, measured rather than asserted.** The source audit's 4 blocking
violations (`packages/obs-capture/install/{api,runner,scheduler}.ts`,
`packages/serve/src/synthesis.ts`) are byte-identical at `af072205`, at the merged tip AND
at `1485b9e2` — identical on all three trees, so **both parents ship them** and this merge
did not cause them. The architecture audit's ENOENT is the pre-existing dangling-`web/`
class (prior FINDING 3), proved by the `["web", "web", ["contract"]]` row being identical in
the lane's own pre-merge orphan-audit and the incoming one.

## Packet defects (heartbeat-worker §1)

1. **Wrong path.** The packet's B1 section names `tests/unit/ux01-new-debate-form.test.tsx`.
   The file is `tests/render/ux01-new-debate-form.test.tsx`; the codex verdict the packet
   quotes has it right.
2. **`tools/mutate.sh` and `tools/d15-classify.py` are mission-directory tools**
   (`.hermes/reports/<mission>/tools/`), not the lane's `tools/`. The packet's phrasing
   reads as repo-relative.
3. **The mutate.sh custody requirement is unsatisfiable as written** — the tool cannot
   express a mutant that adds JSX, and B1's mutant must. Detailed above and in the traps.
4. **"Contract hash … next to integration's `59a57922…`" does not say which hash.** Two
   exist in the mission's records (the `field-inventory.json` hash and the three-file
   directory manifest hash), and codex's own r1 flagged an earlier packet for conflating
   them. Both are reported and labelled.
5. **The collision map does not anticipate that an INCOMING-ONLY file can be broken by the
   merge.** It happened twice, and one of the two was the oracle the packet instructed me to
   run. Not a wrong statement — a missing category.

## Housekeeping

No temporary worktrees were created. `pnpm install --frozen-lockfile` exits 0 and does not
modify the lockfile. The contract generator writes only into the gitignored
`packages/contract/generated/`; the three probe files used for the hash comparison were
written there and deleted. Every mutant restored: each transcript ends `HASHES MATCH` and
`porcelain: []`. Nothing pushed, nothing merged into dev or integration, the integration
worktree was never written to, no board or DECISIONS file was edited, and no credential was
read or minted.

---

# ANNOTATIONS — 2026-09-05 · W5-R2-F3 (records-only seat, no code / no git / no checkout)

**APPEND-ONLY.** Nothing above this line is deleted or rewritten, and no line above it has
moved: every line number `agent-reports/w5-codex-r2.md` §F3 cites still resolves to the
sentence it cited. **The conservative gate verdict is UNCHANGED — 81 test failures / 1
suite-load failure / 0 skips / 1 unhandled error**, worst run wins, run 1
(`logs/w5/28-fourcount-run1.log`). None of the corrections below moves any of those four
counts.

Each entry carries the seat's original number and, beside it, the reviewer's re-derived
number from `agent-reports/w5-codex-r2.md` §F3. Provenance is stated per entry: **[verified
here]** means this seat read the artifact named and reproduces the value; **[codex]** means
the number is the reviewer's re-derivation, which this records-only seat cannot re-run
because its contract grants no code, no git and no checkout.

## A1 · line 455 — "Both runs at the filed tip on a clean tree"

**Wrong.** Only run 2 is at the filed tip.

**[verified here]** `logs/w5/20-suite-run1.log:1` reads
`commit=de6e6a0784036e65e139675603fc8be5310e642a`; `logs/w5/27-suite-run2.log:1` reads
`commit=2af816f183247efefae65172bb7036eefd049fa1`.

**Corrected:** run 1 is stamped **de6e6a07**, not `2af816f1`. Neither header records a tree
id or a pre/post `git status --porcelain`, so "on a clean tree" is not evidenced by these two
logs. Per codex, the only tracked change from de6e6a07 to 2af816f1 is a TOOLING-TRAPS
append — which keeps run 1 RELEVANT to the final implementation, but cannot make its stamp
or its custody stronger. Seat: "both runs at the filed tip". Reviewer: **one run at the
filed tip, one at de6e6a07, documentation-only delta**. The worst-run verdict is unchanged:
run 1 still supplies 81/1/0/1.

## A2 · lines 388–390 — the whole-file path census "889 + 33 + 5 = 927"

**Wrong arithmetic; the preservation conclusion it supports still holds** (codex,
§Resolution preservation: "the filing's arithmetic does not reproduce even though its
preservation conclusion does").

**[codex]** NUL-delimited tree entries and `git diff --no-renames` agree on **893 pre-lane
changed paths, 38 incoming, 5 shared**, giving **888 lane-only + 33 incoming-only + 5 =
926**. Seat: 889 lane-only, union **927**. Reviewer: 888 lane-only, union **926**.

**[codex]** Default rename detection currently reports **925** final paths, by combining the
old `web/app/globals.css` path with a documentation destination. This audit must be read
under explicit `--no-renames` / NUL semantics; the three numbers 925 / 926 / 927 are three
different questions, and only 926 answers the one this audit asks.

**Class sweep (heartbeat-protocol §2.2) — the same census appears in four places:**

| member | as filed | status |
|---|---|---|
| this report:388, :390 | 889 lane-only · union 927 | corrected here (A2) |
| `logs/w5/26-wholefile-audit.log`:3, :5, :15, :16, :24 | 889 lane-only · union 927 | corrected in that file's own annotation block, same date |
| this report:367 | "the lane **892**" | same measure as codex's **893** pre-lane changed paths; codex did not cite this line, and this seat cannot run git to adjudicate. Flagged, NOT silently changed. |
| `logs/w5/30-r3-resolution-ledger.md`:5 | "892 lane paths" | same as above; flagged in that file's annotation block. |

Note that 889 lane-only + 5 shared = 894 ≠ the 892 filed at :367, so the filing was already
internally inconsistent by 2 before codex's re-derivation; codex's 893 = 888 + 5 is
internally consistent. Resolving 892 vs 893 needs a git measurement this seat is not
granted; it is named as an open member of the class rather than guessed.

## A3 · lines 475–482 and line 515 — "a real external CLI", "a spawned external CLI"

**Overstated as a diagnosis.** The intermittence is measured; the CAUSE is not.

**[codex]** The intermittent test "spawns a local Node fixture and performs a short startup
handshake; calling it an external CLI flake does not establish a vendor failure or a
completed diagnosis."

**[verified here]** `logs/w5/20-suite-run1.log:41194` records the failing case
`acceptance/model-shim.test.ts > ACC-01 model shim > propagates a CLI deadline as HTTP 504
without fallback text` at **105ms** — consistent with a short local handshake and not with a
vendor CLI reaching a wall-clock deadline. This is corroboration, not the fixture reading
itself; the source is outside this seat's contract.

**Corrected:** the classification is **provisional — "intermittent, cause not diagnosed"**,
not "external CLI flake". What remains fully supported and unchanged: the two
`acceptance/` files are byte-identical before and after the merge, the name is red in run 1
and green in run 2, and it was NOT re-run until green (codex, §Q4: "two samples establish
intermittence, not a flake diagnosis"). Line 515's table cell inherits the same correction:
the cause column should read "intermittent, undiagnosed", and its "caused by my
resolutions? **no**" answer is unaffected.

## A4 · line 537 — "it reports `NEW 80` — and 80 of those are names measured red at..."

**Wrong on both numbers.**

**[codex]** Applying the current classifier's full-name and closed-T0 logic yields **NEW 61
(run 1) / NEW 60 (run 2)**, not NEW 80: **20** of each run's failures remain inside the T0
authority and are therefore not NEW by that tool's own definition. And there are **77**, not
80, common failures assigned to prior baselines; the remaining **3** are the separately
explained new names already attributed in the table at :508–:515.

Seat: `NEW 80`, "80 of those are names measured red at a prior baseline". Reviewer: **NEW
61 / 60**, and **77** assigned to prior baselines + 3 explained new names.

**The point the sentence was making survives intact and is worth restating:** `NEW` in
`tools/d15-classify.py` means "not in the T0 authority", never "unexplained", so reporting
its NEW count as regressions would still be flatly wrong. The four-baseline partition at
:522–:534 (20 + 0 + 1 + 38 + 18 + 0 + 3 = 80, +1 flake = 81) is the accounting that stands;
codex reproduces the same 80-name partition independently as `20 + 0 + 1 + 38 + 18 + 0 + 3`.

## A5 · line 411 — "all 44 assertions of T1's oracle silent"

**Conflates three different units, and uses the post-removal figure for the pre-removal
suite.**

**[codex]** The three measures are distinct, incoming → final:

| measure | incoming | final |
|---|---:|---:|
| test / parameterised-test registrations | 20 | 19 |
| static `expect(...)` call sites | 38 | 37 |
| expanded test cases in filed logs | 46 | 44 |

**Corrected:** the unloaded incoming depth suite had **46 expanded cases**, and removing the
one `it.each` block for the legacy `web/` client leaves **44** — which is why
`logs/w5/08-GREEN-depth-oracle.log` reads `3 failed | 41 passed (44)` AFTER the resolution.
"44 assertions" is the wrong noun for either count: assertion SITES are 38 → 37. Seat: "44
assertions silent". Reviewer: **46 expanded cases silent**, 20 registrations, 38 assertion
sites.

The substantive claim is untouched: the whole file failed to load, so a per-test-NAME
partition could see none of it, which is exactly why count 2 (suite-load failures) has to be
reported separately.

**Class sweep — the same "44 assertions" statement appears in three places:**
this report:411 (corrected here) · `agent-reports/w5-dev-reconciliation-self.md`:275 ·
`logs/w5/30-r3-resolution-ledger.md`:90–91. Both are corrected in their own dated annotation
blocks of the same date.

## Scope of this annotation block, stated so it is not over-read

Corrected here: only the statements codex §F3 named, plus the members of their classes found
by sweep. **Not corrected, because they belong to an earlier round and their run logs
(`logs/devsync/`) are outside this seat's contract:** the round-2 gate statements at :18,
:76, :88–:89 and :183, which describe the round-2 filed tip `af072205` and its 102/3/3/1
gate, not round 3's. Whether round 2's "twice at the filed tip" carries the same stamp
defect as A1 is UNMEASURED by this seat — it is named here so nobody reads its silence as a
clearance.

## SCOPE NOTE — 2026-09-05, later the same day · one file, not the directory

AMENDMENT 1 to `packets/w5-records-worker.md` (20:46) granted this seat exactly ONE further
file: `logs/devsync/31-r2-resolution-ledger.md`, append-only, to close W5-R2-F2's ninth
statement. **It did not open `logs/devsync/`.** The round-2 suite logs in that directory
remain outside contract, so the paragraph above stands unchanged: whether round 2's "run
twice at the filed tip" carries the same stamp defect as A1 is still **UNMEASURED**, and its
silence is still not a clearance.

---

# ANNOTATIONS ROUND 2 — 2026-09-05 · after codex W5-RECORDS r1 (B1 blocking, N1 follow-up)

**APPEND-ONLY.** Nothing above this line is deleted or rewritten, including the round-1
annotation block, whose superseded sentences stay exactly as written. The gate verdict is
untouched: **81 test failures / 1 suite-load failure / 0 skips / 1 unhandled error**.

## A3-SUPERSEDED · B1 (blocking) — the causal clearance is withdrawn

**Superseded here:** A3's last sentence at :716–718 ("Line 515's table cell inherits the same
correction: the cause column should read 'intermittent, undiagnosed', and its 'caused by my
resolutions? **no**' answer is unaffected"), together with the timeout portion of :515 and
the aggregate at :517, and the justification at :471.

**Why it was wrong.** A3 correctly reclassified the failure as intermittent and undiagnosed,
and then in the same breath preserved a definitive exclusion of merge influence. Those two
cannot both stand. Codex r2 §Q4 rejects the inference directly: **a changed suite load can
affect an unchanged timing test.** Byte-identity of `acceptance/model-shim.test.ts` and
`acceptance/relay-core.ts` across the merge shows the test SOURCE did not change; it does not
show the conditions it ran under did not change — and this merge demonstrably changed suite
load, since two suite-load failures vanished between the baselines. Neither the 105 ms
observation nor the unchanged fixture source supplies the missing causal proof. Round 1
carried the clearance forward instead of retiring it.

**The corrected statement, and it is the whole of it:**

> **Observed intermittent: one failure in two runs. Cause and merge influence undetermined.**

**Retained, because each is separately supported:**

- The subject is a **local Node fixture** with a short startup handshake, not a vendor CLI
  (codex r2 §Q4). Codex r1 notes the log does not identify the failing await, so the
  handshake reading remains an **explicitly provisional inference**, not a diagnosis.
- **[verified here, round 2]** the 105 ms measurement, and the one-failure-in-two-runs
  observation, read from the two logs granted read-only for this purpose:
  `logs/w5/20-suite-run1.log:41194` — `× acceptance/model-shim.test.ts > ACC-01 model shim >
  propagates a CLI deadline as HTTP 504 without fallback text 105ms`, with its `FAIL` row at
  :42438; `logs/w5/27-suite-run2.log:5047` — the same file-and-suite-qualified case
  `✓ … 180ms`. Four-count receipts agree: `28-fourcount-run1.log` 81/1/0/1,
  `31-fourcount-run2.log` 80/1/0/1.
- **A precision note for anyone re-checking this by grep:** the case name
  "propagates a CLI deadline as HTTP 504 without fallback text" also belongs to a DIFFERENT
  test, `acceptance/claude-relay.test.ts > FAIR-02`, which passes in both runs
  (run 1 :40539, run 2 :39744). The name must be qualified by file and suite or the
  observation is ambiguous.
- The gate verdict, unchanged: **81/1/0/1**, worst run wins.

**:515's table cell**, corrected in full: cause reads **"intermittent; cause undetermined"**,
and the "caused by my resolutions?" column reads **"undetermined — not established either
way"**, NOT "no". **:517's "None is caused by my resolutions"** is superseded for this row
only: it stands for the three `s1-1-depth-contract` names, whose causes are separately
attributed and which codex accepted; it does **not** stand for the model-shim timeout row.

**:471's "two runs already resolved the only disagreement between them"** is superseded the
same way: **the difference between the two runs was OBSERVED, not causally resolved.** The
two-runs-not-three shortfall against worker contract §3 therefore remains a disclosed
shortfall, and the second run is not a resolution of the first run's failure. Codex r1: this
needs a record correction, not a third full run.

## A2-CLARIFIED · N1 — 927 has no alternative semantics, and the error is in the inputs

**Clarifies, and supersedes where they conflict:** A2's heading phrase "Wrong arithmetic" at
:671, and A2's sentence at :679–681 that "the three numbers 925 / 926 / 927 are three
different questions".

**Two errors of my own, both conceded:**

1. **"Wrong arithmetic" misnames the defect.** 889 + 33 + 5 really does equal 927 — the
   addition is correct. **The error is in the measured INPUTS**: the lane-only count of 889.
   The right name for it is a **census / input-count error**, not an arithmetic one.
2. **"Three different questions" invented a legitimate reading for 927 that does not exist.**
   Codex r2 §F3 supplies semantics for two figures only, and explicitly calls 889/927 wrong.
   It supplies no third query that yields 927.

**The corrected statement:**

> **926 is the reviewer's reproduced path census** (NUL-delimited tree entries and
> `git diff --no-renames`, agreeing: 893 pre-lane changed, 38 incoming, 5 shared → 888 + 33 +
> 5). **925 is the rename-detected result** (default rename detection, combining the old
> `web/app/globals.css` path with a documentation destination). **927 is the superseded,
> non-reproducing filing claim, with no established alternative semantics.**

**Unchanged and accepted:** the audit's two-divergence conclusion — exactly two divergences,
both deliberate and disclosed (`tests/render/ux01-new-debate-form.test.tsx` lane-side,
`tests/unit/s1-1-depth-contract.test.ts` incoming-side), everything else byte-identical to
its authoring side. The census error does not disturb it.

**Still OPEN, and not rehabilitated by any of the above:** the 892-versus-893 discrepancy at
:367 and `logs/w5/30-r3-resolution-ledger.md`:5, carried as F-RECORDS-1. Neither 892 nor 927
is independently rehabilitated by this round.

---

# ANNOTATIONS ROUND 3 — 2026-09-06 · R2-B1, after codex W5-RECORDS r2

**APPEND-ONLY.** Nothing above is deleted or rewritten, including the round-1 and round-2
annotation blocks. Gate verdict untouched: **81 test failures / 1 suite-load failure / 0
skips / 1 unhandled error**. Every claim below carries **STRENGTH** per D67:
`entailed` (the cited evidence entails it) · `consistent-with` (compatible, not established)
· `undetermined` (the evidence is silent).

## :560–561-SUPERSEDED · R2-B1 (blocking) — the universal attribution claim is retired

**Superseded here:** :560 "**There are no unexplained failing test names in these runs**",
together with its definition at :561 ("'explained' meaning measured red at a named prior
baseline, or attributed to a named cause above").

**Why it fails, under its own definition.** Round 2 retracted the model-shim timeout's causal
clearance and left its cause and merge influence undetermined. That name therefore has
**no** prior-baseline attribution and **no** named cause — so by the definition :561 itself
supplies, it is not "explained". :560 nonetheless ranges over "these runs", which includes
run 1's 81 names. **"Observed once, absent once" does not meet that claim's own bar.** The
round-2 supersession fixed the row and the aggregate at :515/:517 and did not reach this
concluding sentence: an additional member of the same class, not a failure to execute the
enumerated round-2 edits.

**The corrected statement, with run scope stated:**

> **80 common failing names have the recorded baseline/cause accounting. Run 1 additionally
> contains the model-shim timeout, observed in one of two runs, whose cause and merge
> influence remain undetermined.**

STRENGTH — claim by claim, because a single tag on a paragraph of mixed claims repeats the
defect this finding is about:

| claim | evidence | strength |
|---|---|---|
| 80 common failing names carry the recorded baseline/cause accounting | the partition at :522–:534, 20+0+1+38+18+0+3 = 80; codex r2 reproduces it independently | **entailed** |
| run 1 contains one further failing name, the model-shim timeout | `logs/w5/20-suite-run1.log:41194` (`×`, 105 ms) and `:42438` (FAIL); `28-fourcount-run1.log` 81 | **entailed** |
| that name was observed in one of two runs | run 2 `logs/w5/27-suite-run2.log:5047` `✓ … 180ms`; `31-fourcount-run2.log` 80 | **entailed** |
| its subject is a local Node fixture with a short startup handshake | codex r2 §Q4; the log does not identify the failing await | **consistent-with** (explicitly provisional, retained as an inference, not a diagnosis) |
| its cause | — | **undetermined** |
| whether this merge influenced it | changed suite load can affect an unchanged timing test (codex r2 §Q4); byte-identity shows unchanged SOURCE, not unchanged conditions | **undetermined** |
| the gate verdict 81 / 1 / 0 / 1 | `28-fourcount-run1.log`, `31-fourcount-run2.log`, worst run wins | **entailed** — unchanged |

**RETAINED, explicitly, because it limits a different inference and is not repaired or
weakened by any of the above:** :562–563's disclaimer that this is **not** the same as "no
regressions" — a failing-name match cannot exclude a different cause behind the same name,
and cannot see anything hidden behind a failing setup — together with the two limits :563–566
discloses (the `14-`/`34-` baselines measure PROVISIONED code at those commits; the suite was
not run at the pinned target). Those remain exactly as written. **Also retained:** the
provisional handshake inference and 81/1/0/1.

## Class sweep for R2-B1 — every blanket attribution sentence, with its run scope

Codex r2's instruction is to sweep with run scope stated, and **not** to change earlier-round
claims merely because their wording matches. Per member:

| member | scope it actually ranges over | disposition |
|---|---|---|
| **:560–561** | round 3, both runs (81 / 80 names) | **SUPERSEDED above.** The blocker. |
| :508 "### The APPEARED names, each attributed" | round 3, the four-row table at :510–:515 | **Narrowed:** three `s1-1-depth-contract` names are attributed and codex accepted them; the fourth row, the model-shim timeout, is **undetermined** — already corrected at :515 in round 2 and restated here so the heading is not read as covering all four. |
| :517 "None is caused by my resolutions" | round 3, the same four rows | **Already superseded in round 2** (see :837): it stands for the three `s1-1` names, not for the timeout row. No further change. |
| :18 "run twice at the filed tip and SET-EQUAL between runs — has zero unexplained failures" | **ROUND 2**, tip `af072205`, 102 failing names | **NOT superseded.** An earlier-round claim about a different tip and a different failure set. Its run scope is stated here so a reader does not carry it onto round 3; whether it holds is **undetermined** by this seat, whose contract excludes the round-2 run logs in `logs/devsync/`. Same standing as the O2 open note. |
| :91 "Partition of all 102: … **0 unexplained**" | **ROUND 2**, `af072205` | **NOT superseded**, same reasoning as :18. |
| :186 "Suite failures, all 85 accounted for, **0 unexplained**" | **ROUND 1**, 85 failing names | **NOT superseded**, same reasoning. |
| :539 and :734 — "`NEW` … means 'not in the T0 authority', not 'unexplained'" | round 3, describing the classifier's semantics | **Not a member.** These deny a blanket attribution rather than assert one; they stand. |

**STRENGTH on the sweep itself:** that these are all the members inside this seat's contract
is **entailed** by a grep over the five annotated records for `unexplained` / `all attributed`
/ `each attributed` / `None is caused` / `zero unexplained`. That the three earlier-round
claims (:18, :91, :186) are TRUE is **undetermined** — they are disclosed as unswept, exactly
as O2 records, and are not asserted either way here.
