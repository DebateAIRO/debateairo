# S3d REWORK 2 Grok-lens verdict

**GREENLIGHT**

Ticket `t_cc197ed2` / S3d REWORK 2. Blind lens: this file does not cite or open
the sibling diamond. Scope authority is `reviews/S3d-r2-review-packet.md` only.
True change set is from `stat`/mtimes and SHA-256 (never `git diff` as the
inventory oracle). Author progress-log numbers are claims; live numbers below
were produced by this lens against the working tree and a real embedded
PostgreSQL subprocess, production auth policy (argon2id 65536 KiB / t=3 / p=1)
except the frozen S3b durability guard, which uses its own reduced hasher as
shipped. Temporary mutants were applied one at a time and restored to
pre-mutant byte-identity. Product source/tests are byte-identical to this
lens's gold. Nothing was committed or pushed. No leftover lens file remains
under `tests/`.

**Also recorded, not a reviewer policy ruling:** `V DECISION REQUIRED —
availability trade`. Frozen S3b stays 100/100; the production-equivalent 100
burst has zero request-count margin.

---

## Gold hashes (recorded before any mutation; restored after each mutant)

HEAD claim in the packet: `b2324d6`. Snapshot `{SCRATCH}/gold-hashes.txt` and
`{SCRATCH}/gold-bytes/` at 2026-08-20 15:30:49 EEST. Cross-check against the
14:56 EEST handoff table:

| path | sha256 | vs 14:56 EEST handoff |
|---|---|---|
| `apps/api/src/registration.ts` | `bf40c92d95881d7011eb0720e812711fdafe38c8eeb9b6733947c34e50c31b8a` | MATCH |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` | MATCH (frozen) |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` | MATCH (frozen) |
| `packages/register/src/auth-policy.ts` | `268172de02cbf249c904155c905144e7e935d77876251f5854cb0d798748555f` | MATCH |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` | MATCH (frozen; untracked) |
| `tests/integration/registration-database.test.ts` | `ed544b11c74fb6d677a9b1563d59e71ea25aba38893fa6ba3d317d7a8b23cddc` | MATCH |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` | MATCH r1 frozen 64-hex; packet row is 65 chars (`…9432f`) — transcription defect, not foreign divergence |
| `tests/unit/registration.test.ts` | `2d440752685f85d62f00eb2c709d24d78ec1a423bf15c3391c4b68fae222f7fa` | MATCH |

Final re-hash 16:49:10 EEST: identical on all eight paths. No unowned hash
divergence under this lens.

## Live mtime inventory (S3d REWORK 2)

First `stat` 15:30:49 EEST, 2026-08-20. Capture `{SCRATCH}/mtime-inventory.log`.
Worker claim (rework-2 mtimes only on `registration.ts`, `auth-policy.ts`,
registration integration/unit tests, and `logs/S3d-progress.log`) independently
confirmed. Aug-17 rename churn, `node_modules`, `.next`, `.pgdata` ignored.

| mtime (EEST) | sha256 prefix | rework-2? | path |
|---|---|---|---|
| 13:44:55 | `bf40c92d9588` | yes | `apps/api/src/registration.ts` |
| 13:30:20 | `268172de02cb` | yes | `packages/register/src/auth-policy.ts` |
| 14:37:58 | `ed544b11c74f` | yes | `tests/integration/registration-database.test.ts` |
| 13:30:08 | `2d440752685f` | yes | `tests/unit/registration.test.ts` |
| 14:55:55 | (progress log) | yes | `logs/S3d-progress.log` |
| 11:45:21 | `2a0fe03910bd` | no (r1 restore touch; content frozen) | `apps/api/src/mail-channel.ts` |
| 11:45:21 | `c57266d3bb83` | no (r1 restore touch; content frozen) | `packages/db/src/identity.ts` |
| 08:08:48 | `05ebf0c907ce` | no (original S3d) | `tests/integration/identity-database.test.ts` |
| 08:07:08 | `34fadf7cd618` | no (original S3d; untracked) | `migrations/0033_verification_token_credentials.sql` |

Sibling heavy campaign at start: Claude Opus pid alive but only a verdict-file
watchdog; Codex worker idle after 14:56 handoff; no vitest; gold files not held
by `lsof`. This lens started.

## Live gates (this lens, not the progress log)

