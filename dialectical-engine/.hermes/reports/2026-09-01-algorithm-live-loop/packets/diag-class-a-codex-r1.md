# CODEX REVIEWER PACKET — lane/diag-class-a · F-DIAG-S04-PANEL-NOTE + F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED + F-DIAG-DEV-AUTH-STACK · round 1 · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a   (branch lane/diag-class-a; base dev 1fc2dece; tip e86c850e — verify; one commit)
working dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a/dialectical-engine
worker packet : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/diag-class-a-worker.md · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/diag-class-a-worker-1.txt
seat filing   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-class-a.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-class-a-self.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/diag-class-a/
origin        : the risk-signal seat's class sweep (Class A: a formatter forwards a caught message); your prior rulings on this class (sessions-argon2 r1 F2; diag-bounded r1 F1, r1b F2/F3, r1c qualification on stored-vs-derived lists)
tickets       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-DIAG-S04-PANEL-NOTE.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-DIAG-DEV-AUTH-STACK.md
```

## The seat's claims (verify by artifact)
- s04: the MEMBER_FAILED note's `reason` drawn from PANEL_MEMBER_FAILURE_KINDS (7) + the two provider subclass codes + the fixed fallback UNCLASSIFIED_MEMBER_ERROR; note shape and failureKind semantics unchanged. tokenUnlock: the UNCLASSIFIED sentence fixed; the other four branches byte-identical. dev-auth-stack: an explicit KNOWN_DEVELOPMENT_ERROR_CODES set from the dev-*.ts producers; the cause walk and join order preserved; unknown DEV_-shaped messages fall to the fixed code.
- Gates ×3 with exit codes: judgement-s04 17/17; dev-auth-stack 19/19; v2ui-data-layer 59/59 (the tokenUnlock owner; pol01-policy named as a second owner, run once); typecheck identical. Mutants A/B/C (passthrough restored) KILLED; D/E/F (consistent renames) SURVIVE. stamp-check 17 records, 6 preserved base captures named.
- The seat also ran the whole tests/unit directory at the tip (17 failed / 2331 passed) and attributed the failures by stashing its diff — read its paragraph and check the attribution.
- Two out-of-contract findings named, not fixed (read them; say whether each needs a ticket).

## Questions
1. Per formatter: is the alphabet CLOSED (construct an escape: a PanelMemberFailure subclass with a caller-chosen failureKind; a non-Error thrown value; a cause chain deeper than four; a DEV_ code with trailing whitespace)? STRENGTH.
2. The dev-auth-stack set: is every admitted DEV_ code a real producer (spot-check six) and is any producer missing (your own sweep of apps/runner/src/dev-*.ts)? Stored-vs-derived: is there a producer audit separate from the set?
3. Any public text/kind changed that the packet forbade? Are the "byte-identical" claims for the four tokenUnlock branches true?
4. Mutants A–F: killed/survived for the intended reasons (read the transcripts' failing assertions)? Custody complete?
5. The wider-suite attribution (17 failed): is the seat's stash comparison sound, and are all 17 in the dev gate's known set (`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-merge/03-names-dev.txt` and `10-attribution.txt`)?
6. Packet audit (the orchestrator's): contract reach; the facts (e.g. the "76 sites" prior count); provisioning. Charge or clear.
7. Landing: mergeable into dev 1fc2dece? Isolated merge-tree; state the tree.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-class-a-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-class-a-codex-r1-self.md
```
Line 1 exactly: `CODEX REVIEW DIAG-CLASS-A r1 — <APPROVE|CHANGES> · comments read through: diag-class-a-r1-2026-09-07`; counts; per-finding File/line · Input → wrong outcome · Required fix · STRENGTH; `## Packet audit`; `## Tickets to file`; `## Landing`; `## Not verified`; final line `REVIEW: approve|changes — <one sentence>`. Static plus saved artifacts; you may run the three unit files once; no git mutation, no install, no push; no edits to the board or the DECISIONS file.
