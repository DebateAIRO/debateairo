# /goal packet — ASK-01 (Codex seat) — the ask surface, final form (DR-180)

**Board:** debateai-v3 · **Assignee:** codex · dual diamond on handoff.
**Lane (DR-168):** prev = GROK-01 (t_43b4c17b, done) · next = none.
Standing law: CODING-LOOP-PROTOCOL.md (v2 amendments) + ledger through
DR-180 (read DR-180 verbatim — it is this ticket's contract).

## The live defect (V hit it)
GROK-01's third configured provider moved the DR-166 machine default for
agent_count to 3; the ratified count is 2; every bare-Start ask now dies
RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE. Screenshot-verified by V on a
real ask ("How to safely Fry Scream").

## DELIVERS
1. **Advanced tab REMOVED from /new entirely** (supersedes DR-166-B): the
   five machine fields never render for the user in any state. The
   DR-166-C surface stands: question · risk tier · budget tier · depth
   dial · Start. Machine values still computed, still persisted with
   honest provenance (PROV-01 tier_source machinery untouched; DR-166-A
   user-relative identities preserved).
2. **Lawful panel derivation, no fixed number:** maker count = min(count
   of configured-and-healthy providers, the ratified maximum derived from
   the SAME source the M-guard enforces — never a literal, never the
   configured count alone, never a new register row of its own). Bare
   Start must produce a LAWFUL ask by construction.
3. Reproduce-first RED: configured=3 / ratified=2 → bare-Start ask sends
   agent_count 2 and is ACCEPTED (the exact live regression); a
   fixture-level ratified=3 → the same derivation sends 3 (zero code
   change proof, DR-162-A pin); mutation "derive from configured count" →
   red; mutation "hardcode 2" → red (the fixture-ratified-3 case catches
   it).
4. Render tests: /new shows exactly the DR-166-C surface and NO Advanced
   disclosure in any state; mutation "re-add the disclosure" → red.

## DONE WHEN
All gates green with REAL pasted output; vitest list proof; mutation
ledger (P1); handoff handoffs/ASK-01-codex-handoff.md; progress log;
review + "READY FOR PEER REVIEW — ASK-01".

## FORBIDDEN
No M=3 seeding (the ratification stays V's); no M-guard changes; no
standing-stack control; no contract vocabulary changes; scope per this
packet only.

## Return rule
Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
