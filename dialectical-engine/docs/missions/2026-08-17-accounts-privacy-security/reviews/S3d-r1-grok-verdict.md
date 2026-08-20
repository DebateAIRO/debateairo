# S3d REWORK 1 Grok-lens verdict

**BLOCK**

Ticket `t_cc197ed2` / S3d REWORK 1. Blind lens: this file does not cite or open
the other diamond. Scope authority is `reviews/S3d-r1-review-packet.md` only.
True change set is from `find -mmin` / `stat` / sha256 (not `git diff` as the
inventory oracle). `git diff --check` was used only as the packet whitespace
gate. Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, and toolchain
noise are ignored. Author progress-log numbers are claims; live numbers below
were produced by this lens against the working tree and a real embedded
PostgreSQL subprocess, production auth policy (argon2id 65536 KiB / t=3 / p=1).
Temporary VR-10 mutants were applied one at a time and restored to pre-mutant
byte-identity. Product source is byte-identical to this lens's gold. Nothing
was committed or pushed.

**T9 (`t_6ff49601`) is out of scope.** No `t_6ff49601` product files appear in
the author mtime set. Not re-reported.

D2 / D3 / D4 are frozen. This lens confirmed they survived and does not
re-litigate them.

---

## Gold hashes (recorded before any mutation; restored after VR-10)

HEAD `b2324d658819a26135f05767f900f08becf34ae8` (matches the packet). Snapshot
`{SCRATCH}/gold-hashes.txt` and `{SCRATCH}/gold-bytes/`. Cross-check against
Codex *preflight* prefixes (those were the S3d-original hashes; REWORK 1 is
the divergence):

| path | sha256 | vs Codex preflight prefix |
|---|---|---|
| `apps/api/src/registration.ts` | `8a757722fd6fb9f35fddc95ef2b1643177933b888f327d8f922d64d7a13c8d31` | MISMATCH vs `478f4e5c` (REWORK 1) |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | MISMATCH vs `7e35e6f` (REWORK 1) |
| `packages/register/src/auth-policy.ts` | `ddf2cc21314512930928c3913db531ffc80f477143a1a056c9a6eee81f15a2d2` | MISMATCH vs `3b576d34` (REWORK 1) |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | MATCH `c57266d3` (content frozen) |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | MATCH `34fadf7c` (content frozen; untracked) |
| `tests/integration/registration-database.test.ts` | `b7f36e7e9268f3e3dcbc11949f941c0f903f08c7e7e99e3f6f87aae67a8b29a9` | MISMATCH vs `8d2b2d50` (REWORK 1 proofs) |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | MATCH `05ebf0c9` |
| `tests/unit/registration.test.ts` | `b54245402417473c7a34a0acafd9ac1625fdfcd92f8cf3145ee58a00829f1253` | MISMATCH vs `6472f459` (REWORK 1 proofs) |

No unowned hash divergence occurred under this lens. After the last VR-10
restore, every gold path was byte-identical to the table above.

## Live mtime inventory (S3d REWORK 1)

First `stat` 10:52 EEST, 2026-08-20. Capture `{SCRATCH}/mtime-inventory.log`.
Author in-window product set (mtime ≥ 2026-08-20 10:27 for REWORK 1
implementation; original S3d surfaces from 08:07 still present). Aug-17
rename churn ignored.

| mtime (EEST) | sha256 prefix | vs HEAD | path |
|---|---|---|---|
| 10:37:04 | `8a757722fd6f` | DIFFER | `apps/api/src/registration.ts` |
| 10:37:04 | `b7f36e7e9268` | DIFFER | `tests/integration/registration-database.test.ts` |
| 10:36:14 | `2a0fe03910bd` | DIFFER | `apps/api/src/mail-channel.ts` |
| 10:35:26 | `b54245402417` | DIFFER | `tests/unit/registration.test.ts` |
| 10:33:41 | `ddf2cc213145` | DIFFER | `packages/register/src/auth-policy.ts` |
| 10:33:25 | `c57266d3bb83` | DIFFER (mtime touch; content = original S3d gold) | `packages/db/src/identity.ts` |
| 08:08:48 | `05ebf0c907ce` | DIFFER (original S3d; not REWORK 1) | `tests/integration/identity-database.test.ts` |
| 08:07:08 | `34fadf7cd618` | NOT_IN_HEAD | `migrations/0033_verification_token_credentials.sql` |

