GREENLIGHT

# S3d-final Grok-lens verdict

Ticket `t_cc197ed2`, board `accounts-phase1`. Blind lens: this file does not
cite or open `reviews/S3d-final-opus-verdict.md`. Scope authority is
`reviews/S3d-final-review-packet.md` only. True change set is from `find -mmin`
/ `stat` / SHA-256 (never `git diff` as the inventory oracle). `git diff --check`
was used only as the packet whitespace gate. Aug-17 rename churn, `node_modules`,
`.next`, `.pgdata`, and toolchain noise are ignored. Author progress-log numbers
are claims; live numbers below were produced by this lens against the working
tree and a real embedded PostgreSQL 18 subprocess, production auth policy
(argon2id 65536 KiB / t=3 / p=1). One temporary product-row mutant was applied
and restored byte-identically with hash-check. No leftover gold mutation. Nothing
was committed, pushed, or moved on Kanban.

Comments read through: `READY FOR PEER REVIEW — CADENCE DISCLOSURE RECUT`
(2026-08-21 10:19 EEST) and the subsequent Router launch note at 10:22 EEST.
Consumed V FINAL RULING 10:07 EEST (1A, 2A, revised 3A-prime, 4A).

Zero blocking findings. V-ratified residuals are recorded, not converted into
reviewer policy.

---

## Gold hashes (entry == after-mutation restore == exit == packet table)

Snapshot `{SCRATCH}/gold-entry.txt` + `{SCRATCH}/gold-bytes/` at 2026-08-21
10:25:02 EEST, before any mutation. Re-hash after restore
`{SCRATCH}/gold-after-mutation.txt`. Exit `{SCRATCH}/gold-exit.txt` 10:43 EEST.
`mismatch_flag=0` at every checkpoint. No concurrent vitest; no `lsof` holders
on gold paths at entry.

| Path | SHA-256 |
|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` |
| `packages/register/src/auth-policy.ts` | `36359f2085e0fb0f710f060d0679ff9a5e55baa3ca37362d5af5f739afc2e6f0` |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` |
| `tests/unit/registration.test.ts` | `aea9f2c650665d3ddda70fd2c31015fef7b5b64de0d7431231d362770516098b` |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` |

## Live mtime inventory (author change set)

Capture `{SCRATCH}/mtime-inventory.log` at 10:25:24 EEST. Recut window
(`find -mmin -120`) on authorised product/test/log only:

| mtime (EEST) | SHA-256 prefix | recut? | path |
|---|---|---|---|
| 10:15:31 | `36359f20` | yes | `packages/register/src/auth-policy.ts` |
| 10:12:56 | `aea9f2c6` | yes | `tests/unit/registration.test.ts` |
| 10:19:04 | (progress log) | yes | `logs/S3d-progress.log` |
| 02:38:06 | `d51af60a` | no (rework-4 adjudication) | `tests/integration/registration-database.test.ts` |
| 00:12:57 | `c5846a86` | no (rework-3 product) | `apps/api/src/registration.ts` |
| 2026-08-20 11:45:21 | `2a0fe039` | frozen | `apps/api/src/mail-channel.ts` |
| 2026-08-20 11:45:21 | `c57266d3` | frozen | `packages/db/src/identity.ts` |
| 2026-08-20 08:08:48 | `05ebf0c9` | frozen | `tests/integration/identity-database.test.ts` |
| 2026-08-20 08:07:08 | `34fadf7c` | frozen | `migrations/0033_verification_token_credentials.sql` |

Relative to the pre-recut hashes (`auth-policy` `ed57e4d7…`, unit
`2c8b4458…`), the cadence-disclosure recut touched only `auth-policy.ts`,
`tests/unit/registration.test.ts`, and the append-only progress log. Runtime
registration, integration workload, mail channel, identity
implementation/migration/test, 45 ms cadence, N-star, token lifecycle, and
audit semantics did not drift (six frozen hashes exact). Other 2h files are
orchestrator/reviewer artifacts (`S3d-cadence-disclosure-recut-packet.md`,
`S3d-final-review-packet.md`, `S3-codex.log`, `reports/orphan-audit.json`).

## Live gates (this lens, not the progress log)

| gate | result |
|---|---|
| `pnpm exec vitest run tests/unit/registration.test.ts` | GREEN, 24/24, 29.81s |
| eight named live PostgreSQL titles (one anchored regex) | GREEN, 8 passed / 37 skipped, 498.81s, real embedded PostgreSQL 18 on 127.0.0.1:54269 |
| `pnpm typecheck` | GREEN (`tsc --noEmit`) |
| `pnpm lint` | GREEN: architecture `edgeRowsChecked: 28, violations: []`; source `"blocking": []` |
| `git diff --check` | empty, exit 0 |
| scoped cadence-wording / consumer search | no `NON_MONOTONIC`, no `V_ROUTER`, no unqualified `result: "RED"`/`"GREEN"` in apps/packages/tests; `cadence_sensitivity` only in `auth-policy.ts` schema/row and the unit assertion |
| D1 unit mutant (`red_count` 2→1) | RED on the 1-vs-2 mismatch, then restored |
| successor env control `S3D_SUCCESSOR_CREATE_ONLY_DELAY_MS=25` | RED as required |
| retention env control `S3D_RETAIN_ONE_OBJECT_PER_REFUSAL=1` | RED as required (`598 != 4098`) |
| full `pnpm test` | **not run** (optional; runtime/integration hashes frozen) |

Command for the eight live titles:

```text
pnpm exec vitest run tests/integration/registration-database.test.ts -t \
  'S3d (D1 bounds hanging|rework4 proves capacity-refusal|rework4 labels the shallow|rework2 B4 measures healthy-MTA|D2 preserves the owner.s first|D2 prunes expired hashes|D3 keeps the registration link live|D4 keeps cooldown after a delivery-record)'
