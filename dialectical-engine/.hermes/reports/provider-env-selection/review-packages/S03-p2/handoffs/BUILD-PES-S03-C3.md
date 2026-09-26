SKILLS LOADED: `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/using-superpowers/SKILL.md`; `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`; `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`; `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/test-driven-development/SKILL.md`; `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/verification-before-completion/SKILL.md`; `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/using-superpowers/references/codex-tools.md`; `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/test-driven-development/writing-good-tests.md`; `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/systematic-debugging/SKILL.md`.

2 READY · BUILD-PES-S03-C3 · BUILD(S03-C3), coding pass 1 · t_637d6e20 · session `01a0d82b-5b8c-78d3-9783-8a4b039a34e2`. Rollout: `/Users/vladmihaimiron/.codex/sessions/2026/09/25/rollout-2026-09-25T13-45-15-01a0d82b-5b8c-78d3-9783-8a4b039a34e2.jsonl`.

3 Artifact: `slice/provider-env-selection-s03` @ `98264a5ea837676c869725ede592ca5abcaaf5cb`. ONE commit after the third GREEN, staged only `deploy/vps/README.md` and `tests/unit/v9-provider-credential-files.test.ts`. START `ec66d5e7c6ed77242c1e0d513b2de77596deadae`; final lane dirty count **0**.

4 Verification: **CLUSTER_GREEN ×3**, v9 **31/31**, baseline **31/31** every run; worst verdict GREEN. Ordered RED and refutation evidence below. Typecheck diagnostic delta **zero**, including zero diagnostics in allowed paths.

5 Findings: no blocking implementation finding. Final `origin/dev` resolves to `a6d6382bae10a7dc5d84cf407f576169b001c0e8`, whereas `.hermes/planning/provider-env-selection/packets/COMMON.md:33` records `776359c3`. No fetch by this seat; timing UNVERIFIED. The measured merge-base is still `776359c3`; both live-ref and pinned-base product diffs are empty. VERDICT: record the live-ref difference / CONFIDENCE high / STRONGEST COUNTER: the immutable START and all cluster pairs matched dispatch. The CLAIM listener-line transcription error was corrected in HEARTBEAT: bind at `tests/unit/v9-provider-credential-files.test.ts:569`, close at `:583`.

6 UNVERIFIED: V's personal acceptance and unrelated integration suites were not run. Known PLAN limits reproduced: the note pin admits an added contradictory sentence, and mention counting admits another occurrence on an already-counted line. No new V row.

7 Self-report filed FIRST: [BUILD-PES-S03-C3.md](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/agent-reports/BUILD-PES-S03-C3.md).

8 comments read through: **3**.

**Charges 1–3: START and tests-first evidence.** CLAIM used the measured date `2026-09-25 13:46:53 EEST`, session/rollout above, START branch/HEAD, dirty count 0 and comment cursor 1. All comments were read again before READY.

Log directory `P = /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S03-C3`. Every suite run used the repository `run-capture.sh` and `run-suites.sh`; full logs remain at P, with separate `.capture.log` files. No custom runner file was written.

START, BASE pairs, `P/C3-START-base-attempt-1.log`:

```text
 Test Files  1 passed (1)
      Tests  28 passed (28)
tests/unit/v9-provider-credential-files.test.ts rc=0 passed=28 failed=0 (expect 28/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_GREEN
```

START, C3 target pairs, `P/C3-START-target-attempt-1.log`:

```text
 Test Files  1 passed (1)
      Tests  28 passed (28)
tests/unit/v9-provider-credential-files.test.ts rc=0 passed=28 failed=0 (expect 31/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_RED
```

**RED events, in order: C3-1 → C3-2 → C3-3, all before any README edit.** These failures are this seat's deliberate TDD states, observed 2026-09-25; no BROKEN suite.

Case names in `tests/unit/v9-provider-credential-files.test.ts`:

- C3-1, now :719: “README §11's support-chat note names the refusal a hosted operator meets (R3.4)”.
- C3-2, now :732: “README §11's refusal row for COST_ENVELOPES_NOT_SEALED calls it a build-integrity check (R3.4b a)”.
- C3-3, now :750: “README §10's production-maker bullet names the live refusal, and two lines name COST_ENVELOPES_NOT_SEALED (R3.4b b)”.

