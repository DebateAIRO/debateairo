# TYPEBASE-ENV case file — omitted focused-fixture baseline

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the focused failure was already present in the frozen baseline

The exact named test fails at detached baseline `b7ca2c41` with the same test title, assertion text, source location `tests/integration/dev-api-environment.test.ts:176:8`, and undefined `EVALUATOR_DATABASE_URL` value seen in PREVIEW. The baseline run returned `rc=1`, with one selected test failing and nine siblings skipped. The test file bytes are identical between the baseline and current product ref: SHA256 `bfab7d8cd289a521dac5c0b67c26efc74a6b78c287a1cf28257c75d87dfc2dce`.

**Price.** Because the focused fixture was omitted from the original BASE/TYPEBASE attribution inventory, the mission needed another 5,104-file detached checkout, a local 923 MB root dependency clone plus 31 workspace dependency trees, contract generation, one 333 ms fixture run, and cleanup. Actual model-token usage is **UNAVAILABLE**.

**Upgrade.** The baseline manifest should enumerate every final gate command, including individually known failures, with command, selected test name, return code, pass/fail/skip counts, and log hash. Later authors can then compare a final failure to frozen evidence without reopening the baseline.

## Finding 2 — setup paths need a machine-readable project root

The Git worktree root is one directory above the package project. The first dependency copy targeted the worktree root instead of its `dialectical-engine/` child, and a zsh loop variable named `path` also replaced zsh's special command-search array. This produced one failed copy capture (`mkdir: command not found`) and one failed contract capture (`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`). Both stopped before the fixture ran. The exact own untracked copies were removed, setup was repeated at the packet's stated diagnostic project path, and the single authorized fixture execution remained exactly once.

**Upgrade.** Put `repo_root`, `project_root`, `dependency_source`, and `worktree_target` into the dispatch packet as distinct fields, then use a checked setup helper that rejects a target without `package.json`. Shell helpers should reserve names such as `path`, `status`, and `commands` in zsh or run under a fixed shell with linted variable names.

## Finding 3 — selection accounting makes the evidence auditable

Vitest reported 10 tests in the file: one selected failure and nine skipped siblings. Recording skipped siblings proves the `-t` filter constrained execution and avoids the false impression that the whole file was rerun. The original 76-diagnostic typecheck was not rerun.

## One-prompt machine upgrade

Extend baseline preparation with a gate inventory generated before implementation. Each gate record should include the exact argv, cwd relative to the Git root, expected selection cardinality, baseline commit, setup recipe, result counts, and artifact hash. A single comparison command can then label each final failure as exact inherited, moved inherited, introduced, or unresolved. It should fail closed when the cwd lacks the expected manifest or when selected plus skipped counts do not equal the declared fixture count.

## Measurements

- Agent: `/root/baseline`; `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`; `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Baseline: detached `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`; tracked tree clean before capture and cleanup.
- Setup: 1,108 dependency symlinks; 0 outside the diagnostic project; 0 broken; corrected contract generation `rc=0`.
- Fixture: exactly one named Vitest invocation; `rc=1`; 1 failed, 9 skipped, 10 total; duration 333 ms.
- Attribution: exact inherited failure; same test file bytes, title, assertion text, source location, and missing environment key as PREVIEW.
- Original full typecheck: preserved and not rerun.
- Worktree and cloned dependencies: removed through `git worktree remove`; source/index and current product ref unchanged.
- Fixes/install/network/services/broader tests: none.
- Actual model-token usage: **UNAVAILABLE**.
