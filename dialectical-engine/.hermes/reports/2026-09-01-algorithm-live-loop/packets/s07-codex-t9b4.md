# T9B REVIEW 4 — codex gpt-5.6-sol, xhigh, static only

You review T9B rework 1. You filed the blocking finding it closes. You are not the author. **T9 is
the last lane gating the mission's closing run.** Two rework rounds remain after this one, so a
genuine blocker must still be called one — but do not manufacture a round.

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07` · branch `lane/s07` |
| filed tip | `79f10701` |
| tip you last reviewed | `03308b0f` |
| tip before T9B began | `9a3a5f60` |
| worker report | `<mission>/agent-reports/s07-synthesis.md`, sha256 `cf84bd55993c6138c5a928c7b545ad1a914db1507ad81e9d05180653bde9ce1f` (line 2 removed) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

Outputs, nothing else writable: `<mission>/agent-reports/S07-codex-t9b4.md` (first line
`CODEX REVIEW T9B 4 — <VERDICT> · comments read through: t9b4-2026-09-03`) and
`<mission>/agent-reports/S07-codex-self.md`.

## What the seat claims — verify
- **The fix.** The ceiling entry is now SELECTED FROM THE ROW by the band it actually names — cuts
  first, `defaultCeiling` last — so the record's label and lift path describe the decision that
  produced the band. No `"retain-band"` beside a lowered band.
- **Row-membership: one checked, one deliberately absent.** The label is checked against
  `ceilingLabels` as the ordinary derivation does. The seat says it wrote the band `includes`
  check, saw that it COULD NOT REFUSE — because the entry is found by
  `ceilingBand === bandOrder[0]`, so membership holds by construction — and removed it. **Judge
  whether that reasoning is right, or whether removing it loses a guard against a row whose
  `bandOrder` and entries disagree.**
- **Fails closed** with `BAND_CEILING_FLOOR_UNDESCRIBED` when no entry names the floor. Both
  refusals are claimed exercised.
- **Tests now pin the WHOLE record — six fields, not one.** The seat's own account of why this
  reached you: *"I pinned the band and not the record. A partial pin is how a wrong value ships
  past a green suite."* RED shows the defect verbatim:
  `- "label": "TEST_REASONING_CEILING"` / `+ "label": "TEST_DEFAULT_CEILING"`.
- **F-T9B-3 FILED, NOT TAKEN, on an OWNERSHIP boundary rather than a size judgement.** The seat
  concludes no selection over the EXISTING entries can be truthful about the REASON, because each
  entry carries one label serving as both its trigger and its outcome. Curing that needs a new row
  entry — two schemas and two seeders — and the mission's slice map makes **S01/T16 the sole owner
  of every new sealed row and schema**. It says: written ownership, not difficulty. It also
  measured rather than assumed the thing that made an optional field plausible — the acceptance
  harness never fails citation tracing, so it never reaches this route. **Is the residue correctly
  scoped, and is what ships honest about its limit?**
- **N1 swept**, including removal of the obsolete `F1M3` transcript "rather than left to rot — its
  target no longer exists". Confirm removing a transcript is right here rather than a loss of
  record.
- Campaign: 12 mutants, 10 killed, both neighbours survived. New: **F1M7** rebuilds the record from
  the entry that does NOT name the floor band — your exact finding — and **F1M8** drops the label
  validation, killed by the new refusal arm.
- Suites: typecheck exit 0 ×3; T9 cluster **87/87** ×3; database `1 failed | 83 passed (84)` ×3,
  the failure pre-existing.

## Independent checks already run — redo or refute
Tip clean at `79f10701`; the entry is selected by `entry.ceilingBand === floorBand` with
`BAND_CEILING_FLOOR_UNDESCRIBED` as the closed failure; `CITATION_TRACING_FAILED` appears ZERO
times so the four-class enumeration stands; T9B's own commits removed ZERO `it`/`test`/`describe`
blocks; no `F1M3` transcript remains; the campaign derives CLEAN.
**Caution:** `mutant-index.py` proves FORM, not credit. You verified this lane's earlier credits as
genuine — check these ten.

## Questions
1. Does the record now truthfully identify the decision that produced the band?
2. Is removing the band-membership check sound, or does it lose a guard?
3. Is the whole-record pin complete enough that a partial pin cannot recur here?
4. Is F-T9B-3 correctly scoped as S01/T16's ownership, and is the shipped limit honestly stated?
5. Are the ten kills credited to the assertions that caused them?
6. **Fit to merge?**

## Rules
Static only — no tests, builds, installs, provider calls, or mutating git. `passed/total` verbatim.
Every finding gets a ticket. CANNOT-ASSESS where you cannot assess. End with `## PREDICTIONS`.