Frozen surfaces (MATCH_HEAD, Aug-19 mtimes): `packages/db/src/schema.ts`
(`34849391e0dc`), `packages/crypto/src/index.ts` (`40a6d6245975`),
`migrations/0031_registration_verification.sql` (`1057927a4e7d`),
`migrations/0032_registration_audit_erasure_checks.sql` (`05465d307128`),
`apps/api/src/index.ts` (Aug-19 15:19). S3c limiter typed-array storage was
not rewritten. T9 absent from the mtime set.

## Live gates (this lens, not the progress log)

| gate | result |
|---|---|
| `pnpm typecheck` | GREEN (`tsc --noEmit`) |
| `pnpm test` | **110 files / 815 tests** in **455.95 s**, all passed, real embedded PostgreSQL 18 |
| `pnpm lint` | GREEN: architecture `edgeRowsChecked: 28, violations: []`; source `"blocking": []` |
| `git diff --check` (whitespace only, in-window paths) | empty, exit 0 |
| mutation-residue after restore | no leftover `if (false)` / VR-10 / `retainedToken` markers in the hashed product files |
| product sha256 vs gold after last restore | identical |

Author claim 110/815 is confirmed. Capture `{SCRATCH}/gates.log` and
`{SCRATCH}/gates-typecheck-lint.log`.

Suite corroboration (same `pnpm test` run): S3b durability burst 100/100
committed; S3b F3 `before_commit_calls=0 persisted_accounts=0`; S3b equal-work
n=1/4/8 AUC 51.6 / 68.0 / 55.5 % (ceiling 80 %); S3d D2 `consumed_at=4/4`
siblings_invalid=3; D3 1 mail / first link active; D4 1 opaque hashed-source
audit, 0 raw email/IP/UA matches; VR-3 `audit_rows=2347 forbidden_matches=0
chain_valid=true`. Codex's own 1500 ms B1 instrument on this run: register
AUC **0.5444** / acc **0.6833** vs null 0.5689/0.6000; resend AUC **0.6389**
/ acc **0.6667** vs null 0.5689/0.6000; 92/92 sends. That instrument is not
this lens's oracle (see PQ1).

---

## PRIMARY QUESTION 1 — is the oracle closed under THIS harness?

**No. At production transport timeout the next caller's admission is still a
function of the previous caller's arm. AUC 1.0000 on register, 0.9444 on
resend. That is a BLOCK regardless of Codex's 0.5367 / 0.5833.**

This lens drove shipped `RegistrationService.register` / `resendVerification`
with production policy, real 600 ms clamp, production argon2id, and a
controllable `MailSender`. Capture `{SCRATCH}/pq1-oracle.log` and
`{SCRATCH}/pq1-oracle-live.log`. Protocol: fill 32 hanging new-address
sends, queue n=12 same-arm targets then n=12 markers, release 12 fillers,
score marker wall times (the next admission), vs a same-arm even/odd null.
Repeated once. Pass/fail (arms separate or not) was consistent.

**0 ms balanced mail (Codex-like, *not* production sendmail):**

| run | route | existing median | missing median | AUC | acc | null AUC | null acc | sends e/m | SEPARATES |
|---|---|---|---|---|---|---|---|---|---|
| bal0 | register | 8117.6 ms | 8149.7 ms | 0.5069 | 0.5417 | 0.5278 | 0.5833 | 44/56 | no |
| bal0 | resend | 6545.3 ms | 6547.0 ms | 0.5139 | 0.5417 | 0.5556 | 0.6667 | 56/44 | no |
| bal0-repeat | register | 8141.1 ms | 8135.1 ms | 0.5069 | 0.5833 | 0.5833 | 0.6667 | 44/56 | no |
| bal0-repeat | resend | 6558.5 ms | 6556.7 ms | 0.5347 | 0.5417 | 0.5833 | 0.6667 | 56/44 | no |

Direct next-admission n=4 at 0 ms: register medians 5384.7 vs 5381.8 ms;
resend 5252.3 vs 5253.0 ms; does not separate. The 5.1 s lease
(`registration.ts:480-486`) **does** close the original 0 ms missing-resend
release (`registration.ts:601-607`, `:877-878`).

**Production `transport_timeout_ms = 5000` (the ruled sendmail timeout) on
the sending arm:**

| route | existing median | missing median | gap | AUC | acc | null AUC | null acc | sends e/m | SEPARATES |
|---|---|---|---|---|---|---|---|---|---|
| register | 8130.9 ms | 10818.6 ms | **+2687.7 ms** | **1.0000** | **1.0000** | 0.7222 | 0.7500 | 44/56 | **yes** |
| resend | 7597.9 ms | 6544.4 ms | **−1053.6 ms** | **0.9444** | **0.9583** | 0.5278 | 0.6667 | 56/44 | **yes** |

