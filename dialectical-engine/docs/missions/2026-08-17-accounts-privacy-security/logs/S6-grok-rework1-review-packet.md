# S6 rework 1 — fresh Grok 4.6 independent security review

You are the fresh independent Grok 4.6 reviewer for Accounts Phase 1 S6
`t_ad5ea835`. The first Grok review returned CHANGES REQUESTED. Review the
complete final candidate, not merely the author's claims, and decide whether
all findings are actually closed without regressions.

Read-only only: do not edit, stage, commit, merge, push, mutate Kanban, launch
subagents, or search the web. You may inspect history/source and run
proportionate tests. Keep the worktree/index clean.

## Exact custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s6/dialectical-engine`
- Branch: `codex/accounts-s6`
- Base: `0cec59ef6f1dfe938ed872daba984bd6d2291776`
- Original S6: `268fee75ed55b98fbcd6402add848bab42b84aff`
- Harness repair: `fde8230b63e55add5af70fd67a9187a8342117c1`
- Rework 1: `78f1962042e78750d34afdeca23264c41b5dad22`
- Final tree: `5b23e16645e0e3d1e8e4331027030180dc3157c6`
- Whole review range: `0cec59ef..78f19620`
- Finding-fix range: `fde8230b..78f19620`
- Final worktree and index must remain clean.

First review receipt:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S6-grok-final-review-visible.log`
SHA-256 `ad8f5c5d1fa4371d14985c965a26da77362c7909291eb729aaee7c3d21bd6785`.
Read it fully before judging the fix.

Read the binding Phase 1 mission/amendments/decisions, S5/S7 handoffs, S6 card,
migrations, and adjacent persistence/replay/session/ownership code.

## Reproduce or refute every first-review finding

1. **Ambiguous COMMIT/key loss.** A COMMIT-attempt transport error must never
   destroy a possibly committed run key. It must retain the key and surface a
   constant sanitized `RUN_CONTENT_ROLLBACK_INCOMPLETE`; a definite pre-COMMIT
   rollback must destroy the key. Inspect all transaction/error branches and
   failure injection. Also audit crash durability: temp file `wx`, file fsync,
   close, atomic rename, containing-directory fsync, close/cleanup errors,
   permissions, symlinks, and races.

2. **External work under locks.** Run-key provision, key load/unwrap, owner
   resolver calls, filesystem I/O, and first encryption must occur before
   `connect`/`BEGIN`/identity or run locks. Inside transactions only prepared
   in-memory encrypt/decrypt may occur after authorization. Check run creation
   and every carrier, including replay eviction and less obvious copy/clone/
   pull paths.

3. **Nested pool checkout/deadlock.** With encryption disabled, helpers must
   return before any SQL. With encryption enabled, no write transaction
   callback may call `pool.query`, `this.pool`, external encrypt/decrypt, or
   key preparation. Version/owner resolution must use prepared state or the
   held client. Inspect all 26+ callbacks, actual max=1-pool concurrency tests,
   callback- and Promise-form `pool.connect`, and do not accept a fixture-only
   proof.

4. **No-cipher sentinel fallback.** A true pre-0038/default-off database must
   omit 0038 columns and remain compatible. An already-0038 encrypted row with
   no cipher must throw constant `CONTENT_CIPHER_UNAVAILABLE`, never return the
   plaintext sentinel or JSON sentinel. Check both RunRepository projections
   and adjacent read surfaces.

5. **Memory privacy and authorization.** Encrypted memory rows must persist
   `{}`/`[]` placeholders for normalized binding/frozen terms; migration guards
   must enforce them. Owner-scoped candidate enumeration may return only opaque
   references. Evaluate candidates serially: prepare one key outside a short
   transaction; lock run, revalidate latest ownership, held-client fetch, then
   locally decrypt and evaluate. Close/zero immediately. Final source+selected
   write must prepare at most those keys outside, lock in deterministic order,
   revalidate both, then write/pull with held-client SQL and prepared local
   crypto. A claim before decrypt or before final write must produce no decrypt
   failure, disclosure, link, or pull.

   Persisted match metadata must contain no question terms, counts, hashes,
   binding field names, shapes, values, or lengths. Only constant categories
   such as `binding` and `termOverlap` are permitted. Confirm raw-row and actual
   PostgreSQL data-directory scans use distinctive nonempty terms/bindings and
   inspect candidate/link metadata. Check `recordQuestionAndMatch`,
   `#recordAnswerPull`, `observeAnswerContradiction`, and replay eviction.

6. **Complete S6 properties.** Re-audit all original packet properties: 11
   logical groups/14 physical carriers, AAD relocation resistance, external
   key metadata privacy, transaction/crash lifecycle, shred irrecoverability,
   owner-scoped question blind index, 0038 guards/idempotence, default-off and
   enablement fail-closed behavior, dependency architecture, S5/S7 preservation,
   and the separate streamed child-exit harness.

## Evidence to verify, not trust

REDs before production rework:

- Focused S6 run: 10 failed / 15 passed, reproducing ambiguous COMMIT key loss,
  I/O under locks, nested checkout/max=1 timeout, disabled-helper SQL, sentinel
  fallback, and missing fsync/durability error handling.
- Independent memory RED: plaintext distinctive binding persisted instead of
  `{}`; additional terms/datadir assertions followed.

Targeted rework evidence:

- File-key durability and disabled-cipher unit: 13/13.
- Full S6 PostgreSQL: 15/15, including all carriers, max=1 graph, no nested
  checkout, distinctive metadata/raw DB/datadir proof, ambiguous COMMIT, and
  both ownership races.
- Memory PostgreSQL: 3/3; broader affected PG: 9 files / 116 tests.
- Genuine mutants killed decrypt-before-owner-revalidation, skipped final
  owner revalidation, term-count metadata, and binding-field metadata; restored.
- Static TS-AST audit inspected 26 write callbacks. The only prepared crypto
  inside callbacks is local memory decrypt/encrypt after lock/revalidation; no
  callback contains `this.pool`, `pool.query`, external encrypt/decrypt, or key
  preparation.
- Full unit: 76 files / 777 tests. Typecheck, contract generation, production
  build, lint (28 edges / 0 violations; source 0 blockers), and diff-check green.
- Strengthened S13 architecture fixture replaces obsolete one-shot plaintext
  SQL pins with non-vacuous serial evaluator, lock/revalidation/order, prepared
  crypto, placeholder, and metadata assertions.
- Final frozen full: `pnpm test` exit 0, 127/127 files, 1202/1202 tests,
  1993.15s. Pre/post 15-file manifest identical. Frozen rework patch SHA-256
  `fe8fbda820ef55b1558df646bf27843a54980616295f601dce1a50ab5deb098b`.

Adversarially inspect and rerun proportionately. Findings first, ordered by
severity, with exact path/line, mechanism, and smallest correction. Do not
approve merely because receipts are green.

End with exactly one marker:

`GROK S6 REWORK1 APPROVED`

or

`GROK S6 REWORK1 CHANGES REQUESTED`

