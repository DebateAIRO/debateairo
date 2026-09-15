## r1

### Case outcome

The central failure was not bad arithmetic in the test summaries; those re-derived cleanly.
It was an evidence-lifecycle defect. The ceremony database was queried, its recovered facts
were transcribed into the report, and then the only copy of the database was deleted without
first teeing the query results to a recovery log. The review packet nevertheless names
"ceremony + recovery logs" as upstream evidence. No recovery log exists. That turns the
run id, answer id, panel, probe rows, and condition marks into CANNOT-ASSESS assertions at
the exact point where the fleet needs an auditable baseline pin.

The second cause was a non-discriminating classifier. Four of the five D.2 tests already
pass in two of three full runs, and the fifth passes in one of three. One solo pass per spec
therefore does not distinguish "contention artifact" from the intermittent behavior already
observed. The evidence supports **23 stable-red + 5 unstable**, but not the stronger
**23 genuine + 5 non-defects** classification that downstream lanes have treated as law.

### Price paid

- The missing recovery transcript consumes at least one complete review/rework round. If V
  requires primary evidence rather than a CANNOT-ASSESS correction, the destroyed database
  may force another provider-spending ceremony; this seat does not authorize that spend.
- A controlled serialized full-suite probe would cost roughly **43.6–50.2 minutes** at the
  recorded post-run durations (2615.29–3014.31s). The cheaper lawful repair is to stop
  overclaiming and classify the five as unstable unless stronger evidence already exists.
- The 756-line report mixes the authoritative record with the retained trap record. That
  made every textual check pay a large context tax and made a stale abbreviated suite name
  easy to miss.
- My first broad failure-context extraction produced **24,919 tokens** of candidate output
  and was truncated. Narrow extraction by failure-header line was the useful probe; the
  broad context search was a dead end and should not be repeated.

### What I nearly got wrong

- I nearly treated the ceremony ids repeated in DECISIONS.md as independent corroboration.
  They are downstream repetition of the same report, not a second evidence source.
- I nearly accepted "solo PASS" as proof of contention because the summary count and the
  report's explanation were coherent. A probe must discriminate: a result already common
  in the full runs does not establish the proposed cause.
- I nearly treated the D.1 ellipsis as harmless prose. The row is identifiable, but the
  fleet rule is literal set-equality and the normalized report/log diff fails on that row.
- The user's phrase "File board" could have tempted a board edit. D1 and the packet's
  two-file writable surface are controlling: seats file markers in reports and the
  orchestrator mirrors them.

### Dead ends and packet friction

- Recovery-by-reinspection is impossible: `acceptance/.pgdata` was deleted and no recovery
  transcript exists. Searching every T0 log for `recover` returned zero files.
- Tests, builds, and a replacement ceremony were forbidden by the STATIC-only packet, so
  inventing a fresh proof was never an option.
- `board/T00-baseline.md` in packet line 4 does not resolve from the dispatched working
  directory (`agent-reports/`); the absolute mission-board path does. This cost a lookup and
  is exactly the packet-path defect the reviewer contract says to catch.
- The packet claims recovery logs exist at line 16. An existence check before dispatch
  would have caught the review's principal blocker without spending a reviewer cycle.

### Upgrades

1. Make the baseline a machine-readable evidence manifest: command, exit, summary, exact
   sorted failure set, run mask, solo evidence, source-log sha256, and report sha256. Render
   prose from that manifest instead of transcribing sets by hand.
2. Before deleting any caller-owned ceremony database, tee every recovery query and row to
   a named log, hash it, and require the log's existence in the handoff gate.
3. Permit only evidence-discriminated labels. A solo pass may justify "passes solo"; the
   word "contention" requires a paired control or repeated serialized/full-load comparison.
4. Add packet lint that resolves every path from the declared working directory and rejects
   named upstream artifacts that do not exist.
5. Split the current baseline-of-record from the pre-provisioning trap appendix so routine
   reviewers do not repeatedly ingest 500+ historical lines.

### Toward the one-prompt machine

The orchestrator should be able to emit this lane from one prompt by generating three
artifacts together: a typed packet, an evidence manifest, and a verification script that
checks path existence, hashes, arithmetic, exact set membership, and required recovery
logs. The human-readable report then becomes a deterministic view of evidence rather than
the only place evidence is assembled. That would have caught all five findings in this
round before dispatch and preserved provider-spend evidence automatically.

