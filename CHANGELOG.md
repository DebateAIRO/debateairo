# Changelog

## 0.2.1

- Added Bash-native Husky-style Git hooks for pre-commit, commit-msg, pre-push, pre-rebase, and post-merge guardrails.
- Propagated the hook entrypoints and shared runner into the skeleton for future bootstrapped projects.
- Documented `core.hooksPath` adoption and upgrade steps for existing projects.

## 0.2.0

- Initial local skeleton implementing the v0.2 build-plan structure.
- Added artifact contracts, memory discipline, config template, runner docs, and validation tests.
- Added functional local bootstrap/upgrade entry points, harness CLI, memory indexing/tag validation, and stack lifecycle helpers.
- Expanded Layer 1 and Layer 2 skill files with concrete triggers, workflows, failure modes, and examples from the v0.2 plan.
- Replaced placeholder GitHub workflows with dispatchable self-hosted-runner workflows and a shared metrics-emitting runner hook.
