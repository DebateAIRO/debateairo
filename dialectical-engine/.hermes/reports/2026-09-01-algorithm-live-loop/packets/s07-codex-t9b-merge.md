# T9B MERGE REVIEW — codex gpt-5.6-sol, xhigh, static only

You review the T9 lane's fitness to merge into integration. You have reviewed this lane four times
and its product at `79f10701` carried **zero blocking findings**. **This review is about the MERGE**,
which integration `58c4715e` brought in — and which went wrong once already.

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07` · branch `lane/s07` |
| filed tip | `6a57a998` |
| product tip you approved | `79f10701` (then `b0591d9b`, record-only) |
| integration merged in | `58c4715e` |
| worker report | `<mission>/agent-reports/s07-synthesis.md`, sha256 `db49fb6b1c81cf09f27c5b5b3c5c57a94b3250514bab3ce0f4488c3316d15866` (line 2 removed) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

Outputs, nothing else writable: `<mission>/agent-reports/S07-codex-t9b-merge.md` (first line
`CODEX MERGE REVIEW T9B — <VERDICT> · comments read through: t9b-merge-2026-09-03`) and
`<mission>/agent-reports/S07-codex-self.md`.

## What went wrong the first time, and why you should not take the repair on trust
The merge reinstated a pre-existing guard the lane had deliberately DELETED as its own charge — the
`protectedCoreVerified` restatement guard that the frozen goal (lines 248–251) calls **"KNOWINGLY
RETIRED"**, stating the envelope terminal fires on HARD_STOP "independent of restatement status".
The seat then filed it as a blocking CROSS-LANE COLLISION against another lane and asked for a
ruling. **That attribution was false.** Established from the trees: the conjunct is present at the
mission baseline `1c9578a`, at `19bbb4c4` and at `58c4715e`; it is ABSENT at the lane's pre-merge tip
`b0591d9b`; and it was BACK at the merged tip `e9b46023`. No other lane added it. The lane deleted
it, and its own merge resolution restored it, because the incoming side had genuinely rewritten that
block for unrelated work and the seat recorded "my lane had no competing change" when its competing
change was a DELETION.
**A deletion is the hardest change to defend in a merge: its evidence is absence.** Nothing on screen
represents the line you removed, so the incoming hunk looks correct and complete.
The repair keeps BOTH: the incoming `evaluateEnvelope(1)` verbatim, and the lane's guard removal, so
the line reads `if (exhausted.kind !== "HARD_STOP") throw error;`.

## What the seat claims — verify, and treat the merge as the subject
- Guard occurrences 0 at the filed tip; `evaluateEnvelope(1)` retained.
- Database suite restored: **`1 failed | 83 passed (84)`** ×3, the remaining failure pre-existing
  (lifecycle). The F4 arm — "persists the retired-guard disclosure as a visible mark when the
  envelope stops a FAILED restatement" — passes.
- **A class sweep, because one instance is a sample.** Per-tip symbol counts: the guard 0→1→0; the
  F4 *disclosure* ternary (`=== "PASS"`) 2 at both tips and correctly untouched; `protectedCoreVerified`
  0 at both; conformance symbols 4/3/5/2 identical. **Exactly one real reinstatement.** The seat
  reports its first crude sweep returned ELEVEN, of which ten were substring artifacts on short
  generic lines in a 4,000-line file, and says: had it filed from that output it would have replaced
  one false finding with eleven. **Check the sweep's conclusion independently — this is the second
  time this lane's counting has misled it.**
- Campaign RE-TAKEN at the repaired tip: 12 transcripts, 10 killed, 2 neighbours survived, CLEAN.
  The seat held these through the blocked round rather than filing at a tip that could not be final.
- Gates and all 12 transcripts stamp `6a57a998`; 15 anchors unique.

## Independent checks already run — redo or refute
Guard 0, `evaluateEnvelope(1)` present; **all 30 lines integration added to `runner` and `serve`
between `19bbb4c4` and `58c4715e` are present at the lane tip, 0 missing**; T9B's own commits removed
ZERO `it`/`test`/`describe` blocks; stamp-check 12/0; the campaign derives CLEAN.
**Caution:** `mutant-index.py` proves FORM, not credit. You have verified this lane's credits twice
before as genuine; check these ten, since the campaign was re-taken.

## Questions this review must answer
1. Is the merged file CORRECT, not merely conflict-free — do the incoming boundary change and the
   lane's guard removal genuinely coexist?
2. **Did the merge silently undo anything ELSE the lane had deleted?** One reinstatement was found by
   the seat's sweep; a deletion is exactly the change a merge review is most likely to miss too.
3. Was any landed assertion from another lane weakened, renamed or lost?
4. Are the ten re-taken kills credited to the assertions that caused them?
5. **Fit to merge?** This lane gates the mission's closing run.

## Rules
Static only — no tests, builds, installs, provider calls, or mutating git. `passed/total` verbatim.
Every finding gets a ticket. CANNOT-ASSESS where you cannot assess. End with `## PREDICTIONS`.
