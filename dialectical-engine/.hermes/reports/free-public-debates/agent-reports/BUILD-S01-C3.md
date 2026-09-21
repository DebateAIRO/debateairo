# BUILD-S01-C3 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The cluster landed as commit `63a97f31`. The final three runs were identical: C3 10/10, S8 4/4, and S7 30/31 with only the expected policy-row failure. Typecheck retained no diagnostic in either C3 path. One new diagnostic belonged to the concurrently written C4 unit test and was not touched.

## Findings, ranked by estimated token savings

### 1. Generate executable oracles from measured responses

**CAUSE:** `PLAN.md:626` labelled the pre-existing malformed-request body EXACT even though `apps/api/src/index.ts:583-585` has long emitted an additional validator `message`. The same plan also retained pre-C2 source anchors at `PLAN.md:614,652`.

**PRICE:** one BLOCKED/RESUME cycle, one orchestrator ruling, three initial RED attempts, about 11 minutes between block and resume, and an estimated 8k–12k transcript tokens reloading the packet, common contract, skills, and ruling context.

**UPGRADE:** packet generation should execute every pre-existing guard at the dispatched lane SHA and paste the response projection into the packet. Freeze semantic anchors as a route plus a nearby source digest, not line numbers alone. Estimated saving: 8k–12k tokens on any packet with a stale oracle.

**VERDICT:** generate guard oracles from lane measurements / **CONFIDENCE:** high / **STRONGEST COUNTER:** measured fixtures can themselves be incomplete, so the packet must retain the requirement-level reason for each guard.

### 2. Make placeholders syntactically distinct from runner arguments

**CAUSE:** the command row used `:U:0`. The runner treats `U` as a literal expected count, not a wildcard. Running the packet text verbatim produced `CLUSTER_RED` although the suite was 10/10.

**PRICE:** one discarded three-suite run, one extra log, and roughly 1k–2k tokens diagnosing and explaining the mismatch.

**UPGRADE:** packet-check should reject non-numeric runner fields in BUILD packets, or render the placeholder as `<MEASURED_PASS_COUNT>` outside the command and require substitution before execution. Estimated saving: 1k–2k tokens per new-suite cluster.

**VERDICT:** forbid `U` inside executable command strings / **CONFIDENCE:** high / **STRONGEST COUNTER:** a human-readable placeholder is compact, but compactness is not worth a command that deterministically reports RED.

### 3. Restore mutants by expected diff, not status alone

**CAUSE:** the refutation contract asks for `git status --porcelain` after restore. Because `index.ts` already carried the intended uncommitted change, status remained `M` whether a temporary mutant was present or not. A generic action-string patch hit the earlier publish handler; its inverse then swapped the publish and unpublish action literals. The first R-13 mutant consequently landed in the wrong branch and stayed GREEN.

**PRICE:** one invalid R-13 mutant run, one full-suite restore audit, multiple corrective patches, and an estimated 4k–7k tokens. This was the most dangerous near-miss: status complied with the protocol while failing to prove the mutant was gone.

**UPGRADE:** the repository-supplied mutation harness should snapshot the allowed-file diff before each mutant and require byte-identical restoration afterward. A mutant declaration should include a unique semantic anchor and fail when it matches zero or multiple sites. Estimated saving: 4k–7k tokens here and substantially lower wrong-commit risk.

**VERDICT:** gate mutant restore on diff identity / **CONFIDENCE:** high / **STRONGEST COUNTER:** byte-identical diff checks add machinery, but status-only evidence cannot establish restoration in an already-dirty product file.

### 4. Authorize every reference implementation the plan tells BUILD to follow

**CAUSE:** `PLAN.md:618` says the C3 test uses `buildApi` as `tests/unit/s8-publication-http.test.ts` does, but that file is not in the packet’s read allowlist. I reconstructed the harness from the full allowed `index.ts`, including opaque casts for imported interfaces.

**PRICE:** an estimated 3k–5k tokens of harness construction and one typecheck correction for Fastify’s exact-optional `headers` overload.

**UPGRADE:** add every named reference implementation to a read-only allowlist, or embed the minimal approved harness shape in the plan. Estimated saving: 3k–5k tokens for this cluster.

**VERDICT:** make named examples readable / **CONFIDENCE:** high / **STRONGEST COUNTER:** wider reading can inflate context, so the permission should be limited to the named file and relevant block.

### 5. Preserve resumed-session state without replaying immutable contracts

**CAUSE:** resume instructions required re-reading the full packet, COMMON, and all six skill bodies even though this was the same transcript and only DECISIONS §22 had changed.

**PRICE:** estimated 10k–15k repeated input tokens with no change in operative rules.

**UPGRADE:** stamp hashes of loaded packet/skill bodies in CLAIM/BLOCKED. On same-session resume, require only changed-hash bodies plus the ruling. Estimated saving: 10k–15k tokens per blocked resume.

**VERDICT:** hash-gate resume rereads / **CONFIDENCE:** medium / **STRONGEST COUNTER:** unconditional rereads protect against silent file edits, which is why the hash comparison must be machine-enforced rather than trusted to memory.

## Dead ends and near misses

- A route-local malformed-body branch was rejected by DECISIONS §22; implementing it would have changed behavior outside the feature requirement.
- Literal `U` is not accepted by `run-suites.sh` as a wildcard.
- `git status --porcelain` cannot prove a mutant is absent when the same file contains the intended uncommitted implementation.
- I nearly committed swapped `PUBLISH`/`UNPUBLISH` preflight actions. A full allowed-file diff audit exposed and removed the mutant before the final runs.
- The final global typecheck count was 71 rather than the recorded 70 because `tests/unit/fpd-s01-c4-erasure-http.test.ts:82` added one sibling diagnostic. The C3 allowed-path delta was zero.

## Packet clarity

The packet was precise about branch, write boundaries, sibling paths, grant ordering, and the three-run gate. The unclear points were exactly `PLAN.md:626` (stale EXACT body), `PLAN.md:614,652` (stale line anchors), `PLAN.md:618` (forbidden named example), and the executable-looking `:U:0` placeholder. DECISIONS §22 resolved the first two without broadening product scope.
