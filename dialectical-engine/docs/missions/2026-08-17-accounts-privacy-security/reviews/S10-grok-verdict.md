GREENLIGHT

Independent Grok final security review of the frozen S10 candidate on `codex/accounts-s10` at `ef12714cb5969da6fadb803ecacd53aed5e93bac`. Packet `docs/missions/2026-08-17-accounts-privacy-security/reviews/S10-review-packet.md` was the sole scope authority. No other reviewer was invoked. No fix, commit, push, merge, deploy, or board change was performed.

## 1. Findings (P0, then P1, then lower)

No live P0. No live P1. No foreign-byte divergence. Terminal full receipt and both prior RED histories reconciled. No GREEN mutant left in the tree.

1. **P3 — historical Option-C hash in the VR-10 execution record is not the live sealed fix-report hash.** `docs/missions/2026-08-17-accounts-privacy-security/logs/S10-vr10-execution-record.md:118-119` records `ec7e0d4dbbaaed9c665bd8a8302780214ee9000aed6a0176f706917dbe246d42` as the “visible post-scan fix report SHA-256.” The live sealed file at `/private/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/codex-security-scans-533dYG/accounts-s10/ef12714cb5969da6fadb803ecacd53aed5e93bac_20260824T214905Z_e170pma9/artifacts/fix_report.md` hashes to `0198e67d6c41a4f2ffd5c2b61d6a8db9dc1419787c97341d299ea9ae3f59f44e`, which matches the packet gold table. The same execution record later records the correct terminal-full receipt (`:366-379`). This is checkpoint documentation drift, not a live invariant break and not a false GREEN claim.

Packet-listed residuals were inspected and **not** upgraded: `CLEANED_WITH_LEGACY_RESIDUAL`, current-public snapshot survival, T6 historical audit classification, event-local C4 correlation, WAL/PITR/backups, RAM/swap/core dumps, healthy-storage opacity excluding >600 ms stalls, owner-admission fence ending at durable `startRun` commit, and the three pg@9 overlapping-`client.query()` deprecation warnings.

## 2. File:line evidence and source-to-sink reasoning

### Surface 1 — Authentication / session / grants

Cookie/CSRF/origin is the public mutating boundary (`apps/api/src/index.ts:145-146`, `:313-317`, `:397-398`, `:430-436`). Account schedule requires exact `DELETE MY ACCOUNT` at parse (`packages/contract/src/index.ts:223-226`) plus a cookie `authenticatedSession` (`apps/api/src/index.ts:598-609`). A configured legacy `x-user-dev-token` cannot populate that field and is 409 `COOKIE_SESSION_REQUIRED` (`apps/api/src/index.ts:445-447` vs `:598-601`; `tests/unit/s10-erasure-http.test.ts:136-141`). Step-up discriminants are exact: account grants are targetless and DB-bound to `user_id`; run grants must carry the exact run (`migrations/0040_account_erasure.sql:3408-3418`, `:3459-3464`; HTTP crossed-shape 400 at `tests/unit/s10-erasure-http.test.ts:164-179`). `DELETE_ACCOUNT` consume is one-use (`0040:5021-5029`) with the grant as the schedule idempotency key (`0040:4998-5018`). Suspended-account status uses a distinct authenticator only for `GET /v1/account/erasure` (`apps/api/src/index.ts:417-424`; `0040:3025-3058`).

### Surface 2 — Database roles / capabilities

Boot attestation refuses URL aliasing (`packages/register/src/runtime-environment.ts:94-104`), LOGIN/capability crossover, superuser/admin, predefined-role membership, table DML/TRUNCATE, and EXECUTE drift (`packages/db/src/account-erasure.ts:163-311`; `packages/db/src/index.ts:194-228`; `apps/api/src/main.ts:97-107`). Capability roles are NOLOGIN (`account-erasure.ts:306-307`). Erasure functions are REVOKEd from PUBLIC/runtime and GRANTed only to `debateai_erasure_runtime` (`0040:6195-6356`). WhatsApp/`phone_ciphertext` fail closed at migrate and trigger (`0040:10-62`).

### Surface 3 — Lock order / concurrency

Canonical T9 prefix is encoded in PREPARE/FINALIZE (`0040:5422-5570`, `:5708-5776`) and the T9 matrix. Nested private/publication/admission leases refuse scope expansion (`packages/db/src/index.ts:332-336`, `:872-884`; `packages/db/src/publication-lease.ts:76-84`). Owner admission uses a dedicated-session advisory lease from liveness through durable `startRun` on the held client (`packages/db/src/index.ts:828-865`, `:1067-1108`; `apps/api/src/index.ts:1176-1215`). Constructor alias of admission pools fails closed (`apps/api/src/index.ts:1176-1180`; `apps/api/src/main.ts:88-95`). Crash release is backend-owned advisory unlock. Forced both-order schedules: `tests/integration/s10-t9-account-erasure-races.test.ts` 5/5.

