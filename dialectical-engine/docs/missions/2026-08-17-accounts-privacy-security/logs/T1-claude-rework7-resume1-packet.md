# T1 Rework7-A — interrupted author recovery packet

Date: 2026-08-22 13:04 EEST
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Source author session: `54efe6f8-51bb-4b82-b458-f4d94db30d73`
Recovery wrapper id: `2cd54ad7-a704-4b11-845a-32a94791ea0a`

## Authority

Resume the same Claude Opus 5 author conversation and continue the already
V-approved Rework7-A implementation. The sole product contract remains:

- `logs/T1-claude-rework7-draft-packet.md`
- sha256 `72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8`

This recovery packet changes no product decision, acceptance threshold, allowed
path, or test contract. It authorizes custody continuation after the visible
Terminal/wrapper disappeared before writing a status receipt.

## Interruption evidence

- The prior wrapper PID `41974` and Claude PID `41978` no longer exist.
- `T1-rework7-54efe6f8-51bb-4b82-b458-f4d94db30d73.status` is absent.
- The prior stream ends during RED-test authoring; it contains no result and no
  `REWORK READY FOR PEER REVIEW`, `ROUTER FULL SUITE REQUIRED`, or
  `CODEX BLOCKED` handoff.
- Durable progress contains entry custody only.
- `/tmp/t1r7/unit-append.ts` exists as non-durable scratch (442 lines,
  sha256 to be recomputed by the recovering author). Inspect it before deciding
  what can be reused; do not assume it is correct or complete.

## Recovery custody

Required HEAD: `7918f4f8bff33909792afc01dc38d402972b4ccd`

Required index: empty.

Current 12-path readback immediately after the interruption:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
fb71ea55e11d95505f0e64a58dcb68c2e970cb14d8ac4a9ff4f53e0d5d83f2cd  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1  tests/architecture/t1-argon2-worker-contract.test.ts
```

The only post-entry governed drift observed is the allowed unit-test path:
`tests/unit/registration.test.ts` changed from entry sha `ebfbfce7...` to
`fb71ea55...` while the first RED block was being drafted. Preserve and inspect
that partial author work; do not restore it merely to satisfy the original
entry hash. All other 11 governed paths remain at their entry hashes.

Stop `CODEX BLOCKED (recovery custody)` on any further unexplained mismatch,
non-empty index, or out-of-scope edit. Do not clean, stage, commit, or touch
unrelated dirt.

## Resume procedure

1. Read this packet and the source Rework7-A packet completely.
2. Reclaim/claim the running ticket as `claude-opus` for 43,200 seconds and post
   a recovery `WORKER CLAIM` naming both the source session and recovery wrapper.
3. Append the interruption and exact recovery manifest to
   `logs/T1-rework7-progress.log` before further edits.
4. Continue RED-first authoring from the partial unit-test edit and scratch only
   after inspecting both. Produce durable raw RED receipts before product GREEN.
5. Remain confined to the six source/test paths and mission evidence authorized
   by the source packet.
6. Do not run the repo-wide full suite, stage, commit, push, move the ticket to
   Done, or launch nested agents/models.
7. End only with `REWORK READY FOR PEER REVIEW`,
   `ROUTER FULL SUITE REQUIRED`, or `CODEX BLOCKED`, after foreground children
   exit and final custody/evidence is durable.