C3-1 failed at `the overruled sentence is gone (C3-4)`; `P/C3-1-red-attempt-1.log`:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
tests/unit/v9-provider-credential-files.test.ts rc=1 passed=28 failed=1 (expect 31/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_RED
```

C3-2 added the failure `the row, EXACT, once, in the table (C3-5)`; `P/C3-2-red-attempt-1.log`:

```text
 Test Files  1 failed (1)
      Tests  2 failed | 28 passed (30)
tests/unit/v9-provider-credential-files.test.ts rc=1 passed=28 failed=2 (expect 31/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_RED
```

C3-3 added the failure `the bullet names these two codes and no other (C3-6)`; `P/C3-3-red-attempt-1.log`:

```text
 Test Files  1 failed (1)
      Tests  3 failed | 28 passed (31)
tests/unit/v9-provider-credential-files.test.ts rc=1 passed=28 failed=3 (expect 31/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_RED
```

`C3-3-red-attempt-2.log` has the identical frame after restoring two blank separators to match the PLAN block literally; this also preceded any README edit. The unavailable `rg` summary command was replaced with `/usr/bin/grep`, reading that same log without another test run.

Document boundaries: `C3-4-boundary-attempt-1.log` = v9 29/31, failures C3-2/C3-3, CLUSTER_RED; `C3-5-boundary-attempt-1.log` = 30/31, failure C3-3, CLUSTER_RED; `C3-6-boundary-attempt-1.log` = 31/31, CLUSTER_GREEN. Baseline remained 31/31.

Changed pairs (passed/failed): **v9 28/0 → 28/1 → 28/2 → 28/3 → 29/2 → 30/1 → 31/0**. Final expected pair **28:0 → 31:0**; baseline **31:0 → 31:0**.

Measured inherited facts: the old extractor at v9 :457 is double-quote-only; the price throws at `packages/providers/src/index.ts:687` and `apps/runner/src/main.ts:117` use backticks. At START, README §11 began :708, refusal span :758–:782, known-stale heading :14. No earlier test byte changed. V-8's run-time spend codes remain outside the table.

**Charge 5: three-run table.**

| Run | Marker | v9 | Baseline | Full log |
|---|---|---|---|---|
| 1 | CLUSTER_GREEN | 31/31 | 31/31 | [C3-7-green-attempt-1.log](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S03-C3/C3-7-green-attempt-1.log) |
| 2 | CLUSTER_GREEN | 31/31 | 31/31 | [C3-7-green-attempt-2.log](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S03-C3/C3-7-green-attempt-2.log) |
| 3 | CLUSTER_GREEN | 31/31 | 31/31 | [C3-7-green-attempt-3.log](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S03-C3/C3-7-green-attempt-3.log) |

Each log contains this verbatim frame:

```text
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/unit/v9-provider-credential-files.test.ts rc=0 passed=31 failed=0 (expect 31/0)
 Test Files  1 passed (1)
      Tests  31 passed (31)
tests/architecture/vps-deployment-baseline.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_GREEN
```

Typecheck START and final both contain:

```text
apps/ui/lib/v3/answerExport.ts(2,38): error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean '../aiDisclosure.js'?
```

This was measured at START on 2026-09-25, before edits; it is unchanged in `C3-7-typecheck-attempt-1.log` (rc=1). No allowed-path diagnostic was added.

**Refutation matrix.** Target suite is v9; cases are named above. Every M state printed CLUSTER_RED; every admitted N state printed CLUSTER_GREEN. Baseline stayed 31/31 in every mutation and restore.

| Property | Mutant | Failing case(s); v9 passed/total | Neighbour admitted | Restore |
|---|---|---|---|---|
| Old sentence absent | M_keepold | C3-1; 30/31 | N_support | GREEN |
| Live-policy sentence exact | M_noLive | C3-1; 30/31 | N_support | GREEN |
| Integrity sentence exact | M_noIntegrity | C3-1; 30/31 | N_support | GREEN |
| Table row retained | M_rowDropped | C3-2, C3-3; 29/31 | N_liveMeaning | GREEN |
| Row inside refusal table | M_rowOutside | C3-2; 30/31 | N_liveMeaning | GREEN |
| Row occurs once | M_rowDuplicate | C3-2, C3-3; 29/31 | N_liveMeaning | GREEN |
| Row meaning exact | M_rowOld | C3-2; 30/31 | N_liveMeaning | GREEN |
| UNRESOLVED row below | M_above_UNRESOLVED | C3-2; 30/31 | N_liveMeaning | GREEN |
| INVALID row below | M_above_INVALID | C3-2; 30/31 | N_liveMeaning | GREEN |
| No obsolete publication phrase | M_stalePublished | C3-2; 30/31 | N_support | GREEN |
| No obsolete claim phrase | M_staleClaim | C3-2; 30/31 | N_support | GREEN |
| Production-maker bullet exists | M_bulletGone | C3-3; 30/31 | N_row | GREEN |
| Bullet names only two live codes | M_bulletExtraCode | C3-3; 30/31 | N_row | GREEN |
| Bullet refusal sentence exact | M_bulletWording | C3-3; 30/31 | N_row | GREEN |
| Exactly two mention lines | M_extraMention | C3-3; 30/31 | N_sameLine | GREEN |
| One mention is the table row | M_rowIndent | C3-2, C3-3; 29/31 | N_sameLine | GREEN |
| Other mention belongs to note | M_swap | C2-2, C3-1, C3-3; 28/31 | N_sameLine | GREEN |

Mutations: M_keepold reintroduces the old sentence; M_noLive removes the live sentence; M_noIntegrity changes its integrity wording. Row mutations drop, move, duplicate, revert, reorder or indent the row as named. M_stalePublished/M_staleClaim reintroduce each banned phrase. Bullet mutations delete the bullet, add the old code or alter the required sentence. M_extraMention adds a known-stale-list mention. M_swap moves the note's mention to the known-stale list while retaining two total lines; it also deliberately fails the inherited C2-2 case at :673, “README §11's support-chat note names the sealed-envelope refusal, not a daily cap ceiling”.

Admitted neighbours, all v9 31/31 and baseline 31/31: N_support adds a contradictory third sentence; N_liveMeaning changes wording in the adjacent UNRESOLVED row; N_row changes historical prose before the bullet's pinned sentence; N_sameLine duplicates the integrity code on its existing note line. All were reverted.

For every M/N name above, exact evidence paths are `P/C3-refute-<name>-attempt-1.log`, `P/C3-refute-<name>-restore-status-attempt-1.log`, and `P/C3-refute-<name>-restore-green-attempt-1.log`. Each of all 21 restores printed:

```text
 M dialectical-engine/deploy/vps/README.md
 M dialectical-engine/tests/unit/v9-provider-credential-files.test.ts
```

Each restore then printed CLUSTER_GREEN, 31/31 in both suites; the bytes were checked against the saved edited README. No mutant was committed.

**Charges 6–8: boundaries and handoff.** `git diff --stat origin/dev...HEAD -- apps packages` printed nothing; so did the pinned `776359c3...HEAD` comparison. The required capability check `git diff --stat origin/dev~200...origin/dev -- apps packages` printed:

```text
 266 files changed, 34233 insertions(+), 4550 deletions(-)
```

`git diff --stat ec66d5e7c..HEAD` names exactly the two authorized files; `git diff --stat origin/dev...HEAD -- tests/architecture/` is empty. Evidence: `C3-7-postcommit-attempt-1.log`, `C3-7-product-capability-attempt-1.log`, `C3-7-ref-audit-attempt-1.log`. No sibling paths were present. Only the suite's inherited ephemeral loopback bind ran; all invocations exited. No persistent listener, live database, real key, NO-TOUCH port, install, desktop action, push, merge, stash, Done, board switch or mission-document staging. Board writes were this ticket's CLAIM, corrective HEARTBEAT and READY only.

## PROGRESS records

**Charge 4, R3.4b sweep:**

| Member at START | At commit | Step |
|---|---|---|
| `deploy/vps/README.md:700`, §10's old code | Removed; the bullet at :699–:701 names only the two live codes | C3-6 |
| `deploy/vps/README.md:737`, support note | `deploy/vps/README.md:741`, build-integrity wording | C3-4 |
| `deploy/vps/README.md:769`, refusal row | `deploy/vps/README.md:775`, retained and reworded | C3-5 |

Exactly **3 → 2** code-bearing README lines. The known-stale list was untouched. The refusal span still has **19** table lines. R3.8: baseline assertions changed **zero**; baseline file byte-identical to START, rerun at 31/31. R3.9's shell-block assertion at baseline :378 remains GREEN.

`C3-7-surface-audit-attempt-1.log` proves the README outside the three regions is byte-identical, and the old v9 contents form an unchanged prefix followed by the exact PLAN describe. The postcommit `git diff ec66d5e7c -- deploy/vps/README.md` has only these three hunks, quoted verbatim:

```diff
diff --git a/dialectical-engine/deploy/vps/README.md b/dialectical-engine/deploy/vps/README.md
index fb5801396..ed38113a9 100644
--- a/dialectical-engine/deploy/vps/README.md
+++ b/dialectical-engine/deploy/vps/README.md
@@ -696,8 +696,9 @@ Record each drill: date, artefact, `core.run` count, chain totals, and the decry
   **local** deployment — a supported product path for anyone running the repository on their own
   computer — which this host refuses in code. What remains open is only the vendor list and the
   spend ceiling: V names the vendors when the accounts exist, and the per-run and daily cost
-  envelopes are V-28's (until they are sealed, a hosted runner refuses to start with
-  `COST_ENVELOPES_NOT_SEALED`).
+  envelopes are V-28's. Until V-28's cost-envelope policy is sealed at the register version a
+  hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED`
+  or `COST_ENVELOPE_POLICY_INVALID`.
 - Six P3-01 principals are `REQUIRED_NOT_WIRED` (`evaluator-worker`, `evaluator-api`,
   `evaluator-reader`, `obs-writer`, `obs-listener`, `obs-watchdog`). The provisioner reconciles all
   sixteen and expects a credential for each; either wire them or provision them with `VALID UNTIL`
@@ -733,8 +734,13 @@ carries `SUPPORT_RELAY_NOT_COMPOSED:` and the ref that could not be composed.
 
 **What the support chat cannot tell you yet.** Its spend row records the tokens a vendor
 reports, but most vendors report no money at all, so the `cost_usd` column stays empty and the
-deployment still needs sealed cost envelopes (V-28). A hosted deployment refuses to start until
-the cost envelopes are sealed, with the code `COST_ENVELOPES_NOT_SEALED`. A reply that
+deployment still needs sealed cost envelopes (V-28). A hosted deployment reads the `costEnvelopePolicy`
+row in force at its own `REGISTER_VERSION` and refuses to start with
+`COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with
+`COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed.
+`COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the
+envelope row this build ships was removed, emptied or made invalid, and the shipped source
+never reaches it at runtime. A reply that
 carries no cost is logged once as `SUPPORT_MODEL_COST_UNREPORTED`, so an empty column is never
 mistaken for a call that was free.
 
@@ -766,7 +772,7 @@ The paid-vendor probe spends `max_tokens: 8` per target per staleness window; th
 | `PROVIDER_INLINE_CREDENTIAL_REFUSED:` and the provider ref | a credential written into `PROVIDER_DISCOVERY_TARGETS_JSON` instead of a file. |
 | `PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the provider ref | nothing is provisioned at that `authorization_file` path. Provision the file; do not go looking at the one that is there, because there is not one. The reader's own code for this, if you meet it in the source, is `PROVIDER_CREDENTIAL_FILE_ABSENT`. |
 | `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:` the provider ref, then the reason | the credential file is there but cannot be used: it failed custody (`SECRET_CUSTODY_INVALID`), the custody group could not be resolved (`CUSTODY_GROUP_UNRESOLVED`), or its contents are not one printable header line (`PROVIDER_CREDENTIAL_FILE_INVALID`). Neither the path nor a byte of the credential appears in the message. |
-| `COST_ENVELOPES_NOT_SEALED` | the per-run and daily cost envelopes (V-28) are not published yet. A hosted runner refuses to claim work until they are. |
+| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
 | `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `PROVIDER_REF` does not name the FIRST entry of `PROVIDER_DISCOVERY_TARGETS_JSON`. |
 | `SUPPORT_MODEL_CREDENTIAL_ABSENT` | the support chat's target names a vendor API and declares no credential at all — no `authorization_file`. Every row above applies to `SUPPORT_MODEL_TARGET_JSON` as well; these last two are the support chat's own. |
 | `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `SUPPORT_MODEL_TARGET_JSON` is neither of the two lawful shapes: a vendor API (`https:`, path ending in `/v1`) or, in LOCAL mode only, the ratified loopback relay. A target that IS an API target but is malformed refuses with the matching `PROVIDER_DISCOVERY_*` code instead, so this one means "this is not a target". |
```

No V-ROW: NEW blocks. comments read through: **3**.
