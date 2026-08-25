# T1 Rework9 rework2 — same-finder Grok code re-review

## Role

- Resume exact Grok 4.6 finder session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`.
- You already approved rework1 in `T1-rework9-grok-code-rereview-visible.log`. Review only Router-discovered rework2 and ensure it does not regress your two prior fixes.
- Read-only; author is finished/inactive. Ticket `t_b225b2f2` remains `running`.
- Required HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, empty index, all 12 product/test tuples frozen as `T1-rework9-final-manifest.json`.

## Required artifacts

Read completely:

- `T1-rework9-codex-rework2-packet.md` (SHA-256 `5307e47f60e59d743d3a240c41107eca2339030ab97a6e7ff4f8bd1080704e88`)
- `T1-rework9-rework2-self-report.json`
- `T1-rework9-rework2-manifest.json`
- rework2 RED/GREEN/final static/diff/custody receipts named there
- current `T1-rework9-gate-launcher.mjs` (SHA-256 `3d0118a18833b0c584873059e8d5d96403634127dea39f79be4ec3b649ed7fa4`)
- current `T1-rework9-gate-contract.md` (SHA-256 `dd9a403317362069b327c202fd49b00a6211c6e8cb19eccd25e265b6134304c0`)
- current `T1-rework9-static-supervisor-check.sh` (SHA-256 `93615a871a7632bb9694769ab8bb3e9c9a23e35f81f4aad6207baa68286c22a1`)
- current `T1-rework9-rework2-static-fixture.mjs` (SHA-256 `148d960c59e7027dac1a1e9a1a83e6fb4a1ad0b780e2951f8d12ff268e4269a3`)
- unchanged controller/current prior rework1 artifacts only as needed to prove no regression

Do not read the independent statistics/evidence Grok review packet/log/verdict.

## Decide

1. Did RED non-vacuously prove the old `mkdtemp` suffix made packet-predeclared rendered-plist hashes unknowable?
2. Is the new temp path derived exactly from fresh validated UUID, created exclusively as a real directory with mode 0700, rejected if pre-existing/symlinked/wrong ownership or mode, and never reclaimed/reused?
3. Can a Router now precompute exact controller/worker plist hashes using only frozen inputs before launcher execution, while a different UUID yields a distinct path/hash?
4. Are packet-provided rendered hashes still checked unchanged before bootstrap, with no self-authored expected hash or weakening?
5. Are rework1's shared PostgreSQL predicate and epoch-safe release recovery preserved?
6. Did scope/custody stay supervisor-only with no supervisor/Vitest/PostgreSQL/launchctl execution?

Actively trace TOCTOU/symlink/precreation, UUID collision, permissions/ownership, template inputs, exact path normalization, and lock-retention behavior. Any uncertainty is CHANGES REQUESTED.

## Stop conditions

- No edits/files/Kanban/subagents/web/Claude/Codex/Hermes-model/other Grok.
- Do not run Vitest, PostgreSQL, launchctl, supervisor components, mutations, or any heavy command.

Give findings with exact file:line evidence, independent hashes/receipts/custody, residual risks, session ID, and concise 10–20 line self-report. End exactly one:

- `GROK REWORK9 CODE RE-REVIEW2 APPROVED`
- `GROK REWORK9 CODE RE-REVIEW2 CHANGES REQUESTED`
