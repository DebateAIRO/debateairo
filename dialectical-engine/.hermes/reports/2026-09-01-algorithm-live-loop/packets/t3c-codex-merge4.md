# T3C MERGE REVIEW 4 — codex gpt-5.6-sol, xhigh, static only

You are the independent code reviewer for the T3C lane. You review the lane's fitness to be
merged into the mission integration branch. You are not the author of any of this work.

## Mechanical constants (re-read from source at packet-write time)

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c` |
| lane branch | `lane/t3c` |
| lane tip | `16610475c9bf2a537b30f46ba2b7b8b95fb2af62` |
| lane tree | `291b4a61d0b2c29ec3bfc674c524bb1ea344c96e` |
| integration worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration` |
| integration branch | `mission/2026-09-01-algorithm-live-loop` |
| integration tip (merge base) | `44836ecf101066c822f317233912c0c99beab2dc` |
| integration tree | `0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616` |
| ancestry | `44836ecf` IS an ancestor of `16610475` (verified `merge-base --is-ancestor`); the lane merged integration in at `31c2a8ab`, so the diff below is lane-only work with no reversals |
| product diff | `git -C <lane> diff 44836ecf..16610475` — 9 files, +836/-79 |
| worker report | `<mission>/agent-reports/t3c-panel-policy.md`, sha256 `4e804e25bb559dc7237874010a9abef5b4d56b58ce4c4896c4628b58565051ce` (line 2 removed before hashing) |
| worker self-report | `<mission>/agent-reports/t3c-panel-policy-self.md`, sha256 `7d83e2455254071a5915887bd6992f4f1c5b80c272a6f02a1ea4cd5e9eeeb1f7` (line 2 removed before hashing — the same transform as the row above; NOT disclosing it was the N1-PACKET defect) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

`<mission>` above always means that absolute mission dir. Every path you cite in your verdict
must be absolute.

## Your two writable outputs — nothing else is writable

1. `<mission>/agent-reports/T3C-codex-merge4.md` — your verdict. First line exactly:
   `CODEX MERGE REVIEW T3C 4 — <VERDICT> · comments read through: t3c-merge4-2026-09-02`
   where `<VERDICT>` is `APPROVE` or `CHANGES`.
2. `<mission>/agent-reports/T3C-codex-self.md` — your self-report, appended as a new dated
   section. It is a case file: name causes, price them, say what you nearly got wrong.

## Scope — read this before deciding what to check

**The lane tip has not moved since merge review 3.** It was `16610475` then and it is
`16610475` now. No product file changed. The source repair was closed at merge review 1 and
the mutant-transcript finding at merge review 3; do not reopen closed product findings, and
do not re-litigate the code unless something you read forces you to.

What changed since merge review 3 is the EVIDENCE SET ONLY. Merge review 3 withheld approval
on three findings, quoted here in full rather than summarised, because my merge-review-3
packet was itself found defective for narrowing one of them:

- **B1** — the compiler records omit measured trees and clean-state evidence. The four D14/D16
  records added the compiler fields the packet described but still omitted part of the
  measured checkout's identity and any before/after working-tree state, so a generated
  declaration file that existed during the run and vanished afterwards would have produced
  records indistinguishable from a clean run.
- **B2** — D44's absolute-location citation contract is not closed. Evidence must be cited at
  its durable absolute mission location, not by lane-relative or shortened paths.
- **N1-PACKET** — my merge-review-3 packet narrowed B2 and abbreviated the D44 evidence paths.
  That defect is mine, not the worker's. This packet is my correction of it; judge whether it
  is actually corrected, and say so if it is not.

## What the worker did in the fourth pass, as claimed — verify, do not assume

The worker states it did not fix only the four named records. It put **every** gate through
`<mission>/tools/gate-run.sh`, the mission tool ruled D45, so that no record in the current
set asserts its own provisioning. `gate-run.sh` emits, for each gate: the measured checkout's
own `commit=` and `tree=` (read from that directory, not typed by the worker), `porcelain
BEFORE`, the exact unpiped command, raw output between `<<<OUTPUT` and `OUTPUT>>>`, the
command's own `EXIT =`, `porcelain AFTER`, and a `CLEAN-STATE` verdict.

**One structural consequence you need before you run any checker.** A record measuring the
BASELINE binds `44836ecf`; it cannot also stamp the lane tip. So the set is split by measured
checkout, and the two halves have different and incompatible contracts:

- `<mission>/logs/t3c/r9-*` — measured in the lane. Contract: stamps the filed tip `16610475`.
- `<mission>/logs/t3c/r9base-*` — measured in the integration worktree. Contract: binds the
  baseline `44836ecf` / tree `0b33a0a6…`. A tip-stamp checker run over these SHOULD call them
  stale; that is the checker being right, not the records being wrong.

`r9base-` does not match the `r9-` glob. Decide for yourself whether that split is honest
bookkeeping or a way to keep records out of a checker's reach.

Two files in that directory carry no `EXIT` line: `r9-zone-mine.json` and `r9base-zone.json`.
The worker's position is that these are vitest reporter payloads, not gate records, each
written by a named gate record via `--outputFile` and consumed by the set-equality gate. Check
that claim rather than taking it from me.

The worker also reports a defect of its own: the first `mode-changes` record read `EXIT = 1`
while printing `0`, because `grep -c` exits 1 on a zero count — a passing gate that produced a
failing-looking record. It says it re-captured that gate as an assertion whose exit means what
the gate means.

Superseded r7 records were **moved, not deleted**, to `<mission>/logs/t3c/superseded-r7/`
(22 files). Confirm nothing verified in an earlier round was destroyed, and that nothing stale
reads as current.

## The questions this review must answer

1. Does every record in the current set bind the checkout it actually measured, such that a
   dirty or differently-provisioned tree could not have produced it?
2. Is every piece of evidence the report relies on cited at an absolute, durable mission
   location that survives the worktree being removed?
3. Is the r9-/r9base- split honest, and is each half checked against the contract that applies
   to it?
4. Is my packet correction of N1-PACKET real?
5. Does anything you read force a product finding back open? Say so plainly if it does.

## Rules

- **Static only.** Run no tests, builds, installs, migrations, mutation commands, provider
  calls, or mutating git commands. Read-only git and file inspection are expected.
- Report `passed/total` verbatim for any suite figure you quote from a record. Never restate a
  number you did not read.
- Every finding gets a ticket and a fix, blocking or not. Non-blocking changes WHEN, never
  WHETHER.
- If you cannot assess something, write CANNOT-ASSESS and say what would settle it. A guess
  presented as a result is the most expensive thing in this harness.
- Do not edit any file outside your two writable outputs. Do not edit the board, DECISIONS,
  the worker's report, or any product file.
- End with a `## PREDICTIONS` section: what another reviewer would likely miss here, and which
  check would catch it first.
