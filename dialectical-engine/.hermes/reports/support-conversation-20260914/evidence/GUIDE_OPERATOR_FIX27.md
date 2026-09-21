# GUIDE_OPERATOR_FIX27 — operator log ownership correction

- Ticket: `t_c68906dd`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Verdict: `PASS_OPERATOR_LOG_OWNERSHIP`
- Scope: inert operator/preflight controls only; no browser, runtime, HTTP, status, database, Support, or model traffic

## Result

The reusable operator now launches with the exact public invocation below and never opens a path reserved by a phase wrapper or child:

```text
cwd=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine
/Users/vladmihaimiron/.local/bin/node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_OPERATOR_FIX27/run-operator.mjs
```

The literal invocation, cwd, script digest, command-contract digest, distinct operator outputs, and seven distinct operator logs are sealed in `GUIDE_OPERATOR_FIX27-operator-contract.json`. The future operational node should execute that contract verbatim rather than generate another driver.

Only the path already occupied by LIVE26 changed: the preflight contract log moved from `GUIDE_LIVE25-preflight.log` to unused `GUIDE_LIVE27-preflight.log`. Every other unused LIVE25 phase/capacity/gate/row-proof/UI/profile path, every actual GUIDE21 response/screenshot path, and the absent future `GUIDE_LIVE25-owner-testability.json` remain unchanged. All seven `argv[2]` entries self-bind the final FIX27 command contract.

## Ownership evidence

The 29 concrete paths in `GUIDE_OPERATOR_FIX27-owner-map.json` are collision-free. Phase wrappers exclusively create phase results. The preflight wrapper exclusively creates the UI child log and result; row-proof and capture wrappers exclusively open their child logs. Contract log paths for phases that do not themselves write a child log stay reserved and absent. The thin operator writes only its `GUIDE_OPERATOR_FIX27-operator-<phase>.log` after the child exits, plus its prerequisite or first-failure stop record.

The exact operator ran against the real preflight wrapper with an inert sentinel:

- 18/18 focused controls passed.
- All wrapper-owned paths were absent at invocation.
- The wrapper reached the sentinel and created its result and child log.
- The operator did not create the wrapper's contract log.
- A requested child failure preserved numeric status `1`, wrote the stop record, and created no later-phase outputs.
- A deliberate operator/wrapper path collision was rejected before the child ran.
- Browser, HTTP, status, database, Support, and model traffic were all zero.

The first focused frame is preserved as a RED. It found an undefined local variable in the new thin operator before the wrapper ran. The one-line parameter reference was corrected, and the affected frame passed in a new fixture/log namespace. The earlier missing-TS-loader LIVE25 and wrapper-log-collision LIVE26 receipts remain immutable and are linked by mechanically verified hashes in the final control proof. A preliminary proof containing two copied, incorrect historical receipt hashes is retained under `GUIDE_OPERATOR_FIX27-control-proof-superseded.json`; the final proof corrects only those references and identifies the superseded artifact.

Final binding controls passed 35/35: exact base-to-final delta, all-seven self-binding, public operator invocation and script digest, command-contract digest, unique owner map, 123 absent future paths, absent owner-testability output, and syntax checks for six node scripts.

## Forensic improvements

The repeated cost came from operator boundaries being specified in prose but not exercised against the real wrapper before an operational attempt. LIVE25 omitted the TypeScript loader; LIVE26 used the right loader but redirected stdout into a path the wrapper requires to be absent. Both failures happened before useful work, yet each required a new sealed node and evidence package.

The next upgrade should make artifact ownership part of one generated phase graph. Each path needs one declared owner, exclusive-create timing, and producer/consumer edge. A build step should reject duplicate paths, stale self-bindings, missing loaders, and output files that already exist. It should then run the exact final operator against real wrappers with inert children. The same public operator contract should flow unchanged into the live node.

The orchestration can become closer to a one-prompt machine by compiling the mission into four artifacts once: a typed phase graph, a secret-custody adapter declaration, a literal operator contract, and an immutable evidence manifest. One command can then perform static graph validation, inert boundary validation, and—only after those pass—the authorized operational phases. This removes repeated hand-written drivers and repeated translation between packet prose, command contracts, and live invocations.

The artifact generator should also derive hashes mechanically at seal time. Two historical hashes were copied incorrectly in this node's preliminary proof even though the behavioral controls passed. Retaining and superseding that proof made the mistake visible; generating every receipt reference from file bytes would prevent it.

## Limits

This node did not execute the operational seven phases and does not establish preview readiness, product acceptance, or CP1 completion. Product `456cafb9`, KB `7ef4244d`, Runtime7, the private ongoing stack log, fixed31 capture logic, full58 proof, screenshots, quota constraints, and the deferred owner-capacity command were unchanged. Forgot password remains unresolved and actionless.

