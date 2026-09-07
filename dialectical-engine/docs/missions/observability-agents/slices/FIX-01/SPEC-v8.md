# FIX-01 SPEC-v8 — repeated exact tail addendum

Status: FROZEN — controller-ratified authority for FIX-01 C4 round 10.

SPEC-v8 narrows the exact unterminated-tail rule in SPEC-v7. All other FIX-01 rules stay in force. This file does not admit a production directory or record V approval for one.

## Repeated exact tail

Before lock or index mutation, admission compares the exact canonical unterminated tail with the complete framed plain rows in the locked base prefix.

If the same current candidate basename is both:

- present as a complete framed plain row; and
- present again as the exact unterminated tail,

admission stops. It writes no stage, final lock, index byte, manifest, or PASS result.

This state cannot reach one final plain row without deleting or rewriting source index bytes, and those actions are not allowed.

The prior lawful cases stay unchanged:

- a lone exact unterminated candidate gets only its missing LF, then its A1 row;
- a different complete framed candidate followed by the exact unterminated current candidate is accepted, and the tail gets only its missing LF.

Tests must prove all three cases. A mutant that removes the repeated-tail preflight must fail.
