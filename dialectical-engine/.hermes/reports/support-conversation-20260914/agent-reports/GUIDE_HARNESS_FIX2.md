# GUIDE_HARNESS_FIX2 self-report

## Assignment

- Ticket: `t_21080a13`
- Session: `/root/preview`
- Model: `gpt-5.6-sol`
- Immutable review reference: `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6`
- Inert proof revision: `c34c64d4e643e404cefe96dfaf167536ae364a94`
- Result: 62/62 bounded inert controls passed; future corrected product requires a fresh bound execution.

## SKILLS LOADED

- `superpowers:using-superpowers`
- mission heartbeat protocol and heartbeat worker instructions
- `superpowers:receiving-code-review`
- `superpowers:systematic-debugging`
- `superpowers:test-driven-development`
- `superpowers:verification-before-completion`

## Work performed

I copied the nine sealed GUIDE_HARNESS_FIX artifacts into the new GUIDE_HARNESS_FIX2 namespace and did not modify their predecessors. I added one shared lifecycle module. GH-R1 is addressed by making declared groups real browser-session boundaries, using the supported language selector for language changes and a narrow verified sessionStorage reset for same-language remounts. First-response assertions bind each group to one distinct create-session response and fail early. GH-R2 is addressed by an exact schema-v2 proof whose revision, KB version, and executable harness digest are checked before any future traffic.

The c34 frame derived KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, confirmed the reviewed Assistant hash at c34, and passed 62 controls. Root separately reported five deterministic-policy failures at c34; those are outside this harness scope and mean the c34 proof cannot be used as the future LIVE proof. The corrected verifier is designed to reject that stale proof automatically after the product advances.

No product, source, KB, Git, runtime, browser, HTTP, database, Support, provider, model, service, lifecycle, counter, limit, credential, or private-data action was performed. The heavy lease was used for one inert frame and released immediately. Usage/token accounting was unavailable.

## Self-report question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The main failure was treating session groups as labels instead of state transitions. The matrix, capacity arithmetic, and prose all said five sessions, but the browser preserved sessionStorage and produced three. The second failure was treating a file hash as execution identity even though the proof did not name its revision or KB. Both errors survived because validation checked totals late rather than proving state at the boundary where it changed.

The efficient design is now explicit. One lifecycle module drives both the capture and its inert controls. Each group begins with a named transition and immediately proves a distinct session. One exact control-proof schema carries revision, KB, harness digest, result, count, and names. The gate compares those identities directly and rejects a successful but stale proof.

For a stronger one-prompt machine, the orchestrator should generate a single immutable final-capture manifest after the product is frozen. That manifest should name the revision, admitted KB, suite receipt, executable harness digest, five lifecycle transitions, capacity predicates, and two late runtime-capacity bindings. One command should then run inert controls at that exact revision, materialize fresh capacity, assemble a new final gate, and launch the authorized capture only if every equality passes. A product advance must invalidate the proof mechanically, as it does here, rather than rely on a human remembering which green log belongs to which revision.
