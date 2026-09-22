# MERGE-FIX-DEV-p3 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Case file

The alleged victim was the DEV-05 register seeding path. The evidence does not support a product-code regression. The actual cause of the reported 16/19 runs was execution starvation: the reviewer run took 2,711.40 seconds, with the three failures occurring after 603–1,026 seconds as one hook timeout and two test timeouts. The first timeout also caused cleanup to call `pool.end()` twice. The orchestrator run was terminated while concurrent historical imports were still waiting on the publication advisory lock. Neither run failed a register assertion.

The control run already existed in my p2 evidence: `verify-n1-full.log` was 19/19 in 158.16 seconds at the same source state. P3 then ran the suite alone three consecutive times: 19/19 in 157.56, 162.69, and 163.12 seconds. Every case stayed below its 120-second case limit; the worst was 77.526 seconds. The three reviewer-named failures completed in ordinary time when isolated. No integration or product file required a change.

The `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` line was a false lead. It appears once in all four green runs. It is emitted while `tests/integration/dev-deployment-register.test.ts:567-585` exercises an intentionally different sealed historical bootstrap and confirms that the seeder preserves it while publishing the current version. Treating every database ERROR line as a failed test confused an expected rejected replay with the Vitest verdict.

N7 was real. The third architecture member checked only local method names, and its receipt-order anchor covered only `publishGeneral`. Commit `682972eb` adds the missing `input.adminPool` construction oracle and orders both the current and historical calls before receipt/custody. The construction mutant failed 1/3, the moved-historical-call mutant failed 1/3, the restored suite passed 3/3, and an unrelated admin-error-code mutant remained 3/3.

N8 was also real. Row 27 claimed p2 had added the third construction oracle when grep showed only the two P2 policy tests. The row now records the p2 absence and the p3 repair.

## Price

- **B3 false positive:** about 11k tokens and eight minutes of isolated runtime across three reproductions, plus log comparison. The prior review consumed more than 45 minutes for a result shaped by host load.
- **Expected-error misclassification:** about 2k tokens to correlate the same database line across red and green logs.
- **N7:** about 4k tokens, four mutation runs, and one discarded anchor hypothesis. The first anchor assumed contiguous `await publicationPort.importHistorical`; the actual source shape did not contain it.
- **N8:** under 1k tokens once the exact grep and row were placed side by side.
- **Verification:** roughly four minutes for three S01 cluster runs, plus focused architecture, UI, depth, and compiler checks.

## What nearly went wrong

- I nearly accepted the reviewer’s database ERROR line as the root cause. The green p2 log disproved that interpretation.
- I nearly changed product code or raised timeouts to mask starvation. Three isolated green runs showed neither action was justified.
- My first N7 ordering anchor asserted a spelling rather than the property and failed against correct code. I discarded it, moved the real historical-call token after receipt in a test-local mutant, and proved the ordering assertion on that break.
- A first attempt to move the token inserted it after the earliest receipt-function-name occurrence, which was still before the measured branch. It stayed green and therefore did not qualify as RED evidence. Moving the token to end-of-source produced the required failure.
- The packet’s literal demand for “no seal error in the log” conflicts with the established passing negative-path case. I treated the assigned B3 as contestable, preserved the negative test, and disclosed the expected line rather than manufacturing a clean log.

## Dead ends

1. Increasing the 120-second test timeout would only relabel host starvation and violate the packet’s per-case ceiling.
2. Editing register production code would target no reproduced product defect.
3. Suppressing PostgreSQL stderr would hide useful proof that the historical replay guard fires.
4. Using the reviewer’s contiguous-`await` wording as a source oracle would reject the valid merged implementation.

## Ranked upgrades

1. **Run heavy embedded-database suites in a reserved serial lane and record concurrent suite count plus host load.** Expected saving: 10–20k tokens and 30–45 minutes per false timeout report. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: reservation reduces throughput when the host is otherwise idle.

2. **Classify failures from the test runner summary, then correlate database ERROR lines to the owning test and whether that test passed.** Expected saving: 2–4k tokens per negative-path investigation. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: a passing test can still tolerate an unintended server error, so correlation does not replace semantic review.

3. **Make gate manifests derive every changed test file from the reviewed diff and schedule heavyweight files alone.** Expected saving: 5–10k tokens and prevents a green aggregate gate from excluding the changed integration suite. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: source-only changes may require additional reader suites beyond the diff-derived set.

4. **Have packet-check compare demanded log invariants against a known-green run.** It would have rejected the “no seal error” clause because the line is present in the 19/19 baseline. Expected saving: 2–3k tokens and one clarification cycle. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: baseline logs may contain tolerated debt that a new packet intentionally seeks to remove, so packet authors need an explicit override.

5. **Generate source-contract class sweeps from a shared property table.** The three publication-port tests should have been enumerated together during p2. Expected saving: 2–4k tokens per review round. VERDICT: prototype / CONFIDENCE: medium / STRONGEST COUNTER: generated text assertions can multiply change detectors unless each row names a real production break and carries mutation evidence.

The route toward a one-prompt machine is a packet compiler with validated paths, diff-derived suite coverage, resource-aware scheduling, and baseline-log contradiction checks. More prose would not have prevented this pass; executable evidence rules would.
