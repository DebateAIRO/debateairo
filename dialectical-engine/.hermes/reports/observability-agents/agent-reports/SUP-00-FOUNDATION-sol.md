SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:receiving-code-review, superpowers:verification-before-completion

# READY FOR PEER REVIEW — SUP-00-FOUNDATION REWORK ROUND 1

## Identity and authority

- Worker/session: `/root/sup00_foundation` (the launch packet left `owner.session: pending`; no board-write surface was authorized).
- Ticket: `SUP-00-FOUNDATION`; same worker/session; authority epoch `1`; rework round `1`; human review `yes`.
- Branch/worktree: `slice/oa-sup-01` at `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-sup-01/dialectical-engine`.
- Measured pre-edit commit: `2b670d30 chore: checkpoint local development state`; pre-edit `git status --short` was empty.
- No commit, push, merge, branch, worktree, external, destructive, or database operation was performed.
- Authority hashes at rework start and immediately before editing were identical:
  - packet: `04a1d8401b3e34e023b4abb64841b06167c3d971d4f7cf3abf636a88ad112f8b`
  - Task-0 brief: `4d1daa2133ce9786fc9677ee34fda75b0ec466a4bbbd34e432f828816ca7afdc`
  - PLAN-SupportAgent: `c831e3109fc2e2736406d0f2cdcfc13508a0298c4a6c740bfa1ec86c26285132`
  - rework verdict: `732abf33f66812e0ded0a9bfd3dca02181218d51323367b136ce19fb7b486422`
- comments read through: `not-ticketed/user-request-2026-09-02` plus `sup-00-foundation-grok-verdict.md` / rework dispatch 2026-09-03.

## Exact allocation — VAL-SUP-00-003

| Slice | Product migration | Reserved filename |
|---|---|---|
| SUP-01 | `support_foundation` | `0050_support_foundation.sql` |
| SUP-02 | `support_cases` | `0051_support_cases.sql` |
| SUP-03 | `support_tool_calls` | `0052_support_tool_calls.sql` |
| SUP-05 | `support_public_incident` | `0053_support_public_incident.sql` |
| SUP-07 | `support_keys_audit` | `0054_support_keys_audit.sql` |

Corrected collision basis: the committed assigned lane contains migrations through `0049_terminal_recorded_facts.sql`, including existing ObservationAgent `0034_obs_foundation.sql` and `0035_mfa_enrollment.sql`. The main requirements tree now records Support `0050`-`0054`, WAR-PLAN `0056` reserved, and OBS `0057_observation_foundation.sql`, `0058_observation_safe_views.sql`, `0059_observation_pg_monitor.sql`, `0060_observation_throughput_views.sql`. `FIX-01/DECISIONS.md:18` still carries the stale historical statement that `0035` is reserved and unclaimed. The retained Support range was above committed file maximum `0049` when selected and is disjoint from every named current allocation; the earlier claim that it was above every current numeric allocation was false after the later OBS allocations landed in the requirements tree.

Command:

```text
ls migrations | tail -3
```

Output:

```text
0047_passkey_credential_storage.sql
0048_provider_probe_capability.sql
0049_terminal_recorded_facts.sql
```

Allocation decision sources and append-only corrections:

- `docs/missions/observability-agents/slices/SUP-01/DECISIONS.md:15,19`
- `docs/missions/observability-agents/slices/SUP-02/DECISIONS.md:14-15`
- `docs/missions/observability-agents/slices/SUP-03/DECISIONS.md:14-15`
- `docs/missions/observability-agents/slices/SUP-05/DECISIONS.md:13-14`
- `docs/missions/observability-agents/slices/SUP-07/DECISIONS.md:14-15`

## Foundation fact 1 — architecture grep empty; unit equality pin present

Command, run from the assigned worktree:

```text
rg -n "contractInventory|authorizationPolicyInventory" tests/architecture
```

Exact result: exit code `1`, stdout empty, stderr empty. There is no such assertion under `tests/architecture`, but the property is already pinned at `tests/unit/s7-authorization.test.ts:131-137`. That test requires duplicate-free lists, equal lengths, exact set equality between `authorizationPolicyInventory.map(policy => policy.route)` and `contractInventory.routes`, and exact equality of `authorizationPolicyInventory` to `EXPECTED_AUTHORIZATION_MATRIX`. The correction is appended at `docs/missions/observability-agents/slices/SUP-01/DECISIONS.md:18`; the prior line 16 remains as superseded history.

## Foundation fact 2 — sealed register rows are seed-only/restart-required

There is no lawful in-place effective-within-five-seconds mutation path in the inspected register implementation:

- `migrations/0000_s00.sql:275-287` defines version-keyed rows and a sealed version record.
- `migrations/0000_s00.sql:312` revokes UPDATE/DELETE on both register tables from runtime/public.
- `migrations/0000_s00.sql:323-329` attaches `core.reject_mutation()` before UPDATE or DELETE to both register tables.
- `packages/register/src/index.ts:467-546` provides the production bootstrap seed-and-seal path, `persistBootstrapRegister`.
- `packages/register/src/index.ts:509-522` refuses an already-present version unless its sealed rows exactly equal the seed, throwing `FX-REG-SEALED_VERSION_MISMATCH` on drift.
- `packages/register/src/index.ts:527-537` inserts rows and seals only a previously absent version.
- `apps/runner/src/dev-deployment-register.ts:257-273,362-388` provides `seedDevelopmentDeploymentRegister`, using `insertAndSeal` for an absent development version and validating the exact sealed state.
- `acceptance/seed-register.ts:275-325` provides `seedAcceptanceRegister`, inserting the acceptance seed, sealing it, and rejecting any persisted conflict.
- `packages/register/src/runtime-environment.ts:96-98` selects `REGISTER_VERSION` for the API environment; `:174-178` does the same for runner consumers.

All three known writers are seed-and-seal-only sites; none is an in-place or reload mechanism. Lawful current path: add the desired support rows to a new bootstrap register version, publish that absent version, and restart API/runner consumers with `REGISTER_VERSION` selecting it. Direct insertion into a sealed version is not a lawful workaround because it makes sealed `row_count` disagree with contents and the seed validators reject the conflict. Thus SUP-01-R08's `support:switch`/`support:limits` within five seconds without restart still requires a proposed SPEC v2 and V decision. The writer-scope correction is appended at `docs/missions/observability-agents/slices/SUP-01/DECISIONS.md:20`; line 17 remains as superseded history.

## Rework round 1 verification

A single inline Node harness ran these exact relevant probes and assertions three times from the assigned worktree:

```text
rg -n "contractInventory|authorizationPolicyInventory" tests/architecture
sed -n '131,137p' tests/unit/s7-authorization.test.ts
rg -n "persistBootstrapRegister|seedDevelopmentDeploymentRegister|seedAcceptanceRegister" packages/register/src/index.ts apps/runner/src/dev-deployment-register.ts acceptance/seed-register.ts
git diff --numstat -- docs/missions/observability-agents/slices/SUP-01/DECISIONS.md docs/missions/observability-agents/slices/SUP-02/DECISIONS.md docs/missions/observability-agents/slices/SUP-03/DECISIONS.md docs/missions/observability-agents/slices/SUP-05/DECISIONS.md docs/missions/observability-agents/slices/SUP-07/DECISIONS.md
```

The harness also read the exact current allocation rows in main-tree `OBS-01/DECISIONS.md:19`, `OBS-03/DECISIONS.md:17`, `OBS-05/DECISIONS.md:17`, and `OBS-06/DECISIONS.md:19`; checked all five retained Support filenames and dated corrections; confirmed numeric migration-file maximum `0049`; and required the corrected report text.

```text
run 1: PASS architecture_rg_exit=1 architecture_stdout="" unit_equality_pin=true allocation_set=0034,0050-0054,0056-0060 allocations_current=true writer_sites=3_seed_and_seal writer_probe=true append_only=true max_existing=0049 report_corrected=true
run 2: PASS architecture_rg_exit=1 architecture_stdout="" unit_equality_pin=true allocation_set=0034,0050-0054,0056-0060 allocations_current=true writer_sites=3_seed_and_seal writer_probe=true append_only=true max_existing=0049 report_corrected=true
run 3: PASS architecture_rg_exit=1 architecture_stdout="" unit_equality_pin=true allocation_set=0034,0050-0054,0056-0060 allocations_current=true writer_sites=3_seed_and_seal writer_probe=true append_only=true max_existing=0049 report_corrected=true
```

`git diff --check` then exited `0` with empty output. Final `shasum -a 256` reproduced all four authority hashes exactly:

```text
04a1d8401b3e34e023b4abb64841b06167c3d971d4f7cf3abf636a88ad112f8b  sup-00-foundation-packet.md
4d1daa2133ce9786fc9677ee34fda75b0ec466a4bbbd34e432f828816ca7afdc  task-0-brief.md
c831e3109fc2e2736406d0f2cdcfc13508a0298c4a6c740bfa1ec86c26285132  PLAN-SupportAgent.md
732abf33f66812e0ded0a9bfd3dca02181218d51323367b136ce19fb7b486422  sup-00-foundation-grok-verdict.md
```

No production code, executable behavior, or test assertion changed, so TDD RED/GREEN and assertion-mutant refutation remain inapplicable to this append-only documentation correction. Worst run: PASS (3/3).

## Files changed

- `docs/missions/observability-agents/slices/SUP-01/DECISIONS.md`
- `docs/missions/observability-agents/slices/SUP-02/DECISIONS.md`
- `docs/missions/observability-agents/slices/SUP-03/DECISIONS.md`
- `docs/missions/observability-agents/slices/SUP-05/DECISIONS.md`
- `docs/missions/observability-agents/slices/SUP-07/DECISIONS.md`
- `.hermes/reports/observability-agents/agent-reports/SUP-00-FOUNDATION-sol.md`

SUP-04 and SUP-06 were intentionally unchanged because Task 0 assigns them no migration and neither measured fact governs their slice.

Final `git status --short` also showed concurrent `SUP-00-KB-sol.md`, `SUP-00-EVAL-sol.md`, `packages/support-kb/`, and `tests/support-eval/` untracked paths. Those are outside this packet's contract, were not read or touched by this seat, and are excluded from the files-changed list above.

