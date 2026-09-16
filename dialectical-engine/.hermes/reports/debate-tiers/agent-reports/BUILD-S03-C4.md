# BUILD-S03-C4 case file — ticket `t_f0797f95`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the requested RED contradicted the measured predecessor state

**Cause.** Packet charge 4 required the S24 Free-card RED to report `claude-sonnet-5`, while charge 5 correctly recorded that C1's generated `PLAN_TIER_ROSTERS` already made the unmodified page render `gpt-5.6-luna` + `glm-5.3-flash`. The same contradiction recurred in S35: production admission already read C1's new roster, so a normal new-values refusal case was GREEN before the fixture edit.

**Price.** The first S24 same-value probe consumed one extra captured run (1.4 s), one test rewrite, and the reasoning needed to reject a false RED. S35 avoided a second false event only after applying the same diagnosis. Exact model-token usage is UNVERIFIED because this Codex seat exposes no per-turn token meter; the transcript expansion is visible in two extra mutation setups and their logs.

**What nearly went wrong.** I nearly treated non-zero as the target instead of proving why the assertion failed. The corrected S24 RED used a stale compiled-roster mutant against a current deployment row; the corrected S35 RED used a scoped stale roster mutant against the real admission function. Both frames then showed the retired id and both final cases ran through the intended unmocked/runtime source.

**Upgrade.** Packet generation should compare every requested RED value with the predecessor-base measurement in the same packet and reject equal actual/expected fixtures.

VERDICT add a semantic RED-consistency check to packet-check / CONFIDENCE high / STRONGEST COUNTER: some REDs deliberately use mutants rather than the natural base, so the manifest must label that setup explicitly instead of rejecting it.

## Finding 2 — `run_suites` accepts fuzzy filters but the packet called them suite names

**Cause.** The packet prescribed `<suite>:<passed>:<failed>` without stating that `<suite>` is passed directly to Vitest as a filter. The bare key `api` matched seven files, not `tests/unit/api.test.ts`, and returned 59 passed / 5 failed plus `CLUSTER_RED`. Exact paths produced the required five independent suites and `CLUSTER_GREEN`.

**Price.** One unnecessary runner invocation took 9.2 s and emitted a 271-line, 25,211-byte log; diagnosis required reading the runner and failure trace. The corrected exact-path run took 6.7 s and emitted 136 lines / 13,652 bytes. The larger cost was epistemic: the five out-of-cluster failures looked like a cluster regression until the selector was traced.

**What nearly went wrong.** I nearly reported a product failure in `tests/integration/dev-api-process.test.ts`, a forbidden/out-of-cluster surface, even though the mandated exact five-path command was 73/73 three times.

**Upgrade.** Every packet should pass exact repository paths to `run-suites.sh`; the runner should refuse a selector that yields other than one `Test Files` entry.

VERDICT make exact paths the runner contract and pin `Test Files 1 passed (1)` per pair / CONFIDENCE high / STRONGEST COUNTER: a deliberately aggregated selector may be useful elsewhere, so aggregation should require a separate explicit mode and expected file count.

## Finding 3 — S24's runtime read conflicts with an existing authorization case

**Cause.** The implementation now calls `contractClient.readDeployment()` at `apps/ui/app/new/page.tsx:114`, exactly as S24 requires. Yet `tests/unit/api.test.ts:228` asserts that an ordinary user receives 403 from `/v1/deployment`. The render suite mocks `readDeployment` success, so the cluster cannot prove that a signed-in `/new` user can receive the roster row. On rejection the page retains empty roster arrays.

**Price.** No live-stack run was permitted, so runtime impact is UNVERIFIED. If V's signed-in browser has ordinary-user scope, acceptance steps 2 and 8 will show empty cards and require a cross-surface fix after BUILD. The static evidence cost one allowed-file cross-check; the potential rework costs a review pass and acceptance retry.

**Upgrade.** Add one cross-mount test that exercises the authorization policy used by `/new` for the exact deployment projection, or expose a least-privilege roster projection whose authorization is deliberate.

VERDICT treat the authorization mount as a REV(S03) finding before acceptance / CONFIDENCE medium / STRONGEST COUNTER: V's development session may carry operator scope through UI infrastructure outside this packet's read surface, in which case the call succeeds; that path remains UNVERIFIED here.

## Finding 4 — the packet's line-bounded page surface omitted necessary async state

**Cause.** The packet described the page edit as deleting line 10 and changing the list source at lines 199–210, while PLAN S24 also required the page to call an asynchronous client method. A runtime fetch necessarily adds state and an effect (`page.tsx:83,114-124`); it cannot be implemented only inside the map expression.

**Price.** One extra read of `page.tsx:64-125` was needed to locate the existing effect and preserve its cancellation pattern. No retry resulted, but a strict interpretation of the named block would make the task impossible.

