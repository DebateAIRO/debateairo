CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r4 — CHANGES · comments read through: t1-oracle-evaluator-plan-r4-2026-09-06

BLOCKING: 1 / FOLLOW-UP: 4.

The primitive representation, callee-role condition, public type repair and 27+3 floor migration resolve R3-B1–B4 for the named inputs. R3-B5 is only partly resolved: there is now a countable manifest, but several entries still do not determine their promised observation, and K8/K9/K10 disappeared without a disposition. Retain the classic-parser architecture. This review authorizes no further architecture round. **STRENGTH: entailed** for the specification defects and artifact contents; **consistent-with** for retaining the architecture and the feasibility of the four repaired contracts.

Read the reviewer packet in full first, then the complete 3,122-line plan, complete 704-line architecture self-report, final r3 verdict, architecture packet including AMENDMENT 3, bounded dispatch, worker round-0 draft, ticket, relevant V rulings and D67/D68 addenda. Reviewed plan SHA-256: `0e3abf4397e75120964a484f8892de4519c6b00ed84586f167e85b6240e877f9`; architecture self-report SHA-256: `c3a0d2a4586e040410f5d6c2ac72c1308f2e5d34ca6cd4ae9703fd17b09bb99e`. The parked lane is clean at `60641339b983365952dd6cd61ed2f379aef6dc8a`. All 232 scanned source files match their blobs at that commit. **STRENGTH: entailed.**

## Disposition of the five bounded items

| Item | Disposition | STRENGTH |
|---|---|---|
| R3-B1 — primitive storage and Set equality | Resolved for the requested contract. §3.17 retains primitive payloads, defines every Cell→Prim case, classifies over cells, and sends identity-unknown Set inputs to UNKNOWN. The sentinel pair and unary chain are representable and replay correctly. | entailed for representation and replay; implementation undetermined |
| R3-B2 — member invocation ownership | Resolved. §3.18 requires receiver identity and callee identity as well as name/arity. Both dotted and computed argument-members take the unknown enclosing-call path. K45's fixture bytes still need alignment with its span assertion; that is a manifest defect below. | entailed for AST facts and written role condition; implementation undetermined |
| R3-B3 — stage records, site union and stub RED | Resolved in the operative signatures and §8.16's named RED list. The old errors reproduce; the new discovery/evaluated records and narrowed Site access compile in an isolated TS 5.9.3 check. K50 is GREEN under the stub, contrary to §6.15's remaining “four failing assertions” wording; F4. | entailed for isolated diagnostics and rule replay; repository typecheck undetermined |
| R3-B4 — floor and routing | Resolved for the parked control corpus. §5 R4 and §8 R4 specify 27 ceiling + 3 bare DOMAIN, retain both standalone negatives and the kindOf half, and move the old WHOLE_DOMAIN removal together with DOMAIN routing to round 3. Porting this floor to the different worker base still needs an explicit dispatch step; F2. | entailed for source inventory and routing instructions; implemented extraction undetermined |
| R3-B5 — operative manifest and O1 | Partly resolved. 45 mutation IDs + one survival are enumerated; the round split is 3+2+40. K13 explicitly means fallback UNKNOWN; O1 controls are specified before implementation. Wrong/ambiguous result pairs, a budget interaction and three undisposed prior IDs remain. R4-B1. | entailed for counts, omissions and K16 contradiction; conditional predictions identified below |

## R4-B1 — BLOCKING: the manifest still cannot be executed without changing its contract

**Section:** [§6.13 R4 manifest](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2104), [§6.14 inventory](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2162), §3.13's independent work limits and §3.15's UNKNOWN continuation.

**Input → wrong outcome:**

1. **K16 has the wrong mutant verdict.** Its edit is “unmodelled method → identity” on:

   ```ts
   const choices = [0,1,2,3,4,5].slice(1,4).concat(4,5);
   ```

   The native expression yields `[1,2,3,4,5]`; the declared evaluator reaches UNKNOWN at unsupported concat. Under the specified identity mutation, concat returns its receiver, `[1,2,3]`. Numeric classification is OTHER. The row promises **UNDETERMINED→RULED**, but its edit gives **UNDETERMINED→OTHER**. The old row had the correct reporting direction. The native result of concat cannot stand in for the result of a mutation that ignores concat. **STRENGTH: entailed** for the finite values and rule consequence.