Register missing (new address) does a 5 s send *after* argon2+provision+clamp
(`registration.ts:768-775` then `:673-681`). The lease clock started at
activation (`:475`). 600 ms clamp + 5000 ms send = ~5600 ms, which overruns
the 5100 ms minimum, so the marker waits ~10.8 s vs ~8.1 s on the duplicate
arm. Resend reverses the work: existing sends (slow), missing takes
`dispatchMailReservationHold` (lease only) — 7.6 s vs 6.5 s.

**Sensitivity gap vs Codex RED 0.87/0.92 vs the prior blocking-lens 1.0000:**
Codex's GREEN instrument uses `slow_transport_ms=1500`
(`registration-database.test.ts:985-1004`), which is swallowed by 5.1 s, so
it cannot see a production 5 s sendmail timeout. This lens's 0 ms numbers
match that GREEN class (AUC ~0.51–0.53, repeatable). The original block's
1.0000 is recovered the moment the sending arm does the ruled 5 s transport
work. Codex's 1500 ms GREEN is therefore less sensitive than both the
blocking lens and production policy.

Sends during the scored window were **not** equal (44 vs 56): existing
register / missing resend do not call `MailSender`. Codex's 92/92 pads
control sends *after* the round (`registration-database.test.ts:1144-1161`).
That is an accounting equalization, not equal work while the marker is
waiting.

## PRIMARY QUESTION 2 — 5.1 s lease cost and 18 s expiry as a channel

Capture `{SCRATCH}/pq2-lease-expiry.log` and `{SCRATCH}/s3b-oracle-durability.log`.

1. **Throughput / latency under saturation.** 7 source IPs filled 128 slots
   (`inFlight:32, queued:96/96`). An 8th-IP legitimate register received
   opaque `AUTH_MAIL_BUSY` / 503 in **601.6 ms** (the 600 ms clamp after the
   immediate at-capacity throw at `registration.ts:514-516`). With hanging
   occupants the 5.1 s lease never fires — hangers hold forever, the queue
   expires at 18 s, the next wave 503s. That availability attack existed
   before REWORK 1. What the lease *does* cost: every *completing* saturation
   handoff waits 5.1 s (`:480-486`). This lens's 0 ms markers admitted at
   ~6.5–8.1 s (lease + marker argon2/clamp). Sustained completing throughput
   is capped at 32/5.1 s ≈ **6.3 grants/s**. The 100-burst durability test
   still passed (100/100 committed in 20.5 s) because 18 s admits three 5.1 s
   waves, as the row claims.
2. **18 s expiry as a channel.** Author-instrument live re-run: queued
   caller returned opaque `AUTH_MAIL_BUSY`/503 at **18006.1 ms**. This lens
   did not finish a mixed-arm expiry AUC (unhandled waiter timeout after the
   FIFO probe); the deadline itself is arm-neutral — it is a `setTimeout` on
   the opaque queue node (`:520-526`), not on the occupant's email. Both
   arms get the same code/status.
3. **FIFO.** One head waiter + 12 later arrivals; release 1 filler; head
   admitted (`ALLOWED`, 602.5 ms clamp), 12 later still queued. New arrivals
   append (`:528`); grant is `shift` (`:489`). Not starvation of the head.
4. **S3b clamp / S3c limiter.** Re-ran S3b oracle and durability against
   this tree: n=1/4/8 AUC **51.6 / 68.0 / 55.5 %** (ceiling 80 %); 100/100
   burst; F3 `before_commit_calls=0 persisted=0`. The lease does not reopen
   those properties. Limiter still runs before `reserveMailDispatch`
   (`:730-746`).

## Also attack

- **Coalescing.** During 2 000+ refusals this lens saw **one**
  `[AUTH_MAIL_CAPACITY_EXHAUSTED] correlation=<uuid> code=MAIL_DISPATCH_CAPACITY`
  line (`registration.ts:499-508`, 60 s window). An operator sees a single
  bounded opaque signal per minute, not a per-refusal firehose. They learn
  *that* the dispatch bound is exhausted, not the size of the flood (the
  count is no longer in the log line). Detection remains; sizing does not.
