# DECISIONS — S01 · mission `free-public-debates`

Append-only. One row per decision. A question answered here is re-asked to nobody. Checked before any
question goes to V. V's intake rulings I-1…I-4 and rows V-1…V-4 are not re-decided here; they are
cited.

## 1. Decisions taken

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | One slice or several | ONE vertical slice, S01 | The three parts are not separately exercisable: the delete requirement exists only because unpublish is refused (intake C3), and the refusal is only reachable on a run the server published itself. V's walk is one continuous walk. | REQ-01 (intake default; charge 1) |
| 2026-09-20 | How "Free runs started after this ships" (I-2) is decided by a test | From the run's own persisted state, read once per run row (SPEC R-1) | A clock comparison has no value to compare against inside a test, moves under a redeploy, and answers differently in CI than in the lane. | REQ-01 |
| 2026-09-20 | Does `plan_tier IS NULL` bind | No — never bound (SPEC R-2) | ADR-0024 decision 1 keeps the column nullable and forbids a backfill; `migrations/0061_plan_tier_on_run.sql:1-5`. NULL is not `free`, and I-2 already says existing rows are left alone. | REQ-01, citing ADR-0024 |
| 2026-09-20 | Status code for the refused unpublish | 409 (SPEC R-12) | It is the status this API already returns for its one other visibility conflict, `409 DEBATE_MUST_BE_PRIVATE`, `apps/api/src/index.ts:787-789`. A second shape for the same class of answer costs a reader one more branch. | REQ-01 |
| 2026-09-20 | Typed error string for that refusal | `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` (SPEC R-12) | Names the tier and the refused verb, so a test asserts one literal and a log is greppable. Pinned by the SPEC so two seats cannot pick two strings. | REQ-01 |
| 2026-09-20 | Where the tier refusal sits relative to the grant preflight | After ownership and a live grant are proven (SPEC R-13) | Refusing earlier turns the unpublish route into a tier-and-existence oracle: any signed-in user could probe an arbitrary run id and read a typed Free refusal instead of today's uniform 404. The cost is one extra acceptance step for V (mint the grant first), paid once. | REQ-01 |
| 2026-09-20 | Is the step-up grant consumed by a refused unpublish | Not consumed (SPEC R-14) | Otherwise the second identical call answers 404 and the refusal becomes unreproducible — two seats would build the two behaviours. Pinned so the acceptance step 8 has one correct outcome. | REQ-01 |
| 2026-09-20 | How "never served as private by choice" (row V-2) is checked | The owner's visibility read distinguishes outstanding from never-published, without changing the meaning of the two existing `state` values (SPEC R-11) | A new value inside the existing `state` field is a wire change an older reader parses; the back-compat class that already bit this repo once (`docs/missions/public-debate-access/INTAKE.md:71-75`) is the same class. | REQ-01 |
| 2026-09-20 | Does the slice add a contract route | No (SPEC R-23) | V ruled backend-only with no UI (I-4); a new route also moves the already-RED `s7-authorization` count and would hide a real regression inside a moved baseline. Escape hatch is a V row, not a seat's judgement. | REQ-01, citing intake C6 and the baseline table |
| 2026-09-20 | How `s7-authorization` is asserted | DELTA on the named test, with the SAME expected/actual pair as base (expects 50, finds 52) | The suite counts policy rows per route and is RED at base; asserting the suite green would be asserting something this slice must not cause. Asserting only "still RED" would let a new mismatch hide. | REQ-01 (packet charge 4) |
| 2026-09-20 | Whether a BLOCKED Free answer is retried | No — outstanding work for it reaches 0 and stays 0 (SPEC R-8) | Row V-1's default says it is not published; an outstanding record that never clears is a retry loop that burns work forever and makes R-21's audit count meaningless. | REQ-01, extending row V-1's default to its mechanical consequence |
| 2026-09-20 | What the audit trail must show for a system publish | The four observables of SPEC R-20 | Charge 6: REQ states what is observable, ARCH picks the mechanism. The fourth observable (no phantom session id or grant hash) is the one a convenient design breaks: reusing the owner's last session id would make the row parse as a user action that never happened. | REQ-01 |
| 2026-09-20 | Acceptance in one display mode or two | Once (SPEC §4 preamble) | `ui: no`: the slice adds no screen, element or token, so there is nothing whose rendering differs by mode. Packet §2 sets the rule. | REQ-01, citing intake `ui: no` |

