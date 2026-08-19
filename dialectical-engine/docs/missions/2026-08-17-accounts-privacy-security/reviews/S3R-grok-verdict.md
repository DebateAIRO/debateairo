# S3R Grok-lens verdict

**GREENLIGHT**

Ticket t_3c875ffb / S3 rework of R1, R2, R3, and the lockfile, including
the 16:42–16:46 EEST second rework (protected at-limit buckets, persisted
refusal counts, crypto lockfile importers). Blind lens: this file does
not cite or open the other diamond verdict. True scope is from
`find -newermt '2026-08-19 15:30:00'` plus `stat` (not `git diff` as the
scope oracle), re-run after the tree moved. Original S3 implementation
(15:04–15:30) is frozen except the required VR-3 non-regression. Aug-17
rename churn, `node_modules`, `web/.next`, `acceptance/.pgdata`, and
toolchain symlink noise are ignored. This review did not edit product
or test files.

Current product / test / lockfile (stat 16:50 EEST; rework-2 files
supersede the 16:06 tree the first draft of this verdict described):

| mtime | path |
|---|---|
| 16:02:24 | `tests/unit/evaluator-dev-menu-api.test.ts`, `tests/unit/identity-crypto.test.ts` |
| 16:06:37 | `apps/api/src/mail-channel.ts`, `apps/api/src/main.ts`, `packages/crypto/SECRET_STORE_LAYOUT.md`, `packages/register/src/auth-policy.ts`, `packages/register/src/runtime-environment.ts` |
| 16:42:07 | `packages/db/src/identity.ts` |
| 16:42:18 | `pnpm-lock.yaml` |
| 16:44:54 | `apps/api/src/registration.ts`, `tests/unit/registration.test.ts` |
| 16:46:07 | `tests/integration/registration-database.test.ts` |

## Findings

1. **R1 — mail send is outside the measured window; slow-transport oracle does not reappear. HOLD.**
   `register` / `resend` await `holdEnumerationFloor` and only then call
   `dispatchVerification` (`apps/api/src/registration.ts:456-461`,
   `:548-550`). Dispatch uses `setImmediate` and does not await the
   transport (`:329-337`). Floor is
   `policy.verification.enumerationResponseFloorMs` (`:255-259`;
   `packages/register/src/auth-policy.ts:84`). **Live** (current tree,
   two focused runs + 3000 ms scratch probe against shipped
   `RegistrationService`):

   | mail_ms | run 1 Δ | run 2 Δ | 3000 ms probe Δ | tolerance |
   |---|---|---|---|---|
   | 0 | 3.0 | 2.1 | — | 100 |
   | 400 | 1.8 | 1.4 | — | 100 |
   | 1000 | 12.7 | 2.4 | — | 100 |
   | 3000 | — | — | **2.7** | 100 |

   Bodies stayed byte-equal. Oracle did not reappear.

2. **R1 — transport timeout is a ruled register row, not a constant. HOLD.**
   `transport_timeout_ms` schema + ruled `5_000`
   (`auth-policy.ts:51`, `:109`, `:195`). Production:
   `timeoutMs: authPolicy.channel.transportTimeoutMs`
   (`apps/api/src/main.ts:51-55`). `SendmailMailSender` SIGKILLs and
   rejects `SENDMAIL_TIMEOUT` (`mail-channel.ts:75-78`). Unit injects
   40 ms vs `sleep 1` (`tests/unit/registration.test.ts` hung-sendmail
   case). Live durations **43 ms** / **45 ms**.

3. **F1 — new R1 assertions would fail against pre-rework code. HOLD.**
   The slow-transport test still measures `register()` before
   `drainMailDispatches()` and asserts `delta < enumerationToleranceMs`
   (`tests/integration/registration-database.test.ts` 0/400/1000 loop).
   Pre-rework awaited mail inside the floor (Codex RED 678.2 ms at
   1000 ms). That assertion fails at 678 ms. Hung sendmail without a
   timer would miss `SENDMAIL_TIMEOUT` and the `< 500 ms` bound.

