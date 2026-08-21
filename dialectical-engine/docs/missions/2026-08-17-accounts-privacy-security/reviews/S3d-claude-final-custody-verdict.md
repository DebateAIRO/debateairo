# S3d — Claude Opus final-custody verdict

CLAUDE CUSTODY GREENLIGHT

Seat: fresh `claude-opus-5` final-custody takeover, per
`reviews/S3d-claude-final-custody-packet.md`
(SHA-256 `b9ec14816c5f5affa377c56aa0f4dd56329b720598ef1f71f89837942a1aea93`,
matching Router's 2026-08-21 13:41 launch comment). Independent of the S3d
author `codex@gpt-5.6-sol`. Ticket `t_cc197ed2`, board `accounts-phase1`.

Every gate is green, every post-gate hash is exact, the candidate is unchanged
at packet gold, and the exact eight-path scope is committed locally. Not pushed.

---

## 1. Final full-suite gate — Router-authorized external run

This seat's Bash tool hard-caps a single foreground command at 600000 ms. The
suite needs ~1490 s, so it cannot be obtained here; two in-seat attempts died
without a summary (background run killed at session teardown; foreground run
SIGTERM'd at exactly 10m 0s, exit 143). I refused to call either green. Router
then ran the gate externally and exclusively, and that run is the final-suite
evidence for this custody decision.

I verified it fail-closed before accepting it:

| artifact | result |
|---|---|
| `logs/S3d-final-full-suite-gate-attempt2.status` | `0` |
| command in log header | `$ vitest run` — the repository's `pnpm test` script |
| **Test Files** | **110 passed (110)** |
| **Tests** | **820 passed (820)** |
| **Duration** | **1490.45 s** (transform 1.35 s, import 22.35 s, tests 1458.71 s, environment 843 ms) |
| window | start `2026-08-21T11:21:18Z`, end `2026-08-21T11:46:09Z` |
| in-log exit marker | `S3D_FINAL_FULL_SUITE_ATTEMPT2_EXIT=0` |
| `.before.sha256` vs `.after.sha256` | **byte-identical** (`diff` exit 0), and both equal the packet's eight-path gold table |
| independent failure sweep | 820 `✓` lines for 820 passing tests; zero failure markers |

The gate log additionally embeds the eight gold hashes inline both before and
after the run, so the suite is provably bound to this exact byte set rather than
to a neighbouring tree.

Every `FAIL`-shaped string in the log is a test *name* or a deliberate
negative-control fixture on a passing line (for example "keeps STARTED and
FAILED receipts durable when an observation write fails"), plus expected
embedded-PostgreSQL error output emitted by negative-path tests. None is a
failing assertion.

Test count moved 818 → 820 against the rework-3 record. That is the
disclosure-only recut adding its D1 policy assertion to the unit file; no test
was lost, and the file count is unchanged at 110.

### V-ruled bars, confirmed in the authoritative run

```
[S3d REWORK2 B4 AVAILABILITY] healthy_mta_ms=5
  burst=100 success=100 busy=0  committed=100 sends=100
        p50=21265.8ms p99=30779.9ms max_queue_wait=17492.0ms deadline_margin=508.0ms
  burst=128 success=104 busy=24 committed=104 deadline_margin=3.2ms
  burst=160 success=104 busy=56 committed=104 deadline_margin=4.7ms
[S3b DURABILITY BURST] concurrent=100 successes=100 committed_at_response=100
[S3b F3 ORDERING]      audit_failure=pre_dek_write before_commit_calls=0 persisted_accounts=0
[S3d REWORK4 N-INDEPENDENT RETAINED OBJECTS]
  baseline total=96 ; n500 total=97 bound_500=97 ; n4000 total=97 bound_4000=97 ; capacity_count=4000
[S3d REWORK4 SUCCESSOR-LABELLED SHALLOW] create_only_delay_ms=0 distinct_existing_markers=16
  permit_to_activation medians existing/missing 134.0 / 133.6 ms
  sharp_cross_auc=0.5430 <= q99 0.7617 ; sharp_cross_accuracy=0.6563 <= 0.7500
  cross_auc=0.6289 <= 0.7559 ; in_window_sends 32/32
[S3d REWORK2 B1 REAL-TIMEOUT GRANT INTERVAL]
  register n=16 medians 5235.2/5234.6ms auc=0.5430 <= 0.7559 ; acc=0.5938 <= 0.7500
  resend  n=16 medians 5701.2/5701.9ms auc=0.6563 <= 0.7578 ; acc=0.6875 <= 0.7500
[S3d REWORK2 ARM-NEUTRAL QUEUE DEADLINE] n=24 auc=0.5174 <= 0.7196
  reservation_wait_max=18004.0ms <= deadline_ceiling=18007.9ms
[S3d D2 LIFETIME] issued_tokens=81 live_hashes=72 ruled_maximum=73 first_expired=true newest_active=true
[S3d D3 CURRENT]  immediate_resend_mails=1 first_link=active
```

The ruled 100/100 reference target holds on both the B4 gate and the frozen S3b
durability test. Practical stop this run is 104, inside V's "around 103–104".

## 2. Remaining gates — run by this seat

| gate | exit | result |
|---|---|---|
| `pnpm typecheck` | 0 | `tsc --noEmit`, clean |
| `pnpm lint` | 0 | architecture `edgeRowsChecked: 28, violations: []`; source `"blocking": []` |
| `git diff --check` | 0 | clean |

## 3. Post-gate hashes — all eight exact

Recomputed after the external suite and after all three local gates. Every value
equals the custody packet table:

| path | SHA-256 |
|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` |
| `packages/register/src/auth-policy.ts` | `36359f2085e0fb0f710f060d0679ff9a5e55baa3ca37362d5af5f739afc2e6f0` |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` |
| `tests/unit/registration.test.ts` | `aea9f2c650665d3ddda70fd2c31015fef7b5b64de0d7431231d362770516098b` |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` |

Checkpoints where all eight were verified exact: entry pre-hash; after killed
run 1; after killed run 2; the external gate's own before/after manifests;
post-gate here. HEAD remained `5b2471d559f1ed5705dc3b9d55525497c5882478` and the
index remained empty throughout, up to my own staging step.

## 4. Independent verification performed by this seat

Not inherited from Hermes or from the reviewers.

**Authority and identity.** Custody packet hash matches Router's launch note;
final review packet `2f3150a3…8aef0cd5` exact; Hermes transcript
`b0e57a28…80432fe9` exact; ticket status `running` with the 13:41 comment still
delegating this takeover and no newer V change.

**Hermes handoff boundary.** Session `20260821_112016_a4501e`, model
`qwen3.8-hermes:27b`, 49 messages / 28 tool calls, `ended_at` and `end_reason`
both null — external termination. I enumerated all 28 tool calls: every one is a
read. No vitest run, no edit, no `git add`/`commit`, no board mutation. The
packet's account of the boundary is accurate, so I inherited those reads and
began execution at the pre-hash.

**Candidate shape.** Seven tracked files modified, migration 0033 untracked, no
eighth dirty tracked source path in `apps`/`packages`/`tests`/`migrations`.

**Full eight-path inspection**, including reading the untracked migration
independently because `git diff` is blind to it:

- **Migration 0033** — additive `CREATE TABLE IF NOT EXISTS`, hash-only with
  `CHECK (token_hash ~ '^(sha256:)?[0-9a-f]{64}$')`, `ON DELETE CASCADE` from
  `channel_binding`, idempotent backfill with `ON CONFLICT DO NOTHING`.
- **`identity.ts`** — resend deletes only *expired* credentials before inserting
  the new one, so prior mailed links survive an unauthenticated resend (4A);
  activation consumes the family scoped to the found row's own
  `channel_binding_id`, making cross-family activation structurally impossible;
  validity requires `consumed_at IS NULL` **and**
  `user_state = 'pending_verification'`, closing replay and sibling reuse.
- **`registration.ts`** — `reserveMailDispatchPermit` throws `AUTH_MAIL_BUSY`
  synchronously at queue capacity, before the hash is scheduled and before any
  token is minted; the token is minted only inside `provisionPendingAccount`,
  which runs after the permit resolves; `holdRegistrationEnumerationClamp` is
  awaited before lease activation; the duplicate arm performs equal
  transport-bound work; plaintext password and delivery references are dropped
  on start, cancel, and completion.
- **`mail-channel.ts`** — two lines, the truthful defence-in-depth comment
  recording that the CR/LF guard is currently shadowed by the shape regex.
- **`auth-policy.ts` / `registration.test.ts`** — the disclosure recut.

**Policy arithmetic re-derived by hand**, not accepted from the record:
`derivedPreTransportBudgetMs` = 500 + 100 = **600**; `minimum_reservation_ms` =
600 + 5000 + 100 = **5700**; `registration_minimum_reservation_ms` =
5000 + 100 = **5100**; `safetyAdjustedWorkMs` = ceil10(436 × 110/100) = **480**;
`derivedClampHeadroomMs` = 600 − (480 + 2 × 45) = **30** > 0;
`first_measured_unabsorbed_concurrency` 3 = 2 + 1. The 570 < 600 inequality and
the 30 ms headroom hold, and `authPolicyFromRegisterRows` throws
`AUTH_POLICY_INVALID` if any is violated.

**Cadence disclosure cross-checked against raw observations** in
`logs/S3d-progress.log`, not against reviewer summaries: 30 ms is 3 observations
/ 2 RED / 1 GREEN (115.8 ms & AUC .774 RED at 03:10; 102.2 ms & .716 RED at
02:41; 59.6 ms & .620 GREEN at 03:14), producing exactly the published 596–1158
tenths-ms and 620000–774000 ppm ranges; 60 ms is one GREEN observation at
12.1 ms / .529. Characterizations, the ordered-central-tendency conclusion, and
the `TARGET_HOST_OR_STORAGE_CLASS_CHANGE_OR_FIRST_UNCHANGED_CODE_RED_AT_45MS`
trigger all match 3A-prime. The disclosure is truthful against its own evidence.

**Scoped searches** — no `NON_MONOTONIC`/`V_ROUTER` anywhere in
`apps packages tests migrations`; `cadence_sensitivity` confined to
`auth-policy.ts` and the unit assertion, with no runtime consumer; no
`.only`/`.skip`/`xit`/`xdescribe` in the candidate tests; every `S3D_*` control
default-off; no `S3D_*` set in this seat's environment.

**Reviewer coverage of this exact byte set.** Both final verdicts are GREENLIGHT
with zero blocking findings, and both record entry==exit hash tables identical
to the packet gold and to my pre-hash — so the dual GREENLIGHT demonstrably
covers *this* byte set. Grok ran unit 24/24, the eight live PostgreSQL titles
8/8, typecheck, lint, `git diff --check`, one disclosure mutant RED, and both
env-gated controls RED. The Claude lens ran the same eight titles plus the
frozen S3b trio and deliberately chose a *different* disclosure mutant (the
recalibration trigger rather than a count), proving a second field load-bearing.
Neither ran the full suite and both said so plainly — which is exactly why the
packet assigned it to this seat, and why Router's external run was needed.

## 5. Accepted V rulings carried

- **1A** — the platform-dependent successor-provisioning residual is accepted;
  revalidation on deployment/storage-class change remains mandatory.
- **2A** — 100/100 committed registrations on the healthy-mail reference burst is
  the Phase-1 *internal* regression target, not a public SLA. Practical capacity
  may stop around 103–104 for now; larger margin and Argon2/threading work are
  deferred.
- **3A-prime** — retain 45 ms at N*=2. The disclosure states 30 ms as a noisy
  2-of-3 RED rate rather than a deterministic lower bound, and 60 ms as a single
  GREEN observation rather than a stable boundary. Recalibrate on
  target-host/storage-class change or the first unchanged-code 45 ms RED.
- **4A** — unauthenticated resend does not revoke previously mailed links; they
  expire at 24 h or are consumed on activation; authenticated recovery is
  outside Phase 1.

## 6. Residuals — stated honestly

1. **The final suite was run externally, not by this seat.** It is bound to this
   byte set by inline before/after manifests and an exit-0 status file, and I
   verified all of that fail-closed — but the execution itself is Router's, under
   explicit authorization, not my own observation. I record that plainly rather
   than implying I watched it run.
2. **Queue-deadline margin is thin and host-dependent.** This run: 508.0 ms at
   burst 100, but only 3.2 ms at burst 128 and 4.7 ms at burst 160 against the
   18 000 ms deadline. The executable gate is only `queueDeadlineMarginMs >= 0`,
   so the ruled target can pass with almost no margin. Not a regression — 100/100
   held on both B4 and frozen S3b — and V deferred margin work under 2A, but it
   belongs squarely under the mandated deployment/storage recalibration trigger.
3. **The successor residual (1A) remains exactly as open as V accepted it.** The
   clean probe passed on this host; nothing in code or policy bounds
   `|v_create − v_duplicate|`. The env-switched +25 ms control is the right
   instrument to re-run against real target storage.
4. **`production_equivalent_100_request_success_margin=0`** is computed as
   `successes − 100`, so it is identically zero on any pass — a pass/fail
   restatement, not headroom. Console output only, carrying no policy claim, but
   an operator could misread it.
5. **D1 does not itself floor the 100-request target.** It asserts
   `accepted + timed_out === 128` and `committed === accepted` with no lower
   bound on `accepted`. The ruled target is gated by B4 and the frozen S3b
   durability test; both are in the suite and both are GREEN.
6. **Single-heavy protocol was not absolutely clean during my in-seat work.** No
   vitest and no S3d seat were active, but two other missions had live Grok seats
   in this worktree (docker-hatchet G3 PlanReview PID 28595; PID 9562), plus idle
   Next dev and acceptance servers and the previously-ruled-irrelevant generic
   Grok CLI (PID 1358). Their writes are confined to `docs/missions/`. Router's
   external gate was run as an exclusive lane, which is what makes the
   full-suite evidence sound; my own local gates are insensitive to that load.
7. **A test seam exists in product code** — `RegistrationService` accepts an
   optional `verificationTokenFactory` defaulting to the real
   `generateVerificationToken()`. Both lenses reviewed and greenlit it; the D1
   heap proof depends on it. Recorded as an observation, not an objection.

## 7. Custody action taken

Staged exactly the eight literal packet paths in one command, verified the
cached name set contained exactly those eight and nothing else (rendered
`dialectical-engine/`-prefixed because the git toplevel is
`/Users/vladmihaimiron/Documents/DebateAIRO`, one level above the packet's named
repository path), inspected the cached diff, ran `git diff --cached --check`
clean, and committed locally with `feat(auth): harden verification mail flow`.

**Commit `dc9fd57f6adc10f24907f64f795951cbc2cee28a`**, parent
`5b2471d559f1ed5705dc3b9d55525497c5882478`, branch `dev`, 8 files changed with
3324 insertions and 173 deletions. The commit's name-only path set is exactly
the eight candidate paths and nothing else, and each staged blob was verified
byte-identical to packet gold before the commit.

**Not pushed.** No product code or test was edited by this seat. No Hermes or
Fable model/agent was launched; `hermes kanban` was used only as the board
client.

CLAUDE CUSTODY GREENLIGHT
