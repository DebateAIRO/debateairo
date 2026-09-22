# PACKET — worker S07 (T9 synthesis serve chain) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T09-synthesis.md (filing r1 = rework 0/3; rework
rounds max 3 — J19 wording). You are heartbeat-worker; load the contract + superpowers floor.
Writable surface: the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07
(branch lane/s07 re-pinned to e040b1ee = the S06 merged tip containing TINT1 + T6 + S06, PROVISIONED), report
agent-reports/s07-synthesis.md, self-report agent-reports/s07-synthesis-self.md, logs/s07/**.
Never push; never merge; never edit board or DECISIONS.

## 2. Immediate upstream artifacts
RULINGS FIRST (mission DECISIONS.md): J8 (role-ref provenance: synthesizer/evaluator are named
provider roles read from T16's sealed rows synthesizerRoleRef / evaluatorRoleRef /
evaluatorLoopMaxRounds — never code constants; migration 0050 rows 39-41), J5/J11 (mark
discipline for any mint — e.g. the standing-objection mark, the crash-class marks), J6, J12
(claim-time loud stop for unsealed families — S06 B1 precedent: the SHIPPED entry point
apps/runner/src/main.ts + dev-runner-policy.ts must LOAD and PASS every family you read; F33
shows what happens otherwise), J16-J19, D13-D16, D21, D24 + ADDENDA (token = the mutation;
gates abort; harness refuses a dirty tree), R7-3 confirm-items 1 = yes, 2 = yes (standing
objection → visible mark; the round-3 objection is a MARK not a label input).
F4 DISAMBIGUATION CLAUSE (board/F4-t9-crashset-phrase.md, J4 route): goal lines 248-251 and
263-266 CONTROL over the phrase at line 260 ("after protected-core verification"); the
retired-guard behavior — an exhausted envelope with no served statement takes the envelope
terminal even when restatement failed, never serving over budget — is what T9's DoD TESTS. The
four-word wording amendment stays in V's confirm-item batch; you implement the controlling
reading.
SPEC (FROZEN, verbatim goal 222-270):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S07-synthesis/SPEC.md
PLAN (skeleton, READ-ONLY — D11: workers never write slice files; hand the evidence column and the S07-C1 command/surface to the orchestrator in your report and it mirrors them):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S07-synthesis/PLAN.md
Goal source: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
ANCHORS re-derived at e040b1ee (the goal's dev-baseline numbers have drifted): packages/serve/src/index.ts
— gate trace vocabulary :326-356 (postComposeR9 hook :326; GATE1_R9_* :334-335; GATE4_Q51_* :345-347;
POST_COMPOSE_R9_* :348-349; COMPONENTS_ONLY_ENVELOPE / _DEFECT :355-356); terminal union :368;
the envelope terminal + protectedCoreVerified guard :397-417 (PROTECTED_CORE_NOT_VERIFIED throw
:402-403; PROTECTED_CORE_REFUSED_SKIP → ENVELOPE_EXHAUSTED → COMPONENTS_ONLY_ENVELOPE :415-417);
a second COMPONENTS_ONLY terminal :444; the legacy gate chain :474-564 (R9 load-bearing block
:474-478; Q53 :481; COMPOSITION_BUDGET_EXCEEDED :497; :544; Q51 locator :551-552; Q51 downgrade
:562; answerForm VERDICT :564 — T13 later owns the form). apps/runner/src/index.ts —
terminalRank :687; RUN_COST_ENVELOPE_EXHAUSTED :2507/:3075; protectedCoreVerified derived from
servedRoot.restatementStatus :3086; exhaustion handling :3262-3267. T11's label:
deriveVerdictLabel (serve, computed BEFORE synthesis — your evaluator consumes it for
statement–label agreement); T10's served root + margin receipt (ledger.propagation_run
.served_root_selection). Re-grep all of these yourself before editing; the numbers are a map.
ENUMERATE THE CLASS FIRST (every COMPONENTS_ONLY return, every gate, every guard reference).
Order of work (RED before GREEN on every step):
1. DIGEST: deterministic all-node schema (one entry per materialized node: statement summary,
   final strength, polarity relations, way of knowing, marks), provenance-preserving
   compression; byte budget governs SUMMARY LENGTH per node, never membership; top-2 surviving
   objections + runner-up positions as EMPHASIS fields over total membership; over-budget at max
   compression → LOUD (condition mark + the enumerated crash class), never a silent subset.
   RED: a decisive node outside roots/top-2 must provably reach the recorded synthesizer request.
2. ROLES: SYNTHESIZER and EVALUATOR as named provider roles from T16 rows, fresh-context calls
   with zero debate ties; per-role recorded request schemas, initial vs retry DISTINGUISHED;
   the fresh-context assertion = each recorded request contains NO transcript/provider history
   beyond the named artifacts; recorded-request test: the round-2 synthesizer request contains
   the exact round-1 objection VERBATIM. Evaluator checks fairness to losers, statement–label
   agreement (T11's label), overstatement.
3. LOOP: ≤3 rounds (evaluatorLoopMaxRounds from the register) or evaluator satisfied; after
   round 3 SERVE regardless; standing objection → visible condition mark (mint per J5/J11);
   loop-round records persisted.
4. LEGACY GATE DISPOSITION — one test per former gate path proving its NEW terminal: R9 → evaluator
   criterion (retired guard KNOWINGLY retired per F4); residual-objections-empty → DELETED;
   byte budget → code precondition (tighten + retry, serve with mark; crash class only if the
   digest cannot exist); conformance ≤2 → evaluator criterion (citation tracing to digest
   nodes); Q51 locator → DELETED (unreachable by construction, documented); post-compose R9 →
   evaluator criterion. COMPONENTS_ONLY survives ONLY for: transport death, no-artifact,
   digest-cannot-exist, ENVELOPE_EXHAUSTED after protected-core verification (a resource death,
   no prose; T17 keeps the ceiling big enough). DoD: one test per crash class incl. envelope
   exhaustion asserting terminal + mark + the retired-guard behavior; no non-crash path returns
   COMPONENTS_ONLY; evaluator-unsatisfied-3-rounds serves WITH the objection mark.
5. Production entry point: main.ts + dev-runner-policy.ts load and pass every family you read
   (synthesisRoles) with a claim-time loud stop; entry-point-level assertion.
6. D14/D16 pairs if UI/web/contract/kernel are touched; mode-change count 0; D24 transcripts.

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — S07 r1 (rework 0/3) · comments read through: packet-s07-2026-09-02`;
line 2 `report sha256:` (`sed '2d' … | shasum -a 256`); self-report BEFORE the marker.

## 4. Stop conditions
- Rework rounds max 3 (J19 wording in every marker). BLOCKED (waiting_human) on a credential,
  push, merge, out-of-surface edit, or a ruling need (e.g. a wire shape beyond J17's class).
- Live provider calls: NONE from this seat (D18 bounds; the ceremony is W12's). All synthesizer /
  evaluator calls in tests go through recorded doubles; the recorded-request assertions are the
  proof.
- Final message = FILED + marker + RED/GREEN log paths per DoD row (PLAN trace table rows 1-6).

## REWORK ROUND 1 of 3 (2026-09-02) — codex r1 CHANGES, three blocking, all one theme
Verdict: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-r1.md
THE THEME (ruled J25): a disclosure that exists only in a returned object is not a disclosure.
The scope law asks for a VISIBLE mark on the served answer; an in-memory array that no consumer
persists cannot be seen by anyone reading the answer, and a test asserting on that array proves
only that the function returned it.
- B1: J24 is not implemented where it must be. The only pre-claim check verifies the policy
  family is syntactically present; a sealed ref naming an unconfigured provider is not refused at
  claim time, and worse, a named provider found absent by claim-time probing is silently removed
  from the healthy maker set. Resolve BOTH sealed refs by identity against the claim-eligible
  providers before claim, refuse loudly without substitution, and emit a visible mark naming the
  unresolvable role. The architecture test currently proves source ORDER for a different check —
  replace it with one that fails when a ref is unresolvable.
- B2: loop-round records and prior-candidate references are transient. Persist one ordered record
  per round carrying the exact synthesizer request, the candidate statement or a resolvable
  artifact reference, and the exact evaluator request and verdict. `referenceCandidate` currently
  fabricates `candidate:round-N` rather than referencing the recorded artifact — the DoD's
  "round-2 request contains the round-1 objection VERBATIM" means the RECORDED request, not a
  process-local label. Test across the persistence boundary, not on the returned array.
- B3: PROTECTED_CORE_GUARD_RETIRED is added by the constructor and then lost at persistence, so
  the retired guard's disclosure never reaches a reader. Carry it into a durable visible
  projection (full gate trace, typed disclosure, or a sealed field) and test through persistence.
BEFORE FILING, run the stale-stamp check (D27 ADDENDUM) and paste its output; it must be empty.
Marker: `REWORK READY FOR REVIEW — S07 r2 (rework 1/3) · comments read through: s07-codex-r1-2026-09-02`.

## REWORK ROUND 3 of 3 (2026-09-02) — the LAST lawful round; filing r5
Verdict: agent-reports/S07-codex-r3.md. Read J29 ADDENDUM at the DECISIONS tail first — it
answers the question you flagged against yourself, and one of the three findings is mine.
- B1 (blocking): REMOVE the retained request body and its encryption-carrier machinery from
  serve.synthesis_round. The frozen SPEC asks for recorded-request ASSERTIONS and loop-round
  RECORDS; it never asks for the request body to be persisted. And the carrier cannot prove "the
  request as sent" because the same in-memory object feeds both the provider packet and the row.
  Keep the ownership-aware leased reader and the durable structural and reference fields.
- B2 (blocking): your refs prove "some artifact in this run", not J29's "same run AND ROUND
  PRODUCER" — an unrelated JUDGE artifact from the same run passes today as both candidate and
  verdict ref. The ledger already distinguishes producers: resolve each ref before commit through
  the matching successful ledger_entry and raw-artifact attempt for this run and work item at the
  EXPECTED call site and round, and make the oracle join on that, not on run_id alone. Your
  negative arm must exercise a same-run WRONG-PRODUCER ref, not only cross-run.
- N1 is mine (the T16 mischaracterisation) and is corrected in DECISIONS; nothing for you beyond
  not repeating the phrase.
Run tools/stamp-check.sh (the mission's only comparator now — D41) against this round's prefix and
paste its output. After this filing there is no lawful round: anything unclosed becomes a V-row
draft with decision, recommendation and default.
Marker: `REWORK READY FOR REVIEW — S07 r5 (rework 3/3) · comments read through: s07-codex-r3-2026-09-02`.