```

---

## Numbered findings

### 1. Primary 1 disclosure is truthful and load-bearing — not a blocker

Schema `packages/register/src/auth-policy.ts:199-226`, frozen row
`:442-468`, derivation prose `:470`, unit title `tests/unit/registration.test.ts:356`
(`S3d D1 rules arm-independent leases, a deadline, and truthful bounded retention`).

Independent inspection (`{SCRATCH}/disclosure-inspection.md`):

- 30 ms: observation/red/green 3/2/1; N=8 gap range tenths-ms 596–1158
  (59.6–115.8 ms); AUC ppm 620000–774000 (.620–.774);
  characterization `NOISY_2_OF_3_RED_RATE_NOT_DETERMINISTIC_LOWER_BOUND`.
- 60 ms: counts 1/0/1; gap 121 tenths ms (12.1 ms); AUC 529000 ppm (.529);
  characterization `SINGLE_GREEN_OBSERVATION_NOT_STABLE_BOUNDARY`.
- conclusion: central tendency orders safer as cadence rises; run-to-run noise
  comparable to the effect; 45 ms current and not uniquely load-bearing
  (`:224`, `:467`).
- recalibration trigger:
  `TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS`
  (`:225`, `:468`).
- 45 ms / N-star=2 / `480 + 2*45 = 570 < 600` / 30 ms headroom unchanged
  (`registration_activation_spacing_ms: 45` at `:417`;
  `maximum_unsaturated_concurrency: 2` at `:433`;
  `ruled_hash_and_provisioning_upper_bound_ms: 480` at `:436`;
  `binding_headroom_ms: 30` at `:438`; executable
  `derivedClampHeadroomMs` at `:586-609`).
- no stale unqualified RED/GREEN fields, no `NON_MONOTONIC` / `V_ROUTER` in
  source or tests; no runtime consumer of `cadence_sensitivity`.

Mutation: product-row `red_count: 2` → `1` at `:446` only. Exact unit title
failed at `tests/unit/registration.test.ts:362` on the single 1-vs-2 mismatch
(`{SCRATCH}/d1-mutation-red.log`, 1 failed / 23 skipped). Restored from
gold-bytes; eight hashes identical to entry.

### 2. D1 dispatcher bound, no un-notifiable commit, no extra raw tokens, accepted/committed ≥ 100 — not a blocker

Live `[S3d D1 RED/GREEN]`:
`attempts=132 accepted=103 timed_out=25 refused_busy=4 inflight=32
active_sends=32 queued=96/96 peak=32 raw_tokens_outside_active_send=0
committed_at_saturation=32 committed_after_drain=103`.

Assertions at `tests/integration/registration-database.test.ts:1075-1088`
require occupancy `{inFlight:32, activeSends:32, queued:96/96}`,
`rawTokensOutsideActiveSend === 0`, and committed-at-saturation = 32.
Source: `reserveMailDispatchPermit` throws `AUTH_MAIL_BUSY` at capacity
before mint (`apps/api/src/registration.ts:651-653`); token is minted only
inside `provisionPendingAccount` after the permit resolves (`:922-944`,
`:784-785`); FIFO queue is `push` / `shift` (`:667`, `:570`); 18 s deadline
rejects with the same opaque 503 (`:657-662`). Practical stop 103 matches
the V-ratified internal target, not a public SLA.

### 3. Retained-object bound is exactly 97 at N=500 and N=4000; scaling control fails — not a blocker

Clean live `[S3d REWORK4 N-INDEPENDENT RETAINED OBJECTS]`:
`positive_control=false … n500={queueNodes:96, refusalAggregates:0,
mailCapacityAggregates:1, positiveControlObjects:0, total:97} bound_500=97
n4000={… total:97} bound_4000=97 capacity_count=4000`.

Scaling control `S3D_RETAIN_ONE_OBJECT_PER_REFUSAL=1`
(`{SCRATCH}/retention-control.log`):
`positive_control=true n500 total=598 (positiveControlObjects=501)
n4000 total=4098 (positiveControlObjects=4001)`; increment 3500; assertion
`at500.total === at4000.total` RED at
`tests/integration/registration-database.test.ts:1344` (`598 != 4098`).
The N-independence claim is therefore able to fail.

### 4. Successor-labelled shallow probe: distinct existing rows, clean GREEN, +25 ms control detected — not a blocker

Clean live `[S3d REWORK4 SUCCESSOR-LABELLED SHALLOW]`:
`transport_ms=5000 n=16 target_arm=missing create_only_delay_ms=0
distinct_existing_markers=16 existing_marker_median_ms=5235.7
missing_marker_median_ms=5236.3
existing_marker_permit_to_activation_median_ms=135.0
missing_marker_permit_to_activation_median_ms=135.4
cross_auc=0.6367 <= null_auc_q99=0.7695
cross_accuracy=0.6250 <= 0.7500
sharp_cross_auc=0.6055 <= 0.7617
sharp_cross_accuracy=0.6563 <= 0.7500
in_window_sends_existing=32 in_window_sends_missing=32`.

Distinct existing-row setup is `existingMarkers` of length 16, seeded before
the loop (`tests/integration/registration-database.test.ts:2173-2180`).
Permit/activation hooks at `:2131-2150`; sharp series asserted at `:2329-2330`.

Test-owned control `S3D_SUCCESSOR_CREATE_ONLY_DELAY_MS=25` (create-branch
`dekStore.store` wrapper at `:2110-2116`; `expect([0, 25]).toContain` at
`:2068`). Live RED (`{SCRATCH}/successor-control.log`):
`create_only_delay_ms=25
existing_marker_permit_to_activation_median_ms=155.3
missing_marker_permit_to_activation_median_ms=182.1` (delta +26.8 ms)
`sharp_cross_auc=0.9219 > sharp_null_auc_q99=0.7676`
`sharp_cross_accuracy=0.9063 > 0.7500`
`in_window_sends=32/32`. Failed at `:2329`. Frozen `identity.ts` was not
edited. Deployment/storage sensitivity remains the V-accepted residual (1A).

### 5. Healthy-MTA burst 100/100 committed; practical stop 103; margin reported, not an SLA — not a blocker

Live `[S3d REWORK2 B4 AVAILABILITY]`
(`tests/integration/registration-database.test.ts:2335-2456`):

- burst 100: success=100 busy=0 committed=100 sends=100 p50=21241.8 ms
  p99=30327.0 ms max_queue_wait=17360.3 ms deadline_margin=639.7 ms
- burst 128: success=103 busy=25 committed=103 deadline_margin=8.3 ms
- burst 160: success=103 busy=57 committed=103 deadline_margin=-2.3 ms

`expect(hundred.successes).toBe(100)` and `expect(hundred.committed).toBe(100)`
at `:2454-2455` both held. Practical capacity stopped at 103. The 160-burst
−2.3 ms deadline figure is timer noise around the 18 s queue deadline at the
already-accepted stop; the ruled 100-request reference still has 639.7 ms
queue-deadline margin. Not converted into a public SLA (V ruling 2A).

### 6. D2/D3/D4: prior mailed credentials survive unauthenticated resend, prune at ruled lifetime, consume on activation, opaque delivery-failure audit — not a blocker

- D2 preserve: `attacker_resends=3 messages=4 live_hashes=4
  first_token_still_valid=true siblings_invalid=3 consumed_at=4/4`
  (`:2767-2828`; family consume in `packages/db/src/identity.ts:401-404`).
- D2 prune: `issued_tokens=81 live_hashes=72 ruled_maximum=73
  first_expired=true newest_active=true` (`:2831-2871`).
- D3: `immediate_resend_mails=1 first_link=active` (`:2922-2966`).
- D4: `cooldown_mails=1 failure_audits=1 raw_email_ip_ua_matches=0`
  (`:3678-3728`). Durable justification is correlation-only; source_context
  is argon2id hashes; row text contains no raw email/IP/UA.

Unauthenticated resend does not revoke prior mailed links (V ruling 4A).
Hash-only ledger: `migrations/0033_verification_token_credentials.sql:5-6`.

### 7. Enumerated security surfaces — no regression outside accepted residual

- Grant/successor timing: activation follows the 600 ms clamp
  (`apps/api/src/registration.ts:967-970`); successor probe is the maximally
  exposed queued regime and was clean on this host; the un-floored
  create-vs-duplicate DEK-store term is the named 1A residual, with a
  replayable +25 ms control that this lens reproduced RED.
- Raw token outside active send: D1 heap proof 0; mint is post-permit
  (`:784-785`, `:1048` for resend after `reserveMailDispatch`).
- Queue: 32+96 bound, FIFO, 18 s deadline, coalesced opaque capacity signal
  (`:599-668`). Cleanup via `drainMailDispatches` (`:773-776`).
- Credential replay / cross-family / expiry / deletion: D2 consume-family
  plus sibling invalidation; prune to ≤73; migration CHECK on hash form.
- Durable operator evidence: D4 opaque; capacity signal payload
  `OPAQUE_WINDOW_COUNT_AND_CORRELATION_NO_ADDRESS_OR_SOURCE`
  (`auth-policy.ts:184-185`, `:427`).
- Executable policy vs implementation vs tests: 32/96/45 ms/N-star=2/480/570/600/30
  are the same numbers in the Zod row, `authPolicyFromRegisterRows`,
  registration runtime, and the S3d D1 unit assertion.

### 8. Recut scope and frozen runtime — not a blocker

Cadence recut vs pre-recut hashes changed only `auth-policy.ts`,
`tests/unit/registration.test.ts`, and `logs/S3d-progress.log`. Frozen six
paths stayed at packet gold before, during, and after the lens mutant.
`registrationMailDispatchActivationSpacingMs` remains the literal 45
(`auth-policy.ts:525`). No product-behaviour drift was available for this
disclosure-only recut, and the live PostgreSQL suite above still matches the
V-ratified bars.

---

## Self-report

Read the packet, progress log, rework-4 adjudication packet, successor
refutation, both V-advisor memos, cadence-recut packet, and ticket comments
through the cadence-recut READY marker. Did not open the sibling final
verdict. Established gold from SHA-256, not git. Inventoried mtimes with
`find`/`stat`. Independently inspected schema, frozen row, derivation prose,
and the S3d D1 unit assertion. Mutated one disclosure count, observed the
exact unit assertion RED, restored byte-identically, and re-hashed all eight
paths. Ran the eight named live PostgreSQL tests on a freshly initdb'd
embedded PostgreSQL 18 cluster, plus both test-owned env-gated positive
controls (successor +25 ms; retain-one-object-per-refusal). Ran unit
registration, typecheck, lint, `git diff --check`, and a scoped stale-wording
search. Did not run the full 110-file suite. Ended with all eight hashes at
packet gold. No commit, push, product fix, sibling-verdict read, leftover
mutant, or Kanban mutation.

GREENLIGHT
