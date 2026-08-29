SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:executing-plans, superpowers:using-git-worktrees, superpowers:systematic-debugging

# S03-CODE Codex case file

**Status:** BLOCKED before implementation on 2026-08-29. No product or test file was modified.

## Executive finding

The dispatch combines a universal rule—every PLAN step must show feature-specific RED before GREEN—with acceptance steps that are intentionally already satisfied before S03. That makes literal execution impossible. The same packet also requires a repository-wide typecheck that cannot pass in the assigned worktree because its shared dependency layout resolves workspace packages through the main checkout and omits package-local pnpm links.

## Findings, cause, and price

### 1. The PLAN was reviewed as a design, not executed as a pre-fix acceptance program

**Cause:** Several acceptance steps validate standing availability or pre-authored documentation rather than the behavior S03 adds. Architecture did not execute each command against pre-fix code and classify the expected pre-fix result before approving the PLAN under the packet's universal RED law.

**Evidence:** On untouched `apps/ui/app/page.tsx`, S03-C3-2 returned `1` for both `/?tab=public` and default `/`, exit 0. S03-C4-1 returned `2`, exit 0. S03-C2-2 asserts pre-existing banner copy and a pre-existing session gate. S03-C1-5 declares acceptance `N/A`. The PLAN contains no pre-fix-failing residual test for public-list leakage into Your Debates or private-list leakage into Public Debates.

**Price:** One coding seat round stopped before implementation; one Architecture/Router rework is now required. Without the stop, the higher price would have been false TDD evidence and tests that could not prove the feature.

**Upgrade:** Before dispatch, execute every acceptance command on the base commit and store `expected_pre_fix = RED | BASELINE_GREEN | N/A`. A universal RED law may cover only feature-changing assertions. If it truly covers every row, verification-only and documentation-only rows need explicit pre-fix-failing assertions. Add behavior-specific residual tests for both directions of list leakage and for logged-in/logged-out default selection.

### 2. A root `node_modules` symlink is not an isolated pnpm-workspace setup

**Cause:** The worktree's `node_modules` points to the main checkout. Package-local links such as `apps/api/node_modules` do not exist in the worktree, while root links such as `node_modules/@debateai/crypto -> ../../packages/crypto` resolve to the main checkout's source. TypeScript therefore sees missing external/workspace packages and two identities for classes with private fields.

**Evidence:** Pre-fix `pnpm run typecheck` exits 1 with missing `@hatchet-dev/typescript-sdk`, `@debateai/evaluator`, and `hash-wasm`, plus main-checkout/worktree type incompatibilities for `AuditContextHasher`, `ContentCipher`, `PublicationCipher`, and `PostgresPublicationRepository`.

**Price:** Two global typecheck executions (the second caused by the quoting incident below), thousands of diagnostic lines, and an acceptance gate that cannot reach GREEN within S03's file contract.

**Upgrade:** Provision each worktree with its own pnpm link layout before dispatch, or define a genuinely scoped UI typecheck/build command whose dependency graph is present. The packet should record a measured `pnpm run typecheck` baseline when that command is a step acceptance gate; a passing unrelated Vitest file is not evidence for it.

### 3. Board workspace metadata disagrees with the dispatch

**Cause:** The ticket was created as `workspace_kind: scratch` with no workspace path, while its body and packet assign `.worktrees/prog-b-s03/dialectical-engine`. Claiming it therefore created a generic Hermes workspace under `~/.hermes/kanban/...`.

**Price:** One extra board inspection and a discrepancy that could have split edits across two workspaces.

**Upgrade:** Pre-dispatch validation should compare the ticket's resolved workspace metadata to the absolute packet worktree and refuse dispatch on mismatch.

### 4. My Hermes comment quoting corrupted the first blocker record

**Cause:** I passed a markdown-rich comment through a double-quoted shell argument. Backticks were executed by zsh, exactly the class of escaping failure the coding instructions warn about. This was my error, not a packet defect.

**Price:** One malformed 34,115-character board comment, one unintended second typecheck run, several harmless failed shell lookups, and one corrective comment. No repository file changed.

**Upgrade:** Use a single-quote escape function for Hermes' positional comment body. Better, add `hermes kanban comment --file` or stdin support so evidence never traverses shell interpolation. Add this exact transport recipe to tooling guidance; the current trap notes that the body is positional but not how to transport markdown safely.

## What I nearly got wrong

- I nearly treated already-GREEN availability probes as acceptable TDD evidence. The explicit residual-test warning forced the pre-fix run before code.
- I nearly interpreted a RED global typecheck as the desired C1-1 RED. Its failures are unrelated to S03 and would remain after the feature, so it is not a valid feature pin.
- I did not run `pnpm install` after resolution failed. Although the packet conditionally permits a fresh install when resolution fails, the shared symlink means that action would write into the main checkout and outside the parallel lane's file surface.
- I could have followed Hermes' generated scratch workspace after CLAIM. The direct packet and ticket body instead bind this seat to the existing linked worktree.

## Dead ends worth deleting from future prompts

- A positive probe that public debates are visible cannot prove tab mutual exclusion; it already passes when both lists are always stacked.
- Grepping an Architecture-authored decision cannot be an implementation RED frame.
- Repository-wide typecheck is not a local syntax test when workspace dependency isolation is absent.
- A root-only `node_modules` symlink does not reproduce pnpm's per-package workspace links.

## Exactly where the packet was unclear

1. Packet §3 says RED before GREEN on every step, no exceptions, while PLAN S03-C1-5 says acceptance `N/A` and several verification/documentation steps are pre-fix GREEN. The precedence is clear; the executable reconciliation is not.
2. Packet §6 permits a fresh install after a resolution failure, while §5 and §5's single-writer rule prohibit touching dependency surfaces outside S03. Because `node_modules` is a shared main-tree symlink, the permitted installation target is unclear.
3. The packet assigns one worktree, but the board claim resolves another. It does not say whether the coding seat should avoid `hermes kanban claim` and use only a CLAIM comment marker.
4. The packet explicitly demands pre-fix-failing residual leak tests, but the approved PLAN names only the keyboard source test as a new S03 test. Adding residual behavior tests would be a design change unless explicitly authorized.

## Turning this into a better one-prompt machine

Add one automated pre-dispatch gate that reads the packet and PLAN, verifies every absolute path and allowed output, compares board workspace metadata, checks dependency resolution from the assigned cwd, executes every acceptance command on the base commit, and rejects any feature assertion whose expected pre-fix state is GREEN. Emit that machine-generated matrix into the packet. This would have caught all three external blockers before consuming a coding seat.

The prompt should also separate three concepts currently overloaded as “acceptance”: regression baseline, pre-fix RED assertion, and post-fix verification. Each row needs an explicit category and expected result before and after implementation. With that distinction, the coding seat can execute mechanically in one pass instead of interpreting contradictions.
