# D12 — the one command you run yourself

## Run this

```
bash docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh
```

From anywhere. It takes a few seconds. Nothing needs to be running first.

Options: `--save-evidence` (writes a record under `demo/runs/`, the only path this
script ever writes to) · `--quiet` (summary table only) · `--stage 04` (one stage).

## What you should see

Twenty-eight stages, each one stating **what it must prove in your words**, then
one of exactly three results:

| result | meaning |
|---|---|
| **PASSED** | the thing you asked for was checked and it holds |
| **FAILED** | the thing exists and misbehaves — the run exits **1** and names the stage |
| **SKIPPED** | the thing is **not built yet** — it names what is missing and the ticket that unblocks it |

There is no fourth result, and **absence never reads as success**. A stage whose
subject does not exist skips; it cannot pass.

**Today the run is mostly SKIPPED, and that is the correct first run.** Seven stages
pass, none fail, twenty-one skip. As slices merge, skips turn into passes (or into
failures) and you watch the mission fill in by re-running the same command. The end
state is a run with no skips left.

Exit codes: `0` nothing failed · `1` at least one stage failed, named at the bottom ·
`2` the harness aborted.

## Where the stages come from

Only two sources: your goal statement of 2026-08-21, and
`planning/DEFINITION-OF-DONE.md` criteria D1–D11. Not from the code. The seat that
wrote this implemented no part of this mission, on purpose — a demo written from the
implementation demonstrates what the code does, and this has to demonstrate what you
asked for. Where your words ask for something the current design does not give you,
the stage says so out loud rather than dropping it.

## What the demo will not do

* **It will not fabricate.** When a stage says an error was captured, a real fault in
  real product code produced it. No mock, no hand-written event, no pre-seeded row. If
  a genuine fault cannot be caused for a stage yet, the stage skips. Stage 04 already
  causes one today: it runs a real product entrypoint unmodified, that entrypoint
  really throws, the process really dies — and the demo then reports that **nothing in
  the product recorded it**, which is the condition you opened this mission on.
* **It will not write to git.** Every `git` call passes through a whitelist of read-only
  verbs; stage H3 proves the whitelist refuses `commit add checkout stash push merge
  reset rebase tag`. Every merge and the final push stay yours.
* **It will not touch the W.I.P. accounts feature.** Zone paths appear in the script
  only as inert data used to *refuse* access. Stage H2 hands a zone path to a guarded
  filesystem helper and shows it refused; stage H4 does the same for SQL naming the
  excluded schema. No zone byte, size, mode, mtime, hash or directory listing is taken.
* **It will not run migrations**, because migrating would execute the excluded accounts
  schema. Stage 02 asks you for a database URL instead
  (`OBS_DEMO_DATABASE_URL=...`), and skips honestly when you do not give it one.
* **It edits no product code, no test, no migration, no manifest.** Working-tree entry
  counts are printed before and after every run; if they differ, the run fails.

## Three things your words ask for that the current design does not yet give you

These are printed inside the run as well, at the stages they belong to.

1. **"For very quick fixes, no approval will be needed of us"** — as designed, the
   auto-fix capability starts with an **empty** subsystem allowlist that grows only by
   a dual-custody re-pin. Read literally, the no-approval path is not reachable until
   you approve something to make it apply to anything at all. (stage 22)
2. **The QUICK bound is not a number yet.** The ticket says "≤ 20 production lines";
   `planning/FinalPlan.md:216` says "~20 production-line cap … for the moment"; no
   register row holds it. D11 says *the bound is the criterion* — a criterion cannot be
   judged against a tilde. The same applies to D1's "within a declared bound": none of
   the five G5 register values are ratified (`FinalPlan.md:472`, §K row 1 OPEN). (stage 10)
3. **"Each error must be traceable to the root" has a carve-out.** By design the cause
   walk stops at the first frame inside the excluded security zone and returns a
   terminal `ZONE_BOUNDARY` verdict instead of a root. That follows from your own
   exclusion, but it means *each* error is really *each error whose root is outside the
   W.I.P. accounts feature*. Worth confirming that is what you intended. (stages 12, 17)

A fourth, smaller one: today the product's own typed error class discards the original
error when it wraps (`packages/kernel/src/index.ts:283`), so root preservation is not
merely unproven — it is not yet possible. Stage 12 reports that rather than skipping
quietly.

## Stage list

| # | criterion | what it must prove |
|---|---|---|
| H1 | harness | the demo is looking at the real product tree |
| H2 | D6 | the excluded zone is refused by a guard, and the guard provably fires |
| H3 | harness | the demo cannot write to git, and leaves the tree as it found it |
| H4 | D6 | no SQL the demo issues can name the excluded schema |
| H5 | harness | a failing stage really fails and really sets exit 1 |
| 01 | precondition | the tables exist — you sequenced the listener strictly after them |
| 02 | D1 | the store is live in a real database, not just declared in a file |
| 03 | D1 | the product runtimes come up with capture installed |
| 04 | D1 | a genuine fault in real product code — and what records it today |
| 05 | D1 | API request — nothing silently dropped |
| 06 | D1 | runner job — nothing silently dropped |
| 07 | D1 | provider call — nothing silently dropped |
| 08 | D1 | scheduler job — nothing silently dropped |
| 09 | D1 | browser client — nothing silently dropped |
| 10 | D1/D11 | the numbers these criteria are judged against are declared and ratified |
| 11 | D2 | from a stored error you reach the run and the work item without guessing |
| 12 | D2 | the original error survives the wrapper |
| 13 | D3 | "it just doesn't work" — surfaced even though nothing threw |
| 14 | D4 | it says when it is blind — silence never passes as health |
| 15 | D5 | an adversarial error carrying secrets is stored with none of it present |
| 16 | D6 | the observability layer never touches the W.I.P. security zone |
| 17 | D6 | an error thrown inside the zone produces only an anonymous counter |
| 18 | D7 | one action turns it all off, and the product keeps running |
| 19 | D8 | the listener is alive, restarts itself, liveness observable |
| 20 | D9 | it files a ticket for a real error, carrying the root it traced |
| 21 | D10 | it opens a pull request for a larger fix — and waits for you |
| 22 | D11 | a QUICK fix merges into `dev` unattended — never into `main` |
| 23 | D11 | the bound is the criterion — an above-QUICK change must be refused |

## A note on where the work lives

The demo inspects **the working tree you run it from**. Lane work sits in worktrees
until you merge it, so a slice can be finished by its coder and still show as SKIPPED
here. That is intentional: this measures what has reached your tree, which is what
"done" means for the mission.
