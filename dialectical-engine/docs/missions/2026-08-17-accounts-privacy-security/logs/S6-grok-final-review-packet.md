# S6 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S6
`t_ad5ea835`: application-layer encryption at write, external per-run key
custody, decrypt-on-read projections, and cryptographic erasure. You did not
author or route this candidate.

This is a read-only review. Do not edit, stage, commit, merge, push, mutate
Kanban, launch subagents, or search the web. You may inspect source/history and
run proportionate tests. Do not approve merely because tests are green.

## Exact custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s6/dialectical-engine`
- Branch: `codex/accounts-s6`
- Base: `0cec59ef6f1dfe938ed872daba984bd6d2291776`
- S6 implementation commit: `268fee75ed55b98fbcd6402add848bab42b84aff`
- Candidate/HEAD: `fde8230b63e55add5af70fd67a9187a8342117c1`
- Candidate tree: `96418f9f5fae79dc6915066a8f6d56b24c35e3b9`
- Review range: `0cec59ef..fde8230b`
- Worktree and index must remain clean before and after.

Commit 1 is the S6 implementation. Commit 2 is a separate inherited-test
harness repair: it measures post-report child exit rather than timing the
entire 8,512-operation RSS workload. Review both, but do not conflate the
harness correction with the encryption design.

Read the binding Phase 1 mission documents, amendments, decisions, S5/S7
handoffs, migration contract, and S6 card context before judging the complete
range and adjacent persistence/read paths.

## Security properties to attack

1. **Complete carrier coverage.** Confirm all 11 logical carrier groups and 14
   physical tables encrypt new server-owned content at write and decrypt only
   at authorized read boundaries: `core.run`, `core.node`,
   `core.stranger_restatement`, `ledger.raw_artifact`, `serve.fact_bundle`,
   `serve.composed_text`, `ledger.node_review`, `memory.question_key`,
   `memory.pull_record`, `core.investigation_request`, and the four-table
   evidence query/excerpt family. Search for missed direct SQL writers/readers,
   replay/catch-up/evaluator/worker paths, JSON shape drift, and plaintext
   copies in indexes, logs, errors, fixtures, or derived records.

2. **Envelope and AAD integrity.** Verify the AEAD envelope version/nonce/tag
   rules, canonical serialization, and exact AAD reconstruction. A ciphertext
   must not relocate across schema/table, primary key, run, carrier, owner/key
   context, or version. Errors must remain generic. Pay special attention to
   snake_case composed segments, node IDs in evaluator projections, nullable
   legacy artifacts, and cross-package helper boundaries.

3. **Key hierarchy and metadata privacy.** KEK -> user DEK -> per-run debate
   key must keep plaintext keys outside PostgreSQL. The external run-key record
   may persist only run ID, opaque owner_ref, and wrapped envelope—never raw
   user ID, email, token, key plaintext, or joinable identity metadata. Review
   UUIDv4/domain validation, atomic file replacement, 0700 directories, 0600
   files, symlink/path traversal, partial writes, multi-process races, restart
   recovery, permission checks, and sanitized failures. Transient user/run keys
   must be zeroized on success and every failure path.

4. **Transactional lifecycle and crash behavior.** New encrypted run creation
   provisions the wrapped external run key before the database insert, writes
   ciphertext-only rows, and on any SQL/activation failure independently
   attempts rollback and key destruction. It must never swallow incomplete
   cleanup. Analyze crash windows: an orphan wrapped key without DB content may
   remain safe, but no committed ciphertext may lack its key and no plaintext
   may be committed. Inspect concurrent creation/destruction and idempotence.

5. **Cryptographic erasure.** Destroying the per-run debate key must make all
   persisted content carriers unreadable while retaining rows/replay structure.
   Verify restart semantics, missing/corrupt/unresolvable key handling, no
   fallback from an envelope to legacy plaintext, and no accidental re-key or
   regeneration path. Confirm the shred matrix is non-vacuous for every carrier.

