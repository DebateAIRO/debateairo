# PLANREV case file — CP1 planning review pass 1

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `REQ-REV CP1`, ticket `t_c3b600c6`, native session `/root/plan_review`, product base `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, administrative freeze `1b305e4d28e33bf77bb181eef200b7065f2c9334`.

## Cause and price

1. The requirements define a session-pinned immutable knowledge snapshot, but the trace matrix assigns that runtime property to the loader cluster. The current API stores `kbVersion` on session creation, then accepts later messages without comparing the stored version with the process corpus. Price: one required REQ correction pass before C2/C3 can claim CP1-R10, plus otherwise-likely late API/UI rework after C1 appears green.
2. The CP1 manual script requires a Support-only status label even though CP1 explicitly defers status presentation cleanup and CP3 owns both the requirement and automated acceptance. The current render suite still asserts `Debate engine`. Price: one ambiguous acceptance gate that either expands CP1 without a plan/test assignment or fails a correct in-scope CP1 implementation.
3. Invalid model-draft replacement has no specified persisted outcome. Existing outcomes have different effects: `ANSWER_GROUNDED` participates in resolution/rating metrics, `NO_SOURCE` drives repeated-unsupported escalation, and refusal outcomes have separate semantics. Price: two C2 implementations can both follow the prose and produce materially different human-handoff and metrics behavior.

Actual model-token usage and exact wall-clock duration are **UNAVAILABLE** from this harness. Heavy commands consumed: 0. Planning rework passes consumed by this review: 1 requested of the maximum 3. The first ticket read failed on the Hermes lock outside the sandbox and succeeded on the required normal escalation, costing one failed command and one retry.

## What nearly went wrong

- The unresolved Forgot password destination looked like a planning blocker, but owner authority deliberately makes it a final CP1 acceptance gate while authorizing independent catalog, safety and UI work. Reporting the known gate as a plan defect would have duplicated FIND rather than reviewing the plan.
- PREVIEW evidence arrived while this review was running. It establishes a separately owned profile design, not a working preview. Treating that investigation as CP1 runtime certification would have exceeded this seat and overstated evidence.
- The product lane became dirty from the separately authorized PREVIEW implementation after this seat claimed a clean base. Attributing that file to PLANREV would have been false; this seat wrote only its two allowed documents.
- A broad batched read truncated long output and forced targeted re-reads. Future packets or reviewer scripts should group source ranges into bounded output frames instead of combining several long artifacts.

## Dead ends and packet friction

- Re-running the 432-test baseline or starting the stack would not settle any planning defect and would violate the missing heavy lease. Documentary and targeted source probes were sufficient.
- Searching again for Forgot password would repeat the completed FIND investigation. The exact destination remains an owner input, so the review preserved it under UNVERIFIED.
- The packet's `apps/api/src/support/index.ts:725+` range is open-ended; a bounded endpoint range would reduce unnecessary reading. It did not prevent review.
- The packet accurately separated product, review and preview ownership. Its quoted base, freeze ref, ticket, allowed paths and named current files resolved; the corrected packet-check comment was visible before claim.

## Upgrades for a better one-prompt machine

1. Require every requirement row to name the runtime enforcement point and at least one acceptance assertion. A loader-only assignment should fail packet generation when the requirement also says the API must rotate a session.
2. Generate the manual script from the same checkpoint ownership table as the SPEC. A step owned by CP3 should not appear as a CP1 expected result unless the plan explicitly brings it forward.
3. Add an outcome-semantics field to response-policy requirements: persisted outcome, rating eligibility, escalation contribution, relay-health contribution and model-usage accounting. This removes interpretive work from C2.
4. Include a machine-readable dependency gate with `implementation_blocker` and `checkpoint_acceptance_blocker`. Forgot password is the latter; the missing CP1-R10 enforcement assignment is the former.
5. Keep command/read frames below the harness output cap and emit one receipt per artifact group. This avoids transcript re-reads and makes a single prompt more reproducible.

## Measurements and limits

- Current named artifact hashes matched all 7 REQ receipts checked; the frozen SPEC, PLAN and REQ evidence blobs independently matched their receipt hashes.
- Freeze metadata matched commit, tree, parent, subject and 24-path delta.
- Current route discovery returned 11 `page.tsx` routes; every existing path named by the three CP1 cluster suites resolved.
- REQ handoff listed `using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`, `brainstorming`, and `writing-plans`, satisfying its declared role floor. BASE/FREEZE skill receipt and immutable-ref claims also matched their ticket receipt.
- Tests, typecheck, build, stack, database, browser flows, live-model behavior, exact Forgot password destination and completed PREVIEW implementation remain unverified by this seat.
