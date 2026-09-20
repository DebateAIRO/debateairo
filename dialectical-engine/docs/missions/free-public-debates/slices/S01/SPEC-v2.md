# SPEC-v2 — S01 · A Free debate is made public by the server and cannot be made private again

ui: no
SUPERSEDES `SPEC.md` (frozen, byte-identical) after REQ-REV pass 1 verdict **REWORK** (`docs/missions/free-public-debates/reviews/REQ-REV-p1.md`), findings B1 B2 B3 N1 N2 N3 N4 N5 N6 N7. Requirements changed: **R-5** (scoped to a published bound run — B1 sweep), **R-7** (pointer scoped — B1 sweep), **R-9** (scoped to `terminal` other than `BLOCKED` — B1), **R-11** (the wire field is named `publish_pending` — B2), **R-18** (401 `SESSION_REQUIRED` named — N1), **R-21** (refusal half dropped as out of scope, failure half pinned to the audit trail — N4), **R-22** (citation corrected to `publications.ts:382-407` and the revalidation clause added — N2 + class sweep), **§4 acceptance rewritten in full** (exact `.strict()` request bodies, 202/`run_ref`, `DELETE_PRIVATE_DEBATE`, step-up body and the `step_up_grant.token` extraction, CSRF + Origin, `$WEB` paths, poll timeout, full pagination — B3 N3 N5 N6). R-1 R-2 R-3 R-4 R-6 R-8 R-10 R-12 R-13 R-14 R-15 R-16 R-17 R-19 R-20 R-23 R-24 R-25 are unchanged in substance. Requirement numbering is stable, so `PLAN.md` §3's 25 trace rows still apply.

