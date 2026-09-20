# SELF-REPORT — seat ARCH-REV-S01-02 · node ARCH-REV(S01) pass 2 · mission `free-public-debates` · 2026-09-20

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict: **REWORK**, one blocking finding (B1-p2), three non-blocking. All ten pass-1 findings ADDRESSED.
This report is about what pass 2 proved about the loop itself.

## The cause of record — a fix that was correct, and made a dormant omission fatal

Pass 1's B4(b) said: the erasure path is blind to the new system key-provision intent table. The fix is
right — `PLAN.md:775` adds the contention gate. But `serve.system_publication_key_provision_intent` never
had a cleaner: the plan grants EXECUTE on "system key-provision claim/complete cleanup" functions
(`PLAN.md:374`) that **no step anywhere defines**. Before the gate, a crash-orphaned intent was an inert row.
After it, that row makes `prepare_private_run_erasure` answer `'CONTENDED'` for that run forever — 202
PENDING with no tombstone, on every delete attempt, which the revision's own N2 oracle calls *not success*.
A bound Free debate becomes permanently undeletable, against V's I-3.

**The omission predates Revision 2 and I did not catch it at pass 1.** I read the table definition and the
GRANT bullet and checked what I had been charged to check — the guards the owner function holds — and never
asked the adjacent question: *which of the owner table's machinery did this table NOT copy?* The owner side
has four parts (prepare, abandon, claim-cleanup, complete-cleanup) plus a reconciler plus a boot/interval
caller whose comment says in terms that it exists for crash orphans (`apps/api/src/main.ts:293-296`). The
plan copied two of six and granted the missing two.

**The upgrade, and it is the same shape as pass 1's:** pass 1 asked for a guard-parity table when a plan
forks a `SECURITY DEFINER` function. That was too narrow. The rule is **lifecycle parity**: when a plan
copies an existing *table* or *outbox*, it owes a row per verb of the original — who creates, who removes on
the happy path, who removes after a crash, who reads it as a gate — and what the new one does with each.
Six rows of table. It would have caught this at ARCH pass 1, before either review. Both of my passes found
the same class from opposite ends; a table is cheaper than two review rounds.

## What repeatedly cost tokens

1. **I shipped a broken checker at pass 1 and it cost this pass to discover.** `file-map-check.py` as saved
   under `probes/ARCH-REV-S01/` splits §1.1 on `---`, parses zero map rows and therefore prints *every* path
   as UNMAPPED. I fixed that bug inline at pass 1 via a heredoc and never wrote the fix back to the file, so
   the artifact I handed forward was the version that cannot fail. ARCH-FIX ran it, saw the noise, and wrote
   it off in its UNVERIFIED line — correctly, but that is a seat spending tokens on my defect. The
   ARCH-FIX packet already carries the law that catches this ("a checker ships with a failing fixture"); it
   binds the FIX seat and not the reviewer. **Upgrade: put that law in `heartbeat-reviewer` too — every
   script a reviewer leaves in `probes/` is run against a mutant and watched failing before it is handed
   over.** I did that this pass for all three checkers (`file-map-check.py` on a deleted map row,
   `sv1-membership-check.py` on an add-and-remove swap); it cost about 4k tokens and it is the only reason I
   trust them.