## Packet defects and unexpected findings

- `owner.session` is `pending`, but the heartbeat worker contract requires a concrete session at claim. The only durable identity available in this harness is `/root/sup00_foundation`; no ticket/board mutation surface was in the packet.
- The packet's VAL-SUP-00-004 probe and readonly contract stop at `tests/architecture/**`, excluding the actual equality pin in `tests/unit/s7-authorization.test.ts:131-137`. The narrow command was accurately reported, but the first-pass conclusion over-generalized it.
- The worker contract requires mission INSTRUCTIONS, slice SPEC/PLAN, and `.hermes/TOOLING-TRAPS.md`, but the packet's exhaustive readonly list omits them and declares all other files forbidden. The packet instead identifies Task-0 brief and PLAN-SupportAgent as the immediate upstream artifacts; those were followed without crossing the contract.
- The worker role floor names TDD, systematic debugging, verification, and review-reception skills, while the packet's explicit load list names only verification among those Superpowers skills. All role-floor skills were loaded; TDD is non-operative because this ticket changes only append-only decisions and a report.
- The current migration corpus already has two `0025_` filenames. This pre-existing duplicate prefix does not affect the new contiguous range, but shows that filename-prefix uniqueness was historically unenforced.
- `FIX-01/DECISIONS.md:18` claims `0035` is reserved and not claimed, while current lane migration `0035_mfa_enrollment.sql` exists. The stale decision did not collide with `0050`-`0054`, but later allocation automation must measure files rather than trust that line.
- Two out-of-contract untracked trees appeared concurrently after the clean pre-edit status: `packages/support-kb/` and `tests/support-eval/`. Their writers should preserve ownership separation during peer review; this seat did not inspect them.
- The first multi-file patch attempt failed because its SUP-07 context assumed a non-existent final decision line. The failure was atomic; `git status --short` remained empty. Reading exact tails identified the cause, and the corrected append succeeded.

## Self-report — murder-case file

1. Root cause of most token spend: three broad evidence reads mixed huge files into one output, so the tool truncated before the decisive lines.
2. Price: the protocol/plan read reported 10,310 source tokens; the broad register/migration grep reported more than 50,000; the all-decisions concatenation reported 26,842. Each forced a narrow rerun.
3. Upgrade: launch packets should include a generated migration-allocation manifest (`filename`, prefix, owning slice, source hash) and the exact narrow source windows needed for each foundation fact.
4. Upgrade: provide one checked-in or packet-embedded deterministic VAL-SUP-00 verifier command; this seat had to author an inline structural verifier and then restate it in prose.
5. Rework root cause: the allocation scan found early pending OBS rows but failed to treat later append-only rows in the same files as superseding current facts; the result was accurate history reported as current law.
6. Upgrade: make migration reservations a canonical append-only table consumed by all plans; prose DECISIONS files can project it rather than independently becoming stale.
7. Near miss: a raw SQL INSERT into an already sealed register version is physically possible because the trigger covers UPDATE/DELETE, not INSERT. Treating that as lawful would corrupt sealed `row_count` equality; the bootstrap code proves it rejects that state.
8. Upgrade: enforce sealed-version immutability on INSERT at the database layer, or publish a version-creation API with an atomic current-version indirection and polling contract if five-second switches are required.
9. Dead end: grepping every migration for generic `update|insert|version` produced tens of thousands of irrelevant hits. Restricting the search to `packages/register/src` and exact `register.register_*` statements settled the write-path question.
10. Near miss: the first patch used remembered SUP-07 context. Exact-tail inspection before every append should be packet boilerplate, not an operator habit.
11. Upgrade: documentation-only foundation tickets should explicitly waive code-oriented RED/mutant duties while retaining three-run structural verification; ambiguity here caused extra skill and applicability analysis.
12. Upgrade: populate `owner.session` before dispatch and give the packet a durable claim/comment write surface, or explicitly declare that the parent orchestrator owns those state writes.
13. One-prompt-machine improvement: preflight should reject packets whose required worker reads are outside `readonly`, whose authority hashes are absent, or whose decision facts disagree with the current lane filenames.
14. One-prompt-machine improvement: freeze and attach a `measurement_snapshot` containing HEAD, clean-status digest, sorted migration tail, pending allocations, and relevant source-line hashes; workers then verify drift rather than rediscover the universe.
15. Rework cost: a second review round, five new correction rows, and a full report rewrite were required because the packet's search surface was narrower than the semantic question and the first pass did not label that limitation.
16. Upgrade: evidence requests should distinguish “no match under the authorized path” from “repository-wide absence”; generated reports should prohibit converting the former into the latter.
17. Upgrade: append-only decision readers must select the last applicable row per question before summarizing; matching the first row is historical retrieval, not current-state measurement.
18. Near miss corrected: `persistBootstrapRegister` looked unique only because the first-pass search stayed inside `packages/register/src`; development and acceptance seeders live outside that directory and implement the same seed-and-seal pattern.

READY FOR PEER REVIEW
