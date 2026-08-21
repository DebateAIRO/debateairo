# Claude Opus — S3d final-custody agent report

**Verdict:** `CLAUDE CUSTODY GREENLIGHT`
**Seat:** fresh `claude-opus-5` final-custody takeover of the cancelled Hermes run
**Ticket:** `t_cc197ed2`, board `accounts-phase1`
**Authority:** `reviews/S3d-claude-final-custody-packet.md`
(SHA-256 `b9ec14816c5f5affa377c56aa0f4dd56329b720598ef1f71f89837942a1aea93`)
**Full verdict:** `reviews/S3d-claude-final-custody-verdict.md`

## Outcome

All gates green, all eight post-gate hashes exact, exact eight-path scope
committed locally, ticket completed. Not pushed.

**Commit:** `dc9fd57f6adc10f24907f64f795951cbc2cee28a`
(parent `5b2471d559f1ed5705dc3b9d55525497c5882478`, branch `dev`,
subject `feat(auth): harden verification mail flow`, 8 files changed,
3324 insertions, 173 deletions). The commit's name-only path set is exactly the
eight candidate paths and nothing else.

## Gate results

| gate | exit | result |
|---|---|---|
| full `pnpm test` (Router external exclusive lane) | **0** | **110/110 files, 820/820 tests, 1490.45 s** |
| `pnpm typecheck` | 0 | `tsc --noEmit` clean |
| `pnpm lint` | 0 | architecture 28 edges / 0 violations; source 0 blockers |
| `git diff --check` | 0 | clean |
| post-gate re-hash × 8 | — | all exact vs packet table |

## The full-suite gate, and why it was external

This seat's Bash tool hard-caps a single foreground command at 600000 ms. The
suite needs ~1490 s. Two in-seat attempts produced no usable result and I
refused to call either green:

| attempt | outcome | evidence value |
|---|---|---|
| background | killed at session teardown, no `Test Files`/`Tests` summary, no exit code | none |
| foreground (900000 ms requested, clamped to 600000) | SIGTERM at exactly 10m 0s, exit 143, no summary | none |

I also measured the sharding escape hatch rather than assuming: `vitest.config.ts`
sets `fileParallelism: false`, so files run strictly sequentially and total time
is the sum of per-file times. But `tests/integration/registration-database.test.ts`
alone exceeds 600 s (a foreground run of that single file overran the ceiling),
so no file-level partition of `pnpm test` fits either. That is why an external
lane was necessary.

Router then ran the gate externally and exclusively. I verified it fail-closed
before accepting it as evidence:

- `.status` = `0`; in-log marker `S3D_FINAL_FULL_SUITE_ATTEMPT2_EXIT=0`
- log header shows `$ vitest run` — the repository's `pnpm test` script
- complete summary present: `Test Files 110 passed (110)`, `Tests 820 passed (820)`,
  `Duration 1490.45s`
- window `2026-08-21T11:21:18Z` → `2026-08-21T11:46:09Z`
- `.before.sha256` and `.after.sha256` are **byte-identical** (`diff` exit 0) and
  both equal the packet's eight-path gold table; the same eight hashes are
  embedded inline in the log before and after the run
- independent failure sweep: 820 `✓` lines for 820 passing tests, zero failure
  markers. Every `FAIL`-shaped string is a test *name* or a deliberate
  negative-control fixture on a passing line, plus expected embedded-PostgreSQL
  error output from negative-path tests.

Test count moved 818 → 820 versus the rework-3 record: the disclosure-only recut
added its D1 policy assertion to the unit file. No test lost; file count
unchanged at 110.

## V-ruled bars confirmed in the authoritative run

- **B4 burst 100: success=100, busy=0, committed=100, sends=100**, p50 21265.8 ms,
  p99 30779.9 ms, max queue wait 17492.0 ms, deadline margin 508.0 ms
- burst 128 → 104 committed (margin 3.2 ms); burst 160 → 104 committed (margin 4.7 ms)
- **frozen S3b durability: concurrent=100, successes=100, committed_at_response=100**;
  F3 ordering `before_commit_calls=0 persisted_accounts=0`
- **retained objects 97 at N=500 and N=4000**, capacity_count=4000, bound held
- successor shallow clean: sharp AUC 0.5430 ≤ q99 0.7617, accuracy 0.6563 ≤ 0.7500,
  permit-to-activation medians 134.0 / 133.6 ms, in-window sends 32/32
- B1 real-timeout grant intervals: register AUC 0.5430 ≤ 0.7559, resend 0.6563 ≤ 0.7578
- arm-neutral queue deadline: reservation wait max 18004.0 ms ≤ ceiling 18007.9 ms
- D2 lifetime 72 live ≤ ruled 73; D3 first link active after immediate resend

## Command log (this seat)

