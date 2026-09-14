# BASE evidence — support-conversation-20260914

Measured 2026-09-14 in session `01a09ef2-30b5-7ee2-b12d-0599616d139a` (`CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, native agent `/root/baseline`).

## Frozen lane

- Source Git root: `/Users/vladmihaimiron/Documents/DebateAIRO`
- Source project: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
- Source branch and HEAD: `integration/debate-tiers` at `446c685e977104ecf2b0b5ee0519f7123968429f`
- Ignore proof: `git -C .. check-ignore -v dialectical-engine/.worktrees/support-conversation-cp1` returned `.gitignore:3:.worktrees/`.
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1`
- Project in worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine`
- Branch: `codex/support-conversation-cp1`
- Baseline commit: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Commit delta: 12 files, 478 insertions, 48 deletions. Worktree porcelain after contract generation and tests: empty.

The lane was created from the exact source HEAD and then populated by copying the selected current working-tree files into the lane. The original index was never used for staging and remained empty.

## Inclusion, exclusion and attribution

Ten tracked modifications were attributed to the existing live working-tree diff against `446c685e`; two untracked evaluator tests were attributed to the current product work because they are under `tests/unit/` and explicitly cover the evaluator integration. No package configuration was changed at capture time.

| Attribution | Path | SHA256 in source and lane |
|---|---|---|
| tracked current product change | `dialectical-engine/apps/api/src/index.ts` | `09fb43043584e1d5a13bbd29a804e161ebbbe4c955381c48b6c6b6e6c494dbee` |
| tracked current product change | `dialectical-engine/apps/ui/components/NodeDetailDrawer.tsx` | `f98af10f5f434ba80a55dff52e759f3b3be8ba713d28d98e5ac0d1b8bbe66888` |
| tracked current product change | `dialectical-engine/apps/ui/lib/v3/adapter.ts` | `39151432de933de782e77b94a130427ac49760c2c78e0a3fa97c9f2f1cf72966` |
| tracked current test change | `dialectical-engine/tests/architecture/dev-database-principals.test.ts` | `b024de41b0f2ba289040e9a66b550f1f31177fe38e9ca3c667a420ae96617ec7` |
| tracked current test change | `dialectical-engine/tests/integration/dev-api-environment.test.ts` | `bfab7d8cd289a521dac5c0b67c26efc74a6b78c287a1cf28257c75d87dfc2dce` |
| tracked current test change | `dialectical-engine/tests/integration/dev-api-process.test.ts` | `09b8fd6eb1c8f9c88ec0be9df49f5ae42d5dd223fd133120e9180504c5dcd398` |
| tracked current test change | `dialectical-engine/tests/integration/dev-database-principals.test.ts` | `3e73802ef33212ac0acb953c71a705ddb8d42ab9737b049f4a7e3fa535a3c9e8` |
| tracked current test change | `dialectical-engine/tests/integration/dev-ui-process.test.ts` | `999888473bd9bc4525fe21552ab8e0cbddc2633773ec0b068a6c5dd1dfe650b5` |
| tracked current test change | `dialectical-engine/tests/unit/evaluator-profiles.test.ts` | `786d4ed842d237ae6060dd26716ea16112b1575227cb8e658477c29d97517a1e` |
| tracked current test change | `dialectical-engine/tests/unit/v2ui-data-layer.test.ts` | `4193cca4eeac410f5c0d918c1ae8095a1d43fe1f539da2e2d097a1e27e1366e4` |
| untracked current evaluator test | `dialectical-engine/tests/unit/dev-evaluator-process.test.ts` | `339e4af41868a298522e845f81d77415cacfe87ce68d4ca40de1da1994859f3f` |
| untracked current evaluator test | `dialectical-engine/tests/unit/evaluator-rankings-api.test.ts` | `43e9ac5830f6c08bd04c7e8e49d5c4ea23b8770870b589ca2f8b3250c8b35aa8` |

Excluded from the lane commit: every `.env`/secret/credential file; all logs and process markers; `.hermes/**`; every mission document; root-level `docs/**` and `ui_designs/**`; all unrelated observability/debate-tiers work; and all untracked files outside the two named evaluator tests. `node_modules` was prepared locally but is ignored and absent from the commit.

The supplied support sources remain read-only at their absolute main-tree paths and were not swept into the commit:

- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/research/2026-09-14-support-agent-audit.md`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/research/2026-09-14-support-agent-product-map.md`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/superpowers/plans/2026-09-14-support-agent-conversation.md`

## Dependency and contract preparation

The root 923 MB `node_modules` tree and 31 workspace `node_modules` trees were copied with APFS clone semantics (`cp -cR`) into the lane. No symlink points back to the original writable package tree. Full command output: `logs/BASE-node-modules-copy.log`, SHA256 `c912db560bbf52847b88d9cc358f0f07075f085502db3fe9f2817ca20c81887c`.

Exact contract command:

```text
LOG=<evidence-root>/logs/BASE-generate-contract.log zsh <source>/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh pnpm run generate:contract
```

Attempt 1: `rc=1`; `tsx` could not create `/var/folders/.../tsx-501/26786.pipe` under the default sandbox (`listen EPERM`). Log SHA256: `892f12ff9923dc4c1a84b63a990aba97a1a4658ae6ac53573b1f82aa0dc05785`.

The identical command under normal elevated execution used a new log, `BASE-generate-contract-r2.log`, and returned `rc=0`. Log SHA256: `ee43ade02b5f5ab5b6a138f1b0cd6fc2cc6e017dc453cbaaed69718d78767893`.

## Focused current Support baseline

Exact command, run from the lane project:

```text
LOG=<evidence-root>/logs/BASE-support-baseline-runN.log zsh <source>/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh env LANG=en_US.UTF-8 pnpm exec vitest run tests/unit/support-classify.test.ts tests/unit/support-model.test.ts tests/unit/support-kb.test.ts tests/unit/support-templates.test.ts tests/unit/support-escalation.test.ts tests/render/sup-01-help.test.tsx
```

| Run | rc | Test Files | Tests | Vitest duration | Log SHA256 |
|---|---:|---:|---:|---:|---|
| 1 | 0 | 6/6 | 432/432 | 2.51 s | `1fe182be6646ed84868740fe0f4a2f528d97111f957e00beead0b01c3124e3ea` |
| 2 | 0 | 6/6 | 432/432 | 2.27 s | `30f7b775dfe1ab556ac3bdcafed77647a7f3f9f0b8dbd2148427fc64882cf4e1` |
| 3 | 0 | 6/6 | 432/432 | 2.15 s | `43916373ba3ff671aeeacd9070a62f979cdff085a3431f4f34f51d22af866557` |

Worst run verdict: 6/6 test files and 432/432 tests passed. No provider, database, credential, browser, dev-server or external service call was made.

## Original source and index preservation

Before lane creation and after every baseline command, the original source remained on `integration/debate-tiers` at `446c685e977104ecf2b0b5ee0519f7123968429f`.

| Fingerprint | Before | After |
|---|---|---|
| `git status --porcelain=v1 | wc -l` | 157 | 157 |
| tracked unstaged paths | 56 | 56 |
| staged paths | 0 | 0 |
| staged binary diff SHA256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | same |
| unstaged binary diff SHA256 | `606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e` | same |

New mission evidence files and normal Git worktree metadata are the only main-tree additions caused by this node. The source product files and original index were untouched.

## Findings and limits

- Packet defect: `packets/BASE.md:20` does not state the exact six-file baseline command or expected 432-test frame.
- Packet defect: `packets/BASE.md:4` names a baseline role that is absent from the v4 role router at `.claude/skills/heartbeat-protocol/SKILL.md:13`.
- Tooling finding: contract generation requires either a sandbox-writable `TMPDIR` or normal elevated execution because `tsx` uses a local IPC socket; the first captured frame is retained.
- UNVERIFIED: full repository suites, typecheck, production services, live model behavior, database behavior and browser flows were outside this bounded baseline node.
- Actual model-token usage: **UNAVAILABLE**.
