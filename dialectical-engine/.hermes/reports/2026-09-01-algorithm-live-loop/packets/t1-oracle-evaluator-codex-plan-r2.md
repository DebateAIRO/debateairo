# CODEX REVIEWER PACKET — F-T1-ORACLE-EVALUATOR · PLAN review round 2 (your r2) · gpt-6-astra (D65)

```
mission dir : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
the plan    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md — REVISED IN PLACE (846 → 1842 lines): originals banner-marked SUPERSEDED, a dated "§N — REVISION 2" block after each affected section, a Revision-2 index at the top
self-report : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-arch-self.md
your r1 (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/codex-plan-r1-verdict.final-snapshot.md — B1–B8, F1, F2, "Exact revision requested"
round packet: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-evaluator-arch.md (AMENDMENT 1) · dispatch /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t1-oracle-evaluator-arch-2.txt
corpus      : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp @ 60641339 (parked, read-only) · --cd is that lane
ROUND COUNT : the architecture seat has ONE round left after this.
```

## The seat's claims (verify by artifact)
- All eight blockers reproduced before revising (native evaluation of every B2/B3/B4/B8 expression; a fresh 232-file parse; an AST census;
  structural line/offset checks); none argued down.
- **Lexer: the classic parser accepted, the TS 7 scanner track withdrawn.** Measured (M6/M7): `createSourceFile` parses all 232 files with 0
  diagnostics, yields 0 candidates for `<p>[1,2,3,4,5]</p>`, FINDS the array in both inputs the driver lost, gets the ASI statement line (2) and the
  JSX-container line (1) right. One dependency change retires B1 and B5 together. The seat's own error named: it resolved `typescript` at the root
  (7.0.2) and missed 5.9.3 in apps/ui/package.json.
- §9.1: (a) with the even-filter negative control retained; the seat charges itself for dressing a design gap as a contract conflict.
- Round-1 fallback: no old-lexer backstop; a failed parse yields one file-level INCONCLUSIVE record that fails the shipped assertion by name.
- B6 remeasured: the evaluator's population is 33 numeric-array candidates in 6 files (23 behind Object.freeze, one .includes, one LoginFlow
  .map, none with distinct set {1..5}); expected shipped result 0 DOMAIN sites only because of three modelling decisions absent from Revision 1
  (without them 24, then 2, then 1) — round 3 stages them so each number is attributable.
- B7: the five "real LoginFlow" controls ended at `.map((slot) => (` with no callback body — completed now.
- Rounds are now FOUR: round 0 dependency gate · round 1 parser + candidate table · round 2 verdicts over the candidate table (asserted on
  `candidatesOf`, not on sites) · round 3 emission + LoginFlow + mutants. Round 2 is the long one.
- **D-R2-1, decided by the orchestrator (D68 ADDENDUM): GRANTED** — a root aliased devDependency `"typescript-classic": "npm:typescript@5.9.3"`
  (package.json + pnpm-lock.yaml in round 0's contract; the lockfile delta reviewed; no relative import into apps/ui or .pnpm; not the TS 7 scanner).
  Say whether the alias is the right mechanism, and what round 0 must prove (Vitest resolution; Node 22.23.1 — the seat's probes ran on 25.7.0).
- Open unknowns kept undetermined; `parseDiagnostics` (not public API) isolated behind one accessor; the F1 `declarationUnits` regex input a
  concrete deferred defect. The seat's own universal sweep caught three more overreaches in its new text (incl. "every row's mutant is
  non-equivalent" at the head of the K1–K28 matrix) — corrected.

## Questions
1. For each of B1–B8: does the REVISION 2 block resolve it (verify against your own required change), with STRENGTH per item?
2. The classic-parser choice and the alias grant: sound, and is round 0's gate sufficient (what exactly must be green before round 1 starts)?
3. The candidate population (33 in 6 files) and the staged modelling decisions: reproducible? Is "0 DOMAIN sites" the honest expected result, and
   is each of the three decisions sound (name them)?
4. The four-round split: is each round's RED-first acceptance concrete and reachable in its file budget; is round 2's "assert on candidatesOf,
   not sites" the right cut?
5. The K1–K28 clause → mutant → control matrix: complete and discriminating (spot-check ten rows)?
6. F2 items now settled by the orchestrator: LoginFlow as a named temporary mutant target for m5/m6 (granted, same terms as before); "≤ 1
   implementation file per round, the oracle test co-touched" (the reading the seat spelled out). Charge or clear the packet.
7. **PLAN: APPROVED | CHANGES** — if APPROVED, list what the worker's round-0/round-1 dispatch must contain that the plan does not; if CHANGES,
   exactly what the architecture seat must change in its LAST round.

## Method
Static; read-only; absolute paths; STRENGTH on every finding (D67). Source-only probes allowed; no suites; no git mutation.

## Output — ONLY these two files
```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-plan-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-plan-r2-self.md
```
Line 1 exactly: `CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r2 — <APPROVED|CHANGES> · comments read through: t1-oracle-evaluator-plan-r2-2026-09-06`
Then BLOCKING / FOLLOW-UP counts; per-finding **Section · Input → wrong outcome · Required change · STRENGTH**; `## Packet audit`; `## Not verified`;
final line `PLAN: approved|changes — <one sentence>`.
