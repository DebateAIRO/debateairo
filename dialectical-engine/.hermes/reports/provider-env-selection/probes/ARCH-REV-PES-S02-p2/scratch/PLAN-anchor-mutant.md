# PLAN — slice S02 · filled by ARCH-PES-S02 (node ARCH(S02), pass 1 of 3, 2026-09-25)

**Revision 2** — ARCH-FIX-PES-S02-p2 (node ARCH-FIX(S02), pass 2 of 3, ticket t_8bddd97c, 2026-09-25), after the verdict REWORK of `docs/missions/provider-env-selection/reviews/ARCH-REV-S02-p1.md`. Changed: **B1** → S02-S13 (the `callbackLookup` stub and case 6), S02-S14 (the pass-through sentence), S02-S16 (the `lookup` default), S02-S17 (the stub and case 6), S02-S18 (row 3 through `resolveAll`, the DNS line, and the two `node:dns` gates), §7 rows S02-S13, S02-S18; **N1** → §3 S02-C1 RED-event cell (dev-api-environment 10 / 2) and S02-S03's RED sentence; **N2** → S02-S04 (ii) step 3 (the mock body labelled EXACT). Clusters S02-C1, S02-C2 and S02-C3 keep their commands; each was re-run at base for this revision (§3 verdict column, §9).

