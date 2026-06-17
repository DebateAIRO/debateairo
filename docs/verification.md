# Verification

Acceptance verification and code-quality verification are separate jobs.

- Acceptance verification is binary, criterion-driven, clean-slate, and merge-blocking.
- Code-quality verification is informational: maintainability, simplicity, security, coupling, observability, tests, dependency hygiene.

## Local Git Hooks

The skeleton includes Bash-native hooks in `.husky/`. Enable them with:

```bash
git config core.hooksPath .husky
```

The hooks are blocking guardrails. They run only repo-local checks that exist, report missing policy coverage clearly, and do not auto-format or install dependencies.
