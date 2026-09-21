# GUIDE_SESSION_TIMES_FIX41

**Verdict:** `PASS_SESSION_TIMES_BOUND_REVIEW_REQUIRED`  
**Ticket:** `t_0e72d38b`  
**Revision:** `0d34f82f4a2188d0ce1db04655b693798ffd2169`

The single REVIEW40 finding is corrected in an append-only successor. The capture producer now records exactly three identifier-free session creation timestamps. The shared validator requires exact `ordinal` and `observedAtUtc` keys, ordinals 1–3, canonical UTC timestamps, and strict chronological order. A fourth timestamp rejects instead of being silently discarded.

The actual composer consumes the same validator before producing the five-session composed manifest. Synthetic completed21 fixtures prove exact three passes and two, four, malformed, out-of-order, and wrong-ordinal values reject. Private session identifiers and capabilities are never persisted or hashed.

Verification:

- producer/composer boundary: `9/9 PASS`;
- affected final bindings: `13/13 PASS`;
- command contract: `a7bb682a1017593a2f87b64d33689a47c2a0458253bab199dc067fb7bc898492`;
- operator executable: `562514a844027212f1c812bc64a2679255c76a38fbcd423e8e50cf52b41f3121`;
- all seven phase `argv[2]` values select the FIX41 command contract;
- current digest accepts and stale digest rejects before I/O;
- all 115 operational future paths remain unique and absent.

The sealed BIND40 evidence was not edited. All ten LIVE31 responses, the remaining21 membership and order, three groups, 18-model ceiling, 31-second pacing, row54-to-row43 same-session transition, screenshot helper, full58 proof, process/schema guards, LIVE32/actualGUIDE24 namespace, `GUIDE_LIVE21-owner-capacity.json`, and `GUIDE_LIVE25-owner-testability.json` remain unchanged.

The first control invocation failed before module execution because its shell-side relative creation path resolved under the product worktree. That operator-path failure is preserved. The identical control was then written at its authorized absolute path and passed.

Traffic: runtime 0, browser 0, HTTP 0, status 0, capacity 0, database 0, Support 0, model 0. The future operator was not executed. Forgot remains unresolved; this is not CP1 readiness or acceptance.

## Efficiency finding

This defect is another instance of producer/consumer contracts being encoded separately: the producer capped at two while the composer required three. The durable improvement is a shared typed validator used by both producer and consumer, with generated boundary fixtures for exact cardinality, ordering, and field shape. The one-prompt workflow should compile those invariants into the capture code, composer, operator contract, and review receipt from one schema rather than copying counts into multiple files.
