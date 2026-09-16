# Probes — `REV-S03-p3r-product-truth` (REV(S03) lens product-truth, pass 3r), written against `b97985a8`

Every path here is `$WORKTREE`-relative: copy the `.test.ts*` files into the SAME paths of the
worktree you are running (`tests/unit/`, `tests/render/`) and run them with
`LANG=en_US.UTF-8 npx vitest run <file>` from that worktree's `dialectical-engine`. The two `.sh`
mutants take the worktree root from `$WORKTREE` or `argv[1]`; nothing is hard-coded.
Everything is in-process: no dev server, no port, no child runner, no database.

| file | cases | what it settles |
|---|---|---|
| `REV-S03-p3r-product-truth-live.test.ts` → `tests/unit/` | 9 | Drives the real projection → route → contract client with **the bytes in V's register v10**, transcribed from `review-packages/S03-p3r/live/serve-merged-diag-v10-b97985a8.log:4`. **L0** re-derives that exact `valueJsonText` from this head's publisher (byte-identical), so the rest measures V's actual state without touching the database. |
| `REV-S03-p3r-product-truth-page.test.tsx` → `tests/render/` | 5 | The same live bytes → the real route → the rendered `/new` DOM. Acceptance step 2 on V's own row. |
| `REV-S03-p3r-product-truth-runner.test.ts` → `tests/unit/` | 5 | Why `dev:auth:up` stops at the runner stage, and whose it is: the ready message's `registerVersion` is a **number** (the register package's own transform) while the gate demands a **string**. Fails identically at the pre-S03 version 9 (R2) and at every version (R4); a string passes (R3 control). **Recipe worth stealing:** `developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(root)).targetsJson` is the only way to get a `PROVIDER_DISCOVERY_TARGETS_JSON` that survives the round-trip check at `dev-runner-process.ts:75` — a hand-written array fails with `DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID` and you debug the wrong thing. |
| `REV-S03-p3r-product-truth-step7.test.ts` → `tests/unit/` | 3 | **B1.** What `pnpm dev:auth:up` prints for a shape fault now that V-49's generator is stage 1, rendered with the CLI's own `developmentAuthStackErrorCode`, beside the curated line stage 2 would have printed. Needs its wrapper (below) to mutate the file first. |
| `REV-S03-p3r-product-truth-step7sweep.test.ts` → `tests/unit/` | 5 | **B1's class sweep** — all four faults SPEC-v3 §2 step 7 itself lists. Self-contained: each member mutates and restores `config/models.yaml` in a `finally`, and the suite re-asserts the committed bytes at the end. |
| `REV-S03-p3r-product-truth-mutant-generator-follows-file.sh` | — | Capture → swap the two Free entries → `pnpm generate:contract` → observe → restore → `cmp`. Proves V-49's generator rewrites the admission constant **from** the file. Restores FROM the bytes it captured, never to a literal. |
| `REV-S03-p3r-product-truth-mutant-step7-cli.sh` | — | Wrapper for `…-step7.test.ts`: capture → `api: acme` → run the probe → restore → `cmp`. Has an `EXIT` trap that restores even on a crash. |

**Measured at `b97985a8`:** live 9/9 · page 5/5 · runner 5/5 · step7 3/3 · sweep 5/5. Both mutants
reported `RESTORED … cmp equal`, and the worktree's porcelain was 0 before and after.

**The one-line result:** V's stored row renders as the file's five ids on `/new` (V-47 delivered),
and a broken edit reports `DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED` and nothing else (B1).
