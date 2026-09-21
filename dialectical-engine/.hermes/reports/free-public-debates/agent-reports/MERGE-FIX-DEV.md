# MERGE-FIX-DEV self-report — free-public-debates

## Case disposition

The merge is committed on `tmp/merge-dev-2026-09-21` as `df06aedf00d0a8e8020efb790b37db7b0ec72c8b`, with parents `64d052b471c5f61a281ec40b29f7f17dfdff37ce` and `cbf1b281ebe260155a62325bb8b343ae4e7be5b4`. The worktree is clean. No push, second merge, live-database access, listener access, desktop launch, or other-worktree write occurred.

The ruling-confirmed surface was 38 conflict-marker regions across 20 paths. The resolution ledger is 0 regions taken whole from ours, 3 taken from theirs, and 35 hand-combined. That distribution is appropriate: nearly every collision was a joint where the local plan-tier/provider work and the dev algorithm/security work both had to remain executable.

## Conflict-region ledger

| Path | ours | theirs | hand | Resolution evidence |
|---|---:|---:|---:|---|
| `.hermes/TOOLING-TRAPS.md` | 0 | 0 | 1 | H1 retained both independently-added operational traps under their existing headings instead of deleting either side's incident evidence. |
| `acceptance/claude-relay.ts` | 0 | 0 | 1 | H1 kept dev's adapter reuse while accepting the local model/model-alias input needed by the model-config panel. |
| `acceptance/grok-relay.ts` | 0 | 0 | 4 | H1 retained the explicit `read-only`/`none` approval vocabulary; H2 retained automatic fallback when no approval flag is supported; H3 kept model validation in preflight; H4 reused the validated adapter at process start. |
| `acceptance/model-shim.ts` | 0 | 0 | 1 | H1 preserved the test-root guard and forwarded the selected model into the relay preflight. |
| `apps/api/src/provider-discovery.ts` | 0 | 1 | 0 | Theirs was the completed move to the shared provider probe; the clean shared implementation was then repaired from a reader RED to retain local `max_tokens: 64` and Z.AI thinking disablement. |
| `apps/runner/src/dev-api-environment-cli.ts` | 0 | 0 | 1 | H1 kept dev's typed diagnostic mapping and the local file-derived configured-provider fallback. |
| `apps/runner/src/dev-deployment-register-cli.ts` | 0 | 0 | 1 | H1 loads one command environment, derives the models-file panel, validates optional synthesis-role overrides, and passes both to the seeder. |
| `apps/runner/src/dev-deployment-register.ts` | 0 | 0 | 7 | H1 combined plan-tier and algorithm imports; H2 retained the plan-tier roster row beside algorithm rows; H3 made the base row builder accept optional plan rosters; H4 discriminated roster configuration from synthesis-role configuration without dropping either caller; H5 retained historical v4 seeding when no panel is supplied and general publication when a panel is supplied; H6 accepts an already-sealed historical v4 idempotently; H7 keeps plan-tier rosters and algorithm rows in configured-provider-set publications. |
| `apps/runner/src/index.ts` | 0 | 0 | 3 | H1 retained the hardened static observation task and provider execution context; H2 preserved one exact provider-failure occurrence from the gateway without double-emitting it in the runner; H3 retained the dev algorithm execution path while carrying the local provider/model context into observability. |
| `apps/ui/app/debate/[id]/DebatePageClient.tsx` | 0 | 0 | 1 | H1 retained dev's public overview/header flow and added the local AI disclosure and generated-content markers. |
| `apps/ui/app/new/page.tsx` | 0 | 0 | 2 | H1 enables plan-tier/depth/steering controls when the runtime client exposes `readPlanTiers`; H2 preserves the legacy mocked-client path with depth 1 and no unsupported steering wire fields. |
| `apps/ui/components/DebateMap.tsx` | 0 | 0 | 1 | H1 retained dev's model/maker lineage readout and local `data-ai-generated` disclosure marking. |
| `apps/ui/components/VerdictBanner.tsx` | 0 | 0 | 1 | H1 kept dev's verdict-state rendering and the local AI-generated disclosure attribute. |
| `package.json` | 0 | 0 | 1 | H1 retained both the observability CLI script and the algorithm role-evaluation script. |
| `packages/contract/src/index.ts` | 0 | 0 | 1 | H1 exports both the served-root contract and the plan-tier request/response contract. |
| `tests/architecture/dev-deployment-register.test.ts` | 0 | 0 | 2 | H1 pins both algorithm/plan-tier row construction and the historical import path; H2 pins the single closed publication port before receipt custody. |
| `tests/architecture/register-support-publication.test.ts` | 0 | 0 | 1 | H1 retained dev's hostile-static-SQL detector while preserving the local publication-row expectations; follow-up REDs made AST-nested denied SQL unique by file and scoped the sequence ban to the register allocator. |
| `tests/integration/obs-l3-s06-runner-binding.test.ts` | 0 | 0 | 4 | H1 combined the observation/provider imports; H2 retained the exact occurrence context assertion; H3 pins `attempt_count` in the emitted template parameters; H4 asserts exactly one provider-failure occurrence so runner and gateway cannot both emit it. |
| `tests/integration/production-database-principals.test.ts` | 0 | 2 | 0 | The two dev-side regions were the current principal and privilege assertions and required no local-plan-tier adaptation. |
| `tests/integration/register-support-publication.test.ts` | 0 | 0 | 2 | H1 combined the current publication helpers and fixtures; H2 retained both legacy-register readback and dev's expanded publication behavior. |

