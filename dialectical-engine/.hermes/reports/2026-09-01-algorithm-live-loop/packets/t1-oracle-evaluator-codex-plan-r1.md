# CODEX REVIEWER PACKET — F-T1-ORACLE-EVALUATOR · PLAN review (no code exists yet) · gpt-6-astra (D65)

```
mission dir : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
the plan    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md (846 lines, nine sections) · self-report /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-arch-self.md
its packet  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-evaluator-arch.md · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t1-oracle-evaluator-arch-1.txt
V's ruling  : D68 in /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md — build the real evaluator (soundness over landing); ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-T1-ORACLE-EVALUATOR.md
your history: your three verdicts on lane/t1-oracle-loginfp — /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/codex-r{1,2,3}-verdict.final-snapshot.md — are the specification's negative space
the corpus  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp @ 60641339 (parked; read-only) — the round-3 oracle test, 27 layout classes, eight mutants; the shipped files under packages/, apps/, web/
--cd        : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp (read-only; no lane changes; the plan is a mission-dir file)
```

## The plan in three sentences (the seat's)
Token stream from TypeScript's own scanner (`typescript/unstable/ast`, in-process) via a small bounded driver, so strings/templates/regexes stop
being mistaken for syntax and every address comes from a token. Array-literal candidates found at the token level, each given exactly ONE verdict
emitted directly (no merge-point suppression) — removing r2 B2 and r3 B3 as classes. Each candidate's operation chain evaluated over an ORDERED
value list carrying an element sort (NUMBERS / NOT_NUMBERS / unknown), with a shared mini-evaluator for map/filter/flatMap callbacks; position
appears nowhere (closes r3 B1); order tracked through reverse/sort as JS sorts (closes r3 B2). LoginFlow negative because its callback provably
yields JSX; `new Set([0..5].map(n => n || 1))` positive because the evaluator computes [1,1,2,3,4,5] and Set dedupes to the ruled set.

## Three rounds (one implementation file each; RED in the oracle test file co-touched)
1 lexer (`tests/support/depthOracle.ts`, `lexModule`; a whole-corpus lexability assertion — fails today on TWO named files) ·
2 candidates + addressing (token-derived boundaries, one verdict per occurrence, deletion of blankComments / withheldDomainLines / the WHOLE_DOMAIN
clause; a declared enumerated RED set) · 3 the evaluator (abstract domain, operation table, callback mini-evaluator, LoginFlow negative, twelve
mutants, b14). The seat says round 1 is the one that can overrun (three scanner-driver defects measured, two non-terminating; 2 of 232 files
do not lex under a driver without JSX brace context).

## Orchestrator's dispositions (D58: I state outcomes; the seat chose the HOW)
- §9.1 the packet's floor contradiction (r3's `filter(n => n % 2 === 0)` negative control vs your B1's `filter(n => n > 0)` positive): I take the
  seat's (a) — evaluate declared callback expressions per element; (b) "retire the r3 control, report conservatively" is the fallback if you show
  (a) is unsound or unbounded; (c) is refused. **Say which you would take and why.**
- §6.2 the mutant remap: two of the eight r3 mutants target clauses a sound design deletes; the seat maps them to m2′/m3′ and adds m9–m12. I accept
  "one mutant per clause" as the floor. **Say whether the twelve cover every clause of the design.**

## Questions
1. **Soundness of the abstract domain and operation table** (§3): for every operator in the declared grammar, is the rule sound (never claims a
   domain it cannot have; never withholds a domain it can have)? Attack: reverse/sort then slice with negatives; sort with a comparator; map with
   a callback outside the mini-evaluator's subset; spread into a literal with other elements; destructuring with rest; `concat`; computed access;
   `as const`; nested Set/Array.from. Name each hole with STRENGTH.
2. **Outside the grammar → reported as a site** (conservative): is that rule applied consistently, and is the resulting false-positive rate on the
   232-file corpus stated (the seat measured "zero" for one option — check the claim)?
3. **The lexer dependency**: `typescript/unstable/ast` — is it importable under Vitest as under bare Node (the seat: consistent-with), what happens
   on a TypeScript bump (undetermined), Node 22.23.1 vs the seat's 25.7.0 probes? Is a bounded custom driver over `ts.createScanner` (stable
   API) the safer choice? Recommend.
4. **Round 1's overrun risk**: two shipped files do not lex; the seat names them — is the JSX brace-context rule enough, or does round 1 need a
   fallback (e.g. those two files scanned by the old lexer with a declared limit)?
5. **One verdict per occurrence** (§2): is addressing sound for JSX expression containers, template literal substitutions, and comments inside
   the array (the r2 B2 forms)?
6. **Acceptance tests per section** (§1–§8): is each section's acceptance test concrete enough that a worker can make it RED first? Name any that
   is not.
7. **The untouched ceiling-literal and exclusive-bound arms**: the plan leaves `declarationUnits`' inherited string/regex desync in place for them
   (follow-up). Acceptable for this ticket, or must round 1's lexer feed those arms too (scope)?
8. **Packet audit**: my architecture packet (the floor contradiction §9.1, the "eight mutants are the floor" sentence, the grants). Charge or clear.
9. **PLAN: APPROVED | CHANGES** — if CHANGES, list exactly what the architecture seat must change (it has rounds); if APPROVED, say what the
   worker's round-1 dispatch must contain that the plan does not.

## Method
Static; read-only; absolute paths; STRENGTH on every finding (D67). You may run source-only probes (no suites, no git mutation).

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-plan-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-plan-r1-self.md
```
Line 1 exactly: `CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r1 — <APPROVED|CHANGES> · comments read through: t1-oracle-evaluator-plan-2026-09-06`
Then BLOCKING / FOLLOW-UP counts; per-finding **Section · Input → wrong outcome · Required change · STRENGTH**; `## Packet audit`; `## Not verified`;
final line `PLAN: approved|changes — <one sentence>`.