| gate | result |
|---|---|
| `pnpm typecheck` | GREEN (`tsc --noEmit`) |
| `pnpm test` | **110 files / 816 tests** in **824.82 s**, all passed, real embedded PostgreSQL 18 |
| `pnpm lint` | GREEN: architecture `edgeRowsChecked: 28, violations: []`; source `"blocking": []` |
| focused unit + identity | 2 files / 28 tests passed |
| product sha256 vs gold after last restore | identical |
| leftover `tests/` lens file | none |

Suite corroboration (same `pnpm test` run, author instrument, not this lens's
oracle): worker B1 register AUC **0.5625** / acc **0.6563** vs q99 0.8594/0.8750;
resend **0.5938** / **0.6250** vs 0.8906/0.8750; claimed in-window sends 32/32
(see finding 2). S3b durability 100/100 committed-at-response. D2
`consumed_at=4/4` siblings_invalid=3; D3 1 mail / first link active; D4
failure_audits=1, raw email/IP/UA matches=0.

---

## PRIMARY 1 — independently reproduce the real-timeout oracle

**Closed on this harness.** Lens-owned grant-to-grant instrument drove shipped
`RegistrationService.register` / `resendVerification` at production policy with
`channel.transportTimeoutMs = 5000` exactly (a shorter delay is disqualifying
and was not used). Observable: interval between consecutive
`activateMailDispatch` grants (`registration.ts:488-511`) as a function of the
previous caller's existing/missing arm. Same-arm null: 512 deterministic
relabelings of each arm, q99 ceiling, derived spread = q99 minus null median
(no additive constant). In-window sends counted as `sendVerification` starts
with timestamp in `[grant0, grant1)` — listed by tag, no sibling-service
padding.

Capture `{SCRATCH}/pq1-oracle.log` (clean) and `{SCRATCH}/pq1-oracle-load.log`
(two ~97% CPU workers).

**Clean, n=16/arm, transport 5000 ms, reservation 5600 ms:**

| route | existing median | missing median | AUC | acc | null q99 AUC/acc | derived spread | in-window sends e/m | pass |
|---|---|---|---|---|---|---|---|---|
| register | 5602.3 ms | 5601.9 ms | 0.6016 | 0.6250 | 0.8438 / 0.8750 | 0.2500 / 0.1875 | **0 / 16** | yes |
| resend | 5602.0 ms | 5601.6 ms | 0.6094 | 0.6875 | 0.8750 / 0.8750 | 0.2812 / 0.1875 | **16 / 0** | yes |

Register existing raw (ms): 5602.4, 5602.9, 5600.8, 5601.5, 5603.3, 5605.4,
5600.4, 5608.9, 5602.2, 5601.9, 5604.7, 5602.3, 5601.9, 5605.6, 5602.9, 5602.2.
Missing: 5601.9, 5602.5, 5600.7, 5602.8, 5601.0, 5602.0, 5606.5, 5600.5,
5602.3, 5601.0, 5604.6, 5601.7, 5603.2, 5601.9, 5601.6, 5603.3.
Every missing-register in-window send is tag `timeout-target`; every
existing-register window has `tags=none`. Resend reverses: existing tag
`other` (seeded address send at 5000 ms), missing `none`.

**Sustained CPU load, same n and timeout:**

| route | existing median | missing median | AUC | acc | null q99 AUC/acc | in-window e/m | pass |
|---|---|---|---|---|---|---|---|
| register | 5601.7 ms | 5601.6 ms | 0.5352 | 0.5938 | 0.8281 / 0.8750 | 0 / 16 | yes |
| resend | 5601.5 ms | 5601.5 ms | 0.5391 | 0.6250 | 0.8438 / 0.8750 | 16 / 0 | yes |

Clean vs load **agree on the verdict** (both pass). Load AUCs are slightly
lower, not higher. The gate does not flip with ambient load.

Mechanism: `activateMailDispatch` pads every saturated arm to
`mailDispatchMinimumReservationMs` from **activation** (`:490-500`). Delivery
audit runs **after** `releaseReservation()` (`:635-638`). The next grant is
issued in the reservation `.then` (`:502-508`) before
`recordVerificationDelivery`. Both arms therefore hand off at ~5600 ms even
though in-window transport work is unequal.

---

## PRIMARY 2 — VR-10 and derived-gate attack

**VR-10 RED on both routes, restored.** One mutant: `auth-policy.ts` reservation
literal/row/type `5_600 → 5_100` (r1 activation deadline) while the harness
kept `transportTimeoutMs = 5000`. Capture `{SCRATCH}/vr10.log`.