2. **K21's edit does not specify the promised fallback.** “Stop the walk at AsExpression” reaches `([0,1,2,3,4,5] as const)` before slice. Stopping with the current value gives exact 0–5, hence OTHER; the row promises UNDETERMINED. Returning UNKNOWN would also discriminate, but requires replacing transparency with an explicit UNKNOWN transition, rather than merely stopping. K13 now makes exactly this distinction; K21 still leaves it to the worker. **STRENGTH: entailed** for the current intermediate value and absent explicit fallback; **undetermined** which interpretation a worker would implement.

3. **K31 can remain equivalent because the other work limit is still active.** The fixture is:

   ```ts
   const choices = [0,1,2,3,4,5].map(n => n /* then 40 repetitions of +1-1 */).slice(1);
   ```

   The actual generated callback body has **161 expression nodes**, **241 total AST nodes**, and **81 AST levels** under TS 5.9.3. Removing the node budget of 64 does not remove §3.13's separate recursion-depth limit, whose number is still the worker's choice. A depth limit of 64 is permitted by the plan and can leave the mutant UNKNOWN, so the asserted UNDETERMINED→RULED is not determined by this row. This repeats the independently-rejecting-clause problem behind the earlier K7. **STRENGTH: entailed** for the measured tree and unspecified second limit; **consistent-with** for survival under a conventional structural-depth counter capped at 64.

4. **K43 needs an explicit choice about UNKNOWN precedence.** Its map callback returns an array literal, which the purity grammar rejects; the receiver of `.at(0)` is already Value.UNKNOWN. §3.15 says every operation over UNKNOWN stays UNKNOWN. Replacing only the element-kind gate with NOT_ARRAY therefore need not change the result. Reading the row's “unconditionally” as overriding that earlier UNKNOWN rule can produce OTHER, but then the edit must say that it overrides that rule too. A simpler single-clause discriminator is:

   ```ts
   const choices = [0,1,2,3,4,5].map(n => `${n}`).at(0);
   ```

   Under R4 the receiver is EXACT with str cells; the declared number-only element gate yields UNKNOWN, whereas removing that gate yields NOT_ARRAY/OTHER. No prior UNKNOWN needs to be overridden. **STRENGTH: entailed** for the original callback rejection and the two rules' interaction; **consistent-with** for this replacement control. I do not claim K43 must survive an implementation that deliberately gives “unconditionally” the broader meaning.

5. **K45's displayed fixture and asserted span describe different source bytes.** Expanding its `[0..5]` shorthand and applying the manifest's `const choices = <expr>;` wrapper gives:

   ```ts
   const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);
   ```

   Measured array/member/call spans are **(64,77)/(64,86)/(16,87)**. The row asserts **(16,94)**, which belongs to §3.18/M17's differently spaced fixture. The canonical M17 input does produce (71,84)/(71,93)/(16,94). Either source works semantically; an exact address assertion must select one. **STRENGTH: entailed** for both fresh parses.

6. **K8, K9 and K10 have no status in the replacement manifest.** The previous matrix carried the even-filter evaluation mutation, ordinary-zero truthiness mutation, and `||`-returns-operand mutation. R4 gives none a retained/replaced/merged/control-only/removed disposition. K35's control-only truthiness row is not a mutation transcript, K48 alters negative zero alone, and neither discharges K10. With the old matrix superseded, these three mutations are absent from the operative coverage. “No certified total of uncovered clauses” does not account for previously named rows disappearing. **STRENGTH: entailed** for the identifier comparison and differing edits.

**Required change:** give V a corrected worker-contract manifest before evaluator implementation: K16's mutant is OTHER; choose K21's explicit edit/result pair; isolate K31 from the depth limit with stated counter semantics and a non-exhausting depth bound; disambiguate K43 or use the known-string receiver above; bind K45 to literal canonical bytes and their offsets; and account explicitly for K8/K9/K10. Restoring those three as mutations gives **48 mutations + 1 survival = 49 transcripts**, split **3/2/43**, if every other row retains its current scheduling. Alternatively, any retirement/merger must name what coverage is being relinquished or supplied elsewhere. Recompute from the final enumeration.

**STRENGTH: entailed** for the need to correct the contradicted result and account for missing rows; **consistent-with** for the proposed repair choices. Actual mutation executions remain **undetermined**. This is residual R3-B5, not a rejection of the parser architecture or a request for another architecture seat.