6. **Default-off and migration compatibility.** `CONTENT_ENCRYPTION_ENABLED`
   must default false. Missing/invalid enabled configuration must fail closed.
   When disabled against a database migrated only through 0037,
   `RunRepository.startRun`, `readLoadingProjection`, and `readFrozenHead` must
   construct the original SQL shape without referencing any 0038 column; do
   not accept catch-and-ignore of PostgreSQL 42703. When enabled, new
   server-owned rows must be ciphertext-only, while ruled legacy plaintext
   remains explicit and readable. Migration 0038 must be additive,
   idempotent, fail closed on invalid mixed states, and avoid destructive
   plaintext rewrites.

7. **Question equality privacy.** Exact memory matching must use an
   owner-scoped blind index with stable canonicalization and no cross-owner
   oracle. Non-exact matching may decrypt only authorized candidate content.
   Check collisions, versioning, legacy coexistence, and S7 latest-owner
   authorization preservation.

8. **Database guards and roles.** The 14-table write guards must reject direct
   plaintext writes for encrypted/server-owned content without breaking lawful
   legacy or `raw_artifact` rows with no run. Inspect bypasses through UPDATE,
   partial column sets, copied rows, null envelopes, malformed versions, and
   actual runtime/replay privileges. An envelope without a resolvable run must
   fail.

9. **Adjacent behavior and architecture.** Preserve S5 sessions/CSRF, S7 opaque
   ownership/erasure and lock order, replay/ledger semantics, graph/evidence/
   memory/serve/evaluator behavior, graceful shutdown, and dependency-edge
   policy. No external key-store operation may occur under forbidden database
   locks or leak content through audit/logging. Review the lockfile and runner/
   API configuration boundaries.

10. **Harness repair integrity.** In commit 2, the 600-second watchdog must
    still bound total child work, the report marker must be complete and valid,
    and `postReportExitMs` must measure marker-observed to child `close`. The
    unchanged 30-second exit threshold must not be widened or deleted. The
    synthetic pre-marker delay must kill old spawn-clock semantics, and a
    ref'ed post-marker timer must fail the small exit bound. The retained-memory
    positive control must still execute.

## Evidence to verify, not trust

- Initial focused RED: 8/8 expected failures for missing crypto/migration/
  configuration surfaces.
- Focused final: typecheck plus 3 files / 19 tests green.
- 14-table plaintext guard matrix green; PK/carrier/run AAD relocations fail;
  missing and shredded keys are sanitized and 14+ rows remain persisted.
- Actual PostgreSQL data-directory byte scan after CHECKPOINT found none of four
  distinctive plaintexts.
- Affected unit/architecture 138/138 and affected PostgreSQL 93/93 green.
- Full unit 76 files / 771 tests, typecheck, contract generation, Next build,
  lint (28 architecture edges / 0 violations, 0 source blockers), and
  diff-check green.
- Genuine write-guard bypass mutant went RED and was byte-restored. Temporary
  read-decrypt and no-op-shred weakenings were refused by the platform safety
  gate; do not represent them as executed mutants.
- Pre-0038 compatibility RED was PostgreSQL 42703; final disposable-PG test
  covers write plus both reads on schema through 0037 without 0038 columns.
- Harness RED: old spawn clock measured a 500 ms pre-marker delay against a
  250 ms exit bound. Repaired real detector reported total 28.1 s but
  post-report exit 7.3 ms; 64 MiB retained control exceeded the unchanged 2 MiB
  plateau bound.
- Final frozen-byte `pnpm test`: exit 0, 127/127 files, 1188/1188 tests,
  1994.43 seconds. Frozen tracked diff hash before/after:
  `1de12460b434bdbada6cc56e8652519dd8d855876f704c21a89b602179535f7b`.

Adversarially inspect and rerun proportionately. Return findings first, ordered
by severity, with exact file/line, exploit or failure mechanism, and the
smallest correction. If no blocking finding remains, say so explicitly.

End with exactly one marker:

`GROK S6 APPROVED`

or

`GROK S6 CHANGES REQUESTED`