**Revision 3** — ARCH-FIX-PES-S02-p3 (node ARCH-FIX(S02), pass 3 of 3, ticket t_50d2d8d3, 2026-09-25), on V's ruling V-12/V-13 "Exit 1 on FAIL (Recommended)" (`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:24`) as `SPEC-v4.md` words it (§5 steps 4 and 8, `SPEC-v4.md:230-234` and `:253-259`; no requirement changed). The SPEC of record is now `SPEC-v4.md`. Changed: the header paragraph (SPEC of record); §1 row "pnpm's output streams" and the SPEC version cited by three §1 rows
(RED-at-base suites ×2, free port); §2 (the SPEC-v4 anchor line and the §5 row); §4 intro and V6; S02-S09 (step 2's SPEC version); S02-S16 (the fixture's SPEC-v4 lines); S02-S17 (case 1's title; the `outcome` asserted in cases 5, 6 and 7); S02-S18 (the step-5 SPEC version); S02-S19 (the exit mapping, the two exact-line gates, and the Done-when run through SPEC-v4 step 4); §7 rows S02-S16, S02-S17, S02-S19; §8 item 4; §9. Revision 2's text is otherwise unchanged. Clusters S02-C1, S02-C2 and S02-C3 keep their commands, and each was re-run at base for this revision (§3, §9).

REQ-PES wrote this skeleton, and REQ-FIX-PES re-aimed it at `SPEC-v2.md` after the blind REQ-REV
pass 1 and at `SPEC-v3.md` after REQ-REV pass 2, both on 2026-09-24. The ARCH(S02) seat fills it
and owns every choice in it. REQ owns the WHAT in **`SPEC-v4.md`** (the SPEC of record since REQ-FIX-PES-p4 applied
V-12/V-13 on 2026-09-25; `SPEC.md`, `SPEC-v2.md` and `SPEC-v3.md` are frozen history, and `SPEC-v4.md:8-230` is
byte-identical to `SPEC-v3.md:8-230`) and nothing below. Filled 2026-09-25 by ARCH-PES-S02 on ticket
t_b4187218. Every `path:LINE` below was re-grepped in the lane
`.worktrees/pes-s02/dialectical-engine` at `776359c3`. Each choice and each rejected alternative is a
row of `DECISIONS.md` (the 2026-09-25 block). Paths are relative to the lane unless written absolute.

**The quantifiability law.** Every step is finite, categoric and mechanically checkable by a
stranger. The banned words — improve, better, robust, handle, appropriate — appear in this
paragraph ONLY as the counter-example that names them, and in no criterion of this slice.
WRONG: "handle the missing credential". RIGHT: "a hosted boot whose target names an
`authorization_file` at which nothing is provisioned exits non-zero printing
`PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the ref, and the test asserting this passes."

## 1. START frame — measured before the first step, never assumed

| what | where | read by |
|---|---|---|
| suite pairs at base | `.hermes/reports/provider-env-selection/logs/baseline-intake-suites.log` (per-suite table cited at `docs/missions/provider-env-selection/00-intake.md:40`). This seat re-ran C1's eight suites at base on 2026-09-25: `probes/ARCH-PES-S02/C1-base-run2.log`, and the seven that `baselines.tsv` lists are identical to it. | every cluster's verification |
| typecheck at base | `.hermes/reports/provider-env-selection/logs/baseline-intake-typecheck.log` — DELTA per file, never rc. Base = exactly 1 diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835` (`00-intake.md:41`) | S02-S11, S02-S15, S02-S20, §4 V4 |
| the two RED-at-base suites this slice touches | `tests/integration/dev-api-environment.test.ts`, 9/1: DEV-09 'atomically assembles the exact environment without returning credential values' fails at `:177`, because `EVALUATOR_DATABASE_URL` is not a key the assembler writes. `tests/integration/dev-api-process.test.ts`, 5/5: the five default-profile DEV-10B cases fail at the `exact` loop, `apps/runner/src/dev-api-process.ts:215-217`. By reading, the first mismatching entry is `EVALUATOR_DEV_MENU_ENABLED`: the fixture has `"true"` (`tests/integration/dev-api-process.test.ts:79`) and the pin has `"false"` (`apps/runner/src/dev-api-process.ts:209`). That is a DETERMINISTIC mismatch, not the "environment-dependent" failure of `00-intake.md:41`. Failure families at `00-intake.md:41`; machine-readable `logs/baselines.tsv` | `SPEC-v4.md` R2.4 — recorded case by case in `PROGRESS.md` (S02-S10) |
| the two RED-at-base suites this slice does not touch | `tests/integration/dev-provider-panel.test.ts` 3/1 and `tests/integration/t16-algorithm-register.test.ts` 20/1. By reading, dev-provider-panel's failure is also deterministic: `:11-24` loads the literal `TEST_DEVELOPMENT_PROVIDER_PANEL` record (five slots) and expects two, and it makes no network call. SPEC-v4 §4 and `00-intake.md:41` say "this host answers four live relay slots". | `SPEC-v4.md` §4 — unchanged at their pairs |
| a fifth RED-at-base suite, run by C1 | `tests/architecture/register-support-publication.test.ts`, 14/1 at base. `:475` 'dev's 6a05a0d0 expectation: the sealed development-v4 fixture hashes to the moved snapshot constant' fails on a register snapshot hash, unrelated to S02. It is not in the 36-suite baseline. C1 runs it because `:350-355` pins the source text of `DEVELOPMENT_API_ENVIRONMENT_KEYS`. (`probes/ARCH-PES-S02/C1-base-run1.log`) | S02-C1 pair `14:1`; §4 V2 |
| free port for the fake vendor | measured by the fixture itself with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, above 4400, never a COMMON §6 port, never 4455 (R2.7's never-bound port). Measured 2026-09-25: 4460 free (`probes/ARCH-PES-S02/spike-hosted-chain.log`) | `SPEC-v4.md` R2.5a; S02-S14 |
| ~~S01's publish command~~ | **NOT a frame of this slice.** `SPEC-v2.md` withdrew the S01 dependency and `SPEC-v3.md` keeps it withdrawn: R2.8 composes `createProviderDiscoveryResolver` (`apps/api/src/provider-discovery.ts:40-48`) in process from literal values, reads no register and opens no database (`reviews/REQ-REV-p1.md:23-30`, B2) | `SPEC-v3.md` header |
| lane | `.worktrees/pes-s02/dialectical-engine` on `slice/provider-env-selection-s02` @ `776359c3`, dirty 0 (2026-09-25 08:44, and after every base run of §9) | every BUILD seat |
| toolchain | node v26.9.0 with `/opt/homebrew/bin` first on PATH · pnpm 11.20.0 · tsx 4.23.11 (`--no-cache` exists) · vitest 5.0.1 · `/usr/bin/openssl` = LibreSSL 3.3.6 · `openssl` on that PATH = OpenSSL 3.6.4 · `lsof` on PATH · no `undici` package in `node_modules` | S02-C2, S02-C3 |
| NO-TOUCH listeners, 2026-09-25 08:4x | `:4310` (node pid 95068) and `:55432` (docker pid 19920) listening. `:3000 :3001 :8790 :8791 :8792 :8793 :8795 :8796` not listening. | §4 V6 (acceptance steps 3 and 10) |
| DNS for R2.6 | the OS resolver answers `api.localtest.me` → `127.0.0.1` (v4), `::1` (v6), in that order. `isRefusedHostedProviderHost("api.localtest.me")` is false and `("127.0.0.1")` is true (spike log) | S02-S18 |
| pnpm's output streams | `probes/ARCH-PES-S02/pnpm-streams.out`: the `$ <script>` banner goes to stderr. After a script that exits non-zero, pnpm writes `[ELIFECYCLE] Command failed with exit code 1.` to STDOUT. Through SPEC-v4 step 4's `> <log> 2>&1`, the banner `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts` is the log's FIRST line, and on a non-zero exit `[ELIFECYCLE]` is its LAST (`probes/ARCH-FIX-PES-S02-p3/pnpm-exit-rule.out`, real pnpm 11.20.0) | S02-S19, §4 V6; SPEC-v4 §5 step 8 (V-12/V-13 ruled, `V-DECISIONS-PACKET.md:24`) |

## 2. SPEC → step trace skeleton

Anchors in `SPEC-v4.md` (Revision 3): R2.1 `:52` · R2.2 `:57` · R2.2b `:63` · R2.3 `:68` · R2.4 `:75` · R2.5 `:86` · R2.6 `:116` · R2.7 `:126` (fixtures `:141-145`) · R2.8 `:153` · R2.9 `:179` · R2.10 `:189` · R2.11 `:197` · §4 `:201` · §5 `:217` (step 2 `:223-226`, step 4 `:230-234`, step 8 `:253-259`).

| requirement | what it constrains | step ids | cluster |
|---|---|---|---|
| R2.1 | `DEBATEAI_DEPLOYMENT_MODE=local` declared in the assembled API environment | S02-S01, S02-S02 (a), S02-S03, S02-S04, S02-S05, S02-S06, S02-S07, S02-S09 | S02-C1 |
| R2.2 | the runner record at `apps/runner/src/dev-runner-process.ts:85-128` sets the key to `local` | S02-S02 (b), S02-S08, S02-S09 | S02-C1 |
| R2.2b | two cases in `tests/unit/v9-deployment-mode.test.ts` whose `it(...)` text contains `declares DEBATEAI_DEPLOYMENT_MODE=local` — the exact path §5 step 2 runs | S02-S01, S02-S02, S02-S09 | S02-C1 |
| R2.3 | the resolution rule and the four v9 cases, unmoved | S02-S02 (the four names kept), S02-S09 (v9 203/0), §4 V5 (f) and (h) | S02-C1 |
| R2.4 | the two RED-at-base suites recorded case by case | S02-S03, S02-S04, S02-S10 | S02-C1 |
| R2.5 | the fixture: free port · TLS trusted through the `fetchImplementation` seam only · the body the probe accepts (`model` equal, `content` exactly `OK`) · 401s · the literal `Bearer pes-s02-fake-vendor-token` | S02-S12, S02-S13, S02-S14, S02-S15, S02-S18 (wiring of the seam) | S02-C2, S02-C3 |
| R2.6 | the admitted base URL `https://api.localtest.me:<port>/v1`, and UNVERIFIED on a resolver failure | S02-S12 (host constant), S02-S13 (case 6), S02-S14, S02-S17 (case 6), S02-S18 (DNS pre-check) | S02-C2, S02-C3 |
| R2.7 | the five refusals through the shipped chain in the order of `apps/api/src/main.ts:300-318`, from the five fixtures written out exactly (the loopback one `https:`), each printed verbatim with its ref | S02-S16, S02-S17 (cases 1, 5), S02-S18 | S02-C3 |
| R2.8 | the credential at `<scratch>/custody.d/vendor.header` (directory `0700`, file `0600`); the IN-PROCESS resolver composed with the RESOLVED targets, `probeFreshnessMs` `600000` and `probeTimeoutMs` `5000`; the target joining the panel | S02-S16, S02-S17 (cases 1, 4), S02-S18 | S02-C3 |
| R2.9 | never printed: the exact token `pes-s02-fake-vendor-token`, `Bearer` followed by a token, or any path at or beneath `<scratch>/custody.d`; a refusal CODE containing `authorization` is lawful | S02-S17 (cases 2, 8), S02-S18 (guarded emit), S02-S19 (the CLI never prints an error message) | S02-C3 |
| R2.10 | one scratch root (base name begins `pes-s02-`, no `custody`), created and removed, its path printed; it is not the custody directory | S02-S17 (cases 2, 3), S02-S18, S02-S19 (`tsx --no-cache`) | S02-C3 |
| R2.11 | no foreign process started, stopped or called; no database connection at all; no register row written | S02-S13 (case 5), S02-S14, S02-S18, S02-S20, §4 V5 (d)(e) | S02-C2, S02-C3 |
| §5 acceptance, steps 1–10 | V's own run on this Mac; step 8's verdict and exit code (V-12/V-13) | S02-S02 (step 2), S02-S19 (steps 4 and 8: the script, the exit mapping), S02-S18 (steps 5–9), S02-S17 (step 8: each verdict's `outcome`) | §4 V6 |

## 3. Cluster table — build units, one verification command each

| cluster | steps | one verification command | RED event written first | base verdict at `776359c3` (run by this seat from a `.sh`) |
|---|---|---|---|---|
| S02-C1 | S02-S01 … S02-S11 | `run-suites.sh`, eight pairs. The EXACT command is below this table and is the command of `probes/ARCH-PES-S02/C1-base.sh`. | After S02-S04, before any production step: the same command prints `CLUSTER_RED` with v9 **201 passed / 2 failed** (the two `declares DEBATEAI_DEPLOYMENT_MODE=local` cases), dev-api-environment **10 / 2** (DEV-09 plus S02-S03 case (a); case (b) is green here, because the `DEV_API_ENVIRONMENT_DRIFT` it expects is already thrown at base, `apps/runner/src/dev-api-environment.ts:284-287`), dev-api-process **5 / 6** (the five DEV-10B base failures plus the S02-S04 case), and the other five suites at their pairs | **CLUSTER_RED — TDD-RED, expected.** v9 201/0, dev-api-environment 9/1, dev-api-process 5/5. The five others sit at their pairs (8/0, 7/0, 16/0, 3/0, 14/1). No BROKEN. Log `probes/ARCH-PES-S02/C1-base-run2.log`. **Revision 2 re-run** (the same command): `CLUSTER_RED`, the same eight counts, `probes/ARCH-FIX-PES-S02-p2/C1-base.out`; the reviewer's script re-run: identical, `rev-C1-base.out`. **Revision 3 re-run** (the same command): `CLUSTER_RED`, the same eight counts, `probes/ARCH-FIX-PES-S02-p3/C1-base.out` |
| S02-C2 | S02-S12 … S02-S15 | `LOG=<abs log> zsh …/run-suites.sh acceptance/pes-s02-fake-vendor.test.ts:6:0` | After S02-S13, with S02-S12's skeleton in place: **0 passed / 6 failed**, each case failing on `NOT_IMPLEMENTED`. That is RED, not BROKEN, because the module loads. | **OMITTED — the only path is CREATED by S02-S13** (packet §2 verification clause). `probes/ARCH-PES-S02/C2-C3-base.out` prints `ABSENT-AT-BASE` for it and for the module it imports. Revision 2 re-run: `ABSENT-AT-BASE` for all six created paths, `probes/ARCH-FIX-PES-S02-p2/C2-C3-base.out`. Revision 3 re-run: the same, `probes/ARCH-FIX-PES-S02-p3/C2-C3-base.out` |
| S02-C3 | S02-S16 … S02-S20 | `LOG=<abs log> zsh …/run-suites.sh acceptance/pes-s02-hosted.test.ts:8:0` | After S02-S17, with S02-S16's skeleton in place: **0 passed / 8 failed** on `NOT_IMPLEMENTED` | **OMITTED — the only path is CREATED by S02-S17.** Same `.out`: `ABSENT-AT-BASE`. Revision 2 re-run: the same, `probes/ARCH-FIX-PES-S02-p2/C2-C3-base.out`. Revision 3 re-run: the same, `probes/ARCH-FIX-PES-S02-p3/C2-C3-base.out` |

`…/run-suites.sh` = `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`.
Every command runs with cwd = the lane and `export PATH="/opt/homebrew/bin:$PATH"` first.

S02-C1 command (EXACT):

```
LOG=<abs log> zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/register-support-publication.test.ts:14:1
```

**The members behind every count in these pairs.** v9 203 = 201 base cases + S02-S02 (a) + (b). dev-api-environment
11 passed = the 9 green base cases (base log `:348-356`) + S02-S03 (a) + (b), and 1 failed = DEV-09 (`:346`).
dev-api-process 6 passed = the 5 green base cases (base log `:386-389`, `:396`) + S02-S04 (ii), and 5 failed = the base
failures at `:382`, `:384`, `:390`, `:392`, `:394`. register-support-publication 1 failed = `:475`.

**Parallel cut.** S02-C1 and S02-C2 run at once. Their write surfaces are disjoint (§5) and neither imports the other.
S02-C3 starts after S02-C2 is green, because `acceptance/pes-s02-hosted.ts` imports `acceptance/pes-s02-fake-vendor.ts`.
Its write surface is disjoint from C1 and C2. (A disjoint WRITE surface is not the same as an independent effect: C3
reads C2's module.) Each cluster is green when its command prints `CLUSTER_GREEN` in three runs, the worst run counting.

## 4. Verification list

What `REV(S02)` runs once every cluster is green: once, from the lane, cwd = the lane, `export PATH="/opt/homebrew/bin:$PATH"`
first, each command captured through `run-capture.sh` or `run-suites.sh` with its log under the REV seat's own probes dir.
It covers the suites this slice touches, as `passed/total` against the START-frame pairs; `pnpm typecheck` as a
per-file DELTA; the two untouched RED-at-base suites at their pairs (`SPEC-v4.md` §4); the acceptance of `SPEC-v4.md` §5
end to end; and the port the fixture bound, with the `lsof` evidence printed before the bind.

**V1 — the three cluster commands of §3**, each printing `CLUSTER_GREEN`.

**V2 — the regression list: 36 baseline suites + 3.** One `run-suites.sh` call. The pairs are generated from `baselines.tsv`
with exactly three overrides (v9 203, dev-api-environment 11, dev-api-process 6), and the generated list is
`probes/ARCH-PES-S02/REV-regression-pairs.txt`. Expected marker: `CLUSTER_GREEN`. Pre-existing failures that stay failing,
dated at base (`baseline-intake-suites.log`, 2026-09-24 13:32–13:37): DEV-09 (1), the five DEV-10B default-profile cases,
dev-provider-panel's 'loads the exact live CLI targets without changing the fixed maker order', t16's providerFamilyMap
case, register-support-publication `:475` (measured 2026-09-25 by this seat).
The DB-backed suites here (`critique-database`, `evaluator-database`, `t16-algorithm-register`, `dev-deployment-register`)
start their own embedded PostgreSQL through `tests/support/testDatabase.ts:103-136`, never `:55432`.
`p3-production-database-principals` opens no connection: its `*_DATABASE_URL` strings are environment-key names it
inventories (`:289-326`), and its two cases ran in 16 ms and 41 ms at base. `tests/integration/support-config-principals.test.ts` names `127.0.0.1:55432` at `:36-37`, and NO seat of
this slice runs it. (See the `DECISIONS.md` row on R2.11 vs §4.)

```
LOG=<abs log> zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh \
  tests/architecture/dev-custody-root.test.ts:16:0 \
  tests/architecture/dev-deployment-register.test.ts:6:0 \
  tests/architecture/dev-real-provider-only.test.ts:3:0 \
  tests/architecture/dev-runner-provider-set.test.ts:6:0 \
  tests/architecture/dev-secret-files.test.ts:2:0 \
  tests/architecture/p3-production-database-principals.test.ts:2:0 \
  tests/architecture/s10-carrier-erasure-red.test.ts:13:0 \
  tests/architecture/t09-synthesis-entrypoint.test.ts:4:0 \
  tests/architecture/vps-deployment-baseline.test.ts:31:0 \
  tests/integration/critique-database.test.ts:2:0 \
  tests/integration/dev-api-environment.test.ts:11:1 \
  tests/integration/dev-api-process.test.ts:6:5 \
  tests/integration/dev-deployment-register.test.ts:15:0 \
  tests/integration/dev-provider-panel.test.ts:3:1 \
  tests/integration/dev-secret-files.test.ts:8:0 \
  tests/integration/evaluator-database.test.ts:21:0 \
  tests/integration/t16-algorithm-register.test.ts:20:1 \
  tests/unit/api-operational-error.test.ts:9:0 \
  tests/unit/api-provider-discovery.test.ts:5:0 \
  tests/unit/critique-s08.test.ts:15:0 \
  tests/unit/dev-api-environment-cli.test.ts:7:0 \
  tests/unit/dev-cli-provider-panel.test.ts:8:0 \
  tests/unit/dev-runner-process.test.ts:8:0 \
  tests/unit/dev-runner-reconciliation.test.ts:8:0 \
  tests/unit/dl7-f7-boot-custody.test.ts:14:0 \
  tests/unit/f-t9b-3-empty-basis-floor.test.ts:16:0 \
  tests/unit/obs-l2-s04-zone.test.ts:17:0 \
  tests/unit/production-environment-floors.test.ts:24:0 \
  tests/unit/prompt-injection-corpus.test.ts:253:0 \
  tests/unit/t15-eval-harness.test.ts:50:0 \
  tests/unit/v20-optional-primary-provider-keys.test.ts:11:0 \
  tests/unit/v28-cost-envelope.test.ts:35:0 \
  tests/unit/v28-provider-target-price.test.ts:11:0 \
  tests/unit/v30-support-provider.test.ts:30:0 \
  tests/unit/v9-deployment-mode.test.ts:203:0 \
  tests/unit/v9-provider-credential-files.test.ts:23:0 \
  tests/architecture/register-support-publication.test.ts:14:1 \
  acceptance/pes-s02-fake-vendor.test.ts:6:0 \
  acceptance/pes-s02-hosted.test.ts:8:0
```

**V3 — the R2.4 record.** `PROGRESS.md` holds the S02-S10 table. It has 12 rows for `tests/integration/dev-api-environment.test.ts`
and 11 rows for `tests/integration/dev-api-process.test.ts`. Every case that PASSES in `baseline-intake-suites.log` `:346-356`
and `:382-396` passes in V2's log. DEV-09 and the five DEV-10B cases are either named FAIL with the same thrown code, or
named as turned GREEN together with the step that turned them.

**V4 — `pnpm typecheck`, per-file delta.** Its diagnostics are exactly the base list: one line,
`apps/ui/lib/v3/answerExport.ts(2,38)` `TS2835`. No diagnostic names a file of `git diff --name-only 776359c3...HEAD`.

**V5 — static checks.** Each command prints exactly what is stated.

```
(a) git grep -n 'pes-s02-fake-vendor-token'                                        # exactly 1 line, in acceptance/pes-s02-fake-vendor.ts (R2.5e)
(b) git grep -n -E 'NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|rejectUnauthorized: *false' -- 'acceptance/pes-s02-*'   # no output (R2.5b)
(c) git grep -n 'http://' -- 'acceptance/pes-s02-*'                               # no output: no plain-HTTP fallback (R2.5b)
(d) git grep -n -E 'createServer|\.listen\(' -- 'acceptance/pes-s02-*.ts' ':!*.test.ts'   # exactly 2 lines, both in acceptance/pes-s02-fake-vendor.ts (R2.11)
(e) git grep -n -E 'from "pg"|createPool|startTestDatabase|55432' -- 'acceptance/pes-s02-*'   # no output (R2.11)
(f) git diff --stat 776359c3 -- packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts packages/crypto/src/index.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts   # no output (R2.3, exact-set invariant, sealed row shape, refusal codes, the chain)
(g) git diff --name-only 776359c3...HEAD                                            # exactly the 13 lane paths listed in §5 (PROGRESS.md is in the main tree, not the lane)
(h) grep -c 'declares DEBATEAI_DEPLOYMENT_MODE=local' tests/unit/v9-deployment-mode.test.ts   # 2; and each of the four R2.3 it() texts of S02-S02 occurs exactly once (grep -cF prints 1)
```

**V6 — the acceptance of `SPEC-v4.md` §5, run once end to end on this Mac.** Steps 2–10 are run as V types them. The
only exception: the `tee` target of step 3 and the log file of step 4 are paths under the REV seat's probes dir instead
of `/tmp`.

- Step 2. The `Tests` line reads `2 passed | 201 skipped (203)`. The rc is NOT evidence: at base the same command exited 0
  with `Tests  201 skipped (201)` (`probes/ARCH-PES-S02/REV-base-step2.log`).
- Steps 3 and 10. The PIDs listening on `:3000` and `:8790` before the run equal those after it (an empty list equals an
  empty list).
- Step 4. It prints EXACT `exit=0`.
- Steps 5, 6 and 8. Line 1 of the log is pnpm's echo, EXACT `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts` (stderr,
  merged by `2>&1`). The lines that begin `PES-S02` are EXACTLY the 13 lines of S02-S18 "PASS output (EXACT)", in order, and
  every other line begins `(node:` or `(Use ` (node's colour warning, only when the environment sets both `NO_COLOR` and
  `FORCE_COLOR`). No `[ELIFECYCLE]` line follows on a PASS run, so step 8's verdict is the log's last line, EXACT
  `PES-S02-ACCEPT: PASS` (`probes/ARCH-FIX-PES-S02-p3/pnpm-exit-rule.out`, `[planned] PASS`).
- Step 7. Both greps print `0`.
- Step 9. `test -e` prints `1`. Also, the printed scratch root begins with the value of `node -p 'require("os").tmpdir()'`.
- Port. The port in `PES-S02 PORT-FREE` equals the port in `PES-S02 FAKE-VENDOR`. It lies in 4460–4499 and is not 4455.
  After the run, `lsof -nP -iTCP:<port> -sTCP:LISTEN` prints nothing.
- Base state of this item: `pnpm pes:accept-hosted` exits 1 with `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command
  "pes:accept-hosted" not found` (`probes/ARCH-PES-S02/REV-base-step4.log`). That is RED, and S02-S19 creates the script.

What no review has executed until V6 (`reviews/REQ-REV-p3.md:113-122`), each now a planned command: the fake vendor bound
(S02-S13, V6); the resolver awaited (S02-S17 case 1, V6); step 6's `PES-S02 ADMITTED` produced (V6); `pnpm pes:accept-hosted`
typed as a stranger would type it (V6); the baseline suites and `pnpm typecheck` re-run (V2, V4). This seat's base spike
already executed the first three in process (§9).

## 5. Boundaries, DDD impact, ADRs — ARCH's to fill

The mode decision already has ONE home (`packages/providers/src/index.ts:705-718`, resolved before
the first target is read). This slice adds no decision point; ARCH states where the declaration is
written and why that is the only place it is written — the two records are
`apps/runner/src/dev-api-environment.ts:36-78` (R2.1) and
`apps/runner/src/dev-runner-process.ts:85-128` (R2.2), and they are separate objects.

**Where the declaration is written, and why only there.**
- The key is written in `DEVELOPMENT_API_ENVIRONMENT_KEYS` (`:36-78`, last element) and in the assembler's `values` map
  (`:488-530`, last entry): two places in one module.
  - A key in the list with no value makes `environmentSource` throw `DEV_API_ENVIRONMENT_DEFINITION_INVALID` (`:248-256`).
  - A value with no key in the list is never written; v9 case (a) of S02-S02 fails on that.
- The runner's value is written in `createRunnerEnvironment`'s record (`apps/runner/src/dev-runner-process.ts:81-128`).
  R2.2 makes it a SEPARATE object, so it gets its own literal.
- The launcher's `exact` map (`apps/runner/src/dev-api-process.ts:181-214`) CHECKS the declared value. It declares nothing:
  it refuses an `api.env` whose value is not what the assembler wrote.
- Nothing else declares the mode. The resolution rule (`packages/register/src/runtime-environment.ts:85-96`, `:305`, `:569`)
  and the mode's one decision point (`packages/providers/src/index.ts:705-718`) stay byte-identical (§4 V5 (f)). The
  declaration feeds them the same value they already default to outside production.

**Write surface — exhaustive, by cluster (single writer per file).**

| cluster | files it may write (lane-relative unless absolute) |
|---|---|
| S02-C1 | `apps/runner/src/dev-api-environment.ts` · `apps/runner/src/dev-api-process.ts` · `apps/runner/src/dev-runner-process.ts` · `tests/unit/v9-deployment-mode.test.ts` · `tests/integration/dev-api-environment.test.ts` · `tests/integration/dev-api-process.test.ts` · `tests/support/devApiEnvironmentAssembly.ts` (new) · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PROGRESS.md` (main tree; append only) |
| S02-C2 | `acceptance/pes-s02-fake-vendor.ts` (new) · `acceptance/pes-s02-fake-vendor.test.ts` (new) |
| S02-C3 | `acceptance/pes-s02-hosted.ts` (new) · `acceptance/pes-s02-hosted.test.ts` (new) · `acceptance/pes-s02-hosted-cli.ts` (new) · `package.json` (one `scripts` entry) |

The lane paths of that table, which §4 V5 (g) expects `git diff --name-only 776359c3...HEAD` to print exactly, are
**13**: C1's 7 lane files, C2's 2 and C3's 4 (`PROGRESS.md` is in the main tree, not the lane):
`apps/runner/src/dev-api-environment.ts`, `apps/runner/src/dev-api-process.ts`, `apps/runner/src/dev-runner-process.ts`,
`tests/unit/v9-deployment-mode.test.ts`, `tests/integration/dev-api-environment.test.ts`,
`tests/integration/dev-api-process.test.ts`, `tests/support/devApiEnvironmentAssembly.ts`,
`acceptance/pes-s02-fake-vendor.ts`, `acceptance/pes-s02-fake-vendor.test.ts`, `acceptance/pes-s02-hosted.ts`,
`acceptance/pes-s02-hosted.test.ts`, `acceptance/pes-s02-hosted-cli.ts`, `package.json`.

**Forbidden — must NOT be touched by any node of this slice.** Every file outside that table, in particular:
- the resolution rule and the loaders, `packages/register/src/runtime-environment.ts`;
- the sealed v1 row shape, `packages/register/src/configured-provider-set.ts`;
- the refusal codes and the chain, `packages/providers/src/index.ts`, `packages/providers/src/provider-probe.ts`,
  `apps/api/src/main.ts` and `apps/api/src/provider-discovery.ts`;
- the custody reader, `packages/crypto/src/index.ts`;
- the VPS kit, `deploy/vps/**`, which is slice S03's;
- the S01 surface (the hosted publication path);
- `pnpm-lock.yaml` (no dependency is added);
- `tests/integration/support-config-principals.test.ts`, which is never run either;
- the live dev database on `:55432`, and every NO-TOUCH port of COMMON §6.

**DDD impact.**
- Bounded contexts touched:
  - *development stack composition* (`apps/runner/src/dev-*`) — WRITES;
  - *acceptance fixtures* (`acceptance/`) — WRITES;
  - *provider discovery and hosted admission* (`apps/api/src/provider-discovery.ts`, `packages/providers`) — READ, called
    only through their exported functions;
  - *custody* (`@debateai/crypto`) — READ;
  - *register* (`@debateai/register`) — READ (`resolveDeploymentMode` only).
- Invariants this slice owns:
  - I1: the dev `api.env` is byte-exact. The assembler (`:248-256`) and the launcher (`dev-api-process.ts:127-148`,
    `:181-219`) agree on every key and on every non-secret value, now including `DEBATEAI_DEPLOYMENT_MODE=local`.
  - I2, the upgrade law: an existing `api.env` without the declared row is accepted only when appending
    `DEBATEAI_DEPLOYMENT_MODE=local\n` reproduces a file that the shipped predicates already accept.
  - I3: the acceptance's stdout law (R2.9) holds on every line it emits, the verdict line included.
- Invariants it must NOT move: `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` (`apps/api/src/provider-discovery.ts:55-60`); the
  credential-file contract (`deploy/vps/README.md:786-790`); the sealed v1 row shape; the four RED-at-base pairs other
  than those R2.4 governs.
- Domain terms introduced, local to this slice's files: *declared local mode row*, *fake vendor*, *trusting fetch*,
  *scratch root*, *custody directory* (`<scratch>/custody.d`), *refusal case*, *stdout law*, *evidence line*. No product
  vocabulary changes.

**ADRs: none.** Every decision here is mission-local: a development-stack declaration inside V-1's rule, and an
acceptance fixture. None outlives the mission as a product rule, so no ADR number is taken.

## 6. Steps

Each step names its cluster, kind, surface (`path:LINE` at `776359c3`, plus the anchor TEXT, so a moved line is found by
its text), the action, a mechanical done-criterion, and the requirement(s) it serves. A production step also names the case
that goes RED when the step is omitted. A step whose criterion is a rejection names the guard it expects and every guard
that fires before it on the same operation. The kinds are support, test, production, record and verification.

### S02-C1 — the two declarations

**S02-S01 · C1 · support · R2.2b, R2.1** — Create `tests/support/devApiEnvironmentAssembly.ts` (new). It exports:
- `createDevApiEnvironmentAssemblyFixture(): Promise<Readonly<{ repositoryRoot: string; custodyRoot: string; outputFilePath: string }>>`
  - `repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-s02-dev-api-env-"))` and `custodyRoot = join(repositoryRoot, ".local", "dev-auth")`.
  - The custody tree is a copy of `tests/integration/dev-api-environment.test.ts:51-93`:
    - five `0700` directories;
    - five 32-byte `0600` key files;
    - `database-principals.env` built from `DEVELOPMENT_DATABASE_PRINCIPALS` exactly as `:67-69`;
    - `hatchet.env` holding the token of `:42-49`;
    - the register receipt `424242` / `32` / `"a".repeat(64)` written as `:78-85`.
  - `outputFilePath = join(custodyRoot, "api.env")`.
- `assembleDevApiEnvironmentFixture(repositoryRoot: string): Promise<DevelopmentApiEnvironmentReceipt>`, which calls
  `assembleDevelopmentApiEnvironment` with `TEST_DEVELOPMENT_PROVIDER_PANEL`, the receipt read back, and the Support target
  JSON of `:35-40`, copied verbatim.

Done when both hold: `grep -cE '^export (async )?function (createDevApiEnvironmentAssemblyFixture|assembleDevApiEnvironmentFixture)[^A-Za-z0-9_]' tests/support/devApiEnvironmentAssembly.ts`
prints `2`, and `pnpm typecheck` names no diagnostic in the file. It is not a suite and holds no `it(...)`.

**S02-S02 · C1 · test · R2.2b, R2.1, R2.2, R2.3** — In `tests/unit/v9-deployment-mode.test.ts` (477 lines at base), add
imports to the head block (`:1-20`):
- `rm` into `:1`;
- `afterEach` and `vi` into `:3`;
- `DEVELOPMENT_API_ENVIRONMENT_KEYS` from `../../apps/runner/src/dev-api-environment.js`;
- `startDevelopmentRunnerProcess`, `type DevelopmentRunnerChild` and `type DevelopmentRunnerProcessOperations` from
  `../../apps/runner/src/dev-runner-process.js`;
- `TEST_DEVELOPMENT_PROVIDER_PANEL` from `../support/developmentProviderPanel.js`;
- the two S02-S01 helpers.

Append ONE new top-level block after the file's last line (`:477`), with the describe title
`"S02 — the development stack names its deployment mode"`. The title must NOT contain the literal of R2.2b, so that step 2's
`-t` filter selects exactly the two cases below. The block's `afterEach` calls `vi.unstubAllEnvs()` and removes every fixture
root it created. It holds exactly two cases:
- (a) `it("declares DEBATEAI_DEPLOYMENT_MODE=local in the API environment the development stack assembles", …)`:
  1. Create the fixture.
  2. `vi.stubEnv("DEBATEAI_DEV_CUSTODY_ROOT", fixture.custodyRoot)`, so no ambient override redirects the assembly
     (`deploy/dev-auth/custody-root.mjs:97-101`).
  3. `expect(DEVELOPMENT_API_ENVIRONMENT_KEYS).toContain("DEBATEAI_DEPLOYMENT_MODE")`.
  4. Assemble.
  5. `const rows = (await readFile(fixture.outputFilePath, "utf8")).trimEnd().split("\n").filter((row) => row.startsWith("DEBATEAI_DEPLOYMENT_MODE="))`.
  6. `expect(rows).toEqual(["DEBATEAI_DEPLOYMENT_MODE=local"])`. This asserts EXACT: one row.
- (b) `it("declares DEBATEAI_DEPLOYMENT_MODE=local in the runner environment the development stack composes", …)`:
  1. Build a `DevelopmentRunnerProcessOperations` whose `loadApiEnvironment` returns the record of
     `tests/unit/dev-runner-process.test.ts:20-35`, copied verbatim. That record carries NO `DEBATEAI_DEPLOYMENT_MODE`.
  2. Its `startRunner(values)` pushes `values` into `captured` and returns a child. The child's `ready` resolves
     `{ kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: "424242" }` (EXACT), and its
     `terminate` resolves `exited` with `{ code: 0, signal: null }` (EXACT).
  3. `const runner = await startDevelopmentRunnerProcess({ repositoryRoot: "/workspace", commandEnvironment: Object.freeze({ PATH: "/usr/bin" }), operations })`.
  4. `expect(captured).toHaveLength(1)`, then `expect(captured[0]!.DEBATEAI_DEPLOYMENT_MODE).toBe("local")`, then `await runner.stop()`.

Done when both hold:
- `grep -c 'declares DEBATEAI_DEPLOYMENT_MODE=local' tests/unit/v9-deployment-mode.test.ts` prints `2`.
- `git diff` of the file removes no line. Each of the four R2.3 it() texts occurs exactly once (`grep -cF` prints `1` for
  each):
  - "refuses a production start-up that does not say which deployment it is"
  - "refuses an unknown mode in EVERY environment, rather than guessing"
  - "keeps today's behaviour where the mode was never set outside production"
  - "resolves the mode inside both strict loaders, so a root cannot skip it"

RED at this step: (a) fails `toContain` and (b) fails `toBe("local")`. R2.3 is gated by these NAMES and by v9 passing in
S02-S09, never by line numbers, because the imports added here shift `:248`, `:255`, `:264` and `:273`.

**S02-S03 · C1 · test · R2.1, R2.4** — In `tests/integration/dev-api-environment.test.ts`, insert two cases directly after
the case whose text is 'atomically adds the dedicated Support model target to the exact legacy environment' (`:325-338`).
Let `ROW = "DEBATEAI_DEPLOYMENT_MODE=local\n"`.
- (a) `it("atomically adds the declared local deployment mode to the exact environment assembled before it", …)`:
  1. `fixture()`, `assemble`, `current = readFile(outputFilePath)`.
  2. `expect(current.endsWith(`\n${ROW}`)).toBe(true)`.
  3. For each of two pre-slice variants, `v1 = current.slice(0, -ROW.length)` and
     `v2 = v1.replace("PROVIDER_PROBE_TIMEOUT_MS=180000\n", "PROVIDER_PROBE_TIMEOUT_MS=5000\n")` (first
     `expect(v2).not.toBe(v1)`):
     - write it at mode `0o600`;
     - `await expect(assemble(root)).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false })` (EXACT receipt);
     - `expect(await readFile(outputFilePath, "utf8")).toBe(current)`.
- (b) `it("refuses to add the declared deployment mode over an environment that drifts elsewhere or names another mode", …)`:
  1. From the same `current`, build two variants:
     - `w1 = current.slice(0, -ROW.length).replace("API_PORT=8790\n", "API_PORT=8791\n")`;
     - `w2 = current.slice(0, -ROW.length) + "DEBATEAI_DEPLOYMENT_MODE=hosted\n"`.
     Assert each differs from its source.
  2. For each: write it `0o600`, `await expect(assemble(root)).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT")`, then
     `expect(await readFile(outputFilePath, "utf8")).toBe(<the variant>)`.
  - **Guard (b) expects**: `DEV_API_ENVIRONMENT_DRIFT` from `publishExactFile` (`apps/runner/src/dev-api-environment.ts:284-287`),
    after every `acceptPreviousSource` alternative returns false.
  - **Guards that fire before it on the same operation** (`assembleDevelopmentApiEnvironment`, `:450-542`):
    - custody root and directories (`:455-468`);
    - `DEV_API_ENVIRONMENT_CREDENTIAL_REQUIRED` (`:469-473`);
    - `DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID` (`:477`, via `:236-245`);
    - the Support target parse (`:479-482`);
    - `DEV_API_ENVIRONMENT_REGISTER_RECEIPT_MISMATCH` (`:483-487`);
    - `DEV_API_ENVIRONMENT_DEFINITION_INVALID` (`:248-256`);
    - `DEV_API_ENVIRONMENT_CONCURRENT_LOCKED` (`:264-279`).
    The fixture passes all of them: case (a) reaches `publishExactFile` on the SAME fixture and succeeds, so (b)'s oracle
    observes the drift rule and not an older guard.

Done when both cases exist. RED at this step: (a) fails its `endsWith` assertion, because the row does not exist before
S02-S05. (b) PASSES at this step and stays green through S02-S11: before S02-S05, `current` carries no row, so
`current.slice(0, -ROW.length)` cuts into the last row (`DEBATEAI_DEV_MAIL_CAPTURE_DIR=<fixture root>/…/mail`, longer
than `ROW`), both variants still differ from their sources, every previous-source predicate returns false, and
`publishExactFile` throws `DEV_API_ENVIRONMENT_DRIFT` (`apps/runner/src/dev-api-environment.ts:284-287`). After S02-S06, (b)
holds because the new predicate refuses both variants. The suite therefore reads **10 passed / 2 failed** at the §3 RED
event (DEV-09 and (a)); (b) is not rewritten to fail.

**S02-S04 · C1 · test · R2.1 (and V-1), R2.4** — In `tests/integration/dev-api-process.test.ts`:
- (i) In the `environment()` record, add `DEBATEAI_DEPLOYMENT_MODE: "local"` after
  `DEBATEAI_DEV_MAIL_CAPTURE_DIR: join(custodyRoot, "mail")` (`:88`), with a comma added to `:88`.
- (ii) Insert `it("refuses an environment that names a deployment mode other than local before process start", …)` directly
  after the case whose text is 'accepts and reports the exact support-preview runtime topology' (`:208-229`):
  1. `profile = SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE`; `test = await fixture(profile)`;
     `source = await readFile(test.envPath, "utf8")`.
  2. `hosted = source.replace("\nDEBATEAI_DEPLOYMENT_MODE=local\n", "\nDEBATEAI_DEPLOYMENT_MODE=hosted\n")`, and
     `expect(hosted).not.toBe(source)`.
  3. Write `hosted` at `0o600`. With `runtime = operations([null, { statusCode: 401, contentType: "application/json", body: '{"error":"SESSION_REQUIRED"}' }])` (EXACT: the mock body the existing support-preview case uses, `tests/integration/dev-api-process.test.ts:213`):
     `await expect(startDevelopmentApiProcess({ repositoryRoot: test.root, commandEnvironment: Object.freeze({ PATH: "/usr/bin" }), operations: runtime, profile })).rejects.toThrow("DEV_API_PROCESS_ENVIRONMENT_INVALID")`,
     then `expect(runtime.startApi).not.toHaveBeenCalled()`.
  4. Rewrite `source` at `0o600`. With a fresh runtime of the same shape, the start resolves with
     `receipt.port === 8890`, and `startApi` is called once with `expect.objectContaining({ DEBATEAI_DEPLOYMENT_MODE: "local" })`
     (CONTAINS: the spawn environment holds at least this key with this value).
     Then `await apiProcess.stop()`.
  - **Guard (ii) expects**: `DEV_API_PROCESS_ENVIRONMENT_INVALID` thrown by the `exact` loop
    (`apps/runner/src/dev-api-process.ts:215-217`) on the entry that S02-S07 appends.
  - **Guards that fire before it on the same operation** (`startDevelopmentApiProcess` → `loadDevelopmentApiProcessEnvironment`, `:74-84`):
    - `assertPrivateCustodyRoot` (`:77`);
    - `readPrivateEnvironment`, `DEV_API_PROCESS_CUSTODY_INVALID` (`:104-125`);
    - `parseExactEnvironment` (`:127-148`) — the SAME code for line count, order or empty value;
    - `readDevelopmentDeploymentRegisterReceipt` (`:81`);
    - `parseApiEnvironment(values)` (`:171`), which ACCEPTS `hosted`, because it refuses only values that are not
      exactly `hosted` or `local`;
    - the panel and Support parses (`:172-179`);
    - every earlier `exact` entry (`:182-213`).
    The positive half (step 4 above) runs the same fixture with `local` through all of them and starts, so the rejection is
    the new entry's.
  - Why the support-preview profile: the default-profile fixture already fails an earlier `exact` entry at base (five
    DEV-10B cases, base log `:382-394`). A default-profile rejection would therefore be observed from an older guard.

Done when both edits exist. RED at this step: (ii) fails its `not.toBe(source)`, because before S02-S05 the fixture writes
no mode row.

**S02-S05 · C1 · production · R2.1** — In `apps/runner/src/dev-api-environment.ts`:
1. Append `"DEBATEAI_DEPLOYMENT_MODE"` as the LAST element of `DEVELOPMENT_API_ENVIRONMENT_KEYS`, after
   `"DEBATEAI_DEV_MAIL_CAPTURE_DIR"` (`:77`). The list goes from 41 to 42 elements.
2. Append `["DEBATEAI_DEPLOYMENT_MODE", "local"]` as the LAST entry of the `values` map in
   `assembleDevelopmentApiEnvironment`, after `["DEBATEAI_DEV_MAIL_CAPTURE_DIR", join(custodyRoot, "mail")]` (`:529`).

Done when (shape gates, both through v9 case (a)): the list contains the key, and the assembled file holds exactly the one
row `DEBATEAI_DEPLOYMENT_MODE=local` as its last line. **RED when omitted**: v9 'declares DEBATEAI_DEPLOYMENT_MODE=local in
the API environment the development stack assembles'.

**S02-S06 · C1 · production · R2.1** — In `apps/runner/src/dev-api-environment.ts`:
1. Directly after `isExactLegacyEnvironmentWithoutSupportModelTarget` (it ends at `:448`), add the function below, with
   these EXACT semantics.
2. Add it as the fifth alternative of the `acceptPreviousSource` disjunction in `assembleDevelopmentApiEnvironment`
   (`:536-539`), i.e. `|| isExactEnvironmentWithoutDeclaredDeploymentMode(existing, source, profile)`.

```ts
const DECLARED_LOCAL_DEPLOYMENT_MODE_ROW = "DEBATEAI_DEPLOYMENT_MODE=local\n";

function isExactEnvironmentWithoutDeclaredDeploymentMode(
  existing: string,
  expected: string,
  profile: DevelopmentAuthStackProfile
): boolean {
  if (!existing.endsWith("\n") || existing.includes("DEBATEAI_DEPLOYMENT_MODE=")) return false;
  const declared = existing + DECLARED_LOCAL_DEPLOYMENT_MODE_ROW;
  return declared === expected
    || isExactProviderRuntimeRefresh(declared, expected, profile)
    || isExactProviderRuntimeRefreshWithLegacyProbeTimeout(declared, expected, profile)
    || isExactPublishedRegisterRefresh(declared, expected, profile)
    || isExactLegacyEnvironmentWithoutSupportModelTarget(declared, expected, profile);
}
```

Done when S02-S03 (a) and (b) pass, and the sibling cases at `:309`, `:325`, `:340` and `:353` (texts: 'atomically upgrades
the exact timeout that was shorter than a real CLI probe', 'atomically adds the dedicated Support model target to the exact
legacy environment', 'rejects an earlier environment that drops a required field', 'rejects v4 reconstruction and
removed-provider fallback') still pass. **RED when omitted**: S02-S03 (a), where the assembly over the pre-slice file
rejects `DEV_API_ENVIRONMENT_DRIFT`.

**S02-S07 · C1 · production · R2.1, V-1** — In `apps/runner/src/dev-api-process.ts`, append `["DEBATEAI_DEPLOYMENT_MODE", "local"]`
as the LAST entry of the `exact` map in `validateExactEnvironment`, after `["HATCHET_TLS_STRATEGY", "none"]` (`:213`). The
map opens at `:181`. Done when S02-S04 (ii) passes and 'accepts and reports the exact support-preview runtime topology' passes.
**RED when omitted**: S02-S04 (ii), whose hosted variant starts.

**S02-S08 · C1 · production · R2.2** — In `apps/runner/src/dev-runner-process.ts`, add `DEBATEAI_DEPLOYMENT_MODE: "local",` to
the record returned by `createRunnerEnvironment`, directly after `RUNNER_WORKER_ID: "development:walking-skeleton",` (`:85`).
Done when v9 case (b) passes and `tests/unit/dev-runner-process.test.ts` stays 8/0. **RED when omitted**: v9
'declares DEBATEAI_DEPLOYMENT_MODE=local in the runner environment the development stack composes'.

**S02-S09 · C1 · verification · R2.1, R2.2, R2.2b, R2.3** — Run the S02-C1 command of §3 three times. Every run prints
`CLUSTER_GREEN`, and the worst run counts. Then run, captured, SPEC-v4 §5 step 2's command (`SPEC-v4.md:224`)
`pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'`. Its `Tests` line reads
`2 passed | 201 skipped (203)`; judge that line, never the rc.

**S02-S10 · C1 · record · R2.4** — Append a table to
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PROGRESS.md`
(the MAIN tree, where mission records live, COMMON line 3). If the BUILD packet's allowed list does not name that path, the
seat puts the same table in its handoff and the orchestrator transcribes it.
- Columns: `suite · full it(...) text · base state · after state · step that changed it, or "unchanged"`.
- Rows: every case of `tests/integration/dev-api-environment.test.ts` (12) and of `tests/integration/dev-api-process.test.ts` (11).
- Base states come from `baseline-intake-suites.log` `:346-356` and `:382-396`; after states from the S02-S09 log.

Done when the table has 23 rows, and every row whose base state is PASS has after state PASS. The 6 base failures are
either FAIL with the same thrown code, or named as turned GREEN together with the step.

**S02-S11 · C1 · verification · R2.3** — Run `pnpm typecheck`. Done when:
- its diagnostics are exactly the base list (one line, `apps/ui/lib/v3/answerExport.ts(2,38)` `TS2835`);
- no diagnostic names a file C1 wrote;
- `git diff --stat 776359c3 -- packages/register/src/runtime-environment.ts` prints nothing.

### S02-C2 — the fake vendor fixture

**S02-S12 · C2 · support (skeleton for a loadable RED) · R2.5, R2.6** — Create `acceptance/pes-s02-fake-vendor.ts` (new). It
exports the following; every function body throws `new Error("NOT_IMPLEMENTED")` and every constant holds its final value.
- `FAKE_VENDOR_AUTHORIZATION = "Bearer pes-s02-fake-vendor-token"`. This is R2.5e's literal, written HERE and nowhere else
  in the repository. Suites import it; they never retype it.
- `FAKE_VENDOR_HOST = "api.localtest.me"` and `FAKE_VENDOR_MODEL = "fake-model"`.
- `FAKE_VENDOR_EXCLUDED_PORTS: ReadonlySet<number>` = `{3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455}`.
  This is R2.5a's list plus R2.7's never-bound port.
- `FAKE_VENDOR_PORT_CANDIDATES: readonly number[]` = 4460 … 4499 (40 ports, ascending).
- `isPortListening(port: number): boolean`
- `pickFreePort(candidates: readonly number[], listening: (port: number) => boolean): Readonly<{ port: number; evidence: string }>`
- `createFixtureCertificate(directory: string, opensslExecutable: string): Readonly<{ keyPem: string; certPem: string }>`
- `startFakeVendor(input: Readonly<{ port: number; keyPem: string; certPem: string }>): Promise<FakeVendor>`, where
  `FakeVendor = Readonly<{ baseUrl: string; counts(): Readonly<{ matched: number; rejected: number }>; close(): Promise<void> }>`
- `createTrustingFetch(caPem: string, lookup?: LookupFunction): Readonly<{ fetch: typeof fetch; destroy(): void }>`
- `verifySeamHandshake(input: Readonly<{ port: number; caPem: string; lookup?: LookupFunction }>): Promise<"authorized">`

Done when both hold, as shape gates satisfiable at this step's own boundary:
- each of the 12 names above appears in exactly one `export` declaration of the file:
  `grep -cE '^export (const|function|async function|type) <name>[^A-Za-z0-9_]' acceptance/pes-s02-fake-vendor.ts` prints `1` for each
  of the 12;
- `pnpm typecheck` names no diagnostic in the file.

**S02-S13 · C2 · test · R2.5, R2.6, R2.11** — Create `acceptance/pes-s02-fake-vendor.test.ts` (new) with EXACTLY 6 cases. The
Every lookup in this file is a CALLBACK `LookupFunction` (the shape `https.request` and `tls.connect` call; B1), built by
this module-private factory, written at the top of the file exactly as below. `lookupStub` answers `api.localtest.me` with
`127.0.0.1` in both the `{ all: true }` and the single-address forms, and any other host with an `ENOTFOUND` error. No
lookup in this file returns a promise.

```ts
import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";

function callbackLookup(answer: readonly LookupAddress[] | NodeJS.ErrnoException): LookupFunction {
  return (hostname, options: LookupOptions, callback) => {
    if (answer instanceof Error) { callback(answer, ""); return; }
    if (hostname !== "api.localtest.me") {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), "");
      return;
    }
    if (options.all === true) callback(null, [...answer]);
    else callback(null, answer[0]!.address, answer[0]!.family);
  };
}
const lookupStub = callbackLookup([{ address: "127.0.0.1", family: 4 }]);
```

1. `it("generates a run-time certificate for api.localtest.me inside the directory it is given", …)`:
   - `createFixtureCertificate(dir, "/usr/bin/openssl")`;
   - `(await readdir(dir)).sort()` EXACT `["cert.pem", "key.pem", "openssl.cnf"]`;
   - `new X509Certificate(certPem)`: `.subjectAltName === "DNS:api.localtest.me"`, `.ca === true`, and
     `.checkHost("api.localtest.me") === "api.localtest.me"`.
2. `it("answers the exact credential literal with the body the shipped probe accepts", …)`:
   - `pickFreePort(FAKE_VENDOR_PORT_CANDIDATES, isPortListening)`, then `startFakeVendor`;
   - `baseUrl` EXACT `https://api.localtest.me:<port>/v1`;
   - with `createTrustingFetch(certPem, lookupStub).fetch`, POST `${baseUrl}/chat/completions` with headers
     `{ "content-type": "application/json", authorization: FAKE_VENDOR_AUTHORIZATION }` (EXACT) and the request body
     `{"model":"fake-model","max_tokens":8,"messages":[]}` (EXACT);
   - expect status `200`, text EXACT `{"model":"fake-model","choices":[{"message":{"content":"OK"}}]}`, and `counts()` EXACT
     `{ matched: 1, rejected: 0 }`.
3. `it("answers 401 to an absent or a wrong authorization and names no credential", …)`:
   - no authorization gives `401`;
   - `authorization: "Bearer not-the-fixture-literal"` gives `401` with body EXACT `{"error":"unauthorized"}`;
   - GET `${baseUrl}/models` gives `404`;
   - `counts()` EXACT `{ matched: 0, rejected: 3 }`.
4. `it("is trusted only through the fetch built with its own certificate", …)`:
   - the global `fetch` POSTing to `https://127.0.0.1:<port>/v1/chat/completions` rejects, and `(error.cause as { code?: string }).code === "DEPTH_ZERO_SELF_SIGNED_CERT"`
     (measured at base through this exact literal-IP URL: `probes/ARCH-PES-S02/spike-negative-control-ip.log`);
   - a trusting fetch built from a SECOND certificate (generated in another dir) rejects;
   - `verifySeamHandshake({ port, caPem: certPem, lookup: lookupStub })` resolves `"authorized"`;
   - `counts()` EXACT `{ matched: 0, rejected: 0 }`.
5. `it("measures its port free with lsof before binding and skips every excluded port", …)`:
   - `pickFreePort([3000, 4455, 4310, 4460, 4461], (p) => { calls.push(p); return p === 4460; })` returns port `4461`, and
     `calls` is EXACT `[4460, 4461]`;
   - with the real `isPortListening`, the chosen port is `false` before `startFakeVendor`, `true` while it listens, and `false`
     after `close()`;
   - `evidence` EXACT `lsof -nP -iTCP:<port> -sTCP:LISTEN rc=1 lines=0`.
6. `it("reaches the fixture when the resolver answers ::1 before 127.0.0.1", …)`:
   - the lookup `callbackLookup([{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }])` (EXACT, in this order);
   - through `createTrustingFetch(certPem, thatLookup)`, a POST with the literal returns `200`.
   - Measured at base: node 26's default `autoSelectFamily` falls back from `::1` to `127.0.0.1`
     (`probes/ARCH-PES-S02/spike-ipv6-first.log`).

Done when the file holds exactly these 6 `it(...)` and the C2 command prints `0 passed / 6 failed` against the skeleton
(the RED event of §3).

**S02-S14 · C2 · production · R2.5 (a)–(e), R2.6, R2.11** — Implement `acceptance/pes-s02-fake-vendor.ts`:
- `isPortListening(p)`: `spawnSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" })`.
  - `status === 1 && stdout === ""` → `false`;
  - `status === 0` → `true`;
  - anything else (spawn error, other status) → throw `new Error("PES_S02_LSOF_UNAVAILABLE")`.
- `pickFreePort`: walk `candidates` in order. Skip any port `<= 4400` or in `FAKE_VENDOR_EXCLUDED_PORTS` WITHOUT calling
  `listening`. Return the first port for which `listening(p) === false`, with `evidence` as in case 5. If none, throw
  `new Error("PES_S02_NO_FREE_PORT")`.
- `createFixtureCertificate(dir, openssl)`:
  1. Write `dir/openssl.cnf`, EXACT 9 lines:
     `[req]` · `distinguished_name = dn` · `x509_extensions = ext` · `prompt = no` · `[dn]` · `CN = api.localtest.me` · `[ext]` · `subjectAltName = DNS:api.localtest.me` · `basicConstraints = critical,CA:TRUE`,
     plus a trailing newline.
  2. `spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-config", join(dir, "openssl.cnf")], { stdio: ["ignore", "ignore", "pipe"] })`.
     - A spawn `ENOENT` throws `PES_S02_OPENSSL_UNAVAILABLE`.
     - A status `n !== 0` throws `PES_S02_OPENSSL_RC_<n>`.
  3. Return both PEMs.
  - Measured with this exact configuration: 37 ms with `/usr/bin/openssl`.
- `startFakeVendor`: `https.createServer({ key, cert }, …)` with `server.on("tlsClientError", () => undefined)`. Each request's
  body is read to its end, then:
  - `POST` and `url === "/v1/chat/completions"` and `request.headers.authorization === FAKE_VENDOR_AUTHORIZATION`:
    `matched += 1`; `200` with `content-type: application/json` and the EXACT body of case 2.
  - `POST` on that path with any other or an absent authorization: `rejected += 1`; `401` with the EXACT body of case 3.
  - Anything else: `rejected += 1`; `404` with an empty body.
  - `listen(port, "127.0.0.1")`. `EADDRINUSE` rejects with `new Error("PES_S02_PORT_BIND_RACED")`.
  - `baseUrl = https://${FAKE_VENDOR_HOST}:${port}/v1`.
  - `close()` = `server.closeAllConnections()`, then `server.close()`, awaited.
- `createTrustingFetch(caPem, lookup)`:
  - one `new https.Agent({ ca: [caPem], keepAlive: false })`;
  - each call is `https.request(url, { method: init?.method ?? "GET", headers: <init.headers normalized through new Headers(...) into a record>, agent, signal: init?.signal ?? undefined, rejectUnauthorized: true, ...(lookup === undefined ? {} : { lookup }) })`;
  - a string `init.body` is written;
  - the promise resolves `new Response(Buffer.concat(chunks), { status, statusText, headers })` and rejects on a request or
    response error;
  - `destroy()` = `agent.destroy()`.
  - The shape was proven at base (spike log: the resolver admits through it).
  - `lookup` is handed to `https.request` untouched and this module never calls it itself (B1: `https.request` calls it
    with a callback; measured with `node:dns` `lookup`, `lookupStub` and a `::1`-first `callbackLookup`, each `status=200`,
    `probes/ARCH-FIX-PES-S02-p2/b1-lookup-shapes.out` G5–G7).
- `verifySeamHandshake`: `tls.connect({ host: FAKE_VENDOR_HOST, port, ca: [caPem], servername: FAKE_VENDOR_HOST, rejectUnauthorized: true, ...(lookup ? { lookup } : {}) })`.
  On `secureConnect` with `socket.authorized === true`, end the socket and resolve `"authorized"`. On `error`, reject with an
  `Error` whose message is the error's `code`. `lookup` is handed to `tls.connect` untouched (measured `authorized=true` with
  `node:dns` `lookup` and with `lookupStub`, `b1-lookup-shapes.out` G8–G9).

Done when the C2 command prints `CLUSTER_GREEN` (6/0). **RED when omitted**: all 6 cases of S02-S13.

**S02-S15 · C2 · verification · R2.5e, R2.5b, R2.11** — Run `pnpm typecheck`. No diagnostic may name
`acceptance/pes-s02-fake-vendor.ts` or its suite. Then run §4 V5 (a), (b) and (d), restricted to `acceptance/pes-s02-fake-vendor*`:
- (a) `git grep -n 'pes-s02-fake-vendor-token'` prints exactly 1 line, `acceptance/pes-s02-fake-vendor.ts`;
- (b) prints nothing;
- (d) prints exactly the one `createServer` line and the one `.listen(` line.

### S02-C3 — the hosted acceptance

**S02-S16 · C3 · support (skeleton for a loadable RED) · R2.7, R2.8, R2.9** — Create `acceptance/pes-s02-hosted.ts` (new). It
exports the following; function bodies throw `NOT_IMPLEMENTED` and constants hold their final values.
- `PES_S02_CONFIGURED_PROVIDERS = Object.freeze([Object.freeze({ providerRef: "vendor:a", maker: "Acme" })])` (EXACT, R2.7).
- `PES_S02_REFUSAL_CASES`: five frozen `{ id, target, expected, stage }`, in this order. The `target` strings are EXACT,
  byte for byte from `SPEC-v4.md:141-145` (identical to `SPEC-v3.md:141-145`), with `/SCRATCH` left literal:

| id | target (EXACT) | expected (EXACT message) | stage |
|---|---|---|---|
| `refused-loopback` (EXACT row) | `{"provider_ref":"vendor:a","base_url":"https://127.0.0.1:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a` | `deployment` |
| `refused-inline` (EXACT row) | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a` | `deployment` |
| `refused-conflict` (EXACT row) | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` | `parse` |
| `refused-absent` (EXACT row) | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/absent.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a` | `credentials` |
| `refused-price` (EXACT row) | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header"}` | `PROVIDER_TARGET_PRICE_REQUIRED:vendor:a` | `priced` |

**Each refusal's guard and the guards before it** (the chain is `apps/api/src/main.ts:299-318`; guard lines are
`packages/providers/src/index.ts`; every stage was measured at base, spike log):
- conflict: `parseProviderDiscoveryTargets` `:307`. Before it, the parse guards `:237-296` (size, JSON array, configured
  duplicate, shape, price format, duplicate target, maker/set) pass.
- loopback: `assertHostedProviderTargets` `:651-652`, reached through `assertDeploymentProviderTargets` `:709-714` in hosted
  mode. Before it, every parse guard `:237-335` passes and the TLS guard `:645-646` passes (the target is `https:`).
- inline: the same function at `:654-655`. Before it, parse `:237-335` (including the conflict guard `:307`: only one
  credential field), TLS `:646` and loopback `:652` pass (`api.localtest.me` is not refused).
- price: `assertPricedProviderTargets` `:686-687`. Before it, parse and all three hosted guards `:646`/`:652`/`:655` pass.
- absent: `resolveProviderTargetCredentials` `:783-784` (the custody reader's missing-file error, `packages/crypto/src/index.ts:899`).
  Before it, parse, the hosted guards and the price guards `:687`/`:700` pass.

Also exported:
- `type RefusalCase = Readonly<{ id: string; target: string; expected: string; stage: "parse" | "deployment" | "priced" | "credentials" }>`
- `violatesStdoutLaw(line: string, forbidden: Readonly<{ tokens: readonly string[]; paths: readonly string[] }>): boolean`
- `runHostedAcceptance(deps?: Partial<HostedAcceptanceDeps>): Promise<HostedAcceptanceResult>`
  - `HostedAcceptanceDeps` = `{ emit(line: string): void; lookup: LookupFunction; opensslExecutable: string; portCandidates: readonly number[]; isPortListening(port: number): boolean; credentialLiteral: string; refusalCases: readonly RefusalCase[] }`.
  - Defaults: `emit` = no-op; `lookup` = the CALLBACK `lookup` of `import { lookup } from "node:dns";` (never
    `dns.promises.lookup` and never `node:dns/promises`: that function is assignable to `LookupFunction` and passes
    `tsc`, yet never calls back, so row 3 would wait forever and `https.request` times out — measured,
    `probes/ARCH-FIX-PES-S02-p2/b1-tsc-mutant.out` and `b1-lookup-shapes.out` M2–M3); `opensslExecutable` = `"/usr/bin/openssl"`;
    `portCandidates` = `FAKE_VENDOR_PORT_CANDIDATES`; `isPortListening` = C2's; `credentialLiteral` =
    `FAKE_VENDOR_AUTHORIZATION`; `refusalCases` = `PES_S02_REFUSAL_CASES`.
  - `HostedAcceptanceResult` = `{ outcome: "PASS" | "FAIL" | "UNVERIFIED"; lines: readonly string[]; scratchRoot: string | null; port: number | null; refusals: readonly Readonly<{ id: string; message: string; stage: string }>[] }`.

Done when both hold, as shape gates satisfiable at this step's own boundary:
- each of the 7 names appears in exactly one `export` declaration of the file:
  `grep -cE '^export (const|function|async function|type) <name>[^A-Za-z0-9_]' acceptance/pes-s02-hosted.ts` prints `1` for each. The
  7 names are `PES_S02_CONFIGURED_PROVIDERS`, `PES_S02_REFUSAL_CASES`, `violatesStdoutLaw`, `runHostedAcceptance`,
  `HostedAcceptanceDeps`, `HostedAcceptanceResult` and `RefusalCase`;
- `pnpm typecheck` names no diagnostic in the file.

**S02-S17 · C3 · test · R2.5b, R2.6–R2.10, §5 steps 5–9** — Create `acceptance/pes-s02-hosted.test.ts` (new) with EXACTLY 8
cases. Every lookup in this file is built by the module-private `callbackLookup` below, written at the top of the file
exactly as in S02-S13 (repeated here byte for byte; no lookup in this file returns a promise):

```ts
import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";

function callbackLookup(answer: readonly LookupAddress[] | NodeJS.ErrnoException): LookupFunction {
  return (hostname, options: LookupOptions, callback) => {
    if (answer instanceof Error) { callback(answer, ""); return; }
    if (hostname !== "api.localtest.me") {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), "");
      return;
    }
    if (options.all === true) callback(null, [...answer]);
    else callback(null, answer[0]!.address, answer[0]!.family);
  };
}
const lookupStub = callbackLookup([{ address: "127.0.0.1", family: 4 }]);
```

Cases 1–3 may share one `runHostedAcceptance({ lookup: lookupStub })`. Let
`token = FAKE_VENDOR_AUTHORIZATION.slice("Bearer ".length)`; it is imported, never retyped.
1. `it("passes end to end and prints the exact lines of SPEC-v4 §5 steps 5, 6 and 8", …)`:
   - `outcome === "PASS"`;
   - `lines` EXACT = the 13 lines of S02-S18 "PASS output (EXACT)", with `<scratch>` = `result.scratchRoot`, `<port>` =
     `result.port`, and `<addresses>` = `127.0.0.1` (the stub's answer);
   - `result.refusals` EXACT = the five `{ id, message: expected, stage }` of the S02-S16 table, in order.
2. `it("never prints the token, a scheme-prefixed credential or a path at or beneath the custody directory", …)`:
   - for every line: `!line.includes(token)`, `!/Bearer \S/u.test(line)` and `!line.includes(`${result.scratchRoot}/custody.d`)`;
   - `lines[0] === `PES-S02 SCRATCH-DIR ${result.scratchRoot}``;
   - `basename(result.scratchRoot)` starts with `pes-s02-` and does not contain `custody`.
3. `it("removes the scratch root and releases the port before it returns", …)`:
   - `await expect(stat(result.scratchRoot!)).rejects.toMatchObject({ code: "ENOENT" })`;
   - `isPortListening(result.port!) === false`.
4. `it("names the first case that did not hold when the vendor rejects the provisioned credential", …)`:
   - with `credentialLiteral: "Bearer pes-s02-not-the-vendor-literal"`: `outcome === "FAIL"`;
   - the last line is EXACT `PES-S02-ACCEPT: FAIL admitted`;
   - no line begins `PES-S02 ADMITTED `;
   - exactly 5 lines begin `PES-S02 REFUSED `;
   - the scratch root is gone.
5. `it("names the refusal case whose message differs from the table", …)`:
   - `refusalCases` = the table with `refused-conflict`'s `expected` replaced by `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT:vendor:a`;
   - `outcome === "FAIL"` (S02-S19 maps it to exit 1), and the last line is EXACT `PES-S02-ACCEPT: FAIL refused-conflict`;
   - exactly 2 lines begin `PES-S02 REFUSED `;
   - the scratch root is gone.
6. `it("reports UNVERIFIED with the resolver's own error and never falls back", …)`:
   - (i) `lookup: callbackLookup(Object.assign(new Error("getaddrinfo ENOTFOUND api.localtest.me"), { code: "ENOTFOUND" }))`
     gives the last line EXACT `PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND`;
   - (ii) `lookup: callbackLookup([{ address: "192.0.2.10", family: 4 }])` (EXACT) gives EXACT `PES-S02-ACCEPT: UNVERIFIED dns non-loopback`;
   - in both runs, `outcome === "UNVERIFIED"` (S02-S19 maps it to exit 1), `lines` is EXACT `[<SCRATCH-DIR line>, <verdict>]`,
     and the scratch root is gone.
7. `it("reports UNVERIFIED when the run-time certificate cannot be built", …)`:
   - `opensslExecutable: "/nonexistent/openssl"` gives `outcome === "UNVERIFIED"` and the last line EXACT `PES-S02-ACCEPT: UNVERIFIED tls-material openssl-unavailable`;
   - `lines.length === 2`;
   - the scratch root is gone.
8. `it("flags every line the stdout law forbids and passes the lawful refusal codes", …)`: with
   `forbidden = { tokens: [token], paths: ["/x/pes-s02-y/custody.d"] }`,
   - `violatesStdoutLaw` returns `true` for: `a ${token} b` · `x Bearer abc` · `/x/pes-s02-y/custody.d` ·
     `/x/pes-s02-y/custody.d/vendor.header`;
   - and `false` for: `PES-S02 SCRATCH-DIR /x/pes-s02-y` · `PES-S02 REFUSED PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` ·
     `PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a` · `PES-S02 REFUSED PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a` ·
     `PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor:a` (the four lawful codes of R2.9).

Done when the file holds exactly these 8 `it(...)` and the C3 command prints `0 passed / 8 failed` against the skeleton.

**S02-S18 · C3 · production · R2.5b, R2.6, R2.7, R2.8, R2.9, R2.10, R2.11** — Implement `runHostedAcceptance` and
`violatesStdoutLaw` in `acceptance/pes-s02-hosted.ts`.
- Imports:
  - `parseProviderDiscoveryTargets`, `assertDeploymentProviderTargets`, `assertPricedProviderTargets`,
    `resolveProviderTargetCredentials`, `createProviderDiscoveryResolver` and `type ProviderDiscoveryProbeStore` from
    `../apps/api/src/provider-discovery.js` (the module `main.ts:69-75` uses; house precedent `acceptance/main.ts:8`);
  - `readCustodyAuthorizationHeader` from `@debateai/crypto`;
  - `resolveDeploymentMode` from `@debateai/register`;
  - `type ProviderProbeRecord` from `@debateai/db`;
  - `import { lookup } from "node:dns";` (the default of `deps.lookup`), `type LookupAddress` from `node:dns` and
    `type LookupFunction` from `node:net` (row 3's `resolveAll`);
  - C2's module.
- The run never throws.
- Every line goes through ONE guarded emit: a line for which `violatesStdoutLaw(line, { tokens, paths })` is true is NOT
  emitted, and the run ends `FAIL stdout-law`.
  - `tokens` = the bare token of `FAKE_VENDOR_AUTHORIZATION` and of `deps.credentialLiteral`.
  - `paths` = `<scratch>/custody.d` and `realpath(<scratch>)/custody.d`.
- It stops at the first case that does not hold. `finally` always tears down: `trusting.destroy()`, `vendor.close()`, and
  `rm(<scratch>, { recursive: true, force: true })`.
- A thrown value the flow did not expect ends `FAIL internal`, and its message is never printed.
- `violatesStdoutLaw` is true iff the line includes any `tokens` member, or matches `/Bearer \S/u`, or includes any `paths`
  member.

The order, with the case id each check reports:

| # | action | on failure, the last line is (EXACT) | emits on success (EXACT) |
|---|---|---|---|
| 1 | `scratch = await mkdtemp(join(tmpdir(), "pes-s02-"))`. Its base name must begin `pes-s02-` and hold no `custody`, and `scratch` must match `/^[A-Za-z0-9/._-]+$/` (JSON-safe for R2.7's substitution) | `PES-S02-ACCEPT: FAIL scratch-root` | `PES-S02 SCRATCH-DIR <scratch>` |
| 2 | `mkdir(<scratch>/tls, 0o700)`; `createFixtureCertificate(<scratch>/tls, deps.opensslExecutable)` | `PES-S02-ACCEPT: UNVERIFIED tls-material openssl-unavailable` or `… tls-material openssl-rc-<n>` | — |
| 3 | `addresses = await resolveAll(deps.lookup, FAKE_VENDOR_HOST)` (the function below the table; `deps.lookup` is called with a callback, never without one). Every `.address` is in `127.0.0.0/8` or is `::1`, and one `.address` is `127.0.0.1`. A rejection reports its `code` | `… UNVERIFIED dns <err.code>` · `… UNVERIFIED dns non-loopback` · `… UNVERIFIED dns no-ipv4-loopback` | `PES-S02 DNS api.localtest.me <addresses.map((a) => a.address).join(",")>` (the resolver's order) |
| 4 | `pickFreePort(deps.portCandidates, deps.isPortListening)` | `… UNVERIFIED port lsof-unavailable` · `… UNVERIFIED port none-free` | `PES-S02 PORT-FREE <port> lsof -nP -iTCP:<port> -sTCP:LISTEN rc=1 lines=0` |
| 5 | `startFakeVendor({ port, keyPem, certPem })` | `… UNVERIFIED port bind-raced` | `PES-S02 FAKE-VENDOR https://api.localtest.me:<port>/v1` |
| 6 | `verifySeamHandshake({ port, caPem: certPem, lookup: deps.lookup })` resolves; THEN the global `fetch` POST to `https://127.0.0.1:<port>/v1/chat/completions` rejects with `cause.code === "DEPTH_ZERO_SELF_SIGNED_CERT"` | `… UNVERIFIED trust-seam handshake-<code>` · `… UNVERIFIED trust-seam default-fetch-accepted` · `… UNVERIFIED trust-seam default-fetch-<code>` | `PES-S02 TRUST seam-handshake=authorized default-fetch=DEPTH_ZERO_SELF_SIGNED_CERT` |
| 7 | `mkdir(<scratch>/custody.d, 0o700)` + `chmod 0o700`; `writeFile(<scratch>/custody.d/vendor.header, deps.credentialLiteral + "\n", { mode: 0o600 })` + `chmod 0o600`. Then `lstat` must show: directory mode `0700`, uid `process.getuid()`, file mode `0600`, `nlink === 1`, not a symlink, and `readdir(custody.d)` EXACT `["vendor.header"]` (R2.8) | `PES-S02-ACCEPT: FAIL custody-layout` | — |
| 8 | For each refusal case in order: the chain on `[${target.replaceAll("/SCRATCH", scratch)}]` with `PES_S02_CONFIGURED_PROVIDERS`, `mode = resolveDeploymentMode("hosted", "production")` and `nodeEnv: "production"`. It must throw an `Error` whose `message === case.expected`. Record `{ id, message, stage }` | `PES-S02-ACCEPT: FAIL <case.id>` | `PES-S02 REFUSED <message>` |
| 9 | The admission target, EXACT per R2.8: `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:<port>/v1","model":"fake-model","authorization_file":"<scratch>/custody.d/vendor.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`. The same chain must not throw. Then `createProviderDiscoveryResolver({ configuredProviders: PES_S02_CONFIGURED_PROVIDERS, targets: <the RESOLVED targets>, probes: <in-memory store, starts empty>, probeFreshnessMs: 600000, probeTimeoutMs: 5000, fetchImplementation: trusting.fetch, clock: () => new Date() })`, awaited ONCE. The members are EXACT one, with `provider_ref === "vendor:a"` and `maker === "Acme"` | `PES-S02-ACCEPT: FAIL admitted` | `PES-S02 ADMITTED vendor:a` |
| 10 | `vendor.counts()` | after emitting the counts line: `PES-S02-ACCEPT: FAIL vendor-requests` unless it reads `1 matched 0 rejected` | `PES-S02 VENDOR-REQUESTS <m> matched <r> rejected` |
| 11 | teardown (`finally`), then `stat(<scratch>)` must reject `ENOENT` | `PES-S02-ACCEPT: FAIL scratch-removed` (only when no earlier case failed) | — |
| 12 | verdict | — | `PES-S02-ACCEPT: PASS` |

Row 3's `resolveAll` is module-private in `acceptance/pes-s02-hosted.ts` (not exported, so S02-S16's 7-name gate is
unchanged), written exactly as below. It calls the ONE `deps.lookup` value in the callback shape that `https.request`
(S02-S14) and `tls.connect` (row 6) also use, so the stub of the suites and the `node:dns` default travel the same code
path. Measured at base (`probes/ARCH-FIX-PES-S02-p2/b1-lookup-shapes.out`): `node:dns` `lookup` → `127.0.0.1,::1` (G1),
`lookupStub` → `127.0.0.1` (G2), the ENOTFOUND stub rejects with `code` `ENOTFOUND` (G3), `192.0.2.10` is returned for
row 3 to refuse (G4); the p1 shape (no callback) throws `ERR_INVALID_ARG_TYPE` (M1).

```ts
function resolveAll(lookup: LookupFunction, hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, answer) => {
      if (error) reject(error);
      else resolve(answer as LookupAddress[]);
    });
  });
}
```

The in-memory store is `{ readLatest: async (refs) => recorded.filter((r) => refs.includes(r.providerRef)), record: async (o) => { recorded.push(o); } }`,
typed as `ProviderDiscoveryProbeStore`.

PASS output (EXACT: 13 lines, in this order; `<scratch>`, `<port>` and `<addresses>` are substituted as defined above):

```
PES-S02 SCRATCH-DIR <scratch>
PES-S02 DNS api.localtest.me <addresses>
PES-S02 PORT-FREE <port> lsof -nP -iTCP:<port> -sTCP:LISTEN rc=1 lines=0
PES-S02 FAKE-VENDOR https://api.localtest.me:<port>/v1
PES-S02 TRUST seam-handshake=authorized default-fetch=DEPTH_ZERO_SELF_SIGNED_CERT
PES-S02 REFUSED PROVIDER_TARGET_LOOPBACK_REFUSED:vendor:a
PES-S02 REFUSED PROVIDER_INLINE_CREDENTIAL_REFUSED:vendor:a
PES-S02 REFUSED PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT
PES-S02 REFUSED PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor:a
PES-S02 REFUSED PROVIDER_TARGET_PRICE_REQUIRED:vendor:a
PES-S02 ADMITTED vendor:a
PES-S02 VENDOR-REQUESTS 1 matched 0 rejected
PES-S02-ACCEPT: PASS
```

On this Mac at base, `<addresses>` = `127.0.0.1,::1`. SPEC-v4 §5 step 5's named lines keep their order: SCRATCH-DIR, then
FAKE-VENDOR, then the five REFUSED lines. The DNS, PORT-FREE and TRUST evidence lines sit between them
(DECISIONS 2026-09-25, "What does a PASS run print?").

Done when all three hold:
- the C3 command prints `CLUSTER_GREEN` (8/0);
- `grep -cF 'import { lookup } from "node:dns";' acceptance/pes-s02-hosted.ts` prints `1`;
- `grep -cE 'node:dns/promises|promises\.lookup|dns\.promises' acceptance/pes-s02-hosted.ts acceptance/pes-s02-fake-vendor.ts`
  prints exactly `acceptance/pes-s02-hosted.ts:0` and `acceptance/pes-s02-fake-vendor.ts:0` (the suites inject stubs and `tsc` accepts the promise function, so these two lines and
  S02-S19 are what guard the default).

**RED when omitted**: all 8 cases of S02-S17.

**S02-S19 · C3 · production · §5 steps 4 and 8, R2.9, R2.10** —
1. Create `acceptance/pes-s02-hosted-cli.ts` (new), exactly as below. Its exit rule is V's ruling V-12/V-13, "Exit 1 on
   FAIL" (`V-DECISIONS-PACKET.md:24`), as `SPEC-v4.md:253-259` words it: exit 0 on PASS, 1 on FAIL and on UNVERIFIED. The
   catch writes `PES-S02-ACCEPT: FAIL internal` and prints no error message (R2.9: an error message can carry a path).
   `process.exitCode` is set, never `process.exit(…)`, so stdout is flushed before the process ends.

```ts
import { runHostedAcceptance } from "./pes-s02-hosted.js";

try {
  const result = await runHostedAcceptance({ emit: (line) => { process.stdout.write(`${line}\n`); } });
  process.exitCode = result.outcome === "PASS" ? 0 : 1;
} catch {
  process.stdout.write("PES-S02-ACCEPT: FAIL internal\n");
  process.exitCode = 1;
}
```

2. In `package.json`, append `"pes:accept-hosted": "tsx --no-cache acceptance/pes-s02-hosted-cli.ts"` after
   `"eval:roles": "tsx acceptance/eval-harness-cli.ts"` (`:56`), which gets the separating comma.

Done when all of these hold:
- `grep -cF 'process.exitCode = result.outcome === "PASS" ? 0 : 1;' acceptance/pes-s02-hosted-cli.ts` prints `1`;
- `grep -cF 'process.exitCode = 1;' acceptance/pes-s02-hosted-cli.ts` prints `1`;
- `grep -cE 'process\.exit\(|process\.exitCode = 0' acceptance/pes-s02-hosted-cli.ts` prints `0`;
- SPEC-v4 §5 step 4, typed as `SPEC-v4.md:231` with the log under the seat's probes dir,
  `pnpm pes:accept-hosted > <abs log> 2>&1; echo "exit=$?"`, prints EXACT `exit=0` (on this Mac, public DNS up). In the
  log: line 1 is EXACT `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`; the lines that begin `PES-S02` are EXACTLY the
  13 lines of S02-S18 "PASS output (EXACT)", in order; the last line is EXACT `PES-S02-ACCEPT: PASS`; and every other line
  begins `(node:` or `(Use ` (node's own warning, printed only when the seat's environment sets both `NO_COLOR` and
  `FORCE_COLOR`, as in `probes/ARCH-REV-PES-S02-p1/dns-callback.log`; 0 such lines in this seat's shell).

The FAIL and UNVERIFIED exits are pinned by the first two gates and by S02-S17's `outcome` assertions (cases 4–7). Through
real pnpm 11.20.0, that mapping gives `exit=1` and step 8's verdict on the line above `[ELIFECYCLE]`, for FAIL and for
UNVERIFIED. The p1 mapping (exit 0 always) gives `exit=0` on both, which violates step 8
(`probes/ARCH-FIX-PES-S02-p3/pnpm-exit-rule.out`: `[planned]` HOLDS ×3, `[mutant-exit0-always]` BROKEN for FAIL and
UNVERIFIED). The block above, extracted from this file and run through real pnpm over a stub `runHostedAcceptance`
(`probes/ARCH-FIX-PES-S02-p3/cli-block-run.out`): `tsc rc=0`; PASS `exit=0`, FAIL `exit=1`, UNVERIFIED `exit=1`, a
thrown run `exit=1` with the verdict `PES-S02-ACCEPT: FAIL internal` and 0 lines of the error's message; the exit-0
mutant breaks FAIL, UNVERIFIED and the thrown run. **RED when omitted**: the same step-4 command prints `exit=1` and the log reads `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL]
Command "pes:accept-hosted" not found` (measured at base in the new command form, `probes/ARCH-FIX-PES-S02-p3/REV-base-step4.out`).

**S02-S20 · C3 · verification · R2.5b, R2.5e, R2.11** — Run `pnpm typecheck`. No diagnostic may name a file C3 wrote. Then
run §4 V5 (a)–(e) over all `acceptance/pes-s02-*` files. Each prints exactly what §4 states.

## 7. Refutation — what each step's criterion catches, and one failure it does not

| step | catches | does NOT catch |
|---|---|---|
| S02-S01 | a fixture that cannot drive the real assembler (S02-S02 (a) fails before its assertion) | drift between this copy and the DEV-09 fixture it was copied from |
| S02-S02 | a record that omits the key or declares a value other than `local`; a runner record that forwards the API record's value (the fixture record lacks the key) | a third process (the UI's) declaring or not declaring the mode, which is outside R2.1/R2.2 |
| S02-S03 | no upgrade path (DRIFT on V's stack); a predicate that admits any file lacking the row (w1); one that rewrites a `hosted` row to `local` (w2); a key inserted mid-list (then the pre-slice file is not a prefix and (a) fails) | a pre-slice file that is ALSO the legacy without the Support target; it is accepted by construction (the fifth alternative calls that predicate) but no case builds it |
| S02-S04 | a launcher that starts a dev API declaring `hosted`; a spawn environment whose mode is not `local` (positive half) | a hosted boot of the real API, which is out of scope (no process is started) |
| S02-S05 | key or value missing from the assembly | the key's position by itself (S02-S03 (a) catches it) |
| S02-S06 | DRIFT on the pre-slice file; over-admission | a Support-legacy + pre-slice triple (see S02-S03) |
| S02-S07 | an unpinned `hosted`; a pin written with the wrong value (case `:208` and the positive half then fail) | a mode handed to the API child through `commandEnvironment` instead of `api.env`: the case's command environment carries only `PATH`, and only the allow-list of `loadDevelopmentCommandEnvironment` (`packages/register/src/runtime-environment.ts:213`, which names no `DEBATEAI_DEPLOYMENT_MODE`; the key's only mentions in that file are `:305`, `:482`, `:569`, `:620`) keeps it out in production |
| S02-S08 | a missing runner declaration; a forwarding implementation | the runner child's own loader ignoring the key; R2.3's unchanged cases pin that loader |
| S02-S09 | a C1 suite off its pair in any of three runs; a `-t` filter that selects other than the two cases | a flaky case that passes three runs in a row |
| S02-S10 | a case whose state changed without a named step; a base-PASS case that fails after | a case renamed between base and after (the row then shows a missing name, which the seat must reconcile by hand) |
| S02-S11 | a type error in a C1 file; an edit to the resolution rule's file | a type-correct edit to another forbidden file (§4 V5 (f) catches that) |
| S02-S12 | a missing or misnamed export; a constant absent from the skeleton | a constant with the wrong VALUE (S02-S13 cases 2 and 5 catch it) |
| S02-S13 | a body the probe would reject; a 200 without the literal; a 401 body naming a credential; trust leaking into the default `fetch`; an excluded or unmeasured port; an IPv4-only connect; a lookup passed to `https.request` or `tls.connect` in a shape they do not call back through (the stubs are callback-shaped) | a certificate valid for longer than it needs to be (`-days 1` is its only bound) |
| S02-S14 | an implementation that fails any of the 6 cases | behaviour outside the cases, for example a vendor that answers a second path with 200, which the 404 rule and case 3 bound only for `/models` |
| S02-S15 | a second copy of the literal; env-based TLS relaxation; a second listener | a literal assembled from fragments at run time elsewhere (a `git grep` sees only whole literals) |
| S02-S16 | a fixture that is not byte-identical to SPEC-v4 (self-check 5 compares them); a missing export | a wrong `stage` label (S02-S17 case 1 compares the stages) |
| S02-S17 | a wrong code or order of OUTPUT lines; a stdout leak; a scratch root or port left behind; UNVERIFIED reported as FAIL or the reverse; an `outcome` that disagrees with the verdict line (cases 1 and 4–7 assert both, and S02-S19's exit code is derived from `outcome`) | **a swap of two chain stages**: no fixture fails two stages, so priced↔deployment or credentials↔priced swaps print the same five codes (Review Focus #3) |
| S02-S18 | the resolver fed the PARSED targets (the vendor sees no header; measured at base: panel size 0); a custody layout that departs from R2.8; a run that throws instead of printing a verdict; row 3 calling `deps.lookup` without a callback (case 6 (i)/(ii) and case 1 go through `resolveAll`); a `dns.promises` default (the two `node:dns` greps) | a verdict printed twice (the EXACT line list of case 1 catches it on PASS only) |
| S02-S19 | a missing script; a CLI that prints an error message; an exit code other than 0 on PASS (the step-4 run) or other than 1 on FAIL, UNVERIFIED or a thrown run (the exact-line gates); `process.exit(…)` truncating stdout | a failing run of THIS CLI through pnpm: only its PASS path runs through pnpm (here and §4 V6); the FAIL/UNVERIFIED path through pnpm is proven on the CLI block over a stub `runHostedAcceptance` (`cli-block-run.out`) and on a stand-in (`pnpm-exit-rule.out`), not on the built CLI |
| S02-S20 | a type error in a C3 file; a plain-HTTP URL; a database import; a second listener | an import added after V5 runs |

**Mutant classes per cluster** (each command goes RED on each class):
- **S02-C1**: key absent from the list · value ≠ `local` · key inserted mid-list · no upgrade predicate · an over-admitting
  predicate · no launcher pin · DEV-10B fixture not updated (`:208`'s case goes RED once the key joins the list,
  `parseApiEnvironment` refusing `undefined`) · runner declaration missing or forwarded · any edit to the resolution rule
  (v9's 201 base cases, including the four of R2.3).
- **S02-C2**: body `model` ≠ `fake-model` or `content` ≠ `OK` · a 200 without the literal · a 401 body naming the
  credential · trust by environment or global agent · an excluded port picked or `listening` called for one · SAN ≠
  `DNS:api.localtest.me` · an IPv4-only connect.
- **S02-C3**: a wrong expected message or order of lines · a missing or unprinted refusal · a leaked token, Bearer value
  or custody path · a scratch root or port left behind · UNVERIFIED and FAIL confused · the PARSED targets handed to the
  resolver · a fall-back to plain HTTP.

## 8. Review Focus — the five uncovered inputs most likely to bite, most likely first

1. **Ctrl-C during `pnpm pes:accept-hosted`.** No signal listener is built (a `DECISIONS.md` row, CONFIDENCE low). An
   interrupted run can leave `<tmpdir>/pes-s02-*` holding the FAKE credential of R2.5e. A completed run takes ~0.3 s.
2. **A downgrade after the upgrade.** Once this slice's assembler has rewritten an `api.env`, an assembler from any
   checkout without S02-S05 and S02-S06 meets a 42nd row that its predicates never admit, and refuses
   `DEV_API_ENVIRONMENT_DRIFT`. It bites only where two checkouts share a custody root through
   `DEBATEAI_DEV_CUSTODY_ROOT`, since the default root is per checkout (`deploy/dev-auth/custody-root.mjs:101`). The same
   one-way property holds for the Support-target upgrade (`:421-448`). Remedy: delete that root's `api.env`, and the older
   assembler rewrites it.
3. **A reorder of the chain in `apps/api/src/main.ts:299-318`**, now or later. The acceptance calls the four functions in
   today's order and would keep proving it, and no fixture detects a stage swap (§7). §4 V5 (f) pins `main.ts` unchanged
   only within this slice.
4. **A FAIL or UNVERIFIED run read through pnpm.** V ruled exit 1 on FAIL and UNVERIFIED (V-12/V-13, `SPEC-v4.md:253-259`).
   pnpm then writes `[ELIFECYCLE] Command failed with exit code 1.` AFTER the verdict, and a reader who takes the log's
   last line gets pnpm's notice, not the verdict; step 8 reads the line above it. No suite runs this CLI through pnpm on a
   failing path: S02-S19's exact-line gates and the runs of `probes/ARCH-FIX-PES-S02-p3/cli-block-run.out` (the CLI block over a
   stub) and `pnpm-exit-rule.out` cover it.
5. **A machine clock more than a day off.** The certificate is valid for `-days 1`, so the seam handshake fails
   (`CERT_NOT_YET_VALID` or `CERT_HAS_EXPIRED`) and the run ends `UNVERIFIED trust-seam handshake-<code>`, not FAIL. No case
   sets the clock.

## 9. Base evidence — every command this seat ran at `776359c3`

All under `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S02/`.
Every `.sh` runs in the lane, which stayed read-only with `git status --porcelain` at 0 after every run.

| script | what it ran | verdict |
|---|---|---|
| `C1-base.sh` → `C1-base-run1.log`, `C1-base-run2.log` | S02-C1's command. Run 1 discovered register-support-publication's 14/1, and run 2 is the command exactly as planned | run 2: `CLUSTER_RED`. TDD-RED, expected: v9 201/0 → 203/0, dev-api-environment 9/1 → 11/1, dev-api-process 5/5 → 6/5, others at their pairs; no BROKEN |
| `C2-C3-base.sh` → `C2-C3-base.out` | the paths C2 and C3's commands name | all six created paths `ABSENT-AT-BASE`, so both commands are OMITTED from the base run (packet §2) |
| `REV-base.sh` → `REV-base-step2.log`, `REV-base-step4.log` | §5 steps 2 and 4 as V types them | step 2: rc 0 with `Tests  201 skipped (201)`, which is RED because 0 cases match, and shows the rc is not evidence. Step 4: rc 1, `Command "pes:accept-hosted" not found`, RED |
| `spike-hosted-chain.sh` → `spike-hosted-chain.log` (throwaway `.ts`) | the design of C2 and C3, executed in process at base | all five R2.7 messages match, at stages parse/deployment/priced/credentials, under `nodeEnv` production and undefined; the custody layout is accepted; both openssl binaries mint a certificate; the default fetch is refused `DEPTH_ZERO_SELF_SIGNED_CERT`; the seam admits `vendor:a`; `1 matched 0 rejected`; PARSED-only targets give an empty panel; scratch removed and port released; total 303 ms |
| `spike-ipv6-first.sh` → `spike-ipv6-first.log` | the seam's `lookup` answering `::1` first | `autoSelectFamily default=true`, `status=200` |
| `spike-negative-control-ip.sh` → `spike-negative-control-ip.log` | the default `fetch` against the fixture's certificate through the LITERAL `127.0.0.1` URL (S02-S13 case 4, S02-S18 row 6) and through the hostname | both reject with `DEPTH_ZERO_SELF_SIGNED_CERT`; 0 HTTP requests reach the request callback, so the vendor's counts are unaffected |
| `pnpm-streams.sh` → `pnpm-streams.out` | pnpm's banner and `[ELIFECYCLE]` streams | banner on stderr; `[ELIFECYCLE]` on stdout after a non-zero exit |
| `REV-regression-pairs.txt` | §4 V2's 39 pairs, generated from `baselines.tsv` | — |

The feasibility spike's own DNS call is `dns.promises.lookup` (`spike-hosted-chain.ts`), and it is NOT the design: row 3
of S02-S18 calls the callback `LookupFunction` through `resolveAll` (Revision 2, B1).

**Revision 2** (ARCH-FIX-PES-S02-p2), under `…/probes/ARCH-FIX-PES-S02-p2/`, lane still `776359c3` and dirty 0 after every run:

| script | what it ran | verdict |
|---|---|---|
| `C1-base.sh` → `C1-base.out`, `C1-base.log` | S02-C1's command, unchanged | `CLUSTER_RED`, TDD-RED: 201/0, 9/1, 5/5, 8/0, 7/0, 16/0, 3/0, 14/1 |
| `rev-C1-base.sh` → `rev-C1-base.out` | the reviewer's `ARCH-REV-PES-S02-p1/C1-base.sh`, its log redirected here | identical counts, `CLUSTER_RED` |
| `C2-C3-base.sh` → `C2-C3-base.out`; the reviewer's `C2-C3-absent.sh` → `rev-C2-C3-absent.out` | the six created paths | `ABSENT-AT-BASE` ×6 in both |
| `b1-lookup-shapes.sh` → `b1-lookup-shapes.out` | S02-S13/S02-S17's `callbackLookup` and S02-S18's `resolveAll`, verbatim, typechecked and run against `node:dns` `lookup`, the stubs, `https.request` and `tls.connect`; mutants M1–M3 are the reviewed shapes | `tsc rc=0`; G1 `127.0.0.1,::1`, G2 `127.0.0.1`, G3 rejects `ENOTFOUND`, G4 `192.0.2.10`, G5–G7 `status=200`, G8–G9 `authorized=true`; M1 `ERR_INVALID_ARG_TYPE`, M2 `req-timeout`, M3 never calls back |
| `b1-tsc-mutant.sh` → `b1-tsc-mutant.out` | `tsc` on the two reviewed shapes typed without casts | rejects the no-callback call (TS2353); ACCEPTS `resolveAll(dns.promises.lookup, …)`, which is why S02-S18 carries the two `node:dns` greps |
| `b1-promisify.mjs` → `b1-promisify.out` | the verdict's suggested repair, `util.promisify(lookup)(host, { all: true })` | works equally for `node:dns` `lookup` (no `promisify.custom`) and the stub; `resolveAll` kept (DECISIONS correction row) |
| `fix-detectors.sh` → `fix-detectors.out` | the B1, N1 and N2 text detectors on this PLAN and on the reviewed copy `PLAN-p1-as-reviewed.md` (the failing fixture) | see the READY on t_8bddd97c |

**Revision 3** (ARCH-FIX-PES-S02-p3), under `…/probes/ARCH-FIX-PES-S02-p3/`, lane still `776359c3` and dirty 0 after every run:

| script | what it ran | verdict |
|---|---|---|
| `C1-base.sh` → `C1-base.out`, `C1-base.log` | S02-C1's command, unchanged | `CLUSTER_RED`, TDD-RED: 201/0, 9/1, 5/5, 8/0, 7/0, 16/0, 3/0, 14/1 |
| `C2-C3-base.sh` → `C2-C3-base.out` | the six created paths | `ABSENT-AT-BASE` ×6 |
| `REV-base-step4.sh` → `REV-base-step4.out`, `REV-base-step4.log` | SPEC-v4 §5 step 4 as V types it (`SPEC-v4.md:231`), at base | `exit=1`; the log reads `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "pes:accept-hosted" not found` (S02-S19's RED) |
| `pnpm-exit-rule.sh` → `pnpm-exit-rule.out` | SPEC-v4 steps 4 and 8 through real pnpm 11.20.0, over a stand-in `tsx` with the planned mapping and with the exit-0 mutant | planned: HOLDS for PASS (`exit=0`), FAIL and UNVERIFIED (`exit=1`, verdict on the line above `[ELIFECYCLE]`); the log's first line is `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`; mutant: BROKEN for FAIL and UNVERIFIED |
| `cli-block-run.sh` → `cli-block-run.out` | S02-S19's CLI block, extracted from this file, typechecked and run through real pnpm over a stub `runHostedAcceptance` | `tsc rc=0`; PASS `exit=0`, FAIL/UNVERIFIED/thrown `exit=1`, 0 error-message lines; exit-0 mutant BROKEN for FAIL, UNVERIFIED and thrown |
| `exit-rule-detectors.sh` → `exit-rule-detectors.out` | E1–E10 (the exit rule, the SPEC-of-record re-point, the §2 anchors) on this PLAN, on Revision 2 as committed (`PLAN-rev2.md`, the failing fixture) and on an anchor mutant | revision `ALL-PASS`; fixture `FAILED:E1…E10`; mutant `FAILED:E10` |
| `plan-selfcheck.sh`, `p2-detectors.sh` | the whole-plan self-checks against `SPEC-v4.md`, and Revision 2's B1/N1/N2 detectors, on this revision | see the READY on t_50d2d8d3 |

## 10. SPEC ↔ PLAN reverse trace — every step to its requirement (zero orphans)

| step | requirement(s) | step | requirement(s) |
|---|---|---|---|
| S02-S01 | R2.2b, R2.1 | S02-S11 | R2.3 |
| S02-S02 | R2.2b, R2.1, R2.2, R2.3 | S02-S12 | R2.5, R2.6 |
| S02-S03 | R2.1, R2.4 | S02-S13 | R2.5, R2.6, R2.11 |
| S02-S04 | R2.1, R2.4 | S02-S14 | R2.5, R2.6, R2.11 |
| S02-S05 | R2.1 | S02-S15 | R2.5, R2.11 |
| S02-S06 | R2.1 | S02-S16 | R2.7, R2.8, R2.9 |
| S02-S07 | R2.1 | S02-S17 | R2.5b, R2.6, R2.7, R2.8, R2.9, R2.10, §5 |
| S02-S08 | R2.2 | S02-S18 | R2.5b, R2.6, R2.7, R2.8, R2.9, R2.10, R2.11, §5 |
| S02-S09 | R2.1, R2.2, R2.2b, R2.3 | S02-S19 | R2.9, R2.10, §5 steps 4, 8 |
| S02-S10 | R2.4 | S02-S20 | R2.5, R2.11 |

Forward: every requirement R2.1–R2.11 and §5 has at least one step (§2). Reverse: every one of the 20 steps serves at least
one requirement (this table). Gaps in either direction: **zero**.
