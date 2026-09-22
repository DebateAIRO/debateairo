# TYPEBASE evidence — support-conversation-20260914

Measured 2026-09-14 by native agent `/root/baseline`, `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.

## Executed baseline

- Exact baseline commit: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`
- Detached diagnostic project: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase/dialectical-engine`
- Exact command, run once through the repository capture runner:

```text
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/TYPEBASE-typecheck.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh pnpm run typecheck
```

- Result: `rc=1`; 76 TypeScript diagnostics across 23 files.
- Full log: `logs/TYPEBASE-typecheck.log`, 39,731 bytes, SHA256 `d609e418b93fd3502df37c385b951374b4363c07becfc72783bc19ac9702d70c`.
- Machine-readable tuples: `evidence/TYPEBASE-diagnostics.json`, 48,248 bytes, SHA256 `021baa581575f75b7c7a53d4f1803575c2a80c2f886919463f542522d2d2456f`.

The baseline tracked tree was clean before and after generation/typecheck. No repair, installation, network access, service start or second typecheck was performed.

## Setup custody

- Worktree was created detached at `b7ca2c41`; no branch or commit was created.
- The 923 MB root `node_modules` plus 31 workspace `node_modules` trees were copied locally with APFS clone semantics (`cp -cR`). Log SHA256: `018a957e4de13a19c9489ab9b611a92adb688848e8e2399f987cb65f18976d6e`.
- Dependency check: 1,108 symlinks total, 0 resolved outside the detached diagnostic checkout, 0 broken.
- Baseline package script: `"typecheck": "tsc --noEmit"`; `tsconfig.json` includes `apps/**/*.ts`, `packages/**/*.ts`, `tools/**/*.ts`, `tests/**/*.ts`, `vitest.config.ts`, and `drizzle.config.ts`.
- Contract generation was required to reproduce the BASE setup. `pnpm run generate:contract` returned `rc=0`; log SHA256 `ee43ade02b5f5ab5b6a138f1b0cd6fc2cc6e017dc453cbaaed69718d78767893`.

## Baseline diagnostic counts

| Code | Count |
|---|---:|
| TS2741 | 34 |
| TS2339 | 23 |
| TS2307 | 4 |
| TS2353 | 4 |
| TS2322 | 3 |
| TS2694 | 3 |
| TS18046 | 2 |
| TS7006 | 2 |
| TS2345 | 1 |
| **Total** | **76** |

| File | Count |
|---|---:|
| `apps/api/src/index.ts` | 1 |
| `tests/acceptance/obs-agent-03-fixture.ts` | 1 |
| `tests/acceptance/obs-agent-04-fixture.ts` | 2 |
| `tests/acceptance/obs-agent-06-fixture.ts` | 1 |
| `tests/architecture/obs-agent-06-copy.test.ts` | 1 |
| `tests/architecture/register-support-publication.test.ts` | 15 |
| `tests/architecture/sup-04-mounts.test.ts` | 9 |
| `tests/integration/obs-agent-01-delivery.test.ts` | 2 |
| `tests/integration/obs-agent-03-fixture.test.ts` | 1 |
| `tests/integration/obs-agent-04-gap-drill.test.ts` | 1 |
| `tests/integration/obs-agent-04-not-wired.test.ts` | 4 |
| `tests/integration/obs-agent-05-connection-drill.test.ts` | 1 |
| `tests/integration/obs-agent-05-docker.test.ts` | 1 |
| `tests/integration/obs-agent-06-status.test.ts` | 3 |
| `tests/integration/obs-agent-06-views.test.ts` | 1 |
| `tests/unit/dev-cli-provider-panel.test.ts` | 3 |
| `tests/unit/dev-evaluator-process.test.ts` | 1 |
| `tests/unit/evaluator-profiles.test.ts` | 4 |
| `tests/unit/obs-agent-01-discovery.test.ts` | 8 |
| `tests/unit/obs-agent-01-status-projections.test.ts` | 1 |
| `tests/unit/obs-agent-05-lifecycle.test.ts` | 5 |
| `tests/unit/obs-agent-05-postgres.test.ts` | 2 |
| `tests/unit/s14-ui.test.ts` | 8 |

## PREVIEW-final attribution

Compared log: `logs/PREVIEW-typecheck-final.log`, SHA256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. It also contains 76 diagnostic tuples and the same per-code counts.

Normalization replaced only these absolute checkout prefixes inside diagnostic messages with `<CHECKOUT>`:

- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase/dialectical-engine`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine`

Classification used a multiset. Exact inheritance required the same normalized file, line, column, code and message. Moved-line inheritance required the same file, code and normalized message after exact matches were consumed. Filename alone was never sufficient.

| Classification | Count |
|---|---:|
| Observed in actual baseline, exact tuple | 73 |
| Observed in actual baseline, same defect at moved line | 3 |
| Introduced by PREVIEW | 0 |
| Baseline-only after matching | 0 |

The three moved-line tuples are all in `tests/unit/dev-cli-provider-panel.test.ts`:

| Code | Baseline location | PREVIEW-final location | Normalized message |
|---|---|---|---|
| TS2322 | 151:7 | 171:7 | `Type 'string' is not assignable to type 'RegisterVersionText'.` |
| TS2322 | 153:9 | 173:9 | `GeneralRegisterPublication` result is not assignable because `registerVersion` is a plain string rather than `RegisterVersionText`. |
| TS2345 | 176:43 | 196:43 | `Argument of type 'string' is not assignable to parameter of type 'RegisterVersionText'.` |

Verdict: all 76 PREVIEW-final diagnostics were observed in the executed unchanged baseline; 73 are position-exact and 3 moved by 20 lines with the same file/code/message. The final typecheck remains failing and must not be reported as a passing gate.

## Cleanup and preservation

- Heavy lease was released immediately after the one typecheck capture, before light parsing and cleanup.
- `git worktree remove /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase` completed successfully.
- Diagnostic path absent after cleanup; worktree metadata has no TYPEBASE entry.
- Original source remains `integration/debate-tiers@446c685e977104ecf2b0b5ee0519f7123968429f`, with 157 porcelain entries, 56 tracked unstaged paths and 0 staged paths.
- Original staged diff SHA256 remains `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; unstaged binary diff SHA256 remains `606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e`.
- Product lane ref remained `codex/support-conversation-cp1@fa362c5e87abe0e6068cb8f43822d718697258f5` through cleanup.

## Limits

- This node attributes only the supplied PREVIEW-final log against one executed unchanged baseline. It does not repair or approve any diagnostic.
- TypeScript continuation text remains verbatim in the two logs; the JSON stores the first-line diagnostic tuple and classification evidence.
- Actual model-token usage is **UNAVAILABLE**.
