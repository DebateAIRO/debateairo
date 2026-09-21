# GUIDE_ACTION_COMPOSE self-report

## Handoff

- Node/ticket/session: `GUIDE_ACTION_COMPOSE` / `t_3ffab684` / `/root/requirements`.
- Base/final: `b0b91a01cf161d17eef75577cbae94c629b7bc49` -> `c8784902f78ed4ba1d637d122e1f32f598415f4e`.
- Exact product scope: one test file, typed with the production `SupportModelPort` completion contract; assertions and runtime bytes are unchanged.
- Final evidence: exact33 1,633 passed + 1 TODO; typecheck equals the attributed 76-diagnostic baseline; strict44 snapshot; frozen FIX2 62/62.
- Retained evidence: controlled structural eval ran at the base revision with 3x60/60 and rubric `PENDING`; no duplicate eval was run after the test-only correction.
- Custody: product is clean and both heavy/Git leases were released. Separate reviews and LIVE2 remain required.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The evidence trail shows four recurring costs. First, runtime suites passed before the test mock's tuple type was checked. The generated verification contract should typecheck affected tests before the broad union and commit, so a two-line mock correction does not force a second 33-file run. Second, receipt generation remains manual and revision-sensitive. One mission command should capture the revision, immutable suite argv, KB digest, snapshot hashes, test counts, and lease state, while distinguishing evidence executed at the final revision from evidence retained across a byte-proven test-only change. Third, the sandbox TSX IPC restriction caused an uninformative first eval attempt. A preflight should select the supported execution environment before starting the one allowed evaluation. Fourth, fresh-runtime product proofs and inert harness controls are different gates; the orchestration prompt should schedule them explicitly and never imply that inert controls establish live action behavior.

The strongest one-prompt workflow would compile a typed verification manifest before work starts: allowed product files, exact test union, expected baseline diagnostics, immutable harness digest, required snapshot schema, commands with environment requirements, and downstream gates. It would fail early on unsupported flags or IPC constraints, run the cheapest affected/type checks before broad suites, create receipts from command results, and require every claim to name its measured revision. That would preserve the current rigor while removing repeated file discovery, manual hash bookkeeping, and ambiguous retained-versus-fresh evidence.