Totals: **ours 0 / theirs 3 / hand 35 = 38**.

## Clean merged paths repaired from concrete RED evidence

These paths were outside the original 20 but were permitted by the packet only after the merged combination proved them broken:

- `packages/providers/src/provider-probe.ts`: provider-discovery readers showed the shared probe had reverted to `max_tokens: 8` and omitted Z.AI's thinking-disable extension; 23/23 passed after the repair.
- `apps/ui/app/new/defaults.tsx` and `tests/render/tier01-new-plan-tier.test.tsx`: the new-page legacy reader had no plan-tier method while the tier reader required steering defaults; the conditional compatibility path passed 34/34.
- `tests/unit/s1-1-depth-contract.test.ts` and `tests/unit/t17-envelope.test.ts`: adding the now-required plan tier exposed missing tier models; the T17 fixture now advertises the free roster and the direct contract readers pass 46/46.
- `tests/integration/dev-deployment-register.test.ts`: merged source types and historical-v4 behavior invalidated the old fixture; the boot-row regression and complete deployment-register reader batch passed after adaptation.
- `tests/architecture/dev-real-provider-only.test.ts`, `tests/architecture/p2-product-role-policy.test.ts`, and `tests/architecture/p2-recovery-policy-register.test.ts`: string-level source readers were updated to the hand-combined single-environment and single-publication-port form; their focused run passes 9/9.
- `tests/integration/t16-algorithm-register.test.ts`: the dev-only fixture assumed retired provider refs and no models file; it now copies the canonical models file and asserts the complete premium/free provider family map; 25/25 passed with the provider-boundary reader.
- `acceptance/ceremony.test.ts`: the merged `AskRequest` requires a plan tier and tier-matching discovered model IDs; the two-provider ceremony now uses the free roster and passes 2/2.

No existing migration was edited. No new migration was added.

## Verification record

- Install: offline RED was the expected absent Vitest tarball; online `pnpm install --frozen-lockfile` returned rc 0.
- Contract generation: `pnpm generate:contract` returned rc 0.
- Migration convergence: order A (all merged files) and order B (the 11 dev-only filenames ledger-held for pass one, then applied last by the production `migrate`) each applied 84 migrations. Both catalogue snapshots hashed to `8df6a597dc61200f27af0d35697de236b55c9079b0fad53975e04cb3affc94ec`; 0 of 11 catalogue sections differed. The snapshot includes schemas/ACLs, relations/views/RLS, columns/defaults, constraints, indexes, triggers, policies, functions including `prosrc`/ACL/config, types, default privileges, and DebateAI role memberships.
- Boot: `fpd-s01-l1-boot-role-assertions` plus `dev-database-principals` passed 17/17 in order A and 17/17 in order B.
- Conflicted tests: final run passed 5/5 files and 91/91 cases. Local baseline was 3/3, 12/14, 14/14, 32/32, and 25/25; the merged counts are 3/3, 14/14, 15/15, 32/32, and 25/25.
- API auto-publication: 14/14, covering both answer-serving send sites and the trigger-count equality.
- Direct readers: acceptance relays 75/75; provider discovery 23/23; new-page readers 34/34; contract/T17 46/46; direct UI conflict readers 35/35; register combination regressions 25/25; acceptance ceremony 2/2.
- Broad source-reader runs: register readers 18/23 files initially, then every merge-attributable failure was repaired; its remaining P3 census failure is the pre-existing local manifest omission described below. Runner readers were 20/23 initially and 21/23 after repairing the ceremony; UI readers were 21/26. The remaining failures are recorded as findings rather than silently called green.
- TypeScript: the local-side baseline was 70 diagnostics. The merged tree has 13. None names a resolved path and none exists on neither side.
- S01 gate, with measured dev-side expectation moves: run 1 `CLUSTER_GREEN`; run 2 `CLUSTER_GREEN`; run 3 `CLUSTER_GREEN`. The retained known-red contract is `tests/unit/s7-authorization.test.ts` at 30/1.
- Commit verification: clean status; subject and co-author trailer exact; parent count 2; parents are local `64d052b4` and origin/dev `cbf1b281`.

