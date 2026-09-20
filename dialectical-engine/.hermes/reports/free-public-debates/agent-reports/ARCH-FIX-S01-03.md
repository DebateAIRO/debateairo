# ARCH-FIX-S01-03 self-report — mission `free-public-debates`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat ARCH-FIX-S01-03 · grok-4.6 · resumed session `01a0bff4-9e4c-73d1-a083-fcec78f440bf` · ticket `t_7b0c12ad` · pass 3 of 3 · 2026-09-20. Lane 5b6cc9b1 0 dirty. No git writes.

## The body

Pass 2 closed ten findings and opened four more, all in the C2 SQL/application surface the B4(b) gate created. The blocking one is a GRANT of two functions the plan never defined. `migrate()` runs each file as one batch (`packages/db/src/index.ts:821`); SQLSTATE 42883 aborts C2-S4. Combined with the new erasure contention gate, a crash between prepare and abandon leaves a PREPARED intent forever, and `DELETE` returns HTTP 202 without a tombstone — V's I-3 "delete stays" is then false for that run.

The owner path already had the template: `claim_publication_key_provision_cleanup` (`0040:1355-1404`) + `reconcileKeyProvisionCleanup` (`publications.ts:360-380`) + boot/interval (`main.ts:293-305`). Pass 1 copied the GRANT bullet without copying the functions. Pass 2's B4(b) gate made the omission user-visible. That is the class: **a GRANT line that names a role but not a signature, plus a new reader of the un-cleaned table.**

## Cause, not symptom

**B1-p2.** Mirror `:6373-6377` without naming `claim_system_…(integer)` / `complete_system_…(uuid,uuid)`. I accepted it. Repair is the owner template, two repository methods, `reconcileSystemKeyProvisionCleanup` on the same timer, C2-S3 case 16, C4-S2 case 8. C4 now waits on C2 — parallelism was already false after Revision 2's gate on C2's table.

**N1-p2.** `reconcileFreePublicAutoPublish` said "read the served projection" with no method on `PostgresPublicationApplication` (constructor is four arguments, `publications.ts:142-148`). Reviewer predicted I would pass the answer from `main.ts` boot. I did not: constructor injection of `readServedAnswer`, called only when work is claimed. C2-S19.3 is R-10's RED case (outstanding + no GET + one reconcile → PUBLISHED).

**N2-p2.** Step 8 told TypeScript to write DENY iff the DEFINER had not — `systemPublish` returns NULL both ways. One rule: transition writes DENY for every NULL after the lock; step 8 never writes. Case 10 pins count = 1.

**N3-p2.** Sequential `tryAutoPublish` hits application step 3 and never the in-transaction guard. Two pools, both prepares complete, then both `systemPublish`. Watched FAILING with body item 4 removed.

## Tokens that still burn

1. **Pass-1 GRANT copy without signatures.** The owner GRANT is four named functions. Copying "claim/complete cleanup → role" without the two CREATE FUNCTION lines cost a whole review pass. Price: one ARCH-REV + one ARCH-FIX cycle (~hours, tens of k tokens).
2. **Line numbers in the previous handoff.** Pass-2 cited `PLAN.md:355`. Pass 3 moved them. The FIX packet still said "the sentence added, quoted, with its new line" — correct, and it forces a grep after every edit. Fine. Citing pass-2 coordinates in the *packet* would have been stale on arrival.
3. **`writing-plans` "re-issue" vs "in place"** again. Last pass. I in-placed Revision 3. A 1100-line rewrite to add two SQL functions is how B3 comes back.

## Ranked upgrades

1. **A GRANT linter for PLAN migrations:** every `GRANT EXECUTE ON FUNCTION` in PLAN.md must match a `CREATE` in the same step, with the same signature. Would have caught B1-p2 at pass 1.
2. **Parallelism vs table readers.** If cluster A creates a table and cluster B `PERFORM`s it, they are not parallel. Revision 2's file map said C2 ∥ C4; B4(b) already forbade it. State the wait in §1 the same day as the gate.
3. **Race fixtures named as two connections, not "overlapping calls".** N3-p2 is the third time a concurrency case was specified as a sequential test.

## Nearly got wrong

- Passing the answer from `main.ts` boot (predicted). Constructor injection is the smaller blast radius.
- Leaving N1–N3 as V-rows because this is the last pass. They are HOW. A V-row would have blocked C2.

## Dead ends

- `CREATE TABLE IF NOT EXISTS` the system intent from 0068 so C4 can stay parallel.
- Reusing owner `claim_publication_key_provision_cleanup` on the system table (different columns, no session/grant).

## Packet notes

- Last-pass law ("open finding → V row and blocks the cluster") is the right ratchet. It forced closing N1-p2 rather than hedging.
- Forbidden list still names intake/V-packet that the inputs line also names. I did not re-open them.
- Reviewer's repaired `file-map-check.py` is the one to keep: UNMAPPED count 2 (0061 copy-from, account-erasure non-edit) — same as pass 2.

## Wall-clock

CLAIM 19:01Z. Detectors PASS. Mutants B1-p2 N1-p2 N2-p2 N3-p2 watched FAIL. Four cluster commands `CLUSTER_GREEN`. `sv1-membership-check.py` 52/52. Lane 0 dirty.
