# ADR-0033 — A model check of a finished debate's text runs in the API, fed by a content-free request from the runner

**Status: Proposed** — V ratifies this ADR. No seat writes `Accepted`.

| Field | Value |
|---|---|
| **Date** | 2026-10-15 — written by seat `ARCH-SF-S01` (node `ARCH(S01)`, ticket `t_17e6e5cf`) of mission `synthesis-flag`, slice S01. |
| **Numbering** | Measured with `ls docs/architecture/01-decisions/` at 2026-10-15 15:19 in the lane `.worktrees/sf-s01/dialectical-engine` (`origin/dev` @ fb99413bb): the highest file is `ADR-0032`; `0019`/`0020` are reserved by the halted `translation` mission (ADR-0023's note) and the other gaps (`0025`, `0026`, `0028`–`0031`) are left to whoever holds them. Re-measured at the moved base `origin/dev` @ fe57c5412 on 2026-10-17 with `git ls-tree fe57c5412 docs/architecture/01-decisions/`: the highest tracked file is still `ADR-0032`. The orchestrator owns allocation and may direct a renumber; the cost is this filename and the citations in `docs/missions/synthesis-flag/slices/S01/{PLAN,DECISIONS}.md`. |
| **Source of record** | `docs/missions/synthesis-flag/slices/S01/SPEC-v2.md` S01-R1..R3, R9, R30 (Revision 4: `SPEC-v5.md` S01-R1..R3, R6, R36..R40); the decision lines "Where does the settlement check run" and "The order of the check against the verdict story" in that slice's `DECISIONS.md`. |
| **Index** | `README.md` of this directory gains its row in step P03 of `docs/missions/synthesis-flag/slices/S01/PLAN.md` (cluster C1; Revision 2 of 2026-10-15, after ARCH-REV-S01-p1 N8(b)). |

## Context

The verdict story set the first precedent for model work after a debate settles: the runner, after the work item is
settled and the content lease released, calls the debate's own makers and writes a sealed record
(`apps/runner/src/index.ts:10710-10728` at fe57c5412, `migrations/0074_answer_story.sql`). It works because the story uses the
debate's own providers, which the runner already holds.

The synthesis check (mission `synthesis-flag`) is different in three ways that will recur for any later check of a
finished debate's text:

1. Its model is the SITE's model (the support target, Claude Haiku 5.5, `SUPPORT_MODEL_TARGET_JSON`), an API
   variable. The runner holds no such target and no such key (`apps/runner/src/dev-api-process.ts:177`).
2. The same check must also run at Publish, which is an API route.
3. It must never delay the debate or other owners' debates (S01-R2), and the runner is a claim loop: every second
   it spends after settlement is a second the next claimed debate waits.

## Decision

**A model check of a finished debate's text runs in the API process.** The runner's only part is to write, after the
won settlement and after its content lease is released, ONE content-free request row (run id, answer id, answer
version), without awaiting it. An API background worker claims requests (insert-once claim rows, no UPDATE), reads the
text through the owner-scoped read the data export already uses (`apps/api/src/owner-read.ts`), calls the site model
through the framed-prompt door, and stores a sealed, append-only result. The Publish route calls the same module.

Consequences by category:

- **Keys and custody**: no model credential ever enters the runner's custody for a site check.
- **Roles**: the request, claim and result tables are written by `debateai_runtime` (runner principal for the request,
  API principal for the rest), granted `SELECT, INSERT` only.
- **Failure**: API down → requests wait and run later; a crash after a claim leaves a claim with no result, which is
  never retried in the background; the next user-facing action that needs the result (here: Publish) runs the check
  itself.
- **Latency**: one worker tick plus the model call; the runner adds one un-awaited INSERT.

## Alternatives considered

| Alternative | Why not |
|---|---|
| The runner calls the site model after the lease, as the story does | A second custody copy of a vendor key in the runner's environment; the support adapter lives in `apps/api`; Publish needs the check in the API anyway (two call sites, two switches, two spend writers); up to D (60 s) of runner time per debate delays other owners' queued debates. |
| The API polls `serve.answer` / `core.work_item` for new versions | Cannot tell a settled version from a review catch-up version without coupling to the runner's work-item states. |
| A database trigger on settlement inserts the request | A trigger on a hot core table can fail the settle. |
| A Hatchet task | A second job system for one short call, and no API-side Hatchet worker exists (ADR-0017). |
| The runner posts to an internal API endpoint | A service credential and a new route, for what one INSERT does. |

## Consequences

- The API now decrypts an owner's debate with no live session of that owner, on the site's initiative. ADR-0013 rule 3
  forbids a service-identity read path for SSR; this is not SSR and serves no other principal, and the data export
  (V-41) set the owner-scoped background read precedent — but at the owner's request. Any later check that reuses this
  path must be described in the Privacy Policy before it ships (mission `synthesis-flag` S03 does it for this one).
- A check that must run "at the end of the debate" is bounded by the API being up, not by the runner.
- The request/claim/result split is the reusable shape: content-free rows for scheduling, one sealed carrier for the
  result, insert-once keys for "at most once".
- A check's result has few possible values, so its LENGTH can name it after the run key is destroyed: AES-GCM keeps the
  plaintext length (`packages/crypto/src/index.ts:523-545`) and the envelope outlives the key. A later check that reuses this
  shape pads its sealed payload to a fixed byte length and records a cost row that does not follow the model's output length
  (Revision 2 of the S01 plan, ARCH-REV-S01-p1 B3).

## Revision 4 of the S01 plan (2026-10-18, seat `ARCH-FIX-SF-S01-r4`, ticket `t_f351f4e1`; SPEC of record `SPEC-v5.md`, base `origin/dev` @ ae95dc8d0)

- **The request rides the answer's transaction.** The runner no longer writes the request after the lease. `serve.persist`
  writes it in the same transaction as the answer, behind a savepoint, when the runner passes `synthesisCheckRequest: true`.
  A refused request rolls back to the savepoint and the debate is unaffected. Reason: V-27 holds every finished answer
  until its check answers, so the request must exist no later than the answer becomes readable. No timestamp marks a
  settlement, and the answer is readable before the runner settles. The worker claims a request only when its work item
  settled with that answer.
- **Owner reads honour a content-free hold** (`SHOW` / `HELD` / `REMOVED`) computed from the request, attempt, result and
  inheritance rows. It ends at a result, an inherited verdict, or the deadline D after the later of the request and the
  last attempt.
- **A harm-to-others verdict deletes the debate without a person or a session.** The result's transaction writes a
  removal request and the owner's one-time notice. The erasure principal's reconciler then makes the private delete's
  writes (cleanup intent, attestation secret gone, keys destroyed, tombstone) through three new definer functions,
  attributed by a system binding and one `debate.system.erased` audit event. The private-delete functions are not
  redefined.
- The migration of this decision is `0125_synthesis_check.sql` (Revisions 1-3 named 0119 and 0121; dev took those numbers).

## Revision 5 of the S01 plan (2026-10-19, seat `ARCH-FIX-SF-S01-r5`, ticket `t_541ec919`; SPEC of record `SPEC-v6.md` with S01-R11's sentence planned to V-79, base `origin/dev` @ 27e21e5e1)

- **A background check never decides after its hold ended.** The worker claims a request only within D of it, and the
  check gets only what is left of D after the claim and its reads (its deadline is the attempt's start + D). A final verdict
  is stored only before that deadline; a later answer is stored as `UNAVAILABLE` `DEADLINE`. The hold ends at a result, an
  inherited verdict, D after the request when no check started within that D, or the started check's deadline plus a 2 s
  seal margin. So a deleting verdict can reach a debate whose answer its owner has already read only through Publish's own
  check, which the SPEC allows. Revision 4's "D after the later of the request and the last attempt" let a late claim hold
  an answer again and let a slow answer land after the hold.
- **The system deletion writes only what the registry allows, for one owner.** Migration 0125 widens the publication-ref
  registry's closed kind list (`publication_ref_tombstone_ref_kind_check`) by the four kinds the system deletion writes
  (V-77), in the replay-safe drop-then-add form; no forward step digests that constraint. The deletion proceeds only when
  the run's first and latest owners are the same account, as the private delete requires; otherwise it waits, and a request
  kept waiting for a reason no retry clears is logged by its outcome alone.
- **Every reader of an owner's answer honours the hold, the data export included**: the export builds its adapter from
  its own dependency object, so the composition passes the hold to it as well as to the routes.
