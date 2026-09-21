# GUIDE_PROCESS_REVIEW37

Verdict: **PASS_FINAL_PROCESS_RUNTIME_OPERATOR_BINDING** at exact clean product revision `0d34f82f4a2188d0ce1db04655b693798ffd2169`.

BIND37 closes the REVIEW36 process-identity defect in the actual readiness and idle paths. The shared helper parses exactly one nonempty `ps` row, requires numeric PID/PPID/PGID, matches PID and PGID to the validated runtime identity, requires PPID 1 for this detached supervisor, and retains the custody-derived `pnpm dev:auth:up` marker. Empty, malformed and multiple rows reject.

Both phases authenticate the helper's path-bound SHA-256 and byte count before importing its exact bytes. Readiness derives PID, PGID and command marker from authenticated Runtime9 custody after retaining the exact-schema/revision/log/ports/timestamp/detached/TLS checks. Idle derives PID and PGID from the validated readiness output and uses the final bound custody-derived command marker. No fixed runtime PID is embedded.

The 28 focused controls are discriminating:

- the old BIND36 readiness truthfully accepts the mismatched `123/123` row;
- corrected readiness and idle accept the sealed Runtime9 `9800 1 9800` identity;
- wrong PID, PGID and PPID, empty, malformed and multirow values reject in each phase before TLS or success output;
- altered helper metadata rejects before operational I/O;
- the retained authenticated custody schema still rejects predecessor identity;
- the final non-inert operator rejects the predecessor command digest and reaches the controlled boundary only with the actual final digest.

The mechanical successor binding is coherent. Readiness and idle argv select the corrected sources; all seven phases self-bind the immutable PROCESS_BIND37 command contract SHA-256 `a569348814688b64eab8368ef383bc77b7ec80605c08290489024fe8ca926f1f`; the operator embeds that digest and its metadata binds script SHA-256 `4bbf33ade77da4270c7c61c92742ef02dbc32743f94cec44356af1d34440f0e7`. Absolute Node `--import tsx`, exact cwd, `require_escalated`, tool-captured output, separate log ownership and no outer redirection remain intact.

All other REVIEW36 PASS dispositions compose unchanged: authenticated Runtime9 schema/API8890, Git/TLS checks, seven-phase transitive inventory, product0d34, FINAL18, full58, fixed31/five-session plan, fresh-proof dependency, separate deferred owner capacity, narrow Support principal handling, Runtime9/two approved startup requests and FIX30 screenshot evidence. All 123 unused LIVE30/actual GUIDE22 future paths remain unique and absent; Runtime9 was untouched.

Custody passes: 86/86 indexed REVIEW37 inputs match recorded hashes and sizes; the product checkout is clean at `0d34…`. This review performed no heavy, runtime, browser, HTTP, status, capacity, database, Support, model, private-log, product, KB or Git action.

The executable runtime/operator binding is approved for the separately authorized operational run. Actual31, current capacity, answer quality and completion remain unproven here. Forgot remains unresolved and actionless; CP1 is not ready, complete or accepted, and CP2 remains unauthorized.
