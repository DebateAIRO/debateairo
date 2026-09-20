# REQ-REV pass 1 — mission `free-public-debates`

- seat: REQ-REV-01 · node: REQ-REV · pass: **1 of 3** · ticket: `t_cee53fe7`
- work under review: REQ-01 artifacts frozen at `06e4eceb` (INSTRUCTIONS.md, `slices/S01/{SPEC,PLAN,DECISIONS,PROGRESS}.md`)
- verdict: **REWORK**
- probes: `.hermes/reports/free-public-debates/probes/REQ-REV-01/` (`probe.sh` + `probe.out`, 2026-09-20T17:26:59Z)

The unit is the frozen SPEC and the packet that produced it. No product file was edited.

## 1. What was verified, and how

| claim | how | result |
|---|---|---|
| INSTRUCTIONS.md ≤ 100 | `wc -l` → **89** | holds |
| `ui: no`, one slice S01, no `DONE.md` | first line under SPEC title is `ui: no`; `slices/S01/` has SPEC/PLAN/DECISIONS/PROGRESS only | holds |
| R-1…R-25 present, PLAN trace skeleton 25 rows | grep of `**R-N**` in SPEC; PLAN.md §3 | holds |
| banned words in SPEC/PLAN/DECISIONS | `grep -nio -E 'improve\|better\|robust\|handle\|appropriate'` → empty | holds |
| INSTRUCTIONS banned-word hits | 5, all on line 88 (the ban list itself) | holds |
| SPEC §3 vs intake baseline table | every suite named in §3 matches the intake RED/GREEN row; no suite asserted GREEN that is RED at base | holds |
| route table count 52 (R-23) | `awk 'NR>=100 && NR<=166' apps/api/src/index.ts \| grep -c '{ route: "'` → **52** (probe P5) | holds |
| freeze `38a44dc3..06e4eceb` is the REQ write | `git diff --stat` from packet cwd → 6 files, 498 insertions, no product files | holds |
| REQ-01 SKILLS LOADED | orchestrator CONSUMED on `t_5b60146e`: verified 4/4 (`using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`, `brainstorming`) | holds; no fabrication |
| I-1…I-4 not re-opened | SPEC cites them; DECISIONS.md §1 does not re-decide them; V-5 is the one new row (delete-while-public Free-only) | holds |
| stack not served | intake "No-touch listeners"; packet charge 6 | no listener probed |

Cluster commands: PLAN.md §1 is the required empty scaffold. None to run at base.

## 2. The REQ packet — defects REQ-01 reported, and ones it did not

REQ-01 READY on `t_5b60146e` named four packet defects. Rechecked:

1. `REQ-01.md:10` `docs/architecture/02-data-model.md:1237-1268` is §7.6 `answer` (verdict, `band_ceiling`, serve-time projection). It constrains no requirement in this slice. **Confirmed.** Dead-end read.
2. `REQ-01.md:10` "the product files the intake cites, at the lines it cites" are point citations, not spans. **Confirmed.**
3. COMMON §2 CLAIM transcript path for an Agent-tool seat. **Confirmed at the time they wrote it**; COMMON now tells Agent-tool seats to write `transcript: recorded by the orchestrator` (freeze message: "COMMON transcript line replaced").
4. `REQ-01.md:32` charge 5 sketches "see unpublish refused" with no grant step. **Confirmed.** SPEC §4 steps 7–8 try to repair it and still miss the request body (B3).

Defects they did **not** report:

- **P-A** `REQ-01.md:16` (verification) requires "every acceptance step a numbered human-runnable **browser** step", including for `ui: no` ("once otherwise"). Charge 5 and intake I-4 require an API walk against a served lane with no new UI. Internal contradiction. REQ followed charge 5.
- **P-B** `REQ-01.md:10` names `docs/missions/public-debate-access/INTAKE.md:53-75`. That extract still says `readPublicDebate` lives at `publications.ts:301`. Today `:301` is `async unpublish` (probe P1). REQ copied the drifted cite into SPEC R-22 (N2).
- **P-C** Neither the packet nor charge 5 names the `.strict()` request bodies a stranger must send (`AskRequestSchema`, `warning_acknowledged`, `copies_may_persist_acknowledged`, `DELETE_PRIVATE_DEBATE`). The walk as written cannot hit the statuses it predicts (B3).