### Surface 4 — Cryptography / carriers

Private envelope attestation is run-key-derived and provision-only (`packages/db/src/index.ts:78-85`, `:1090-1133`). Encrypted QBI must be NULL/v2; v1 encrypted rows fail migrate (`0040:230-248`). Account PREPARE/finalize destroy private run keys then the user DEK under the notification lease, with DESTROYED/ALREADY_ABSENT partitions and fresh-store readback (`packages/db/src/account-erasure.ts:592-719`, `:685-693`). Parse diagnostics stay inside the envelope (`S10-carrier-derived-data-inventory.md` + architecture RED contracts, 13/13). Public aggregate transport has no run-key/raw-gateway dependency (`packages/evaluator/src/public-aggregate-provider.ts:62-90`; worker factory `apps/evaluator-worker/src/index.ts:117`).

### Surface 5 — Audit / ref severance

Erasure finalize uses `append_audit_event_internal` with constant event-local schema JSON and no copied request/header identity (`0040:5782-5794`; TS `void input.source` at `packages/db/src/account-erasure.ts:571-572`, `:868-872`). Attempt consumption and single-head append remain the T9/session contract. `CLEANED` vs `CLEANED_WITH_LEGACY_RESIDUAL` is a DB status partition (`0040:5822-5826`) and is not collapsed to encrypted-only `CLEANED` on the account path.

### Surface 6 — State machines / notifications

Grace is `interval '604800 seconds'` with an explicit DST comment forbidding calendar `7 days` (`0040:4961-4964`). Clients cannot supply `execute_at`. Zero supported channels abort before grant consume/request insert (`0040:4970-4978`, `:5052-5056`). Cancel is generation-bound to `cancellation_ref` + scheduling session (`0040:5155-5174`). Due work is retry-fair (`ORDER BY reconcile_attempt_count, COALESCE(prepared_at,execute_at)` + SKIP LOCKED, `0040:5856-5880`). Completion requires every user-wide outbox row ACKed (`0040:5986-6004`, checked again before shred at `account-erasure.ts:648`). Sender holds the per-user advisory lease across DEK load, decrypt, send, ACK, and zeroization (`apps/api/src/account-erasure.ts:153-181`).

### Surface 7 — HTTP / client / UI

HTTP tests prove cookie/CSRF/origin, exact phrase, targetless account grant, opaque private IDs, PROCESSING-only suspended status, and typed no-channel conflict (`tests/unit/s10-erasure-http.test.ts` 8/8). Both UIs require `DELETE MY ACCOUNT` and targetless `DELETE_ACCOUNT` (`apps/ui/components/AccountErasureControls.tsx:10,50-58`; `web/components/AccountErasureControls.tsx:7,47-54`), poll status every 5s, hide cancel once `PROCESSING`, and warn that public copies and claimed legacy residual are not a full clean. Same-origin API-base normalization refuses backslash and `..` (`apps/ui/lib/api.ts:38-67`; `web/lib/api.ts:3-27`). Both debate pages unmount and clear already-decrypted sentinels on PENDING/CLEANED (`apps/ui/app/debate/[id]/DebatePageClient.tsx:450-466`; `web/app/debate/[id]/DebatePageClient.tsx:49-60`; render tests 8/8).

### Surface 8 — Resource / evidence honesty

`MAX_OWNER_PRIVATE_HISTORY_SCAN = 128`; both liveness and memory `LIMIT 129` and throw `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` before any content lease/key load (`packages/db/src/index.ts:67`; `packages/liveness/src/index.ts:152-159`; `packages/memory/src/index.ts:618-626`; API maps to 422 at `apps/api/src/index.ts:1246-1248`). Codex scan `aaa31460-f883-4d6a-9cf3-67e9c629a8fd` finding `csf_25bea213e7f8444fa7ddaedf` is the pre-repair unbounded scan; live source implements the packet repair. Registration hash-first + 5,700 ms reservation (`packages/register/src/auth-policy.ts:772-776`; `apps/api/src/registration.ts:1369-1382`). Evidence artifacts name residuals and refuse legal/anonymity/universal-deletion claims (`S10-erasure-evidence-artifact.md`; architecture evidence tests 3/3).

## 3. Commands run and measured outcomes

All commands from repository root `dialectical-engine/`. No heavy command concurrent. No second full suite.

