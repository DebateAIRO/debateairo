# T1 final Sol xHigh review packet

## Authority and frozen custody

- Ticket: `accounts-phase1` / `t_b225b2f2` (T1).
- Repository: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- HEAD: `694b8c06d7194ef5f3c3da5dee745beae847e605`; index empty.
- Review read-only. Do not edit, stage, commit, run tests, change the board, or invoke external models.
- Grok is decommissioned. These are the fresh GPT-5.6 Sol xHigh final reviews required by the mission.
- Binding packets:
  - `T1-claude-rework1-packet.md` sha256 `d18aedac586bb6d0965de6cce8fee8c90d3d43735062e53499a96a5cb33d0424`
  - `T1-claude-rework1-resume1-packet.md` sha256 `6cdb0c491a1b8ba8d8eb68ae1da0f136526fb64dec16c4e876f4cce01e0e9519`
  - `T1-claude-rework1-resume2-packet.md` sha256 `38626cacd33ca6cb9cdfd826b5235dbea2955f04e95993802b52b07d81be65e3`

## Exact final candidate hashes

| Path | SHA-256 |
|---|---|
| `apps/api/src/index.ts` | `0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a` |
| `apps/api/src/main.ts` | `bb838089b7be0ecbc45eaa4193c7b7364fcc978bd7cde389f7dbdc10277de5fd` |
| `apps/api/src/registration.ts` | `bb640b7226983152d1288d59cb988a5d00284f70dce19521a65365cc3b0a0f55` |
| `packages/crypto/src/index.ts` | `66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6` |
| `packages/crypto/src/argon2-worker.ts` | `c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b` |
| `packages/crypto/src/argon2-worker-pool.ts` | `af84e900a611f9719397fcf905a66cc157a8a06b47e24cea79dbace305563124` |
| `packages/db/src/identity.ts` | `2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f` |
| `packages/register/src/auth-policy.ts` | `8888ada84634d545ca1750a8e10f3f9004c61bb5e7cf326bdb66673650e35d04` |
| `tests/integration/registration-database.test.ts` | `958d1eb2697ca0f5ad3663635fa08aa125dc8c675c6b5f0e1695f23b5e40c5bc` |
| `tests/unit/registration.test.ts` | `ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b` |
| `tests/unit/argon2-worker-pool.test.ts` | `3429d105545ac6083e8692b8aa54da25f26b100ef68f00a9b3bf45f541f0b4b9` |
| `tests/architecture/t1-argon2-worker-contract.test.ts` | `cde05328176109b01444af7927533b7ddfc60f426556a2e751683108c3228f76` |

Only the final two test hashes changed after the complete integration receipt: assertion-order observability in the S3b test and a 5-second named readiness-hang watchdog. Product bytes are unchanged.

## Evidence map

- Complete durable integration: `logs/T1-rework1-resume1-integration-battery.log` — 55 passed, one expected frozen N=2 calibration assertion failure, 56 total, duration 1451.09s, pre/post custody exact. Product bytes equal current; integration test later changed only by moving the unchanged frozen assertion block last.
- Final VR-10: `/tmp/t1r1/resume2/vr10-full-campaign.log` sha256 `0a5d087491ae87489ca8d2b542fbff52b34b5cf2eb0ee2a0a11a0f824c933c95`; JSON `/tmp/t1r1/resume2/vr10-results-final.json` sha256 `9f9196afac51a69a4222522252206cb6fd01b6e357c11582c36c0c6107e29cfc`. Result: 32/32 non-equivalent mutants RED, one explicitly proved equivalent, stronger dual-guard mutant RED, 33/33 restored, final exit 0. Mutant 24 now goes RED in 5.7s with `READY_HANDSHAKE_HANG`, not a generic timeout.
- Memory: fresh isolated 2 MiB detector green (`0.047 MiB` in complete integration) and retained-allocation positive control red (`12.172 MiB`); exact aggregate count 8512. In-flight real-pool peak observed `317.9 MiB`, so the old provisional 256 MiB ceiling is invalid and must not be ratified as operator/whole-API scope.
- Calibration harness self-test: `/tmp/t1r1/resume2/calibration-selftest.log`, 16/16 broken records rejected, known-good accepted. A later temporary parser fix strips ANSI before summary parsing and makes each invalid repeat exit nonzero; no candidate file changed.
- Three final isolated calibration checkpoints:
  - repeat 1 JSON sha256 `0581845e350759bf8f279388ffa4f83ddbee5e0abd41daaf4f3d56b5248b9dba`
  - repeat 2 JSON sha256 `8ed2ccccfee761adab61e8fbef64ca954498c5386effdd68e18e43a4fba250c1`
  - repeat 3 JSON sha256 `583d44751f6f2eec00cfbc5be959c3749f26a25c616ff7c9b27a5e8865d0d4b3`
  - aggregate JSON sha256 `f9dc0cdb3bfc2e7cc9cc018b2c86cd128e314d6a21989e5b77fb8a192aaeba3a`
  - driver log `/tmp/t1r1/resume2/calibration-durable.log` sha256 `1341f3b3a46603d6833f26402db461cf9836d0de12e0189c5c788415e8e1ab43`
- Every repeat individually valid: all five cells, sole frozen failure last, opacity/audit/mail assertions passed, B4 exit 0, burst 100=`100/100/100`, bursts 128 and 160=`103/103/103`.
- N=3 headroom was positive all three times: `+113.1`, `+111.2`, `+75.4 ms`.
- N=4 straddled zero: `+7.0`, `+9.2`, `-6.5 ms`. Therefore raw maximum absorbed was `[4,4,3]` and strict stability aggregate exited 1. This is evidence **against** claiming N*=4. The Router/user's previously approved conservative option is a new versioned N*=3 row, with 45 ms unchanged; assess whether the three positive N=3 results justify that conservative guarantee despite deliberately failed raw-maximum stability.

## Review questions

### Code reviewer

Review the entire actual product diff and final tests. Look especially for verification misclassification/resource-envelope bypass, worker handle/restart/close races, readiness hangs, exact protocol validation, cache privacy/TTL/LRU, auth 503 opacity, shutdown ordering, DB-transaction ordering, cross-route consequences, and any remaining P1/P2 issue. Return `APPROVED` or `CHANGES REQUESTED` with file/line evidence. Separately label evidence-only or future-scope observations.

### Test/evidence reviewer

Audit the receipts and final test code for non-vacuity, correct named mutant mechanisms, exact restoration/custody, valid complete-integration interpretation, the 2 MiB detector/positive control, exact 103 capacity, and the conservative N*=3 decision. Decide whether a final fresh full-suite custody run on these final two test hashes is sufficient next, or whether any pre-custody evidence/code change is required. Return `APPROVED` or `CHANGES REQUESTED` with exact evidence.

