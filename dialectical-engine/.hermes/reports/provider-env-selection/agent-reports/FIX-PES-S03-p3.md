# FIX-PES-S03-p3 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat FIX-PES-S03-p3, ticket t_f1c393de, session 01a0d74f-5c40-7633-8250-bd70f263fbec. CLAIM 2026-09-26T09:40:46+03:00; report 2026-09-26T09:47:17+03:00. Commit da9d0084d7438bc335c6bc6bbc30ec05dc8b4328. V authorized this bounded fix after review pass 3; no fourth review was requested.

Cause: my preceding rebase checked the presence of dev's refusal rows without comparing the PRICE_INVALID Meaning cell against every source guard. That dropped Number.MAX_SAFE_INTEGER. The existing pin could see a code and still miss a false condition. The probe paragraph had a separate provenance gap: a general register capability was described without the restriction of the specific hosted publisher. Its code-owned row has 600000, and the publisher's operator file cannot change it.

The corrective change is exactly one Meaning cell and one appended sentence. Two new cases read those precise locations. The Meaning case covers integer amounts, zero, the safe upper bound, and the one-member-only condition. The publisher case requires the entire hosted sentence inside the paid-probe paragraph, so the development seed's existing 600000 cannot mask a wrong hosted value. The original 31 cases and helpers are byte-identical; no other README line changed.

Evidence: the original frame passed 31/31, 43/43, 30/30. With the new cases and unchanged README, only V-22/V-23 failed (31/33). After the two-line change, 33/33 passed. Seven mutants each failed exactly its intended new case: omit upper bound, lower bound, integer condition, pair condition; change only the hosted window to 60000; omit the file-member restriction; omit the code-change consequence. A spacing neighbour passed. Every restore compared bytes and the path's porcelain line. Three final runs each passed 33/33, 43/43, 30/30; typecheck produced zero diagnostics.

Cost: roughly six minutes from CLAIM through report, measured by the timestamps above. Fourteen cluster invocations (initial frame, RED, first GREEN, eight mutation/control runs, three final runs) plus one typecheck. No failed implementation attempt or rerun-until-green occurred. Skill loading and evidence formatting cost more text than the 20 inserted test lines; token savings below are estimates, not billing measurements.

Near mistake avoided: asserting only that the paragraph contained 600000 would let the seed sentence satisfy V-23 after the hosted sentence changed to 60000. The test isolates the hosted sentence, and the targeted mutant proves it. Another unsafe shortcut would have replaced the whole row/table during the fix; a scope checker proves exactly README lines 1021 and 1040 changed and only the Meaning cell changed on the latter.

Dead ends: searching globally for a refusal code proves existence, not its guard; checking a number globally cannot identify which publication path supplies it. Neither approach was reused. One READY-post orchestration attempt failed at JavaScript parsing because Markdown backticks appeared inside a template literal; no command executed. Building the body separately corrected it. This added one retry without touching implementation or verification. This packet was clear about the source oracle, permitted text, new-cases-only constraint, and verification count; I found no new ambiguity requiring a ruling.

Ranked upgrades:

1. Put the source predicate beside every KEPT-DEV decision in rebase packets, with each conjunct checked. Estimated saving: one review/fix pass and thousands of tokens. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: not every document statement maps to one small source predicate.
2. Require value assertions to bind the value to its specific command or row, not merely the surrounding section. Estimated saving: 1,000–2,000 tokens per repeated value-drift finding. VERDICT: adopt / CONFIDENCE: high / STRONGEST COUNTER: exact prose pins require maintenance when wording changes without a behavior change.
3. Carry a ready mutation manifest and scope checker in narrow FIX packets. Estimated saving: 500–1,000 tokens and a few minutes per fix. VERDICT: adopt / CONFIDENCE: medium / STRONGEST COUNTER: generated helpers still need failures that prove they detect the intended change.

For a single-prompt workflow, this packet has the necessary shape: V's ruling, precise source lines, exact write boundaries, expected counts, mutant obligations, and one commit. The earlier rebase needed that same source-level acceptance oracle before calling a Meaning cell KEPT-DEV.
