# REQ-FIX rework round 1 — case file

Status: **DONE_WITH_CONCERNS** — every filesystem-addressable author finding is closed; the historical N1 board-comment mirror and packet findings P1–P4 remain controller actions.

Scope: author-level findings B1 and N1–N8 from `docs/missions/observability-agents/reviews/REQ-REV-FIX.md`. The reviewer verdict is read-only. No product code, schema, config, test, git, or board state is changed by this rework seat.

## Reproduction record (before edits)

| Finding | Reproduced defect | Pre-edit evidence |
|---|---|---|
| B1 | Four frozen documents specified incompatible incident orders. | `FIX-09-R04` put `APPROVED` before `TICKETED` and omitted `PR_PRESENTED`; FIX-11 put `TICKETED` immediately after the trace; FIX-12 began proposal work from `TICKETED`; FIX-13 required `APPROVED -> FIXING -> PR_PRESENTED`. |
| N1 | The required author handoff was absent. | `fixagent.md` ended after U-F10 and had no `## Handoff`; the verdict recorded three ticket comments and no post-CLAIM REQ-FIX comment. |
| N2 | The runtime-export citation was off by one line. | `git show 4f764037:./packages/obs-capture/package.json | nl -ba` showed `./install/*` at line 11 and `./runtime` at line 12. |
| N3 | Six slice acceptance sections depended on unstated values, placeholders, or future ARCH text. | FIX-02 step 6 had no baseline numbers; FIX-03 step 2 and FIX-05 step 1 gave no concrete provider-fault command; FIX-04 steps 5–6 required a missing recording and `<base>/<tip>`; FIX-06 step 2 deferred the action to PLAN; FIX-07 step 4 pointed to an OPEN decision. |
| N4 | FIX-15 steps 4–5 were not pasteable SQL. | Step 4 used `fingerprint = ...`; step 5 projected only `t` and then referenced nonexistent `source`, with `AND` binding before `OR`. |
| N5 | The verdict summary overstated the current 500 response. | `git show 4f764037:./apps/api/src/index.ts` showed `{ error: errorCode, message: statusCode >= 500 ? errorCode : knownError.message }`: internal prose is not echoed, but the `message` key remains. |
| N6 | The requirements header repeated the packet snapshot instead of the author’s measured HEAD. | Header said `8d38185c` and `+111`; the review records the author’s dispatch-time measurement as `4f764037`. |
| N7 | FIX-14 acceptance invoked an unexplained command rather than the frozen re-pin mechanism. | R01 permitted only a bundle re-pin; step 3 invoked `obsctl quick-arm on` without defining it as that re-pin’s interface. |
| N8 | FIX-14 treated a real `build_ref` as already satisfied. | R02(g) said tree tracking made the condition true, while Q1 OBS-R033 said installers still seed `UNTRACKED-DEV` and real runtime identity remained architecture work. |

## Close-out table

| Finding | Author-artifact disposition | Close-out evidence |
|---|---|---|
| B1 | CLOSED | `FIX-09-R04` now gives the ticket-at-trace canonical order. FIX-12 maps denial to `PARKED` and invalid proposals back to `TICKETED`; FIX-13 records `PR_PRESENTED` as an action while the incident stays `FIXING`. Every incident state used is admitted by `migrations/0034_obs_foundation.sql:128-131`; no migration was invented. |
| N1 | FILE CLOSED / BOARD MIRROR OUTSTANDING | `fixagent.md:311` now has `## Handoff`, opens with the loaded skills, supplies `READY FOR PEER REVIEW`, all 16 trace counts (153/153), the contradiction result, packet defects, and `comments read through: 3`. This filesystem-only delegated seat did not fabricate the missing historical board comment; controller must mirror it if still required. |
| N2 | CLOSED | FIX-01 SPEC and PLAN both cite `packages/obs-capture/package.json:12`; direct `nl -ba` inspection shows `./runtime` on line 12. |
| N3 | CLOSED | FIX-02 expects `pnpm typecheck` exit 0; FIX-03/FIX-05 name closed-loopback integration scenario commands; FIX-04/FIX-06 replace handoff/SHA placeholders with exact checks; FIX-06 names a devtools fault command; FIX-07 fixes the marker path in an appended decision and gives exact set/clear commands plus executable SQL. A scan of the cited acceptance sections found 0 stale placeholder phrases. |
| N4 | CLOSED | FIX-15 step 4 now selects the latest Hatchet occurrence in both link and incident queries; step 5 qualifies `o.source`, groups the OR predicate, and checks both occurrence surfaces. All three repaired read-only SQL statements executed against local dev Postgres without a parse/name error (outputs `0`, blank/no matching incident, `0`). |
| N5 | CLOSED | Verdict summary now says the 500 body substitutes the fixed code for internal prose but retains `message`; OBS-R053 remains partial until FIX-04 removes the key and adds `correlation_id`. |
| N6 | CLOSED | Header records the dispatch-time authoring snapshot `dev @ 4f764037` and explicitly declines to repeat the packet's older SHA/dirty count as measurement. |
| N7 | CLOSED | FIX-14-R01 defines `obsctl quick-arm <on|off>` solely as the authenticated canonical-bundle re-pin wrapper and denies any mutable-flag path; acceptance step 3 now invokes that specified mechanism. |
| N8 | CLOSED | FIX-14-R02(g) requires verified commit-bearing runtime refs that are not `UNTRACKED-DEV` and says ROW-GIT alone does not satisfy the gate. |

