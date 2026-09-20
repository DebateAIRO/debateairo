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

---

# APPENDED 2026-09-20 by REQ-FIX-02 (pass 2, after REQ-REV pass 1 REWORK)

Sections 1–4 above are REQ-01's and are not rewritten. This section is appended.

## 5. Re-pointing — every SPEC reference above now means `SPEC-v2.md`

`SPEC-v2.md` is the SPEC of record; `SPEC.md` stays byte-identical as the superseded first version.
Requirement numbers R-1…R-25 are unchanged, so every `R-n` cited in §1–§4 still names the same
requirement. Two references above are section pointers, not line pointers, and resolve against the
new file: §1's "Acceptance in one display mode or two | Once (SPEC §4 preamble)" → `SPEC-v2.md` §4.0;
§4's "SPEC requirements R-8, R-9/R-11, R-24/R-12 and R-6/R-7" → the same numbers in `SPEC-v2.md`.
Row V-5 in §3 was transcribed by the orchestrator into `V-DECISIONS-PACKET.md:11`; its default is
unchanged and still binds.

## 6. Decisions taken at pass 2

| date | question | choice | reason | ruled by |
|---|---|---|---|---|
| 2026-09-20 | B1 — R-8 (BLOCKED: nothing outstanding) and R-9 (never PRIVATE with nothing outstanding) cannot both hold | R-9, R-5 and R-7 are scoped to a **publishable bound run** (`terminal` other than `BLOCKED`); R-8 states that R-9 does not reach it | R-4 already carried that carve-out and R-9 did not. Scoping the general requirement is one sentence; narrowing R-8 would contradict row V-1, which V has not ruled on. | REQ-FIX-02 |
| 2026-09-20 | B2 — which wire carries "outstanding, not private by choice" | One optional key, `publish_pending: true`, on `PublicationTransitionSchema`, absent unless outstanding | V-2's words are about what the owner is *served*, so a test-only row would not discharge them. An optional key absent on every other run leaves every existing response byte-identical, which a new `state` value could not. The residual deploy-skew risk is written into R-11.4 rather than hidden. | REQ-FIX-02 |
| 2026-09-20 | N4 — R-21 also required an audit row for a refused unpublish | Dropped from the requirements; the failed-auto-publish half stays and is pinned to the audit path the denial branch already uses | The reviewer is right that it sits beyond I-1…I-4 and beyond this node's charge, which asked what a *system publish* records. Kept as residue in §8 so it is not lost. | REQ-FIX-02, accepting the finding |
| 2026-09-20 | B3 — V's walk returned 400 instead of the statuses it named | §4 rewritten with the exact `.strict()` bodies, the 202/`run_ref` pin, `DELETE_PRIVATE_DEBATE`, the step-up body, and `step_up_grant.token` | Six members of one class, all measured at `3f374361`. A walk whose first mutating call is a 400 tests nothing. | REQ-FIX-02 |
| 2026-09-20 | Where the pass-2 checker lives | `slices/S01/spec-v2-check.sh` | This seat's allowed list is exhaustive and does not include `.hermes/reports/.../probes/`, where the convention would put it. The slice directory is allowed and the file is genuinely handed forward — the next REV pass runs it. Named as a packet defect in the handoff. | REQ-FIX-02 |

## 7. Alternatives rejected at pass 2

| alternative | why not |
|---|---|
| Close B1 by narrowing R-8 instead of R-9 (let a BLOCKED run hold an outstanding record that never clears) | Row V-1's default is that a BLOCKED Free answer is not published; an outstanding record that never clears is a retry loop with no terminal state, and it would make R-21's audit count unbounded. |
| Close B2 by moving the distinction to a test-only row (the reviewer's second option) | No wire change and no deploy skew, and it is the cheaper build — but the owner's own read would still answer plain `PRIVATE`, which is the thing intake C5 names. Recorded as the V-ROW in §9 so V can take the cheaper build if the skew worries him more than the wording. |
| Close B2 with a third `state` value | `SPEC.md` R-11 already forbade it and `SPEC-v2.md` R-11.1 keeps the ban: an older reader parses two values and meets a third. Same class as the back-compat trap in R-22. |
| Close B3 by telling V to use the shipped contract client instead of typing bodies | The client already sends the acknowledgement flags (`packages/contract/src/client.ts:463-475`), so the walk would pass without proving the server refuses — and V's acceptance is meant to be a stranger's walk, not a call through code this mission may change. |
| Renumber requirements in `SPEC-v2.md` | Would invalidate `PLAN.md` §3's 25 trace rows and every `R-n` cited in §1–§4 above, for no gain. |
| Fix the packet defects P-A…P-F myself | They are N8, the orchestrator's, ticket `t_5b665910`. Named, not fixed. |

## 8. Residue — filed, not built in S01

- A refused unpublish (R-12) leaves no audit row of its own. Ticket at TEST(S01), beside the UI
  follow-up row V-3 already defers.
- `docs/missions/public-debate-access/INTAKE.md:57-75` carries drifted line numbers for
  `readPublicDebate` (it says `publications.ts:301`; that is `async unpublish` today). Another
  mission's document, outside this seat's contract — named here so the next seat does not copy it.

## 9. Rows for V

```
V-ROW: NEW · S01 · t_2e15bf90 · Where the "publish is still pending" signal lives
A Free run whose auto-publish has not landed yet must not look private-by-choice (intake C5, row V-2).
SPEC-v2 R-11 puts that signal on the owner's own read as one optional key, publish_pending, on
GET /v1/runs/{id}/visibility. The cheaper alternative is to keep the signal internal — only a database
row a test reads — leaving the owner's read saying plain PRIVATE until the publish lands.
Recommended default: the optional key. The SPEC is frozen on it (R-11).
Smallest yes/no for V: "Should the owner's own screen be able to tell 'publishing' from 'private'?"
VERDICT: the optional key / CONFIDENCE: medium / STRONGEST COUNTER: it changes a .strict() wire schema
that a UI built from an older bundle parses, so during a staggered deploy one outstanding run reads as
an unavailable publication status; the internal-only build has no wire risk at all and still satisfies
row V-2's literal text, which speaks about retrying rather than about what the owner sees.
```


## 10. Orchestrator folds — REQ-REV pass 2 (PASS; N1-p2 … N3-p2), 2026-09-20

Appended by the orchestrator (planning reviews are one pass by default: N-findings are folded here, not reworked). SPEC-v2.md is frozen and is not edited; where a pointer inside it is stale, THIS section is the correction every later seat reads.

- **N1-p2** — `INSTRUCTIONS.md:12,44` and `SPEC-v2.md:8` say rows V-1…V-5; row V-6 was transcribed after REQ-FIX's READY. **The binding set is V-1…V-6** (`V-DECISIONS-PACKET.md`), each default binding until V rules.
- **N2-p2** — `SPEC-v2.md:104-105` (R-11.4) points at DECISIONS §3 (that is V-5); the row R-11 depends on is **§9 = V-6**. `SPEC-v2.md:175` (R-21 residue) points at §4; the residue list is **§8**.
- **N3-p2** — `spec-v2-check.sh` does not forbid a new requirement id (a mutant adding `R-26` passes). The requirement set of S01 is **exactly R-1…R-25**; the check every later pass uses is the unique-R-id count (`grep -oE '\*\*R-[0-9]+' SPEC-v2.md | sort -u | wc -l` = 25), not the script alone.
