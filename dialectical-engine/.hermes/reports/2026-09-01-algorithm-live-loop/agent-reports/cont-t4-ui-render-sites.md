READY FOR HERMES STAGE REVIEW · comments read through: n/a (no Hermes board in this continuation — SDD ledger is the board)

# Self-report — BUILD(CONT-T4) `cont-t4-ui-render-sites`

seat: `cont-t4-ui-render-sites` · node BUILD(CONT-T4) · pass 1 of 3 · model Opus 5 · date 2026-09-16
base `a7a2ac2067b8a0915890fb3bb1553d0477ee7b24` · branch `mission/2026-09-16-algorithm-live-loop-continuation`
**Outcome: zero lines of product code written. All eight assigned rows measured RED ON BOTH PARENTS.**

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

## 1. The body: what actually killed these eight rows

The merge did not kill them. Nothing killed them. **They were never alive on this line.**

Every one of the eight failing assertions reads an `apps/ui` source that is byte-identical on
`5e617776^1`, `5e617776^2` and `HEAD` — except one, and that one lacks the expected string on the
first parent too. Seven blob triples, one hash each:

| source the failing assertion reads | `^1` | `^2` | `HEAD` |
|---|---|---|---|
| `apps/ui/lib/types.ts` | `8bdfc0b8` | `8bdfc0b8` | `8bdfc0b8` |
| `apps/ui/lib/recommendation.ts` | `539c5341` | `539c5341` | `539c5341` |
| `apps/ui/components/DebateCanvas.tsx` | `aec019cc` | `aec019cc` | `aec019cc` |
| `apps/ui/app/debate/[id]/DebatePageClient.tsx` | `10608541` | `10608541` | `10608541` |
| `apps/ui/components/DebateThread.tsx` | `a36c6de4` | `a36c6de4` | `a36c6de4` |
| `apps/ui/app/public/debate/[id]/page.tsx` | `28e5f856` | `28e5f856` | `28e5f856` |
| `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` | `913fc863` | `4ec000f1` | `4ec000f1` |

The eighth (the one that differs) is the `s8` row. Its `^1` blob does **not** contain
`PublicAnswerDisclosure` either — the entire `^1`→`HEAD` delta on that file is six inserted lines
adding `SupportWidget`. `PublicAnswerDisclosure` is defined at
`apps/ui/components/PublicAnswerDisclosure.tsx:3` and imported by **nothing**, on `^1`, on `^2` and
at `HEAD` (`git grep -n PublicAnswerDisclosure <rev> -- ./apps/ui` returns only the definition, on
both parents).

**The cause of this node's existence is an attribution taken at FILE level for a question that is
answered at ASSERTION level.** The measurement of record's §6 rows 9, 13 and 32–36 reason from
"`apps/ui` was resolved toward `^2`" and from "`globals.css` differs from `^1` by 13 878 lines". That
premise is true of the directory and false of every file these eight assertions read.

## 2. The upgrade that removes this entire failure class: bound the blast radius ONCE

One command, run before any packet is written, settles the whole UI block:

```
git diff --name-only 5e617776^1 HEAD -- ./apps/ui      →  26 files
```

Twenty-six files. **Any row whose source is not in those 26 lines cannot be merge debt, and no
amount of per-row work will change that.** Of the eleven `apps/ui` sources my eight assertions read,
exactly two are in the list (`app/page.tsx`, `app/public/debate/[id]/PublicDebatePageClient.tsx`),
and neither ever carried the string its assertion wants.

This is the concrete "one prompt machine" upgrade, and it is cheaper than what we do now by two
orders of magnitude:

- **Today:** the verifier saves 345 KB of stylesheet diffs (`logs/gates/globals-p1-head.diff`), writes
  37 prose verdict rows, the planner turns them into task briefs, a packet is authored per task, an
  Opus seat is reserved, and the seat re-derives the hashes per row. Two seats (CONT-T3, then me)
  have now independently discovered the same class by re-deriving it.
- **Instead:** the orchestrator runs `git diff --name-only <merge>^1 HEAD -- <zone>` once per zone,
  attaches the file list to the mission record, and **every verdict row that names a source outside
  that list is auto-tagged EXCLUDED before a packet exists.** A seat is then dispatched only for rows
  that survive, and it is dispatched with the surviving file list already in `allowed`.

The corollary is a rule the amendment does not yet state: **a verdict row must carry the source path
the assertion reads, not the suite path.** §6's row identity is `file › test name`; the source is in
prose if at all. A row keyed by its source path can be machine-checked against the blast-radius list;
a row keyed by its suite name cannot, and that is the whole gap.

## 3. What I nearly got wrong

