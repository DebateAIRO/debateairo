## r1

### Outcome

I returned **REWORK** with four blocking findings and no non-blocking findings. This was a static review only: I ran no tests, builds, installs, provider calls, or mutating git commands.

### Case file

**Cause.** The implementation arithmetic is substantially correct, but the filing overstates what its assertions and evidence prove. The decisive move was to trace each DoD sentence to an executable failure case rather than accept test names or report prose as coverage. That exposed a maximum-path test with no run or ledger, an “over-bound” suite with no above-bound input, a six-entry matrix for nine required disclosure fields, and paired evidence stamped before the final assertion-repair commit.

**Price.** Static-only constraints mean I did not independently reproduce any logged gate or mutant result. I treated committed source and filed records as evidence, checked their internal stamps and failure surfaces, and limited the verdict to defects demonstrable without execution.

**Nearly wrong.** I initially gave too much weight to the phrase “independent enumeration of the maximum path.” The test does independently reconstruct topology arithmetic, but it does not execute a maximum-attempt run or read that run’s ledger, which is the actual DoD. I also nearly treated the final commit as harmless to paired evidence because it only changes the T17 test; D27 explicitly makes stale-tip records inadmissible regardless of apparent harmlessness.

**Dead ends.** The existing W12 proof does read observed calls and the ceiling from one run, but the filed report says the ceremony is a clean one-attempt-per-site path, so it cannot close the maximum-path obligation. The v2 refusal fixture also looked broad until the field-by-field matrix was compared with the complete v3 schema.

**Packet clarity.** The packet was reviewable and internally consistent. Its explicit emphasis on same-ledger maximum-path evidence, individual disclosure fields, and D27 tip stamps made the four gaps determinative. No packet defect blocked review.

## r2

### Outcome

I returned **REWORK** with three blocking findings and one non-blocking finding. This remained a static review: I ran no product tests, builds, installs, or provider calls and made no product or Git changes.

### Case file

**Cause.** D35 fixed the method but the filing applied it to only three legs. The new integration test does read the real ledger for author, panel, and reviewer attempts, yet its provider explicitly gives COMPOSER, CONFORMANCE, and R9 first-attempt success and returns `conforms: true`, so the serve chain stops after one composition round. Meanwhile the formula and the “independent” unit enumerator both copy the sealed `2 * 4` composition-site premise. The shipped loop instead permits two rounds of one composer plus two conformance calls, followed by one post-compose R9 call for the run: seven reachable serve call sites, not eight. The ledger test therefore measures 92 attempts on a deliberately non-maximum serve path while the filing, D35 consequence, and packet call it an every-site maximum.

**Price.** The r1 finding correctly forced a real ledger and found the cooldown mistake, but the r2 filing would spend another seat cycle unless the next run maximizes and queries every call-site namespace. The same partial refresh also left the B4 evidence inadmissible: the displayed stale-stamp command resolves Git HEAD from the main checkout instead of the lane, and the paired base arm still lacks the requested exact base commit/tree/clean stamps. A generator that emits absolute lane and log paths would have prevented this provenance retry.

**Nearly wrong.** I nearly accepted 92 because `92 > 88` is true and the assertions genuinely read the same run's ledger. Reading the provider fixture rather than stopping at its ledger queries exposed the exception: serve calls are intentionally set to one attempt. I also nearly accepted the pasted empty stale-check result until I resolved both working directories; the mission-report directory is on `dev@b5a6b6eb`, while the reviewed lane is `4bbb13e5`, so the literal command prints all eight logs as stale.

**Dead ends.** Re-deriving the cooldown path did not reopen the retraction: `countModelAttempts` uses run, work item, contract, and call-site key, so the second sequence receives exactly the one remaining final retry. The sealed-depth admission path and all nine one-field deletion arms are also present. M2b faithfully restores the rejected `2*judge + final` expression and the filed campaign records it caught with 12 failures against a two-failure floor. Those checks are real; they simply do not validate the serve-site premise.

**Packet clarity.** Priority (6) was the useful question, but priority (2) answered it prematurely by saying every site reaches its last attempt. That sentence contradicts the test's own serve exception and was propagated into D35's closing consequence. A stronger packet generator should verify quoted run-shape claims against the fixture branches and execute provenance snippets from the directory it prints before dispatch.

