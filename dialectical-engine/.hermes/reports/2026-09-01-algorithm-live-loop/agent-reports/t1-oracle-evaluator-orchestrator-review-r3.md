ORCHESTRATOR REVIEW T1-ORACLE-EVALUATOR r3 — APPROVE · comments read through: t1-oracle-evaluator-impl-r3-2026-09-07

# F-T1-ORACLE-EVALUATOR round 3 — Codex implemented under D69; Fable 5.1 reviews; I wrote none of the code

Reviewed tip 1d3e2255b0f5be243155c962c2aba1946e3c65a2 (three commits after the session-open commit 0b542362; +811/−253 in tests/support/depthOracle.ts and tests/unit/s1-1-depth-contract.test.ts; porcelain clean). Every row below was read from its artifact at write time; STRENGTH per D67.

## Verified by artifact

| Claim | What I read | STRENGTH |
|---|---|---|
| Both WHOLE_DOMAIN fallbacks removed; bare DOMAIN controls on domainSites | `grep -c WHOLE_DOMAIN` = 0 in the evaluator and the test; the test calls `domainSites(` at 472/703/717/1692/1721; the shipped scan `duplicateBoundSites(path, source)` at test:349 | entailed |
| Emission keyed by `start:end` | depthOracle.ts:1108 `const address = \`${candidate.start}:${candidate.end}\`` | entailed |
| C1: computed-member and comma-right in operand evaluation | depthOracle.ts:789 (comma), 815/832/836 (ElementAccess with integer argument on an EXACT receiver), 875/882 (upward walk mirrors) | entailed for presence; the behaviour is asserted by inventory rows C3-312/313 |
| RED first | 08 (4 failed), 10 (248 failed), 14/15/16 (4 failed each), 17 (62 failed), 18/19 (14 failed each), 28 (1 failed: A3 emits 1 where 2 asserted); 27 is the line:kind stage BEFORE the A3 assertion (3 passed) | entailed |
| Selected ×3 | 87/88/89: `Tests 997 passed | 13 skipped (1010)`, EXIT STATUS: 0 each; smoke 5/5 | entailed |
| Typecheck identity | 90: exit 1, the 8 s14-ui diagnostics identical to the baseline (03) | entailed |
| Census | 91: 232/232 parsed, 59 TSX, 33 candidates all OTHER, 1 emitted site (LoginFlow) | entailed |
| Model mutants | 36: total 1; K3/K4/K5 = 24/2/2, each restored to 1 | entailed (read from the seat's JSON; the transcripts 42–44 exist with RESULT lines) |
| 44 transcripts | 84: count 44, kills 43, survivals 1 (m6), restored_green 44; 44 `RESULT: ok` lines across the r3 logs; K3/K22 multiplicity 2 | entailed |
| Boundary inventory | 09: 354 rows C3-001…354 labelled by §3 clause; codex r2c's fifteen missing families are all present (optional/generator per operation; clause-3 forbidden forms incl. await/yield/tagged template/object/nested function/this; arities incl. spread for map/filter/flatMap; splice 0/1/2/negative/sign; sort lexical vs numeric receiver; fixed return kinds some/every/indexOf/lastIndexOf/findIndex/forEach; element returns find/findLast/at/pop/shift; numeric index; always-UNKNOWN reduce/reduceRight/concat/flat/fill/with/toSorted/toReversed/copyWithin; collection kinds incl. new Map, has, size, sole-argument pairs; SameValueZero bool/null/undef and jsx/arr identity; Prim transfers unary +/- and truthiness/nullish over every constructor; wrappers incl. satisfies; C1 sibling grammar incl. computed member and comma right; binding aggregation, out-of-range, no-names; work limits 8 rows) | entailed for row presence; consistent-with for "every rule" — I did not re-derive §3's clause count independently |

## Open at draft time
- The HISTORICAL attack checklist: VERIFIED. The committed `historicalAttacks` table (test:1201–1250) has 44 rows spanning r1, r1b, r2 B1–B10, r2b R1/R2, r2 B4 (flatMap depth exhaustion), r1b F3 and r2c C1 (computed sibling member, comma right, Array.from sibling). r1 B6's lexical classes live in the round-1 parse-context fixtures, not in that table: a regex literal after a control-condition parenthesis (test:406), JSX text that resembles a line comment (:412), a template nested in another template's substitution (:418), plus A4/A6/A7 (template expression, comments as trivia, regex not a candidate) and the truncated-source INCONCLUSIVE at :1719. STRENGTH: entailed for presence.
- Records: `stamp-check.sh` at the tip flags 99 NO-STAMP + 2 STALE of 148; the v3 transcripts (42–83 `-v3.log`) are stamped; the final gate logs 86–90 and the RED logs are NOT stamped (D64 ADDENDUM 5). Non-blocking IF my own stamped re-run of smoke/selected/typecheck at the tip agrees — see below.
- The full suite: the seat's sandboxed run is not a gate (listen EPERM; 97 such errors). The orchestrator's run at the tip is the gate — see below.

## My own re-run at the tip (outside the sandbox), stamped `commit=1d3e2255…`, stamp-check 3/3 OK (r3/99a–c)
| run | observed | STRENGTH |
|---|---|---|
| smoke | 5 passed (5), exit 0 | entailed |
| the whole oracle file | 1 failed / 1009 passed (1010), exit 1 — the one failure is the inherited architecture-audit ENOENT (`web/package.json` absent on this line; red on dev 1d954e88; out of this ticket's contract). Note: the seat's "997/997" counted its selected describe subset (13 rows skipped); the whole-file number is 1009/1010 with that one inherited row | entailed |
| typecheck | 8 diagnostics, the set identical to the seat's baseline (03) | entailed |

## Full-suite four-count and attribution — the gate (r3/97-full-suite-r3-orchestrator.log, gate-run.sh, CLEAN-STATE unchanged; 98-fourcount-orchestrator.txt; 98-attribution.txt)
**79 / 1 / None / 1** — passed 3308 · total 3387 · 35 of 261 files · 2933 s. fourcount5: summary, file and failed-file identity all OK.
- vs dev 1d954e88 (the lane's base, 81/1/None/1): **0 appeared · 2 disappeared** — `S1-1 · the depth bound has a single source > keeps the owning declaration as the only depth-bound site in shipped code` and `… > leaves no duplicate definition of the ruled ceiling anywhere in shipped code`. Those two are the ticket: the text emitter reported LoginFlow's `[1..6]`-derived run as a duplicate ceiling; the evaluator now rules it and reports nothing else (census 33 candidates all OTHER, 1 emitted site). STRENGTH: entailed.
- vs the lane's r2b run (81/1/None/1): +POL-03 (red on dev too; F-FLAKE-POL03), −T17 envelope-ledger (fixed by the dev merge f8e1210b), −the two S1-1 rows. Nothing unexplained.
- Suite-load failure `tests/unit/s14-ui.test.ts` and the unhandled `ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` rejection: identical to both parents.

## Findings
- **F-EVALUATOR-R3-STAMPS (records, non-blocking, filed):** the seat's gate/RED logs carry no commit stamp; covered by my stamped re-run above. The packet (mine) never told the Codex seat about the stamp contract.
- **Coverage wording (non-blocking):** the report's "997/997 selected" is the describe subset; state the whole-file count (1009/1010 with the one inherited row) in any later citation. No ticket: corrected here.
- No blocking finding. C1, C2, C3 and F1 from codex r2c are closed by artifact; the fifteen missing families are in the inventory; the historical attack classes are in the committed test; RED preceded GREEN at every step I checked.

## Not verified
- I did not re-derive §3's clause count independently ("every rule" is consistent-with, from the 354-row inventory and codex's fifteen families all present).
- I did not re-execute the 44 mutation transcripts; I read their RESULT lines (44 `ok`), the summary JSON, and that the v3 transcripts are stamped to the tip.
- Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## Verdict
REVIEW: approve — the evaluator rules LoginFlow's derived run and nothing else on the shipped corpus, the two ticket rows turn green with zero appeared names against the lane's dev base, and every residual codex named in r2c is closed by artifact; landing into dev under D70.