This seat's own packet (REQ-REV-01) defects, found while checking quoted constants:

- **P-D** Charge 3 labels `apps/api/src/index.ts:1100-1208` as "(visibility, publish, unpublish)". `:1100` is `GET /v1/runs/{id}/answer`. Visibility is `:1080-1094` (probe P5).
- **P-E** Charge 3 labels `:125-174` as the route policy table. The table begins at `:114` (52 entries, `:114-165`).
- **P-F** Charge 3 `publications.ts:140-339` does not include `readPublicDebate` at `:382-407`, which is the function R-22's back-compat claim is about.

## 3. R-1…R-25 against I-1…I-4 (closed) and rows V-1…V-5

V's intake rulings were not re-opened. Mapping:

| reqs | follows from |
|---|---|
| R-1, R-2, R-3 | I-2 (leave existing private Free runs alone; bound from the run row, NULL is not `free`) |
| R-4, R-5, R-12 | I-1 (auto-publish + no unpublish) |
| R-6, R-7 | V-4 / C7 |
| R-8 | V-1 / C4 — **and it contradicts R-9 (B1)** |
| R-9, R-10, R-11 | V-2 / C5 — **R-11 does not pin the wire field (B2)** |
| R-13, R-14 | not asked by V; they pin the refusal so it is not an existence oracle and so step 8 is reproducible. In scope as constraints on I-1's refusal. |
| R-15, R-19, R-25 | I-1 Premium unchanged |
| R-16, R-17, R-18 | I-3 + C3; V-5 default Free-only |
| R-20 | REQ packet charge 6 (observables, not mechanism) |
| R-21 | failure half follows V-2; refusal half is extra (N4) |
| R-22 | back-compat trap, not I-1…I-4, but intake-measured and binding |
| R-23, R-24 | I-4 / V-3 |

No requirement invents a UI, a backfill, or a Premium behaviour change. The V-ROW in DECISIONS.md §3 (now V-5) is the one contested product question; the SPEC is frozen on its default. That is lawful.

One slice is vertical: the refusal and the delete-while-public are unreachable until auto-publish exists. Charge 1's default holds.

## 4. "Unchanged" status codes and error strings vs the product today

Checked against the spans (and the adjacent visibility handler the packet mis-labelled).

| SPEC claim | today | match |
|---|---|---|
| R-12 409 as the existing visibility-conflict status (`index.ts:787-789` `DEBATE_MUST_BE_PRIVATE`) | 409 `DEBATE_MUST_BE_PRIVATE` on published delete | the *status* 409 is used today; the *string* `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` is new (the feature) |
| R-13 failed preflight → 404 `RUN_NOT_FOUND` (`:1161-1172`) | same | match |
| R-15 unpublish Premium → 200 `{state:PRIVATE, public_ref:null}` (`:1185-1187`) | `reply.send(PublicationTransitionSchema.parse(unpublished))` default 200 | match |
| R-16 delete success 200 or 202 PENDING (`:793-795`) | same | match |
| R-17 public read 404 `DEBATE_NOT_FOUND` (`:827-829`) | same | match |
| R-18 second user 404 `NOT_FOUND` (`:786`) | same | match |
| R-18 anonymous "the refusal `auth: user` already produces" (`:132`) | preHandler `:515` returns **401 `SESSION_REQUIRED`** before the handler; `:132` is only the policy row | **does not name the code (N1)** |
| R-19 published Premium delete 409 `DEBATE_MUST_BE_PRIVATE` | same | match |
| R-25 publish 201 (`:1143-1145`) | same | match |
| GET answer first 200 (`:1100-1101`) | 200 or 404 `ANSWER_NOT_SERVED` | match |
| R-4 BLOCKED not published (`publications.ts:201`) | `terminal === "BLOCKED"` → `null` | match |
| R-22 `publications.ts:301-321` `catch { return null }` | `:301` is `unpublish`; `readPublicDebate` is `:382-407` and *does* `catch { return null }` at `:401-402` | **property holds, citation is wrong (N2)** |
| list items carry `question` | `publications.ts:409-429` | match; step 4 can look for the question line |
| POST `/v1/asks` "usual success" | **202** `{run_ref, status:"QUEUED"}` (`index.ts:971-981`, `AskAcceptedSchema`) | **not named (B3)** |