4. **R2 — IP-first check and bounded retained buckets. HOLD. Eviction is not a plain `keys().next()` LRU.**
   `consume()` still `take`s the IP key first and returns without
   allocating an address bucket on IP refusal
   (`registration.ts:193-198`). Cap is ruled `bucket_capacity: 4_096`
   (`auth-policy.ts:93`, `:190`). **`retain()` (current `:97-124`)**
   refreshes an existing key; for a new key at capacity it
   `sweepExpired` first, then evicts the first bucket with
   `timestamps.length < limit`; if every remaining bucket is at-limit
   it **returns false** (fail closed on the new key). It does **not**
   evict `Map.keys().next()` regardless of state. **Live flood (both
   focused runs):** `[S3 R2 RED/GREEN] requests=200000 refused=199980
   retained_buckets=21`. F1: pre-rework retained 200,001;
   `expect(retained).toBeLessThanOrEqual(4096)` still fails on that.

5. **R2 — can an attacker evict an at-limit victim to bypass the limit? NO on this tree.**
   Shipped W3 test (`tests/unit/registration.test.ts:238-276`): victim
   at `perIp=1`, then `bucketCapacity+10` (4106) distinct attacker
   keys; expects `afterChurn === { allowed: false, scope: "ip" }` and
   retained ≤ 4096. **Live both runs:**
   `[S3 W3 RED/GREEN] churn=4106 victim_refused=true retained_buckets=4096`.
   Independent scratch probe against the shipped limiter: victim
   exhausted `perIp=20`, then 4096+ distinct keys;
   `victim_after_eviction={allowed:false,scope:"ip"} bypass=false`.
   Residual (not BLOCK): buckets that are **below** their limit remain
   evictable; when the table is full of at-limit buckets, **new** keys
   are fail-closed (a new legitimate source is refused rather than a
   victim being reset). Expiry still releases capacity (`:277-282`
   post-window consume allowed).

6. **R2 — refusal audit is one row per route per ruled window, and the count is persisted. HOLD.**
   `aggregateRefusal` (`registration.ts:137-176`) increments bounded
   `count` / `ipCount` / `addressCount`. `refuseRateLimit` (`:314-327`)
   writes a finalized prior window immediately and schedules a flush at
   the current window end (`scheduleRefusalAuditFlush` `:275-306`).
   `recordRateLimitRefusal` (`packages/db/src/identity.ts:361-388`)
   requires safe-integer `count === ipCount + addressCount` and persists
   `justification` including `;count:N;ip_count:X;address_count:Y`.
   **Live (both focused runs):**
   `[S3 W2 RED/GREEN] refusals=40 immutable_rows=1
   summary=aggregate:route-window;route:verify;window:2026-08-20T07:00:00.000Z;count:40;ip_count:40;address_count:0
   chain_valid=true`. F1: a row that omitted volume would fail
   `expect(summaries.rows).toEqual([{ justification: ... count:40 ...}])`
   (`registration-database.test.ts:341-343`). Routes cannot be invented
   (3 keys); ceiling remains 1 row per route per 60 s. Residual: flush
   uses `timer.unref()`; a process death before window end can drop the
   in-memory aggregate (tests drain via `drainRateLimitAuditFlushes`).

7. **R3 — HMAC-SHA-256 source IP; salt in the secret store, never the database. HOLD.**
   `appendAudit` still stores only
   `createHmac("sha256", this.sourceIpSalt).update(ip).digest("hex")`
   (`identity.ts:96-97`). Salt ≥32 bytes, copied, not an SQL bind
   (`:55-57`, INSERT `:107-123`). `loadSecretKey` requires mode 0600
   (`packages/crypto/src/index.ts:188-198`);
   `AUDIT_SOURCE_IP_SALT_PATH` (`main.ts:33-36`,
   `runtime-environment.ts:55`). **Live shipped test (both runs):**
   `raw_ip_hits=0 stable_hashes=1 rotated_differs=true`. **Live
   whole-row probe** `position($1 in audit_row::text)` for `192.0.2.40`:
   `audit_rows=2 raw_ip_hits=0`.

8. **R3 residual — bare HMAC of IPv4 is 2^32-brute-forceable if the salt leaks. STATED.**
   HMAC input is the raw IP string with no domain-separation prefix
   (`identity.ts:96-97`). That is the packet-required residual; this
   rework was told not to change the IP-hash construction.

