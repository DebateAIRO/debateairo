# T1 Rework9 rework1 — same-finder Grok code re-review

## Role and custody

- You are resuming the exact Grok 4.6 code/lifecycle/security finder session `01a02a3f-abeb-7030-a8df-4d3a0319dfde` that returned `GROK REWORK9 CODE REVIEW CHANGES REQUESTED`.
- Review only the bounded repair to your two findings. You are read-only and independent; the Codex author is finished and inactive.
- Ticket `t_b225b2f2` remains `running`. Do not change Kanban.
- Required HEAD: `7918f4f8bff33909792afc01dc38d402972b4ccd`; staged index: empty.
- All 12 governed product/test hashes must still match `T1-rework9-final-manifest.json`, especially integration test `58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191` and registration product `1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03`.

## Required reading

Read these complete artifacts and only directly relevant referenced source/receipts:

- your first-round verdict: `T1-rework9-grok-code-review-attempt2.log`
- rework authority: `T1-rework9-codex-rework1-packet.md` (SHA-256 `46bb4c56a70e8948b9d76a10ce9067318032eda14946a6427f92179d058654cd`)
- `T1-rework9-rework1-progress.log`
- `T1-rework9-rework1-self-report.json`
- `T1-rework9-rework1-manifest.json`
- RED/GREEN/final custody/diff/static receipts named by the self-report
- current `T1-rework9-gate-launcher.mjs` (SHA-256 `52bfbd18d10b7e50434a4cf118dbfd055d3a5780e739cde56d7cbd0f44aea255`)
- current `T1-rework9-gate-controller.mjs` (SHA-256 `0b8b309b233bc6b29079cfd43d3b87e49b1133d464e8f6c18c7120a25efffa52`)
- current `T1-rework9-gate-contract.md` (SHA-256 `90c63bb693ee6db6f66364faefe42282bd7a74624f82576d89ed4b781b220562`)
- current `T1-rework9-static-supervisor-check.sh` (SHA-256 `8b5a88966e5ab6c1bba8cfbfa361df629ff9815962b98923c3a4f5d1275ef0bb`)
- current `T1-rework9-rework1-static-fixture.mjs` (SHA-256 `7002a8c4c5f7eaeaac0da02f9d0e6bed88428a0774c8d523e3cd69b3a58e5d75`)

Do not read the separate evidence/statistics Grok review packet/log/verdict. Its lane is independent and already frozen.

## Questions to decide

1. Is the PostgreSQL heavy-process predicate now shared consistently across launcher/controller preflight and postflight, and does it fail closed for path-prefixed `.../bin/postgres -D ...` plus `postgres: checkpointer`/child titles unless the exact line is in the frozen baseline?
2. Do RED then GREEN receipts and the permanent static fixture non-vacuously cover those two PostgreSQL forms and an unrelated non-heavy process?
3. Can a KeepAlive controller epoch now recover after an earlier epoch wrote postflight snapshots and died before release, without EEXIST preemption, stale/cross-run evidence reuse, or fail-open lock release?
4. Does release require exact canonical/current snapshot, terminal, token, lock-inode, and process/launchd postflight evidence, with ambiguity retaining the lock?
5. Did the repair stay within its allowed supervisor-only scope, preserve all governed product/test bytes and first-round review receipts, and avoid launching PostgreSQL/Vitest/launchctl/supervisor runtime?

Actively try to falsify the fix. Trace concrete races, pathname/title variants, recovery epochs, canonical publication, inode/token binding, and release ordering. Approval requires both original findings to be closed on the current bytes with no new blocking lifecycle/security defect.

## Stop conditions

- Read-only. Do not edit/create/stage/commit/push files or mutate Kanban.
- Do not run Vitest, PostgreSQL, launchctl, the supervisor launcher/controller/worker/viewer, mutations, or any heavy command.
- No subagents, web search, Claude, Codex, Hermes-model, or another Grok session.
- Treat uncertainty or missing custody as CHANGES REQUESTED.

## Required response

Give findings ordered by severity with exact file:line evidence, independently checked hashes/receipts/custody, residual risks, session identity if visible, and a concise 10–20 line self-report. End with exactly one marker:

- `GROK REWORK9 CODE RE-REVIEW APPROVED`
- `GROK REWORK9 CODE RE-REVIEW CHANGES REQUESTED`
