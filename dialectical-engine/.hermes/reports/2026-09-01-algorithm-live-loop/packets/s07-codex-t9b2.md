# T9B REVIEW 2 — codex gpt-5.6-sol, xhigh, static only

You review the third and final mechanism for T9's citation-tracing case. You filed the blocking
finding that rejected the second. You are not the author. **T9 gates the mission's closing run.**

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07` · branch `lane/s07` |
| filed tip | `19fb7570b7464a038695a6dd83b74493f5e3f299` |
| tip you last reviewed | `29649564` |
| tip before T9B began | `9a3a5f60` |
| worker report | `<mission>/agent-reports/s07-synthesis.md`, sha256 `1f5ee75ec2da92f45b7a83136ceab9df449582b94116ce1de7bcfef1fd692672` (line 2 removed) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

Outputs, nothing else writable: `<mission>/agent-reports/S07-codex-t9b2.md` (first line
`CODEX REVIEW T9B 2 — <VERDICT> · comments read through: t9b2-2026-09-03`) and
`<mission>/agent-reports/S07-codex-self.md`.

## What V ruled, and how the orchestrator mapped it
Your finding was upheld: option 2 made an exhausted citation-tracing objection fatal where the
frozen goal says "after round 3 SERVE regardless; standing objection → visible condition mark".
V then ruled: serve, mark, and FLOOR the band.
V's phrase was "band floored to UNSUPPORTED". The orchestrator checked the vocabulary before
passing it on, because `UNSUPPORTED` is a LABEL value (`serve/src/index.ts:806`) and the terminal
ladder is `SERVED | CAPPED | DOWNGRADED` with no such member — AND because confirm-item 3 and the
frozen S06 spec both forbid an objection from moving the label at all (it is "computed BEFORE
synthesis from the propagated numbers (acyclic)"). The mapping given to the seat: **serve · emit
the visible mark · terminal `DOWNGRADED` · basis carries no untraced citation · label untouched.**
**Judge that mapping.** If you think V's words required forcing the label, say so plainly — it
would be a deliberate override of confirm-item 3 and V has been told one line reverses it.

## What the seat claims — verify
- The run SERVES, emits `SYNTHESIS-OBJECTION-STANDING`, and lands at `DOWNGRADED`. `conforms`
  stays a live axis so no untraced citation reaches the basis; the basis is therefore EMPTY,
  `deriveBandCeiling` refuses an empty basis BY DESIGN, so **no band is claimed** —
  `confidenceBand` and `bandCeiling` both null, which migration 0006's
  `(confidence_band IS NULL) = (band_ceiling IS NULL)` check already permits. One additive trace
  token; the seat says nothing pins that vocabulary closed — check that.
- RED `logs/s07/t9b-F1v3-RED-serve-mark-downgrade.log` shows the chain REFUSING with
  `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE`. **It stamps `29649564`, not the filed tip, and that is
  CORRECT (D57)** — a RED predates its fix. Require instead that the measured code did not move.
- **The re-pins were RE-EXAMINED, not defended.** The seat restored both files to their landed form
  at `6a0491f0` FIRST, then re-checked each arm against the ruling. The t09 arm went back VERBATIM
  and passes — it had only ever been changed for the throw — and the helper parameterisation is
  reverted. Two changes remain in serve-s05 and the seat says both are the ruling rather than
  accommodation: `DOWNGRADED` rather than `SERVED`, and a two-segment candidate. **Judge whether
  those two are genuinely the ruling.**
- **A precondition the seat flagged rather than buried:** routing the all-untraced case into the
  downgrade limb inherits that limb's TWO-SEGMENT precondition, so a single-segment candidate on a
  tracing-failed round raises `COMPOSITION_CONTRACT_ERROR`. The seat argues production is
  consistent because the synthesizer's prompt asks for two segments whenever the cited nodes rest
  on reasoning alone. **This is the question I most want your answer on: is that a real hole?**
- The all-untraced arm asserts through `.resolves.toMatchObject` rather than awaiting first,
  deliberately: the property is that this run does NOT end the answer, so a regression makes the
  chain throw, and awaiting surfaced that as an unhandled rejection with no assertion frame. It
  drives the real `deriveBandCeiling`, not a permissive double, and carries a contrast pair.
- Campaign: 8 mutants, 6 killed, 2 neighbours survived, manifest matched. F1M1 dies on
  `expected { terminal: 'SERVED' …} to match { terminal: 'DOWNGRADED' …}`; F1M3 on
  `No load-bearing node contributes to the ceiling`.
- Suites: typecheck exit 0 ×3; T9 cluster 83/83 ×3; database `1 failed | 83 passed (84)` ×3, the
  failure pre-existing.

## Independent checks already run — redo or refute
`SERVE_CRASH_CLASSES` still has exactly four members and `CITATION_TRACING_FAILED` appears ZERO
times in serve. T9B's own commits (`9a3a5f60..HEAD`) removed ZERO `it`/`test`/`describe` blocks,
with 8 `expect` lines removed against 324 added. The campaign derives CLEAN.
**Caution:** `mutant-index.py` proves FORM, not credit — a clean index can still hide wrong-cause
deaths (D43). You confirmed this lane's previous four credits were genuine; check these six too.

## Questions
1. Does the run genuinely serve, mark, and downgrade — and is the band truly unclaimed rather than
   silently defaulted?
2. Is the orchestrator's mapping of V's ruling faithful, given the label must stay code-derived?
3. Are the two remaining serve-s05 changes the ruling, or accommodation?
4. Is the inherited two-segment precondition a real hole?
5. Are the six kills credited to the assertions that caused them?
6. Fit to merge?

## Rules
Static only — no tests, builds, installs, provider calls, or mutating git. `passed/total` verbatim.
Every finding gets a ticket. CANNOT-ASSESS where you cannot assess. End with `## PREDICTIONS`.
