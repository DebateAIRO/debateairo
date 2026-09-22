# GUIDE_OPERATOR_FIX28 — complete operator absence set

- Ticket: `t_7c6e8882`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Verdict: `PASS_OPERATOR_COMPLETE_ABSENCE_SET`
- Scope: inert operator/preflight controls only; no runtime, browser, HTTP, status, capacity, database, Support, or model traffic

## Correction

The corrected operator adds exactly two paths to the invocation-time absence set:

1. `GUIDE_ROW_PROOF-run-LIVE25.json`, the row-proof child's result.
2. `GUIDE_LIVE25-owner-testability.json`, the deferred owner walkthrough output.

The real operational set is now 123 paths and 123 unique paths. Every path was absent when final binding was checked. The retained FIX27 command contract is byte-identical at SHA-256 `04512905c4f1b224a5ed1b8249fc0484650ed06ee3519bcec7f90db9ba15bc7a`; its seven `argv[2]` bindings, phase wrappers, output namespaces, product, KB, Runtime7, gate, capture plan, and deferred owner contract are unchanged.

## Reusable invocation

Future LIVE27 must invoke the public operator contract verbatim:

```text
cwd=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine
/Users/vladmihaimiron/.local/bin/node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_OPERATOR_FIX28/run-operator.mjs
```

The exact cwd, argv, script hash, unchanged command-contract hash, all 123 absence paths, narrow in-memory `SUPPORT_DATABASE_URL` projection, and distinct operator outputs/logs are sealed in `GUIDE_OPERATOR_FIX28-operator-contract.json`.

## Evidence

- 20/20 focused controls passed, retaining FIX27's 18/18 ownership controls.
- A positive invocation of the actual corrected operator reached the same real preflight wrapper and inert sentinel.
- A pre-existing row-proof result alone was rejected before any phase child.
- A pre-existing owner-testability output alone was rejected before any phase child.
- Final binding passed 30/30 checks: byte-identical command contract, seven retained self paths, exact public operator invocation, actual script digest, exact two-path source delta, 123 unique future paths, 123 absent future paths, and four syntax checks.
- Operational traffic counters were zero in every category.

## Forensic improvement

The repeated failure pattern is a split source of truth: the static verifier knew about 123 paths while the executable operator knew about 121. Both could independently pass their own tests. The durable correction is to generate the executable absence set and its public contract from one typed path registry, then make both the verifier and operator import that registry. A build should fail when the declared count, unique count, or executable enumeration differs.

This node deliberately avoided another command contract or live namespace. That is the efficient pattern for bounded corrections: retain the reviewed phase graph, change only the faulty boundary, run collision controls against the executable entry point, and mechanically prove the normalized source delta.

The remaining opportunity for a one-prompt workflow is to compile path ownership, absence requirements, argv, and phase dependencies into one immutable operator bundle. The generated bundle should contain its own inert fixture and self-test, so review examines one artifact instead of reconciling separate operator and verifier implementations.

## Limits

This node did not execute any operational phase and does not establish preview readiness, product acceptance, or CP1 completion. Forgot password remains unresolved and actionless.

