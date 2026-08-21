# Review packet — ENV-01 (dual diamond, DR-153)

**Board:** `debateai-v3` · **Ticket:** `t_40b756e7` (`review`) · READ-ONLY.
Both lenses must greenlight.

## What this ticket is

Execute V's DR-159 ratification: seed the run-cost envelope V ruled after the
dual-greenlit DEPTH-01 proposal — B3-B (depth counts expansion rounds), B2-A
(fixed two-segment serve), B1-B (retry-tolerant 3× ceilings):

| depth | max_model_attempts |
|---:|---:|
| 1 | 42 |
| 2 | 66 |
| 3 | 114 |
| 4 | 210 |
| 5 | 402 |

For BOTH `standard` and `high-stakes`; `casual` must NOT be seeded (engine
escalates below-floor askers, so casual members are unreachable). Same pass:
unpin the one-member tuple in `acceptance/runtime-policy.ts` (it refuses to
boot on a second member), update the byte-faithful seed test with a CLOSURE
assertion, update the third pin of the old 9 at
`tests/support/v2uiFixtures.ts:119`, back up `.pgdata` under the ignored
pattern before reseeding, and close-or-loudly-record two ratification risks:
A-1 (the two-segment cap does not exist in code — `apps/runner/src/index.ts:67-74`
has `.min(1)` and no ceiling) and A-2 (the 3× attempt bound comes from env vars
the envelope match key cannot see).

## Orchestrator's independent verification — do not re-run gates

root `tsc` clean · v2-ui `tsc` clean · root vitest **62 files / 434 tests** ·
acceptance vitest **9 files / 35 tests** · architecture 27 rows / 0 violations ·
source 0 blocking. Three timestamped `.pgdata` backups exist under the ignored
pattern (…0919Z, …0919Z-pre-reseed, …0928Z-pre-final-live).

**Do not treat the standing API on :8790 as evidence** — that process predates
POL-01 and ENV-01 and read the old one-member policy at boot, so it still 500s
a depth-3 ask. The worker's live proof (202/QUEUED for runs `770e7f52…` and
`db2d02bb…`, resolved basis `max_model_attempts: 114`) ran against its own
composition on the fresh DB. The orchestrator restarts the standing ceremony
after this diamond.

## What to judge

1. **Byte-fidelity to DR-159.** Ten members exactly — depths 1..5 × two tiers,
   the five ratified integers, no casual row, provenance
   `acceptance:DR-159:V-approved`. Any deviation from V's numbers is BLOCKING
   (AC-76: these are V's values, not the worker's).
2. **The closure assertion.** Does the seed test FAIL on a partial seed (a
   missing depth, a missing tier, an extra casual row)? Or does it only pin
   today's happy shape?
3. **The unpin.** Is `runtime-policy.ts` now shape-validating without
   hardcoding the member COUNT or the specific integers? A new pin of 42/402
   would recreate the old trap one ruling later.
4. **A-1 disposition — the two-segment cap.** The ratified numbers ASSUME ≤2
   composed segments. Did the worker enforce the cap, or make violation a
   typed loud failure naming the assumption, or merely record it? Merely
   recording it was explicitly NOT permitted ("do not leave a ratified number
   silently dependent on an unenforced assumption"). Where does the failure
   fire, and does a test prove it?
5. **A-2 disposition — env-var attempt bounds.** Recorded at minimum, fix
   proposed?
6. **The live proof.** Is the pasted 202 + resolved-basis evidence internally
   consistent (fresh DB, new register version, depth-3 standard, basis 114)?
   The worker must NOT claim the run expanded into a deeper tree — depth is
   inert until PRO-01 (DR-157). Any such claim is a blocking honesty finding.
7. **The mission's named defect class** — would these tests fail if the seed
   regressed (wrong integer, dropped tier, casual added)? Source-text-only
   pins that survive behaviour drift are findings.

## Verdict

`APPROVED` or `CHANGES REQUESTED`; BLOCKING → ADVISORY with file:line and the
concrete failing case. "Nothing blocking" is legitimate.

Write to `reviews/env01-<yourname>-rev1.md` and print to stdout.
