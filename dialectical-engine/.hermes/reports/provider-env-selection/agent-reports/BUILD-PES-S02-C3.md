# BUILD-PES-S02-C3 — case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Delivered commit `dfef0de943a8fd6f9df09194c102325017289aa4` on `slice/provider-env-selection-s02`, four allowed paths, clean lane. Coding reached the commit at 14:47:23 +0300 on 2026-09-25: 13m51s after the measured START date, 14m55s after the rollout began. No implementation retry was needed: the planned 0/8 RED became 8/8 on the first implementation run. Eighteen behavior mutants failed, all restores passed, and three preserving neighbours passed. FAIL, UNVERIFIED and a thrown run each exited 1 through real pnpm; changing the CLI to exit 0 broke that oracle in all three cases.

## Ranked upgrades, by likely tokens saved

1. **Bound output before batching reads.** Cause: I batched long files and printed an entire session metadata record and START log. The orchestration output cap truncated combined output, requiring targeted re-reads. This was my execution mistake, not missing source. Price: several redundant read calls and roughly several thousand repeated output tokens; exact per-finding tokens are not available. The total meter sampled before filing this report was 4,484,863 cumulative input tokens, 4,336,896 cached input tokens, 26,454 output tokens, 6,404 reasoning output tokens, total 4,511,317. These are cumulative API usage, not unique document size. VERDICT: select only session_id/cwd from session metadata and only required summary lines from evidence; split long document reads below the tool output limit / CONFIDENCE high / STRONGEST COUNTER: excessive splitting also creates repeated context input. Size-aware batches, not one file per call, address both costs.

2. **Name the actual C3 reading range and dependency contract.** Cause: `packets/BUILD-S02-C3.md:10` labels `PLAN.md:281-632` the §6 preamble/guard chain. That range is 352 lines and includes the full C1 and C2 steps; C3's guard chain is at `PLAN.md:649-659`. I followed the explicit packet. This is a reading-scope defect, not a contradiction in an executable C3 step. Price: several thousand source tokens and additional reading during the roughly first four minutes of intake; no implementation retry. VERDICT: list §6's short preamble, C2's exported contract, C3's chain and C3 steps separately / CONFIDENCE high / STRONGEST COUNTER: C3 must understand C2's TLS/DNS side effects; keep that concrete dependency contract, rather than dropping C2 entirely.

3. **Keep exact exit-code probes beside the exact CLI gate.** Cause: an outcome assertion and a source-line gate alone do not execute pnpm's stream/trailer behavior. I used temporary local module defaults and the real CLI, with the repository capture runner, to measure FAIL, UNVERIFIED and thrown paths and their exit-0 mutants. Price: nine short CLI invocations, plus source restoration evidence; no product changes beyond the planned block. VERDICT: reuse these bounded probes at REV rather than re-deriving them / CONFIDENCE high / STRONGEST COUNTER: repeated public DNS probes can return UNVERIFIED offline; the missing-openssl branch has no DNS dependency, and the suite still uses the required callback stub.

## Nearly wrong and dead ends

- `rg` is unavailable on the configured PATH. One failed discovery call (exit 127); I switched to find/grep without installing anything.
- I nearly treated a missing C3 suite as RED. The runner correctly says BROKEN until S16/S17 create the module and cases; the separate NOT_IMPLEMENTED run is the actual RED.
- Untracked files are invisible to ordinary git grep. V5 was executed after explicit staging of the four C3 paths, after the third GREEN, so it could see the whole new surface.
- Do not read a passing capture-runner rc as a suite verdict. All 18 mutants, 18 restores, three neighbours, three neighbour restores and the final runs were checked against the printed CLUSTER marker.
- A broad repository test command would run the forbidden support-config-principals suite. It was not used; REV owns PLAN §4 V2's exact regression list.
- The exclusion-only `55432` literal is lawful under the binding `DECISIONS.md:142` fold. Treating the raw V5(e) text as authoritative without that fold would produce a false blocker.

## Boundaries and residual verification

No scope expansion, install, push, merge, board state change, database connection, real credential, or desktop action. The underlying hosted guards, mode resolver, sealed row shape, custody reader, discovery code and lockfile have empty base diffs with matching tracked-path controls. The only inherited typecheck diagnostic remains `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`; none names C3. Public DNS and the TLS acceptance passed on this Mac. Signal interruption and a never-calling DNS resolver remain the recorded design limits (no new claim is made about them).

Evidence: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S02-C3`. The per-mutant JSON includes exact failing case names; restore logs preserve all 24 status frames. The final self-contained handoff is `READY.md` in that directory.