| route | existing median | missing median | AUC | acc | null q99 | in-window e/m | assertion |
|---|---|---|---|---|---|---|---|
| register | 5102.2 ms | 5330.3 ms | **1.0000** | **1.0000** | 0.8594 / 0.8750 | 0 / 16 | RED |
| resend | 5481.1 ms | 5101.6 ms | **1.0000** | **1.0000** | 0.8594 / 0.8750 | 16 / 0 | RED |

Ranges do not overlap (register existing max 5104.5 vs missing min 5280.3).
In-window send counts preserved during the mutant. Restore hash
`268172de…8555f` MATCH gold immediately after the run.

**Derived-gate wrong-state attack (too-small n).** Using the VR-10 raw
intervals: same-arm n=2 yields q99 **1.0000**, so AUC 1.0000 would **pass**.
Chosen n=16 same-arm q99 stays **0.8594** and rejects 1.0000. Capture
`{SCRATCH}/derived-gate-attack.log`. The construction does not admit the
too-small-n state. A pooled-label null still rejects 1.0000 (q99 0.7383);
biased extreme splits are not used (same-arm only).

**Delivery audit after handoff.** `dispatchVerification` (`registration.ts:635-638`)
clears the live delivery object, awaits transport, **then** releases the
reservation, **then** `recordVerificationDelivery` (`:754-778`) which still
writes the D4 fallback audit on record failure. The next grant is the
synchronous `shift` in `:504-508` with no await between decrement and grant —
no next-grant contamination from the advisory-lock audit. D4 suite line this
run: `failure_audits=1 raw_email_ip_ua_matches=0`. D4 is not reopened.

Dispatch anchoring was **not** restored: the clock is `activatedAt` at grant
(`:490`), not send dispatch. Queue remains bounded at 96 (`:559-561`). No
post-window send padding in product code.

---

## PRIMARY 3 — availability for V

Healthy **5 ms MTA, no attacker**, production policy, three repetitions.
Capture `{SCRATCH}/b4-availability.log`.

| rep | burst | success | AUTH_MAIL_BUSY | p50 ms | p99 ms | max queue wait ms | deadline margin ms |
|---|---|---|---|---|---|---|---|
| 0 | 100 | **100** | 0 | 13277 | 24861 | 12426 | 5574 |
| 0 | 128 | 122 | 6 | 14526 | 30624 | 17943 | 57 |
| 0 | 160 | 123 | 37 | 14360 | 30703 | 17976 | 24 |
| 1 | 100 | **100** | 0 | 13341 | 24736 | 12276 | 5724 |
| 1 | 128 | 123 | 5 | 14655 | 30714 | 17910 | 90 |
| 1 | 160 | 123 | 37 | 14433 | 30518 | 17921 | 79 |
| 2 | 100 | **100** | 0 | 13335 | 24723 | 12323 | 5677 |
| 2 | 128 | 123 | 5 | 14188 | 30343 | 17927 | 73 |
| 2 | 160 | 123 | 37 | 14342 | 30543 | 18031 | −31 |

Effective burst tolerance **122–123**, stable (tighter than the worker's
121–126 band, not flipping). Accepted p99 above burst 100 **approaches ~30.7 s**
(30.3–30.7), in the 30.9 s neighborhood the packet asked about. Burst 100 is
**100/100 with zero production-equivalent request-count margin**.

Frozen S3b 100-concurrent durability (this lens, reduced hasher as shipped):
**successes=100, committed_at_response=100**. Same result in the full suite.
Not a code BLOCK. **`V DECISION REQUIRED — availability trade`.**

---

## Secondary fold-ins

- **Counted refusal aggregate.** Independent 8,000-refusal / 512-source run:
  exactly one `[AUTH_MAIL_CAPACITY_EXHAUSTED] … count=8512` line, unrelated=0.
  Constant-count mutant (`registration.ts:522` `count=${aggregate.count}` →
  `count=1`) produced `count=1` for 20 busy refusals; gold probe after restore
  produced `count=20`. Restore MATCH. `{SCRATCH}/count-mutant.log`,
  `{SCRATCH}/rss.json`.
- **RSS.** 8,000 refusals over 512 fixed sources while D1 is saturated
  (`inFlight=32, queued=96/96, activeSends=32`). Does not exhaust S3c's 20×512
  source budget. Post-GC plateau `[141.656, 141.641, 141.625, 141.734]` MiB,
  spread **0.109 MiB** judged against a **re-derived fixed 0.500 MiB** ceiling
  (64 KiB × 8), not scaled from the wave. Pass. The shipped suite this run used
  `fixed_ceiling_mib=1.750` (`max(null_envelope=0.219, 64 KiB)×8`) — wave-size
  independent but not the packet's fixed 0.500; recorded, not blocking, because
  the independent 0.109 still sits under 0.500.
