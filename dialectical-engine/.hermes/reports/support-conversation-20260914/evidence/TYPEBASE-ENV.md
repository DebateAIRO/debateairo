# TYPEBASE-ENV evidence — support-conversation-20260914

Measured 2026-09-14 by native agent `/root/baseline`, `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.

## Executed baseline fixture

- Exact baseline commit: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Detached diagnostic project: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase/dialectical-engine`
- Exact command, run once through the repository capture runner:

```text
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/TYPEBASE-env-fixture.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh pnpm exec vitest run tests/integration/dev-api-environment.test.ts -t "atomically assembles the exact environment without returning credential values"
```

- Result: `rc=1`; 1 selected test failed, 9 sibling tests skipped, 10 tests total.
- Vitest duration: 333 ms; selected test duration: 41 ms.
- Full log: `logs/TYPEBASE-env-fixture.log`, 35 lines, SHA256 `98b847e59e27eba8ed331ef6ee80073ecaf7f7b1e91fe660966d5615376aade1`.
- The original `pnpm run typecheck` evidence and its artifacts were preserved and were not rerun or overwritten.

## Exact attribution to PREVIEW

Compared PREVIEW log: `logs/PREVIEW-final-focused-green.log`, 185 lines, SHA256 `4db483ca1eea893a77199a8e170c1d963c4a4d87eef65ab6ff18f9442edbfd05`.

Both executions report:

- file: `tests/integration/dev-api-environment.test.ts`
- test: `DEV-09 private local API environment > atomically assembles the exact environment without returning credential values`
- assertion: `the given combination of arguments (undefined and string) is invalid for this assertion`
- location: `tests/integration/dev-api-environment.test.ts:176:8`
- failing expression: `environment.get("EVALUATOR_DATABASE_URL").toContain("debateai_dev_evaluator_worker")`

The test file at the frozen baseline and at `codex/support-conversation-cp1@252f8faf46d987e1df89778eff0439ea140994d0` has identical SHA256 `bfab7d8cd289a521dac5c0b67c26efc74a6b78c287a1cf28257c75d87dfc2dce`.

Verdict: the PREVIEW focused failure is **exact inherited baseline behavior**. The failure demonstrates that `EVALUATOR_DATABASE_URL` is undefined under this fixture. This node does not authorize or attempt a repair.

## Setup custody

- Worktree was created detached at `b7ca2c41`; no branch or commit was created.
- The 923 MB root `node_modules` plus 31 workspace `node_modules` trees were copied locally with APFS clone semantics (`cp -cR`). Corrected copy log SHA256: `ae80d2275e9da78b7a07815b94d9faa7c5dfdb4e0e3466070f1910658c6c8e9d`.
- Dependency check after contract generation: 1,108 symlinks total, 0 resolved outside the detached diagnostic project, 0 broken.
- Required contract generation returned `rc=0`; corrected log SHA256 `ee43ade02b5f5ab5b6a138f1b0cd6fc2cc6e017dc453cbaaed69718d78767893`.
- The heavy lease was released immediately after the one fixture capture, before light comparison and cleanup.

Two setup-only attempts stopped before the fixture execution because the initial dependency target used the Git worktree root instead of its nested package project. The first copy capture also used zsh's special `path` variable and lost command lookup. These attempts are preserved for audit: `TYPEBASE-env-node-modules-copy.log` SHA256 `caffa7ff3c71a5ac4fdec365121014326bb78d2c9c281987f1b95cd6530b2b4a`; `TYPEBASE-env-workspace-node-modules-copy.log` SHA256 `1fda93ba1583f925e1dc03fec481d72ac27ec5d3451b2522a2a0f8310c5c5ded`; `TYPEBASE-env-generate-contract.log` SHA256 `d54a82b5f45907bd72dd9a738a66df22c4270233f166405629b4e8f14f201799`. Exact own untracked copies were removed before corrected setup. No test ran during either attempt.

## Cleanup and preservation

- Baseline tracked tree was clean immediately before cleanup.
- `git worktree remove /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase` completed successfully.
- Diagnostic path and worktree metadata are absent after cleanup.
- Original source remains `integration/debate-tiers@446c685e977104ecf2b0b5ee0519f7123968429f`, with 157 porcelain entries and 0 staged paths.
- Original staged diff SHA256 remains `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; unstaged binary diff SHA256 remains `606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e`.
- Product lane ref remained `codex/support-conversation-cp1@252f8faf46d987e1df89778eff0439ea140994d0` from preflight through cleanup.

## Limits

- This follow-up attributes only the single supplied PREVIEW focused failure against one execution at the frozen baseline.
- It performed no code changes, fix, full typecheck, broader test sweep, dependency install, network access, or service start.
- Actual model-token usage is **UNAVAILABLE**.
