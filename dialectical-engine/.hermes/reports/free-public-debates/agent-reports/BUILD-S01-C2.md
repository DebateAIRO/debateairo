# BUILD-S01-C2 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The implementation landed at `11184e70` with the required cluster GREEN three times. The dominant cost was not the feature code; it was resolving contradictions and reconstructing hidden compatibility assumptions around the feature boundary.

## Cause and price

1. **The expected-RED marker contract contradicted the plan.** C2-S2 said the expected six failures should print `CLUSTER_RED`, while the shared runner prints `CLUSTER_GREEN` whenever observed counts match the supplied expected pair, including `0:6`. This caused the first BLOCKED handoff and an orchestrator round trip. DECISIONS §21 now supplies the controlling interpretation. Price: a full stop/resume cycle plus rereading and re-establishing the base frame.

2. **The system path could not satisfy an existing publication-v2 trigger.** The packet specified a new system transition without an owner binding, but did not explicitly assign the necessary narrow adaptation of `core.enforce_publication_v2_ref_binding()`. The real-database tests exposed the conflict. The remedy was kept in `migrations/0067_system_run_publication.sql`: only the pinned system actor and exact audit/visibility shapes are admitted, backed by a PREPARED system intent; the owner binding checks remain unchanged. Price: several migration/test iterations.

3. **The integration fixture needed more schema truth than the packet supplied.** A valid encrypted, served run required the actual execution/session/content-attestation shape. Early seeds failed on an unqualified digest and an invalid attestation before reaching the behavior under test. Dynamic catalog inspection and reuse of the real migration path eventually produced a faithful fixture. Price: repeated embedded-Postgres startup/migration output and substantial diagnostic reading.

4. **I initially misclassified a typecheck delta as external.** The orchestrator's second ruling proved the 86-versus-70 delta was exactly 16 C2-caused diagnostics: fifteen constructor arity failures and one legacy fake/interface mismatch. The final compatibility remedy stayed in the owned API surface: default the fifth constructor reader, and make newly introduced interface capabilities optional while the concrete production class still implements them; the HTTP hook narrows before use. Typecheck returned to exactly 70 diagnostics with zero owned-path diagnostics. Price: a second BLOCKED/resume cycle. This was the closest point to an incorrect READY claim.

5. **One command assumption was wrong.** I first tried a nonexistent `~/.local/bin/run-suites.sh` and a wrong relative probe directory. It made no product change, but consumed a round trip. The packet's absolute runner path should be the only executable form copied into worker prompts.

## What nearly went wrong

- Treating “zero owned diagnostics” as sufficient would have hidden C2-induced failures in legacy tests. The correct gate is both: no owned diagnostic and no increase from the remeasured base count.
- Testing only sequential retries would not prove the under-lock latest-visibility guard. The two-pool/two-PREPARED-intent race test was necessary.
- Calling `identity.append_audit_event_internal` from TypeScript would have looked direct but is correctly denied to the runtime role. The new narrow DEFINER wrapper and role tests prevent that shortcut.
- A system key intent without claim metadata would strand orphaned key material. The explicit claim/complete functions, cleanup-role grants, and production reconciler close that path.

## Dead ends avoided or retired

- No fabricated session, step-up grant, or owner publication binding was introduced for system publication.
- No new HTTP reconciliation route or timer was added; the existing cleanup cadence owns both reconcilers.
- No owner transition signature changed, and no owner function was dropped/recreated.
- Product mutants were temporary and restored; final status contained only the nine allowed paths before commit.

## Ranked upgrades by likely token savings

1. **Generate worker commands from packet metadata.** Emit copy-ready absolute `run-suites`, `run-capture`, cwd, log directory, and expected pairs. This removes path guessing and repeated packet rereads. Expected saving: high on every BUILD node.

2. **Add an automated dispatch preflight.** Before coding, compare full typecheck diagnostic fingerprints at the packet base and after a no-op compile, and record constructor/interface consumers for every changed exported type. This would have caught the 16 compatibility diagnostics immediately. Expected saving: high on cross-cutting TypeScript changes.

3. **Ship a reusable embedded-database fixture helper.** It should create a valid user/session/run/execution/served-answer chain through public repository APIs and expose only test-specific IDs. This removes catalog archaeology and brittle hand-written attestations. Expected saving: high for database clusters.

4. **Make RED semantics machine-readable.** A step should declare `expected_pair`, `semantic_state: RED`, and the required failing titles separately from the runner marker. DECISIONS §21 fixes this mission, but the generator should prevent the contradiction. Expected saving: medium-high and eliminates avoidable BLOCKED cycles.

5. **Add dependency-impact hints to packets.** When an exported interface or constructor changes, list known consumers or explicitly prescribe backward-compatible defaults. Expected saving: medium.

6. **State trigger adaptations in the owning migration step.** If a new authorization path intentionally bypasses an existing binding mechanism, name the exact trigger/function that must be narrowly extended and its invariant. Expected saving: medium and improves security review.

The closest “one prompt machine” is a packet generator that performs those preflights, emits executable commands and fixture handles, and fails packet validation when prose, runner semantics, exported-type compatibility, or authorization dependencies disagree.