| # | command | exit | result |
|---|---|---|---|
| 1 | `shasum -a 256` review packet, Hermes transcript, custody packet | 0 | `2f3150a3…`, `b0e57a28…`, `b9ec1481…` — all exact |
| 2 | `hermes kanban … show t_cc197ed2` | 0 | status `running`; Router 13:41 delegates this takeover; no newer V change |
| 3 | seat/process inventory (`pgrep`, `ps`) | 0 | no vitest, no S3d seat; two other missions' Grok seats live |
| 4 | `shasum -a 256` × 8 (pre-gate) | 0 | all exact |
| 5 | `git status --porcelain -- apps packages tests migrations` | 0 | 7 tracked modified + migration 0033 untracked |
| 6 | `git diff --cached --name-only` | 0 | empty |
| 7 | `git diff` × 7 tracked + read migration 0033 | 0 | inspected in full |
| 8 | scoped greps (`.only`/`.skip`, `S3D_*`, `NON_MONOTONIC`/`V_ROUTER`, `cadence_sensitivity`) | 0 | clean / default-off / none / no runtime consumer |
| 9 | `pnpm test` × 2 in-seat | —/143 | both unusable, discarded as non-evidence |
| 10 | heavy-file measurement | — | single file exceeds 600 s ceiling; sharding ruled out |
| 11 | verify Router external gate artifacts | 0 | status 0, manifests byte-identical, summary complete |
| 12 | `pnpm typecheck` | 0 | clean |
| 13 | `pnpm lint` | 0 | 28 edges / 0 violations / 0 blockers |
| 14 | `git diff --check` | 0 | clean |
| 15 | `shasum -a 256` × 8 (post-gate) | 0 | all exact |
| 16 | `git add --` eight literal paths | 0 | exactly eight staged |
| 17 | `git diff --cached --name-only` / `--check` | 0 | exactly the eight, nothing else; clean |
| 18 | `git commit` | 0 | local only; commit path set = the eight |

## Hermes handoff boundary — independently confirmed

Session `20260821_112016_a4501e`, model `qwen3.8-hermes:27b`, 49 messages / 28
tool calls, `ended_at` and `end_reason` both null (external termination). I
enumerated all 28 tool calls: every one is a read (`read_file`, `search_files`,
`terminal` inspection, `execute_code` on the exported ticket JSON). No vitest
run, no edit, no `git add`/`commit`, no board mutation. The packet's account is
accurate; I inherited those reads and began at the pre-hash.

## Independent verification (not inherited)

Authority chain and hashes; HEAD `5b2471d5…` and branch `dev`; ticket status and
latest routing instruction; exact eight-path status shape; all eight hashes at
five checkpoints (entry, after each killed run, the external gate's own
before/after manifests, post-gate); every tracked diff plus the untracked
migration; policy arithmetic re-derived by hand (600 / 5700 / 5100 / 480 / 30 /
N*+1); every published cadence figure cross-checked against raw progress-log
observations rather than reviewer summaries; scoped stale-wording, consumer,
focused-test and env-control searches; and that both final GREENLIGHTs carry
entry==exit hash tables identical to this exact byte set with zero blocking
findings in either.

## Notes and residuals

1. The final suite was executed by Router's external lane, not observed running
   by this seat. It is bound to this byte set by inline before/after manifests
   and an exit-0 status file, all verified fail-closed — but the execution is
   not my own observation, and I record that rather than implying otherwise.
2. Queue-deadline margin is thin and host-dependent: 508.0 ms at burst 100 but
   3.2 ms / 4.7 ms at bursts 128 / 160 against the 18 000 ms deadline, with the
   executable gate only `>= 0`. Not a regression (100/100 held on both B4 and
   frozen S3b) and deferred by V under 2A, but squarely under the mandated
   deployment/storage recalibration trigger.
3. Successor residual (1A) remains exactly as open as V accepted it; the
   env-switched +25 ms control is the right instrument against real target storage.
4. `production_equivalent_100_request_success_margin` is `successes − 100`, so
   identically zero on any pass — console only, no policy claim, misreadable as
   headroom.
5. D1 places no lower bound on `accepted`; the ruled target is gated by B4 and
   the frozen S3b durability test, both GREEN.
6. Git toplevel is `/Users/vladmihaimiron/Documents/DebateAIRO`, one level above
   the packet's named repository path, so cached/commit path sets render
   `dialectical-engine/`-prefixed. Verified against that prefix at staging.
7. `RegistrationService` carries an optional `verificationTokenFactory` test seam
   defaulting to the real generator. Both lenses greenlit it; observation only.

## Compliance

No product code or test edited. Staged exactly the eight literal packet paths and
nothing else. Committed locally only — **not pushed**. No Hermes or Fable
model/agent launched; `hermes kanban` used only as the board client. The only
files this seat created are this report and the verdict.
