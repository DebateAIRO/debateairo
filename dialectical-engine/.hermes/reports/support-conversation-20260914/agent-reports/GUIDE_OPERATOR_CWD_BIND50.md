# GUIDE_OPERATOR_CWD_BIND50 self-report

- SKILLS LOADED: superpowers:using-superpowers; superpowers:systematic-debugging; superpowers:test-driven-development; superpowers:verification-before-completion.
- Native session: /root/preview. Ticket: t_469c6c88. Revision: 0d34f82f4a2188d0ce1db04655b693798ffd2169.
- Verdict: PASS_OPERATOR_CWD_BOUND_REVIEW_REQUIRED. One inert guard; zero operational traffic.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost was treating launch metadata as presentation data rather than executable custody. The contract correctly named the product worktree, but the separately generated operator metadata retained the source-repository cwd. Dispatch caught the mismatch before execution. Operator metadata should always derive cwd from `commandContract.cwd`, and generation should reject any independent cwd argument.

A one-prompt flow should generate the command contract and operator metadata in one transaction, assert a structural equality invariant for cwd and every argv binding, run the inert guard from that exact cwd, and only then dispatch the operational node. This removes manual path transcription and prevents a review from accepting individually valid files whose launch context disagrees.

The initial draft mistake changed both cwd and node. Preserving it and enforcing a one-field structural comparison caught the error. The final artifact changes only cwd. Independent review and actual execution remain pending.
