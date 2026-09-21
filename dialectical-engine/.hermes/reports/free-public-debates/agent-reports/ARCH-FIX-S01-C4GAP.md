# ARCH-FIX-S01-C4GAP self-report — mission `free-public-debates`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat ARCH-FIX-S01-C4GAP · grok-4.6 · resumed session `01a0bff4-9e4c-73d1-a083-fcec78f440bf` · ticket `t_fd352d8e` · 2026-09-21. Lane HEAD `11184e70`. Product code read via `git show HEAD:dialectical-engine/…`. No lane writes, no git writes.

## The body

C4-S4 ordered `prepare_private_run_erasure` to INSERT a PRIVATE `core.run_visibility_event` for a bound published run. C2's trigger `core.enforce_publication_v2_ref_binding` (`0067:43-69` at `11184e70`) admits a visibility row only if (a) it is the pinned system PUBLISHED shape (`…00f1`) or (b) a live `identity.publication_event_binding` matches. Owner UNPUBLISH uses (b), minted by `reserve_publication_event_refs` from an UNPUBLISH grant. Erasure holds `DELETE_PRIVATE_DEBATE`. The INSERT raises `55000 PUBLICATION_V2_REF_BINDING_REQUIRED`. BUILD stopped rather than invent the authorization shape. That is G1, and it is real.

## Cause

The plan specified *that* PRIVATE is written, not *what row* or *which admission* the trigger will accept. C2 tightened the trigger after C4's steps were written. ARCH-REV capped at pass 3, so the gap surfaced at BUILD.

## Decision (frozen as PLAN Revision 4 + V-ROW)

Do **not** mint an UNPUBLISH binding. Do **not** edit committed `0067`. In **`0068` only**, `CREATE OR REPLACE` the trigger with one extra admission: token `…00f2`, `actor_ref_version=2`, `PRIVATE`, `COPIES_MAY_PERSIST_V1`, `run_is_free_public_bound`, pending `publication_key_cleanup_intent`. Erasure inserts the cleanup intent **first**, then the visibility row. No `debate.publication.unpublished` audit — erasure's `private_erasure_audit_binding` is the trail. File map still three C4 files.

RED cases 9–12 pin each guard. BUILD's six intended failures map to C4-S2.1, .2, .5, .7, .8 and the snapshot-cleanup check.

## Tokens

The charge's `git show HEAD:dialectical-engine/…` instruction was the cheap path. Reading 0067:40-110 + 0040 UNPUBLISH + erasure + `publication.ts` reserve was the whole investigation. Writing a V-ROW because ARCH-REV is at cap is the right ratchet — V sees the second trigger hole.

Lane dirty went 4 → 2 during the run (C3/`index.ts` left the working tree). This seat wrote none of those paths.

## Nearly got wrong

- Reusing `…00f1` on PRIVATE (would couple erasure to a live system intent).
- Minting `publication_event_binding` from a DELETE grant (phantom UNPUBLISH).
- Putting the trigger change in 0067 (forbidden).

## Packet notes

- Template said `Revision 1`; PLAN already has Revisions 2 and 3. I wrote **Revision 4**.
- "every cluster command" at a dirty lane: omitted uncommitted C3/C4 test paths so vitest would not execute another seat's working tree.

## Wall-clock

CLAIM 00:32Z. Detector PASS. Mutant G1 watched FAIL. C1/C2/C3/C4 regression commands `CLUSTER_GREEN`. Lane not written.