**I nearly opened the `s8` row as a genuine restore.** Its blob triple is the only one that differs
(`913fc863` → `4ec000f1`), and the packet's rule reads "a first-parent blob that contains the
expected string while HEAD's does not means a render site the merge dropped". The hash test alone
said *candidate*; I had already begun reading the diff as if it were a restore. It was the grep of
`^1`'s blob for the literal string — one command after the hash — that showed the string was absent
there too.

**Refinement the amendment needs:** the scope amendment gives a verdict for the *equal* case (three
equal hashes ⇒ excluded) and **no verdict at all for the differs case**. The differs case is exactly
where a seat will invent work, because a differing hash feels like evidence. The complete rule is two
steps, and the second is the decisive one:

1. hashes equal ⇒ EXCLUDED (the merge cannot be the cause);
2. hashes differ ⇒ **grep the `^1` blob for the expectation string.** Present on `^1` and absent at
   `HEAD` ⇒ RESTORE. Absent on `^1` ⇒ EXCLUDED, exactly like case 1.

Hash-differs is not restore-justified. Only the string is.

## 4. The dead end nobody should re-derive: the locator exception looks authorized here, and is not

Three of my rows (`MUT-A`, `MUT-C`, `DR-160`) fail on an anchor that *visibly* does not match the
component, and the packet permits "a LOCATOR update in the test". It is very tempting:

- `v2ui-pages.test.ts:303,309` anchor the region on `<div className="nodeHeader">`. `DebateCanvas.tsx`
  contains **no** `nodeHeader` at all; `.nodeHeader` survives only as dead CSS
  (`apps/ui/app/globals.css:3271`) and in a `.disabled` file. Meanwhile the render sites the
  assertions exist to protect are **present**: `<V3ScoreBadges … presentation={v3Scores} …/>` at
  `DebateCanvas.tsx:451`, `<ModelMetaLine …/>` at `:402` and `:434`.
- `v2ui-pages.test.ts:316` wants `<details className="debateOverflow">`; the component has
  `<details className="debateUtilityOverflow" aria-hidden="true">` at `DebatePageClient.tsx:1182`.

A seat that "just fixes the locator" gets a green gate in ten minutes. **It would be a fabricated
green.** The packet's locator exception is conditioned on *"a component path V's overhaul moved …
with the moving commit cited"* — and both components are byte-identical on both parents, so **no
moving commit exists**. The anchor never matched on this line; re-anchoring the test to whatever the
component says today converts a failing pin into a tautology. The exception's guard clause ("cite the
moving commit") is what saved it, and that clause should be made mandatory syntax in every future
locator-update grant: *no commit sha, no locator edit.*

## 5. What repeatedly costs tokens here — three named mechanisms

1. **Inherited numbers rot, and every packet quotes them.** The measurement of record speaks of "43
   typecheck errors" and "the 8 `s14-ui` typecheck diagnostics". Measured at my base:
   `pnpm run typecheck` → **rc=0, 0 diagnostics**. Likewise its §6 lists `s14-contract` at
   `fails=3`; at my base it is `fails=2` (row 10 retired when CONT-T1 rewrote the suite). Both were
   true when written and false when read. **Packets should carry the command, never the number.**
   Every inherited count is a measurement a seat must retake anyway, so quoting it only buys the
   chance of anchoring the seat to a wrong value.
