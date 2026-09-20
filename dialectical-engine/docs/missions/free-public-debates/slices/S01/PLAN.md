# PLAN — S01 · mission `free-public-debates`

**Scaffold only.** REQ-01 wrote the skeleton; the architecture seat (`ARCH(S01)`, Grok) fills it and
owns every line below the headers. No line cap (V, 2026-08-28): the slice gets as many steps as it
has. **The SPEC of record is `SPEC-v2.md` in this directory**, frozen at REQ-FIX-02's READY marker
after the REQ-REV pass-1 REWORK verdict (`docs/missions/free-public-debates/reviews/REQ-REV-p1.md`).
`SPEC.md` is the superseded first version, kept byte-identical — read `SPEC-v2.md`. Requirement
numbering is unchanged between the two, so §3's 25 trace rows apply as they stand.

## 0. The quantifiability law — the test every step passes before it is written down

A step is finite, categoric and mechanically checkable. A stranger reads it and marks it done or not
done without asking anyone what it meant.

- WRONG: "make error reporting clearer on the unpublish path."
- RIGHT: "`POST /v1/runs/{id}/unpublish` against a bound published run returns 409 with the body
  `{\"error\":\"FREE_DEBATE_CANNOT_BE_UNPUBLISHED\"}`, and the test asserting that status and that
  exact string passes."

Every step names its file by path, its assertion by value, and the command that decides it. A step
whose outcome is a judgement is not a step.

## 1. Clusters — build units, one verification command each

A cluster is the smallest group of steps that is verifiable on its own. It is a BUILD node; it is not
a review unit. The review unit is the whole slice, once, at `REV(S01)`. Each cluster's command is run
three times and the worst run is the one that counts.

| cluster | name | steps | verification command (one) | notes |
|---|---|---|---|---|
| S01-C1 | | | | |
| S01-C2 | | | | |
| S01-C3 | | | | |

(Rows are added as the architecture seat cuts the plan. Empty rows are deleted, never shipped empty.)

## 2. Steps

Filled by the architecture seat, grouped under the cluster that verifies them. Each step: what is
written, in which file, and the assertion that turns RED before it turns GREEN.

## 3. SPEC↔PLAN trace — every requirement has a covering step

A requirement with no covering step is an unfinished plan, not an optional requirement. The
architecture seat fills the two right-hand columns; a REQ-REV or ARCH-REV pass reads this table first.

| requirement | what it pins | covering step(s) | cluster |
|---|---|---|---|
| R-1 | a run's own persisted state decides whether the rule binds it | | |
| R-2 | `free` + created after the rule; `premium` and NULL are never bound | | |
| R-3 | no run that exists at deploy changes visibility | | |
| R-4 | served answer → `PUBLISHED`, no publish request, no PUBLISH grant | | |
| R-5 | a **published** bound run's publication appears in the public list exactly once (a bound run that is not published has none) | | |
| R-6 | same `author_pseudonym` as the owner-driven path; nothing else naming the owner | | |
| R-7 | no pseudonym on a **publishable** bound run → not published, outstanding instead; a BLOCKED run is R-8's alone | | |
| R-8 | BLOCKED answer is not published and is not retried forever; R-9 does not apply to it | | |
| R-9 | on a **publishable** bound run only: publish failure never fails the run; `PUBLISHED` or `PRIVATE` + outstanding record | | |
| R-10 | a retried outstanding publish lands with no user action | | |
| R-11 | `publish_pending`, an optional boolean on `PublicationTransitionSchema`, present only while outstanding; `state`'s two values unchanged; no `apps/ui` edit | | |
| R-12 | unpublish on a bound published run → 409 `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` | | |
| R-13 | the refusal is reached only after ownership + live grant; everyone else gets today's 404 | | |
| R-14 | a refused unpublish changes nothing and does not consume the grant | | |
| R-15 | unpublish on a Premium published run still returns 200 | | |
| R-16 | the creator deletes a bound published run; not 409 | | |
| R-17 | after the delete the public copy is gone from the list and the read is 404 | | |
| R-18 | a second signed-in user gets 404 `NOT_FOUND`; a caller with no session gets 401 `SESSION_REQUIRED` before any lookup | | |
| R-19 | delete on a published Premium run still returns 409 `DEBATE_MUST_BE_PRIVATE` | | |
| R-20 | what a system publish records: visibility row, ALLOW audit, system actor, no phantom session | | |
| R-21 | each failed auto-publish attempt appends one audit event naming the run and the reason (the refusal half is out of scope — residue) | | |
| R-22 | snapshots published before this slice still return 200: no REQUIRED key added, and nothing changes what `public_ref`/`published_at` are revalidated against | | |
| R-23 | the route policy table still has 52 entries | | |
| R-24 | no `apps/ui` file written | | |
| R-25 | the Premium path is unchanged end to end | | |

## 4. Suite assertions carried from the SPEC

`SPEC-v2.md` §3 is the list of suites and how each is asserted — green, or a DELTA on a named test. The
plan does not restate it; a cluster's verification command names the suite it runs and the SPEC row
that says how to read the result.

## 5. Boundaries, DDD impact and ADRs

Filled by the architecture seat. A new system publication path through a `SECURITY DEFINER` function
is a migration and an ADR; ADR-0024 already rules where a plan tier lives and how
`core.transition_run_publication` may be redefined (`CREATE OR REPLACE` with the signature unchanged,
never `DROP` then `CREATE` — the EXECUTE grant at `migrations/0040_account_erasure.sql:6366-6369` is
discarded by a DROP and no embedded-postgres test notices).