2. **Re-measuring the same thirty `path:line` citations twice.** Pass 1 verified them; Revision 2 moved most
   of them by 20–60 lines because the file grew by 74 lines, so every citation in my own verdict had to be
   re-resolved against the new numbering. ~25k tokens, entirely mechanical. This is the second pass in a row
   where the single largest avoidable cost is citation arithmetic. `citations-check.sh` (pass-1 upgrade #1)
   would have made it one command; I am repeating the recommendation because the price repeated.
3. **The diff was the cheapest input in the mission and I nearly skipped it.** `git diff <p1 freeze>..<FIX
   freeze>` is 456 lines and told me exactly which 21 steps changed. Reading Revision 2 whole would have been
   ~1000 lines. The packet naming both freeze hashes (charge 1) is the single best-designed line in either
   packet I have been given. **Keep it; make it the default shape of every scoped re-review packet.**
4. **Re-running four cluster commands that cannot have moved.** The revision touches no product file, so the
   base suites were always going to reproduce. ~6 minutes wall clock for four lines I could have predicted —
   but the packet requires it and the reviewer contract is right that "distrust green" is cheaper than one
   embarrassment. I would keep it and drop the *inline* duplicate instead (pass-1 upgrade #5, still unspent).

## What I nearly got wrong

- **I nearly filed a second blocking finding that was not one.** `PLAN.md:422` tells the reconciler to "read
  the served projection … (no session)", and `tryAutoPublish` has no session any more. I had the finding
  written as blocking — "the retry has no data path" — before checking `readRunAnswer`, whose signature is
  `(runId, _session, ownership)`: the session parameter is **unused** (`apps/api/src/index.ts:1448-1449`) and
  `RunOwnershipAccess` is `{ownerRef, legacyAskerId}` (`packages/db/src/index.ts:901-904`), both
  constructible from the work row. The mechanism exists; only the naming of the dependency and a production
  RED case are missing. It is N1-p2, not a B. **The near-miss is the lesson: at pass 2 of 3 the temptation to
  escalate is strongest, because a blocking finding feels like diligence. An underscore in a parameter name
  was the whole difference.**
- I nearly let B4(c) pass as fully closed. The guard is now in the function body and correctly reasoned — but
  the case that guards it (`PLAN.md:323`) passes when the two calls run sequentially, which is the mutant it
  exists to catch. Reading the fix is not reading the detector.

## Dead ends — do not re-derive

- The audit wrapper `identity.audit_system_publication_attempt` calling `append_audit_event_internal` from
  inside a `SECURITY DEFINER` body is legal and is the house pattern: `identity.audit_publication_preflight_denial`
  does exactly that at `0040_account_erasure.sql:3923-3928`. The REVOKE at `:6211-6213` binds callers, not
  DEFINER bodies. I spent tokens re-confirming this; it is settled.
- SV-1's new 52-string list is exact — 52/52, no drift, no duplicates, measured against
  `apps/api/src/index.ts:114-165`. Do not re-count it; run `probes/ARCH-REV-S01-02/sv1-membership-check.py`.
- The §1 cluster-command table is byte-unchanged between Revision 1 and Revision 2. Only per-step assertion
  text moved. Do not diff the commands again.
- C2 ∥ C4 remains conflict-free after `apps/api/src/main.ts` joined the map: C4 writes only
  `migrations/0068` and two test files.
- The new `FOR UPDATE` in the system transition versus the erasure's `FOR UPDATE NOWAIT` raises 55P03 to a
  concurrent deleter — that is pre-existing behaviour of the owner publish path, not a new class. I checked;
  it is not a finding.

## Where this packet fought me

- Charge 3 scopes new breakage to "inside the diff of charge 1". B1-p2 sits on the boundary: the *omission*
  (no cleanup functions) predates the diff; the *harm* (an undeletable debate) is created by a line inside
  it. I filed it and said so in the verdict rather than dropping it on a technicality, but a packet sentence
  would settle this class for every future scoped pass: **"a pre-existing omission that a line in the diff
  makes harmful is in scope, and is reported with its provenance."**
- Charge 2 says "check the sentence, not the claim" — the most useful instruction in the packet, and the
  reason this pass took one read of 21 step bodies instead of an argument with a handoff. It should be
  standing text in `heartbeat-reviewer`, not a per-packet charge.
- The packet's verification line is inherited verbatim from pass 1 ("every cluster command re-run … inline
  and scripted · your own both-ways trace parser"). At pass 2 the trace parser is a re-run of mine and the
  inline duplicate adds nothing; the line should say what a *scoped* pass owes, which is: re-run each
  finding's own detector, plus the cluster commands as they now stand.

## Toward the one-prompt machine — ranked by tokens saved

1. **Lifecycle-parity table** whenever a plan copies a table, outbox or intent (six verbs: create, happy-path
   remove, crash remove, gate-read, GRANT, reconciler caller). Closes the class both my passes found from
   opposite ends. Saves a full rework round.
2. `citations-check.sh` — unchanged from pass 1 and now twice as valuable, because a revised plan renumbers
   every citation in the reviewer's own verdict. ~25k tokens per re-review.
3. **Reviewers' probes ship validated failing**, same law the FIX seat already has. My pass-1 handoff gave the
   next seat a checker that could not fail; that is worse than giving it nothing.
4. Keep the two freeze hashes and the `git diff` recipe in every scoped re-review packet. It is the reason
   this pass cost a third of pass 1.
5. Replace "inline and scripted" with "scripted, plus one mutant per gate the plan relies on". Same tokens,
   strictly more information — the SV-1 swap mutant and the map-row mutant are the only two things I learned
   mechanically this pass.
6. A packet line for the scope boundary above (pre-existing omission made harmful by the diff).

Wall clock: ~22 minutes, ~6 in one background suite round. No retries, no blocked commands, no rework of my
own. Lane left at `5b6cc9b1`, 0 dirty; no git write; nothing opened on V's desktop.
