# FIX1 author self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

- Ticket/session: `t_2ebd85d4` / `/root/requirements`
- Scope: correction round 1 for C1, C2, and validated security findings P1-P3; bounded C3 disposition. No UI, content, model-adapter, database migration, credential, reset, provider, or owner-ratification work.
- Skills actually read: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `test-driven-development`, `verification-before-completion`, `systematic-debugging`, and `receiving-code-review`.

## Findings

The largest correctness risk was implicit data flow between adjacent services. The route had already resolved the immutable snapshot but passed only its version, allowing the answer layer to perform a second lookup. Passing the resolved object makes the session invariant explicit and directly testable. Future feature packets should name object-identity requirements in the interface fixture, not only in prose.

The 24,000-code-point requirement was implemented at the wrong layer: a downstream wrapper still clipped the composed prompt to 12,000. A single exported envelope budget, with instruction overhead calculated once, would have prevented the mismatch. The focused boundary mutant proved that a direct test above the old ceiling is much more useful than another ordinary small-context example.

The existing Support redactor was already shared by browser and server, so strengthening one browser-safe kernel function was the smallest safe change. The missing part was read-side defense for legacy encrypted content. Future sensitive-data rules should provide a caller matrix at dispatch: browser input, writer, reader, escalation snapshot, advisory transit, and HTTP projection. That would make replay paths visible before review.

The advisory summary channel had no typed output contract despite being model generated. The exact four-key `case_summary` envelope with empty provenance arrays resolved the semantic conflict cleanly. Owner-wide completion screening should be represented as a reusable policy type with a purpose discriminator from the first implementation plan; that would avoid discovering an untyped secondary model channel late.

URI-equivalent screening needed normalization before matching. Two bounded decode passes cover the validated single and double encoded forms without adding recursive or unbounded work. Security preparation was effective because it supplied exact probes against real persistence and response boundaries. Promoting those probes directly into tests avoided speculative detector expansion.

The first full typecheck exposed three local typing defects but remained red on 76 unrelated baseline diagnostics. A repository helper should compare diagnostic paths against a packet-generated allowlist and emit the scoped count. That would replace manual attribution and make a failing repository-wide check immediately actionable.

Shared-lane coordination cost less in this round because root explicitly serialized the heavy and Git leases and named the expected UI predecessor commit. The packet could improve further by including a machine-readable list of exact staged paths and a receipt generator that hashes source files and capture logs after commit.

## One-prompt improvements

1. Include exact RED/GREEN argv arrays and expected failing assertion names in the packet.
2. Generate a data-flow caller matrix for every security boundary, including legacy read paths.
3. State object-identity and immutability requirements as compileable interface fixtures.
4. Give every model-completion purpose an exact schema and deterministic invalid-output behavior in the original plan.
5. Generate staged-path and diagnostic-attribution checks from the packet allowlist.
6. Prefer one restored mutant per critical invariant over repeated broad passing suites.

Actual usage UNAVAILABLE.