| Command | Result |
| --- | --- |
| `git status --short --untracked-files=all` (entry+exit) | EXIT 0; 82 `M` + 21 `??` = 103 in-scope paths; after verdict write the only extra untracked is this file |
| `shasum -a 256 -c /private/tmp/s10-option-c-final-freeze.sha256` (entry+exit) | EXIT 0; 121/121 `OK` |
| `git diff --check` (entry+exit) | EXIT 0; empty |
| Live SHA-256 of 13 packet gold-table paths | 13/13 MATCH (python hashlib) |
| Live SHA-256 of 17 named receipts + sealed `artifacts/fix_report.md` | all MATCH packet hashes |
| `pnpm vitest run tests/architecture/s10-erasure-evidence.test.ts tests/architecture/s10-carrier-erasure-red.test.ts tests/architecture/s6-content-encryption-contract.test.ts` | EXIT 0; 3 files, 21/21 |
| `pnpm vitest run tests/unit/s10-erasure-http.test.ts tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-mail-channel.test.ts` | EXIT 0; 4 files, 20/20 |
| `pnpm vitest run tests/integration/s10-t9-account-erasure-races.test.ts` | EXIT 0; 5/5 |
| `pnpm vitest run tests/integration/s6-content-encryption-database.test.ts` | EXIT 0; 47/47 |
| `pnpm vitest run tests/integration/s8-publication-database.test.ts` | EXIT 0; 26/26 |
| `pnpm vitest run tests/integration/session-database.test.ts` | EXIT 0; 11/11 |
| `pnpm vitest run tests/integration/identity-database.test.ts` | EXIT 0; 4/4 |
| `pnpm typecheck` | EXIT 0 |
| `pnpm lint` | EXIT 0; architecture `{violations:[]}`, source `{blocking:[]}` |

## 4. Temporary probes

No temporary probe mutated any tracked or untracked in-scope file. Review used read-only git, hashlib, JSON parse of receipts, and packet-listed test/typecheck/lint commands. No entry/exit hashes are required beyond the freeze/gold table already live-checked. Scratch captures live only under the reviewer private directory.

## 5. Receipt reconciliation

**Reconciled: YES.**

- Terminal full `/private/tmp/s10-third-full-final.json` live SHA-256 `a1546a4ec279185267a444cc62915fea1d0cf114fad5a9692d3a08156b476bef` MATCH. JSON: `success=true`, `testResults.length=139`, suites 400/400, tests 1345/1345, failed/pending/todo 0.
- Second full RED `/private/tmp/s10-second-full-final.json` live SHA-256 `b7e3bfbea4abd8211b172d4e63268c12743b18dffeacf335a16fbc2e2426a9c5` MATCH. JSON: `success=false`, 1343/1345 tests, two FILE_FAILED (`tests/architecture/s6-content-encryption-contract.test.ts`, `tests/integration/identity-database.test.ts`) ⇒ 137/139 files. Repair receipts 5/5 S6-arch and 4/4 identity-db MATCH; restored architecture 158/158 MATCH.
- First-full eight-file completion receipts all hash-MATCH (registration 66/66, session 11/11, database 59/59, evaluator add-on 9/9, consumer 6/6, evaluator database 21/21, harvest 10/10, acceptance ceremony 2/2), plus combined S6/S7/S8/T9 90/90 and RSS evidence hashes.

Inability to reconcile: NO. Duplicate full 139-file suite was not rerun; JSON+hash plus the lighter packet commands resolved integrity.

## 6. Scope inspected / not inspected

**Inspected:** packet; freeze manifest; gold-table bytes; all named receipts above; sealed Codex scan `aaa31460-f883-4d6a-9cf3-67e9c629a8fd` (`scan-manifest.json`, `findings.json`, `report.md`, `artifacts/fix_report.md` hash `0198e67d…`); mission logs `S10-erasure-evidence-artifact.md`, `S10-erasure-runbook.md`, `S10-carrier-derived-data-inventory.md`, `S10-t9-lock-privilege-callsite-matrix.md`, `S10-vr10-mutation-matrix.md`, `S10-vr10-execution-record.md`; core production (`migrations/0040_account_erasure.sql`, `packages/db/src/account-erasure.ts`, `publication-lease.ts`, `packages/db/src/index.ts`, `apps/api/src/{account-erasure,index,main,sessions,registration}.ts`, `packages/evaluator/src/public-aggregate-provider.ts`, liveness/memory owner-scan, both UI erasure/settings/debate/API-base surfaces); eight attack surfaces against Settled Router authority; bounded commands listed above; entry+exit custody; leftover-process/PTY check (none).

**Not inspected:** other stages S0–S9/S11+ as independent reviews; live production hosts; physical WAL/PITR/backup media; RAM/swap/core dumps; third-party MTA/provider deletion; a second full `pnpm test`; Graphite/board state; any Opus/Claude/Hermes reviewer output.

Inventory: 103 packet paths MATCH (82 tracked + 21 untracked including this packet). The only additional untracked path after this write is `docs/missions/2026-08-17-accounts-privacy-security/reviews/S10-grok-verdict.md`.
