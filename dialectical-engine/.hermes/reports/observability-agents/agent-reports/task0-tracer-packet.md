SKILLS LOADED: `superpowers:brainstorming`; `superpowers:writing-plans`;
`superpowers:verification-before-completion`; repository
`heartbeat-architecture`; repository `heartbeat-protocol`.

# Task 0.3(iv) tracer packet — worker report

- I worked only on the chain-code access ruling request.
- The request is at
  `.superpowers/sdd/PLAN-FixAgent/task0-tracer-ruling-request.md`.
- I changed no code, migration, schema, test, spec, decision, plan, board, or
  ticket.
- I made no commit.
- I read the full authoritative plan and the full FIX-02, FIX-09, and FIX-11
  specs and decisions.
- I read migration 0034, the Drizzle schema, predecessor plans and research, the
  heartbeat rules, and `.hermes/TOOLING-TRAPS.md`.
- The listener can read `obs.occurrence` but cannot read
  `obs.occurrence_detail`.
- A parent-only walk is incomplete. FIX-02 permits one wrapper row whose parent
  is a sentinel while its detail array still holds two or more codes.
- The request recommends one code-only array on the existing occurrence row.
- This keeps the current table grants and the direct detail denial.
- The parent link remains useful when a cause has its own occurrence row.
- The request gives exact tests for FIX-02 and FIX-11.
- Its key mutant removes the projected array read. The one-row bad-database
  fixture must then fail.
- It also tests cycles, total depth, zone stopping, detail denial, and the exact
  listener privilege set.
- The blocker is real: no frozen slice owns the needed migration and capture
  projection.
- V must ratify a SPEC-v2 and plan patch before code starts.
- If both schema changes and grant changes are barred, no complete path exists.
- No runtime test was run because this task changes only two documents.
- Static readback and scope checks passed. Pre-existing shared changes were left
  untouched.
- Comments read through: not ticketed.
