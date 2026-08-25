# T1 rework 2 — final Sol peer-review packet

## Role and custody

You are a fresh, read-only GPT-5.6 Sol xHigh reviewer. Do not edit repository files, run tests, stage, commit, push, update Kanban, or invoke Grok/Claude/Hermes/Fable models. `hermes kanban` is not needed for this review.

Review the actual frozen T1 candidate in:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Entry/review HEAD is `9801f85d97e4263a7c8311304e29d6a03c4a6d15`, whose parent is the prior T1 base `694b8c06d7194ef5f3c3da5dee745beae847e605`. A concurrent repository-reorganization commit captured 10 of the 12 earlier T1 paths; therefore a working-tree-only diff is not the full T1 review surface. Inspect the frozen files themselves and, where useful, compare them to `694b8c06`.

The git index must remain empty. Existing unrelated dirt belongs to other lanes and must not be touched:

- `../.claude/launch.json`
- `../.gitignore`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/run-claude-seat.sh`
- `docs/missions/2026-08-21-observability-loop/**`

## Frozen candidate manifest

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f  apps/api/src/main.ts
c2f8b8dedc1bd8814ae8933af638faf70a6f9b5079237d59c3f61a5815395caa  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
ec334d38bd54880cd291f675f1bd79b4933334103732906a369bd6e5e296d247  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52  packages/register/src/auth-policy.ts
7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58  tests/integration/registration-database.test.ts
ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b  tests/unit/registration.test.ts
b7476cf01461c6c49cd0fbc2057e0957b07d54e56035685c82bcf3e6f278cf85  tests/unit/argon2-worker-pool.test.ts
07bd2d320bd06ba250017843b30e638cbcf35f5322029595f7061c285e133ae9  tests/architecture/t1-argon2-worker-contract.test.ts
```

Author session: `82bc515e-8e3c-4483-91e3-64d58da71421` (Claude Opus 5, visible Terminal, clean exit). Author result and complete narrative are:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework2-claude-result.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework2-progress.log`
- binding author packet `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework2-packet.md`, SHA-256 `2dfa8a749c5319ccc4ef9bd7c708aecc941982fd4149247682737531c2bad799`

## Required product properties

Review skeptically; the author does not self-approve. At minimum confirm or reject:

1. One process-owned two-worker Argon2 pool; 32 credential / 96 audit / 128 total outstanding; off-main-thread work; typed fail-closed saturation/fault behavior; no main-thread fallback.
2. Worker termination rejection does not count as death, release physical custody, or permit overlap with replacement. Explicit exit or resolved termination can confirm death. Close must remain bounded and must not falsely report closed while custody is unconfirmed.
3. Once pool state becomes `CLOSING`, no queued secret-bearing work can dispatch. Queued payloads are rejected once and zeroed.
4. Successful password-hash responses must match the exact requested memory cost, time cost, parallelism, salt, and digest length. Only the one lawful worker failure code is accepted.
5. Registration post-response mail dispatches and refusal-audit flushes drain before the audit hasher/pool close. The refusal-audit drain must fire the existing pending window immediately and durably, not wait 60 seconds, double-write, or lose work.
6. The historical version-1 N*=2 row stays unchanged. A separate current version-2 decision publishes conservative N*=3, 45 ms cadence, 430 ms ruled upper, 35 ms ruled headroom, exact observed capacity 103, and explicitly does not claim N*=4.
7. Existing authentication opacity/error mapping, audit durability/chain, token semantics, and database transaction placement remain intact.
8. Reorganization at HEAD `9801f85` introduces no direct-import/runtime breakage for these paths.

## Evidence contract

Author reports, on the final manifest:

- typecheck exit 0
- lint exit 0, 28 architecture edges, no violations/blocking findings
- `git diff --check` exit 0
- focused unit + architecture: 160/160 pass
- B4 PostgreSQL capacity: pass; 100/100 at burst 100 and exact 103 at burst 128/160
- S3b PostgreSQL calibration: pass; current N*=3 observed max 397.2 ms / +67.8 ms, N*=4 -11.4 ms and not claimed
- VR-10 rework2 campaign: 27/27 non-equivalent mutants RED via intended named mechanisms, zero restore failures, zero foreign residue

Receipts are under `/tmp/t1r2/{red,green,vr10}` and the durable progress log above. The repository-wide `pnpm test` has intentionally not run after rework; it is reserved for a fresh visible Claude final-custody seat only after peer approval.

## Frozen RSS ruling

Do not approve or publish 256, 320, or 1024 MiB as an operator ceiling. The only current fact is an observed peak around 317.9 MiB. The packet-prescribed exact whole-API 32/96/128 peak cannot be measured without adding a production telemetry/load seam outside the contract. Functional queue/worker bounds are still reviewable. Treat the operator-RSS item as an explicit Router/V waiver decision, separate from code correctness.

## Deliverable

Return exactly one primary verdict: `APPROVED` or `CHANGES REQUESTED`.

For every blocking finding, provide severity, exact file/line evidence, a concrete failing trace, and the smallest safe correction. Separate product blockers, test/evidence blockers, and residual/nonblocking risks. Recheck HEAD, index, and all 12 hashes immediately before finalizing. Do not rely on another reviewer’s conclusions.