## 2. Alternatives rejected (the brainstorming record; `superpowers:brainstorming` has no human in a fleet seat, so the rejections are written here instead of waiting for a yes)

| alternative | why not |
|---|---|
| Split S01 into three slices (auto-publish · unpublish refusal · delete-while-public) | The refusal and the delete are unreachable until auto-publish exists, so two of the three would ship with acceptance steps V cannot run. Charge 1's default holds and I do not dissent from it. |
| Decide the I-2 boundary by comparing the run's `as_of`/creation time to a deploy timestamp | There is no deploy timestamp inside a test; CI, the lane and the served stack would each answer differently, and a redeploy would move which runs are bound. |
| Decide it from a migrations bookkeeping table | Couples product behaviour to migration bookkeeping; a squashed or replayed migration silently moves the boundary, and the answer is not readable from the run row the requirement is about. |
| Backfill existing Free runs to public | Directly refused by V at I-2 ("leave them alone"), and ADR-0024's rejected alternatives already name a backfill as a fabricated record. |
| Refuse unpublish with 403, or with today's uniform 404 | 403 invents a second conflict shape; 404 makes the refusal indistinguishable from "no such run", so V's acceptance step 7 would have no observable outcome and the UI could never tell a user why. |
| Refuse unpublish before the grant preflight so V needs no step-up | Cheaper for the walk, and it leaks tier and existence for any run id to any signed-in caller. Rejected on the security cost. |
| Let a Free debate be deleted by anyone with a grant, dropping the owner check | I-3 is explicit: only the creator. The route is already `resource: "run-owner"` (`apps/api/src/index.ts:132`); the requirement makes it checkable rather than changing it. |
| Extend delete-while-public to every tier, not only Free | Contested — routed as the V-ROW below, with the narrow default frozen in the SPEC. |
| Add a REQUIRED key to `PublicDebateSchema` to mark a system publish | Turns every snapshot published before this slice into a 404 through `catch { return null }` (`apps/api/src/publications.ts:301-321`). The marker belongs in the audit trail (R-20), which no public reader parses. |
| Add an admin route to trigger the retry reconciler | A new contract route moves the RED `s7-authorization` count (R-23) and adds surface V did not ask for. The retry is internal; R-10 checks it through its effect, not through a route. |
| Fail the run when the auto-publish fails | Refused by row V-2's default, and it would make a Free debate less reliable than a Premium one for a reason the asker has no part in. |
| Define done for this slice through a mock and a `DONE.md` | `ui: no`: no surface is added, so there is nothing for a mock to draw. The oracle is §4 of the SPEC, run by V. |

## 3. Rows for V

```
V-ROW: NEW · S01 · t_2e15bf90 · Delete-while-public: Free only, or every tier?
Intake C3 makes the creator able to delete a Free debate while it is public, because a Free debate can
never be made private again. A Premium owner keeps today's path: unpublish first, then delete, and a
published Premium debate still answers 409 DEBATE_MUST_BE_PRIVATE (SPEC R-19). That leaves two
different delete rules on one route, decided by the run's tier.
Recommended default: Free only. The SPEC is frozen on it (R-16, R-19).
Smallest yes/no for V: "Keep 'delete a published debate' for Free debates only, and leave Premium
owners unpublishing first?"
VERDICT: Free only / CONFIDENCE: medium / STRONGEST COUNTER: two delete rules on one route is a rule a
support agent will explain wrongly, and widening it to every tier would delete one branch instead of
adding one — but widening also changes Premium behaviour, which V ruled unchanged at I-1, so it cannot
be taken without V.
```

## 4. Contradictions found by REQ-01

None left open. C1–C3 were resolved by V at intake; C4–C7 bind as their row defaults and are written
as SPEC requirements R-8, R-9/R-11, R-24/R-12 and R-6/R-7. One new contested product question was
found and is the V-ROW in §3; the SPEC is frozen on its recommended default, as the law requires.
