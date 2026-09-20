# SPEC — S01 · A Free debate is made public by the server and cannot be made private again

ui: no

- Mission `free-public-debates` · slice S01 · written by REQ-01 (`claude-opus-5`), ticket `t_5b60146e`
- **Frozen at REQ-01's READY marker.** A change after that marker is `SPEC-v2.md` with a supersession
  header, never an in-place edit.
- Authority for every ruling cited here: `docs/missions/free-public-debates/00-intake.md` (V's rulings
  I-1…I-4 and the contradiction check C1–C7) and `docs/missions/free-public-debates/V-DECISIONS-PACKET.md`
  (rows V-1…V-4; each default binds until V rules). Nothing from those files is restated as new policy.
- `ui: no` — V ruled the mission backend-only (intake I-4). The acceptance in §4 is run **once**; the
  display mode is not varied, because this slice adds no screen, no element and no token.

## 1. What this slice is

The server itself makes a Free debate public when its answer is served, refuses to make it private
again, and lets its creator — and nobody else — delete it while it is public. Premium debates and
every debate that exists today keep the behaviour they have now.

This is one vertical slice: V starts a Free debate, watches it become public without touching a
publish control, fails to unpublish it, deletes it, and watches it leave the public list. The three
parts cannot be exercised apart — the delete requirement exists only because unpublish is refused
(intake C3), and the refusal is only reachable on a run the server published itself.

**Vocabulary used below.** A run is **bound** when the rule of this slice applies to it (R-1, R-2).
The **served answer** is the state in which `GET /v1/runs/{id}/answer` first returns 200 for the run's
owner (`apps/api/src/index.ts:1100-1101`). The **public list** is `GET /v1/public/debates`
(`apps/api/src/index.ts:799-816`). A **system publish** is a publication transition performed with no
user session and no step-up grant.

## 2. Requirements

Every requirement below is decided by a status code, a typed error string, a row state, or membership
of the public list. Each carries the check that decides it.

### 2.1 Which runs the rule binds (I-2, C2)

- **R-1** A run carries, from the moment it is created, the persisted value that decides whether this
  slice's rule binds it. A test answers *bound* or *not bound* by reading that run's own persisted
  state — never by comparing a timestamp against a deploy time, a migration time or a wall clock.
  *Check:* two run rows, one created before this slice's schema change was applied and one created
  after, each read once, answer `bound=false` and `bound=true` with no other input.
- **R-2** A run is bound only when its `plan_tier` is `free` and R-1's value marks it as created after
  the rule existed. `plan_tier` `premium` is never bound, and `plan_tier` NULL is never bound — the
  column is nullable by ADR-0024 decision 1 and `migrations/0061_plan_tier_on_run.sql:1-5`, so
  pre-0061 and legacy-principal runs read NULL. *Check:* a run row with `plan_tier IS NULL` answers
  `bound=false`.
- **R-3** No run that exists at deploy time changes visibility because of this slice. *Check:* the
  set of `core.run_visibility_event` rows for runs created before the deploy is identical before and
  after it — same count, same latest state per run.

### 2.2 The server publishes a Free debate (I-1, C1)

- **R-4** For a bound run whose served answer has `terminal` other than `BLOCKED`, the run's latest
  `core.run_visibility_event` state becomes `PUBLISHED` with no request to
  `POST /v1/runs/{id}/publish` and with no `identity.step_up_grant` row ever existing for
  `action='PUBLISH'` and that `target_run_id`. *Check:* after the answer first returns 200, the grant
  count for that run and action is 0 and the latest visibility state is `PUBLISHED`.
- **R-5** A bound run's publication appears in the public list exactly once, and at most one
  publication reference is live for the run at any moment. *Check:* the list is queried across its
  full pagination range and the run's `public_ref` occurs once.
- **R-6** The snapshot of a system publish carries the same `author_pseudonym` value the owner-driven
  path writes for that owner (`apps/api/src/publications.ts:215-233`; row V-4), and carries no other
  value that names the owner. *Check:* the snapshot's `author_pseudonym` equals the account pseudonym
  read for that owner, and the decrypted snapshot contains no user id, owner ref, session id or email
  address anywhere in it.
- **R-7** A bound run is never published under a real identity. When no pseudonym is available for the
  owner, the run is not published and R-9's pending state applies instead (row V-4, second clause).
