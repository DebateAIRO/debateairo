CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r3 — CHANGES · comments read through: t1-oracle-evaluator-plan-r3-2026-09-06

BLOCKING: 5 / FOLLOW-UP: 2 — counts carried from this review's five R3-B findings and F1/F2.

This is the reviewer's self-report. The substantive verdict is [t1-oracle-evaluator-codex-plan-r3.md](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-plan-r3.md). **STRENGTH: entailed.**

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

## What failed this time

The revision repairs several previous examples, but the information needed by the next stage still does not survive the previous stage. Prim fixes booleans within a callback; Cell erases strings before the next callback. A nested payload fixes one binding example; a missing callee-role condition lets a method reference acquire the return type of a method that was never called. An evaluated record names every field; its round-1 construction omits three required fields. **STRENGTH: entailed** from R3-B1–B3, including native/AST probes and two isolated compiler diagnostics.

The floor count was corrected in one section and left wrong in the worker instructions. Counting source test instances also found two standalone negatives absent from the corrected inventory. The mutation revision names new clauses and types of observables, but does not supply the promised per-row manifest. These are failures of consistency between artifacts within one plan. **STRENGTH: entailed** from R3-B4/B5.

## What the evidence supports, and what it does not

Fresh source-only probes confirm the stable facts: 232 source files, no differences from the parked commit, zero parse diagnostics, 33 numeric candidates, the 23/1/1 model dependencies, and the derived 24/2/2 totals against 1. Nine explicit LoginFlow completions parse. These observations support the parser choice and the proposed corpus expectation; they do not establish an implemented evaluator's verdicts. **STRENGTH: entailed** for those measurements; **consistent-with** for the future corpus expectation.

The architecture self-report's proposed discipline, “derive worked examples from the rules,” remains useful. This revision shows that adding a reason column is insufficient: the reason column says “str cells” while the type and abstraction table provide no such cells. A derivation must record the actual intermediate value and its type, rather than another prose explanation of the intended result. **STRENGTH: entailed** for the specific mismatch; **consistent-with** for the general process lesson.

I did not measure token savings, engineering duration, a future false-positive rate, or actual worker/mutant executions. No numeric savings estimate is justified by this review. **STRENGTH: entailed** as a limit; those quantities are **undetermined**.

## Changes that would reduce repeated work

1. **Give the worker one current contract.** Preserve old rounds as history, but generate the current types, transfer table, fixture routing and round manifest from one operative section. This review had to read 2,555 plan lines plus 571 self-report lines and distinguish multiple supersession levels. The 25/28 floor mismatch is a concrete consequence of the repeated definitions. **STRENGTH: entailed** for lengths/mismatch; **consistent-with** for the recommendation and causal attribution.
2. **Derive examples through typed intermediate values.** For a chain, record `input cells → callback Prim → stored cells → next operation → verdict`. The string-coercion contradiction appears at the first stored-cell boundary. Add the equal-string/distinct-string Set pair to force equality information to be accounted for. **STRENGTH: entailed** for the demonstrated information loss; **consistent-with** for the workflow recommendation.
3. **Check parent roles, not just node kinds.** Every AST ownership rule should state both child identity and the parent slot it occupies. The fresh counterexample has the expected PropertyAccess/CallExpression kinds and the wrong argument/callee relationship. **STRENGTH: entailed** for that counterexample; **consistent-with** for applying the discipline generally.
4. **Compute the floor from executable test instances.** The old selector has 66 statically enumerated instances. The relevant ceiling floor has 27, and the three bare DOMAIN tests are separate. Group headings did not reveal the two omitted standalone negatives. Keep the source test-name inventory beside routing and count assertions. **STRENGTH: entailed** for the enumeration; **consistent-with** for the recommendation.
5. **Make the mutation manifest reviewable before scheduling its transcripts.** A label such as K31 is not a mutation. Require the rule edit, exact fixture, observable, before/after values, stage and restoration target together. Mark shared mutations, aliases and controls explicitly so the count is derived. **STRENGTH: entailed** for the current missing fields; **consistent-with** for the proposed process.

These recommendations concern handoff quality; they do not require changing the parked source or expanding this review into implementation. **STRENGTH: consistent-with.**

## Review execution and corrections

- Read the reviewer packet in full before examining the task artifacts. Read the complete plan, self-report and previous final verdict, plus amendment/dispatch/decision material and the relevant oracle source. No AGENTS.md was found in the workspace or its ancestor chain in the instruction search. Used the required using-superpowers workflow and verification-before-completion skill; no implementation or security-scan workflow was invoked for this static plan review. **STRENGTH: entailed.**
- Used native finite examples, TS 5.9.3 source parsing, in-memory compiler snippets and in-memory extraction of the existing pure oracle. Source-only corpus reads were compared with the immutable git blob. None of these was represented as Vitest, repository typecheck, or evaluator implementation evidence. **STRENGTH: entailed.**
- An initial combined probe had a JavaScript syntax typo, so it executed none of its body. I corrected it and used the successful rerun. A compiler snippet initially named a variable `length`, creating an unrelated DOM declaration collision; the rerun renamed it and isolated TS2339. These were review-harness errors and were not charged to the plan. **STRENGTH: entailed.**
- Some batched read output was truncated. The previous verdict and full plan were subsequently read in bounded chunks. The complete architecture packet/amendment was available in the first packet-history read, and relevant authority was also read directly. Output truncation was a reason to re-read, not evidence about the artifacts. **STRENGTH: entailed.**
- Ran the supplied universal-sweep tool and semantically checked its pertinent claims against the already-read plan. The important recurrences were the cross-operation information loss, “every field except” typing, “every OTHER/RULED row” RED claim, floor count/routing, and “each row declares” mutation claim. **STRENGTH: entailed** for the identified text defects; this is not an assertion of exhaustive JavaScript soundness review.

## For V — the residual

The review recommends keeping the parser architecture while requiring five bounded contract repairs: primitive storage/equality, actual call-role checking, type-valid stage/site APIs, correct floor routing/counts, and a concrete mutation manifest. It does not request another architecture-seat round. The four O1 semantic clauses should gain explicit discriminators before evaluator implementation; the display/identity mutation gap can remain named if exact display/address assertions are mandatory. **STRENGTH: entailed** for the five defects; **consistent-with** for the proposed disposition.

## Packet audit

Only the two named output files were written. The lane stayed read-only; no install, pnpm, suite, repository typecheck, application import, source mutation, git mutation, new worktree, board/decision edit, network request or credential read occurred. No scratch file or third report was created. No subagents were used. Existing grants were read and cleared without asking for permission again. **STRENGTH: entailed.**

## Not verified

Exact Node 22.23.1 execution, alias installation and Vitest resolution, repository TS 7 diagnostics, RED/GREEN worker rounds, mutation transcripts, b14, future evaluator verdicts and effort remain **STRENGTH: undetermined**. The local source probes ran on Node v25.7.0 with the already installed classic parser; that is not F2's runtime gate.

PLAN: changes — the parser architecture stands, but the five specified contract defects need resolution before evaluator implementation is dispatched.