## r2

The ceremony evidence lifecycle was repaired correctly: eight compact queries plus a final
deletion sentinel turned an 837-line report into a reviewable record without another broad
log search. The remaining report cause is a negative-search gap: twelve intended label sites
were corrected, but the D.1 heading still says `Genuine`. A banned-token scan outside the
withdrawal block would have caught it before dispatch. Price: one word opens the third and
last review round and costs a complete reviewer cycle.

The orchestrator's packet lint cure also did not reach the packet text. Line 4 repeats the
relative board path, and lines 8–9 use literal `.../` paths for all three new upstream
artifacts. All four fail from this seat's cwd even though the inferred absolute artifacts
exist. Price: four failed existence checks and another mandatory finding; the earlier
TOOLING-TRAPS entry already describes this exact class, so no new trap entry is warranted.

I nearly approved after Q1–Q8, the sha, the arithmetic, and exact set equality all passed.
The refutation probe was the packet-required causal-word grep, which found the surviving
heading. A second near-miss was treating run 2 as proof of run 1's panel and marks: only the
gate is independently logged for both; the report's testimony-grade label correctly keeps
run 1's other facts unverifiable, so that limitation is not a new finding.

Upgrade the one-prompt path with two mechanical gates: reject packets containing unresolved
relative/ellipsis artifact paths, and reject a withdrawal when any banned causal token
survives outside its explicitly quoted correction block. Those checks are milliseconds;
this review round was not.

## r3

The substantive cure converged. The prescribed D.1 heading is exact, the published scan
returns zero live matches, a live reinjection returns one, and the withdrawal-neighbour
control remains excluded. Reversing the four changes that § D.0 itself enumerates recreates
the exact r4 SHA-256, so the apparent byte-stability discrepancy was not hidden drift.

The price paid was another packet-record mismatch: the final packet declares
`rework_round 2`, while the canonical board still says `rework_round: 1` and carries only
the r1 transition. The packet's paths are finally literal and resolvable, but its quoted
state is not. The report also inserted four lines near its front without updating § D.0's
five blockquote line references; the stated 16,17,109,110,111 are now
16,17,113,114,115. Neither residue changes the baseline classification, but both are
mandatory findings and round 3 sends them to V instead of inventing r4.

I nearly treated the first reconstructed-hash mismatch as evidence of undisclosed edits.
That inverse removed only the new D.0 block and restored its heading; § D.0 explicitly says
three additional token-bearing sentences elsewhere were rewritten. Restoring those three
sentences made the prior hash match exactly. The systematic-debugging discipline prevented
a false blocking finding.

The one-prompt upgrade is mechanical: advance the board atomically before dispatch and lint
the packet's quoted state against it; then derive every published line reference from the
post-edit artifact. A final-round packet should fail closed when either check disagrees.

## liveproof

The D20 evidence converged without another provider call: one static join of Q13 with the
captured ceremony lineage reproduced all four cross-maker attacks, and an in-memory bad
lineage mutant reduced the result to 3/4 while a support-only neighbour stayed 4/4. Marks,
attempts, ceiling, sentinel order, ids, panel, and exit all reconciled exactly.

The packet fought the review at its source boundary. It says the whole Q13 × lineage result
reproduces “from the recovery log,” but recovery Q14 maps every one of eight nodes to both
makers (20 rows per node) and cannot supply lineage. The valid operand is the single
`PRO-01 per-node maker lineage` record in `ceremony3.log`. The report discloses this
correctly; the packet collapses two captures into one. Price: one failed recovery-only
derivation and one mandatory packet finding, with no product or ceremony rework.

I nearly accepted “from the recovery log” as harmless shorthand because the final 4/4
number is right. The Q14 cardinality probe made the distinction concrete: 160 rows, two
distinct makers per node, no valid node→maker map. The one-prompt upgrade is to type every
derived claim as `operand@artifact` before dispatch—for this one,
`Q13@ceremony3-recovery × PRO-lineage@ceremony3`—and lint that every named operand exists in
the attributed capture.