**Upgrade.** A packet that prescribes an asynchronous source should name the state/effect insertion block as an allowed hunk, not only the deleted import and render consumer.

VERDICT derive allowed hunks from the implementation mechanism, not only the old symbol's occurrences / CONFIDENCE high / STRONGEST COUNTER: exhaustive file-level authorization already permitted the edit, so the line annotations may have been intended as hints; the phrase “nothing else in the page moves” made that intent ambiguous.

## Finding 5 — verification happened before the final formatting pass

**Cause.** I ran the first three green cluster repetitions, then found two indentation defects during diff review. Even though the follow-up was formatting-only, evidence-before-claims required another typecheck delta, three full cluster runs, and another suite marker.

**Price.** The avoidable repeat cost about 20 seconds of runner time (three ~3.8 s cluster runs, one 1.7 s typecheck, one 6.7 s suite-marker run) plus five logs. No code retry occurred.

**Upgrade.** Put `git diff --check` and focused diff review before the first three-run gate in the worker execution manifest.

VERDICT make candidate-diff review a hard predecessor of variance runs / CONFIDENCE high / STRONGEST COUNTER: some defects only appear during the first full run and require edits anyway, so the gate still needs a restart rule.

## Repeated token costs and reading-floor evidence

The packet, COMMON, INSTRUCTIONS, full BASELINE, six required skill files and two skill-directed references alone total **1,852 lines / 118,252 bytes**, before the named PLAN, SPEC, DECISIONS, tooling-trap and code ranges. The full BASELINE is 376 lines even though S36 consumes only its typecheck file/count rule; COMMON's own fold records this as an open template issue. Exact input-token count is UNVERIFIED, but these byte and line denominators are measured.

The session repeatedly paid for prose that could be machine fields: allowed paths, exact test paths, expected per-suite counts, predecessor HEAD, RED setup, log destination, and stage list. The skill bodies also repeat protocol laws already duplicated in the packet and COMMON. The content is useful; the repeated serialization is the sink.

**Upgrade.** Generate a compact, machine-readable execution manifest beside the prose packet containing: `base_sha`, `cwd`, exact `read_ranges`, exact `write_paths`, ordered RED events with `natural|mutant` setup, exact verification argv arrays, expected file/test counts, log paths, stage paths and handoff fields. Validate the manifest against PLAN and the current tree before dispatch; render the human packet from it.

VERDICT adopt one execution manifest as the source for packet-check, runner invocation and handoff scaffolding / CONFIDENCE high / STRONGEST COUNTER: generated manifests can encode a wrong architectural decision perfectly, so prose rationale and human review remain necessary.

**Upgrade.** Produce a generated typecheck-baseline excerpt for the assigned lane containing only file/count pairs and the delta rule, while retaining the full BASELINE as the audit source.

VERDICT dispatch a verified excerpt plus its source digest / CONFIDENCE high / STRONGEST COUNTER: excerpts can go stale; the digest and pre-edit re-measure must remain mandatory.

## Dead ends and exact ambiguities

- A deployment fixture with the same Luna/GLM values as C1's compiled roster cannot prove which source rendered the page. It is a change detector with no discriminating input.
- Bare `api` is not a suite identity under Vitest; it is a fuzzy filter.
- Editing `tests/unit/tiers-s02-wire.test.ts` or `tests/unit/api.test.ts` merely because PLAN listed them would add noise: both already derive fixtures from `PLAN_TIER_ROSTERS` and stayed 2/2 and 26/26 without changes.
- Absolute typecheck green is unreachable at this base. The validated checker found 67 diagnostics across 19 BASELINE-pinned files before and after, with file/count diff rc=0.
- The packet says “5 paths” in the cluster row but its later ruling adds `tests/architecture/tiers-s02-rosters.test.ts`, making six authorized code/test paths and five suites. The later ruling is executable; the earlier count is stale.
- The packet's exhaustive write list does not name evidence-log files even though it requires one unique persistent log per run. I kept all logs under `/tmp/debate-tiers-build-s03-c4-01a09bbd/` to avoid crossing the repository write contract.

## Outcome evidence

- Commit: `cc014550` on `slice/tiers-s03`.
- Final cluster runs: 73/73, 73/73, 73/73; `Test Files 5 passed (5)` each.
- Per suite: render 24/24; admission 15/15; wire 2/2; API 26/26; roster architecture 6/6; exact-path marker `CLUSTER_GREEN`.
- S36: base vs final diagnostic file/count diff rc=0; 67 inherited diagnostics in the same 19 files.
- Elapsed from CLAIM timestamp 20:10:05 to committed-clean measurement 20:26:59: 16m54s.
