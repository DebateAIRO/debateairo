CODEX REVIEW T3C r1 — CHANGES · comments read through: t3c-r1-2026-09-02
VERDICT: REWORK — filing r1 = rework 0/3; 4 blocking findings

# Static review

Reviewed the packet first, then J12, J16(b), J19–J21, D24 plus addenda, D27, D28, F33/F34, the complete `e040b1ee..056e2784` diff, the worker report/self-report, and the T3C logs. Per packet, I ran no test, build, install, provider, or mutating Git command.

The product trace supports the central wiring claims: `readDevelopmentRunnerPolicy` reads T16's verdict-label and panel families and extends the existing provenance check; `main.ts` passes `panelPolicy`; the J12 gate at `apps/runner/src/index.ts:1597-1606` precedes the claim-time probe and provider gateways. The moved `probeTarget` body preserves the API implementation, `packages/providers/package.json` adds no dependency, apps/api keeps the same call shape, and the base/T3C scaffold violation files are byte-identical (`187657ab…`). `PROVIDER_PROBE_TIMEOUT_MS` is accepted as the same key/shape/default explicitly authorized by J21 addendum; extracting a shared schema constant would be optional cleanup, not a finding.

The read-facade provenance test is discriminating for this lane: it substitutes the `dispersionScale` row returned by the real T16 reader, the widened panel-source check rejects it, and M4 removes precisely that widened branch. Static inspection of M2 and M4 confirms literal NEW tokens, `pre=0`, `applied=1`, `restored=0`, mutation diffs, equal before/after hashes, and empty post-restore porcelain.

## Findings

### B1 — one claim-time probe is persisted twice, and the filed assertion hides it

Files: `apps/runner/src/main.ts:121-127`; `packages/providers/src/provider-probe.ts:53-54,113-114`; `apps/runner/src/index.ts:1723-1763`; `tests/integration/dev-deployment-register.test.ts:568-579`.

Failure scenario: use the filed two-member panel and closed targets. `probeTarget` creates one `probeEvidenceRef` per network probe and persists each observation through `providerProbes.record`. The runner then persists the returned ABSENT state again with a new random UUID; the HEALTHY arm has the same double-write. Two actual re-probes therefore produce four append-only `core.provider_probe` rows and four independent-looking probe IDs. That contradicts DR-182's one immediate re-probe/recorded evidence model and the test/report claim of one row per member.

The test discovered the cardinality problem, but `SELECT DISTINCT provider_ref` erases it from the assertion. Fix the composition so exactly one layer owns persistence while retaining the single J21 probe implementation, then assert exact row count and identities rather than deduplicated membership.

### B2 — F34 did not satisfy the binding RED-first condition

File: `agent-reports/t3c-panel-policy.md:118-121`; evidence: `logs/t3c/t3c-mut-M2-claimTimeProbe-entrypoint.log`.

The worker states that the entry-point assertion and wiring were written in the same pass and that no pre-implementation RED exists. M2 is useful failure-direction evidence and proves the final source assertion discriminates, but it is not chronologically RED-before-GREEN. J20 expressly required RED first, and heartbeat §2.5 makes that ordering binding. For this wiring shape the late mutant is not an adequate substitute absent an explicit judge/V exception; the historical ordering cannot be rewritten by calling the evidence equivalent.

### B3 — the filed “committed tip” verification violates D27

Files: `agent-reports/t3c-panel-policy.md:82-97`; `logs/t3c/root-typecheck-precommit.log:1-4`; `logs/t3c/f33-f34-GREEN.log:1-2`; `logs/t3c/clusters-three-runs.log:1-4`.

Commit `056e2784` was created at 14:32:17 EEST with tree `f0c8ee9f4b1e2ee80e8160df364b2ef08bf7a96d`. The typecheck record is explicitly pre-commit at 14:20, and the first GREEN record begins at 14:26, yet both are presented under “Verification at the committed tip.” Later cluster runs stamp the commit and cleanliness but omit the required tree ID; they also do not replace the missing post-commit root typecheck record. D27 says every gate runs after the one content commit and every record stamps both commit and tree. Re-run the complete required gate set after the final content commit and stamp both identifiers in each record; any content change resets that sequence.

### B4 — the closure enumeration and self-report describe the pre-F34 tree

Files: `logs/t3c/class-sweep.log:1-40`; `agent-reports/t3c-panel-policy.md:22-24,143-146`; `agent-reports/t3c-panel-policy-self.md:49-55`.

J20 makes the optional-settings sweep log a closure gate and D28 requires the published enumeration after this repeated class. The cited sweep is explicitly based on `e040b1ee`, says `claimTimeProbe NO`, and ends “NOT FIXED HERE,” while the final report says that same log proves all thirteen are now passed. The self-report likewise says the product diff is two files and `packages/register` is untouched, but the filed diff is eight files and changes `packages/register/src/runtime-environment.ts`. Publish a final-tip enumeration with every member's current disposition and correct the report/self-report before recomputing the D21 hash.

## Packet audit

No packet-owned finding. Both writable paths resolve; the base/tip, clean state, mode-change count 0, eight-file `+540/-80` stat, and ruling references match. The report hash is also valid under D21's convention: hashing the report with line 2 removed yields the filed `1f46e1c9…` value.

## Not independently verified

Because this seat was STATIC-only, I did not rerun typecheck, Vitest, PostgreSQL fixtures, scaffold gates, or mutants and make no fresh runtime-green claim. Runtime outcomes remain transcript evidence; the source ordering, hashes, diffs, and transcript admissibility checks above are independently static.

## PREDICTIONS

Another lens will probably focus on the broad `startsWith` provenance boundary or accept the clean-tip mutant as sufficient RED. I expect the more consequential miss to be the probe double-write: the worker noticed it, called the query defective, and deduplicated the assertion, making the append-only history look correct without restoring the one-probe/one-record property. I would check that invariant before any other rework item.