`PublicationTransitionSchema` (`packages/contract/src/index.ts:249-252`) is `.strict()` with exactly `state` and `public_ref`. The HTTP visibility handler (`index.ts:1094`) and the contract client (`packages/contract/src/client.ts:457-459`) parse that schema. That is the wire R-11 proposes to extend without naming a field (B2).

## 5. SPEC §3 suites vs the intake baseline

Every suite §3 names is in the intake table "Baseline at `5b6cc9b1` in the lane". GREEN rows are GREEN at base; DELTA rows are the RED ones, with the named failure kept. `s7-authorization` is pinned to the same expected/actual pair (expects 50, finds 52). `tsc --noEmit` is a DELTA of at most 70, never zero. No blocking miss here. Suites were not re-run (COMMON §6: cite the intake; stack/listeners are no-touch).

## 6. SPEC §4 walked as a stranger holding only the step text

The stack is not served. Every "execute against a server" check is **UNVERIFIED**. The question this section answers is whether the step text is enough to run and to mark done.

| step | stranger can run it from the text? |
|---|---|
| 1 GET public list | yes, if `$API` is known. Expected 200 is named. |
| 2 POST `/v1/asks` with only `plan_tier` + question line | **no.** `AskRequestSchema` is `.strict()` with ten required keys (`packages/contract/src/index.ts:109-120`). Expected "usual success" is 202 `{run_ref,status:QUEUED}`, not named. |
| 3 poll GET answer until 200 | runnable; no timeout, so "still waiting" vs "failed" is unmarkable. |
| 4 GET public list `limit=100&offset=0`, total +1, question once | first page only. R-5's test check paginates fully; V's walk does not. |
| 5 GET visibility PUBLISHED | yes. |
| 6 signed-out public GET + "open `$WEB`'s existing public debates page" | public GET yes; the page path is not named (`/` hosts `PublicDebatesBuffer`; open is `/public/debate/{public_ref}`). |
| 7 mint UNPUBLISH grant, POST unpublish, expect 409 + typed string | action `UNPUBLISH` is named; body is not. `UnpublishDebateRequestSchema` requires `copies_may_persist_acknowledged: true`. Missing it is 400 `MALFORMED_REQUEST` (`index.ts:554-575`), not 409. Step-up body (`password` / `code` / `authorization`) is not given. |
| 8 same grant again | depends on 7; R-14's "grant not consumed" is the right pin once 7 is runnable. |
| 9 other user DELETE → 404 `NOT_FOUND` | named. Anonymous half: "the route's unauthenticated refusal" — today 401 `SESSION_REQUIRED` (`index.ts:515`). Stranger cannot mark done. |
| 10 creator DELETE, "erase" grant, expect 200/202 not 409 | grant action today is `DELETE_PRIVATE_DEBATE` (`RunTargetedGrantActionSchema`), not "erase". |
| 11 list total back, public GET 404 `DEBATE_NOT_FOUND` | yes. |
| 12–15 Premium unchanged | same Ask-body hole as 2; publish requires `warning_acknowledged: true`; unpublish requires `copies_may_persist_acknowledged: true`. Contract client already sends both (`client.ts:463-475`). The SPEC never names them (probe P10: NO_HITS). |
| 16 pre-existing `public_ref` still 200 | yes, given step 1 recorded it. |