- **R-8** A bound run whose served answer has `terminal === "BLOCKED"` is not published (row V-1;
  today's rule for every publish, `apps/api/src/publications.ts:201`). *Check:* after the answer is
  served, the run's latest visibility state is `PRIVATE`, the run never appears in the public list,
  and the count of outstanding auto-publish work for that run reaches 0 and stays 0 across two
  reconciliation cycles — a BLOCKED run is not retried forever.
- **R-9** A failure of the publish step never fails the run (row V-2). After a bound run's answer is
  served, the run is in exactly one of two observable states: `PUBLISHED`, or `PRIVATE` **with a
  readable outstanding auto-publish record naming that run**. `PRIVATE` with nothing outstanding is a
  violation of this requirement. *Check:* a test that forces the publish step to fail asserts that
  `GET /v1/runs/{id}/answer` still returns 200 for the owner and that the outstanding record exists.
- **R-10** An outstanding auto-publish that is retried and succeeds moves the run to `PUBLISHED` with
  no user action and no step-up grant — R-4's check, re-run after the retry.
- **R-11** A bound run that is outstanding is not served as private by choice (row V-2, final clause).
  A test distinguishes *outstanding* from *private because nobody published it* by reading what
  `GET /v1/runs/{id}/visibility` returns for the owner. The distinction is made **without changing the
  meaning of the two values `PRIVATE` and `PUBLISHED` already carried by that response's `state`
  field** (`apps/api/src/publications.ts:176-192`), because an older reader parses that field — see
  R-22. *Check:* the owner's visibility read for an outstanding bound run differs, in a field a test
  names, from the same read against a Premium run that was never published.

### 2.3 Unpublish is refused on a Free debate (I-1, C6, row V-3)

- **R-12** `POST /v1/runs/{id}/unpublish` against a bound, published run is refused with HTTP **409**
  and the body `{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}`. 409 is the status this API already
  uses for the one other visibility conflict it reports, `409 DEBATE_MUST_BE_PRIVATE`
  (`apps/api/src/index.ts:787-789`); the typed string is new and is the literal above.
- **R-13** The refusal is reached only after the caller has proven ownership and a live step-up grant
  for `UNPUBLISH`. A caller who is not the run's owner, or who presents no live grant, receives
  today's `404 {"error":"RUN_NOT_FOUND"}` (`apps/api/src/index.ts:1161-1172`) and learns nothing about
  the run's tier or its existence. *Check:* the same request from a second signed-in user against a
  bound published run returns a response byte-identical to the response for a run id that exists
  nowhere.
- **R-14** A refused unpublish changes nothing. The run's latest visibility state is still
  `PUBLISHED`, its live publication reference is unchanged, and the presented step-up grant is not
  consumed. *Check:* the same grant presented a second time returns the same 409 and the same typed
  error — never a 404.
- **R-15** A run that is not bound is unaffected: unpublish on a published Premium run still returns
  200 with `{"state":"PRIVATE","public_ref":null}` (`apps/api/src/index.ts:1185-1187`).

### 2.4 The creator can delete a Free debate while it is public (I-3, C3)

- **R-16** The creator of a bound, published run deletes it at `DELETE /v1/debates/{id}` with a live
  erase step-up grant, and receives the status and body the route already returns for a private
  debate — 200 with the erasure status, or 202 when the outcome is `PENDING`
  (`apps/api/src/index.ts:793-795`). The `409 DEBATE_MUST_BE_PRIVATE` of
  `apps/api/src/index.ts:787-789` is not returned for a bound run.
- **R-17** After that delete the public copy is gone: the publication is absent from the public list,
  and `GET /v1/public/debates/{public_ref}` returns `404 {"error":"DEBATE_NOT_FOUND"}`
  (`apps/api/src/index.ts:827-829`).
- **R-18** Only the creator. A second signed-in user receives `404 {"error":"NOT_FOUND"}`
  (`apps/api/src/index.ts:786`), and an anonymous caller receives the refusal the route's
  `auth: "user"` policy already produces (`apps/api/src/index.ts:132`) with no field naming the run.
  *Check:* neither response differs from the response for a run id that exists nowhere.
- **R-19** A run that is not bound is unaffected: `DELETE /v1/debates/{id}` against a published
  Premium run still returns `409 {"error":"DEBATE_MUST_BE_PRIVATE"}`.

### 2.5 What the audit trail records for a publish no user session performed

REQ states what must be observable afterwards; the mechanism is ARCH's.

- **R-20** A system publish leaves, readable after the fact:
  1. a `core.run_visibility_event` row for the run with state `PUBLISHED`
     (`migrations/0040_account_erasure.sql:4106-4113`), agreeing with an owner-driven publish of the
     same run shape on the public-indexing warning field that row carries;
  2. an audit event for the publish recorded with decision `ALLOW` and success true, of the same
     audit shape the owner-driven publish writes
     (`migrations/0040_account_erasure.sql:4114-4118`);
  3. an actor value that a test classifies as **the system and not a user**, decided by reading that
     audit row alone with no join to another table, and distinguishable from every actor value an
     owner-driven publish writes;
  4. **no session id, no grant id and no grant token hash belonging to a session or grant that never
     existed.** *Check:* every session reference carried by that audit row is either absent or
     matches no row in `identity.session`, and no `identity.step_up_grant` row exists for that run
     and `action='PUBLISH'`.
- **R-21** A failure and a refusal are both countable afterwards. A failed auto-publish attempt (R-9)
  and a refused unpublish (R-12) each leave a readable row naming the run and the reason, so neither
  a silent retry loop nor a refusal is invisible to an auditor. *Check:* after one forced failure and
  one refusal, a query returns exactly one row for each, each naming that run.

### 2.6 Blast radius

- **R-22** A debate published before this slice ships still returns 200 at
  `GET /v1/public/debates/{public_ref}` and still appears in the public list. No key is added to
  `PublicDebateSchema` as REQUIRED: a required key makes every older snapshot fail to parse,
  `readPublicDebate` swallows the failure in `catch { return null }`, and the route turns null into a
  404 — a disappearance, not an error (`docs/missions/public-debate-access/INTAKE.md:71-75`;
  `apps/api/src/publications.ts:301-321`). *Check:* the debate that was public before the deploy
  returns 200 after it.
- **R-23** No entry is added to the contract route policy table
  (`apps/api/src/index.ts:114-165`). *Check:* the table has 52 entries after this slice, the count it
  has at base (`awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'` → 52,
  measured 2026-09-20 at `5b6cc9b1`). If the design cannot be built without a route, this requirement
  is superseded by a V row, never by a seat's own judgement.
- **R-24** No file under `apps/ui` is written by this slice (I-4, row V-3). *Check:*
  `git diff --name-only 5b6cc9b1..HEAD -- apps/ui | wc -l` is 0.
- **R-25** The Premium path is unchanged end to end: a Premium run's served answer does not publish
  it; `POST /v1/runs/{id}/publish` still requires a live grant and still returns 201
  (`apps/api/src/index.ts:1143-1145`); unpublish still returns 200 (R-15); a published Premium debate
  still cannot be deleted (R-19).

## 3. Suites — asserted green, or as a DELTA on named tests

Baselines are cited, not restated: `docs/missions/free-public-debates/00-intake.md`, section
"Baseline at `5b6cc9b1` in the lane". A suite listed as a DELTA is RED at base; its named failure must
remain the only failure and must fail for the same reason.

| suite | asserted as |
|---|---|
| `tests/unit/s8-publication.test.ts` | GREEN, plus this slice's new tests |
| `tests/unit/s8-publication-http.test.ts` | GREEN, plus this slice's new tests |
| `tests/integration/s8-publication-database.test.ts` | DELTA — "preserves a committed corpus key when the publish result is transport-ambiguous" stays the only failure |
| `tests/architecture/s8-publication-contract.test.ts` | DELTA — "ships the deliberate controls and public-only reader in the UI composition" stays the only failure (a UI assertion; this slice writes no UI file, R-24) |
| `tests/unit/s7-authorization.test.ts` | DELTA — "keeps one complete, duplicate-free policy row per contract route" stays the only failure, failing with the **same** expected/actual pair it fails with at base (expects 50, finds 52). R-23 is what keeps that pair unmoved; a changed pair is a failed slice, not a moved baseline |
| `tests/unit/s10-erasure-http.test.ts` | GREEN, plus this slice's new tests |
| `tests/unit/pda-s04-node-carrier-audit.test.ts` | GREEN |
| `tests/unit/tiers-s02-admission.test.ts` | GREEN |
| `tests/integration/tiers-s02-run-plan-tier.test.ts` | GREEN |
| `tests/integration/plan-tiers-route-privileges.test.ts` | GREEN |
| `tests/architecture/register-support-publication.test.ts` | DELTA — the two named failures stay the only failures (a tooling trap: the root `typescript@7.0.2` package ships no JavaScript compiler API) |
| `tests/unit/api.test.ts` | GREEN |
| `pnpm exec tsc --noEmit` | DELTA — at most 70 diagnostics, the count at base, and no diagnostic that names a file this slice wrote. Never asserted as zero |

Each suite is run three times; the worst run is the one that counts.

## 4. Acceptance — V runs this once, personally, against a served lane

`ui: no`: the walk is run once and the display mode is not varied. Every step uses an API route that
exists today or the public debates page that exists today. No step needs a screen that does not exist.

Conventions: `$API` is the served API origin; `$WEB` is the served web origin; V is signed in as the
**creator** except where a step says otherwise. Distinctive question lines make the debate findable in
the list. Where a step mints a step-up grant, V uses the existing step-up route
(`POST /v1/auth/step-up`, `apps/api/src/index.ts:127`) for the action and run the step names.

1. Record the baseline: `GET $API/v1/public/debates?limit=100&offset=0` and note `total` and the
   `public_ref` of a debate already public before this slice shipped. Expected: 200.
2. Start a Free debate: `POST $API/v1/asks` signed in as the creator, with `plan_tier: "free"` and a
   distinctive question line (`packages/contract/src/index.ts:118`). Note the run id. Expected: the
   route's usual success response.
3. Poll `GET $API/v1/runs/{run}/answer` until it returns 200. Expected: 200 with the answer.
4. `GET $API/v1/public/debates?limit=100&offset=0`. Expected: `total` is the step-1 value plus 1, and
   the step-2 question line appears exactly once. **V made no publish request and clicked no publish
   control at any point.**
5. `GET $API/v1/runs/{run}/visibility`. Expected: `state` is `PUBLISHED` and `public_ref` is the
   reference seen in step 4.
6. Sign out (or use a fresh client with no session): `GET $API/v1/public/debates/{public_ref}`.
   Expected: 200 with the debate. Then open `$WEB`'s existing public debates page signed out and
   confirm the same debate is listed and opens.
7. Signed in as the creator, mint a step-up grant for `UNPUBLISH` on that run, then
   `POST $API/v1/runs/{run}/unpublish` with it. Expected: **409** and the body
   `{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}`.
8. Repeat step 7 with the same grant. Expected: the same 409 and the same typed error — not a 404.
   Then `GET $API/v1/public/debates?limit=100&offset=0`: the debate is still listed.
9. Signed in as a **different** user, mint nothing and call `DELETE $API/v1/debates/{run}`. Expected:
   `404 {"error":"NOT_FOUND"}`. Repeat the same call with no session at all. Expected: the route's
   unauthenticated refusal, with no field naming the run. The debate is still listed.
10. Signed in as the creator, mint the erase step-up grant for that run and call
    `DELETE $API/v1/debates/{run}`. Expected: 200 with the erasure status, or 202 when the status is
    `PENDING` — **not** 409.
11. `GET $API/v1/public/debates?limit=100&offset=0`. Expected: `total` is back to the step-1 value and
    the step-2 question line is absent. Then `GET $API/v1/public/debates/{public_ref}` signed out.
    Expected: `404 {"error":"DEBATE_NOT_FOUND"}`.
12. Start a **Premium** debate: `POST $API/v1/asks` with `plan_tier: "premium"` and a second
    distinctive question line. Poll its answer until 200, then `GET $API/v1/public/debates`. Expected:
    the Premium question line is **absent**, and `GET $API/v1/runs/{premium}/visibility` is `PRIVATE`.
13. Mint a `PUBLISH` grant for the Premium run and `POST $API/v1/runs/{premium}/publish` with it.
    Expected: 201, and the debate now appears in the public list — today's behaviour, unchanged.
14. Mint an `UNPUBLISH` grant for the Premium run and `POST $API/v1/runs/{premium}/unpublish` with it.
    Expected: 200 with `{"state":"PRIVATE","public_ref":null}` — today's behaviour, unchanged.
15. Publish the Premium run again (step 13), then mint the erase grant and call
    `DELETE $API/v1/debates/{premium}`. Expected: `409 {"error":"DEBATE_MUST_BE_PRIVATE"}` — today's
    behaviour, unchanged.
16. `GET $API/v1/public/debates/{the step-1 pre-existing public_ref}` signed out. Expected: 200 — a
    debate published before this slice shipped is still readable (R-22).

A step that cannot be run is reported as UNVERIFIED with the reason; a guess is not an outcome.

## 5. Out of scope for S01

The migration, the function signature, the retry mechanism and where the tier check sits in the
request path are ARCH's (intake, "What the REQ node decides (and must not)"). No `apps/ui` file, no
backfill of existing runs, no change to the Premium path, no new contract route.

## 6. Trace

`PLAN.md` in this directory carries the SPEC↔PLAN trace skeleton: every requirement R-1…R-25 has a
row, and the architecture seat fills the steps and the cluster that covers it. A requirement with no
covering step is an unfinished plan, not an optional requirement.
