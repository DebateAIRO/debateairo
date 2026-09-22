# W12 — the judge's whole-goal verdict (2026-09-18)

Written by the orchestrator in the judge's seat (V's roster of 2026-09-16: Fable 5.1 orchestrates,
judges and reviews; Opus 5 seats implement; V holds the credential, authorises pushes and runs the real
runs). The goal is goal-v4, `../2026-08-31-algorithm-correctness/goal-prompt.md`, sha256 `78238eeb…`;
its definition of done is quoted verbatim in `slices/S12-closure/SPEC.md:31-43`. Every clause below
carries its source and a STRENGTH tag (D67). This document is what the W12 closure audit
(`w12-closure-audit-2026-09-16.md`, §5) said could not be written until the runs existed.

## The verdict, in one paragraph

**The goal is MET — with one bullet of its definition of done left UNWITNESSED by the owner's decision,
and one caveat that travels with every suite number.** The flagship bullet, which was the blocker, was
witnessed in full by a real three-maker, depth-2 run on 2026-09-17 (D76). The mono-maker bullet was never
run at a closing tree: V waived it on 2026-09-18 — *"I don't need to do the single model now, I trust
that it will work"* (D77 e) — so that bullet, and the only possible demonstration of confirm-item 6, rest
on unit pins and not on a run. And every suite number on this branch was measured under Node 26.5.0
against a declared 22.23.1 (D73 e/7): a run on the declared version is still owed and is expected to clear
about 100 reds and reveal about 4. Nothing else the definition of done names is open. STRENGTH: entailed
for each part below; the summary is the judge's.

## Bullet by bullet

1. **"RED before GREEN."** HELD — as an audit of the record, not a re-derivation. Every landed change of
   the mission passed a review that checked its RED frames (the per-lane verdicts in `DECISIONS.md` and
   `agent-reports/`); the continuation's nineteen tasks and the five since (`F-CEREMONY-REPORT-DOD-FACTS`,
   `F-RELAY-BINARY-HOST-DEFAULT`, and the three of D77) each quote theirs, and the reviews were not
   ceremonial: on 2026-09-17 a reviewer found a source-order test that could not fail, and on 2026-09-18
   another found two REQUIRED cases that survived the very mutant they were meant to kill. I did not
   re-derive one hundred RED frames; I read that each review did. STRENGTH: consistent-with.
2. **"Suites reported passed/total; pre-existing failures named, never absorbed."** HELD. The final
   four-count at the closing tip is **140 / 0 / 0 / 1** over 5363 tests (426 files, 31 red), name-compared against the gate of record (`5c996693`,
   140 / 0 / 0 / 1) and the post-ceremony gate (`4f83405f`, 140 / 0 / 0 / 1): NEW 0, CLEARED 0, STILL 140, every red name-identical to the post-ceremony gate. Every red
   is named in `closing-runs/` and owned: 100 Node-26 `localStorage` rows in `tests/render`, 40 owned rows,
   and the one unhandled s7 rejection present at every gate since `96e3c91c`. STRENGTH: entailed.
3. **"Full multi-maker acceptance run (M≥2, depth≥2) completes with …"** WITNESSED IN FULL, nine of nine
   sub-clauses from one log (`closing-runs/ceremony-20260917-222858.log`; D76 b): three makers, depth 2,
   27 nodes, every τ carrying a non-author voice, 30 of 30 edges measured, all three roots moved by
   propagation, the ceiling 396 recorded with the consumption 114, the synthesizer's statement accepted by
   the evaluator at round 2 of 3 after a first rejection, the label CONTESTED derived by code, the band
   CAPPED over five cited nodes, the envelope WITHIN at terminal. No seat spent a credential; V ran it.
   STRENGTH: entailed.
4. **"Mono-maker acceptance run still completes (skeleton path + marks intact)."** UNWITNESSED — WAIVED
   BY V (D77 e). What stands in its place: the label ladder's rung 0 (a solo voice → CONTESTED plus
   `LABEL-BASIS-INCOMPLETE`) is unit-pinned (T11); the single-maker path's visible marks
   (`SINGLE-LINEAGE` / `MONO_MAKER_RUN`, `CRITIQUE-UNAVAILABLE`) are emitted by code the J20 sweep read
   line by line (`apps/runner/src/index.ts:3711-3720`); and the only mono ceremony on record, T0's
   baseline, pre-dates the rule and printed the label the rule now forbids. A judge cannot convert a waiver into a witness, so
   the bullet stays open on the record, owned by V's decision. STRENGTH: entailed.
