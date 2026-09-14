# REQ-FIX1 case file — PLANREV pass 1 correction

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Node `REQ-FIX1`, ticket `t_b2b3741c`, resumed session `/root/requirements`, source `446c685e977104ecf2b0b5ee0519f7123968429f`, immutable inputs `1b305e4d28e33bf77bb181eef200b7065f2c9334`.

## Causes and bounded repairs

- B1 exposed a trace failure rather than a missing product goal: the frozen spec required a version-pinned snapshot, but the plan assigned the whole requirement to loader code. Runtime currently stores the hash at session creation and never compares it at message time. The correction assigns exact-version lookup and stale-session response/restart behavior to C2, with browser retry/reset behavior in C3.
- B2 exposed a checkpoint-boundary contradiction: CP1's manual script demanded a Support-only status label even though CP3 owns that UI correction and the baseline explicitly renders `Debate engine`. The correction removes status semantics from CP1's oracle and retains the current status block without treating its wording as CP1 evidence.
- B3 exposed an outcome ambiguity with measurable downstream effects. `NO_SOURCE` can trigger E6 and is rating-eligible; `ANSWER_GROUNDED` grants resolution credit. The correction uses existing `REFUSE_SAFETY` for every rejected model draft, grants no rating or resolution credit, does not add E6/E2 solely from the model rejection, retains relay availability, and records actual usage.
- N1 was a packet/read-cost defect: `725+` had no bound. Every current trace now uses `apps/api/src/support/index.ts:725-753`.

## What nearly went wrong and cost

- A loader-only hash test can pass while a stale session silently receives different knowledge. The missing runtime ownership would likely have survived implementation until restart testing.
- Choosing `NO_SOURCE` as a convenient safe replacement would have changed escalation and rating semantics; choosing `ANSWER_GROUNDED` would have counted a rejected completion as resolution. Both are false operational signals.
- Pulling status cleanup into CP1 would widen C3 and duplicate CP3 ownership. Removing one manual expectation is the complete smaller fix.
- Requiring every identical suite three times was inherited ceremony without a failure signal in this planning node. The corrected plan requires the affected focused check at the exact revision and repeats only after changes, failures or variance justify it.

## Efficiency upgrades

1. Every requirement that crosses process memory and persisted session state should have two trace rows: producer and runtime consumer.
2. Every fallback response requirement should name its persisted outcome and downstream rating, escalation, health and accounting effects in the same paragraph.
3. Manual oracles should carry an owner checkpoint tag so a later-phase expectation cannot leak into an earlier checkpoint.
4. Packet source ranges should be mechanically rejected when they end in `+` or omit an upper bound.

No product tests, builds, services, databases or provider calls were run. Exact token usage and wall-clock duration are UNAVAILABLE from this harness.
