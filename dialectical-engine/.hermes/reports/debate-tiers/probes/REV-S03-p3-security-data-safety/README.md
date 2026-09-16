# Promoted probes — REV-S03-p3-security-data-safety

**Head they were written against and measured at: `3f488b3f` (`integration/all`, = slice head
`0fe14637` merged).** Nothing here mutates anything and nothing here asserts a defect, so unlike the
pass-2 set these do NOT invert under a later fix.

`POLARITY: asserts-the-promise · STABLE-UNDER-FIX` — every assertion is written against the contract
`GET /v1/plan-tiers` must satisfy (200 carrying exactly the two id lists; nothing operator-only ever
in the response; fail-closed with a bare envelope on a bad row), not against the state of any head.
Two cases (`S4`, and the whole of `S8`) only LOG and assert nothing about direction — they are
measurements, deliberately.

## How to run them from ANY worktree

Both files are plain vitest suites whose only non-package imports are worktree-relative
(`../../apps/runner/src/…`, `../support/httpSession.js`); `loadModelConfig(process.cwd())` takes the
root from the cwd. Nothing is hard-coded to an absolute path. Copy into `tests/unit/` of the worktree
under review and run:

```
LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p3-security-data-safety-probe.test.ts \
  tests/unit/REV-S03-p3-security-zodnarrow.test.ts
```

Measured at `3f488b3f`: the R3 file `Tests 9 passed (9)`, the S8 file `Test Files 1 passed (1)` ·
`Tests 1 passed (1)`, both rc=0. (`probe-r3.log` runs R3 together with the carried pass-2 rowshape
probe, hence its `2 failed | 11 passed (13)` — the two REDs are the pass-2 probe's inverted cases,
explained below.)

No provider call, no dev server, no live database, no port bound. Every key value is this seat's own
fake (`FAKEKEY-rev-s03-p3-security-DO-NOT-USE`); `.local/**` is never read.

## What each probe pins

**`REV-S03-p3-security-data-safety-probe.test.ts` — PROBE R3, the wire answer after F1**

| case | what it pins | measured at `3f488b3f` |
|---|---|---|
| S0 | the publisher still writes the discriminator (F1 is reader-side only) | `{"kind":"PLAN_TIER_ROSTERS","free":[…],"premium":[…]}` |
| S1 | **re-derived** — the reader ACCEPTS the real published row (pass 2: THROW) | `OK {"free":["gpt-5.6-luna","glm-5.3-flash"],"premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}` |
| S2 | **re-derived** — the route answers 200, body key set EXACTLY `["free","premium"]`, no `kind`, no `Bearer`, no base URL (pass 2: 500) | 200, `["free","premium"]` |
| S3 | **NEW** — operator-only members smuggled into the **register row** never reach the wire | 200, `["free","premium"]`; no fake key, no `authorization_header`, `provider_targets`, `register_version`, `source_key_path`, `.local` |
| S3b | **NEW** — same, one layer down, straight through the reader | `OK` with exactly the two lists |
| S4 | **NEW, measurement only** — is the discriminator checked at all? | a row with `kind:"RUN_DEATH_POLICY"` is served as a roster: reader `OK`, route 200 → finding **N11** |
| S5 | **NEW** — seven degenerate row values stay fail-closed and leak nothing | all 7: 500, envelope keys exactly `["correlation_id","error"]`, no leak |
| S6 | trim survives the projection (a fact, not a finding) | `["  spaced  "]` → `["spaced"]`, 200 |
| S7 | anonymous and retired-dev-header refusals still stand | both 401 `{"error":"SESSION_REQUIRED"}` |

**`REV-S03-p3-security-zodnarrow.test.ts` — PROBE S8, what a parse failure can carry into the merge's
`captureHandled` sink.** The merge added `captureHandled(error, …)` to the API error handler
(`apps/api/src/index.ts:531`) and the default emitter enqueues the error object itself
(`packages/obs-capture/src/emit.ts:103-112`, `payload_ref: error`). S8 compares the pre-F1 whole-row
parse with the post-F1 projected parse:

```
S8_WHOLE_ROW_SUCCESS=false
S8_WHOLE_ROW_ERROR=[{"code":"unrecognized_keys","keys":["kind","authorization_header","provider_targets"],…}]
S8_PROJECTED_SUCCESS=true
S8_WHOLE_ROW_ERROR_CARRIES_KEY_NAMES=true
S8_WHOLE_ROW_ERROR_CARRIES_KEY_VALUE=false
```

So F1's projection **narrows** what a `/v1/plan-tiers` failure can put into the capture store: from
"every unrecognised key NAME of the register row" to "nothing at all on the happy path". Key VALUES
were never carried either way.

## The carried pass-2 probes, re-run here

- `probe-p4.log` — the pass-2 P4/P1/P2/P3/E file, **unchanged**, re-run by me at `3f488b3f`:
  `Test Files 1 passed (1)` · `Tests 11 passed (11)`, rc=0. `P4_EXTRA_MEMBERS=500` with envelope keys
  exactly `["correlation_id","error"]` — the handler's strict re-parse still refuses a widened
  APPLICATION result, so defence-in-depth survived F1. `P2_GROK_ARGV` still shows all eight hostile
  values reaching argv (`refusedBeforeArgv: false` ×8) — finding N8, still open.
- `probe-r3.log` also contains the pass-2 **rowshape probe unchanged**: its cases 2 and 3 are RED here
  **by construction — they assert the pass-2 defect (`THROW`, `500`) and F1 fixed it.** That RED is
  the fix landing, not a regression. R3's S1/S2 are those two cases re-derived to the promise.

## Evidence beside the probes (logs, not probes)

- `c3.log` — the C3 nine-suite command re-run by me at `3f488b3f`, argv on line 1: rc=1 ·
  `Test Files 1 failed | 8 passed (9)` · `Tests 2 failed | 89 passed (91)` · 144.32 s. Identical
  counts to my own pass-2 run at `d35a9634`. The package does not cover C3 at this head; this is the
  only C3 record at `3f488b3f`.
- `int.log` — the §5 integrated 17-file run at `3f488b3f`, argv on line 1: rc=1 ·
  `Test Files 1 failed | 16 passed (17)` · `Tests 2 failed | 186 passed (188)` · 141.69 s,
  reproducing all three of the orchestrator's runs exactly. `Test Files` is 17, so vitest dropped no
  path.

Both failures in both runs are the inherited `tests/architecture/register-support-publication.test.ts`
titles dated 2026-09-12 (COMMON §6), not this slice's.
