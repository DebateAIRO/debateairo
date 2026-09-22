SKILLS LOADED: heartbeat-reviewer, verification-before-completion

# FIX-01 blocker case file — Sol fallback review seat

## Case disposition

The victim is exact pre-arm loss provenance. The cause is a packet-level file-contract contradiction, not an implementation mistake: R02 demands a cross-module transfer while declaring the state-owning module read-only. Verdict: `AUTHORIZE_NARROW_EXPANSION`, limited to `packages/obs-capture/src/emit.ts:94-105`, after V ratifies the frozen-SPEC scope change.

## Cause and mechanism

- `packages/obs-capture/src/emit.ts:94-100` owns the only real pre-arm gap counter as private state.
- `emit.ts:102-105` replaces the emitter and returns void, destroying the runtime's only chance to obtain that state.
- `emit.ts:37-51` records the loss in a queued microtask. A naive immediate snapshot is also wrong: the fact exists logically before arm but may not yet exist in the counter.
- `SPEC.md:14,30-31` demands the transfer; `SPEC.md:57-58` forbids editing its owner. That contradiction should have been detected before C1 began.

## Cost ledger

- The required packet alone was 1,905 lines: prompt, brief, worker report, SPEC, DECISIONS, emitter, current runtime/tests, both reviewer skills, and the 1,034-line tooling-trap ledger.
- Independent interface tracing added 639 lines across health, queue, flusher, barrel, package manifest, and scheduler installer: 2,544 reviewed lines before the verdict artifact.
- The implementation worker completed and committed C1 (`9f02fcb5`, 218 inserted lines across four files) before the cross-surface feasibility check stopped C2.
- The blocker incurred at least one implementation stop plus this fallback review cycle; an external Grok transfer was also pending approval. Provider token totals were not exposed, so no token number is invented.
- Re-reading the full 1,034-line tooling ledger for a narrow state-transfer question is a recurring context cost. Its relevant lessons were only the evidence clock, probe-not-read discipline, non-vacuous runs, and exact-path packet rules.

## Dead ends and near-misses

- **Fabricate one at arm:** passes a singular `>=1` example, lies for zero, and under-counts every N greater than one.
- **Create a fresh runtime counter:** lawful but empty; counters do not discover one another (`health.ts:130-142`).
- **Read default health instead:** also private and loses the gap-row transfer semantics.
- **Wrap scheduler emission:** cannot see emissions between installer load and the timer-based dynamic arm (`install/scheduler.ts:192-197`).
- **Return the counter immediately:** near-miss; it overlooks queued loss settlement and reads zero in the same-turn case.
- **Change the setter to Promise-only:** near-miss; it needlessly breaks the exact one-argument void contract. An overload can preserve legacy calls.
- **Test only one pre-arm emit:** near-miss; it cannot distinguish exact counting from a boolean or hard-coded one.

## Mandatory upgrades

1. Add a pre-implementation feasibility gate: for every requirement, name the state owner, allowed writer, transfer interface, persistence consumer, and failure/retry owner. Any required edge crossing a read-only boundary blocks dispatch.
2. Make zero/one/many and before/during/after-boundary cases mandatory when a requirement says “counted.” The single `>=1` example was too weak to enforce the mission's exact-data law.
3. Put the seam contract in the packet before cluster work: synchronous swap, queued-microtask settlement, first-owner transfer, retry ownership, empty-queue first flush, and legacy one-argument behavior.
4. Generate reviewer identity and output paths from one variable. `fix01-blocker-review-prompt.md:1-3,31-40` says Grok and `*-grok.md`; the live fallback assignment says Sol and `*-sol.md`. That ambiguity creates missing artifacts and write contention.
5. Index the tooling ledger by topic and content hash. Load the relevant indexed entries for narrow reviews and cache a verified full read per session; do not force every small decision to pay 1,034 lines repeatedly without a retrieval map.
6. Run a tiny hostile probe before implementation: zero, two pre-arm emits, immediate install, microtask barrier, post-arm overflow. This 0.3-second probe exposed the entire blocker three times.

## One-prompt-machine form

The launch generator should emit one canonical, mechanically checked packet containing:

- immutable reviewer identity, model/seat, exact output paths, base commit, cwd, and allowed writes;
- a requirement-to-state-owner-to-seam table, with a hard failure when an owner is read-only and no exported transfer exists;
- exact zero/one/many and boundary fixtures plus named mutants;
- executable existence checks for every required path and an expected non-vacuous test summary;
- scope-ratification state, so “recommended expansion” cannot be mistaken for authority to edit;
- artifact-first handoff and a short final status contract generated from durable file existence and hashes.

That form would have stopped FIX-01 before C1, asked V one narrow question about `emit.ts:94-105`, and resumed the worker with the exact overload, atomicity rules, and mutants in a single round.
