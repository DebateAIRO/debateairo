# S6 rework 2 — final Grok 4.6 independent security review

You are the fresh independent Grok 4.6 reviewer for Accounts Phase 1 S6
`t_ad5ea835`. Two prior visible reviews returned CHANGES REQUESTED. Review the
complete final candidate, not merely the author's receipts, and determine
whether every original and residual finding is closed without regression.

Read-only only: do not edit, stage, commit, merge, push, mutate Kanban, launch
subagents, or search the web. You may inspect history/source and run
proportionate tests. Keep the worktree/index clean.

## Exact custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s6/dialectical-engine`
- Branch: `codex/accounts-s6`
- Mission base: `0cec59ef6f1dfe938ed872daba984bd6d2291776`
- Original S6: `268fee75ed55b98fbcd6402add848bab42b84aff`
- Harness repair: `fde8230b63e55add5af70fd67a9187a8342117c1`
- Rework 1: `78f1962042e78750d34afdeca23264c41b5dad22`
- Residual evaluator fix: `2a9b69ea6a13acb52b133818e31d60bf5a2ebfe3`
- Final tree: `65ed7e8dec920866c5ac60f7b9e6d9ead754157d`
- Whole review range: `0cec59ef..2a9b69ea`
- Residual-fix range: `78f19620..2a9b69ea`
- Final worktree and index must remain clean.

Read both prior visible reviews fully before judging:

- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S6-grok-final-review-visible.log`
  SHA-256 `ad8f5c5d1fa4371d14985c965a26da77362c7909291eb729aaee7c3d21bd6785`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S6-grok-rework1-review-visible.log`
  SHA-256 `7a8f04f4ad0ef72d04fba473ec96f25337facc0d6feb3584e9be45f1b5ca58e6`

Read the binding Phase 1 mission/amendments/decisions, S5/S7 handoffs, S6 card,
migrations, and adjacent persistence/replay/session/ownership code.

## Reproduce or refute the residual High

The second review accepted the original five findings as closed, but found
same-pool key resolution under evaluator locks:

1. `EvaluatorHarvestRepository.harvestTerminalRun` / its snapshot path
   decrypted `ledger.node_review` while holding a write transaction/advisory
   lock, and the resolver could check out the same pool.
2. `PostgresEvaluatorAddonRepository.withRunLock` called `loadCandidate`, whose
   three decryptions could resolve keys through the same pool while the lock
   was held.

Audit the actual production correction, including every error branch:

- Harvest must prepare exactly one run cipher before `connect`, `BEGIN`, write
  transaction, or advisory lock. Snapshot SQL must use the held client; review
  decrypt must use only the prepared in-memory cipher. The prepared key must be
  closed/zeroed promptly after the snapshot transaction, including errors.
- Add-on `withRunLock` must prepare before pool checkout and pass the prepared
  cipher through `loadCandidate`. Candidate decryption under lock must be local
  prepared crypto only. The key must be closed/zeroed on connect failure, lock
  miss, candidate failure, unlock failure, and success. Direct unlocked
  `loadCandidate` may own its preparation, but supplied-client/no-prepared use
  must fail closed without a pool checkout.
- Inspect every evaluator/evaluator-worker write-transaction and run-lock
  callback. No callback may call `this.pool`, `pool.query`, key preparation,
  external encrypt/decrypt, or an owner/key resolver. Do not accept a string
  assertion alone; trace call graphs and actual pool behavior.
- Reproduce the production-shaped `max=1` same-pool tests. They must prove the
  key exists, prove a nested resolver would wait/deadlock on the sole checked
  out connection, complete the harvest/add-on operation, and observe zero
  nested resolver waits. Verify captured key buffers are zeroed afterward.
- Check less obvious failure and early-return paths such as NOT_TERMINAL,
  missing advisory lock, missing candidate, supplied client, and unlock errors.

## Re-audit previously accepted properties

Do not limit review to the residual three-file diff. Confirm the original five
findings remain closed in the final whole range:

1. Ambiguous COMMIT retains a possibly committed key and emits constant
   `RUN_CONTENT_ROLLBACK_INCOMPLETE`; definite pre-COMMIT rollback destroys it.
   File-key publication uses exclusive temp creation, fsync/close, atomic
   rename, directory fsync, strict permissions, sanitized cleanup errors.
2. External key/resolver/filesystem work is outside DB transactions and
   identity/run locks for all 14 physical carriers / 11 logical groups. Only
   prepared local crypto is allowed under an authorized lock.
3. No nested pool checkout exists in any write callback, including graph,
   ledger, judgement, evidence, serve, memory, replay eviction, evaluator, and
   copy/clone/pull paths. Disabled helpers must return before SQL.
4. True pre-0038/default-off repositories omit encryption columns and remain
   compatible; an encrypted 0038 row without a cipher fails closed with
   `CONTENT_CIPHER_UNAVAILABLE`, never returning sentinels.
5. Memory candidate evaluation is serial and owner-scoped, revalidates before
   decrypt and final write, uses deterministic locks, immediately zeroes keys,
   persists `{}`/`[]` plaintext placeholders, and leaks no terms/counts/hashes/
   binding field names/shapes/values/lengths in match metadata or raw DB/data
   directory bytes.
6. Recheck AAD relocation, shred irrecoverability, external key metadata
   privacy, qbi owner scoping, migration guards/idempotence, fail-closed flag
   wiring, S5/S7 preservation, architecture dependencies, and the separate
   child-exit harness.

## Evidence to verify, not trust

Residual RED on untouched rework-1 production:

- Exact two-file selection: 3 failed / 18 skipped, 3.18s.
- Harvest: key existed, one nested resolver wait, state `ERROR` instead of
  `HARVESTED`.
- Add-on: key existed, three nested resolver waits,
  `RUN_CONTENT_KEY_UNRESOLVED` instead of a candidate.
- Architecture: no preparation before the harvest transaction.

Residual GREEN:

- Exact max=1/architecture set: 3/3; later focused evaluator set 13/13, with
  captured prepared key buffers asserted zeroed.
- Evaluator/S6 unit+architecture: 15 files / 95 tests.
- Affected evaluator/S6 disposable PostgreSQL: 9 files / 73 tests.
- Lexical callback audit enumerated 14 evaluator callbacks (13 write, one
  run-lock), zero forbidden pool/key-I/O calls. The sole evaluator-worker
  external decrypt was reported after a standalone SELECT and before any
  repository/provider/lock work; verify this independently.
- Full unit: 76 files / 777 tests. Typecheck, lint (28 edges / 0 violations;
  source 0 blockers), contract generation/no drift, production build, and
  diff-check green.
- Frozen residual patch: 3 files, 395 insertions / 54 deletions, SHA-256
  `b96326d513bc90c5661cdb610b8a16d7bad7f41eaeb64fed34f62c68068f5d11`.
- Sole final full on unchanged bytes: `pnpm test` exit 0, 127/127 files,
  1205/1205 tests, 1990.25s; pre/post manifest identical.

Adversarially inspect and rerun proportionately. Findings first, ordered by
severity, with exact path/line, mechanism, and smallest correction. Do not
approve merely because receipts are green.

End with exactly one marker:

`GROK S6 REWORK2 APPROVED`

or

`GROK S6 REWORK2 CHANGES REQUESTED`