## Packet/orchestrator defects left for the controller

P1–P4 in the verdict concern conflicting roster law, stale reviewer routing, incomplete mandatory read scope, and an incomplete predecessor ticket map. They are not author-artifact defects and are outside this rework’s allowed document set. N1’s missing historical board comment cannot be reconstructed by a filesystem edit; the controller must mirror the restored handoff if the board record is still required.

## Cost and near-miss notes

- The frozen state machine was copied into multiple slices without one normative transition list. That duplication made a D9 sequence change land in FIX-11/Q1 but not FIX-09.
- Placeholder-heavy acceptance prose moved necessary architecture decisions into an empty-by-law PLAN scaffold. The repair keeps PLAN empty and makes the SPEC executable itself.
- The highest-risk near miss was “fixing” N8 by merely deleting the parenthetical. The requirement must say that `UNTRACKED-DEV` fails the gate; otherwise the false completion claim remains implicit.

## Exact verification evidence

- `git diff --check -- <15 edited requirement/slice files>`: exit 0, no output.
- `git diff -- docs/missions/observability-agents/reviews/REQ-REV-FIX.md | wc -c`: `0`.
- Targeted stale-phrase scan over `fixagent.md` and the cited FIX slice documents: `0` matches after the FIX-06 step-7 correction.
- Acceptance-only scan for `ARCH`, handoff/baseline dependencies, `<base>/<tip>`, OPEN-command prose, the invalid FIX-15 ellipsis, and the unqualified Hatchet predicate: FIX-02 `0`, FIX-03 `0`, FIX-04 `0`, FIX-05 `0`, FIX-06 `0`, FIX-07 `0`, FIX-15 `0`.
- Banned-word scan over every requirements block and every SPEC acceptance block for `improve|better|robust|handle|appropriate`: `0`.
- SPEC requirement ids versus PLAN scaffold rows: FIX-01 `15/15`; FIX-02 `8/8`; FIX-03 `12/12`; FIX-04 `10/10`; FIX-05 `7/7`; FIX-06 `8/8`; FIX-07 `7/7`; FIX-08 `11/11`; FIX-09 `13/13`; FIX-10 `8/8`; FIX-11 `10/10`; FIX-12 `11/11`; FIX-13 `11/11`; FIX-14 `8/8`; FIX-15 `7/7`; FIX-16 `7/7`; total `153/153`.
- FIX-15 read-only SQL execution against `debateai-v3-postgres-1`: link count `0`; source-set query returned no row because no Hatchet occurrence exists; text-leak count `0`. All statements parsed and executed.
- FIX-07 status SQL execution against `debateai-v3-postgres-1`: exactly `api|OFF`, `runner|OFF`, `scheduler|OFF`.

## Changed files

- `docs/missions/observability-agents/requirements/fixagent.md`
- `docs/missions/observability-agents/slices/FIX-01/{SPEC.md,PLAN.md}`
- `docs/missions/observability-agents/slices/FIX-02/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-03/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-04/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-05/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-06/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-07/{SPEC.md,DECISIONS.md}`
- `docs/missions/observability-agents/slices/FIX-09/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-12/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-13/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-14/SPEC.md`
- `docs/missions/observability-agents/slices/FIX-15/SPEC.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-FIX-REWORK-R1.md`

## Round 2 PASS follow-up — r2-N1

Grok round 2 passed the rework and identified one non-blocking stale gap row:
`requirements/fixagent.md` U-F5 still asked ARCH to name a real `apps/ui` fault site even
though FIX-06 acceptance step 2 had been repaired to a deterministic browser-console
`setTimeout` throw. The row now records that deterministic drill as RESOLVED and removes
the obsolete ARCH site-selection duty. No SPEC, incident-state, or product-code clause was
changed. Focused checks: the stale phrase `ARCH names the site` has zero hits; FIX-06-R02
still has one matching PLAN row; `git diff --check` passes.
