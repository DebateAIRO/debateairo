# T9B REVIEW — codex gpt-5.6-sol, xhigh, static only

You review the V-authorized post-cap correction on the synthesis lane. You filed the two blocking
findings this lane closes. You are not the author. **T9 gates the mission's closing run.**

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07` · branch `lane/s07` |
| filed tip | `29649564483a7df582c2fe94e6ecb4269878eb19` |
| integration merged in | `19bbb4c4` at merge `905261e6` |
| tip before T9B began | `9a3a5f60` |
| worker report | `<mission>/agent-reports/s07-synthesis.md`, sha256 `f6fa455a0ce77b4bc40e3183932e67dad587136b512c3ca86b6bbe27744cde23` (line 2 removed) |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

Outputs, nothing else writable: `<mission>/agent-reports/S07-codex-t9b.md` (first line
`CODEX REVIEW T9B — <VERDICT> · comments read through: t9b-2026-09-03`) and
`<mission>/agent-reports/S07-codex-self.md`.

## The authorization and its BOUNDARY — check the boundary held
V ruled (DECISIONS, 2026-09-03) that T9's exhaustive-coverage design stands and must carry S08's
safety property forward. **Exactly ONE landed assertion was authorized for retirement** — S08's
`it("excludes the citations of a segment conformance never verified")` — on the record, with a
comment naming the ruling. Explicitly NOT authorized: weakening, relaxing, renaming or deleting
any other landed assertion; the 8 CANNOT-ASSESS arms were to be PORTED, not retired.
My own check of T9B's commits alone (`9a3a5f60..HEAD`): zero `it`/`test`/`describe` blocks
removed, 9 `expect` lines removed against 321 added. Verify that independently and say if the
boundary was crossed anywhere.

## The mechanism changed mid-round, and why
The orchestrator's first instruction specified a `componentsOnly` guard. The seat IMPLEMENTED it,
ran it, and it broke two landed assertions — one being the frozen goal's own DoD row,
`no NON-CRASH path returns COMPONENTS_ONLY`, plus an exact-set pin closing that terminal at four
crash classes. That mechanism was the orchestrator's error, borrowed from integration's vocabulary
without checking T9's goal. The seat reverted cleanly, costed both paths and did not choose.
Option 2 was then ordered: `conforms` becomes a live axis of the cited-set filter —
`.filter((j) => j.state !== "NOT_SAMPLED" && j.conforms)` — so an untraced segment contributes no
citations, the cited set empties, and S08's existing empty-basis guard refuses. No fifth crash
class; both goal sentences hold.

## Claims to verify, not assume
- RED `logs/s07/t9b-F1-RED-citation-tracing-band.log` shows the chain SERVED with
  `"terminal": "DOWNGRADED"` and untraced citations counted into the basis. **That record stamps
  `6a0491f0`, not the filed tip, and that is CORRECT** — a RED predates its fix (D57). Require
  instead that the measured code did not move between that tip and the filing.
- The all-untraced arm asserts refusal by code AND that `recorded.bases` is EMPTY, so no untraced
  citation reaches a basis even transiently.
- **THREE landed T9 arms were changed, not the one predicted.** Two were in `serve-s05`, where a
  helper hardcoded `citationTracing: false` and was used as a generic "objecting" fixture — one
  arm was literally named `servedDespiteUntracedCitation`. All three re-pinned with subjects
  preserved, helper parameterised, nothing deleted. **Judge whether the re-pins preserve each
  arm's real subject or quietly change what it tests.**
- Campaign re-run at the filed tip: 6 transcripts, 4 killed, 2 neighbours survived, matching a
  manifest written first. F1M1 (revert the `conforms` axis) kills all three re-pinned arms; F1N1
  (drop the VACUOUS `state` axis) SURVIVES, offered as proof the arms pin `conforms` and not
  `state`.
- Suites: typecheck exit 0 ×3; T9 cluster 83/83 ×3; database `1 failed | 83 passed (84)` ×3, the
  failure pre-existing and verified at a parent commit.
- **The seat disclosed a trap that would have hidden a bad campaign:** a shell helper word-split
  `-t producer` into vitest's file filter, so it selected nothing, exited 1, and scored every
  mutant INCLUDING BOTH NEIGHBOURS as killed. The expected manifest refused it; that is the only
  reason it looked. Without the manifest it would have read as a perfect 6/6.

## Residual tension the seat FLAGGED rather than resolved — rule on it
goal-v4 disposes of the conformance gate as "→ evaluator-objection criterion". Under option 2 that
objection is FATAL to the answer, just not via `COMPONENTS_ONLY`. The literal goal sentences and
the DoD row's test both hold. Whether the DISPOSITION'S SPIRIT holds — an objection that refuses
rather than serving with a standing mark, when neighbouring criteria serve with theirs — is the
open question. Say plainly whether you think it does.

## Questions
1. Did the retirement boundary hold?
2. Is the role predicate genuinely a predicate, and does the derived key resolve the ledger entry?
3. Do the three re-pinned arms preserve their subjects?
4. Are the 4 kills credited to the assertions that caused them? (`mutant-index.py` proves FORM,
   not credit — a CLEAN index can still hide wrong-cause deaths, D43.)
5. Does option 2 satisfy the goal's disposition, or only its literal sentences?
6. Fit to merge?

## Rules
Static only — no tests, builds, installs, provider calls, or mutating git. `passed/total`
verbatim. Every finding gets a ticket. CANNOT-ASSESS where you cannot assess. End with
`## PREDICTIONS`.
