# GUIDE_INJECTION_SERVER_DIAG self-report

- Agent/session: `/root/requirements`, original Sol author/investigator seat.
- Ticket: `t_2ddf3990`; revision: `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`.
- Verdict: `PROVED_REACHABLE_PRODUCT_DEFECT_LIVE6_FIRST_EXCEPTION_UNOBSERVED`.
- SKILLS LOADED: retained actual BODY reads from this mission session for `superpowers:using-superpowers`, heartbeat protocol/worker contract, `superpowers:receiving-code-review`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. No new skill body was loaded in this node.
- Work: static source-to-sink trace only. No product edit, Git mutation, heavy command, runtime/browser/HTTP/database/model request, or private log access.
- Finding: the deterministic injection route unconditionally calls a forbidden `UPDATE support.session.state` under the startup-attested restricted Support role. This is guaranteed reachable for admitted injection requests and is independent of whether the threshold predicate matches.
- Limit: LIVE6 retained HTTP 500 but did not persist its exact body or fixed diagnostic, so the first thrown LIVE6 exception is not identified. Prior LIVE4 remains unknown.
- Minimum correction: remove mutable lock finalization and its port/bindings; retain immutable event-derived admission/read/cooldown; derive `openSessions` from the lock event; add a route-level regression using the provisioned restricted support principal plus existing storage/no-model/threshold/architecture tests.
- Consumer census: public read and admission already derive lock from events; status needs an event-derived count in the existing DB file. Message storage must remain available for the threshold refusal, and the two case-parent lifecycle guards remain unchanged; no case/handoff path is added.
- Testability: not claimed. Thirty-nine rows were unattempted and forty unfinished including the failed row; Forgot remains unresolved/actionless and CP2 remains gated.

Retrospective question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost here came from an environment mismatch that the fixture did not represent: route integration used an administrative database pool while production uses a capability-restricted pool. A single restricted-role route regression, run before live capture, would have exposed the contradiction deterministically and avoided multiple live/harness diagnosis rounds. Future one-prompt execution packets should bind every side-effecting route test to the same startup-attested principal used in production and require safe fixed-code failure projection before spending a scarce live sample.
