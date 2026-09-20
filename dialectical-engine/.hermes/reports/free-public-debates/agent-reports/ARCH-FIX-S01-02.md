# ARCH-FIX-S01-02 self-report — mission `free-public-debates`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat ARCH-FIX-S01-02 · grok-4.6 · resumed session `01a0bff4-9e4c-73d1-a083-fcec78f440bf` · ticket `t_552c5401` · 2026-09-20. Lane 5b6cc9b1 0 dirty. No git writes.

## The body

Pass-1 PLAN was complete as a SPEC↔PLAN table (25/25, every declared step defined) and its four base commands were `CLUSTER_GREEN`. It was not buildable. Five independent ways to ship a false green, all sitting in C2/C1 SQL that the application tests would never call.

ARCH-REV-S01-p1 named them. I reproduced each against the lane at the cited lines, then accepted all ten assigned findings. The reviewer's B4(c) prediction ("FIX will argue two concurrent GETs are not realistic") is false: C2-S18 puts the reconciler on the same run as the GET hook, and V's walk polls every 10s.

## Cause, not symptom

**B1.** `identity.append_audit_event_internal` is revoked from `debateai_runtime` (`0040_account_erasure.sql:6211-6213`). Every "append DENY audit" in C2-S6 was a 42501 on the served database. The packet's runtime-role bullet pointed at `plan-tiers-route-privileges.test.ts` and never named that REVOKE (P8). That is why pass 1 planned an impossible call.

**B2.** `tryAutoPublish` took `AuthenticatedSession` (`sessions.ts:34-41` — live session + token hashes). A SKIP LOCKED worker has none. Production retry was wired to "reconcileKeyCleanup's existing callers" while `grep -c main.ts PLAN.md` was 0. The interval lives at `main.ts:297-305`. Pass 1 hedged ("if no periodic caller, GET is the trigger"). The hedge is the finding.

**B5.** `create_encrypted_run` VALUES used `(p_run->>'freePublicRule')::boolean` on a NOT NULL column. `db:migrate` is a separate CLI (`package.json:23`). Between migrate and API deploy, every signed-in ask fails. C1-S9 *pinned that as the test*. The class is "a missing-key test that describes an outage".

## What repeatedly cost tokens

1. **Re-reading 0040.** Pass 1 already held `:4014-4022` and `:4088`. B1's load-bearing line is `:6211-6213`, 2000 lines later, unnamed by the packet. Price: one full REVOKE scan (~3k tokens) that a packet extract would have been 8 lines.
2. **The file-map parser vs `|---|---`.** The reviewer's `file-map-check.py` splits on `---`, which is the markdown table rule. On the revised PLAN it reported every file UNMAPPED until the split was moved to `## 2. Steps`. Price: ~10 min of false UNMAPPED. The same script "worked" in pass 1's write-up; it cannot have been parsing the table.
3. **Interactive Superpowers on a FIX seat.** `receiving-code-review` is the right skill. `brainstorming` and `writing-plans` are the role floor; the packet also names them. Re-reading 250-line human-dialogue skills to change ten PLAN steps is the same tax as pass 1.

## Ranked upgrades (tokens saved)

1. **Packet extracts for REVOKE lists, not only the grant lookup.** B1 was one unread span. Same class as pass-1 P8.
2. **A file-map checker that does not split on `---`.** Ship it in the ARCH packet. Pass 1 and pass 2 both paid.
3. **FIX packets should list each finding as "measured line → required sentence".** This packet did that in the verdict; copying those sentences into the FIX packet would have saved re-opening PLAN at the stale line numbers (PLAN grew; the verdict's `PLAN.md:373` is now a different paragraph).
4. **Do not name `writing-plans` "re-issued, not patched" and also "revised IN PLACE".** I revised in place with a Revision 2 line. A full rewrite of a 1000-line PLAN to change ten defects is how you introduce a new B3.

## Nearly got wrong

- Skipping `main.ts` (the reviewer's prediction). `{userId, ownerRef}` without a production caller leaves R-10 as a test-only method. I put both in.
- Contesting B4(c). The DISTINCT ON list would have hidden the orphan; C4 would not clean the first snapshot's key. Accepting it is cheaper than a REV(S01) security finding.
- Leaving C1-S9 as missing-key → false. That is B5's outage, tested.

## Dead ends

- Reusing `audit_publication_preflight_denial` for system DENY — it requires a session and a binding (`:3908-3922`).
- Answering B2 without `main.ts`.
- `DROP FUNCTION` of the owner transition to add NULL grant parameters.

## Where THIS packet was unclear

- **`packets/ARCH-FIX-S01-02.md:4` vs `:19`:** "the plan is re-issued, not patched by hand" and "PLAN.md revised IN PLACE". I in-placed with Revision 2 naming every changed step.
- **Forbidden list includes the intake record and the V packet** (`:16`) while inputs (`:10`) name both. I did not re-open them; the verdict already carried V-1…V-6 and the baseline pairs.
- **Verdict line numbers** (`PLAN.md:373` etc.) were pass-1 coordinates. After Revision 2 they do not resolve. The FIX packet should have said "the C2-S6 algorithm list" not a line.

## Wall-clock

CLAIM 18:37Z. Four base re-runs `CLUSTER_GREEN` in 21s. Detector PASS. Mutants B1, B3, B5 watched FAIL. Lane 0 dirty.

## One-prompt machine

A FIX packet that pastes the verdict's "Smallest repair" paragraph as the allowed edit list, plus "re-run these four `.sh` files" and "run the reviewer's `trace-both-ways.py`", is the one prompt. This packet was close. The missing piece is: do not send the seat back through brainstorming/writing-plans to change ten sentences, and do not cite PLAN line numbers that the revision will move.
