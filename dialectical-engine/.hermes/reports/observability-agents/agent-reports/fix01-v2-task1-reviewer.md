SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers, superpowers:verification-before-completion

# FIX-01 v2 Task 1 reviewer case file

- Cause found: `tests/unit/fix01-runtime-shape.test.ts:72-74` defines “all private option fields” as only properties prefixed by `readonly`; that is narrower than the SPEC-v2 exact-three-field contract.
- Price: one focused 0.1-second in-memory probe found a false-green mutation before handoff; leaving it would defer detection until a later installer-contract change and consume at least one rework round.
- Probe: inserted `optionalExtra?: string` into the loaded `api.ts` source string without touching disk, then ran the test's matcher logic.
- Probe output: `{"contractMatched":true,"extractedFields":["runtime","spoolFd","installExitSink"],"requiredChecks":[true,true,true,true],"mutantPresent":true}`.
- Required upgrade: extract every property name inside the private options block, whether or not it is `readonly`, and prove the resulting sequence is exactly the approved three names; add this private fourth-field mutant to the refutation record.
- What nearly went wrong: the current source checks and exact-looking array comparison initially appeared sufficient because every present installer field is `readonly`; the ignored syntax class is visible only under mutation.
- Dead end avoided: no suite rerun was needed; the implementer's three 5/5 runs and pinned typecheck evidence cannot answer whether this deliberately hostile source shape fools the matcher.
- Commit evidence: HEAD is `4bc106cb2214997154c0d20a22b9d414ee048a5a`, its sole parent is the requested BASE, and the commit changes only the two authorized files.
- Frozen-file evidence: all three installers and `tests/architecture/fix01-import-graph.test.ts` are byte-unchanged across BASE..HEAD.
- Restore evidence: reported hashes match the checked-out GREEN files, and no forbidden runtime import was found.
- Packet defect, corrected before verdict: the controller initially named `shutdownSignal` and `onCommitted`; its follow-up restored the authoritative SPEC-v2 fields `runtime`, `spoolFd`, and `installExitSink`, so the implementation is not penalized.
- Packet improvement: source exact field names from SPEC-v2 mechanically when composing the reviewer dispatch; the incorrect duplicate list cost one correction exchange and could have caused a false rejection.
- No new tooling trap was discovered; `.hermes/TOOLING-TRAPS.md` was read completely and left unchanged.
- Files changed by this reviewer: only this mandatory untracked case-file report; product, test, plan, spec, decision, index, HEAD, branch, and ticket state were not changed.

## Review round 2

- B1 is fixed at `tests/unit/fix01-runtime-shape.test.ts:69-94`: top-level fields are matched with optional `readonly` and `?`, while delimiter depth suppresses nested callback parameters.
- Independent in-memory probe output: `{"actual":{"contractMatched":true,"fields":["runtime","spoolFd","installExitSink"],"finalDepth":0},"optionalMutant":{"contractMatched":true,"fields":["runtime","spoolFd","installExitSink","optionalExtra"],"finalDepth":0},"mutableMutant":{"contractMatched":true,"fields":["runtime","spoolFd","installExitSink","mutableExtra"],"finalDepth":0},"multilineCallback":{"contractMatched":true,"fields":["runtime","spoolFd","installExitSink"],"finalDepth":0}}`.
- Price of closure: one 0.1-second read-only probe; no product/test mutation and no broad test rerun.
- Fix-commit scope: `27bdf2a8ca97d4f13ebab48c66f49beaa1504761` has sole parent `4bc106cb2214997154c0d20a22b9d414ee048a5a` and changes only `tests/unit/fix01-runtime-shape.test.ts`.
- Full-range scope remains the authorized runtime file plus unit test; frozen installers and the architecture import test match BASE byte-for-byte.
- Implementer evidence records the named false GREEN before the fix, RED after it, three final 5/5 focused runs, and the pinned eight-diagnostic typecheck baseline with zero FIX-01 delta.
- No new dead end or tooling trap appeared. The round-2 packet was precise and internally consistent.
- Round-2 files changed by this reviewer: only this mandatory untracked case-file append; no reviewed, staged, commit, branch, plan, spec, or decision state changed.
