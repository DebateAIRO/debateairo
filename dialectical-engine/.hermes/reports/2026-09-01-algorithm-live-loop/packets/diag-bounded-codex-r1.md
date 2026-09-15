# CODEX REVIEWER PACKET — lane/diag-bounded · F-DIAG-OPERATIONAL-REGEX + F-DIAG-ROLLBACK-COLLAPSE · round 1 · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-bounded   (branch lane/diag-bounded; base dev d5b4f7f5; tip d6d0f69c — verify; one commit)
working dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-bounded/dialectical-engine
worker packet : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/diag-bounded-worker.md · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/diag-bounded-worker-1.txt
seat filing   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-bounded.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-bounded-self.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/diag-bounded/
origin        : the risk-signal-diagnostics seat's class sweep; your rejection of shape rules (sessions-argon2 r1 F2); the landed pattern apps/api/src/risk-signal-identity.ts
tickets       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-DIAG-OPERATIONAL-REGEX.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-DIAG-ROLLBACK-COLLAPSE.md
```

## The seat's claims (verify by artifact)
- Both formatters (`apps/api/src/index.ts` apiOperationalErrorDiagnostic; `apps/runner/src/index.ts` runnerTerminalFailureReason) now return from a CLOSED alphabet of 304 strings: typed codes, an explicit dependency-code allow-list, an explicit message-constant allow-list with producers cited, a fixed fallback; the message-shape passthrough and the name-derived class code removed as passthroughs. Because a shared module was out of contract, the allow-list is DUPLICATED in the two files with a "twin-copy byte-identical" test (mutant e: an entry drifting in one copy is caught).
- `packages/db/src/index.ts`: four bounded rollback categories carried on the thrown error; public code RUN_CONTENT_ROLLBACK_INCOMPLETE and message preserved; new `tests/unit/run-rollback-categories.test.ts` (4).
- Gates: api-operational-error 5/5 ×3; dev-runner-reconciliation 6/6 ×3; rollback categories 4/4 ×3; s6 integration 48/48; typecheck 8 lines identical. Mutants a/b/d/e KILLED, c (rename, MUT_EXPECT=6) SURVIVES. stamp-check: 9/9 at the tip; 12 with 3 preserved baseline captures.

## Questions
1. Is the alphabet CLOSED — can any caller-controlled string reach either output through code/message/name/cause or through a typed error's code field? Read both formatters; try to construct an escape. STRENGTH.
2. The allow-lists: is every admitted message constant a real producer on the paths these formatters see (spot-check five citations), and is anything admitted that is not a constant? Were any existing test assertions changed, and were those exactly the ones encoding the rejected shape rule?
3. The twin-copy design: is a duplicated allow-list guarded by a byte-identity test an acceptable landing, or must the orchestrator grant a shared module (name where it should live) BEFORE this lands? Rule on it — this decides APPROVE vs CHANGES, or APPROVE with a follow-up ticket.
4. Rollback categories: bounded, internal, raw causes never forwarded, public code/message byte-identical? Are the four categories the right partition (rollback failed / key destroy failed / both / neither)?
5. Mutants: a/b/d/e killed by the intended assertions; c the right neighbour; custody complete?
6. Packet audit (the orchestrator's): contract reach — the "no shared module" clause forced the duplication: charge or clear the packet for that. Provisioning: real exit codes and PROVISIONED OK commit= line.
7. Landing: mergeable into dev d5b4f7f5? Isolated merge-tree; state the tree.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-bounded-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/diag-bounded-codex-r1-self.md
```
Line 1 exactly: `CODEX REVIEW DIAG-BOUNDED r1 — <APPROVE|CHANGES> · comments read through: diag-bounded-r1-2026-09-07`; counts; per-finding File/line · Input → wrong outcome · Required fix · STRENGTH; `## Packet audit`; `## Landing`; `## Not verified`; final line `REVIEW: approve|changes — <one sentence>`. Static plus saved artifacts; you may run the three unit files once (no listen needed); no git mutation, no install, no push; no edits to the board or the DECISIONS file.