## Requested probes and rule replay

These are finite native examples, syntax/typing probes and small in-memory transcriptions of the written transitions. They are not a future evaluator implementation, repository typecheck or suite run. **STRENGTH: entailed** for the measured outputs and stated method.

| Probe | Measured result / R4 replay |
|---|---|
| Same sentinel pair | Pre-Set cells `str"a",str"a",1,2,3,4,5`; dedupe then slice(2) gives `[2,3,4,5]`, OTHER. |
| Different sentinel pair | `str"a",str"b",1,2,3,4,5` retains both strings; slice(2) gives `[1,2,3,4,5]`, RULED. |
| Unary coercion | ``map(n=>`${n}`).map(n=>+n).slice(1)`` keeps strings until unary +; exact `[1,2,3,4,5]`, RULED. |
| Binary coercion | Native result is the same array, but declared str multiplication yields unknown cells, UNDETERMINED/report. The conservative bound is explicit. |
| Additional primitive equality control | SameValueZero over repeated false, +0/-0, "0", null and undefined produces five typed values: false, 0, "0", null, undefined. Different primitive types are not merged. |
| Unavailable identity | A Set input containing any jsx, arr or unknown cell returns Value.UNKNOWN under the R4 rule. Cell→Prim preserves the other constructors, preserves jsx, and maps arr to unknown. |
| Non-finite literal | `Number("1e400")` is non-finite; the new literal rule yields unknown, preserving the finite-num invariant. |
| Dotted argument-member | Canonical M17 source: zero parse diagnostics; array (71,84), member (71,93), call (16,94); member is an argument and is not the callee. R4 gives one UNDETERMINED candidate, consumed span (16,94), hence one DOMAIN site. |
| Computed argument-member | Canonical spaced source with `["includes"]`: zero diagnostics; array (71,84), member (71,96), call (16,97). Same R4 decision, with its own span. |
| Old missing-field type | TS2739 names exactly value, verdict, reason. |
| Old diagnostic access | TS2339: diagnostic does not exist on DuplicateSite. |
| New types/access | A round-1 DiscoveredCandidate, round-2 EvaluatedCandidate extension, and throw-narrowed Site access compile with zero diagnostics under isolated TS 5.9.3, strict + noUncheckedIndexedAccess, no emit. |
| Named round-2 RED five | slice(1), even filter, reverse/slice(1), Array.from/Set/slice, and suffix slice each expect RULED or OTHER and become UNDETERMINED under the stub. All five discriminate. |
| Named stub GREEN cases | Bare 0–5 and 1–6 remain OTHER; rule-1 controls remain RULED; UNKNOWN-expected controls remain UNDETERMINED. |
| O1 | Native signed-zero filter and NOT_ARRAY continuation yield `[1,2,3,4,5]`; nullish map yields `[1,1,2,3,4,5]`; rest binding yields `[1,2,3,4,5]`. Their R4 verdicts are RULED/RULED/UNDETERMINED/RULED in K48–K51 order. The round-3 mutations have discriminating predictions; K50 itself is GREEN under the round-2 UNKNOWN stub. |

**STRENGTH: entailed** for native values, parser relationships, synthetic compiler diagnostics, constructor coverage and finite rule replay; **consistent-with** for the corresponding future candidate/site outputs. No measured future-evaluator output is implied.

### Floor and corpus

A fresh AST inventory of the selected describe at 60641339 gives **66 instances**:

- Ceiling: **27 = 6+3+3+2+3+1+1+1+5+2**.
- Bare DOMAIN: **3**.
- Other instances: **9 derivation + 7 other-domain + 13 index layouts + 4 layout groups + 2 shipped assertions + 1 exported-source assertion**.

[oracle:952](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:952) and [oracle:956](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:956) both return [] in the extracted old oracle and in the in-memory extraction with only the two WHOLE_DOMAIN return fallbacks removed. The first fragment has TS1005; the second parses cleanly. The paired narrowing control at line 969 still gives kindOf → DEPTH_BOUND_LITERAL and ceiling-only sites → []. Each of the three bare DOMAIN controls produces one DOMAIN in the old emitter and [] in that ceiling-only extraction. Those results support R4's separate routing and coordinated round-3 fallback removal. **STRENGTH: entailed** for the inventory and extracted functions; **consistent-with** for the future module migration.