## r3

### Outcome

I returned **CHANGES** with two blocking findings and one non-blocking finding. This is the worker's last lawful round, so I authorized no r4: all three actions are drafted as V DECISIONS PACKET rows. The review remained static; I ran no product tests, builds, installs, or provider calls and made no product or Git changes.

### Case file

**Cause.** The measured topology and arithmetic are now right, but two boundaries were left one step behind the new facts. J28 arrived after the filing and was described as a reporting comparison; tracing its caller showed that equality currently replaces a successfully composed answer with a components-only `ENVELOPE_EXHAUSTED` result. Separately, r3 added two receipt fields for the per-round/per-run split without extending the one-field deletion matrix or enforcing cross-field coherence, and two updated fixtures now carry `call_sites.serve=8` beside a selected seven-site composition leg.

**Price.** The product corrections are small, but the round cap makes them governance work: a one-character inclusive comparison, boundary assertions, and receipt-coherence pins now need V authorization. The record also retained stale r2 stamps and arithmetic in several sentences, so a report-only sweep and hash refresh is required even though the underlying logs are correctly filed-tip stamped.

**Nearly wrong.** I nearly approved after independently deriving 109 and confirming the seven ledger namespaces. The decisive check was following `decideBudgetPressure` through `makeEnvelopeTerminal`: at exactly 109, the current comparison does not merely label the run EXHAUSTED; it clears the composed artifacts and substitutes a components-only result. I also nearly accepted the new receipt fields because the production constructor always emits them, until the shared fixture demonstrated that the parser accepts a contradictory receipt and the deletion table showed neither field.

**Dead ends.** Reopening 92 went nowhere: D35's correction is sound, and the active filing uses 92 only as a bracketing run. Rechecking r2 B2 also closed the factual gap: the resolved-tip check prints no stale logs, the base tree is `2131932e`, the overlay tree is `0681125e`, and the HEAD evidence is clean at `8aa1357c`/`b99d1204`; only stale report prose survived. The retracted `2*judge + final` premise has no live survivor outside explicit historical retraction text.

**Packet clarity.** The rulings-first block prevented both orchestrator defects from being charged to the worker again. Priority (6) was the critical prompt: “reporting follows permission” sounds local, but its caller makes the consequence answer-shaping. The packet's static-only law overrode the review contract's normal probe requirement, so all runtime results remain filed evidence rather than independently executed evidence.

## s09b

### Outcome

I returned **CHANGES** with two blocking findings and two non-blocking findings. S09B is a judge-authorized micro-ticket after the worker's three rounds were exhausted, so the two product blockers are V rows rather than a fourth round. The two evidence/report findings already have authority under D28, D38, and the existing S09B scope, but they remain mandatory fixes. This was static review only: I ran no tests, builds, installs, mutation harnesses, or provider calls and made no product or Git changes.

### Case file

**Cause.** The micro-fix changed the equality reporter but did not re-check the exception consumer that depended on the old meaning. When a provider attempt is refused because the ledger already equals the maximum, the runner catches `RUN_COST_ENVELOPE_EXHAUSTED`, calls the newly inclusive reporter, receives `WITHIN_ENVELOPE`, and rethrows instead of producing the ruled envelope terminal. The receipt repair repeated the same boundary truncation: it checks that the count matches the named arm, but not that the named arm is the larger arm the constructor actually selected. Both misses were foreshadowed in r3; the packet shortened each checklist enough to hide one obligation.

**Price.** The successful maximum-path arm is genuinely repaired, but the old-consumer path and a contradictory persisted receipt still require V-governed product work. The claimed D28 sweep also missed multiple command-refutable sentences, and the post-D38 campaign transcript contains no evidence of the required marker/refusal mechanism. Without static tracing, the three green cluster logs and two new mutants would have purchased an approval while both boundary gaps remained.

**Nearly wrong.** I nearly accepted J28 after seeing the direct unit boundary and the non-vacuous persisted-answer assertions. Following `RUN_COST_ENVELOPE_EXHAUSTED` through the runner catch showed that equality now has two contexts—successful terminal reporting and refusal of a pending next attempt—and only the first was updated. I also nearly treated M3's “larger arm” mutant as receipt coverage; it mutates the constructor's `Math.max`, not the parser, so an externally contradictory wire receipt still passes.

