CODEX REVIEW T3C r3 — CHANGES · comments read through: t3c-r3-2026-09-02
VERDICT: REWORK — r3 is the worker's last lawful round; 2 blocking findings route to V DECISIONS PACKET rows, not r4

# Static review

I read and audited the packet before the rulings, complete ticket, r2 verdict, worker report/self-report, `ca5a3161..332a8eb9` history and diff, all ten r3 records, and the relevant source-to-persistence paths. Per the packet I ran no test, build, provider call, mutation, or mutating Git command.

The shipped composition is correct at the filed tip: `observeProviderTarget` persists nothing, `apps/runner/src/main.ts` calls it without a recorder, and `WalkingSkeletonRunner` records exactly once in the configured-ABSENT, configured-HEALTHY, and unconfigured-ABSENT paths. The filed `M3full` transcript also proves its exact alias-plus-`ProviderProbeRepository` regression typechecks and is caught. That closes the defect in the current product, but not the regression property's coverage: another type-compatible double write still satisfies both replacement assertions.

The r2 B2 evidence defect is closed. `332a8eb91ea465396d8734c8b55290a1d8ab4de3` / tree `fbca6e0a330deafa77dd39e3d2fa7620375945d7` is one content commit after `ca5a3161`; its 15:32:27 EEST commit precedes every r3 gate record. My mechanical comparison found ten r3 logs and zero commit/tree mismatches. The D28 table enumerates all ten. `scaffold.test.ts` has its own full eight-test record, rather than a cluster label. The transcripts report root typecheck exit 0; scaffold violations set-equal to base; F33/F34/provenance 4/4; C1 three times at 16/16; C2 three times at 4/4; all thirteen optional settings passed; four mutants caught; and an empty `packages/judgement` diff.

## Findings

### B1 — the replacement pins still allow an explicit second writer

Files: `tests/architecture/dev-runner-provider-set.test.ts:83-97`; `apps/runner/src/main.ts:114-132`; `apps/runner/src/index.ts:1740-1763`; `packages/providers/src/provider-probe.ts:25-40,59-130`.

Failure scenario: retain the current, approved `@debateai/providers` import and the current call to `observeProviderTarget`, import and construct `ProviderProbeRepository` exactly as the filed `M3full` mutant does, then add one line before the return:

```ts
const observation = await observeProviderTarget({
  target,
  timeoutMs: environment.PROVIDER_PROBE_TIMEOUT_MS,
  fetchImplementation: fetch,
  clock: () => new Date()
});
await providerProbes.record(observation);
```

This is type-compatible: `ProviderProbeObservation` is the documented structural twin of `ProviderProbeRecord`, and `M3full`'s recorded `typecheck exit=0` already establishes that this module can import and construct the repository at the filed tip. The explicit call records the observation once; the runner then records the returned observation again at line 1742 or 1755. Two absent members therefore yield four append-only rows under two evidence IDs—the original B1 wrong outcome.

Both replacement assertions miss it. The providers import still contains `observeProviderTarget` and no `probeTarget`; the claim-time block still contains `observeProviderTarget(` and no `probes:` member. The worker's argument equates “handing a recorder to the probe” with every possible second write, but a direct `record(observation)` is another compilable writer and requires neither forbidden spelling.

V DECISIONS PACKET row `V-T3C-CODEX-R3-1`: choose a typed shipped-composition factory that cannot receive or close over a recorder, or run the exact-cardinality behavioral arm through the production composition seam and mutate an explicit second writer. A fourth worker round is not authorized.

### B2 — J25: the empty-panel refusal is asserted before, not after, persistence

Files: `tests/integration/dev-deployment-register.test.ts:560-590`; `apps/runner/src/index.ts:1767-1771,3496-3511`; `packages/battery/src/index.ts:422-439`; `tests/unit/load01-production-terminal.test.ts:29-36`.

Failure scenario: both configured targets are absent at claim. The lane test directly calls `runner.executeWorkItem`, asserts the returned rejection code `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`, and correctly queries `core.provider_probe` for exactly two ABSENT rows. It never invokes the production Hatchet task wrapper. In production, that wrapper catches the error, maps it to `RUNNER_EXECUTION_FAILED:RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`, and `WorkItemRepository.recordTerminalFailure` persists it to `core.work_item.terminal_reason`. No test asserts this exact refusal at that row or its public run projection. The generic terminal test only asserts a spy call for `NODE_REVIEW_UNAVAILABLE`.

The probe-record half of J25 is closed: the F34 test asserts exact rows in `core.provider_probe`. The partial-panel disclosure is also covered elsewhere by an assertion on the persisted answer projection's `CLAIM_PANEL_REVISED` condition-mark record. The total-refusal half is not: if the production failure-recording composition ceased to persist this refusal, both direct-runner F34 arms would remain green because they stop at the returned exception. J25 expressly says that is not disclosure evidence.

V DECISIONS PACKET row `V-T3C-CODEX-R3-2`: add a production-wrapper acceptance arm that drives the all-absent claim path and asserts `core.work_item.state = 'FAILED'` plus the exact terminal reason, or asserts the same exact value through the served run projection. A fourth worker round is not authorized.

## Packet audit

No packet-owned finding. Both writable paths resolve and are the only authorized deliverables. The base/tip command resolves to the stated single r3 commit; tip, tree, clean porcelain, and zero mode changes match. The report's line-one marker is present, and hashing it with line 2 removed reproduces `15f18276d6591bea5df0fc297531fa53b4bdda893d3e393431491c223e448ee7`. The ten-log inventory, ruling references, final-gate claims, and last-round/V-routing instruction match the artifacts.

## Not independently verified

STATIC-only means the reported TypeScript, Vitest, PostgreSQL, scaffold, and mutant outcomes remain transcript evidence. I did not independently compile the explicit-recorder counterexample or execute the persisted-refusal scenario. I verified their types, writers, control flow, assertion reach, Git identities, timestamps, hashes, and transcript envelopes statically.

## PREDICTIONS

Another lens will probably accept `M3full` as exhaustive because it is buildable and catches the exact alias regression from r2, without testing an explicit `record(observation)` after the permitted observe call. A second likely miss is treating two persisted absence rows as persistence of the run's refusal; those rows explain provider health, while `core.work_item.terminal_reason` carries the refusal state. I would inspect every reachable provider-probe writer first, then assert the all-absent reason through the production run projection.