Mutating cookie-auth calls also need the CSRF pair (`index.ts:500-507` → 403 `CSRF_VALIDATION_FAILED`). The walk never says so (N3).

## 7. Findings

### Blocking

**B1.** `slices/S01/SPEC.md:69-78` — R-8 and R-9 cannot both hold.

- Input: a bound run whose served answer has `terminal === "BLOCKED"`.
- R-8 requires latest visibility `PRIVATE`, never in the public list, and outstanding auto-publish work **reaches 0 and stays 0**.
- R-9 requires that after a bound run's answer is served the run is `PUBLISHED` **or** `PRIVATE` with a readable outstanding record. Quote: "`PRIVATE` with nothing outstanding is a violation of this requirement."
- Two seats: one creates outstanding work for BLOCKED (fails R-8 / V-1); one leaves PRIVATE with outstanding 0 (fails R-9). DECISIONS.md §1 intended R-8 to win ("Whether a BLOCKED Free answer is retried | No") but R-9 was not scoped to `terminal !== "BLOCKED"` the way R-4 is.
- Evidence: probe P9, both clauses present; R-4 already has the carve-out R-9 lacks.
- Class: a special-case requirement that is then forbidden by the general requirement that follows it. Sweep R-7 (points at "R-9's pending state") so a no-pseudonym BLOCKED run is not pulled into the same trap.
- Remedy: R-9 (and R-7's pointer) apply only when the served answer has `terminal` other than `BLOCKED`.

**B2.** `slices/S01/SPEC.md:81-87` — R-11 is not a unique observable. Two seats would ship different wires.

- V-2 requires outstanding not be "served as private by choice". R-11 puts the distinction on `GET /v1/runs/{id}/visibility` "in a field a test names", without changing the meaning of `PRIVATE` / `PUBLISHED`.
- Today that response is `PublicationTransitionSchema`: `{state, public_ref}` **`.strict()`** (`packages/contract/src/index.ts:249-252`). The handler (`apps/api/src/index.ts:1094`) and `readRunVisibility` (`packages/contract/src/client.ts:457-459`) parse it. An extra key without a schema change makes every owner visibility read fail; the existing UI already types visibility as those two fields (`apps/ui/components/PublicationControl.tsx:9-12`) and catches parse failure as "Publication status is unavailable."
- Two seats: `outstanding: boolean` vs `pending_publish: true` vs a third `state` value (which R-11 forbids) vs a new route (which R-23 forbids). The SPEC's own check defers the name to "a field a test names".
- Class: a public-wire observable left unnamed. Remedy: name the field and state that `PublicationTransitionSchema` gains that optional key (and that `apps/ui` is not edited — I-4), **or** move the distinction off the visibility wire to a test-only row R-9 already requires, and say so.

**B3.** `slices/S01/SPEC.md:198-240` — V's acceptance walk, run from the step text against today's `.strict()` contracts, returns 400 (or an unmarkable "usual success") instead of the statuses the steps name.

Members, same class (request contract not pinned):

1. Steps 2, 12: `POST /v1/asks` body is `AskRequestSchema.strict()` with ten keys (`packages/contract/src/index.ts:109-120`). The step names two. Success is **202** `{run_ref, status:"QUEUED"}` (`index.ts:981`, `AskAcceptedSchema:123-126`), not "the route's usual success response".
2. Steps 7, 8, 14: `UnpublishDebateRequestSchema` requires `copies_may_persist_acknowledged: true` (`:211-214`). Omitted → 400 `MALFORMED_REQUEST`, not 409 / 200.
3. Steps 13, 15: `PublishDebateRequestSchema` requires `warning_acknowledged: true` (`:206-209`). Omitted → 400, not 201.
4. Step 10: grant action is `DELETE_PRIVATE_DEBATE` (`RunTargetedGrantActionSchema :177-179`), not "erase".
5. Steps 7/10/13/14: `POST /v1/auth/step-up` body (`password` / `code` / `authorization.{action,target_run_id}`) is not given; the preamble names only the route (`index.ts:127`).

Probe P3 + P10 (NO_HITS in the SPEC for those literals). The shipped contract client already sends the acknowledgement flags (`client.ts:463-475`); the walk V is told to type does not.

Class: an acceptance step whose expected status is unreachable from the step text. Remedy: paste the exact JSON bodies, the 202/`run_ref` pin, and `DELETE_PRIVATE_DEBATE`.

### Non-blocking

**N1.** `SPEC.md:118-121` R-18 / step 9: anonymous DELETE is 401 `SESSION_REQUIRED` (`index.ts:515`), not an unnamed "policy" at `:132`. The byte-identical-to-unknown-id *check* still holds (auth fails before existence). Name the status.

**N2.** `SPEC.md:150-156` R-22 cites `apps/api/src/publications.ts:301-321`. That span is `unpublish` (probe P1). `readPublicDebate` is `:382-407`; `catch { return null }` is `:401-402`. The "no REQUIRED key" rule is still the right rule. Fix the cite; do not copy `public-debate-access/INTAKE.md:61-75` line numbers (they have drifted).

**N3.** SPEC §4 mutating steps never mention the CSRF pair. Cookie-auth POST/DELETE without `x-csrf-token` is 403 `CSRF_VALIDATION_FAILED` (`index.ts:500-507`). Tell V to reuse `csrf_token` from step-up / login.

**N4.** `SPEC.md:143-146` R-21: "a readable row naming the run and the reason" names neither table nor shape. Two seats will pick different audit homes. The refused-unpublish half is also beyond I-1…I-4 and beyond REQ charge 6 (which asked only what a *system publish* records). Pin the row or drop the refusal half.

**N5.** Step 6 does not name `$WEB/` (home `PublicDebatesBuffer`) or `/public/debate/{public_ref}`.

**N6.** Step 3 has no poll timeout; steps 4 and 11 inspect only `limit=100&offset=0` while R-5 requires the full pagination range for the test check.

**N7.** INSTRUCTIONS.md:12,44 still say rows V-1…V-4 after V-5 was transcribed into `V-DECISIONS-PACKET.md` at freeze. Compass drift, one line.

**N8.** Packet defects P-A, P-B, P-C (REQ-01.md) and P-D, P-E, P-F (REQ-REV-01.md). See §2. None of these is a reason to rework the SPEC by itself; B3 is the SPEC consequence of P-C.

## 8. UNVERIFIED

- Every §4 step against a live `$API` / `$WEB` — packet charge 6, no-touch listeners, no server started.
- Baseline suites were not re-run; §3 was checked against the intake table only (COMMON §6).
- Whether the currently-served UI process (if any) was built from this commit's `packages/contract` — not probed.
- Cluster commands at base — PLAN scaffold has none.

## 9. PREDICTIONS

If this pass were folded instead of reworked, ARCH would invent an `outstanding` (or `pending`) key on `PublicationTransitionSchema` for R-11, then spend a BUILD cycle discovering the `.strict()` client parse, and a second cycle discovering R-8/R-9 on a BLOCKED fixture. ARCH-REV would catch the unnamed wire field if it read the contract schema; it would miss B3 because architecture seats do not walk V's curl. The first coding cluster that posts `/unpublish` from the SPEC text would go RED with 400 and look like a product bug. Falsifier: a REQ-FIX that scopes R-9, names the R-11 field (or moves it off the wire), and pastes the request bodies into §4.

## Verdict

**REWORK** · pass 1 of 3 · blocking class of 3 (B1 contradiction, B2 unnamed wire, B3 unrunnable walk) · non-blocking N1–N8 to fold into DECISIONS / ticket comments the same day.
