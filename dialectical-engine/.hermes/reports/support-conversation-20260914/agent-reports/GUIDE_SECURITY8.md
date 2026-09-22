# GUIDE_SECURITY8 self-report

## Assignment and result

Independent Sol security review of the restricted-role correction at exact product revision `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`, ticket `t_a923e6ed`, session `/root/forgot_destination`.

Verdict: **REWORK**. The patch correctly removes a forbidden post-storage state update without adding privileges, but two missing consumer invariants remain. An immutable `LOCK` event does not stop manual or rating-triggered human-case creation while the physical row stays `OPEN`; and a later injection-threshold increase makes read/admission treat an existing lock as open even though status and cooldown still consume the event. Both conclusions are source-conclusive, so no heavy discriminator was justified.

## Process assessment

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The correction solved the immediate denied SQL operation but left two definitions of lock: physical state and immutable event plus a third threshold-derived view. That split is the core upgrade target. Define one terminal `LOCK` predicate and require every read, write, case, metric, and cooldown consumer to use it. The configured threshold should only decide when the immutable event is created; it should never decide whether a recorded lock still exists.

The author evidence spent a large suite to prove the fixed route, then the independent review found missing downstream consumers statically. A more efficient change prompt would require a generated lifecycle inventory before implementation: producer, serialized admission, read projection, each write surface, case creation, status, cooldown, shredding, and config-transition behavior. Each listed consumer should have one focused before/after assertion, including `LOCK at N → threshold N+1` and `LOCK → manual/human-rating escalation`.

The principal-count rework is a good example of inexpensive source-derived testing. Deriving cardinality from the unchanged declaration removed stale fixtures without weakening membership assertions. The same pattern should be applied to state: define the authoritative lock predicate once, reuse it in SQL/repository helpers, and generate bounded tests from the state-machine contract. One command can then verify revision/custody, the exact consumer table, focused RED/GREEN tests, cleanup, and a self-excluding receipt; full suites remain a final regression check rather than the discovery tool.

Usage telemetry: **UNAVAILABLE**.

## Skills loaded

`superpowers:using-superpowers` (subagent-stop body honored); mission `heartbeat-protocol`; mission `heartbeat-reviewer`; `superpowers:verification-before-completion`; `superpowers:systematic-debugging`; `superpowers:test-driven-development`; `codex-security:attack-path-analysis`.
