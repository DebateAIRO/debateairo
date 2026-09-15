# CODEX REVIEWER PACKET — F-TOOL-MUTATE-3 · stamp-check.sh v3.2 alone (your dev-health r1 S1 and r1b S1 remainder) · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
the tool      : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/stamp-check.sh (v3.2) · predecessors /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/tooling/stamp-check.sh.v1-before-F-TOOL-MUTATE-3, .v2-last-stamp, .v3.1
the emitters  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/gate-run.sh (v3) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh (v3)
the fixture   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/tooling/st3-fixture/ (repo + recs/01–14 + EXPECTED.md, PRESERVED) · self-test /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/tooling/st3-v3.2-selftest.log
your rulings  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-health/codex-r1-verdict.final-snapshot.md (S1) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/dev-health/codex-r1b-verdict.final-snapshot.md (S1 remainder: completion parsed from output; discriminator not enforced; payload boundaries; population exclusions; fixture cases to add)
ticket        : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-TOOL-MUTATE-3.md
```

## What v3.2 claims (verify by reading the script and running the fixture)
- Emitter-aware framing: one awk pass marks spans `<<<OUTPUT…OUTPUT>>>`, `<<<OLD…OLD>>>`, `<<<TOKEN…TOKEN>>>`; headers, EXIT, CLEAN-STATE and RESULT lines are recognised only OUTSIDE spans.
- A header must carry the emitter discriminator (` gate=` or `mutate.sh v3`); a commit/tree line without it is not a header (treated as a bare stamp). The newest header is the block.
- Completion judged only on lines AFTER the header and outside spans, in ORDER: gate-run → `EXIT = n` then `CLEAN-STATE:`; mutate → `EXIT = n` (the command ran) then `RESULT:`. A trailing partial attempt is INCOMPLETE; no fallback.
- Bare-stamp records: single → identity; differing → AMBIGUOUS; none → NO-STAMP.
- Population: *.sha256, *.pid, *.json, *comparator*, *stamp-check* skipped (v1's exclusions restored; documented in the header).
- Fixture: 14 files; expected 12 compared / 7 failures (03 INCOMPLETE, 04 STALE, 06 AMBIGUOUS, 07 NO-STAMP, 08 STALE, 10 INCOMPLETE — completion text only inside the gate's output, 14 INCOMPLETE — RESULT before EXIT); 11 (a fake header inside a TOKEN payload) and 12 (a non-emitter commit/tree line) pass; 09/13 skipped. Regression: the dev-health r1-5* and diag-class-a -r2 real records still pass.

## Questions
1. Run the fixture; does every case land as EXPECTED.md says? Construct one more forgery if you can (e.g. a RESULT line outside spans but belonging to an inner tool's echo; a header split across lines; CRLF endings) and say what happens.
2. Does mutate.sh's actual output format guarantee that OLD/TOKEN payloads are always fenced and that `EXIT =` precedes `RESULT:` (read mutate.sh :39–:62)? Does gate-run.sh always fence OUTPUT and print EXIT before CLEAN-STATE?
3. Is "identity only, never proof of fresh execution" stated clearly enough for a reader of a green result?
4. APPROVE or CHANGES for the tool. If CHANGES: the exact residual.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/tool-stamp-check-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/tool-stamp-check-codex-r2-self.md
```
Line 1 exactly: `CODEX REVIEW TOOL-STAMP-CHECK r2 — <APPROVE|CHANGES> · comments read through: tool-stamp-check-r2-2026-09-07`; findings with File/line · Input → wrong outcome · Required fix · STRENGTH; `## Not verified`; final line `REVIEW: approve|changes — <one sentence>`. You may run the fixture and construct new fixture files under a scratch directory of your own; no edits to the mission tools, the board or the DECISIONS file; no git mutation.