Fresh source-only census: **232 files; zero parse diagnostics; 33 numeric candidates in six files; 551 empty arrays; 10 mixed arrays; zero rule-1 literals**. Consumers are 23 freeze, 5 property, 2 assertion, 1 Set, 1 JSX map and 1 includes. The ceiling-only extraction returns just `packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;`. Thus the independent model counterfactual arithmetic remains 24/2/2 against 1. **STRENGTH: entailed** for the census, ceiling output and arithmetic; **consistent-with** for future evaluator zero-DOMAIN and mutant site totals.

### Manifest arithmetic and scheduling

Mechanical enumeration found exactly the 45 mutation IDs printed in §6.14. Round 1: **K23, K25, K27**. Round 2: **K28, K38**. Round 3: the other **40**. There are seven control-only IDs (K7c/K7d occupy one physical table row), one merged ID K24, and one survival m6. **45+1=46 is correct for the manifest as filed.** It does not establish that all 45 rows discriminate, or that omitted earlier IDs were deliberately retired. **STRENGTH: entailed** for arithmetic and table membership; **undetermined** for transcripts.

K13's RULED→UNDETERMINED now uses the candidate verdict observable, so both versions reporting a site no longer makes its check equivalent. K48–K51 supply the four requested semantic controls. K1/K2/K7/K11/K12/K14/K15/K17/K18/K19/K20/K22/K29/K32/K33/K36 also agree with the finite values and rule paths checked here, subject to the declared grammar. K3/K4/K5 use the shipped arithmetic above; K23/K25/K26/K27 have diagnostic/address/cardinality/failure-policy observables rather than an invented uniform verdict check. **STRENGTH: consistent-with** for their future discrimination, not certification of executed kills.

The worker contract should explicitly schedule and collect all five early transcripts, not merely say that they are “first usable” in rounds 1–2. §8.17 expressly runs only the remaining 40. The manifest already requires all 46 transcripts; this is a dispatch obligation, not an additional mutation requirement. **STRENGTH: entailed** for the textual obligations; **consistent-with** for the scheduling recommendation.

## F1 — FOLLOW-UP: inherited ceiling lexer limitation

**Section:** §7.2 R2, retained by later revisions.

**Input → wrong outcome:** `const a = /[//]/; const depthSchema = z.number()\n  .max(5);` returns [] in both fresh extracted predicates; removing the regex prefix restores the wrapped ceiling site.

**Required change:** retain the separately scoped follow-up and pin the current ceiling behavior during extraction, including the two standalone negatives and both halves of the narrowing control. The new parser remains outside these predicates under this ticket.

**STRENGTH: entailed** for the extracted outputs and existing scope; **consistent-with** for continued deferral.

## F2 — FOLLOW-UP: concretize the authorized round-0 gate on its actual checkout

**Section:** [§9.15 R4](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:3028), §9.12's remaining facts and [round-0 draft](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-evaluator-worker-r0.DRAFT.md).

**Input → wrong outcome:** the actual draft checkout is clean at `2af816f183247efefae65172bb7036eefd049fa1`, with **31**, not 66, static instances in its selected describe. The alias is absent. The new smoke file named in the draft is separate from that describe. Applying the parked corpus's count or treating a smoke-only result as selected-regression evidence would certify the wrong population. **STRENGTH: entailed** for checkout, inventory, alias absence and draft file choice.

**Node ruling:** after removing Markdown formatting and joining wrapped lines, the plan carries D68 ADDENDUM 2's sentence exactly:

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

Fact 2 records the actually used runtime instead of claiming Node 22 execution. This is V's permission to run the future gate under Node 25; it is not evidence that the alias has already been installed in either reviewed checkout. The draft's own quote is a paraphrase and fails exact-string comparison. **STRENGTH: entailed** for text comparison and current absence; gate execution **undetermined**.

The plan also says facts 1/3/4/5 remain unchanged, while fact 5 still says absence of the declared Node runtime stops dependent rounds. §9.15's final paragraph expressly says that the runtime shortfall itself is no longer a stop condition. D68 ADDENDUM 2 decides this: keep the non-runtime evidence gates, remove the stale Node-only stop in the operative dispatch. No further runtime permission is needed. **STRENGTH: entailed** for the conflicting text and governing ruling.

**Required change — conditional dispatch contents, answering packet question 4:** if V supplies the residual contract disposition, the round-0 dispatch must contain these concrete additions/corrections beyond the plan and draft:

1. Point to R4 and this review, with the accepted residual text, and replace the draft's r3/current markers. Name the actual working directory `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine`, the root package/lock paths, and the exact log outputs.
2. Keep the draft's explicitly granted `tests/unit/depth-oracle-r0.smoke.test.ts` location, or revise its grant before choosing another. State a counted inventory, for example five named smoke instances: alias/version/API; TS parse/parent/position; TSX parse/parent; normalized numeric text/unary sign; malformed parse through one accessor. Name the test-local accessor's move/reuse in round 1. A suite-load failure is not a counted passing smoke.
3. Give separate commands for the smoke and the existing group: `pnpm exec vitest run tests/unit/depth-oracle-r0.smoke.test.ts` and `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"`, plus `pnpm typecheck`, from that absolute directory. Record actual names/counts before and after the alias change. The existing static group is 31 on this base; five tests in a different file do not make it 36 or 71.
4. Record a named package-resolution failure before installation; then verify package-name resolution from the root test context for both `typescript-classic@5.9.3` and unchanged `typescript@7.0.2`. Record the process runtime for actual test/compiler invocations. Preserve all smoke requirements, the reviewed root-importer lock delta and no unrelated upgrades. Resolve the draft's wording that asks for one install and then another frozen-lockfile install/check by naming the exact command sequence and its authorized scope.
5. Compare diagnostic identities/codes/paths and selected failing names against the fresh base. The parent is allowed to have attributed failures; an absolute-green assumption or “any eight errors” is not the rule. Keep the draft's D66 full-suite four-count evidence and named parent logs; no architecture-seat result substitutes for it.
6. Carry the exact Node sentence above in the round-0 report and every dependent/review packet. Stop dependent rounds for failed or unavailable non-runtime gate evidence; do not reintroduce Node 22 availability as a gate V already waived.
7. Name, for the later worker rounds, when the authorized oracle-test co-touch imports/adapts the 60641339 control floor onto the 2af816f1 base. Establish the 27+3 inventory there rather than pretending it exists at round 0. Schedule the early mutation transcripts, the restored/specified K8–K10 dispositions, and the compulsory display assertions.

**STRENGTH: consistent-with** for the proposed dispatch specification; **entailed** for the version pins, grants, text differences, checkout counts and need to distinguish their populations. This review does not dispatch the worker.

## F3 — FOLLOW-UP: preserve the accepted display/identity coverage obligation

**Section:** §6.15 R4 and §2 R2/R3.

**Input → wrong outcome:** a correct candidate count alone does not establish correct displayed text or address; a line-based DOMAIN key collapses A3's two same-line occurrences.

**Required change:** retain the named display/identity mutation follow-up and its compulsory exact text, line, start/end and A3 cardinality assertions. Stage field reads against the new discovery/evaluated/site APIs; do not add nonexistent display fields to round-1 DiscoveredCandidate assertions by inference.

**STRENGTH: entailed** for the structural distinction, types and written obligation; **consistent-with** for the accepted follow-up treatment.

## F4 — FOLLOW-UP: correct the remaining self-description claims

**Section:** §6.15 R4, §9.17 R4, and [architecture self-report R4](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-arch-self.md:583).

**Input → wrong outcome:**

- §6.15 calls all four O1 controls “failing assertions” in round 2. K50 expects UNDETERMINED, exactly what the UNKNOWN stub returns. It is written before implementation, but it is GREEN under that stub. §8.16's narrower five-member RED list is correct.
- §9.17 repeats the two-clause stub summary while omitting §1.14's rule-1 exclusion—the exclusion the self-report says its sweep added. The full operative §1.14 rule is correct; its summary is not.
- “Twenty blocking plan findings across four rounds (8 + 6 + 5, plus … 3)” does not add up. The three completed plan reviews before this r4 delivered **19** blockers; including the separately identified three code findings gives **22**, not twenty. The current review is a fourth review, not another preexisting finding set.

**Required change:** carry the corrected claims in the decision/handoff record. Do not demand a fourth O1 stub failure, reintroduce a rule-1 false RED, or reuse the unsupported tally.

**STRENGTH: entailed** for the table comparisons and arithmetic. These wording defects do not invalidate §1.14's named semantic RED or the repaired public types.

## For V — the residual

