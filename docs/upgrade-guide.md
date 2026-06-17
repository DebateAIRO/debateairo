# Upgrade Guide

Use `bootstrap/upgrade.sh` to apply skeleton changes with a 3-way merge. v0.2 introduces `.harness/config.yml`, split verification, Integrating state, and Final Validation.

## 0.2.1 Git Hook Guardrails

v0.2.1 adds Bash-native Husky-style hooks under `.husky/`:

- `pre-commit` checks staged whitespace/conflict issues, scans staged content for secrets, and runs repo-local template/harness checks when present.
- `commit-msg` requires Conventional Commits or a ticket-aware subject such as `ABC-123: summary`.
- `pre-push` blocks direct pushes to protected branches and runs heavier repo-local validation.
- `pre-rebase` blocks rebases of `main`, `develop`, `release/*`, and branches with a configured upstream unless explicitly overridden.
- `post-merge` warns loudly when dependency, config, schema, template, hook, setup, or test files changed and local remediation is needed.

New bootstrapped projects receive the hooks automatically. Enable them in any repo with:

```bash
git config core.hooksPath .husky
```

Existing projects upgraded with `bootstrap/upgrade.sh` should merge the new `.husky/` files from the generated `.new` candidates, ensure they are executable, then set `core.hooksPath`:

```bash
chmod +x .husky/pre-commit .husky/commit-msg .husky/pre-push .husky/pre-rebase .husky/post-merge .husky/scripts/hook-runner.sh
git config core.hooksPath .husky
```

No npm Husky package is required. The hooks do not format, install dependencies, or rewrite files automatically; they block with remediation instructions when a policy cannot be satisfied.
