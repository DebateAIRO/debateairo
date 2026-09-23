CODEX REVIEW T17T9-3 r3 — UNSOUND · comments read through: t17t9-3-evidence-2026-09-05

## For V

INCONCLUSIVE remains correct; the claimed 4–6% margin and complete observation/concurrency bar are not established.
Accept an exception and land after devsync: accept unresolved b14 attribution and possible suite timing effects.
Authorize corrected bounded evidence: accept more time and no guaranteed failing comparison; repair measurement and verify load overlap first.
Hold: accept the known stale 109/ledger state while attribution remains open.
This review selects none of these options and does not reopen the unchanged 106 correction.

## Q1 — How I checked custody and observation

I read the reviewer packet in full first, then the r2 B1 bar, V's ruling, the amended worker packet and exact dispatch, §6f, the evidence-round self-report addendum, probe source/diff, analyses, raw event records and relevant source.

I recomputed both retained artifact SHA-256 hashes, applied the unified diff **in memory** with exact context checks, and separately reconstructed the probe's literal replacements. Both reconstructions yielded `aa2bb15339d8e988443b80ef3883d968b7c466b6f0cd51ad3d1ed04fb4c8fea3`. I did not execute the mutating probe. Parent/HEAD/on-disk harness equality and absence of probe markers verify restoration. Read-only blob comparisons verify unchanged registration/policy/load-suite source, and the recorded scratch directory is absent.

I independently parsed all four selected JSONL files and matched every event against its subject log, rather than accepting [analyse.py](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/b1v2/analyse.py)'s totals. Each has 256 watched B1 starts and successful settlements, 148 gate entries, eight phases, and no subject rejection/timeout/unhandled record. All four subject footers pass. The observation claim nevertheless fails: API settlement is not permit grant, individual grants/releases are missing, and the unhandled listener has no promise-to-ID mapping. The two load processes have their own non-mail unhandled error.

I compared load and subject **completion/start times**, not just commands. The load suites ended before both conc150 subjects started. Identical launch recipes do not establish the claimed concurrency.

## Q2 — How I checked the result and margin

I grouped events by route before subtracting timestamps. Registration marker maxima are **17,286 / 16,857 / 16,960 / 16,845 ms**, in control TIP/PARENT then conc150 TIP/PARENT order; all have **28,000-ms** labels. Resend maxima are **15,770 / 15,636 / 15,693 / 15,640 ms**, with **18,000-ms** labels. The review links each raw file and the relevant rows.

The decisive cross-check was [apps/api/src/registration.ts](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3/dialectical-engine/apps/api/src/registration.ts:982): handoff clears the waiter timer before activation and later API settlement. The filing both mixes route deadlines and uses the wrong interval. I retain INCONCLUSIVE because there is no correlated failing episode; I reject the numeric “inherited fragility” claim rather than substituting another unmeasured margin.

## Q3 — How I calibrated the timing hint and sampling answer

The +429/+115-ms differences and 326-ms cross-condition TIP range are reproducible. They do not estimate a within-condition noise distribution. I noted fixed run order, synced-versus-temporary storage, missing load overlap and dependent markers. I proposed a paired pilot and conditional sizing example, explicitly separating hypothetical SD from the observed range. No new experiment was launched or authorized.

The existing evidence spans about 102 minutes between V's authorization and the filing, within a three-hour cap. I did not treat “time box” as evidence that all remaining sampling was impossible, or that a useful powered sample was available.

## Q4 — How I checked the process claim

I searched the retained t17t9-3 log tree for OneDrive/FileProvider names and process-sampling evidence. High load readings and deliberate burner PIDs exist; a timestamped OneDrive CPU/PID record does not appear in that package. I report this as **not evidenced in the supplied artifacts**, not proof that the process activity never happened. The actual parent path under `/private/tmp` also prevents treating the two storage environments as identical.

## Q5 — Decision boundary

The report gives V the requested options without selecting one. No inference here clears B1, proves a lane regression, reopens the 106 derivation, or guarantees that widening a deadline or using a fixture clock retires the class.

## Packet audit

**CLEAR** AMENDMENT 3's substantive authority, bar, harness-only constraint, time cap and filing marker. Its dispatch matches exactly. **CHARGE** the stale `apps/api/src/auth-policy.ts` pointer as a minor path defect, and the current reviewer summary's unsupported factual premises as evidence-summary defects. The grant was sufficiently explicit; requiring more permission would not have prevented these errors.

The repeatable review failure in this round is promoting a summary column into a measured quantity without checking its event definition and grouping keys. The cheapest improvements are:

- Define the measured interval at its actual source boundaries before collecting it; keep route/deadline/ID together in every aggregate.
- Correlate rejected promise identity explicitly instead of listing unrelated outstanding work.
- Record load-process liveness and timestamps throughout the relevant phase; a fixed lead can outlast the load.
- Save process telemetry when making a process-specific claim, and record storage placement and run order.
- Validate the evidence summary against these checks before copying it into a decision packet.

These are review/process recommendations, not changes I implemented. The preserved source and raw logs made this correction possible; more unexamined runs would not fix the same aggregation and observation mistakes.

## Not verified

No fresh tests, failure reproduction, source mutation, Git mutation, merge, push or external communication. No historical attestation for every launch or process. No original b14 attribution, exact queue headroom, failing-path observer parity, adequate final sample size or validated follow-up repair.

SKILLS LOADED: `superpowers:using-superpowers` (including its Codex reference) and `superpowers:verification-before-completion`. No subagents were used. Only the two requested review files were written; the lane remained at `85a05425f7e30ed66c84a7184f3d6585a1595be8` with no source edits.

READING: unsound — independently checked hashes and passing traces support an inconclusive result, but do not support the filing's margin, complete observation, concurrent-load or process-attribution claims.