The three gate expectation moves are attributable to origin/dev: `tests/integration/s8-publication-database.test.ts` is 26/0 after `54ce6293`; `tests/architecture/s8-publication-contract.test.ts` is 5/0 after `84f94f17`; `tests/architecture/register-support-publication.test.ts` is 14/0 after `bcb2adb2` and `35dc4c15` plus the merge-specific census reconciliation.

## Findings not hidden by the green merge gate

1. **Local baseline role-manifest drift** — `tests/architecture/p3-production-database-principals.test.ts:540` sees the already-local `debateai_obs_chain_probe_owner` from `migrations/0064_fix09_audit_chain.sql`, but the production manifest omits it. This was not caused by a resolved merge path.
2. **Observation zone guard drift** — `tests/unit/obs-l2-s04-zone.test.ts:178` rejects `obs-capture` before its semantic split in the clean-merged API source. This is outside the allowed merge surface.
3. **Shipped-corpus manifest and detector drift** — `tests/unit/s1-1-depth-contract.test.ts:372`, `:1773`, and `:1777` report 51 incoming files, 3 removed files, and false-positive numeric-domain sites in incoming obs-capture code. The functional depth-bound describe passes 11 cases with 999 skipped, but the repository census needs its own owner.
4. **UI reader debt** — `tests/architecture/role-token-map.test.ts:143`/`:149`, `tests/render/t1-canvas.test.tsx:397`/`:422`, `tests/render/consent-bar.test.tsx:238`, and `tests/unit/v2ui-pages.test.ts:242`/`:323`/`:610` remain red against clean-merged UI areas not owned by these conflict decisions. The resolved DebateMap/Disclosure direct readers are green.
5. **Thirteen repository type diagnostics remain** — `acceptance/obs/subjects/capture-subject.ts:48`; `apps/ui/lib/v3/answerExport.ts:2`; nine Vitest-5 `describe.sequential` sites in FIX integration tests; and `tests/unit/fix09-capture-gate.test.ts:5`/`:10`. The merge reduced the count from 70 and introduced no diagnostic in an owned path.
6. **Incoming whitespace debt** — cached `git diff --check` reports whitespace in incoming historical reports/logs, not in a resolved or exception path. It was preserved because changing historical evidence is forbidden and unrelated.

## Murder-case analysis: where the time and tokens went

### Root cause 1 — the packet's first measurable constant was wrong

The packet said 36 regions while its own per-file vector summed to 38. The worker contract correctly forced a stop, a ticket round trip, and a resumed claim. Price: one blocked pass, two ticket reads, two base-frame measurements, and a context resume before any merge work. Upgrade: packet generation must compute and inject the total from the exact vector, then run a machine check that `sum(per_file) == declared_total == conflict_marker_regions`.

### Root cause 2 — no first-class migration-order harness

`migrate` hardcodes its directory, so proving “ours first, dev eleven last” required a safe ledger-marker harness and a separate exact-test shadow root. Two harness defects were found before product evidence: PostgreSQL 18 rejected grouping raw ACL arrays, and Vitest ignored tests outside its root. Price: two failed probe runs and custom scripts that should be reusable infrastructure. Upgrade: add a supported `migrationDirectory`/migration-name filter to the test-only migration harness, plus a checked-in `assertMigrationOrderConvergence(heldOutNames)` helper that snapshots a canonical catalogue and can run any integration suite against the resulting database.

### Root cause 3 — source-string tests made valid combination refactors look like product failures