2. **The same defect class was found twice, six hours apart.** BUILD(CONT-T3) recorded
   "A merge-attribution verdict must be proved against the blob the FAILING ASSERTION reads"
   (`TOOLING-TRAPS.md:4434`) and the plan grew a scope amendment for it — but **the Task 4 brief's
   prose was never corrected**, and still asserts "a pairing that existed on neither parent". The
   amendment patched the *process* and left the *text* that the next seat reads first. When a
   walkthrough finding invalidates a prose claim, the fix is not only a new rule; it is a **sweep of
   every document that repeats the refuted claim** (§3.2's own "fix the CLASS" applied to prose).
3. **A per-row dispatch for a per-zone question.** Eight rows were dispatched as one coding task with
   a reserved Opus seat, three rework rounds and a three-run gate. The answer was one `git diff
   --name-only` plus eleven `git rev-parse` triples — under two minutes of machine time. The
   expensive part was never the measurement; it was **carrying eight rows all the way to a coding
   seat before anyone asked whether the zone had moved.**

## 6. How to make the coding more efficient — what worked, keep it

- **The packet's read-surface discipline paid for itself.** "the assertions and the files they read —
  never the whole suites" kept me out of 31 KB + 9.6 KB + 4.7 KB of test source; I read three
  windows of ~30 lines each and had everything.
- **Failing-frame → line number → source** is the whole method and it is mechanical: the vitest frame
  names `test.ts:LINE:COL`, that line names the variable, the `const` above it names the path. Two
  `sed` windows per row. This could be a script (`row → source path`) and probably should be: it is
  the input to the blast-radius check in §2 and it is currently done by hand, by every seat.
- **Verify the instrument before reporting "nothing to do".** I ran a positive control inside my own
  read surface before writing this: `apps/ui/app/page.tsx` (`3d43ab3b` on `^1`, `d004d0fb` at HEAD)
  contains `return <LandingPage />` once on `^1` and zero times at HEAD — my method returns RESTORE
  for it. An attribution that returns EXCLUDED eight times out of eight is worthless unless it can be
  shown to return something else when something else is true. **Every "no work here" verdict should
  ship with one positive control.**

## 7. Where the packet was unclear or wrong about reality

- **The packet's stated output is unreachable under the packet's own law.** §1 "output" demands
  "commits … restoring render sites … green on the gate", and the brief's Step 4 demands "0 failed".
  §3 and the scope amendment then define a class of row (exists on neither parent) that **must not**
  be coded. All eight rows are in that class, so a compliant seat produces no commits and a red gate.
  A packet should state the legal null outcome explicitly, or a seat under pressure will read "green
  on the gate" as the governing instruction and fabricate one (see §4).
- **The brief's Attribution paragraph is refuted in its own terms** and should be corrected at source
  before Task 4 is re-dispatched: *"first-parent contract tests now assert against origin/dev's
  `apps/ui` modules, a pairing that existed on neither parent"* — for `v2ui-pages` the test blob is
  `^1`'s (`42550ac5`, unchanged at HEAD) and `DebateCanvas.tsx` is byte-identical on both parents, so
  **the pairing existed on `^1` and produced this exact failure there.**
- **Row 11 (`localeCompare`) was tagged "undetermined"; it is determinable in one command** and is
  EXCLUDED (`539c5341` three times). "Undetermined" survived into the brief only because nobody ran
  the cheapest available command on it.
- The packet named `.hermes/TOOLING-TRAPS.md` (append only) in `allowed` but the handoff shape has no
  slot for "traps appended"; I appended and disclosed it in the handoff line for files changed.

## 8. The one-prompt machine — the three changes I would make from this node

1. **Blast-radius first, per zone, before decomposition.** `git diff --name-only <merge>^1 HEAD --
   <zone>` becomes a mission artifact. Verdict rows naming a source outside it are EXCLUDED
   automatically and never reach a packet. This node would not have been dispatched.
2. **Key every verdict row by the SOURCE PATH the failing assertion reads.** Machine-checkable
   against (1). A row keyed by suite name is an essay; a row keyed by a path is data.
3. **Two-step attribution, mandatory, with a positive control.** Hashes equal ⇒ excluded; hashes
   differ ⇒ the string decides; and one control proving the instrument can still say RESTORE. Ship
   the control in the report or the verdict is not evidence.

## 9. Findings named but not fixed (out of contract)

- `apps/ui/app/page.tsx`: the merge dropped `if (token === null) return <LandingPage />;` and
  `<section id="start-a-debate" aria-label="Start a debate">` (present on `^1` `3d43ab3b`, absent at
  HEAD `d004d0fb`). Genuine merge-dropped wiring on a production entry surface; **no assertion in my
  three suites pins it**, so it is invisible to this gate. Not mine to fix — ticketed for whoever owns
  `apps/ui` routing.
- `apps/ui/components/PublicAnswerDisclosure.tsx:3` is an orphan component on both parents and at
  HEAD — defined, never imported. Either the public answer disclosure was never composed, or it was
  composed somewhere that was deleted before `^1`.
- `apps/ui/components/DebateSplit.tsx` and `apps/ui/components/DebateMap.tsx` contain **zero**
  occurrences of `maker` — two of the six "non-canvas maker surfaces" render no maker at all.
- `apps/ui/components/DebateCanvas.tsx` contains zero `data-node-review` and zero `v3Review`, while
  `apps/ui/components/NodeDetailDrawer.tsx:406` carries the full review vocabulary. The review
  outcome reaches the drawer and never the card, on both parents.

## 10. Prices

| item | cost |
|---|---|
| reading (packet, brief, compass, §6+§10 of the measurement, traps index + 4 bullets) | ~35 KB, one pass, no re-reads |
| RED gate + neighbours + typecheck | 3 runs, ~2 s of vitest, 1 typecheck |
| attribution (11 blob triples + 2 test-blob triples + 1 blast-radius diff + greps) | ~15 plain git commands |
| product code written | **0 lines** |
| rows that reached a coding decision | **0 of 8** |
| the command that would have prevented the dispatch | **1** (§2) |
