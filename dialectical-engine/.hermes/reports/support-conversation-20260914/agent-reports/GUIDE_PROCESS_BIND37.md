# GUIDE_PROCESS_BIND37

Verdict: **PASS_PROCESS_IDENTITY_BOUND_REVIEW_REQUIRED** at product `0d34f82f4a2188d0ce1db04655b693798ffd2169`.

The final readiness and idle phases now authenticate the same pure process-row validator bytes from the final contract, parse exactly one `ps` row, and require returned PID and PGID to equal the validated custody/readiness identity, PPID to equal 1, and the existing command marker to be present. Empty, malformed and multiple rows are rejected. READINESS and IDLE output shapes are unchanged. Runtime9 is referenced through authenticated custody; no PID is hardcoded in executable guards.

Focused controlled-I/O verification passes 28/28. The predecessor readiness guard reproduces its false acceptance of a mismatched `123/1/123` row against Runtime9 custody. Corrected readiness and idle accept the sealed public Runtime9 identity `9800/1/9800`. Each phase rejects wrong PID, wrong PGID, wrong PPID, empty, malformed and multirow responses before TLS or a success write. Validator hash/byte tampering and predecessor custody reject before operational I/O. No live process, HTTP, browser, status, capacity, database, Support or model action occurred.

The exact 7-phase inventory binds corrected readiness and idle plus six transitive validators. All seven argv values self-bind command SHA `a569348814688b64eab8368ef383bc77b7ec80605c08290489024fe8ca926f1f`; the real non-inert operator rejects the predecessor hash and reaches a controlled first-phase boundary with the finalized hash. All 123 LIVE30/actual GUIDE22 future paths remain unique and absent. Runtime9 custody, product 0d34, FINAL18, KB7ef, fixed31/five-session plan, full58 evidence, FIX30 screenshot helper and owner-capacity contract are retained.

No operational phase or capture ran. Independent review is required before LIVE30. Forgot remains unresolved; this is not CP1 acceptance or CP2 authorization.

Efficiency finding: process ownership was previously inferred from a substring even though the same `ps` row already carried the authoritative PID, PPID and PGID. A single authenticated parser shared by readiness and idle prevents repeated weak-guard rediscovery. Future lifecycle contracts should define and test the complete process identity at their first implementation, including malformed and multirow output, rather than validating liveness and ownership in separate later passes.

SKILLS LOADED: retained mission BODY/protocol context; no new skill invoked. Native session: original Sol `/root/preview`, ticket `t_ebade6b9`.

Self-report prompt retained verbatim: “treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.”