- **Mixed-arm 18 s deadline.** n=24/arm, all `AUTH_MAIL_BUSY`. Existing median
  21229.8 ms vs missing 21370.0 ms; AUC **0.5260** / acc **0.5625** ≤ null q99
  **0.7917 / 0.7917**. Reservation wait min 18000.2 / max **18007.7** ms vs
  ruled 18000. `{SCRATCH}/deadline.json`.
- **Reservation arithmetic.** Live values match 600+5000=5600. Mutating
  `transport_timeout_ms` 5000→4000: `authPolicyFromRegisterRows` **loads**,
  reservation **stays 5600**, derived should-be 4600, **followed=false,
  guard_failed=false**. Restore MATCH. `minimum_reservation_ms` is
  `z.literal(5_600)` (`auth-policy.ts:172`) independent of
  `transport_timeout_ms: z.number().int().positive()` (`:166`). Documentary
  regex (`:182`) checks the prose string, not the numbers. Non-blocking while
  current literals match; a later transport increase without a 5600 edit would
  reopen the oracle (the B1 test would then go RED at the real timeout).
- **No silent restore** of dispatch anchoring, unbounded queue, or post-window
  padding. Equal-work is not a product claim; see finding 2.

---

## Findings

1. **`V DECISION REQUIRED — availability trade` (not a code BLOCK).** Healthy
   5 ms MTA, production policy: burst 100 = 100/0 busy, three repetitions.
   Frozen S3b remains 100/100 committed-at-response. Production-equivalent
   request-count margin is **exactly zero**. Effective tolerance 122–123;
   accepted p99 above 100 approaches ~30.7 s. V rules on the trade.

2. **Non-blocking — in-window sends on the measured dispatcher are unequal.**
   This lens counted 0 vs 16 (register) and 16 vs 0 (resend) inside the scored
   grant interval, which is the honest work of the sending arm. The worker
   suite equalizes 32/32 by issuing a sibling-service send during the sample
   (`registration-database.test.ts:1186-1208`). That is in-window accounting,
   not post-window padding, and the handoff already states indistinguishability
   comes from the fixed deadline. Product code does not pretend equal transport
   work.

3. **Non-blocking — reservation 5600 is a frozen literal, not computed from
   clamp+transport.** `auth-policy.ts:172,370,433`. A 4000 ms transport mutant
   neither moves 5600 nor fails the loader. Current production numbers are
   600+5000=5600 and the oracle is closed; the coupling is documentary.

No other findings. Frozen D2/D3/D4, mail-channel, identity, migration 0033, and
identity integration remain exact gold. T9 untouched.

---

## SELF-REPORT

- Lens/model: Grok 4.6, Grok reviewer of the S3d-r2 dual diamond.
- Session: fresh `01a01f23-d1ee-74f1-a799-1a043248274a` (not resumed).
- Start: 2026-08-20 15:30:19 EEST. End: 2026-08-20 16:49 EEST.
- Commands: independent `tsx` grant-to-grant oracle (clean + 2 CPU workers) at
  transport 5000 ms n=16; VR-10 5100 ms mutant oracle; B4 bursts 100/128/160 ×3;
  S3b 100-concurrent; mixed-arm deadline; RSS 8000/512; count=1 mutant; transport
  4000 derivation mutant; `pnpm typecheck`; `pnpm lint`; focused
  `registration` unit + `identity-database` integration; `pnpm test`.
- Test totals: focused 2 files / 28 tests; full suite **110 / 816** in 824.82 s.
- Mutations (one at a time) and restores (all hash-verified): (1) reservation
  5600→5100 on `auth-policy.ts`; (2) `transport_timeout_ms` 5000→4000; (3)
  capacity `count=${aggregate.count}` → `count=1` on `registration.ts`.
- Final gold: MATCH on all eight handoff paths.
- Token/usage: CLI did not expose a token counter to this lens.
- User/foreign change: none on the gold set. Packet identity-test row is a 65-hex
  transcription defect. Sibling `S3d-r2-opus-verdict.md` was not read (file
  absent at start and at verdict). Hidden scratch instruments under the repo
  root were deleted after the last run; `tests/` was never modified.
