# CODEX REVIEWER PACKET — lane/risk-signal-diagnostics · F-RISK-IDENTITY-LOG + F-AUTH-RISK-POISONED-CATCH · round 1 · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-risk-signal-diagnostics   (branch lane/risk-signal-diagnostics; base dev 70647e7e; tip d1b29b5b — verify; two commits: f6bd66cc the fix, d1b29b5b the map-pin test)
working dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-risk-signal-diagnostics/dialectical-engine
worker packet : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/risk-signal-diagnostics-worker.md · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/risk-signal-diagnostics-worker-1.txt
seat filing   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/risk-signal-diagnostics.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/risk-signal-diagnostics-self.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/risk-signal-diagnostics/ (01–13)
origin        : your own sessions-argon2 r1 F2 and F3 (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/sessions-argon2/codex-r1-verdict.final-snapshot.md)
tickets       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-RISK-IDENTITY-LOG.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-AUTH-RISK-POISONED-CATCH.md
```

## The seat's claims (verify by artifact)
- The formatter moved out of main.ts into `apps/api/src/risk-signal-identity.ts`: an explicit REASONS map from known constants (incl. LOGIN_/RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED) and recognized categories/codes to bounded text, a fixed UNRECOGNIZED fallback; never the raw message. Test `tests/unit/risk-signal-identity.test.ts` (5) feeds synthetic sensitive content in every field and asserts none reaches the line while the two identities stay visible.
- `packages/db/src/auth-risk.ts`: the single catch split into decrypt-stage and parse-stage catches with a bounded category set `AUTHENTICATION_RISK_SIGNAL_POISON_CATEGORIES`; the public TypeError message AUTH_RISK_SIGNAL_POISONED preserved; three category tests in `tests/unit/p2-auth-risk.test.ts` (7).
- Gates: unit cluster ×3 19/19 (4 files); session-database integration 11/11; typecheck 8 vs 8 byte-identical. Mutants A (message verbatim) KILLED 4/5; A2 (the rejected regex shape rule instead of the map) KILLED 3/5; B (collapsed catch) KILLED 3/7; C (rename the category constant, MUT_EXPECT=3) SURVIVED 12/12. stamp-check: 15 records, 6 flagged, all stamped to the base and named as deliberately preserved.
- The seat asks the reviewer to rule on a point in its WORK line (read it: it concerns the poison category surface).

## Questions
1. F2 (yours): is the map the mechanism you required — bounded output alphabet, fixed fallback, no shape rule? Can ANY caller-controlled string reach the log line through name/code/message/cause? Read the formatter, not the test. STRENGTH.
2. F3 (yours): are the two categories bounded and internal, the public classification byte-identical, and nothing raw (decrypted text, ciphertext, keys, parser message) forwarded? Is the category surface the seat asks about (its WORK-line question) the right one — rule on it.
3. main.ts: only the import and the two consumers changed? Any behaviour change at the composition root? STRENGTH.
4. Mutants: are A/A2/B killed by the intended assertions (read 10–12), and is C's survival the right neighbour? Custody lines complete (v3)?
5. Packet audit (the orchestrator's): contract reach; the facts; the provisioning log (real exit codes + PROVISIONED OK commit= line this time). Charge or clear.
6. Landing: mergeable into dev 70647e7e? Isolated merge-tree calculation as before; state the tree.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/risk-signal-diagnostics-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/risk-signal-diagnostics-codex-r1-self.md
```
Line 1 exactly: `CODEX REVIEW RISK-SIGNAL-DIAGNOSTICS r1 — <APPROVE|CHANGES> · comments read through: risk-signal-diagnostics-r1-2026-09-07`; counts; per-finding File/line · Input → wrong outcome · Required fix · STRENGTH; `## Packet audit`; `## Landing`; `## Not verified`; final line `REVIEW: approve|changes — <one sentence>`. Static plus saved artifacts; you may run the unit cluster once (no listen needed); no git mutation, no install, no push; no edits to the board or the DECISIONS file.