**Decision text:** Retain the pinned classic-parser architecture and the R4 repairs to primitive storage, member-call ownership, stage types and the 27+3 floor. Do not dispatch evaluator implementation against the R4 mutation manifest unchanged. R3-B5 remains open: correct K16 to UNDETERMINED→OTHER; state K21's explicit stop/fallback behavior; ensure K31's depth limit cannot independently reject its discriminator; specify whether K43 overrides UNKNOWN continuation or replace its fixture with a known string-cell receiver; use one literal K45 source with matching offsets; and explicitly retain, replace, merge or retire K8/K9/K10. Recount and schedule the resulting transcripts. Restoring the three missing mutations, with everything else retained, gives 48 mutations plus one survival (49 total), split 3/2/43 by the current round schedule. **STRENGTH: entailed** for the contradicted observation, omissions and recount; **consistent-with** for the repair choices.

The four other bounded items do not require reopening. The exact Node carry sentence is correct in the plan; the dispatch must remove the stale runtime-only stop and distinguish its 31-instance starting group from the 66-instance parked corpus. Preserve the display assertions, inherited ceiling limitation and unexecuted alias/Vitest gate as named follow-ups. No new architecture round is requested or assumed; the remaining choice is V's contract disposition. **STRENGTH: entailed** for the artifact distinctions and authority; **consistent-with** for this recommendation.

## Packet audit

- **Clear AMENDMENT 3's authority.** V's 16:39 ruling authorizes one bounded architecture round for exactly R3-B1–B5, with the Node adjustment. It overrides AMENDMENT 2's earlier “last round” limit for that one round. No further round follows by inference.
- **Clear the architectural scope of the R4 additions.** Finite literal handling belongs to the primitive invariant; callee checks belong to ownership; record/union and stub changes belong to item 3; WHOLE_DOMAIN timing belongs to floor routing; concrete budgets, O1 controls and the manifest belong to item 5. I found no separate feature added outside those five plus Node. K8/K9/K10's unexplained coverage reduction is drift inside item 5 and is charged to R4-B1, not silently accepted.
- **Limit the preservation claim.** The current file has the dated blocks and historical banners. The available final r3 snapshot is the review verdict, not a frozen r3 plan. I did not obtain an independent byte-for-byte r3 plan diff, so “nothing else changed” as a complete byte-history claim remains undetermined.
- **Charge the remaining contract defects to the plan, not to AMENDMENT 3.** The amendment already required an executable rule/edit/observable/result manifest and named floor controls. The “45+1” arithmetic is correct; it does not clear the wrong/ambiguous predictions.
- **Charge the round-0 draft's stale version markers, non-verbatim carry sentence and unresolved command/baseline details as pre-dispatch work under F2.** It is explicitly a draft, not a dispatched worker contract. The review packet's seat claims—including the “twenty” tally—are claims to verify, not independent evidence.
- **Clear grants.** The alias/package/lock/install grant already exists. The one-module plus oracle-test co-touch boundary stands. LoginFlow remains a temporary mutation target with restoration evidence, not a production-edit grant.
- **Clear this review's method/write scope.** Only the two designated review reports were written. No suite, install, pnpm invocation, repository typecheck, application import, source/git mutation, new worktree, board/decision edit, network action, credential read or subagent was used. Source transformations and synthetic compiler inputs stayed in memory.

**STRENGTH: entailed** for packet/decision text, observed state and review actions; **consistent-with** for semantic scope attribution; **undetermined** for full historical plan-byte preservation.

## Not verified

The evaluator does not exist in the parked lane. Actual evaluator soundness, candidate/value/reason/span/site output, mutation kills or survival, restored-worker hashes, Vitest alias resolution, installation/lockfile behavior, repository TypeScript 7 diagnostics, Node 22.23.1 execution, completed-fixture suite outcomes, full-suite four-count parity, future false-positive rate, exhaustive clause coverage and effort remain **STRENGTH: undetermined**.

The compiler probes used existing TS 5.9.3 only for parsing, isolated virtual snippets and transpilation of the pure oracle block. They ran on Node v25.7.0. The first K31 AST-count probe was invalid because two probe functions shared a name; its one-node result was discarded. A strict-mode rerun with distinct function names produced the reported 161/241/81 counts. No product conclusion relies on the failed probe. **STRENGTH: entailed** for method and probe history.

PLAN: changes — retain the architecture and four repaired contracts; V must settle the remaining mutation-manifest defects before evaluator implementation is dispatched.
