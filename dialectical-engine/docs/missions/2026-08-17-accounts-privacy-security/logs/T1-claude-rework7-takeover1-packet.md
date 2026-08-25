# T1 Rework7-A — sole-author takeover after custody correction

Date: 2026-08-22 13:15 EEST
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Takeover session: `53a219db-3337-45ad-838d-93fb5c4ea78f`

## 1. Authority and correction

Continue the six-term V-approved Rework7-A contract in:

- `logs/T1-claude-rework7-draft-packet.md`
- sha256 `72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8`

This packet changes no product decision, limit, policy value, path scope, or
acceptance gate. It corrects author custody and transfers the current RED-first
test work to one fresh visible Claude Opus 5 seat.

Router incorrectly treated sandbox-denied `kill -0` probes as evidence that the
original author processes had exited. They had not. A duplicate resume seat was
briefly launched at 13:07 EEST. Once the overlap was mechanically confirmed:

1. the duplicate process group `45699` (`Claude 45704`) was TERM/reaped;
2. the original process group `41974` (`Claude 41978`) remained the sole author
   while it completed current RED-test edits;
3. product and policy bytes were verified entry-exact;
4. at a boundary with no active test child, the original group was TERM/reaped;
5. this fresh takeover is the only seat authorized to continue.

Do not repeat the superseded claim in the prior recovery progress section that
the original process had already died. Append this correction to
`logs/T1-rework7-progress.log` before further edits.

## 2. Receipt classification

Preserve all existing receipts; do not delete or rewrite them.

- `T1-rework7-red1-unit.log` and `.status` are **INVALID AS CUSTODY EVIDENCE**.
  Original RED1 ran from `2026-08-22T10:04:25Z` to `10:08:45Z`; the accidental
  duplicate opened/truncated the identical log/status names at
  `10:08:37Z`. The status is `1`, but the stream provenance overlaps.
- Before any product or policy edit, run the unchanged current unit RED block
  once under fresh names `T1-rework7-red1b-unit.log` and `.status`. Require raw
  nonzero status and the intended missing-admission/deadline/drain failures.
- `T1-rework7-red2-architecture.log` and `.status` were uniquely written by the
  original author; raw status is `1`. Preserve and classify the failures.
- RED3 was not run. Complete/inspect the current integration RED edits, then run
  the exact focused RED command under new `T1-rework7-red3-integration.*`
  receipts before product or policy edits.

No current GREEN, full-suite, reviewer, commit, push, or Done evidence exists.

## 3. Exact takeover custody

Required HEAD: `7918f4f8bff33909792afc01dc38d402972b4ccd`

Required index: empty.

Required 12-path manifest:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
6c346dc0d3e6a1d3ced18d9ca097260c7b3a37a806bc32cd25a50b0a35af9fb4  tests/integration/registration-database.test.ts
fb71ea55e11d95505f0e64a58dcb68c2e970cb14d8ac4a9ff4f53e0d5d83f2cd  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
d9258672c799a0f8c4d5aeb9d00f6a13220d592029fcbc392eff7b5384a70d4d  tests/architecture/t1-argon2-worker-contract.test.ts
```

The three product/policy paths are still byte-identical to source-packet entry.
Only the three allowed test paths contain Rework7 RED authoring. Stop
`CODEX BLOCKED (takeover custody)` on any mismatch, non-empty index, live prior
Claude process, or unexplained out-of-scope drift. Do not restore or clean the
three test paths; they are the work to take over.

## 4. Required sequence

1. Read this packet and the source packet completely and verify both hashes.
2. Verify no prior Claude process for session `54efe6f8-...` or recovery wrapper
   `2cd54ad7-...` remains; verify HEAD/index/12 hashes exactly.
3. Claim the ticket as `claude-opus` for 43,200 seconds and post a takeover
   `WORKER CLAIM` with this session and custody.
4. Append the custody correction and receipt classification to the progress log.
5. Inspect all current Rework7 unit/architecture/integration test edits. Before
   product/policy edits, produce durable RED1b and RED3 receipts and classify
   RED2. Correct test-only defects if necessary, preserving RED-first proof.
6. Implement the complete source-packet contract in the three allowed
   product/policy paths, then GREEN, refactor, real-timeout gates, and VR-10.
7. Remain inside the same six governed source/test paths plus authorized mission
   evidence. Do not touch crypto worker/pool, DB identity, migrations, error
   mapping, mail transport, or unrelated dirt.
8. Do not run the repository-wide full suite, stage, commit, push, move Done, or
   launch nested agents, Grok, Hermes model, Fable, or local models.
9. End only with `REWORK READY FOR PEER REVIEW`,
   `ROUTER FULL SUITE REQUIRED`, or `CODEX BLOCKED`, after all foreground
   children exit and final custody/evidence is durable.

