# CODEX REVIEWER PACKET — lane/sealedrows r2 (rework round 1 of 3)

## Constants — DERIVED FROM COMMITTED TIPS, not from a working tree

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows
base tip      : 7dda3cc0d3305c96e62dadb77f1eb941165d633a
r1 tip        : 7d0d150c
r2 tip        : 4f4ee276
diff base..r2 : 11 files changed, 792 insertions(+), 60 deletions(-)
```

Your P1 was right and its root cause is now recorded as a trap: `git diff --stat` excludes
untracked files, so two added test files were invisible in the 221 I quoted. The line above is
re-derived from committed tips at packet-write time. **Check it.**

## Scope — B1, B2, E1 only

The seat held scope. F-SEALEDROWS-B was re-scoped to narrow-and-file (your P3) and is complete.
F-T17-T9 is a different ticket and is NOT in this lane.

## Your r1 findings and what came back

**B1 — claimed FIXED.** Anchored to a unique `evaluatorVerdictSchema` declaration, body found by
BRACE BALANCING (the seat's reason: a lazy `[\s\S]*?\}\)` stops at the wrong `}}` inside nested
zod). Every earlier refusal kept. The extractor is now EXPORTED so a test can drive synthetic
sources without editing the shipped runner.

Orchestrator re-ran your exact attack — decoy `criteria: z.object({ alpha: z.boolean() })` plus a
prompt naming `alpha`, placed FIRST — and got the real evaluator prompt back. Renaming the anchor
REFUSES rather than quietly selecting something else. **Verify both independently; do not take
this packet's word.**

Seat's own standing counter, which it volunteered: the anchor is a NAME in
`apps/runner/src/index.ts`, so it is not rename-proof without a runner-exported constant. Assess
whether refusing-on-rename is sufficient.

**B2 — the demonstrated defect is closed; ONE HALF IS BLOCKED AND TICKETED.** Orchestrator probe:
deleting `wayOfKnowingCeiling.emptyBasisFloor` from real acceptance rows now yields a zod
`invalid_type` at that exact path. `acceptance-parser-accepts-missing-floor true` no longer
reproduces.

The remainder is **F-SEALEDROWS-D**, filed by the seat rather than left for you: making the member
required on `BandCeilingRegisterRow` itself breaks two out-of-contract files; pushing it to
`deriveBandCeiling`'s input leaves exactly one, `apps/runner/src/index.ts`. The seat versioned the
boundary and documented it in place. **Judge whether that versioning is sound or whether it is
weakening wearing a different word.** Do not re-file the ticketed remainder as a new finding.

**E1 — claimed REPAIRED.** 9 `mutate.sh` transcripts with a script-derived index: 7 killed, 1
neighbour survived, 1 NOT-RUN, `expectation check: ALL AS REQUIRED`. The seat reports it NEARLY
scored an aborted mutation as a kill — `mutate.sh` refused at its pre-gate with a non-zero exit
and the driver read that as KILLED — caught it by a mismatched restore column, and reclassified on
`GATE applied` rather than exit status. **Verify that classification rule in the retained index,
and verify the NOT-RUN row is retained rather than dropped.** The round-2 survive-then-kill history
remains testimony by the seat's own statement; that is correct and is not a finding to re-file.

## Questions this review must answer

1. Is the brace-balancing extraction correct at its edges — strings containing braces, comments,
   a `}` inside a regex or template literal in the declaration body?
2. Does any refusal from r1 survive only in prose? Zero-match, duplicate, parser-prompt drift —
   each must still have a test that fails when the refusal is removed.
3. Is F-SEALEDROWS-D's versioning of the boundary sound, or does it leave the active type able to
   describe an incomplete row?
4. The mutant index: is it genuinely script-derived, or a prose table with a script beside it?
   This is exactly the S08 r4 B1 shape — check the generator reads the transcripts.
5. Suites: three cluster runs reported identical by md5 of the failure-name set
   (`9c28c8f4…`), `13 failed | 1531 passed (1544)`; base tip `13 failed | 1505 passed (1518)`;
   net +26 passing, zero new. Check the arithmetic and that the 13 match the list you re-derived
   in r1.
6. **Packet audit.** Your P1, P2 and P3 are accepted and admitted in AMENDMENT 2. The seat then
   named a FOURTH: AMENDMENT 2 asked for a member "required in `BandCeilingRegisterRow`" AND for
   the historical boundary to be "versioned or adapted", which are in tension when that boundary
   is outside the seat's contract — adapting was not available to it. That is the third time I
   have dispatched an outcome needing files I had not granted (PD-SEALEDROWS-1, P3, this).
   **Audit for defects beyond that one**, and say whether the admission is complete.

## Method

Static review. No mutating git command. Verify by ARTIFACT — where the seat says a transcript
exists, open it. `records compared: N` in any `stamp-check.sh` output is read against the number
you expected; it takes a PREFIX and an expanded glob silently compares one file. See
`.hermes/TOOLING-TRAPS.md`, which now also carries the two traps this seat filed.

If you run tests, report `passed/total` with every failure named. An interrupted run has no valid
passed/total — say so rather than reporting a partial count, as you correctly did in r1.

## Output — write ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r2-self.md
```

Line 1 of the verdict file, exactly:
`CODEX REVIEW SEALEDROWS r2 — <APPROVE|CHANGES> · comments read through: sealedrows-rework1-2026-09-04`

Then finding counts; one block per finding with **File/line · Input → wrong outcome · Required
fix**; `## Packet audit`; `## Not verified` that does not promote a gap to evidence; and
`## PREDICTIONS`.