5. **"Every new policy value lives in sealed register rows via T16's mechanism; missing rows fail
   loudly."** HELD, and exercised once more by the closure itself: D77's refit of δ and ε went through the
   mechanism — a new sealed version with the ruling that chose the values cited on each row, never an
   edit of a sealed one (`8d41d4db`, `3a8193cb`). One guard narrowed and is ticketed, not hidden: at the
   ceremony's new version the seal-time check no longer refuses a register carrying NONE of the rows
   (every partial case is still refused; the shipped seeder always emits all fifteen; every reader still
   refuses at read, `packages/register/src/algorithm-policy.ts:496-500`) — `F-REGISTER-V3-REQUIRED-ROW-PROFILE`.
   STRENGTH: entailed.

## The other W12 duties (the audit's §4)

| duty | state | evidence |
|---|---|---|
| δ/ε refit | **DONE** | D77 (b)–(c): ruled by V from the real run's measurements; δ 0.02 → 0.01, ε 0.01 → 0.005; landed at `8d41d4db` / `04406d03` / `3a8193cb` / `31f6e25b`, blind review spec MET · quality APPROVED. The J2 companions were NOT refitted and D77 says why |
| the seven confirm-items | **RULED by V** | D77 (d): 1 yes · 2 yes · 3 no · 4 rename now · 5 yes · 6 yes · 7 park; item 4 landed at `02b42592` / `91b887c7`, APPROVED |
| mono-maker run | **WAIVED by V** | D77 (e); bullet 4 above |
| entry-point class sweep (J20 closure gate) | **CLEAN** | `j20-entry-point-sweep-2026-09-18.md`: 34 members, 2 production sites, all 14 optional members passed at both, the 20 required ones compiler-enforced; two observations ticketed (`F-J27-GATE-ACCEPTANCE-SITE`) |
| W12b DEV-SYNC | **DONE by substitution** | D70 (W5 did the reconciliation; V delegated the merges); the stale `pending` row in `PROGRESS.md` is corrected with this verdict |
| V packet | **FINAL** | this verdict attached; §A's rows stand at their recorded defaults, each with its veto window open |
| the credential on the command line | **FIXED before the push, at V's word** | D77 (f): `9c51c8ab` … `169e413a`, APPROVED after one fix round that closed two real leak paths into the run log |

## What this verdict does NOT claim

- **Not that a reader of the site sees the label.** The three-state label reaches the page only as a raw
  word in a side drawer; the banner it was mapped for has no producer (`F-UI-VERDICT-LABEL-DRAWER-ONLY`,
  beside `F-T4-UI-8-REVIEW-VOCABULARY-CARD`). The goal asked for a code-derived label and a truthful
  vocabulary, and has both; putting them in front of a reader is V's UI program.
- **Not that the δ-stop has ever fired live.** At depth 2 it cannot (D77 b/6). The adaptive-stop
  sub-clause was witnessed on its ceiling arm. δ binds from depth 3, and no depth-3 run exists.
- **Not that the refit is calibrated.** It is a judgement from ONE run on ONE question, made from the final
  graph because the run persisted nothing about its two round-boundary decisions
  (`F-STOPPING-DECISIONS-UNPERSISTED`). It is better than the seeds against the only measurements that
  exist, and it is recorded as such.
- **Not that the suite is green.** 140 reds are owned, not fixed, and the Node 22.23.1 run is owed.
- **Not that the next real run has been rehearsed under the new rules.** No ceremony has run since the
  credential left the command line and the register moved to version 3; the tests prove both on
  databases shaped like the real one, and the next run is the first witness.

## What is left, for whoever opens this next

The Node 22.23.1 run (D73 e/7). The tickets filed at closure: `F-UI-VERDICT-LABEL-DRAWER-ONLY` (high, V's
UI program), `F-STOPPING-DECISIONS-UNPERSISTED`, `F-REGISTER-V3-REQUIRED-ROW-PROFILE` with
`F-T16-MANIFEST-PROVENANCE-STALE` (one migration), `F-REGISTER-HISTORICAL-IMPORT-CAP` (one refit left
before the mechanism needs a decision), `F-J27-GATE-ACCEPTANCE-SITE`, `F-CLOSING-RUN-OUTDIR-OVERRIDE`. The
V packet's §A rows. And, if V ever wants bullet 4 witnessed: one single-maker run with the same tool.