**Dead ends.** Reopening the normal completed maximum path went nowhere: the final reporter returns WITHIN, the integration source requires one answer row, and it pins the chain's DOWNGRADED terminal with no ENVELOPE_EXHAUSTED mark. The deletion matrix itself really has eleven entries, both formerly contradictory shared fixtures now say serve seven, and the M8/M9/M10 transcript rows reproduce the reported 31/4/4 failure counts. Those closures do not cover the exception consumer, the smaller-selected-arm receipt, the stale prose, or D38 custody.

**Packet clarity.** The packet's provenance constants, writable outputs, report hash, and log count all resolve. Two packet defects materially fought the review: priority (2) omits r3 B2's explicit requirement to reject `selected` when it names the smaller arm, and priority (3) replaces r3/judge N1's stale “tight cover in both worlds” sentence with a different leftover campaign paragraph. The report followed those shortened lists and retained the omitted defects. The packet correctly foregrounded D38, which made the absence of any campaign-marker receipt assessable as an evidence gap rather than a guess about whether the run happened to be solo.

## 2026-09-03 · t17b

### Outcome

I returned **CHANGES with 0 blocking and 2 non-blocking mandatory tickets**, while finding the
product lane fit to merge. Both S09B product blockers are closed: the refused-attempt equality
context now asks with one pending attempt, the completed-run context retains J28's `WITHIN`
state, and the parser enforces both the larger arm and the constructor's tie policy. This was
static review only; I ran no tests, builds, typechecks, installs, mutation commands, provider
calls, or mutating Git commands.

### Case file

**Cause.** The decisive review work was not the clean mutation index but reading each raw failure
frame. M1 and M2 are honest act-phase `THREW` deaths on the restored envelope rethrow; M3 dies on
the exact J28 state assertion; M4 on the larger-arm message; M5 on the two tie directions; and
M6b on the landed count message. That established there is no D43 wrong-cause death. Static source
tracing also shows only the refusal catch supplies `pendingModelAttempts = 1`; initial and final
reporting use zero.

**Price.** The additive M6b test proves an observable diagnostic contract, not a new accept/reject
partition. I therefore accepted the product pin while filing `T17B-CODEX-N1`: the current report
and comments incorrectly say any two of the three guards imply the third and no guard can fire
alone. The wrong-tie input is itself the counterexample—only the tie-policy guard fires. The same
ticket corrects “character-for-character” to “semantically identical at default zero; the
pre-existing state assertion is byte-identical.”

**Nearly wrong.** I nearly treated M1 and M2 as inadmissible because no explicit `expect` runs.
The raw transcripts and source path show the awaited act itself rejects with the exact original
`RUN_COST_ENVELOPE_EXHAUSTED` defect, while the companion maximum-path test passes. That is a
right-cause test death, and the worker accurately classifies it as `THREW` instead of inventing an
assertion credit. I also initially checked D57 from the repository root with pathspecs that did
not exist there; rerunning from the package root and then comparing all three production targets,
including the runner mutated by M1, established byte identity from `ab2f508c` to the filed tip.

**Dead ends.** Reopening the merge repair went nowhere. Its commit adds only the T7 settings
block; it edits no assertion, and the unchanged integration oracle still requires the seven serve
namespaces, both composition rounds, observed attempts exactly 109, and ceiling exactly 109. The
main-checkout incident also leaves no current product diff. The stronger claim that main is
byte-identical to an unrecorded session-start snapshot is not independently recoverable, so I
limited the review to present residue and filed `T17B-CODEX-N2` for the missing review-response
skill floor plus a pre-write worktree guard.

**Packet clarity.** The D57 warning prevented a false 22-failure finding and correctly replaced
whole-prefix stamp equality with earlier-tip code identity. The packet's substantive constants
and six technical questions were precise. Its only wording defect is the literal
“character-for-character” claim, and its explicit disclosure of the missing
`superpowers:receiving-code-review` step made the process shortfall ticketable rather than hidden.
