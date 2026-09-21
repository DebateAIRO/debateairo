# GUIDE_RUNTIME_REVIEW36

Verdict: **REWORK_RUNTIME_PROCESS_IDENTITY_GUARD** at exact clean product revision `0d34f82f4a2188d0ce1db04655b693798ffd2169`.

BIND36 correctly removes the retained Runtime7/API8787 hardcodes and authenticates the current Runtime9 custody schema. Its final operator, command hash, seven phase argv paths and fresh LIVE30 namespaces are internally consistent. One runtime-identity defect remains in the actual executable chain: readiness and idle do not parse or match the process identity returned by `ps`.

## Finite finding

`GUIDE_RUNTIME_BIND36/phase-readiness.mjs` invokes:

`ps -o pid=,ppid=,pgid=,command= -p <custody.pid>`

but accepts the result when the raw text merely contains `pnpm dev:auth:up`. It never verifies the returned PID against `custody.pid` or the returned PGID against `custody.pgid`. The retained `phase-idle.mjs` has the same command-marker-only check.

The controlled-I/O positive exposes the gap rather than proving it closed: the stub returns `123 1 123 pnpm dev:auth:up` while the authenticated Runtime9 custody contains PID/PGID `9800/9800`, and both readiness and idle pass. Thus BIND36 proves current schema acceptance and output compatibility, but not the packet's required positive matching PID/PGID or continued detached process identity.

Minimum correction:

1. Parse exactly one `ps` record and require numeric returned PID and PGID to equal the authenticated custody PID and PGID, plus PPID 1 for this already-detached owned Runtime9, before writing readiness output.
2. Apply the same identity check in idle using the corrected readiness output, which already carries both PID and PGID.
3. Make the controlled positive return matching custody values, and add discriminating wrong-PID, wrong-PGID, wrong-PPID and multiple-row negatives for readiness and idle. These cases must reject before output creation.
4. Rebind the changed readiness/idle source hashes, final command bytes and operator embedded digest. The still-unused LIVE30/actual GUIDE22 namespaces may remain unchanged.

No runtime restart, capacity read, product change, corpus replay, screenshot rerun, Support request or private-log access is required.

## Retained PASS dispositions

- The bound custody-contract digest is authenticated before operational I/O. The schema has 11 unique exact keys, current node/revision/log, complete authoritative ports including API8890, detached state, ordinary-TLS facts, valid timestamp and positive equal custody PID/PGID.
- Required values are derived from the authenticated contract rather than new Runtime9/API constants. Predecessor node, API8787, invalid schema hash, missing/extra custody key and invalid custody PID reject before operational I/O.
- Git revision/cleanliness and ordinary TLS Help200 checks remain in the actual readiness source. The process check is retained as incomplete pending the identity correction above.
- The seven-phase and transitive-source inventory contains no Runtime7 or 8787 marker. Readiness argv selects the BIND36 source; all seven argv arrays self-bind the BIND36 command contract.
- The final operator embeds the actual command SHA-256 `30da55750cd96c3323234f988a07cf2961025db7ebe486176bd79858897e46e4`; the real non-inert hash guard distinguishes the stale predecessor value and reaches the controlled boundary only for the current value.
- Absolute Node `--import tsx`, exact cwd, `require_escalated`, tool-captured output, separate operator/wrapper log ownership and no outer redirection remain correct.
- Current product0d34, FINAL18, full58, fixed31/five-session plan, fresh-proof-before-capture dependency, separate deferred owner capacity, narrow Support principal handling, Runtime9 custody/two approved startup requests and unchanged FIX30 screenshot evidence remain retained.
- All 123 LIVE30/actual GUIDE22 future paths are unique and absent. LIVE29 created zero sessions, so it adds no hourly wait.

Custody passes: 82/82 indexed REVIEW36 inputs match recorded hashes and sizes; the product checkout is clean at `0d34…`; the author proof reports 18/18 controls, with its process-identity positive qualified by this finding. This review performed no heavy, runtime, browser, HTTP, status, capacity, database, Support, model, private-log, product, KB or Git action.

Current capacity and fresh31 remain unproven. Forgot remains unresolved and actionless; CP1 is not complete, ready or accepted, and CP2 remains unauthorized.