- Mission `free-public-debates` · slice S01 · written by REQ-FIX-02 (`claude-opus-5`, the REQ-01 seat resumed), ticket `t_9e5427b1`, pass 2 of 3
- **This file is the SPEC of record.** It is frozen at REQ-FIX-02's READY marker; every later packet names it by this file name. A further change is `SPEC-v3.md`, never an in-place edit.
- Authority for every ruling cited here: `docs/missions/free-public-debates/00-intake.md` (V's rulings I-1…I-4 and the contradiction check C1–C7) and `docs/missions/free-public-debates/V-DECISIONS-PACKET.md` (rows V-1…V-5; each default binds until V rules). Nothing from those files is restated as new policy.
- `ui: no` — V ruled the mission backend-only (intake I-4). The acceptance in §4 is run **once**; the display mode is not varied, because this slice adds no screen, no element and no token. Two steps open a page the repository already serves; opening an existing page is not a display-mode variation.

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
owner (`apps/api/src/index.ts:1097-1102`). A **publishable** bound run is a bound run whose served
answer has `terminal` other than `BLOCKED`; every requirement about publishing, pending state and
retry speaks only about publishable bound runs. The **public list** is `GET /v1/public/debates`
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

- **R-4** For a **publishable bound run**, the run's latest `core.run_visibility_event` state becomes
  `PUBLISHED` with no request to `POST /v1/runs/{id}/publish` and with no `identity.step_up_grant` row
  ever existing for `action='PUBLISH'` and that `target_run_id`. *Check:* after the answer first
  returns 200, the grant count for that run and action is 0 and the latest visibility state is
  `PUBLISHED`.
- **R-5** A **published** bound run's publication appears in the public list exactly once, and at most
  one publication reference is live for the run at any moment. A bound run that is not published
  (R-8, R-9) has no publication and is not measured by this requirement. *Check:* the list is queried
  across its full pagination range and the run's `public_ref` occurs once.
- **R-6** The snapshot of a system publish carries the same `author_pseudonym` value the owner-driven
  path writes for that owner (`apps/api/src/publications.ts:215-233`; row V-4), and carries no other
  value that names the owner. *Check:* the snapshot's `author_pseudonym` equals the account pseudonym
  read for that owner, and the decrypted snapshot contains no user id, owner ref, session id or email
  address anywhere in it.
- **R-7** A bound run is never published under a real identity. When no pseudonym is available for the
  owner of a **publishable** bound run, the run is not published and R-9's pending state applies
  instead (row V-4, second clause). A run that is not publishable is governed by R-8 alone, and a
  missing pseudonym does not pull it into R-9.
- **R-8** A bound run whose served answer has `terminal === "BLOCKED"` is not published (row V-1;
  today's rule for every publish, `apps/api/src/publications.ts:201`). *Check:* after the answer is
  served, the run's latest visibility state is `PRIVATE`, the run never appears in the public list,
  and the count of outstanding auto-publish work for that run reaches 0 and stays 0 across two
  reconciliation cycles — a BLOCKED run is not retried forever. R-9 does not apply to it.
- **R-9** A failure of the publish step never fails the run (row V-2). After a **publishable bound
  run's** answer is served, the run is in exactly one of two observable states: `PUBLISHED`, or
  `PRIVATE` **with a readable outstanding auto-publish record naming that run**. `PRIVATE` with
  nothing outstanding is a violation of this requirement. This requirement says nothing about a run
  that is not publishable; R-8 governs those, and the two requirements are therefore satisfiable
  together. *Check:* a test that forces the publish step to fail asserts that
  `GET /v1/runs/{id}/answer` still returns 200 for the owner and that the outstanding record exists;
  a second test drives a `BLOCKED` answer and asserts `PRIVATE` with an outstanding count of 0, and
  both tests pass in the same run.
- **R-10** An outstanding auto-publish that is retried and succeeds moves the run to `PUBLISHED` with
  no user action and no step-up grant — R-4's check, re-run after the retry.
- **R-11** A publishable bound run that is outstanding is not served as private by choice (row V-2,
  final clause). The distinction is carried by **one named optional key, `publish_pending`, on
  `PublicationTransitionSchema` (`packages/contract/src/index.ts:249-252`)**: a boolean that is
  present and `true` exactly while an auto-publish for that run is outstanding, and **absent
  otherwise**. Constraints that make this one build:
  1. The two existing values of `state`, `PRIVATE` and `PUBLISHED`, keep their present meanings; no
     third value is added. The schema stays `.strict()`, so the key is declared or the parse fails.
  2. Because the key is absent unless the run is outstanding, every response for every run that is
     not an outstanding bound run is byte-identical to today's.
  3. No `apps/ui` file is written (I-4, row V-3). The owner-facing reader
     (`apps/api/src/index.ts:1094`) and the contract client
     (`packages/contract/src/client.ts:457-459`) parse the same schema from the same package, so both
     sides gain the key together.
  4. Residual risk, stated rather than hidden: a UI process built from an older `packages/contract`
     bundle meets the new key only on an outstanding bound run, and fails the parse there. Today that
     failure already renders as an unavailable publication status
     (`apps/ui/components/PublicationControl.tsx:9-12`), so it is a degraded read of one run, not
     data loss. The alternative — moving the distinction off the wire entirely — is the V-ROW in
     `DECISIONS.md` §3.
  *Check:* `GET /v1/runs/{id}/visibility` for the owner of an outstanding bound run returns
  `{"state":"PRIVATE","public_ref":null,"publish_pending":true}`; the same read against a Premium run
  that was never published returns `{"state":"PRIVATE","public_ref":null}` with no third key.

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

### 2.4 The creator can delete a Free debate while it is public (I-3, C3, row V-5)

- **R-16** The creator of a bound, published run deletes it at `DELETE /v1/debates/{id}` with a live
  `DELETE_PRIVATE_DEBATE` step-up grant, and receives the status and body the route already returns
  for a private debate — 200 with `{"status":"CLEANED"}`, or 202 with `{"status":"PENDING"}`
  (`apps/api/src/index.ts:793-795`; `PrivateDebateErasureStatusSchema`,
  `packages/contract/src/index.ts:238-240`). The `409 DEBATE_MUST_BE_PRIVATE` of
  `apps/api/src/index.ts:787-789` is not returned for a bound run.
- **R-17** After that delete the public copy is gone: the publication is absent from the public list,
  and `GET /v1/public/debates/{public_ref}` returns `404 {"error":"DEBATE_NOT_FOUND"}`
  (`apps/api/src/index.ts:827-829`).
- **R-18** Only the creator. A second signed-in user receives `404 {"error":"NOT_FOUND"}`
  (`apps/api/src/index.ts:786`), and a caller with no session receives
  **`401 {"error":"SESSION_REQUIRED"}`** from the authentication gate that runs ahead of every route
  (`apps/api/src/index.ts:515`), which is reached before the route itself and therefore before the run
  is looked up at all. *Check:* neither response differs from the response for a run id that exists
  nowhere.
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
- **R-21** A failed auto-publish attempt is countable afterwards. Each failed attempt on a publishable
  bound run (R-9) appends one audit event naming that run and the reason, through the same audit
  mechanism R-20.2 names — the `identity.append_audit_event_internal` path the denial branch already
  uses (`migrations/0040_account_erasure.sql:4136-4141`) — so a silent retry loop is not invisible to
  an auditor. *Check:* after two forced failures on one run, a query over that audit event type
  returns exactly two rows, both naming that run.
  *Scope note:* a refused unpublish (R-12) leaving its own audit row was required by `SPEC.md`'s R-21
  and is **removed here**. It is beyond I-1…I-4 and beyond this node's charge, which asked only what a
  *system publish* records. It is recorded as residue in `DECISIONS.md` §4, for a ticket at TEST(S01),
  alongside the UI follow-up row V-3 already defers.

### 2.6 Blast radius

- **R-22** A debate published before this slice ships still returns 200 at
  `GET /v1/public/debates/{public_ref}` and still appears in the public list. Two ways to break that,
  both forbidden, both members of one class — *an existing snapshot stops parsing or stops
  revalidating, and `readPublicDebate` turns the failure into a silent null that the route serves as
  a 404* (`apps/api/src/publications.ts:382-407`; `catch { return null }` at `:401-402`; the route's
  null-to-404 at `apps/api/src/index.ts:827-829`):
  1. **No key is added to `PublicDebateSchema` as REQUIRED.** A required key makes every older
     snapshot fail `PublicDebateSchema.parse` at `apps/api/src/publications.ts:390-392`.
  2. **Nothing changes what the stored snapshot's `public_ref` and `published_at` are compared
     against.** `readPublicDebate` returns null when either differs from the stored row
     (`apps/api/src/publications.ts:397-398`), so a system publish that writes `published_at` from a
     different clock than the row's `createdAt` disappears the same way.
  *Check:* the debate that was public before the deploy returns 200 after it, and a snapshot written
  by a system publish returns 200 on a second read.
  *Citation note:* `docs/missions/public-debate-access/INTAKE.md:57-75` states this trap correctly and
  its line numbers have drifted (it says `publications.ts:301`, which is `async unpublish` today).
  The lines above were re-measured at `3f374361`; do not copy that record's numbers forward.
- **R-23** No entry is added to the contract route policy table
  (`apps/api/src/index.ts:114-165`). *Check:* the table has 52 entries after this slice, the count it
  has at base (`awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'` → 52,
  measured 2026-09-20 at `5b6cc9b1`, re-measured at `3f374361`). If the design cannot be built
  without a route, this requirement is superseded by a V row, never by a seat's own judgement.
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
| `tests/architecture/s8-publication-contract.test.ts` | DELTA — "ships the deliberate controls and public-only reader in the UI composition" stays the only failure (a UI assertion; this slice writes no UI file, R-24). R-11 adds a key to `PublicationTransitionSchema`; if that moves this suite, the move is this slice's to fix, not a baseline to re-declare |
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
exists today or a page the repository already serves. No step needs a screen that does not exist.

### 4.0 What every step needs before step 1

- `$API` is the served API origin; `$WEB` is the served web origin.
- **Sign in as the creator** in a browser at `$WEB/login`, so the session and CSRF cookies exist.
- **Every mutating call (POST, DELETE) needs three things or it never reaches the logic this slice
  changed** (`apps/api/src/index.ts:500-507`):
  1. header `origin: $WEB` — a missing or foreign origin is `403 {"error":"CSRF_VALIDATION_FAILED"}`;
  2. header `x-csrf-token: <csrf>` matching the CSRF cookie — same 403 when absent or mismatched;
  3. the session cookie. The freshest `<csrf>` is the `csrf_token` field of the most recent step-up
     response (§4.1), because step-up rotates both cookies (`apps/api/src/index.ts:662-668`).
- **Minting a step-up grant** — `POST $API/v1/auth/step-up`, body exactly:

  ```json
  { "password": "<V's password>", "code": "<current MFA code>",
    "authorization": { "action": "UNPUBLISH", "target_run_id": "<run id>" } }
  ```

  `action` is one of `PUBLISH`, `UNPUBLISH`, `DELETE_PRIVATE_DEBATE`
  (`packages/contract/src/index.ts:177-179`) — there is no action called "erase". The response is
  `{"status":"step_up_complete","csrf_token":"<43 chars>","step_up_grant":{"token":"<43 chars>",
  "action":…,"target_run_id":…,"expires_at":…}}` (`apps/api/src/index.ts:666-685`).
  **The value every later body needs is `step_up_grant.token`, a bare string** — the publish,
  unpublish and delete bodies all take `step_up_grant` as a 43-character string, not as the object the
  step-up response nests it in (`packages/contract/src/index.ts:206-214, 235-237`). Pasting the object
  is `400 {"error":"MALFORMED_REQUEST"}`.
- A grant is bound to one action and one run and expires; mint it immediately before the call that
  uses it.
- **A step that cannot be run is reported as UNVERIFIED with the reason. A guess is not an outcome.**

### 4.1 The walk

1. Record the baseline: `GET $API/v1/public/debates?limit=100&offset=0`, and repeat with
   `offset=100`, `200`, … until the returned page is empty, so the whole list is seen and not only its
   first page. Note `total` and note the `public_ref` of a debate that was already public before this
   slice shipped. Expected: 200 on every page.
2. Start a Free debate: `POST $API/v1/asks`, signed in as the creator. The body is
   `AskRequestSchema.strict()` and needs **all eleven keys**
   (`packages/contract/src/index.ts:108-120`) — a missing or extra key is
   `400 {"error":"MALFORMED_REQUEST"}`:

   ```json
   { "question_line": "FPD-S01-FREE does a public square need a gatekeeper",
     "risk_tier": "standard",
     "tier_source": "ASKER",
     "tier_provenance_ref": "fpd-s01-acceptance",
     "composition_budget_tier": "low",
     "depth_params": {},
     "decision_scope": "fpd-s01-acceptance",
     "as_of": "<now, ISO-8601 with timezone>",
     "steering_presets": [],
     "plan_tier": "free",
     "steering_annotations": [] }
   ```

   Expected: **202** with `{"run_ref":"<uuid>","status":"QUEUED"}`
   (`apps/api/src/index.ts:971-981`; `AskAcceptedSchema`, `packages/contract/src/index.ts:123-126`).
   Note `run_ref` as `<free_run>`.
   (`risk_tier` ∈ casual|standard|high-stakes; `tier_source` ∈ ASKER|MACHINE_DEFAULT;
   `composition_budget_tier` ∈ low|medium|high — `packages/contract/src/index.ts:5-8`.)
3. Poll `GET $API/v1/runs/<free_run>/answer` every 10 seconds **for at most 15 minutes**. Expected:
   200 with the answer. A 404 `ANSWER_NOT_SERVED` means not served yet, so keep polling; if 15 minutes
   pass with no 200, stop and report the step UNVERIFIED with the last status — do not proceed, because
   every later step reads from a served answer.
4. Repeat step 1's full-pagination read. Expected: `total` is the step-1 value plus 1, and the step-2
   question line appears exactly once across all pages. **V made no publish request and clicked no
   publish control at any point.** Note the debate's `public_ref` as `<free_ref>`.
5. `GET $API/v1/runs/<free_run>/visibility`. Expected:
   `{"state":"PUBLISHED","public_ref":"<free_ref>"}` — two keys, no `publish_pending` (R-11: the key
   is absent unless an auto-publish is outstanding).
6. In a private window with no session: `GET $API/v1/public/debates/<free_ref>`. Expected: 200 with
   the debate. Then, still signed out, open `$WEB/` and confirm the debate is listed, and open
   `$WEB/public/debate/<free_ref>` (`apps/ui/app/public/debate/[id]/page.tsx`) and confirm it renders.
7. Signed in as the creator, mint an `UNPUBLISH` grant for `<free_run>` (§4.0), then
   `POST $API/v1/runs/<free_run>/unpublish` with the three headers and body exactly:

   ```json
   { "step_up_grant": "<step_up_grant.token>", "copies_may_persist_acknowledged": true }
   ```

   `copies_may_persist_acknowledged: true` is required by `UnpublishDebateRequestSchema.strict()`
   (`packages/contract/src/index.ts:211-214`); omitting it is `400 {"error":"MALFORMED_REQUEST"}`, not
   the refusal this step is testing. Expected: **409** with
   `{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}`.
8. Repeat step 7 **with the same grant token**, unchanged. Expected: the same 409 and the same typed
   error — not a 404, which is what a consumed grant would produce (R-14). Then repeat step 1's
   full-pagination read: the debate is still listed.
9. Signed in as a **different** user, call `DELETE $API/v1/debates/<free_run>` with that user's
   headers and body `{"step_up_grant":"<any 43-character string>"}`. Expected:
   `404 {"error":"NOT_FOUND"}`. Then repeat the same call **with no session cookie at all**. Expected:
   `401 {"error":"SESSION_REQUIRED"}` (`apps/api/src/index.ts:515`) — the refusal happens before the
   run is looked up, so neither answer reveals that `<free_run>` exists. The debate is still listed.
10. Signed in as the creator, mint a **`DELETE_PRIVATE_DEBATE`** grant for `<free_run>` (§4.0 — the
    action is that literal, `packages/contract/src/index.ts:177-179`), then
    `DELETE $API/v1/debates/<free_run>` with the three headers and body exactly:

    ```json
    { "step_up_grant": "<step_up_grant.token>" }
    ```

    (`PrivateDebateErasureRequestSchema.strict()`, `packages/contract/src/index.ts:235-237` — this body
    takes the grant and nothing else.) Expected: **200** with `{"status":"CLEANED"}`, or **202** with
    `{"status":"PENDING"}` — and **not** 409.
11. Repeat step 1's full-pagination read. Expected: `total` is back to the step-1 value and the step-2
    question line is absent from every page. Then `GET $API/v1/public/debates/<free_ref>` signed out.
    Expected: `404 {"error":"DEBATE_NOT_FOUND"}`.
12. Start a **Premium** debate: step 2's body with
    `"question_line": "FPD-S01-PREMIUM does a private study need a door"` and `"plan_tier": "premium"`.
    Expected: 202 with a `run_ref`; note it as `<prem_run>`. Poll its answer as in step 3, then repeat
    step 1's full-pagination read. Expected: the Premium question line is **absent** from every page,
    and `GET $API/v1/runs/<prem_run>/visibility` is `{"state":"PRIVATE","public_ref":null}` — two keys,
    no `publish_pending`.
13. Mint a `PUBLISH` grant for `<prem_run>`, then `POST $API/v1/runs/<prem_run>/publish` with the three
    headers and body exactly:

    ```json
    { "step_up_grant": "<step_up_grant.token>", "warning_acknowledged": true }
    ```

    (`PublishDebateRequestSchema.strict()`, `packages/contract/src/index.ts:206-209`; omitting
    `warning_acknowledged` is 400, not 201.) Expected: **201** with
    `{"state":"PUBLISHED","public_ref":"<prem_ref>"}`, and the debate now appears in the public list —
    today's behaviour, unchanged.
14. Mint an `UNPUBLISH` grant for `<prem_run>` and `POST $API/v1/runs/<prem_run>/unpublish` with step
    7's body shape. Expected: **200** with `{"state":"PRIVATE","public_ref":null}` — today's
    behaviour, unchanged. This is the step that proves the refusal in step 7 is about the tier and not
    about the route.
15. Publish `<prem_run>` again (step 13), then mint a `DELETE_PRIVATE_DEBATE` grant for it and call
    `DELETE $API/v1/debates/<prem_run>` with step 10's body. Expected:
    `409 {"error":"DEBATE_MUST_BE_PRIVATE"}` — today's behaviour, unchanged.
16. `GET $API/v1/public/debates/<the step-1 pre-existing public_ref>` signed out. Expected: 200 — a
    debate published before this slice shipped is still readable (R-22).

## 5. Out of scope for S01

The migration, the function signature, the retry mechanism and where the tier check sits in the
request path are ARCH's (intake, "What the REQ node decides (and must not)"). No `apps/ui` file, no
backfill of existing runs, no change to the Premium path, no new contract route, and no audit row for
a refused unpublish (R-21's scope note; residue in `DECISIONS.md` §4).

## 6. Trace

`PLAN.md` in this directory carries the SPEC↔PLAN trace skeleton: every requirement R-1…R-25 has a
row, and the architecture seat fills the steps and the cluster that covers it. Requirement numbering
is unchanged from `SPEC.md`, so those 25 rows apply to this version without renumbering. A requirement
with no covering step is an unfinished plan, not an optional requirement.

`spec-v2-check.sh` in this directory is the detector for the ten findings this version closes. It is
run against a mutant of each closed defect before its PASS is quoted.