The dev-provider, P2 policy, and DEV-05 architecture readers asserted exact call-site spelling. Reusing one command environment and one closed publication port changed spelling without changing the property. I nearly “fixed” this by instantiating a second publication port; the conflicted DEV-05 suite caught the semantic regression (2 RED cases). Price: one 118-second five-suite run plus two focused loops. Upgrade: source-contract tests should parse the AST/dataflow and assert one loader/one port reaching both branches, never exact whitespace or a single textual call expression.

### Root cause 4 — cross-branch fixtures were not contract-built

The T16 CLI fixture omitted `config/models.yaml`; its expected provider refs predated the file-fed premium/free panel. The acceptance ceremony omitted required `plan_tier` and advertised model IDs outside the tier roster. The T17 fixture added the field before adding roster members. Price: four T16 failures and an 86-second rerun, three acceptance ceremony REDs, and nine T17 failures. Upgrade: every ask fixture should be constructed by one typed builder that requires a plan tier and derives a matching discovered panel; every dev CLI test should use one canonical helper that copies `config/models.yaml` and returns its expected refs/rosters.

### Root cause 5 — the requested source-reader sweep was underspecified and noisy

“grep by basename” makes `index.ts` and `page.tsx` enormous, weak selectors. It ran 1,297 UI cases and 1,375 runner cases, then mixed real merge regressions with old corpus, CSS, role-map, and observability-zone debt. Price: several minutes and the largest log/token burden in the session. Upgrade: packet generation should emit a deduplicated exact test list from import edges, record per-side case counts before dispatch, and label allowed known-reds. Generic basenames must require a module-path import match, not a text match.

### Root cause 6 — the gate file could not encode legitimate improvements

The first 21-suite gate run was red only because three origin/dev changes improved expected failures. The packet anticipated moved values but the runner accepts only exact pairs, so the worker had to trace four commits and create a local expectation adapter. Price: one full gate run and commit archaeology. Upgrade: gate entries need `{minimum_passed, allowed_failed_ids}` or an explicit “improvement accepted” mode; count-only expected failures should never turn an upstream fix into `CLUSTER_RED`.

### Root cause 7 — duplicate observability ownership was easy to introduce

The first runner combination emitted the same provider failure in both the wrapper and the gateway. The direct reader caught two occurrences where exactly one is required. Price: one RED loop, but this was high-value. Upgrade: document event ownership beside the gateway interface and expose a single helper that either emits or returns a typed already-emitted failure, preventing wrapper duplication by type.

## Dead ends and near misses worth preserving

- Adding `plan_tier: "free"` to T17 without tier model IDs did not test the depth contract; admission stopped first with `ASK_PLAN_TIER_MODEL_UNAVAILABLE` nine times.
- Sharing one relay for Claude and Grok was insufficient for the acceptance ceremony because claim-time discovery records the relay-reported model, not merely the configured target. Keeping the ceremony at two makers and using the complete free roster was the truthful fix.
- Inlining `createPostgresRegisterPublicationPort(input.adminPool).publishGeneral` satisfied two old clean readers but violated the conflicted single-port property. The port was restored and the readers were updated to the actual invariant.
- A generic `/nextval\s*\(/` census treated unrelated obs sequences as register allocator use. Restricting it to `register_version_id_seq` preserved the intended law.
- Comparing raw `typacl` in a PostgreSQL 18 `GROUP BY` is unsupported because ACL arrays do not share a usable grouping strategy; catalogue snapshots must group the text representation.
- Running Vitest on absolute probe copies without `--root` produces “No test files found”; exact order-B boot tests require the probe shadow as the Vitest root.

## One-prompt-machine upgrades, ordered by leverage

1. Add a packet compiler that validates counts, paths, branch/base hashes, named headings, allowed writes, and generated test lists before dispatch.
2. Add one checked-in merge-joint harness: reconstruct each conflict, record chosen-side/combined classification, run per-side baselines, and render the handoff table automatically.
3. Add canonical typed fixture builders for Ask/plan-tier/discovered-panel and models-file dev CLI tests.
4. Add the migration-order convergence helper and order-B integration runner described above.
5. Replace count-only known-red gates with named-failure contracts and improvement-tolerant expectations.
6. Replace source substring checks with AST/dataflow properties for loaders, ports, route hooks, and ordering.
7. Make probe wrappers standard: log path first, locale fixed, rc/case summary on stdout, catalogue/process cleanup in `finally`, and a machine-readable JSON result beside the human log.

Those upgrades would remove nearly every repeated reasoning loop in this merge while retaining the useful RED-first checks that caught the duplicate event, missing tier models, and second publication-port near miss.