- **RSS ceiling structurally wave-size-independent.** Ceiling is
  `max(null_envelope, 64 KiB) * 8`, not `3 × null(8)` vs 3 waves. Author
  instrument re-run past 2 000 refusals with 125 fixed IPs:
  `waves_mib=[119.5, 119.7, 120.0, 120.0]`, plateau spread **0.359 MiB**
  against **1.750 MiB** ceiling, 1 signal. Isolation: 125 IPs keep S3c
  occupancy from masquerading as D1 growth; D1 still runs
  (`reserveMailDispatch` throws, `signalMailCapacity` coalesces). That is
  not an isolation that excludes the unit under test. `allocatedBytes` of
  the limiter is a fixed typed-array budget (154 140 672). This lens's
  first RSS pass used unique pin IPs and grew `occupiedSlots` 256 → 1081
  with spread 5.375 MiB — that measurement polluted S3c occupancy and is
  **not** cited against D1.
- **Heap snapshot.** Baseline *before* saturation, canary present. Saturated
  snapshot: **32/32** active raw tokens, **0** created-during tokens outside
  active sends, all 32 active tokens present. Retaining one
  `generateVerificationToken()` string made the same scan see it
  (`HEAP_POSITIVE_CONTROL retained_token_seen=true`). VR-10 retaining one
  token per waiter made the shipped D1 assertion see **128 vs 32**.
- **Ruled-row retention.** Queue nodes at saturation: 96/96, keys
  `reject,resolve,timeout` only, no plaintext in node fields. Heap of the
  same process: **96/96** queued emails and **96/96** request-ids (source
  context) in suspended `register` frames. The new sentence ("opaque queue
  nodes plus validated plaintext retained in suspended frames only until
  grant/timeout") is **TRUE** as measured the same way the old 96/96
  resolver-only claim was FALSE. After drain, occupancy returned to 0/0.
- **2 000-refusal isolation.** See RSS bullet. The 125-IP bound excludes
  S3c source growth, not D1.

## VR-10 (this lens, one at a time, restored to gold)

Capture `{SCRATCH}/vr10-mutants.log`.

| mutant | observation | restored |
|---|---|---|
| Zero the 5.1 s lease (`registration.ts:481` → `0`) | register **AUC 1.0000 / acc 1.0000** vs null 0.5644/0.6000; resend **1.0000 / 1.0000** vs 0.5511/0.6000; 92/92 sends. Assertion RED | gold |
| Double queue timeout (`:526 * 2`) | observed **PENDING** at ruled 18 s. RED | gold |
| Restore per-refusal signals (drop coalescing) | **2250** signals; RSS spread **0.703 > 0.500** ceiling. RED | gold |
| Retain one raw token per waiter | heap assertion **128 vs 32**. RED | gold |
| Restore `WAIT_QUEUE_RESOLVERS_ONLY` | unit row assertion RED | gold |
| Disable family `consumed_at` (WHERE token_hash vs channel) | **0/4 vs 4/4**. RED | gold |
| Remove only the explicit `/[\r\n]/` clause (`mail-channel.ts:52`) | CRLF unit test **stayed GREEN** (`[^\s@]+` already rejects CR/LF). Honest: this mutant does not kill | gold |

## Findings

1. **BLOCKER — production sendmail timeout reopens the next-admission
   existence oracle.** `auth-policy.ts:363,369,378` publishes a 5.1 s
   arm-independent hold as "the ruled 5-second sendmail timeout plus 100 ms
   tolerance". The lease clock starts at `activateMailDispatch`
   (`registration.ts:475-486`). Mail send runs *after* register/resend
   returns from the 600 ms clamp (`:768-775`, `:870-875`, `:673-681`). A
   production 5 s send therefore overruns the lease by ~clamp, and the next
   marker's admission depends on whether the previous occupant existed.
   This lens, n=12, production policy: register AUC **1.0000** / acc
   **1.0000** (existing 8130.9 ms vs missing 10818.6 ms); resend AUC
   **0.9444** / acc **0.9583**. Repeatable 0 ms runs stay closed, so this
   is not jitter. Codex's 1500 ms instrument cannot fail for this reason.
   **What lifts it:** the same next-admission harness with sending-arm delay
   = `channel.transportTimeoutMs` (5000 ms) on both register and resend,
   reporting AUC and best-single-threshold accuracy not above the same-arm
   null + 0.10, with sends counted *during* the scored window equal; VR-10
   a 5000 ms sending-arm delay must make that assertion RED. Implementation
   options that would actually close it: start the 5.1 s clock at send
   dispatch, or set `minimum_reservation_ms >= enumeration clamp +
   transportTimeoutMs` (5600 ms), or make every arm do equal transport-bound
   work inside the lease.

No other blocker. D2/D3/D4, RSS plateau under 125-IP isolation, heap
positive control, truthful retention sentence, coalesced operator signal,
FIFO, 18 s opaque 503, S3b oracle/durability, VR-3, and gates held.
