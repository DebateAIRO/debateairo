# CODEX REVIEWER PACKET — lane/t1-oracle-loginfp r1 · T1's depth oracle false positive on dev's login slots · gpt-6-astra (D65)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp   (branch lane/t1-oracle-loginfp; base 2af816f1 = lane/devsync round-3 tip, the dev-reconciled tree V chose for the closing run, D66)
tip           : f079a206   (fix at fa118168: tests/unit/s1-1-depth-contract.test.ts +88 −3; f079a206 adds 36 trap lines only)
worker packet : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-loginfp-worker.md · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t1-oracle-loginfp-1.txt
seat report   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md (317 lines) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-self.md
round records : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/  (03 RED before, 04 RED new controls, 05 GREEN, 08/09 mutants m1/m2, 10/11 m3/m4, typecheck 02/07, b14 log)
your basis    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w5-codex-r2.md — your F1 named this defect and forbade deleting the three bare option-domain controls
```

## The seat's claims (verify by artifact)

- One executable line changed, in the constant BOTH arms read: `WHOLE_DOMAIN` gains a lookbehind
  `(?<!\d\s*,\s*)` and a lookahead `(?!\s*,\s*\d)` — a numeric run that merely CONTAINS the ruled domain's
  digits (extended before the 1, as LoginFlow's 0-based `[0,1,2,3,4,5]`, or after the 5) is a different
  domain; the ruled run `1,2,3,4,5` stays caught wherever it sits and however wrapped, with NO depth
  token required. Class swept: 232 shipped files hold exactly one member.
- RED 3 failed | 41 passed (44) naming `LoginFlow.tsx:252 [DOMAIN_ENUMERATION]` → RED with new controls
  7 | 43 (50) → GREEN 1 failed | 49 passed (50), three-run cluster identical. **The one remaining red
  in that suite is named in the report — confirm which, and that it predates the lane.**
- Mutants via `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` v2: m1 re-loosen → LoginFlow returns (EXIT 1); m2 a real depth bound
  planted INTO LoginFlow.tsx itself → caught as `[DEPTH_BOUND_LITERAL] expansionDepth < 6` (EXIT 1) —
  proving shape, not filename; m3 neighbour survives (EXIT 0); m4 kills the safety-net assertions. All
  HASHES MATCH, porcelain empty.
- Typecheck differential 8 → 8, byte-identical sets, none in the changed file. Contract hash 842c6c4e… (matches the tree).
- b14 (D66 accounting): 79 test failures / 1 suite-load / 0 skips / 1 unhandled; parse check 79/79;
  reconciliation vs W5 run 2: 80 − 2 vanished (both the lane's) + 1 appeared = 79; totals 2424 / 2345 close.
  **The one appeared name** `registration.test.ts › S3 rework4 … sendmail` — mechanism `SENDMAIL_TIMEOUT`
  (wall-clock deadline on a spawned process), no import path to the changed file, 3 isolated re-runs 58/58 —
  classified a load-dependent flake and FILED, not absorbed.
- Four packet defects (§7), the load-bearing one: the packet's prescribed justification "the ruled domain's
  literal values NEAR A DEPTH TOKEN" was a MECHANISM you had forbidden (F1) and unreachable code (the domain
  run always contains a bare 5, so the ceiling-literal arm claims any depth-carrying candidate first).

## Questions

1. Is the lookbehind/lookahead exclusion the right cut, or does it also exclude a legitimate way of writing
   the ruled domain (e.g. `[0, 1, 2, 3, 4, 5].slice(1)`, or a run written with a leading sentinel)? Name a
   counterexample or say none exists.
2. Confirm m2 proves shape-not-filename, and that m1 dies for the reason claimed (re-read the mutant transcripts).
3. The remaining 1/50 red and the appeared sendmail name: are both attributed correctly? Is "flake" earned by
   the three isolated runs, or does the b14 log show something the seat missed?
4. Does the fix preserve every real depth site the oracle caught at 2af816f1 (compare the site lists before/after)?
5. **Packet audit.** The worker packet prescribed a mechanism you had forbidden (D58 breach — charge), spelled
   `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` (a mission-dir tool) repo-relative when it lives in the mission dir, put the m2 duty against a `readonly`
   path, and cited D58/D66 that are not `## D` headings in DECISIONS.md. Charge each or clear.
6. **Landing**: this lane is dev-reconciled-based. Say the route: V merges it into dev after lane/devsync; the
   orchestrator transfers the one test-file delta onto integration (the W4 pattern). Is the transfer clean
   against integration 1485b9e2, where the oracle file differs from this tree's (T1's lane landed there
   earlier — say whether the hunk applies)?
7. **MERGEABLE** — into dev (after devsync), and transferable to integration — yes/no each.

## Method

Static; no mutating git; verify by artifact; absolute paths.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-codex-r1-self.md
```

Line 1 exactly:
`CODEX REVIEW T1-ORACLE-LOGINFP r1 — <APPROVE|CHANGES> · comments read through: t1-oracle-loginfp-r1-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required fix**;
`## Packet audit`; `## Not verified`; `## PREDICTIONS`; final line `MERGEABLE: yes|no — <one sentence>`.

<!-- edited between attempts (2026-09-05 18:20): two tool paths made absolute after the extended lint (tools/) refused the re-dispatch; no other change. Attempt 1 died at provider capacity. -->