9. **Lockfile — hash-wasm plus the two `@debateai/crypto` workspace importers. HOLD. The `packages/db` mismatch is fixed, not left.**
   `pnpm-lock.yaml` mtime **16:42:18**. Current contents:
   - `apps/api` importer `@debateai/crypto` workspace:* (`:129-131`)
   - `packages/crypto` `hash-wasm` specifier `4.12.0` (`:391-393`)
   - `packages/db` importer `@debateai/crypto` workspace:* (`:397-399`)
   - `hash-wasm@4.12.0` integrity (`:2623`) and empty snapshot (`:4932`)
   The original S3R packet's "leave the db mismatch / own ticket" claim
   is **stale on this tree**. `packages/db/package.json` and
   `apps/api/package.json` both declare `@debateai/crypto`; the lock
   now matches. No remaining workspace-link ticket for those two
   importers. This lens did not use `git diff` as the change-set
   oracle; the claim is held from the current lockfile text plus
   matching manifests.

10. **VR-3 non-regression. HOLD.**
    Writer still `actorCiphertext: null`, token `actorKeyRef` /
    `targetId`, INSERT literal `NULL` (`identity.ts:89-93`, `:110`).
    Live both focused runs and the full suite:
    `[S3 VR-3] audit_rows=39 forbidden_matches=0
    actor_ciphertext_nonnull=0 chain_valid=true
    rate_limit_routes=register,verify,resend`. Whole-row identity
    search after `DELETE` still zero hits
    (`registration-database.test.ts` VR-3 case). `[S3 PLAINTEXT]
    searched_identity_values=4 leaks=0`.

## Live commands (this lens, current 16:42–16:46 tree)

| Command | Result |
|---|---|
| focused vitest (run 1, 16:53) | 2 files, **21/21**, exit 0; R1 Δ 3.0/1.8/12.7; timeout 43 ms; flood 21; W3 victim_refused true / 4096; W2 count:40 chain true; R3 0/1/true; VR-3 39/0/0/true |
| same (run 2, 16:55) | 2 files, **21/21**, exit 0; R1 Δ 2.1/1.4/2.4; timeout 45 ms; same 21 / W3 / count:40 / 39 numbers. Runs agree. |
| scratch 3000 ms probe | `delta_ms=2.7 oracle_absent=true`, exit 0 |
| scratch eviction probe (shipped limiter) | `bypass=false` at-limit victim stayed IP-refused; retained 4096 |
| scratch whole-row IP search | `raw_ip_hits=0` |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0; `edgeRowsChecked: 28`; `violations: []`; `blocking: []` |
| `pnpm exec vitest run` | **110 files / 772 tests**, exit 0 (772 = prior 771 + the W3 at-limit test) |

## Residual (not BLOCK)

- Below-limit buckets can still be evicted under cap pressure; new keys fail closed when every retained bucket is at-limit (finding 5).
- Refusal-window flush is timer-based (`unref`); process death before window end can drop the in-memory count (finding 6).
- Bare HMAC-SHA-256 of IPv4 is 2^32-enumerable if the salt leaks (finding 8).
- New-account encrypt+INSERT+DEK wrap still sit inside the 500 ms floor. Live paths sat on the floor at 3000 ms mail latency.
- Rate limiter remains in-process; instances do not share buckets.

## What would have flipped this to BLOCK

- Mail send still awaited inside the floor, or a live 0/400/1000/3000 ms Δ ≥ 100 ms.
- Transport timeout as a source constant, or hung sendmail surviving the injected 40 ms bound.
- New R1/R2/R3/W2/W3 assertions that would also pass on the pre-rework code.
- Address bucket charged on IP refusal; retained buckets growing with flood length; at-limit victim allowed after >cap churn.
- N refusals writing N rows, a single row whose justification omits `count:N`, or `verifyChain` false.
- Raw IP in `audit_row::text`, salt in Postgres, or HMAC missing.
- VR-3 whole-row hits, non-NULL `actor_ciphertext`, or chain break.
- `pnpm typecheck` / `pnpm lint` / focused proofs / full suite failing, or the two focused runs disagreeing.
- Lockfile still missing `apps/api` / `packages/db` `@debateai/crypto` importers (that gap is closed on this tree).
